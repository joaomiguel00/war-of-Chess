import * as THREE from 'three';
import { disposeObject } from '../animation.js';
import { GROUND_Y } from '../environment.js';

// Acampamentos de guerra ao fundo, atrás de cada exército: tendas,
// pavilhões, catapultas e torres de cerco em silhueta desfocada, fogueiras
// que tremulam e bandeiras ao vento. Duas camadas de profundidade (perto e
// longe) giram um pouco com a câmera — parallax sutil — e o clima decide o
// quanto do acampamento aparece.

const ORDER_FLAG = 0xb8641e;
const RUIN_FLAG = 0x8a2aa0;

const LAYERS = [
  { name: 'near', radius: 15.5, height: 7, arc: 1.9, blur: 1.4, drift: 0.025, mix: 0, density: 1 },
  { name: 'far', radius: 24, height: 10, arc: 2.2, blur: 3, drift: 0.07, mix: 0.45, density: 1.6 },
];

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* --------------------------------------------------------- silhuetas */

function tent(ctx, glow, x, gy, u, s, random, lit) {
  const w = 2.2 * u * s;
  const h = 1.5 * u * s;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, gy);
  ctx.lineTo(x - w * 0.07, gy - h);
  ctx.lineTo(x + w * 0.07, gy - h);
  ctx.lineTo(x + w / 2, gy);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - 0.03 * u, gy - h - 0.35 * u * s, 0.06 * u, 0.4 * u * s);
  if (lit) {
    glow.beginPath();
    glow.moveTo(x - w * 0.12, gy);
    glow.lineTo(x, gy - h * 0.55);
    glow.lineTo(x + w * 0.12, gy);
    glow.closePath();
    glow.fill();
  }
  // Cordas de ancoragem.
  ctx.lineWidth = Math.max(1, 0.03 * u);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.07, gy - h);
  ctx.lineTo(x - w * 0.75, gy);
  ctx.moveTo(x + w * 0.07, gy - h);
  ctx.lineTo(x + w * 0.75, gy);
  ctx.stroke();
  void random;
}

function pavilion(ctx, glow, x, gy, u, s, random, lit) {
  const w = 3 * u * s;
  const wall = 1.1 * u * s;
  const roof = 1.5 * u * s;
  ctx.fillRect(x - w / 2, gy - wall, w, wall);
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 0.2 * u * s, gy - wall);
  ctx.lineTo(x, gy - wall - roof);
  ctx.lineTo(x + w / 2 + 0.2 * u * s, gy - wall);
  ctx.closePath();
  ctx.fill();
  // Franja recortada da borda do telhado.
  const scallops = 7;
  for (let i = 0; i < scallops; i++) {
    const sx = x - w / 2 + (i + 0.5) * (w / scallops);
    ctx.beginPath();
    ctx.arc(sx, gy - wall, (w / scallops) * 0.45, 0, Math.PI);
    ctx.fill();
  }
  // Mastro e flâmula.
  ctx.fillRect(x - 0.03 * u, gy - wall - roof - 0.8 * u * s, 0.06 * u, 0.85 * u * s);
  ctx.beginPath();
  ctx.moveTo(x + 0.03 * u, gy - wall - roof - 0.8 * u * s);
  ctx.lineTo(x + 0.6 * u * s, gy - wall - roof - 0.65 * u * s);
  ctx.lineTo(x + 0.03 * u, gy - wall - roof - 0.5 * u * s);
  ctx.fill();
  if (lit) glow.fillRect(x - 0.25 * u * s, gy - wall * 0.8, 0.5 * u * s, wall * 0.8);
  void random;
}

