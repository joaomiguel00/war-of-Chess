import * as THREE from 'three';
import { animate, easeOut, easeIn, disposeObject } from './animation.js';

// Efeitos de combate reutilizáveis (poeira, faíscas, feixes, ondas de choque).
// Cada um se cria dentro do grupo `fx`, se anima sozinho e se descarta.

function glow(color, opacity = 1, extra = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    toneMapped: false,
    ...extra,
  });
}

// Anel de choque rente ao chão, que se abre e some.
export function shockRing(fx, position, color, { radius = 0.85, duration = 520, y = 0.03, width = 0.08 } = {}) {
  const material = glow(color, 0.55, { side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.18 + width, 28), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, y, position.z);
  fx.add(ring);

  return animate(duration, (t) => {
    ring.scale.setScalar(1 + easeOut(t) * radius * 3);
    material.opacity = 0.55 * (1 - t);
  }).then(() => disposeObject(ring));
}

// Baforada de poeira: bolhas que sobem e se dissipam.
export function dustPuff(
  fx,
  position,
  { count = 7, spread = 0.3, duration = 750, color = 0x8a8175, opacity = 0.3, rise = 1, size = 1 } = {},
) {
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry((0.09 + Math.random() * 0.07) * size, 0),
      material,
    );
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * spread;
    puff.position.set(
      position.x + Math.cos(angle) * distance,
      (position.y ?? 0) + 0.06 + Math.random() * 0.1,
      position.z + Math.sin(angle) * distance,
    );
    fx.add(puff);
    puffs.push({
      puff,
      material,
      drift: new THREE.Vector3(Math.cos(angle) * 0.35, (0.3 + Math.random() * 0.25) * rise, Math.sin(angle) * 0.35),
    });
  }

  return animate(duration, (t) => {
    const e = easeOut(t);
    for (const entry of puffs) {
      entry.puff.position.addScaledVector(entry.drift, 0.006);
      entry.puff.scale.setScalar(1 + e * 1.6);
      entry.material.opacity = opacity * (1 - t);
    }
  }).then(() => puffs.forEach((entry) => disposeObject(entry.puff)));
}

// Feixe fino entre dois pontos: cresce, sustenta e some.
export function energyBeam(fx, start, end, color, { width = 0.05 } = {}) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const core = glow(0xffffff, 0.95, { blending: THREE.AdditiveBlending });
  const halo = glow(color, 0.55, { blending: THREE.AdditiveBlending });
  const group = new THREE.Group();
  const coreMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), core);
  const haloMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), halo);
  group.add(coreMesh, haloMesh);
  group.position.copy(start);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  fx.add(group);

  // Cresce da origem ao alvo: o cilindro é deslocado para crescer de uma ponta.
  const setReach = (reach, w) => {
    for (const [mesh, k] of [
      [coreMesh, 0.35],
      [haloMesh, 1],
    ]) {
      mesh.scale.set(w * k, Math.max(0.001, length * reach), w * k);
      mesh.position.y = (length * reach) / 2;
    }
  };
  setReach(0.001, width);

  return {
    extend: (t) => setReach(easeOut(t), width * (0.6 + 0.4 * t)),
    pulse: (t) => setReach(1, width * (1 + 0.35 * Math.sin(t * Math.PI * 6))),
    fade: (t) => {
      core.opacity = 0.95 * (1 - t);
      halo.opacity = 0.55 * (1 - t);
      setReach(1, width * (1 - 0.7 * t));
    },
    dispose: () => disposeObject(group),
  };
}

// Clarão aditivo no ponto do impacto.
export function impactFlash(fx, position, color, { power = 1, y = 0.45 } = {}) {
  const material = glow(color, 0.95, { blending: THREE.AdditiveBlending });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22 + power * 0.14, 12, 12), material);
  flash.position.set(position.x, y, position.z);
  fx.add(flash);

  return animate(240, (t) => {
    flash.scale.setScalar(0.5 + easeOut(t) * (1.4 + power));
    material.opacity = 0.95 * (1 - t);
  }).then(() => disposeObject(flash));
}

/* ---------------------------------------------------- física simples */

