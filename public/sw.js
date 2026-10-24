/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

precacheAndRoute(self.__WB_MANIFEST);

if ('navigationPreload' in self.registration) {
  self.registration.navigationPreload.enable();
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

function removeLegacyGeminiMetadata() {
  // The old ExpirationPlugin stored full request URLs (including API keys)
  // in Workbox's IndexedDB. Thumbnails can safely rebuild their metadata.
  return new Promise(resolve => {
    const request = self.indexedDB.deleteDatabase('workbox-expiration');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    self.caches.delete('gemini-api'),
    removeLegacyGeminiMetadata(),
  ]));
});

registerRoute(
  ({ url, request }) =>
    request.method === 'POST' && url.pathname.startsWith('/.netlify/functions/'),
  new NetworkOnly()
);

registerRoute(
  ({ url }) => url.hostname === 'i.ytimg.com',
  new StaleWhileRevalidate({
    cacheName: 'youtube-thumbnails',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