function catapult(ctx, glow, x, gy, u, s, random) {
  const k = u * s;
  ctx.fillRect(x - 1.1 * k, gy - 0.42 * k, 2.2 * k, 0.18 * k);
  for (const dx of [-0.75, 0.75]) {
    ctx.beginPath();
    ctx.arc(x + dx * k, gy - 0.3 * k, 0.3 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineWidth = 0.14 * k;
  ctx.beginPath();
  ctx.moveTo(x - 0.6 * k, gy - 0.4 * k);
  ctx.lineTo(x, gy - 1.5 * k);
  ctx.lineTo(x + 0.6 * k, gy - 0.4 * k);
  ctx.stroke();
  // Braço armado para trás, com a concha.
  const angle = -0.75 - random() * 0.4;
  const px = x;
  const py = gy - 1.3 * k;
  const ex = px + Math.cos(Math.PI + angle) * 2.3 * k;
  const ey = py + Math.sin(Math.PI + angle) * 2.3 * k;
  ctx.lineWidth = 0.1 * k;
  ctx.beginPath();
  ctx.moveTo(px + Math.cos(angle) * 0.5 * k, py + Math.sin(angle) * -0.5 * k);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ex, ey, 0.2 * k, 0, Math.PI * 2);
  ctx.fill();
  void glow;
}

function siegeTower(ctx, glow, x, gy, u, s, random, lit) {
  const k = u * s;
  const h = (4.2 + random() * 1.2) * k;
  const bottom = 1.9 * k;
  const top = 1.35 * k;
  ctx.beginPath();
  ctx.moveTo(x - bottom / 2, gy);
  ctx.lineTo(x - top / 2, gy - h);
  ctx.lineTo(x + top / 2, gy - h);
  ctx.lineTo(x + bottom / 2, gy);
  ctx.closePath();
  ctx.fill();
  // Ameias no topo.
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x - top / 2 + i * (top / 3.5), gy - h - 0.3 * k, top / 7, 0.3 * k);
  }
  // Tábuas: riscos claros bem sutis.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = Math.max(1, 0.04 * k);
  for (let y = gy - 0.5 * k; y > gy - h + 0.3 * k; y -= 0.55 * k) {
    ctx.beginPath();
    ctx.moveTo(x - bottom / 2, y);
    ctx.lineTo(x + bottom / 2, y);
    ctx.stroke();
  }
  ctx.restore();
  if (lit) glow.fillRect(x - 0.12 * k, gy - h * 0.62, 0.24 * k, 0.3 * k);
}

function palisade(ctx, x0, x1, gy, u) {
  const step = 0.28 * u;
  for (let x = x0; x < x1; x += step) {
    const h = (0.8 + Math.random() * 0.25) * u;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy - h);
    ctx.lineTo(x + step * 0.45, gy - h - 0.2 * u);
    ctx.lineTo(x + step * 0.9, gy - h);
    ctx.lineTo(x + step * 0.9, gy);
    ctx.closePath();
    ctx.fill();
  }
}

function smoke(ctx, x, gy, u, random) {
  ctx.save();
  let px = x;
  let py = gy - 0.4 * u;
  for (let i = 0; i < 9; i++) {
    const r = (0.35 + i * 0.16) * u;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
    px += (0.15 + random() * 0.25) * u;
    py -= 0.45 * u;
  }
  ctx.restore();
}

