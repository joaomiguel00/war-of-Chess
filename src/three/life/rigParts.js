import * as THREE from 'three';

// Pivôs extras montados nos modelos .glb, usando os nomes de partes
// padronizados: a cabeça (Head e tudo que vai preso a ela) gira no pescoço,
// e a arma segurada vira um grupo único que pode girar ou ser largada.
// Peças sem essas partes simplesmente não ganham os pivôs.

const HEAD_PART =
  /^(Head|Hood|Hood_Tip|Face_Opening|Face_Lower_Rim|Hair_Base|Hair_Lock_[LR]|Beard|Crown_(Ring|Gem|Spike_\d+|Bead_\d+))$/;
const WEAPON_PART = /^(Sword_(Blade|Guard|Grip|Pommel)|Scepter|Scepter_Gem|Scepter_Collar)$/;

function byName(root, name) {
  let found = null;
  root.traverse((obj) => {
    if (!found && (obj.name === name || obj.userData?.name === name)) found = obj;
  });
  return found;
}

// model: raiz do glTF ainda sem pai (espaço do modelo = espaço do mundo).
// yawFlipped: o modelo foi girado 180° (rei), então o aceno inverte o sinal.
export function rigHead(model, { yawFlipped = false } = {}) {
  const head = byName(model, 'Head');
  if (!head) return null;
  model.updateMatrixWorld(true);

  const members = new Set();
  model.traverse((obj) => {
    if (!obj.isMesh || !HEAD_PART.test(obj.name)) return;
    // A coroa da rainha já foi agrupada (userData.part = 'crown').
    members.add(obj.parent?.userData?.part === 'crown' ? obj.parent : obj);
  });

  const headBox = new THREE.Box3().setFromObject(head);
  const neck = byName(model, 'Neck');
  const jointY = neck ? new THREE.Box3().setFromObject(neck).max.y : headBox.min.y;
  const center = headBox.getCenter(new THREE.Vector3());
  const joint = new THREE.Vector3(center.x, jointY, center.z);

  const parent = head.parent;
  const pivot = new THREE.Group();
  pivot.name = 'Head_Pivot';
  parent.add(pivot);
  pivot.position.copy(parent.worldToLocal(joint.clone()));
  pivot.updateMatrixWorld(true);
  for (const member of members) pivot.attach(member);

  pivot.userData.headPivot = true;
  pivot.userData.pitchSign = yawFlipped ? -1 : 1;
  // Altura da boca/frente do rosto, para a respiração no frio.
  pivot.userData.faceHeight = (headBox.max.y - jointY) * 0.45;
  return pivot;
}

// Agrupa a arma segurada (espada do rei, cetro da rainha) num nó só,
// centrado nela. O cajado do bispo já vem agrupado (part = 'staff').
export function rigWeapon(model) {
  model.updateMatrixWorld(true);
  const staff = (() => {
    let found = null;
    model.traverse((obj) => {
      if (!found && obj.userData?.part === 'staff') found = obj;
    });
    return found;
  })();
  if (staff) {
    staff.userData.weapon = true;
    return staff;
  }

  const members = [];
  model.traverse((obj) => {
    if (obj.isMesh && WEAPON_PART.test(obj.name)) members.push(obj);
  });
  if (!members.length) return null;

  const box = new THREE.Box3();
  members.forEach((m) => box.expandByObject(m));
  const parent = members[0].parent;
  const group = new THREE.Group();
  group.name = 'Weapon_Group';
  parent.add(group);
  group.position.copy(parent.worldToLocal(box.getCenter(new THREE.Vector3())));
  group.updateMatrixWorld(true);
  members.forEach((m) => group.attach(m));
  group.userData.weapon = true;
  return group;
}

// Busca (uma vez por peça) os pivôs montados acima.
const cache = new WeakMap();
export function pieceParts(piece) {
  let parts = cache.get(piece);
  if (parts) return parts;
  parts = { head: null, weapon: null };
  piece.traverse((obj) => {
    if (!parts.head && obj.userData?.headPivot) parts.head = obj;
    if (!parts.weapon && obj.userData?.weapon) parts.weapon = obj;
  });
  cache.set(piece, parts);
  return parts;
}
