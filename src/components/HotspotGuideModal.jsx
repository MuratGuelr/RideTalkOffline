import React from 'react';
import { X, Wifi, Radio, ShieldCheck, Zap } from 'lucide-react';

export default function HotspotGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content guide-modal">
        <div className="modal-header">
          <div className="modal-title">
            <Radio size={20} className="icon-neon" />
            <span>İnternetsiz Hotspot Moduna Geçiş</span>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="guide-body">
          <div className="guide-intro">
            <div className="badge-offline-pill">
              <Zap size={14} />
              <span>0 İNTERNET — YEREL MESH SESİ</span>
            </div>
            <p>
              Tüm sürücüler odaya katıldıktan sonra hücresel şebeke / internet kesilse bile sesinizin akmaya devam etmesi için aşağıdaki 3 adımı uygulayın:
            </p>
          </div>

          <div className="guide-steps">
            <div className="guide-step-card">
              <div className="step-num">1</div>
              <div className="step-text">
                <strong>Lider Hotspot (Kişisel Erişim Noktası) Açsın</strong>
                <p>Grup lideri telefonunun Wi-Fi Hotspot özelliğini aktif etsin.</p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="step-num">2</div>
              <div className="step-text">
                <strong>Diğer Sürücüler Liderin Wi-Fi Ağına Bağlansın</strong>
                <p>Gruptaki diğer tüm sürücüler liderin açtığı Hotspot Wi-Fi ağına bağlansın.</p>
              </div>
            </div>

            <div className="guide-step-card">
              <div className="step-num">3</div>
              <div className="step-text">
                <strong>Otomatik Yerel Ağa Geçiş (ICE Restart)</strong>
                <p>
                  Tarayıcınız ağ değişimini otomatik algılar ve ses akışını yerel Wi-Fi paketlerine taşır. Dağda, tünelde veya internet çekmeyen rotalarda ses kesintisiz devam eder!
                </p>
              </div>
            </div>
          </div>

          <div className="guide-tip">
            <ShieldCheck size={18} className="text-emerald" />
            <span>
              <strong>İpucu:</strong> Sürüş boyunca telefonunuzu gidon tutucusunda ve ekranı açık tutun.
            </span>
          </div>

          <button type="button" className="btn-primary btn-full mt-4" onClick={onClose}>
            Anladım, Sürüşe Devam Et
          </button>
        </div>
      </div>
    </div>
  );
}
