/* ══════════════════════════════════════════════════════════
   SW.JS — Service Worker for offline support & PWA install
══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'rental-tracker-v3';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/drive.js',
  '/app.js',
  '/manifest.json',
  '/icons/icon.svg',
];

/* ── Install: cache app shell ─────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Use addAll but don't fail install if icons are missing
      return cache.addAll(APP_SHELL).catch(err => {
        console.warn('SW: Some assets could not be cached:', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── Activate: clear old caches ───────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch: serve from cache, fall back to network ────── */
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Never cache Google API calls — always go to network
  if (
    url.includes('googleapis.com') ||
    url.includes('accounts.google.com') ||
    url.includes('gstatic.com')
  ) {
    return; // Let browser handle it
  }

  // For app shell files: cache-first strategy
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses for app shell files
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
