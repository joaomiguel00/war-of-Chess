import * as THREE from 'three';
import { WHITE } from '../chess/moveGen.js';
import { hasPieceModel, makePieceFromGLB } from './pieceGLB.js';

// Estilo único das duas facções, seguindo a arte de referência:
// obsidiana preta fosca e facetada, rachaduras de energia interna,
// ferragens de metal envelhecido com rebites e pedestal octogonal de pedra.
// Os exércitos diferem só na pedra e na cor da energia — a Ruína queima em
// vermelho-alaranjado; a Ordem, num azul gélido.
function createMaterials(color) {
  const isOrder = color === WHITE;

  const stone = new THREE.MeshStandardMaterial({
    color: isOrder ? 0x8f8c86 : 0x14121a,
    roughness: isOrder ? 0.82 : 0.92,
    metalness: 0.06,
    flatShading: true,
  });

  // Ferragem: bronze dourado envelhecido, igual nos dois lados.
  const gold = new THREE.MeshStandardMaterial({
    color: isOrder ? 0xc2a25c : 0x9a7c3e,
    roughness: 0.36,
    metalness: 0.95,
    flatShading: true,
  });

  const energyColor = isOrder ? 0x1e9bff : 0xff4a14;
  const energy = new THREE.MeshStandardMaterial({
    color: energyColor,
    emissive: energyColor,
    emissiveIntensity: isOrder ? 1.5 : 2.6,
    roughness: 0.3,
    metalness: 0.05,
    flatShading: true,
  });

  return {
    stone,
    gold,
    energy,
    // Casca translúcida de "chama" em volta dos cristais.
    aura: new THREE.MeshBasicMaterial({
      color: isOrder ? 0x9fe8ff : 0xff7a3d,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      flatShading: true,
    }),
    // Nomes antigos, ainda usados pelas peças não reconstruídas.
    trim: gold,
    glow: energy,
  };
}

const BASE_TOP = 0.15;

// As peças são modeladas em escala "unitária" e depois ampliadas,
// para ficarem esguias em relação à casa de 1 unidade do tabuleiro.
const PIECE_SCALE = 1.25;

// Rebites: esferinhas de metal distribuídas num anel.
function addRivets(group, mats, { radius, y, count = 8, size = 0.014, offset = 0 }) {
  const geometry = new THREE.IcosahedronGeometry(size, 0);
  for (let i = 0; i < count; i++) {
    const angle = offset + (i / count) * Math.PI * 2;
    const rivet = new THREE.Mesh(geometry, mats.gold);
    rivet.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    group.add(rivet);
  }
}

// Rachaduras: lascas finas de energia encravadas na pedra, inclinadas ao
// acaso para lembrarem fissuras em vez de listras.
function addCracks(group, mats, { radius, yMin, yMax, count = 4, length = 0.12, seed = 0 }) {
  for (let i = 0; i < count; i++) {
    const angle = seed + (i / count) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5;
    const y = yMin + ((yMax - yMin) * (i + 0.5)) / count;
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.009, length * (0.7 + ((i * 37) % 10) / 20), 0.022),
      mats.energy,
    );
    crack.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    // Gira para acompanhar a tangente da superfície, com só uma leve
    // inclinação — sem isso a lasca aponta para fora e parece flutuar.
    crack.rotation.set(Math.sin(i * 3.1) * 0.18, -angle, Math.cos(i * 2.7) * 0.18);
    group.add(crack);
  }
}

// Pedestal octogonal de pedra escura, em dois degraus, com faixa dourada
// e rebites nas quinas — o mesmo em todas as peças.
function buildPedestal(mats, { radius = 0.27 } = {}) {
  const group = new THREE.Group();

  const lower = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.12, radius * 1.2, 0.06, 8),
    mats.stone,
  );
  lower.position.y = 0.03;
  group.add(lower);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, 0.022, 8),
    mats.gold,
  );
  band.position.y = 0.071;
  group.add(band);

  const upper = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.05, 0.068, 8),
    mats.stone,
  );
  upper.position.y = 0.116;
  group.add(upper);

  addRivets(group, mats, { radius: radius * 0.99, y: 0.135, count: 8, size: 0.013 });

  return group;
}

