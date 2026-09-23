import * as THREE from 'three';
import { animate, easeInOut, easeOut } from '../animation.js';
import { energyBeam, lightEnvelope, pointGlow, impactFlash } from '../fx.js';
import { yawToward, turnTo, swingArm, findNamed, glowPart, returnToNeutral } from './common.js';

const HOLY_GOLD = 0xffcf5a;

// Bispo — rajada de energia sagrada (~1,2 s), à distância.
// Ergue o cajado, a gema carrega por ~0,3 s, o feixe fino dourado sai da
// gema até a vítima, que fica envolta em luz por um instante antes de cair.
export async function attackBishop(ctx) {
  const { mesh, from, victimPos, fx } = ctx;
  const yaw = yawToward(from, victimPos);
  const gem = glowPart(findNamed(mesh, 'Staff_Gem') ?? findNamed(mesh, 'Staff'), HOLY_GOLD);
  const light = pointGlow(fx, HOLY_GOLD, 3.5);

  await turnTo(ctx, yaw, 120);

  // Ergue o cajado e flutua um pouco.
  await Promise.all([
    swingArm(ctx, 'R', 1.75, 240),
    animate(240, (t) => {
      mesh.position.y = 0.1 * easeOut(t);
      mesh.rotation.x = -0.1 * easeOut(t);
    }),
  ]);

  // Carrega a gema (~0,3 s): brilho e luz crescendo.
  ctx.sound.windup();
  const gemPosition = () =>
    gem.part ? gem.part.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(mesh.position.x, 1.35, mesh.position.z);
  await animate(300, (t) => {
    const level = easeInOut(t) * (1 + 0.15 * Math.sin(t * 40));
    gem.set(level);
    light.at(gemPosition());
    light.set(12 * level);
  });

  // Dispara: feixe fino e concentrado até o centro da vítima.
  const target = new THREE.Vector3(victimPos.x, 0.55, victimPos.z);
  const beam = energyBeam(fx, gemPosition(), target, HOLY_GOLD, { width: 0.045 });
  await animate(110, (t) => beam.extend(t));

  ctx.strike({ power: 0.9, shake: 0.22, kill: false, color: HOLY_GOLD });
  impactFlash(fx, target, HOLY_GOLD, { power: 0.6, y: 0.55 });

  // A luz envolve a vítima por um instante...
  const envelope = lightEnvelope(fx, victimPos, HOLY_GOLD);
  await animate(240, (t) => {
    beam.pulse(t);
    envelope.grow(easeOut(t));
    light.set(12 + 4 * Math.sin(t * 20));
  });

  // ...e ela cai, se dissolvendo na luz.
  ctx.kill('dissolve');
  await Promise.all([
    animate(200, (t) => {
      beam.fade(t);
      gem.set(1 - t);
      light.set(12 * (1 - t));
    }),
    swingArm(ctx, 'R', 0, 260),
  ]);
  beam.dispose();
  animate(320, (t) => envelope.fade(t)).then(() => envelope.dispose());

  await returnToNeutral(ctx, 200);
  gem.restore();
  light.dispose();
}
