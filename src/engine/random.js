/**
 * RNG determinística (mulberry32).
 * Por que semeada: a mesma seed gera a mesma partida — a fila de microjogos,
 * os eventos CHAOS e o comportamento dos bots ficam reproduzíveis. Isso é o que
 * vai permitir, na Fase 2, o host mandar só a seed e todos verem o mesmo jogo.
 */

export function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

/**
 * Cria um gerador. É chamável (`rng()` → 0..1) e traz utilitários acoplados.
 * @param {number} seed
 */
export function createRng(seed = randomSeed()) {
  let s = seed >>> 0;

  const rng = function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** float em [min, max) */
  rng.range = (min, max) => min + rng() * (max - min);

  /** inteiro em [min, max] */
  rng.int = (min, max) => Math.floor(min + rng() * (max - min + 1));

  /** true com probabilidade p */
  rng.chance = (p) => rng() < p;

  /** item aleatório (undefined se vazio) */
  rng.pick = (arr) => (arr.length ? arr[Math.floor(rng() * arr.length)] : undefined);

  /** cópia embaralhada (Fisher–Yates) */
  rng.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  /** ±spread em volta de 0 */
  rng.jitter = (spread) => (rng() * 2 - 1) * spread;

  /** deriva um sub-gerador (ex.: um por rodada) sem consumir a sequência do pai */
  rng.fork = () => createRng(rng.int(0, 0xffffffff));

  rng.seed = seed;
  return rng;
}
