import React from 'react';
import { Mic, MicOff, Radio, User, Activity } from 'lucide-react';

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
  const isConnecting = connectionState === 'connecting';
  const isReconnecting = connectionState === 'reconnecting';
  const isFailed = connectionState === 'failed';

  return (
    <div
      className={`rider-card ${isSelf ? 'rider-self' : ''} ${
        isSpeaking && !isMuted ? 'rider-speaking' : ''
      } ${isFailed ? 'rider-disconnected' : ''}`}
    >
      {/* Konuşurken Nabız Gibi Parlayan Dış Çerçeve */}
      {isSpeaking && !isMuted && <div className="speaking-glow-ring"></div>}

      <div className="rider-card-inner">
        {/* Sol Kısım: Kask / Sürücü Avatarı ve Canlı Durum Noktası */}
        <div className="rider-avatar-wrapper">
          <div className={`rider-avatar ${isSpeaking && !isMuted ? 'avatar-speaking' : ''}`}>
            <User size={30} />
          </div>
          <div
            className={`rider-status-dot ${
              isConnected
                ? 'dot-connected'
                : isConnecting || isReconnecting
                ? 'dot-reconnecting'
                : 'dot-failed'
            }`}
            title={
              isConnected
                ? 'Bağlı (Canlı)'
                : isConnecting
                ? 'Bağlanıyor...'
                : isReconnecting
                ? 'Yeniden Bağlanıyor...'
                : 'Bağlantı Koptu'
            }
          />
        </div>

        {/* Orta Kısım: İsim, Mikrofon Durumu ve Canlı Ses Ekolayzeri */}
        <div className="rider-info-col">
          <div className="rider-name-row">
            <div className="rider-name-group">
              <span className="rider-name">{name}</span>
              {isSelf && <span className="self-badge">SEN</span>}
            </div>

            {/* Mikrofon / Konuşma Durumu */}
            <div className="rider-state-badge">
              {isMuted ? (
                <span className="badge-mute">
                  <MicOff size={13} />
                  <span>KAPALI</span>
                </span>
              ) : isSpeaking ? (
                <span className="badge-speaking">
                  <Activity size={13} className="animate-pulse" />
                  <span>KONUŞUYOR</span>
                </span>
              ) : (
                <span className="badge-live">
                  <Mic size={13} />
                  <span>CANLI</span>
                </span>
              )}
            </div>
          </div>

          {/* Canlı Ses Seviyesi İlerleme Çubuğu */}
          <div className="rider-volume-container">
            <div
              className="rider-volume-bar"
              style={{
                width: `${isMuted ? 0 : Math.max(isSpeaking ? 30 : 0, volumeLevel)}%`,
                background:
                  volumeLevel > 60
                    ? 'linear-gradient(90deg, #00e5ff 0%, #ff6b00 100%)'
                    : 'linear-gradient(90deg, #00e676 0%, #00e5ff 100%)',
              }}
            />
          </div>

          {/* Alt Bilgi: Ping / Ağ Tipi */}
          <div className="rider-footer-row">
            <div className="telemetry-item">
              <Radio size={12} className="text-neon" />
              <span>{stats?.isLocal ? 'Hotspot Wi-Fi' : 'Doğrudan P2P'}</span>
            </div>

            <div className="telemetry-ping">
              <span className="ping-dot"></span>
              <span>{stats?.rtt ? `${stats.rtt} ms` : '10 ms'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
