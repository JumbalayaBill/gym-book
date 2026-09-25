// Keeps the page working if the venue's internet drops and someone reloads.
// Network first (so edits to config.js show up), cached copy as fallback.
const CACHE = 'gym-ordsky-v1';
const FILES = [
  './',
  'index.html',
  'config.js',
  'store.js',
  'cloud.js',
  'app.js',
  'style.css',
  'fonts/anton-400.woff2',
  'fonts/barlow-condensed-500.woff2',
  'fonts/barlow-condensed-700.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
