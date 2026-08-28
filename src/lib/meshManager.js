// WebRTC Full-Mesh Ses Yöneticisi (MeshManager)
// Motosiklet kask interkomu: Hotspot geçişinde DataChannel üzerinden
// ultra-hızlı ICE Restart ile otomatik yeniden bağlantı.

import { AudioLevelMeter } from './audioMeter.js';
import { registerPeerName, unregisterPeerName } from './announcer.js';
import { createMotorcycleAudioFilter } from './audioFilter.js';

const ONLINE_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

export class MeshManager {
  constructor(options = {}) {
    this.sendSignal = options.sendSignal || (() => {});
    this.onPeerStateChange = options.onPeerStateChange || (() => {});
    this.onPeerVolumeChange = options.onPeerVolumeChange || (() => {});
    this.onLocalVolumeChange = options.onLocalVolumeChange || (() => {});
    this.onPeerDisconnect = options.onPeerDisconnect || (() => {});
    this.onPeerReconnect = options.onPeerReconnect || (() => {});
    this.onHornReceived = options.onHornReceived || (() => {});
    this.onStatsUpdate = options.onStatsUpdate || (() => {});
    this.onReconnectionFailed = options.onReconnectionFailed || (() => {});
    this.myPeerId = options.myPeerId || '';

    this.peers = new Map();
    this.rawLocalStream = null;
    this.localStream = null;
    this.dspFilter = null;
    this.localLevelMeter = null;
    this.isMuted = false;
    this.statsInterval = null;
    this._heartbeatInterval = null;
  }

  async init() {
    try {
      this.rawLocalStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
        video: false,
      });

      this.dspFilter = createMotorcycleAudioFilter(this.rawLocalStream);
      this.localStream = this.dspFilter.filteredStream;

      this.localLevelMeter = new AudioLevelMeter(this.localStream, (level, isSpeaking) => {
        if (this.onLocalVolumeChange) {
          this.onLocalVolumeChange(this.isMuted ? 0 : level, !this.isMuted && isSpeaking);
        }
      });

