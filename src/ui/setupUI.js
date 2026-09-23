import { WHITE } from '../chess/moveGen.js';
import {
  ARMY,
  zoneRows,
  classicPawnRow,
  squareShade,
  createEmptySetupBoard,
  countPlaced,
  bishopsAreValid,
  finalizePawnFlags,
} from '../chess/setup.js';

const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function rowDescription(index) {
  if (index === 0) return 'Fileira 1 · fundo';
  if (index === 1) return 'Fileira 2 · padrão (peões avançam 2 casas)';
  return 'Fileira 3 · avançada (peões avançam só 1 casa)';
}

// Tela de montagem secreta: grade 3x8 da própria zona + paleta de peças.
export function renderSetupUI(root, color, onConfirm) {
  const board = createEmptySetupBoard();
  const rows = zoneRows(color);
  const standardRow = classicPawnRow(color);
  const teamName = color === WHITE ? 'Jogador 1 · Ordem (Brancas)' : 'Jogador 2 · Ruína (Pretas)';
  let armed = null;

  const screen = document.createElement('div');
  screen.className = `screen setup-screen team-${color}`;
  screen.innerHTML = `
    <header class="setup-header">
      <h2>${teamName}</h2>
      <p>Posicione suas 16 peças nas 3 fileiras do seu lado. O adversário não pode ver esta tela.</p>
    </header>
    <div class="setup-body">
      <div class="setup-grid-wrap">
        <div class="setup-grid" id="setup-grid"></div>
        <div class="setup-files" id="setup-files"></div>
      </div>
      <aside class="palette" id="palette"></aside>
    </div>
    <footer class="setup-footer">
      <p class="setup-message" id="setup-message"></p>
      <div class="setup-actions">
        <button class="btn btn-ghost" id="btn-clear">Limpar</button>
        <button class="btn btn-primary" id="btn-confirm" disabled>Confirmar montagem</button>
      </div>
    </footer>
  `;
  root.appendChild(screen);

  const gridEl = screen.querySelector('#setup-grid');
  const filesEl = screen.querySelector('#setup-files');
  const paletteEl = screen.querySelector('#palette');
  const messageEl = screen.querySelector('#setup-message');
  const confirmBtn = screen.querySelector('#btn-confirm');
  const clearBtn = screen.querySelector('#btn-clear');

  // A fileira do fundo aparece embaixo, como o jogador veria o próprio lado.
  const displayRows = [...rows].reverse();

  filesEl.innerHTML = FILES.map((f) => `<span>${f}</span>`).join('');

  function remaining(type) {
    const total = ARMY.find((entry) => entry.type === type).count;
    return total - countPlaced(board, color, type);
  }

  function allPlaced() {
    return ARMY.every((entry) => remaining(entry.type) === 0);
  }

  function renderPalette() {
    paletteEl.innerHTML = '<h3>Peças disponíveis</h3>';
    for (const entry of ARMY) {
      const left = remaining(entry.type);
      const button = document.createElement('button');
      button.className = 'palette-item';
      button.classList.toggle('is-armed', armed === entry.type);
      button.classList.toggle('is-empty', left === 0);
      button.disabled = left === 0;
      button.innerHTML = `
        <span class="palette-glyph">${GLYPHS[entry.type]}</span>
        <span class="palette-label">${entry.label}</span>
        <span class="palette-count">${left}</span>
      `;
      button.onclick = () => {
        armed = armed === entry.type ? null : entry.type;
        renderPalette();
      };
      paletteEl.appendChild(button);
    }

    const hint = document.createElement('p');
    hint.className = 'palette-hint';
    hint.textContent =
      'Escolha uma peça e clique numa casa. Clique numa peça posicionada para devolvê-la.';
    paletteEl.appendChild(hint);
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    for (const row of displayRows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'setup-row';

      const label = document.createElement('span');
      label.className = 'setup-row-label';
      label.textContent = rowDescription(rows.indexOf(row));
      rowEl.appendChild(label);

      const cells = document.createElement('div');
      cells.className = 'setup-cells';

      for (let col = 0; col < 8; col++) {
        const cell = document.createElement('button');
        cell.className = `setup-cell shade-${squareShade(row, col)}`;
        cell.classList.toggle('is-standard-row', row === standardRow);
        const piece = board[row][col];
        if (piece) {
          cell.innerHTML = `<span class="cell-glyph">${GLYPHS[piece.type]}</span>`;
          cell.classList.add('is-filled');
        }
        cell.onclick = () => handleCellClick(row, col);
        cells.appendChild(cell);
      }

      rowEl.appendChild(cells);
      gridEl.appendChild(rowEl);
    }
  }

  function handleCellClick(row, col) {
    if (board[row][col]) {
      board[row][col] = null;
    } else if (armed && remaining(armed) > 0) {
      board[row][col] = { type: armed, color, hasMoved: false };
      if (remaining(armed) === 0) armed = null;
    } else if (!armed) {
      messageEl.textContent = 'Selecione uma peça na lista ao lado antes de clicar no tabuleiro.';
      messageEl.className = 'setup-message is-hint';
      return;
    }
    update();
  }

  function update() {
    renderGrid();
    renderPalette();

    const placed = allPlaced();
    const bishopsOk = bishopsAreValid(board, color);
    confirmBtn.disabled = !(placed && bishopsOk);

    if (!bishopsOk) {
      messageEl.textContent = 'Os dois bispos precisam ficar em casas de cores diferentes.';
      messageEl.className = 'setup-message is-error';
    } else if (!placed) {
      const left = ARMY.reduce((sum, entry) => sum + remaining(entry.type), 0);
      messageEl.textContent = `Faltam ${left} peça(s) para posicionar.`;
      messageEl.className = 'setup-message is-hint';
    } else {
      messageEl.textContent = 'Montagem válida. Confirme para passar o dispositivo.';
      messageEl.className = 'setup-message is-ok';
    }
  }

  clearBtn.onclick = () => {
    for (const row of rows) for (let col = 0; col < 8; col++) board[row][col] = null;
    armed = null;
    update();
  };

  confirmBtn.onclick = () => {
    if (confirmBtn.disabled) return;
    onConfirm(finalizePawnFlags(board, color));
  };

  update();
}
