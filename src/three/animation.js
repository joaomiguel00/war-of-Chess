import * as THREE from 'three';

// Escala global de tempo: 1 é normal, 0.45 é câmera lenta.
// Como o tempo é acumulado quadro a quadro, mudar a escala no meio de uma
// animação funciona sem saltos.
let timeScale = 1;

export function setTimeScale(value) {
  timeScale = Math.max(0.05, value);
}

export function getTimeScale() {
  return timeScale;
}

// Executa uma animação por quadro; resolve quando termina.
// `scaled: false` ignora a câmera lenta (usado pela própria câmera).
export function animate(duration, onFrame, { scaled = true } = {}) {
  return new Promise((resolve) => {
    let elapsed = 0;
    let last = performance.now();

    function step(now) {
      elapsed += (now - last) * (scaled ? timeScale : 1);
      last = now;
      const t = Math.min(1, elapsed / duration);
      onFrame(t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }

    requestAnimationFrame(step);
  });
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;

// Suaviza qualquer trecho [0..1] com derivada nula nas pontas (sem "quinas"
// no tempo, ou seja, começa e termina sem solavanco).
export const smoothStep = (t) => t * t * (3 - 2 * t);

// Saída com leve ultrapassagem (overshoot): a peça passa um pouco do alvo
// e assenta. Dá vida ao pouso do movimento sem parecer elástico demais.
export function easeOutBack(t, overshoot = 1.2) {
  const c = overshoot;
  const p = t - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

// Interpolação linear escalar utilitária.
export const lerp = (a, b, t) => a + (b - a) * t;

// Direção horizontal normalizada de a para b.
export function horizontalDir(a, b) {
  const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  return dir.lengthSq() < 1e-6 ? new THREE.Vector3(0, 0, 1) : dir.normalize();
}

// Quaternion que tomba a peça na direção `dir` (eixo horizontal perpendicular).
export function tipQuaternion(startQuaternion, dir, angle) {
  const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
  return new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(startQuaternion);
}

export function forEachMaterial(root, callback) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach(callback);
  });
}

// Esmaece a peça inteira. Os materiais são exclusivos de cada peça,
// então alterar opacidade aqui não afeta as outras.
export function fadeOut(root, duration = 400) {
  const entries = [];
  forEachMaterial(root, (material) => {
    material.transparent = true;
    entries.push({ material, opacity: material.opacity });
  });
  return animate(duration, (t) => {
    for (const entry of entries) entry.material.opacity = entry.opacity * (1 - t);
  });
}

// Move um objeto para outro pai preservando posição/rotação/escala no mundo.
export function reparentKeepingWorld(object, newParent) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.getWorldPosition(position);
  object.getWorldQuaternion(quaternion);
  object.getWorldScale(scale);
  newParent.add(object);
  object.position.copy(position);
  object.quaternion.copy(quaternion);
  object.scale.copy(scale);
  return object;
}

export function findPart(root, name) {
  let found = null;
  root.traverse((obj) => {
    if (!found && obj.userData?.part === name) found = obj;
  });
  return found;
}

export function disposeObject(object) {
  object.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    materials.forEach((m) => m?.dispose());
  });
  object.parent?.remove(object);
}
