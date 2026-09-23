import * as THREE from 'three';
import { animate, easeIn, easeInOut, easeOut } from '../animation.js';
import { pointGlow, slashArc, shockRing, dustPuff } from '../fx.js';
import { setXZ, approachPoint, yawToward, turnTo, swingArm, findNamed, glowPart, knockVictim, returnToNeutral } from './common.js';

const ROYAL_GOLD = 0xffc94a;

// Rei — golpe decisivo de espada e orbe (~1,4 s).
// O orbe carrega devagar (~0,4 s), a espada sobe e desce num golpe único e
// pesado; no impacto: hit-stop de 120 ms (o mais longo) e o clarão dourado
// mais forte do jogo envolvendo a cena inteira.
export async function attackKing(ctx) {
  const { mesh, from, victimPos, fx } = ctx;
  const yaw = yawToward(from, victimPos);
  const spot = approachPoint(from, victimPos, 0.56);
  const orb = glowPart(findNamed(mesh, 'Golden_Orb'), ROYAL_GOLD);
  const light = pointGlow(fx, ROYAL_GOLD, 4.5);
  const orbPosition = () =>
    orb.part ? orb.part.getWorldPosition(new THREE.Vector3()) : mesh.position.clone().setY(1.2);

  await turnTo(ctx, yaw, 120);

  // Ergue o orbe (mais lento e dramático) enquanto avança meio passo.
  ctx.sound.windup();
  await Promise.all([
    swingArm(ctx, 'L', 2.2, 400),
    animate(400, (t) => {
      const e = easeInOut(t);
      setXZ(mesh, from, spot, e);
      mesh.rotation.x = -0.1 * e;
      const level = easeIn(t);
      orb.set(level);
      light.at(orbPosition());
      light.set(14 * level);
    }),
  ]);

  // Espada sobe acima da cabeça.
  await Promise.all([
    swingArm(ctx, 'R', 2.9, 200, easeOut),
    animate(200, (t) => {
      mesh.rotation.x = -0.1 - 0.08 * easeOut(t);
      light.at(orbPosition());
      light.set(14 + 4 * Math.sin(t * 30));
    }),
  ]);

  // Desce o golpe, pesado.
  await Promise.all([
    swingArm(ctx, 'R', 1.1, 130, easeIn),
    animate(130, (t) => {
      mesh.rotation.x = -0.18 + 0.48 * easeIn(t);
      mesh.position.y = -0.03 * t;
    }),
  ]);

  // Impacto: o hit-stop mais longo e o clarão mais intenso do jogo.
  ctx.hitStop(120);
  ctx.strike({ power: 1.6, shake: 0.62, color: ROYAL_GOLD, kill: false });
  ctx.flash(ROYAL_GOLD, 0.9, 380);
  slashArc(fx, ctx.victim?.position ?? victimPos, ROYAL_GOLD, { yaw, vertical: true, radius: 0.5, y: 0.6 });
  shockRing(fx, victimPos, ROYAL_GOLD, { radius: 1, width: 0.1 });
  dustPuff(fx, victimPos, { count: 8, spread: 0.35 });
  knockVictim(ctx, 0.3, 0.06, 220).then(() => ctx.kill());
  light.set(40);

  await animate(240, (t) => {
    light.set(40 * (1 - easeOut(t)));
    orb.set(1 - t);
  });

  await Promise.all([swingArm(ctx, 'L', 0, 280), swingArm(ctx, 'R', 0, 280), returnToNeutral(ctx, 280)]);
  orb.restore();
  light.dispose();
}
