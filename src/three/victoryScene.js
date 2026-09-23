import * as THREE from 'three';
import { animate, easeInOut, easeOut } from './animation.js';
import { WHITE } from '../chess/moveGen.js';
import { GLOW_COLOR } from './combat.js';

// Cena cinematográfica de vitória: escurece o tabuleiro, acende um foco sobre
// a peça vencedora e gira a câmera lentamente ao redor dela.
export function createVictoryScene({ scene, camera, controls, lights, boardLights }) {
  const spot = new THREE.PointLight(0xffffff, 0, 9, 2);
  spot.visible = false;
  scene.add(spot);

  let base = null;

  function snapshotLights() {
    return {
      ambient: lights.ambient.intensity,
      hemi: lights.hemi.intensity,
      key: lights.key.intensity,
      fill: lights.fill.intensity,
    };
  }

  // pieceMesh: a peça que deu o mate. winnerColor: cor vencedora.
  async function play({ pieceMesh, winnerColor }) {
    if (!pieceMesh) return;
    base = snapshotLights();

    const focus = pieceMesh.getWorldPosition(new THREE.Vector3());
    const target = new THREE.Vector3(focus.x, focus.y + 0.5, focus.z);
    const color = GLOW_COLOR[winnerColor] ?? GLOW_COLOR.b;

    controls.enabled = false;
    spot.color.set(color);
    spot.position.set(focus.x, focus.y + 2.2, focus.z);
    spot.visible = true;

    // Escurece o resto e acende o foco sobre a peça.
    const dim = { ...base };
    const fromCam = camera.position.clone();
    const fromTarget = controls.target.clone();
    const closeUp = new THREE.Vector3(focus.x + 1.9, focus.y + 1.5, focus.z + 1.9);

    await animate(
      900,
      (t) => {
        const e = easeInOut(t);
        lights.ambient.intensity = dim.ambient * (1 - 0.78 * e);
        lights.hemi.intensity = dim.hemi * (1 - 0.82 * e);
        lights.key.intensity = dim.key * (1 - 0.7 * e);
        lights.fill.intensity = dim.fill * (1 - 0.75 * e);
        boardLights?.setLevel(1 - 0.75 * e);
        spot.intensity = 26 * e;
        camera.position.lerpVectors(fromCam, closeUp, e);
        controls.target.lerpVectors(fromTarget, target, e);
        camera.lookAt(controls.target);
      },
      { scaled: false },
    );

    // Órbita lenta ao redor da peça vencedora.
    const radius = 2.6;
    const startAngle = Math.atan2(camera.position.z - focus.z, camera.position.x - focus.x);
    await animate(
      4200,
      (t) => {
        const angle = startAngle + t * Math.PI * 1.1;
        const height = focus.y + 1.5 - easeOut(t) * 0.5;
        camera.position.set(
          focus.x + Math.cos(angle) * radius,
          height,
          focus.z + Math.sin(angle) * radius,
        );
        controls.target.copy(target);
        camera.lookAt(target);
        // Leve pulsar do foco.
        spot.intensity = 22 + Math.sin(t * Math.PI * 6) * 4;
      },
      { scaled: false },
    );
  }

  // Restaura luzes e controle (antes de um replay ou ao sair).
  function restore() {
    if (base) {
      lights.ambient.intensity = base.ambient;
      lights.hemi.intensity = base.hemi;
      lights.key.intensity = base.key;
      lights.fill.intensity = base.fill;
      base = null;
    }
    boardLights?.setLevel(1);
    spot.visible = false;
    spot.intensity = 0;
    controls.enabled = true;
  }

  function dispose() {
    restore();
    scene.remove(spot);
  }

  return { play, restore, dispose };
}

export { WHITE };
