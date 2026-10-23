const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const DEFAULT_MAX_RESULTS = 4;
const MAX_QUERY_LENGTH = 1_000;
const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
});
const ERROR_MESSAGES = Object.freeze({
  SERVICE_NOT_CONFIGURED: 'El servicio de IA no está configurado.',
  INVALID_FORMAT: 'La solicitud no tiene un formato válido.',
  QUOTA: 'El servicio está ocupado. Inténtalo más tarde.',
  PROVIDER_ERROR: 'El proveedor no pudo completar la solicitud.',
});

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function errorResponse(status, code) {
  return jsonResponse(status, { error: { code, message: ERROR_MESSAGES[code] } });
}

function acceptsJson(contentType) {
  return typeof contentType === 'string' && /^application\/json(?:\s*;|$)/i.test(contentType);
}

function parseSearch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const query = body.query;
  if (
    typeof query !== 'string'
    || query.length > MAX_QUERY_LENGTH
    || query.includes('\0')
    || !query.trim()
  ) {
    return null;
  }

  const maxResults = body.maxResults === undefined ? DEFAULT_MAX_RESULTS : body.maxResults;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) return null;

  return { query: query.trim(), maxResults };
}

function isValidVideoId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
}

function normalizeVideos(data) {
  if (!Array.isArray(data?.items)) return [];

  return data.items.flatMap(item => {
    const id = item?.id?.videoId;
    const title = item?.snippet?.title;
    if (!isValidVideoId(id) || typeof title !== 'string' || !title.trim()) return [];

    return [{
      id,
      title: title.trim(),
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    }];
  });
}

function youtubeSearchUrl({ query, maxResults }, apiKey) {
  const url = new URL(YOUTUBE_SEARCH_URL);
  url.search = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    safeSearch: 'strict',
    videoEmbeddable: 'true',
    maxResults: String(maxResults),
    q: query,
    key: apiKey,
  }).toString();
  return url.toString();
}

export default async function handler(request) {
  if (request?.method !== 'POST' || !acceptsJson(request.headers?.get('content-type'))) {
    return errorResponse(400, 'INVALID_FORMAT');
  }

  let search;
  try {
    search = parseSearch(await request.json());
  } catch {
    return errorResponse(400, 'INVALID_FORMAT');
  }
  if (!search) return errorResponse(400, 'INVALID_FORMAT');

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) return errorResponse(503, 'SERVICE_NOT_CONFIGURED');

  try {
    const upstream = await fetch(youtubeSearchUrl(search, apiKey), { method: 'GET' });
    if (upstream.status === 429) return errorResponse(429, 'QUOTA');
    if (!upstream.ok) return errorResponse(502, 'PROVIDER_ERROR');

    let data;
    try {
      data = await upstream.json();
    } catch {
      return errorResponse(502, 'PROVIDER_ERROR');
    }

    return jsonResponse(200, { videos: normalizeVideos(data) });
  } catch {
    return errorResponse(502, 'PROVIDER_ERROR');
  }
}
