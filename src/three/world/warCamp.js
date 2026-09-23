import * as THREE from 'three';
import { disposeObject } from '../animation.js';
import { GROUND_Y } from '../environment.js';
import { drawFlag, FLAG_COLOR } from './bannerCloth.js';

// Acampamentos de guerra ao fundo, atrás de cada exército: tendas,
// pavilhões, catapultas e torres de cerco em silhueta desfocada, fogueiras
// que tremulam e bandeiras ao vento. Duas camadas de profundidade (perto e
// longe) giram um pouco com a câmera — parallax sutil — e o clima decide o
// quanto do acampamento aparece.


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

/* ------------------------------------------------ silhuetas por tema */

// Tenda beduína: longa, baixa e de cumeeira arredondada, com estacas.
function bedouinTent(ctx, glow, x, gy, u, s, random, lit) {
  const w = 3.2 * u * s;
  const h = 1.05 * u * s;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, gy);
  ctx.quadraticCurveTo(x - w * 0.42, gy - h * 1.1, x - w * 0.2, gy - h);
  ctx.quadraticCurveTo(x, gy - h * 1.25, x + w * 0.2, gy - h);
  ctx.quadraticCurveTo(x + w * 0.42, gy - h * 1.1, x + w / 2, gy);
  ctx.closePath();
  ctx.fill();
  for (const k of [-0.2, 0, 0.2]) ctx.fillRect(x + k * w - 0.03 * u, gy - h * 1.3, 0.06 * u, h * 0.35);
  if (lit) glow.fillRect(x - w * 0.12, gy - h * 0.55, w * 0.24, h * 0.55);
  void random;
}

function camel(ctx, x, gy, u, s) {
  const k = u * s;
  ctx.beginPath();
  ctx.ellipse(x, gy - 1.05 * k, 0.75 * k, 0.32 * k, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 0.2 * k, gy - 1.35 * k, 0.28 * k, 0.26 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + 0.55 * k, gy - 1.65 * k, 0.16 * k, 0.6 * k);
  ctx.beginPath();
  ctx.ellipse(x + 0.75 * k, gy - 1.65 * k, 0.24 * k, 0.12 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const dx of [-0.55, -0.3, 0.3, 0.5]) ctx.fillRect(x + dx * k, gy - 0.9 * k, 0.09 * k, 0.9 * k);
}

function palm(ctx, x, gy, u, s, random) {
  const k = u * s;
  const lean = (random() - 0.5) * 0.8 * k;
  ctx.lineWidth = 0.14 * k;
  ctx.beginPath();
  ctx.moveTo(x, gy);
  ctx.quadraticCurveTo(x + lean * 0.3, gy - 1.8 * k, x + lean, gy - 3.4 * k);
  ctx.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.45;
    ctx.lineWidth = 0.1 * k;
    ctx.beginPath();
    ctx.moveTo(x + lean, gy - 3.4 * k);
    ctx.quadraticCurveTo(
      x + lean + Math.cos(a) * 0.8 * k,
      gy - 3.4 * k + Math.sin(a) * 0.8 * k - 0.2 * k,
      x + lean + Math.cos(a) * 1.3 * k,
      gy - 3.4 * k + Math.sin(a) * 0.4 * k + 0.5 * k,
    );
    ctx.stroke();
  }
}

// Muralha de pedra com ameias.
function wall(ctx, x0, x1, gy, u, height) {
  const h = height * u;
  ctx.fillRect(x0, gy - h, x1 - x0, h);
  const step = 0.55 * u;
  for (let x = x0; x < x1 - step * 0.4; x += step) ctx.fillRect(x, gy - h - 0.3 * u, step * 0.55, 0.3 * u);
}

function watchtower(ctx, glow, x, gy, u, s, random, lit) {
  const k = u * s;
  const h = (3.6 + random() * 1.4) * k;
  const w = 1.1 * k;
  ctx.fillRect(x - w / 2, gy - h, w, h);
  ctx.fillRect(x - w * 0.65, gy - h - 0.25 * k, w * 1.3, 0.25 * k);
  // Telhado cônico.
  ctx.beginPath();
  ctx.moveTo(x - w * 0.7, gy - h - 0.25 * k);
  ctx.lineTo(x, gy - h - 1.4 * k);
  ctx.lineTo(x + w * 0.7, gy - h - 0.25 * k);
  ctx.closePath();
  ctx.fill();
  if (lit) glow.fillRect(x - 0.12 * k, gy - h * 0.8, 0.24 * k, 0.34 * k);
}

