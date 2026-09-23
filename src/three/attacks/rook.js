import { animate, easeIn, easeOut, easeInOut } from '../animation.js';
import { dustPuff, debrisBurst, dustColumn, shockRing } from '../fx.js';
import { setXZ, approachPoint, yawToward, turnTo, returnToNeutral } from './common.js';

// Torre — esmagamento de fortaleza (~1,3–1,5 s).
// Avança devagar, passo a passo, empina e tomba sobre a vítima. O tremor é o
// mais forte dos ataques e os destroços sobem do ponto do impacto.
export async function attackRook(ctx) {
  const { mesh, from, victimPos, fx } = ctx;
  const yaw = yawToward(from, victimPos);
  const spot = approachPoint(from, victimPos, 0.72);
  const distance = Math.hypot(spot.x - from.x, spot.z - from.z);

  await turnTo(ctx, yaw, 120);

  // Marcha pesada: cada passo afunda, levanta poeira e treme o chão.
  if (distance > 0.05) {
    const steps = Math.max(2, Math.round(distance / 0.9));
    const duration = Math.min(640, 380 + distance * 70);
    let landed = 0;
    await animate(duration, (t) => {
      setXZ(mesh, from, spot, easeInOut(t));
      const phase = t * steps;
      const inStep = phase - Math.floor(phase);
      mesh.position.y = Math.sin(Math.PI * inStep) * 0.05;
      mesh.rotation.z = Math.sin(Math.PI * phase) * 0.04;
      const step = Math.floor(phase);
      if (step > landed && step <= steps) {
        landed = step;
        ctx.sound.step();
        ctx.shake(0.08);
        dustPuff(fx, mesh.position, { count: 3, spread: 0.25, duration: 500, opacity: 0.22 });
      }
    });
  }

  // Visto do chão: a fortaleza se ergue sobre a vítima.
  ctx.lowAngle?.(560);

  // Empina: junta o peso para trás.
  await animate(180, (t) => {
    const e = easeOut(t);
    mesh.rotation.z = 0;
    mesh.rotation.x = -0.2 * e;
    mesh.position.y = 0.14 * e;
    mesh.scale.y = 1 + 0.05 * e;
  });

  // Tomba por cima da vítima.
  const topple = mesh.position.clone();
  await animate(180, (t) => {
    const e = easeIn(t);
    mesh.rotation.x = -0.2 + 1.15 * e;
    mesh.position.y = 0.14 * (1 - e);
    setXZ(mesh, topple, approachPoint(from, victimPos, 0.32), e);
  });

  // Impacto: esmaga, estremece, pedra voando.
  ctx.hitStop(60);
  ctx.strike({ power: 1.4, shake: 0.9, style: 'crush' });
  debrisBurst(fx, victimPos, { count: 18, power: 1.1 });
  dustColumn(fx, victimPos);
  shockRing(fx, victimPos, 0x9b7b46, { radius: 1.1, width: 0.12 });

  await animate(90, () => {});

  // Levanta-se de volta e assenta na casa conquistada.
  const rise = mesh.position.clone();
  await animate(280, (t) => {
    const e = easeInOut(t);
    mesh.rotation.x = 0.95 * (1 - e);
    mesh.scale.y = 1.05 - 0.05 * e;
    setXZ(mesh, rise, victimPos, e);
  });
  await returnToNeutral(ctx, 130);
}
