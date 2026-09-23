import { STATUS } from '../chess/game.js';
import { kingDanger } from '../chess/analysis.js';
import { audio } from '../audio/index.js';

// Arauto de batalha: anúncios dramáticos em momentos-chave, como legenda de
// guerra no alto da tela (sem cobrir o tabuleiro), cada um com um sopro e
// uma nota curta sincronizados com o texto. Escuta só os eventos do jogo.
const ARMY = { w: 'Ordem', b: 'Ruína' };

const CAPTURE_LINES = {
  p: { tier: 'minor', sound: 'capture', lines: ['Um peão da {army} caiu em combate.', 'Um soldado da {army} tombou.', 'A {army} perde um soldado.'] },
  n: { tier: 'mid', sound: 'capture', lines: ['O cavalo da {army} caiu em combate!', 'Um cavaleiro da {army} foi abatido!'] },
  b: { tier: 'mid', sound: 'capture', lines: ['O bispo da {army} caiu em combate!', 'A {army} perde um guardião da fé!'] },
  r: { tier: 'mid', sound: 'major', lines: ['Uma torre da {army} desmoronou!', 'Uma fortaleza da {army} caiu por terra!'] },
  q: { tier: 'major', sound: 'major', lines: ['A rainha da {army} caiu em combate!', 'A rainha da {army} tombou — o reino chora!'] },
  k: { tier: 'major', sound: 'major', lines: ['O rei da {army} caiu!'] },
};

const DURATION = { minor: 2000, mid: 2300, major: 2900, danger: 2600, mate: 3200 };

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createHerald({ root, events }) {
  const stage = document.createElement('div');
  stage.className = 'herald-stage';
  stage.setAttribute('aria-live', 'polite');
  root.appendChild(stage);

  const queue = [];
  let showing = false;
  let timer = null;

  function next() {
    const item = queue.shift();
    if (!item) {
      showing = false;
      return;
    }
    showing = true;
    const el = document.createElement('div');
    el.className = `herald herald-${item.tier}`;
    el.innerHTML = '<span class="herald-rule"></span><span class="herald-text"></span><span class="herald-rule"></span>';
    el.querySelector('.herald-text').textContent = item.text;
    stage.appendChild(el);
    audio.playHerald(item.sound);
    const duration = DURATION[item.tier] ?? 2200;
    timer = setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 420);
      next();
    }, duration);
  }

  function announce(text, tier = 'mid', sound = 'capture') {
    // Nada de fila enorme: anúncios velhos perdem a vez.
    if (queue.length > 2) queue.shift();
    queue.push({ text, tier, sound });
    if (!showing) next();
  }

  const offs = [
    events.on('capture', ({ victimType, victimColor, replaying }) => {
      if (replaying) return;
      const entry = CAPTURE_LINES[victimType] ?? CAPTURE_LINES.p;
      const text = pick(entry.lines).replace('{army}', ARMY[victimColor] ?? '');
      announce(entry.tier === 'major' ? text.toUpperCase() : text, entry.tier, entry.sound);
    }),
    events.on('moveEnd', ({ game, replaying }) => {
      if (replaying) return;
      if (game.status === STATUS.CHECKMATE) {
        announce('XEQUE-MATE!', 'mate', 'mate');
        return;
      }
      const danger = kingDanger(game.board, game.turn);
      if (game.status === STATUS.CHECK) {
        announce('Xeque!', 'mid', 'check');
        if (danger.escapes <= 1) announce(`O rei da ${ARMY[game.turn]} está cercado!`, 'danger', 'danger');
      } else if (danger.escapes === 0 && danger.pressure >= 2) {
        announce(`O rei da ${ARMY[game.turn]} não tem para onde fugir!`, 'danger', 'danger');
      }
    }),
  ];

  function dispose() {
    offs.forEach((off) => off());
    clearTimeout(timer);
    stage.remove();
  }

  return { announce, dispose };
}
