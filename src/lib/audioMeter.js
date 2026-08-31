// RideTalk — Ultra-Hafif Web Audio API Ses Seviyesi Ölçer (AudioLevelMeter)
// Ses akışına müdahale etmez, tamponlama veya gecikme yaratmaz.
// Mute ve Eko modlarında CPU tüketimini %0'a indirmek için duraklatılabilir.

let sharedAudioCtx = null;

export function getSharedAudioContext() {
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
    this.isPaused = false;

    this.init();
  }

  init() {
    try {
      if (!this.stream || this.stream.getAudioTracks().length === 0) return;

      const audioCtx = getSharedAudioContext();
      if (!audioCtx) return;

      this.source = audioCtx.createMediaStreamSource(this.stream);
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 32; // Ultra hafif 16-bin FFT (Minimum CPU)
      this.analyser.smoothingTimeConstant = 0.25;

      this.source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let lastCheck = 0;

      const update = (time) => {
        if (this.isDestroyed) return;

        if (!this.isPaused) {
          // Saniyede ~15 kare güncelle (Ekran için pürüzsüz ve sıfır CPU)
          if (time - lastCheck > 65) {
            lastCheck = time;
            this.analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
              sum += dataArray[i];
            }
            const avg = sum / bufferLength;
            const normalized = Math.min(100, Math.round((avg / 128) * 100));
            const isSpeaking = normalized > 10;

            if (this.onLevelChange) {
              this.onLevelChange(normalized, isSpeaking);
            }
          }
        }

        this.animationId = requestAnimationFrame(update);
      };

      this.animationId = requestAnimationFrame(update);
    } catch (_) {}
  }

  setPaused(paused) {
    this.isPaused = !!paused;
    if (paused && this.onLevelChange) {
      this.onLevelChange(0, false);
    }
  }

  destroy() {
    this.isDestroyed = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (_) {}
      this.source = null;
    }
  }
}
