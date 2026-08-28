import React, { useState, useEffect, useRef, useCallback } from 'react';
import RoomCreate from './components/RoomCreate.jsx';
import RoomJoin from './components/RoomJoin.jsx';
import ActiveRoom from './components/ActiveRoom.jsx';
import OfflineQRHandshakeModal from './components/OfflineQRHandshakeModal.jsx';
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
import { Radio, PlusCircle, LogIn, Shield, WifiOff, Volume2, Settings, QrCode } from 'lucide-react';
import './App.css';

export default function App() {
  const [view, setView] = useState('home'); // 'home' | 'create' | 'join' | 'active'
  const [roomData, setRoomData] = useState(null); // { roomCode, peerId, name }
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [initialRoomCode, setInitialRoomCode] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isLobbyOfflineQRModalOpen, setIsLobbyOfflineQRModalOpen] = useState(false);

  // Aktif İnterkom Durumları
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

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Odadayken kazara geri tuşuna basıp çıkmayı önleme
  useEffect(() => {
    if (view === 'active') {
      const handleBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = 'İnterkom oturumu aktif. Ayrılmak istediğinize emin misiniz?';
        return e.returnValue;
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      window.history.pushState({ ridetalk: 'active' }, '');
      const handlePopState = () => {
        if (window.confirm('İnterkom odasından ayrılmak istiyor musunuz?')) {
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

  // URL parametresinde oda kodu kontrolü (?room=BOLU7F)
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

  // WakeLock dinleyicisi
  useEffect(() => {
    onWakeLockStatusChange((active) => {
      setIsWakeLockActive(active);
    });
  }, []);

  // Çevrimiçi / Çevrimdışı izleyici
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

  const ensureAudioUnlocked = () => {
    if (!audioUnlocked) {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      preloadAllSounds().catch(() => {});
      setAudioUnlocked(true);
    }
  };

  const getSignalingClient = useCallback(() => {
    if (!signalingRef.current) {
      if (isFirebaseConfigured()) {
        console.log('[App] Sinyalleşme Motoru: Firebase Realtime Database ⚡');
        signalingRef.current = new FirebaseSignalingClient();
      } else {
        console.log('[App] Sinyalleşme Motoru: WebSocket Sunucusu 📡');
        signalingRef.current = new SignalingClient();
      }
    }
    return signalingRef.current;
  }, []);

  // WebRTC Mesh oturumu başlatma
  const startMeshSession = useCallback(
    async (currentRoomData, existingPeers = []) => {
      try {
        const signaling = getSignalingClient();

        await keepScreenAwake();

        const mesh = new MeshManager({
          myPeerId: currentRoomData?.peerId || '',
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
            playSomeoneLeftSound();
            announceDisconnect(peerId);
            showToast(`${peers[peerId]?.name || 'Sürücü'} ayrıldı`);
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

        await mesh.init();

        if (existingPeers && existingPeers.length > 0) {
          for (const p of existingPeers) {
            await mesh.connectToPeer(p.id, p.name);
          }
        }

        const unwatchNetwork = watchNetworkChanges(() => {
          if (meshRef.current) {
            meshRef.current.restartIceForAllPeers();
            showToast('Hotspot / Ağ değişimi algılandı');
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

  const bindSignalingEvents = useCallback(
    (signaling) => {
      signaling.on('peer-joined', async (msg) => {
        announceJoin(msg.peerId, msg.name);
        showToast(`${msg.name} odaya katıldı`);

        setPeers((prev) => ({
          ...prev,
          [msg.peerId]: {
            name: msg.name,
            state: 'connecting',
            isMuted: false,
            stats: null,
          },
        }));
      });

      signaling.on('signal', async (msg) => {
        if (meshRef.current) {
          await meshRef.current.handleSignal(msg.fromPeerId, msg.data);
        }
      });

      signaling.on('peer-left', (msg) => {
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

  // 100% ÇEVRİMDIŞI DOĞRUDAN BAŞLATMA (0 İNTERNET)
  const handleStartDirectOffline = async () => {
    try {
      ensureAudioUnlocked();
      const offlineRoomData = {
        roomCode: 'OFFLINE',
        peerId: 'peer_' + Math.random().toString(36).substring(2, 9),
        name: localStorage.getItem('ridetalk_name') || 'Sürücü',
      };
      setRoomData(offlineRoomData);

      const mesh = new MeshManager({
        myPeerId: offlineRoomData.peerId,
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
          playSomeoneLeftSound();
          announceDisconnect(peerId);
        },
        onPeerReconnect: (peerId) => {
          announceReconnect(peerId);
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
      await mesh.init();
      await keepScreenAwake();

      setView('active');
      setIsLobbyOfflineQRModalOpen(true);
      speakText('Çevrimdışı interkom aktif. QR ile eşleşin.');
    } catch (err) {
      alert(`Mikrofon hatası: ${err.message}`);
    }
  };

  // Oda Oluştur (Lider - Standart)
  const handleStartRoom = async (name) => {
    try {
      setError(null);
      setIsConnecting(true);
      ensureAudioUnlocked();

      const signaling = getSignalingClient();
      await signaling.connect();
      bindSignalingEvents(signaling);

      signaling.on('room-created', async (msg) => {
        const newRoomData = {
          roomCode: msg.roomCode,
          peerId: msg.peerId,
          name: msg.name,
        };
        setRoomData(newRoomData);
        setIsConnecting(false);

        try {
          await startMeshSession(newRoomData, []);
          setView('active');
          speakText('İnterkom odası açıldı.');
        } catch (meshErr) {
          setError(`Mikrofon açılamadı: ${meshErr.message}`);
        }
      });

      signaling.createRoom(name);
    } catch (err) {
      setError(`Oda oluşturulurken hata meydana geldi: ${err.message}`);
      setIsConnecting(false);
    }
  };

  // Odaya Katıl (Katılımcı - Standart)
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

        const initialPeers = {};
        (msg.existingPeers || []).forEach((p) => {
          initialPeers[p.id] = {
            name: p.name,
            state: 'connecting',
            isMuted: false,
            stats: null,
          };
        });
        setPeers(initialPeers);

        try {
          await startMeshSession(newRoomData, msg.existingPeers || []);
          setIsConnecting(false);
          setView('active');
          speakText(`${msg.roomCode} odasına bağlanıldı.`);
        } catch (mErr) {
          setError(mErr.message);
          setIsConnecting(false);
        }
      });

      signaling.joinRoom(code, name);
    } catch (err) {
      setError(`Odaya katılırken hata meydana geldi: ${err.message}`);
      setIsConnecting(false);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (meshRef.current) {
      meshRef.current.setMute(nextMuted);
    }
    if (nextMuted) {
      playMuteSound();
    } else {
      playUnmuteSound();
    }
    showToast(nextMuted ? 'Mikrofon Kapatıldı' : 'Mikrofon Açık');
  };

  const handleSendHorn = () => {
    if (meshRef.current) {
      meshRef.current.sendHornAlert();
      playAlertTone('horn');
      showToast('İkaz tonu gönderildi ⚠️');
    }
  };

  const handleLeaveRoomDirect = () => {
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
  };

  const handleLeaveRoom = () => {
    handleLeaveRoomDirect();
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
            <p className="brand-tagline">Motosiklet İçin Tam Mesh & 0 İnternet Hotspot İnterkomu</p>
          </header>

          <div className="feature-pill-row">
            <div className="feat-pill">
              <Shield size={14} className="text-emerald" />
              <span>PWA 100% Çevrimdışı</span>
            </div>
            <div className="feat-pill">
              <WifiOff size={14} className="text-orange" />
              <span>0 İnternet QR Mesh</span>
            </div>
            <div className="feat-pill">
              <Volume2 size={14} className="text-cyan" />
              <span>DSP Gürültü Filtresi</span>
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
                <p>İnternet üzerinden yeni telsiz odası başlatın ve QR üretin</p>
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

            {/* 0 İNTERNET DOĞRUDAN HOTSPOT KARTI */}
            <button
              type="button"
              className="lobby-action-card card-offline-direct"
              style={{
                gridColumn: '1 / -1',
                background: 'linear-gradient(135deg, rgba(255, 107, 0, 0.15) 0%, rgba(255, 23, 68, 0.1) 100%)',
                border: '1px solid rgba(255, 107, 0, 0.4)',
              }}
              onClick={handleStartDirectOffline}
            >
              <div className="card-action-icon" style={{ color: '#ff6b00' }}>
                <QrCode size={32} />
              </div>
              <div className="card-action-text">
                <h3 style={{ color: '#ff6b00' }}>0 İnternet — Doğrudan Hotspot Eşleşmesi</h3>
                <p>İnternet hiç çekmiyorsa Hotspot açıp doğrudan QR okutarak bağlanın</p>
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

      {view === 'create' && (
        <div className="view-wrapper animate-fade-in">
          <RoomCreate
            onStartRoom={handleStartRoom}
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
            onJoinRoom={handleJoinRoom}
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
          onLeaveRoom={handleLeaveRoom}
          stats={stats}
          isWakeLockActive={isWakeLockActive}
          isOnline={isOnline}
          toastMessage={toastMessage}
          meshManager={meshRef.current}
          onOfflineHandshakeSuccess={(partnerName) => {
            showToast(`${partnerName} ile 0 internet yerel ses bağlandı!`);
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

      {/* Lobi Üzerinden Açılan Doğrudan Çevrimdışı QR Modalı */}
      {isLobbyOfflineQRModalOpen && (
        <OfflineQRHandshakeModal
          isOpen={isLobbyOfflineQRModalOpen}
          onClose={() => setIsLobbyOfflineQRModalOpen(false)}
          meshManager={meshRef.current}
          selfName={roomData?.name || 'Sürücü'}
          onHandshakeSuccess={(partnerName) => {
            setIsLobbyOfflineQRModalOpen(false);
            showToast(`${partnerName} ile 0 internet yerel ses bağlandı!`);
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
