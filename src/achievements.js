import { WHITE, BLACK, other } from './chess/moveGen.js';

// Conta quantas peças de uma cor ainda estão no tabuleiro.
function countPieces(board, color) {
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color) n++;
    }
  }
  return n;
}

// Calcula de 1 a 3 "títulos" leves com base em como a partida se desenrolou.
// game: a ChessGame terminada. result: { winner, reason }.
export function computeTitles(game, result = {}) {
  const winner = result.winner ?? game.winner ?? null;
  const history = game.history ?? [];

  const capturesBy = (color) => history.filter((m) => m.color === color && m.captured).length;
  const earlyCapturesBy = (color) =>
    history.slice(0, 12).filter((m) => m.color === color && m.captured).length;
  // game.captured[color] lista as peças DAQUELA cor que foram capturadas.
  const lostQueen = (color) => (game.captured?.[color] ?? []).includes('q');

  const titles = [];
  const add = (id, name, icon, desc) => titles.push({ id, name, icon, desc });

  if (winner) {
    const loser = other(winner);
    const myCaps = capturesBy(winner);
    const foeCaps = capturesBy(loser);
    const remaining = countPieces(game.board, winner);

    if (result.reason === 'timeout') {
      add('relogio', 'No Fio do Tempo', '⏳', 'Venceu deixando o relógio do rival zerar.');
    }
    if (myCaps >= 8) {
      add('implacavel', 'Implacável', '💀', `Capturou ${myCaps} peças na partida.`);
    } else if (myCaps >= 3 && myCaps >= foeCaps) {
      add('carrasco', 'Carrasco', '⚔️', `Mais capturas da partida (${myCaps}).`);
    }
    if (!lostQueen(winner)) {
      add('estrategista', 'Estrategista', '♛', 'Venceu sem perder a rainha.');
    }
    if (remaining <= 4) {
      add('sobrevivente', 'Sobrevivente', '🛡️', `Venceu com apenas ${remaining} peça(s) no tabuleiro.`);
    }
    if (earlyCapturesBy(winner) >= 2) {
      add('agressivo', 'Início Agressivo', '🔥', 'Duas ou mais capturas nos primeiros lances.');
    }
    if (history.length <= 20) {
      add('relampago', 'Fim Relâmpago', '⚡', `Fechou a partida em ${Math.ceil(history.length / 2)} lances.`);
    }
    if (!titles.length) {
      add('vitoria', 'Vitorioso', '👑', 'Levou a melhor no tabuleiro.');
    }
  } else {
    // Empate: títulos neutros.
    const totalCaps = capturesBy(WHITE) + capturesBy(BLACK);
    if (result.reason === 'stalemate') {
      add('afogamento', 'Afogamento', '🌫️', 'Sem lances legais, mas sem xeque: empate.');
    } else {
      add('equilibrio', 'Equilíbrio', '⚖️', 'Ninguém cedeu: a partida terminou empatada.');
    }
    if (totalCaps <= 6) {
      add('muralha', 'Muralha', '🧱', 'Poucas peças caíram — defesas de ferro.');
    }
    if (history.length >= 80) {
      add('maratona', 'Maratona', '🏔️', 'Uma batalha longa e desgastante.');
    }
  }

  return titles.slice(0, 3);
}
