// Ağ arayüzü değişikliklerini izleyen modül
// Hotspot geçişinde birden fazla ICE Restart denemesi tetikler.

export function watchNetworkChanges(onNetworkChange) {
  if (typeof window === 'undefined') return () => {};

  let debounceTimer = null;
  let retryCount = 0;
  const MAX_RETRIES = 4;
  const RETRY_DELAYS = [800, 2000, 4000, 7000]; // Her deneme için gecikme (ms)

  const triggerChange = (reason) => {
    if (debounceTimer) clearTimeout(debounceTimer);

    // İlk deneme: Ağ oturması için kısa bekleme
    debounceTimer = setTimeout(() => {
      retryCount = 0;
      doRetry(reason);
    }, 600);
  };

  function doRetry(reason) {
    console.log(`[NetworkWatcher] ICE Restart deneme ${retryCount + 1}/${MAX_RETRIES} (${reason})`);
    if (typeof onNetworkChange === 'function') {
      onNetworkChange(reason, retryCount);
    }

    retryCount++;
    if (retryCount < MAX_RETRIES) {
      setTimeout(() => {
        doRetry(reason);
      }, RETRY_DELAYS[retryCount] || 3000);
    }
  }

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    connection.addEventListener('change', () => triggerChange('connection-api'));
  }

  const handleOnline = () => triggerChange('online');
  const handleOffline = () => triggerChange('offline');

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (connection) {
      try { connection.removeEventListener('change', () => {}); } catch (_) {}
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
