import React, { useState, useEffect, useRef, useCallback } from 'react';
import RoomCreate from './components/RoomCreate.jsx';
import RoomJoin from './components/RoomJoin.jsx';
import ActiveRoom from './components/ActiveRoom.jsx';
import ServerSettingsModal from './components/ServerSettingsModal.jsx';
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
import { Radio, PlusCircle, LogIn, Shield, Wifi, Volume2, Settings, Zap, User } from 'lucide-react';
import './App.css';

export default function App() {
  const [view, setView] = useState('home');
  const [roomData, setRoomData] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [initialRoomCode, setInitialRoomCode] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);

  const [driverName, setDriverName] = useState(() => {
    return localStorage.getItem('ridetalk_name') || 'Sürücü ' + Math.floor(10 + Math.random() * 90);
  });
  const [autoConnectOnLoad, setAutoConnectOnLoad] = useState(() => {
    return localStorage.getItem('ridetalk_autoconnect') === 'true';
  });

  const [peers, setPeers] = useState({});
  const [localVolume, setLocalVolume] = useState(0);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [stats, setStats] = useState({ isHotspotMode: true, avgRtt: 12 });
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [toastMessage, setToastMessage] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const signalingRef = useRef(null);
  const meshRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const unwatchNetworkRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const handleLeaveRoomDirect = useCallback(() => {
    // 1. ANINDA Arayüzü Ana Sayfaya Döndür (0ms)
    setView('home');
    setRoomData(null);
    setPeers({});
    showToast('İnterkomdan ayrıldınız');

    // 2. Ses ve Donanım Kaynaklarını Kapat
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

  // Geri tuşu koruması
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

  // URL'den oda kodu varsa al
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('room');
    if (code) {
      setInitialRoomCode(code.toUpperCase());
      setView('join');
    }
  }, []);

  useEffect(() => {
    onWakeLockStatusChange((a) => setIsWakeLockActive(a));
  }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const ensureAudioUnlocked = () => {
    if (!audioUnlocked) {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      preloadAllSounds().catch(() => {});
      setAudioUnlocked(true);
    }
  };

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
  //  MESH VE SES YÖNETİCİSİ BAŞLAT
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
            [peerId]: { name: info.name, state: info.state, isMuted: info.isMuted, stats: info.stats },
          }));
        },
        onPeerVolumeChange: (peerId, level, isSpeaking) => {
          setPeerVolumes((prev) => ({ ...prev, [peerId]: { level, isSpeaking } }));
        },
        onLocalVolumeChange: (level, isSpeaking) => {
          setLocalVolume(level);
          setLocalIsSpeaking(isSpeaking);
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
        onStatsUpdate: (s) => setStats(s),
        onReconnectionFailed: () => {},
      });

      meshRef.current = mesh;
      await mesh.init();

      // Odadaki mevcut kişilere teklif gönder
      if (existingPeers.length > 0) {
        for (const p of existingPeers) {
          await mesh.connectToPeer(p.id, p.name);
        }
      }

      // Ağ değişim izleyicisini başlat
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
        setError(null);
        setIsConnecting(true);
        ensureAudioUnlocked();

        const name = (driverName || 'Sürücü').trim();
        localStorage.setItem('ridetalk_name', name);

        const signaling = getSignalingClient();
        await signaling.connect();

        // Sinyal olaylarını dinle
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

        // Firebase grubuna otomatik katıl
        await signaling.autoJoinGroup(customRoom, name);
      } catch (err) {
        console.error('[App] Otomatik bağlantı hatası:', err);
        setError(err.message || 'Bağlantı kurulamadı');
        setIsConnecting(false);
      }
    },
    [driverName, getSignalingClient, showToast, startMeshSession]
  );

  // Açılışta otomatik bağlanma açıksa ve ana sayfadaysa
  useEffect(() => {
    if (autoConnectOnLoad && view === 'home' && !isConnecting && !roomData) {
      const timer = setTimeout(() => {
        handleAutoConnect('MOTO-RIDE');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [autoConnectOnLoad, view, isConnecting, roomData, handleAutoConnect]);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (meshRef.current) meshRef.current.setMute(next);
    if (next) {
      playMuteSound();
    } else {
      playUnmuteSound();
    }
    showToast(next ? 'Mikrofon Kapatıldı' : 'Mikrofon Açık');
  };

  const handleSendHorn = () => {
    if (meshRef.current) {
      meshRef.current.sendHornAlert();
      playAlertTone('horn');
      showToast('İkaz tonu gönderildi ⚠️');
    }
  };

  return (
    <div className="app-container" onClick={ensureAudioUnlocked}>
      <div className="ambient-glow cyan-glow"></div>
      <div className="ambient-glow orange-glow"></div>

      {view === 'home' && (
        <div className="lobby-wrapper animate-fade-in">
          <header className="lobby-brand">
            <div className="brand-logo-wrap">
              <Radio size={36} className="brand-icon" />
              <div className="brand-pulse-ring"></div>
            </div>
            <h1 className="brand-title">RideTalk</h1>
            <p className="brand-tagline">Motosiklet İçin Otomatik Full-Mesh İnterkom</p>
          </header>

          <div className="feature-pill-row">
            <div className="feat-pill">
              <Shield size={14} className="text-emerald" />
              <span>Vercel + Firebase</span>
            </div>
            <div className="feat-pill">
              <Wifi size={14} className="text-orange" />
              <span>Otomatik Eşleşme</span>
            </div>
            <div className="feat-pill">
              <Volume2 size={14} className="text-cyan" />
              <span>DSP Filtresi</span>
            </div>
          </div>

          {/* Sürücü Adı Girişi */}
          <div
            className="driver-name-card"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '14px 18px',
              marginBottom: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} className="text-neon" />
              <span>Kask / Sürücü Adınız:</span>
            </label>
            <input
              type="text"
              className="input-text"
              value={driverName}
              onChange={(e) => {
                setDriverName(e.target.value);
                localStorage.setItem('ridetalk_name', e.target.value);
              }}
              placeholder="Örn: Ahmet, Motorcu-1"
              maxLength={20}
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                padding: '10px 14px',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: '700',
              }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', cursor: 'pointer', fontSize: '0.78rem', color: '#cbd5e1' }}>
              <input
                type="checkbox"
                checked={autoConnectOnLoad}
                onChange={(e) => {
                  setAutoConnectOnLoad(e.target.checked);
                  localStorage.setItem('ridetalk_autoconnect', e.target.checked ? 'true' : 'false');
                }}
                style={{ width: '16px', height: '16px', accentColor: '#00e5ff' }}
              />
              <span>Sayfa açıldığında otomatik bağlan (0 tık)</span>
            </label>
          </div>

          {/* ⭐ TEK TUŞLA OTOMATİK BAĞLAN BUTONU ⭐ */}
          <div className="lobby-cards-grid">
            <button
              type="button"
              className="lobby-action-card card-hotspot-main"
              onClick={() => handleAutoConnect('MOTO-RIDE')}
              disabled={isConnecting}
              style={{
                gridColumn: '1 / -1',
                background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.2) 0%, rgba(255, 107, 0, 0.25) 100%)',
                border: '2px solid #00e5ff',
                boxShadow: '0 0 25px rgba(0, 229, 255, 0.35)',
                minHeight: '110px',
                padding: '18px',
              }}
            >
              <div className="card-action-icon" style={{ color: '#00e5ff' }}>
                {isConnecting ? <Zap size={40} className="animate-pulse text-orange" /> : <Radio size={40} />}
              </div>
              <div className="card-action-text">
                <h3 style={{ color: '#00e5ff', fontSize: '1.25rem', fontWeight: '900', letterSpacing: '0.5px' }}>
                  {isConnecting ? 'Telsize Bağlanılıyor...' : '🚀 TELSİZE BAĞLAN (OTOMATİK)'}
                </h3>
                <p style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                  Hotspot veya internetteki tüm sürücülerle anında aynı odaya girip konuşun. Kod yok, QR yok!
                </p>
              </div>
            </button>

            {/* Özel Oda Seçenekleri (İsteğe Bağlı) */}
            <button
              type="button"
              className="lobby-action-card card-create"
              onClick={() => {
                setError(null);
                setRoomData(null);
                setView('create');
              }}
            >
              <div className="card-action-icon">
                <PlusCircle size={26} />
              </div>
              <div className="card-action-text">
                <h3>Özel Oda Aç</h3>
                <p>Farklı bir oda koduyla grup kur</p>
              </div>
            </button>

            <button
              type="button"
              className="lobby-action-card card-join"
              onClick={() => {
                setError(null);
                setView('join');
              }}
            >
              <div className="card-action-icon">
                <LogIn size={26} />
              </div>
              <div className="card-action-text">
                <h3>Koda Göre Katıl</h3>
                <p>Belirli bir oda koduna gir</p>
              </div>
            </button>
          </div>

          {error && (
            <div
              className="error-banner"
              style={{
                margin: '12px 0',
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(255,23,68,0.15)',
                border: '1px solid rgba(255,23,68,0.4)',
                color: '#ff8a80',
                fontSize: '0.85rem',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <footer className="lobby-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span>Sürüş sırasında telefonunuzu gidon tutucusunda açık tutun.</span>
            <button
              type="button"
              className="btn-text-settings"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.75rem',
                color: '#64748b',
                background: 'rgba(255,255,255,0.04)',
                padding: '6px 12px',
                borderRadius: '9999px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}
              onClick={() => setIsServerSettingsOpen(true)}
            >
              <Settings size={13} />
              <span>Ayarlar</span>
            </button>
          </footer>
        </div>
      )}

      <ServerSettingsModal
        isOpen={isServerSettingsOpen}
        onClose={() => setIsServerSettingsOpen(false)}
        onSave={() => {
          if (signalingRef.current) {
            signalingRef.current.disconnect();
            signalingRef.current = null;
          }
          showToast('Ayarlar güncellendi');
        }}
      />

      {view === 'create' && (
        <div className="view-wrapper animate-fade-in">
          <RoomCreate
            onStartRoom={() => handleAutoConnect('MOTO-RIDE')}
            isConnecting={isConnecting}
            error={error}
            roomData={roomData}
            onEnterActiveRoom={() => setView('active')}
            onBack={() => setView('home')}
          />
        </div>
      )}

      {view === 'join' && (
        <div className="view-wrapper animate-fade-in">
          <RoomJoin
            initialRoomCode={initialRoomCode}
            onJoinRoom={(code) => handleAutoConnect(code)}
            isConnecting={isConnecting}
            error={error}
            onBack={() => setView('home')}
          />
        </div>
      )}

      {view === 'active' && roomData && (
        <ActiveRoom
          roomCode={roomData.roomCode}
          selfName={roomData.name}
          peers={peers}
          localVolume={localVolume}
          localIsSpeaking={localIsSpeaking}
          peerVolumes={peerVolumes}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          onSendHorn={handleSendHorn}
          onLeaveRoom={handleLeaveRoomDirect}
          stats={stats}
          isWakeLockActive={isWakeLockActive}
          isOnline={isOnline}
          toastMessage={toastMessage}
          meshManager={meshRef.current}
          showReconnectQRPrompt={false}
          onOfflineHandshakeSuccess={(partnerName) => {
            showToast(`${partnerName} ile ses bağlantısı kuruldu!`);
            setPeers((prev) => ({
              ...prev,
              offline_peer: {
                name: partnerName || 'Sürücü',
                state: 'connected',
                isMuted: false,
                stats: { isLocal: true, rtt: 10 },
              },
            }));
          }}
        />
      )}
    </div>
  );
}
