import React, { useState, useEffect, useRef } from 'react';
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
  Zap,
  ArrowLeft,
  Moon,
  ShieldCheck,
  Activity,
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

  // ⭐ YENİ: OLED Eko Karartma ve Yanlışlıkla Basma Koruması ⭐
  const [isBlackoutMode, setIsBlackoutMode] = useState(false);
  const [isTouchLocked, setIsTouchLocked] = useState(false);
  const [lockHoldProgress, setLockHoldProgress] = useState(0);

  const lockTimerRef = useRef(null);
  const lastBlackoutTapRef = useRef(0);

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

  const triggerHaptic = (pattern = [30]) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  };

  const handleMuteClick = () => {
    if (isTouchLocked) return;
    triggerHaptic([40]);
    onToggleMute();
  };

  const handleHornClick = () => {
    if (isTouchLocked || hornCooldown) return;
    triggerHaptic([50, 50, 100]);
    onSendHorn();
    setHornCooldown(true);
    setTimeout(() => setHornCooldown(false), 2000);
  };

  // Eko Mod (OLED Karartma) çift tıklama ile uyanır
  const handleBlackoutScreenTap = () => {
    const now = Date.now();
    if (now - lastBlackoutTapRef.current < 400) {
      // Çift dokunuldu -> Uyandır
      triggerHaptic([30, 30]);
      setIsBlackoutMode(false);
    }
    lastBlackoutTapRef.current = now;
  };

  // Gidon Kilidini Basılı Tutup Açma (1.2 saniye)
  const handleUnlockTouchStart = () => {
    setLockHoldProgress(0);
    const startTime = Date.now();
    const duration = 1200;

    lockTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);
      setLockHoldProgress(progress);

      if (elapsed >= duration) {
        clearInterval(lockTimerRef.current);
        triggerHaptic([60, 60]);
        setIsTouchLocked(false);
        setLockHoldProgress(0);
      }
    }, 40);
  };

  const handleUnlockTouchEnd = () => {
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    setLockHoldProgress(0);
  };

  return (
    <div className={`active-cockpit ${isBlackoutMode ? 'blackout-active' : ''}`}>
      {/* =========================================================
          ⭐ 1. OLED EKO PİL TASARRUFU EKRANI (TAM SİYAH #000000) ⭐
          ========================================================= */}
      {isBlackoutMode && (
        <div className="oled-blackout-overlay" onClick={handleBlackoutScreenTap}>
          <div className="blackout-telemetry">
            <div className="blackout-clock">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>

            <div className="blackout-status-badge">
              <span className={`blackout-pulse-dot ${localIsSpeaking ? 'speaking' : ''}`}></span>
              <span>{peerList.length + 1} Sürücü Bağlı (Telsiz Aktif)</span>
            </div>

            {localIsSpeaking && (
              <div className="blackout-speaking-tag">
                <Activity size={16} className="animate-pulse text-emerald" />
                <span>Sesiniz İletiliyor</span>
              </div>
            )}

            <div className="blackout-hint">
              <span>⚡ Ekranı uyandırmak için <strong>ÇİFT DOKUNUN</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Üst HUD Çubuğu */}
      <header className="cockpit-hud-bar">
        <div className="hud-left">
          <div className="hud-room-code" title="Aktif Telsiz Odası">
            <Radio size={16} className="text-neon animate-pulse" />
            <span className="hud-code-value">{roomCode}</span>
          </div>

          <button
            type="button"
            className={`hud-btn-action ${isFullscreen ? 'active-fullscreen' : ''}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran Modu'}
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
          {/* Eko Karartma Butonu */}
          <button
            type="button"
            className="hud-btn-action btn-eco-dim"
            onClick={() => {
              triggerHaptic([30]);
              setIsBlackoutMode(true);
            }}
            title="Ekranı Karart (Maksimum Pil Tasarrufu)"
          >
            <Moon size={15} className="text-neon" />
            <span className="hide-mobile">Eko</span>
          </button>

          {/* Gidon Kilidi Butonu */}
          <button
            type="button"
            className={`hud-btn-action ${isTouchLocked ? 'btn-lock-active' : ''}`}
            onClick={() => {
              triggerHaptic([40]);
              setIsTouchLocked(!isTouchLocked);
            }}
            title={isTouchLocked ? 'Dokunma Kilidini Aç' : 'Gidon Dokunma Kilidini Aç'}
          >
            {isTouchLocked ? <Lock size={15} className="text-crimson" /> : <LockOpen size={15} />}
            <span className="hide-mobile">{isTouchLocked ? 'Kilitli' : 'Kilit'}</span>
          </button>
        </div>
      </header>

      {/* Toast Bildirim Çubuğu */}
      {toastMessage && (
        <div className="cockpit-toast animate-slide-down">
          <Volume2 size={16} className="text-neon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =========================================================
          ⭐ 2. GİDON DOKUNMA KORUMASI KİLİDİ (TOUCH SHIELD) ⭐
          ========================================================= */}
      {isTouchLocked && (
        <div className="touch-lock-shield-banner">
          <div className="touch-lock-info">
            <ShieldCheck size={18} className="text-neon" />
            <span>
              <strong>Gidon Kilidi Aktif:</strong> Yanlışlıkla basma engellendi.
            </span>
          </div>

          <button
            type="button"
            className="btn-hold-unlock"
            onTouchStart={handleUnlockTouchStart}
            onTouchEnd={handleUnlockTouchEnd}
            onMouseDown={handleUnlockTouchStart}
            onMouseUp={handleUnlockTouchEnd}
            onMouseLeave={handleUnlockTouchEnd}
          >
            <div
              className="hold-progress-fill"
              style={{ width: `${lockHoldProgress}%` }}
            ></div>
            <span className="hold-text">
              {lockHoldProgress > 0 ? 'Açılıyor...' : 'Basılı Tut (Aç)'}
            </span>
          </button>
        </div>
      )}

      {/* Sürücüler Tablosu & Canlı Ses Paneli */}
      <main className="cockpit-main-area">
        <div className="riders-grid-container">
          <div className="riders-header">
            <div className="riders-count">
              <Users size={16} className="text-neon" />
              <span>Gruptaki Sürücüler ({peerList.length + 1})</span>
            </div>
            <div className="riders-mesh-tag">
              <Zap size={12} className="text-emerald" />
              <span>P2P Direct Audio</span>
            </div>
          </div>

          <div className="riders-grid">
            {/* Kendi Sürücü Kartımız */}
            <ParticipantCard
              name={selfName || 'Sen'}
              isSelf={true}
              isMuted={isMuted}
              isSpeaking={localIsSpeaking}
              volumeLevel={localVolume}
              connectionState="connected"
              stats={{ isLocal: true, rtt: stats?.avgRtt || 10 }}
            />

            {/* Diğer Sürücü Kartları */}
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

      {/* Eldivenle Kullanıma Özel Dev Alt Kontrol Paneli */}
      <footer className="cockpit-controls-dock">
        <div className="controls-grid" style={{ gridTemplateColumns: '1.5fr 1fr 1fr' }}>
          {/* 1. MİKROFON AÇ / KAPAT */}
          <button
            type="button"
            className={`btn-glove-huge ${isMuted ? 'btn-mic-muted' : 'btn-mic-active'} ${
              isTouchLocked ? 'btn-locked-opacity' : ''
            }`}
            onClick={handleMuteClick}
            disabled={isTouchLocked}
            aria-label={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
          >
            {isMuted ? <MicOff size={34} /> : <Mic size={34} className="animate-pulse" />}
            <div className="glove-btn-text">
              <span className="control-label-title">
                {isMuted ? 'MİKROFON KAPALI' : 'MİKROFON AÇIK'}
              </span>
              <span className="control-label-sub">
                {isTouchLocked ? 'Kilitli' : isMuted ? 'Dokun Aç' : 'Canlı İletim'}
              </span>
            </div>
          </button>

          {/* 2. KASK İKAZ TONU BUTONU */}
          <button
            type="button"
            className={`btn-glove-action btn-horn ${hornCooldown ? 'cooldown' : ''} ${
              isTouchLocked ? 'btn-locked-opacity' : ''
            }`}
            onClick={handleHornClick}
            disabled={isTouchLocked || hornCooldown}
            title="Tüm gruba kask ikaz tonu gönder"
          >
            <Bell size={26} />
            <div className="glove-btn-text">
              <span className="control-label-title">İKAZ BİP</span>
              <span className="control-label-sub">{hornCooldown ? 'Bekleyin' : 'Uyar'}</span>
            </div>
          </button>

          {/* 3. ODADAN AYRIL BUTONU */}
          <button
            type="button"
            className={`btn-glove-action btn-leave ${isTouchLocked ? 'btn-locked-opacity' : ''}`}
            onClick={() => {
              if (isTouchLocked) return;
              triggerHaptic([30]);
              setIsLeaveConfirmOpen(true);
            }}
            disabled={isTouchLocked}
            title="Telsizden Ayrıl"
          >
            <PhoneOff size={26} />
            <div className="glove-btn-text">
              <span className="control-label-title">AYRIL</span>
              <span className="control-label-sub">Çıkış Yap</span>
            </div>
          </button>
        </div>
      </footer>

      {/* Bilgi Modalı */}
      <HotspotGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* ⭐ ULTRA-ŞIK MOTORCU ÇIKIŞ ONAY MODALI ⭐ */}
      {isLeaveConfirmOpen && (
        <div
          className="modal-overlay modal-leave-backdrop animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsLeaveConfirmOpen(false);
          }}
        >
          <div className="modal-leave-cyber-card animate-scale-up">
            <button
              type="button"
              className="leave-modal-close-btn"
              onClick={() => setIsLeaveConfirmOpen(false)}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>

            <div className="leave-icon-hero-wrap">
              <div className="leave-icon-outer-ring animate-pulse-slow"></div>
              <div className="leave-icon-inner">
                <PhoneOff size={32} className="text-crimson" />
              </div>
            </div>

            <div className="leave-modal-text-group">
              <h3 className="leave-modal-title">TELSİZDEN AYRIL</h3>
              <p className="leave-modal-desc">
                Telsiz odasından ayrılmak istediğinize emin misiniz?
              </p>
              <div className="leave-modal-sub-badge">
                <AlertTriangle size={14} className="text-crimson" />
                <span>Ses bağlantınız anında sonlandırılır.</span>
              </div>
            </div>

            <div className="leave-modal-actions-grid">
              <button
                type="button"
                className="btn-leave-cancel"
                onClick={() => {
                  triggerHaptic([20]);
                  setIsLeaveConfirmOpen(false);
                }}
              >
                <ArrowLeft size={20} />
                <span>Sürüşe Devam</span>
              </button>

              <button
                type="button"
                className="btn-leave-confirm"
                onClick={() => {
                  triggerHaptic([50, 50]);
                  setIsLeaveConfirmOpen(false);
                  onLeaveRoom();
                }}
              >
                <PhoneOff size={20} />
                <span>Evet, Ayrıl</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
