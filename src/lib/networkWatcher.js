// Ağ arayüzü değişikliklerini izle
// Hotspot geçişinde HIZLA ICE Restart tetikle

export function watchNetworkChanges(onNetworkChange) {
  if (typeof window === 'undefined') return () => {};

  let debounceTimer = null;

  const trigger = (reason) => {
    // 300ms debounce - ama çok hızlı tepki ver
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[NetworkWatcher] ⚡ Ağ değişimi algılandı: ${reason}`);
      if (typeof onNetworkChange === 'function') {
        onNetworkChange(reason);
      }
    }, 300);
  };

  // 1. Connection API (en güvenilir)
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const connectionHandler = () => trigger('connection-api');
  if (connection) {
    connection.addEventListener('change', connectionHandler);
  }

  // 2. Online/Offline olayları
  const onlineHandler = () => trigger('online');
  const offlineHandler = () => trigger('offline');
  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);

  // 3. IP değişimi tespiti (her 3sn yerel IP kontrolü)
  let lastLocalIp = '';
  const ipCheckInterval = setInterval(async () => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdp = pc.localDescription.sdp;
      const ipMatch = sdp.match(/c=IN IP4 (\d+\.\d+\.\d+\.\d+)/);
      const currentIp = ipMatch ? ipMatch[1] : '';

      pc.close();

      if (lastLocalIp && currentIp && lastLocalIp !== currentIp) {
        console.log(`[NetworkWatcher] IP değişti: ${lastLocalIp} → ${currentIp}`);
        trigger('ip-change');
      }
      lastLocalIp = currentIp;
    } catch (_) {}
  }, 3000);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    clearInterval(ipCheckInterval);
    if (connection) {
      try { connection.removeEventListener('change', connectionHandler); } catch (_) {}
    }
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
  };
}
