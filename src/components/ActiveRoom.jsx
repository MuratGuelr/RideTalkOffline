import React, { useState, useEffect } from 'react';
import ParticipantCard from './ParticipantCard.jsx';
import ConnectionQualityBadge from './ConnectionQualityBadge.jsx';
import HotspotGuideModal from './HotspotGuideModal.jsx';
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
} from 'lucide-react';

export default function ActiveRoom({
  roomCode,
  selfName,
  peers, // Map or Object of peerId -> peerState
  localVolume,
  localIsSpeaking,
  peerVolumes, // Map of peerId -> { level, isSpeaking }
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
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(false);

  const peerList = Object.entries(peers || {});
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = `${currentOrigin}?room=${roomCode}`;

  const handleHornClick = () => {
    if (hornCooldown) return;
    onSendHorn();
    setHornCooldown(true);
    setTimeout(() => setHornCooldown(false), 2000);
  };

  return (
    <div className="active-cockpit">
      {/* Top HUD Bar */}
      <header className="cockpit-hud-bar">
        <div className="hud-left">
          <div className="hud-room-code" title="Oda Kodu">
            <span className="hud-code-prefix">ODA</span>
            <span className="hud-code-value">{roomCode}</span>
          </div>

          <button
            type="button"
            className="hud-btn-qr"
            onClick={() => setIsQrModalOpen(true)}
            title="Oda QR Kodunu Göster"
          >
            <QrCode size={16} />
            <span className="hide-mobile">QR</span>
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

      {/* Floating System Toast Alert */}
      {toastMessage && (
        <div className="cockpit-toast animate-slide-down">
          <Volume2 size={16} className="text-neon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hotspot Offline Mode Quick Action Banner */}
      {!stats?.isHotspotMode && (
        <div className="hotspot-banner-strip" onClick={() => setIsGuideOpen(true)}>
          <div className="hotspot-banner-content">
            <Zap size={16} className="text-neon animate-pulse" />
            <span>
              <strong>İnternetsiz Mod:</strong> Hotspot açarak hücresel şebeke olmadan kesintisiz konuşun.
            </span>
          </div>
          <button type="button" className="btn-banner-guide">
            Nasıl Yapılır?
          </button>
        </div>
      )}

      {/* Main Riders Grid */}
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
            {/* Self Rider Card */}
            <ParticipantCard
              name={selfName || 'Sen'}
              isSelf={true}
              isMuted={isMuted}
              isSpeaking={localIsSpeaking}
              volumeLevel={localVolume}
              connectionState="connected"
              stats={{ isLocal: stats?.isHotspotMode, rtt: stats?.avgRtt || 10 }}
            />

            {/* Remote Peers Cards */}
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
                  stats={peer.stats}
                />
              );
            })}
          </div>
        </div>
      </main>

      {/* Glove-Friendly Motorcycle Cockpit Bottom Controls */}
      <footer className="cockpit-controls-dock">
        <div className="controls-grid">
          {/* Main Giant Mic Toggle Button */}
          <button
            type="button"
            className={`btn-glove-huge ${isMuted ? 'btn-mic-muted' : 'btn-mic-active'}`}
            onClick={onToggleMute}
            aria-label={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
          >
            {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
            <span className="control-label">{isMuted ? 'MİKROFON KAPALI' : 'MİKROFON AÇIK'}</span>
          </button>

          {/* Motorcycle Horn / Alert Chime Button */}
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

          {/* Hotspot Guide Button */}
          <button
            type="button"
            className="btn-glove-action btn-hotspot"
            onClick={() => setIsGuideOpen(true)}
            title="İnternetsiz Hotspot Rehberi"
          >
            <Radio size={24} />
            <span className="control-label">HOTSPOT</span>
          </button>

          {/* Leave Room Button */}
          <button
            type="button"
            className="btn-glove-action btn-leave"
            onClick={onLeaveRoom}
            title="İnterkomdan Ayrıl"
          >
            <PhoneOff size={24} />
            <span className="control-label">AYRIL</span>
          </button>
        </div>
      </footer>

      {/* Hotspot Transition Modal */}
      <HotspotGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* In-Room QR Code Share Modal */}
      {isQrModalOpen && (
        <div className="modal-overlay">
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
            <div className="p-4">
              <QRCodeDisplay roomCode={roomCode} joinUrl={joinUrl} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
