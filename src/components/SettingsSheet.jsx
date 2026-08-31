import React, { useState, useEffect } from 'react';
import {
  Moon,
  Volume2,
  Lock,
  LockOpen,
  Maximize,
  Minimize,
  Sliders,
  Bell,
  MicOff,
  Mic,
  Headphones,
  Shield,
  BatteryCharging,
} from 'lucide-react';
import { setAlertVolume, getAlertVolume, playAlertTone, playMuteSound } from '../lib/announcer.js';
import { MeshManager } from '../lib/meshManager.js';

export default function SettingsSheet({
  isOpen,
  onClose,
  isBlackoutMode,
  onToggleBlackout,
  isTouchLocked,
  onToggleTouchLock,
  isWakeLockActive,
  onToggleWakeLock,
  isFullscreen,
  onToggleFullscreen,
  onIntercomVolumeChange,
  onAudioInputDeviceChange,
  onAudioOutputDeviceChange,
}) {
  const [activeTab, setActiveTab] = useState('audio'); // 'audio' | 'display' | 'safety'

  const [intercomVol, setIntercomVol] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ridetalk_intercom_vol') : null;
    return saved !== null ? Math.round(parseFloat(saved) * 100) : 80;
  });

  const [alertVol, setAlertVol] = useState(() => {
    const saved = getAlertVolume();
    return Math.round(saved * 100);
  });

  const [inputDevices, setInputDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [selectedInput, setSelectedInput] = useState(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('ridetalk_input_device') || 'default' : 'default';
  });
  const [selectedOutput, setSelectedOutput] = useState(() => {
    return typeof localStorage !== 'undefined' ? localStorage.getItem('ridetalk_output_device') || 'default' : 'default';
  });

  // Aygıt listesini al
  useEffect(() => {
    const loadDevices = async () => {
      const { inputs, outputs } = await MeshManager.getAvailableAudioDevices();
      setInputDevices(inputs);
      setOutputDevices(outputs);
    };

    if (isOpen) {
      loadDevices();
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener('devicechange', loadDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
      };
    }
  }, [isOpen]);

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

  const handleInputChange = (e) => {
    const deviceId = e.target.value;
    setSelectedInput(deviceId);
    if (onAudioInputDeviceChange) {
      onAudioInputDeviceChange(deviceId);
    }
  };

  const handleOutputChange = (e) => {
    const deviceId = e.target.value;
    setSelectedOutput(deviceId);
    if (onAudioOutputDeviceChange) {
      onAudioOutputDeviceChange(deviceId);
    }
  };

  return (
    <>
      <div
        className={`sheet-backdrop ${isOpen ? 'open' : ''}`}
        onClick={onClose}
      />
      <div className={`sheet ${isOpen ? 'open' : ''}`}>
        <div className="sheet-handle" onClick={onClose} />
        <div className="sheet-header-row">
          <div className="sheet-title">Hızlı Ayarlar</div>
        </div>

        {/* =========================================================
            SOLDAN SAĞA BASILARAK GEÇİLEN KATEGORİ TABLARI
            ========================================================= */}
        <div className="sheet-tabs-bar">
          <button
            type="button"
            className={`sheet-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
            onClick={() => setActiveTab('audio')}
          >
            <Volume2 size={15} />
            <span>Ses & Kask</span>
          </button>

          <button
            type="button"
            className={`sheet-tab-btn ${activeTab === 'display' ? 'active' : ''}`}
            onClick={() => setActiveTab('display')}
          >
            <BatteryCharging size={15} />
            <span>Ekran & Pil</span>
          </button>

          <button
            type="button"
            className={`sheet-tab-btn ${activeTab === 'safety' ? 'active' : ''}`}
            onClick={() => setActiveTab('safety')}
          >
            <Shield size={15} />
            <span>Güvenlik</span>
          </button>
        </div>

        {/* =========================================================
            SEKME 1: 🎧 SES & KASK AYGITLARI
            ========================================================= */}
        {activeTab === 'audio' && (
          <div className="settings-tab-pane animate-fade-in">
            {/* Telsiz Sesi */}
            <div className="category-item-block">
              <div className="item-label-row">
                <span className="item-title">Telsiz & Sürücü Sesi</span>
                <span className="vol-percent-badge">{intercomVol}%</span>
              </div>
              <div className="sheet-slider-wrap">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={intercomVol}
                  onChange={handleIntercomChange}
                  className="sheet-range-slider slider-cyan"
                />
              </div>
            </div>

            {/* İkaz & Mute Tonları */}
            <div className="category-item-block">
              <div className="item-label-row">
                <span className="item-title">İkaz & Mute Tonları</span>
                <span className="vol-percent-badge text-orange">{alertVol}%</span>
              </div>
              <div className="sheet-slider-wrap">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={alertVol}
                  onChange={handleAlertChange}
                  className="sheet-range-slider slider-orange"
                />
              </div>

              <div className="sheet-test-buttons">
                <button
                  type="button"
                  className="btn-sheet-test"
                  onClick={() => playMuteSound()}
                >
                  <MicOff size={13} />
                  <span>Mute Test</span>
                </button>
                <button
                  type="button"
                  className="btn-sheet-test"
                  onClick={() => playAlertTone('horn')}
                >
                  <Bell size={13} />
                  <span>İkaz Test</span>
                </button>
              </div>
            </div>

            {/* Giriş Mikrofonu Seçimi */}
            <div className="device-select-row">
              <div className="device-label-wrap">
                <Mic size={14} className="text-neon" />
                <span>Mikrofon (Giriş)</span>
              </div>
              <select
                value={selectedInput}
                onChange={handleInputChange}
                className="sheet-device-select"
              >
                <option value="default">Varsayılan Mikrofon</option>
                {inputDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Mikrofon ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Çıkış Hoparlörü / Kask Kulaklığı Seçimi */}
            {outputDevices.length > 0 && (
              <div className="device-select-row">
                <div className="device-label-wrap">
                  <Headphones size={14} className="text-emerald" />
                  <span>Hoparlör / Kask (Çıkış)</span>
                </div>
                <select
                  value={selectedOutput}
                  onChange={handleOutputChange}
                  className="sheet-device-select"
                >
                  <option value="default">Varsayılan Hoparlör</option>
                  {outputDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Hoparlör ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            SEKME 2: 🔋 EKRAN & PİL TASARRUFU
            ========================================================= */}
        {activeTab === 'display' && (
          <div className="settings-tab-pane animate-fade-in">
            {/* OLED Modu */}
            <div className="sheet-row">
              <div className="sheet-row-left">
                <div className="s-icon">
                  <Moon size={15} className="text-neon" />
                </div>
                <div>
                  <div className="s-name">OLED modu</div>
                  <div className="s-desc">Ekranı tamamen karartarak pil tasarrufu sağlar</div>
                </div>
              </div>
              <div
                className={`switch ${isBlackoutMode ? 'on' : ''}`}
                onClick={() => {
                  onToggleBlackout();
                  onClose();
                }}
              />
            </div>

            {/* Ekranı Uyanık Tut (Wake Lock) */}
            <div className="sheet-row">
              <div className="sheet-row-left">
                <div className="s-icon">
                  <Sliders size={15} />
                </div>
                <div>
                  <div className="s-name">Ekranı uyanık tut</div>
                  <div className="s-desc">Sürüş boyunca ekran kararmaz</div>
                </div>
              </div>
              <div
                className={`switch ${isWakeLockActive ? 'on' : ''}`}
                onClick={onToggleWakeLock}
              />
            </div>

            {/* Tam Ekran Modu */}
            <div className="sheet-row" style={{ borderBottom: 'none' }}>
              <div className="sheet-row-left">
                <div className="s-icon">
                  {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </div>
                <div>
                  <div className="s-name">Tam ekran</div>
                  <div className="s-desc">Tarayıcı durum çubuğunu gizler</div>
                </div>
              </div>
              <div
                className={`switch ${isFullscreen ? 'on' : ''}`}
                onClick={onToggleFullscreen}
              />
            </div>
          </div>
        )}

        {/* =========================================================
            SEKME 3: 🛡️ SÜRÜŞ GÜVENLİĞİ
            ========================================================= */}
        {activeTab === 'safety' && (
          <div className="settings-tab-pane animate-fade-in">
            {/* Gidon Dokunma Kilidi */}
            <div className="sheet-row" style={{ borderBottom: 'none' }}>
              <div className="sheet-row-left">
                <div className="s-icon">
                  {isTouchLocked ? <Lock size={15} className="text-crimson" /> : <LockOpen size={15} />}
                </div>
                <div>
                  <div className="s-name">Gidon dokunma kilidi</div>
                  <div className="s-desc">Yanlışlıkla basmaları ve titreşim dokunuşlarını önler</div>
                </div>
              </div>
              <div
                className={`switch ${isTouchLocked ? 'on' : ''}`}
                onClick={onToggleTouchLock}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
