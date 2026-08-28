import React, { useState, useEffect } from 'react';
import { User, KeyRound, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function RoomJoin({ initialRoomCode = '', onJoinRoom, isConnecting, error, onBack }) {
  const [name, setName] = useState(localStorage.getItem('ridetalk_name') || 'Sürücü');
  const [roomCode, setRoomCode] = useState(initialRoomCode || 'MOTO-RIDE');

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

  return (
    <div className="card-cockpit">
      <div className="card-header">
        <button type="button" className="btn-icon-back" onClick={onBack} title="Geri">
          <ArrowLeft size={20} />
        </button>
        <div className="card-title-group">
          <h2 className="card-title">Telsiz Odasına Katıl</h2>
          <p className="card-subtitle">Oda kodunu yazarak veya varsayılan gruba bağlanın</p>
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
            Oda Kodu / Grup Adı
          </label>
          <div className="input-with-icon">
            <KeyRound size={18} className="input-icon" />
            <input
              id="join-room-code"
              type="text"
              className="input-text text-uppercase code-input"
              placeholder="ÖRN: MOTO-RIDE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={20}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary btn-full btn-large btn-glow mt-3"
          disabled={isConnecting || !name.trim() || !roomCode.trim()}
        >
          {isConnecting ? (
            <span className="flex-center gap-2">
              <span className="spinner-sm"></span>
              <span>Bağlanılıyor...</span>
            </span>
          ) : (
            <span className="flex-center gap-2">
              <span>Telsize Katıl</span>
              <ArrowRight size={20} />
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
