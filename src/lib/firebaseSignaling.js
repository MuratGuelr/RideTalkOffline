// Firebase Realtime Database tabanlı WebRTC Sinyalleşme İstemcisi
// Vercel / Serverless ortamında %100 otomatik oda eşleşmesi sağlar.

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  push,
  get,
  onChildAdded,
  onChildRemoved,
  onDisconnect,
  remove,
  update,
} from 'firebase/database';

export function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };
}

export function isFirebaseConfigured() {
  const cfg = getFirebaseConfig();
  return !!(cfg.apiKey && (cfg.databaseURL || cfg.projectId));
}

export class FirebaseSignalingClient {
  constructor() {
    this.app = null;
    this.db = null;
    this.peerId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().substring(0, 8)
        : `p_${Math.random().toString(36).substring(2, 9)}`;
    this.currentRoom = null;
    this.listeners = new Map();
    this.activeUnsubscribers = [];
    this.knownPeers = new Set();
    this.heartbeatInterval = null;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(
        event,
        list.filter((cb) => cb !== callback)
      );
    }
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[FirebaseSignaling] Event handler hatası (${event}):`, err);
        }
      });
    }
  }

  async connect() {
    try {
      const config = getFirebaseConfig();
      if (!this.app) {
        this.app = getApps().length === 0 ? initializeApp(config) : getApp();
      }
      this.db = getDatabase(this.app);
      console.log('[FirebaseSignaling] Firebase Realtime Database bağlantısı hazır ✅');
      this.emit('status-change', { connected: true, type: 'firebase' });
      return true;
    } catch (err) {
      console.error('[FirebaseSignaling] Firebase başlatma hatası:', err);
      this.emit('error', { message: `Firebase bağlantısı kurulamadı: ${err.message}` });
      throw err;
    }
  }

  // ⭐ OTOMATİK ODAYA KATIL (Tüm sürücüler aynı odaya otomatik bağlanır)
  async autoJoinGroup(roomName = 'MOTO-RIDE', name = 'Sürücü') {
    try {
      if (!this.db) await this.connect();

      const targetRoom = (roomName || 'MOTO-RIDE').toUpperCase().trim();
      const peerName = (name || 'Sürücü').trim();
      this.currentRoom = targetRoom;
      this.knownPeers.clear();
      this.knownPeers.add(this.peerId);

      const roomPeersRef = ref(this.db, `rooms/${targetRoom}/peers`);
      const snapshot = await get(roomPeersRef);

      const existingPeers = [];
      const now = Date.now();

      if (snapshot.exists()) {
        const peersObj = snapshot.val() || {};
        Object.values(peersObj).forEach((p) => {
          // 2 dakikadan eski hayalet kullanıcıları ele
          if (p && p.id && p.id !== this.peerId) {
            const isRecent = !p.lastSeen || now - p.lastSeen < 120000;
            if (isRecent) {
              this.knownPeers.add(p.id);
              existingPeers.push({ id: p.id, name: p.name || 'Sürücü' });
            } else {
              // Eski kaydı temizle
              remove(ref(this.db, `rooms/${targetRoom}/peers/${p.id}`)).catch(() => {});
            }
          }
        });
      }

      // Kendi kaydımızı oluştur
      const myPeerRef = ref(this.db, `rooms/${targetRoom}/peers/${this.peerId}`);
      await set(myPeerRef, {
        id: this.peerId,
        name: peerName,
        joinedAt: now,
        lastSeen: now,
      });

      // Bağlantı koparsa Realtime DB otomatik temizlesin
      onDisconnect(myPeerRef).remove();

      // Sinyal ve katılımcı dinleyicilerini başlat
      this.listenToRoomSignals(targetRoom);
      this.listenToPeers(targetRoom);

      // Heartbeat: Her 30 saniyede bir lastSeen güncelle
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(() => {
        if (this.db && this.currentRoom) {
          update(ref(this.db, `rooms/${this.currentRoom}/peers/${this.peerId}`), {
            lastSeen: Date.now(),
          }).catch(() => {});
        }
      }, 30000);

      console.log(`[FirebaseSignaling] ✅ Gruba Katılındı: ${targetRoom} | İsim: ${peerName} | Mevcut Sürücüler:`, existingPeers);

      this.emit('joined', {
        type: 'joined',
        peerId: this.peerId,
        roomCode: targetRoom,
        name: peerName,
        existingPeers,
      });
    } catch (err) {
      console.error('[FirebaseSignaling] Gruba katılım hatası:', err);
      this.emit('error', { message: `Bağlantı hatası: ${err.message}` });
    }
  }

  async createRoom(name) {
    return this.autoJoinGroup('MOTO-RIDE', name);
  }

  async joinRoom(roomCode, name) {
    return this.autoJoinGroup(roomCode || 'MOTO-RIDE', name);
  }

  listenToPeers(roomCode) {
    const peersRef = ref(this.db, `rooms/${roomCode}/peers`);

    const unsubAdded = onChildAdded(peersRef, (snapshot) => {
      const p = snapshot.val();
      if (p && p.id && p.id !== this.peerId && !this.knownPeers.has(p.id)) {
        this.knownPeers.add(p.id);
        console.log(`[FirebaseSignaling] 🏍️ Yeni sürücü odaya girdi: ${p.name} (${p.id})`);
        this.emit('peer-joined', {
          type: 'peer-joined',
          peerId: p.id,
          name: p.name || 'Sürücü',
        });
      }
    });

    const unsubRemoved = onChildRemoved(peersRef, (snapshot) => {
      const p = snapshot.val();
      const removedId = p?.id || snapshot.key;
      if (removedId && removedId !== this.peerId) {
        this.knownPeers.delete(removedId);
        console.log(`[FirebaseSignaling] ❌ Sürücü ayrıldı: ${p?.name || removedId}`);
        this.emit('peer-left', {
          type: 'peer-left',
          peerId: removedId,
          name: p?.name || 'Sürücü',
        });
      }
    });

    this.activeUnsubscribers.push(unsubAdded, unsubRemoved);
  }

  listenToRoomSignals(roomCode) {
    const mySignalsRef = ref(this.db, `rooms/${roomCode}/signals/${this.peerId}`);

    const unsubSignal = onChildAdded(mySignalsRef, (snapshot) => {
      const signalData = snapshot.val();
      if (signalData && signalData.fromPeerId && signalData.data) {
        this.emit('signal', {
          type: 'signal',
          fromPeerId: signalData.fromPeerId,
          data: signalData.data,
        });
        remove(snapshot.ref).catch(() => {});
      }
    });

    this.activeUnsubscribers.push(unsubSignal);
  }

  async sendSignal(targetPeerId, data) {
    if (!this.db || !this.currentRoom || !targetPeerId) return;

    try {
      const cleanData = JSON.parse(JSON.stringify(data));
      const targetSignalsRef = ref(this.db, `rooms/${this.currentRoom}/signals/${targetPeerId}`);
      await push(targetSignalsRef, {
        fromPeerId: this.peerId,
        data: cleanData,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[FirebaseSignaling] Sinyal gönderme hatası:', err);
    }
  }

  async leaveRoom() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.currentRoom && this.db) {
      try {
        const myPeerRef = ref(this.db, `rooms/${this.currentRoom}/peers/${this.peerId}`);
        await remove(myPeerRef);

        const mySignalsRef = ref(this.db, `rooms/${this.currentRoom}/signals/${this.peerId}`);
        await remove(mySignalsRef);
      } catch (_) {}
    }

    this.activeUnsubscribers.forEach((unsub) => {
      if (typeof unsub === 'function') unsub();
    });
    this.activeUnsubscribers = [];
    this.knownPeers.clear();
    this.currentRoom = null;
  }

  disconnect() {
    this.leaveRoom();
  }
}
