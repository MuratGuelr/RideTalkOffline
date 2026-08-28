// Web Speech API tabanlı Türkçe sesli anons ve sesli bildirim modülü
// Tamamen yerel çalışır, internet gerektirmez.

const nameCache = new Map(); // peerId -> isim
let isSpeechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
let isAudioToneAvailable = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && isAudioToneAvailable) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function registerPeerName(peerId, name) {
  if (peerId && name) {
    nameCache.set(peerId, name);
  }
}

export function unregisterPeerName(peerId) {
  if (peerId) {
    nameCache.delete(peerId);
  }
}

export function getPeerName(peerId) {
  return nameCache.get(peerId) || 'Bir sürücü';
}

/**
 * Motosiklet kaskında duyulabilecek özel çift tonlu ikaz sesi üretir
 */
export function playAlertTone(type = 'beep') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'disconnect') {
      // Düşen ton (uyarı)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.3);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'connect') {
      // Yükselen ton (onay)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(330, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'horn') {
      // Motosiklet interkom dikkat/korna tonu (çift bip)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.setValueAtTime(0.0, now + 0.12);
      gain.gain.setValueAtTime(0.3, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (err) {
    console.warn('[Announcer] İkaz tonu çalınamadı:', err);
  }
}

/**
 * Türkçe TTS metin anonsu yapar
 */
export function speakText(text) {
  if (!isSpeechAvailable || !text) return;

  try {
    // Önceki bekleyen anonsları temizle
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.05; // Motosiklette seri ve net duyulması için hafif tempolu
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Türkçe ses varsa seç
    const voices = window.speechSynthesis.getVoices();
    const trVoice = voices.find((v) => v.lang.startsWith('tr'));
    if (trVoice) {
      utterance.voice = trVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[Announcer] TTS hatası:', err);
  }
}

export function announceJoin(peerId, name) {
  if (name) registerPeerName(peerId, name);
  const riderName = name || getPeerName(peerId);
  playAlertTone('connect');
  speakText(`${riderName} interkoma katıldı`);
}

export function announceDisconnect(peerId) {
  const riderName = getPeerName(peerId);
  playAlertTone('disconnect');
  speakText(`${riderName} bağlantısı koptu`);
}

export function announceReconnect(peerId) {
  const riderName = getPeerName(peerId);
  playAlertTone('connect');
  speakText(`${riderName} tekrar bağlandı`);
}

export function announceHotspotMode(isLocal) {
  playAlertTone('connect');
  if (isLocal) {
    speakText('Yerel Hotspot ağına geçildi. İnternetsiz devam ediliyor.');
  } else {
    speakText('İnternet ağına bağlanıldı.');
  }
}
