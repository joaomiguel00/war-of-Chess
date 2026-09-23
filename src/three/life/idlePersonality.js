import { PRIORITY } from './poseDirector.js';

// Animações de "personalidade" com a peça parada: depois de alguns segundos
// sem lance, cada tipo faz o seu gesto de vez em quando (com intervalos
// aleatórios por peça, para o exército não se mexer em sincronia).
// A torre, fortaleza imóvel, não faz nada.
const QUIET_BEFORE = 4.5; // segundos sem lance até os gestos começarem

const smooth = (t) => t * t * (3 - 2 * t);
const envelope = (t) => smooth(Math.min(1, t / 0.2)) * smooth(Math.min(1, (1 - t) / 0.2));

const GESTURES = {
  // Peão: acerta a postura e olha em volta.
  p: {
    duration: 2.6,
    pose(t) {
      const e = envelope(t);
      return {
        head: { yaw: Math.sin(t * Math.PI * 2) * 0.75 * e, pitch: -0.05 * e },
        body: { roll: Math.sin(Math.min(1, t * 3) * Math.PI) * 0.07, y: -0.012 * Math.sin(Math.min(1, t * 3) * Math.PI) },
      };
    },
  },
  // Cavalo: bate a pata/lança no chão, impaciente (três batidas).
  n: {
    duration: 1.7,
    pose(t) {
      const e = envelope(t);
      const tap = Math.abs(Math.sin(t * Math.PI * 3));
      return { body: { pitch: (-0.13 * tap + 0.03) * e, y: 0.025 * tap * e } };
    },
  },
  // Bispo: flutua um pouco mais alto, suave.
  b: {
    duration: 3.2,
    pose(t) {
      const e = Math.sin(Math.PI * t);
      return { body: { y: 0.07 * e * e, roll: Math.sin(t * Math.PI * 2) * 0.03 }, head: { pitch: -0.12 * e } };
    },
  },
  // Rainha: gira o cetro entre os dedos.
  q: {
    duration: 2,
    pose(t) {
      const e = envelope(t);
      return { twirl: smooth(t) * Math.PI * 2, head: { roll: 0.08 * e, pitch: 0.1 * e } };
    },
  },
  // Rei: olha para os lados com autoridade, queixo erguido.
  k: {
    duration: 3.4,
    pose(t) {
      const e = envelope(t);
      return { head: { yaw: Math.sin(t * Math.PI * 2) * 0.6 * e, pitch: -0.14 * e }, body: { pitch: -0.04 * e } };
    },
  },
};

export function createIdlePersonality({ director }) {
  const timers = new WeakMap();

  function timerOf(piece, now) {
    let timer = timers.get(piece);
    if (!timer) {
      timer = { next: now + 1 + Math.random() * 5, start: -1 };
      timers.set(piece, timer);
    }
    return timer;
  }

  // quietFor: segundos desde o último lance. busy(piece): agindo ou selecionada.
  function update(elapsed, pieces, { quietFor, busy }) {
    for (const piece of pieces) {
      const gesture = GESTURES[piece.userData.pieceType];
      if (!gesture) continue;
      const timer = timerOf(piece, elapsed);

      if (quietFor < QUIET_BEFORE || busy(piece)) {
        // Interrompido: recomeça a contagem do zero.
        timer.start = -1;
        timer.next = Math.max(timer.next, elapsed + 0.5 + Math.random() * 2);
        continue;
      }

      if (timer.start < 0 && elapsed >= timer.next) timer.start = elapsed;
      if (timer.start < 0) continue;

      const t = (elapsed - timer.start) / gesture.duration;
      if (t >= 1) {
        timer.start = -1;
        timer.next = elapsed + 2.5 + Math.random() * 6;
        continue;
      }
      director.request(piece, PRIORITY.idle, { ...gesture.pose(t), rate: 10 });
    }
  }

  return { update };
}
