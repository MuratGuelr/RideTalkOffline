import React, { useState } from 'react';
import { Radio, User, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';

export default function RoomCreate({ onStartRoom, isConnecting, error, onBack }) {
  const [name, setName] = useState(localStorage.getItem('ridetalk_name') || 'Lider Sürücü');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    localStorage.setItem('ridetalk_name', name.trim());
    onStartRoom(name.trim());
  };

  return (
    <div className="card-cockpit">
      <div className="card-header">
        <button type="button" className="btn-icon-back" onClick={onBack} title="Geri">
          <ArrowLeft size={20} />
        </button>
        <div className="card-title-group">
          <h2 className="card-title">Telsiz Odası Aç</h2>
          <p className="card-subtitle">Grup lideri olarak telsiz odasını başlatın</p>
        </div>
      </div>

      {error && (
        <div className="alert-box alert-error">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

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
            Oda başlatıldığında diğer sürücüler otomatik olarak aynı telsiz grubuna bağlanır.
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
              <span>Oda Başlatılıyor...</span>
            </span>
          ) : (
            <span className="flex-center gap-2">
              <span>Odayı Başlat ve Konuş</span>
              <ArrowRight size={18} />
            </span>
          )}
        </button>
      </form>
    </div>
  );
}
