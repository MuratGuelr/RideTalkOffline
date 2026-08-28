// Web Audio API Analyser tabanlı gerçek zamanlı ses seviyesi ve konuşma algılama modülü

export class AudioLevelMeter {
  constructor(stream, onLevelChange) {
    this.stream = stream;
    this.onLevelChange = onLevelChange;
    this.audioCtx = null;
    this.source = null;
    this.analyser = null;
    this.animationId = null;
    this.isDestroyed = false;

    this.init();
  }

  init() {
    try {
      if (!this.stream || this.stream.getAudioTracks().length === 0) return;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioCtx = new AudioContextClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;

      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const update = () => {
        if (this.isDestroyed) return;

        this.analyser.getByteFrequencyData(dataArray);

        // Ortalama RMS genliği hesapla
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength; // 0..255
        const normalized = Math.min(100, Math.round((avg / 128) * 100)); // 0..100%
        const isSpeaking = normalized > 12; // Eşik değer

        if (this.onLevelChange) {
          this.onLevelChange(normalized, isSpeaking);
        }

        this.animationId = requestAnimationFrame(update);
      };

      update();
    } catch (err) {
      console.warn('[AudioLevelMeter] Başlatılamadı:', err.message);
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (_) {}
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (_) {}
    }
  }
}
