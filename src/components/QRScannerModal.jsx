import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, Camera, AlertCircle } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    let isActive = true;

    async function startCamera() {
      try {
        setError(null);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });

        if (!isActive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          requestAnimationFrame(scanQRCode);
        }
      } catch (err) {
        console.error('[QRScanner] Kamera başlatılamadı:', err);
        setError('Kameraya erişilemedi. Lütfen izinleri kontrol edin veya kodu elle girin.');
      }
    }

    function scanQRCode() {
      if (!isActive) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.height = video.videoHeight;
        canvas.width = video.videoWidth;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          let foundCode = code.data.trim();
          if (foundCode.includes('room=')) {
            const urlParams = new URLSearchParams(foundCode.split('?')[1]);
            foundCode = urlParams.get('room') || foundCode;
          } else if (foundCode.length > 6) {
            const parts = foundCode.split('/');
            foundCode = parts[parts.length - 1];
          }

          foundCode = foundCode.slice(0, 6).toUpperCase();

          if (foundCode.length >= 4) {
            stopCamera();
            onScanSuccess(foundCode);
            onClose();
            return;
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanQRCode);
    }

    function stopCamera() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }

    startCamera();

    return () => {
      isActive = false;
      stopCamera();
    };
  }, [isOpen, onClose, onScanSuccess]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content scanner-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Camera size={20} className="icon-neon" />
            <span>QR Kod Okuyucu</span>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="scanner-body modal-scrollable-body">
          {error ? (
            <div className="scanner-error">
              <AlertCircle size={32} />
              <p>{error}</p>
            </div>
          ) : (
            <div className="video-wrapper">
              <video ref={videoRef} className="scanner-video" />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="scan-target-box">
                <div className="laser-line"></div>
              </div>
            </div>
          )}
          <p className="scanner-subtext">Liderin ekranındaki QR kodu vizöre hizalayın</p>
        </div>
      </div>
    </div>
  );
}
