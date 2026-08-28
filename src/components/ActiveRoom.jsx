import React, { useState, useEffect } from 'react';
import ParticipantCard from './ParticipantCard.jsx';
import ConnectionQualityBadge from './ConnectionQualityBadge.jsx';
import HotspotGuideModal from './HotspotGuideModal.jsx';
import {
  Mic,
  MicOff,
  Bell,
  Radio,
  PhoneOff,
  Lock,
  LockOpen,
  Volume2,
  Users,
  X,
  Maximize,
  Minimize,
  AlertTriangle,
  Wifi,
} from 'lucide-react';

export default function ActiveRoom({
  roomCode,
  selfName,
  peers,
  localVolume,
  localIsSpeaking,
  peerVolumes,
  isMuted,
  onToggleMute,
  onSendHorn,
  onLeaveRoom,
  stats,
  isWakeLockActive,
  isOnline,
  toastMessage,
}) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(false);

  const peerList = Object.entries(peers || {});

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('[ActiveRoom] Tam ekran hatası:', err.message);
    }
  };

  const handleHornClick = () => {
    if (hornCooldown) return;
    onSendHorn();
    setHornCooldown(true);
    setTimeout(() => setHornCooldown(false), 2000);
  };

  return (
    <div className="active-cockpit">
      {/* Üst HUD Çubuğu */}
      <header className="cockpit-hud-bar">
        <div className="hud-left">
          <div className="hud-room-code" title="Oda Kodu">
            <Radio size={15} className="text-neon" />
            <span className="hud-code-value">{roomCode}</span>
          </div>

          {/* Tam Ekran Butonu */}
          <button
            type="button"
            className={`hud-btn-action ${isFullscreen ? 'active-fullscreen' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Yap'}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span className="hide-mobile">{isFullscreen ? 'Küçült' : 'Tam Ekran'}</span>
          </button>
        </div>

        <div className="hud-center">
          <ConnectionQualityBadge
            isHotspotMode={stats?.isHotspotMode}
            avgRtt={stats?.avgRtt}
            activePeersCount={peerList.length}
            isOnline={isOnline}
          />
        </div>

        <div className="hud-right">
          <div
            className={`hud-wakelock-tag ${isWakeLockActive ? 'active' : ''}`}
            title={
              isWakeLockActive
                ? 'Ekran kilidi açık (Ekran kapanmayacak)'
                : 'Ekran kilidi aktif değil'
            }
          >
            {isWakeLockActive ? <Lock size={14} /> : <LockOpen size={14} />}
            <span className="hide-mobile">
              {isWakeLockActive ? 'Ekran Uyanık' : 'Kilit Kapalı'}
            </span>
          </div>
        </div>
      </header>

      {/* Toast Bildirim Kutusu */}
      {toastMessage && (
        <div className="cockpit-toast animate-slide-down">
          <Volume2 size={16} className="text-neon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hotspot Durum Şeridi */}
      <div className="hotspot-banner-strip" style={{ cursor: 'default' }}>
        <div className="hotspot-banner-content">
          <Wifi size={16} className="text-neon animate-pulse" />
          <span>
            <strong>Yerel Ağ İnterkomu:</strong> Sürücüler aynı ağda otomatik eşleşir ve ses yerel Hotspot üzerinden akar.
          </span>
        </div>
      </div>

      {/* Sürücüler Tablosu */}
      <main className="cockpit-main-area">
        <div className="riders-grid-container">
          <div className="riders-header">
            <div className="riders-count">
              <Users size={16} className="text-neon" />
              <span>Gruptaki Sürücüler ({peerList.length + 1})</span>
            </div>
            <div className="riders-mesh-tag">
              <span>Tam Mesh WebRTC</span>
            </div>
          </div>

          <div className="riders-grid">
            {/* Kendi Kartımız */}
            <ParticipantCard
              name={selfName || 'Sen'}
              isSelf={true}
              isMuted={isMuted}
              isSpeaking={localIsSpeaking}
              volumeLevel={localVolume}
              connectionState="connected"
              stats={{ isLocal: true, rtt: stats?.avgRtt || 10 }}
            />

            {/* Diğer Sürücüler */}
            {peerList.map(([peerId, peer]) => {
              const peerVol = peerVolumes[peerId] || { level: 0, isSpeaking: false };
              return (
                <ParticipantCard
                  key={peerId}
                  name={peer.name || 'Sürücü'}
                  isSelf={false}
                  isMuted={peer.isMuted}
                  isSpeaking={peerVol.isSpeaking}
                  volumeLevel={peerVol.level}
                  connectionState={peer.state || 'connected'}
                  stats={peer.stats || { isLocal: true, rtt: 12 }}
                />
              );
            })}
          </div>
        </div>
      </main>

      {/* Eldivenle Kullanıma Uygun Alt Kontroller (3 Büyük Buton) */}
      <footer className="cockpit-controls-dock">
        <div className="controls-grid" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
          {/* Mikrofon Aç / Kapat Butonu */}
          <button
            type="button"
            className={`btn-glove-huge ${isMuted ? 'btn-mic-muted' : 'btn-mic-active'}`}
            onClick={onToggleMute}
            aria-label={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
          >
            {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
            <span className="control-label">{isMuted ? 'MİKROFON KAPALI' : 'MİKROFON AÇIK'}</span>
          </button>

          {/* İkaz Bip Butonu */}
          <button
            type="button"
            className={`btn-glove-action btn-horn ${hornCooldown ? 'cooldown' : ''}`}
            onClick={handleHornClick}
            disabled={hornCooldown}
            title="Tüm gruba kask ikaz tonu gönder"
          >
            <Bell size={24} />
            <span className="control-label">İKAZ BİP</span>
          </button>

          {/* Odadan Ayrıl Butonu */}
          <button
            type="button"
            className="btn-glove-action btn-leave"
            onClick={() => setIsLeaveConfirmOpen(false)}
            title="İnterkomdan Ayrıl"
          >
            <PhoneOff size={24} />
            <span className="control-label">AYRIL</span>
          </button>
        </div>
      </footer>

      {/* Hotspot Bilgi Modalı */}
      <HotspotGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Odadan Ayrılma Güvenlik Modalı */}
      {isLeaveConfirmOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsLeaveConfirmOpen(false); }}>
          <div className="modal-content confirm-leave-modal">
            <div className="modal-header">
              <div className="modal-title text-crimson">
                <AlertTriangle size={20} />
                <span>İnterkomdan Ayrıl</span>
              </div>
              <button type="button" className="btn-close" onClick={() => setIsLeaveConfirmOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-scrollable-body p-4" style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '0.95rem', color: '#f8fafc', lineHeight: '1.4', marginBottom: '16px' }}>
                Telsiz odasından ayrılmak istediğinize emin misiniz? Ses bağlantınız sonlandırılacaktır.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.08)', color: '#ffffff', fontWeight: '700' }}
                  onClick={() => setIsLeaveConfirmOpen(false)}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #ff1744 0%, #b70928 100%)', color: '#ffffff', fontWeight: '800' }}
                  onClick={() => {
                    setIsLeaveConfirmOpen(false);
                    onLeaveRoom();
                  }}
                >
                  Evet, Ayrıl
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
