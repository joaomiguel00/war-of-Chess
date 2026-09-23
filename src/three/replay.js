import * as THREE from 'three';
import { createCombat } from './combat.js';
import { createPieceMesh } from './pieceModels.js';
import { squareToWorld } from './boardScene.js';
import { animate, easeInOut, wait, disposeObject } from './animation.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'Peão', n: 'Cavalo', b: 'Bispo', r: 'Torre', q: 'Rainha', k: 'Rei' };
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const square = (row, col) => `${FILES[col]}${row + 1}`;

// Pontua o quanto um lance merece virar destaque no fim da partida.
export function scoreMoment({ move, movingType, victimType, status, promotionType }) {
  let score = 0;
  const parts = [];

  if (victimType) {
    score += VALUE[victimType] * 2;
    parts.push(`${NAME[movingType]} captura ${NAME[victimType]} em ${square(move.to.row, move.to.col)}`);
  }
  if (move.enPassant) {
    score += 5;
    parts.push('golpe furtivo: en passant');
  }
  if (move.castle) {
    score += 3;
    parts.push('roque: os portões se abrem');
  }
  if (move.promotion) {
    score += 8;
    parts.push(`peão coroado ${NAME[promotionType] ?? 'Rainha'}`);
  }
  if (status === 'check') {
    score += 3;
    parts.push('com xeque');
  }
  if (status === 'checkmate') {
    score += 100;
    parts.push('XEQUE-MATE');
  }

  if (!parts.length) return null;

  const caption = parts.join(' · ').replace(/^./, (c) => c.toUpperCase());
  return { score, caption };
}

// Escolhe os melhores momentos mantendo a ordem cronológica e garantindo
// que o lance final entre sempre por último.
export function pickHighlights(moments, limit = 3) {
  if (!moments.length) return [];
  const last = moments[moments.length - 1];
  const rest = moments.slice(0, -1);
  const best = [...rest].sort((a, b) => b.score - a.score).slice(0, limit - 1);
  best.sort((a, b) => a.index - b.index);
  return [...best, last];
}

export function createReplay({ scene, camera, controls, cinematic, audio }) {
  const group = new THREE.Group();
  scene.add(group);

  // Combate próprio, sem decals: o replay não deve sujar o tabuleiro.
  const combat = createCombat({ scene, decals: { addCaptureMarks() {} }, audio });
  let skipped = false;

  function buildBoard(board) {
    const pieces = new Map();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        const mesh = createPieceMesh(piece.type, piece.color);
        const position = squareToWorld(r, c);
        mesh.position.set(position.x, 0, position.z);
        group.add(mesh);
        pieces.set(`${r},${c}`, mesh);
      }
    }
    return pieces;
  }

  function clearBoard() {
    while (group.children.length) disposeObject(group.children[0]);
  }

  async function playMoment(moment, onCaption) {
    if (skipped) return;

    const pieces = buildBoard(moment.board);
    const from = squareToWorld(moment.move.from.row, moment.move.from.col);
    const to = squareToWorld(moment.move.to.row, moment.move.to.col);

    const shot = cinematic.shotFor(from, to);
    shot.position.y += 1.1;
    shot.position.addScaledVector(
      new THREE.Vector3().subVectors(shot.position, shot.target).normalize(),
      1.2,
    );
    await cinematic.flyTo(shot.position, shot.target, 620);
    if (skipped) return clearBoard();

    onCaption?.(moment.caption);

    const attacker = pieces.get(`${moment.move.from.row},${moment.move.from.col}`);
    const victimKey = moment.victimSquare
      ? `${moment.victimSquare.row},${moment.victimSquare.col}`
      : null;
    const victim = victimKey ? pieces.get(victimKey) : null;

    if (attacker && victim) {
      await combat.playCapture({
        attacker,
        attackerType: moment.movingType,
        attackerColor: moment.movingColor,
        from,
        to,
        victim,
        victimType: moment.victimType,
        victimColor: moment.victimColor,
        victimPos: squareToWorld(moment.victimSquare.row, moment.victimSquare.col),
        victimSquare: moment.victimSquare,
        onVictimGone: (dead) => group.remove(dead),
      });
    } else if (attacker) {
      audio?.playStep(moment.movingType);
      await animate(420, (t) => {
        const e = easeInOut(t);
        attacker.position.x = from.x + (to.x - from.x) * e;
        attacker.position.z = from.z + (to.z - from.z) * e;
        attacker.position.y = Math.sin(Math.PI * t) * 0.3;
      });
    }

    if (!skipped) await wait(650);
    clearBoard();
  }

  // Devolve uma promessa que termina quando os destaques acabam ou o
  // jogador pula a sequência.
  async function play(moments, { onCaption, onFinish } = {}) {
    if (!moments.length) {
      onFinish?.();
      return;
    }

    skipped = false;
    const skip = () => {
      skipped = true;
    };
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);

    const savedPosition = camera.position.clone();
    const savedTarget = controls.target.clone();
    const savedEnabled = controls.enabled;
    controls.enabled = false;

    try {
      for (const moment of moments) {
        if (skipped) break;
        await playMoment(moment, onCaption);
      }
    } finally {
      clearBoard();
      onCaption?.(null);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
      await cinematic.flyTo(savedPosition, savedTarget, 560);
      controls.enabled = savedEnabled;
      controls.update();
      onFinish?.();
    }
  }

  function dispose() {
    clearBoard();
    combat.dispose();
    group.parent?.remove(group);
  }

  return { play, dispose };
}
