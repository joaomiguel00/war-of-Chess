import * as THREE from 'three';
import { animate, easeInOut, easeOut } from '../animation.js';

// Utilitários compartilhados pelas animações de ataque. Convenções:
// - o invólucro da peça (ctx.mesh) é quem anda, gira e inclina;
// - braços e corpo vêm do rig da caminhada (ctx.rig), quando o modelo tem;
// - toda animação termina chamando returnToNeutral().

export function setXZ(mesh, from, to, t) {
  mesh.position.x = from.x + (to.x - from.x) * t;
  mesh.position.z = from.z + (to.z - from.z) * t;
}

// Ponto a `gap` casas antes do alvo, na linha de ataque.
export function approachPoint(from, target, gap) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const length = Math.hypot(dx, dz);
  if (length <= gap) return new THREE.Vector3(from.x, 0, from.z);
  const k = (length - gap) / length;
  return new THREE.Vector3(from.x + dx * k, 0, from.z + dz * k);
}

// Guinada que faz a frente do modelo (+Z) olhar de a para b.
export function yawToward(a, b) {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

function shortestAngle(from, to) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function turnTo(ctx, yaw, ms = 120) {
  const start = ctx.mesh.rotation.y;
  const end = shortestAngle(start, yaw);
  return animate(ms, (t) => {
    ctx.mesh.rotation.y = start + (end - start) * easeInOut(t);
  });
}

// Braço do rig ("L"/"R"); ângulo positivo = erguer para a frente/cima.
export function arm(ctx, side) {
  const limb = side === 'L' ? ctx.rig?.armL : ctx.rig?.armR;
  const sign = ctx.rig?.raiseSign ?? -1;
  return {
    exists: !!limb,
    get: () => (limb ? limb.rotation.x * sign : 0),
    set: (angle) => {
      if (limb) limb.rotation.x = angle * sign;
    },
  };
}

// Leva braço de `from` a `to` (ângulos "de erguer").
export function swingArm(ctx, side, to, ms, ease = easeInOut) {
  const limb = arm(ctx, side);
  if (!limb.exists) return Promise.resolve();
  const from = limb.get();
  return animate(ms, (t) => limb.set(from + (to - from) * ease(t)));
}

export function findNamed(root, name) {
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.isMesh && (obj.name === name || obj.userData?.name === name)) found = obj;
  });
  return found;
}

// Faz uma parte (gema, orbe) brilhar: set(0..1) sobe a emissão, restore() volta.
export function glowPart(part, color) {
  if (!part) return { set() {}, restore() {}, part: null };
  const materials = (Array.isArray(part.material) ? part.material : [part.material]).filter(Boolean);
  const saved = materials.map((m) => ({
    m,
    emissive: m.emissive?.clone(),
    intensity: m.emissiveIntensity ?? 1,
  }));
  const tint = new THREE.Color(color);
  const baseScale = part.scale.clone();
  return {
    part,
    set(level) {
      for (const s of saved) {
        if (!s.m.emissive) continue;
        s.m.emissive.copy(s.emissive).lerp(tint, Math.min(1, level));
        s.m.emissiveIntensity = s.intensity + level * 6;
      }
      part.scale.copy(baseScale).multiplyScalar(1 + level * 0.35);
    },
    restore() {
      for (const s of saved) {
        if (s.emissive) s.m.emissive.copy(s.emissive);
        s.m.emissiveIntensity = s.intensity;
      }
      part.scale.copy(baseScale);
    },
  };
}

// Empurra a vítima para longe do atacante (recuo, arremesso).
export function knockVictim(ctx, distance, lift, ms) {
  const victim = ctx.victim;
  if (!victim) return Promise.resolve();
  const start = victim.position.clone();
  const dir = ctx.dir;
  return animate(ms, (t) => {
    const e = easeOut(t);
    victim.position.x = start.x + dir.x * distance * e;
    victim.position.z = start.z + dir.z * distance * e;
    victim.position.y = start.y + Math.sin(Math.PI * t) * lift;
  }).then(() => {
    victim.position.y = start.y;
  });
}

// Volta suavemente à pose de descanso: sem inclinação, olhando para o lado
// do próprio exército, escala 1, braços baixados.
export function returnToNeutral(ctx, ms = 220) {
  const mesh = ctx.mesh;
  const start = {
    x: mesh.rotation.x,
    y: mesh.rotation.y,
    z: mesh.rotation.z,
    py: mesh.position.y,
    scale: mesh.scale.clone(),
  };
  const endYaw = shortestAngle(start.y, ctx.baseYaw);
  const limbs = [ctx.rig?.armL, ctx.rig?.armR, ctx.rig?.legL, ctx.rig?.legR].filter(Boolean);
  const limbStart = limbs.map((l) => l.rotation.x);
  const body = ctx.rig?.body;
  const bodyStart = body ? { x: body.rotation.x, y: body.rotation.y, z: body.rotation.z, py: body.position.y } : null;

  return animate(ms, (t) => {
    const k = 1 - easeInOut(t);
    mesh.rotation.x = start.x * k;
    mesh.rotation.z = start.z * k;
    mesh.rotation.y = endYaw + (start.y - endYaw) * k;
    mesh.position.y = start.py * k;
    mesh.scale.set(1 + (start.scale.x - 1) * k, 1 + (start.scale.y - 1) * k, 1 + (start.scale.z - 1) * k);
    limbs.forEach((limb, i) => (limb.rotation.x = limbStart[i] * k));
    if (body) {
      body.rotation.set(bodyStart.x * k, bodyStart.y * k, bodyStart.z * k);
      body.position.y = bodyStart.py * k;
    }
  }).then(() => {
    mesh.rotation.set(0, ctx.baseYaw, 0);
    mesh.position.y = 0;
    mesh.scale.set(1, 1, 1);
  });
}
