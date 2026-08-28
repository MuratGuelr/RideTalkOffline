// WebRTC Full-Mesh Ses Yöneticisi (MeshManager)
// Her kullanıcı, odadaki diğer her katılımcı ile doğrudan p2p ses akışı kurar.
// Hotspot / internetsiz geçişte RTCDataChannel üzerinden doğrudan ICE restart desteği sağlar.

import { AudioLevelMeter } from './audioMeter.js';
import { registerPeerName, unregisterPeerName } from './announcer.js';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
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

    // peerId -> { pc, dataChannel, audioEl, stream, levelMeter, name, state, disconnectTimeout, isMuted, stats, pendingCandidates }
    this.peers = new Map();
    this.localStream = null;
    this.localLevelMeter = null;
    this.isMuted = false;
    this.statsInterval = null;
  }

  async init() {
    try {
      // Motosiklet ortamına optimize edilmiş mikrofon kısıtlamaları
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
        video: false,
      });

      // Kendi ses seviyemizi ölçen meter
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

  createPeerConnection(peerId, name = '') {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId).pc;
    }

    if (name) {
      registerPeerName(peerId, name);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 2,
    });

    // Kendi ses track'imizi ekle
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    // Karşı tarafın sesini oynatacak Audio elementi
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.playsInline = true;

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
      stats: { rtt: 0, packetLoss: 0, candidateType: 'bilinmiyor', isLocal: false },
      pendingCandidates: [], // ICE adayları remoteDescription set edilene kadar burada bekletilir
    };

    // Karşıdan gelen ses akışı
    pc.ontrack = (event) => {
      console.log(`[MeshManager] 🔊 Ses akışı bağlandı (${peerId}):`, event.streams[0]);
      const remoteStream = event.streams[0];
      peerEntry.stream = remoteStream;
      audioEl.srcObject = remoteStream;
      audioEl.play().catch((e) => console.warn('[MeshManager] Audio autoplay uyarısı:', e.message));

      if (peerEntry.levelMeter) {
        peerEntry.levelMeter.destroy();
      }
      peerEntry.levelMeter = new AudioLevelMeter(remoteStream, (level, isSpeaking) => {
        if (this.onPeerVolumeChange) {
          this.onPeerVolumeChange(peerId, level, isSpeaking);
        }
      });
    };

    // ICE Candidate takası
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Öncelik: Açık olan DataChannel üzerinden doğrudan karşıya gönder (internetsiz)
        if (peerEntry.dataChannel && peerEntry.dataChannel.readyState === 'open') {
          try {
            peerEntry.dataChannel.send(
              JSON.stringify({
                type: 'ice-candidate',
                candidate: event.candidate,
              })
            );
          } catch (_) {}
        }
        // Sinyalleşme üzerinden ilet
        this.sendSignal(peerId, { candidate: event.candidate });
      }
    };

    // Bağlantı durumu izleme (connectionState ve iceConnectionState)
    const updateConnState = () => {
      const state = pc.connectionState;
      const iceState = pc.iceConnectionState;
      console.log(`[MeshManager] Durum (${peerId}): PC=${state} | ICE=${iceState}`);

      if (state === 'connected' || iceState === 'connected' || iceState === 'completed') {
        if (peerEntry.disconnectTimeout) {
          clearTimeout(peerEntry.disconnectTimeout);
          peerEntry.disconnectTimeout = null;
          this.onPeerReconnect(peerId);
        }
        peerEntry.state = 'connected';
        this.notifyStateChange(peerId, 'connected');
      } else if (state === 'disconnected' || state === 'failed' || iceState === 'disconnected' || iceState === 'failed') {
        peerEntry.state = 'reconnecting';
        this.notifyStateChange(peerId, 'reconnecting');

        if (!peerEntry.disconnectTimeout) {
          peerEntry.disconnectTimeout = setTimeout(() => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
              peerEntry.state = 'failed';
              this.notifyStateChange(peerId, 'failed');
              this.onPeerDisconnect(peerId);
            }
          }, 4500);
        }
      }
    };

    pc.onconnectionstatechange = updateConnState;
    pc.oniceconnectionstatechange = updateConnState;

    // İnternetsiz haberleşme ve ICE takası için DataChannel oluştur
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
      console.log(`[DataChannel] Peer ile doğrudan kontrol kanalı açıldı: ${peerId}`);
      try {
        dc.send(JSON.stringify({ type: 'mic-state', isMuted: this.isMuted }));
      } catch (_) {}
    };

    dc.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'ice-restart-offer': {
            console.log(`[DataChannel] Internetsiz ICE Restart teklifi alındı: ${peerId}`);
            const pc = peerEntry.pc;
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            dc.send(
              JSON.stringify({
                type: 'ice-restart-answer',
                sdp: answer,
              })
            );
            break;
          }

          case 'ice-restart-answer': {
            console.log(`[DataChannel] Internetsiz ICE Restart cevabı alındı: ${peerId}`);
            const pc = peerEntry.pc;
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
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
            if (this.onHornReceived) {
              this.onHornReceived(peerId, peerEntry.name);
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.warn('[DataChannel] Mesaj işleme hatası:', err);
      }
    };
  }

  async connectToPeer(peerId, name) {
    console.log(`[MeshManager] Peer'a bağlanılıyor -> ${name} (${peerId})`);
    const pc = this.createPeerConnection(peerId, name);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);
      this.sendSignal(peerId, { sdp: offer, name });
    } catch (err) {
      console.error(`[MeshManager] ${peerId} için teklif oluşturulamadı:`, err);
    }
  }

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
        console.log(`[MeshManager] SDP (${data.sdp.type}) alındı: ${fromPeerId}`);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Bekleyen ICE adaylarını ekle
        if (entry.pendingCandidates && entry.pendingCandidates.length > 0) {
          for (const cand of entry.pendingCandidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('[MeshManager] Bekleyen ICE adayı eklenemedi:', e.message);
            }
          }
          entry.pendingCandidates = [];
        }

        if (data.sdp.type === 'offer') {
          const answer = await pc.createAnswer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(answer);
          this.sendSignal(fromPeerId, { sdp: answer });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          // Henüz remoteDescription set edilmediyse kuyrukta beklet
          entry.pendingCandidates.push(data.candidate);
        }
      }
    } catch (err) {
      console.error(`[MeshManager] Sinyal işleme hatası (${fromPeerId}):`, err);
    }
  }

  // Hotspot / Ağ değişikliğinde SUNUCUSUZ yerel ICE Restart
  async restartIceForAllPeers() {
    console.log('[MeshManager] Tüm peerlar için ICE Restart başlatılıyor...');
    for (const [peerId, entry] of this.peers.entries()) {
      try {
        const pc = entry.pc;
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);

        if (entry.dataChannel && entry.dataChannel.readyState === 'open') {
          entry.dataChannel.send(
            JSON.stringify({
              type: 'ice-restart-offer',
              sdp: offer,
            })
          );
        }

        this.sendSignal(peerId, { sdp: offer });
      } catch (err) {
        console.warn(`[MeshManager] ICE Restart hatası (${peerId}):`, err);
      }
    }
  }

  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    this.broadcastDataChannel({
      type: 'mic-state',
      isMuted,
    });
  }

  sendHornAlert() {
    this.broadcastDataChannel({
      type: 'horn-alert',
      timestamp: Date.now(),
    });
  }

  broadcastDataChannel(payload) {
    const raw = JSON.stringify(payload);
    this.peers.forEach((entry) => {
      if (entry.dataChannel && entry.dataChannel.readyState === 'open') {
        try {
          entry.dataChannel.send(raw);
        } catch (_) {}
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
      let anyLocalCandidate = false;
      let totalRtt = 0;
      let rttCount = 0;

      for (const [peerId, entry] of this.peers.entries()) {
        if (entry.pc && entry.pc.connectionState === 'connected') {
          try {
            const stats = await entry.pc.getStats();
            let selectedCandidatePair = null;

            stats.forEach((report) => {
              if (report.type === 'transport' && report.selectedCandidatePairId) {
                selectedCandidatePair = stats.get(report.selectedCandidatePairId);
              } else if (report.type === 'candidate-pair' && report.selected) {
                selectedCandidatePair = report;
              }
            });

            if (selectedCandidatePair) {
              const localCandidate = stats.get(selectedCandidatePair.localCandidateId);
              const rtt = Math.round((selectedCandidatePair.currentRoundTripTime || 0) * 1000);
              const isLocal = localCandidate?.candidateType === 'host';

              if (isLocal) anyLocalCandidate = true;
              if (rtt > 0) {
                totalRtt += rtt;
                rttCount++;
              }

              entry.stats = {
                rtt: rtt || 15,
                packetLoss: 0,
                candidateType: localCandidate?.candidateType || 'host',
                isLocal,
              };

              this.notifyStateChange(peerId, entry.state);
            }
          } catch (_) {}
        }
      }

      if (this.onStatsUpdate) {
        this.onStatsUpdate({
          isHotspotMode: anyLocalCandidate,
          avgRtt: rttCount > 0 ? Math.round(totalRtt / rttCount) : 18,
          activePeersCount: Array.from(this.peers.values()).filter((p) => p.state === 'connected').length,
        });
      }
    }, 2000);
  }

  removePeer(peerId) {
    const entry = this.peers.get(peerId);
    if (entry) {
      if (entry.disconnectTimeout) clearTimeout(entry.disconnectTimeout);
      if (entry.levelMeter) entry.levelMeter.destroy();
      try {
        entry.pc.close();
      } catch (_) {}
      if (entry.audioEl) {
        entry.audioEl.srcObject = null;
      }
      unregisterPeerName(peerId);
      this.peers.delete(peerId);
    }
  }

  destroy() {
    if (this.statsInterval) clearInterval(this.statsInterval);
    this.peers.forEach((_, peerId) => this.removePeer(peerId));
    this.peers.clear();

    if (this.localLevelMeter) {
      this.localLevelMeter.destroy();
      this.localLevelMeter = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
  }
}
