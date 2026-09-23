import * as THREE from 'three';
import { disposeObject } from '../animation.js';
import { dustPuff } from '../fx.js';
import { GRAVE_PLOT, BRAZIER_SPOTS } from './terrain.js';

// Progressão visual da destruição: conforme as capturas se acumulam, o chão
// em volta do tabuleiro ganha manchas de queimado, brasas, fumaça subindo,
// cinzas e fagulhas no ar e, de vez em quando, uma lufada de poeira. Tudo
// é guiado por um nível só (0..1) que sobe suavemente.

const SCORCH_COUNT = 26;
const SMOKE_POOL = 72;
const ASH_COUNT = 260;
const SPARK_COUNT = 70;

function blobTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  draw(canvas.getContext('2d'));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Mancha de queimado com borda irregular.
function scorchTexture() {
  return blobTexture((ctx) => {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const d = Math.random() * 26;
      const x = 64 + Math.cos(angle) * d;
      const y = 64 + Math.sin(angle) * d;
      const r = 22 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
  });
}

function smokeTexture() {
  return blobTexture((ctx) => {
    for (let i = 0; i < 9; i++) {
      const x = 44 + Math.random() * 40;
      const y = 44 + Math.random() * 40;
      const r = 20 + Math.random() * 24;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
  });
}

function pickSpots(heightAt, craters) {
  const spots = craters.map((c) => ({ x: c.x, z: c.z, size: c.radius * 2.2 }));
  let guard = 0;
  while (spots.length < SCORCH_COUNT && guard++ < 500) {
    const angle = Math.random() * Math.PI * 2;
    const r = 5 + Math.random() * 6.5;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) < 4.9) continue;
    if (Math.abs(x) > GRAVE_PLOT.xMin - 0.5 && Math.abs(x) < GRAVE_PLOT.xMax + 0.5 && Math.abs(z) < GRAVE_PLOT.zMax + 0.4) continue;
    if (BRAZIER_SPOTS.some(([bx, bz]) => Math.hypot(x - bx, z - bz) < 0.9)) continue;
    spots.push({ x, z, size: 0.9 + Math.random() * 1.5 });
  }
  // Limiar de cada mancha: umas aparecem cedo, outras só no fim.
  return spots
    .map((s) => ({ ...s, y: heightAt(s.x, s.z), threshold: Math.random() * 0.85 }))
    .sort((a, b) => a.threshold - b.threshold);
}

