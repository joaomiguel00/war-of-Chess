import * as THREE from 'three';

// Atos da partida pelo número de peças no tabuleiro:
//   Ato 1 (> 24): luz neutra, sol alto.
//   Ato 2 (12–24): sol baixo, sombras longas, tom âmbar.
//   Ato 3 (< 12): luz escura e intensa, vermelho de brasa, mais vento e poeira.
// Complementa (não substitui) a trilha dinâmica e o clima por capturas: aqui
// mexe na direção/cor da luz principal, na exposição, no vento e nas
// partículas. O nível é contínuo (0..2) e sempre interpolado.
const KEY_POSITION = [new THREE.Vector3(5, 9, 4), new THREE.Vector3(8.5, 4.6, 2), new THREE.Vector3(7.5, 3.1, -3.5)];
const KEY_COLOR = [new THREE.Color(0xf0d8ff), new THREE.Color(0xffc98a), new THREE.Color(0xff7a4a)];
const EXPOSURE = [1.45, 1.38, 1.24];
const WIND = [1, 1.3, 1.75];
const PARTICLES = [1, 1.35, 1.8];

export function actFor(pieces) {
  if (pieces > 24) return 0;
  if (pieces >= 12) return 1;
  return 2;
}

const mix = (list, level) => {
  const i = Math.min(1, Math.floor(level));
  const t = level - i;
  return [list[i], list[Math.min(2, i + 1)], t];
};

export function createActs({ lights, renderer, environment }) {
  let target = 0;
  let level = 0;
  const color = new THREE.Color();
  const position = new THREE.Vector3();
  // Rajadas externas (eventos perto do rei) somam ao vento do ato.
  let gust = 0;

  function setPieces(count) {
    target = actFor(count);
  }

  function addGust(amount) {
    gust = Math.min(1.5, gust + amount);
  }

  function update(dt) {
    // Transição lenta: um ato novo leva alguns segundos para se instalar.
    level += (target - level) * Math.min(1, dt * 0.35);
    gust = Math.max(0, gust - dt * 0.8);

    const [p0, p1, tp] = mix(KEY_POSITION, level);
    position.lerpVectors(p0, p1, tp);
    lights.key.position.copy(position);
    const [c0, c1, tc] = mix(KEY_COLOR, level);
    color.copy(c0).lerp(c1, tc);
    lights.key.color.copy(color);
    const [e0, e1, te] = mix(EXPOSURE, level);
    renderer.toneMappingExposure = e0 + (e1 - e0) * te;

    const [w0, w1, tw] = mix(WIND, level);
    environment.setWindScale(w0 + (w1 - w0) * tw + gust);
    const [q0, q1, tq] = mix(PARTICLES, level);
    environment.setParticleBoost(q0 + (q1 - q0) * tq + gust * 0.5);
  }

  return {
    setPieces,
    addGust,
    update,
    get level() {
      return level;
    },
    get act() {
      return Math.round(level) + 1;
    },
  };
}
