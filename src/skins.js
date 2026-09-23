// Variações visuais desbloqueáveis: só trocam a paleta dos materiais já
// existentes (sem geometria nova). Cada skin tem uma paleta por exército.
//   main: corpo/tecido/pedra · metal: ouro, prata, ferragens · glow: gemas e energia
export const SKINS = [
  {
    id: 'rei-carmesim',
    piece: 'k',
    name: 'Soberano Carmesim',
    stat: 'wins',
    goal: 5,
    criterion: 'Vença 5 partidas',
    palette: {
      w: { main: 0x8e1b24, metal: 0xf2c14e, glow: 0xff5a36 },
      b: { main: 0x3a0a10, metal: 0xb8862c, glow: 0xff2a2a },
    },
  },
  {
    id: 'cavalo-carrasco',
    piece: 'n',
    name: 'Corcel do Carrasco',
    stat: 'title:carrasco',
    goal: 3,
    criterion: 'Conquiste o título "Carrasco" 3 vezes',
    palette: {
      w: { main: 0x3b3f46, metal: 0xa0a6ad, glow: 0xff3b30 },
      b: { main: 0x160c0c, metal: 0x6d2a22, glow: 0xff1e1e },
    },
  },
  {
    id: 'rainha-invernal',
    piece: 'q',
    name: 'Rainha Invernal',
    stat: 'title:estrategista',
    goal: 3,
    criterion: 'Vença 3 vezes sem perder a rainha',
    palette: {
      w: { main: 0xcfe6ff, metal: 0x9ad0ff, glow: 0x5ce1ff },
      b: { main: 0x1b2a44, metal: 0x7fb4e6, glow: 0x39c6ff },
    },
  },
  {
    id: 'bispo-jade',
    piece: 'b',
    name: 'Oráculo de Jade',
    stat: 'matches',
    goal: 10,
    criterion: 'Jogue 10 partidas',
    palette: {
      w: { main: 0x5fa77c, metal: 0xe3c77a, glow: 0x7dffb0 },
      b: { main: 0x183a2a, metal: 0x9c8a4a, glow: 0x33ff99 },
    },
  },
  {
    id: 'peao-ferro',
    piece: 'p',
    name: 'Guarda de Ferro',
    stat: 'captures',
    goal: 40,
    criterion: 'Capture 40 peças no total',
    palette: {
      w: { main: 0x9aa3ad, metal: 0xc7ced6, glow: 0x8fd3ff },
      b: { main: 0x2e3238, metal: 0x5d646d, glow: 0xff7a3d },
    },
  },
  {
    id: 'torre-basalto',
    piece: 'r',
    name: 'Bastião de Basalto',
    stat: 'queensTaken',
    goal: 5,
    criterion: 'Capture 5 rainhas inimigas',
    palette: {
      w: { main: 0x4a4540, metal: 0xd9772b, glow: 0xff6a1a },
      b: { main: 0x1a1512, metal: 0x8a3a12, glow: 0xff3d00 },
    },
  },
];

export function skinsFor(pieceType) {
  return SKINS.filter((s) => s.piece === pieceType);
}
