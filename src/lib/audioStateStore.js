// RideTalk — Ultra-Hafif Yerel Ses ve Konuşma Olay Deposu (AudioStateStore)
// Ses seviyesi ve konuşma durumu her saniye onlarca kez güncellenirken,
// tüm React ağacının (App.jsx) baştan aşağı render olmasını engeller.
// Yalnızca ilgili sürücü kartının DOM elemanlarını günceller (Sıfır CPU Yükü).

class AudioStateStore {
  constructor() {
    this.levels = new Map(); // peerId ('local' veya peerId) -> number (0..100)
    this.speaking = new Map(); // peerId -> boolean
    this.listeners = new Map(); // peerId -> Set<callback>
  }

  subscribe(peerId, callback) {
    if (!this.listeners.has(peerId)) {
      this.listeners.set(peerId, new Set());
    }
    this.listeners.get(peerId).add(callback);

    // İlk mevcut durumu bildir
    const level = this.levels.get(peerId) || 0;
    const isSpeaking = this.speaking.get(peerId) || false;
    callback(level, isSpeaking);

    return () => {
      const set = this.listeners.get(peerId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(peerId);
        }
      }
    };
  }

  setVolume(peerId, level, isSpeaking) {
    const prevLevel = this.levels.get(peerId) || 0;
    const prevSpeaking = this.speaking.get(peerId) || false;

    // Gereksiz tetiklemeleri engelle (ufak dalgalanma filtrelemesi)
    if (Math.abs(prevLevel - level) < 2 && prevSpeaking === isSpeaking) {
      return;
    }

    this.levels.set(peerId, level);
    this.speaking.set(peerId, isSpeaking);

    const set = this.listeners.get(peerId);
    if (set && set.size > 0) {
      set.forEach((cb) => {
        try {
          cb(level, isSpeaking);
        } catch (_) {}
      });
    }
  }

  getVolume(peerId) {
    return {
      level: this.levels.get(peerId) || 0,
      isSpeaking: this.speaking.get(peerId) || false,
    };
  }

  reset(peerId) {
    if (peerId) {
      this.levels.delete(peerId);
      this.speaking.delete(peerId);
      const set = this.listeners.get(peerId);
      if (set) {
        set.forEach((cb) => cb(0, false));
      }
    } else {
      this.levels.clear();
      this.speaking.clear();
      this.listeners.forEach((set) => {
        set.forEach((cb) => cb(0, false));
      });
    }
  }
}

export const audioStore = new AudioStateStore();
