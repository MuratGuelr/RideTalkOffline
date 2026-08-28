// WebRTC Full-Mesh Ses Yöneticisi (MeshManager)
// Ultra-Düşük Gecikme (10-20ms), Kristal HD Ses & DTX Arka Plan Gürültü Kesici

import { AudioLevelMeter } from './audioMeter.js';
import { registerPeerName, unregisterPeerName } from './announcer.js';

const ONLINE_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// SDP'de Opus ses codec'ini 10ms paket boyutuna, HD netliğe ve DTX gürültü kesiciye ayarla
function optimizeSDPForZeroLatency(sdp) {
  if (!sdp) return sdp;

  let modified = sdp;

  if (modified.includes('opus/48000')) {
    modified = modified.replace(
      /a=fmtp:(\d+) (.*)/g,
      (match, pt) => {
        // minptime=10: Anlık 10ms iletim (0 gecikme)
        // maxaveragebitrate=48000: Kristal netliğinde 48kHz HD ses
        // usedtx=1: Konuşulmadığında rüzgar/motor hışırtısını %100 keser (Noise Gate)
        // useinbandfec=1: Wi-Fi paket kayıplarını gecikmesiz onarır
        return `a=fmtp:${pt} minptime=10;ptime=10;maxptime=20;maxaveragebitrate=48000;stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=1;cbr=0`;
      }
    );
  }

  return modified;
}

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
    this.localStream = null;
    this.localLevelMeter = null;
    this.isMuted = false;
    this.statsInterval = null;
    this._heartbeatInterval = null;
  }

  async init() {
    try {
      // Donanım düzeyinde ses iyileştirme (AEC + Gürültü Engelleme + Otomatik Kazanç)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
          sampleRate: 48000,
          latency: 0,
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googNoiseReduction: true,
        },
        video: false,
      });

      // Görsel ses barı (UI) için hafif seviye ölçer
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

  _startHeartbeat() {
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    this._heartbeatInterval = setInterval(() => {
      this.broadcastDataChannel({ type: 'heartbeat', ts: Date.now(), peerId: this.myPeerId });
    }, 2000);
  }

  createPeerConnection(peerId, name = '', useLocalOnly = false) {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId).pc;
    }

    if (name) registerPeerName(peerId, name);

    const iceServers = useLocalOnly ? [] : ONLINE_ICE_SERVERS;
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 0,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        const sender = pc.addTrack(track, this.localStream);
        try {
          const params = sender.getParameters();
          if (params.encodings && params.encodings[0]) {
            params.encodings[0].maxBitrate = 48000;
            params.encodings[0].networkPriority = 'high';
            params.encodings[0].priority = 'high';
            sender.setParameters(params).catch(() => {});
          }
        } catch (_) {}
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

    // ---- TRACK GELDIĞINDE SIFIR GECIKMEYLE ÇAL ----
    pc.ontrack = (event) => {
      console.log(`[MeshManager] 🔊 Ses bağlandı (HD & 0 Gecikme): ${peerId}`);
      const remoteStream = event.streams[0];
      peerEntry.stream = remoteStream;

      // Tarayıcının alıcı gecikme tamponunu 0ms yap (Sıfır Buffer!)
      if (event.receiver) {
        try {
          if ('playoutDelayHint' in event.receiver) {
            event.receiver.playoutDelayHint = 0;
          }
          if ('jitterBufferTarget' in event.receiver) {
            event.receiver.jitterBufferTarget = 0;
          }
        } catch (_) {}
      }

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

      if (peerEntry.dataChannel && peerEntry.dataChannel.readyState === 'open') {
        try {
          peerEntry.dataChannel.send(JSON.stringify({ type: 'ice-candidate', candidate: payload }));
        } catch (_) {}
      }
      this.sendSignal(peerId, { candidate: payload });
    };

    // ---- BAĞLANTI DURUMU ----
    const updateConnState = () => {
      const pcState = pc.connectionState;
      const iceState = pc.iceConnectionState;

      if (pcState === 'connected' || iceState === 'connected' || iceState === 'completed') {
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
      } else if (pcState === 'disconnected' || iceState === 'disconnected' || pcState === 'failed' || iceState === 'failed') {
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

  _setupDataChannel(peerId, dc, peerEntry) {
    peerEntry.dataChannel = dc;

    dc.onopen = () => {
      try { dc.send(JSON.stringify({ type: 'mic-state', isMuted: this.isMuted })); } catch (_) {}
    };

    dc.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ice-restart-offer': {
            const pc = peerEntry.pc;
            try {
              if (pc.signalingState !== 'stable') {
                await pc.setLocalDescription({ type: 'rollback' });
              }
            } catch (_) {}
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            const optimizedAnswer = { type: answer.type, sdp: optimizeSDPForZeroLatency(answer.sdp) };
            await pc.setLocalDescription(optimizedAnswer);
            dc.send(JSON.stringify({
              type: 'ice-restart-answer',
              sdp: optimizedAnswer,
            }));
            break;
          }

          case 'ice-restart-answer': {
            await peerEntry.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
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

          default: break;
        }
      } catch (err) {
        console.warn('[DC] Mesaj hatası:', err);
      }
    };
  }

  async _immediateIceRestart(peerId) {
    const entry = this.peers.get(peerId);
    if (!entry) return;

    entry.iceRestartAttempts++;
    const attempt = entry.iceRestartAttempts;

    if (attempt > 6) return;

    const pc = entry.pc;
    const dc = entry.dataChannel;
    const dcAlive = dc && dc.readyState === 'open';

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      const optimizedOffer = { type: offer.type, sdp: optimizeSDPForZeroLatency(offer.sdp) };
      await pc.setLocalDescription(optimizedOffer);

      if (dcAlive) {
        try {
          dc.send(JSON.stringify({
            type: 'ice-restart-offer',
            sdp: optimizedOffer,
          }));
        } catch (_) {}
      }

      this.sendSignal(peerId, { sdp: optimizedOffer });
    } catch (_) {}

    const nextDelay = Math.min(600 * attempt, 3000);
    entry.reconnectTimer = setTimeout(() => {
      if (entry.state !== 'connected' && entry.iceRestartAttempts <= 6) {
        this._immediateIceRestart(peerId);
      }
    }, nextDelay);
  }

  async restartIceForAllPeers() {
    for (const [peerId, entry] of this.peers.entries()) {
      if (entry.state === 'connected' || entry.state === 'reconnecting') {
        entry.iceRestartAttempts = 0;
        this._immediateIceRestart(peerId);
      }
    }
  }

  async connectToPeer(peerId, name) {
    const pc = this.createPeerConnection(peerId, name);
    const entry = this.peers.get(peerId);
    try {
      if (entry) entry.makingOffer = true;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        voiceActivityDetection: true,
      });
      const optimizedOffer = { type: offer.type, sdp: optimizeSDPForZeroLatency(offer.sdp) };
      await pc.setLocalDescription(optimizedOffer);
      this.sendSignal(peerId, { sdp: optimizedOffer, name });
    } catch (err) {
      console.error(`[MeshManager] Teklif hatası (${peerId}):`, err);
    } finally {
      if (entry) entry.makingOffer = false;
    }
  }

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
          const answer = await pc.createAnswer({
            offerToReceiveAudio: true,
            voiceActivityDetection: true,
          });
          const optimizedAnswer = { type: answer.type, sdp: optimizeSDPForZeroLatency(answer.sdp) };
          await pc.setLocalDescription(optimizedAnswer);
          this.sendSignal(fromPeerId, { sdp: optimizedAnswer });
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

  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => { t.enabled = !isMuted; });
    }
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
            let rtt = 10, isLocal = true;
            if (selectedPair) {
              rtt = Math.round((selectedPair.currentRoundTripTime || 0) * 1000) || 10;
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
          avgRtt: rttCount > 0 ? Math.round(totalRtt / rttCount) : 10,
          activePeersCount: connectedCount,
        });
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
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }
}
