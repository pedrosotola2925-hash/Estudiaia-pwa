import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateAIRequest } = require('../../src/services/security.cjs');
const { buildPrompt } = require('../../src/services/prompts.cjs');

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
});
const ERROR_MESSAGES = Object.freeze({
  SERVICE_NOT_CONFIGURED: 'El servicio de IA no está configurado.',
  INVALID_FORMAT: 'La solicitud no tiene un formato válido.',
  QUOTA: 'El servicio está ocupado. Inténtalo más tarde.',
  PROVIDER_ERROR: 'El proveedor no pudo completar la solicitud.',
  TIMEOUT: 'El proveedor tardó demasiado en responder.',
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

function responseText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .filter(part => typeof part?.text === 'string' && !part.thought)
    .map(part => part.text)
    .join('\n')
    .trim();
}

function geminiBody(request, prompt) {
  const parts = [{ text: prompt.text }];
  if (request.file) {
    parts.push({ inlineData: { mimeType: request.file.mime, data: request.file.base64 } });
  }
  return {
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: 4096,
      ...(prompt.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
}

export default async function handler(request) {
  if (request?.method !== 'POST' || !acceptsJson(request.headers?.get('content-type'))) {
    return errorResponse(400, 'INVALID_FORMAT');
  }

  let validatedRequest;
  let prompt;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
      return errorResponse(400, 'INVALID_FORMAT');
    }
    const body = JSON.parse(rawBody);
    validatedRequest = validateAIRequest(body?.request);
    prompt = buildPrompt(validatedRequest);
  } catch {
    return errorResponse(400, 'INVALID_FORMAT');
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return errorResponse(503, 'SERVICE_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(geminiBody(validatedRequest, prompt)),
      signal: controller.signal,
    });

    if (timedOut) return errorResponse(504, 'TIMEOUT');
    if (upstream.status === 429) return errorResponse(429, 'QUOTA');
    if (!upstream.ok) return errorResponse(502, 'PROVIDER_ERROR');

    let data;
    try {
      data = await upstream.json();
    } catch {
      return errorResponse(502, 'PROVIDER_ERROR');
    }

    if (timedOut) return errorResponse(504, 'TIMEOUT');
    const text = responseText(data);
    if (!text || text.length > 20_000) return errorResponse(502, 'PROVIDER_ERROR');
    return jsonResponse(200, { text });
  } catch {
    return timedOut || controller.signal.aborted
      ? errorResponse(504, 'TIMEOUT')
      : errorResponse(502, 'PROVIDER_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}