// Integra queda, quique e atrito para cacos/pedaços soltos.
export function simulateDebris(pieces, duration, { gravity = 11, bounce = 0.32 } = {}) {
  let previous = 0;
  return animate(duration, (t) => {
    const dt = Math.min(0.05, (t - previous) * (duration / 1000));
    previous = t;
    if (dt <= 0) return;

    for (const item of pieces) {
      item.velocity.y -= gravity * dt;
      item.object.position.addScaledVector(item.velocity, dt);
      item.object.rotation.x += item.spin.x * dt;
      item.object.rotation.y += item.spin.y * dt;
      item.object.rotation.z += item.spin.z * dt;

      if (item.object.position.y <= item.floor) {
        item.object.position.y = item.floor;
        if (Math.abs(item.velocity.y) > 0.4) {
          item.velocity.y = -item.velocity.y * bounce;
          item.velocity.x *= 0.7;
          item.velocity.z *= 0.7;
          item.spin.multiplyScalar(0.5);
        } else {
          item.velocity.set(0, 0, 0);
          item.spin.multiplyScalar(0.82);
        }
      }
    }
  });
}

export function restingSpots(pieces, limit) {
  return pieces
    .slice(0, limit)
    .map((item) => ({ x: item.object.position.x, z: item.object.position.z }));
}

// Faíscas: estilhaços brilhantes que voam do impacto e caem com física.
export function sparks(fx, position, color, { count = 14, power = 1, y = 0.42 } = {}) {
  const material = glow(color, 1, { blending: THREE.AdditiveBlending });
  const bits = [];
  for (let i = 0; i < count; i++) {
    const size = 0.02 + Math.random() * 0.028;
    const bit = new THREE.Mesh(new THREE.TetrahedronGeometry(size, 0), material);
    bit.position.set(position.x, y, position.z);
    fx.add(bit);
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.3 + Math.random() * 1.9) * power;
    bits.push({
      object: bit,
      floor: 0.02,
      velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.1 + Math.random() * 2.4 * power, Math.sin(angle) * speed),
      spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6),
    });
  }

  return simulateDebris(bits, 680, { gravity: 15, bounce: 0.18 }).then(async () => {
    await Promise.all(bits.map((b) => animate(200, (t) => b.object.scale.setScalar(Math.max(0.01, 1 - t)))));
    bits.forEach((b) => disposeObject(b.object));
    material.dispose();
  });
}

// Estouro de impacto: clarão + faíscas, com força pelo tipo de peça.
export function impactBurst(fx, position, color, power = 1) {
  impactFlash(fx, position, color, { power });
  sparks(fx, position, color, { count: Math.round(10 + power * 9), power });
}

// Arco de corte (golpe de espada/cetro): meia-lua que varre e some.
export function slashArc(fx, position, color, { yaw = 0, vertical = false, radius = 0.42, y = 0.5, duration = 320 } = {}) {
  const material = glow(color, 0.8, { side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const arc = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.03, 4, 18, Math.PI * 0.9), material);
  const holder = new THREE.Group();
  holder.position.set(position.x, y, position.z);
  holder.rotation.y = yaw;
  if (vertical) arc.rotation.y = Math.PI / 2;
  else arc.rotation.x = -Math.PI / 2;
  holder.add(arc);
  fx.add(holder);

  return animate(duration, (t) => {
    arc.rotation.z = -0.6 + t * 1.8;
    arc.scale.setScalar(1 + t * 0.4);
    material.opacity = 0.8 * (1 - easeIn(t));
  }).then(() => disposeObject(holder));
}

// Destroços de pedra chutados para cima (esmagamento da torre).
export function debrisBurst(fx, position, { count = 16, color = 0x4a4540, power = 1 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0.05, flatShading: true });
  const chunks = [];
  for (let i = 0; i < count; i++) {
    const size = 0.035 + Math.random() * 0.06;
    const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material);
    chunk.position.set(position.x + (Math.random() - 0.5) * 0.3, 0.08, position.z + (Math.random() - 0.5) * 0.3);
    chunk.castShadow = true;
    fx.add(chunk);
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.6 + Math.random() * 1.6) * power;
    chunks.push({
      object: chunk,
      floor: size * 0.6,
      velocity: new THREE.Vector3(Math.cos(angle) * speed, (2 + Math.random() * 2.6) * power, Math.sin(angle) * speed),
      spin: new THREE.Vector3(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5),
    });
  }
  return simulateDebris(chunks, 1100, { gravity: 13, bounce: 0.25 }).then(async () => {
    await Promise.all(chunks.map((c) => animate(260, (t) => c.object.scale.setScalar(Math.max(0.01, 1 - t)))));
    chunks.forEach((c) => disposeObject(c.object));
    material.dispose();
  });
}

