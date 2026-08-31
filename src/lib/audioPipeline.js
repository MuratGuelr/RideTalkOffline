// RideTalk — Motosiklet Kaskı Akıllı Ses İşleme & Gürültü Filtreleme Motoru (DSP Pipeline)
// Mimari: Kask Mikrofonu -> High-Pass Filter (140Hz) -> Ses İyileştirme EQ -> Noise Gate -> Dynamics Compressor/Limiter -> WebRTC

export class MotorcycleAudioPipeline {
  constructor() {
    this.audioContext = null;
    this.sourceNode = null;
    this.highPassFilter = null;
    this.speechEq = null;
    this.noiseGateGain = null;
    this.compressor = null;
    this.analyser = null;
    this.destination = null;
    this.processedStream = null;
    this.rawStream = null;

    this.isSpeechActive = false;
    this.vadInterval = null;
    this.onVadChange = null;

    // Gürültü kapısı parametreleri (Motosiklet rölanti ve rüzgar eşiği)
    this.noiseFloor = 0.015;
    this.gateTargetGain = 1.0;
    this.currentGateGain = 1.0;
  }

  async processStream(rawStream, onVadChange = null) {
    this.rawStream = rawStream;
    this.onVadChange = onVadChange;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new AudioContextClass({
      sampleRate: 48000,
      latencyHint: 'interactive',
    });

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // 1. Ham Mikrofon Girişi
    this.sourceNode = this.audioContext.createMediaStreamSource(rawStream);

    // 2. High-Pass Filter (140 Hz) — Kask titreşimini ve egzoz dip uğultusunu keser
    this.highPassFilter = this.audioContext.createBiquadFilter();
    this.highPassFilter.type = 'highpass';
    this.highPassFilter.frequency.setValueAtTime(140, this.audioContext.currentTime);
    this.highPassFilter.Q.setValueAtTime(0.707, this.audioContext.currentTime);

    // 3. Kask Telsiz Konuşma EQ (2.4 kHz Vokal Netleştirme)
    this.speechEq = this.audioContext.createBiquadFilter();
    this.speechEq.type = 'peaking';
    this.speechEq.frequency.setValueAtTime(2400, this.audioContext.currentTime);
    this.speechEq.Q.setValueAtTime(1.2, this.audioContext.currentTime);
    this.speechEq.gain.setValueAtTime(3.0, this.audioContext.currentTime); // +3dB vokal netliği

    // 4. Adaptif Gürültü Kapısı (Noise Gate Gain Node)
    this.noiseGateGain = this.audioContext.createGain();
    this.noiseGateGain.gain.setValueAtTime(1.0, this.audioContext.currentTime);

    // 5. Dynamics Compressor & Peak Limiter (Kask hoparlöründe ses patlamasını önler)
    this.compressor = this.audioContext.createDynamicsCompressor();
    this.compressor.threshold.setValueAtTime(-22, this.audioContext.currentTime);
    this.compressor.knee.setValueAtTime(10, this.audioContext.currentTime);
    this.compressor.ratio.setValueAtTime(6, this.audioContext.currentTime);
    this.compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime); // 3ms anında koruma
    this.compressor.release.setValueAtTime(0.12, this.audioContext.currentTime);

    // 6. VAD için Spektral Analizör
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.3;

    // 7. WebRTC Çıkış Hedefi
    this.destination = this.audioContext.createMediaStreamDestination();

    // Sinyal Akış Bağlantıları:
    // Source -> HighPass -> SpeechEQ -> NoiseGate -> Compressor -> Destination & Analyser
    this.sourceNode.connect(this.highPassFilter);
    this.highPassFilter.connect(this.speechEq);
    this.speechEq.connect(this.noiseGateGain);
    this.noiseGateGain.connect(this.compressor);
    this.compressor.connect(this.destination);
    this.compressor.connect(this.analyser);

    this.processedStream = this.destination.stream;

    // VAD & Adaptif Gürültü Bastırma Döngüsü
    this._startVadLoop();

    console.log('[AudioPipeline] 🏍️ Motosiklet DSP Ses Hattı Aktif (HighPass 140Hz + EQ + Limiter + VAD)');
    return this.processedStream;
  }

  _startVadLoop() {
    const buffer = new Float32Array(this.analyser.fftSize);

    this.vadInterval = setInterval(() => {
      if (!this.analyser || !this.audioContext) return;

      this.analyser.getFloatTimeDomainData(buffer);

      // RMS Enerji Hesabı
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        sumSquares += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      // Konuşma VAD Algılama Eşiği
      const isSpeaking = rms > 0.022;

      if (isSpeaking !== this.isSpeechActive) {
        this.isSpeechActive = isSpeaking;
        if (this.onVadChange) {
          this.onVadChange(isSpeaking, Math.min(100, Math.round(rms * 400)));
        }
      }

      // Yumuşak Gürültü Kapısı (Noise Expander)
      if (this.noiseGateGain && this.audioContext) {
        const targetGain = isSpeaking ? 1.0 : 0.15; // Konuşulmadığında arka plan rüzgarını %85 kıs
        this.noiseGateGain.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.04);
      }
    }, 40);
  }

  destroy() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    try {
      if (this.sourceNode) this.sourceNode.disconnect();
      if (this.highPassFilter) this.highPassFilter.disconnect();
      if (this.speechEq) this.speechEq.disconnect();
      if (this.noiseGateGain) this.noiseGateGain.disconnect();
      if (this.compressor) this.compressor.disconnect();
      if (this.destination) this.destination.disconnect();
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
    } catch (_) {}
  }
}
