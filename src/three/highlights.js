import * as THREE from 'three';
import { squareToWorld } from './boardScene.js';

export function createHighlightLayer(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const selectionMat = new THREE.MeshBasicMaterial({
    color: 0xf5c542,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const moveMat = new THREE.MeshBasicMaterial({
    color: 0x5fe08a,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const captureMat = new THREE.MeshBasicMaterial({
    color: 0xff3b52,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const checkMat = new THREE.MeshBasicMaterial({
    color: 0xff2020,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
  });

  const squareGeo = new THREE.PlaneGeometry(0.95, 0.95);
  const dotGeo = new THREE.CircleGeometry(0.17, 16);
  const ringGeo = new THREE.RingGeometry(0.36, 0.46, 20);

  function addFlat(geo, mat, row, col, y) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    const pos = squareToWorld(row, col);
    mesh.position.set(pos.x, y, pos.z);
    group.add(mesh);
    return mesh;
  }

  return {
    clear() {
      group.clear();
    },
    showSelection(row, col) {
      addFlat(squareGeo, selectionMat, row, col, 0.012);
    },
    showMove(row, col, isCapture) {
      if (isCapture) addFlat(ringGeo, captureMat, row, col, 0.02);
      else addFlat(dotGeo, moveMat, row, col, 0.02);
    },
    showCheck(row, col) {
      addFlat(squareGeo, checkMat, row, col, 0.014);
    },
  };
}
