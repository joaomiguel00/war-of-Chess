import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WHITE, BLACK } from '../chess/moveGen.js';
import { disposeObject } from './animation.js';
import { getWeather } from './weather.js';
import { THEMES } from './themes.js';

// Céu, névoa, floresta distante, bandeiras e partículas de clima. O terreno,
// os braseiros, o acampamento e o cemitério ficam em módulos próprios
// (ver battlefield.js); aqui é só a "atmosfera".

// Os adereços do cenário são estáticos: juntar tudo num mesh só por material
// derruba centenas de draw calls sem mudar nada visualmente.
function mergeInto(group, geometries, material, { shadows = true } = {}) {
  if (!geometries.length) return null;
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.receiveShadow = shadows;
  group.add(mesh);
  return mesh;
}

function placed(geometry, { position, rotation, scale }) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler());
  matrix.compose(
    position ?? new THREE.Vector3(),
    quaternion,
    scale ?? new THREE.Vector3(1, 1, 1),
  );
  return geometry.applyMatrix4(matrix);
}

const ORDER_COLOR = 0xff8c33;
const RUIN_COLOR = 0xd946ef;

export const GROUND_Y = -1.7;
const PLATFORM_TOP = -0.5;

// Para o que está longe e quase preto, sombreamento barato basta.
function distantMaterial(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// Os acampamentos ficam atrás de cada exército (eixo Z): ali a mata abre
// espaço e as árvores só aparecem bem ao fundo.
function inCampArc(angle) {
  return Math.abs(Math.sin(angle)) > 0.78;
}

// Horizonte conforme o tema: chão distante + pinheiros (floresta), dunas
// (deserto), picos nevados (montanha) ou um vulcão fumegante (vulcânico).
function buildScenery(group, weather, theme) {
  const groundColor = new THREE.Color(weather.ground);
  if (theme.ground) groundColor.lerp(new THREE.Color(theme.ground), theme.groundMix);
  const groundMaterial = distantMaterial(groundColor);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 18), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  group.add(ground);

  const trunkGeos = [];
  const foliageGeos = [];
  const bareGeos = [];
  const moundGeos = [];
  const rockGeos = [];
  const peakGeos = [];
  const capGeos = [];

  function pineAt(x, z, scale) {
    const trunkH = 0.7 * scale;
    trunkGeos.push(
      placed(new THREE.CylinderGeometry(0.06 * scale, 0.09 * scale, trunkH, 5), {
        position: new THREE.Vector3(x, GROUND_Y + trunkH / 2, z),
      }),
    );
    const tiers = 3 + Math.floor(Math.random() * 2);
    let y = GROUND_Y + trunkH * 0.8;
    let radius = (0.75 + Math.random() * 0.35) * scale;
    const tierH = (1.15 + Math.random() * 0.5) * scale;
    for (let t = 0; t < tiers; t++) {
      foliageGeos.push(
        placed(new THREE.ConeGeometry(radius, tierH, 6), {
          position: new THREE.Vector3(x, y + tierH / 2, z),
          rotation: new THREE.Euler(0, Math.random() * Math.PI, 0),
        }),
      );
      y += tierH * 0.62;
      radius *= 0.72;
    }
  }

  function bareAt(x, z, scale) {
    const h = (3 + Math.random() * 2.5) * scale;
    bareGeos.push(
      placed(new THREE.CylinderGeometry(0.05 * scale, 0.12 * scale, h, 5), {
        position: new THREE.Vector3(x, GROUND_Y + h / 2, z),
      }),
    );
    const branches = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branches; b++) {
      const bh = (0.8 + Math.random() * 1.1) * scale;
      const at = GROUND_Y + h * (0.5 + Math.random() * 0.45);
      const ang = Math.random() * Math.PI * 2;
      bareGeos.push(
        placed(new THREE.CylinderGeometry(0.025 * scale, 0.05 * scale, bh, 4), {
          position: new THREE.Vector3(
            x + Math.cos(ang) * bh * 0.28,
            at + bh * 0.28,
            z + Math.sin(ang) * bh * 0.28,
          ),
          rotation: new THREE.Euler(Math.cos(ang) * 0.9, 0, -Math.sin(ang) * 0.9),
        }),
      );
    }
  }

  function moundAt(x, z, size, flat = 0.4) {
    moundGeos.push(
      placed(new THREE.IcosahedronGeometry(size, 1), {
        position: new THREE.Vector3(x, GROUND_Y + size * 0.2, z),
        rotation: new THREE.Euler(Math.random() * 0.3, Math.random() * 3, Math.random() * 0.3),
        scale: new THREE.Vector3(1.4, flat, 1),
      }),
    );
  }

  function rockAt(x, z, size) {
    rockGeos.push(
      placed(new THREE.DodecahedronGeometry(size, 0), {
        position: new THREE.Vector3(x, GROUND_Y + size * 0.35, z),
        rotation: new THREE.Euler(Math.random(), Math.random() * 3, Math.random()),
        scale: new THREE.Vector3(1, 0.6 + Math.random() * 0.5, 1),
      }),
    );
  }

  function peakAt(x, z, radius, height, withCap) {
    peakGeos.push(
      placed(new THREE.ConeGeometry(radius, height, 7, 1), {
        position: new THREE.Vector3(x, GROUND_Y + height / 2 - 0.5, z),
        rotation: new THREE.Euler(0, Math.random() * Math.PI, 0),
      }),
    );
    if (withCap) {
      const capH = height * 0.32;
      capGeos.push(
        placed(new THREE.ConeGeometry(radius * 0.34, capH, 7, 1), {
          position: new THREE.Vector3(x, GROUND_Y + height - capH / 2 - 0.45, z),
          rotation: new THREE.Euler(0, Math.random() * Math.PI, 0),
        }),
      );
    }
  }

  const ring = (count, rMin, rMax, fn) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = inCampArc(angle) ? Math.max(rMin, 33) + Math.random() * 12 : rMin + Math.random() * (rMax - rMin);
      fn(Math.cos(angle) * radius, Math.sin(angle) * radius, radius);
    }
  };

  const extras = {};
  if (theme.scenery === 'dunes') {
    ring(34, 14, 48, (x, z, r) => moundAt(x, z, 2.2 + Math.random() * 4 + r * 0.05, 0.28 + Math.random() * 0.12));
    ring(14, 12, 30, (x, z) => rockAt(x, z, 0.3 + Math.random() * 0.8));
  } else if (theme.scenery === 'peaks') {
    ring(34, 13, 36, (x, z, r) => pineAt(x, z, 1 + Math.random() * 1.2 + r * 0.03));
    ring(18, 12, 34, (x, z) => rockAt(x, z, 0.5 + Math.random() * 1.4));
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
      const r = 44 + Math.random() * 10;
      peakAt(Math.cos(angle) * r, Math.sin(angle) * r, 7 + Math.random() * 7, 14 + Math.random() * 14, true);
    }
  } else if (theme.scenery === 'volcano') {
    ring(26, 13, 38, (x, z, r) => bareAt(x, z, 0.8 + Math.random() * 0.8 + r * 0.02));
    ring(30, 12, 40, (x, z) => rockAt(x, z, 0.4 + Math.random() * 1.6));
    // O vulcão: um cone largo atrás do exército da Ruína, com a cratera em brasa.
    const vx = 14;
    const vz = 46;
    peakAt(vx, vz, 16, 22, false);
    const crater = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 4.4, 0.8, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false, side: THREE.DoubleSide, fog: false }),
    );
    crater.position.set(vx, GROUND_Y + 21.1, vz);
    group.add(crater);
    extras.volcano = { x: vx, y: GROUND_Y + 21.6, z: vz, crater };
  } else {
    ring(64, 13, 39, (x, z, r) => {
      const scale = 1 + Math.random() * 1.4 + r * 0.03;
      if (Math.random() < 0.78) pineAt(x, z, scale);
      else bareAt(x, z, scale);
    });
    ring(26, 14, 38, (x, z) => moundAt(x, z, 0.5 + Math.random() * 1.8, 0.45));
  }

  const moundColor = new THREE.Color(theme.mounds ?? weather.mounds);
  mergeInto(group, trunkGeos, distantMaterial(0x241c2c), { shadows: false });
  mergeInto(group, foliageGeos, distantMaterial(theme.scenery === 'peaks' ? 0x1c2630 : 0x1b1730), { shadows: false });
  mergeInto(group, bareGeos, distantMaterial(theme.scenery === 'volcano' ? 0x120c0a : 0x181320), { shadows: false });
  mergeInto(group, moundGeos, distantMaterial(moundColor), { shadows: false });
  mergeInto(group, rockGeos, distantMaterial(theme.scenery === 'volcano' ? 0x16110f : 0x3a3a42), { shadows: false });
  mergeInto(group, peakGeos, distantMaterial(theme.scenery === 'volcano' ? 0x1a1210 : 0x4a5262), { shadows: false });
  mergeInto(group, capGeos, distantMaterial(0xe8eef8), { shadows: false });
  return extras;
}

