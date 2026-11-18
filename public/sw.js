const CACHE_NAME = 'stegocrypt-v3.1';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.ico',
  './icon-512.png',
  './icon-192.png',
  './live-server-guard.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn(`[SW] Precache failed for ${asset}:`, err);
          })
        )
      );
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request, { ignoreSearch: true })
      .then((res) => res || caches.match(e.request.url, { ignoreSearch: true }))
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const requestUrl = new URL(e.request.url);
          const isSameOrigin = requestUrl.origin === self.location.origin;
          if (isSameOrigin && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch((fetchErr) => {
          if (e.request.mode === 'navigate') {
            return caches.match('./', { ignoreSearch: true })
              .then((res) => res || caches.match('./index.html', { ignoreSearch: true }));
          }
          throw fetchErr;
        });
      })
  );
});
