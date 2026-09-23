import {
  WHITE,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  other,
  emptyBoard,
  findKing,
  isSquareAttacked,
} from './moveGen.js';

// Exército padrão que cada jogador precisa posicionar na montagem customizada.
export const ARMY = [
  { type: KING, count: 1, label: 'Rei' },
  { type: QUEEN, count: 1, label: 'Rainha' },
  { type: ROOK, count: 2, label: 'Torre' },
  { type: BISHOP, count: 2, label: 'Bispo' },
  { type: KNIGHT, count: 2, label: 'Cavalo' },
  { type: PAWN, count: 8, label: 'Peão' },
];

// Zona de montagem: 3 fileiras a partir do lado do jogador,
// na ordem [fundo, fileira padrão de peões, fileira avançada].
export function zoneRows(color) {
  return color === WHITE ? [0, 1, 2] : [7, 6, 5];
}

export function classicPawnRow(color) {
  return zoneRows(color)[1];
}

export function squareShade(row, col) {
  return (row + col) % 2 === 0 ? 'dark' : 'light';
}

export function createEmptySetupBoard() {
  return emptyBoard();
}

export function countPlaced(board, color, type) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === type) n++;
    }
  }
  return n;
}

// Os dois bispos precisam ocupar casas de cores diferentes.
export function bishopsAreValid(board, color) {
  const shades = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === BISHOP) shades.push(squareShade(r, c));
    }
  }
  if (shades.length < 2) return true;
  return new Set(shades).size === shades.length;
}

// Peões que não começam na fileira padrão perdem o avanço duplo inicial.
export function finalizePawnFlags(board, color) {
  const standardRow = classicPawnRow(color);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === PAWN) {
        p.canDoubleStep = r === standardRow;
      }
    }
  }
  return board;
}

// As zonas são disjuntas (linhas 0-2 vs 5-7), então não há colisão.
export function mergeBoards(whiteBoard, blackBoard) {
  const board = emptyBoard();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      board[r][c] = whiteBoard[r][c] || blackBoard[r][c] || null;
    }
  }
  return board;
}

export function kingIsInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  return isSquareAttacked(board, king.row, king.col, other(color));
}
