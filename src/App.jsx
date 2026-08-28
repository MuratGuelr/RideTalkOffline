import React, { useState, useEffect, useRef, useCallback } from 'react';
import RoomCreate from './components/RoomCreate.jsx';
import RoomJoin from './components/RoomJoin.jsx';
import ActiveRoom from './components/ActiveRoom.jsx';
import OfflineQRHandshakeModal from './components/OfflineQRHandshakeModal.jsx';
import ServerSettingsModal from './components/ServerSettingsModal.jsx';
import { SignalingClient } from './lib/signaling.js';
import { FirebaseSignalingClient, isFirebaseConfigured } from './lib/firebaseSignaling.js';
import { LocalSignalingClient } from './lib/localSignaling.js';
import { MeshManager } from './lib/meshManager.js';
import {
  announceJoin, announceDisconnect, announceReconnect,
  playAlertTone, speakText, playMuteSound, playUnmuteSound,
  playSomeoneLeftSound, preloadAllSounds, getAudioContext,
} from './lib/announcer.js';
import { keepScreenAwake, releaseScreenAwake, onWakeLockStatusChange } from './lib/wakeLock.js';
import { watchNetworkChanges } from './lib/networkWatcher.js';
import { Radio, PlusCircle, LogIn, Shield, WifiOff, Volume2, Settings, Wifi, Zap } from 'lucide-react';
import './App.css';

