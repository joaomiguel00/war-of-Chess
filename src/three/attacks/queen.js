import * as THREE from 'three';
import { animate, easeInOut, easeOut } from '../animation.js';
import { energyNova, pointGlow } from '../fx.js';
import { setXZ, approachPoint, yawToward, turnTo, swingArm, findNamed, glowPart, knockVictim, returnToNeutral } from './common.js';

const SAPPHIRE = 0x3f7bff;

// Rainha — explosão de energia em área (~1,3 s).
// Desliza até a vítima, gira o corpo inteiro com elegância, ergue o cetro e
// libera uma esfera de energia safira; a onda de choque arremessa a vítima
// com mais força que qualquer outro ataque e a cena pisca em azul.
export async function attackQueen(ctx) {
  const { mesh, from, victimPos, fx } = ctx;
  const yaw = yawToward(from, victimPos);
  const spot = approachPoint(from, victimPos, 0.95);
  const distance = Math.hypot(spot.x - from.x, spot.z - from.z);
  const gem = glowPart(findNamed(mesh, 'Scepter_Gem'), SAPPHIRE);
  const light = pointGlow(fx, SAPPHIRE, 5);

  ctx.sound.windup();
  await turnTo(ctx, yaw, 100);

  // Desliza até perto do alvo, pairando.
  if (distance > 0.05) {
    await animate(Math.min(380, 180 + distance * 45), (t) => {
      setXZ(mesh, from, spot, easeInOut(t));
      mesh.position.y = Math.sin(Math.PI * t) * 0.12;
    });
  }

  // Giro completo; na metade final o cetro sobe e a gema carrega. O braço do
  // cetro já vem erguido no modelo: basta inclinar o cetro para a frente.
  const scepterUp = swingArm(ctx, 'R', -0.4, 380);
  await animate(400, (t) => {
    const e = easeInOut(t);
    mesh.rotation.y = yaw + e * Math.PI * 2;
    mesh.position.y = Math.sin(Math.PI * t) * 0.08 + 0.1 * Math.max(0, (t - 0.5) * 2);
    const flare = Math.sin(Math.PI * t) * 0.08;
    mesh.scale.set(1 + flare, 1, 1 + flare);
    const charge = Math.max(0, (t - 0.45) / 0.55);
    gem.set(charge);
    light.at(mesh.position.clone().setY(1.6));
    light.set(10 * charge);
  });
  await scepterUp;
  mesh.rotation.y = yaw;

  // Explosão: esfera safira, clarão azul na cena inteira, vítima arremessada.
  const center = new THREE.Vector3(mesh.position.x, 0, mesh.position.z);
  ctx.strike({ power: 1.3, shake: 0.55, color: SAPPHIRE, kill: false });
  ctx.flash(SAPPHIRE, 0.55, 300);
  energyNova(fx, center, SAPPHIRE, { radius: 1.9, duration: 520 });
  knockVictim(ctx, 1.05, 0.55, 420).then(() => ctx.kill());
  light.set(26);

  await animate(260, (t) => {
    light.set(26 * (1 - t));
    gem.set(1 - easeOut(t));
  });

  await Promise.all([swingArm(ctx, 'R', 0, 260), returnToNeutral(ctx, 260)]);
  gem.restore();
  light.dispose();
}
