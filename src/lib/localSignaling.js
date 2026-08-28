// Yerel Ağ WebSocket Sinyal İstemcisi
// Vite dev sunucusundaki sinyal sunucusuna bağlanır
// Hotspot üzerinde otomatik oda oluşturur - kod yok, QR yok

export class LocalSignalingClient {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.peerId = null;
    this.connected = false;
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach((cb) => cb(data));
  }

  async connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/signal`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Yerel sinyal sunucusuna bağlanılamadı'));
      }, 3000);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          clearTimeout(timeout);
          this.connected = true;
          console.log('[LocalSignaling] ✅ Bağlandı');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this._emit(msg.type, msg);
          } catch (_) {}
        };

        this.ws.onclose = () => {
          this.connected = false;
          console.log('[LocalSignaling] Bağlantı kapandı');
        };

        this.ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('WebSocket hatası'));
        };
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }

  join(name) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'join', name }));
    }
  }

  sendSignal(targetPeerId, data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'signal', targetPeerId, data }));
    }
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.connected = false;
    this.listeners = {};
  }
}

// Yerel sinyal sunucusu erişilebilir mi kontrol et
export async function isLocalSignalingAvailable() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/signal`;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => { resolve(false); }, 2000);
      try {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(true); };
        ws.onerror = () => { clearTimeout(timeout); resolve(false); };
      } catch (_) { clearTimeout(timeout); resolve(false); }
    });
  } catch (_) {
    return false;
  }
}
