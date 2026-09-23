import { WHITE, BLACK } from './chess/moveGen.js';

// Relógio de xadrez de dois jogadores. É só estado + contagem; a interface
// e o laço de tempo (chamar tick a cada quadro) ficam por conta de quem usa.
// minutes: 0 ou null desativa o relógio (partida sem limite).
export function createClock(minutes) {
  const enabled = !!minutes && minutes > 0;
  const total = enabled ? minutes * 60 : 0;
  const remaining = { [WHITE]: total, [BLACK]: total };

  let active = null; // cor cujo relógio está correndo
  let running = false;
  let last = 0;
  let flagged = null; // cor que estourou o tempo (perdeu)

  function start(color) {
    if (!enabled) return;
    active = color;
    last = performance.now();
    running = true;
  }

  // Cobra o tempo gasto pelo jogador anterior e passa o relógio ao próximo.
  function switchTo(color) {
    if (!enabled) return;
    tick();
    active = color;
    last = performance.now();
    running = flagged == null;
  }

  function stop() {
    running = false;
  }

  function tick() {
    if (!enabled || !running || active == null || flagged) return;
    const now = performance.now();
    remaining[active] = Math.max(0, remaining[active] - (now - last) / 1000);
    last = now;
    if (remaining[active] <= 0) {
      remaining[active] = 0;
      running = false;
      flagged = active;
    }
  }

  return {
    enabled,
    total,
    start,
    switchTo,
    stop,
    tick,
    get active() {
      return active;
    },
    get running() {
      return running;
    },
    get flagged() {
      return flagged;
    },
    getRemaining: (color) => remaining[color],
  };
}

// Formata segundos em m:ss (ou h:mm:ss se passar de uma hora).
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

export { WHITE, BLACK };
