import { STATUS } from '../chess/game.js';
import { kingDanger } from '../chess/analysis.js';
import { audio } from '../audio/index.js';
import { settings } from '../settings.js';

// Tensão da partida, ligada só aos eventos do jogo:
//  - batimento cardíaco + vinheta vermelha pulsando quando o rei do jogador
//    local está em xeque (mais rápido quanto menos casas de fuga);
//  - zumbido (mundo abafado + apito) depois dos ataques da rainha e do rei;
//  - exército marchando ao fundo enquanto o adversário pensa.
// Batimento, vinheta e zumbido respeitam a opção "efeitos intensos".
export function createTension({ root, events, onlineColor = null }) {
  const vignette = document.createElement('div');
  vignette.className = 'danger-vignette';
  root.appendChild(vignette);
  let ended = false;

  const offBeat = audio.heartbeat.onBeat((bpm) => {
    vignette.style.setProperty('--beat', `${Math.round(60000 / bpm)}ms`);
    vignette.classList.remove('is-beat');
    void vignette.offsetWidth;
    vignette.classList.add('is-beat');
  });

  const isLocal = (color) => !onlineColor || onlineColor === color;

  function updateHeart(game) {
    const threatened = !ended && game.status === STATUS.CHECK && isLocal(game.turn) && settings.intenseFx;
    if (threatened) {
      audio.heartbeat.start(kingDanger(game.board, game.turn).escapes);
      vignette.classList.add('is-on');
    } else {
      audio.heartbeat.stop();
      vignette.classList.remove('is-on');
    }
  }

  function updateMarch(game) {
    if (ended || game.isGameOver()) return audio.march.stop();
    // Online: só no turno do adversário. No mesmo dispositivo, a cada vez que
    // alguém pensa, o outro ouve o exército inimigo se aproximando.
    if (onlineColor && game.turn === onlineColor) audio.march.stop();
    else audio.march.start();
  }

  const offs = [
    events.on('moveStart', ({ replaying }) => {
      if (!replaying) audio.march.stop();
    }),
    events.on('moveEnd', ({ game, replaying }) => {
      if (replaying) return;
      updateHeart(game);
      updateMarch(game);
    }),
    events.on('attackEnd', ({ attackerType, replaying }) => {
      if (replaying || !settings.intenseFx) return;
      if (attackerType === 'q' || attackerType === 'k') audio.muffle(1.7);
    }),
    events.on('gameOver', () => {
      ended = true;
      audio.heartbeat.stop();
      audio.march.stop();
      vignette.classList.remove('is-on');
    }),
    events.on('reset', () => {
      audio.heartbeat.stop();
      audio.march.stop();
      vignette.classList.remove('is-on');
    }),
  ];

  // Começa a contar a partir do primeiro turno (depois da abertura).
  function begin(game) {
    updateHeart(game);
    updateMarch(game);
  }

  function dispose() {
    offs.forEach((off) => off());
    offBeat();
    audio.heartbeat.stop();
    audio.march.stop();
    vignette.remove();
  }

  return { begin, dispose };
}
