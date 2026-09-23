import * as THREE from 'three';
import { animate, easeInOut, setTimeScale } from './animation.js';
import { settings } from '../settings.js';

const SLOW_SCALE = 0.45;
const SLOW_WINDOW_MS = 1300;

// Câmera cinematográfica das capturas: aproxima em câmera lenta, segura o
// golpe por um instante e devolve a câmera exatamente onde estava.
export function createCinematic({ camera, controls }) {
  let saved = null;
  let slowTimer = null;

  function enabled() {
    return settings.cinematic;
  }

  // Ponto de vista em três quartos sobre a ação, baixo e próximo.
  function shotFor(attackerPos, victimPos) {
    const direction = new THREE.Vector3()
      .subVectors(victimPos, attackerPos)
      .setY(0);
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, 1);
    direction.normalize();

    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction);
    const target = new THREE.Vector3()
      .addVectors(attackerPos, victimPos)
      .multiplyScalar(0.5)
      .setY(0.55);

    const position = target
      .clone()
      .addScaledVector(side, 2.1)
      .addScaledVector(direction, -1.5)
      .setY(1.75);

    return { position, target };
  }

  async function start(attackerPos, victimPos) {
    if (!enabled() || saved) return;

    saved = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      enabled: controls.enabled,
    };

    const shot = shotFor(attackerPos, victimPos);
    controls.enabled = false;

    // A aproximação corre em tempo real; só a ação fica lenta.
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    await animate(
      420,
      (t) => {
        const e = easeInOut(t);
        camera.position.lerpVectors(fromPosition, shot.position, e);
        controls.target.lerpVectors(fromTarget, shot.target, e);
        camera.lookAt(controls.target);
      },
      { scaled: false },
    );

    setTimeScale(SLOW_SCALE);
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => setTimeScale(1), SLOW_WINDOW_MS);
  }

  async function end() {
    clearTimeout(slowTimer);
    setTimeScale(1);
    if (!saved) return;

    const back = saved;
    saved = null;

    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    await animate(
      520,
      (t) => {
        const e = easeInOut(t);
        camera.position.lerpVectors(fromPosition, back.position, e);
        controls.target.lerpVectors(fromTarget, back.target, e);
        camera.lookAt(controls.target);
      },
      { scaled: false },
    );

    controls.enabled = back.enabled;
    controls.update();
  }

  // Usada também pelos destaques do fim de jogo.
  function flyTo(position, target, duration = 700) {
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    return animate(
      duration,
      (t) => {
        const e = easeInOut(t);
        camera.position.lerpVectors(fromPosition, position, e);
        controls.target.lerpVectors(fromTarget, target, e);
        camera.lookAt(controls.target);
      },
      { scaled: false },
    );
  }

  function cancel() {
    clearTimeout(slowTimer);
    setTimeScale(1);
    if (saved) {
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      controls.enabled = saved.enabled;
      saved = null;
    }
  }

  return { start, end, flyTo, cancel, enabled, shotFor };
}
