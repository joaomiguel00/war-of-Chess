import {
  WHITE,
  BLACK,
  PAWN,
  KNIGHT,
  BISHOP,
  ROOK,
  QUEEN,
  KING,
  other,
  cloneBoard,
  emptyBoard,
  findKing,
  isSquareAttacked,
  generatePseudoMoves,
} from './moveGen.js';

export const STATUS = {
  PLAYING: 'playing',
  CHECK: 'check',
  CHECKMATE: 'checkmate',
  STALEMATE: 'stalemate',
  DRAW_REPETITION: 'draw-repetition',
  DRAW_50: 'draw-50move',
};

export function createStandardBoard() {
  const board = emptyBoard();
  const backRank = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRank[c], color: WHITE, hasMoved: false };
    board[1][c] = { type: PAWN, color: WHITE, hasMoved: false, canDoubleStep: true };
    board[6][c] = { type: PAWN, color: BLACK, hasMoved: false, canDoubleStep: true };
    board[7][c] = { type: backRank[c], color: BLACK, hasMoved: false };
  }
  return board;
}

export class ChessGame {
  constructor(board) {
    this.board = board;
    this.turn = WHITE;
    this.enPassantTarget = null;
    this.halfmoveClock = 0;
    this.fullmoveNumber = 1;
    this.history = [];
    this.captured = { [WHITE]: [], [BLACK]: [] };
    this.positionCounts = new Map();
    this.status = STATUS.PLAYING;
    this.winner = null;

    this._recordPosition();
    this._refreshStatus();
  }

  isGameOver() {
    return (
      this.status === STATUS.CHECKMATE ||
      this.status === STATUS.STALEMATE ||
      this.status === STATUS.DRAW_REPETITION ||
      this.status === STATUS.DRAW_50
    );
  }

  isInCheck(color) {
    const king = findKing(this.board, color);
    if (!king) return false;
    return isSquareAttacked(this.board, king.row, king.col, other(color));
  }

  // Roque generalizado: rei e torre na mesma fileira, nenhum dos dois pode
  // ter se movido. O rei anda 2 casas na direção da torre e a torre pousa
  // imediatamente do outro lado do rei. Funciona tanto na posição clássica
  // quanto em montagens customizadas.
  generateCastlingMoves(color) {
    const moves = [];
    const kingPos = findKing(this.board, color);
    if (!kingPos) return moves;

    const king = this.board[kingPos.row][kingPos.col];
    if (king.hasMoved) return moves;
    if (this.isInCheck(color)) return moves;

    const row = kingPos.row;
    for (let c = 0; c < 8; c++) {
      const piece = this.board[row][c];
      if (!piece || piece.type !== ROOK || piece.color !== color || piece.hasMoved) continue;

      const dir = c > kingPos.col ? 1 : -1;
      const newKingCol = kingPos.col + dir * 2;
      const newRookCol = newKingCol - dir;
      if (newKingCol < 0 || newKingCol > 7 || newRookCol < 0 || newRookCol > 7) continue;

      // Todas as casas percorridas por rei e torre precisam estar vazias
      // (ignorando as casas ocupadas pelo próprio rei e pela própria torre).
      const mustBeEmpty = new Set();
      for (let x = Math.min(kingPos.col, newKingCol); x <= Math.max(kingPos.col, newKingCol); x++) {
        mustBeEmpty.add(x);
      }
      for (let x = Math.min(c, newRookCol); x <= Math.max(c, newRookCol); x++) {
        mustBeEmpty.add(x);
      }
      mustBeEmpty.delete(kingPos.col);
      mustBeEmpty.delete(c);

      let pathClear = true;
      for (const x of mustBeEmpty) {
        if (this.board[row][x]) {
          pathClear = false;
          break;
        }
      }
      if (!pathClear) continue;

      // O rei não pode passar nem parar em casa atacada.
      let safe = true;
      const step = newKingCol > kingPos.col ? 1 : -1;
      for (let x = kingPos.col; x !== newKingCol + step; x += step) {
        if (isSquareAttacked(this.board, row, x, other(color))) {
          safe = false;
          break;
        }
      }
      if (!safe) continue;

      moves.push({
        from: { row, col: kingPos.col },
        to: { row, col: newKingCol },
        castle: {
          rookFrom: { row, col: c },
          rookTo: { row, col: newRookCol },
          side: dir > 0 ? 'king' : 'queen',
        },
      });
    }

    return moves;
  }

  getPseudoMoves(row, col) {
    const piece = this.board[row][col];
    if (!piece) return [];
    const moves = generatePseudoMoves(this.board, row, col, this.enPassantTarget);
    if (piece.type === KING) {
      const castles = this.generateCastlingMoves(piece.color).filter(
        (m) => m.from.row === row && m.from.col === col,
      );
      return moves.concat(castles);
    }
    return moves;
  }

