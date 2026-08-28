// Motosiklet Kask & Sürüş Ortamına Özel Web Audio API DSP Ses Filtreleme Zinciri
// 1. High-Pass Filter (140Hz): Rüzgar basıncı ve egzoz/motor uğultusunu keser.
// 2. Low-Pass Filter (3600Hz): Tiz rüzgar hışırtısını ve tıslamaları engeller.
// 3. Voice Clarity Peak (1500Hz): Kask içi konuşma netliğini +3.5dB öne çıkarır.
// 4. Dynamics Compressor: Bağırma ve fısıltıları dengeler, aşırı ses patlamalarını önler.

export function createMotorcycleAudioFilter(rawStream) {
  if (typeof window === 'undefined') {
    return { filteredStream: rawStream, destroy: () => {} };
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return { filteredStream: rawStream, destroy: () => {} };
  }

  try {
    const audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
    const source = audioCtx.createMediaStreamSource(rawStream);

    // 1. Rüzgar Uğultusu ve Egzoz Bas Filtresi (High-Pass - 140Hz)
    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 140;
    highpass.Q.value = 0.9;

    // 2. Tiz Rüzgar Hışırtısı Filtresi (Low-Pass - 3600Hz)
    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3600;
    lowpass.Q.value = 0.8;

    // 3. İnsan Sesi Netlik Vurgusu (Peaking - 1600Hz)
    const voiceBoost = audioCtx.createBiquadFilter();
    voiceBoost.type = 'peaking';
    voiceBoost.frequency.value = 1600;
    voiceBoost.gain.value = 3.5;
    voiceBoost.Q.value = 1.2;

    // 4. Dinamik Kompresör (Ses Seviyesi Dengeleyici & Çıtırtı Önleyici)
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -26;
    compressor.knee.value = 10;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003; // 3ms hızlı tepki
    compressor.release.value = 0.12;

    // Çıkış Akışı
    const destination = audioCtx.createMediaStreamDestination();

    // Filtreleme Zincirini Bağla:
    // Mikrofon -> HighPass -> LowPass -> VoiceBoost -> Compressor -> WebRTC Akışı
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(voiceBoost);
    voiceBoost.connect(compressor);
    compressor.connect(destination);

    // Safari ve arka plan askıya almalarını önle
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    return {
      filteredStream: destination.stream,
      audioCtx,
      destroy: () => {
        try {
          source.disconnect();
          highpass.disconnect();
          lowpass.disconnect();
          voiceBoost.disconnect();
          compressor.disconnect();
          if (audioCtx.state !== 'closed') {
            audioCtx.close().catch(() => {});
          }
        } catch (_) {}
      },
    };
  } catch (err) {
    console.warn('[AudioFilter] DSP filtresi başlatılamadı, ham ses kullanılıyor:', err);
    return { filteredStream: rawStream, destroy: () => {} };
  }
}