function jaggedRock(ctx, x, gy, u, s, random) {
  const k = u * s;
  ctx.beginPath();
  ctx.moveTo(x - 1.1 * k, gy);
  let px = x - 1.1 * k;
  for (let i = 0; i < 5; i++) {
    px += 0.44 * k;
    ctx.lineTo(px, gy - (0.6 + random() * 1.6) * k);
  }
  ctx.lineTo(x + 1.1 * k, gy);
  ctx.closePath();
  ctx.fill();
}

// Fileiras de soldados em silhueta, lanças erguidas: o exército à espera.
function soldiers(ctx, x0, x1, gy, u, random, rows = 2) {
  for (let row = 0; row < rows; row++) {
    const k = u * (0.42 - row * 0.06);
    const base = gy - row * 0.18 * u;
    for (let x = x0; x < x1; x += 0.38 * u * (0.85 + random() * 0.3)) {
      const h = 1.5 * k * (0.9 + random() * 0.2);
      ctx.fillRect(x - 0.18 * k, base - h * 0.78, 0.36 * k, h * 0.62);
      ctx.beginPath();
      ctx.arc(x, base - h * 0.86, 0.16 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 0.12 * k, base - h * 0.2, 0.09 * k, h * 0.2);
      ctx.fillRect(x + 0.03 * k, base - h * 0.2, 0.09 * k, h * 0.2);
      if (random() < 0.75) ctx.fillRect(x + 0.2 * k, base - h * 1.55, 0.05 * k, h * 1.5);
    }
  }
}

// Fundo distante da camada de trás.
function backdrop(ctx, glow, kind, width, gy, u, random) {
  ctx.beginPath();
  ctx.moveTo(0, gy);
  if (kind === 'peaks') {
    let x = 0;
    while (x < width) {
      const w = (2.5 + random() * 3.5) * u;
      const h = (3.5 + random() * 3.5) * u;
      ctx.lineTo(x + w * 0.5, gy - h);
      ctx.lineTo(x + w, gy - h * 0.25);
      // Neve nos cumes (pintada clara no canvas de brilho).
      glow.save();
      glow.fillStyle = 'rgba(210,225,255,0.55)';
      glow.beginPath();
      glow.moveTo(x + w * 0.5, gy - h);
      glow.lineTo(x + w * 0.5 - w * 0.16, gy - h * 0.7);
      glow.lineTo(x + w * 0.5 + w * 0.16, gy - h * 0.7);
      glow.closePath();
      glow.fill();
      glow.restore();
      x += w;
    }
  } else if (kind === 'dunes') {
    for (let x = 0; x <= width; x += 24) {
      ctx.lineTo(x, gy - (1.2 + Math.sin(x / (u * 3.1)) * 0.8 + Math.sin(x / (u * 1.3)) * 0.3) * u);
    }
  } else if (kind === 'volcano') {
    for (let x = 0; x <= width; x += 24) ctx.lineTo(x, gy - (0.8 + Math.sin(x / (u * 2.2)) * 0.5) * u);
    // Cone do vulcão com a cratera acesa.
    const cx = width * 0.62;
    ctx.lineTo(width, gy);
    ctx.lineTo(0, gy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 5.5 * u, gy);
    ctx.lineTo(cx - 0.9 * u, gy - 6 * u);
    ctx.lineTo(cx + 0.9 * u, gy - 6 * u);
    ctx.lineTo(cx + 5.5 * u, gy);
    ctx.closePath();
    ctx.fill();
    const g = glow.createRadialGradient(cx, gy - 6 * u, 0, cx, gy - 6 * u, 2.2 * u);
    g.addColorStop(0, 'rgba(255,120,40,1)');
    g.addColorStop(1, 'rgba(255,60,10,0)');
    glow.fillStyle = g;
    glow.fillRect(cx - 2.2 * u, gy - 8.2 * u, 4.4 * u, 4.4 * u);
    // Lava escorrendo.
    glow.strokeStyle = 'rgba(255,90,20,0.8)';
    glow.lineWidth = 0.12 * u;
    for (const dir of [-1, 1]) {
      glow.beginPath();
      glow.moveTo(cx + dir * 0.5 * u, gy - 5.9 * u);
      glow.quadraticCurveTo(cx + dir * 2 * u, gy - 3 * u, cx + dir * 3.2 * u, gy);
      glow.stroke();
    }
    return;
  } else {
    // Colinas suaves.
    for (let x = 0; x <= width; x += 24) {
      ctx.lineTo(x, gy - (1.4 + Math.sin(x / (u * 4.3)) * 1 + Math.sin(x / (u * 1.7)) * 0.35) * u);
    }
  }
  ctx.lineTo(width, gy);
  ctx.closePath();
  ctx.fill();
}

