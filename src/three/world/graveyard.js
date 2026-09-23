import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WHITE } from '../../chess/moveGen.js';
import { createPieceMesh } from '../pieceModels.js';
import { animate, easeIn, easeOut, forEachMaterial, disposeObject } from '../animation.js';
import { dustPuff } from '../fx.js';
import { GRAVE_PLOT } from './terrain.js';
import { drawFlag, createFlagTexture, FLAG_COLOR } from './bannerCloth.js';

// Cemitério de peças capturadas: um canteiro em cada flanco do tabuleiro
// (Ordem à esquerda de quem joga de brancas, Ruína à direita). Cada baixa
// cai numa cova rasa, tombada e meio torta, com uma lápide ao lado — a área
// vai se enchendo ao longo da partida como um registro das perdas.

const SIDE_X = { [WHITE]: -(GRAVE_PLOT.xMin + GRAVE_PLOT.xMax) / 2, b: (GRAVE_PLOT.xMin + GRAVE_PLOT.xMax) / 2 };
const ROWS = 8;
const COLUMN_OFFSET = 0.36;
const PIECE_SCALE = 0.62;

// Casas do canteiro, das centrais para as pontas.
function buildSlots(color) {
  const x = SIDE_X[color];
  const slots = [];
  for (let row = 0; row < ROWS; row++) {
    const z = -3.3 + (row / (ROWS - 1)) * 6.6;
    for (const col of [-1, 1]) slots.push({ x: x + col * COLUMN_OFFSET * Math.sign(x), z });
  }
  // A coluna de dentro enche primeiro; dentro dela, do centro para fora.
  return slots.sort((a, b) => Math.abs(a.x) - Math.abs(b.x) || Math.abs(a.z) - Math.abs(b.z));
}

function tombstoneGeometry() {
  const shape = new THREE.Shape();
  const w = 0.11;
  const h = 0.2;
  shape.moveTo(-w, 0);
  shape.lineTo(-w, h);
  shape.absarc(0, h, w, Math.PI, 0, true);
  shape.lineTo(w, 0);
  shape.lineTo(-w, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -0.025);
  return geometry;
}

// Mastros baixos e cordas marcando cada canteiro (tudo num mesh por material).
function buildFences(group, heightAt) {
  const posts = [];
  const ropes = [];
  for (const color of [WHITE, 'b']) {
    const outer = SIDE_X[color] + Math.sign(SIDE_X[color]) * 0.78;
    let previous = null;
    for (let z = -GRAVE_PLOT.zMax + 0.1; z <= GRAVE_PLOT.zMax; z += 0.95) {
      const y = heightAt(outer, z);
      const post = new THREE.CylinderGeometry(0.03, 0.04, 0.45, 5);
      post.rotateZ((Math.random() - 0.5) * 0.15);
      post.translate(outer, y + 0.2, z);
      posts.push(post);
      if (previous) {
        const line = new THREE.CylinderGeometry(0.008, 0.008, z - previous.z, 3);
        line.rotateX(Math.PI / 2);
        line.translate(outer, (y + previous.y) / 2 + 0.3, (z + previous.z) / 2);
        ropes.push(line);
      }
      previous = { z, y };
    }
  }
  const postMesh = new THREE.Mesh(mergeGeometries(posts, false), new THREE.MeshLambertMaterial({ color: 0x3a2a1e, flatShading: true }));
  postMesh.castShadow = true;
  group.add(postMesh, new THREE.Mesh(mergeGeometries(ropes, false), new THREE.MeshLambertMaterial({ color: 0x6b5a44 })));
  [...posts, ...ropes].forEach((g) => g.dispose());
}

// Peça morta: cores apagadas e brilho quase extinto.
function deaden(mesh) {
  forEachMaterial(mesh, (m) => {
    if (m.color) m.color.multiplyScalar(0.62);
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity *= 0.25;
  });
}

