// 0 İnternet Doğrudan QR WebRTC Sinyal Sıkıştırıcı & Çözücü
// Tarayıcılar arasında sunucusuz ve internetsiz doğrudan QR ile SDP takası sağlar.

export function compressSDP(sdpObject, candidates = [], name = 'Sürücü') {
  const payload = {
    t: sdpObject.type === 'offer' ? 'O' : 'A',
    s: sdpObject.sdp,
    c: (candidates || []).map((cand) => (typeof cand === 'string' ? cand : cand.candidate)),
    n: name,
  };
  return JSON.stringify(payload);
}

export function decompressSDP(jsonStr) {
  try {
    const payload = JSON.parse(jsonStr);
    return {
      type: payload.t === 'O' ? 'offer' : 'answer',
      sdp: payload.s,
      candidates: payload.c || [],
      name: payload.n || 'Sürücü',
    };
  } catch (err) {
    console.error('[OfflineSDP] Çözümleme hatası:', err);
    throw new Error('Geçersiz RideTalk QR kodu!');
  }
}
