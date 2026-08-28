// Ağ arayüzü değişikliklerini (Hücresel -> Hotspot / WiFi geçişlerini) izleyen modül

export function watchNetworkChanges(onNetworkChange) {
  if (typeof window === 'undefined') return () => {};

  let debounceTimer = null;
  const triggerChange = (reason) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[NetworkWatcher] Ağ değişikliği algılandı (${reason}) -> ICE Restart tetikleniyor`);
      if (typeof onNetworkChange === 'function') {
        onNetworkChange(reason);
      }
    }, 1200); // Ağ arayüzünün oturması için hafif gecikme
  };

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    connection.addEventListener('change', () => triggerChange('connection-change'));
  }

  const handleOnline = () => triggerChange('browser-online');
  const handleOffline = () => triggerChange('browser-offline');

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    if (connection) {
      connection.removeEventListener('change', () => triggerChange('connection-change'));
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
