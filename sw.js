/* Close Community — Service Worker (offline support) */
const CACHE = 'cc-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/play.html',
  '/minesweeper.html',
  '/random.html',
  '/archive.html',
  '/logos/TYPO_LOGO.png',
  '/logos/LETTERS_LOGO_TRANSPARENT.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      // Cache-first for same-origin assets, network-first for fonts/CDN
      if (cached && new URL(e.request.url).origin === location.origin) {
        return cached;
      }
      return fetch(e.request).then(res => {
        // Cache same-origin successful responses
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', {status: 503}));
    })
  );
});
