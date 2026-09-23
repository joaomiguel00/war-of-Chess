import * as THREE from 'three';
import { PRIORITY } from './poseDirector.js';
import { pieceParts } from './rigParts.js';
import { animate, easeIn, reparentKeepingWorld, disposeObject } from '../animation.js';

// Rendição no xeque-mate: as peças do perdedor se ajoelham, baixam a cabeça
// e largam a arma no chão; o rei vencedor ergue a espada. A pose fica até
// o fim da partida (ou até o replay recomeçar tudo).
export function createSurrender({ scene, director }) {
  const dropped = new THREE.Group();
  dropped.name = 'DroppedWeapons';
  scene.add(dropped);
  let kneeling = [];
  let triumphant = null;

  function dropWeapon(piece) {
    const weapon = pieceParts(piece).weapon;
    if (!weapon || weapon.parent === dropped) return Promise.resolve();
    director.release(piece);
    reparentKeepingWorld(weapon, dropped);
    const start = weapon.position.clone();
    const startQ = weapon.quaternion.clone();
    // Cai deitada ao lado da peça, girando no eixo de quem a solta.
    const side = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), side).normalize();
    const endQ = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2 * 0.95).multiply(startQ);
    const end = start.clone().addScaledVector(side, 0.18);
    end.y = 0.05;
    return animate(520 + Math.random() * 200, (t) => {
      const e = easeIn(t);
      weapon.position.lerpVectors(start, end, e);
      weapon.position.y += Math.sin(Math.PI * t) * 0.08;
      weapon.quaternion.slerpQuaternions(startQ, endQ, e);
    });
  }

  // losers: peças do exército derrotado (menos o rei, que já caiu de joelhos).
  // winnerKing: o rei vencedor, se estiver no tabuleiro.
  function play({ losers, winnerKing }) {
    kneeling = losers.map((piece) => ({ piece, delay: Math.random() * 0.45, since: performance.now() }));
    triumphant = winnerKing ?? null;
    return Promise.all(
      kneeling.map(
        ({ piece, delay }) =>
          new Promise((resolve) => setTimeout(() => dropWeapon(piece).then(resolve), 250 + delay * 1000)),
      ),
    );
  }

  function update() {
    const now = performance.now();
    for (const { piece, delay, since } of kneeling) {
      if (now - since < delay * 1000) continue;
      director.request(piece, PRIORITY.surrender, {
        head: { pitch: 0.55, yaw: 0, roll: 0 },
        body: { y: -0.1, pitch: 0.32, roll: 0 },
        tremble: 0.15,
        rate: 3.2,
      });
    }
    if (triumphant) {
      director.request(triumphant, PRIORITY.surrender, {
        arms: { R: 2.9, L: 0.6 },
        head: { pitch: -0.3, yaw: 0 },
        body: { pitch: -0.08 },
        rate: 4,
      });
    }
  }

  function reset() {
    kneeling = [];
    triumphant = null;
    while (dropped.children.length) disposeObject(dropped.children[0]);
  }

  function dispose() {
    reset();
    scene.remove(dropped);
  }

  return { play, update, reset, dispose };
}
