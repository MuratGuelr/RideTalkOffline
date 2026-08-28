import React, { useState, useEffect } from 'react';
import QRScannerModal from './QRScannerModal.jsx';
import { User, KeyRound, QrCode, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function RoomJoin({ initialRoomCode = '', onJoinRoom, isConnecting, error, onBack }) {
  const [name, setName] = useState(localStorage.getItem('ridetalk_name') || 'Sürücü');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    if (initialRoomCode) {
      setRoomCode(initialRoomCode.toUpperCase());
    }
  }, [initialRoomCode]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!name.trim() || !roomCode.trim()) return;
    localStorage.setItem('ridetalk_name', name.trim());
    onJoinRoom(roomCode.trim().toUpperCase(), name.trim());
  };

  const handleScanSuccess = (scannedCode) => {
    setRoomCode(scannedCode.toUpperCase());
    if (name.trim()) {
      localStorage.setItem('ridetalk_name', name.trim());
      onJoinRoom(scannedCode.toUpperCase(), name.trim());
    }
  };

  return (
    <div className="card-cockpit">
      <div className="card-header">
        <button type="button" className="btn-icon-back" onClick={onBack} title="Geri">
          <ArrowLeft size={20} />
        </button>
        <div className="card-title-group">
          <h2 className="card-title">İnterkom Odasına Katıl</h2>
          <p className="card-subtitle">Liderin verdiği kodla veya QR ile bağlanın</p>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleJoin} className="form-group-stack">
        <div className="input-field-group">
          <label htmlFor="join-rider-name" className="input-label">
            Sürücü Adınız / Çağrı Kodunuz
          </label>
          <div className="input-with-icon">
            <User size={18} className="input-icon" />
            <input
              id="join-rider-name"
              type="text"
              className="input-text"
              placeholder="Örn: Serdar, GS-1250, Artçı"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={25}
              required
            />
          </div>
        </div>

        <div className="input-field-group">
          <label htmlFor="join-room-code" className="input-label">
            6 Haneli Oda Kodu
          </label>
          <div className="input-with-action">
            <div className="input-with-icon flex-1">
              <KeyRound size={18} className="input-icon" />
              <input
                id="join-room-code"
                type="text"
                className="input-text text-uppercase code-input"
                placeholder="ÖRN: K7X9AB"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                required
              />
            </div>
            <button
              type="button"
              className="btn-secondary btn-qr-scan"
              onClick={() => setIsScannerOpen(true)}
              title="Kamerayla QR Oku"
            >
              <QrCode size={18} />
              <span>QR Oku</span>
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary btn-full btn-large btn-glow mt-3"
          disabled={isConnecting || !name.trim() || roomCode.trim().length < 4}
        >
          {isConnecting ? (
            <span className="flex-center gap-2">
              <span className="spinner-sm"></span>
              <span>Bağlanılıyor...</span>
            </span>
          ) : (
            <span className="flex-center gap-2">
              <span>İnterkoma Katıl</span>
              <ArrowRight size={20} />
            </span>
          )}
        </button>
      </form>

      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
