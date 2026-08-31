import React, { useState, useEffect, useRef, memo } from 'react';
import ParticipantCard from './ParticipantCard.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import {
  Mic,
  MicOff,
  Bell,
  Radio,
  PhoneOff,
  Settings,
  X,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  Activity,
  ChevronUp,
  Lock,
  LockOpen,
  Sliders,
  Users,
  Zap,
  Moon,
} from 'lucide-react';
import { audioStore } from '../lib/audioStateStore.js';
import { keepScreenAwake, releaseScreenAwake } from '../lib/wakeLock.js';

function ActiveRoom({
  roomCode = 'MOTO-RIDE',
  selfName = 'Sen',
  peers = {},
  isMuted = false,
  onToggleMute,
  onSendHorn,
  onLeaveRoom,
  onIntercomVolumeChange,
  onAudioInputDeviceChange,
  onAudioOutputDeviceChange,
  stats,
  isWakeLockActive,
  toastMessage,
}) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hornCooldown, setHornCooldown] = useState(false);

  // ⭐ OLED Eko Karartma ve Yanlışlıkla Basma Koruması ⭐
  const [isBlackoutMode, setIsBlackoutMode] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  const [isTouchLocked, setIsTouchLocked] = useState(false);
  const [lockHoldProgress, setLockHoldProgress] = useState(0);
  const [selfIsSpeaking, setSelfIsSpeaking] = useState(false);
  const [swipeDistance, setSwipeDistance] = useState(0);

  const lockTimerRef = useRef(null);
  const touchStartYRef = useRef(null);
  const touchStartTimeRef = useRef(0);
  const isDraggingRef = useRef(false);
  const peekTimerRef = useRef(null);

  const peerList = Object.entries(peers || {});

  // Eko modda konuşma durumunu dinle
  useEffect(() => {
    const unsub = audioStore.subscribe('local', (_, isSpeaking) => {
      setSelfIsSpeaking(isSpeaking);
    });
    return unsub;
  }, []);

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

  const toggleWakeLock = async () => {
    triggerHaptic([20]);
    if (isWakeLockActive) {
      await releaseScreenAwake();
    } else {
      await keepScreenAwake();
    }
  };

  const toggleTouchLock = () => {
    triggerHaptic([40]);
    setIsTouchLocked(!isTouchLocked);
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

  // ⭐ YUKARI KAYDIRARAK UYANDIRMA + TEK DOKUNUŞLA CANLANMA (PEEK) ⭐
  const handleTouchStart = (e) => {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    touchStartYRef.current = clientY;
    touchStartTimeRef.current = Date.now();
    isDraggingRef.current = true;
    setSwipeDistance(0);
  };

  const handleTouchMove = (e) => {
    if (!isDraggingRef.current || touchStartYRef.current === null) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = touchStartYRef.current - clientY;
    if (deltaY > 0) {
      setSwipeDistance(Math.min(100, deltaY));
    } else {
      setSwipeDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const duration = Date.now() - touchStartTimeRef.current;
    if (swipeDistance < 20 && duration < 300) {
      setIsPeeking(true);
      triggerHaptic([20]);
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current);
      peekTimerRef.current = setTimeout(() => setIsPeeking(false), 3800);
    }

    if (swipeDistance > 55) {
      triggerHaptic([40, 40]);
      setIsBlackoutMode(false);
      setIsPeeking(false);
    }
    setSwipeDistance(0);
    touchStartYRef.current = null;
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
    <div className={`screen active-screen ${isBlackoutMode ? 'blackout-active' : ''}`}>
      {/* =========================================================
          ⭐ 1. OLED EKO PİL TASARRUFU EKRANI (TAM SİYAH #000000) ⭐
          ========================================================= */}
      {isBlackoutMode && (
        <div
          className={`oled-blackout-overlay ${isPeeking ? 'blackout-peeking' : ''}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
        >
          <div className="blackout-telemetry">
            <div className="blackout-clock">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>

            <div className="blackout-status-badge">
              <span className={`blackout-pulse-dot ${selfIsSpeaking ? 'speaking' : ''}`}></span>
              <span>{peerList.length + 1} Sürücü Bağlı (Telsiz Aktif)</span>
            </div>

            {selfIsSpeaking && (
              <div className="blackout-speaking-tag">
                <Activity size={16} className="text-emerald" />
                <span>Sesiniz İletiliyor</span>
              </div>
            )}
          </div>

          <div
            className="blackout-swipe-dock"
            style={{
              transform: `translateY(-${swipeDistance}px)`,
              opacity: isPeeking ? 1 : Math.max(0.6, 0.6 + (swipeDistance / 100) * 0.4),
            }}
          >
            <div className="swipe-arrow-wrap">
              <ChevronUp size={28} />
            </div>
            <span className="swipe-dock-label">
              {swipeDistance > 50
                ? 'Bırakın ve Uyandırın'
                : 'Uyandırmak İçin Yukarı Kaydırın'}
            </span>
            <div className="swipe-dock-bar"></div>
          </div>
        </div>
      )}

      {/* =========================================================
          ⭐ 2. ÜST BAR: ODA DURUMU + AYARLAR BUTONU ⭐
          ========================================================= */}
      <div className="main-top">
        <div className="group-id">
          <div className="dot" />
          <div>
            <div className="name">RideTalk</div>
            <div className="status">
              {peerList.length === 0
                ? 'Telsiz Aktif · P2P'
                : `Bağlı · ${peerList.length + 1} Sürücü`}
            </div>
          </div>
        </div>

        <div className="top-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              triggerHaptic([20]);
              setIsSettingsOpen(true);
            }}
            aria-label="Ayarlar"
            title="Hızlı Ayarlar"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Toast Bildirim Çubuğu */}
      {toastMessage && (
        <div className="cockpit-toast animate-slide-down">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Gidon Dokunma Kilidi Bannerı */}
      {isTouchLocked && (
        <div className="touch-lock-shield-banner animate-slide-down">
          <div className="touch-lock-info">
            <ShieldCheck size={16} className="text-neon" />
            <span>Gidon Kilidi Aktif</span>
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
            />
            <span className="hold-text">
              {lockHoldProgress > 0 ? 'Açılıyor...' : 'Basılı Tut (Aç)'}
            </span>
          </button>
        </div>
      )}

      {/* =========================================================
          ⭐ 3. ORTA ALAN: SÜRÜCÜ KARTLARI (SOLDAN SAĞA GENİŞ KARTLAR) ⭐
          ========================================================= */}
      <div className="riders-section-wrap">
        <div className="riders-section-header">
          <div className="riders-count-badge">
            <Users size={14} className="text-neon" />
            <span>Sürücüler ({peerList.length + 1})</span>
          </div>
          <div className="riders-mesh-tag">
            <Zap size={12} className="text-emerald" />
            <span>P2P Direct</span>
          </div>
        </div>

        <div className="riders-list-container">
          {/* Kendimiz */}
          <ParticipantCard
            peerId="local"
            name={selfName || 'Sen'}
            isSelf={true}
            isMuted={isMuted}
            connectionState="connected"
            stats={{ isLocal: true, rtt: stats?.avgRtt || 10 }}
          />

          {/* Diğer Sürücüler */}
          {peerList.map(([peerId, peer]) => (
            <ParticipantCard
              key={peerId}
              peerId={peerId}
              name={peer.name || 'Sürücü'}
              isSelf={false}
              isMuted={peer.isMuted}
              connectionState={peer.state || 'connected'}
              stats={peer.stats || { isLocal: true, rtt: 12 }}
            />
          ))}

          {/* Tek Başına İse: Radar Bekleme Kartı */}
          {peerList.length === 0 && (
            <div className="radar-waiting-card animate-fade-in">
              <div className="radar-scanner-circle">
                <div className="radar-sweep"></div>
                <div className="radar-center-dot"></div>
                <Radio size={22} className="radar-icon text-neon" />
              </div>
              <div className="radar-text-group">
                <h4>DİĞER SÜRÜCÜLER BEKLENİYOR</h4>
                <p>
                  Aynı Hotspot Wi-Fi ağına bağlanan diğer motorcular anında buraya eklenecektir.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="spacer"></div>

      {/* =========================================================
          ⭐ 4. ALT DOCK (5 BUTONLU DÜZEN):
          [1. GİDON KİLİDİ] [2. İKAZ BİP] [3. DEV MİKROFON] [4. AYRIL] [5. UYANIK TUT]
          ========================================================= */}
      <div className="control-row-biker">
        {/* 1. GİDON KİLİDİ (İkaz bip'in solunda, küçük yuvarlak) */}
        <div className="side-dock-col">
          <button
            type="button"
            className={`side-btn-mini ${isTouchLocked ? 'active-locked' : ''}`}
            onClick={toggleTouchLock}
            title={isTouchLocked ? 'Dokunma Kilidini Aç' : 'Gidon Dokunma Kilidi (Yanlış basmayı önler)'}
          >
            {isTouchLocked ? <Lock size={16} className="text-crimson" /> : <LockOpen size={16} />}
          </button>
          <div className="side-label-mini">Kilit</div>
        </div>

        {/* 2. İKAZ BİP (Yuvarlak Aksiyon) */}
        <div className="side-dock-col">
          <button
            type="button"
            className={`side-btn warn ${hornCooldown ? 'cooldown' : ''} ${
              isTouchLocked ? 'locked' : ''
            }`}
            onClick={handleHornClick}
            disabled={isTouchLocked || hornCooldown}
            title="Korna / İkaz Bip Gönder"
          >
            <Bell size={20} />
          </button>
          <div className="side-label">İkaz Bip</div>
        </div>

        {/* 3. DEV MİKROFON BUTONU (MERKEZ / 92px) */}
        <div className="mic-col">
          <button
            type="button"
            className={`mic-btn ${isMuted ? 'muted' : 'live'} ${
              isTouchLocked ? 'locked' : ''
            }`}
            onClick={handleMuteClick}
            disabled={isTouchLocked}
            aria-label={isMuted ? 'Mikrofonu Aç' : 'Mikrofonu Kapat'}
          >
            {isMuted ? <MicOff size={34} /> : <Mic size={34} />}
          </button>
          <div className={`mic-label ${isMuted ? 'muted' : 'live'}`}>
            {isMuted ? 'SESSİZ' : 'CANLI'}
          </div>
        </div>

        {/* 4. ODADAN AYRIL BUTONU */}
        <div className="side-dock-col">
          <button
            type="button"
            className={`side-btn danger ${isTouchLocked ? 'locked' : ''}`}
            onClick={() => {
              if (isTouchLocked) return;
              triggerHaptic([30]);
              setIsLeaveConfirmOpen(true);
            }}
            disabled={isTouchLocked}
            title="Telsizden Ayrıl"
          >
            <PhoneOff size={20} />
          </button>
          <div className="side-label">Ayrıl</div>
        </div>

        {/* 5. OLED MODU (Ayrıl'ın sağında, küçük yuvarlak) */}
        <div className="side-dock-col">
          <button
            type="button"
            className={`side-btn-mini btn-oled-mini ${isBlackoutMode ? 'active-oled' : ''}`}
            onClick={() => {
              triggerHaptic([30]);
              setIsBlackoutMode(true);
            }}
            title="OLED Modu (Ekranı tamamen karartarak pil tasarrufu sağlar)"
          >
            <Moon size={16} className="text-neon" />
          </button>
          <div className="side-label-mini">OLED</div>
        </div>
      </div>

      {/* Hızlı Ayarlar Sheet (Çekmece) */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isBlackoutMode={isBlackoutMode}
        onToggleBlackout={() => setIsBlackoutMode(!isBlackoutMode)}
        isTouchLocked={isTouchLocked}
        onToggleTouchLock={toggleTouchLock}
        isWakeLockActive={isWakeLockActive}
        onToggleWakeLock={toggleWakeLock}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onIntercomVolumeChange={onIntercomVolumeChange}
        onAudioInputDeviceChange={onAudioInputDeviceChange}
        onAudioOutputDeviceChange={onAudioOutputDeviceChange}
      />

      {/* Çıkış Onay Modalı */}
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
              <div className="leave-icon-outer-ring"></div>
              <div className="leave-icon-inner">
                <PhoneOff size={30} className="text-crimson" />
              </div>
            </div>

            <div className="leave-modal-text-group">
              <h3 className="leave-modal-title">TELSİZDEN AYRIL</h3>
              <p className="leave-modal-desc">
                Telsiz odasından ayrılmak istediğinize emin misiniz?
              </p>
              <div className="leave-modal-sub-badge">
                <AlertTriangle size={13} className="text-crimson" />
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
                <ArrowLeft size={18} />
                <span>Devam Et</span>
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
                <PhoneOff size={18} />
                <span>Evet, Ayrıl</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ActiveRoom);
