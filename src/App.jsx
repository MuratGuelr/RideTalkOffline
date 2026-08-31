import React, { useState, useEffect, useRef, useCallback } from 'react';
import ActiveRoom from './components/ActiveRoom.jsx';
import { SignalingClient } from './lib/signaling.js';
import { FirebaseSignalingClient, isFirebaseConfigured } from './lib/firebaseSignaling.js';
import { MeshManager } from './lib/meshManager.js';
import {
  announceJoin,
  announceDisconnect,
  announceReconnect,
  playAlertTone,
  speakText,
  playMuteSound,
  playUnmuteSound,
  playSomeoneLeftSound,
  preloadAllSounds,
  getAudioContext,
} from './lib/announcer.js';
import { keepScreenAwake, releaseScreenAwake, onWakeLockStatusChange } from './lib/wakeLock.js';
import { watchNetworkChanges } from './lib/networkWatcher.js';
import {
  Radio,
  Wifi,
  Zap,
  User,
  X,
  Timer,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import './App.css';

const COOL_CALLSIGNS = [
  'Gece Kartalı',
  'Kara Şimşek',
  'Gölge Hayalet',
  'Fırtına',
  'Kızıl Ejder',
  'Kara Panter',
  'Asfalt Avcısı',
  'Son Samuray',
  'Vahşi Boğa',
  'Çöl Tilkisi',
  'Gök Kurdu',
  'Yol Kaptanı',
  'Gökdoğan',
  'Asil Pars',
  'Siyah İnci',
  'Turbo Roket',
  'Sessiz Gölge',
  'Demir Süvari',
  'Pulsar',
  'Rüzgar Savaşçısı',
  'Hayalet Sürücü',
  'Apex Kralı',
  'Gece Kuşu',
  'Kızıl Şahin',
];

function generateCoolBikerName() {
  const base = COOL_CALLSIGNS[Math.floor(Math.random() * COOL_CALLSIGNS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${base} ${num}`;
}

export default function App() {
  const [view, setView] = useState('home');
  const [roomData, setRoomData] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [driverName, setDriverName] = useState(() => {
    return localStorage.getItem('ridetalk_name') || generateCoolBikerName();
  });
  const [autoConnectOnLoad, setAutoConnectOnLoad] = useState(() => {
    return localStorage.getItem('ridetalk_autoconnect') === 'true';
  });

  // ⭐ Geri sayım (3.. 2.. 1..) ve İptal Mekanizması
  const [autoCountdown, setAutoCountdown] = useState(null);
  const isAutoCancelledRef = useRef(false);

  const [peers, setPeers] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [stats, setStats] = useState({ isHotspotMode: true, avgRtt: 12 });
  const [toastMessage, setToastMessage] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const signalingRef = useRef(null);
  const meshRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const unwatchNetworkRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const handleLeaveRoomDirect = useCallback(() => {
    isAutoCancelledRef.current = true;
    setAutoCountdown(null);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setView('home');
    setRoomData(null);
    setPeers({});
    showToast('İnterkomdan ayrıldınız');

    if (meshRef.current) {
      try {
        meshRef.current.destroy();
      } catch (_) {}
      meshRef.current = null;
    }
    if (signalingRef.current) {
      try {
        signalingRef.current.disconnect();
      } catch (_) {}
      signalingRef.current = null;
    }
    if (unwatchNetworkRef.current) {
      try {
        unwatchNetworkRef.current();
      } catch (_) {}
      unwatchNetworkRef.current = null;
    }
    releaseScreenAwake();
  }, [showToast]);

  // Geri tuşu koruması (Yanlışlıkla çıkışı engeller)
  useEffect(() => {
    if (view === 'active') {
      const beforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = '';
        return '';
      };
      window.addEventListener('beforeunload', beforeUnload);
      window.history.pushState({ ridetalk: 'active' }, '');
      const popState = () => {
        if (window.confirm('İnterkom odasından ayrılmak istiyor musunuz?')) handleLeaveRoomDirect();
        else window.history.pushState({ ridetalk: 'active' }, '');
      };
      window.addEventListener('popstate', popState);
      return () => {
        window.removeEventListener('beforeunload', beforeUnload);
        window.removeEventListener('popstate', popState);
      };
    }
  }, [view, handleLeaveRoomDirect]);

  useEffect(() => {
    onWakeLockStatusChange((a) => setIsWakeLockActive(a));
  }, []);

  const ensureAudioUnlocked = useCallback(() => {
    if (!audioUnlocked) {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      preloadAllSounds().catch(() => {});
      setAudioUnlocked(true);
    }
  }, [audioUnlocked]);

  const getSignalingClient = useCallback(() => {
    if (!signalingRef.current) {
      if (isFirebaseConfigured()) {
        signalingRef.current = new FirebaseSignalingClient();
      } else {
        signalingRef.current = new SignalingClient();
      }
    }
    return signalingRef.current;
  }, []);

  // =====================================================
  //  MESH VE SES YÖNETİCİSİ BAŞLAT (SIFIR RE-RENDER)
  // =====================================================
  const startMeshSession = useCallback(
    async (currentRoomData, signaling, existingPeers = []) => {
      await keepScreenAwake();

      const mesh = new MeshManager({
        myPeerId: currentRoomData?.peerId || '',
        sendSignal: (targetPeerId, data) => signaling.sendSignal(targetPeerId, data),
        onPeerStateChange: (peerId, info) => {
          setPeers((prev) => ({
            ...prev,
            [peerId]: {
              name: info.name,
              state: info.state,
              isMuted: info.isMuted,
              stats: {
                ...info.stats,
                distance: info.distance,
              },
            },
          }));
        },
        onPeerDisconnect: (peerId) => {
          playSomeoneLeftSound();
          announceDisconnect(peerId);
        },
        onPeerReconnect: (peerId) => {
          announceReconnect(peerId);
          showToast('Bağlantı yeniden kuruldu!');
        },
        onHornReceived: (_, name) => {
          playAlertTone('horn');
          showToast(`⚠️ ${name || 'Sürücü'} ikaz tonu gönderdi!`);
        },
        onDistanceWarning: (peerId, name, distance) => {
          playAlertTone('horn');
          speakText(`${name || 'Sürücü'} gruptan uzaklaştı, ${Math.round(distance)} metre. Bağlantı kopabilir.`);
          showToast(`⚠️ ${name || 'Sürücü'} uzaklaştı (${Math.round(distance)}m)`);
        },
        onStatsUpdate: (s) => setStats(s),
        onReconnectionFailed: () => {},
      });

      meshRef.current = mesh;
      await mesh.init();

      if (existingPeers.length > 0) {
        for (const p of existingPeers) {
          await mesh.connectToPeer(p.id, p.name);
        }
      }

      if (unwatchNetworkRef.current) unwatchNetworkRef.current();
      unwatchNetworkRef.current = watchNetworkChanges(() => {
        if (meshRef.current) {
          showToast('Ağ değişimi algılandı, ses kanalları güncelleniyor...');
          meshRef.current.restartIceForAllPeers();
        }
      });
    },
    [showToast]
  );

  // =====================================================
  //  ⭐ TEK TUŞLA OTOMATİK BAĞLAN (HERKES AYNI ODAYA)
  // =====================================================
  const handleAutoConnect = useCallback(
    async (customRoom = 'MOTO-RIDE') => {
      try {
        setAutoCountdown(null);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

        setError(null);
        setIsConnecting(true);
        ensureAudioUnlocked();

        const name = (driverName || 'Sürücü').trim();
        localStorage.setItem('ridetalk_name', name);

        const signaling = getSignalingClient();
        await signaling.connect();

        signaling.on('peer-joined', async (msg) => {
          announceJoin(msg.peerId, msg.name);
          showToast(`${msg.name} telsize bağlandı`);
          setPeers((prev) => ({
            ...prev,
            [msg.peerId]: { name: msg.name, state: 'connecting', isMuted: false, stats: null },
          }));
          if (meshRef.current) {
            await meshRef.current.connectToPeer(msg.peerId, msg.name);
          }
        });

        signaling.on('signal', async (msg) => {
          if (meshRef.current) {
            await meshRef.current.handleSignal(msg.fromPeerId, msg.data, msg.name);
          }
        });

        signaling.on('peer-left', (msg) => {
          playSomeoneLeftSound();
          announceDisconnect(msg.peerId);
          showToast(`${msg.name || 'Sürücü'} ayrıldı`);
          if (meshRef.current) meshRef.current.removePeer(msg.peerId);
          setPeers((prev) => {
            const next = { ...prev };
            delete next[msg.peerId];
            return next;
          });
        });

        signaling.on('joined', async (msg) => {
          const rd = { roomCode: msg.roomCode || customRoom, peerId: msg.peerId, name: msg.name };
          setRoomData(rd);

          const initialPeers = {};
          (msg.existingPeers || []).forEach((p) => {
            initialPeers[p.id] = { name: p.name, state: 'connecting', isMuted: false, stats: null };
          });
          setPeers(initialPeers);

          try {
            await startMeshSession(rd, signaling, msg.existingPeers || []);
            setIsConnecting(false);
            setView('active');
            speakText('Telsiz aktif. Konuşabilirsiniz.');
          } catch (e) {
            setError(e.message);
            setIsConnecting(false);
          }
        });

        await signaling.autoJoinGroup(customRoom, name);
      } catch (err) {
        console.error('[App] Otomatik bağlantı hatası:', err);
        setError(err.message || 'Bağlantı kurulamadı');
        setIsConnecting(false);
      }
    },
    [driverName, ensureAudioUnlocked, getSignalingClient, showToast, startMeshSession]
  );

  // ⭐ GERİ SAYIM (3.. 2.. 1..) İLE GÜVENLİ OTOMATİK BAĞLANMA ⭐
  useEffect(() => {
    if (
      autoConnectOnLoad &&
      view === 'home' &&
      !isConnecting &&
      !roomData &&
      !isAutoCancelledRef.current
    ) {
      let count = 3;
      setAutoCountdown(count);

      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

      countdownIntervalRef.current = setInterval(() => {
        count -= 1;
        if (count <= 0) {
          clearInterval(countdownIntervalRef.current);
          setAutoCountdown(null);
          handleAutoConnect('MOTO-RIDE');
        } else {
          setAutoCountdown(count);
        }
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      };
    }
  }, [autoConnectOnLoad, view, isConnecting, roomData, handleAutoConnect]);

  const cancelAutoCountdown = () => {
    isAutoCancelledRef.current = true;
    setAutoCountdown(null);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    showToast('Otomatik bağlanma iptal edildi');
  };

  const handleRandomizeName = () => {
    const newName = generateCoolBikerName();
    setDriverName(newName);
    localStorage.setItem('ridetalk_name', newName);
    showToast(`Çağrı adı: ${newName} 🏍️`);
  };

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (meshRef.current) meshRef.current.setMute(next);
      if (next) {
        playMuteSound();
      } else {
        playUnmuteSound();
      }
      showToast(next ? 'Mikrofon Kapatıldı' : 'Mikrofon Açık');
      return next;
    });
  }, [showToast]);

  const handleSendHorn = useCallback(() => {
    if (meshRef.current) {
      meshRef.current.sendHornAlert();
      playAlertTone('horn');
      showToast('İkaz tonu gönderildi ⚠️');
    }
  }, [showToast]);

  const handleIntercomVolumeChange = useCallback((vol) => {
    if (meshRef.current) {
      meshRef.current.setIncomingVolume(vol);
    }
  }, []);

  const handleAudioInputDeviceChange = useCallback(async (deviceId) => {
    if (meshRef.current) {
      await meshRef.current.changeAudioInputDevice(deviceId);
      showToast('Mikrofon değiştirildi 🎤');
    }
  }, [showToast]);

  const handleAudioOutputDeviceChange = useCallback(async (deviceId) => {
    if (meshRef.current) {
      await meshRef.current.setAudioOutputDevice(deviceId);
      showToast('Hoparlör/Kask değiştirildi 🎧');
    }
  }, [showToast]);

  return (
    <div className="app-container" onClick={ensureAudioUnlocked}>
      <div className="ambient-glow cyan-glow"></div>
      <div className="ambient-glow orange-glow"></div>

      {view === 'home' && (
        <div className="screen join-screen animate-fade-in">
          {/* LOGO & BAŞLIK */}
          <div className="join-top">
            <div className="logo-mark">
              <Radio size={26} strokeWidth={2.4} />
            </div>
            <div className="wordmark">RIDETALK</div>
            <div className="tagline">Grup motosiklet interkomu</div>
            <div className="feature-pill">
              <Zap size={13} strokeWidth={2.4} />
              <span>İnternet gerekmez</span>
            </div>
          </div>

          {/* KATILIM FORMU */}
          <div className="join-form">
            <div className="field">
              <div className="field-label">ÇAĞRI ADINIZ</div>
              <div className="field-row">
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => {
                    setDriverName(e.target.value);
                    localStorage.setItem('ridetalk_name', e.target.value);
                  }}
                  placeholder="Örn: Kara Şimşek, Gece Kartalı"
                  maxLength={22}
                />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleRandomizeName}
                >
                  🎲 Rastgele
                </button>
              </div>
            </div>

            {/* Otomatik Bağlan Switch */}
            <div className="toggle-row">
              <div className="toggle-text">
                <div className="t-label">Açılışta otomatik bağlan</div>
                <div className="t-desc">3 saniyelik geri sayımla</div>
              </div>
              <div
                className={`switch ${autoConnectOnLoad ? 'on' : ''}`}
                onClick={() => {
                  const next = !autoConnectOnLoad;
                  setAutoConnectOnLoad(next);
                  localStorage.setItem('ridetalk_autoconnect', next ? 'true' : 'false');
                  if (!next) {
                    cancelAutoCountdown();
                  } else {
                    isAutoCancelledRef.current = false;
                  }
                }}
              />
            </div>

            {/* Geri Sayım Şeridi */}
            {autoCountdown !== null && (
              <div className="biker-countdown-banner animate-scale-up">
                <div className="countdown-info">
                  <Timer size={18} className="text-cyan" />
                  <span>
                    Bağlanılıyor: <strong className="countdown-number">{autoCountdown}</strong> sn
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-countdown-cancel"
                  onClick={cancelAutoCountdown}
                >
                  <X size={13} />
                  <span>İptal</span>
                </button>
              </div>
            )}

            {/* Ana Buton: Telsize Bağlan */}
            <button
              type="button"
              className={`cta-btn ${isConnecting ? 'loading' : ''}`}
              onClick={() => handleAutoConnect('MOTO-RIDE')}
              disabled={isConnecting}
            >
              <Radio size={18} strokeWidth={2.3} />
              <span>{isConnecting ? 'Bağlanılıyor...' : 'Telsize Bağlan'}</span>
            </button>
            <div className="cta-sub">Tek dokunuşla gruba katıl</div>

            {/* İnternetsiz Nasıl Çalışır? Accordion */}
            <div className="disclosure">
              <div
                className={`disclosure-head ${isGuideOpen ? 'open' : ''}`}
                onClick={() => setIsGuideOpen(!isGuideOpen)}
              >
                <span>İnternetsiz nasıl çalışır?</span>
                <ChevronDown size={14} className="disclosure-arrow" />
              </div>
              <div className={`disclosure-body ${isGuideOpen ? 'open' : ''}`}>
                <div className="step">
                  <div className="step-num">1</div>
                  <div>
                    <b>Hotspot açın.</b> Grup lideri telefonunda Wi-Fi hotspot başlatır.
                  </div>
                </div>
                <div className="step">
                  <div className="step-num">2</div>
                  <div>
                    <b>Ağa katılın.</b> Diğer sürücüler bu ağa bağlanır.
                  </div>
                </div>
                <div className="step">
                  <div className="step-num">3</div>
                  <div>
                    <b>Konuşun.</b> Ses, internet olmadan telefonlar arasında akar.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* HATA BANNERI */}
          {error && (
            <div className="biker-error-banner animate-slide-down">
              <span>{error}</span>
            </div>
          )}

          {/* SÜRÜŞ İPUCU */}
          <div className="join-footer">
            Sürüş boyunca telefonunuzu görünür bir yerde tutun.
          </div>
        </div>
      )}

      {/* AKTİF SÜRÜŞ KOKPİTİ */}
      {view === 'active' && roomData && (
        <ActiveRoom
          roomCode={roomData.roomCode}
          selfName={roomData.name}
          peers={peers}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onSendHorn={handleSendHorn}
          onLeaveRoom={handleLeaveRoomDirect}
          onIntercomVolumeChange={handleIntercomVolumeChange}
          onAudioInputDeviceChange={handleAudioInputDeviceChange}
          onAudioOutputDeviceChange={handleAudioOutputDeviceChange}
          stats={stats}
          isWakeLockActive={isWakeLockActive}
          toastMessage={toastMessage}
        />
      )}
    </div>
  );
}
