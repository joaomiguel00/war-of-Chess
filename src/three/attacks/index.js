import { attackPawn } from './pawn.js';
import { attackKnight } from './knight.js';
import { attackRook } from './rook.js';
import { attackBishop } from './bishop.js';
import { attackQueen } from './queen.js';
import { attackKing } from './king.js';

// Registro das animações de ataque: cada tipo de peça aponta para a sua
// função. Para criar ou trocar um ataque basta registrar outra função aqui —
// o combate (combat.js) só pergunta ao registro, sem conhecer os detalhes.
//
// Assinatura: async (ctx) => void. O ctx traz a peça (mesh, rig), as posições
// (from, to, victimPos, dir), a vítima e os ganchos de impacto
// (strike, kill, hitStop, flash, shake, sound). Veja combat.js.
const TYPE_TO_NAME = { p: 'peao', n: 'cavalo', r: 'torre', b: 'bispo', q: 'rainha', k: 'rei' };

const registry = new Map();

export function registerAttack(name, fn) {
  registry.set(name, fn);
}

export function getAttack(type) {
  return registry.get(TYPE_TO_NAME[type] ?? type) ?? null;
}

export const AttackAnimationRegistry = {
  register: registerAttack,
  get: getAttack,
  names: () => [...registry.keys()],
};

registerAttack('peao', attackPawn);
registerAttack('cavalo', attackKnight);
registerAttack('torre', attackRook);
registerAttack('bispo', attackBishop);
registerAttack('rainha', attackQueen);
registerAttack('rei', attackKing);
