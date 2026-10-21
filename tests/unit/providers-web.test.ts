import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSettingsStoreWeb } from '@services/settings-web';
import { createProviderServiceWeb } from '@services/providers-web';

const MASTER_PASSWORD = 'CorrectHorseBatteryStaple!2026';

const testWindow = {
  crypto: webcrypto as unknown as Crypto,
  isSecureContext: true,
  addEventListener: vi.fn(),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeAll(() => {
  vi.stubGlobal('window', testWindow);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function newStore(): ReturnType<typeof createSettingsStoreWeb> {
  return createSettingsStoreWeb({
    dbName: `test-providers-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    storeName: 'secrets',
  });
}

describe('providers-web', () => {

  it('askGemini lanza GEMINI_KEY_MISSING cuando no hay clave configurada', async () => {
    const store = newStore();
    await store.unlock(MASTER_PASSWORD);
    const providers = createProviderServiceWeb({ settingsStore: store });
    await expect(providers.askGemini('¿Qué son las fracciones?')).rejects.toThrow(
      'GEMINI_KEY_MISSING',
    );
  });

  it('searchYouTube lanza YOUTUBE_KEY_MISSING cuando no hay clave configurada', async () => {
    const store = newStore();
    await store.unlock(MASTER_PASSWORD);
    const providers = createProviderServiceWeb({ settingsStore: store });
    await expect(providers.searchYouTube('fracciones')).rejects.toThrow(
      'YOUTUBE_KEY_MISSING',
    );
  });

  it('askGemini llama a Gemini y devuelve el texto de la respuesta', async () => {
    const store = newStore();
    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', 'gemini-test-key');

    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get('key')).toBe('gemini-test-key');
      expect(url.pathname).toContain('generateContent');
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: 'Las fracciones son partes de un todo.' }] } }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const providers = createProviderServiceWeb({ settingsStore: store });
      const text = await providers.askGemini('Hola');
      expect(text).toBe('Las fracciones son partes de un todo.');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('searchYouTube llama a YouTube y devuelve vídeos normalizados y seguros', async () => {
    const store = newStore();
    await store.unlock(MASTER_PASSWORD);
    await store.set('youtubeKey', 'youtube-test-key');

    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input);
      expect(url.searchParams.get('key')).toBe('youtube-test-key');
      expect(url.searchParams.get('safeSearch')).toBe('strict');
      expect(url.searchParams.get('type')).toBe('video');
      return jsonResponse({
        items: [
          {
            id: { videoId: 'abcdefghijk' },
            snippet: {
              title: 'Vídeo de fracciones',
              thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' } },
            },
          },
          { id: { videoId: 'javascript:evil' }, snippet: { title: 'peligroso' } },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const providers = createProviderServiceWeb({ settingsStore: store });
      const videos = await providers.searchYouTube('fracciones', 5);
      expect(videos).toEqual([
        {
          id: 'abcdefghijk',
          title: 'Vídeo de fracciones',
          thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
        },
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('askGemini falla con código de error cuando Gemini responde malformado', async () => {
    const store = newStore();
    await store.unlock(MASTER_PASSWORD);
    await store.set('geminiKey', 'gemini-test-key');

    vi.stubGlobal('fetch', async () => jsonResponse({ candidates: [] }));
    try {
      const providers = createProviderServiceWeb({ settingsStore: store });
      await expect(providers.askGemini('Hola')).rejects.toThrow(/vacía|inválida/i);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