function campTexture(layer, width, random) {
  const arcLength = layer.radius * layer.arc;
  const u = width / arcLength;
  const height = Math.round(u * layer.height);
  const silhouette = document.createElement('canvas');
  silhouette.width = width;
  silhouette.height = height;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = width;
  glowCanvas.height = height;
  const ctx = silhouette.getContext('2d');
  const glow = glowCanvas.getContext('2d');
  const groundY = height * 0.955;
  const fires = [];

  ctx.filter = `blur(${layer.blur}px)`;
  glow.filter = `blur(${layer.blur * 2.2}px)`;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  glow.fillStyle = 'rgba(255,150,70,0.9)';

  // Aterro contínuo na base.
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 32) ctx.lineTo(x, groundY - Math.sin(x * 0.01) * 0.12 * u - random() * 0.08 * u);
  ctx.lineTo(width, height);
  ctx.fill();

  // Faz as bordas sumirem aos poucos (a faixa não "corta" no céu).
  const margin = width * 0.08;
  const slots = Math.round(arcLength / (2.6 / layer.density));
  for (let i = 0; i < slots; i++) {
    const x = margin + ((i + 0.5) / slots) * (width - margin * 2) + (random() - 0.5) * u * 0.8;
    const s = 0.75 + random() * 0.5;
    const roll = random();
    const lit = random() < 0.45;
    if (roll < 0.45) tent(ctx, glow, x, groundY, u, s, random, lit);
    else if (roll < 0.62) pavilion(ctx, glow, x, groundY, u, s, random, lit);
    else if (roll < 0.8) catapult(ctx, glow, x, groundY, u, s * 0.9, random);
    else siegeTower(ctx, glow, x, groundY, u, s * 0.85, random, lit);

    if (random() < 0.4) {
      const fx = x + (random() - 0.5) * 1.4 * u;
      fires.push({ x: fx / width, y: 1 - groundY / height });
      smoke(ctx, fx, groundY, u, random);
      const g = glow.createRadialGradient(fx, groundY, 0, fx, groundY, 1.4 * u);
      g.addColorStop(0, 'rgba(255,140,60,0.9)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      glow.fillStyle = g;
      glow.fillRect(fx - 1.4 * u, groundY - 1.4 * u, 2.8 * u, 1.4 * u);
      glow.fillStyle = 'rgba(255,150,70,0.9)';
    }
  }
  palisade(ctx, margin * 0.5, width * 0.28, groundY, u);
  palisade(ctx, width * 0.7, width - margin * 0.5, groundY, u);

  // Esmaece as pontas da faixa.
  for (const c of [ctx, glow]) {
    c.filter = 'none';
    c.globalCompositeOperation = 'destination-out';
    const fade = c.createLinearGradient(0, 0, width, 0);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(0.1, 'rgba(0,0,0,0)');
    fade.addColorStop(0.9, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = fade;
    c.fillRect(0, 0, width, height);
  }

  const toTexture = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return { silhouette: toTexture(silhouette), glow: toTexture(glowCanvas), fires };
}

function fireSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.25, 'rgba(255,160,60,0.8)');
  g.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* --------------------------------------------------------- montagem */

