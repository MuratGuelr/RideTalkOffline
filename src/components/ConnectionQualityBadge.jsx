import React from 'react';
import { Radio, Signal } from 'lucide-react';

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

  // Odada bağlı sürücüler varsa, 0 internet yerel mesh / Hotspot aktif olarak gösterilir
  return (
    <div className="conn-badge conn-hotspot" title="Ses yerel Wi-Fi Hotspot üzerinden doğrudan telefonlar arasında akıyor">
      <span className="pulse-dot-green"></span>
      <Radio size={14} className="icon-pulse" />
      <span>Yerel Hotspot (İnternetsiz Mesh)</span>
      {avgRtt > 0 && <span className="rtt-tag">{avgRtt}ms</span>}
    </div>
  );
}
