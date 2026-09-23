import './style.css';
import { WHITE, BLACK } from './chess/moveGen.js';
import { ChessGame, createStandardBoard, STATUS } from './chess/game.js';
import { mergeBoards, kingIsInCheck } from './chess/setup.js';
import { GameView } from './three/gameView.js';
import { preloadPieceModels } from './three/pieceGLB.js';
import { renderSetupUI } from './ui/setupUI.js';
import { createChat } from './ui/chat.js';
import { createClock, formatClock } from './clock.js';
import { computeTitles } from './achievements.js';
import { settings, setSetting } from './settings.js';
import { audio } from './audio/index.js';
import { createCaptureTester } from './debug.js';

const uiRoot = document.getElementById('ui-root');
const canvasContainer = document.getElementById('canvas-container');

const TEAM_NAME = {
  [WHITE]: 'Ordem (Brancas)',
  [BLACK]: 'Ruína (Pretas)',
};

let gameView = null;
let chat = null;
let customBoards = { [WHITE]: null, [BLACK]: null };

const teamName = (color) => (color === WHITE ? 'Ordem' : 'Ruína');

function resetUI({ interactive = true } = {}) {
  uiRoot.innerHTML = '';
  uiRoot.style.pointerEvents = interactive ? 'auto' : 'none';
}

function destroyMatch() {
  if (chat) {
    chat.dispose();
    chat = null;
  }
  if (gameView) {
    gameView.dispose();
    gameView = null;
    audio.stopMusic();
  }
  canvasContainer.style.display = 'none';
}

/* ---------------------------------------------------------------- menus */

function showStartMenu() {
  destroyMatch();
  resetUI();
  uiRoot.innerHTML = `
    <div class="screen start-screen">
      <div class="start-card">
        <p class="eyebrow">Tabuleiro de sombras</p>
        <h1 class="title">War of Chess</h1>
        <p class="subtitle">Dois jogadores, um dispositivo. Escolha como a batalha começa.</p>
        <div class="menu-buttons">
          <button class="btn btn-primary" id="btn-standard">
            <strong>Modo Padrão</strong>
            <span>Posição clássica do xadrez</span>
          </button>
          <button class="btn btn-secondary" id="btn-custom">
            <strong>Montagem Customizada</strong>
            <span>Escolha sua cor e posicione o exército em segredo, em até 3 fileiras</span>
          </button>
        </div>
        <button class="btn btn-ghost btn-wide" id="btn-options">Opções</button>
      </div>
    </div>
  `;

  uiRoot.querySelector('#btn-standard').onclick = () => launchMatch(createStandardBoard(), false);
  uiRoot.querySelector('#btn-custom').onclick = startCustomFlow;
  uiRoot.querySelector('#btn-options').onclick = () => showOptions(showStartMenu);
}

/* -------------------------------------------------------------- opções */

const TOGGLES = [
  {
    key: 'gore',
    title: 'Sangue e destroços',
    hint: 'Marcas de captura que ficam no tabuleiro até o fim da partida',
  },
  {
    key: 'cinematic',
    title: 'Câmera cinematográfica',
    hint: 'Nas capturas, a câmera se aproxima em câmera lenta e depois volta',
  },
];

