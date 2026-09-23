import * as THREE from 'three';
import { BRAZIER_SPOTS } from './terrain.js';

// A sombra chega antes do inimigo: uma luz de sombra baixa e quente parte
// do braseiro ATRÁS de quem se move e mira o destino, então a sombra longa
// da peça se estende à frente dela e cobre o alvo antes do contato. Parado,
// a luz fica no braseiro atrás do exército da vez. Uma única luz com
// sombra (um passe extra) em vez de sombra nos quatro braseiros.
const HEIGHT = 1.15;

export function createBrazierShadow({ scene, heightAt }) {
  const light = new THREE.SpotLight(0xff9a4a, 26, 22, 0.95, 0.65, 1.4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 22;
  light.shadow.bias = -0.0012;
  light.shadow.radius = 3;
  // O mapa de sombra só é redesenhado a cada quadro enquanto algo se move
  // (o momento em que a sombra "chega antes"); parado, basta ~7 vezes por
  // segundo para acompanhar a respiração das peças. Economiza o passe extra.
  light.shadow.autoUpdate = false;
  light.shadow.needsUpdate = true;
  const IDLE_REFRESH = 0.14;
  let sinceRefresh = 0;
  scene.add(light, light.target);

  const spots = BRAZIER_SPOTS.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + HEIGHT + 0.5, z));
  const position = spots[2].clone();
  const aim = new THREE.Vector3();
  const goalPosition = position.clone();
  const goalAim = new THREE.Vector3();
  light.position.copy(position);

  // Braseiro mais "atrás" de quem vai de `from` para `to`.
  function behind(from, to) {
    const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
    dir.normalize();
    let best = spots[0];
    let bestScore = Infinity;
    for (const spot of spots) {
      const toSpot = new THREE.Vector3(spot.x - from.x, 0, spot.z - from.z).normalize();
      const score = toSpot.dot(dir);
      if (score < bestScore) {
        bestScore = score;
        best = spot;
      }
    }
    return best;
  }

  function focusMove(from, to) {
    goalPosition.copy(behind(from, to));
    goalAim.set(to.x, 0, to.z);
  }

  // Em repouso: atrás do exército da vez (Ordem em -Z, Ruína em +Z).
  function focusSide(color) {
    const z = color === 'w' ? -1 : 1;
    goalPosition.copy(spots.find((s) => Math.sign(s.z) === z && s.x < 0) ?? spots[0]);
    goalAim.set(0, 0, -z * 1.5);
  }

  function update(dt, { intensity = 1, busy = false } = {}) {
    const k = Math.min(1, dt * 2.5);
    const settling = position.distanceToSquared(goalPosition) > 1e-4 || aim.distanceToSquared(goalAim) > 1e-4;
    position.lerp(goalPosition, k);
    aim.lerp(goalAim, k);
    sinceRefresh += dt;
    if (busy || settling || sinceRefresh >= IDLE_REFRESH) {
      light.shadow.needsUpdate = true;
      sinceRefresh = 0;
    }
    light.position.copy(position);
    light.target.position.copy(aim);
    light.intensity = 26 * intensity * (0.92 + Math.random() * 0.08);
  }

  function dispose() {
    scene.remove(light, light.target);
    light.dispose();
  }

  focusSide('w');
  return { focusMove, focusSide, update, dispose };
}
