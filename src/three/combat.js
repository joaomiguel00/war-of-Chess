import * as THREE from 'three';
import { WHITE } from '../chess/moveGen.js';
import { walkTo } from './pieceAnimator.js';
import {
  animate,
  wait,
  easeIn,
  easeOut,
  easeInOut,
  fadeOut,
  findPart,
  horizontalDir,
  reparentKeepingWorld,
  tipQuaternion,
  disposeObject,
} from './animation.js';

export const GLOW_COLOR = { [WHITE]: 0xff8c33, b: 0xd946ef };

// Peso do impacto por tipo de peça destruída: peças maiores geram um golpe
// mais forte (clarão maior, mais faíscas e mais tremor).
const IMPACT_POWER = { p: 0.65, n: 1, b: 0.9, r: 1.35, q: 1.25, k: 1.6 };

/* ------------------------------------------------------------ efeitos */

function setXZ(mesh, from, to, t) {
  mesh.position.x = from.x + (to.x - from.x) * t;
  mesh.position.z = from.z + (to.z - from.z) * t;
}

// Anel de choque rente ao chão, que se abre e some.
function shockRing(fx, position, color, { radius = 0.85, duration = 520 } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.26, 20), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, 0.03, position.z);
  fx.add(ring);

  animate(duration, (t) => {
    const scale = 1 + easeOut(t) * radius * 3;
    ring.scale.set(scale, scale, scale);
    material.opacity = 0.55 * (1 - t);
  }).then(() => disposeObject(ring));
}

// Baforada de poeira: bolhas claras que sobem e se dissipam.
function dustPuff(fx, position, { count = 7, spread = 0.3, duration = 750 } = {}) {
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x8a8175,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + Math.random() * 0.07, 0), material);
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spread;
    puff.position.set(
      position.x + Math.cos(angle) * distance,
      0.06 + Math.random() * 0.1,
      position.z + Math.sin(angle) * distance,
    );
    fx.add(puff);
    puffs.push({
      puff,
      material,
      drift: new THREE.Vector3(Math.cos(angle) * 0.35, 0.3 + Math.random() * 0.25, Math.sin(angle) * 0.35),
    });
  }

  animate(duration, (t) => {
    for (const entry of puffs) {
      const e = easeOut(t);
      entry.puff.position.x += entry.drift.x * 0.006;
      entry.puff.position.y += entry.drift.y * 0.006;
      entry.puff.position.z += entry.drift.z * 0.006;
      entry.puff.scale.setScalar(1 + e * 1.6);
      entry.material.opacity = 0.3 * (1 - t);
    }
  }).then(() => puffs.forEach((entry) => disposeObject(entry.puff)));
}

// Feixe de energia entre dois pontos (ataque do bispo).
function energyBeam(fx, start, end, color) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), material);
  beam.position.copy(start).addScaledVector(direction, 0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  beam.scale.set(0.001, length, 0.001);
  fx.add(beam);

  return {
    grow: (t) => {
      const width = 0.02 + easeOut(t) * 0.055;
      beam.scale.set(width, length, width);
    },
    fade: (t) => {
      material.opacity = 0.9 * (1 - t);
      const width = (0.075 + t * 0.06);
      beam.scale.set(width, length, width);
    },
    dispose: () => disposeObject(beam),
  };
}

// Clarão aditivo no ponto do impacto: uma esfera brilhante que estoura e
// some depressa. Independe do ângulo da câmera.
function impactFlash(fx, position, color, { power = 1, y = 0.45 } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22 + power * 0.14, 12, 12), material);
  flash.position.set(position.x, y, position.z);
  fx.add(flash);

  animate(240, (t) => {
    flash.scale.setScalar(0.5 + easeOut(t) * (1.4 + power));
    material.opacity = 0.95 * (1 - t);
  }).then(() => disposeObject(flash));
}

// Faíscas: estilhaços brilhantes que voam do impacto e caem com física.
function sparks(fx, position, color, { count = 14, power = 1, y = 0.42 } = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bits = [];
  for (let i = 0; i < count; i++) {
    const size = 0.02 + Math.random() * 0.028;
    const bit = new THREE.Mesh(new THREE.TetrahedronGeometry(size, 0), material);
    bit.position.set(position.x, y, position.z);
    fx.add(bit);
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.3 + Math.random() * 1.9) * power;
    bits.push({
      object: bit,
      floor: 0.02,
      velocity: new THREE.Vector3(
        Math.cos(angle) * speed,
        1.1 + Math.random() * 2.4 * power,
        Math.sin(angle) * speed,
      ),
      spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6),
    });
  }

  simulateDebris(bits, 680, { gravity: 15, bounce: 0.18 }).then(async () => {
    await Promise.all(
      bits.map((b) => animate(200, (t) => b.object.scale.setScalar(Math.max(0.01, 1 - t)))),
    );
    bits.forEach((b) => disposeObject(b.object));
    material.dispose();
  });
}

