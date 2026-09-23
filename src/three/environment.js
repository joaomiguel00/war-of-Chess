import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WHITE, BLACK } from '../chess/moveGen.js';
import { disposeObject } from './animation.js';

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

const GROUND_Y = -1.7;
const PLATFORM_TOP = -0.5;

function stoneMaterial(color, roughness = 0.95) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.08, flatShading: true });
}

// Para o que está longe e quase preto, sombreamento barato basta.
function distantMaterial(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

// Plataforma octogonal em dois degraus, sob o tabuleiro.
function buildPlatform(group) {
  const tiers = [
    { radius: 6.6, height: 0.5, y: PLATFORM_TOP - 0.25, color: 0x2a2830 },
    { radius: 7.6, height: 0.5, y: PLATFORM_TOP - 0.72, color: 0x211f27 },
    { radius: 8.8, height: 0.6, y: PLATFORM_TOP - 1.25, color: 0x1a181e },
  ];

  for (const tier of tiers) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(tier.radius, tier.radius + 0.25, tier.height, 8),
      stoneMaterial(tier.color),
    );
    mesh.position.y = tier.y;
    mesh.rotation.y = Math.PI / 8;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Blocos soltos na borda, para a silhueta não ficar perfeita demais.
  const blocks = [];
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.1;
    const radius = 6.9 + Math.random() * 0.5;
    const size = 0.35 + Math.random() * 0.4;
    blocks.push(
      placed(new THREE.BoxGeometry(size, size * 0.6, size * 0.8), {
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          PLATFORM_TOP - 0.18 - Math.random() * 0.1,
          Math.sin(angle) * radius,
        ),
        rotation: new THREE.Euler(Math.random() * 0.2, angle + Math.random(), Math.random() * 0.2),
      }),
    );
  }
  mergeInto(group, blocks, stoneMaterial(0x26242c));
}

// Floresta noturna nevada: chão de neve, pinheiros em silhueta, tocos com
// neve e olhos azuis espreitando na escuridão.
function buildForest(group) {
  // Chão de neve azulada; o raio acompanha o alcance da névoa.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(46, 16),
    distantMaterial(0x2b2748),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  group.add(ground);

  const trunkGeos = [];
  const foliageGeos = [];
  const bareGeos = [];
  const snowGeos = [];

  // Pinheiro: tronco fino + cones empilhados que estreitam para cima.
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

  // Árvore seca: tronco alto e ramos tortos apontando pra cima.
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

  // Anel de árvores ao redor da arena, mais densas ao longe.
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 9.5 + Math.random() * 28;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const scale = 1 + Math.random() * 1.4 + radius * 0.03;
    if (Math.random() < 0.78) pineAt(x, z, scale);
    else bareAt(x, z, scale);
  }

  // Montes de neve e pedras baixas espalhados.
  for (let i = 0; i < 26; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 8 + Math.random() * 26;
    const size = 0.5 + Math.random() * 1.8;
    snowGeos.push(
      placed(new THREE.IcosahedronGeometry(size, 0), {
        position: new THREE.Vector3(
          Math.cos(angle) * radius,
          GROUND_Y + size * 0.28,
          Math.sin(angle) * radius,
        ),
        rotation: new THREE.Euler(Math.random(), Math.random(), Math.random()),
        scale: new THREE.Vector3(1, 0.4 + Math.random() * 0.3, 1),
      }),
    );
  }

  mergeInto(group, trunkGeos, distantMaterial(0x241c2c), { shadows: false });
  mergeInto(group, foliageGeos, distantMaterial(0x1b1730), { shadows: false });
  mergeInto(group, bareGeos, distantMaterial(0x181320), { shadows: false });
  mergeInto(group, snowGeos, distantMaterial(0x3c3960), { shadows: false });
}

