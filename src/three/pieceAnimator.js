import * as THREE from 'three';
import { animate, easeInOut } from './animation.js';

// Caminhada procedural para peças .glb. Modelos com pernas nomeadas ganham
// passos de verdade (pernas, braços, balanço, inclinação); modelos de malha
// única que também devem andar recebem um "bamboleio" só do corpo. Peças sem
// rig continuam deslizando (quem chama cuida do fallback).
export const PART_NAMES = {
  legs: { L: ['Leg_L'], R: ['Leg_R'] },
  // Partes que acompanham a perna / o braço do mesmo lado.
  legFollowers: { L: ['Foot_L', 'Greave_L'], R: ['Foot_R', 'Greave_R'] },
  arms: { L: ['Arm_L', 'Arm_L_Bent'], R: ['Arm_R', 'Arm_R_Bent'] },
  armFollowers: { L: ['Hand_L', 'Cuff_L'], R: ['Hand_R', 'Cuff_R'] },
  shoulders: { L: ['Shoulder_L'], R: ['Shoulder_R'] },
  // Itens segurados: nome exato ou prefixo ("Sword" pega Sword_Blade, Sword_Guard...).
  held: {
    L: ['Holy_Orb', 'Golden_Orb', 'Orb', 'Shield'],
    R: ['Staff', 'Scepter', 'Sword', 'Weapon'],
  },
};

// Amplitudes padrão (sobrescrevíveis por modelo).
const LIMB_TUNING = { legSwing: 0.55, armSwing: 0.32, lean: 0.12, bob: 0.035, roll: 0.035 };
// Sem pernas: o corpo balança de um lado para o outro e dá um pulinho por passo.
const WADDLE_TUNING = { lean: 0.1, bob: 0.05, roll: 0.15 };

const WALK = {
  stride: 0.75, // distância no tabuleiro por passo (1 casa = 1)
  baseMs: 260,
  msPerUnit: 190,
  minMs: 380,
  maxMs: 1700,
  settleMs: 170,
};

// corpo -> rig. WeakMap em vez de userData: userData é copiado via JSON.
const rigs = new WeakMap();

function findAll(root, names) {
  return names.map((name) => findByNames(root, [name])).filter(Boolean);
}

// Itens segurados pelo nome exato ou por prefixo "Nome_".
function findHeld(root, names) {
  const found = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (names.some((name) => obj.name === name || obj.name.startsWith(`${name}_`))) found.push(obj);
  });
  return found;
}

function findByNames(root, names) {
  for (const name of names) {
    const obj = root.getObjectByName(name);
    if (obj) return obj;
  }
  // O GLTFLoader guarda o nome original em userData.name caso precise renomear.
  let found = null;
  root.traverse((obj) => {
    if (!found && names.includes(obj.userData?.name)) found = obj;
  });
  return found;
}

function topCenter(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
}

function centerOf(obj) {
  return new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
}

// As partes vêm com a origem no pé do modelo; para girar um membro na junta
// (quadril, ombro) ele é pendurado num pivô posicionado ali. attach() mantém
// a posição visual de cada parte.
function makePivot(part, joint, followers) {
  const parent = part.parent;
  const pivot = new THREE.Group();
  pivot.name = `${part.name}_Pivot`;
  parent.add(pivot);
  pivot.position.copy(parent.worldToLocal(joint.clone()));
  pivot.updateMatrixWorld(true);
  pivot.attach(part);
  for (const follower of followers) {
    if (follower && follower !== part && !pivot.getObjectById(follower.id)) pivot.attach(follower);
  }
  return pivot;
}

// model: raiz do glTF (ainda sem pai). body: nó que recebe giro, inclinação e
// balanço do corpo inteiro. tuning: amplitudes próprias do modelo.
// Com pernas nomeadas monta os membros; sem elas, o rig só bamboleia o corpo.
export function rigWalker(model, body, tuning = {}) {
  const legL = findByNames(model, PART_NAMES.legs.L);
  const legR = findByNames(model, PART_NAMES.legs.R);
  const hasLegs = !!(legL && legR);

  const rig = { body, legL: null, legR: null, armL: null, armR: null, waddle: !hasLegs };

  if (hasLegs) {
    model.updateMatrixWorld(true);
    const buildSide = (side) => {
      const leg = side === 'L' ? legL : legR;
      const legPivot = makePivot(leg, topCenter(leg), findAll(model, PART_NAMES.legFollowers[side]));

      const arm = findByNames(model, PART_NAMES.arms[side]);
      if (!arm) return { leg: legPivot, arm: null };

      const shoulder = findByNames(model, PART_NAMES.shoulders[side]);
      const followers = [
        ...findAll(model, PART_NAMES.armFollowers[side]),
        ...findHeld(model, PART_NAMES.held[side]),
      ];
      const armPivot = makePivot(arm, shoulder ? centerOf(shoulder) : topCenter(arm), followers);
      return { leg: legPivot, arm: armPivot };
    };
    const left = buildSide('L');
    const right = buildSide('R');
    Object.assign(rig, { legL: left.leg, legR: right.leg, armL: left.arm, armR: right.arm });
  }

  rig.tuning = { ...LIMB_TUNING, ...(hasLegs ? {} : WADDLE_TUNING), ...tuning };
  // Giro (Y) primeiro, inclinação (X) depois: a peça se inclina para onde anda.
  body.rotation.order = 'YXZ';
  rigs.set(body, rig);
  return rig;
}

