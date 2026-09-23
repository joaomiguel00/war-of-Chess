import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObject } from '../animation.js';
import { BRAZIER_SPOTS } from './terrain.js';

// Braseiros nos quatro cantos do tabuleiro: tripé de ferro, bacia com
// brasas, chama animada, fagulhas subindo e uma luz pontual que tremula.
// Eles são luz de verdade da cena — pesam mais em climas escuros.

const EMBERS_PER_BRAZIER = 26;

function flameMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function buildBrazier(x, y, z) {
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 0.55, metalness: 0.85, flatShading: true });
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // Tripé.
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.3;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.95, 5), iron);
    leg.position.set(Math.cos(angle) * 0.2, 0.45, Math.sin(angle) * 0.2);
    leg.rotation.set(Math.sin(angle) * 0.32, 0, -Math.cos(angle) * 0.32);
    leg.castShadow = true;
    group.add(leg);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 5, 12), iron);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.42;
  group.add(ring);

  // Bacia aberta com aro.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.2, 0.26, 10, 1, true), iron);
  bowl.position.y = 0.98;
  bowl.material.side = THREE.DoubleSide;
  bowl.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 5, 14), iron);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 1.11;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), iron);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = 0.86;
  group.add(bowl, rim, bottom);

  // Brasas.
  const coalMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a0d08,
    emissive: 0xff4a12,
    emissiveIntensity: 1.2,
    roughness: 0.9,
    flatShading: true,
  });
  const coals = [];
  for (let i = 0; i < 9; i++) {
    const coal = new THREE.DodecahedronGeometry(0.06 + Math.random() * 0.04, 0);
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.22;
    coal.rotateX(Math.random() * 3);
    coal.rotateY(Math.random() * 3);
    coal.translate(Math.cos(angle) * r, 1.02 + Math.random() * 0.05, Math.sin(angle) * r);
    coals.push(coal);
  }
  group.add(new THREE.Mesh(mergeGeometries(coals, false), coalMaterial));
  coals.forEach((g) => g.dispose());

  // Chama: línguas externas laranja e um núcleo claro.
  const tongues = [];
  const specs = [
    { color: 0xff5a14, opacity: 0.5, radius: 0.26, height: 0.8, offset: 0 },
    { color: 0xff8a2a, opacity: 0.6, radius: 0.2, height: 0.72, offset: 0.09 },
    { color: 0xff8a2a, opacity: 0.55, radius: 0.18, height: 0.6, offset: -0.09 },
    { color: 0xffd27a, opacity: 0.8, radius: 0.12, height: 0.5, offset: 0 },
  ];
  for (const spec of specs) {
    const material = flameMaterial(spec.color, spec.opacity);
    const geometry = new THREE.ConeGeometry(spec.radius, spec.height, 7, 3, true);
    geometry.translate(0, spec.height / 2, 0);
    const tongue = new THREE.Mesh(geometry, material);
    tongue.position.set(spec.offset, 1.04, spec.offset * 0.6);
    group.add(tongue);
    tongues.push({ mesh: tongue, material, base: spec.opacity, phase: Math.random() * 10, offset: spec.offset });
  }

  // Fagulhas que sobem e se apagam.
  const positions = new Float32Array(EMBERS_PER_BRAZIER * 3);
  const embers = [];
  for (let i = 0; i < EMBERS_PER_BRAZIER; i++) {
    embers.push({ life: Math.random(), speed: 0.6 + Math.random() * 0.8, drift: (Math.random() - 0.5) * 0.4, angle: Math.random() * Math.PI * 2 });
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const emberMaterial = new THREE.PointsMaterial({
    color: 0xffa040,
    size: 0.05,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const emberPoints = new THREE.Points(emberGeometry, emberMaterial);
  group.add(emberPoints);

  const light = new THREE.PointLight(0xff8a3a, 10, 9, 1.8);
  light.position.set(0, 1.45, 0);
  group.add(light);

  return { group, tongues, embers, emberGeometry, light, coalMaterial, phase: Math.random() * 10 };
}

export function createBraziers({ scene, heightAt, weather }) {
  const group = new THREE.Group();
  group.name = 'Braziers';
  scene.add(group);

  const braziers = BRAZIER_SPOTS.map(([x, z]) => {
    const b = buildBrazier(x, heightAt(x, z), z);
    group.add(b.group);
    return b;
  });

  // Mais peso de luz quanto mais escuro o clima.
  const baseIntensity = 5 + weather.darkness * 13;
  const wind = weather.wind;
  let elapsed = 0;
  let flare = 0;

  // Labareda momentânea (início da batalha).
  function flareUp(amount = 1) {
    flare = Math.max(flare, amount);
  }

  function update(dt) {
    elapsed += dt;
    flare = Math.max(0, flare - dt * 0.8);
    const boost = 1 + flare * 1.6;

    for (const b of braziers) {
      // Tremulação: soma de senos + um pouco de acaso, sem "piscar" duro.
      const flicker =
        0.8 +
        Math.sin(elapsed * 11 + b.phase) * 0.07 +
        Math.sin(elapsed * 23.7 + b.phase * 2) * 0.05 +
        Math.sin(elapsed * 5.3 + b.phase) * 0.06 +
        Math.random() * 0.06;
      b.light.intensity = baseIntensity * flicker * boost;
      b.coalMaterial.emissiveIntensity = 0.9 + flicker * 0.6 + flare;

      for (const t of b.tongues) {
        const s = Math.sin(elapsed * 9 + t.phase);
        t.mesh.scale.set(
          0.85 + 0.15 * s + flare * 0.3,
          (0.8 + 0.3 * Math.sin(elapsed * 13 + t.phase) + 0.1 * Math.random()) * (1 + flare * 0.9),
          0.85 + 0.15 * Math.cos(elapsed * 8 + t.phase) + flare * 0.3,
        );
        t.mesh.rotation.y += dt * (1.2 + t.offset * 4);
        // O vento deita a chama.
        t.mesh.rotation.z = -wind * 0.35 + Math.sin(elapsed * 6 + t.phase) * 0.08;
        t.material.opacity = t.base * (0.75 + 0.25 * flicker);
      }

      const array = b.emberGeometry.attributes.position.array;
      b.embers.forEach((e, i) => {
        e.life += dt * e.speed * 0.6;
        if (e.life > 1) {
          e.life = 0;
          e.angle = Math.random() * Math.PI * 2;
        }
        const r = 0.12 * (1 - e.life * 0.5);
        array[i * 3] = Math.cos(e.angle) * r + (e.drift + wind * 0.8) * e.life;
        array[i * 3 + 1] = 1.1 + e.life * (1.3 + flare);
        array[i * 3 + 2] = Math.sin(e.angle) * r + Math.sin(elapsed * 3 + i) * 0.05 * e.life;
      });
      b.emberGeometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    disposeObject(group);
  }

  return { group, update, flareUp, dispose };
}
