'use strict';

/**
 * Zero-dependency static server for the built PWA.
 *
 * Serves dist-pwa over plain HTTP on 127.0.0.1. That origin is a secure
 * context, so browsers allow Service Worker registration without the
 * self-signed HTTPS certificates Vite preview uses (Chrome rejects a
 * Service Worker script fetched over an untrusted certificate even when the
 * page navigation was bypassed).
 */

const http = require('node:http');
const { createReadStream, promises: fs } = require('node:fs');
const path = require('node:path');

const port = Number(process.argv[2] || process.env.PWA_PORT || 5173);
const root = path.resolve(__dirname, '..', process.argv[3] || 'dist-pwa');
const host = process.env.PWA_HOST || '127.0.0.1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Never cache the documents and workers that must reflect a new build.
const NO_CACHE = new Set(['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/registerSW.js']);

async function resolveFile(pathname) {
  let target = path.join(root, pathname);
  if (!target.startsWith(root)) return null;

  let stat = null;
  try {
    stat = await fs.stat(target);
  } catch {
    stat = null;
  }

  if (stat?.isDirectory()) target = path.join(target, 'index.html');
  if (!stat || stat.isDirectory()) {
    // Single-page app: unknown paths fall back to the app shell.
    const shell = path.join(root, 'index.html');
    try {
      await fs.access(shell);
    } catch {
      return null;
    }
    return shell;
  }
  return target;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = await resolveFile(pathname);
    if (!file) {
      response.writeHead(404).end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': NO_CACHE.has(pathname) ? 'no-cache' : 'public, max-age=3600',
    });
    createReadStream(file).pipe(response);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

server.listen(port, host, () => {
  console.log(`PWA served at http://${host}:${port}/ (root: ${root})`);
});
