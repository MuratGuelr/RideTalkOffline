import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: Number(PORT) });

// roomCode -> Map<peerId, { id: string, ws: WebSocket, name: string, joinedAt: number }>
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

wss.on('connection', (ws, req) => {
  let currentRoom = null;
  let peerId = null;
  let clientIp = req.socket.remoteAddress;

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'create-room': {
          let code = generateRoomCode();
          while (rooms.has(code)) {
            code = generateRoomCode();
          }

          peerId = crypto.randomUUID();
          currentRoom = code;

          const roomPeers = new Map();
          const peerName = (msg.name || 'Sürücü (Lider)').trim();
          roomPeers.set(peerId, {
            id: peerId,
            ws,
            name: peerName,
            joinedAt: Date.now(),
          });
          rooms.set(code, roomPeers);

          console.log(`[+] Oda Oluşturuldu: ${code} | Kurucu: ${peerName} (${peerId.slice(0, 8)})`);

          ws.send(
            JSON.stringify({
              type: 'room-created',
              roomCode: code,
              peerId,
              name: peerName,
            })
          );
          break;
        }

        case 'join-room': {
          const targetCode = (msg.roomCode || '').toUpperCase().trim();
          const room = rooms.get(targetCode);

          if (!room) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: `Oda bulunamadı (#${targetCode}). Lütfen kodu kontrol edin.`,
              })
            );
            return;
          }

          peerId = crypto.randomUUID();
          currentRoom = targetCode;
          const peerName = (msg.name || `Sürücü ${room.size + 1}`).trim();

          // Send current peers to the joining peer
          const existingPeers = Array.from(room.values()).map((p) => ({
            id: p.id,
            name: p.name,
          }));

          ws.send(
            JSON.stringify({
              type: 'joined',
              peerId,
              roomCode: targetCode,
              name: peerName,
              existingPeers,
            })
          );

          // Broadcast to everyone else in the room that a new peer joined
          room.forEach((p) => {
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(
                JSON.stringify({
                  type: 'peer-joined',
                  peerId,
                  name: peerName,
                })
              );
            }
          });

          // Add joining peer to the room map
          room.set(peerId, {
            id: peerId,
            ws,
            name: peerName,
            joinedAt: Date.now(),
          });

          console.log(`[+] Odaya Katılım: ${targetCode} | Katılan: ${peerName} (${peerId.slice(0, 8)}) | Toplam: ${room.size}`);
          break;
        }

        // Direct signal forwarding for WebRTC SDP offers/answers and ICE candidates
        case 'signal': {
          if (!currentRoom) return;
          const room = rooms.get(currentRoom);
          if (!room) return;

          const target = room.get(msg.targetPeerId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(
              JSON.stringify({
                type: 'signal',
                fromPeerId: peerId,
                data: msg.data,
              })
            );
          }
          break;
        }

        case 'leave-room': {
          handlePeerLeave();
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }

        default:
          console.warn(`[!] Bilinmeyen mesaj tipi: ${msg.type}`);
      }
    } catch (err) {
      console.error('[!] Mesaj işleme hatası:', err.message);
    }
  });

  function handlePeerLeave() {
    if (currentRoom && peerId) {
      const room = rooms.get(currentRoom);
      if (room) {
        const leavingPeer = room.get(peerId);
        const name = leavingPeer ? leavingPeer.name : 'Bir kullanıcı';
        room.delete(peerId);

        console.log(`[-] Odadan Ayrıldı: ${currentRoom} | ${name} (${peerId.slice(0, 8)})`);

        room.forEach((p) => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(
              JSON.stringify({
                type: 'peer-left',
                peerId,
                name,
              })
            );
          }
        });

        if (room.size === 0) {
          rooms.delete(currentRoom);
          console.log(`[x] Oda kapandı: ${currentRoom}`);
        }
      }
      currentRoom = null;
      peerId = null;
    }
  }

  ws.on('close', () => {
    handlePeerLeave();
  });

  ws.on('error', (err) => {
    console.error(`[!] WebSocket hatası (${clientIp}):`, err.message);
  });
});

// Periodic heartbeat to prevent mobile cellular/WiFi connection dropouts
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

console.log('═══════════════════════════════════════════════════════');
console.log('  🏍️  RideTalk WebRTC Sinyal Sunucusu Başlatıldı      ');
console.log(`  📡  Port: ${PORT} (ws://localhost:${PORT})           `);
console.log('  ⚡  Tam Mesh Ses & Yerel Hotspot Desteği Aktif      ');
console.log('═══════════════════════════════════════════════════════');
