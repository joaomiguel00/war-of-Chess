import * as THREE from 'three';
import { WHITE } from '../chess/moveGen.js';

// Fita de LED em volta do tabuleiro e luz própria do tabuleiro.
// Cores dos exércitos: laranja do lado da Ordem, magenta do lado da Ruína,
// em degradê pelas laterais. Um brilho corre pela fita; o lado de quem joga
// fica mais aceso e, no xeque, a fita pulsa em vermelho.

const ORDER = new THREE.Color(0xffa040);
const RUIN = new THREE.Color(0xd946ef);
const ALERT = new THREE.Color(0xff2436);

const EDGE = 4.2; // meia-largura do quadrado da fita (as casas vão até ±4)
const SLAB_EDGE = 4.605; // face externa da laje
const SLAB_TOP = -0.14;
const LED_SPACING = 0.26;
const BAND_SEGMENTS = 24; // subdivisões por lado (degradê suave nas laterais)

const SPOT_INTENSITY = 190; // holofote sobre o tabuleiro (candela)
const SPILL_INTENSITY = 1.5; // luzes baixas que espalham a cor da fita

// Ponto no perímetro de um quadrado de meia-largura h; s em [0, 1] percorre
// os quatro lados a partir do canto da Ordem à esquerda.
function perimeterPoint(h, s) {
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ];
  const scaled = s * 4;
  const side = Math.min(3, Math.floor(scaled));
  const f = scaled - side;
  const [x0, z0] = corners[side];
  const [x1, z1] = corners[(side + 1) % 4];
  return [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
}

// Faixa contínua em volta do tabuleiro formada por "linhas" (mesma s, h/y
// diferentes). O ganho de cada linha dá o degradê (0 = apagado nas bordas).
function buildBand(rows) {
  const positions = [];
  const meta = []; // { s, z, gain } por vértice
  const indices = [];
  const perRow = 4 * (BAND_SEGMENTS + 1);

  for (const row of rows) {
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k <= BAND_SEGMENTS; k++) {
        const s = (side + k / BAND_SEGMENTS) / 4;
        const [x, z] = perimeterPoint(row.h, s);
        positions.push(x, row.y, z);
        meta.push({ s, z, gain: row.gain });
      }
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let side = 0; side < 4; side++) {
      for (let k = 0; k < BAND_SEGMENTS; k++) {
        const a = r * perRow + side * (BAND_SEGMENTS + 1) + k;
        const b = a + 1;
        const c = a + perRow;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(meta.length * 3), 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  return { mesh: new THREE.Mesh(geometry, material), meta };
}

export function createBoardLights(scene) {
  const group = new THREE.Group();
  group.name = 'BoardLights';
  scene.add(group);

  const state = { time: 0, turnMix: 0, alertMix: 0, level: 1 };
  const tmp = new THREE.Color();
  const alertTmp = new THREE.Color();

  // Cor de um ponto da fita: degradê dos exércitos, brilho corrente, destaque
  // do lado de quem joga e alerta de xeque.
  function ledColor(out, z, s) {
    const t = THREE.MathUtils.clamp((z / EDGE + 1) / 2, 0, 1); // 0 = Ordem, 1 = Ruína
    out.copy(ORDER).lerp(RUIN, t);
    const chase = 0.5 + 0.5 * Math.sin((s * 3 - state.time * 0.22) * Math.PI * 2);
    const turnSide = THREE.MathUtils.lerp(1 - t, t, state.turnMix);
    out.multiplyScalar((0.42 + 0.3 * chase + 0.45 * turnSide * turnSide) * state.level);
    if (state.alertMix > 0.001) {
      const pulse = 0.55 + 0.45 * Math.sin(state.time * 7);
      alertTmp.copy(ALERT).multiplyScalar((0.6 + 0.6 * pulse) * state.level);
      out.lerp(alertTmp, state.alertMix * 0.85);
    }
    return out;
  }

  // LEDs individuais sobre a laje, logo fora das casas.
  const leds = [];
  const count = Math.round((EDGE * 8) / LED_SPACING);
  for (let i = 0; i < count; i++) {
    const s = (i + 0.5) / count;
    const [x, z] = perimeterPoint(EDGE, s);
    leds.push({ x, z, s });
  }
  const dots = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.07, 0.025, 0.07),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    leds.length,
  );
  const matrix = new THREE.Matrix4();
  leds.forEach((led, i) => {
    matrix.makeTranslation(led.x, SLAB_TOP + 0.0125, led.z);
    dots.setMatrixAt(i, matrix);
    dots.setColorAt(i, ledColor(tmp, led.z, led.s));
  });
  group.add(dots);

  // Brilho difuso sob os LEDs, halo suave em volta e filete na lateral da laje.
  const bands = [
    buildBand([
      { h: EDGE - 0.3, y: SLAB_TOP + 0.006, gain: 0 },
      { h: EDGE, y: SLAB_TOP + 0.006, gain: 0.55 },
      { h: EDGE + 0.36, y: SLAB_TOP + 0.006, gain: 0 },
    ]),
    buildBand([
      { h: EDGE - 0.045, y: SLAB_TOP + 0.009, gain: 0.5 },
      { h: EDGE + 0.045, y: SLAB_TOP + 0.009, gain: 0.5 },
    ]),
    buildBand([
      { h: SLAB_EDGE, y: -0.17, gain: 0 },
      { h: SLAB_EDGE, y: -0.22, gain: 1 },
      { h: SLAB_EDGE, y: -0.27, gain: 0 },
    ]),
  ];
  bands.forEach((band) => group.add(band.mesh));

  // Luzes baixas no meio de cada lado: espalham a cor da fita nas bordas.
  const spills = [0.125, 0.375, 0.625, 0.875].map((s) => {
    const [x, z] = perimeterPoint(EDGE - 0.15, s);
    const light = new THREE.PointLight(0xffffff, SPILL_INTENSITY, 5.5, 2);
    light.position.set(x, 0.75, z);
    group.add(light);
    return { light, s, z };
  });

  // Holofote suave sobre o tabuleiro: ilumina as casas sem clarear o cenário
  // e não acompanha o escurecimento do clima.
  const spot = new THREE.SpotLight(0xefe8ff, SPOT_INTENSITY, 0, 0.5, 0.65, 2);
  spot.position.set(0, 12, 0);
  spot.target.position.set(0, 0, 0);
  group.add(spot, spot.target);

  function paint() {
    leds.forEach((led, i) => dots.setColorAt(i, ledColor(tmp, led.z, led.s)));
    dots.instanceColor.needsUpdate = true;

    for (const band of bands) {
      const colors = band.mesh.geometry.attributes.color;
      band.meta.forEach((v, i) => {
        ledColor(tmp, v.z, v.s).multiplyScalar(v.gain);
        colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
      });
      colors.needsUpdate = true;
    }

    for (const spill of spills) ledColor(spill.light.color, spill.z, spill.s);
    spot.intensity = SPOT_INTENSITY * state.level;
  }

  // turn: cor que joga (ganha destaque). check: xeque em andamento.
  function update(dt, { turn = WHITE, check = false } = {}) {
    state.time += dt;
    const ease = (speed) => Math.min(1, dt * speed);
    state.turnMix += ((turn === WHITE ? 0 : 1) - state.turnMix) * ease(3);
    state.alertMix += ((check ? 1 : 0) - state.alertMix) * ease(4);
    paint();
  }

  // Nível geral (1 = normal); a cena de vitória apaga a fita para dar foco.
  function setLevel(value) {
    state.level = THREE.MathUtils.clamp(value, 0, 1);
    paint();
  }

  paint();
  return { group, update, setLevel };
}
