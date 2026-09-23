const STORAGE_KEY = 'xadrez-sombrio:settings';

const defaults = {
  // Sangue e destroços persistentes no tabuleiro.
  gore: true,
  // Câmera cinematográfica nas capturas.
  cinematic: true,
  // Volume geral (0 a 1) e mudo.
  volume: 0.7,
  muted: false,
  // Relógio de xadrez: minutos por jogador. 0 = desativado (sem limite).
  clockMinutes: 0,
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // Modo privado / storage bloqueado: segue com os padrões.
  }
  return { ...defaults };
}

export const settings = load();

export function setSetting(key, value) {
  settings[key] = value;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Sem persistência: a preferência vale só para esta sessão.
  }
}