// Estouro completo de impacto: clarão + faíscas, com força pelo tipo de peça.
function impactBurst(fx, position, color, power = 1) {
  impactFlash(fx, position, color, { power });
  sparks(fx, position, color, { count: Math.round(10 + power * 9), power });
}

// Arco do golpe giratório da rainha.
function slashArc(fx, position, color) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 4, 16, Math.PI * 1.3), material);
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(position.x, 0.5, position.z);
  fx.add(arc);

  animate(420, (t) => {
    arc.rotation.z = t * Math.PI * 2.4;
    arc.scale.setScalar(1 + t * 0.7);
    arc.position.y = 0.5 + t * 0.25;
    material.opacity = 0.7 * (1 - t);
  }).then(() => disposeObject(arc));
}

/* ---------------------------------------------------- física simples */

// Integra queda, quique e atrito para cacos/pedaços soltos.
function simulateDebris(pieces, duration, { gravity = 11, bounce = 0.32 } = {}) {
  let previous = 0;
  return animate(duration, (t) => {
    const dt = Math.min(0.05, (t - previous) * (duration / 1000));
    previous = t;
    if (dt <= 0) return;

    for (const item of pieces) {
      item.velocity.y -= gravity * dt;
      item.object.position.addScaledVector(item.velocity, dt);
      item.object.rotation.x += item.spin.x * dt;
      item.object.rotation.y += item.spin.y * dt;
      item.object.rotation.z += item.spin.z * dt;

      if (item.object.position.y <= item.floor) {
        item.object.position.y = item.floor;
        if (Math.abs(item.velocity.y) > 0.4) {
          item.velocity.y = -item.velocity.y * bounce;
          item.velocity.x *= 0.7;
          item.velocity.z *= 0.7;
          item.spin.multiplyScalar(0.5);
        } else {
          item.velocity.set(0, 0, 0);
          item.spin.multiplyScalar(0.82);
        }
      }
    }
  });
}

function restingSpots(pieces, limit) {
  return pieces
    .slice(0, limit)
    .map((item) => ({ x: item.object.position.x, z: item.object.position.z }));
}

/* ------------------------------------------------------------ ataques */

// Cada ataque recebe a peça já posicionada em `from` e deve terminar
// exatamente em `to`, com rotação e escala restauradas.
async function attackPawn(ctx) {
  const { mesh, from, to, onImpact, fx } = ctx;
  const baseRotation = mesh.rotation.clone();

  await animate(200, (t) => {
    setXZ(mesh, from, to, easeOut(t) * 0.5);
    mesh.rotation.x = baseRotation.x + 0.12 * t;
  });

  // Pancada de escudo: gira o ombro e avança rápido.
  await animate(140, (t) => {
    setXZ(mesh, from, to, 0.5 + easeIn(t) * 0.45);
    mesh.rotation.y = baseRotation.y - 0.55 * Math.sin(Math.PI * t);
    mesh.position.y = Math.sin(Math.PI * t) * 0.07;
  });

  onImpact();
  dustPuff(fx, to, { count: 4, spread: 0.2, duration: 550 });

  await animate(240, (t) => {
    setXZ(mesh, from, to, 0.95 + 0.05 * easeOut(t));
    mesh.rotation.x = baseRotation.x + 0.12 * (1 - easeOut(t));
    mesh.rotation.y = baseRotation.y;
    mesh.position.y = 0;
  });
}

