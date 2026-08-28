// RideTalk Service Worker — 100% Çevrimdışı PWA Desteği
const CACHE_NAME = 'ridetalk-offline-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/sounds/mute.mp3',
  '/sounds/unmute.mp3',
  '/sounds/someone-left.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Tüm statik kaynaklar ve sesler önbelleğe alınıyor...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Bazı kaynaklar önbelleğe alınamadı:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eski önbellek temizleniyor:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Cache First, Network Fallback (İnternet olmasa dahi uygulama anında açılır)
self.addEventListener('fetch', (event) => {
  // Sadece GET isteklerini önbellekten sun
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Arkaplanda önbelleği tazele
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse.clone());
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // İnternet yoksa ana sayfayı döndür
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
    })
  );
});
