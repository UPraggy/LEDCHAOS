/**
 * Avatares = os 12 personagens-adesivo do protótipo (`public/assets/personagens/`).
 * Cada avatar é uma ilustração PNG. A ordem espelha o protótipo (o índice do
 * avatar é persistido na sala, então mudar a ordem trocaria o personagem de quem
 * já entrou). O SVG procedural antigo fica como fallback se a imagem não carregar.
 */

export const AVATAR_IDS = [
  'avatar-01',
  'avatar-02',
  'avatar-03',
  'avatar-04',
  'avatar-05',
  'avatar-06',
  'avatar-07',
  'avatar-08',
  'avatar-09',
  'avatar-10',
  'avatar-11',
  'avatar-12',
];

/** Nome do personagem por índice — mesma ordem do protótipo (AVATARS[]). */
const AVATAR_CHARS = [
  'gata',
  'robo',
  'panda',
  'dj',
  'chama',
  'coelha',
  'fantasma',
  'punk',
  'tubarao',
  'capitao',
  'cacto',
  'broto',
];

/** Caminho do PNG do personagem para um id de avatar (aceita id ou índice). */
export function getAvatarImage(avatarId) {
  const index =
    typeof avatarId === 'number'
      ? ((avatarId % AVATAR_CHARS.length) + AVATAR_CHARS.length) % AVATAR_CHARS.length
      : Math.max(0, AVATAR_IDS.indexOf(avatarId));
  return `/assets/personagens/${AVATAR_CHARS[index] || AVATAR_CHARS[0]}.png`;
}

/** Nome legível do personagem (para alt/aria). */
export function getAvatarName(avatarId) {
  const index =
    typeof avatarId === 'number'
      ? ((avatarId % AVATAR_CHARS.length) + AVATAR_CHARS.length) % AVATAR_CHARS.length
      : Math.max(0, AVATAR_IDS.indexOf(avatarId));
  return AVATAR_CHARS[index] || AVATAR_CHARS[0];
}

/** Silhuetas (path em viewBox 0 0 48 48) */
const SHAPES = {
  blob: 'M24 3c12 0 21 8 21 20s-9 22-21 22S3 37 3 23 12 3 24 3Z',
  square: 'M11 4h26a7 7 0 0 1 7 7v26a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7V11a7 7 0 0 1 7-7Z',
  drop: 'M24 3c11 0 20 9 20 21 0 13-9 21-20 21S4 37 4 24 13 3 24 3Z',
  hex: 'M24 3l18 10v22L24 45 6 35V13Z',
};

/** Olhos */
const EYES = {
  dots: [{ cx: 17, cy: 21, r: 3.2 }, { cx: 31, cy: 21, r: 3.2 }],
  wide: [{ cx: 17, cy: 20, r: 4.4 }, { cx: 31, cy: 20, r: 4.4 }],
  tiny: [{ cx: 18, cy: 21, r: 2.1 }, { cx: 30, cy: 21, r: 2.1 }],
  wink: [{ cx: 17, cy: 21, r: 3.2 }, { cx: 31, cy: 21, r: 3.2, wink: true }],
  focus: [{ cx: 17, cy: 21, r: 3.6, ring: true }, { cx: 31, cy: 21, r: 3.6, ring: true }],
};

/** Bocas (path) */
const MOUTHS = {
  smile: 'M16 30c2.5 3.6 5.2 5.2 8 5.2s5.5-1.6 8-5.2',
  grin: 'M15 29h18c0 5-4 8-9 8s-9-3-9-8Z',
  flat: 'M17 32h14',
  open: 'M20 30h8c0 3.4-1.8 5.4-4 5.4S20 33.4 20 30Z',
  zig: 'M15 32l4-3 4 3 4-3 4 3',
  smirk: 'M17 32c3.5 2.6 8 2.4 12-1',
};

const COMBOS = [
  { shape: 'blob', eyes: 'dots', mouth: 'smile' },
  { shape: 'square', eyes: 'wide', mouth: 'grin' },
  { shape: 'drop', eyes: 'tiny', mouth: 'flat' },
  { shape: 'hex', eyes: 'focus', mouth: 'smirk' },
  { shape: 'blob', eyes: 'wink', mouth: 'grin' },
  { shape: 'square', eyes: 'dots', mouth: 'open' },
  { shape: 'drop', eyes: 'wide', mouth: 'zig' },
  { shape: 'hex', eyes: 'dots', mouth: 'grin' },
  { shape: 'blob', eyes: 'focus', mouth: 'flat' },
  { shape: 'square', eyes: 'tiny', mouth: 'smirk' },
  { shape: 'drop', eyes: 'wink', mouth: 'smile' },
  { shape: 'hex', eyes: 'wide', mouth: 'open' },
];

/** Retorna a receita de desenho de um avatar (com fallback seguro). */
export function getAvatarRecipe(avatarId) {
  const index = Math.max(0, AVATAR_IDS.indexOf(avatarId));
  const combo = COMBOS[index] || COMBOS[0];
  return {
    shape: SHAPES[combo.shape],
    eyes: EYES[combo.eyes],
    mouth: MOUTHS[combo.mouth],
  };
}

export function nextAvatarId(currentId, step = 1) {
  const i = AVATAR_IDS.indexOf(currentId);
  const next = (i + step + AVATAR_IDS.length) % AVATAR_IDS.length;
  return AVATAR_IDS[next];
}
