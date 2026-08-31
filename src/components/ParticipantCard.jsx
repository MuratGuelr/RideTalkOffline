import React, { useState, useEffect, memo } from 'react';
import { Mic, MicOff, Radio, User, Activity } from 'lucide-react';
import { audioStore } from '../lib/audioStateStore.js';

function ParticipantCard({
  peerId,
  name,
  isSelf = false,
  isMuted = false,
  connectionState = 'connected',
  stats = null,
}) {
  const [audioState, setAudioState] = useState(() => {
    return audioStore.getVolume(isSelf ? 'local' : peerId);
  });

  // Yalnızca bu karta özel ses seviyesi ve konuşma aboneliği
  useEffect(() => {
    const key = isSelf ? 'local' : peerId;
    const unsub = audioStore.subscribe(key, (level, isSpeaking) => {
      setAudioState({ level, isSpeaking });
    });
    return unsub;
  }, [isSelf, peerId]);

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';
  const isReconnecting = connectionState === 'reconnecting';
  const isFailed = connectionState === 'failed';

  const isSpeaking = !isMuted && audioState.isSpeaking;
  const volumeLevel = isMuted ? 0 : audioState.level;

  const distance = stats?.distance;

  return (
    <div
      className={`rider-card ${isSelf ? 'rider-self' : ''} ${
        isSpeaking ? 'rider-speaking' : ''
      } ${isFailed ? 'rider-disconnected' : ''}`}
    >
      {/* Konuşurken Parlayan Dış Çerçeve */}
      {isSpeaking && <div className="speaking-glow-ring"></div>}

      <div className="rider-card-inner">
        {/* Sol Kısım: Kask / Sürücü Avatarı ve Canlı Durum Noktası */}
        <div className="rider-avatar-wrapper">
          <div className={`rider-avatar ${isSpeaking ? 'avatar-speaking' : ''}`}>
            <User size={26} />
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

        {/* Sağ / Orta Kısım: İsim, CANLI MESAFE ROZETİ, Mikrofon Durumu ve Ses Ekolayzeri */}
        <div className="rider-info-col">
          <div className="rider-name-row">
            <div className="rider-name-group">
              <span className="rider-name">{name}</span>
              {isSelf && <span className="self-badge">SEN</span>}

              {/* ⭐ EKRANDA ÇOK NET GÖRÜNEN CANLI GPS MESAFE ROZETİ ⭐ */}
              {!isSelf && (
                <span
                  className={`rider-distance-pill ${
                    distance > 75
                      ? 'dist-pill-danger'
                      : distance > 50
                      ? 'dist-pill-warning'
                      : 'dist-pill-normal'
                  }`}
                  title={
                    distance !== undefined && distance !== null
                      ? `Aramızdaki GPS mesafesi: ${distance} metre`
                      : 'GPS uydusu taranıyor...'
                  }
                >
                  📍 {distance !== undefined && distance !== null ? `${distance} m` : 'Mesafe Hesaplanıyor'}
                </span>
              )}

              {isSelf && (
                <span className="rider-distance-pill dist-pill-self">
                  🛰️ GPS Aktif
                </span>
              )}
            </div>

            {/* Mikrofon / Konuşma Durumu Rozeti */}
            <div className="rider-state-badge">
              {isMuted ? (
                <span className="badge-mute">
                  <MicOff size={12} />
                  <span>KAPALI</span>
                </span>
              ) : isSpeaking ? (
                <span className="badge-speaking">
                  <Activity size={12} />
                  <span>KONUŞUYOR</span>
                </span>
              ) : (
                <span className="badge-live">
                  <Mic size={12} />
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
                width: `${Math.max(isSpeaking ? 30 : 0, volumeLevel)}%`,
                background:
                  volumeLevel > 60
                    ? 'linear-gradient(90deg, #00e5ff 0%, #ff6b00 100%)'
                    : 'linear-gradient(90deg, #00e676 0%, #00e5ff 100%)',
              }}
            />
          </div>

          {/* Alt Bilgi: Ağ Tipi ve Ping */}
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

export default memo(ParticipantCard);