// Todas as preferências num lugar só. `onBack` decide para onde voltar,
// então a mesma tela serve ao menu inicial e ao HUD durante a partida.
function showOptions(onBack) {
  resetUI();
  uiRoot.innerHTML = `
    <div class="screen options-screen">
      <div class="start-card">
        <p class="eyebrow">Ajustes</p>
        <h2>Opções</h2>

        ${TOGGLES.map(
          (toggle) => `
          <label class="option-toggle" for="opt-${toggle.key}">
            <input type="checkbox" id="opt-${toggle.key}" data-key="${toggle.key}"
              ${settings[toggle.key] ? 'checked' : ''} />
            <span class="option-switch"></span>
            <span class="option-text">
              <strong>${toggle.title}</strong>
              <em>${toggle.hint}</em>
            </span>
          </label>`,
        ).join('')}

        <div class="option-volume">
          <button class="volume-button" id="btn-mute" type="button" aria-pressed="${settings.muted}">
            ${settings.muted ? '🔇' : '🔊'}
          </button>
          <label class="option-text" for="opt-volume">
            <strong>Volume</strong>
            <em id="volume-label">${settings.muted ? 'Mudo' : `${Math.round(settings.volume * 100)}%`}</em>
          </label>
          <input
            type="range"
            id="opt-volume"
            min="0"
            max="100"
            value="${Math.round(settings.volume * 100)}"
          />
        </div>

        <div class="option-clock">
          <span class="option-text"><strong>Relógio de xadrez</strong><em>Tempo por jogador; ao zerar, perde a partida</em></span>
          <div class="clock-choices" id="clock-choices">
            ${[
              { v: 0, label: 'Off' },
              { v: 5, label: '5 min' },
              { v: 10, label: '10 min' },
              { v: 15, label: '15 min' },
            ]
              .map(
                (o) =>
                  `<button type="button" class="clock-choice ${settings.clockMinutes === o.v ? 'is-on' : ''}" data-min="${o.v}">${o.label}</button>`,
              )
              .join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-wide" id="btn-back">Voltar</button>
      </div>
    </div>
  `;

  uiRoot.querySelectorAll('.clock-choice').forEach((button) => {
    button.onclick = () => {
      setSetting('clockMinutes', Number(button.dataset.min));
      uiRoot
        .querySelectorAll('.clock-choice')
        .forEach((b) => b.classList.toggle('is-on', b === button));
      audio.playUi('click');
    };
  });

  uiRoot.querySelectorAll('.option-toggle input').forEach((input) => {
    input.onchange = (event) => {
      setSetting(event.target.dataset.key, event.target.checked);
      audio.playUi('click');
    };
  });

  const volumeSlider = uiRoot.querySelector('#opt-volume');
  const volumeLabel = uiRoot.querySelector('#volume-label');
  const muteButton = uiRoot.querySelector('#btn-mute');

  function refreshVolumeUI() {
    muteButton.textContent = settings.muted ? '🔇' : '🔊';
    muteButton.setAttribute('aria-pressed', String(settings.muted));
    volumeLabel.textContent = settings.muted ? 'Mudo' : `${Math.round(settings.volume * 100)}%`;
  }

  volumeSlider.oninput = (event) => {
    audio.unlock();
    audio.setVolume(Number(event.target.value) / 100);
    if (settings.muted && settings.volume > 0) audio.setMuted(false);
    refreshVolumeUI();
    audio.playUi('click');
  };

  muteButton.onclick = () => {
    audio.unlock();
    audio.setMuted(!settings.muted);
    refreshVolumeUI();
    if (!settings.muted) audio.playUi('click');
  };

  uiRoot.querySelector('#btn-back').onclick = onBack;
}

/* ------------------------------------------------- montagem customizada */

function startCustomFlow() {
  showColorPick((firstColor) => {
    customBoards = { [WHITE]: null, [BLACK]: null };
    const secondColor = firstColor === WHITE ? BLACK : WHITE;
    showHandoff(
      firstColor,
      'Monte seu exército em segredo. Ninguém mais deve ver a tela.',
      () =>
        showSetupScreen(firstColor, () =>
          showHandoff(secondColor, 'É a sua vez de escolher a posição e montar em segredo.', () =>
            showSetupScreen(secondColor, tryReveal),
          ),
        ),
    );
  });
}

// Jogador 1 escolhe o exército que vai comandar. As Brancas sempre jogam
// primeiro (regra do xadrez), então quem pega as Pretas move em segundo.
function showColorPick(onPick) {
  destroyMatch();
  resetUI();
  uiRoot.innerHTML = `
    <div class="screen intro-screen">
      <div class="start-card">
        <p class="eyebrow">Jogador 1 · escolha seu exército</p>
        <h2>Qual cor você comanda?</h2>
        <p class="subtitle">
          Depois cada jogador posiciona as próprias peças em segredo.
          As Brancas jogam o primeiro lance.
        </p>
        <div class="menu-buttons color-pick">
          <button class="btn btn-primary" id="btn-pick-white">
            <strong>Ordem (Brancas)</strong>
            <span>Você move primeiro</span>
          </button>
          <button class="btn btn-secondary" id="btn-pick-black">
            <strong>Ruína (Pretas)</strong>
            <span>Você move em segundo</span>
          </button>
        </div>
        <button class="btn btn-ghost btn-wide" id="btn-cancel">Voltar</button>
      </div>
    </div>
  `;
  uiRoot.querySelector('#btn-pick-white').onclick = () => onPick(WHITE);
  uiRoot.querySelector('#btn-pick-black').onclick = () => onPick(BLACK);
  uiRoot.querySelector('#btn-cancel').onclick = showStartMenu;
}