function addMerlons(group, mats, radius, y, count, size) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(size, size * 1.5, size), mats.stone);
    merlon.position.set(Math.cos(angle) * radius, y + size * 0.75, Math.sin(angle) * radius);
    merlon.rotation.y = -angle;
    group.add(merlon);
  }
}

function buildCrown(mats, radius, y, spikes, spikeHeight, bigCenter) {
  const group = new THREE.Group();
  group.userData.part = 'crown';

  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.07, 8), mats.trim);
  band.position.y = y;
  group.add(band);

  for (let i = 0; i < spikes; i++) {
    const angle = (i / spikes) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.035, spikeHeight, 4), mats.trim);
    spike.position.set(
      Math.cos(angle) * radius * 0.82,
      y + spikeHeight / 2 + 0.03,
      Math.sin(angle) * radius * 0.82,
    );
    group.add(spike);
  }

  if (bigCenter) {
    const center = new THREE.Mesh(new THREE.ConeGeometry(0.05, spikeHeight * 1.7, 5), mats.trim);
    center.position.y = y + (spikeHeight * 1.7) / 2 + 0.03;
    group.add(center);

    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mats.glow);
    gem.position.y = y + spikeHeight * 1.7 + 0.08;
    group.add(gem);
  }

  return group;
}

// Peão: soldado de infantaria — a peça mais simples, porque é a mais
// numerosa. Elmo angular com crista, ombreiras, cinto rebitado e escudo
// redondo de bronze ao lado.
function buildPawn(mats) {
  const group = new THREE.Group();
  group.add(buildPedestal(mats, { radius: 0.25 }));

  // Pernas e saiote de placas.
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.185, 0.17, 6), mats.stone);
  legs.position.y = BASE_TOP + 0.085;
  group.add(legs);

  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.135, 0.09, 6), mats.stone);
  skirt.position.y = BASE_TOP + 0.21;
  group.add(skirt);

  // Cinto de metal com rebites.
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.042, 6), mats.gold);
  belt.position.y = BASE_TOP + 0.265;
  group.add(belt);
  addRivets(group, mats, { radius: 0.158, y: BASE_TOP + 0.265, count: 6, size: 0.016 });

  // Tronco: peito levemente mais largo que a cintura.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.145, 0.27, 6), mats.stone);
  torso.position.y = BASE_TOP + 0.42;
  group.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.13, 0.05), mats.stone);
  chestPlate.position.set(0, BASE_TOP + 0.45, 0.14);
  group.add(chestPlate);

  // Ombreiras angulares.
  for (const side of [-1, 1]) {
    const pauldron = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), mats.stone);
    pauldron.position.set(side * 0.16, BASE_TOP + 0.53, 0);
    pauldron.scale.set(1, 0.7, 1);
    group.add(pauldron);

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.14), mats.gold);
    strap.position.set(side * 0.155, BASE_TOP + 0.565, 0);
    group.add(strap);
  }

  // Elmo coríntio: calota baixa, viseira dourada e crista de frente a trás.
  const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.13, 6), mats.stone);
  helm.position.y = BASE_TOP + 0.64;
  group.add(helm);

  const helmDome = new THREE.Mesh(new THREE.SphereGeometry(0.105, 6, 4), mats.stone);
  helmDome.position.y = BASE_TOP + 0.7;
  helmDome.scale.y = 0.55;
  group.add(helmDome);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.06), mats.gold);
  visor.position.set(0, BASE_TOP + 0.638, 0.08);
  group.add(visor);

  const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.03), mats.gold);
  cheek.position.set(0, BASE_TOP + 0.585, 0.09);
  group.add(cheek);

  // Crista: lâmina fina correndo pelo alto do elmo.
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.075, 0.2), mats.gold);
  crest.position.set(0, BASE_TOP + 0.775, -0.01);
  group.add(crest);

  const crestTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 4), mats.gold);
  crestTip.position.set(0, BASE_TOP + 0.8, 0.095);
  crestTip.rotation.x = 0.9;
  group.add(crestTip);

  // Olhos acesos na fresta da viseira.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.012), mats.energy);
    eye.position.set(side * 0.038, BASE_TOP + 0.638, 0.113);
    group.add(eye);
  }

  // Escudo redondo, de frente para o inimigo, preso ao braço esquerdo.
  const shield = new THREE.Group();
  shield.userData.part = 'shield';

  const shieldFace = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.035, 8), mats.stone);
  shield.add(shieldFace);

  const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.024, 4, 8), mats.gold);
  shieldRim.rotation.x = Math.PI / 2;
  shield.add(shieldRim);

  const boss = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mats.gold);
  boss.position.y = 0.03;
  boss.scale.y = 0.7;
  shield.add(boss);

  addRivets(shield, mats, { radius: 0.105, y: 0.025, count: 6, size: 0.014 });

  // Eixo do disco apontando para a frente: o rosto do escudo encara o +Z.
  shield.rotation.x = Math.PI / 2;
  shield.rotation.z = -0.1;
  shield.position.set(0.185, BASE_TOP + 0.42, 0.12);
  group.add(shield);

  // Rachaduras encravadas na pedra (raio um pouco menor que o corpo).
  addCracks(group, mats, {
    radius: 0.142,
    yMin: BASE_TOP + 0.14,
    yMax: BASE_TOP + 0.5,
    count: 5,
    length: 0.13,
    seed: 1.1,
  });

  return group;
}

