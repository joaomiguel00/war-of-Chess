import * as THREE from 'three';
import { animate, easeIn, easeOut, easeInOut, disposeObject } from '../animation.js';
import { dustPuff, shockRing } from '../fx.js';
import { setXZ, approachPoint, yawToward, turnTo, knockVictim, returnToNeutral } from './common.js';

// Lança de justa presa ao invólucro do cavalo (espaço local: frente = +Z).
function buildLance(teamColor) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.8, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8b8c4, roughness: 0.3, metalness: 0.9, flatShading: true });
  const lance = new THREE.Group();

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.15, 6), wood);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.45;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 6), steel);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 1.14;
  const guard = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 8, 1, true), steel);
  guard.rotation.x = -Math.PI / 2;
  guard.position.z = -0.02;
  const pennon = new THREE.Mesh(
    new THREE.PlaneGeometry(0.16, 0.1),
    new THREE.MeshBasicMaterial({ color: teamColor, side: THREE.DoubleSide, toneMapped: false }),
  );
  pennon.position.set(0, 0.06, 0.86);
  pennon.rotation.y = Math.PI / 2;
  lance.add(shaft, tip, guard, pennon);
  lance.position.set(0.17, 0.58, 0.05);
  lance.scale.setScalar(0.001);
  return lance;
}

// Cavalo — carga de lança (~1,1 s).
// Dash acelerado em linha reta com a lança apontada, rastro de poeira,
// hit-stop de 80 ms no impacto e a vítima arremessada para trás.
export async function attackKnight(ctx) {
  const { mesh, from, victimPos, fx } = ctx;
  const yaw = yawToward(from, victimPos);
  const lance = buildLance(ctx.teamColor);
  mesh.add(lance);

  ctx.sound.windup();
  await turnTo(ctx, yaw, 110);

  // Empina e baixa a lança.
  await animate(170, (t) => {
    const e = easeOut(t);
    lance.scale.setScalar(Math.max(0.001, e));
    lance.rotation.x = -0.5 * (1 - e) + 0.08 * e;
    mesh.rotation.x = -0.22 * Math.sin(Math.PI * t);
    mesh.position.y = 0.1 * Math.sin(Math.PI * t);
  });

  // Carga: acelera o tempo todo (easeIn), deixando poeira para trás.
  const hitPoint = approachPoint(from, victimPos, 0.3);
  let lastPuff = 0;
  await animate(300, (t) => {
    setXZ(mesh, from, hitPoint, easeIn(t));
    mesh.rotation.x = 0.2 * Math.min(1, t * 2);
    mesh.position.y = Math.abs(Math.sin(t * Math.PI * 5)) * 0.05;
    if (t - lastPuff > 0.14) {
      lastPuff = t;
      dustPuff(fx, mesh.position.clone().addScaledVector(ctx.dir, -0.3), {
        count: 3,
        spread: 0.12,
        duration: 520,
        opacity: 0.28,
        rise: 0.5,
      });
    }
  });

  // Impacto da lança: congela, estoura e arremessa.
  ctx.hitStop(80);
  ctx.strike({ power: 1.1, shake: 0.42, kill: false });
  // Arremessada para trás; só cai onde aterrissa.
  knockVictim(ctx, 0.6, 0.28, 280).then(() => ctx.kill());
  shockRing(fx, hitPoint, 0x8a8175, { radius: 0.5 });

  // Embala até a casa e recolhe a lança.
  const glideFrom = mesh.position.clone();
  await animate(220, (t) => {
    setXZ(mesh, glideFrom, victimPos, easeOut(t));
    mesh.rotation.x = 0.2 * (1 - easeOut(t));
    mesh.position.y = 0;
  });
  await Promise.all([
    animate(160, (t) => {
      lance.scale.setScalar(Math.max(0.001, 1 - easeInOut(t)));
      lance.rotation.x = 0.08 - 0.6 * t;
    }),
    returnToNeutral(ctx, 200),
  ]);
  mesh.remove(lance);
  disposeObject(lance);
}
