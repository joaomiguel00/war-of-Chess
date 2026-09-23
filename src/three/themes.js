// Temas do campo de batalha: só dados. Terreno, acampamento de fundo,
// cenário distante, céu e áudio ambiente leem daqui o que trocar; a
// estrutura (e o clima, escolhido à parte) é a mesma para todos.
//
//   earth/soil      cor da terra em volta do tabuleiro e dos canteiros
//   sky/skyMix      tom puxado para o céu (sobre a cor do clima)
//   fog/fogMix      idem para a névoa
//   ground/groundMix chão distante; mounds: cor dos montes/dunas
//   scenery         o que povoa o horizonte (pines, dunes, peaks, volcano)
//   camp            estilo das silhuetas do acampamento
//   glow            cor das janelas/fogueiras pintadas no acampamento
//   lava            rachaduras incandescentes no terreno
//   snowBoost       neve extra no chão (além da do clima)
//   ambience        camada sonora do tema
export const THEMES = {
  acampamento: {
    id: 'acampamento',
    label: 'Floresta sombria',
    hint: 'Acampamento de guerra entre pinheiros escuros',
    earth: 0x5a4636,
    soil: 0x3a2b21,
    sky: null,
    skyMix: 0,
    fog: null,
    fogMix: 0,
    ground: null,
    groundMix: 0,
    mounds: null,
    scenery: 'pines',
    camp: 'war',
    glow: 'rgba(255,150,70,0.9)',
    lava: false,
    snowBoost: 0,
    ambience: 'forest',
  },
  deserto: {
    id: 'deserto',
    label: 'Deserto',
    hint: 'Areia rachada, tendas beduínas e dunas no horizonte',
    earth: 0xb98a58,
    soil: 0x7a5634,
    sky: 0xe09a5c,
    skyMix: 0.42,
    fog: 0xd4935a,
    fogMix: 0.45,
    ground: 0xb08352,
    groundMix: 0.8,
    mounds: 0xc99d64,
    scenery: 'dunes',
    camp: 'bedouin',
    glow: 'rgba(255,176,90,0.9)',
    lava: false,
    snowBoost: 0,
    ambience: 'desert',
  },
  montanha: {
    id: 'montanha',
    label: 'Fortaleza nas montanhas',
    hint: 'Rocha e neve, muralhas de pedra e picos gelados',
    earth: 0x6d7078,
    soil: 0x4a4d57,
    sky: 0x9fb6dc,
    skyMix: 0.34,
    fog: 0xb4c4de,
    fogMix: 0.35,
    ground: 0xc6d0e0,
    groundMix: 0.65,
    mounds: 0xdde5f2,
    scenery: 'peaks',
    camp: 'fortress',
    glow: 'rgba(255,196,120,0.85)',
    lava: false,
    snowBoost: 0.35,
    ambience: 'mountain',
  },
  vulcao: {
    id: 'vulcao',
    label: 'Campo vulcânico',
    hint: 'Rocha negra com lava nas rachaduras e céu em brasa',
    earth: 0x2e2826,
    soil: 0x1c1716,
    sky: 0x80200c,
    skyMix: 0.55,
    fog: 0x5c1c0e,
    fogMix: 0.5,
    ground: 0x1d1716,
    groundMix: 0.85,
    mounds: 0x2a2220,
    scenery: 'volcano',
    camp: 'volcanic',
    glow: 'rgba(255,110,40,0.95)',
    lava: true,
    snowBoost: 0,
    ambience: 'volcano',
  },
};

export const THEME_ORDER = ['acampamento', 'deserto', 'montanha', 'vulcao'];

export function getTheme(id) {
  return THEMES[id] ?? THEMES.acampamento;
}
