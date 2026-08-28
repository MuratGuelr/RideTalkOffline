# 🏍️ RideTalk — Motosiklet Tam Mesh WebRTC & İnternetsiz Hotspot İnterkomu

> **Not:** Bu proje tamamen **React 18 + JavaScript / JSX (`.jsx`, `.js`)** mimarisiyle yazılmıştır.

---

## 🚀 Hızlı Başlangıç

### 1. Bağımlılıkları Yükleyin
```bash
npm install
```

### 2. Hem Sinyal Sunucusunu Hem de Vite Frontend'ini Başlatın
```bash
npm run dev:all
```
*Frontend:* `http://localhost:5173` (veya yerel IP: `http://192.168.x.x:5173`)  
*WebSocket Sinyal Sunucusu:* `ws://localhost:8080`

Ayrı ayrı çalıştırmak isterseniz:
- **Sinyal Sunucusu:** `npm run server`
- **Frontend:** `npm run dev`

---

## 📱 Sürüş & Hotspot Akışı (İnternetsiz Devam)

1. **Lider:** Tarayıcıdan girer, **Oda Oluştur**'a basar, 6 haneli kod ve QR kod üretilir.
2. **Katılımcılar:** QR kodu kamerayla okutur veya kodu girerek odaya katılır.
3. **El Sıkışma:** Sinyal sunucusu üzerinden SDP/ICE değişimi tamamlanır ve doğrudan WebRTC Full-Mesh ses kanalı açılır.
4. **Hotspot Geçişi:** Lider telefonunda Kişisel Erişim Noktası (Hotspot) açar, diğerleri bu Wi-Fi ağına bağlanır.
5. **İnternetsiz Mesh:** Ağ değişimi sonrası ICE Restart işlemi WebRTC `DataChannel` üzerinden doğrudan peer'den peer'e taşınır. İnternet ve hücresel şebeke tamamen kesilse bile ses akışı devam eder!
6. **Kopma Anonsu:** Web Speech API (`speechSynthesis`) ile internet gerekmeksizin Türkçe sesli bildirim yapılır (*"Ahmet'in bağlantısı koptu"*).

---

## 🛠️ Proje Yapısı

```
ridetalk/
├── server/
│   └── server.js               ← Node.js + ws WebSocket sinyal sunucusu
├── src/
│   ├── components/
│   │   ├── ActiveRoom.jsx       ← Motosiklet kokpit HUD görünümü
│   │   ├── RoomCreate.jsx       ← Oda oluşturma & isim belirleme
│   │   ├── RoomJoin.jsx         ← Kodla/QR ile odaya katılma
│   │   ├── QRCodeDisplay.jsx    ← QR kod üretici (qrcode.react)
│   │   ├── QRScannerModal.jsx   ← Canlı kamera QR okuyucu (jsQR)
│   │   ├── ParticipantCard.jsx  ← Ses seviyesi & RTT göstergeli sürücü kartı
│   │   ├── ConnectionQualityBadge.jsx ← Hotspot / STUN ağ rozeti
│   │   └── HotspotGuideModal.jsx← 3 adımlı internetsiz geçiş rehberi
│   ├── lib/
│   │   ├── meshManager.js       ← WebRTC RTCPeerConnection & DataChannel ICE restart
│   │   ├── signaling.js         ← WebSocket istemcisi
│   │   ├── announcer.js         ← Web Speech API Türkçe TTS & ikaz tonları
│   │   ├── wakeLock.js          ← Screen Wake Lock API
│   │   ├── networkWatcher.js    ← Hotspot/WiFi ağ değişikliği takipçisi
│   │   └── audioMeter.js        ← Web Audio API ses seviyesi analizörü
│   ├── App.jsx                  ← Ana uygulama mantığı
│   ├── App.css                  ← Motosiklet HUD karanlık tema stili
│   ├── index.css                ← Global tasarım tokenları
│   └── main.jsx
├── vite.config.js               ← Host & port ayarları (mobil erişim için)
└── package.json
```