// Torre: fortaleza de pedra em três patamares com ameias.
function buildRook(mats) {
  const group = new THREE.Group();
  group.add(buildPedestal(mats));

  const tiers = [
    { r: 0.22, h: 0.26, merlons: 8, size: 0.06 },
    { r: 0.175, h: 0.24, merlons: 7, size: 0.055 },
    { r: 0.135, h: 0.22, merlons: 6, size: 0.05 },
  ];

  let y = BASE_TOP;
  for (const tier of tiers) {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(tier.r, tier.r + 0.035, tier.h, 8),
      mats.stone,
    );
    body.position.y = y + tier.h / 2;
    group.add(body);

    const band = new THREE.Mesh(new THREE.TorusGeometry(tier.r + 0.015, 0.024, 5, 8), mats.trim);
    band.rotation.x = Math.PI / 2;
    band.position.y = y + tier.h - 0.01;
    group.add(band);

    addMerlons(group, mats, tier.r * 0.8, y + tier.h - 0.02, tier.merlons, tier.size);
    y += tier.h;
  }

  return group;
}

// Cavalo: busto de corcel de guerra com arreios e olhos brilhantes.
function buildKnight(mats) {
  const group = new THREE.Group();
  group.add(buildPedestal(mats));

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 0.26, 7), mats.stone);
  chest.position.y = BASE_TOP + 0.13;
  group.add(chest);

  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.52, 0.19), mats.stone);
  neck.position.set(0, BASE_TOP + 0.5, 0.02);
  neck.rotation.x = -0.32;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.3), mats.stone);
  head.position.set(0, BASE_TOP + 0.78, 0.16);
  head.rotation.x = 0.18;
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.14), mats.stone);
  snout.position.set(0, BASE_TOP + 0.72, 0.32);
  snout.rotation.x = 0.18;
  group.add(snout);

  const noseband = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.05, 0.15), mats.trim);
  noseband.position.set(0, BASE_TOP + 0.72, 0.33);
  noseband.rotation.x = 0.18;
  group.add(noseband);

  const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.12, 0.06), mats.trim);
  cheek.position.set(0, BASE_TOP + 0.76, 0.05);
  group.add(cheek);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 4), mats.stone);
    ear.position.set(side * 0.06, BASE_TOP + 0.92, 0.08);
    ear.rotation.x = -0.15;
    group.add(ear);

    const eye = new THREE.Mesh(new THREE.OctahedronGeometry(0.028, 0), mats.glow);
    eye.position.set(side * 0.085, BASE_TOP + 0.8, 0.24);
    group.add(eye);
  }

  // Crina em placas.
  for (let i = 0; i < 4; i++) {
    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 3), mats.trim);
    strand.position.set(0, BASE_TOP + 0.86 - i * 0.15, -0.07 - i * 0.04);
    strand.rotation.x = 0.5 + i * 0.1;
    group.add(strand);
  }

  return group;
}

