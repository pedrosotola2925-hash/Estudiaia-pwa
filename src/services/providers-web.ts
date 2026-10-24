/**
 * Servicio de proveedores de IA para la versión web (PWA) de EstudiaIA.
 *
 * Todas las operaciones se delegan en funciones privadas de Netlify
 * (`/.netlify/functions/gemini` y `/.netlify/functions/youtube`), que guardan
 * las claves en variables de entorno del servidor. El navegador no lee, no
 * descifra y no envía claves ni modelos: reenvía la solicitud validada por la
 * propia función y traduce su envoltura de error segura
 * (`{ error: { code, message } }`) a `ProviderError`, conservando el `code`
 * para que Tutor, Prácticas y Vídeos muestren mensajes sin bloquearse.
 *
 * Interface:
 *   createProviderServiceWeb() =>
 *     { generate(request), searchVideos({ id, query }), cancel(id), close() }
 */

const GEMINI_FUNCTION_URL = '/.netlify/functions/gemini';
const YOUTUBE_FUNCTION_URL = '/.netlify/functions/youtube';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ACTIVE_OPERATIONS = 6;
const SEARCH_MAX_RESULTS = 4;
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Códigos seguros que las funciones pueden devolver al navegador. */
const SAFE_ERROR_CODES = new Set([
  'SERVICE_NOT_CONFIGURED',
  'INVALID_FORMAT',
  'QUOTA',
  'PROVIDER_ERROR',
  'TIMEOUT',
]);

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SAFE_THUMBNAIL_PATTERN = /^https:\/\/i\.ytimg\.com\//;

export interface GeneratedRequest {
  id: string;
  kind: 'tutor' | 'units' | 'practice' | 'lesson' | 'plan' | 'notes';
  course: string;
  question?: string;
  context?: string;
  subjectId?: string;
  subjectName?: string;
  unit?: string;
  examDate?: string;
  file?: { name?: string; mime: string; base64: string };
}

export interface VideoResult {
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

function abortControllerWithTimeout(ms: number): { controller: AbortController; clear(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, clear: () => clearTimeout(timer) };
}

function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

/**
 * Lanza `ProviderError` cuando la función respondió con su envoltura segura.
 * Solo se aceptan los códigos públicos; cualquier otro texto o cuerpo crudo se
 * descarta en favor de un mensaje fijo.
 */
function throwForSafeError(data: unknown): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== 'object' || Array.isArray(error)) return;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string' && SAFE_ERROR_CODES.has(code)) {
    throw new ProviderError(
      code,
      typeof message === 'string' && message.trim() ? message : 'La solicitud no pudo completarse.',
    );
  }
}

async function fetchJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const timeout = abortControllerWithTimeout(REQUEST_TIMEOUT_MS);
  const controller = timeout.controller;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await readJson(response);
    throwForSafeError(data);
    if (signal?.aborted) {
      throw new ProviderError('CANCELLED', 'Operación cancelada.');
    }
    if (response.status === 429) {
      throw new ProviderError('QUOTA', 'Cuota del proveedor agotada.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('AUTH_ERROR', 'Autenticación fallida con el proveedor.');
    }
    if (!response.ok) {
      throw new ProviderError('PROVIDER_ERROR', 'El proveedor no pudo completar la solicitud.');
    }
    return data as T;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (signal?.aborted) {
      throw new ProviderError('CANCELLED', 'Operación cancelada.');
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('TIMEOUT', `La solicitud superó los ${REQUEST_TIMEOUT_MS} ms`);
    }
    throw new ProviderError(
      'NETWORK',
      error instanceof Error ? error.message : 'Error de red desconocido',
    );
  } finally {
    timeout.clear();
    signal?.removeEventListener('abort', abort);
  }
}

function postJson<T>(url: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  }, signal);
}

function requireValidRequest(request: GeneratedRequest): void {
  if (
    !request
    || typeof request !== 'object'
    || !ID_PATTERN.test(request.id)
    || typeof request.course !== 'string'
    || !request.course.trim()
  ) {
    throw new ProviderError('INVALID_FORMAT', 'Solicitud no válida.');
  }
}

function normalizeVideos(value: unknown): VideoResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((video): VideoResult[] => {
    if (!video || typeof video !== 'object') return [];
    const { id, title, thumbnail } = video as { id?: unknown; title?: unknown; thumbnail?: unknown };
    if (typeof id !== 'string' || !VIDEO_ID_PATTERN.test(id)) return [];
    if (typeof title !== 'string' || !title.trim()) return [];
    return [{
      id,
      title: title.trim().slice(0, 1000),
      thumbnail: typeof thumbnail === 'string' && SAFE_THUMBNAIL_PATTERN.test(thumbnail) ? thumbnail : '',
    }];
  });
}

/**
 * Crea el servicio de proveedores PWA. No recibe secretos ni selector de modelo:
 * la función Gemini fija el modelo en el servidor.
 */
export function createProviderServiceWeb() {
  const active = new Map<string, AbortController>();

  async function generate(request: GeneratedRequest): Promise<{ text: string }> {
    requireValidRequest(request);
    if (active.has(request.id) || active.size >= MAX_ACTIVE_OPERATIONS) {
      throw new ProviderError('BUSY', 'Hay una operación en curso.');
    }
    const controller = new AbortController();
    active.set(request.id, controller);
    try {
      const data = await postJson<{ text?: unknown }>(
        GEMINI_FUNCTION_URL,
        { request },
        controller.signal,
      );
      if (typeof data?.text !== 'string' || !data.text.trim()) {
        throw new ProviderError('INVALID_FORMAT', 'El servicio devolvió una respuesta vacía.');
      }
      return { text: data.text };
    } finally {
      active.delete(request.id);
    }
  }

  async function searchVideos(request: { id: string; query: string }): Promise<VideoResult[]> {
    if (!request || typeof request !== 'object' || !ID_PATTERN.test(request.id)) {
      throw new ProviderError('INVALID_FORMAT', 'Identificador no válido.');
    }
    if (typeof request.query !== 'string' || !request.query.trim()) {
      throw new ProviderError('INVALID_FORMAT', 'Escribe tu búsqueda.');
    }
    const data = await postJson<{ videos?: unknown }>(YOUTUBE_FUNCTION_URL, {
      query: request.query.trim(),
      maxResults: SEARCH_MAX_RESULTS,
    });
    return normalizeVideos(data?.videos);
  }

  function cancel(id: string): void {
    active.get(id)?.abort();
  }

  function close(): void {
    for (const controller of active.values()) controller.abort();
    active.clear();
  }

  return { generate, searchVideos, cancel, close };
}
