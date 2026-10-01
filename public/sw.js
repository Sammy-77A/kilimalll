// Kilimall Service Worker (Phase 9)
const CACHE_NAME = 'kilimalll-v1';
const ASSETS = [
  '/',
  '/css/pc-components.DWesFxKI.0b59b.css',
  '/css/mobile-components.CTFfZWhW.0b59b.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Let browser handle normal network requests for /api and pages
});
