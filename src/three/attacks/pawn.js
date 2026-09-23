import { animate, easeInOut, easeIn, easeOut } from '../animation.js';
import { dustPuff, slashArc } from '../fx.js';
import { setXZ, approachPoint, yawToward, turnTo, knockVictim, returnToNeutral } from './common.js';

// Peão — investida com escudo e espada (~1,0 s).
// Corridinha desajeitada, escudada que faz a vítima recuar e golpe curto de
// espada. O som metálico seco sai no golpe, não na largada.
export async function attackPawn(ctx) {
  const { mesh, from, victimPos, fx } = ctx;
  const spot = approachPoint(from, victimPos, 0.52);
  const yaw = yawToward(from, victimPos);

  ctx.sound.windup();
  await turnTo(ctx, yaw, 100);

  // Corrida curta: passinhos rápidos, gingado lateral de quem é baixinho.
  await animate(300, (t) => {
    setXZ(mesh, from, spot, easeInOut(t));
    const stride = Math.sin(t * Math.PI * 4);
    mesh.position.y = Math.abs(stride) * 0.06;
    mesh.rotation.z = stride * 0.13;
    mesh.rotation.x = 0.18 * Math.sin(Math.PI * Math.min(1, t * 1.3));
  });

  // Escudada: gira o ombro para trás e empurra com o corpo todo.
  await animate(90, (t) => {
    mesh.rotation.y = yaw + 0.55 * easeOut(t);
    mesh.rotation.z = 0;
    mesh.position.y = 0;
  });
  const bashFrom = mesh.position.clone();
  const bashTo = approachPoint(from, victimPos, 0.36);
  let bashed = false;
  await animate(130, (t) => {
    setXZ(mesh, bashFrom, bashTo, easeIn(t));
    mesh.rotation.y = yaw + 0.55 - 0.9 * easeIn(t);
    mesh.rotation.x = 0.12 + 0.1 * t;
    if (t > 0.8 && !bashed) {
      bashed = true;
      ctx.sound.bash();
      ctx.shake(0.14);
      knockVictim(ctx, 0.2, 0.03, 170);
      dustPuff(fx, victimPos, { count: 4, spread: 0.18, duration: 450 });
    }
  });

  // Recolhe e arma o golpe.
  await animate(110, (t) => {
    mesh.rotation.y = yaw - 0.35 + 0.6 * easeOut(t);
    mesh.rotation.x = 0.22 - 0.3 * easeOut(t);
  });

  // Golpe de espada curto, com pulinho.
  await animate(150, (t) => {
    mesh.rotation.y = yaw + 0.25 - 0.45 * easeIn(t);
    mesh.rotation.x = -0.08 + 0.5 * easeIn(t);
    mesh.position.y = Math.sin(Math.PI * t) * 0.07;
  });
  ctx.strike({ power: 0.75, shake: 0.2 });
  slashArc(fx, ctx.victim?.position ?? victimPos, ctx.teamColor, { yaw, vertical: true, radius: 0.36, y: 0.55 });

  await returnToNeutral(ctx, 240);
}
