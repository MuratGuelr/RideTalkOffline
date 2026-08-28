// Firebase Realtime Database tabanlı WebRTC Sinyalleşme İstemcisi
// Tamamen serverless çalışır, harici Node.js / WebSocket sunucusu gerektirmez.

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
  remove
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

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class FirebaseSignalingClient {
  constructor() {
    this.app = null;
    this.db = null;
    this.peerId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'peer_' + Math.random().toString(36).substring(2, 11);
    this.currentRoom = null;
    this.listeners = new Map();
    this.activeUnsubscribers = [];
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
          console.error('[FirebaseSignaling] Event handler hatası (' + event + '):', err);
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
      this.emit('error', { message: 'Firebase bağlantısı kurulamadı: ' + err.message });
      throw err;
    }
  }

  async createRoom(name) {
    try {
      if (!this.db) await this.connect();

      const peerName = (name || 'Lider Sürücü').trim();
      const code = generateRoomCode();
      this.currentRoom = code;

      const peerRef = ref(this.db, 'rooms/' + code + '/peers/' + this.peerId);

      // Kurucu peer bilgisini oluştur
      await set(peerRef, {
        id: this.peerId,
        name: peerName,
        isLeader: true,
        joinedAt: Date.now(),
      });

      // Bağlantı koparsa Realtime DB otomatik temizlesin
      onDisconnect(peerRef).remove();

      // Sinyal ve katılımcı dinleyicilerini başlat
      this.listenToRoomSignals(code);
      this.listenToPeers(code);

      console.log('[FirebaseSignaling] Oda Oluşturuldu: ' + code + ' | Kurucu: ' + peerName);

      this.emit('room-created', {
        type: 'room-created',
        roomCode: code,
        peerId: this.peerId,
        name: peerName,
      });
    } catch (err) {
      console.error('[FirebaseSignaling] Oda oluşturulamadı:', err);
      this.emit('error', { message: 'Oda oluşturulamadı: ' + err.message });
    }
  }

  async joinRoom(roomCode, name) {
    try {
      if (!this.db) await this.connect();

      const targetCode = (roomCode || '').toUpperCase().trim();
      const peerName = (name || 'Sürücü').trim();
      this.currentRoom = targetCode;

      const roomPeersRef = ref(this.db, 'rooms/' + targetCode + '/peers');
      const snapshot = await get(roomPeersRef);

      if (!snapshot.exists()) {
        this.emit('error', { message: 'Oda bulunamadı (#' + targetCode + '). Lütfen kodu kontrol edin.' });
        return;
      }

      const existingPeersObj = snapshot.val() || {};
      const existingPeers = Object.values(existingPeersObj).map((p) => ({
        id: p.id,
        name: p.name,
      }));

      const myPeerRef = ref(this.db, 'rooms/' + targetCode + '/peers/' + this.peerId);
      await set(myPeerRef, {
        id: this.peerId,
        name: peerName,
        isLeader: false,
        joinedAt: Date.now(),
      });

      // Bağlantı koparsa otomatik silinsin
      onDisconnect(myPeerRef).remove();

      // Sinyal dinleyicisi
      this.listenToRoomSignals(targetCode);
      this.listenToPeers(targetCode);

      this.emit('joined', {
        type: 'joined',
        peerId: this.peerId,
        roomCode: targetCode,
        name: peerName,
        existingPeers,
      });

      console.log('[FirebaseSignaling] Odaya Katılındı: ' + targetCode + ' | İsim: ' + peerName);
    } catch (err) {
      console.error('[FirebaseSignaling] Odaya katılım hatası:', err);
      this.emit('error', { message: 'Odaya katılırken hata oluştu: ' + err.message });
    }
  }

  listenToPeers(roomCode) {
    const peersRef = ref(this.db, 'rooms/' + roomCode + '/peers');

    const unsubAdded = onChildAdded(peersRef, (snapshot) => {
      const p = snapshot.val();
      if (p && p.id !== this.peerId) {
        this.emit('peer-joined', {
          type: 'peer-joined',
          peerId: p.id,
          name: p.name,
        });
      }
    });

    const unsubRemoved = onChildRemoved(peersRef, (snapshot) => {
      const p = snapshot.val();
      if (p && p.id !== this.peerId) {
        this.emit('peer-left', {
          type: 'peer-left',
          peerId: p.id,
          name: p.name,
        });
      }
    });

    this.activeUnsubscribers.push(unsubAdded, unsubRemoved);
  }

  listenToRoomSignals(roomCode) {
    const mySignalsRef = ref(this.db, 'rooms/' + roomCode + '/signals/' + this.peerId);

    const unsubSignal = onChildAdded(mySignalsRef, (snapshot) => {
      const signalData = snapshot.val();
      if (signalData && signalData.fromPeerId) {
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
      const targetSignalsRef = ref(this.db, 'rooms/' + this.currentRoom + '/signals/' + targetPeerId);
      await push(targetSignalsRef, {
        fromPeerId: this.peerId,
        data: data,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn('[FirebaseSignaling] Sinyal gönderme hatası:', err);
    }
  }

  async leaveRoom() {
    if (this.currentRoom && this.db) {
      try {
        const myPeerRef = ref(this.db, 'rooms/' + this.currentRoom + '/peers/' + this.peerId);
        await remove(myPeerRef);

        const mySignalsRef = ref(this.db, 'rooms/' + this.currentRoom + '/signals/' + this.peerId);
        await remove(mySignalsRef);
      } catch (_) {}
    }

    this.activeUnsubscribers.forEach((unsub) => {
      if (typeof unsub === 'function') unsub();
    });
    this.activeUnsubscribers = [];
    this.currentRoom = null;
  }

  disconnect() {
    this.leaveRoom();
  }
}
