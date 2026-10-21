/**
 * Servicio de proveedores de IA para la versión web (PWA) de EstudiaIA.
 *
 * Sustituye las llamadas IPC de Electron (`window.desktop.generate` /
 * `window.desktop.searchVideos`) por peticiones fetch directas a Gemini y
 * YouTube Data API v3. Las claves de API se leen del almacén de ajustes
 * cifrado (`settings-web`), que debe estar desbloqueado por la UI antes de
 * invocar cualquier operación.
 *
 * Interface:
 *   createProviderServiceWeb({ settingsStore }) =>
 *     { askGemini(prompt, model?), searchYouTube(query, maxResults?), close() }
 *
 * `settingsStore` debe exponer `get(key: string): Promise<string | null>`.
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const YOUTUBE_BASE = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

interface ProviderSettingsStore {
  get(key: string): Promise<string | null>;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

interface YouTubeItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    thumbnails?: { medium?: { url?: string } };
  };
}

interface YouTubeResponse {
  items?: YouTubeItem[];
}

interface VideoResult {
  id: string;
  title: string;
  thumbnail: string;
}

class ProviderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
  }
}

function abortControllerWithTimeout(ms: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller;
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const controller = abortControllerWithTimeout(REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status === 429) {
      throw new ProviderError('QUOTA', `Cuota del proveedor agotada (${response.status})`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('AUTH_ERROR', `Autenticación fallida con el proveedor (${response.status})`);
    }
    if (!response.ok) {
      throw new ProviderError('PROVIDER_ERROR', `El proveedor respondió ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('TIMEOUT', `La solicitud superó los ${REQUEST_TIMEOUT_MS} ms`);
    }
    throw new ProviderError(
      'NETWORK',
      error instanceof Error ? error.message : 'Error de red desconocido',
    );
  }
}

export function createProviderServiceWeb(options: {
  settingsStore: ProviderSettingsStore;
}) {
  const { settingsStore } = options;

  async function requireKey(
    keyName: 'geminiKey' | 'youtubeKey',
  ): Promise<string> {
    const key = await settingsStore.get(keyName);
    if (!key) {
      throw new Error(
        keyName === 'geminiKey' ? 'GEMINI_KEY_MISSING' : 'YOUTUBE_KEY_MISSING',
      );
    }
    return key;
  }

  async function askGemini(
    prompt: string,
    model: string = DEFAULT_GEMINI_MODEL,
  ): Promise<string> {
    const key = await requireKey('geminiKey');
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(
      model,
    )}:generateContent?key=${encodeURIComponent(key)}`;
    const data = await fetchJson<GeminiResponse>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) {
      if (data.promptFeedback?.blockReason) {
        throw new ProviderError(
          'BLOCKED',
          `Respuesta bloqueada por el proveedor: ${data.promptFeedback.blockReason}`,
        );
      }
      throw new ProviderError(
        'INVALID_FORMAT',
        'El servicio devolvió una respuesta vacía.',
      );
    }
    return text;
  }

  async function searchYouTube(
    query: string,
    maxResults: number = 10,
  ): Promise<VideoResult[]> {
    const key = await requireKey('youtubeKey');
    const limited = Math.max(1, Math.min(50, maxResults));
    const url = `${YOUTUBE_BASE}/search?part=snippet&type=video&maxResults=${limited}&q=${encodeURIComponent(
      query,
    )}&key=${encodeURIComponent(key)}&safeSearch=strict&videoEmbeddable=true`;
    const data = await fetchJson<YouTubeResponse>(url, { method: 'GET' });
    const videos = (data.items ?? [])
      .map((item): VideoResult => ({
        id: item.id?.videoId ?? '',
        title: item.snippet?.title ?? '',
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? '',
      }))
      .filter(
        (video) =>
          /^[A-Za-z0-9_-]{11}$/.test(video.id) && video.title.trim(),
      );
    return videos;
  }

  function close(): void {
    // No hay conexiones persistentes en la compilación web.
  }

  return { askGemini, searchYouTube, close };
}