  getLegalMoves(row, col) {
    const piece = this.board[row][col];
    if (!piece || piece.color !== this.turn || this.isGameOver()) return [];

    return this.getPseudoMoves(row, col).filter((move) => {
      const testBoard = this._simulateMove(move);
      const king = findKing(testBoard, piece.color);
      if (!king) return false;
      return !isSquareAttacked(testBoard, king.row, king.col, other(piece.color));
    });
  }

  getAllLegalMoves(color) {
    const all = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p || p.color !== color) continue;
        const pseudo = this.getPseudoMoves(r, c);
        for (const move of pseudo) {
          const testBoard = this._simulateMove(move);
          const king = findKing(testBoard, color);
          if (king && !isSquareAttacked(testBoard, king.row, king.col, other(color))) {
            all.push(move);
          }
        }
      }
    }
    return all;
  }

  _simulateMove(move) {
    const board = cloneBoard(this.board);
    const piece = board[move.from.row][move.from.col];
    board[move.from.row][move.from.col] = null;

    if (move.enPassant) {
      // O peão capturado fica na fileira de origem, na coluna de destino.
      board[move.from.row][move.to.col] = null;
    }

    const placed = { ...piece, hasMoved: true };
    if (move.promotion) placed.type = move.promotionType || QUEEN;
    board[move.to.row][move.to.col] = placed;

    if (move.castle) {
      const rook = board[move.castle.rookFrom.row][move.castle.rookFrom.col];
      board[move.castle.rookFrom.row][move.castle.rookFrom.col] = null;
      board[move.castle.rookTo.row][move.castle.rookTo.col] = { ...rook, hasMoved: true };
    }

    return board;
  }

  makeMove(move, promotionType) {
    const piece = this.board[move.from.row][move.from.col];
    if (!piece) throw new Error('Nenhuma peça na casa de origem.');

    const captureTarget = move.enPassant
      ? this.board[move.from.row][move.to.col]
      : this.board[move.to.row][move.to.col];
    const isCapture = !!captureTarget;

    if (captureTarget) {
      this.captured[captureTarget.color].push(captureTarget.type);
    }

    if (move.enPassant) this.board[move.from.row][move.to.col] = null;

    this.board[move.from.row][move.from.col] = null;
    const moved = { ...piece, hasMoved: true };
    if (move.promotion) moved.type = promotionType || QUEEN;
    this.board[move.to.row][move.to.col] = moved;

    if (move.castle) {
      const rook = this.board[move.castle.rookFrom.row][move.castle.rookFrom.col];
      this.board[move.castle.rookFrom.row][move.castle.rookFrom.col] = null;
      this.board[move.castle.rookTo.row][move.castle.rookTo.col] = { ...rook, hasMoved: true };
    }

    this.enPassantTarget = move.doubleStep
      ? { row: (move.from.row + move.to.row) / 2, col: move.from.col }
      : null;

    if (piece.type === PAWN || isCapture) this.halfmoveClock = 0;
    else this.halfmoveClock++;

    if (this.turn === BLACK) this.fullmoveNumber++;
    this.turn = other(this.turn);

    this.history.push({
      ...move,
      pieceType: piece.type,
      color: piece.color,
      promotionType: move.promotion ? promotionType || QUEEN : undefined,
      captured: captureTarget ? captureTarget.type : undefined,
    });

    this._recordPosition();
    this._refreshStatus();

    return this.status;
  }

  // Chave de posição para a repetição tripla: inclui peças, direitos de
  // movimento (hasMoved), lado a jogar e alvo de en passant.
  positionKey() {
    let key = this.turn;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        key += p ? `${p.color}${p.type}${p.hasMoved ? '1' : '0'}` : '.';
      }
    }
    key += this.enPassantTarget
      ? `|${this.enPassantTarget.row},${this.enPassantTarget.col}`
      : '|-';
    return key;
  }

  _recordPosition() {
    const key = this.positionKey();
    this.positionCounts.set(key, (this.positionCounts.get(key) || 0) + 1);
  }

  _refreshStatus() {
    const color = this.turn;
    const inCheck = this.isInCheck(color);

    if (this.getAllLegalMoves(color).length === 0) {
      this.status = inCheck ? STATUS.CHECKMATE : STATUS.STALEMATE;
      this.winner = inCheck ? other(color) : null;
      return;
    }

    // 50 lances = 100 meios-lances sem captura nem movimento de peão.
    if (this.halfmoveClock >= 100) {
      this.status = STATUS.DRAW_50;
      this.winner = null;
      return;
    }

    if ((this.positionCounts.get(this.positionKey()) || 0) >= 3) {
      this.status = STATUS.DRAW_REPETITION;
      this.winner = null;
      return;
    }

    this.status = inCheck ? STATUS.CHECK : STATUS.PLAYING;
    this.winner = null;
  }
}
