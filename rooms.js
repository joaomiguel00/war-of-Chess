// Salas do multiplayer online: cria código, casa os dois jogadores e repassa
// lances/chat entre eles. O servidor não conhece as regras do xadrez — cada
// cliente valida os lances (os dois rodam o mesmo motor determinístico);
// aqui é só o encanamento da sala.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, pra não confundir
const CODE_LENGTH = 5;
const MAX_MESSAGE_BYTES = 4000; // lance + chat cabem de sobra; corta abuso

function makeCode(rooms) {
  let code;
  do {
    code = Array.from({ length: CODE_LENGTH }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(ws, payload) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

// Emblema escolhido pelo jogador: só um identificador curto de letras.
function cleanEmblem(value) {
  return String(value ?? '').replace(/[^a-z]/g, '').slice(0, 12);
}

function opponentOf(room, color) {
  return color === 'w' ? room.b : room.w;
}

export function createRoomServer(wss) {
  const rooms = new Map(); // code -> { w: ws|null, b: ws|null }

  function leaveRoom(ws) {
    const info = ws.roomInfo;
    if (!info) return;
    const room = rooms.get(info.code);
    ws.roomInfo = null;
    if (!room) return;
    if (room[info.color] === ws) room[info.color] = null;
    const other = opponentOf(room, info.color);
    if (other) send(other, { type: 'opponent-left' });
    if (!room.w && !room.b) rooms.delete(info.code);
  }

  wss.on('connection', (ws) => {
    ws.roomInfo = null;

    ws.on('message', (raw) => {
      if (raw.length > MAX_MESSAGE_BYTES) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.type !== 'string') return;

      switch (msg.type) {
        case 'create': {
          if (ws.roomInfo) return;
          const color = msg.color === 'b' ? 'b' : 'w';
          const code = makeCode(rooms);
          const room = { w: null, b: null };
          room[color] = ws;
          rooms.set(code, room);
          ws.roomInfo = { code, color };
          ws.emblem = cleanEmblem(msg.emblem);
          send(ws, { type: 'created', code, color });
          break;
        }
        case 'join': {
          if (ws.roomInfo) return;
          const code = String(msg.code || '').toUpperCase();
          const room = rooms.get(code);
          if (!room) {
            send(ws, { type: 'error', message: 'Sala não encontrada.' });
            return;
          }
          const color = !room.w ? 'w' : !room.b ? 'b' : null;
          if (!color) {
            send(ws, { type: 'error', message: 'Essa sala já está cheia.' });
            return;
          }
          room[color] = ws;
          ws.roomInfo = { code, color };
          ws.emblem = cleanEmblem(msg.emblem);
          const creator = opponentOf(room, color);
          send(ws, { type: 'joined', code, color, opponentEmblem: creator?.emblem ?? '' });
          send(creator, { type: 'opponent-joined', opponentEmblem: ws.emblem });
          break;
        }
        case 'move':
        case 'chat': {
          if (!ws.roomInfo) return;
          const room = rooms.get(ws.roomInfo.code);
          if (!room) return;
          const other = opponentOf(room, ws.roomInfo.color);
          if (!other) return;
          if (msg.type === 'move') send(other, { type: 'move', move: msg.move });
          else send(other, { type: 'chat', text: String(msg.text ?? '').slice(0, 200) });
          break;
        }
        case 'leave':
          leaveRoom(ws);
          break;
        default:
          break;
      }
    });

    ws.on('close', () => leaveRoom(ws));
    ws.on('error', () => leaveRoom(ws));
  });

  return { rooms };
}
