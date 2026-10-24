import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../netlify/functions/gemini.mjs';

const ENDPOINT = 'https://site/.netlify/functions/gemini';
const TEST_ONLY_KEY = 'test-only-key';

type ErrorEnvelope = { error: { code: string; message: string } };

function tutorRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tutor-1',
    kind: 'tutor',
    course: '7º básico',
    question: '¿Qué es una fracción?',
    ...overrides,
  };
}

function jsonRequest(body: unknown, contentType = 'application/json'): Request {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: JSON.stringify(body),
  });
}

function rawJsonRequest(body: string): Request {
  return new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function geminiResponse(text = 'Las fracciones representan partes de un todo.'): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function expectJsonNoStore(response: Response): void {
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('Cache-Control')).toBe('no-store');
}

async function readError(response: Response): Promise<ErrorEnvelope['error']> {
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: expect.any(String),
      message: expect.any(String),
    },
  });
  return (body as ErrorEnvelope).error;
}

describe('Netlify Gemini function', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', TEST_ONLY_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rechaza GET, Content-Type no JSON y cuerpos inválidos sin llamar al proveedor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const requests = [
      new Request(ENDPOINT),
      new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ request: tutorRequest() }),
      }),
      rawJsonRequest('{'),
      jsonRequest({ request: tutorRequest({ question: '' }) }),
    ];

    for (const request of requests) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expectJsonNoStore(response);
      await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza cuerpos mayores de 6 MiB antes de llamar al proveedor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const oversizedBody = `{"request":${JSON.stringify(tutorRequest())},"padding":"${'x'.repeat(6 * 1024 * 1024)}"}`;

    const response = await handler(rawJsonRequest(oversizedBody));

    expect(response.status).toBe(400);
    expectJsonNoStore(response);
    await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('detiene un cuerpo en streaming al superar 6 MiB sin solicitar un octavo chunk', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let pulls = 0;
    const oneMiBChunk = new Uint8Array(1024 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 7) {
          controller.enqueue(oneMiBChunk);
          return;
        }
        controller.close();
      },
    }, { highWaterMark: 0 });
    const request = new Request(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit);

    const response = await handler(request);

    expect(response.status).toBe(400);
    expectJsonNoStore(response);
    await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    expect(pulls).toBeLessThanOrEqual(7);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza notas sobre el máximo o con firma/MIME inválidos sin llamar al proveedor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const tooLargeBase64 = Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64');
    const invalidPngBase64 = Buffer.from('%PDF-1.7 no es PNG').toString('base64');
    const requests = [
      jsonRequest({
        request: {
          id: 'notes-too-large',
          kind: 'notes',
          course: '7º básico',
          file: { name: 'apuntes.pdf', mime: 'application/pdf', base64: tooLargeBase64 },
        },
      }),
      jsonRequest({
        request: {
          id: 'notes-spoofed',
          kind: 'notes',
          course: '7º básico',
          file: { name: 'apuntes.png', mime: 'image/png', base64: invalidPngBase64 },
        },
      }),
    ];

    for (const request of requests) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expectJsonNoStore(response);
      await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('responde SERVICE_NOT_CONFIGURED sin llamar al proveedor si falta la clave', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({ request: tutorRequest() }));

    expect(response.status).toBe(503);
    expectJsonNoStore(response);
    await expect(readError(response)).resolves.toMatchObject({ code: 'SERVICE_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fija gemini-3.5-flash-lite y usa la clave solo en la cabecera', async () => {
    const fetchMock = vi.fn(async () => geminiResponse());
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({
      request: tutorRequest({ model: 'modelo-no-autorizado' }),
    }));

    expect(response.status).toBe(200);
    expectJsonNoStore(response);
    await expect(response.json()).resolves.toEqual({ text: 'Las fracciones representan partes de un todo.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/models/gemini-3.5-flash-lite:generateContent');
    expect(url).not.toContain('modelo-no-autorizado');
    expect(new URL(url).search).toBe('');
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe(TEST_ONLY_KEY);
    expect(JSON.parse(String(init.body))).toMatchObject({
      systemInstruction: { parts: [{ text: expect.stringContaining('tutor educativo') }] },
      contents: [{ role: 'user', parts: [{ text: '¿Qué es una fracción?' }] }],
      generationConfig: { maxOutputTokens: 4096 },
    });
  });

  it('solo solicita JSON del proveedor cuando buildPrompt lo requiere', async () => {
    const fetchMock = vi.fn(async () => geminiResponse());
    vi.stubGlobal('fetch', fetchMock);

    const tutorResponse = await handler(jsonRequest({ request: tutorRequest() }));
    const practiceResponse = await handler(jsonRequest({
      request: {
        id: 'practice-1',
        kind: 'practice',
        course: '7º básico',
        subjectId: 'matematica',
        unit: 'Fracciones',
      },
    }));

    expect(tutorResponse.status).toBe(200);
    expect(practiceResponse.status).toBe(200);
    const tutorBody = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    const practiceBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(tutorBody.generationConfig).toEqual({ maxOutputTokens: 4096 });
    expect(practiceBody.generationConfig).toEqual({
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    });
  });

  it('adjunta archivos notes validados al contenido que se envía al proveedor', async () => {
    const fetchMock = vi.fn(async () => geminiResponse('Resumen de apuntes.'));
    vi.stubGlobal('fetch', fetchMock);
    const pdfBase64 = Buffer.from('%PDF-1.7\nApuntes').toString('base64');

    const response = await handler(jsonRequest({
      request: {
        id: 'notes-valid',
        kind: 'notes',
        course: '7º básico',
        file: { name: 'apuntes.pdf', mime: 'application/pdf', base64: pdfBase64 },
      },
    }));

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).contents[0].parts).toEqual([
      { text: 'Analiza estos apuntes. Resume los conceptos, explica con analogías e incluye un esquema en texto. Si algo no se lee, dilo, no lo inventes.' },
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
    ]);
  });

  it('acepta la solicitud plan que envía la tarjeta de plan, sin subjectId', async () => {
    const fetchMock = vi.fn(async () => geminiResponse('Plan día a día.'));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({
      request: { id: 'plan-1', kind: 'plan', course: '7º básico', examDate: '2026-10-23' },
    }));

    expect(response.status).toBe(200);
    expectJsonNoStore(response);
    await expect(response.json()).resolves.toEqual({ text: 'Plan día a día.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig).toEqual({ maxOutputTokens: 4096 });
    expect(body.contents[0].parts[0].text).toContain('La prueba es el 2026-10-23');
    // Sin materia, el topic queda con valores vacíos en vez de inventar una materia.
    expect(body.contents[0].parts[0].text).toContain('Materia: . Unidad: .');
  });

  it('traduce 429 a QUOTA sin filtrar el cuerpo del proveedor', async () => {
    const providerDetail = 'provider quota detail must not reach the client';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: providerDetail } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({ request: tutorRequest() }));

    expect(response.status).toBe(429);
    expectJsonNoStore(response);
    const error = await readError(response);
    expect(error.code).toBe('QUOTA');
    expect(JSON.stringify(error)).not.toContain(providerDetail);
  });

  it('traduce errores del proveedor y respuestas vacías a PROVIDER_ERROR seguro', async () => {
    const providerDetail = 'internal provider failure must not reach the client';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: providerDetail } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(geminiResponse('   '));
    vi.stubGlobal('fetch', fetchMock);

    const providerResponse = await handler(jsonRequest({ request: tutorRequest() }));
    const emptyResponse = await handler(jsonRequest({ request: tutorRequest({ id: 'tutor-empty' }) }));

    expect(providerResponse.status).toBe(502);
    expect(emptyResponse.status).toBe(502);
    expectJsonNoStore(providerResponse);
    expectJsonNoStore(emptyResponse);
    const providerError = await readError(providerResponse);
    const emptyError = await readError(emptyResponse);
    expect(providerError.code).toBe('PROVIDER_ERROR');
    expect(emptyError.code).toBe('PROVIDER_ERROR');
    expect(JSON.stringify(providerError)).not.toContain(providerDetail);
  });

  it('aborta la solicitud saliente a los 30 segundos y devuelve TIMEOUT seguro', async () => {
    vi.useFakeTimers();
    let signalSeen!: (signal: AbortSignal) => void;
    const upstreamSignal = new Promise<AbortSignal>(resolve => {
      signalSeen = resolve;
    });
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error('El handler debe pasar AbortSignal a fetch.');
      signalSeen(signal);
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pendingResponse = handler(jsonRequest({ request: tutorRequest() }));
    await upstreamSignal;
    await vi.advanceTimersByTimeAsync(30_000);
    const response = await pendingResponse;

    expect(response.status).toBe(504);
    expectJsonNoStore(response);
    await expect(readError(response)).resolves.toMatchObject({ code: 'TIMEOUT' });
  });
});
