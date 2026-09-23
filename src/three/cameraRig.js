import * as THREE from 'three';
import { WHITE, BLACK } from '../chess/moveGen.js';

// Azimute (theta do THREE.Spherical) de cada lado do tabuleiro.
// Brancas jogam a partir de -Z, Pretas a partir de +Z.
const SIDE_THETA = { [WHITE]: Math.PI, [BLACK]: 0 };

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createCameraRig(camera, controls) {
  let active = null;

  function currentSpherical() {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    return new THREE.Spherical().setFromVector3(offset);
  }

  function applySpherical(spherical) {
    const pos = new THREE.Vector3().setFromSpherical(spherical).add(controls.target);
    camera.position.copy(pos);
    camera.lookAt(controls.target);
  }

  function snapToSide(color) {
    const spherical = currentSpherical();
    spherical.theta = SIDE_THETA[color];
    applySpherical(spherical);
    controls.update();
  }

  // Gira suavemente para o lado do jogador da vez pelo caminho mais curto.
  function rotateToSide(color, duration = 750) {
    const start = currentSpherical();
    let delta = SIDE_THETA[color] - start.theta;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    if (Math.abs(delta) < 0.01) return Promise.resolve();

    if (active) active.cancelled = true;
    const token = { cancelled: false };
    active = token;

    return new Promise((resolve) => {
      const startTime = performance.now();
      controls.enabled = false;

      function step(now) {
        if (token.cancelled) return resolve();
        const t = Math.min(1, (now - startTime) / duration);
        const spherical = new THREE.Spherical(
          start.radius,
          start.phi,
          start.theta + delta * easeInOutQuad(t),
        );
        applySpherical(spherical);

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          controls.enabled = true;
          controls.update();
          if (active === token) active = null;
          resolve();
        }
      }

      requestAnimationFrame(step);
    });
  }

  return { rotateToSide, snapToSide };
}
