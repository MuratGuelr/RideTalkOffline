import React, { memo } from 'react';
import { Radio, Signal } from 'lucide-react';

function ConnectionQualityBadge({ avgRtt, activePeersCount }) {
  if (activePeersCount === 0) {
    return (
      <div className="tft-conn-badge tft-conn-waiting">
        <span className="pulse-dot-yellow"></span>
        <Signal size={13} className="text-yellow" />
        <span>Bekleniyor</span>
      </div>
    );
  }

  return (
    <div className="tft-conn-badge tft-conn-hotspot" title="Doğrudan P2P Hotspot Wi-Fi">
      <span className="pulse-dot-green"></span>
      <Radio size={13} className="text-emerald animate-pulse" />
      <span>Hotspot Mesh</span>
      <span className="tft-rtt-tag">{avgRtt > 0 ? `${avgRtt}ms` : '10ms'}</span>
    </div>
  );
}

export default memo(ConnectionQualityBadge);
