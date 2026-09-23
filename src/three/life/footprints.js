import * as THREE from 'three';

// Pegadas no chão por onde as peças passam, conforme a superfície do
// clima/cenário: neve, lama, areia ou cinza vulcânica. Somem em ~12 s.
// Todas as pegadas são quads de uma única geometria (um draw call), com a
// transparência por vértice atualizada só enquanto houver pegada viva.
const MAX = 260;
const LIFE = 12.5;
const Y = 0.004;

export const SURFACES = {
  neve: { color: 0x9aa6c4, opacity: 0.5 },
  lama: { color: 0x241a12, opacity: 0.62 },
  areia: { color: 0x5a4028, opacity: 0.45 },
  cinza: { color: 0x121010, opacity: 0.55 },
};

// Superfície marcável do clima + tema (ou null: sem pegadas).
export function surfaceFor(weatherId, themeId) {
  if (weatherId === 'neve') return 'neve';
  if (weatherId === 'tempestade') return 'lama';
  if (weatherId === 'areia' || themeId === 'deserto') return 'areia';
  if (themeId === 'montanha') return 'neve';
  if (themeId === 'vulcao') return 'cinza';
  return null;
}

function printTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 48;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 26, 2, 16, 24, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(16, 24, 11, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export function createFootprints({ scene, surface }) {
  const style = SURFACES[surface];
  if (!style) return { step() {}, update() {}, clear() {}, dispose() {} };

  const positions = new Float32Array(MAX * 4 * 3);
  const colors = new Float32Array(MAX * 4 * 4);
  const uvs = new Float32Array(MAX * 4 * 2);
  const indices = [];
  for (let i = 0; i < MAX; i++) {
    uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    const v = i * 4;
    indices.push(v, v + 2, v + 1, v, v + 3, v + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const texture = printTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  const born = new Float32Array(MAX).fill(-1e9);
  const color = new THREE.Color(style.color);
  let cursor = 0;
  let live = 0;
  let clock = 0;

  // Uma pegada em (x, z) apontando para `yaw`, do lado side (-1/+1).
  function step({ x, z, yaw, side = 1, size = 1 }) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    born[i] = clock;
    live = LIFE;
    const w = 0.055 * size;
    const l = 0.085 * size;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const ox = x + cos * 0.06 * side;
    const oz = z - sin * 0.06 * side;
    const corners = [
      [-w, -l],
      [w, -l],
      [w, l],
      [-w, l],
    ];
    corners.forEach(([u, v], k) => {
      positions.set([ox + u * cos + v * sin, Y, oz - u * sin + v * cos], (i * 4 + k) * 3);
    });
    geometry.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    clock += dt;
    if (live <= 0) return;
    live -= dt;
    for (let i = 0; i < MAX; i++) {
      const t = (clock - born[i]) / LIFE;
      const alpha = t >= 0 && t < 1 ? style.opacity * (1 - t) * (1 - t) : 0;
      for (let k = 0; k < 4; k++) colors.set([color.r, color.g, color.b, alpha], (i * 4 + k) * 4);
    }
    geometry.attributes.color.needsUpdate = true;
  }

  function clear() {
    born.fill(-1e9);
    colors.fill(0);
    geometry.attributes.color.needsUpdate = true;
  }

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { step, update, clear, dispose };
}
