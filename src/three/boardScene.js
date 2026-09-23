import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createBoardLights } from './boardLights.js';

export const SQUARE_SIZE = 1;

export function squareToWorld(row, col) {
  return new THREE.Vector3((col - 3.5) * SQUARE_SIZE, 0, (row - 3.5) * SQUARE_SIZE);
}

export function createBoardScene(container) {
  const scene = new THREE.Scene();
  // Crepúsculo roxo de floresta nevada: o fundo e a névoa dão o tom frio,
  // e a névoa tinge de violeta tudo que está ao longe.
  scene.background = new THREE.Color(0x1a0f2e);
  scene.fog = new THREE.FogExp2(0x3a2358, 0.045);

  const camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    100,
  );
  camera.position.set(0, 9.5, -8.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.3, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4.5;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.update();

  const ambientLight = new THREE.AmbientLight(0x6a5c8c, 1.05);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0x9c7fd6, 0x241a3a, 0.9);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xf0d8ff, 2.4);
  keyLight.position.set(5, 9, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -7;
  keyLight.shadow.camera.right = 7;
  keyLight.shadow.camera.top = 7;
  keyLight.shadow.camera.bottom = -7;
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc9c6d6, 0.75);
  fillLight.position.set(-6, 5, -5);
  scene.add(fillLight);

  const magentaRim = new THREE.PointLight(0xd946ef, 30, 26, 2);
  magentaRim.position.set(-5.5, 3.4, 5.5);
  scene.add(magentaRim);

  const emberRim = new THREE.PointLight(0xff6a2a, 28, 26, 2);
  emberRim.position.set(5.5, 3.4, -5.5);
  scene.add(emberRim);

  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  const darkTileMat = new THREE.MeshStandardMaterial({
    color: 0x1d1d28,
    roughness: 0.82,
    metalness: 0.18,
  });
  const lightTileMat = new THREE.MeshStandardMaterial({
    color: 0x5b5768,
    roughness: 0.7,
    metalness: 0.25,
  });
  const tileGeo = new THREE.BoxGeometry(0.97, 0.14, 0.97);
  const tiles = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const isDark = (r + c) % 2 === 0;
      const mesh = new THREE.Mesh(tileGeo, isDark ? darkTileMat : lightTileMat);
      const pos = squareToWorld(r, c);
      mesh.position.set(pos.x, -0.07, pos.z);
      mesh.receiveShadow = true;
      mesh.userData = { isTile: true, row: r, col: c };
      boardGroup.add(mesh);
      tiles.push(mesh);
    }
  }

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(9.2, 0.4, 9.2),
    new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.95, metalness: 0.1 }),
  );
  slab.position.y = -0.34;
  slab.receiveShadow = true;
  boardGroup.add(slab);

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x8a7440,
    roughness: 0.45,
    metalness: 0.9,
    flatShading: true,
  });
  const border = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.07, 6, 4), trimMat);
  border.rotation.x = Math.PI / 2;
  border.rotation.z = Math.PI / 4;
  border.position.y = -0.14;
  boardGroup.add(border);

  const boardLights = createBoardLights(scene);

  function onResize() {
    if (!container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
  window.addEventListener('resize', onResize);

  function dispose() {
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  const lights = {
    ambient: ambientLight,
    hemi: hemiLight,
    key: keyLight,
    fill: fillLight,
    magentaRim,
    emberRim,
  };

  return { scene, camera, renderer, controls, boardGroup, tiles, lights, boardLights, onResize, dispose };
}
