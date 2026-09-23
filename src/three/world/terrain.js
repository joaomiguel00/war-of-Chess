import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObject } from '../animation.js';
import { GROUND_Y } from '../environment.js';

// Terreno de campo de batalha em volta do tabuleiro: terra rachada, manchas
// de queimado, crateras rasas e trincheiras. O tabuleiro afunda um pouco nele
// (a laje vai até y = -0.54 e o chão fica em -0.46), então parece assentado.

export const TERRAIN_Y = -0.46;
const SIZE = 34;
const SEGMENTS = 136;

// Canteiros do cemitério (um por flanco) e posições dos braseiros: o relevo
// fica plano/alto ali para os módulos que moram em cima dele.
export const GRAVE_PLOT = { xMin: 4.85, xMax: 6.35, zMax: 3.9, top: -0.36 };
export const BRAZIER_SPOTS = [
  [5.1, 5.1],
  [-5.1, 5.1],
  [5.1, -5.1],
  [-5.1, -5.1],
];
const TRENCH = { z: 6.6, halfLength: 4.8, width: 0.42, depth: 0.3 };

// PRNG determinístico: o mesmo relevo para quem consulta a altura.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y) {
  return valueNoise(x, y) * 0.55 + valueNoise(x * 2.03, y * 2.03) * 0.3 + valueNoise(x * 4.1, y * 4.1) * 0.15;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function plotMask(x, z) {
  const ax = Math.abs(x);
  const inX = smoothstep(GRAVE_PLOT.xMin - 0.25, GRAVE_PLOT.xMin, ax) * (1 - smoothstep(GRAVE_PLOT.xMax, GRAVE_PLOT.xMax + 0.25, ax));
  const inZ = 1 - smoothstep(GRAVE_PLOT.zMax, GRAVE_PLOT.zMax + 0.25, Math.abs(z));
  return inX * inZ;
}

function placeCraters(random) {
  const craters = [];
  let guard = 0;
  while (craters.length < 11 && guard++ < 600) {
    const angle = random() * Math.PI * 2;
    const r = 5.4 + random() * 6;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const radius = 0.5 + random() * 0.8;
    if (plotMask(x, z) > 0 || (Math.abs(x) > GRAVE_PLOT.xMin - 1 - radius && Math.abs(z) < GRAVE_PLOT.zMax + 0.8)) continue;
    if (BRAZIER_SPOTS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 1.2 + radius)) continue;
    if (Math.abs(Math.abs(z) - TRENCH.z) < 0.7 + radius && Math.abs(x) < TRENCH.halfLength + 0.6) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) < 4.7 + radius) continue;
    if (craters.some((c) => Math.hypot(c.x - x, c.z - z) < c.radius + radius + 0.3)) continue;
    craters.push({ x, z, radius, depth: 0.14 + random() * 0.22 });
  }
  return craters;
}