// Fumaça grossa subindo da cratera do vulcão.
function buildPlume(group, volcano) {
  if (!volcano) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const puffs = [];
  for (let i = 0; i < 14; i++) {
    const material = new THREE.SpriteMaterial({ map: texture, color: 0x2a1c18, transparent: true, depthWrite: false, fog: false });
    const sprite = new THREE.Sprite(material);
    group.add(sprite);
    puffs.push({ sprite, material, age: (i / 14) * 12 });
  }
  return { puffs, volcano, texture };
}

// Olhos azuis brilhando na escuridão da mata (só onde é escuro de verdade).
function buildEyes(group) {
  const eyes = [];
  const material = new THREE.MeshBasicMaterial({ color: 0x74d0ff, toneMapped: false });
  for (let i = 0; i < 9; i++) {
    let angle = Math.random() * Math.PI * 2;
    if (inCampArc(angle)) angle += Math.PI / 2;
    const radius = 13 + Math.random() * 14;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = GROUND_Y + 0.7 + Math.random() * 1.4;
    const pair = new THREE.Group();
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), material);
      eye.position.set(side * 0.14, 0, 0);
      pair.add(eye);
    }
    pair.position.set(x, y, z);
    pair.lookAt(0, y, 0);
    group.add(pair);
    eyes.push({ pair, phase: Math.random() * Math.PI * 2, blinkAt: 2 + Math.random() * 6 });
  }
  return { eyes, material };
}

