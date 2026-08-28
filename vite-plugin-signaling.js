// Vite Plugin: Yerel Ağ Sinyal Sunucusu
// Hotspot üzerindeki tüm cihazlar bu WebSocket sunucusuna bağlanır
// ve otomatik olarak aynı odaya atılır. Kod yok, QR yok.

import { WebSocketServer } from 'ws';

export default function localSignalingPlugin() {
  return {
    name: 'vite-plugin-local-signaling',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const room = new Map(); // peerId -> { ws, name }

      // Vite'ın kendi HMR upgrade'ini bozmadan, sadece /ws/signal yolunu yakala
      server.httpServer.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/ws/signal') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
        // Diğer upgrade istekleri (HMR vs.) Vite'a bırakılır
      });

      wss.on('connection', (ws) => {
        let myPeerId = null;
        let myName = null;

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());

            switch (msg.type) {
              case 'join': {
                myPeerId = msg.peerId || ('peer_' + Math.random().toString(36).substring(2, 9));
                myName = msg.name || 'Sürücü';

                // Odadaki mevcut herkesi yeni gelene bildir
                const existingPeers = [];
                for (const [pid, peer] of room.entries()) {
                  existingPeers.push({ id: pid, name: peer.name });
                  // Mevcut herkese yeni geleni bildir
                  try {
                    peer.ws.send(JSON.stringify({
                      type: 'peer-joined',
                      peerId: myPeerId,
                      name: myName,
                    }));
                  } catch (_) {}
                }

                room.set(myPeerId, { ws, name: myName });

                // Yeni gelene "hoşgeldin" + mevcut peer listesi
                ws.send(JSON.stringify({
                  type: 'joined',
                  peerId: myPeerId,
                  name: myName,
                  roomCode: 'HOTSPOT',
                  existingPeers,
                }));

                console.log(`[Sinyal] ✅ ${myName} katıldı (${myPeerId}). Odada ${room.size} kişi.`);
                break;
              }

              case 'signal': {
                // WebRTC SDP/ICE mesajını hedefe ilet
                const target = room.get(msg.targetPeerId);
                if (target && target.ws.readyState === 1) {
                  target.ws.send(JSON.stringify({
                    type: 'signal',
                    fromPeerId: myPeerId,
                    data: msg.data,
                  }));
                }
                break;
              }

              default:
                break;
            }
          } catch (err) {
            console.warn('[Sinyal] Mesaj hatası:', err.message);
          }
        });

        ws.on('close', () => {
          if (myPeerId) {
            room.delete(myPeerId);
            // Herkese "ayrıldı" bildir
            for (const [, peer] of room.entries()) {
              try {
                peer.ws.send(JSON.stringify({
                  type: 'peer-left',
                  peerId: myPeerId,
                  name: myName,
                }));
              } catch (_) {}
            }
            console.log(`[Sinyal] ❌ ${myName} ayrıldı. Odada ${room.size} kişi.`);
          }
        });

        ws.on('error', () => {});
      });

      console.log('\n  ➜  🎙️  Hotspot İnterkom Sinyal Sunucusu: /ws/signal\n');
    },
  };
}