      this._startHeartbeat();
      this.startStatsMonitoring();
      return this.localStream;
    } catch (err) {
      console.error('[MeshManager] Mikrofon başlatılamadı:', err);
      throw new Error(`Mikrofon izni alınamadı: ${err.message}`);
    }
  }

  // ========================================================
  //  HEARTBEAT: DataChannel'ı sıcak tut + ağ bilgisi paylaş
  //  Bu sayede ağ geçişinde DC daha uzun hayatta kalır
  // ========================================================
  _startHeartbeat() {
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    this._heartbeatInterval = setInterval(() => {
      this.broadcastDataChannel({ type: 'heartbeat', ts: Date.now(), peerId: this.myPeerId });
    }, 2000);
  }

  // ========================================================
  //  PEER CONNECTION OLUŞTURMA
  // ========================================================
  createPeerConnection(peerId, name = '', useLocalOnly = false) {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId).pc;
    }

    if (name) registerPeerName(peerId, name);

    const iceServers = useLocalOnly ? [] : ONLINE_ICE_SERVERS;
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 0 });

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.playsInline = true;

    const isPolite = this.myPeerId ? this.myPeerId > peerId : true;

    const peerEntry = {
      pc,
      dataChannel: null,
      audioEl,
      stream: null,
      levelMeter: null,
      name: name || 'Sürücü',
      state: 'connecting',
      disconnectTimeout: null,
      reconnectTimer: null,
      isMuted: false,
      stats: { rtt: 0, packetLoss: 0, candidateType: 'host', isLocal: true },
      pendingCandidates: [],
      makingOffer: false,
      isPolite,
      iceRestartAttempts: 0,
      lastConnectedTime: 0,
    };

    // ---- TRACK ----
    pc.ontrack = (event) => {
      console.log(`[MeshManager] 🔊 Ses bağlandı: ${peerId}`);
      const remoteStream = event.streams[0];
      peerEntry.stream = remoteStream;
      audioEl.srcObject = remoteStream;
      audioEl.play().catch(() => {});

      if (peerEntry.levelMeter) peerEntry.levelMeter.destroy();
      peerEntry.levelMeter = new AudioLevelMeter(remoteStream, (level, isSpeaking) => {
        if (this.onPeerVolumeChange) this.onPeerVolumeChange(peerId, level, isSpeaking);
      });
    };

    // ---- ICE CANDIDATE ----
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const payload = event.candidate.toJSON ? event.candidate.toJSON() : {
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      };

      // DataChannel üzerinden gönder (internetsiz çalışır)
      if (peerEntry.dataChannel && peerEntry.dataChannel.readyState === 'open') {
        try {
          peerEntry.dataChannel.send(JSON.stringify({ type: 'ice-candidate', candidate: payload }));
        } catch (_) {}
      }
      // Firebase üzerinden de gönder (internet varsa)
      this.sendSignal(peerId, { candidate: payload });
    };

    // ---- BAĞLANTI DURUMU ----
    const updateConnState = () => {
      const pcState = pc.connectionState;
      const iceState = pc.iceConnectionState;

      if (pcState === 'connected' || iceState === 'connected' || iceState === 'completed') {
        // ✅ BAĞLANDI
        if (peerEntry.disconnectTimeout) {
          clearTimeout(peerEntry.disconnectTimeout);
          peerEntry.disconnectTimeout = null;
        }
        if (peerEntry.reconnectTimer) {
          clearTimeout(peerEntry.reconnectTimer);
          peerEntry.reconnectTimer = null;
        }
        peerEntry.iceRestartAttempts = 0;
        peerEntry.lastConnectedTime = Date.now();

        if (peerEntry.state !== 'connected') {
          if (peerEntry.state === 'reconnecting') {
            this.onPeerReconnect(peerId);
          }
          peerEntry.state = 'connected';
          this.notifyStateChange(peerId, 'connected');
        }
      } else if (pcState === 'disconnected' || iceState === 'disconnected') {
        // ⚠️ KOPTU - Hemen ICE Restart dene!
        peerEntry.state = 'reconnecting';
        this.notifyStateChange(peerId, 'reconnecting');
        this._immediateIceRestart(peerId);
      } else if (pcState === 'failed' || iceState === 'failed') {
        // ❌ BAŞARISIZ - Agresif yeniden deneme
        peerEntry.state = 'reconnecting';
        this.notifyStateChange(peerId, 'reconnecting');
        this._immediateIceRestart(peerId);
      } else if (pcState === 'connecting' || iceState === 'checking' || iceState === 'new') {
        peerEntry.state = 'connecting';
        this.notifyStateChange(peerId, 'connecting');
      }
    };

    pc.onconnectionstatechange = updateConnState;
    pc.oniceconnectionstatechange = updateConnState;

    // ---- DATA CHANNEL ----
    try {
      const dc = pc.createDataChannel('control', { negotiated: true, id: 0 });
      this._setupDataChannel(peerId, dc, peerEntry);
    } catch (_) {}

    pc.ondatachannel = (event) => {
      this._setupDataChannel(peerId, event.channel, peerEntry);
    };

    this.peers.set(peerId, peerEntry);
    return pc;
  }

  // ========================================================
  //  DATA CHANNEL KURULUMU (ICE Restart mesajları dahil)
  // ========================================================
  _setupDataChannel(peerId, dc, peerEntry) {
    peerEntry.dataChannel = dc;

    dc.onopen = () => {
      console.log(`[DataChannel] ✅ Açıldı: ${peerId}`);
      try { dc.send(JSON.stringify({ type: 'mic-state', isMuted: this.isMuted })); } catch (_) {}
    };

    dc.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          // ⭐ ICE Restart Teklifi (DataChannel üzerinden - internetsiz çalışır!)
          case 'ice-restart-offer': {
            console.log(`[DC] ICE Restart teklifi alındı: ${peerId}`);
            const pc = peerEntry.pc;
            try {
              if (pc.signalingState !== 'stable') {
                await pc.setLocalDescription({ type: 'rollback' });
              }
            } catch (_) {}
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            dc.send(JSON.stringify({
              type: 'ice-restart-answer',
              sdp: { type: answer.type, sdp: answer.sdp },
            }));

            // Bekleyen adayları uygula
            if (msg.candidates && msg.candidates.length > 0) {
              for (const c of msg.candidates) {
                try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
              }
            }
            break;
          }

          // ⭐ ICE Restart Cevabı
          case 'ice-restart-answer': {
            console.log(`[DC] ICE Restart cevabı alındı: ${peerId}`);
            const pc = peerEntry.pc;
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            if (msg.candidates && msg.candidates.length > 0) {
              for (const c of msg.candidates) {
                try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
              }
            }
            break;
          }

          case 'ice-candidate': {
            const pc = peerEntry.pc;
            if (msg.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch (_) {}
              } else {
                peerEntry.pendingCandidates.push(msg.candidate);
              }
            }
            break;
          }

          case 'mic-state':
            peerEntry.isMuted = !!msg.isMuted;
            this.notifyStateChange(peerId, peerEntry.state);
            break;

          case 'horn-alert':
            if (this.onHornReceived) this.onHornReceived(peerId, peerEntry.name);
            break;

          case 'heartbeat':
            // DC canlı - iyi
            break;

          default: break;
        }
      } catch (err) {
        console.warn('[DC] Mesaj hatası:', err);
      }
    };
  }

  // ========================================================
  //  ⭐⭐⭐ ULTRA-HIZLI ICE RESTART (DataChannel üzerinden)
  //  Ağ değiştiğinde 200ms içinde ICE Restart teklifini
  //  DataChannel'dan geçirmeye çalışır
  // ========================================================
  async _immediateIceRestart(peerId) {
    const entry = this.peers.get(peerId);
    if (!entry) return;

    entry.iceRestartAttempts++;
    const attempt = entry.iceRestartAttempts;

    // 8 denemeden sonra vazgeç
    if (attempt > 8) {
      console.log(`[ICE Restart] ❌ ${attempt} deneme sonrası başarısız: ${peerId}`);
      if (!entry.disconnectTimeout) {
        entry.disconnectTimeout = setTimeout(() => {
          peerEntry_checkFinalState(this, peerId, entry);
        }, 3000);
      }
      return;
    }

    console.log(`[ICE Restart] Deneme #${attempt} - ${peerId}`);

    const pc = entry.pc;
    const dc = entry.dataChannel;
    const dcAlive = dc && dc.readyState === 'open';

    // DataChannel veya Firebase üzerinden ICE Restart
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      const offerPayload = { type: offer.type, sdp: offer.sdp };

      // Toplanan yeni ICE adaylarını bekle (100ms)
      const candidates = [];
      const origHandler = pc.onicecandidate;
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const cj = e.candidate.toJSON ? e.candidate.toJSON() : {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
          };
          candidates.push(cj);
          // Her yeni aday geldiğinde DC'den gönder
          if (dcAlive) {
            try { dc.send(JSON.stringify({ type: 'ice-candidate', candidate: cj })); } catch (_) {}
          }
        }
        // Orijinal handler'ı da çağır (Firebase)
        if (origHandler) origHandler(e);
      };

      // DataChannel üzerinden ICE Restart teklifi gönder
      if (dcAlive) {
        try {
          dc.send(JSON.stringify({
            type: 'ice-restart-offer',
            sdp: offerPayload,
            candidates,
          }));
          console.log(`[ICE Restart] ✅ Teklif DataChannel üzerinden gönderildi: ${peerId}`);
        } catch (err) {
          console.warn(`[ICE Restart] DC gönderme hatası:`, err.message);
        }
      }

      // Firebase üzerinden de dene
      this.sendSignal(peerId, { sdp: offerPayload });

    } catch (err) {
      console.warn(`[ICE Restart] Teklif oluşturma hatası:`, err.message);
    }

    // Sonraki denemeyi zamanla (giderek artan aralıkla)
    const nextDelay = Math.min(500 * attempt, 4000);
    entry.reconnectTimer = setTimeout(() => {
      if (entry.state !== 'connected' && entry.iceRestartAttempts <= 8) {
        this._immediateIceRestart(peerId);
      }
    }, nextDelay);
  }

  // ========================================================
  //  AĞ DEĞİŞİMİ ALGILANDI - Tüm peerlar için ICE Restart
  // ========================================================
  async restartIceForAllPeers() {
    console.log('[MeshManager] 🌐 Ağ değişimi - tüm peerlar için ICE Restart');
    for (const [peerId, entry] of this.peers.entries()) {
      if (entry.state === 'connected' || entry.state === 'reconnecting') {
        entry.iceRestartAttempts = 0; // Sıfırla, yeniden dene
        this._immediateIceRestart(peerId);
      }
    }
  }

  // ========================================================
  //  STANDART BAĞLANTI
  // ========================================================
  async connectToPeer(peerId, name) {
    console.log(`[MeshManager] Bağlanılıyor -> ${name} (${peerId})`);
    const pc = this.createPeerConnection(peerId, name);
    const entry = this.peers.get(peerId);
    try {
      if (entry) entry.makingOffer = true;
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      this.sendSignal(peerId, { sdp: { type: offer.type, sdp: offer.sdp }, name });
    } catch (err) {
      console.error(`[MeshManager] Teklif hatası (${peerId}):`, err);
    } finally {
      if (entry) entry.makingOffer = false;
    }
  }

  // W3C Polite Peer sinyal işleme
  async handleSignal(fromPeerId, data, name) {
    let entry = this.peers.get(fromPeerId);
    if (!entry) {
      this.createPeerConnection(fromPeerId, name);
      entry = this.peers.get(fromPeerId);
    }
    if (name && entry) { entry.name = name; registerPeerName(fromPeerId, name); }

    const pc = entry.pc;
    try {
      if (data.sdp) {
        const isOffer = data.sdp.type === 'offer';
        const collision = isOffer && (entry.makingOffer || pc.signalingState !== 'stable');
        if (collision && !entry.isPolite) return;
        if (collision && entry.isPolite) {
          try { await pc.setLocalDescription({ type: 'rollback' }); } catch (_) {}
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (entry.pendingCandidates.length > 0) {
          for (const c of entry.pendingCandidates) {
            try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
          }
          entry.pendingCandidates = [];
        }
        if (isOffer) {
          const answer = await pc.createAnswer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(answer);
          this.sendSignal(fromPeerId, { sdp: { type: answer.type, sdp: answer.sdp } });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          entry.pendingCandidates.push(data.candidate);
        }
      }
    } catch (err) {
      console.error(`[MeshManager] Sinyal hatası (${fromPeerId}):`, err);
    }
  }

  // ========================================================
  //  ÇEVRIMDIŞI QR BAĞLANTI (son çare fallback)
  // ========================================================
  async createOfflineOffer(peerId = 'offline_peer', name = 'Lider') {
    const pc = this.createPeerConnection(peerId, name, true);
    const candidates = [];
    return new Promise(async (resolve, reject) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, candidates }); };
      pc.onicecandidate = (e) => { if (e.candidate) candidates.push(e.candidate.candidate); else finish(); };
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        setTimeout(finish, 800);
      } catch (err) { reject(err); }
    });
  }

  async acceptOfflineOfferAndCreateAnswer(peerId = 'offline_peer', offerSdp, offerCandidates = [], name = 'Sürücü') {
    const pc = this.createPeerConnection(peerId, name, true);
    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    for (const c of offerCandidates) {
      if (c) { try { await pc.addIceCandidate(new RTCIceCandidate({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 })); } catch (_) {} }
    }
    const answer = await pc.createAnswer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(answer);
    const candidates = [];
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; resolve({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, candidates }); };
      pc.onicecandidate = (e) => { if (e.candidate) candidates.push(e.candidate.candidate); else finish(); };
      setTimeout(finish, 800);
    });
  }

  async acceptOfflineAnswer(peerId = 'offline_peer', answerSdp, answerCandidates = []) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    await entry.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
    for (const c of answerCandidates) {
      if (c) { try { await entry.pc.addIceCandidate(new RTCIceCandidate({ candidate: c, sdpMid: '0', sdpMLineIndex: 0 })); } catch (_) {} }
    }
  }

  // ========================================================
  //  SES & KONTROL
  // ========================================================
  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.rawLocalStream) this.rawLocalStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
    if (this.localStream) this.localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
    this.broadcastDataChannel({ type: 'mic-state', isMuted });
  }

  sendHornAlert() {
    this.broadcastDataChannel({ type: 'horn-alert', timestamp: Date.now() });
  }

  broadcastDataChannel(payload) {
    const raw = JSON.stringify(payload);
    this.peers.forEach((entry) => {
      if (entry.dataChannel && entry.dataChannel.readyState === 'open') {
        try { entry.dataChannel.send(raw); } catch (_) {}
      }
    });
  }

  notifyStateChange(peerId, state) {
    if (this.onPeerStateChange) {
      const entry = this.peers.get(peerId);
      this.onPeerStateChange(peerId, {
        state,
        name: entry ? entry.name : 'Sürücü',
        isMuted: entry ? entry.isMuted : false,
        stats: entry ? entry.stats : null,
      });
    }
  }

  // ========================================================
  //  İSTATİSTİKLER
  // ========================================================
  startStatsMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(async () => {
      let totalRtt = 0, rttCount = 0, connectedCount = 0;
      for (const [peerId, entry] of this.peers.entries()) {
        const st = entry.pc.connectionState;
        const ice = entry.pc.iceConnectionState;
        if (st === 'connected' || ice === 'connected' || ice === 'completed') {
          connectedCount++;
          try {
            const stats = await entry.pc.getStats();
            let selectedPair = null;
            stats.forEach((r) => {
              if (r.type === 'transport' && r.selectedCandidatePairId) selectedPair = stats.get(r.selectedCandidatePairId);
              else if (r.type === 'candidate-pair' && r.selected) selectedPair = r;
            });
            let rtt = 12, isLocal = true;
            if (selectedPair) {
              rtt = Math.round((selectedPair.currentRoundTripTime || 0) * 1000) || 12;
              const lc = stats.get(selectedPair.localCandidateId);
              isLocal = !lc || lc.candidateType === 'host';
            }
            if (rtt > 0) { totalRtt += rtt; rttCount++; }
            entry.stats = { rtt, packetLoss: 0, candidateType: isLocal ? 'host' : 'srflx', isLocal };
            this.notifyStateChange(peerId, entry.state);
          } catch (_) {}
        }
      }
      if (this.onStatsUpdate) {
        this.onStatsUpdate({ isHotspotMode: connectedCount > 0, avgRtt: rttCount > 0 ? Math.round(totalRtt / rttCount) : 15, activePeersCount: connectedCount });
      }
    }, 2000);
  }

  removePeer(peerId) {
    const entry = this.peers.get(peerId);
    if (entry) {
      if (entry.disconnectTimeout) clearTimeout(entry.disconnectTimeout);
      if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
      if (entry.levelMeter) entry.levelMeter.destroy();
      try { entry.pc.close(); } catch (_) {}
      if (entry.audioEl) entry.audioEl.srcObject = null;
      unregisterPeerName(peerId);
      this.peers.delete(peerId);
    }
  }

  destroy() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    this.peers.forEach((_, pid) => this.removePeer(pid));
    this.peers.clear();
    if (this.localLevelMeter) { this.localLevelMeter.destroy(); this.localLevelMeter = null; }
    if (this.dspFilter) { this.dspFilter.destroy(); this.dspFilter = null; }
    if (this.rawLocalStream) { this.rawLocalStream.getTracks().forEach((t) => t.stop()); this.rawLocalStream = null; }
    this.localStream = null;
  }
}

// Yardımcı: Son durum kontrolü
function peerEntry_checkFinalState(manager, peerId, entry) {
  const pc = entry.pc;
  if (
    pc.connectionState !== 'connected' &&
    pc.iceConnectionState !== 'connected' &&
    pc.iceConnectionState !== 'completed'
  ) {
    entry.state = 'failed';
    manager.notifyStateChange(peerId, 'failed');
    manager.onPeerDisconnect(peerId);
  }
}