// Textura de detalhe (repetida): lama seca rachada em células de Voronoi.
function crackedEarthTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = mulberry32(7);
  const cells = Array.from({ length: 26 }, () => [random() * size, random() * size]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      for (const [cx, cy] of cells) {
        // Distância com "embrulho" nas bordas: a textura repete sem emenda.
        const dx = Math.min(Math.abs(x - cx), size - Math.abs(x - cx));
        const dy = Math.min(Math.abs(y - cy), size - Math.abs(y - cy));
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const crack = edge < 1.8 ? 0.55 + edge * 0.1 : edge < 4.5 ? 0.86 + (edge - 1.8) * 0.045 : 1;
      const grain = 0.86 + hash(x * 0.37, y * 0.37) * 0.14 + (valueNoise(x / 24, y / 24) - 0.5) * 0.16;
      const value = Math.max(0, Math.min(255, 228 * crack * grain));
      const i = (y * size + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value * 0.97;
      image.data[i + 2] = value * 0.93;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(SIZE / 1.9, SIZE / 1.9);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Estacas, pedras e lanças quebradas cravadas no chão.
function buildProps(group, heightAt, random, craters) {
  const wood = [];
  const stone = [];
  const iron = [];
  const put = (geometry, position, rotation) => {
    const matrix = new THREE.Matrix4().compose(
      position,
      new THREE.Quaternion().setFromEuler(rotation),
      new THREE.Vector3(1, 1, 1),
    );
    return geometry.applyMatrix4(matrix);
  };

  // Estacas pontiagudas na borda das trincheiras, apontando para o inimigo.
  for (const side of [-1, 1]) {
    for (let x = -TRENCH.halfLength + 0.3; x <= TRENCH.halfLength - 0.2; x += 0.55 + random() * 0.2) {
      const z = side * (TRENCH.z + TRENCH.width + 0.1);
      const length = 0.55 + random() * 0.25;
      const tilt = 0.55 + random() * 0.2;
      const base = new THREE.Vector3(x, heightAt(x, z), z);
      const offset = new THREE.Vector3(0, Math.cos(tilt) * length * 0.5, -side * Math.sin(tilt) * length * 0.5);
      wood.push(put(new THREE.CylinderGeometry(0.012, 0.035, length, 5), base.clone().add(offset), new THREE.Euler(-side * tilt, 0, (random() - 0.5) * 0.2)));
    }
  }

  // Cavalos-de-frisa (troncos cruzados) espalhados.
  for (let i = 0; i < 5; i++) {
    const angle = random() * Math.PI * 2;
    const r = 7.5 + random() * 3.5;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (plotMask(x, z) > 0) continue;
    const y = heightAt(x, z);
    const yaw = random() * Math.PI;
    wood.push(put(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), new THREE.Vector3(x, y + 0.22, z), new THREE.Euler(0, yaw, Math.PI / 2)));
    for (const k of [-0.4, 0, 0.4]) {
      const cx = x + Math.cos(yaw) * k;
      const cz = z - Math.sin(yaw) * k;
      wood.push(put(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 4), new THREE.Vector3(cx, y + 0.22, cz), new THREE.Euler(0.8, yaw, 0)));
      wood.push(put(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 4), new THREE.Vector3(cx, y + 0.22, cz), new THREE.Euler(-0.8, yaw, 0)));
    }
  }

  // Lanças e flechas quebradas cravadas perto das crateras.
  for (const crater of craters) {
    const count = 1 + Math.floor(random() * 3);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const d = crater.radius + 0.2 + random() * 0.5;
      const x = crater.x + Math.cos(angle) * d;
      const z = crater.z + Math.sin(angle) * d;
      if (plotMask(x, z) > 0) continue;
      const length = 0.35 + random() * 0.6;
      const rot = new THREE.Euler((random() - 0.5) * 0.9, random() * Math.PI, (random() - 0.5) * 0.9);
      const up = new THREE.Vector3(0, 1, 0).applyEuler(rot);
      const base = new THREE.Vector3(x, heightAt(x, z) - 0.05, z);
      wood.push(put(new THREE.CylinderGeometry(0.012, 0.012, length, 4), base.clone().addScaledVector(up, length / 2), rot));
      if (random() < 0.5) iron.push(put(new THREE.ConeGeometry(0.025, 0.1, 4), base.clone().addScaledVector(up, length + 0.04), rot));
    }
  }

  // Pedras soltas.
  for (let i = 0; i < 40; i++) {
    const angle = random() * Math.PI * 2;
    const r = 5 + random() * 8.5;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (plotMask(x, z) > 0 || Math.max(Math.abs(x), Math.abs(z)) < 4.8) continue;
    const size = 0.05 + random() * 0.14;
    const rock = new THREE.DodecahedronGeometry(size, 0);
    rock.scale(1, 0.6, 1);
    stone.push(put(rock, new THREE.Vector3(x, heightAt(x, z) + size * 0.2, z), new THREE.Euler(random(), random() * 3, random())));
  }

  const add = (geos, material) => {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(wood, new THREE.MeshLambertMaterial({ color: 0x3d2c1f, flatShading: true }));
  add(stone, new THREE.MeshLambertMaterial({ color: 0x4a4650, flatShading: true }));
  add(iron, new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.4, metalness: 0.8, flatShading: true }));
}