export default function App() {
  const [view, setView] = useState('home');
  const [roomData, setRoomData] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [initialRoomCode, setInitialRoomCode] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);

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

  // Geri tuşu koruması
  useEffect(() => {
    if (view === 'active') {
      const beforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; return ''; };
      window.addEventListener('beforeunload', beforeUnload);
      window.history.pushState({ ridetalk: 'active' }, '');
      const popState = () => {
        if (window.confirm('İnterkom odasından ayrılmak istiyor musunuz?')) handleLeaveRoomDirect();
        else window.history.pushState({ ridetalk: 'active' }, '');
      };
      window.addEventListener('popstate', popState);
      return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('popstate', popState); };
    }
  }, [view]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('room');
    if (code) { setInitialRoomCode(code.toUpperCase()); setView('join'); }
  }, []);

  useEffect(() => { onWakeLockStatusChange((a) => setIsWakeLockActive(a)); }, []);

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
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
  //  MESH OTURUMU BAŞLAT (her mod için ortak)
  // =====================================================
  const startMeshWithSignaling = useCallback(async (currentRoomData, signalingClient, existingPeers = []) => {
    await keepScreenAwake();

    const mesh = new MeshManager({
      myPeerId: currentRoomData?.peerId || '',
      sendSignal: (targetPeerId, data) => signalingClient.sendSignal(targetPeerId, data),
      onPeerStateChange: (peerId, info) => {
        setPeers((prev) => ({ ...prev, [peerId]: { name: info.name, state: info.state, isMuted: info.isMuted, stats: info.stats } }));
      },
      onPeerVolumeChange: (peerId, level, isSpeaking) => {
        setPeerVolumes((prev) => ({ ...prev, [peerId]: { level, isSpeaking } }));
      },
      onLocalVolumeChange: (level, isSpeaking) => { setLocalVolume(level); setLocalIsSpeaking(isSpeaking); },
      onPeerDisconnect: (peerId) => { playSomeoneLeftSound(); announceDisconnect(peerId); },
      onPeerReconnect: (peerId) => { announceReconnect(peerId); showToast('Bağlantı yeniden kuruldu!'); },
      onHornReceived: (_, name) => { playAlertTone('horn'); showToast(`⚠️ ${name || 'Sürücü'} ikaz tonu gönderdi!`); },
      onStatsUpdate: (s) => setStats(s),
      onReconnectionFailed: () => {},
    });

    meshRef.current = mesh;
    await mesh.init();

    if (existingPeers.length > 0) {
      for (const p of existingPeers) await mesh.connectToPeer(p.id, p.name);
    }

    // Ağ değişim izleyicisi
    if (unwatchNetworkRef.current) unwatchNetworkRef.current();
    unwatchNetworkRef.current = watchNetworkChanges((reason) => {
      if (meshRef.current) {
        showToast('Ağ değişimi algılandı, yeniden bağlanılıyor...');
        meshRef.current.restartIceForAllPeers();
      }
    });
  }, [showToast]);

  // =====================================================
  //  ⭐ HOTSPOT İNTERKOM — Tek Tuşla Otomatik Bağlan
  //  Kod yok, QR yok. Aynı ağdaki herkes otomatik eşleşir.
  // =====================================================
  const handleHotspotIntercom = async () => {
    try {
      setError(null);
      setIsConnecting(true);
      ensureAudioUnlocked();

      const savedName = localStorage.getItem('ridetalk_name') || '';
      const name = savedName || prompt('Sürücü adınız:', 'Sürücü') || 'Sürücü';
      localStorage.setItem('ridetalk_name', name);

      // Yerel sinyal sunucusuna bağlan
      const local = new LocalSignalingClient();
      await local.connect();
      signalingRef.current = local;

      // Sinyal olaylarını dinle
      local.on('joined', async (msg) => {
        console.log('[App] Hotspot odasına katıldı:', msg);
        const rd = { roomCode: 'HOTSPOT', peerId: msg.peerId, name: msg.name };
        setRoomData(rd);

        const existingPeers = msg.existingPeers || [];
        const ip = {};
        existingPeers.forEach((p) => {
          ip[p.id] = { name: p.name, state: 'connecting', isMuted: false, stats: null };
        });
        setPeers(ip);

        try {
          await startMeshWithSignaling(rd, local, existingPeers);
          setIsConnecting(false);
          setView('active');

          if (existingPeers.length > 0) {
            speakText(`Hotspot interkoma bağlandı. ${existingPeers.length} sürücü mevcut.`);
          } else {
            speakText('Hotspot interkom aktif. Diğer sürücüler bekleniyor.');
          }
        } catch (e) {
          setError(e.message);
          setIsConnecting(false);
        }
      });

      local.on('peer-joined', (msg) => {
        announceJoin(msg.peerId, msg.name);
        showToast(`${msg.name} bağlandı!`);
        setPeers((prev) => ({
          ...prev,
          [msg.peerId]: { name: msg.name, state: 'connecting', isMuted: false, stats: null },
        }));
        // Yeni peer ile WebRTC bağlantısı kur
        if (meshRef.current) {
          meshRef.current.connectToPeer(msg.peerId, msg.name);
        }
      });

      local.on('signal', async (msg) => {
        if (meshRef.current) {
          await meshRef.current.handleSignal(msg.fromPeerId, msg.data);
        }
      });

      local.on('peer-left', (msg) => {
        playSomeoneLeftSound();
        announceDisconnect(msg.peerId);
        showToast(`${msg.name || 'Sürücü'} ayrıldı`);
        if (meshRef.current) meshRef.current.removePeer(msg.peerId);
        setPeers((prev) => { const n = { ...prev }; delete n[msg.peerId]; return n; });
      });

      // Odaya katıl
      local.join(name);

    } catch (err) {
      console.error('[App] Hotspot interkom hatası:', err);
      setError('Yerel sinyal sunucusuna bağlanılamadı. Vite dev sunucusu çalışıyor mu?');
      setIsConnecting(false);
    }
  };

  // =====================================================
  //  İNTERNET ÜZERİNDEN ODA (Firebase/WebSocket)
  // =====================================================
  const bindSignalingEvents = useCallback((signaling) => {
    signaling.on('peer-joined', (msg) => {
      announceJoin(msg.peerId, msg.name);
      showToast(`${msg.name} odaya katıldı`);
      setPeers((prev) => ({ ...prev, [msg.peerId]: { name: msg.name, state: 'connecting', isMuted: false, stats: null } }));
    });
    signaling.on('signal', async (msg) => { if (meshRef.current) await meshRef.current.handleSignal(msg.fromPeerId, msg.data); });
    signaling.on('peer-left', (msg) => {
      playSomeoneLeftSound(); announceDisconnect(msg.peerId); showToast(`${msg.name || 'Sürücü'} ayrıldı`);
      if (meshRef.current) meshRef.current.removePeer(msg.peerId);
      setPeers((prev) => { const n = { ...prev }; delete n[msg.peerId]; return n; });
    });
    signaling.on('error', (err) => { setError(err.message || 'Hata'); setIsConnecting(false); });
  }, [showToast]);

  const handleStartRoom = async (name) => {
    try {
      setError(null); setIsConnecting(true); ensureAudioUnlocked();
      const signaling = getSignalingClient();
      await signaling.connect();
      bindSignalingEvents(signaling);
      signaling.on('room-created', async (msg) => {
        const rd = { roomCode: msg.roomCode, peerId: msg.peerId, name: msg.name };
        setRoomData(rd); setIsConnecting(false);
        try { await startMeshWithSignaling(rd, signaling, []); setView('active'); speakText('İnterkom odası açıldı.'); }
        catch (e) { setError(e.message); }
      });
      signaling.createRoom(name);
    } catch (err) { setError(err.message); setIsConnecting(false); }
  };

  const handleJoinRoom = async (code, name) => {
    try {
      setError(null); setIsConnecting(true); ensureAudioUnlocked();
      const signaling = getSignalingClient();
      await signaling.connect();
      bindSignalingEvents(signaling);
      signaling.on('joined', async (msg) => {
        const rd = { roomCode: msg.roomCode, peerId: msg.peerId, name: msg.name };
        setRoomData(rd);
        const ip = {};
        (msg.existingPeers || []).forEach((p) => { ip[p.id] = { name: p.name, state: 'connecting', isMuted: false, stats: null }; });
        setPeers(ip);
        try { await startMeshWithSignaling(rd, signaling, msg.existingPeers || []); setIsConnecting(false); setView('active'); speakText(`${msg.roomCode} odasına bağlanıldı.`); }
        catch (e) { setError(e.message); setIsConnecting(false); }
      });
      signaling.joinRoom(code, name);
    } catch (err) { setError(err.message); setIsConnecting(false); }
  };

  // =====================================================
  //  KONTROLLER
  // =====================================================
  const handleToggleMute = () => {
    const next = !isMuted; setIsMuted(next);
    if (meshRef.current) meshRef.current.setMute(next);
    next ? playMuteSound() : playUnmuteSound();
    showToast(next ? 'Mikrofon Kapatıldı' : 'Mikrofon Açık');
  };

  const handleSendHorn = () => {
    if (meshRef.current) { meshRef.current.sendHornAlert(); playAlertTone('horn'); showToast('İkaz tonu gönderildi ⚠️'); }
  };

  const handleLeaveRoomDirect = () => {
    if (meshRef.current) { meshRef.current.destroy(); meshRef.current = null; }
    if (signalingRef.current) {
      try { signalingRef.current.leaveRoom && signalingRef.current.leaveRoom(); } catch (_) {}
      signalingRef.current.disconnect();
      signalingRef.current = null;
    }
    if (unwatchNetworkRef.current) { unwatchNetworkRef.current(); unwatchNetworkRef.current = null; }
    releaseScreenAwake(); setPeers({}); setRoomData(null); setView('home'); showToast('İnterkomdan ayrıldınız');
  };

  // =====================================================
  //  RENDER
  // =====================================================
  return (
    <div className="app-container" onClick={ensureAudioUnlocked}>
      <div className="ambient-glow cyan-glow"></div>
      <div className="ambient-glow orange-glow"></div>

      {view === 'home' && (
        <div className="lobby-wrapper animate-fade-in">
          <header className="lobby-brand">
            <div className="brand-logo-wrap"><Radio size={36} className="brand-icon" /><div className="brand-pulse-ring"></div></div>
            <h1 className="brand-title">RideTalk</h1>
            <p className="brand-tagline">Motosiklet İçin Tam Mesh & Hotspot İnterkomu</p>
          </header>

          <div className="feature-pill-row">
            <div className="feat-pill"><Shield size={14} className="text-emerald" /><span>PWA Çevrimdışı</span></div>
            <div className="feat-pill"><Wifi size={14} className="text-orange" /><span>Hotspot Otomatik</span></div>
            <div className="feat-pill"><Volume2 size={14} className="text-cyan" /><span>DSP Gürültü Filtresi</span></div>
          </div>

          {/* ⭐ ANA BUTON: Hotspot İnterkom */}
          <div className="lobby-cards-grid">
            <button
              type="button"
              className="lobby-action-card card-hotspot-main"
              onClick={handleHotspotIntercom}
              disabled={isConnecting}
              style={{
                gridColumn: '1 / -1',
                background: 'linear-gradient(135deg, rgba(255,107,0,0.2) 0%, rgba(0,229,255,0.15) 100%)',
                border: '2px solid rgba(255,107,0,0.6)',
                minHeight: '100px',
              }}
            >
              <div className="card-action-icon" style={{ color: '#ff6b00' }}>
                {isConnecting ? <Zap size={36} className="animate-pulse" /> : <Wifi size={36} />}
              </div>
              <div className="card-action-text">
                <h3 style={{ color: '#ff6b00', fontSize: '1.15rem' }}>
                  {isConnecting ? 'Bağlanılıyor...' : '🔥 Hotspot İnterkom — Tek Tuş'}
                </h3>
                <p>Hotspot aç, herkes bağlansın, otomatik interkom başlasın. Kod yok, QR yok!</p>
              </div>
            </button>

            {/* İnternet Üzerinden Oda (Opsiyonel) */}
            <button type="button" className="lobby-action-card card-create" onClick={() => { setError(null); setRoomData(null); setView('create'); }}>
              <div className="card-action-icon"><PlusCircle size={28} /></div>
              <div className="card-action-text"><h3>İnternet Odası</h3><p>İnternet üzerinden kodlu oda</p></div>
            </button>
            <button type="button" className="lobby-action-card card-join" onClick={() => { setError(null); setView('join'); }}>
              <div className="card-action-icon"><LogIn size={28} /></div>
              <div className="card-action-text"><h3>Odaya Katıl</h3><p>6 haneli kod ile katıl</p></div>
            </button>
          </div>

          {error && (
            <div className="error-banner" style={{ margin: '12px 0', padding: '12px', borderRadius: '12px', background: 'rgba(255,23,68,0.15)', border: '1px solid rgba(255,23,68,0.4)', color: '#ff8a80', fontSize: '0.85rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          <footer className="lobby-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <span>Sürüş sırasında telefonunuzu gidon tutucusunda açık tutun.</span>
            <button type="button" className="btn-text-settings" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748b', background: 'rgba(255,255,255,0.04)', padding: '6px 12px', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.06)' }} onClick={() => setIsServerSettingsOpen(true)}>
              <Settings size={13} /><span>Sunucu Ayarı</span>
            </button>
          </footer>
        </div>
      )}

      <ServerSettingsModal isOpen={isServerSettingsOpen} onClose={() => setIsServerSettingsOpen(false)} onSave={() => { if (signalingRef.current) { signalingRef.current.disconnect(); signalingRef.current = null; } showToast('Sunucu güncellendi'); }} />

      {view === 'create' && <div className="view-wrapper animate-fade-in"><RoomCreate onStartRoom={handleStartRoom} isConnecting={isConnecting} error={error} roomData={roomData} onEnterActiveRoom={() => setView('active')} onBack={() => setView('home')} /></div>}
      {view === 'join' && <div className="view-wrapper animate-fade-in"><RoomJoin initialRoomCode={initialRoomCode} onJoinRoom={handleJoinRoom} isConnecting={isConnecting} error={error} onBack={() => setView('home')} /></div>}

      {view === 'active' && roomData && (
        <ActiveRoom
          roomCode={roomData.roomCode} selfName={roomData.name} peers={peers}
          localVolume={localVolume} localIsSpeaking={localIsSpeaking} peerVolumes={peerVolumes}
          isMuted={isMuted} onToggleMute={handleToggleMute} onSendHorn={handleSendHorn}
          onLeaveRoom={handleLeaveRoomDirect} stats={stats} isWakeLockActive={isWakeLockActive}
          isOnline={isOnline} toastMessage={toastMessage} meshManager={meshRef.current}
          showReconnectQRPrompt={false}
          onOfflineHandshakeSuccess={(partnerName) => {
            showToast(`${partnerName} ile ses bağlantısı kuruldu!`);
            setPeers((prev) => ({ ...prev, offline_peer: { name: partnerName || 'Sürücü', state: 'connected', isMuted: false, stats: { isLocal: true, rtt: 10 } } }));
          }}
        />
      )}
    </div>
  );
}
