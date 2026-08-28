import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Share2 } from 'lucide-react';

export default function QRCodeDisplay({ roomCode, joinUrl }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(joinUrl || roomCode);
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
          url: joinUrl,
        });
      } catch (_) {}
    } else {
      handleCopy();
    }
  };

  return (
    <div className="qr-container">
      <div className="qr-box">
        <QRCodeSVG
          value={joinUrl || roomCode}
          size={180}
          bgColor="#0d1117"
          fgColor="#00e5ff"
          level="M"
          includeMargin={false}
        />
        <div className="qr-scan-hint">Arkadaşlarına QR Kodu okut</div>
      </div>

      <div className="room-code-badge-row">
        <div className="room-code-pill">
          <span className="label">ODA KODU</span>
          <span className="code">{roomCode}</span>
        </div>

        <div className="qr-actions">
          <button
            type="button"
            className={`btn-action-sm ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            title="Kopyala"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
            <span>{copied ? 'Kopyalandı' : 'Kodu Kopyala'}</span>
          </button>

          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              className="btn-action-sm"
              onClick={handleShare}
              title="Paylaş"
            >
              <Share2 size={18} />
              <span>Paylaş</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
