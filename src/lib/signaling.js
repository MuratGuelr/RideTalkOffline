// Sinyal İstemcisi: Node.js WebSocket sunucusuyla ilk el sıkışma ve SDP/ICE yönlendirme

export class SignalingClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl || this.getDefaultServerUrl();
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.listeners = new Map();
    this.pendingMessages = [];
  }

  getDefaultServerUrl() {
    // 1. Vite Environment Variable (Vercel Environment Variables üzerinden verilebilir)
    if (import.meta.env && import.meta.env.VITE_SIGNALING_SERVER_URL) {
      return import.meta.env.VITE_SIGNALING_SERVER_URL;
    }

    // 2. Tarayıcı LocalStorage (Kullanıcının özel girdiği sunucu adresi)
    if (typeof window !== 'undefined') {
      const customUrl = localStorage.getItem('ridetalk_server_url');
      if (customUrl) return customUrl;
    }

    if (typeof window === 'undefined') return 'ws://localhost:8080';

    const hostname = window.location.hostname || 'localhost';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // Yerel geliştirme ortamındaysa doğrudan 8080 portunu hedefle
    if (isLocalhost) {
      return `${protocol}//${hostname}:8080`;
    }

    // Canlı ortamda (örn: vercel.app) varsayılan wss adresi
    return `${protocol}//${hostname}`;
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
          console.error(`[SignalingClient] Event handler error (${event}):`, err);
        }
      });
    }
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        resolve();
        return;
      }

      try {
        console.log(`[SignalingClient] Sinyal sunucusuna bağlanılıyor: ${this.serverUrl}`);
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('[SignalingClient] Bağlantı kuruldu ✅');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.emit('status-change', { connected: true, url: this.serverUrl });

          // Bekleyen mesajları gönder
          while (this.pendingMessages.length > 0) {
            const msg = this.pendingMessages.shift();
            this.sendRaw(msg);
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
          } catch (err) {
            console.error('[SignalingClient] Geçersiz JSON mesajı:', err);
          }
        };

        this.ws.onclose = (event) => {
          console.warn('[SignalingClient] Bağlantı kapandı:', event.code, event.reason);
          this.isConnected = false;
          this.emit('status-change', { connected: false });
          this.emit('disconnected');
        };

        this.ws.onerror = (err) => {
          console.warn('[SignalingClient] WebSocket hatası:', err);
          this.emit('error', { message: 'Sinyal sunucusuna bağlanılamadı. Sunucunun çalıştığından emin olun.' });
          if (!this.isConnected) {
            // İlk bağlantı hatasında reject et ama sessiz kal
            resolve();
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  sendRaw(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    } else {
      this.pendingMessages.push(obj);
    }
  }

  createRoom(name) {
    this.sendRaw({ type: 'create-room', name });
  }

  joinRoom(roomCode, name) {
    this.sendRaw({ type: 'join-room', roomCode, name });
  }

  sendSignal(targetPeerId, data) {
    this.sendRaw({ type: 'signal', targetPeerId, data });
  }

  leaveRoom() {
    this.sendRaw({ type: 'leave-room' });
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'room-created':
        this.emit('room-created', msg);
        break;
      case 'joined':
        this.emit('joined', msg);
        break;
      case 'peer-joined':
        this.emit('peer-joined', msg);
        break;
      case 'signal':
        this.emit('signal', msg);
        break;
      case 'peer-left':
        this.emit('peer-left', msg);
        break;
      case 'error':
        this.emit('error', msg);
        break;
      case 'pong':
        this.emit('pong', msg);
        break;
      default:
        console.warn('[SignalingClient] Bilinmeyen mesaj:', msg);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
