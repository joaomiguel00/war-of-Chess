import * as THREE from 'three';
import { squareToWorld } from './boardScene.js';
import { WHITE } from '../chess/moveGen.js';
import { settings } from '../settings.js';
import { disposeObject } from './animation.js';

// Marcas que ficam no tabuleiro até o fim da partida.
// Regras de projeto: baixas (quase rentes à casa), discretas, com teto de
// acúmulo e escurecimento progressivo para não poluir a leitura do jogo.
const MAX_MARKS = 20;
const SPLAT_OPACITY = 0.34;
const DUST_OPACITY = 0.1;
const MIN_OPACITY = 0.1;
const AGE_FACTOR = 0.93;

// Sangue da Ordem é carmesim; o da Ruína é um icor arroxeado.
const BLOOD_COLOR = { [WHITE]: 0x53090f, b: 0x330828 };

function irregularBlob(radius, segments = 14) {
  const geometry = new THREE.CircleGeometry(radius, segments);
  const position = geometry.attributes.position;
  // O vértice 0 é o centro do leque: fica intacto.
  for (let i = 1; i < position.count; i++) {
    const jitter = 0.62 + Math.random() * 0.55;
    position.setX(i, position.getX(i) * jitter);
    position.setY(i, position.getY(i) * jitter);
  }
  position.needsUpdate = true;
  geometry.computeBoundingSphere();
  return geometry;
}

function flatMesh(geometry, material, x, z, y) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = Math.random() * Math.PI * 2;
  mesh.position.set(x, y, z);
  return mesh;
}

function groundMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    // Sem tone mapping a mancha mantém o tom escuro em que foi definida.
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export function createDecalLayer(scene) {
  const group = new THREE.Group();
  group.renderOrder = 1;
  scene.add(group);

  const marks = [];

  function ageExisting() {
    for (const mark of marks) {
      for (const entry of mark.materials) {
        entry.material.opacity = Math.max(MIN_OPACITY, entry.material.opacity * AGE_FACTOR);
        entry.material.color.multiplyScalar(0.985);
      }
    }
  }

  function trim() {
    while (marks.length > MAX_MARKS) {
      const oldest = marks.shift();
      disposeObject(oldest.object);
    }
  }

  // debrisSpots: posições no mundo onde caíram pedaços (opcional).
  function addCaptureMarks(row, col, { victimType, victimColor, debrisSpots = [] } = {}) {
    if (!settings.gore) return;

    ageExisting();

    const center = squareToWorld(row, col);
    const mark = new THREE.Group();
    const materials = [];

    const register = (mesh) => {
      materials.push({ material: mesh.material });
      mark.add(mesh);
    };

    // Poeira: base larga e bem clara, dá assentamento à mancha.
    register(
      flatMesh(
        irregularBlob(0.34, 12),
        groundMaterial(0x4e463c, DUST_OPACITY),
        center.x + (Math.random() - 0.5) * 0.1,
        center.z + (Math.random() - 0.5) * 0.1,
        0.006,
      ),
    );

    // Mancha principal + respingos menores.
    const bloodColor = BLOOD_COLOR[victimColor] ?? BLOOD_COLOR.b;
    const mainRadius = victimType === 'p' ? 0.17 : victimType === 'k' ? 0.27 : 0.22;
    register(
      flatMesh(
        irregularBlob(mainRadius),
        groundMaterial(bloodColor, SPLAT_OPACITY),
        center.x + (Math.random() - 0.5) * 0.12,
        center.z + (Math.random() - 0.5) * 0.12,
        0.01,
      ),
    );

    const droplets = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < droplets; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.16 + Math.random() * 0.22;
      register(
        flatMesh(
          irregularBlob(0.035 + Math.random() * 0.045, 8),
          groundMaterial(bloodColor, SPLAT_OPACITY * 0.75),
          center.x + Math.cos(angle) * distance,
          center.z + Math.sin(angle) * distance,
          0.009,
        ),
      );
    }

    // Destroços: pedrinhas paradas onde os cacos assentaram.
    const rubbleMaterial = new THREE.MeshStandardMaterial({
      color: victimColor === WHITE ? 0x3c3c42 : 0x17161c,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    materials.push({ material: rubbleMaterial });

    const spots = debrisSpots.length
      ? debrisSpots.slice(0, 5)
      : Array.from({ length: victimType === 'r' ? 4 : 2 }, () => ({
          x: center.x + (Math.random() - 0.5) * 0.6,
          z: center.z + (Math.random() - 0.5) * 0.6,
        }));

    for (const spot of spots) {
      const size = 0.045 + Math.random() * 0.04;
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.7, size * 0.45, size * 1.1),
        rubbleMaterial,
      );
      chunk.position.set(spot.x, size * 0.22, spot.z);
      chunk.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      mark.add(chunk);
    }

    group.add(mark);
    marks.push({ object: mark, materials });
    trim();
  }

  function clear() {
    while (marks.length) disposeObject(marks.pop().object);
  }

  return { addCaptureMarks, clear, group, get count() { return marks.length; } };
}
