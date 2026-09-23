import { progress, statValue, isUnlocked, equipSkin, equippedSkin } from '../progress.js';
import { SKINS, skinsFor } from '../skins.js';
import { TITLE_CATALOG } from '../achievements.js';

// Sala de Troféus (histórico de progressão) e Vestiário (skins).
const PIECES = [
  { type: 'k', name: 'Rei', glyph: '♚' },
  { type: 'q', name: 'Rainha', glyph: '♛' },
  { type: 'r', name: 'Torre', glyph: '♜' },
  { type: 'b', name: 'Bispo', glyph: '♝' },
  { type: 'n', name: 'Cavalo', glyph: '♞' },
  { type: 'p', name: 'Peão', glyph: '♟' },
];
const pieceName = (type) => PIECES.find((p) => p.type === type)?.name ?? type;

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function swatches(skin) {
  return ['w', 'b']
    .map(
      (side) =>
        `<span class="skin-swatch" title="${side === 'w' ? 'Ordem' : 'Ruína'}">${['main', 'metal', 'glow']
          .map((k) => `<i style="background:${hex(skin.palette[side][k])}"></i>`)
          .join('')}</span>`,
    )
    .join('');
}

function progressBar(skin) {
  const value = Math.min(skin.goal, statValue(skin.stat));
  return `<span class="skin-progress"><span style="width:${(value / skin.goal) * 100}%"></span></span>
    <em class="skin-count">${value}/${skin.goal}</em>`;
}

export function renderTrophyRoom(root, { onBack, onWardrobe }) {
  const stats = [
    { label: 'Vitórias', value: progress.wins },
    { label: 'Partidas', value: progress.matches },
    { label: 'Empates', value: progress.draws },
    { label: 'Xeque-mates', value: progress.checkmates },
    { label: 'Peças capturadas', value: progress.captures },
    { label: 'Rainhas abatidas', value: progress.queensTaken },
  ];
  const unlocked = SKINS.filter((s) => isUnlocked(s.id));

  root.innerHTML = `
    <div class="screen trophy-screen">
      <div class="start-card wide-card">
        <p class="eyebrow">Salão da glória</p>
        <h2>Sala de Troféus</h2>
        <div class="stat-grid">
          ${stats.map((s) => `<div class="stat-tile"><strong>${s.value}</strong><span>${s.label}</span></div>`).join('')}
        </div>

        <h3 class="section-title">Títulos conquistados</h3>
        <div class="title-grid">
          ${TITLE_CATALOG.map((t) => {
            const count = progress.titles[t.id] ?? 0;
            return `<div class="title-chip ${count ? '' : 'is-locked'}">
              <span class="vt-icon">${t.icon}</span>
              <span class="vt-body"><strong>${t.name}</strong><em>${t.desc}</em></span>
              <b class="title-count">${count ? `×${count}` : '—'}</b>
            </div>`;
          }).join('')}
        </div>

        <h3 class="section-title">Skins desbloqueadas (${unlocked.length}/${SKINS.length})</h3>
        <div class="skin-strip">
          ${
            unlocked.length
              ? unlocked.map((s) => `<div class="skin-mini">${swatches(s)}<span>${s.name}</span></div>`).join('')
              : '<p class="muted">Nenhuma ainda — veja os critérios no Vestiário.</p>'
          }
        </div>

        ${
          progress.history.length
            ? `<h3 class="section-title">Últimas batalhas</h3>
               <ul class="history-list">${progress.history
                 .slice(0, 6)
                 .map(
                   (h) =>
                     `<li class="is-${h.result === 'vitória' ? 'win' : h.result === 'derrota' ? 'loss' : 'draw'}"><strong>${h.result}</strong><span>${new Date(h.at).toLocaleDateString('pt-BR')}</span><em>${h.titles.join(' · ')}</em></li>`,
                 )
                 .join('')}</ul>`
            : ''
        }

        <div class="menu-row">
          <button class="btn btn-secondary" id="btn-to-wardrobe">Vestiário</button>
          <button class="btn btn-primary" id="btn-trophy-back">Voltar</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector('#btn-trophy-back').onclick = onBack;
  root.querySelector('#btn-to-wardrobe').onclick = onWardrobe;
}

export function renderWardrobe(root, { onBack }) {
  function draw() {
    root.innerHTML = `
      <div class="screen trophy-screen">
        <div class="start-card wide-card">
          <p class="eyebrow">Coleção</p>
          <h2>Vestiário</h2>
          <p class="subtitle">Skins trocam as cores das peças. Conquiste-as jogando; equipe as que quiser.</p>
          <div class="wardrobe-list">
            ${PIECES.map(({ type, glyph }) =>
              skinsFor(type)
                .map((skin) => {
                  const open = isUnlocked(skin.id);
                  const worn = equippedSkin(type)?.id === skin.id;
                  return `<div class="skin-card ${open ? '' : 'is-locked'} ${worn ? 'is-worn' : ''}">
                    <span class="skin-glyph">${glyph}</span>
                    <span class="skin-info">
                      <strong>${skin.name}</strong>
                      <em>${pieceName(type)} · ${skin.criterion}</em>
                      <span class="skin-row">${swatches(skin)} ${open ? '' : progressBar(skin)}</span>
                    </span>
                    ${
                      open
                        ? `<button class="btn btn-small ${worn ? 'btn-primary' : 'btn-ghost'}" data-equip="${skin.id}" data-type="${type}">${worn ? 'Equipada' : 'Equipar'}</button>`
                        : '<span class="skin-lock" title="Bloqueada">🔒</span>'
                    }
                  </div>`;
                })
                .join(''),
            ).join('')}
          </div>
          <button class="btn btn-primary btn-wide" id="btn-wardrobe-back">Voltar</button>
        </div>
      </div>
    `;
    root.querySelectorAll('[data-equip]').forEach((button) => {
      button.onclick = () => {
        const { equip, type } = button.dataset;
        equipSkin(type, equippedSkin(type)?.id === equip ? null : equip);
        draw();
      };
    });
    root.querySelector('#btn-wardrobe-back').onclick = onBack;
  }
  draw();
}
