// WebRTC Full-Mesh Ses Yöneticisi (MeshManager)
// Motosiklet kask sesi, hotspot geçişi, W3C Polite Peer, DSP filtresi.
// Hotspot geçişinde DataChannel hayattayken yeni bağlantıyı kurar,
// başarısız olursa dışarıya onReconnectionFailed callback bildirir.

import { AudioLevelMeter } from './audioMeter.js';
import { registerPeerName, unregisterPeerName } from './announcer.js';
import { createMotorcycleAudioFilter } from './audioFilter.js';

// STUN sunucuları: İnternet olan normal modda kullanılır
const ONLINE_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// STUN olmadan sadece yerel host adaylarını topla (0 internet hotspot)
const LOCAL_ONLY_ICE_SERVERS = [];

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
    this._reconnectionFailureTimer = null;
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
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
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

      this.startStatsMonitoring();
      return this.localStream;
    } catch (err) {
      console.error('[MeshManager] Mikrofon başlatılamadı:', err);
      throw new Error(`Mikrofon izni alınamadı: ${err.message}`);
    }
  }

  createPeerConnection(peerId, name = '', useLocalOnly = false) {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId).pc;
    }

    if (name) {
      registerPeerName(peerId, name);
    }

    const iceServers = useLocalOnly ? LOCAL_ONLY_ICE_SERVERS : ONLINE_ICE_SERVERS;

    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 0,
    });

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
      isMuted: false,
      stats: { rtt: 0, packetLoss: 0, candidateType: 'host', isLocal: true },
      pendingCandidates: [],
      makingOffer: false,
      isPolite,
    };

    pc.ontrack = (event) => {
      console.log(`[MeshManager] 🔊 Ses bağlandı (${peerId})`);
      const remoteStream = event.streams[0];
      peerEntry.stream = remoteStream;
      audioEl.srcObject = remoteStream;
      audioEl.play().catch((e) => console.warn('[MeshManager] Audio play:', e.message));

      if (peerEntry.levelMeter) peerEntry.levelMeter.destroy();
      peerEntry.levelMeter = new AudioLevelMeter(remoteStream, (level, isSpeaking) => {
        if (this.onPeerVolumeChange) this.onPeerVolumeChange(peerId, level, isSpeaking);
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const payload = event.candidate.toJSON
          ? event.candidate.toJSON()
          : {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            };

        // 1. DataChannel üzerinden (internetsiz çalışır)
        if (peerEntry.dataChannel && peerEntry.dataChannel.readyState === 'open') {
          try {
            peerEntry.dataChannel.send(JSON.stringify({ type: 'ice-candidate', candidate: payload }));
          } catch (_) {}
        }

        // 2. Sinyal sunucusu üzerinden (internet varsa)
        this.sendSignal(peerId, { candidate: payload });
      }
    };

    const updateConnState = () => {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;
      console.log(`[MeshManager] (${peerId}): PC=${state} ICE=${iceState}`);

      if (state === 'connected' || iceState === 'connected' || iceState === 'completed') {
        if (peerEntry.disconnectTimeout) {
          clearTimeout(peerEntry.disconnectTimeout);
          peerEntry.disconnectTimeout = null;
          this.onPeerReconnect(peerId);
        }
        // Yeniden bağlantı zamanlayıcısını temizle
        if (this._reconnectionFailureTimer) {
          clearTimeout(this._reconnectionFailureTimer);
          this._reconnectionFailureTimer = null;
        }
        peerEntry.state = 'connected';
        this.notifyStateChange(peerId, 'connected');
      } else if (state === 'connecting' || iceState === 'checking' || iceState === 'new') {
        peerEntry.state = 'connecting';
        this.notifyStateChange(peerId, 'connecting');
      } else if (state === 'disconnected' || state === 'failed' || iceState === 'disconnected' || iceState === 'failed') {
        peerEntry.state = 'reconnecting';
        this.notifyStateChange(peerId, 'reconnecting');

        if (!peerEntry.disconnectTimeout) {
          peerEntry.disconnectTimeout = setTimeout(() => {
            if (
              pc.connectionState !== 'connected' &&
              pc.iceConnectionState !== 'connected' &&
              pc.iceConnectionState !== 'completed'
            ) {
              peerEntry.state = 'failed';
              this.notifyStateChange(peerId, 'failed');
              this.onPeerDisconnect(peerId);
            }
          }, 10000);
        }
      }
    };

    pc.onconnectionstatechange = updateConnState;
    pc.oniceconnectionstatechange = updateConnState;

    try {
      const dc = pc.createDataChannel('control', { negotiated: false });
      this.setupDataChannel(peerId, dc, peerEntry);
    } catch (_) {}

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel, peerEntry);
    };

    this.peers.set(peerId, peerEntry);
    return pc;
  }

  setupDataChannel(peerId, dc, peerEntry) {
    peerEntry.dataChannel = dc;

    dc.onopen = () => {
      console.log(`[DataChannel] Açıldı: ${peerId}`);
      try { dc.send(JSON.stringify({ type: 'mic-state', isMuted: this.isMuted })); } catch (_) {}
    };

    dc.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'ice-restart-offer': {
            console.log(`[DataChannel] ICE Restart teklifi alındı: ${peerId}`);
            const pc = peerEntry.pc;
            try {
              if (pc.signalingState !== 'stable') {
                await pc.setLocalDescription({ type: 'rollback' });
              }
            } catch (_) {}
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            dc.send(JSON.stringify({ type: 'ice-restart-answer', sdp: { type: answer.type, sdp: answer.sdp } }));
            break;
          }

          case 'ice-restart-answer': {
            console.log(`[DataChannel] ICE Restart cevabı alındı: ${peerId}`);
            await peerEntry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            break;
          }

          case 'ice-candidate': {
            const pc = peerEntry.pc;
            if (msg.candidate) {
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } else {
                peerEntry.pendingCandidates.push(msg.candidate);
              }
            }
            break;
          }

          case 'mic-state': {
            peerEntry.isMuted = !!msg.isMuted;
            this.notifyStateChange(peerId, peerEntry.state);
            break;
          }

          case 'horn-alert': {
            if (this.onHornReceived) this.onHornReceived(peerId, peerEntry.name);
            break;
          }

          default: break;
        }
      } catch (err) {
        console.warn('[DataChannel] Mesaj hatası:', err);
      }
    };
  }

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

    if (name && entry) {
      entry.name = name;
      registerPeerName(fromPeerId, name);
    }

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

  // ==============================
  // HOTSPOT GEÇİŞ ICE RESTART
  // ==============================
  async restartIceForAllPeers(attemptNumber = 0) {
    console.log(`[MeshManager] ICE Restart deneme #${attemptNumber + 1}`);

    let anySuccess = false;
    let anyDataChannelAlive = false;

    for (const [peerId, entry] of this.peers.entries()) {
      const dc = entry.dataChannel;
      const dcAlive = dc && dc.readyState === 'open';

      if (dcAlive) {
        anyDataChannelAlive = true;
        try {
          // Sadece Polite peer teklif gönderir (çift teklif çakışmasını önler)
          if (entry.isPolite) {
            const pc = entry.pc;
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            const offerPayload = { type: offer.type, sdp: offer.sdp };

            dc.send(JSON.stringify({ type: 'ice-restart-offer', sdp: offerPayload }));
            console.log(`[MeshManager] ICE Restart teklifi DataChannel üzerinden gönderildi -> ${peerId}`);
            anySuccess = true;
          }
        } catch (err) {
          console.warn(`[MeshManager] ICE Restart hatası (${peerId}):`, err.message);
        }
      }

      // DataChannel ölmüşse Firebase üzerinden de dene
      try {
        const pc = entry.pc;
        if (entry.isPolite && !dcAlive) {
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          this.sendSignal(peerId, { sdp: { type: offer.type, sdp: offer.sdp } });
        }
      } catch (_) {}
    }

    // DataChannel zaten ölüyse ve son denemeyse -> kullanıcıya bildir
    if (!anyDataChannelAlive && attemptNumber >= 2) {
      this._startReconnectionFailureCountdown();
    }

    return anySuccess;
  }

  _startReconnectionFailureCountdown() {
    if (this._reconnectionFailureTimer) return;

    // Tüm peerlar hala kopuksa 8sn sonra onReconnectionFailed callback'i çağır
    this._reconnectionFailureTimer = setTimeout(() => {
      let allDisconnected = true;
      for (const [, entry] of this.peers.entries()) {
        if (entry.state === 'connected') {
          allDisconnected = false;
          break;
        }
      }

      if (allDisconnected && this.peers.size > 0) {
        console.log('[MeshManager] ❌ Otomatik ICE Restart başarısız. Çevrimdışı QR eşleşme öneriliyor.');
        this.onReconnectionFailed();
      }
      this._reconnectionFailureTimer = null;
    }, 8000);
  }

  // %100 Çevrimdışı QR Eşleşme Metodları
  async createOfflineOffer(peerId = 'offline_peer', name = 'Lider') {
    const pc = this.createPeerConnection(peerId, name, true);
    const candidates = [];

    return new Promise(async (resolve, reject) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve({ sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }, candidates });
      };
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

  startStatsMonitoring() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.statsInterval = setInterval(async () => {
      let totalRtt = 0;
      let rttCount = 0;
      let connectedCount = 0;

      for (const [peerId, entry] of this.peers.entries()) {
        if (entry.pc && (entry.pc.connectionState === 'connected' || entry.pc.iceConnectionState === 'connected' || entry.pc.iceConnectionState === 'completed')) {
          connectedCount++;
          try {
            const stats = await entry.pc.getStats();
            let selectedPair = null;
            stats.forEach((r) => {
              if (r.type === 'transport' && r.selectedCandidatePairId) selectedPair = stats.get(r.selectedCandidatePairId);
              else if (r.type === 'candidate-pair' && r.selected) selectedPair = r;
            });
            let rtt = 12;
            let isLocal = true;
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
        this.onStatsUpdate({
          isHotspotMode: connectedCount > 0,
          avgRtt: rttCount > 0 ? Math.round(totalRtt / rttCount) : 15,
          activePeersCount: connectedCount,
        });
      }
    }, 2000);
  }

  removePeer(peerId) {
    const entry = this.peers.get(peerId);
    if (entry) {
      if (entry.disconnectTimeout) clearTimeout(entry.disconnectTimeout);
      if (entry.levelMeter) entry.levelMeter.destroy();
      try { entry.pc.close(); } catch (_) {}
      if (entry.audioEl) entry.audioEl.srcObject = null;
      unregisterPeerName(peerId);
      this.peers.delete(peerId);
    }
  }

  destroy() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this._reconnectionFailureTimer) clearTimeout(this._reconnectionFailureTimer);
    this.peers.forEach((_, pid) => this.removePeer(pid));
    this.peers.clear();
    if (this.localLevelMeter) { this.localLevelMeter.destroy(); this.localLevelMeter = null; }
    if (this.dspFilter) { this.dspFilter.destroy(); this.dspFilter = null; }
    if (this.rawLocalStream) { this.rawLocalStream.getTracks().forEach((t) => t.stop()); this.rawLocalStream = null; }
    this.localStream = null;
  }
}