const BACKDROP = { war: 'hills', bedouin: 'dunes', fortress: 'peaks', volcanic: 'volcano' };

// Uma peça do acampamento, conforme o tema.
function campItem(style, ctx, glow, x, gy, u, s, random, lit) {
  const roll = random();
  if (style === 'bedouin') {
    if (roll < 0.5) bedouinTent(ctx, glow, x, gy, u, s, random, lit);
    else if (roll < 0.72) camel(ctx, x, gy, u, s);
    else palm(ctx, x, gy, u, s, random);
  } else if (style === 'fortress') {
    if (roll < 0.45) watchtower(ctx, glow, x, gy, u, s, random, lit);
    else if (roll < 0.75) pavilion(ctx, glow, x, gy, u, s * 0.8, random, lit);
    else siegeTower(ctx, glow, x, gy, u, s * 0.8, random, lit);
  } else if (style === 'volcanic') {
    if (roll < 0.35) jaggedRock(ctx, x, gy, u, s, random);
    else if (roll < 0.62) tent(ctx, glow, x, gy, u, s, random, lit);
    else if (roll < 0.82) siegeTower(ctx, glow, x, gy, u, s * 0.85, random, lit);
    else catapult(ctx, glow, x, gy, u, s * 0.9, random);
  } else if (roll < 0.45) tent(ctx, glow, x, gy, u, s, random, lit);
  else if (roll < 0.62) pavilion(ctx, glow, x, gy, u, s, random, lit);
  else if (roll < 0.8) catapult(ctx, glow, x, gy, u, s * 0.9, random);
  else siegeTower(ctx, glow, x, gy, u, s * 0.85, random, lit);
}

function campTexture(layer, width, random, theme) {
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
  const style = theme.camp;

  ctx.filter = `blur(${layer.blur}px)`;
  glow.filter = `blur(${layer.blur * 2.2}px)`;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  glow.fillStyle = theme.glow;

  if (layer.mix) {
    // Camada de trás: o horizonte do tema (colinas, dunas, picos, vulcão).
    ctx.save();
    ctx.globalAlpha = 0.8;
    backdrop(ctx, glow, BACKDROP[style] ?? 'hills', width, groundY - 1.2 * u, u, random);
    ctx.restore();
    glow.fillStyle = theme.glow;
  }

  // Aterro contínuo na base.
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 32) ctx.lineTo(x, groundY - Math.sin(x * 0.01) * 0.12 * u - random() * 0.08 * u);
  ctx.lineTo(width, height);
  ctx.fill();

  const margin = width * 0.08;
  if (style === 'fortress' && !layer.mix) wall(ctx, margin, width - margin, groundY, u, 1.6);

  const slots = Math.round(arcLength / (2.6 / layer.density));
  for (let i = 0; i < slots; i++) {
    const x = margin + ((i + 0.5) / slots) * (width - margin * 2) + (random() - 0.5) * u * 0.8;
    const s = 0.75 + random() * 0.5;
    const lit = random() < 0.45;
    campItem(style, ctx, glow, x, groundY, u, s, random, lit);

    if (random() < 0.4) {
      const fx = x + (random() - 0.5) * 1.4 * u;
      fires.push({ x: fx / width, y: 1 - groundY / height });
      smoke(ctx, fx, groundY, u, random);
      const g = glow.createRadialGradient(fx, groundY, 0, fx, groundY, 1.4 * u);
      g.addColorStop(0, 'rgba(255,140,60,0.9)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      glow.fillStyle = g;
      glow.fillRect(fx - 1.4 * u, groundY - 1.4 * u, 2.8 * u, 1.4 * u);
      glow.fillStyle = theme.glow;
    }
  }

  if (!layer.mix) {
    // O exército em formação diante do acampamento.
    soldiers(ctx, width * 0.18, width * 0.82, groundY + 0.02 * u, u, random, 2);
    if (style === 'war' || style === 'volcanic') {
      palisade(ctx, margin * 0.5, width * 0.2, groundY, u);
      palisade(ctx, width * 0.8, width - margin * 0.5, groundY, u);
    }
  }

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

/* ------------------------------------------- bandeiras: emblema e rasgos */

// Mapa de rasgo: quanto menor o valor, mais cedo o pixel rasga. A ponta
// solta (longe do mastro) e as bordas rasgam primeiro.
function tearTexture(random) {
  const w = 128;
  const h = 80;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  const blobs = Array.from({ length: 16 }, () => ({ x: random() * w, y: random() * h, r: 6 + random() * 16 }));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hole = 0;
      for (const b of blobs) hole = Math.max(hole, 1 - Math.hypot(x - b.x, y - b.y) / b.r);
      const edge = Math.min(y, h - 1 - y) / (h / 2);
      const v = 1 - (0.5 * (x / w) + 0.3 * hole + 0.2 * (1 - edge) + random() * 0.08);
      const i = (y * w + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, v * 255));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

function tearMaterial(material, tearMap, uniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tearMap = { value: tearMap };
    shader.uniforms.uTear = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vTearUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTearUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tearMap;\nuniform float uTear;\nvarying vec2 vTearUv;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (texture2D(tearMap, vTearUv).r < uTear) discard;');
  };
  material.customProgramCacheKey = () => 'flag-tear-v1';
}

