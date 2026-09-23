import * as THREE from 'three';
import { forEachMaterial } from './animation.js';
import { equippedSkin } from '../progress.js';

// Aplica a skin equipada a uma peça recém-criada: só troca cores dos
// materiais (corpo, metais, brilhos), sem mexer na geometria. Registrado
// como decorador de peça, vale para tabuleiro, cemitério e replay.
const WHITE_MIX = new THREE.Color(0xffffff);

export function applySkin(piece, type, color) {
  const skin = equippedSkin(type);
  if (!skin) return;
  const palette = skin.palette[color === 'w' ? 'w' : 'b'];
  forEachMaterial(piece, (m) => {
    if (!m.color) return;
    const name = m.name || '';
    if (/face|feet|hair/i.test(name)) return;
    const glowing =
      (m.emissive && m.emissive.getHex() !== 0) || /emissive|gem|orb/i.test(name) || (m.isMeshBasicMaterial && m.transparent);
    const metal = (m.metalness ?? 0) > 0.6 || /gold|silver|trim/i.test(name);
    if (glowing) {
      m.color.setHex(palette.glow);
      m.emissive?.setHex(palette.glow);
    } else if (metal) {
      m.color.setHex(palette.metal);
    } else if (m.map) {
      // Modelo texturizado: a cor multiplica a textura, então clareia um pouco.
      m.color.setHex(palette.main).lerp(WHITE_MIX, 0.3);
    } else {
      m.color.setHex(palette.main);
    }
  });
}