function showHandoff(color, message, onReady) {
  destroyMatch();
  resetUI();
  uiRoot.innerHTML = `
    <div class="screen intro-screen team-${color}">
      <div class="start-card">
        <p class="eyebrow">Passe o dispositivo</p>
        <h2>${TEAM_NAME[color]}</h2>
        <p class="subtitle">${message}</p>
        <button class="btn btn-primary" id="btn-ready">Estou pronto</button>
      </div>
    </div>
  `;
  uiRoot.querySelector('#btn-ready').onclick = onReady;
}

function showSetupScreen(color, onDone) {
  destroyMatch();
  resetUI();
  renderSetupUI(uiRoot, color, (board) => {
    customBoards[color] = board;
    onDone();
  });
}

function tryReveal() {
  const board = mergeBoards(customBoards[WHITE], customBoards[BLACK]);

  for (const color of [WHITE, BLACK]) {
    if (kingIsInCheck(board, color)) {
      showSetupRejected(color);
      return;
    }
  }

  showReveal(board);
}

function showSetupRejected(color) {
  resetUI();
  uiRoot.innerHTML = `
    <div class="screen intro-screen team-${color}">
      <div class="start-card">
        <p class="eyebrow">Montagem inválida</p>
        <h2>${TEAM_NAME[color]}</h2>
        <p class="subtitle">
          Seu rei ficaria em xeque assim que o tabuleiro fosse revelado.
          Reposicione suas peças — a montagem do adversário continua em segredo.
        </p>
        <button class="btn btn-primary" id="btn-retry">Refazer montagem</button>
      </div>
    </div>
  `;
  uiRoot.querySelector('#btn-retry').onclick = () => showSetupScreen(color, tryReveal);
}

function showReveal(board) {
  resetUI({ interactive: false });
  uiRoot.innerHTML = `
    <div class="screen reveal-screen">
      <h2 class="reveal-title">O tabuleiro é revelado</h2>
    </div>
  `;
  setTimeout(() => launchMatch(board, true), 900);
}

/* --------------------------------------------------------------- partida */

async function launchMatch(board, withReveal) {
  destroyMatch();
  resetUI({ interactive: false });
  canvasContainer.style.display = 'block';

  // Garante os modelos .glb carregados antes de montar as peças.
  await preloadPieceModels();

  audio.startMusic();

  const game = new ChessGame(board);
  const clock = createClock(settings.clockMinutes);
  gameView = new GameView(canvasContainer, game, {
    clock,
    onStatusChange: handleStatusChange,
    onPromotionNeeded: askPromotion,
    onHoverPiece: showVeteranTooltip,
    onClockTick: updateClockHUD,
    onGameOver: showVictory,
    onReplayStart: () => showReplayOverlay(true),
    onReplayCaption: setReplayCaption,
    onReplayEnd: () => showReplayOverlay(false),
  });
  gameView.focusOnSide(game.turn);

  renderHUD(game);
  chat = createChat({ root: uiRoot, getTurn: () => game.turn, teamName });

  if (withReveal) await gameView.playRevealAnimation();

  gameView.startClock();

  // Expõe o estado para depuração no console do navegador.
  window.xadrez = { game, gameView, audio, testarCaptura: createCaptureTester(() => window.xadrez) };
}

function renderHUD(game) {
  const hud = document.createElement('div');
  hud.className = 'hud panel';
  hud.innerHTML = `
    <div class="hud-turn" id="hud-turn"></div>
    <div class="hud-check" id="hud-check">Xeque!</div>
    <button class="volume-button" id="hud-mute" type="button" title="Ligar/desligar som"></button>
    <button class="volume-button" id="hud-options" type="button" title="Opções">⚙</button>
    <button class="btn btn-ghost btn-small" id="hud-menu">Menu</button>
  `;
  uiRoot.appendChild(hud);

  // Relógio: dois mostradores, um por exército, só quando ativado.
  if (gameView?.clock?.enabled) {
    const clocks = document.createElement('div');
    clocks.className = 'clocks panel';
    clocks.innerHTML = `
      <div class="clock-face team-w" id="clock-w"><span class="clock-name">Ordem</span><span class="clock-time" id="clock-time-w"></span></div>
      <div class="clock-face team-b" id="clock-b"><span class="clock-name">Ruína</span><span class="clock-time" id="clock-time-b"></span></div>
    `;
    uiRoot.appendChild(clocks);
    updateClockHUD(gameView.clock);
  }

  const controls = document.createElement('div');
  controls.className = 'hint panel';
  controls.textContent =
    'Arraste para orbitar · scroll para zoom · clique numa peça para ver os lances';
  uiRoot.appendChild(controls);

  const muteButton = hud.querySelector('#hud-mute');
  muteButton.textContent = settings.muted ? '🔇' : '🔊';
  muteButton.onclick = () => {
    audio.setMuted(!settings.muted);
    muteButton.textContent = settings.muted ? '🔇' : '🔊';
  };

  hud.querySelector('#hud-options').onclick = () =>
    showOptions(() => {
      // Volta para a partida em andamento, sem reiniciar nada.
      resetUI({ interactive: false });
      renderHUD(game);
    });

  hud.querySelector('#hud-menu').onclick = showStartMenu;
  updateHUD(game);
}

