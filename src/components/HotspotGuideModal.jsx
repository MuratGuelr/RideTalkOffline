import React from 'react';
import { X, Radio, ShieldCheck, Zap } from 'lucide-react';

export default function HotspotGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content guide-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Radio size={20} className="icon-neon" />
            <span>?nternetsiz Hotspot Rehberi</span>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        <div className="guide-body modal-scrollable-body">
          <div className="guide-intro">
            <div className="badge-offline-pill">
              <Zap size={14} />
              <span>0 ?NTERNET ? YEREL MESH SES?</span>
            </div>
            <p>
              T?m s?r?c?ler odaya kat?ld?ktan sonra h?cresel ?ebeke / internet kesilse bile sesinizin akmaya devam etmesi i?in a?a??daki 3 ad?m? uygulay?n:
            </p>
          </div>

          <div className="guide-steps">
            <div className="guide-step-card">
              <div className="step-num">1</div>
              <div className="step-text">
                <strong>Lider Hotspot (Ki?isel Eri?im Noktas?) A?s?n</strong>
                <p>Grup lideri telefonunun Wi-Fi Hotspot ?zelli?ini aktif etsin.</p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="step-num">2</div>
              <div className="step-text">
                <strong>Di?er S?r?c?ler Liderin Wi-Fi A??na Ba?lans?n</strong>
                <p>Gruptaki di?er t?m s?r?c?ler liderin a?t??? Hotspot Wi-Fi a??na ba?lans?n.</p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="step-num">3</div>
              <div className="step-text">
                <strong>Otomatik Yerel A?a Ge?i? (ICE Restart)</strong>
                <p>
                  Taray?c?n?z a? de?i?imini otomatik alg?lar ve ses ak???n? yerel Wi-Fi paketlerine ta??r. Da?da, t?nelde veya internet ?ekmeyen rotalarda ses kesintisiz devam eder!
                </p>
              </div>
            </div>
          </div>

          <div className="guide-tip">
            <ShieldCheck size={18} className="text-emerald" />
            <span>
              <strong>?pucu:</strong> S?r?? boyunca telefonunuzu gidon tutucusunda ve ekran? a??k tutun.
            </span>
          </div>

          <button type="button" className="btn-primary btn-full mt-4" onClick={onClose}>
            Anlad?m, S?r??e Devam Et
          </button>
        </div>
      </div>
    </div>
  );
}