// Bispo: figura encapuzada e esguia — corpo/armadura, capa longa, capuz e
// cajado com gema formam as mesmas 5 partes do plano de referência (mais o
// pedestal octogonal comum a todas as peças). A silhueta é quebrada em
// segmentos de raios bem diferentes (saia larga, cintura estreita, torso
// e colar), do mesmo jeito que funcionou no peão — um cone único e liso
// engole os acabamentos finos e lê como um triângulo vazio à distância.
function buildBishop(mats) {
  const group = new THREE.Group();
  group.add(buildPedestal(mats));

  // Saia do robe: alargada embaixo, afunila até a cintura.
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.215, 0.34, 7), mats.stone);
  skirt.position.y = BASE_TOP + 0.17;
  group.add(skirt);

  // Cinto rebitado, nitidamente mais largo que a cintura do robe.
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.04, 7), mats.gold);
  belt.position.y = BASE_TOP + 0.35;
  group.add(belt);
  addRivets(group, mats, { radius: 0.173, y: BASE_TOP + 0.35, count: 7, size: 0.013 });

  // Debrum dourado colado na saia, descendo até a bainha.
  const hem = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.02), mats.gold);
  hem.position.set(0, BASE_TOP + 0.2, 0.175);
  hem.rotation.x = -0.16;
  group.add(hem);

  // Torso: cilindro mais estreito que a saia, cria a "cintura" visível.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.145, 0.24, 7), mats.stone);
  torso.position.y = BASE_TOP + 0.49;
  group.add(torso);

  // Capa longa: manto bem mais largo que o torso, flui atrás até o chão.
  const cape = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.66, 7, 1, true), mats.stone);
  cape.material.side = THREE.DoubleSide;
  cape.position.set(0, BASE_TOP + 0.3, -0.09);
  group.add(cape);

  const capeHem = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.02, 4, 7), mats.gold);
  capeHem.rotation.x = Math.PI / 2;
  capeHem.position.set(0, BASE_TOP + 0.01, -0.09);
  group.add(capeHem);
  addRivets(group, mats, {
    radius: 0.255,
    y: BASE_TOP + 0.01,
    count: 7,
    size: 0.012,
    offset: 0.3,
  });

  // Colar/gola: anel dourado visivelmente mais largo que o topo do torso.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.026, 4, 8), mats.gold);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = BASE_TOP + 0.62;
  group.add(collar);

  // Capuz pontiagudo, com um brilho no vazio onde estaria o rosto.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.28, 6), mats.stone);
  hood.position.y = BASE_TOP + 0.76;
  group.add(hood);

  const face = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), mats.energy);
  face.position.set(0, BASE_TOP + 0.68, 0.07);
  group.add(face);

  // Cajado com gema: peça destacável, quebra ao cair na morte.
  const staffGroup = new THREE.Group();
  staffGroup.userData.part = 'staff';

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.82, 5), mats.gold);
  shaft.position.y = BASE_TOP + 0.45;
  staffGroup.add(shaft);

  for (const y of [0.2, 0.56]) {
    const knot = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), mats.gold);
    knot.position.y = BASE_TOP + y;
    staffGroup.add(knot);
  }

  const claw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.024, 0.07, 5), mats.gold);
  claw.position.y = BASE_TOP + 0.88;
  staffGroup.add(claw);

  // Gema alongada envolta em chama arcana.
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), mats.energy);
  gem.scale.set(0.75, 1.6, 0.75);
  gem.position.y = BASE_TOP + 0.98;
  staffGroup.add(gem);

  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), mats.aura);
  flame.scale.set(0.8, 1.4, 0.8);
  flame.position.y = BASE_TOP + 1.0;
  staffGroup.add(flame);

  staffGroup.position.set(0.19, 0, 0.03);
  staffGroup.rotation.z = 0.06;
  group.add(staffGroup);

  // Rachaduras de energia encravadas na saia e no torso, cada uma no raio
  // certo pra ficar rente à superfície (e não afundada ou flutuando).
  addCracks(group, mats, {
    radius: 0.185,
    yMin: BASE_TOP + 0.09,
    yMax: BASE_TOP + 0.24,
    count: 3,
    length: 0.1,
    seed: 0.4,
  });
  addCracks(group, mats, {
    radius: 0.125,
    yMin: BASE_TOP + 0.4,
    yMax: BASE_TOP + 0.58,
    count: 3,
    length: 0.09,
    seed: 2.3,
  });

  return group;
}

