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
  Maximize,
  Minimize,
  AlertTriangle,
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
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(false);

  const peerList = Object.entries(peers || {});
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = currentOrigin + '?room=' + roomCode;

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
      console.warn('[ActiveRoom] Tam ekran hatas?:', err.message);
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
      {/* Top HUD Bar */}
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
            title="Oda QR Kodunu G?ster"
          >
            <QrCode size={16} />
            <span className="hide-mobile">QR</span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            className={"hud-btn-action " + (isFullscreen ? "active-fullscreen" : "")}
            onClick={toggleFullscreen}
            title={isFullscreen ? "Tam Ekrandan ??k" : "Tam Ekran Yap"}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            <span className="hide-mobile">{isFullscreen ? "K???lt" : "Tam Ekran"}</span>
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
            className={"hud-wakelock-tag " + (isWakeLockActive ? "active" : "")}
            title={
              isWakeLockActive
                ? "Ekran kilidi a??k (Ekran kapanmayacak)"
                : "Ekran kilidi aktif de?il"
            }
          >
            {isWakeLockActive ? <Lock size={14} /> : <LockOpen size={14} />}
            <span className="hide-mobile">
              {isWakeLockActive ? "Ekran Uyan?k" : "Kilit Kapal?"}
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
              <strong>?nternetsiz Mod:</strong> Hotspot a?arak h?cresel ?ebeke olmadan kesintisiz konu?un.
            </span>
          </div>
          <button type="button" className="btn-banner-guide">
            Nas?l Yap?l?r?
          </button>
        </div>
      )}

      {/* Main Riders Grid */}
      <main className="cockpit-main-area">
        <div className="riders-grid-container">
          <div className="riders-header">
            <div className="riders-count">
              <Users size={16} className="text-neon" />
              <span>Gruptaki S?r?c?ler ({peerList.length + 1})</span>
            </div>
            <div className="riders-mesh-tag">
              <span>Tam Mesh WebRTC</span>
            </div>
          </div>

          <div className="riders-grid">
            {/* Self Rider Card */}
            <ParticipantCard
              name={selfName || "Sen"}
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
                  name={peer.name || "S?r?c?"}
                  isSelf={false}
                  isMuted={peer.isMuted}
                  isSpeaking={peerVol.isSpeaking}
                  volumeLevel={peerVol.level}
                  connectionState={peer.state || "connected"}
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
            className={"btn-glove-huge " + (isMuted ? "btn-mic-muted" : "btn-mic-active")}
            onClick={onToggleMute}
            aria-label={isMuted ? "Mikrofonu A?" : "Mikrofonu Kapat"}
          >
            {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
            <span className="control-label">{isMuted ? "M?KROFON KAPALI" : "M?KROFON A?IK"}</span>
          </button>

          {/* Motorcycle Horn / Alert Chime Button */}
          <button
            type="button"
            className={"btn-glove-action btn-horn " + (hornCooldown ? "cooldown" : "")}
            onClick={handleHornClick}
            disabled={hornCooldown}
            title="T?m gruba kask ikaz tonu g?nder"
          >
            <Bell size={24} />
            <span className="control-label">?KAZ B?P</span>
          </button>

          {/* Hotspot Guide Button */}
          <button
            type="button"
            className="btn-glove-action btn-hotspot"
            onClick={() => setIsGuideOpen(true)}
            title="?nternetsiz Hotspot Rehberi"
          >
            <Radio size={24} />
            <span className="control-label">HOTSPOT</span>
          </button>

          {/* Leave Room Button (Safety confirmation modal) */}
          <button
            type="button"
            className="btn-glove-action btn-leave"
            onClick={() => setIsLeaveConfirmOpen(true)}
            title="?nterkomdan Ayr?l"
          >
            <PhoneOff size={24} />
            <span className="control-label">AYRIL</span>
          </button>
        </div>
      </footer>

      {/* Hotspot Transition Modal */}
      <HotspotGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Leave Room Safety Confirmation Modal */}
      {isLeaveConfirmOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsLeaveConfirmOpen(false); }}>
          <div className="modal-content confirm-leave-modal">
            <div className="modal-header">
              <div className="modal-title text-crimson">
                <AlertTriangle size={20} />
                <span>?nterkomdan Ayr?l</span>
              </div>
              <button type="button" className="btn-close" onClick={() => setIsLeaveConfirmOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-scrollable-body p-4" style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.95rem", color: "#f8fafc", lineHeight: "1.4", marginBottom: "16px" }}>
                Telsiz odas?ndan ayr?lmak istedi?inize emin misiniz? Ses ba?lant?n?z sonland?r?lacakt?r.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "14px", borderRadius: "12px", background: "rgba(255,255,255,0.08)", color: "#ffffff", fontWeight: "700" }}
                  onClick={() => setIsLeaveConfirmOpen(false)}
                >
                  Vazge?
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: "14px", borderRadius: "12px", background: "linear-gradient(135deg, #ff1744 0%, #b70928 100%)", color: "#ffffff", fontWeight: "800" }}
                  onClick={() => {
                    setIsLeaveConfirmOpen(false);
                    onLeaveRoom();
                  }}
                >
                  Evet, Ayr?l
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-Room QR Code Share Modal */}
      {isQrModalOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsQrModalOpen(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <div className="modal-title">
                <QrCode size={20} className="icon-neon" />
                <span>Odaya Kat?l?m QR Kodu</span>
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
