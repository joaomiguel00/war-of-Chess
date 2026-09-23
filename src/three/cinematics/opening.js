import * as THREE from 'three';
import { easeInOut } from '../animation.js';

// Abertura da partida com revelação de escala: a câmera começa muito longe e
// alto, o tabuleiro é só um recorte no meio da paisagem de guerra (colinas,
// fumaça, acampamentos e exércitos em silhueta); depois de ~2,6 s ela
// "mergulha" suavemente até a visão de jogo. Pode ser pulada a qualquer
// momento. A névoa é aliviada durante o voo para a paisagem aparecer.
const HOLD_MS = 2600;
const DIVE_MS = 1900;

// Laço de quadros que pode ser interrompido (pular). O passo por quadro é
// limitado: se o primeiro quadro travar (compilação de shaders da paisagem
// distante), a abertura não "pula" sozinha — ela continua de onde estava.
const MAX_STEP_MS = 50;

function run(duration, onFrame, stop) {
  return new Promise((resolve) => {
    let last = null;
    let elapsed = 0;
    function step(now) {
      if (stop()) return resolve(false);
      if (last !== null) elapsed += Math.min(MAX_STEP_MS, now - last);
      last = now;
      const t = Math.min(1, elapsed / duration);
      onFrame(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve(true);
    }
    requestAnimationFrame(step);
  });
}

export async function playOpening({ camera, controls, scene, isSkipped = () => false }) {
  const endPosition = camera.position.clone();
  const endTarget = controls.target.clone();
  const enabled = controls.enabled;
  const fog = scene.fog;
  const fogDensity = fog?.density ?? 0;
  const maxDistance = controls.maxDistance;
  controls.enabled = false;
  // O laço principal chama controls.update() todo quadro, que prenderia a
  // câmera na distância máxima de órbita: libera durante a abertura.
  controls.maxDistance = Infinity;

  // Azimute do lado do jogador: a revelação começa atrás dele, deslocada.
  const azimuth = Math.atan2(endPosition.x - endTarget.x, endPosition.z - endTarget.z);
  const orbit = (angle, radius, height) =>
    new THREE.Vector3(Math.sin(angle) * radius, height, Math.cos(angle) * radius);

  const start = orbit(azimuth + 0.95, 47, 23);
  const hold = orbit(azimuth + 0.6, 40, 19);
  const look = new THREE.Vector3(0, 0.3, 0);
  const finish = () => {
    camera.position.copy(endPosition);
    controls.target.copy(endTarget);
    camera.lookAt(endTarget);
    if (fog) fog.density = fogDensity;
    controls.maxDistance = maxDistance;
    controls.enabled = enabled;
    controls.update();
  };

  if (fog) fog.density = Math.min(fogDensity, 0.011);
  camera.position.copy(start);
  controls.target.copy(look);
  camera.lookAt(look);

  // 1) Panorama distante, deslizando devagar.
  const completed = await run(
    HOLD_MS,
    (t) => {
      camera.position.lerpVectors(start, hold, easeInOut(t));
      camera.lookAt(look);
    },
    isSkipped,
  );
  if (!completed) return finish();

  // 2) O mergulho até a posição de jogo; a névoa volta ao normal.
  const control = hold.clone().lerp(endPosition, 0.5).setY(Math.max(hold.y, endPosition.y) * 0.9);
  const curve = new THREE.QuadraticBezierCurve3(hold, control, endPosition);
  const point = new THREE.Vector3();
  await run(
    DIVE_MS,
    (t) => {
      const e = easeInOut(t);
      curve.getPoint(e, point);
      camera.position.copy(point);
      controls.target.lerpVectors(look, endTarget, e);
      camera.lookAt(controls.target);
      if (fog) fog.density = THREE.MathUtils.lerp(0.011, fogDensity, e * e);
    },
    isSkipped,
  );
  finish();
}