/* ------------------------------------------- veteranos e replay final */

const PIECE_NAME = {
  p: 'Peão',
  n: 'Cavalo',
  b: 'Bispo',
  r: 'Torre',
  q: 'Rainha',
  k: 'Rei',
};

let tooltipEl = null;

// Passar o mouse numa peça que já capturou mostra a contagem de abates.
function showVeteranTooltip(info) {
  if (!info) {
    tooltipEl?.remove();
    tooltipEl = null;
    return;
  }

  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'veteran-tip';
    uiRoot.appendChild(tooltipEl);
  }

  const { piece, x, y } = info;
  const kills = piece.kills ?? 0;
  tooltipEl.innerHTML = `
    <strong>${PIECE_NAME[piece.type]} veterano</strong>
    <span>${kills} ${kills === 1 ? 'abate' : 'abates'}</span>
  `;
  tooltipEl.style.left = `${x + 16}px`;
  tooltipEl.style.top = `${y + 16}px`;
}

let replayEl = null;

function showReplayOverlay(visible) {
  if (!visible) {
    replayEl?.remove();
    replayEl = null;
    return;
  }
  replayEl = document.createElement('div');
  replayEl.className = 'replay-overlay';
  replayEl.innerHTML = `
    <div class="replay-bar replay-top">Momentos da batalha</div>
    <div class="replay-caption" id="replay-caption"></div>
    <div class="replay-bar replay-bottom">clique para pular</div>
  `;
  uiRoot.appendChild(replayEl);
}

function setReplayCaption(text) {
  const caption = document.getElementById('replay-caption');
  if (!caption) return;
  caption.textContent = text ?? '';
  caption.classList.remove('is-visible');
  if (text) {
    // Reinicia a animação de entrada da legenda.
    void caption.offsetWidth;
    caption.classList.add('is-visible');
  }
}

function updateHUD(game) {
  const turnEl = document.getElementById('hud-turn');
  const checkEl = document.getElementById('hud-check');
  if (turnEl) {
    turnEl.textContent = `Vez de ${TEAM_NAME[game.turn]}`;
    turnEl.className = `hud-turn team-${game.turn}`;
  }
  if (checkEl) {
    checkEl.style.display = game.status === STATUS.CHECK ? 'block' : 'none';
  }
}

function updateClockHUD(clock) {
  if (!clock?.enabled) return;
  for (const color of [WHITE, BLACK]) {
    const timeEl = document.getElementById(`clock-time-${color}`);
    if (!timeEl) continue;
    const remaining = clock.getRemaining(color);
    timeEl.textContent = formatClock(remaining);
    const face = document.getElementById(`clock-${color}`);
    if (face) {
      face.classList.toggle('is-active', clock.active === color && clock.running);
      face.classList.toggle('is-low', remaining <= 60 && remaining > 0);
      face.classList.toggle('is-out', remaining <= 0);
    }
  }
}

function handleStatusChange(game) {
  updateHUD(game);
}

const KIND_TITLE = {
  checkmate: 'Xeque-mate!',
  timeout: 'Tempo esgotado!',
  stalemate: 'Afogamento',
  'draw-repetition': 'Empate por repetição',
  'draw-50move': 'Empate (regra dos 50)',
};

