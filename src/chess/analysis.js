import {
  KING,
  cloneBoard,
  findKing,
  generatePseudoMoves,
  inBounds,
  isSquareAttacked,
  other,
} from './moveGen.js';

// Leituras do tabuleiro para os efeitos de imersão (medo, tensão, clima).
// Só consultam a posição — nunca alteram regras nem o estado da partida.

export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

// Para cada peça ameaçada: quem a ataca. Uma geração de lances por peça.
// Devolve Map "linha,coluna" -> { row, col, color, type, attackers: [...] }.
export function threatMap(board) {
  const threats = new Map();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      for (const move of generatePseudoMoves(board, r, c, null)) {
        const target = board[move.to.row][move.to.col];
        if (!target || target.color === piece.color) continue;
        const key = `${move.to.row},${move.to.col}`;
        if (!threats.has(key)) {
          threats.set(key, { row: move.to.row, col: move.to.col, color: target.color, type: target.type, attackers: [] });
        }
        threats.get(key).attackers.push({ row: r, col: c, type: piece.type, color: piece.color });
      }
    }
  }
  for (const entry of threats.values()) {
    entry.attackers.sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type]);
  }
  return threats;
}

// Casas para onde o rei pode fugir sem ficar em xeque.
export function kingEscapes(board, color) {
  const king = findKing(board, color);
  if (!king) return 0;
  const enemy = other(color);
  let count = 0;
  for (const move of generatePseudoMoves(board, king.row, king.col, null)) {
    const next = cloneBoard(board);
    next[move.to.row][move.to.col] = next[king.row][king.col];
    next[king.row][king.col] = null;
    if (!isSquareAttacked(next, move.to.row, move.to.col, enemy)) count++;
  }
  return count;
}

export function kingInCheck(board, color) {
  const king = findKing(board, color);
  return !!king && isSquareAttacked(board, king.row, king.col, other(color));
}

export function countPieces(board, color) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.color === color) n++;
  return n;
}

export function totalPieces(board) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]) n++;
  return n;
}

// Material perdido por cada lado (soma dos valores capturados).
export function materialLost(captured) {
  const sum = (list) => list.reduce((acc, type) => acc + (PIECE_VALUE[type] ?? 0), 0);
  return { w: sum(captured.w ?? []), b: sum(captured.b ?? []) };
}

// Aliados colados no rei (defensores imediatos).
function kingGuards(board, color, king) {
  let guards = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = king.row + dr;
      const c = king.col + dc;
      if (inBounds(r, c) && board[r][c]?.color === color && board[r][c].type !== KING) guards++;
    }
  }
  return guards;
}

// Perigo do rei de `color`, de 0 (tranquilo) a 1 (mate iminente).
// Pressão: quantas casas vizinhas do rei o inimigo controla. Separa um rei
// encurralado de verdade de um rei só "apertado" pelas próprias peças (o que
// acontece em toda abertura e não é perigo nenhum).
export function kingPressure(board, color, king = findKing(board, color)) {
  if (!king) return 0;
  const enemy = other(color);
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const r = king.row + dr;
      const c = king.col + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      if (isSquareAttacked(board, r, c, enemy)) count++;
    }
  }
  return count;
}

export function kingDanger(board, color) {
  const king = findKing(board, color);
  if (!king) return { level: 0, escapes: 0, pressure: 0, check: false, king: null };
  const check = isSquareAttacked(board, king.row, king.col, other(color));
  const escapes = kingEscapes(board, color);
  const pressure = kingPressure(board, color, king);
  let level = 0;
  if (check) level = escapes === 0 ? 1 : escapes === 1 ? 0.9 : escapes === 2 ? 0.6 : 0.4;
  else if (pressure > 0 && escapes === 0) level = Math.min(0.55, 0.2 + 0.12 * pressure);
  else if (pressure > 1 && escapes === 1) level = Math.min(0.4, 0.1 * pressure);
  return { level, escapes, pressure, check, king };
}

// "Última resistência": rei em xeque quase sem saída, ou rei isolado com
// pouquíssimas peças de defesa.
export function isLastStand(board, color) {
  const danger = kingDanger(board, color);
  if (!danger.king) return false;
  if (danger.check && danger.escapes <= 1) return true;
  return countPieces(board, color) <= 4 && kingGuards(board, color, danger.king) === 0 && danger.escapes <= 3;
}
