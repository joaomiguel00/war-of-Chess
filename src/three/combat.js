import * as THREE from 'three';
import { WHITE } from '../chess/moveGen.js';
import { walkTo, getRig } from './pieceAnimator.js';
import { getAttack } from './attacks/index.js';
import { dustPuff, impactBurst, simulateDebris, restingSpots, reserveLights } from './fx.js';
import {
  animate,
  wait,
  easeIn,
  easeOut,
  easeInOut,
  fadeOut,
  findPart,
  forEachMaterial,
  horizontalDir,
  reparentKeepingWorld,
  tipQuaternion,
  disposeObject,
  hitStop,
} from './animation.js';

export const GLOW_COLOR = { [WHITE]: 0xff8c33, b: 0xd946ef };

// Peso do impacto por tipo de peça destruída: peças maiores geram um golpe
// mais forte (clarão maior, mais faíscas e mais tremor).
const IMPACT_POWER = { p: 0.65, n: 1, b: 0.9, r: 1.35, q: 1.25, k: 1.6 };

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

// Esmagada pela torre: achata de uma vez, estilhaça e some.
async function deathCrushed(ctx) {
  const { mesh, fx, position } = ctx;
  const start = mesh.scale.clone();
  await animate(110, (t) => {
    const e = easeOut(t);
    mesh.scale.set(start.x * (1 + 0.35 * e), start.y * (1 - 0.78 * e), start.z * (1 + 0.35 * e));
  });
  dustPuff(fx, position, { count: 8, spread: 0.4, duration: 900 });
  await wait(260);
  ctx.reportDebris(
    Array.from({ length: 4 }, () => ({
      x: position.x + (Math.random() - 0.5) * 0.7,
      z: position.z + (Math.random() - 0.5) * 0.7,
    })),
  );
  await fadeOut(mesh, 420);
}

// Dissolvida pela luz do bispo: a vítima brilha em dourado enquanto cai.
function withDissolve(death, color) {
  return async (ctx) => {
    const tint = new THREE.Color(color);
    const entries = [];
    forEachMaterial(ctx.mesh, (m) => {
      if (m.emissive) entries.push({ m, from: m.emissive.clone(), intensity: m.emissiveIntensity ?? 1 });
    });
    const glow = animate(900, (t) => {
      const level = Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.9 + t * 0.4;
      for (const e of entries) {
        e.m.emissive.copy(e.from).lerp(tint, Math.min(1, level));
        e.m.emissiveIntensity = e.intensity + level * 2.5;
      }
    });
    await Promise.all([death(ctx), glow]);
  };
}

/* ---------------------------------------------------------- orquestração */

// hooks opcionais: shake(força), flash(cor, força, ms) e cinematic (follow,
// slowMo). O replay de destaques cria o combate sem eles.
export function createCombat({ scene, decals, audio, shake, flash, cinematic, lightPool = 0 }) {
  const fx = new THREE.Group();
  scene.add(fx);
  if (lightPool) reserveLights(fx, lightPool);
  const middle = new THREE.Vector3();

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
    onImpact,
  }) {
    const dir = horizontalDir(from, victimPos);
    // O primeiro golpe que acerta avisa quem precisa saber (cicatrizes, arauto...).
    let impacted = false;
    const impact = () => {
      if (impacted) return;
      impacted = true;
      onImpact?.();
    };
    const teamColor = GLOW_COLOR[attackerColor] ?? GLOW_COLOR.b;
    const baseYaw = attacker.rotation.y;
    attacker.rotation.order = 'YXZ';
    let death = null;

    // Início da morte da vítima (uma vez só), no estilo pedido pelo ataque.
    const kill = (style = 'default') => {
      if (death) return;
      impact();
      const typeDeath = DEATHS[victimType] ?? DEATHS.p;
      const runner =
        style === 'crush' ? deathCrushed : style === 'dissolve' ? withDissolve(typeDeath, 0xffcf5a) : typeDeath;
      audio?.playDeath(victimType);
      death = runner({
        mesh: victim,
        fx,
        position: victim.position.clone(),
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
      }).then(() => onVictimGone?.(victim));
    };

    // O instante do golpe: som de impacto, estouro, tremor e câmera lenta.
    const strike = ({ power, shake: amount, color, kill: doKill = true, style, burst = true } = {}) => {
      const weight = power ?? IMPACT_POWER[victimType] ?? 1;
      impact();
      audio?.playImpact?.(attackerType);
      if (burst) impactBurst(fx, victim.position, color ?? teamColor, weight);
      shake?.(amount ?? 0.3 + weight * 0.16);
      cinematic?.slowMo?.(520);
      if (doKill) kill(style);
    };

    const ctx = {
      mesh: attacker,
      type: attackerType,
      color: attackerColor,
      from,
      to,
      victim,
      victimPos,
      victimType,
      dir,
      fx,
      teamColor,
      rig: getRig(attacker),
      baseYaw,
      strike,
      kill,
      hitStop,
      // Corte rente ao chão (só torre e rei chamam).
      lowAngle: (hold) => cinematic?.lowAngleCut?.({ subject: attacker, toward: victimPos, hold }),
      shake: (value) => shake?.(value),
      flash: (color, strength, ms) => flash?.(color, strength, ms),
      sound: {
        windup: () => audio?.playWindup?.(attackerType),
        bash: () => audio?.playImpact?.('p_bash'),
        step: () => audio?.playStep?.('r'),
      },
    };

    // A câmera acompanha o meio do caminho entre atacante e vítima.
    cinematic?.follow?.(() => middle.addVectors(attacker.position, victim.position).multiplyScalar(0.5));

    const attack = getAttack(attackerType);
    if (attack) await attack(ctx);
    kill();
    await death;
    cinematic?.follow?.(null);

    // Ocupa a casa conquistada (quando o ataque parou antes dela).
    if (Math.hypot(attacker.position.x - to.x, attacker.position.z - to.z) > 0.02) {
      const walk = walkTo(attacker, to);
      if (walk) await walk;
      else {
        const start = attacker.position.clone();
        await animate(240, (t) => {
          const e = easeInOut(t);
          attacker.position.x = start.x + (to.x - start.x) * e;
          attacker.position.z = start.z + (to.z - start.z) * e;
        });
      }
    }
    attacker.position.set(to.x, 0, to.z);
    attacker.rotation.set(0, baseYaw, 0);
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
