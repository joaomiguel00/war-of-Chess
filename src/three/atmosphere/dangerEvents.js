import * as THREE from 'three';
import { squareToWorld } from '../boardScene.js';
import { dustPuff } from '../fx.js';
import { disposeObject, animate } from '../animation.js';

// Eventos atmosféricos perto de um rei com poucas casas de fuga: raios
// caindo por perto (se o clima tiver raios), rajadas de vento e neblina
// acumulando em volta dele. Só visual e sonoro — não mexe em regra nenhuma.
// A chance de cada evento cresce com o perigo (0..1).
function smokeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Raio: linha quebrada do céu até o chão, com um galho.
function boltGeometry(ground) {
  const points = [];
  let x = ground.x + (Math.random() - 0.5) * 2;
  let z = ground.z + (Math.random() - 0.5) * 2;
  const top = 12;
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = top * (1 - t);
    const nx = THREE.MathUtils.lerp(x, ground.x, t) + (Math.random() - 0.5) * 0.5 * (1 - t);
    const nz = THREE.MathUtils.lerp(z, ground.z, t) + (Math.random() - 0.5) * 0.5 * (1 - t);
    points.push(new THREE.Vector3(nx, y, nz));
  }
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) segments.push(points[i], points[i + 1]);
  const branchFrom = points[5];
  let bx = branchFrom.x;
  let by = branchFrom.y;
  let bz = branchFrom.z;
  for (let i = 0; i < 4; i++) {
    const nx = bx + (Math.random() - 0.3) * 0.7;
    const ny = by - 0.9;
    const nz = bz + (Math.random() - 0.5) * 0.7;
    segments.push(new THREE.Vector3(bx, by, bz), new THREE.Vector3(nx, ny, nz));
    bx = nx;
    by = ny;
    bz = nz;
  }
  return new THREE.BufferGeometry().setFromPoints(segments);
}

export function createDangerEvents({ scene, weather, environment, acts, flash, shake, audio, heightAt }) {
  const group = new THREE.Group();
  group.name = 'DangerEvents';
  scene.add(group);
  const texture = smokeTexture();

  // Neblina em volta de cada rei (um anel de sprites por cor).
  const fogs = {};
  for (const color of ['w', 'b']) {
    const sprites = [];
    for (let i = 0; i < 9; i++) {
      const material = new THREE.SpriteMaterial({ map: texture, color: 0x6c6878, transparent: true, opacity: 0, depthWrite: false });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      group.add(sprite);
      sprites.push({ sprite, material, angle: (i / 9) * Math.PI * 2, radius: 0.6 + Math.random() * 0.7, phase: Math.random() * 10 });
    }
    fogs[color] = { sprites, level: 0 };
  }

  const danger = { w: { level: 0, king: null }, b: { level: 0, king: null } };
  const timers = { w: 3, b: 3 };
  let elapsed = 0;

  // Chamado a cada mudança de tabuleiro com o perigo de cada rei.
  function setDanger(color, { level, king }) {
    danger[color] = { level, king };
  }

  function lightningNear(king) {
    const angle = Math.random() * Math.PI * 2;
    const d = 1.4 + Math.random() * 1.4;
    const at = squareToWorld(king.row, king.col);
    const ground = new THREE.Vector3(at.x + Math.cos(angle) * d, 0, at.z + Math.sin(angle) * d);
    const onBoard = Math.abs(ground.x) < 4 && Math.abs(ground.z) < 4;
    ground.y = onBoard ? 0 : heightAt(ground.x, ground.z);
    const material = new THREE.LineBasicMaterial({ color: 0xe8eeff, transparent: true, opacity: 1, toneMapped: false });
    const bolt = new THREE.LineSegments(boltGeometry(ground), material);
    bolt.position.y = ground.y;
    group.add(bolt);
    environment.strikeLightning(1);
    flash(0xcfd8ff, 0.5, 260);
    shake(0.25);
    audio.playThunder?.(1, 0.05);
    dustPuff(group, ground, { count: 8, spread: 0.3, duration: 900, color: 0x8a8175, opacity: 0.35, rise: 1.5 });
    animate(420, (t) => {
      material.opacity = t < 0.15 ? 1 : (1 - t) * (0.6 + Math.random() * 0.4);
    }, { scaled: false }).then(() => disposeObject(bolt));
  }

  function gustNear(king) {
    const at = squareToWorld(king.row, king.col);
    acts.addGust(0.9);
    audio.playGust?.();
    for (let i = 0; i < 3; i++) {
      const offset = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
      dustPuff(group, at.clone().add(offset), { count: 6, spread: 0.5, duration: 1200, color: 0x7a7266, opacity: 0.25, rise: 0.8, size: 1.4 });
    }
  }

  function update(dt) {
    elapsed += dt;
    for (const color of ['w', 'b']) {
      const { level, king } = danger[color];
      const fog = fogs[color];
      fog.level += ((king ? level : 0) - fog.level) * Math.min(1, dt * 0.8);

      // Neblina acompanha o rei e engrossa com o perigo.
      const at = king ? squareToWorld(king.row, king.col) : null;
      for (const s of fog.sprites) {
        const visible = fog.level > 0.02 && at;
        s.sprite.visible = !!visible;
        if (!visible) continue;
        const a = s.angle + elapsed * 0.15;
        s.sprite.position.set(at.x + Math.cos(a) * s.radius, 0.25 + Math.sin(elapsed * 0.6 + s.phase) * 0.1, at.z + Math.sin(a) * s.radius);
        s.sprite.scale.setScalar(1.1 + fog.level * 0.9);
        s.material.opacity = fog.level * 0.32;
      }

      if (!king || level < 0.3) continue;
      timers[color] -= dt * level;
      if (timers[color] > 0) continue;
      timers[color] = 2.5 + Math.random() * 4;
      const roll = Math.random();
      if (weather.lightning && roll < 0.55) lightningNear(king);
      else if (roll < 0.85) gustNear(king);
    }
  }

  function reset() {
    danger.w = { level: 0, king: null };
    danger.b = { level: 0, king: null };
  }

  function dispose() {
    texture.dispose();
    disposeObject(group);
  }

  return { setDanger, update, reset, dispose };
}
