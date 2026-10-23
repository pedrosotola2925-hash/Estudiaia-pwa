import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../netlify/functions/youtube.mjs';

const ENDPOINT = 'https://site/.netlify/functions/youtube';
const TEST_ONLY_KEY = 'test-only-youtube-key';

type ErrorEnvelope = { error: { code: string; message: string } };

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

function youtubeResponse(items: unknown[]): Response {
  return new Response(JSON.stringify({ items }), {
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

describe('Netlify YouTube function', () => {
  beforeEach(() => {
    vi.stubEnv('YOUTUBE_API_KEY', TEST_ONLY_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('rechaza métodos no POST y Content-Type no JSON antes de llamar a YouTube', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const requests = [
      new Request(ENDPOINT),
      jsonRequest({ query: 'fracciones' }, 'text/plain'),
    ];

    for (const request of requests) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expectJsonNoStore(response);
      await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza JSON inválido, consultas vacías, NUL y mayores de 1.000 caracteres antes de llamar a YouTube', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const requests = [
      rawJsonRequest('{'),
      jsonRequest({ query: '' }),
      jsonRequest({ query: '   ' }),
      jsonRequest({ query: 'fracciones\u0000seguras' }),
      jsonRequest({ query: 'x'.repeat(1001) }),
      jsonRequest({ query: 7 }),
    ];

    for (const request of requests) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expectJsonNoStore(response);
      await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza maxResults que no es un entero entre 1 y 10 antes de llamar a YouTube', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const requests = [
      jsonRequest({ query: 'fracciones', maxResults: 0 }),
      jsonRequest({ query: 'fracciones', maxResults: 11 }),
      jsonRequest({ query: 'fracciones', maxResults: 1.5 }),
      jsonRequest({ query: 'fracciones', maxResults: '4' }),
      jsonRequest({ query: 'fracciones', maxResults: null }),
    ];

    for (const request of requests) {
      const response = await handler(request);
      expect(response.status).toBe(400);
      expectJsonNoStore(response);
      await expect(readError(response)).resolves.toMatchObject({ code: 'INVALID_FORMAT' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no llama a YouTube si falta YOUTUBE_API_KEY', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({ query: 'fracciones 7º básico', maxResults: 4 }));

    expect(response.status).toBe(503);
    expectJsonNoStore(response);
    await expect(readError(response)).resolves.toMatchObject({ code: 'SERVICE_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza solo vídeos embebibles con identificador válido', async () => {
    const upstreamThumbnail = 'https://untrusted.example/thumbnail.jpg';
    const fetchMock = vi.fn(async () => youtubeResponse([
      {
        id: { videoId: 'abcdefghijk' },
        snippet: {
          title: 'Fracciones para séptimo',
          thumbnails: { medium: { url: upstreamThumbnail } },
        },
      },
      { id: { videoId: 'javascript:' }, snippet: { title: 'Identificador inválido' } },
      { id: { videoId: 'abcdefghijk' }, snippet: { title: '   ' } },
      { id: { videoId: 'short' }, snippet: { title: 'Demasiado corto' } },
    ]));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({ query: 'fracciones 7º básico', maxResults: 4 }));

    expect(response.status).toBe(200);
    expectJsonNoStore(response);
    const body = await response.json();
    expect(body).toEqual({ videos: [{
      id: 'abcdefghijk',
      title: 'Fracciones para séptimo',
      thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
    }] });
    expect(JSON.stringify(body)).not.toContain(upstreamThumbnail);
    expect(JSON.stringify(body)).not.toContain(TEST_ONLY_KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const upstream = new URL(url);
    expect(`${upstream.origin}${upstream.pathname}`).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(init).toMatchObject({ method: 'GET' });
    expect([...upstream.searchParams.entries()].sort()).toEqual([
      ['key', TEST_ONLY_KEY],
      ['maxResults', '4'],
      ['part', 'snippet'],
      ['q', 'fracciones 7º básico'],
      ['safeSearch', 'strict'],
      ['type', 'video'],
      ['videoEmbeddable', 'true'],
    ]);
  });

  it('traduce 429 a QUOTA sin filtrar detalles del proveedor', async () => {
    const providerDetail = 'provider quota detail must not reach the client';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: providerDetail } }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({ query: 'fracciones' }));

    expect(response.status).toBe(429);
    expectJsonNoStore(response);
    const error = await readError(response);
    expect(error.code).toBe('QUOTA');
    expect(JSON.stringify(error)).not.toContain(providerDetail);
    expect(JSON.stringify(error)).not.toContain(TEST_ONLY_KEY);
  });

  it('traduce errores del proveedor a PROVIDER_ERROR seguro', async () => {
    const providerDetail = 'internal provider failure must not reach the client';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: providerDetail } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handler(jsonRequest({ query: 'fracciones' }));

    expect(response.status).toBe(502);
    expectJsonNoStore(response);
    const error = await readError(response);
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(JSON.stringify(error)).not.toContain(providerDetail);
    expect(JSON.stringify(error)).not.toContain(TEST_ONLY_KEY);
  });
});