// Rainha: vestes longas, ombreiras e coroa de espinhos.
function buildQueen(mats) {
  const group = new THREE.Group();
  group.add(buildPedestal(mats));

  const gown = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.7, 8), mats.stone);
  gown.position.y = BASE_TOP + 0.34;
  group.add(gown);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.28, 8), mats.stone);
  torso.position.y = BASE_TOP + 0.78;
  group.add(torso);

  const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 8, 1, true), mats.trim);
  mantle.position.y = BASE_TOP + 0.86;
  mantle.material.side = THREE.DoubleSide;
  group.add(mantle);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.028, 5, 8), mats.trim);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = BASE_TOP + 0.92;
  group.add(collar);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.105, 0), mats.stone);
  head.position.y = BASE_TOP + 1.03;
  group.add(head);

  group.add(buildCrown(mats, 0.125, BASE_TOP + 1.13, 7, 0.18, false));

  return group;
}

// Rei: o mais alto, com manto largo e coroa dominante.
function buildKing(mats) {
  const group = new THREE.Group();
  group.add(buildPedestal(mats));

  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), mats.stone);
  cloak.position.y = BASE_TOP + 0.29;
  group.add(cloak);

  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.52, 8), mats.stone);
  robe.position.y = BASE_TOP + 0.8;
  group.add(robe);

  const pauldrons = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 5, 8), mats.trim);
  pauldrons.rotation.x = Math.PI / 2;
  pauldrons.position.y = BASE_TOP + 1.0;
  group.add(pauldrons);

  const sigil = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.04), mats.trim);
  sigil.position.set(0, BASE_TOP + 0.82, 0.18);
  group.add(sigil);

  const sigilGlow = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), mats.glow);
  sigilGlow.position.set(0, BASE_TOP + 0.82, 0.215);
  group.add(sigilGlow);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.14, 8), mats.stone);
  neck.position.y = BASE_TOP + 1.13;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), mats.stone);
  head.position.y = BASE_TOP + 1.28;
  group.add(head);

  group.add(buildCrown(mats, 0.15, BASE_TOP + 1.42, 8, 0.21, true));

  return group;
}

const BUILDERS = {
  p: buildPawn,
  r: buildRook,
  n: buildKnight,
  b: buildBishop,
  q: buildQueen,
  k: buildKing,
};

// Marca de veterano: pequenos entalhes brilhantes na base, um por abate
// (até cinco). Fica rente ao pedestal para não competir com os marcadores
// de lance do tabuleiro.
const MAX_TALLY = 5;

export function applyVeteranMark(piece, kills) {
  if (!piece || kills <= 0) return;

  let tally = piece.userData.tally;
  if (!tally) {
    tally = new THREE.Group();
    tally.name = 'tally';
    piece.add(tally);
    piece.userData.tally = tally;
  }

  const isOrder = piece.userData.pieceColor === WHITE;
  const shown = Math.min(kills, MAX_TALLY);
  if (tally.children.length >= shown) return;

  const material = new THREE.MeshBasicMaterial({
    color: isOrder ? 0xffb257 : 0xf05bff,
    toneMapped: false,
    transparent: true,
    opacity: 0.85,
  });

  for (let i = tally.children.length; i < shown; i++) {
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.075, 0.018), material);
    // Enfileirados na frente da base, como marcas de contagem.
    notch.position.set(-0.11 + i * 0.055, 0.075, 0.33);
    notch.rotation.x = 0.25;
    tally.add(notch);
  }
}

export function createPieceMesh(type, color) {
  // Peças com modelo .glb carregado usam o modelo; as demais, o procedural.
  const model = hasPieceModel(type)
    ? makePieceFromGLB(type, color)
    : BUILDERS[type](createMaterials(color));

  model.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  model.scale.setScalar(PIECE_SCALE);

  // O invólucro mantém escala 1: é ele que as animações manipulam.
  const piece = new THREE.Group();
  piece.add(model);
  // Peças pretas encaram o lado oposto do tabuleiro.
  piece.rotation.y = color === WHITE ? 0 : Math.PI;
  piece.userData.pieceType = type;
  piece.userData.pieceColor = color;

  return piece;
}
