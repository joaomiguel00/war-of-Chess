import { SKINS } from './skins.js';

// Progressão guardada no navegador: partidas, vitórias, títulos, estatísticas
// e as skins desbloqueadas/equipadas. Tudo local ao dispositivo.
const STORAGE_KEY = 'war-of-chess:progress';

function empty() {
  return {
    matches: 0,
    wins: 0,
    draws: 0,
    titles: {},
    captures: 0,
    queensTaken: 0,
    checkmates: 0,
    themeWins: {},
    unlocked: [],
    equipped: {},
    history: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch {
    // Storage bloqueado: progresso vale só nesta sessão.
  }
  return empty();
}

export const progress = load();
// Critérios que já foram cumpridos (por exemplo, uma skin nova adicionada
// depois das vitórias) liberam na hora, sem precisar de outra partida.
unlockEarned();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Sem persistência.
  }
}

// Valor atual de uma estatística usada nos critérios de skins.
export function statValue(stat) {
  if (stat.startsWith('title:')) return progress.titles[stat.slice(6)] ?? 0;
  if (stat.startsWith('themeWin:')) return progress.themeWins[stat.slice(9)] ?? 0;
  return progress[stat] ?? 0;
}

export function isUnlocked(skinId) {
  return progress.unlocked.includes(skinId);
}

// Registra uma partida encerrada. `countsAsWin`: alguém deste dispositivo
// venceu (no hot-seat, qualquer vitória; online, só a do jogador local).
// Devolve as skins que acabaram de ser desbloqueadas.
export function recordMatch({ winner, titles = [], countsAsWin, localCaptures = 0, localQueensTaken = 0, theme, kind }) {
  progress.matches += 1;
  if (!winner) progress.draws += 1;
  if (countsAsWin) {
    progress.wins += 1;
    if (kind === 'checkmate') progress.checkmates += 1;
    if (theme) progress.themeWins[theme] = (progress.themeWins[theme] ?? 0) + 1;
    for (const title of titles) progress.titles[title.id] = (progress.titles[title.id] ?? 0) + 1;
  }
  progress.captures += localCaptures;
  progress.queensTaken += localQueensTaken;
  progress.history.unshift({
    at: Date.now(),
    result: !winner ? 'empate' : countsAsWin ? 'vitória' : 'derrota',
    titles: titles.map((t) => t.name),
  });
  progress.history = progress.history.slice(0, 12);

  const fresh = unlockEarned();
  save();
  return fresh;
}

function unlockEarned() {
  const fresh = [];
  for (const skin of SKINS) {
    if (!progress.unlocked.includes(skin.id) && statValue(skin.stat) >= skin.goal) {
      progress.unlocked.push(skin.id);
      fresh.push(skin);
    }
  }
  return fresh;
}

export function equipSkin(pieceType, skinId) {
  if (skinId && !isUnlocked(skinId)) return;
  progress.equipped[pieceType] = skinId || null;
  save();
}

export function equippedSkin(pieceType) {
  const id = progress.equipped[pieceType];
  return id && isUnlocked(id) ? SKINS.find((s) => s.id === id) : null;
}
