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
} from './lib/announcer.js';
import { keepScreenAwake, releaseScreenAwake, onWakeLockStatusChange } from './lib/wakeLock.js';
import { watchNetworkChanges } from './lib/networkWatcher.js';
import { Radio, Users, PlusCircle, LogIn, Shield, WifiOff, Volume2, Settings } from 'lucide-react';
import './App.css';

export default function App() {
  const [view, setView] = useState('home'); // 'home' | 'create' | 'join' | 'active'
  const [roomData, setRoomData] = useState(null); // { roomCode, peerId, name }
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [initialRoomCode, setInitialRoomCode] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);

  // Active Intercom States
  const [peers, setPeers] = useState({}); // peerId -> { name, state, isMuted, stats }
  const [localVolume, setLocalVolume] = useState(0);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState({}); // peerId -> { level, isSpeaking }
  const [isMuted, setIsMuted] = useState(false);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const [stats, setStats] = useState({ isHotspotMode: false, avgRtt: 15 });
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [toastMessage, setToastMessage] = useState(null);

  // Audio gesture unlock helper for mobile browsers (iOS Safari / Chrome)
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const signalingRef = useRef(null);
  const meshRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Prevent accidental back navigation / reload when in active room
  useEffect(() => {
    if (view === 'active') {
      const handleBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = '?nterkom oturumu aktif. Ayr?lmak istedi?inize emin misiniz?';
        return e.returnValue;
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      // Push history state to intercept mobile swipe-back and back button
      window.history.pushState({ ridetalk: 'active' }, '');
      const handlePopState = () => {
        if (window.confirm('?nterkom odas?ndan ayr?lmak istiyor musunuz?')) {
          handleLeaveRoomDirect();
        } else {
          window.history.pushState({ ridetalk: 'active' }, '');
        }
      };
      window.addEventListener('popstate', handlePopState);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [view]);

  // Check URL query parameters for direct invite links (e.g. ?room=BOLU7F)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const codeFromUrl = urlParams.get('room');
      if (codeFromUrl) {
        setInitialRoomCode(codeFromUrl.toUpperCase());
        setView('join');
      }
    }
  }, []);

  // WakeLock status listener
  useEffect(() => {
    onWakeLockStatusChange((active) => {
      setIsWakeLockActive(active);
    });
  }, []);

  // Online / Offline monitor
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Unlock AudioContext on first user tap (critical for iOS Safari TTS & Web Audio)
  const ensureAudioUnlocked = () => {
    if (!audioUnlocked) {
      playAlertTone('connect');
      setAudioUnlocked(true);
    }
  };

  // Helper to get or instantiate SignalingClient
  const getSignalingClient = useCallback(() => {
    if (!signalingRef.current) {
      if (isFirebaseConfigured()) {
        console.log('[App] Sinyallesme: Firebase Realtime Database (Serverless) ⚡');
        signalingRef.current = new FirebaseSignalingClient();
      } else {
        console.log('[App] Sinyallesme: WebSocket Sunucusu 📡');
        signalingRef.current = new SignalingClient();
      }
    }
    return signalingRef.current;
  }, []);

  // Initialize MeshManager and setup WebRTC listeners
  const startMeshSession = useCallback(
    async (currentRoomData, existingPeers = []) => {
      try {
        const signaling = getSignalingClient();

        // Screen Wake Lock
        await keepScreenAwake();

        // Mesh Manager Instance
        const mesh = new MeshManager({
          sendSignal: (targetPeerId, data) => {
            signaling.sendSignal(targetPeerId, data);
          },
          onPeerStateChange: (peerId, info) => {
            setPeers((prev) => ({
              ...prev,
              [peerId]: {
                name: info.name,
                state: info.state,
                isMuted: info.isMuted,
                stats: info.stats,
              },
            }));
          },
          onPeerVolumeChange: (peerId, level, isSpeaking) => {
            setPeerVolumes((prev) => ({
              ...prev,
              [peerId]: { level, isSpeaking },
            }));
          },
          onLocalVolumeChange: (level, isSpeaking) => {
            setLocalVolume(level);
            setLocalIsSpeaking(isSpeaking);
          },
          onPeerDisconnect: (peerId) => {
            announceDisconnect(peerId);
            showToast(`${peers[peerId]?.name || 'Sürücü'} bağlantısı koptu`);
          },
          onPeerReconnect: (peerId) => {
            announceReconnect(peerId);
            showToast(`${peers[peerId]?.name || 'Sürücü'} tekrar bağlandı`);
          },
          onHornReceived: (peerId, senderName) => {
            playAlertTone('horn');
            showToast(`⚠️ ${senderName || 'Sürücü'} ikaz tonu gönderdi!`);
          },
          onStatsUpdate: (updatedStats) => {
            setStats(updatedStats);
          },
        });

        meshRef.current = mesh;

        // Initialize Microphone
        await mesh.init();

        // Connect to existing peers if we are the joiner
        if (existingPeers && existingPeers.length > 0) {
          for (const p of existingPeers) {
            await mesh.connectToPeer(p.id, p.name);
          }
        }

        // Watch network changes for Hotspot / Wi-Fi switch -> triggers ICE Restart
        const unwatchNetwork = watchNetworkChanges(() => {
          if (meshRef.current) {
            meshRef.current.restartIceForAllPeers();
            showToast('Ağ değişimi algılandı, yerel ICE bağlantısı yenilendi');
          }
        });

        return unwatchNetwork;
      } catch (err) {
        console.error('[App] Mesh oturumu başlatma hatası:', err);
        throw err;
      }
    },
    [getSignalingClient, peers, showToast]
  );

  // Setup Signaling Listeners
  const bindSignalingEvents = useCallback(
    (signaling) => {
      signaling.on('peer-joined', async (msg) => {
        console.log('[App] Yeni sürücü katıldı:', msg);
        announceJoin(msg.peerId, msg.name);
        showToast(`${msg.name} interkoma katıldı`);

        if (meshRef.current) {
          await meshRef.current.connectToPeer(msg.peerId, msg.name);
        }
      });

      signaling.on('signal', async (msg) => {
        if (meshRef.current) {
          await meshRef.current.handleSignal(msg.fromPeerId, msg.data);
        }
      });

      signaling.on('peer-left', (msg) => {
        console.log('[App] S?r?c? ayr?ld?:', msg);
        playSomeoneLeftSound();
        announceDisconnect(msg.peerId);
        showToast(`${msg.name || 'Sürücü'} odadan ayrıldı`);

        if (meshRef.current) {
          meshRef.current.removePeer(msg.peerId);
        }

        setPeers((prev) => {
          const next = { ...prev };
          delete next[msg.peerId];
          return next;
        });
      });

      signaling.on('error', (err) => {
        setError(err.message || 'Sinyal sunucusu hatası');
        setIsConnecting(false);
      });
    },
    [showToast]
  );

  // Handler: Create Room
  const handleStartRoom = async (name) => {
    try {
      setError(null);
      setIsConnecting(true);
      ensureAudioUnlocked();

      const signaling = getSignalingClient();
      await signaling.connect();
      bindSignalingEvents(signaling);

      signaling.on('room-created', (msg) => {
        setIsConnecting(false);
        setRoomData({
          roomCode: msg.roomCode,
          peerId: msg.peerId,
          name: msg.name,
        });
      });

      signaling.createRoom(name);
    } catch (err) {
      setError('Oda oluşturulurken hata meydana geldi: ' + err.message);
      setIsConnecting(false);
    }
  };

  // Handler: Enter Active Cockpit from Create Screen
  const handleEnterActiveCockpit = async () => {
    try {
      setIsConnecting(true);
      await startMeshSession(roomData, []);
      setIsConnecting(false);
      setView('active');
      speakText('İnterkom aktif. İyi sürüşler!');
    } catch (err) {
      setError(err.message);
      setIsConnecting(false);
    }
  };

  // Handler: Join Room
  const handleJoinRoom = async (code, name) => {
    try {
      setError(null);
      setIsConnecting(true);
      ensureAudioUnlocked();

      const signaling = getSignalingClient();
      await signaling.connect();
      bindSignalingEvents(signaling);

      signaling.on('joined', async (msg) => {
        const newRoomData = {
          roomCode: msg.roomCode,
          peerId: msg.peerId,
          name: msg.name,
        };
        setRoomData(newRoomData);

        try {
          await startMeshSession(newRoomData, msg.existingPeers || []);
          setIsConnecting(false);
          setView('active');
          speakText(`${msg.roomCode} odasına bağlanıldı. İyi sürüşler!`);
        } catch (mErr) {
          setError(mErr.message);
          setIsConnecting(false);
        }
      });

      signaling.joinRoom(code, name);
    } catch (err) {
      setError('Odaya katılırken hata meydana geldi: ' + err.message);
      setIsConnecting(false);
    }
  };

  // Handler: Mute / Unmute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (meshRef.current) {
      meshRef.current.setMute(nextMuted);
    }
    playAlertTone(nextMuted ? 'disconnect' : 'connect');
    showToast(nextMuted ? 'Mikrofon Kapatıldı' : 'Mikrofon Açık');
  };

  // Handler: Horn / Helmet Chime
  const handleSendHorn = () => {
    if (meshRef.current) {
      meshRef.current.sendHornAlert();
      playAlertTone('horn');
      showToast('İkaz tonu gönderildi ⚠️');
    }
  };

  // Handler: Leave Room
  const handleLeaveRoom = () => {
    if (window.confirm('İnterkom odasından ayrılmak istiyor musunuz?')) {
      if (meshRef.current) {
        meshRef.current.destroy();
        meshRef.current = null;
      }
      if (signalingRef.current) {
        signalingRef.current.leaveRoom();
        signalingRef.current.disconnect();
        signalingRef.current = null;
      }
      releaseScreenAwake();
      setPeers({});
      setRoomData(null);
      setView('home');
      showToast('İnterkomdan ayrıldınız');
    }
  };

  return (
    <div className="app-container" onClick={ensureAudioUnlocked}>
      {/* Background Ambience / Glow */}
      <div className="ambient-glow cyan-glow"></div>
      <div className="ambient-glow orange-glow"></div>

      {/* LOBBY / HOME VIEW */}
      {view === 'home' && (
        <div className="lobby-wrapper animate-fade-in">
          <header className="lobby-brand">
            <div className="brand-logo-wrap">
              <Radio size={36} className="brand-icon" />
              <div className="brand-pulse-ring"></div>
            </div>
            <h1 className="brand-title">RideTalk</h1>
            <p className="brand-tagline">Motosiklet İçin Tam Mesh & İnternetsiz Hotspot İnterkomu</p>
          </header>

          <div className="feature-pill-row">
            <div className="feat-pill">
              <Shield size={14} className="text-emerald" />
              <span>Full Mesh WebRTC</span>
            </div>
            <div className="feat-pill">
              <WifiOff size={14} className="text-orange" />
              <span>Hotspot ile 0 İnternet</span>
            </div>
            <div className="feat-pill">
              <Volume2 size={14} className="text-cyan" />
              <span>TTS Kopma Anonsu</span>
            </div>
          </div>

          <div className="lobby-cards-grid">
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
                <PlusCircle size={32} />
              </div>
              <div className="card-action-text">
                <h3>Oda Oluştur</h3>
                <p>Grup lideri olarak yeni interkom başlatın ve QR kod üretin</p>
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
                <LogIn size={32} />
              </div>
              <div className="card-action-text">
                <h3>Odaya Katıl</h3>
                <p>6 haneli kod girerek veya kamerayla QR okutarak katılın</p>
              </div>
            </button>
          </div>

          <footer className="lobby-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span>Sürüş sırasında telefonunuzu gidon tutucusunda açık tutun.</span>
            <button
              type="button"
              className="btn-text-settings"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', background: 'rgba(255,255,255,0.04)', padding: '6px 12px', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.06)' }}
              onClick={() => setIsServerSettingsOpen(true)}
            >
              <Settings size={13} />
              <span>Sunucu / WebSocket Ayarı</span>
            </button>
          </footer>
        </div>
      )}

      {/* SERVER SETTINGS MODAL */}
      <ServerSettingsModal
        isOpen={isServerSettingsOpen}
        onClose={() => setIsServerSettingsOpen(false)}
        onSave={() => {
          if (signalingRef.current) {
            signalingRef.current.disconnect();
            signalingRef.current = null;
          }
          showToast('Sunucu adresi güncellendi');
        }}
      />

      {/* CREATE ROOM VIEW */}
      {view === 'create' && (
        <div className="view-wrapper animate-fade-in">
          <RoomCreate
            onStartRoom={handleStartRoom}
            isConnecting={isConnecting}
            error={error}
            roomData={roomData}
            onEnterActiveRoom={handleEnterActiveCockpit}
            onBack={() => setView('home')}
          />
        </div>
      )}

      {/* JOIN ROOM VIEW */}
      {view === 'join' && (
        <div className="view-wrapper animate-fade-in">
          <RoomJoin
            initialRoomCode={initialRoomCode}
            onJoinRoom={handleJoinRoom}
            isConnecting={isConnecting}
            error={error}
            onBack={() => setView('home')}
          />
        </div>
      )}

      {/* ACTIVE COCKPIT HUD VIEW */}
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
          onLeaveRoom={handleLeaveRoom}
          stats={stats}
          isWakeLockActive={isWakeLockActive}
          isOnline={isOnline}
          toastMessage={toastMessage}
        />
      )}
    </div>
  );
}