async function attackRook(ctx) {
  const { mesh, from, to, onImpact, fx } = ctx;
  const baseRotation = mesh.rotation.clone();

  // Recua para tomar impulso.
  await animate(250, (t) => {
    setXZ(mesh, from, to, -0.2 * easeOut(t));
    mesh.rotation.x = baseRotation.x - 0.13 * easeOut(t);
  });

  // Aríete: investida reta e pesada.
  await animate(170, (t) => {
    setXZ(mesh, from, to, -0.2 + 1.17 * easeIn(t));
    mesh.rotation.x = baseRotation.x - 0.13 + 0.26 * easeIn(t);
  });

  onImpact();
  shockRing(fx, to, 0x9b7b46, { radius: 0.9 });
  dustPuff(fx, to, { count: 8, spread: 0.36 });

  // Freada: a pedra assenta com um baque.
  await animate(260, (t) => {
    setXZ(mesh, from, to, 0.97 + 0.03 * easeOut(t));
    mesh.scale.y = 1 - 0.14 * Math.sin(Math.PI * t);
    mesh.rotation.x = baseRotation.x + 0.13 * (1 - easeOut(t));
  });
  mesh.scale.set(1, 1, 1);
}

async function attackKnight(ctx) {
  const { mesh, from, to, onImpact, fx } = ctx;
  const baseRotation = mesh.rotation.clone();
  let hit = false;

  await animate(150, (t) => {
    mesh.scale.y = 1 - 0.14 * easeOut(t);
  });

  // Salto por cima da vítima, pisoteando na aterrissagem.
  await animate(440, (t) => {
    setXZ(mesh, from, to, easeInOut(t));
    mesh.position.y = Math.sin(Math.PI * t) * 1.15;
    mesh.rotation.x = baseRotation.x + 0.4 * Math.sin(Math.PI * t);
    mesh.scale.y = 1 + 0.12 * Math.sin(Math.PI * t);
    if (t > 0.84 && !hit) {
      hit = true;
      onImpact();
    }
  });

  shockRing(fx, to, 0x8a8175, { radius: 0.7 });
  dustPuff(fx, to, { count: 9, spread: 0.4 });

  await animate(240, (t) => {
    mesh.position.set(to.x, 0, to.z);
    mesh.rotation.x = baseRotation.x;
    mesh.scale.y = 1 - 0.2 * Math.sin(Math.PI * t);
  });
  mesh.scale.set(1, 1, 1);
}

async function attackBishop(ctx) {
  const { mesh, from, to, victimPos, onImpact, fx, glowColor } = ctx;

  // Ergue-se e concentra energia no cajado.
  await animate(260, (t) => {
    mesh.position.y = 0.14 * easeOut(t);
  });

  const staff = findPart(mesh, 'staff');
  const origin = staff
    ? staff.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.5, 0))
    : new THREE.Vector3(from.x, 1.3, from.z);
  const target = new THREE.Vector3(victimPos.x, 0.5, victimPos.z);

  const beam = energyBeam(fx, origin, target, glowColor);
  await animate(170, (t) => beam.grow(t));

  onImpact();

  await animate(260, (t) => beam.fade(t));
  beam.dispose();

  // Vai até a casa: caminhando, se o modelo tiver pernas; senão, flutuando.
  const walk = walkTo(mesh, to);
  if (walk) {
    await walk;
  } else {
    await animate(340, (t) => {
      setXZ(mesh, from, to, easeInOut(t));
      mesh.position.y = 0.14 * (1 - easeInOut(t));
    });
  }
  mesh.position.y = 0;
}

async function attackQueen(ctx) {
  const { mesh, from, to, onImpact, fx, glowColor } = ctx;
  const baseRotation = mesh.rotation.clone();
  let hit = false;

  // Golpe giratório: atravessa a casa rodopiando.
  await animate(580, (t) => {
    setXZ(mesh, from, to, easeInOut(t));
    mesh.position.y = Math.sin(Math.PI * t) * 0.3;
    mesh.rotation.y = baseRotation.y + t * Math.PI * 6;
    if (t > 0.7 && !hit) {
      hit = true;
      onImpact();
      slashArc(fx, to, glowColor);
    }
  });

  mesh.rotation.y = baseRotation.y;
  mesh.position.y = 0;

  await animate(200, (t) => {
    mesh.scale.y = 1 - 0.09 * Math.sin(Math.PI * t);
  });
  mesh.scale.set(1, 1, 1);
}

