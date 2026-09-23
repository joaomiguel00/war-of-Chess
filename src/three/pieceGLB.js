import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WHITE } from '../chess/moveGen.js';
import { PAWN_GLB_BASE64 } from './pawnData.js';
import { BISHOP_GLB_BASE64 } from './bishopData.js';
import { QUEEN_GLB_BASE64 } from './queenData.js';
import { KING_GLB_BASE64 } from './kingData.js';
import { rigWalker } from './pieceAnimator.js';

// Modelos .glb embutidos em base64 (o host de artifact não serve .glb).
// Cada um é carregado uma vez e clonado por peça. `scale` leva as unidades do
// modelo para o espaço da peça (antes do PIECE_SCALE aplicado depois).

const RUIN_TINT = 0x4a4658;
const RUIN_STONE = 0x1b1922;
const RUIN_GLOW = 0xd946ef;

// Modelo texturizado: a Ruína recebe um tom escuro que multiplica a textura.
function tintRecolor(material) {
  if (material.color) material.color.setHex(RUIN_TINT);
}

// Modelo com materiais nomeados: o brilho sagrado vira a energia magenta da
// Ruína, o ouro fica mais fosco e as partes claras viram obsidiana.
function namedRecolor(material) {
  const name = material.name || '';
  const glowing = material.emissive && material.emissive.getHex() !== 0;
  if (glowing || /emissive/i.test(name)) {
    material.color.setHex(RUIN_GLOW);
    material.emissive?.setHex(RUIN_GLOW);
    return;
  }
  if (/gold/i.test(name)) {
    material.color.multiplyScalar(0.7);
    return;
  }
  if (/face|feet|dark/i.test(name)) return;
  material.color.setHex(RUIN_STONE);
  material.metalness = Math.min(material.metalness ?? 0.3, 0.25);
  material.roughness = Math.max(material.roughness ?? 0.5, 0.7);
}

// Junta partes soltas num grupo marcado (userData.part), que o combate usa:
// o cajado do bispo solta o feixe e se parte; a coroa da rainha cai e rola.
function groupParts(model, { name, part, test }) {
  const members = [];
  model.traverse((obj) => {
    if (obj.isMesh && test(obj.name)) members.push(obj);
  });
  if (!members.length) return;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  members.forEach((member) => box.expandByObject(member));
  const parent = members[0].parent;
  const group = new THREE.Group();
  group.name = name;
  group.userData.part = part;
  parent.add(group);
  group.position.copy(parent.worldToLocal(box.getCenter(new THREE.Vector3())));
  group.updateMatrixWorld(true);
  members.forEach((member) => group.attach(member));
}

const tagStaff = (model) =>
  groupParts(model, { name: 'Staff_Group', part: 'staff', test: (n) => n === 'Staff' || n === 'Staff_Gem' });
const tagCrown = (model) =>
  groupParts(model, { name: 'Crown_Group', part: 'crown', test: (n) => /^Crown_(Ring|Spike_\d+)$/.test(n) });

// Bispo, rainha e rei vêm do mesmo sistema de unidades: uma escala só mantém
// as proporções que o autor desenhou (rei > rainha > bispo).
const CHIBI_SCALE = 1.28 / 1.59;

// `walk`: a peça dá passos ao se mover (amplitudes próprias opcionais).
const MODELS = {
  // Peão boneco: malha única texturizada, exportado em Z-up. Sem pernas
  // separadas, anda bamboleando o corpo.
  p: { data: PAWN_GLB_BASE64, scale: 0.94 / 1.282, zUp: true, recolor: tintRecolor, walk: {} },
  // Bispo chibi: pernas, braços e cajado nomeados.
  b: { data: BISHOP_GLB_BASE64, scale: CHIBI_SCALE, flat: true, recolor: namedRecolor, setup: tagStaff, walk: {} },
  // Rainha chibi: o braço do cetro vai erguido, então balança menos.
  q: {
    data: QUEEN_GLB_BASE64,
    scale: CHIBI_SCALE,
    flat: true,
    recolor: namedRecolor,
    setup: tagCrown,
    walk: { armSwing: 0.18 },
  },
  // Rei chibi: modelado olhando para -Z; o giro de 180° o põe de frente (+Z).
  k: {
    data: KING_GLB_BASE64,
    scale: CHIBI_SCALE,
    yaw: Math.PI,
    flat: true,
    recolor: namedRecolor,
    walk: { armSwing: 0.2 },
  },
};

const templates = new Map();
let loading = null;

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function parseModel(type, cfg) {
  return new Promise((resolve) => {
    try {
      new GLTFLoader().parse(
        base64ToArrayBuffer(cfg.data),
        '',
        (gltf) => {
          templates.set(type, gltf.scene);
          resolve();
        },
        (err) => {
          console.warn(`[glb] modelo "${type}" não carregou; usando o procedural.`, err);
          resolve();
        },
      );
    } catch (err) {
      console.warn(`[glb] modelo "${type}" não carregou; usando o procedural.`, err);
      resolve();
    }
  });
}

export function preloadPieceModels() {
  if (!loading) {
    loading = Promise.all(Object.entries(MODELS).map(([type, cfg]) => parseModel(type, cfg)));
  }
  return loading;
}

export function hasPieceModel(type) {
  return templates.has(type);
}

// Hierarquia devolvida: invólucro (recebe o PIECE_SCALE e a animação ociosa)
// > corpo (caminhada: giro, inclinação, balanço) > escala/orientação > glTF.
export function makePieceFromGLB(type, color) {
  const cfg = MODELS[type];
  const template = templates.get(type);
  if (!cfg || !template) return null;

  const isOrder = color === WHITE;
  const model = template.clone(true);

  model.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    // Materiais próprios por peça (combate e esmaecimento mexem na opacidade).
    const source = Array.isArray(obj.material) ? obj.material : [obj.material];
    const cloned = source.map((m) => {
      const mat = m.clone();
      if (cfg.flat) mat.flatShading = true;
      if (!isOrder) cfg.recolor(mat);
      return mat;
    });
    obj.material = cloned.length === 1 ? cloned[0] : cloned;
  });

  const body = new THREE.Group();
  body.name = 'Body';
  // Montado com o glTF ainda sem pai, para as juntas saírem no espaço do modelo.
  if (cfg.walk) rigWalker(model, body, cfg.walk);
  cfg.setup?.(model);

  const oriented = new THREE.Group();
  if (cfg.zUp) oriented.rotation.x = -Math.PI / 2;
  if (cfg.yaw) oriented.rotation.y = cfg.yaw;
  oriented.scale.setScalar(cfg.scale);
  oriented.add(model);
  body.add(oriented);

  const wrapper = new THREE.Group();
  wrapper.add(body);
  return wrapper;
}