// Névoa baixa: discos translúcidos girando devagar junto ao chão.
function buildGroundFog(group, weather) {
  const layers = [];
  for (let i = 0; i < 4; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x6f6a8a,
      transparent: true,
      opacity: 0.08 + Math.random() * 0.06,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    material.color.set(weather.fogColor).lerp(new THREE.Color(0xffffff), 0.25);
    const radius = 10 + Math.random() * 5;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 9), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(
      (Math.random() - 0.5) * 6,
      GROUND_Y + 0.35 + i * 0.3,
      (Math.random() - 0.5) * 6,
    );
    disc.renderOrder = -1;
    group.add(disc);
    layers.push({ disc, material, speed: (Math.random() - 0.5) * 0.06, baseOpacity: material.opacity });
  }
  return layers;
}

// Bandeiras dos dois exércitos, com pano ondulando ao vento.
function buildBanners(group) {
  const banners = [];
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b3128,
    roughness: 0.7,
    metalness: 0.3,
    flatShading: true,
  });

  const spots = [
    { x: -7.4, z: -2.2, color: WHITE },
    { x: 7.4, z: -2.2, color: WHITE },
    { x: -7.4, z: 2.2, color: BLACK },
    { x: 7.4, z: 2.2, color: BLACK },
  ];

  for (const spot of spots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 5), poleMaterial);
    pole.position.set(spot.x, PLATFORM_TOP + 1.7, spot.z);
    pole.castShadow = true;
    group.add(pole);

    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), poleMaterial);
    finial.position.set(spot.x, PLATFORM_TOP + 3.5, spot.z);
    group.add(finial);

    const isOrder = spot.color === WHITE;
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 1.5, 6, 8),
      new THREE.MeshStandardMaterial({
        color: isOrder ? 0x4a3418 : 0x2c1030,
        emissive: isOrder ? 0x3a1e05 : 0x2a0630,
        emissiveIntensity: 0.6,
        roughness: 0.9,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    );
    const inward = spot.x > 0 ? -1 : 1;
    cloth.position.set(spot.x + inward * 0.5, PLATFORM_TOP + 2.5, spot.z);
    cloth.rotation.y = Math.PI / 2;
    cloth.castShadow = true;
    group.add(cloth);

    const emblem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: isOrder ? ORDER_COLOR : RUIN_COLOR, toneMapped: false }),
    );
    emblem.position.set(cloth.position.x, PLATFORM_TOP + 2.5, spot.z);
    emblem.scale.set(0.3, 1.2, 0.85);
    group.add(emblem);

    banners.push({
      cloth,
      emblem,
      basePositions: cloth.geometry.attributes.position.array.slice(),
      grip: inward,
      phase: Math.random() * Math.PI * 2,
    });
  }

  return banners;
}

