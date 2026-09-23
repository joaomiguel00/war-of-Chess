// Geração de movimentos e consultas de ataque.
// Convenção de tabuleiro: board[row][col], row 0 = 1ª fileira (lado das Brancas),
// row 7 = 8ª fileira (lado das Pretas), col 0 = coluna "a".
// Brancas avançam no sentido +row, Pretas no sentido -row.

export const WHITE = 'w';
export const BLACK = 'b';

export const PAWN = 'p';
export const KNIGHT = 'n';
export const BISHOP = 'b';
export const ROOK = 'r';
export const QUEEN = 'q';
export const KING = 'k';

export function other(color) {
  return color === WHITE ? BLACK : WHITE;
}

const DIRS_ROOK = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIRS_BISHOP = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const DIRS_QUEEN = [...DIRS_ROOK, ...DIRS_BISHOP];
const KNIGHT_OFFSETS = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

export function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

export function cloneBoard(board) {
  return board.map((row) => row.map((p) => (p ? { ...p } : null)));
}

export function findKing(board, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === KING) return { row: r, col: c };
    }
  }
  return null;
}

// Função independente da geração de lances (evita recursão com o roque,
// que precisa saber se casas estão atacadas).
export function isSquareAttacked(board, row, col, byColor) {
  // Peões: um peão branco em (r,c) ataca (r+1,c±1).
  const pawnRow = byColor === WHITE ? row - 1 : row + 1;
  for (const dc of [-1, 1]) {
    const c = col + dc;
    if (inBounds(pawnRow, c)) {
      const p = board[pawnRow][c];
      if (p && p.color === byColor && p.type === PAWN) return true;
    }
  }

  for (const [dr, dc] of KNIGHT_OFFSETS) {
    const r = row + dr;
    const c = col + dc;
    if (!inBounds(r, c)) continue;
    const p = board[r][c];
    if (p && p.color === byColor && p.type === KNIGHT) return true;
  }

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const p = board[r][c];
      if (p && p.color === byColor && p.type === KING) return true;
    }
  }

  for (const [dr, dc] of DIRS_BISHOP) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === BISHOP || p.type === QUEEN)) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  for (const [dr, dc] of DIRS_ROOK) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (p.color === byColor && (p.type === ROOK || p.type === QUEEN)) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }

  return false;
}

// Lances pseudo-legais (sem filtrar cravadas/xeque). O roque é gerado
// em ChessGame, pois depende de casas atacadas.
export function generatePseudoMoves(board, row, col, enPassantTarget) {
  const piece = board[row][col];
  if (!piece) return [];

  const moves = [];
  const color = piece.color;
  const add = (r, c, extra = {}) => {
    moves.push({ from: { row, col }, to: { row: r, col: c }, ...extra });
  };

  if (piece.type === PAWN) {
    const dir = color === WHITE ? 1 : -1;
    const oneRow = row + dir;

    if (inBounds(oneRow, col) && !board[oneRow][col]) {
      add(oneRow, col, { promotion: oneRow === 0 || oneRow === 7 });

      // Avanço duplo só para peões que começaram na fileira padrão.
      if (!piece.hasMoved && piece.canDoubleStep) {
        const twoRow = row + 2 * dir;
        if (inBounds(twoRow, col) && !board[twoRow][col]) {
          add(twoRow, col, { doubleStep: true });
        }
      }
    }

    for (const dc of [-1, 1]) {
      const r = oneRow;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = board[r][c];
      if (target && target.color !== color) {
        add(r, c, { capture: true, promotion: r === 0 || r === 7 });
      } else if (
        !target &&
        enPassantTarget &&
        enPassantTarget.row === r &&
        enPassantTarget.col === c
      ) {
        add(r, c, { capture: true, enPassant: true });
      }
    }
  } else if (piece.type === KNIGHT) {
    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = row + dr;
      const c = col + dc;
      if (!inBounds(r, c)) continue;
      const target = board[r][c];
      if (!target) add(r, c);
      else if (target.color !== color) add(r, c, { capture: true });
    }
  } else if (piece.type === KING) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (!inBounds(r, c)) continue;
        const target = board[r][c];
        if (!target) add(r, c);
        else if (target.color !== color) add(r, c, { capture: true });
      }
    }
  } else {
    const dirs =
      piece.type === BISHOP ? DIRS_BISHOP : piece.type === ROOK ? DIRS_ROOK : DIRS_QUEEN;
    for (const [dr, dc] of dirs) {
      let r = row + dr;
      let c = col + dc;
      while (inBounds(r, c)) {
        const target = board[r][c];
        if (!target) {
          add(r, c);
        } else {
          if (target.color !== color) add(r, c, { capture: true });
          break;
        }
        r += dr;
        c += dc;
      }
    }
  }

  return moves;
}
