// RideTalk — Olay Güdümlü Ağ Arayüzü Takipçisi (NetworkWatcher)
// CPU ve pil tasarrufu için arka planda polling YAPMAZ.
// Sistem seviyesindeki ağ arayüzü ve Wi-Fi değişimlerini (Hotspot geçişi)
// doğrudan tarayıcı olayları üzerinden yakalar.

export function watchNetworkChanges(onNetworkChange) {
  if (typeof window === 'undefined') return () => {};

  let debounceTimer = null;

  const trigger = (reason) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[NetworkWatcher] ⚡ Ağ arayüzü değişimi algılandı: ${reason}`);
      if (typeof onNetworkChange === 'function') {
        onNetworkChange(reason);
      }
    }, 250);
  };

  // 1. Network Information API (Mobil/Wi-Fi/Hotspot tür değişimi)
  const connection =
    navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const connectionHandler = () => trigger('connection-change');
  if (connection) {
    try {
      connection.addEventListener('change', connectionHandler);
    } catch (_) {}
  }

  // 2. Tarayıcı Online / Offline durum geçişleri
  const onlineHandler = () => trigger('online');
  const offlineHandler = () => trigger('offline');
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  // 3. Ekran uyanma / sayfa odaklanma (Telefon cebden çıktığında veya kilit açıldığında)
  const visibilityHandler = () => {
    if (document.visibilityState === 'visible') {
      trigger('visibility-resume');
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (connection) {
      try {
        connection.removeEventListener('change', connectionHandler);
      } catch (_) {}
    }
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
    document.removeEventListener('visibilitychange', visibilityHandler);
  };
}
