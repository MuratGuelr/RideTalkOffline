// Web Speech API ve Yerel MP3 Ses Efektleri Modülü (/public/sounds/)
// Mute, Unmute, Someone Left ve Türkçe TTS anonsları

const nameCache = new Map(); // peerId -> isim
let isSpeechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
let isAudioToneAvailable = typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
let audioCtx = null;

// Ses dosyalarını bellekte önbelleğe al (sıfır gecikme)
const soundCache = {};

function getSound(filename) {
  if (typeof window === 'undefined') return null;
  if (!soundCache[filename]) {
    const audio = new Audio('/sounds/' + filename);
    audio.preload = 'auto';
    soundCache[filename] = audio;
  }
  return soundCache[filename];
}

// MP3 ses dosyasını anında çal
export function playSoundFile(filename) {
  try {
    const sound = getSound(filename);
    if (sound) {
      sound.currentTime = 0;
      const playPromise = sound.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[Announcer] MP3 çalma uyarısı (' + filename + '):', err.message);
        });
      }
    }
  } catch (err) {
    console.warn('[Announcer] MP3 çalınamadı:', err);
  }
}

// 1. Mute Sesi (/sounds/mute.mp3)
export function playMuteSound() {
  playSoundFile('mute.mp3');
}

// 2. Unmute Sesi (/sounds/unmute.mp3)
export function playUnmuteSound() {
  playSoundFile('unmute.mp3');
}

// 3. Biri Ayrılınca / Bağlantı Kesilince (/sounds/someone-left.mp3)
export function playSomeoneLeftSound() {
  playSoundFile('someone-left.mp3');
}

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
 * Motosiklet kask ikaz tonu (çift bip)
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

    if (type === 'horn') {
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
    console.warn('[Announcer] İkaz tonu hatası:', err);
  }
}

/**
 * Türkçe TTS metin anonsu yapar
 */
export function speakText(text) {
  if (!isSpeechAvailable || !text) return;

  try {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

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
  playUnmuteSound();
  speakText(riderName + ' interkoma katıldı');
}

export function announceDisconnect(peerId) {
  const riderName = getPeerName(peerId);
  playSomeoneLeftSound();
  speakText(riderName + ' bağlantısı koptu');
}

export function announceReconnect(peerId) {
  const riderName = getPeerName(peerId);
  playUnmuteSound();
  speakText(riderName + ' tekrar bağlandı');
}
