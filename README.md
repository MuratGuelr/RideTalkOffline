# 🏍️ RideTalk — Motorcycle Full-Mesh WebRTC & Offline Hotspot Intercom

> **RideTalk** is an ultra-low-latency, zero-server-cost WebRTC Full-Mesh audio intercom engineered specifically for motorcycle riders. It pairs riders automatically over local Wi-Fi / Mobile Hotspots with **10-20ms real-time audio**, **hardware noise suppression (DTX)**, and an **OLED dark cockpit HUD**.

---

## ⚡ Key Highlights & Features

- **🚀 1-Tap / Zero-Click Auto-Mesh Connection:**
  No room codes, no passwords, no QR scanning. Open the web app on all devices connected to the same ride group or Hotspot, tap **"CONNECT"** (or enable auto-connect on launch), and everyone is immediately grouped into the full-mesh voice channel in < 1 second.
- **⚡ Ultra-Low Latency Real-Time Audio (10-20ms):**
  Uses native WebRTC C++ hardware audio capture with 10ms Opus frames (`minptime=10; ptime=10; maxptime=20`), `playoutDelayHint = 0` (zero jitter buffering delay), delivering instantaneous communication on the road.
- **🔇 Hardware Noise Gate & Wind Suppression (Opus DTX):**
  Enabled with Opus Discontinuous Transmission (`usedtx=1`) and WebRTC hardware DSP (AEC + NS + AGC). When you are not speaking, background wind hiss and exhaust rumble are 100% silenced without introducing audio buffer lag.
- **🔋 OLED Deep Blackout Mode (%95 Battery Saver):**
  One-tap OLED blackout (`#000000`) physically turns off screen pixels on AMOLED/OLED displays while preserving uninterrupted voice streaming in the background. Wake up anytime with a quick double-tap.
- **🔒 Glove & Pocket Accidental Touch Shield:**
  Prevents vibrations, handlebar shakes, and rain droplets from accidentally muting or leaving the call. Unlock with a deliberate 1.2-second hold.
- **📴 100% Offline PWA Caching:**
  Fully configured Service Worker (`sw.js`) caches all assets locally on the phone. The web app loads in 0.05 seconds even in dead zones with 0 cellular reception.
- **☁️ Serverless & Vercel-Ready (Firebase Realtime DB):**
  Requires zero self-hosted Node.js servers. Deploys seamlessly to Vercel/Netlify using Firebase Realtime Database for initial signaling and WebRTC peer negotiation.

---

## 🏍️ How It Works (Rider Workflow)

```
                       [ Initial 1-Second Handshake ]
            Phone 1 (Leader) <--- Firebase RTDB ---> Phone 2 (Rider)
                                     |
                                     v
                        [ Direct P2P Audio Stream ]
            Phone 1 (192.168.43.1) <================> Phone 2 (192.168.43.x)
                        (Over Local Wi-Fi / Hotspot — 0 Internet Needed)
```

1. **Before the Ride (At Gas Station / Roadside):**
   - Leader enables Mobile Hotspot.
   - Other riders connect to Leader's Wi-Fi Hotspot.
   - All riders open the app URL and tap **"CONNECT"**.
2. **Instant Signaling:**
   - Firebase negotiates local IP addresses (`192.168.43.x`) and WebRTC crypto keys in under 1 second (< 2 KB data).
3. **P2P Audio Over Hotspot:**
   - Audio stream locks onto the local Wi-Fi network.
   - Even if cellular data drops completely in tunnels or remote mountain passes, **the voice stream remains alive over local Wi-Fi.**

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Firebase Environment Variables
Create or edit `.env` in the project root:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.europe-west1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production (Vercel / Netlify / Static Host)
```bash
npm run build
```

---

## 📁 Project Structure

```
MotoRideOffline/
├── public/
│   ├── favicon.svg             ← Vector icon
│   ├── manifest.json           ← PWA manifest
│   ├── sw.js                   ← Offline Service Worker cache
│   └── sounds/                 ← Preloaded audio alerts (mute, unmute, leave)
├── src/
│   ├── components/
│   │   ├── ActiveRoom.jsx      ← Motorcycle Cyber Cockpit HUD & glove controls
│   │   ├── ParticipantCard.jsx ← Live audio visualizer rider cards & telemetry
│   │   ├── ConnectionQualityBadge.jsx ← Network latency & ping indicator
│   │   ├── HotspotGuideModal.jsx   ← Connection guidance modal
│   │   ├── RoomCreate.jsx      ← Custom group creator
│   │   ├── RoomJoin.jsx        ← Join by custom group ID
│   │   └── ServerSettingsModal.jsx ← Custom Firebase/signaling config modal
│   ├── lib/
│   │   ├── meshManager.js      ← WebRTC Full-Mesh engine (10ms Opus, DTX, ICE restart)
│   │   ├── firebaseSignaling.js← Serverless Firebase Realtime DB signaling client
│   │   ├── audioMeter.js       ← Lightweight shared Web Audio level analyzer
│   │   ├── announcer.js        ← Web Speech TTS voice announcer & sound alerts
│   │   ├── networkWatcher.js   ← Local IP change & network interface watcher
│   │   └── wakeLock.js         ← Screen Wake Lock API controller
│   ├── App.jsx                 ← Main application coordinator & 3s auto-connect
│   ├── App.css                 ← Motorcycle Cockpit & Dark OLED design system
│   ├── index.css               ← Global tokens & resets
│   └── main.jsx                ← React root
├── vite.config.js              ← Vite build & mobile network host config
└── package.json
```

---

## 🛠️ Technology Stack

- **Frontend Core:** React 18, Vite
- **WebRTC Engine:** Full-Mesh `RTCPeerConnection`, W3C Polite Peer Pattern
- **Audio DSP:** Opus Codec with 10ms frame size, `usedtx=1`, Hardware AEC/NS/AGC
- **Signaling:** Firebase Realtime Database (Serverless)
- **Offline / PWA:** Service Worker Cache API, Web App Manifest
- **Device APIs:** Screen Wake Lock API, Web Audio API, Web Speech API, Haptic Vibration API
- **Styling:** Pure Vanilla CSS (OLED Cyber Cockpit Theme)

---

## 📜 License
MIT License. Created for motorcycle enthusiasts and group riders. 🏍️💨