// Olhos azuis brilhando na escuridão da mata.
function buildEyes(group) {
  const eyes = [];
  const material = new THREE.MeshBasicMaterial({ color: 0x74d0ff, toneMapped: false });
  for (let i = 0; i < 9; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 11 + Math.random() * 16;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = GROUND_Y + 0.7 + Math.random() * 1.4;
    const pair = new THREE.Group();
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), material);
      eye.position.set(side * 0.14, 0, 0); // deslocamento local: dois olhos lado a lado
      pair.add(eye);
    }
    pair.position.set(x, y, z);
    // Vira o par para o centro (o tabuleiro), mantendo os olhos lado a lado.
    pair.lookAt(0, y, 0);
    group.add(pair);
    eyes.push({ pair, phase: Math.random() * Math.PI * 2, blinkAt: 2 + Math.random() * 6 });
  }
  return { eyes, material };
}

// Névoa baixa: discos translúcidos girando devagar junto ao chão.
function buildGroundFog(group) {
  // Poucas camadas e raios contidos: discos transparentes grandes e
  // sobrepostos são caros em preenchimento, sobretudo em GPU integrada.
  const layers = [];
  const texture = null;
  for (let i = 0; i < 4; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x6f6a8a,
      transparent: true,
      opacity: 0.08 + Math.random() * 0.06,
      depthWrite: false,
      side: THREE.DoubleSide,
      map: texture,
    });
    const radius = 8 + Math.random() * 5;
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

// Tochas: poste, braseiro, chama facetada e luz que treme.
function buildTorches(group) {
  const torches = [];
  const poleMaterial = stoneMaterial(0x272129, 0.8);
  const bowlMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b5a33,
    roughness: 0.5,
    metalness: 0.85,
    flatShading: true,
  });

  const spots = [
    [5.4, 5.4],
    [-5.4, 5.4],
    [5.4, -5.4],
    [-5.4, -5.4],
  ];

  for (const [x, z] of spots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 2.4, 6), poleMaterial);
    pole.position.set(x, PLATFORM_TOP + 1.2, z);
    pole.castShadow = true;
    group.add(pole);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.16, 0.34, 8), bowlMaterial);
    bowl.position.set(x, PLATFORM_TOP + 2.5, z);
    group.add(bowl);

    const flameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb257,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    });
    const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), flameMaterial);
    flame.position.set(x, PLATFORM_TOP + 2.82, z);
    flame.scale.y = 1.6;
    group.add(flame);

    const light = new THREE.PointLight(0xff9a3c, 14, 16, 2);
    light.position.set(x, PLATFORM_TOP + 2.9, z);
    group.add(light);

    torches.push({ flame, flameMaterial, light, phase: Math.random() * Math.PI * 2 });
  }

  return torches;
}

