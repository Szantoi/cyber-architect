const CACHE_PREFIX = 'cyber-architect-';
const CACHE_NAME = `${CACHE_PREFIX}v3`;
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

self.addEventListener('install', (event) => {
  const precache = caches.open(CACHE_NAME).then((cache) => {
    return Promise.all(STATIC_ASSETS.map(async (asset) => {
      try {
        await cache.add(asset);
      } catch (error) {
        console.warn(`[SW_INSTALL_NOTE] Failed to precache ${asset}:`, error);
      }
    }));
  });

  event.waitUntil(Promise.all([precache, self.skipWaiting()]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Only this application's same-origin responses belong in its cache.
  if (!['http:', 'https:'].includes(requestUrl.protocol) || requestUrl.origin !== self.location.origin) {
    return;
  }

  // 2. Skip non-GET requests and API/SSE endpoints
  if (event.request.method !== 'GET' || requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // 3. For HTML navigation: Network-First (always fetch latest chunk hashes, fallback to cache when offline)
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            // All client-side routes use the same SPA shell. Keeping a single
            // entry prevents unbounded cache growth as users navigate.
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/index.html', networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 4. For Static Assets (JS, CSS, SVGs, Fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
