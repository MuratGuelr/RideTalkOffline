import React from 'react';
import { Wifi, Radio, Signal, AlertTriangle } from 'lucide-react';

export default function ConnectionQualityBadge({ isHotspotMode, avgRtt, activePeersCount, isOnline = true }) {
  if (activePeersCount === 0) {
    return (
      <div className="conn-badge conn-waiting">
        <span className="pulse-dot-yellow"></span>
        <Signal size={14} />
        <span>Sürücüler Bekleniyor</span>
      </div>
    );
  }

  if (!isOnline && !isHotspotMode) {
    return (
      <div className="conn-badge conn-offline">
        <AlertTriangle size={14} />
        <span>İnternet Yok (Hotspot'a Bağlanın)</span>
      </div>
    );
  }

  if (isHotspotMode) {
    return (
      <div className="conn-badge conn-hotspot" title="Ses yerel Wi-Fi Hotspot üzerinden internet olmadan akıyor">
        <span className="pulse-dot-green"></span>
        <Radio size={14} className="icon-pulse" />
        <span>Yerel Hotspot (İnternetsiz Mesh)</span>
        {avgRtt > 0 && <span className="rtt-tag">{avgRtt}ms</span>}
      </div>
    );
  }

  return (
    <div className="conn-badge conn-internet" title="Ses hücresel/internet STUN üzerinden aktarılıyor">
      <span className="pulse-dot-cyan"></span>
      <Wifi size={14} />
      <span>İnternet / STUN Ağı</span>
      {avgRtt > 0 && <span className="rtt-tag">{avgRtt}ms</span>}
    </div>
  );
}
