// Web Audio API ve Yerel MP3 Ses Efektleri Modülü (/public/sounds/)
// Mute, Unmute, Someone Left ve Doğal Türkçe TTS Anonsları

const nameCache = new Map(); // peerId -> isim
let isSpeechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
let audioCtx = null;
const audioBuffers = new Map(); // filename -> AudioBuffer

// Chrome/Safari'nin konuşmayı yarıda kesmesini (Garbage Collection) önlemek için referans
let currentUtterance = null;
let cachedTrVoice = null;

// Tarayıcıdaki Türkçe sesleri yükle ve önbelleğe al
function updateVoices() {
  if (!isSpeechAvailable) return;
  try {
    const voices = window.speechSynthesis.getVoices();
    cachedTrVoice =
      voices.find((v) => v.lang === 'tr-TR' || v.lang === 'tr_TR') ||
      voices.find((v) => v.lang.startsWith('tr')) ||
      null;
  } catch (_) {}
}

if (isSpeechAvailable) {
  updateVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

export function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// MP3 dosyasını arkaplanda fetch edip AudioBuffer'a decode et
export async function loadSoundBuffer(filename) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (audioBuffers.has(filename)) return audioBuffers.get(filename);

    const response = await fetch(`/sounds/${filename}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const decoded = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer, resolve, reject);
    });

    audioBuffers.set(filename, decoded);
    return decoded;
  } catch (err) {
    console.warn(`[Announcer] Ses yüklenemedi (${filename}):`, err.message);
    return null;
  }
}

export async function preloadAllSounds() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }
  await Promise.all([
    loadSoundBuffer('mute.mp3'),
    loadSoundBuffer('unmute.mp3'),
    loadSoundBuffer('someone-left.mp3'),
  ]);
}

export async function playSoundFile(filename) {
  try {
    const ctx = getAudioContext();
    if (!ctx) {
      const fallbackAudio = new Audio(`/sounds/${filename}`);
      fallbackAudio.play().catch(() => {});
      return;
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    let buffer = audioBuffers.get(filename);
    if (!buffer) {
      buffer = await loadSoundBuffer(filename);
    }

    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = 1.0;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    } else {
      const fallbackAudio = new Audio(`/sounds/${filename}`);
      fallbackAudio.play().catch(() => {});
    }
  } catch (err) {
    console.warn(`[Announcer] Ses çalma hatası (${filename}):`, err.message);
    try {
      const fallbackAudio = new Audio(`/sounds/${filename}`);
      fallbackAudio.play().catch(() => {});
    } catch (_) {}
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

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

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
 * Fonetik olarak net, kesilmeyen ve doğru Türkçe TTS konuşması yapar
 */
export function speakText(text) {
  if (!isSpeechAvailable || !text) return;

  try {
    if (!cachedTrVoice) {
      updateVoices();
    }

    // Önceki konuşmayı sonlandır
    window.speechSynthesis.cancel();

    // Özel sembolleri ve gereksiz karakterleri temizle
    const cleanText = text.replace(/[*#_~`]/g, '').trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'tr-TR';
    utterance.rate = 0.95; // Doğal ve anlaşılır konuşma hızı
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (cachedTrVoice) {
      utterance.voice = cachedTrVoice;
    }

    // Chrome garbage collection kesintisini önle
    currentUtterance = utterance;
    utterance.onend = () => {
      currentUtterance = null;
    };
    utterance.onerror = () => {
      currentUtterance = null;
    };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('[Announcer] TTS hatası:', err);
  }
}

export function announceJoin(peerId, name) {
  if (name) registerPeerName(peerId, name);
  const riderName = name || getPeerName(peerId);
  playUnmuteSound();

  // MP3 sesi bittikten sonra net anons yap
  setTimeout(() => {
    speakText(`${riderName} odaya katıldı.`);
  }, 250);
}

export function announceDisconnect(peerId) {
  const riderName = getPeerName(peerId);
  playSomeoneLeftSound();

  // someone-left.mp3 sesinin ardından anlaşılır şekilde söyle
  setTimeout(() => {
    speakText(`${riderName} ayrıldı.`);
  }, 350);
}

export function announceReconnect(peerId) {
  const riderName = getPeerName(peerId);
  playUnmuteSound();

  setTimeout(() => {
    speakText(`${riderName} tekrar bağlandı.`);
  }, 250);
}