/* --------------------------------------------------------- montagem */


export function createWarCamp({ scene, weather, theme, emblems = {} }) {
  const root = new THREE.Group();
  root.name = 'WarCamp';
  scene.add(root);

  const random = rng(4242);
  const fireTexture = fireSpriteTexture();
  const tint = new THREE.Color(weather.campTint);
  const fog = new THREE.Color(weather.fogColor);
  if (theme.fog) fog.lerp(new THREE.Color(theme.fog), theme.fogMix);
  const visibility = weather.campVisibility;
  // Fogueiras pesam mais à noite; de dia quase não aparecem.
  const fireStrength = 0.35 + weather.darkness * 0.75;
  const tearMap = tearTexture(random);

  const layers = [];
  // Estado de cada exército: moral (1 = inteiro, cai quando perde peças).
  const sides = {
    w: { fires: [], glows: [], flags: [], morale: 1, target: 1, tear: { value: 0 } },
    b: { fires: [], glows: [], flags: [], morale: 1, target: 1, tear: { value: 0 } },
  };

  for (const spec of LAYERS) {
    const group = new THREE.Group();
    root.add(group);
    const silhouetteColor = tint.clone().lerp(fog, spec.mix);
    const layer = { spec, group, materials: [] };

    // Um acampamento atrás de cada exército: Ruína em +Z, Ordem em -Z.
    for (const [center, sideId] of [
      [0, 'b'],
      [Math.PI, 'w'],
    ]) {
      const side = sides[sideId];
      const textures = campTexture(spec, 2048, random, theme);
      const thetaStart = center - spec.arc / 2;
      const y0 = GROUND_Y - 0.35;
      const geometry = new THREE.CylinderGeometry(spec.radius, spec.radius, spec.height, 48, 1, true, thetaStart, spec.arc);
      geometry.translate(0, y0 + spec.height / 2, 0);

      // Dos dois lados: na abertura a câmera começa por fora do anel.
      const silhouette = new THREE.MeshBasicMaterial({
        map: textures.silhouette,
        color: silhouetteColor,
        transparent: true,
        opacity: visibility * (spec.mix ? 0.85 : 1),
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const glowMaterial = new THREE.MeshBasicMaterial({
        map: textures.glow,
        transparent: true,
        opacity: fireStrength * (0.5 + visibility * 0.5) * (spec.mix ? 0.6 : 0.85),
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      });
      const back = new THREE.Mesh(geometry, silhouette);
      back.renderOrder = -2;
      const glowMesh = new THREE.Mesh(geometry, glowMaterial);
      glowMesh.renderOrder = -1;
      group.add(back, glowMesh);
      layer.materials.push({ silhouette, baseOpacity: silhouette.opacity });
      side.glows.push({ material: glowMaterial, base: glowMaterial.opacity });

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
        side.fires.push({ sprite, material, size, phase: random() * 10, strength: fireStrength * (spec.mix ? 0.7 : 1) });
      }

      // Estandartes com o emblema do exército, na camada da frente.
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

          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 160;
          const map = new THREE.CanvasTexture(canvas);
          map.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.MeshBasicMaterial({
            map,
            color: new THREE.Color(0xffffff).lerp(silhouetteColor, 0.5 - visibility * 0.35),
            side: THREE.DoubleSide,
            fog: false,
            transparent: true,
            opacity: visibility,
          });
          tearMaterial(material, tearMap, side.tear);
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.85, 10, 4), material);
          cloth.geometry.translate(0.675, 0, 0);
          cloth.position.set(x, GROUND_Y + poleHeight - 0.65, z);
          cloth.rotation.y = theta + Math.PI / 2 + (random() - 0.5) * 0.8;
          group.add(cloth);
          side.flags.push({ cloth, canvas, map, base: cloth.geometry.attributes.position.array.slice(), phase: random() * 10 });
        }
      }
    }
    layers.push(layer);
  }

  function setEmblems(next) {
    for (const id of ['w', 'b']) {
      for (const flag of sides[id].flags) {
        drawFlag(flag.canvas, FLAG_COLOR[id], next[id]);
        flag.map.needsUpdate = true;
      }
    }
  }
  setEmblems({ w: emblems.w ?? 'aguia', b: emblems.b ?? 'lobo' });

  // Moral de cada lado (0..1); a transição é suave, quadro a quadro.
  function setMorale({ w, b }) {
    sides.w.target = w;
    sides.b.target = b;
  }

  let elapsed = 0;
  let azimuth0 = null;

  // lightning: 0..1 enquanto um relâmpago clareia o céu. wind: força atual.
  function update(dt, camera, { lightning = 0, wind = weather.wind } = {}) {
    elapsed += dt;

    // Parallax: a camada de longe acompanha um pouco a órbita da câmera,
    // então parece mais distante que a de perto.
    const azimuth = Math.atan2(camera.position.x, camera.position.z);
    if (azimuth0 === null) azimuth0 = azimuth;
    const delta = Math.atan2(Math.sin(azimuth - azimuth0), Math.cos(azimuth - azimuth0));
    for (const layer of layers) {
      layer.group.rotation.y = delta * layer.spec.drift;
      // O relâmpago revela o acampamento por um instante.
      for (const m of layer.materials) m.silhouette.opacity = Math.min(1, m.baseOpacity + lightning * 0.7);
    }

    const speed = 2 + wind * 4;
    for (const side of Object.values(sides)) {
      side.morale += (side.target - side.morale) * Math.min(1, dt * 0.5);
      const m = side.morale;
      // Desânimo: fogueiras minguam e as bandeiras rasgam.
      side.tear.value = (1 - m) * 0.62;
      for (const g of side.glows) g.material.opacity = g.base * (0.2 + 0.8 * m);
      for (const f of side.fires) {
        const flicker =
          0.75 + Math.sin(elapsed * 7 + f.phase) * 0.12 + Math.sin(elapsed * 17 + f.phase * 3) * 0.08 + Math.random() * 0.08;
        const vigor = 0.25 + 0.75 * m;
        f.material.opacity = f.strength * flicker * vigor;
        f.sprite.scale.set(f.size * (0.9 + flicker * 0.2) * vigor, f.size * (1 + flicker * 0.35) * vigor, 1);
      }
      // Bandeiras de quem perde batem mais soltas (vento mais forte).
      const amp = (0.06 + wind * 0.14) * (1 + (1 - m) * 0.6);
      for (const flag of side.flags) {
        const array = flag.cloth.geometry.attributes.position.array;
        for (let i = 0; i < array.length; i += 3) {
          const x = flag.base[i];
          array[i + 2] = Math.sin(elapsed * speed + x * 4 + flag.phase) * amp * (x / 1.35);
          array[i + 1] = flag.base[i + 1] - (1 - m) * 0.12 * (x / 1.35);
        }
        flag.cloth.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  function dispose() {
    fireTexture.dispose();
    tearMap.dispose();
    root.traverse((obj) => {
      const material = obj.material;
      if (material?.map) material.map.dispose();
    });
    disposeObject(root);
  }

  return { group: root, update, setMorale, setEmblems, dispose };
}
