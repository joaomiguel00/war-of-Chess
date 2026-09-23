import * as THREE from 'three';
import { PRIORITY } from './poseDirector.js';
import { pieceParts } from './rigParts.js';

// Respiração visível no frio: a cada poucos segundos cada peça solta uma
// nuvenzinha de vapor pela frente do rosto, e treme de leve quando parada.
// Todas as partículas vivem num único Points (um draw call).
const MAX = 420;
const PER_PUFF = 7;
const LIFE = 1.6;

// Altura do rosto (mundo) para peças sem pivô de cabeça. A torre não respira.
const FACE = { p: 0.95, n: 1.12 };

function puffTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export function createBreath({ scene, director }) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 4);
  const velocity = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX).fill(LIFE);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  const texture = puffTexture();
  const material = new THREE.PointsMaterial({
    size: 0.11,
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  const timers = new WeakMap();
  const head = new THREE.Vector3();
  const forward = new THREE.Vector3();

  function emit(piece) {
    const type = piece.userData.pieceType;
    const parts = pieceParts(piece);
    forward.set(Math.sin(piece.rotation.y), 0, Math.cos(piece.rotation.y));
    if (parts.head) {
      parts.head.getWorldPosition(head);
      head.y += 0.12;
      head.addScaledVector(forward, 0.16);
    } else if (FACE[type]) {
      head.copy(piece.position);
      head.y = FACE[type];
      head.addScaledVector(forward, type === 'n' ? 0.34 : 0.17);
    } else {
      return;
    }
    for (let i = 0; i < PER_PUFF; i++) {
      const k = cursor;
      cursor = (cursor + 1) % MAX;
      age[k] = 0;
      positions[k * 3] = head.x + (Math.random() - 0.5) * 0.03;
      positions[k * 3 + 1] = head.y + (Math.random() - 0.5) * 0.03;
      positions[k * 3 + 2] = head.z + (Math.random() - 0.5) * 0.03;
      const speed = 0.12 + Math.random() * 0.1;
      velocity[k * 3] = forward.x * speed + (Math.random() - 0.5) * 0.05;
      velocity[k * 3 + 1] = 0.08 + Math.random() * 0.08;
      velocity[k * 3 + 2] = forward.z * speed + (Math.random() - 0.5) * 0.05;
    }
  }

  function update(dt, elapsed, pieces, { acting, wind = 0 }) {
    for (const piece of pieces) {
      let next = timers.get(piece);
      if (next === undefined) {
        next = elapsed + Math.random() * 4;
        timers.set(piece, next);
      }
      if (elapsed >= next) {
        emit(piece);
        timers.set(piece, elapsed + 2.6 + Math.random() * 2.2);
      }
      // Parada no frio, treme de leve.
      if (!acting(piece) && piece.userData.pieceType !== 'r') {
        director.request(piece, PRIORITY.idle - 1, { tremble: 0.12 });
      }
    }

    for (let k = 0; k < MAX; k++) {
      if (age[k] >= LIFE) {
        colors[k * 4 + 3] = 0;
        continue;
      }
      age[k] += dt;
      const t = age[k] / LIFE;
      positions[k * 3] += (velocity[k * 3] + wind * 0.15) * dt;
      positions[k * 3 + 1] += velocity[k * 3 + 1] * dt;
      positions[k * 3 + 2] += velocity[k * 3 + 2] * dt;
      velocity[k * 3] *= 0.97;
      velocity[k * 3 + 2] *= 0.97;
      colors[k * 4] = colors[k * 4 + 1] = colors[k * 4 + 2] = 0.92;
      colors[k * 4 + 3] = Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.38 * (1 - t);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  }

  function dispose() {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { update, dispose };
}
