import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import QRScannerModal from './QRScannerModal.jsx';
import { compressSDP, decompressSDP } from '../lib/offlineSDP.js';
import { X, WifiOff, QrCode, Camera, Check, ShieldCheck, ArrowRight } from 'lucide-react';

export default function OfflineQRHandshakeModal({
  isOpen,
  onClose,
  meshManager,
  selfName = 'Sürücü',
  onHandshakeSuccess,
}) {
  const [step, setStep] = useState('choose'); // 'choose' | 'leader_offer' | 'leader_scan_answer' | 'joiner_scan_offer' | 'joiner_show_answer' | 'done'
  const [offerQR, setOfferQR] = useState('');
  const [answerQR, setAnswerQR] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState('offer'); // 'offer' | 'answer'
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  // Lider: 1. Adım - Teklif QR'ı Üret
  const handleLeaderStart = async () => {
    try {
      setStatusMsg('Yerel Hotspot teklifi hazırlanıyor...');
      setStep('leader_offer');
      const offerData = await meshManager.createOfflineOffer('offline_peer', selfName);
      const compressed = compressSDP(offerData.sdp, offerData.candidates, selfName);
      setOfferQR(compressed);
      setStatusMsg('Katılımcının bu QR kodu okumasını bekleyin.');
    } catch (err) {
      setStatusMsg(`Hata: ${err.message}`);
    }
  };

  // Katılımcı: Liderin Teklif QR'ını Oku
  const handleJoinerScanOffer = () => {
    setScannerMode('offer');
    setIsScannerOpen(true);
  };

  // Lider: Katılımcının Cevap QR'ını Oku
  const handleLeaderScanAnswer = () => {
    setScannerMode('answer');
    setIsScannerOpen(true);
  };

  // QR Okunduğunda
  const handleQRScanned = async (scannedData) => {
    try {
      setIsScannerOpen(false);
      const decompressed = decompressSDP(scannedData);

      if (scannerMode === 'offer') {
        // Katılımcı Liderin teklifini aldı -> Cevap üretip ekranında göster
        setStatusMsg('Liderin teklifi alındı, yerel cevap üretiliyor...');
        setStep('joiner_show_answer');

        const answerData = await meshManager.acceptOfflineOfferAndCreateAnswer(
          'offline_peer',
          { type: decompressed.type, sdp: decompressed.sdp },
          decompressed.candidates,
          selfName
        );

        const compressedAnswer = compressSDP(answerData.sdp, answerData.candidates, selfName);
        setAnswerQR(compressedAnswer);
        setStatusMsg('Şimdi Lider bu QR kodu kendi telefonuyla okusun.');
      } else if (scannerMode === 'answer') {
        // Lider Katılımcının cevabını aldı -> Bağlantıyı tamamla
        setStatusMsg('Katılımcının cevabı alındı, yerel ses başlatılıyor...');
        await meshManager.acceptOfflineAnswer(
          'offline_peer',
          { type: decompressed.type, sdp: decompressed.sdp },
          decompressed.candidates
        );

        setStep('done');
        setStatusMsg('0 İnternet Yerel Hotspot Ses Bağlantısı Kuruldu! 🏍️🔊');
        if (onHandshakeSuccess) onHandshakeSuccess(decompressed.name);
      }
    } catch (err) {
      alert(`QR Kod Hatası: ${err.message}`);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content guide-modal">
        <div className="modal-header">
          <div className="modal-title">
            <WifiOff size={20} className="icon-neon" />
            <span>0 İnternet — Doğrudan QR Eşleşme</span>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="modal-scrollable-body p-4 flex flex-col gap-4 text-center">
          {step === 'choose' && (
            <div className="flex flex-col gap-4">
              <div className="badge-offline-pill mx-auto" style={{ margin: '0 auto' }}>
                <span>SUNUCUSUZ & İNTERNETSİZ DOĞRUDAN P2P</span>
              </div>
              <p style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                İki telefon da aynı Hotspot / Wi-Fi ağına bağlıyken internet olmasa bile doğrudan QR kodlar üzerinden ses bağlantısı kurulur.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ padding: '16px 12px', borderRadius: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                  onClick={handleLeaderStart}
                >
                  <QrCode size={28} />
                  <span style={{ fontWeight: '800', fontSize: '0.95rem' }}>1. Telefon (Lider)</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Teklif QR'ı Göster</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '16px 12px', borderRadius: '14px', border: '1px solid rgba(0, 229, 255, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'rgba(0, 229, 255, 0.08)', color: '#00e5ff' }}
                  onClick={handleJoinerScanOffer}
                >
                  <Camera size={28} />
                  <span style={{ fontWeight: '800', fontSize: '0.95rem' }}>2. Telefon (Katılımcı)</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>Liderin QR'ını Oku</span>
                </button>
              </div>
            </div>
          )}

          {step === 'leader_offer' && offerQR && (
            <div className="flex flex-col items-center gap-3">
              <span className="badge-offline-pill">1. ADIM: LİDERİN TEKLİF QR'I</span>
              <div style={{ background: '#ffffff', padding: '14px', borderRadius: '16px', display: 'inline-block' }}>
                <QRCodeSVG value={offerQR} size={210} level="L" includeMargin={false} />
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Diğer telefon RideTalk'tan <strong>"2. Telefon (Katılımcı)"</strong> butonuna basıp bu QR kodu okusun.
              </p>
              <button
                type="button"
                className="btn-primary btn-full mt-2"
                style={{ padding: '12px', borderRadius: '12px' }}
                onClick={handleLeaderScanAnswer}
              >
                <span>Katılımcı Okudu → Cevap QR'ını Oku</span>
                <ArrowRight size={18} className="ml-1" />
              </button>
            </div>
          )}

          {step === 'joiner_show_answer' && answerQR && (
            <div className="flex flex-col items-center gap-3">
              <span className="badge-offline-pill">2. ADIM: KATILIMCI CEVAP QR'I</span>
              <div style={{ background: '#ffffff', padding: '14px', borderRadius: '16px', display: 'inline-block' }}>
                <QRCodeSVG value={answerQR} size={210} level="L" includeMargin={false} />
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Şimdi Lider kendi telefonundan <strong>"Cevap QR'ını Oku"</strong> butonuna basarak bu kodu okusun.
              </p>
              <button
                type="button"
                className="btn-secondary btn-full mt-2"
                style={{ padding: '12px', borderRadius: '12px' }}
                onClick={() => {
                  setStep('done');
                  if (onHandshakeSuccess) onHandshakeSuccess('Lider');
                }}
              >
                Tamamlandı, Sürüşe Geç
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0, 230, 118, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00e676' }}>
                <Check size={36} />
              </div>
              <h3 style={{ color: '#00e676', fontWeight: '800' }}>Ses Akışı Başladı!</h3>
              <p style={{ fontSize: '0.88rem', color: '#cbd5e1' }}>
                Sesiniz şu an yerel Hotspot Wi-Fi üzerinden internet olmadan doğrudan telefonlar arasında akıyor.
              </p>
              <button
                type="button"
                className="btn-primary btn-full mt-3"
                style={{ padding: '14px', borderRadius: '12px' }}
                onClick={onClose}
              >
                Kokpite Dön ve Konuş
              </button>
            </div>
          )}

          {statusMsg && step !== 'done' && (
            <div style={{ fontSize: '0.8rem', color: '#00e5ff', marginTop: '6px' }}>
              {statusMsg}
            </div>
          )}
        </div>
      </div>

      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleQRScanned}
      />
    </div>
  );
}
