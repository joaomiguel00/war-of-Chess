import { WHITE } from '../chess/moveGen.js';

const QUICK = ['Boa jogada!', 'kkk', 'GG', 'Cuidado!', '😱', '🔥', '👏', '🤝'];
const MAX_LOG = 40;

// Chat local de mesa (hot-seat): reações rápidas, texto curto, balão temporário
// sobre o lado de quem falou e uma lista rolável. Sem servidor — os dois
// jogadores compartilham a mesma tela.
// getTurn() informa a cor de quem está jogando, usada para colorir/posicionar.
export function createChat({ root, getTurn, teamName }) {
  const wrap = document.createElement('div');
  wrap.className = 'chat panel';
  wrap.innerHTML = `
    <button class="chat-toggle" id="chat-toggle" title="Mostrar/ocultar chat">💬</button>
    <div class="chat-body" id="chat-body">
      <div class="chat-log" id="chat-log" aria-live="polite"></div>
      <div class="chat-reactions" id="chat-reactions"></div>
      <form class="chat-input" id="chat-form" autocomplete="off">
        <input id="chat-text" type="text" maxlength="80" placeholder="Mensagem rápida…" />
        <button type="submit" class="chat-send" title="Enviar">➤</button>
      </form>
    </div>
  `;
  root.appendChild(wrap);

  const bubbles = document.createElement('div');
  bubbles.className = 'chat-bubbles';
  root.appendChild(bubbles);

  const body = wrap.querySelector('#chat-body');
  const log = wrap.querySelector('#chat-log');
  const reactions = wrap.querySelector('#chat-reactions');
  const form = wrap.querySelector('#chat-form');
  const input = wrap.querySelector('#chat-text');

  for (const label of QUICK) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-react';
    button.textContent = label;
    button.onclick = () => send(label);
    reactions.appendChild(button);
  }

  function send(text) {
    const clean = String(text ?? '').trim().slice(0, 80);
    if (!clean) return;
    const color = getTurn?.() ?? WHITE;
    addToLog(color, clean);
    spawnBubble(color, clean);
    input.value = '';
    input.focus();
  }

  function addToLog(color, text) {
    const line = document.createElement('div');
    line.className = `chat-line team-${color}`;
    const who = document.createElement('span');
    who.className = 'chat-who';
    who.textContent = teamName?.(color) ?? (color === WHITE ? 'Ordem' : 'Ruína');
    const msg = document.createElement('span');
    msg.className = 'chat-msg';
    msg.textContent = text;
    line.append(who, msg);
    log.appendChild(line);
    while (log.children.length > MAX_LOG) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  // Balão temporário posicionado no lado do jogador que falou.
  function spawnBubble(color, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble team-${color} ${color === WHITE ? 'is-bottom' : 'is-top'}`;
    bubble.textContent = text;
    bubbles.appendChild(bubble);
    // Reinicia a animação de entrada.
    requestAnimationFrame(() => bubble.classList.add('is-in'));
    setTimeout(() => {
      bubble.classList.remove('is-in');
      bubble.classList.add('is-out');
      setTimeout(() => bubble.remove(), 500);
    }, 3600);
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    send(input.value);
  };

  wrap.querySelector('#chat-toggle').onclick = () => {
    const hidden = body.classList.toggle('is-hidden');
    wrap.classList.toggle('is-collapsed', hidden);
  };

  function dispose() {
    wrap.remove();
    bubbles.remove();
  }

  return { dispose, send };
}
