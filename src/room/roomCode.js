/**
 * Código da sala.
 * Alfabeto SEM O, 0, I, 1 — ninguém erra ao ditar por voz ou digitar do QR.
 * 5 caracteres → 32^5 = 33.5M combinações, suficiente e curto de falar.
 */

export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 5;

/** Gera um código novo (ex.: 7KX9Q, P4M2A, X8K7D). */
export function generateRoomCode() {
  let out = '';
  // crypto quando existir: evita duas abas gerarem o mesmo código no mesmo ms
  const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
    : null;

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const n = bytes ? bytes[i] : Math.floor(Math.random() * 256);
    out += CODE_ALPHABET[n % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Normaliza o que o usuário digitou: maiúsculas, descarta espaço/hífen e
 * descarta os caracteres fora do alfabeto (O, 0, I, 1 caem aqui — como eles
 * nunca aparecem num código real, ignorar é mais previsível que "adivinhar"
 * qual o usuário quis). Corta no tamanho do código.
 */
export function normalizeRoomCode(input) {
  if (!input) return '';
  return String(input)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, CODE_LENGTH);
}

/** Um código só é válido com o tamanho exato e todos os caracteres do alfabeto. */
export function isValidRoomCode(code) {
  if (typeof code !== 'string' || code.length !== CODE_LENGTH) return false;
  return code.split('').every((ch) => CODE_ALPHABET.includes(ch));
}