async function attackKing(ctx) {
  const { mesh, from, to, onImpact, fx, glowColor } = ctx;
  const baseRotation = mesh.rotation.clone();

  // Prepara o peso do corpo.
  await animate(300, (t) => {
    setXZ(mesh, from, to, -0.12 * easeOut(t));
    mesh.rotation.x = baseRotation.x - 0.18 * easeOut(t);
    mesh.scale.y = 1 - 0.06 * easeOut(t);
  });

  // Investida pesada.
  await animate(280, (t) => {
    setXZ(mesh, from, to, -0.12 + 1.09 * easeIn(t));
    mesh.rotation.x = baseRotation.x - 0.18 + 0.46 * easeIn(t);
    mesh.scale.y = 1 - 0.06 + 0.06 * t;
  });

  onImpact();
  shockRing(fx, to, glowColor, { radius: 1.2, duration: 650 });
  dustPuff(fx, to, { count: 10, spread: 0.45 });

  await animate(300, (t) => {
    setXZ(mesh, from, to, 0.97 + 0.03 * easeOut(t));
    mesh.rotation.x = baseRotation.x + 0.28 * (1 - easeOut(t));
  });
  mesh.rotation.copy(baseRotation);
  mesh.scale.set(1, 1, 1);
}

const ATTACKS = {
  p: attackPawn,
  r: attackRook,
  n: attackKnight,
  b: attackBishop,
  q: attackQueen,
  k: attackKing,
};

/* -------------------------------------------------------------- mortes */

// Torre: desmorona em tijolos que rolam pela casa.
async function deathRook(ctx) {
  const { mesh, fx, position, dir, stoneColor } = ctx;
  const bricks = [];
  const material = new THREE.MeshStandardMaterial({
    color: stoneColor,
    roughness: 0.9,
    metalness: 0.12,
    flatShading: true,
  });

  for (let i = 0; i < 14; i++) {
    const size = 0.07 + Math.random() * 0.05;
    const brick = new THREE.Mesh(new THREE.BoxGeometry(size * 1.7, size, size * 1.2), material);
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.05 + Math.random() * 0.16;
    brick.position.set(
      position.x + Math.cos(angle) * radius,
      0.15 + Math.random() * 0.9,
      position.z + Math.sin(angle) * radius,
    );
    brick.rotation.set(Math.random(), Math.random(), Math.random());
    brick.castShadow = true;
    fx.add(brick);
    bricks.push({
      object: brick,
      floor: size * 0.5,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (0.5 + Math.random() * 0.9) + dir.x * 0.6,
        0.6 + Math.random() * 1.2,
        Math.sin(angle) * (0.5 + Math.random() * 0.9) + dir.z * 0.6,
      ),
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
    });
  }

  dustPuff(fx, position, { count: 10, spread: 0.4 });

  // A torre se dissolve enquanto os tijolos aparecem.
  animate(220, (t) => {
    mesh.scale.set(1, Math.max(0.02, 1 - t), 1);
  }).then(() => (mesh.visible = false));

  await simulateDebris(bricks, 1000);
  ctx.reportDebris(restingSpots(bricks, 5));

  await Promise.all(
    bricks.map((item) =>
      animate(320, (t) => {
        item.object.scale.setScalar(Math.max(0.01, 1 - t));
      }),
    ),
  );
  bricks.forEach((item) => disposeObject(item.object));
  material.dispose();
}

// Rainha: a coroa salta, cai e rola para fora da casa.
async function deathQueen(ctx) {
  const { mesh, fx, position, dir } = ctx;
  const crown = findPart(mesh, 'crown');

  const crownFall = (async () => {
    if (!crown) return;
    reparentKeepingWorld(crown, fx);
    const item = {
      object: crown,
      floor: 0.07,
      velocity: new THREE.Vector3(dir.x * 1.1, 1.6, dir.z * 1.1),
      spin: new THREE.Vector3(4.5, 2.4, 3.2),
    };
    await simulateDebris([item], 900, { bounce: 0.45 });

    // Rolagem final antes de parar.
    const rollAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const start = crown.position.clone();
    await animate(650, (t) => {
      const e = easeOut(t);
      crown.position.x = start.x + dir.x * 0.42 * e;
      crown.position.z = start.z + dir.z * 0.42 * e;
      crown.rotateOnWorldAxis(rollAxis, 0.05 * (1 - t));
    });
  })();

  const bodyFall = (async () => {
    const startQuaternion = mesh.quaternion.clone();
    const fallen = tipQuaternion(startQuaternion, dir, Math.PI * 0.42);
    await animate(700, (t) => {
      mesh.quaternion.slerpQuaternions(startQuaternion, fallen, easeIn(t));
      mesh.scale.y = 1 - 0.12 * t;
    });
    await fadeOut(mesh, 420);
  })();

  dustPuff(fx, position, { count: 6, spread: 0.3 });
  await Promise.all([crownFall, bodyFall]);
  ctx.reportDebris(crown ? [{ x: crown.position.x, z: crown.position.z }] : []);
  if (crown) {
    await fadeOut(crown, 300);
    disposeObject(crown);
  }
}