export function createWarCamp({ scene, weather }) {
  const root = new THREE.Group();
  root.name = 'WarCamp';
  scene.add(root);

  const random = rng(4242);
  const fireTexture = fireSpriteTexture();
  const tint = new THREE.Color(weather.campTint);
  const fog = new THREE.Color(weather.fogColor);
  const visibility = weather.campVisibility;
  // Fogueiras pesam mais à noite; de dia quase não aparecem.
  const fireStrength = 0.35 + weather.darkness * 0.75;

  const layers = [];
  const fires = [];
  const flags = [];

  for (const spec of LAYERS) {
    const group = new THREE.Group();
    root.add(group);
    const silhouetteColor = tint.clone().lerp(fog, spec.mix);
    const layer = { spec, group, materials: [] };

    // Um acampamento atrás de cada exército: Ruína em +Z, Ordem em -Z.
    for (const [center, flagColor] of [
      [0, RUIN_FLAG],
      [Math.PI, ORDER_FLAG],
    ]) {
      const textures = campTexture(spec, 2048, random);
      const thetaStart = center - spec.arc / 2;
      const y0 = GROUND_Y - 0.35;
      const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.height, 48, 1, true, thetaStart, spec.arc);
      geometry.translate(0, y0 + spec.height / 2, 0);

      const silhouette = new THREE.MeshBasicMaterial({
        map: textures.silhouette,
        color: silhouetteColor,
        transparent: true,
        opacity: visibility * (spec.mix ? 0.85 : 1),
        depthWrite: false,
        side: THREE.BackSide,
        fog: false,
      });
      const glowMaterial = new THREE.MeshBasicMaterial({
        map: textures.glow,
        transparent: true,
        opacity: fireStrength * (0.5 + visibility * 0.5) * (spec.mix ? 0.6 : 0.85),
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const back = new THREE.Mesh(geometry, silhouette);
      back.renderOrder = -2;
      const glowMesh = new THREE.Mesh(geometry, glowMaterial);
      glowMesh.renderOrder = -1;
      group.add(back, glowMesh);
      layer.materials.push({ silhouette, glowMaterial, baseOpacity: silhouette.opacity, color: silhouetteColor });

      // Fogueiras vivas por cima das pintadas.
      for (const f of textures.fires) {
        const theta = thetaStart + f.x * spec.arc;
        const r = spec.radius - 0.4;
        const y = y0 + f.y * spec.height + 0.25;
        const material = new THREE.SpriteMaterial({
          map: fireTexture,
          color: 0xffffff,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          fog: false,
        });
        const sprite = new THREE.Sprite(material);
        sprite.position.set(Math.sin(theta) * r, y, Math.cos(theta) * r);
        const size = spec.mix ? 0.6 : 0.8;
        sprite.scale.setScalar(size);
        group.add(sprite);
        fires.push({ sprite, material, size, phase: random() * 10, strength: fireStrength * (spec.mix ? 0.7 : 1) });
      }

      // Bandeiras de verdade na camada da frente, balançando ao vento.
      if (!spec.mix) {
        for (const at of [0.22, 0.5, 0.78]) {
          const theta = thetaStart + at * spec.arc;
          const r = spec.radius - 0.6;
          const x = Math.sin(theta) * r;
          const z = Math.cos(theta) * r;
          const poleHeight = 3.4 + random();
          const poleMaterial = new THREE.MeshBasicMaterial({ color: silhouetteColor, fog: false, transparent: true, opacity: visibility });
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.07, poleHeight, 0.07), poleMaterial);
          pole.position.set(x, GROUND_Y + poleHeight / 2 - 0.2, z);
          group.add(pole);
          const cloth = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, 0.75, 8, 3),
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(flagColor).lerp(silhouetteColor, 0.55 - visibility * 0.35),
              side: THREE.DoubleSide,
              fog: false,
              transparent: true,
              opacity: visibility,
            }),
          );
          cloth.geometry.translate(0.6, 0, 0);
          cloth.position.set(x, GROUND_Y + poleHeight - 0.6, z);
          cloth.rotation.y = theta + Math.PI / 2 + (random() - 0.5) * 0.8;
          group.add(cloth);
          flags.push({ cloth, base: cloth.geometry.attributes.position.array.slice(), phase: random() * 10, materials: [poleMaterial, cloth.material] });
        }
      }
    }
    layers.push(layer);
  }

  let elapsed = 0;
  let azimuth0 = null;

  // lightning: 0..1 enquanto um relâmpago clareia o céu.
  function update(dt, camera, lightning = 0) {
    elapsed += dt;

    // Parallax: a camada de longe acompanha um pouco a órbita da câmera,
    // então parece mais distante que a de perto.
    const azimuth = Math.atan2(camera.position.x, camera.position.z);
    if (azimuth0 === null) azimuth0 = azimuth;
    const delta = Math.atan2(Math.sin(azimuth - azimuth0), Math.cos(azimuth - azimuth0));
    for (const layer of layers) {
      layer.group.rotation.y = delta * layer.spec.drift;
      // O relâmpago revela o acampamento por um instante.
      for (const m of layer.materials) {
        m.silhouette.opacity = Math.min(1, m.baseOpacity + lightning * 0.7);
      }
    }

    for (const f of fires) {
      const flicker =
        0.75 + Math.sin(elapsed * 7 + f.phase) * 0.12 + Math.sin(elapsed * 17 + f.phase * 3) * 0.08 + Math.random() * 0.08;
      f.material.opacity = f.strength * flicker;
      f.sprite.scale.set(f.size * (0.9 + flicker * 0.2), f.size * (1 + flicker * 0.35), 1);
    }

    const speed = 2 + weather.wind * 4;
    const amp = 0.06 + weather.wind * 0.14;
    for (const flag of flags) {
      const array = flag.cloth.geometry.attributes.position.array;
      for (let i = 0; i < array.length; i += 3) {
        const x = flag.base[i];
        array[i + 2] = Math.sin(elapsed * speed + x * 4 + flag.phase) * amp * (x / 1.2);
      }
      flag.cloth.geometry.attributes.position.needsUpdate = true;
    }
  }

  function dispose() {
    fireTexture.dispose();
    root.traverse((obj) => {
      const material = obj.material;
      if (material?.map) material.map.dispose();
    });
    disposeObject(root);
  }

  return { group: root, update, dispose };
}
