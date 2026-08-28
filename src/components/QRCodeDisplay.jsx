import React, { useState } from 'react';
import { Copy, Check, Share2, Radio } from 'lucide-react';

export default function QRCodeDisplay({ roomCode, joinUrl }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (_) {}
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'RideTalk Motosiklet İnterkom Odası',
          text: `Motosiklet grubumuza katıl! Oda Kodu: ${roomCode}`,
          url: joinUrl || window.location.href,
        });
      } catch (_) {}
    } else {
      handleCopy();
    }
  };

  return (
    <div className="qr-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      {/* Dev, Yüksek Kontrastlı Oda Kodu Kartı */}
      <div
        className="huge-code-card"
        style={{
          width: '100%',
          maxWidth: '340px',
          background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.12) 0%, rgba(8, 12, 20, 0.95) 100%)',
          border: '2px solid #00e5ff',
          boxShadow: '0 0 25px rgba(0, 229, 255, 0.3)',
          borderRadius: '20px',
          padding: '24px 16px',
          textAlign: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>
          <Radio size={16} className="text-neon" />
          <span>ODA KODU</span>
        </div>

        <div
          style={{
            fontSize: '3rem',
            fontWeight: '900',
            letterSpacing: '8px',
            color: '#00e5ff',
            textShadow: '0 0 20px rgba(0, 229, 255, 0.6)',
            fontFamily: 'monospace, sans-serif',
            userSelect: 'all',
            padding: '8px 0',
          }}
        >
          {roomCode}
        </div>

        <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: '6px' }}>
          Diğer sürücüler bu 6 haneli kodu girerek veya kamerayla taratarak anında bağlanabilir.
        </p>
      </div>

      {/* Hızlı Butonlar */}
      <div className="room-code-badge-row" style={{ display: 'flex', gap: '10px', justifyContent: 'center', width: '100%' }}>
        <button
          type="button"
          className={`btn-action-sm ${copied ? 'copied' : ''}`}
          style={{ padding: '12px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
          onClick={handleCopy}
          title="Kodu Kopyala"
        >
          {copied ? <Check size={18} className="text-emerald" /> : <Copy size={18} />}
          <span>{copied ? 'Kopyalandı' : 'Kodu Kopyala'}</span>
        </button>

        {typeof navigator !== 'undefined' && navigator.share && (
          <button
            type="button"
            className="btn-action-sm"
            style={{ padding: '12px 18px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}
            onClick={handleShare}
            title="Paylaş"
          >
            <Share2 size={18} />
            <span>Paylaş</span>
          </button>
        )}
      </div>
    </div>
  );
}