function findRig(piece) {
  let found = null;
  piece.traverse((obj) => {
    if (!found && rigs.has(obj)) found = rigs.get(obj);
  });
  return found;
}

export function hasWalkRig(piece) {
  return !!findRig(piece);
}

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Pose da caminhada. t: tempo normalizado; p: progresso (com easing) ao longo
// do trajeto — a fase dos passos segue p, então o passo acompanha a velocidade.
function applyPose(rig, { t, p, steps, yaw }) {
  const envelope = smoothstep(0, 0.16, t) * (1 - smoothstep(0.78, 1, t));
  const turn = smoothstep(0, 0.16, t) * (1 - smoothstep(0.84, 1, t));
  const phase = steps * Math.PI * p;
  const swing = Math.sin(phase) * envelope;
  const tune = rig.tuning;

  // Pernas alternadas; braços opostos às pernas, como num andar natural.
  if (rig.legL) rig.legL.rotation.x = -swing * tune.legSwing;
  if (rig.legR) rig.legR.rotation.x = swing * tune.legSwing;
  if (rig.armL) rig.armL.rotation.x = swing * tune.armSwing;
  if (rig.armR) rig.armR.rotation.x = -swing * tune.armSwing;

  // Corpo: vira para a direção do trajeto, inclina para a frente, pende para o
  // lado do pé de apoio e balança — mais alto com as pernas retas e mais
  // baixo no impacto do pé.
  rig.body.rotation.y = yaw * turn;
  rig.body.rotation.x = tune.lean * envelope;
  rig.body.rotation.z = swing * tune.roll;
  rig.body.position.y = Math.abs(Math.cos(phase)) * tune.bob * envelope;
}

export function resetPose(rig) {
  for (const limb of [rig.legL, rig.legR, rig.armL, rig.armR]) if (limb) limb.rotation.x = 0;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.y = 0;
}

// Leva membros e corpo de volta à pose de descanso por interpolação.
function settle(rig) {
  const limbs = [rig.legL, rig.legR, rig.armL, rig.armR].filter(Boolean);
  const from = limbs.map((limb) => limb.rotation.x);
  const body = {
    yaw: rig.body.rotation.y,
    lean: rig.body.rotation.x,
    roll: rig.body.rotation.z,
    bob: rig.body.position.y,
  };
  const residual = Math.max(0, ...from.map(Math.abs), ...Object.values(body).map(Math.abs));
  if (residual < 1e-3) {
    resetPose(rig);
    return Promise.resolve();
  }
  return animate(WALK.settleMs, (t) => {
    const k = 1 - easeInOut(t);
    limbs.forEach((limb, i) => {
      limb.rotation.x = from[i] * k;
    });
    rig.body.rotation.y = body.yaw * k;
    rig.body.rotation.x = body.lean * k;
    rig.body.rotation.z = body.roll * k;
    rig.body.position.y = body.bob * k;
  }).then(() => resetPose(rig));
}

// Leva a peça até `target` caminhando. Mais casas = mais passos e mais tempo.
// Devolve null quando a peça não tem as partes nomeadas: quem chama desliza.
export function walkTo(piece, target) {
  const rig = findRig(piece);
  if (!rig) return null;

  const start = piece.position.clone();
  const dx = target.x - start.x;
  const dz = target.z - start.z;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.round(distance / WALK.stride));
  const duration = THREE.MathUtils.clamp(
    WALK.baseMs + distance * WALK.msPerUnit,
    WALK.minMs,
    WALK.maxMs,
  );
  // A frente do modelo é +Z; a peça preta já está girada 180° no invólucro.
  const yaw = distance > 1e-4 ? wrapAngle(Math.atan2(dx, dz) - piece.rotation.y) : 0;

  return animate(duration, (t) => {
    const p = easeInOut(t);
    piece.position.set(start.x + dx * p, start.y * (1 - p), start.z + dz * p);
    applyPose(rig, { t, p, steps, yaw });
  }).then(() => {
    piece.position.set(target.x, 0, target.z);
    return settle(rig);
  });
}
