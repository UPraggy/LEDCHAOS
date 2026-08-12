/**
 * Base pública do app — o `base` que o Vite injeta em import.meta.env.BASE_URL.
 *
 *   • dev / domínio próprio na raiz .......... '/'
 *   • subpágina de projeto (SaiBH-style) ..... '/LEDCHAOS/'
 *
 * Sempre termina com '/'. Existe porque duas coisas NÃO passam pelo react-router
 * (que já prefixa o base sozinho via `basename`): os assets estáticos do public/
 * e a URL de convite que vira QR Code. Sem prefixar o base, ambos apontariam para
 * a RAIZ do host — na subpágina isso cai no portfólio do Rafael e dá 404.
 *
 * O `|| '/'` blinda contra um import fora do Vite (ex.: um teste em Node puro, onde
 * import.meta.env não existe): aí o base neutro '/' mantém tudo funcionando.
 */
export const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

/**
 * Prefixa um caminho do public/ com o BASE. Idempotente quanto à barra inicial:
 * aceita '/assets/x.png' ou 'assets/x.png' e nunca duplica a '/'.
 * @param {string} path
 * @returns {string}
 */
export function asset(path) {
  return BASE + String(path).replace(/^\/+/, '');
}
