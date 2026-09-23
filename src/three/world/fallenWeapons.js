import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { squareToWorld } from '../boardScene.js';
import { animate, easeOut, disposeObject } from '../animation.js';

// A arma fica no campo: quem cai deixa a arma num canto da casa até o fim
// da partida — espada fincada (peão, rei), lança partida (cavalo), cajado
// caído (bispo), cetro caído (rainha), blocos de pedra (torre). São pequenas
// e ficam semitransparentes quando alguma peça está naquela casa.
const CORNERS = [
  [-0.32, -0.32],
  [0.32, -0.32],
  [0.32, 0.32],
  [-0.32, 0.32],
];

const place = (geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 }) => {
  geometry.rotateX(rx);
  geometry.rotateZ(rz);
  geometry.rotateY(ry);
  geometry.translate(x, y, z);
  return geometry;
};

// Geometrias por tipo: [metal/pedra principal, detalhe].
function shapes(type) {
  const r = Math.random;
  switch (type) {
    case 'p':
    case 'k': {
      const tilt = 0.25 + r() * 0.2;
      const scale = type === 'k' ? 1.25 : 1;
      const blade = place(new THREE.BoxGeometry(0.03 * scale, 0.28 * scale, 0.008), { y: 0.1 * scale, rz: tilt });
      const guard = place(new THREE.BoxGeometry(0.11 * scale, 0.018, 0.02), { y: 0.24 * scale, x: -0.04 * scale, rz: tilt });
      const grip = place(new THREE.CylinderGeometry(0.009, 0.009, 0.07 * scale, 5), { y: 0.28 * scale, x: -0.05 * scale, rz: tilt });
      return [[blade], [guard, grip]];
    }
    case 'n': {
      const a = place(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), { y: 0.015, rz: Math.PI / 2, ry: r() * 3 });
      const b = place(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 5), { y: 0.015, x: 0.08, z: 0.09, rz: Math.PI / 2, ry: r() * 3 });
      const tip = place(new THREE.ConeGeometry(0.022, 0.08, 5), { y: 0.02, x: -0.14, rz: Math.PI / 2 });
      return [[tip], [a, b]];
    }
    case 'b': {
      const staff = place(new THREE.CylinderGeometry(0.01, 0.01, 0.38, 5), { y: 0.012, rz: Math.PI / 2, ry: r() * 3 });
      const gem = place(new THREE.OctahedronGeometry(0.03, 0), { y: 0.03, x: 0.18 });
      return [[gem], [staff]];
    }
    case 'q': {
      const rod = place(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 5), { y: 0.012, rz: Math.PI / 2, ry: r() * 3 });
      const orb = place(new THREE.SphereGeometry(0.03, 8, 6), { y: 0.03, x: 0.15 });
      return [[orb], [rod]];
    }
    default: {
      const blocks = [0, 1, 2].map((i) =>
        place(new THREE.BoxGeometry(0.07 + r() * 0.03, 0.05, 0.06), {
          x: (i - 1) * 0.06 + (r() - 0.5) * 0.03,
          y: 0.025 + (i === 1 ? 0.04 : 0),
          z: (r() - 0.5) * 0.06,
          ry: r() * 3,
          rx: (r() - 0.5) * 0.3,
        }),
      );
      return [blocks, []];
    }
  }
}

export function createFallenWeapons({ scene }) {
  const group = new THREE.Group();
  group.name = 'FallenWeapons';
  scene.add(group);
  const items = [];
  const cornerUse = new Map();

  function leave({ row, col, type }) {
    const key = `${row},${col}`;
    const used = cornerUse.get(key) ?? Math.floor(Math.random() * 4);
    cornerUse.set(key, used + 1);
    const [cx, cz] = CORNERS[used % 4];
    const center = squareToWorld(row, col);

    const [main, detail] = shapes(type);
    const stone = type === 'r';
    const mainMaterial = new THREE.MeshStandardMaterial({
      color: stone ? 0x4a4650 : type === 'b' ? 0xe0c070 : type === 'q' ? 0x7aa8ff : 0xb9bcc4,
      roughness: stone ? 0.95 : 0.35,
      metalness: stone ? 0.05 : 0.85,
      emissive: type === 'b' ? 0x6a4a10 : type === 'q' ? 0x10244a : 0x000000,
      flatShading: true,
      transparent: true,
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3322,
      roughness: 0.85,
      flatShading: true,
      transparent: true,
    });
    const item = new THREE.Group();
    const meshes = [];
    if (main.length) meshes.push(new THREE.Mesh(mergeGeometries(main, false), mainMaterial));
    if (detail.length) meshes.push(new THREE.Mesh(mergeGeometries(detail, false), detailMaterial));
    [...main, ...detail].forEach((g) => g.dispose());
    meshes.forEach((m) => {
      m.castShadow = true;
      item.add(m);
    });
    item.position.set(center.x + cx, 0, center.z + cz);
    item.rotation.y = Math.random() * Math.PI * 2;
    item.scale.setScalar(0.01);
    group.add(item);
    const entry = { item, row, col, materials: [mainMaterial, detailMaterial], opacity: 1, target: 1 };
    items.push(entry);
    animate(360, (t) => item.scale.setScalar(Math.max(0.01, easeOut(t))));
  }

  // Esmaece as armas em casas ocupadas (não atrapalham a leitura).
  function setBoard(board) {
    for (const entry of items) entry.target = board[entry.row][entry.col] ? 0.28 : 1;
  }

  function update(dt) {
    for (const entry of items) {
      if (Math.abs(entry.opacity - entry.target) < 0.005) continue;
      entry.opacity += (entry.target - entry.opacity) * Math.min(1, dt * 6);
      for (const m of entry.materials) {
        m.opacity = entry.opacity;
        m.depthWrite = entry.opacity > 0.95;
      }
    }
  }

  function clear() {
    while (items.length) disposeObject(items.pop().item);
    cornerUse.clear();
  }

  function dispose() {
    clear();
    scene.remove(group);
  }

  return { leave, setBoard, update, clear, dispose };
}