function pointCloud(group, { count, spread, height, bottom, color, size }) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spread;
    positions[i * 3 + 1] = bottom + Math.random() * height;
    positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  group.add(points);
  return { points, geometry, material, count };
}

// Chuva: segmentos que caem e reciclam; o vento inclina os pingos.
function buildRain(group) {
  const count = 1100;
  const positions = new Float32Array(count * 6);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 26;
    const y = Math.random() * 16;
    const z = (Math.random() - 0.5) * 26;
    const length = 0.25 + Math.random() * 0.3;
    positions.set([x, y, z, x, y - length, z], i * 6);
    speeds[i] = 10 + Math.random() * 7;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x9fb0cc,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(geometry, material);
  rain.visible = false;
  group.add(rain);
  return { rain, geometry, material, speeds, count };
}

export function createEnvironment({ scene, lights, weather: weatherId, theme = THEMES.acampamento, onLightning }) {
  const weather = getWeather(weatherId);
  const group = new THREE.Group();
  scene.add(group);

  // Céu e névoa do clima, puxados para o tom do tema.
  const skyColor = new THREE.Color(weather.background);
  if (theme.sky) skyColor.lerp(new THREE.Color(theme.sky), theme.skyMix);
  const fogColor = new THREE.Color(weather.fogColor);
  if (theme.fog) fogColor.lerp(new THREE.Color(theme.fog), theme.fogMix);
  scene.background = skyColor.clone();
  if (scene.fog) {
    scene.fog.color.copy(fogColor);
    scene.fog.density = weather.fogDensity;
  }

  const scenery = buildScenery(group, weather, theme);
  const plume = buildPlume(group, scenery.volcano);
  const eyesLayer = buildEyes(group);
  const fogLayers = buildGroundFog(group, weather);
  const banners = buildBanners(group);
  const dust = pointCloud(group, { count: 420, spread: 18, height: 7, bottom: -1, color: 0xb3a892, size: 0.045 });
  const snow = pointCloud(group, { count: 900, spread: 34, height: 18, bottom: GROUND_Y, color: 0xdfe4ff, size: 0.09 });
  const sand = pointCloud(group, { count: 1600, spread: 34, height: 7, bottom: GROUND_Y, color: 0xc89560, size: 0.075 });
  const rain = buildRain(group);
  const dustSpeeds = Float32Array.from({ length: dust.count }, () => 0.05 + Math.random() * 0.12);
  const snowSpeeds = Float32Array.from({ length: snow.count }, () => 0.7 + Math.random() * 1.1);
  const snowSway = Float32Array.from({ length: snow.count }, () => Math.random() * Math.PI * 2);
  const sandSpeeds = Float32Array.from({ length: sand.count }, () => 4 + Math.random() * 5);

  // Olhos só brilham no escuro, e só onde há mata.
  const hasWoods = theme.scenery === 'pines' || theme.scenery === 'peaks';
  eyesLayer.eyes.forEach((e) => (e.pair.visible = hasWoods && weather.darkness > 0.4));

  // Luz dos relâmpagos: fonte própria, então nunca briga com a cena de vitória.
  // Só existe em clima com raios: cada luz a mais pesa em todo pixel da cena.
  const lightningLight = weather.lightning ? new THREE.DirectionalLight(0xc8d4ff, 0) : null;
  if (lightningLight) {
    lightningLight.position.set(-6, 14, 8);
    group.add(lightningLight);
  }
  const lightning = { next: 4 + Math.random() * 5, age: 99, pulses: [] };
  const flashColor = new THREE.Color(0x5a6388);

  const base = {
    ambient: lights.ambient.intensity * weather.light.ambient,
    hemi: lights.hemi.intensity * weather.light.hemi,
    key: lights.key.intensity * weather.light.key,
    fill: lights.fill.intensity * weather.light.fill,
    fogDensity: weather.fogDensity,
    background: skyColor.clone(),
  };
  const original = {
    ambient: lights.ambient.intensity,
    hemi: lights.hemi.intensity,
    key: lights.key.intensity,
    fill: lights.fill.intensity,
  };
  const darkBackground = skyColor.clone().multiplyScalar(0.45);
  const currentBackground = new THREE.Color();

  let progress = 0;
  let rainLevel = 0;
  let snowLevel = 0;
  let sandLevel = 0;
  let flash = 0;
  let elapsed = 0;
  // Multiplicadores externos: atos da partida e rajadas perto do rei.
  let windScale = 1;
  let particleBoost = 1;

  // progress: 0 no início da partida, 1 quando o massacre já aconteceu.
  function setProgress(value) {
    progress = Math.min(1, Math.max(0, value));
    snowLevel = weather.snow > 0 ? Math.min(1, weather.snow + progress * 1.1) : 0;
    const late = weather.lateRain ? Math.min(1, Math.max(0, (progress - 0.7) / 0.3)) : 0;
    rainLevel = Math.min(1, weather.rain + late + (weather.rain > 0 ? progress * 0.15 : 0));
    sandLevel = weather.sand > 0 ? Math.min(1, weather.sand * (0.75 + progress * 0.25)) : 0;

    lights.ambient.intensity = base.ambient * (1 - 0.4 * progress);
    lights.hemi.intensity = base.hemi * (1 - 0.55 * progress);
    lights.key.intensity = base.key * (1 - 0.5 * progress);
    lights.fill.intensity = base.fill * (1 - 0.45 * progress);

    if (scene.fog) scene.fog.density = base.fogDensity + 0.025 * progress;
    currentBackground.copy(base.background).lerp(darkBackground, progress);
    scene.background.copy(currentBackground);

    snow.material.opacity = snowLevel > 0 ? 0.35 + snowLevel * 0.5 : 0;
    snow.points.visible = snowLevel > 0.01;
    rain.material.opacity = rainLevel * 0.32;
    rain.rain.visible = rainLevel > 0.01;
    sand.material.opacity = sandLevel * 0.5;
    sand.points.visible = sandLevel > 0.01;
    applyDust();
  }

  function applyDust() {
    dust.material.opacity = Math.min(0.85, weather.dust * (1 - snowLevel * 0.6) * particleBoost);
    dust.points.visible = dust.material.opacity > 0.01;
  }

  function setWindScale(value) {
    windScale = value;
  }

  function setParticleBoost(value) {
    particleBoost = value;
    applyDust();
  }

  // Relâmpago sob demanda (eventos perto do rei ameaçado).
  function strikeLightning(power = 1) {
    lightning.age = 0;
    lightning.next = Math.max(lightning.next, 3);
    lightning.pulses = [
      { at: 0, power },
      { at: 0.1, power: power * 0.6 },
    ];
  }

  function updateLightning(dt) {
    lightning.age += dt;
    if (weather.lightning) lightning.next -= dt;
    if (weather.lightning && lightning.next <= 0) {
      lightning.next = 6 + Math.random() * 10;
      lightning.age = 0;
      // Duas ou três piscadas, a primeira mais forte.
      lightning.pulses = [0, 0.09 + Math.random() * 0.05, 0.24 + Math.random() * 0.1]
        .slice(0, 2 + Math.round(Math.random()))
        .map((at, i) => ({ at, power: i === 0 ? 1 : 0.5 + Math.random() * 0.4 }));
      lightningLight.position.set((Math.random() - 0.5) * 24, 14, (Math.random() - 0.5) * 24);
      onLightning?.(0.4 + Math.random() * 0.6);
    }
    flash = 0;
    for (const pulse of lightning.pulses) {
      const t = lightning.age - pulse.at;
      if (t >= 0 && t < 0.35) flash = Math.max(flash, pulse.power * Math.exp(-t * 14));
    }
    if (lightningLight) lightningLight.intensity = flash * 7;
    if (flash > 0.002) scene.background.copy(currentBackground).lerp(flashColor, flash * 0.7);
    else if (lightning.age < 1) scene.background.copy(currentBackground);
  }

  function update(dt) {
    elapsed += dt;
    const wind = weather.wind * windScale;

    if (plume) {
      for (const p of plume.puffs) {
        p.age = (p.age + dt) % 12;
        const t = p.age / 12;
        p.sprite.position.set(plume.volcano.x + t * 9 + Math.sin(t * 6) * 1.2, plume.volcano.y + t * 16, plume.volcano.z + t * 3);
        p.sprite.scale.setScalar(4 + t * 14);
        p.material.opacity = Math.sin(Math.PI * t) * 0.75;
      }
      plume.volcano.crater.material.color.setRGB(1, 0.3 + 0.08 * Math.sin(elapsed * 2.3), 0.08);
    }

    for (const layer of fogLayers) {
      layer.disc.rotation.z += layer.speed * dt * (1 + wind * 3);
      layer.material.opacity =
        layer.baseOpacity *
        weather.groundFog *
        (0.75 + 0.25 * Math.sin(elapsed * 0.3 + layer.speed * 10)) *
        (1 + progress * 0.8);
    }

    // Bandeiras: vento forte = pano batendo rápido e largo.
    const waveSpeed = 1.6 + wind * 3;
    const waveSize = 0.08 + wind * 0.16;
    for (const banner of banners) {
      const position = banner.cloth.geometry.attributes.position;
      const array = position.array;
      for (let i = 0; i < array.length; i += 3) {
        const x = banner.basePositions[i];
        const y = banner.basePositions[i + 1];
        const grip = (x * banner.grip + 0.48) / 0.95;
        array[i + 2] =
          Math.sin(elapsed * waveSpeed + x * 3 + banner.phase) * waveSize * grip +
          Math.sin(elapsed * waveSpeed * 0.55 + y * 2) * waveSize * 0.35 * grip;
      }
      position.needsUpdate = true;
      banner.emblem.position.x =
        banner.cloth.position.x + Math.sin(elapsed * waveSpeed + banner.phase) * waveSize * 0.5;
    }

    if (dust.points.visible) {
      const a = dust.geometry.attributes.position.array;
      for (let i = 0; i < dust.count; i++) {
        const k = i * 3;
        a[k + 1] += dustSpeeds[i] * dt;
        a[k] += Math.sin(elapsed * 0.4 + i) * 0.004 + wind * dt * 0.6;
        if (a[k + 1] > 6.5 || a[k] > 9) {
          a[k + 1] = -1;
          a[k] = (Math.random() - 0.5) * 18;
          a[k + 2] = (Math.random() - 0.5) * 18;
        }
      }
      dust.geometry.attributes.position.needsUpdate = true;
    }

    if (snow.points.visible) {
      const a = snow.geometry.attributes.position.array;
      for (let i = 0; i < snow.count; i++) {
        const k = i * 3;
        a[k + 1] -= snowSpeeds[i] * dt;
        a[k] += Math.sin(elapsed * 0.8 + snowSway[i]) * 0.01 + wind * dt * 0.9;
        if (a[k + 1] < GROUND_Y) {
          a[k] = (Math.random() - 0.5) * 34;
          a[k + 1] = 17 + Math.random() * 2;
          a[k + 2] = (Math.random() - 0.5) * 34;
        }
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }

    // Areia: corre na horizontal, rodopia e recicla do outro lado.
    if (sand.points.visible) {
      const a = sand.geometry.attributes.position.array;
      for (let i = 0; i < sand.count; i++) {
        const k = i * 3;
        a[k] += sandSpeeds[i] * dt;
        a[k + 1] += Math.sin(elapsed * 2.1 + i * 0.37) * dt * 0.6;
        a[k + 2] += Math.cos(elapsed * 1.3 + i) * dt * 0.8;
        if (a[k] > 17) {
          a[k] = -17;
          a[k + 1] = GROUND_Y + Math.random() * 7;
          a[k + 2] = (Math.random() - 0.5) * 34;
        }
      }
      sand.geometry.attributes.position.needsUpdate = true;
    }

    for (const e of eyesLayer.eyes) {
      const t = (elapsed + e.phase) % e.blinkAt;
      const open = t > e.blinkAt - 0.16 ? Math.abs(Math.sin((t - (e.blinkAt - 0.16)) * 20)) : 1;
      e.pair.scale.y = 0.2 + open * 0.8;
    }

    if (rain.rain.visible) {
      const a = rain.geometry.attributes.position.array;
      const slant = wind * 0.22;
      for (let i = 0; i < rain.count; i++) {
        const k = i * 6;
        const fall = rain.speeds[i] * dt;
        a[k + 1] -= fall;
        a[k + 4] -= fall;
        a[k] += fall * slant;
        a[k + 3] += fall * slant;
        if (a[k + 4] < GROUND_Y) {
          const x = (Math.random() - 0.5) * 26 - slant * 8;
          const z = (Math.random() - 0.5) * 26;
          const length = 0.3 + Math.random() * 0.35;
          const y = 15 + Math.random() * 3;
          a.set([x, y, z, x - length * slant, y - length, z], k);
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }

    updateLightning(dt);
  }

  function dispose() {
    plume?.texture.dispose();
    plume?.puffs.forEach((p) => p.material.dispose());
    disposeObject(group);
    lights.ambient.intensity = original.ambient;
    lights.hemi.intensity = original.hemi;
    lights.key.intensity = original.key;
    lights.fill.intensity = original.fill;
  }

  setProgress(0);

  return {
    setProgress,
    update,
    dispose,
    group,
    weather,
    get progress() {
      return progress;
    },
    get rainLevel() {
      return rainLevel;
    },
    get wind() {
      return weather.wind * windScale;
    },
    setWindScale,
    setParticleBoost,
    strikeLightning,
    fogColor,
    // 0..1 enquanto um relâmpago ilumina o céu.
    get flash() {
      return flash;
    },
  };
}
