import React, { useState } from 'react';
import QRCodeDisplay from './QRCodeDisplay.jsx';
import { Radio, User, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function RoomCreate({ onStartRoom, isConnecting, error, roomData, onEnterActiveRoom, onBack }) {
  const [name, setName] = useState(localStorage.getItem('ridetalk_name') || 'Lider Sürücü');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    localStorage.setItem('ridetalk_name', name.trim());
    onStartRoom(name.trim());
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const joinUrl = roomData ? `${currentOrigin}?room=${roomData.roomCode}` : '';

  return (
    <div className="card-cockpit">
      <div className="card-header">
        <button type="button" className="btn-icon-back" onClick={onBack} title="Geri">
          <ArrowLeft size={20} />
        </button>
        <div className="card-title-group">
          <h2 className="card-title">Yeni İnterkom Odası</h2>
          <p className="card-subtitle">Grup lideri olarak telsiz odasını başlatın</p>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      {!roomData ? (
        <form onSubmit={handleCreate} className="form-group-stack">
          <div className="input-field-group">
            <label htmlFor="rider-name" className="input-label">
              Sürücü Adınız / Çağrı Kodunuz
            </label>
            <div className="input-with-icon">
              <User size={18} className="input-icon" />
              <input
                id="rider-name"
                type="text"
                className="input-text"
                placeholder="Örn: Kaptan Ahmet, MT-07, Lider"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={25}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="info-callout">
            <Radio size={18} className="text-neon" />
            <p>
              Oda oluşturulduğunda bir QR kod ve 6 haneli oda kodu verilecektir. Diğer sürücüler bu kodu okutarak anında telsiz grubunuza katılır.
            </p>
          </div>

          <button
            type="submit"
            className="btn-primary btn-full btn-glow"
            disabled={isConnecting || !name.trim()}
          >
            {isConnecting ? (
              <span className="flex-center gap-2">
                <span className="spinner-sm"></span>
                <span>Oda Oluşturuluyor...</span>
              </span>
            ) : (
              <span className="flex-center gap-2">
                <span>Odayı Başlat</span>
                <ArrowRight size={18} />
              </span>
            )}
          </button>
        </form>
      ) : (
        <div className="room-created-success">
          <QRCodeDisplay roomCode={roomData.roomCode} joinUrl={joinUrl} />

          <div className="room-ready-action">
            <button
              type="button"
              className="btn-primary btn-full btn-large btn-glow"
              onClick={onEnterActiveRoom}
            >
              <span>İnterkoma Başla (Kokpite Gir)</span>
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