export function createTerrain({ scene, weather }) {
  const group = new THREE.Group();
  group.name = 'Terrain';
  scene.add(group);

  const random = mulberry32(1337);
  const craters = placeCraters(random);

  function heightAt(x, z) {
    const r = Math.hypot(x, z);
    const outer = smoothstep(8.5, 14.5, r);
    let h = TERRAIN_Y + outer * (GROUND_Y - 0.1 - TERRAIN_Y);
    h += (fbm(x * 0.35 + 3, z * 0.35) - 0.5) * (0.07 + outer * 0.5) + (fbm(x * 1.4, z * 1.4) - 0.5) * 0.025;

    const plot = plotMask(x, z);
    if (plot > 0) h += (GRAVE_PLOT.top - h) * plot + (fbm(x * 3, z * 3) - 0.5) * 0.02 * plot;

    const trenchX = 1 - smoothstep(TRENCH.halfLength - 0.4, TRENCH.halfLength, Math.abs(x));
    const dz = Math.abs(z) - TRENCH.z;
    h -= TRENCH.depth * Math.exp(-(dz * dz) / (TRENCH.width * TRENCH.width)) * trenchX;
    h += 0.06 * Math.exp(-((dz - TRENCH.width * 1.6) ** 2) / 0.04) * trenchX;

    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.radius) h -= c.depth * (1 - (d / c.radius) ** 2);
      h += c.depth * 0.32 * Math.exp(-(((d - c.radius) / (0.28 * c.radius)) ** 2));
    }
    return h;
  }

  // Quanto de "cratera" existe no ponto (usado para queimar o fundo).
  function craterAt(x, z) {
    let k = 0;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.radius * 1.1) k = Math.max(k, 1 - d / (c.radius * 1.1));
    }
    return k;
  }

  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heightAt(position.getX(i), position.getZ(i)));
  }
  geometry.computeVertexNormals();

  const earth = new THREE.Color(0x5a4636).multiply(new THREE.Color(weather.terrainTint).multiplyScalar(1.05));
  const burn = new THREE.Color(0x1d1813);
  const wet = new THREE.Color(0x2a2520);
  const soil = new THREE.Color(0x3a2b21).multiply(new THREE.Color(weather.terrainTint).multiplyScalar(1.15));
  const snowColor = new THREE.Color(0xdde2f0);
  const edge = new THREE.Color(weather.ground);
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const r = Math.hypot(x, z);
    c.copy(earth).multiplyScalar(0.82 + fbm(x * 0.8, z * 0.8) * 0.36);

    // Queimados antigos, anteriores à partida.
    const scorch = smoothstep(0.64, 0.74, fbm(x * 0.55 + 11, z * 0.55 - 4));
    c.lerp(burn, scorch * 0.7);
    c.lerp(burn, craterAt(x, z) * 0.85);

    const dz = Math.abs(z) - TRENCH.z;
    c.lerp(wet, Math.exp(-(dz * dz) / 0.12) * (1 - smoothstep(TRENCH.halfLength - 0.4, TRENCH.halfLength, Math.abs(x))) * 0.8);
    c.lerp(soil, plotMask(x, z) * 0.85);

    // Terra pisoteada em volta da laje.
    const board = Math.max(Math.abs(x), Math.abs(z));
    c.multiplyScalar(1 - 0.25 * (1 - smoothstep(4.6, 5.6, board)));

    if (weather.snowCover > 0) {
      const patch = smoothstep(0.38, 0.7, fbm(x * 0.6 - 7, z * 0.6 + 2)) * normal.getY(i) ** 4;
      c.lerp(snowColor, weather.snowCover * patch * (1 - craterAt(x, z)));
    }

    c.lerp(edge, smoothstep(11.5, 15, r));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const detail = crackedEarthTexture();
  // Chão fosco: Lambert basta e custa bem menos por pixel que o PBR — e o
  // terreno cobre boa parte da tela.
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  group.add(mesh);

  buildProps(group, heightAt, random, craters);

  function dispose() {
    detail.dispose();
    disposeObject(group);
  }

  return { group, heightAt, craters, dispose };
}
