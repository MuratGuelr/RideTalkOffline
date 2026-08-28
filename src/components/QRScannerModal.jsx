import React, { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { X, Camera, AlertCircle, RefreshCw, SwitchCamera, ScanText } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(
    localStorage.getItem('ridetalk_preferred_camera') || ''
  );
  const [detectedText, setDetectedText] = useState('');
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const isScanningRef = useRef(true);

  // Kameraları listele
  const loadCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      setCameras(videoDevices);

      if (videoDevices.length > 0) {
        const hasCurrent = videoDevices.some((d) => d.deviceId === selectedCameraId);
        if (!hasCurrent) {
          const backCam = videoDevices.find(
            (d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('environment') ||
              d.label.toLowerCase().includes('arka')
          );
          const chosenId = backCam ? backCam.deviceId : videoDevices[0].deviceId;
          setSelectedCameraId(chosenId);
          localStorage.setItem('ridetalk_preferred_camera', chosenId);
        }
      }
    } catch (err) {
      console.warn('[Scanner] Kamera listesi hatası:', err);
    }
  }, [selectedCameraId]);

  const stopCamera = useCallback(() => {
    isScanningRef.current = false;
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const scanFrame = useCallback(() => {
    if (!isScanningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 1. YÖNTEM: Tarayıcı Destekliyorsa Doğrudan OCR Metin Okuma (TextDetector API)
      if ('TextDetector' in window) {
        try {
          const textDetector = new window.TextDetector();
          textDetector
            .detect(canvas)
            .then((detectedTexts) => {
              for (const item of detectedTexts) {
                const raw = item.rawValue ? item.rawValue.toUpperCase().trim() : '';
                // 4-6 Haneli oda kodu veya "ODA KODU: ABC123" gibi metinleri yakala
                const match = raw.match(/\b([A-Z0-9]{4,6})\b/);
                if (match && match[1]) {
                  const code = match[1];
                  setDetectedText(code);
                  stopCamera();
                  onScanSuccess(code);
                  onClose();
                  return;
                }
              }
            })
            .catch(() => {});
        } catch (_) {}
      }

      // 2. YÖNTEM: Standart QR Kod Okuyucu Fallback
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          let foundCode = code.data.trim();
          if (foundCode.includes('room=')) {
            const urlParams = new URLSearchParams(foundCode.split('?')[1]);
            foundCode = urlParams.get('room') || foundCode;
          } else if (foundCode.length > 6 && !foundCode.startsWith('{')) {
            const parts = foundCode.split('/');
            foundCode = parts[parts.length - 1];
          }

          if (!foundCode.startsWith('{')) {
            foundCode = foundCode.slice(0, 6).toUpperCase();
            if (foundCode.length >= 4) {
              setDetectedText(foundCode);
              stopCamera();
              onScanSuccess(foundCode);
              onClose();
              return;
            }
          }
        }
      } catch (_) {}
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }, [onClose, onScanSuccess, stopCamera]);

  const startCamera = useCallback(
    async (deviceIdToUse) => {
      stopCamera();
      setError(null);
      isScanningRef.current = true;

      try {
        const videoConstraints = deviceIdToUse
          ? { deviceId: { exact: deviceIdToUse } }
          : { facingMode: { ideal: 'environment' } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          await loadCameras();
          scanFrame();
        }
      } catch (err) {
        console.error('[Scanner] Kamera hatası:', err);
        setError('Kameraya erişilemedi. Kodu elle girebilirsiniz.');
      }
    },
    [loadCameras, scanFrame, stopCamera]
  );

  useEffect(() => {
    if (isOpen) {
      startCamera(selectedCameraId);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, selectedCameraId, startCamera, stopCamera]);

  const handleCameraChange = (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    localStorage.setItem('ridetalk_preferred_camera', newId);
    startCamera(newId);
  };

  const handleCycleCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextId = cameras[nextIndex].deviceId;
    setSelectedCameraId(nextId);
    localStorage.setItem('ridetalk_preferred_camera', nextId);
    startCamera(nextId);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content scanner-modal">
        <div className="modal-header">
          <div className="modal-title">
            <ScanText size={20} className="icon-neon" />
            <span>Kamera ile Oda Kodunu Oku</span>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="scanner-body modal-scrollable-body">
          <div className="camera-selector-bar" style={{ width: '100%', display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
            <select
              className="input-text camera-dropdown"
              style={{ padding: '8px 12px', fontSize: '0.82rem', flex: 1, height: '38px', borderRadius: '10px' }}
              value={selectedCameraId}
              onChange={handleCameraChange}
            >
              {cameras.map((cam, idx) => (
                <option key={cam.deviceId || idx} value={cam.deviceId}>
                  {cam.label || `Kamera ${idx + 1}`}
                </option>
              ))}
              {cameras.length === 0 && <option value="">Varsayılan Kamera</option>}
            </select>

            {cameras.length > 1 && (
              <button
                type="button"
                className="btn-secondary"
                style={{
                  height: '38px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(0, 229, 255, 0.12)',
                  color: '#00e5ff',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  whiteSpace: 'nowrap',
                }}
                onClick={handleCycleCamera}
                title="Diğer Kameraya Geç"
              >
                <SwitchCamera size={16} />
                <span>Değiştir</span>
              </button>
            )}
          </div>

          {error ? (
            <div className="scanner-error">
              <AlertCircle size={32} className="text-crimson" />
              <p>{error}</p>
              <button
                type="button"
                className="btn-primary mt-2"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={() => startCamera(selectedCameraId)}
              >
                <RefreshCw size={14} className="mr-1" /> Yeniden Dene
              </button>
            </div>
          ) : (
            <div className="video-wrapper">
              <video ref={videoRef} className="scanner-video" playsInline muted />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="scan-target-box" style={{ width: '85%', height: '55%' }}>
                <div className="laser-line"></div>
              </div>
            </div>
          )}

          {detectedText && (
            <div style={{ background: 'rgba(0,230,118,0.2)', color: '#00e676', padding: '6px 12px', borderRadius: '8px', fontWeight: '800', margin: '6px auto', fontSize: '0.9rem' }}>
              Okundu: {detectedText}
            </div>
          )}

          <p className="scanner-subtext">
            Liderin ekranındaki <strong>6 haneli oda kodunu</strong> veya QR kodu vizöre tutun, kamera otomatik algılar.
          </p>
        </div>
      </div>
    </div>
  );
}
