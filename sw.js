const CACHE_NAME = 'wr-judo-v35'; // Bumped version to force cache refresh on deploy

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './styles/main.css',
  './styles/animations.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/seed.js',
  './js/firebase-config.js',
  './images/logo.png',
  './images/logo-white-red.png'
];


self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch(err => console.log('Cache failed', err))
  );
});


self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});


self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Always go to the network for Firebase / Google APIs — never cache these
  if (
    request.url.includes('firebase') ||
    request.url.includes('googleapis') ||
    request.url.includes('gstatic')
  ) return;

  // FIX: Cache-first strategy for app shell assets.
  // Previously the worker used network-first for everything, meaning the app
  // would stall on slow connections even when a perfectly good cached version
  // existed. Now we serve from cache instantly and fall back to the network
  // only when the asset isn't cached yet (e.g. on first install).
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve the cached version immediately, then update in the background
        const networkFetch = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse.clone());
              });
            }
            return networkResponse;
          })
          .catch(() => {/* offline — silently ignore, cache already served */});

        return cachedResponse;
      }

      // Not in cache yet — fetch from network and cache it
      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => {
        // Truly offline with nothing cached — nothing we can do
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