export function createDestruction({ scene, heightAt, craters, weather }) {
  const group = new THREE.Group();
  group.name = 'Destruction';
  scene.add(group);
  const fx = new THREE.Group();
  group.add(fx);

  const wind = weather.wind;
  const spots = pickSpots(heightAt, craters);

  // Manchas de queimado.
  const scorchMap = scorchTexture();
  const scorchGeometry = new THREE.PlaneGeometry(1, 1);
  scorchGeometry.rotateX(-Math.PI / 2);
  for (const spot of spots) {
    const material = new THREE.MeshBasicMaterial({
      map: scorchMap,
      color: 0x0c0907,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    const mesh = new THREE.Mesh(scorchGeometry, material);
    mesh.position.set(spot.x, spot.y + 0.03, spot.z);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.renderOrder = 1;
    mesh.visible = false;
    group.add(mesh);
    spot.mesh = mesh;
    spot.material = material;
  }

  // Brasas acesas dentro das manchas mais recentes.
  const emberPositions = new Float32Array(spots.length * 4 * 3);
  spots.forEach((spot, i) => {
    for (let k = 0; k < 4; k++) {
      const angle = Math.random() * Math.PI * 2;
      const d = Math.random() * spot.size * 0.25;
      emberPositions.set([spot.x + Math.cos(angle) * d, spot.y + 0.05, spot.z + Math.sin(angle) * d], (i * 4 + k) * 3);
    }
  });
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const emberMaterial = new THREE.PointsMaterial({
    color: 0xff5a1a,
    size: 0.07,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  group.add(new THREE.Points(emberGeometry, emberMaterial));

  // Fumaça: sprites reciclados.
  const smokeMap = smokeTexture();
  const smoke = Array.from({ length: SMOKE_POOL }, () => {
    const material = new THREE.SpriteMaterial({
      map: smokeMap,
      color: 0x6d6660,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.visible = false;
    group.add(sprite);
    return { sprite, material, age: 0, life: 1, rise: 0, drift: 0, alive: false };
  });

  // Cinzas e fagulhas no ar.
  const airCloud = (count, color, size, additive) => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([(Math.random() - 0.5) * 22, Math.random() * 5 - 0.4, (Math.random() - 0.5) * 22], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive,
    });
    const points = new THREE.Points(geometry, material);
    group.add(points);
    return { points, geometry, material, count, speeds: Float32Array.from({ length: count }, () => 0.2 + Math.random() * 0.5) };
  };
  const ash = airCloud(ASH_COUNT, 0x5d5752, 0.045, false);
  const airSparks = airCloud(SPARK_COUNT, 0xff8a33, 0.05, true);

  let target = 0;
  let level = 0;
  let elapsed = 0;
  let nextGust = 4;
  const emission = new Array(spots.length).fill(0);

  function setLevel(value) {
    target = Math.min(1, Math.max(0, value));
  }

  function spawnSmoke(spot) {
    const puff = smoke.find((p) => !p.alive);
    if (!puff) return;
    puff.alive = true;
    puff.age = 0;
    puff.life = 3.2 + Math.random() * 2;
    puff.rise = 0.35 + Math.random() * 0.3;
    puff.drift = (Math.random() - 0.5) * 0.2;
    puff.peak = 0.28 + level * 0.3;
    puff.sprite.position.set(spot.x + (Math.random() - 0.5) * 0.4, spot.y + 0.2, spot.z + (Math.random() - 0.5) * 0.4);
    puff.sprite.visible = true;
  }

  function update(dt) {
    elapsed += dt;
    level += (target - level) * Math.min(1, dt * 0.6);

    // Queimados crescem a partir do próprio limiar.
    spots.forEach((spot) => {
      const k = Math.min(1, Math.max(0, (level - spot.threshold) / 0.18));
      spot.material.opacity = 0.75 * k;
      spot.mesh.visible = k > 0;
      const s = spot.size * (0.5 + 0.5 * k);
      spot.mesh.scale.set(s, 1, s);
    });
    emberMaterial.opacity = Math.max(0, level - 0.25) * (0.7 + 0.3 * Math.sin(elapsed * 5));

    // Fumaça sobe das manchas ativas; mais delas conforme o nível cresce.
    spots.forEach((spot, i) => {
      if (level < spot.threshold + 0.05) return;
      emission[i] += dt * (0.35 + level * 1.1);
      if (emission[i] >= 1) {
        emission[i] = 0;
        spawnSmoke(spot);
      }
    });
    for (const p of smoke) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.alive = false;
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.y += p.rise * dt;
      p.sprite.position.x += (wind * 0.6 + p.drift) * dt;
      const size = 0.8 + t * 3;
      p.sprite.scale.set(size, size, 1);
      p.material.opacity = p.peak * Math.sin(Math.PI * t);
    }

    // Cinzas caem devagar e fagulhas sobem.
    const drift = (cloud, direction) => {
      const a = cloud.geometry.attributes.position.array;
      for (let i = 0; i < cloud.count; i++) {
        const k = i * 3;
        a[k + 1] += direction * cloud.speeds[i] * dt;
        a[k] += (wind * 0.8 + Math.sin(elapsed * 0.7 + i) * 0.2) * dt;
        if (a[k + 1] < -0.5 || a[k + 1] > 5 || a[k] > 11) {
          a[k] = (Math.random() - 0.5) * 22;
          a[k + 1] = direction > 0 ? -0.3 : 4.5 + Math.random() * 0.5;
          a[k + 2] = (Math.random() - 0.5) * 22;
        }
      }
      cloud.geometry.attributes.position.needsUpdate = true;
    };
    if (level > 0.02) {
      drift(ash, -1);
      ash.material.opacity = level * 0.55;
    } else ash.material.opacity = 0;
    if (level > 0.3) {
      drift(airSparks, 1);
      airSparks.material.opacity = (level - 0.3) * 1.2 * (0.7 + 0.3 * Math.sin(elapsed * 9));
    } else airSparks.material.opacity = 0;

    // Lufadas de poeira/detritos de vez em quando.
    nextGust -= dt * (0.3 + level);
    if (nextGust <= 0) {
      nextGust = 5 + Math.random() * 8;
      if (level > 0.2) {
        const spot = spots[Math.floor(Math.random() * spots.length)];
        dustPuff(fx, new THREE.Vector3(spot.x, spot.y, spot.z), {
          count: 6,
          spread: 0.5,
          duration: 1300,
          color: 0x6b5d4c,
          opacity: 0.22,
          rise: 1.4,
          size: 1.4,
        });
      }
    }
  }

  function reset() {
    target = 0;
    level = 0;
    for (const p of smoke) {
      p.alive = false;
      p.sprite.visible = false;
    }
  }

  function dispose() {
    scorchMap.dispose();
    smokeMap.dispose();
    smoke.forEach((p) => p.material.dispose());
    emberGeometry.dispose();
    emberMaterial.dispose();
    disposeObject(group);
  }

  return {
    group,
    setLevel,
    update,
    reset,
    dispose,
    get level() {
      return level;
    },
  };
}
