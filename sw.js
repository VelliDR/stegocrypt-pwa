const CACHE_NAME = 'stegocrypt-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-512.png',
  './icon-192.png',
  './js/app.js',
  './js/CryptoEngine.js',
  './js/CompressionEngine.js',
  './js/ScatterEngine.js',
  './js/SteganalysisEngine.js',
  './js/StegoEngine.js',
  './js/ImageEngine.js',
  './js/ZeroWidthEngine.js',
  './js/QREngine.js',
  './js/vendor/qrcode.mjs',
  './js/vendor/jsQR.js',
  './js/vendor/heic2any.min.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
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
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});