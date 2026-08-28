import React, { useState, useEffect } from 'react';
import ParticipantCard from './ParticipantCard.jsx';
import ConnectionQualityBadge from './ConnectionQualityBadge.jsx';
import HotspotGuideModal from './HotspotGuideModal.jsx';
import OfflineQRHandshakeModal from './OfflineQRHandshakeModal.jsx';
import QRCodeDisplay from './QRCodeDisplay.jsx';
import {
  Mic,
  MicOff,
  Bell,
  Radio,
  PhoneOff,
  QrCode,
  Lock,
  LockOpen,
  Volume2,
  Users,
  X,
  Zap,
  Maximize,
  Minimize,
  AlertTriangle,
  WifiOff,
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
  meshManager,
  onOfflineHandshakeSuccess,
  showReconnectQRPrompt,
}) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isOfflineQRModalOpen, setIsOfflineQRModalOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(false);

  // Otomatik yeniden bağlantı başarısız olduğunda QR modalını aç
  useEffect(() => {
    if (showReconnectQRPrompt) {
      setIsOfflineQRModalOpen(true);
    }
  }, [showReconnectQRPrompt]);

  const peerList = Object.entries(peers || {});
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = `${currentOrigin}?room=${roomCode}`;

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
            <span className="hud-code-prefix">ODA</span>
            <span className="hud-code-value">{roomCode}</span>
          </div>

          <button
            type="button"
            className="hud-btn-action"
            onClick={() => setIsQrModalOpen(true)}
            title="Oda QR Kodunu Göster"
          >
            <QrCode size={16} />
            <span className="hide-mobile">QR</span>
          </button>

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

      {/* 0 İnternet Çevrimdışı Hotspot Şeridi */}
      <div className={`hotspot-banner-strip ${showReconnectQRPrompt ? 'reconnect-urgent' : ''}`} onClick={() => setIsOfflineQRModalOpen(true)}>
        <div className="hotspot-banner-content">
          <WifiOff size={16} className="text-orange animate-pulse" />
          <span>
            {showReconnectQRPrompt
              ? <><strong style={{ color: '#ff6b00' }}>⚠️ Bağlantı Koptu!</strong> QR ile yeniden eşleşin.</>
              : <><strong>0 İnternet Hotspot Modu:</strong> İnternet yoksa doğrudan QR ile eşleşip konuşun.</>}
          </span>
        </div>
        <button type="button" className={`btn-banner-guide ${showReconnectQRPrompt ? 'btn-urgent' : ''}`}>
          {showReconnectQRPrompt ? '🔄 Yeniden Eşleş' : 'Çevrimdışı Eşleş'}
        </button>
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

      {/* Eldivenle Kullanıma Uygun Alt Kontroller */}
      <footer className="cockpit-controls-dock">
        <div className="controls-grid">
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

          {/* 0 İnternet Çevrimdışı QR Eşleşme */}
          <button
            type="button"
            className="btn-glove-action btn-hotspot"
            onClick={() => setIsOfflineQRModalOpen(true)}
            title="0 İnternet Çevrimdışı QR Eşleşme"
          >
            <WifiOff size={24} />
            <span className="control-label">0 NET QR</span>
          </button>

          {/* Odadan Ayrıl Butonu */}
          <button
            type="button"
            className="btn-glove-action btn-leave"
            onClick={() => setIsLeaveConfirmOpen(true)}
            title="İnterkomdan Ayrıl"
          >
            <PhoneOff size={24} />
            <span className="control-label">AYRIL</span>
          </button>
        </div>
      </footer>

      {/* Hotspot Geçiş Modalı */}
      <HotspotGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* 0 İnternet Doğrudan QR Eşleşme Modalı */}
      <OfflineQRHandshakeModal
        isOpen={isOfflineQRModalOpen}
        onClose={() => setIsOfflineQRModalOpen(false)}
        meshManager={meshManager}
        selfName={selfName}
        onHandshakeSuccess={(partnerName) => {
          if (onOfflineHandshakeSuccess) onOfflineHandshakeSuccess(partnerName);
        }}
      />

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

      {/* QR Kod Paylaşım Modalı */}
      {isQrModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsQrModalOpen(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">
                <QrCode size={20} className="icon-neon" />
                <span>Odaya Katılım QR Kodu</span>
              </div>
              <button type="button" className="btn-close" onClick={() => setIsQrModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-scrollable-body p-4">
              <QRCodeDisplay roomCode={roomCode} joinUrl={joinUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
