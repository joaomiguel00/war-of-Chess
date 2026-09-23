import * as THREE from 'three';
import { PRIORITY } from './poseDirector.js';
import { squareToWorld } from '../boardScene.js';
import { threatMap, countPieces } from '../../chess/analysis.js';
import { isSquareAttacked, other, WHITE, BLACK } from '../../chess/moveGen.js';

// Medo e luto das peças:
//  - ameaçadas olham para o atacante mais valioso e tremem;
//  - hesitam quando a casa sob o cursor está sob ataque;
//  - quem dá xeque encara o rei; o rei em xeque treme e olha o agressor;
//  - aliados vizinhos abaixam a cabeça quando alguém morre (todos, se foi a rainha);
//  - os últimos sobreviventes (3 ou menos) olham em volta, nervosos.
const GRIEF_SECONDS = 1.15;

const key = (row, col) => `${row},${col}`;

export function createFear({ director, getPieces }) {
  let threats = [];
  let checkStare = [];
  let kingInDanger = null;
  let nervous = new Set();
  let hesitation = null;
  const grief = new Map(); // peça -> instante em que o luto acaba
  const target = new THREE.Vector3();

  // Recalcula as ameaças a cada mudança de tabuleiro (não por quadro).
  function onBoardChanged(game) {
    const pieces = getPieces();
    const board = game.board;
    threats = [];
    checkStare = [];
    kingInDanger = null;

    for (const entry of threatMap(board).values()) {
      const victim = pieces.get(key(entry.row, entry.col));
      if (!victim) continue;
      const attacker = entry.attackers[0];
      const at = squareToWorld(attacker.row, attacker.col);
      if (entry.type === 'k') {
        // Xeque: o rei olha o agressor e todos os agressores encaram o rei.
        kingInDanger = { piece: victim, at };
        const kingAt = squareToWorld(entry.row, entry.col);
        for (const a of entry.attackers) {
          const mesh = pieces.get(key(a.row, a.col));
          if (mesh) checkStare.push({ piece: mesh, at: kingAt });
        }
      } else {
        threats.push({ piece: victim, at });
      }
    }

    nervous = new Set();
    for (const color of [WHITE, BLACK]) {
      if (countPieces(board, color) > 3) continue;
      for (const [k, mesh] of pieces) {
        const [r, c] = k.split(',').map(Number);
        if (board[r][c]?.color === color) nervous.add(mesh);
      }
    }
    hesitation = null;
  }

  // Captura: vizinhos da mesma cor abaixam a cabeça; a rainha, o exército todo.
  function onCapture({ square, victimType, victimColor, board, elapsed }) {
    const pieces = getPieces();
    for (const [k, mesh] of pieces) {
      const [r, c] = k.split(',').map(Number);
      if (board[r][c]?.color !== victimColor) continue;
      const near = Math.abs(r - square.row) <= 1 && Math.abs(c - square.col) <= 1;
      if (victimType === 'q' || near) grief.set(mesh, elapsed + GRIEF_SECONDS * (0.9 + Math.random() * 0.25));
    }
  }

  // Cursor sobre uma casa de destino que o inimigo ataca: a peça hesita.
  function onHover({ square, selected, legalMoves, game }) {
    hesitation = null;
    if (!square || !selected) return;
    const legal = legalMoves.some((m) => m.to.row === square.row && m.to.col === square.col);
    if (!legal) return;
    const mover = game.board[selected.row][selected.col];
    if (!mover) return;
    if (!isSquareAttacked(game.board, square.row, square.col, other(mover.color))) return;
    hesitation = { piece: getPieces().get(key(selected.row, selected.col)), at: squareToWorld(square.row, square.col) };
  }

  function look(piece, at, pitch = 0) {
    return { yaw: director.lookYaw(piece, target.copy(at)), pitch };
  }

  function update(elapsed) {
    for (const { piece, at } of threats) {
      director.request(piece, PRIORITY.threat, { head: look(piece, at, 0.08), tremble: 0.45, rate: 4 });
    }
    if (hesitation?.piece) {
      director.request(hesitation.piece, PRIORITY.threat + 5, {
        head: look(hesitation.piece, hesitation.at, 0.1),
        body: { z: -0.06, pitch: -0.08 },
        tremble: 0.9,
        rate: 9,
      });
    }
    if (kingInDanger) {
      director.request(kingInDanger.piece, PRIORITY.check, {
        head: look(kingInDanger.piece, kingInDanger.at, -0.05),
        tremble: 1,
        rate: 5,
      });
    }
    for (const { piece, at } of checkStare) {
      const yaw = director.lookYaw(piece, target.copy(at));
      director.request(piece, PRIORITY.check, {
        head: { yaw, pitch: 0.12 },
        body: { yaw: Math.max(-0.35, Math.min(0.35, yaw * 0.3)), pitch: 0.04 },
        rate: 2.2,
      });
    }
    for (const [piece, until] of grief) {
      if (elapsed > until) {
        grief.delete(piece);
        continue;
      }
      director.request(piece, PRIORITY.grief, { head: { pitch: 0.55, yaw: 0 }, body: { pitch: 0.12, y: -0.015 }, rate: 4 });
    }
    for (const piece of nervous) {
      const phase = piece.userData.idlePhase ?? 0;
      const glance = Math.sin(elapsed * 1.25 + phase) * (0.55 + 0.45 * Math.sin(elapsed * 0.41 + phase * 2));
      director.request(piece, PRIORITY.nervous, { head: { yaw: glance * 0.95, pitch: -0.04 }, tremble: 0.2, rate: 5 });
    }
  }

  function reset() {
    threats = [];
    checkStare = [];
    kingInDanger = null;
    nervous = new Set();
    hesitation = null;
    grief.clear();
  }

  return { onBoardChanged, onCapture, onHover, update, reset, get hesitating() { return hesitation; } };
}
