/* Close Community — Service Worker (offline support) */
const CACHE = 'cc-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/play.html',
  '/minesweeper.html',
  '/random.html',
  '/archive.html',
  '/favicon.ico',
  '/favicon-32.png',
  '/favicon-192.png',
  '/logos/web/TYPO_LOGO.webp',
  '/logos/web/TYPO_LOGO.png',
  '/logos/web/LETTERS_LOGO_TRANSPARENT.webp',
  '/logos/web/LETTERS_LOGO_TRANSPARENT.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/ANGELDOWNTEE.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/ANGELDOWNTEE.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/FRONT_SIDE_FONT_TEE.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/FRONT_SIDE_FONT_TEE.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/BACK_SIDE_FONT_TEE.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/BACK_SIDE_FONT_TEE.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/STARSTEE.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/STARSTEE.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/BASICTEEOVRZD.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/BASICTEEOVRZD.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/CCSOCKS.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/CCSOCKS.png',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/CCWSOCKS.webp',
  '/TRANSPARENT_MOCKUPS/CAPSULA%2001/web/CCWSOCKS.png',
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
