// RideTalk Service Worker — 100% Çevrimdışı PWA Desteği
const CACHE_NAME = 'ridetalk-offline-v3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/sounds/mute.mp3',
  '/sounds/unmute.mp3',
  '/sounds/someone-left.mp3',
];

// Kurulum: Statik temel dosyaları önbelleğe al
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] PWA Çevrimdışı önbellek hazırlanıyor...');
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Bazı önbellek dosyaları atlandı:', err);
      });
    })
  );
  self.skipWaiting();
});

// Etkinleştirme: Eski önbellekleri temizle ve istemcileri hemen sahiplen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eski önbellek temizlendi:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Ağ/Önbellek Stratejisi: Stale-While-Revalidate + Offline Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Firebase ve harici API isteklerini önbelleğe alma
  if (url.origin.includes('firebaseio.com') || url.origin.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. Önbellekte varsa HEMEN dön (0ms bekleme)
      if (cachedResponse) {
        // Arka planda güncelle (ağ varsa)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // 2. Önbellekte yoksa ağdan çek ve gelecekte çevrimdışı kullanım için kaydet
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // 3. Ağ tamamen yoksa ve HTML sayfası isteniyorsa ana sayfayı ver
          if (event.request.headers.get('accept')?.includes('text/html') || event.request.mode === 'navigate') {
            return caches.match('/index.html') || caches.match('/');
          }
        });
    })
  );
});
