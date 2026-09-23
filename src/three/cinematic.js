import * as THREE from 'three';
import { animate, easeInOut, setTimeScale } from './animation.js';
import { settings } from '../settings.js';

const SLOW_SCALE = 0.45;
const FOLLOW_RATE = 7; // quão rápido o enquadramento persegue a ação (1/s)

// Câmera cinematográfica das capturas: aproxima em três quartos, acompanha a
// ação enquanto o ataque acontece (o plano inteiro desliza junto com o ponto
// de interesse), aplica câmera lenta só em volta do impacto e devolve a
// câmera exatamente onde estava.
export function createCinematic({ camera, controls }) {
  let saved = null;
  let slowTimer = null;
  let followFn = null;
  let followRaf = 0;
  let cutting = false;
  // O replay completo desliga os cortes (fica só a ação).
  let cutsSuppressed = false;
  const desired = new THREE.Vector3();
  const delta = new THREE.Vector3();

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

    // Ataques longos pedem um plano mais aberto para caber os dois.
    const span = Math.hypot(victimPos.x - attackerPos.x, victimPos.z - attackerPos.z);
    const open = Math.min(1.6, Math.max(0, span - 1.5) * 0.3);
    const position = target
      .clone()
      .addScaledVector(side, 2.1 + open)
      .addScaledVector(direction, -1.5 - open * 0.6)
      .setY(1.75 + open * 0.5);

    return { position, target };
  }

  function followLoop() {
    if (!saved) {
      followRaf = 0;
      return;
    }
    if (followFn && !cutting) {
      const point = followFn();
      if (point) {
        desired.set(point.x, 0.55, point.z);
        delta.subVectors(desired, controls.target).multiplyScalar(Math.min(1, FOLLOW_RATE / 60));
        controls.target.add(delta);
        camera.position.add(delta);
        camera.lookAt(controls.target);
      }
    }
    followRaf = requestAnimationFrame(followLoop);
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
    if (!followRaf) followRaf = requestAnimationFrame(followLoop);
  }

  // O enquadramento passa a perseguir o ponto devolvido por fn (por quadro).
  function follow(fn) {
    followFn = fn;
  }

  // Câmera lenta curta em volta do impacto (só com a câmera cinematográfica).
  function slowMo(ms = 600, scale = SLOW_SCALE) {
    if (!saved) return;
    setTimeScale(scale);
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => setTimeScale(1), ms);
  }

  async function end() {
    // Um corte rente ao chão em andamento termina antes da volta.
    if (cutPromise) await cutPromise;
    clearTimeout(slowTimer);
    setTimeScale(1);
    followFn = null;
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

  // Corte seco para um ângulo rente ao chão, olhando para cima em direção
  // à peça — a visão de um soldado minúsculo diante da torre ou do rei.
  // Segura `hold` ms (tempo real) e volta suavemente para onde estava.
  let cutPromise = null;
  function lowAngleCut(options) {
    if (cutting || cutsSuppressed || !settings.cameraFx || !options?.subject) return Promise.resolve();
    cutPromise = runCut(options).finally(() => (cutPromise = null));
    return cutPromise;
  }

  async function runCut({ subject, toward, hold = 520 }) {
    cutting = true;
    const back = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      enabled: controls.enabled,
      fov: camera.fov,
    };
    controls.enabled = false;

    const at = subject.position;
    const dir = new THREE.Vector3(toward.x - at.x, 0, toward.z - at.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir);
    const eye = at.clone().addScaledVector(dir, 1.05).addScaledVector(side, 0.55).setY(0.1);
    const look = at.clone().setY(1.05);

    camera.position.copy(eye);
    camera.fov = back.fov + 14;
    camera.updateProjectionMatrix();
    controls.target.copy(look);
    camera.lookAt(look);

    await animate(hold, () => {
      camera.position.copy(eye);
      controls.target.copy(look);
      camera.lookAt(look);
    }, { scaled: false });

    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    await animate(
      380,
      (t) => {
        const e = easeInOut(t);
        camera.position.lerpVectors(fromPosition, back.position, e);
        controls.target.lerpVectors(fromTarget, back.target, e);
        camera.fov = back.fov + 14 * (1 - e);
        camera.updateProjectionMatrix();
        camera.lookAt(controls.target);
      },
      { scaled: false },
    );
    camera.fov = back.fov;
    camera.updateProjectionMatrix();
    controls.enabled = back.enabled;
    cutting = false;
  }

  function suppressCuts(value) {
    cutsSuppressed = !!value;
  }

  function cancel() {
    clearTimeout(slowTimer);
    setTimeScale(1);
    followFn = null;
    cancelAnimationFrame(followRaf);
    followRaf = 0;
    if (saved) {
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      controls.enabled = saved.enabled;
      saved = null;
    }
  }

  return {
    start,
    end,
    follow,
    slowMo,
    lowAngleCut,
    suppressCuts,
    flyTo,
    cancel,
    enabled,
    shotFor,
    get active() {
      return !!saved;
    },
  };
}
