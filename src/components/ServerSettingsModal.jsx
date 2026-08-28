import React, { useState } from 'react';
import { X, Server, Check, RotateCcw } from 'lucide-react';

export default function ServerSettingsModal({ isOpen, onClose, onSave }) {
  const defaultUrl = import.meta.env.VITE_SIGNALING_SERVER_URL || '';
  const currentSaved = localStorage.getItem('ridetalk_server_url') || defaultUrl;
  const [serverUrl, setServerUrl] = useState(currentSaved);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e) => {
    e.preventDefault();
    const trimmed = serverUrl.trim();
    if (trimmed) {
      localStorage.setItem('ridetalk_server_url', trimmed);
    } else {
      localStorage.removeItem('ridetalk_server_url');
    }
    setSaved(true);
    if (onSave) onSave(trimmed);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1000);
  };

  const handleReset = () => {
    localStorage.removeItem('ridetalk_server_url');
    setServerUrl(defaultUrl);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-title">
            <Server size={20} className="icon-neon" />
            <span>Sinyal Sunucusu Ayarları</span>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="modal-scrollable-body p-4 flex flex-col gap-4">
          <div className="input-field-group">
            <label htmlFor="server-url-input" className="input-label">
              WebSocket Sunucu Adresi (WSS / WS)
            </label>
            <input
              id="server-url-input"
              type="text"
              className="input-text"
              placeholder="Örn: wss://ridetalk-signal.onrender.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
            <span className="text-xs text-muted" style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '4px' }}>
              Vercel üzerinde barındırırken Render, Railway veya Fly.io üzerindeki WebSocket sunucu adresinizi buraya yazabilirsiniz. Firebase kullanıyorsanız burayı boş bırakabilirsiniz.
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button type="button" className="btn-secondary" style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={handleReset}>
              <RotateCcw size={16} />
              <span>Varsayılan</span>
            </button>
            <button type="submit" className="btn-primary flex-1" style={{ width: '100%' }}>
              {saved ? (
                <span className="flex-center gap-2">
                  <Check size={18} />
                  <span>Kaydedildi</span>
                </span>
              ) : (
                <span>Kaydet</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
