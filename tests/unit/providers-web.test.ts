import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderServiceWeb } from '@services/providers-web';

/**
 * El cliente PWA ya no lee claves ni construye prompts: reenvía la solicitud a
 * las funciones privadas de Netlify y traduce su envoltura de error segura.
 * El mock de `fetch` solo debe ver rutas same-origin (`/.netlify/functions/*`).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function neverResolves(_input: string, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
}

const practiceRequest = {
  id: 'practice-1',
  kind: 'practice',
  course: '7º básico',
  subjectId: 'matematica',
  unit: 'Álgebra',
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('providers-web', () => {
  it('expone solo generate, searchVideos, cancel y close', () => {
    const providers = createProviderServiceWeb();

    expect(Object.keys(providers).sort()).toEqual(['cancel', 'close', 'generate', 'searchVideos']);
  });

  it('envía generate únicamente a la función Gemini sin clave ni modelo del cliente', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse({ text: 'Respuesta segura.' }));
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderServiceWeb();
    await expect(providers.generate({ ...practiceRequest })).resolves.toEqual({ text: 'Respuesta segura.' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/.netlify/functions/gemini');
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ request: expect.objectContaining({ id: 'practice-1', kind: 'practice' }) });
    expect(JSON.stringify(body)).not.toMatch(/key|model/i);
    expect(String(fetchMock.mock.calls[0][0])).not.toMatch(/key=/);
  });

  it('funciona sin almacén de ajustes y sin pedir geminiKey ni youtubeKey', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse({ text: 'Respuesta segura.' }));
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderServiceWeb();
    await providers.generate({ ...practiceRequest });

    const rawBody = String(fetchMock.mock.calls[0][1]?.body);
    expect(rawBody).not.toContain('geminiKey');
    expect(rawBody).not.toContain('youtubeKey');
    expect(rawBody).not.toContain('settingsStore');
  });

  it('searchVideos usa la función YouTube y normaliza { videos } al array esperado', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse({
      videos: [
        {
          id: 'abcdefghijk',
          title: 'Fracciones para séptimo',
          thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
        },
        { id: 'javascript:evil', title: 'peligroso', thumbnail: 'https://i.ytimg.com/vi/x/mqdefault.jpg' },
        { id: 'lmnopqrstuv', title: '   ', thumbnail: '' },
        { id: 'qrstuvwxyz1', title: 'Miniatura ajena', thumbnail: 'https://evil.example.com/x.jpg' },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderServiceWeb();
    await expect(providers.searchVideos({ id: 'videos-1', query: 'fracciones' })).resolves.toEqual([
      {
        id: 'abcdefghijk',
        title: 'Fracciones para séptimo',
        thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
      },
      { id: 'qrstuvwxyz1', title: 'Miniatura ajena', thumbnail: '' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/.netlify/functions/youtube');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ query: 'fracciones', maxResults: 4 });
  });

  it('mantiene cancelación y convierte el error seguro de la función en ProviderError', async () => {
    const abortMock = vi.fn(neverResolves);
    vi.stubGlobal('fetch', abortMock);
    const providers = createProviderServiceWeb();
    const pending = providers.generate({ ...practiceRequest, id: 'cancel-practice-1' });
    await vi.waitFor(() => expect(abortMock).toHaveBeenCalledTimes(1));
    providers.cancel('cancel-practice-1');
    await expect(pending).rejects.toMatchObject({ name: 'ProviderError', code: 'CANCELLED' });
    vi.unstubAllGlobals();

    const quotaMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse(
      { error: { code: 'QUOTA', message: 'El servicio está ocupado. Inténtalo más tarde.' } },
      429,
    ));
    vi.stubGlobal('fetch', quotaMock);
    const second = createProviderServiceWeb();
    await expect(second.generate({ ...practiceRequest })).rejects.toMatchObject({
      name: 'ProviderError',
      code: 'QUOTA',
      message: 'El servicio está ocupado. Inténtalo más tarde.',
    });
    expect(quotaMock.mock.calls[0][0]).toBe('/.netlify/functions/gemini');
  });

  it('mantiene el límite de 30 segundos de la función', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(neverResolves);
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderServiceWeb();
    const pending = providers.generate({ ...practiceRequest });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });

    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('no expone texto crudo del proveedor y close cancela las operaciones activas', async () => {
    const rawMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => new Response('upstream boom https://generativelanguage.googleapis.com', { status: 502 }));
    vi.stubGlobal('fetch', rawMock);
    const providers = createProviderServiceWeb();
    const rawError = await providers.generate({ ...practiceRequest }).catch((error: unknown) => error);
    expect((rawError as Error).message).not.toContain('upstream boom');
    expect((rawError as Error).message).not.toContain('generativelanguage');
    expect((rawError as { code?: string }).code).toBe('PROVIDER_ERROR');
    vi.unstubAllGlobals();

    const abortMock = vi.fn(neverResolves);
    vi.stubGlobal('fetch', abortMock);
    const second = createProviderServiceWeb();
    const first = second.generate({ ...practiceRequest, id: 'close-a' });
    const other = second.generate({ ...practiceRequest, id: 'close-b' });
    await vi.waitFor(() => expect(abortMock).toHaveBeenCalledTimes(2));
    second.close();
    await expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(other).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('mantiene el límite de seis operaciones activas', async () => {
    const fetchMock = vi.fn(neverResolves);
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderServiceWeb();
    const pending = [];
    for (let index = 0; index < 6; index += 1) {
      pending.push(providers.generate({ ...practiceRequest, id: `busy-${index}` }));
    }
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    await expect(providers.generate({ ...practiceRequest, id: 'busy-7' })).rejects.toMatchObject({ code: 'BUSY' });

    providers.close();
    for (const operation of pending) {
      await expect(operation).rejects.toMatchObject({ code: 'CANCELLED' });
    }
  });

  it('rechaza solicitudes inválidas sin llamar a la red', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => jsonResponse({ text: 'no debería llamarse' }));
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderServiceWeb();
    await expect(providers.generate({ id: 'bad id!', kind: 'practice', course: '7º básico' })).rejects.toMatchObject({ code: 'INVALID_FORMAT' });
    await expect(providers.searchVideos({ id: 'ok-1', query: '   ' })).rejects.toMatchObject({ code: 'INVALID_FORMAT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