// Coluna de poeira que sobe do ponto de impacto.
export function dustColumn(fx, position, { color = 0x7d7263, height = 1.4 } = {}) {
  return Promise.all([
    dustPuff(fx, position, { count: 10, spread: 0.35, duration: 1100, color, opacity: 0.35, rise: 2.4 * height, size: 1.3 }),
    dustPuff(fx, position, { count: 8, spread: 0.6, duration: 900, color, opacity: 0.25, rise: 0.6, size: 1.1 }),
  ]);
}

// Esfera de energia em expansão com estilhaços radiais (explosão da rainha).
export function energyNova(fx, position, color, { radius = 1.6, duration = 520, y = 0.55 } = {}) {
  const shellMaterial = glow(color, 0.7, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const coreMaterial = glow(0xffffff, 0.9, { blending: THREE.AdditiveBlending });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), shellMaterial);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), coreMaterial);
  shell.position.set(position.x, y, position.z);
  core.position.copy(shell.position);
  shell.scale.setScalar(0.1);
  fx.add(shell, core);

  // Partículas que voam para fora da casca.
  const count = 90;
  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.3) * 0.8, Math.random() - 0.5).normalize();
    velocities.push(v.multiplyScalar(radius * (0.8 + Math.random() * 0.6)));
    positions.set([shell.position.x, shell.position.y, shell.position.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pointsMaterial = new THREE.PointsMaterial({
    color,
    size: 0.09,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, pointsMaterial);
  fx.add(points);

  shockRing(fx, position, color, { radius: radius * 0.9, duration: duration + 120, width: 0.14 });

  return animate(duration, (t) => {
    const e = easeOut(t);
    shell.scale.setScalar(0.1 + e * radius);
    shellMaterial.opacity = 0.7 * (1 - t);
    core.scale.setScalar(1 + e * 1.5);
    coreMaterial.opacity = 0.9 * (1 - Math.min(1, t * 2));
    for (let i = 0; i < count; i++) {
      positions[i * 3] = shell.position.x + velocities[i].x * e;
      positions[i * 3 + 1] = shell.position.y + velocities[i].y * e;
      positions[i * 3 + 2] = shell.position.z + velocities[i].z * e;
    }
    geometry.attributes.position.needsUpdate = true;
    pointsMaterial.opacity = 1 - easeIn(t);
  }).then(() => {
    disposeObject(shell);
    disposeObject(core);
    geometry.dispose();
    pointsMaterial.dispose();
    fx.remove(points);
  });
}

// Casulo de luz em volta da vítima (rajada do bispo). Devolve fade().
export function lightEnvelope(fx, position, color) {
  const material = glow(color, 0, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const cocoon = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 16, 1, true), material);
  cocoon.position.set(position.x, 0.75, position.z);
  const capMaterial = glow(0xffffff, 0, { blending: THREE.AdditiveBlending });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), capMaterial);
  cap.scale.set(1, 1.8, 1);
  cap.position.set(position.x, 0.7, position.z);
  fx.add(cocoon, cap);

  return {
    grow: (t) => {
      material.opacity = 0.55 * t;
      capMaterial.opacity = 0.35 * t;
      cocoon.rotation.y += 0.08;
    },
    fade: (t) => {
      material.opacity = 0.55 * (1 - t);
      capMaterial.opacity = 0.35 * (1 - t);
      cocoon.scale.set(1 - t * 0.5, 1 + t * 0.6, 1 - t * 0.5);
    },
    dispose: () => {
      disposeObject(cocoon);
      disposeObject(cap);
    },
  };
}

// Luzes pontuais reservadas: acender/apagar uma luz que já existe na cena não
// força o three.js a recompilar os shaders no meio do golpe (o que daria um
// engasgo). Sem reserva, cria e remove uma luz na hora.
export function reserveLights(fx, count = 2) {
  fx.userData.lightPool = Array.from({ length: count }, () => {
    const light = new THREE.PointLight(0xffffff, 0, 4, 2);
    light.userData.free = true;
    fx.add(light);
    return light;
  });
}

// Luz pontual temporária (brilho de gema/orbe): devolve set(intensidade).
export function pointGlow(fx, color, distance = 4) {
  const pooled = fx.userData.lightPool?.find((l) => l.userData.free);
  const light = pooled ?? new THREE.PointLight(color, 0, distance, 2);
  if (pooled) {
    pooled.userData.free = false;
    pooled.color.set(color);
    pooled.distance = distance;
  } else {
    fx.add(light);
  }
  return {
    light,
    at: (position) => light.position.copy(position),
    set: (value) => (light.intensity = value),
    dispose: () => {
      light.intensity = 0;
      if (pooled) pooled.userData.free = true;
      else fx.remove(light);
    },
  };
}
