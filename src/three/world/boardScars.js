import * as THREE from 'three';

// Cicatrizes da partida nas casas do tabuleiro: rachaduras, queimados e
// resíduos escuros na casa exata de cada captura. Tudo é desenhado numa
// única textura que cobre o tabuleiro — capturas repetidas na mesma casa
// só acumulam traços no canvas, sem malha nem draw call a mais.
// Uma partida nova (GameView novo) começa limpa; o replay limpa também.
const PX = 128; // pixels por casa
const SIZE = PX * 8;

// Estilo pelo tipo de golpe (atacante) e peso pela vítima.
const STYLE = { p: 'residue', k: 'residue', n: 'crack', r: 'crack', b: 'burn', q: 'burn' };
const WEIGHT = { p: 0.7, n: 1, b: 1, r: 1.25, q: 1.3, k: 1.5 };

export function createBoardScars({ scene }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const geometry = new THREE.PlaneGeometry(8, 8);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.0015;
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  mesh.visible = false;
  scene.add(mesh);

  // Centro (px) da casa: coluna c -> x; linha r -> z (o topo do canvas é z = -4).
  const center = (row, col) => [(col + 0.5) * PX, (row + 0.5) * PX];

  function crack(cx, cy, weight) {
    ctx.strokeStyle = 'rgba(10,8,7,0.85)';
    ctx.lineCap = 'round';
    const branches = 4 + Math.round(weight * 3);
    for (let b = 0; b < branches; b++) {
      let angle = Math.random() * Math.PI * 2;
      let x = cx + (Math.random() - 0.5) * 10;
      let y = cy + (Math.random() - 0.5) * 10;
      let width = 3.2 * weight;
      const segments = 5 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segments; s++) {
        const len = 6 + Math.random() * 9 * weight;
        angle += (Math.random() - 0.5) * 0.9;
        const nx = x + Math.cos(angle) * len;
        const ny = y + Math.sin(angle) * len;
        ctx.lineWidth = Math.max(0.6, width);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        x = nx;
        y = ny;
        width *= 0.72;
      }
    }
    // Poeira fina em volta do impacto.
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30 * weight);
    g.addColorStop(0, 'rgba(40,34,28,0.35)');
    g.addColorStop(1, 'rgba(40,34,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 40, cy - 40, 80, 80);
  }

  function burn(cx, cy, weight) {
    for (let i = 0; i < 5; i++) {
      const x = cx + (Math.random() - 0.5) * 18;
      const y = cy + (Math.random() - 0.5) * 18;
      const r = (18 + Math.random() * 16) * weight;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(6,5,4,0.55)');
      g.addColorStop(0.6, 'rgba(20,14,10,0.3)');
      g.addColorStop(1, 'rgba(20,14,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Brasas: pontinhos avermelhados que ficam no queimado.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(${120 + Math.random() * 60},${30 + Math.random() * 20},10,0.5)`;
      ctx.beginPath();
      ctx.arc(cx + (Math.random() - 0.5) * 40, cy + (Math.random() - 0.5) * 40, 1.5 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function residue(cx, cy, weight) {
    ctx.fillStyle = 'rgba(22,10,10,0.5)';
    for (let i = 0; i < 4; i++) {
      const x = cx + (Math.random() - 0.5) * 24;
      const y = cy + (Math.random() - 0.5) * 24;
      ctx.beginPath();
      ctx.ellipse(x, y, (8 + Math.random() * 12) * weight, (5 + Math.random() * 8) * weight, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 26;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(angle) * d, cy + Math.sin(angle) * d, 1.5 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Marca a casa (row, col) da captura. Cada chamada soma à anterior.
  function scar({ row, col, attackerType, victimType }) {
    const [cx, cy] = center(row, col);
    const weight = WEIGHT[victimType] ?? 1;
    const style = STYLE[attackerType] ?? 'residue';
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * PX + 2, row * PX + 2, PX - 4, PX - 4);
    ctx.clip();
    if (style === 'crack') crack(cx, cy, weight);
    else if (style === 'burn') burn(cx, cy, weight);
    else residue(cx, cy, weight);
    ctx.restore();
    texture.needsUpdate = true;
    mesh.visible = true;
  }

  function clear() {
    ctx.clearRect(0, 0, SIZE, SIZE);
    texture.needsUpdate = true;
    mesh.visible = false;
  }

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  return { scar, clear, dispose };
}
