import { emptyBoard, WHITE, BLACK } from './chess/moveGen.js';
import { squareToWorld } from './three/boardScene.js';
import { createPieceMesh } from './three/pieceModels.js';

// Ferramenta de inspeção: monta uma posição onde `atacante` captura `vitima`
// e executa o lance, para conferir cada animação isoladamente.
const ATTACKER_SQUARE = {
  p: { row: 3, col: 2 }, // c4, captura na diagonal
  n: { row: 2, col: 2 }, // c3, salto de cavalo
  b: { row: 1, col: 0 }, // a2, diagonal livre
  r: { row: 0, col: 3 }, // d1, coluna livre
  q: { row: 0, col: 3 }, // d1
  k: { row: 3, col: 3 }, // d4, casa vizinha
};

const VICTIM_SQUARE = { row: 4, col: 3 }; // d5
const NAMES = { p: 'peão', n: 'cavalo', b: 'bispo', r: 'torre', q: 'rainha', k: 'rei' };

export function createCaptureTester(getContext) {
  return async function testarCaptura(attackerType = 'n', victimType = 'r') {
    const { game, gameView } = getContext();

    if (!NAMES[attackerType] || !NAMES[victimType]) {
      console.warn('Tipos válidos: p (peão), n (cavalo), b (bispo), r (torre), q (rainha), k (rei)');
      return;
    }
    if (gameView.busy) {
      console.warn('Aguarde a animação atual terminar.');
      return;
    }

    const attackerSquare = ATTACKER_SQUARE[attackerType];
    const board = emptyBoard();

    board[7][7] = { type: 'k', color: BLACK, hasMoved: true };
    if (attackerType !== 'k') board[0][0] = { type: 'k', color: WHITE, hasMoved: true };
    board[attackerSquare.row][attackerSquare.col] = {
      type: attackerType,
      color: WHITE,
      hasMoved: true,
      canDoubleStep: false,
    };

    const kingVictim = victimType === 'k';
    if (!kingVictim) {
      board[VICTIM_SQUARE.row][VICTIM_SQUARE.col] = {
        type: victimType,
        color: BLACK,
        hasMoved: true,
        canDoubleStep: false,
      };
    }

    game.board = board;
    game.turn = WHITE;
    game.enPassantTarget = null;
    game.halfmoveClock = 0;
    game.positionCounts.clear();
    game._refreshStatus();
    gameView._buildPieces();
    gameView._renderHighlights();

    console.log(
      `Ataque: ${NAMES[attackerType]} (Ordem) · Morte: ${NAMES[victimType]} (Ruína)`,
    );

    // O rei nunca é capturado numa partida real: aqui a cena é só visual.
    if (kingVictim) {
      const victim = createPieceMesh('k', BLACK);
      const victimPos = squareToWorld(VICTIM_SQUARE.row, VICTIM_SQUARE.col);
      victim.position.set(victimPos.x, 0, victimPos.z);
      gameView.pieceGroup.add(victim);

      const attacker = gameView.pieces.get(`${attackerSquare.row},${attackerSquare.col}`);
      gameView.busy = true;
      await gameView.combat.playCapture({
        attacker,
        attackerType,
        attackerColor: WHITE,
        from: squareToWorld(attackerSquare.row, attackerSquare.col),
        to: victimPos,
        victim,
        victimType: 'k',
        victimColor: BLACK,
        victimPos,
        victimSquare: VICTIM_SQUARE,
        onVictimGone: (dead) => gameView.pieceGroup.remove(dead),
      });
      gameView.busy = false;
      return;
    }

    const move = game
      .getLegalMoves(attackerSquare.row, attackerSquare.col)
      .find((m) => m.to.row === VICTIM_SQUARE.row && m.to.col === VICTIM_SQUARE.col);

    if (!move) {
      console.warn('Não foi possível montar a captura para essa combinação.');
      return;
    }

    await gameView._playMove(move);
  };
}
