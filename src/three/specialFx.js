import * as THREE from 'three';
import { WHITE } from '../chess/moveGen.js';
import { animate, easeOut, easeInOut, wait, disposeObject } from './animation.js';

const TEAM_COLOR = { [WHITE]: 0xffb257, b: 0xf05bff };

// Efeitos próprios dos lances especiais. Ficam num grupo separado e são
// sempre descartados ao final.
export function createSpecialFx({ scene }) {
  const group = new THREE.Group();
  scene.add(group);

  function glowMaterial(color, opacity = 0.7) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }

  // Promoção: cerimônia de coroação — coluna de luz, anéis subindo e faíscas.
  async function playPromotion(position, color) {
    const tint = TEAM_COLOR[color] ?? TEAM_COLOR.b;

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 4.2, 10, 1, true),
      glowMaterial(tint, 0),
    );
    column.position.set(position.x, 2.1, position.z);
    group.add(column);

    const halo = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.52, 24), glowMaterial(tint, 0));
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(position.x, 0.03, position.z);
    group.add(halo);

    const light = new THREE.PointLight(tint, 0, 7, 2);
    light.position.set(position.x, 1.4, position.z);
    group.add(light);

    // Faíscas que sobem em espiral.
    const sparks = [];
    for (let i = 0; i < 16; i++) {
      const spark = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.045, 0),
        glowMaterial(tint, 0.9),
      );
      const angle = (i / 16) * Math.PI * 2;
      sparks.push({ mesh: spark, angle, radius: 0.28 + Math.random() * 0.22, speed: 1 + Math.random() });
      spark.position.set(position.x, 0.05, position.z);
      group.add(spark);
    }

    await animate(520, (t) => {
      const e = easeOut(t);
      column.material.opacity = 0.22 * e;
      column.scale.set(1 - e * 0.35, 1, 1 - e * 0.35);
      halo.material.opacity = 0.75 * e;
      halo.scale.setScalar(1 + e * 0.6);
      light.intensity = 26 * e;

      for (const spark of sparks) {
        const angle = spark.angle + t * spark.speed * 4;
        spark.mesh.position.set(
          position.x + Math.cos(angle) * spark.radius,
          0.05 + e * 1.9,
          position.z + Math.sin(angle) * spark.radius,
        );
      }
    });

    await animate(620, (t) => {
      column.material.opacity = 0.22 * (1 - t);
      halo.material.opacity = 0.75 * (1 - t);
      halo.scale.setScalar(1.6 + t * 1.2);
      light.intensity = 26 * (1 - t);
      for (const spark of sparks) {
        spark.mesh.position.y += 0.012;
        spark.mesh.material.opacity = 0.9 * (1 - t);
      }
    });

    disposeObject(column);
    disposeObject(halo);
    group.remove(light);
    sparks.forEach((spark) => disposeObject(spark.mesh));
  }

  // Roque: a torre abre os portões — dois batentes sobem na casa dela,
  // escancaram e afundam de volta na pedra.
  async function playCastle(rookFrom, kingTo, color) {
    const tint = TEAM_COLOR[color] ?? TEAM_COLOR.b;
    const toKing = new THREE.Vector3().subVectors(kingTo, rookFrom).setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toKing);

    const stone = new THREE.MeshStandardMaterial({
      color: 0x2c2933,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });

    const gates = [-1, 1].map((sign) => {
      const gate = new THREE.Group();
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.25, 0.12), stone);
      panel.position.set(0.23, 0.62, 0);
      gate.add(panel);

      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 1.2), glowMaterial(tint, 0.8));
      seam.position.set(0.02, 0.62, 0.08);
      gate.add(seam);

      // Dobradiça na linha entre a torre e o rei.
      gate.position.copy(rookFrom).addScaledVector(side, sign * 0.48);
      gate.rotation.y = Math.atan2(side.x, side.z) + (sign > 0 ? Math.PI : 0);
      gate.scale.y = 0.01;
      group.add(gate);
      return { gate, sign, seam };
    });

    // Sobem da pedra.
    await animate(280, (t) => {
      const e = easeOut(t);
      for (const { gate } of gates) gate.scale.y = Math.max(0.01, e);
    });

    // Escancaram.
    await animate(420, (t) => {
      const e = easeInOut(t);
      for (const { gate, sign } of gates) {
        gate.rotation.y += 0;
        gate.children[0].rotation.y = sign * e * 1.15;
        gate.children[1].material.opacity = 0.8 * (1 - e * 0.6);
      }
    });

    await wait(260);

    // Afundam de volta.
    await animate(340, (t) => {
      for (const { gate } of gates) gate.scale.y = Math.max(0.01, 1 - easeInOut(t));
    });

    gates.forEach(({ gate }) => disposeObject(gate));
    stone.dispose();
  }

  // En passant: golpe furtivo — um vulto atravessa a casa e deixa um corte.
  async function playEnPassant(attackerPos, victimPos, color) {
    const tint = TEAM_COLOR[color] ?? TEAM_COLOR.b;
    const direction = new THREE.Vector3().subVectors(victimPos, attackerPos).setY(0).normalize();

    // Rastro escuro que corre até a vítima.
    const trail = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.5),
      glowMaterial(0x140a18, 0.85),
    );
    trail.rotation.x = -Math.PI / 2;
    trail.rotation.z = -Math.atan2(direction.z, direction.x);
    trail.position.set(attackerPos.x, 0.03, attackerPos.z);
    group.add(trail);

    // Corte luminoso em cima da vítima.
    const slash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.1), glowMaterial(tint, 0));
    slash.position.set(victimPos.x, 0.55, victimPos.z);
    slash.rotation.z = 0.7;
    group.add(slash);

    await animate(240, (t) => {
      const e = easeOut(t);
      trail.position.set(
        attackerPos.x + (victimPos.x - attackerPos.x) * e,
        0.03,
        attackerPos.z + (victimPos.z - attackerPos.z) * e,
      );
      trail.material.opacity = 0.85 * (1 - t * 0.4);
    });

    await animate(180, (t) => {
      slash.material.opacity = 0.9 * Math.sin(Math.PI * t);
      slash.scale.set(1 + t * 5, 1, 1);
      trail.material.opacity = 0.5 * (1 - t);
    });

    await animate(260, (t) => {
      slash.material.opacity = 0;
      trail.material.opacity = 0;
      void t;
    });

    disposeObject(trail);
    disposeObject(slash);
  }

  function dispose() {
    while (group.children.length) disposeObject(group.children[0]);
    group.parent?.remove(group);
  }

  return { playPromotion, playCastle, playEnPassant, dispose, group };
}
