// Web Audio API Analyser tabanlı ultra-hafif ses seviyesi göstergesi
// Ses akışına müdahale etmez, tamponlama veya gecikme yaratmaz.

let sharedAudioCtx = null;

function getSharedAudioContext() {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      sharedAudioCtx = new AudioContextClass({ latencyHint: 'interactive' });
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export class AudioLevelMeter {
  constructor(stream, onLevelChange) {
    this.stream = stream;
    this.onLevelChange = onLevelChange;
    this.source = null;
    this.analyser = null;
    this.animationId = null;
    this.isDestroyed = false;

    this.init();
  }

  init() {
    try {
      if (!this.stream || this.stream.getAudioTracks().length === 0) return;

      const audioCtx = getSharedAudioContext();
      if (!audioCtx) return;

      this.source = audioCtx.createMediaStreamSource(this.stream);
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 64; // Ultra hızlı, minik 32-bin FFT
      this.analyser.smoothingTimeConstant = 0.3;

      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let lastCheck = 0;

      const update = (time) => {
        if (this.isDestroyed) return;

        // Saniyede 15 kare güncelle (CPU ve ses işlemcisini yormamak için)
        if (time - lastCheck > 65) {
          lastCheck = time;
          this.analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          const isSpeaking = normalized > 12;

          if (this.onLevelChange) {
            this.onLevelChange(normalized, isSpeaking);
          }
        }

        this.animationId = requestAnimationFrame(update);
      };

      this.animationId = requestAnimationFrame(update);
    } catch (_) {}
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
      this.source = null;
    }
  }
}