// Estandarte fincado na ponta de cada canteiro, com o emblema do exército.
function buildStandards(group, heightAt) {
  const standards = {};
  const wood = new THREE.MeshLambertMaterial({ color: 0x2e2118, flatShading: true });
  for (const color of [WHITE, 'b']) {
    const x = SIDE_X[color] + Math.sign(SIDE_X[color]) * 0.95;
    const z = color === WHITE ? -GRAVE_PLOT.zMax + 0.2 : GRAVE_PLOT.zMax - 0.2;
    const y = heightAt(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.1, 6), wood);
    pole.position.set(x, y + 1.02, z);
    pole.castShadow = true;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(x, y + 1.95, z);
    const flag = createFlagTexture(160, 220);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.98, 4, 6),
      new THREE.MeshLambertMaterial({ map: flag.texture, side: THREE.DoubleSide }),
    );
    cloth.geometry.translate(0, -0.49, 0);
    cloth.position.set(x, y + 1.94, z);
    // O pano fica de frente para o tabuleiro.
    cloth.rotation.y = Math.PI / 2;
    cloth.castShadow = true;
    group.add(pole, bar, cloth);
    standards[color] = { ...flag, cloth, base: cloth.geometry.attributes.position.array.slice() };
  }
  return standards;
}

export function createGraveyard({ scene, heightAt, emblems = {} }) {
  const group = new THREE.Group();
  group.name = 'Graveyard';
  scene.add(group);
  buildFences(group, heightAt);
  const standards = buildStandards(group, heightAt);

  function setEmblems(next) {
    for (const color of [WHITE, 'b']) {
      drawFlag(standards[color].canvas, FLAG_COLOR[color], next[color]);
      standards[color].texture.needsUpdate = true;
    }
  }
  setEmblems({ w: emblems.w ?? 'aguia', b: emblems.b ?? 'lobo' });

  let elapsed = 0;
  // O estandarte balança devagar, mais forte com vento.
  function update(dt, wind = 0.3) {
    elapsed += dt;
    for (const s of Object.values(standards)) {
      const array = s.cloth.geometry.attributes.position.array;
      for (let i = 0; i < array.length; i += 3) {
        const drop = -s.base[i + 1] / 0.98;
        array[i + 2] = s.base[i + 2] + Math.sin(elapsed * (1.6 + wind * 2) + s.base[i + 1] * 3) * 0.06 * (0.4 + wind) * drop;
      }
      s.cloth.geometry.attributes.position.needsUpdate = true;
    }
  }

  const graves = new THREE.Group();
  group.add(graves);
  const fx = new THREE.Group();
  group.add(fx);

  const stoneGeometry = tombstoneGeometry();
  const stones = {
    [WHITE]: new THREE.MeshLambertMaterial({ color: 0x77736e, flatShading: true }),
    b: new THREE.MeshLambertMaterial({ color: 0x2c2933, flatShading: true }),
  };
  const markMaterial = {
    [WHITE]: new THREE.MeshBasicMaterial({ color: 0xff9a44, toneMapped: false }),
    b: new THREE.MeshBasicMaterial({ color: 0xd946ef, toneMapped: false }),
  };
  const moundMaterial = new THREE.MeshLambertMaterial({ color: 0x2b2019, flatShading: true });

  const slots = { [WHITE]: buildSlots(WHITE), b: buildSlots('b') };
  const used = { [WHITE]: 0, b: 0 };

  // Enterra uma baixa: a peça cai tombada na cova e a lápide brota ao lado.
  function bury({ type, color, animated = true }) {
    const list = slots[color] ?? slots.b;
    const index = used[color] ?? 0;
    used[color] = index + 1;
    const slot = list[index % list.length];
    // Depois de lotar, as novas vão por cima, um pouco deslocadas.
    const layer = Math.floor(index / list.length);
    const x = slot.x + (Math.random() - 0.5) * 0.1;
    const z = slot.z + (Math.random() - 0.5) * 0.12 + layer * 0.15;
    const ground = heightAt(x, z);

    const grave = new THREE.Group();
    graves.add(grave);

    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), moundMaterial);
    mound.scale.set(1.1, 0.22, 0.75);
    mound.position.set(x, ground - 0.01, z);
    mound.rotation.y = Math.random() * Math.PI;
    mound.receiveShadow = true;
    grave.add(mound);

    // Lápide encostada do lado de dentro, levemente torta.
    const stone = new THREE.Group();
    const slab = new THREE.Mesh(stoneGeometry, stones[color] ?? stones.b);
    slab.castShadow = true;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.01), markMaterial[color] ?? markMaterial.b);
    cross.position.set(0, 0.2, 0.04);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.01), markMaterial[color] ?? markMaterial.b);
    bar.position.set(0, 0.22, 0.04);
    stone.add(slab, cross, bar);
    const inward = -Math.sign(x);
    const sx = x + inward * 0.2;
    stone.position.set(sx, heightAt(sx, z) - 0.02, z);
    stone.rotation.set((Math.random() - 0.5) * 0.25, inward > 0 ? Math.PI / 2 : -Math.PI / 2, (Math.random() - 0.5) * 0.3);
    grave.add(stone);
    grave.userData.own = [mound.geometry, cross.geometry, bar.geometry];

    // A peça, tombada em ângulo aleatório.
    const piece = createPieceMesh(type, color);
    deaden(piece);
    piece.scale.setScalar(PIECE_SCALE);
    // Tomba ao longo do canteiro (eixo Z), nunca por cima do tabuleiro.
    const lean = (Math.random() - 0.5) * 0.9;
    const tipAxis = new THREE.Vector3(Math.cos(lean), 0, Math.sin(lean)).multiplyScalar(Math.random() < 0.5 ? 1 : -1);
    const tip = Math.random() < 0.25 ? 0.5 + Math.random() * 0.4 : 1.25 + Math.random() * 0.3;
    const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
    const fallen = new THREE.Quaternion().setFromAxisAngle(tipAxis, tip).multiply(upright);

    piece.quaternion.copy(fallen);
    piece.position.set(0, 0, 0);
    piece.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(piece);
    const restY = ground - box.min.y - 0.03;
    piece.position.set(x, restY, z);
    grave.add(piece);

    if (!animated) return Promise.resolve();

    // Chegada: lápide brota, a peça cai tombando e levanta poeira.
    stone.scale.set(1, 0.01, 1);
    mound.scale.y = 0.01;
    piece.quaternion.copy(upright);
    piece.position.y = restY + 1.2;
    return Promise.all([
      animate(380, (t) => {
        const e = easeOut(t);
        stone.scale.set(1, Math.max(0.01, e), 1);
        mound.scale.y = 0.22 * Math.max(0.05, e);
      }),
      animate(480, (t) => {
        const e = easeIn(t);
        piece.quaternion.slerpQuaternions(upright, fallen, e);
        piece.position.y = restY + 1.2 * (1 - e);
      }).then(() => dustPuff(fx, new THREE.Vector3(x, ground, z), { count: 5, spread: 0.2, duration: 600 })),
    ]);
  }

  function clear() {
    // Só as geometrias próprias de cada cova: as das peças são compartilhadas
    // com os modelos-base e a lápide é uma só para todas.
    while (graves.children.length) {
      const grave = graves.children[0];
      grave.userData.own?.forEach((geometry) => geometry.dispose());
      graves.remove(grave);
    }
    used[WHITE] = 0;
    used.b = 0;
  }

  function dispose() {
    clear();
    Object.values(standards).forEach((s) => s.texture.dispose());
    stoneGeometry.dispose();
    Object.values(stones).forEach((m) => m.dispose());
    Object.values(markMaterial).forEach((m) => m.dispose());
    moundMaterial.dispose();
    disposeObject(group);
  }

  return { group, bury, clear, update, setEmblems, dispose, count: () => used[WHITE] + used.b };
}
