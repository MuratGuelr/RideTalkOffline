import React from 'react';
import { Mic, MicOff, Wifi, Radio, User } from 'lucide-react';

export default function ParticipantCard({
  name,
  isSelf = false,
  isMuted = false,
  isSpeaking = false,
  volumeLevel = 0,
  connectionState = 'connected',
  stats = null,
}) {
  const isConnected = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting';

  return (
    <div
      className={`rider-card ${isSelf ? 'rider-self ' : ''}${isSpeaking && !isMuted ? 'rider-speaking ' : ''}${!isConnected ? 'rider-disconnected' : ''}`}
    >
      {/* Konuşma Parlama Halkası */}
      {isSpeaking && !isMuted && <div className="speaking-glow-ring"></div>}

      <div className="rider-avatar-wrapper">
        <div className="rider-avatar">
          <User size={28} />
        </div>
        <div
          className={`rider-status-dot ${isConnected ? 'dot-connected' : isReconnecting ? 'dot-reconnecting' : 'dot-failed'}`}
          title={isConnected ? 'Bağlı' : isReconnecting ? 'Yeniden Bağlanıyor...' : 'Bağlantı Koptu'}
        />
      </div>

      <div className="rider-info">
        <div className="rider-name-row">
          <span className="rider-name">
            {name} {isSelf && <span className="self-tag">(Sen)</span>}
          </span>
          {isMuted ? (
            <span className="mute-icon-tag" title="Mikrofon Kapalı">
              <MicOff size={14} className="text-crimson" />
            </span>
          ) : (
            <span className="mic-icon-tag" title="Mikrofon Açık">
              <Mic size={14} className="text-emerald" />
            </span>
          )}
        </div>

        {/* Canlı Ses Seviyesi Çubuğu */}
        <div className="rider-volume-track">
          <div
            className="rider-volume-fill"
            style={{
              width: `${isMuted ? 0 : volumeLevel}%`,
              backgroundColor: volumeLevel > 60 ? '#ff6b00' : '#00e5ff',
            }}
          />
        </div>

        {/* Gecikme ve Ağ Bilgisi */}
        <div className="rider-meta-row">
          {isConnected ? (
            <>
              <span className="status-text text-emerald">
                {stats?.isLocal ? (
                  <span className="flex-center gap-1">
                    <Radio size={11} /> Hotspot
                  </span>
                ) : (
                  <span className="flex-center gap-1">
                    <Wifi size={11} /> STUN
                  </span>
                )}
              </span>
              <span className="rtt-text">
                {stats?.rtt ? `${stats.rtt} ms` : '15 ms'}
              </span>
            </>
          ) : isReconnecting ? (
            <span className="status-text text-yellow">Yeniden Bağlanıyor...</span>
          ) : (
            <span className="status-text text-crimson">Koptu (Bekleniyor)</span>
          )}
        </div>
      </div>
    </div>
  );
}
