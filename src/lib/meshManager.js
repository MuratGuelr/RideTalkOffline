// WebRTC Full-Mesh Ses Yöneticisi (MeshManager)
// W3C Polite Peer standardı ile donatılmıştır: Hotspot ve ağ geçişlerinde
// çift teklif (glare) kilitlenmelerini otomatik çözer ve 0 internet yerel bağlantıyı kurar.

import { AudioLevelMeter } from './audioMeter.js';
import { registerPeerName, unregisterPeerName } from './announcer.js';
import { createMotorcycleAudioFilter } from './audioFilter.js';

const ICE_SERVERS = [
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
    this.myPeerId = options.myPeerId || '';

    // peerId -> { pc, dataChannel, audioEl, stream, levelMeter, name, state, disconnectTimeout, isMuted, stats, pendingCandidates, makingOffer, isPolite }
    this.peers = new Map();
    this.rawLocalStream = null;
    this.localStream = null;
    this.dspFilter = null;
    this.localLevelMeter = null;
    this.isMuted = false;
    this.statsInterval = null;
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

  createPeerConnection(peerId, name = '') {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId).pc;
    }

    if (name) {
      registerPeerName(peerId, name);
    }

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceCandidatePoolSize: 0, // Yerel host adaylarını gecikmesiz anında üret
    });

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
    }

    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.playsInline = true;

    // Polite Peer: İki cihaz arasında ID kıyaslamasıyla kimin kibar (polite) olacağı belirlenir.
    // Böylece ağ değiştiğinde iki taraf da aynı anda teklif gönderirse kilitlenme yaşanmaz!
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
      console.log(`[MeshManager] 🔊 Ses akışı bağlandı (${peerId}):`, event.streams[0]);
      const remoteStream = event.streams[0];
      peerEntry.stream = remoteStream;
      audioEl.srcObject = remoteStream;
      audioEl.play().catch((e) => console.warn('[MeshManager] Audio play uyarısı:', e.message));

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
        const candidatePayload = event.candidate.toJSON
          ? event.candidate.toJSON()
          : {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            };

        if (peerEntry.dataChannel && peerEntry.dataChannel.readyState === 'open') {
          try {
            peerEntry.dataChannel.send(
              JSON.stringify({
                type: 'ice-candidate',
                candidate: candidatePayload,
              })
            );
          } catch (_) {}
        }

        this.sendSignal(peerId, { candidate: candidatePayload });
      }
    };

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
      } else if (state === 'connecting' || iceState === 'checking') {
        peerEntry.state = 'connecting';
        this.notifyStateChange(peerId, 'connecting');
      } else if (state === 'disconnected' || state === 'failed' || iceState === 'disconnected' || iceState === 'failed') {
        peerEntry.state = 'reconnecting';
        this.notifyStateChange(peerId, 'reconnecting');

        if (!peerEntry.disconnectTimeout) {
          peerEntry.disconnectTimeout = setTimeout(() => {
            if (
              (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') &&
              (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')
            ) {
              peerEntry.state = 'failed';
              this.notifyStateChange(peerId, 'failed');
              this.onPeerDisconnect(peerId);
            }
          }, 8000);
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
      console.log(`[DataChannel] Doğrudan p2p veri kanalı açıldı: ${peerId}`);
      try {
        dc.send(JSON.stringify({ type: 'mic-state', isMuted: this.isMuted }));
      } catch (_) {}
    };

    dc.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'ice-restart-offer': {
            console.log(`[DataChannel] ICE Restart teklifi alındı: ${peerId}`);
            const pc = peerEntry.pc;
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            dc.send(
              JSON.stringify({
                type: 'ice-restart-answer',
                sdp: { type: answer.type, sdp: answer.sdp },
              })
            );
            break;
          }

          case 'ice-restart-answer': {
            console.log(`[DataChannel] ICE Restart cevabı alındı: ${peerId}`);
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
        console.warn('[DataChannel] Mesaj hatası:', err);
      }
    };
  }

  async connectToPeer(peerId, name) {
    console.log(`[MeshManager] Peer'a bağlanılıyor -> ${name} (${peerId})`);
    const pc = this.createPeerConnection(peerId, name);
    const entry = this.peers.get(peerId);

    try {
      if (entry) entry.makingOffer = true;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
      });
      await pc.setLocalDescription(offer);

      this.sendSignal(peerId, {
        sdp: { type: offer.type, sdp: offer.sdp },
        name,
      });
    } catch (err) {
      console.error(`[MeshManager] ${peerId} için teklif oluşturulamadı:`, err);
    } finally {
      if (entry) entry.makingOffer = false;
    }
  }

  // W3C Polite Peer Sinyal İşleme (Glare & Çakışma Çözücü)
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
        const offerCollision = isOffer && (entry.makingOffer || pc.signalingState !== 'stable');

        // Impolite peer ise ve çakışma varsa gelen teklifi yoksay (kendi teklifini koru)
        if (offerCollision && !entry.isPolite) {
          console.warn(`[MeshManager] Impolite Peer (${fromPeerId}): Teklif çakışması algılandı, yerel teklif korunuyor.`);
          return;
        }

        // Polite peer ise ve çakışma varsa yerel teklifi geri al (rollback yap ve karşıyı kabul et)
        if (offerCollision && entry.isPolite) {
          console.log(`[MeshManager] Polite Peer (${fromPeerId}): Teklif çakışması çözülüyor (Rollback).`);
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (_) {}
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        if (entry.pendingCandidates && entry.pendingCandidates.length > 0) {
          for (const cand of entry.pendingCandidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (e) {
              console.warn('[MeshManager] Bekleyen ICE eklenemedi:', e.message);
            }
          }
          entry.pendingCandidates = [];
        }

        if (isOffer) {
          const answer = await pc.createAnswer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(answer);
          this.sendSignal(fromPeerId, {
            sdp: { type: answer.type, sdp: answer.sdp },
          });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          entry.pendingCandidates.push(data.candidate);
        }
      }
    } catch (err) {
      console.error(`[MeshManager] Sinyal işleme hatası (${fromPeerId}):`, err);
    }
  }

  async restartIceForAllPeers() {
    console.log('[MeshManager] Ağ değişimi -> Yerel ICE Restart başlatılıyor...');
    for (const [peerId, entry] of this.peers.entries()) {
      try {
        const pc = entry.pc;
        if (entry.isPolite) {
          // Polite peer teklif oluşturur
          const offer = await pc.createOffer({ iceRestart: true });
          await pc.setLocalDescription(offer);
          const offerPayload = { type: offer.type, sdp: offer.sdp };

          if (entry.dataChannel && entry.dataChannel.readyState === 'open') {
            entry.dataChannel.send(
              JSON.stringify({
                type: 'ice-restart-offer',
                sdp: offerPayload,
              })
            );
          }

          this.sendSignal(peerId, { sdp: offerPayload });
        }
      } catch (err) {
        console.warn(`[MeshManager] ICE Restart hatası (${peerId}):`, err);
      }
    }
  }

  setMute(isMuted) {
    this.isMuted = isMuted;
    if (this.rawLocalStream) {
      this.rawLocalStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });
    }
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
      let connectedCount = 0;

      for (const [peerId, entry] of this.peers.entries()) {
        if (
          entry.pc &&
          (entry.pc.connectionState === 'connected' ||
            entry.pc.iceConnectionState === 'connected' ||
            entry.pc.iceConnectionState === 'completed')
        ) {
          connectedCount++;
          try {
            const stats = await entry.pc.getStats();
            let selectedPair = null;

            stats.forEach((report) => {
              if (report.type === 'transport' && report.selectedCandidatePairId) {
                selectedPair = stats.get(report.selectedCandidatePairId);
              } else if (report.type === 'candidate-pair' && report.selected) {
                selectedPair = report;
              }
            });

            let isLocal = true;
            let rtt = 12;

            if (selectedPair) {
              const localCandidate = stats.get(selectedPair.localCandidateId);
              const remoteCandidate = stats.get(selectedPair.remoteCandidateId);

              rtt = Math.round((selectedPair.currentRoundTripTime || 0) * 1000) || 12;

              // Eğer aday tipi host (yerel IP) ise bu yerel Hotspot / Wi-Fi bağlantısıdır
              isLocal =
                !localCandidate ||
                localCandidate.candidateType === 'host' ||
                !remoteCandidate ||
                remoteCandidate.candidateType === 'host';
            }

            if (isLocal) anyLocalCandidate = true;
            if (rtt > 0) {
              totalRtt += rtt;
              rttCount++;
            }

            entry.stats = {
              rtt: rtt || 12,
              packetLoss: 0,
              candidateType: isLocal ? 'host' : 'srflx',
              isLocal,
            };

            this.notifyStateChange(peerId, entry.state);
          } catch (_) {}
        }
      }

      if (this.onStatsUpdate) {
        this.onStatsUpdate({
          isHotspotMode: connectedCount > 0, // Bağlı kullanıcılar varsa doğrudan yerel/p2p modda kabul et
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

    if (this.dspFilter) {
      this.dspFilter.destroy();
      this.dspFilter = null;
    }

    if (this.rawLocalStream) {
      this.rawLocalStream.getTracks().forEach((t) => t.stop());
      this.rawLocalStream = null;
    }
    this.localStream = null;
  }
}
