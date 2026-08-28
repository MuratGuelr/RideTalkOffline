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
  announceJoin, announceDisconnect, announceReconnect,
  playAlertTone, speakText, playMuteSound, playUnmuteSound,
  playSomeoneLeftSound, preloadAllSounds, getAudioContext,
} from './lib/announcer.js';
import { keepScreenAwake, releaseScreenAwake, onWakeLockStatusChange } from './lib/wakeLock.js';
import { watchNetworkChanges } from './lib/networkWatcher.js';
import { Radio, PlusCircle, LogIn, Shield, WifiOff, Volume2, Settings, QrCode } from 'lucide-react';
import './App.css';

export default function App() {
  const [view, setView] = useState('home');
  const [roomData, setRoomData] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [initialRoomCode, setInitialRoomCode] = useState('');
  const [isServerSettingsOpen, setIsServerSettingsOpen] = useState(false);
  const [isLobbyOfflineQRModalOpen, setIsLobbyOfflineQRModalOpen] = useState(false);
  const [showReconnectQRPrompt, setShowReconnectQRPrompt] = useState(false);

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

  // URL'den oda kodu
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

  const startMeshSession = useCallback(async (currentRoomData, existingPeers = []) => {
    const signaling = getSignalingClient();
    await keepScreenAwake();

    const mesh = new MeshManager({
      myPeerId: currentRoomData?.peerId || '',
      sendSignal: (targetPeerId, data) => signaling.sendSignal(targetPeerId, data),
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
      // ⭐ Otomatik yeniden bağlantı başarısız olduğunda QR eşleşme modalını aç
      onReconnectionFailed: () => {
        console.log('[App] Otomatik yeniden bağlantı başarısız, çevrimdışı QR eşleşme öneriliyor.');
        showToast('Hotspot geçişi başarısız. QR ile yeniden eşleşin.');
        speakText('Bağlantı koptu. QR kodla yeniden eşleşin.');
        setShowReconnectQRPrompt(true);
      },
    });

    meshRef.current = mesh;
    await mesh.init();

    if (existingPeers.length > 0) {
      for (const p of existingPeers) await mesh.connectToPeer(p.id, p.name);
    }

    // Ağ değişim izleyicisini kur
    if (unwatchNetworkRef.current) unwatchNetworkRef.current();
    unwatchNetworkRef.current = watchNetworkChanges((reason) => {
      if (meshRef.current) {
        showToast('Ağ değişimi algılandı, yeniden bağlanılıyor...');
        meshRef.current.restartIceForAllPeers();
      }
    });
  }, [getSignalingClient, showToast]);

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

  // Oda Oluştur
  const handleStartRoom = async (name) => {
    try {
      setError(null); setIsConnecting(true); ensureAudioUnlocked();
      const signaling = getSignalingClient();
      await signaling.connect();
      bindSignalingEvents(signaling);
      signaling.on('room-created', async (msg) => {
        const rd = { roomCode: msg.roomCode, peerId: msg.peerId, name: msg.name };
        setRoomData(rd); setIsConnecting(false);
        try { await startMeshSession(rd, []); setView('active'); speakText('İnterkom odası açıldı.'); }
        catch (e) { setError(e.message); }
      });
      signaling.createRoom(name);
    } catch (err) { setError(err.message); setIsConnecting(false); }
  };

  // Odaya Katıl
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
        try { await startMeshSession(rd, msg.existingPeers || []); setIsConnecting(false); setView('active'); speakText(`${msg.roomCode} odasına bağlanıldı.`); }
        catch (e) { setError(e.message); setIsConnecting(false); }
      });
      signaling.joinRoom(code, name);
    } catch (err) { setError(err.message); setIsConnecting(false); }
  };

  // 0 İnternet Doğrudan Başlat
  const handleStartDirectOffline = async () => {
    try {
      ensureAudioUnlocked();
      const rd = { roomCode: 'OFFLINE', peerId: 'peer_' + Math.random().toString(36).substring(2, 9), name: localStorage.getItem('ridetalk_name') || 'Sürücü' };
      setRoomData(rd);
      const mesh = new MeshManager({
        myPeerId: rd.peerId,
        onPeerStateChange: (pid, i) => setPeers((p) => ({ ...p, [pid]: { name: i.name, state: i.state, isMuted: i.isMuted, stats: i.stats } })),
        onPeerVolumeChange: (pid, l, s) => setPeerVolumes((p) => ({ ...p, [pid]: { level: l, isSpeaking: s } })),
        onLocalVolumeChange: (l, s) => { setLocalVolume(l); setLocalIsSpeaking(s); },
        onPeerDisconnect: (pid) => { playSomeoneLeftSound(); announceDisconnect(pid); },
        onPeerReconnect: (pid) => announceReconnect(pid),
        onHornReceived: (_, n) => { playAlertTone('horn'); showToast(`⚠️ ${n} ikaz tonu gönderdi!`); },
        onStatsUpdate: (s) => setStats(s),
        onReconnectionFailed: () => {},
      });
      meshRef.current = mesh;
      await mesh.init();
      await keepScreenAwake();
      setView('active');
      setIsLobbyOfflineQRModalOpen(true);
      speakText('Çevrimdışı interkom aktif.');
    } catch (err) { alert(`Mikrofon hatası: ${err.message}`); }
  };

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
    if (signalingRef.current) { signalingRef.current.leaveRoom(); signalingRef.current.disconnect(); signalingRef.current = null; }
    if (unwatchNetworkRef.current) { unwatchNetworkRef.current(); unwatchNetworkRef.current = null; }
    releaseScreenAwake(); setPeers({}); setRoomData(null); setView('home'); showToast('İnterkomdan ayrıldınız');
  };

  return (
    <div className="app-container" onClick={ensureAudioUnlocked}>
      <div className="ambient-glow cyan-glow"></div>
      <div className="ambient-glow orange-glow"></div>

      {view === 'home' && (
        <div className="lobby-wrapper animate-fade-in">
          <header className="lobby-brand">
            <div className="brand-logo-wrap"><Radio size={36} className="brand-icon" /><div className="brand-pulse-ring"></div></div>
            <h1 className="brand-title">RideTalk</h1>
            <p className="brand-tagline">Motosiklet İçin Tam Mesh & 0 İnternet Hotspot İnterkomu</p>
          </header>
          <div className="feature-pill-row">
            <div className="feat-pill"><Shield size={14} className="text-emerald" /><span>PWA Çevrimdışı</span></div>
            <div className="feat-pill"><WifiOff size={14} className="text-orange" /><span>0 İnternet QR Mesh</span></div>
            <div className="feat-pill"><Volume2 size={14} className="text-cyan" /><span>DSP Gürültü Filtresi</span></div>
          </div>
          <div className="lobby-cards-grid">
            <button type="button" className="lobby-action-card card-create" onClick={() => { setError(null); setRoomData(null); setView('create'); }}>
              <div className="card-action-icon"><PlusCircle size={32} /></div>
              <div className="card-action-text"><h3>Oda Oluştur</h3><p>İnternet üzerinden yeni telsiz odası başlatın</p></div>
            </button>
            <button type="button" className="lobby-action-card card-join" onClick={() => { setError(null); setView('join'); }}>
              <div className="card-action-icon"><LogIn size={32} /></div>
              <div className="card-action-text"><h3>Odaya Katıl</h3><p>6 haneli kod girerek veya kamerayla katılın</p></div>
            </button>
            <button type="button" className="lobby-action-card card-offline-direct" style={{ gridColumn: '1 / -1', background: 'linear-gradient(135deg, rgba(255,107,0,0.15) 0%, rgba(255,23,68,0.1) 100%)', border: '1px solid rgba(255,107,0,0.4)' }} onClick={handleStartDirectOffline}>
              <div className="card-action-icon" style={{ color: '#ff6b00' }}><QrCode size={32} /></div>
              <div className="card-action-text"><h3 style={{ color: '#ff6b00' }}>0 İnternet — Doğrudan Hotspot Eşleşmesi</h3><p>İnternet hiç çekmiyorsa Hotspot açıp doğrudan QR ile bağlanın</p></div>
            </button>
          </div>
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
          showReconnectQRPrompt={showReconnectQRPrompt}
          onOfflineHandshakeSuccess={(partnerName) => {
            setShowReconnectQRPrompt(false);
            showToast(`${partnerName} ile ses bağlantısı kuruldu!`);
            setPeers((prev) => ({ ...prev, offline_peer: { name: partnerName || 'Sürücü', state: 'connected', isMuted: false, stats: { isLocal: true, rtt: 10 } } }));
          }}
        />
      )}

      {isLobbyOfflineQRModalOpen && (
        <OfflineQRHandshakeModal isOpen={isLobbyOfflineQRModalOpen} onClose={() => setIsLobbyOfflineQRModalOpen(false)} meshManager={meshRef.current} selfName={roomData?.name || 'Sürücü'} onHandshakeSuccess={(pn) => {
          setIsLobbyOfflineQRModalOpen(false); showToast(`${pn} ile ses bağlandı!`);
          setPeers((p) => ({ ...p, offline_peer: { name: pn || 'Sürücü', state: 'connected', isMuted: false, stats: { isLocal: true, rtt: 10 } } }));
        }} />
      )}
    </div>
  );
}