// Cavalo: tomba de lado levantando poeira.
async function deathKnight(ctx) {
  const { mesh, fx, position, dir } = ctx;
  dustPuff(fx, position, { count: 9, spread: 0.36 });

  const startQuaternion = mesh.quaternion.clone();
  const fallen = tipQuaternion(startQuaternion, dir, Math.PI * 0.48);

  await animate(560, (t) => {
    mesh.quaternion.slerpQuaternions(startQuaternion, fallen, easeIn(t));
  });

  dustPuff(fx, position, { count: 7, spread: 0.45, duration: 800 });
  ctx.reportDebris([]);
  await wait(220);
  await fadeOut(mesh, 460);
}

// Bispo: o cajado se parte e cai; o corpo desaba dentro das vestes.
async function deathBishop(ctx) {
  const { mesh, fx, position, dir, glowColor } = ctx;
  const staff = findPart(mesh, 'staff');
  const shards = [];

  if (staff) {
    const origin = staff.getWorldPosition(new THREE.Vector3());
    staff.visible = false;

    const bronze = new THREE.MeshStandardMaterial({
      color: 0x8a7442,
      roughness: 0.35,
      metalness: 0.9,
      flatShading: true,
    });
    for (let i = 0; i < 2; i++) {
      const half = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 5), bronze);
      half.position.set(origin.x, origin.y + 0.2 + i * 0.45, origin.z);
      half.castShadow = true;
      fx.add(half);
      shards.push({
        object: half,
        floor: 0.025,
        velocity: new THREE.Vector3(dir.x * 0.5 + (Math.random() - 0.5), 0.5 + i * 0.4, dir.z * 0.5 + (Math.random() - 0.5)),
        spin: new THREE.Vector3(Math.random() * 7 - 3.5, Math.random() * 4, Math.random() * 7 - 3.5),
      });
    }

    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor,
      emissiveIntensity: 2.2,
      flatShading: true,
      transparent: true,
    });
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), crystalMaterial);
    crystal.position.set(origin.x, origin.y + 0.85, origin.z);
    fx.add(crystal);
    shards.push({
      object: crystal,
      floor: 0.06,
      velocity: new THREE.Vector3(dir.x * 0.9, 1.1, dir.z * 0.9),
      spin: new THREE.Vector3(3, 3, 3),
    });
  }

  const collapse = (async () => {
    const startQuaternion = mesh.quaternion.clone();
    const slumped = tipQuaternion(startQuaternion, dir, Math.PI * 0.14);
    await animate(620, (t) => {
      mesh.quaternion.slerpQuaternions(startQuaternion, slumped, easeInOut(t));
      // As vestes desabam como se nada mais as sustentasse.
      mesh.scale.set(1 + 0.18 * t, Math.max(0.28, 1 - 0.72 * easeIn(t)), 1 + 0.18 * t);
    });
    await fadeOut(mesh, 380);
  })();

  dustPuff(fx, position, { count: 6, spread: 0.32 });
  await Promise.all([collapse, simulateDebris(shards, 950)]);

  ctx.reportDebris(restingSpots(shards, 3));
  await Promise.all(shards.map((item) => fadeOut(item.object, 320)));
  shards.forEach((item) => disposeObject(item.object));
}

// Rei: cai de joelhos antes de tombar.
// Com `linger`, ele apenas se ajoelha e permanece no tabuleiro
// (usado no xeque-mate, onde o rei não é capturado).
async function deathKing(ctx) {
  const { mesh, fx, position, dir, linger } = ctx;
  const startQuaternion = mesh.quaternion.clone();
  const kneeling = tipQuaternion(startQuaternion, dir, 0.32);

  // Ajoelha: encolhe na vertical e curva o tronco.
  await animate(620, (t) => {
    mesh.quaternion.slerpQuaternions(startQuaternion, kneeling, easeOut(t));
    mesh.scale.y = 1 - 0.3 * easeOut(t);
  });

  dustPuff(fx, position, { count: 7, spread: 0.34 });
  await wait(340);

  if (linger) {
    ctx.reportDebris([]);
    return;
  }

  // Tomba de vez.
  const fallen = tipQuaternion(startQuaternion, dir, Math.PI * 0.42);
  await animate(560, (t) => {
    mesh.quaternion.slerpQuaternions(kneeling, fallen, easeIn(t));
  });

  ctx.reportDebris([]);
  await fadeOut(mesh, 520);
}

