// Screen Wake Lock API sarmalayıcı
// Motosiklet sürüşü sırasında ekranın kapanmasını ve arka plana geçip iOS/Android WebRTC sesinin durmasını engeller.

let sentinel = null;
let isRequested = false;
let statusChangeCallback = null;

export function onWakeLockStatusChange(cb) {
  statusChangeCallback = cb;
}

function updateStatus(active) {
  if (typeof statusChangeCallback === 'function') {
    statusChangeCallback(active);
  }
}

export async function keepScreenAwake() {
  isRequested = true;
  if (!('wakeLock' in navigator)) {
    console.warn('[WakeLock] Tarayıcı WakeLock API desteklemiyor');
    updateStatus(false);
    return false;
  }

  try {
    sentinel = await navigator.wakeLock.request('screen');
    updateStatus(true);

    sentinel.addEventListener('release', () => {
      // Eğer kullanıcı bilerek kapatmadıysa ve sayfa hâlâ görünürse yeniden iste
      if (isRequested && document.visibilityState === 'visible') {
        keepScreenAwake();
      } else {
        updateStatus(false);
      }
    });

    return true;
  } catch (err) {
    console.warn('[WakeLock] Ekran kilidi alınamadı:', err.message);
    updateStatus(false);
    return false;
  }
}

export async function releaseScreenAwake() {
  isRequested = false;
  if (sentinel) {
    try {
      await sentinel.release();
      sentinel = null;
      updateStatus(false);
    } catch (err) {
      console.warn('[WakeLock] Bırakma hatası:', err.message);
    }
  }
}

// Sekme gizlenip tekrar aktifleştiğinde otomatik olarak kilidi tazele
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (isRequested && document.visibilityState === 'visible') {
      await keepScreenAwake();
    }
  });
}
