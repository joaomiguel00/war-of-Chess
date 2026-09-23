// Cliente da sala online: WebSocket com o servidor (mesma origem, então
// funciona igual em localhost e em produção). API por eventos — quem chama
// não sabe nada sobre o protocolo além dos nomes dos eventos.
export function createRoomClient() {
  let ws = null;
  const handlers = {};

  function on(type, callback) {
    handlers[type] = callback;
  }

  function emit(type, payload) {
    handlers[type]?.(payload);
  }

  function connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      let settled = false;

      ws.onopen = () => {
        settled = true;
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Não consegui conectar ao servidor.'));
        }
      };
      ws.onclose = () => emit('closed');
      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg?.type) emit(msg.type, msg);
      };
    });
  }

  function send(payload) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }

  return {
    connect,
    on,
    createRoom: (color, emblem) => send({ type: 'create', color, emblem }),
    joinRoom: (code, emblem) => send({ type: 'join', code, emblem }),
    sendMove: (move) => send({ type: 'move', move }),
    sendChat: (text) => send({ type: 'chat', text }),
    dispose: () => {
      try {
        ws?.close();
      } catch {
        // já fechado — sem problema.
      }
      ws = null;
    },
  };
}