// Peão: cai e larga o escudo ao lado.
async function deathPawn(ctx) {
  const { mesh, fx, position, dir } = ctx;
  const shield = findPart(mesh, 'shield');
  const dropped = [];

  if (shield) {
    reparentKeepingWorld(shield, fx);
    dropped.push({
      object: shield,
      floor: 0.03,
      velocity: new THREE.Vector3(
        dir.z * 0.9 + (Math.random() - 0.5) * 0.4,
        0.7,
        -dir.x * 0.9 + (Math.random() - 0.5) * 0.4,
      ),
      spin: new THREE.Vector3(2.5, 1.5, 4),
    });
  }

  const bodyFall = (async () => {
    const startQuaternion = mesh.quaternion.clone();
    const fallen = tipQuaternion(startQuaternion, dir, Math.PI * 0.47);
    await animate(520, (t) => {
      mesh.quaternion.slerpQuaternions(startQuaternion, fallen, easeIn(t));
    });
    await wait(160);
    await fadeOut(mesh, 400);
  })();

  dustPuff(fx, position, { count: 5, spread: 0.26 });
  await Promise.all([bodyFall, simulateDebris(dropped, 800)]);

  // O escudo fica deitado no chão antes de sumir.
  if (shield) {
    await animate(240, (t) => {
      shield.rotation.x = shield.rotation.x * (1 - t) + (-Math.PI / 2) * t;
      shield.position.y = shield.position.y * (1 - t) + 0.03 * t;
    });
    ctx.reportDebris([{ x: shield.position.x, z: shield.position.z }]);
    await fadeOut(shield, 320);
    disposeObject(shield);
  } else {
    ctx.reportDebris([]);
  }
}

const DEATHS = {
  p: deathPawn,
  r: deathRook,
  n: deathKnight,
  b: deathBishop,
  q: deathQueen,
  k: deathKing,
};

/* ---------------------------------------------------------- orquestração */

export function createCombat({ scene, decals, audio, shake }) {
  const fx = new THREE.Group();
  scene.add(fx);

  async function playCapture({
    attacker,
    attackerType,
    attackerColor,
    from,
    to,
    victim,
    victimType,
    victimColor,
    victimPos,
    victimSquare,
    onVictimGone,
  }) {
    const dir = horizontalDir(from, victimPos);
    let death = Promise.resolve();

    const runDeath = () => {
      // Estouro de impacto no exato momento do golpe.
      const power = IMPACT_POWER[victimType] ?? 1;
      impactBurst(fx, victimPos, GLOW_COLOR[attackerColor] ?? GLOW_COLOR.b, power);
      shake?.(0.3 + power * 0.16);

      audio?.playDeath(victimType);
      death = DEATHS[victimType]({
        mesh: victim,
        fx,
        position: victimPos,
        dir,
        glowColor: GLOW_COLOR[victimColor] ?? GLOW_COLOR.b,
        stoneColor: victimColor === WHITE ? 0x7c7a76 : 0x1f1d26,
        reportDebris: (spots) => {
          decals.addCaptureMarks(victimSquare.row, victimSquare.col, {
            victimType,
            victimColor,
            debrisSpots: spots,
          });
        },
      }).then(() => {
        onVictimGone?.(victim);
      });
    };

    audio?.playAttack(attackerType);
    await ATTACKS[attackerType]({
      mesh: attacker,
      from,
      to,
      victimPos,
      fx,
      glowColor: GLOW_COLOR[attackerColor] ?? GLOW_COLOR.b,
      onImpact: runDeath,
    });

    await death;
    attacker.position.set(to.x, 0, to.z);
  }

  // Xeque-mate: o rei derrotado se ajoelha e fica assim no tabuleiro.
  function playKingFall({ mesh, position, attackerPos }) {
    if (!mesh) return Promise.resolve();
    shake?.(0.7);
    return DEATHS.k({
      mesh,
      fx,
      position,
      dir: horizontalDir(attackerPos ?? position, position),
      linger: true,
      reportDebris: () => {},
    });
  }

  function dispose() {
    while (fx.children.length) disposeObject(fx.children[0]);
    fx.parent?.remove(fx);
  }

  return { playCapture, playKingFall, dispose, fx };
}
