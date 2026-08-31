import React, { useState } from 'react';
import { Volume2, Bell, X, Check, VolumeX, Volume1, MicOff } from 'lucide-react';
import { setAlertVolume, getAlertVolume, playAlertTone, playMuteSound } from '../lib/announcer.js';

export default function AudioSettingsModal({
  isOpen,
  onClose,
  onIntercomVolumeChange,
}) {
  const [intercomVol, setIntercomVol] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ridetalk_intercom_vol') : null;
    return saved !== null ? Math.round(parseFloat(saved) * 100) : 80;
  });

  const [alertVol, setAlertVol] = useState(() => {
    const saved = getAlertVolume();
    return Math.round(saved * 100);
  });

  if (!isOpen) return null;

  const handleIntercomChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setIntercomVol(val);
    if (onIntercomVolumeChange) {
      onIntercomVolumeChange(val / 100);
    }
  };

  const handleAlertChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setAlertVol(val);
    setAlertVolume(val / 100);
  };

  const handleTestAlert = () => {
    playAlertTone('horn');
  };

  const handleTestMute = () => {
    playMuteSound();
  };

  return (
    <div
      className="modal-overlay modal-audio-backdrop animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-audio-cyber-card animate-scale-up">
        {/* Başlık */}
        <div className="audio-modal-header">
          <div className="audio-modal-title">
            <Volume2 size={20} className="text-neon" />
            <span>Kask Ses Seviyeleri</span>
          </div>
          <button
            type="button"
            className="audio-modal-close"
            onClick={onClose}
            aria-label="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="audio-modal-body">
          {/* 1. İnterkom / Sürücü Sesleri */}
          <div className="audio-control-group">
            <div className="audio-control-label-row">
              <div className="audio-label-left">
                {intercomVol === 0 ? (
                  <VolumeX size={16} className="text-crimson" />
                ) : intercomVol < 50 ? (
                  <Volume1 size={16} className="text-neon" />
                ) : (
                  <Volume2 size={16} className="text-neon" />
                )}
                <span>Telsiz / Sürücü Sesleri</span>
              </div>
              <span className="audio-vol-badge">{intercomVol}%</span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={intercomVol}
              onChange={handleIntercomChange}
              className="audio-range-slider slider-cyan"
            />
            <div className="audio-slider-hints">
              <span>Sessiz</span>
              <span>Dengeli (%80)</span>
              <span>Maksimum</span>
            </div>
          </div>

          {/* 2. İkaz, Mute & Bildirim Tonları (Varsayılan %40) */}
          <div className="audio-control-group">
            <div className="audio-control-label-row">
              <div className="audio-label-left">
                <Bell size={16} className="text-orange" />
                <span>İkaz, Mute & Bip Tonları</span>
              </div>
              <span className="audio-vol-badge text-orange">{alertVol}%</span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={alertVol}
              onChange={handleAlertChange}
              className="audio-range-slider slider-orange"
            />
            <div className="audio-slider-hints">
              <span>Sessiz</span>
              <span>Varsayılan (%40)</span>
              <span>Yüksek</span>
            </div>

            {/* Test Butonları */}
            <div className="audio-test-buttons-row">
              <button
                type="button"
                className="btn-test-alert-sound"
                onClick={handleTestMute}
                title="Mute sesini test et"
              >
                <MicOff size={14} />
                <span>Mute Sesi Test</span>
              </button>

              <button
                type="button"
                className="btn-test-alert-sound"
                onClick={handleTestAlert}
                title="İkaz kornasını test et"
              >
                <Bell size={14} />
                <span>İkaz Tonu Test</span>
              </button>
            </div>
          </div>
        </div>

        {/* Kaydet & Kapat Butonu */}
        <button type="button" className="btn-audio-modal-done" onClick={onClose}>
          <Check size={18} />
          <span>Tamam</span>
        </button>
      </div>
    </div>
  );
}