// Cena de vitória: chamada pelo gameView após a cinematografia 3D do mate.
function showVictory(result) {
  const game = gameView.game;
  const isDraw = !result.winner;
  const titles = computeTitles(game, result);
  const headline = isDraw ? 'Empate' : `${TEAM_NAME[result.winner]} vence`;
  const sub = KIND_TITLE[result.kind] ?? 'Fim de partida';

  const overlay = document.createElement('div');
  overlay.className = `victory-overlay panel ${isDraw ? 'is-draw' : `team-${result.winner}`}`;
  overlay.innerHTML = `
    <div class="victory-card">
      <p class="victory-kind">${sub}</p>
      <h1 class="victory-headline">${headline}</h1>
      ${
        titles.length
          ? `<div class="victory-titles">${titles
              .map(
                (t) =>
                  `<div class="victory-title"><span class="vt-icon">${t.icon}</span><span class="vt-body"><strong>${t.name}</strong><em>${t.desc}</em></span></div>`,
              )
              .join('')}</div>`
          : ''
      }
      <div class="victory-actions">
        <button class="btn btn-primary" id="vic-replay">Assistir Replay</button>
        <button class="btn btn-secondary" id="vic-again">Jogar Novamente</button>
        <button class="btn btn-ghost" id="vic-exit">Sair</button>
      </div>
    </div>
  `;
  uiRoot.appendChild(overlay);
  overlay.querySelector('#vic-replay').onclick = () => {
    overlay.remove();
    startReplay(() => showVictory(result));
  };
  overlay.querySelector('#vic-again').onclick = showStartMenu;
  // "Sair" apenas fecha a tela e deixa o tabuleiro final à mostra.
  overlay.querySelector('#vic-exit').onclick = () => overlay.remove();
}

// Reproduz a partida inteira com controles de play/pause e velocidade.
function startReplay(onExit) {
  const state = { paused: false, speed: 1 };

  const bar = document.createElement('div');
  bar.className = 'replay-controls panel';
  bar.innerHTML = `
    <button class="btn btn-small" id="rp-play">⏸ Pausar</button>
    <div class="rp-speeds">
      ${[1, 2, 4].map((s) => `<button class="rp-speed ${s === 1 ? 'is-on' : ''}" data-speed="${s}">${s}x</button>`).join('')}
    </div>
    <div class="rp-progress"><span id="rp-count">0/0</span></div>
    <button class="btn btn-ghost btn-small" id="rp-exit">Encerrar</button>
  `;
  uiRoot.appendChild(bar);

  const playBtn = bar.querySelector('#rp-play');
  playBtn.onclick = () => {
    state.paused = !state.paused;
    playBtn.textContent = state.paused ? '▶ Continuar' : '⏸ Pausar';
  };
  bar.querySelectorAll('.rp-speed').forEach((button) => {
    button.onclick = () => {
      state.speed = Number(button.dataset.speed);
      bar.querySelectorAll('.rp-speed').forEach((b) => b.classList.toggle('is-on', b === button));
    };
  });

  let finished = false;
  function cleanup() {
    if (finished) return;
    finished = true;
    bar.remove();
  }
  bar.querySelector('#rp-exit').onclick = () => {
    // Encerra o replay: o loop percebe pela flag e para.
    state.stopped = true;
    state.paused = false;
  };

  gameView.runReplay({
    getSpeed: () => state.speed,
    isPaused: () => state.paused && !state.stopped,
    isStopped: () => !!state.stopped,
    onProgress: (i, total) => {
      const count = bar.querySelector('#rp-count');
      if (count) count.textContent = `${i}/${total}`;
    },
    onDone: () => {
      cleanup();
      onExit?.();
    },
  });
}

function askPromotion() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay panel';
    overlay.innerHTML = `
      <div class="modal">
        <h2>Promoção</h2>
        <p>Escolha a peça que o peão se tornará:</p>
        <div class="promotion-options">
          <button class="btn promo-btn" data-type="q"><span>♛</span>Rainha</button>
          <button class="btn promo-btn" data-type="r"><span>♜</span>Torre</button>
          <button class="btn promo-btn" data-type="b"><span>♝</span>Bispo</button>
          <button class="btn promo-btn" data-type="n"><span>♞</span>Cavalo</button>
        </div>
      </div>
    `;
    uiRoot.appendChild(overlay);
    overlay.querySelectorAll('.promo-btn').forEach((button) => {
      button.onclick = () => {
        overlay.remove();
        resolve(button.dataset.type);
      };
    });
  });
}

document.addEventListener('pointerdown', () => audio.unlock(), { once: true });

// Começa a carregar os modelos .glb desde já (é rápido; a partida espera se preciso).
preloadPieceModels();

showStartMenu();