// Bandeiras dos dois exércitos, com pano ondulando.
function buildBanners(group) {
  const banners = [];
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b3128,
    roughness: 0.7,
    metalness: 0.3,
    flatShading: true,
  });

  // Nos flancos: os jogadores olham o tabuleiro pelo eixo Z, que fica livre.
  const spots = [
    { x: -7, z: -2.2, color: WHITE },
    { x: 7, z: -2.2, color: WHITE },
    { x: -7, z: 2.2, color: BLACK },
    { x: 7, z: 2.2, color: BLACK },
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

    // Emblema simples no centro do pano.
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

// Poeira suspensa sobre o tabuleiro.
function buildDust(group) {
  const count = 420;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = Math.random() * 7 - 1;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    speeds[i] = 0.05 + Math.random() * 0.12;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xb3a892,
    size: 0.045,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  group.add(points);
  return { points, geometry, material, speeds, count };
}

// Chuva leve: segmentos verticais que caem e reciclam.
function buildRain(group) {
  const count = 700;
  const positions = new Float32Array(count * 6);
  const speeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 26;
    const y = Math.random() * 16;
    const z = (Math.random() - 0.5) * 26;
    const length = 0.25 + Math.random() * 0.3;
    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y - length;
    positions[i * 6 + 5] = z;
    speeds[i] = 9 + Math.random() * 7;
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

// Neve: flocos que caem devagar balançando de um lado para o outro.
function buildSnow(group) {
  const count = 900;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const sway = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 34;
    positions[i * 3 + 1] = Math.random() * 18 + GROUND_Y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
    speeds[i] = 0.7 + Math.random() * 1.1;
    sway[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xdfe4ff,
    size: 0.09,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const snow = new THREE.Points(geometry, material);
  snow.visible = false;
  group.add(snow);
  return { snow, geometry, material, speeds, sway, count };
}

export function createEnvironment({ scene, lights }) {
  const group = new THREE.Group();
  scene.add(group);

  buildPlatform(group);
  buildForest(group);
  const eyesLayer = buildEyes(group);
  const fogLayers = buildGroundFog(group);
  const torches = buildTorches(group);
  const banners = buildBanners(group);
  const dust = buildDust(group);
  const rain = buildRain(group);
  const snow = buildSnow(group);

  // Guarda os valores iniciais para o clima poder evoluir a partir deles.
  const base = {
    ambient: lights.ambient.intensity,
    hemi: lights.hemi.intensity,
    key: lights.key.intensity,
    fill: lights.fill.intensity,
    fogDensity: scene.fog ? scene.fog.density : 0.035,
    background: scene.background ? scene.background.clone() : new THREE.Color(0x1a0f2e),
  };
  // A tempestade de neve escurece o roxo do céu.
  const darkBackground = new THREE.Color(0x0d0819);

  let progress = 0;
  let rainLevel = 0;
  let snowLevel = 0;
  let elapsed = 0;

  // progress: 0 no início da partida, 1 quando o massacre já aconteceu.
  function setProgress(value) {
    progress = Math.min(1, Math.max(0, value));
    // Já neva de leve desde o começo e engrossa rápido com as capturas.
    snowLevel = Math.min(1, 0.2 + progress * 1.1);
    // A chuva/aguaceiro gelado só entra na reta final, por cima da neve.
    rainLevel = Math.min(1, Math.max(0, (progress - 0.7) / 0.3));

    lights.ambient.intensity = base.ambient * (1 - 0.4 * progress);
    lights.hemi.intensity = base.hemi * (1 - 0.55 * progress);
    lights.key.intensity = base.key * (1 - 0.5 * progress);
    lights.fill.intensity = base.fill * (1 - 0.45 * progress);

    if (scene.fog) scene.fog.density = base.fogDensity + 0.03 * progress;
    if (scene.background?.copy) {
      scene.background.copy(base.background).lerp(darkBackground, progress);
    }

    for (const torch of torches) {
      // As tochas ganham peso relativo conforme o resto escurece.
      torch.light.distance = 16 + progress * 5;
      torch.baseIntensity = 14 + progress * 10;
    }

    snow.material.opacity = 0.35 + snowLevel * 0.5;
    snow.snow.visible = true;

    rain.material.opacity = rainLevel * 0.3;
    rain.rain.visible = rainLevel > 0.01;

    dust.material.opacity = 0.4 * (1 - snowLevel * 0.6);
  }

  function update(dt) {
    elapsed += dt;

    for (const layer of fogLayers) {
      layer.disc.rotation.z += layer.speed * dt;
      layer.material.opacity =
        layer.baseOpacity * (0.75 + 0.25 * Math.sin(elapsed * 0.3 + layer.speed * 10)) * (1 + progress * 0.8);
    }

    for (const torch of torches) {
      const flicker = 0.78 + Math.random() * 0.22 + Math.sin(elapsed * 9 + torch.phase) * 0.08;
      torch.light.intensity = (torch.baseIntensity ?? 14) * flicker;
      torch.flame.scale.set(0.9 + flicker * 0.18, 1.35 + flicker * 0.4, 0.9 + flicker * 0.18);
      torch.flame.rotation.y += dt * 1.6;
      torch.flameMaterial.opacity = 0.8 + flicker * 0.18;
    }

    for (const banner of banners) {
      const position = banner.cloth.geometry.attributes.position;
      const array = position.array;
      for (let i = 0; i < array.length; i += 3) {
        const x = banner.basePositions[i];
        const y = banner.basePositions[i + 1];
        // O pano ondula mais na ponta livre, longe do mastro.
        // Ondula mais na ponta solta, longe do mastro.
        const grip = (x * banner.grip + 0.48) / 0.95;
        array[i + 2] =
          Math.sin(elapsed * 2.4 + x * 3 + banner.phase) * 0.14 * grip +
          Math.sin(elapsed * 1.3 + y * 2) * 0.05 * grip;
      }
      position.needsUpdate = true;
      banner.emblem.position.x =
        banner.cloth.position.x + Math.sin(elapsed * 2.4 + banner.phase) * 0.07;
    }

    const dustArray = dust.geometry.attributes.position.array;
    for (let i = 0; i < dust.count; i++) {
      const index = i * 3;
      dustArray[index + 1] += dust.speeds[i] * dt;
      dustArray[index] += Math.sin(elapsed * 0.4 + i) * 0.004;
      if (dustArray[index + 1] > 6.5) {
        dustArray[index + 1] = -1;
        dustArray[index] = (Math.random() - 0.5) * 18;
        dustArray[index + 2] = (Math.random() - 0.5) * 18;
      }
    }
    dust.geometry.attributes.position.needsUpdate = true;

    // Neve: cai devagar e balança; recicla ao tocar o chão.
    if (snow.snow.visible) {
      const snowArray = snow.geometry.attributes.position.array;
      for (let i = 0; i < snow.count; i++) {
        const index = i * 3;
        snowArray[index + 1] -= snow.speeds[i] * dt;
        snowArray[index] += Math.sin(elapsed * 0.8 + snow.sway[i]) * 0.01;
        if (snowArray[index + 1] < GROUND_Y) {
          snowArray[index] = (Math.random() - 0.5) * 34;
          snowArray[index + 1] = 17 + Math.random() * 2;
          snowArray[index + 2] = (Math.random() - 0.5) * 34;
        }
      }
      snow.geometry.attributes.position.needsUpdate = true;
    }

    // Olhos que brilham e piscam de vez em quando.
    for (const e of eyesLayer.eyes) {
      const t = (elapsed + e.phase) % e.blinkAt;
      // Pisca rápido perto do fim do ciclo.
      const open = t > e.blinkAt - 0.16 ? Math.abs(Math.sin((t - (e.blinkAt - 0.16)) * 20)) : 1;
      e.pair.scale.y = 0.2 + open * 0.8;
    }

    if (rain.rain.visible) {
      const rainArray = rain.geometry.attributes.position.array;
      for (let i = 0; i < rain.count; i++) {
        const index = i * 6;
        const fall = rain.speeds[i] * dt;
        rainArray[index + 1] -= fall;
        rainArray[index + 4] -= fall;
        if (rainArray[index + 4] < GROUND_Y) {
          const x = (Math.random() - 0.5) * 26;
          const z = (Math.random() - 0.5) * 26;
          const length = 0.25 + Math.random() * 0.3;
          rainArray[index] = x;
          rainArray[index + 1] = 15 + Math.random() * 3;
          rainArray[index + 2] = z;
          rainArray[index + 3] = x;
          rainArray[index + 4] = rainArray[index + 1] - length;
          rainArray[index + 5] = z;
        }
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    disposeObject(group);
    lights.ambient.intensity = base.ambient;
    lights.hemi.intensity = base.hemi;
    lights.key.intensity = base.key;
    lights.fill.intensity = base.fill;
    if (scene.fog) scene.fog.density = base.fogDensity;
  }

  setProgress(0);

  return {
    setProgress,
    update,
    dispose,
    group,
    get progress() {
      return progress;
    },
    get rainLevel() {
      return rainLevel;
    },
  };
}
