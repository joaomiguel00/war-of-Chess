// Emblemas dos exércitos: silhuetas simples num quadro 100x100 (formato de
// path SVG). A mesma forma serve à interface (SVG) e às bandeiras 3D
// (desenhada num canvas via Path2D, que entende a sintaxe de path SVG).

export const EMBLEMS = {
  lobo: {
    label: 'Lobo',
    path: 'M20 14 L37 34 L50 30 L63 34 L80 14 L79 46 L68 60 L60 82 L50 90 L40 82 L32 60 L21 46 Z M37 50 L46 54 L39 58 Z M63 50 L54 54 L61 58 Z M45 72 L55 72 L50 78 Z',
  },
  aguia: {
    label: 'Águia',
    path: 'M50 26 C45 26 43 31 43 36 L8 22 L20 40 L6 43 L25 53 L14 60 L39 58 L43 70 L38 88 L50 80 L62 88 L57 70 L61 58 L86 60 L75 53 L94 43 L80 40 L92 22 L57 36 C57 31 55 26 50 26 Z',
  },
  coroa: {
    label: 'Coroa',
    path: 'M14 72 L18 30 L36 50 L50 20 L64 50 L82 30 L86 72 Z M14 78 H86 V88 H14 Z M50 36 L54 44 L50 52 L46 44 Z',
  },
  chama: {
    label: 'Chama',
    path: 'M50 8 C62 28 80 38 76 62 C73 81 61 92 50 92 C39 92 26 82 25 64 C24 50 34 43 39 32 C41 45 47 50 51 52 C55 39 47 26 50 8 Z M50 62 C56 70 58 76 56 82 C54 86 46 86 44 82 C42 76 45 70 50 62 Z',
  },
  escudo: {
    label: 'Escudo',
    path: 'M50 8 L84 20 V48 C84 71 68 85 50 93 C32 85 16 71 16 48 V20 Z M50 20 L26 29 V48 C26 64 36 75 50 81 C64 75 74 64 74 48 V29 Z M45 30 H55 V44 H68 V54 H55 V74 H45 V54 H32 V44 H45 Z',
  },
  caveira: {
    label: 'Caveira',
    path: 'M50 12 C28 12 16 28 16 46 C16 58 24 65 29 67 V82 H71 V67 C76 65 84 58 84 46 C84 28 72 12 50 12 Z M36 38 C43 38 46 43 46 49 C46 55 42 57 36 57 C30 57 27 53 27 48 C27 42 30 38 36 38 Z M64 38 C70 38 73 42 73 48 C73 53 70 57 64 57 C58 57 54 55 54 49 C54 43 57 38 64 38 Z M50 58 L55 67 H45 Z M40 74 H44 V82 H40 Z M48 74 H52 V82 H48 Z M56 74 H60 V82 H56 Z',
  },
  espada: {
    label: 'Espadas',
    path: 'M22 12 L30 12 L60 58 L66 54 L72 60 L62 66 L70 76 L64 80 L56 70 L48 78 L42 72 L50 64 L20 20 Z M78 12 L70 12 L40 58 L34 54 L28 60 L38 66 L30 76 L36 80 L44 70 L52 78 L58 72 L50 64 L80 20 Z',
  },
  torre: {
    label: 'Torre',
    path: 'M22 90 V40 H30 V26 H40 V36 H46 V26 H54 V36 H60 V26 H70 V40 H78 V90 H58 V70 C58 62 42 62 42 70 V90 Z M46 44 H54 V54 H46 Z',
  },
};

export const EMBLEM_ORDER = Object.keys(EMBLEMS);

export function validEmblem(id, fallback = 'coroa') {
  return EMBLEMS[id] ? id : fallback;
}

// Emblema como SVG inline (interface).
export function emblemSvg(id, { size = 48, color = 'currentColor', className = 'emblem-svg' } = {}) {
  const emblem = EMBLEMS[validEmblem(id)];
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-label="${emblem.label}" role="img"><path d="${emblem.path}" fill="${color}" fill-rule="evenodd"/></svg>`;
}

// Emblema desenhado num canvas 2D, centrado em (x, y) com lado `size`.
export function drawEmblem(ctx, id, x, y, size, color) {
  const emblem = EMBLEMS[validEmblem(id)];
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 100, size / 100);
  ctx.fillStyle = color;
  ctx.fill(new Path2D(emblem.path), 'evenodd');
  ctx.restore();
}
