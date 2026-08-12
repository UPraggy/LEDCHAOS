/* ===========================================================================
   Banco de imagens para os microjogos com canvas.

   O canvas 2D não desenha uma <img> que ainda está baixando: drawImage de uma
   imagem incompleta não pinta nada (e nem dá erro). Então a imagem tem que
   estar PRONTA antes do primeiro frame que a usa.

   Este módulo baixa cada arquivo uma única vez, guarda o HTMLImageElement e
   devolve sempre o mesmo objeto. O laço de rAF lê `img.ready` a cada frame e
   pinta só quando dá — enquanto não deu, o jogo cai no desenho de reserva
   (uma bolinha da cor do jogo), nunca numa tela vazia.

   Por que um cache global e não estado de React: a imagem é a mesma em todas as
   rodadas e em todos os jogadores. Recarregar por montagem desperdiça rede e
   pisca. O cache vive no módulo e sobrevive a remontagens.
   =========================================================================== */

import { useRef } from 'react';

/** url absoluta/relativa → HTMLImageElement (com .ready quando carregou) */
const cache = new Map();

/**
 * Devolve o elemento de imagem daquela URL, começando o download na primeira
 * vez. O elemento ganha três marcas úteis para o laço de desenho:
 *   .ready  — true quando já pode ir para o drawImage
 *   .broken — true se o arquivo falhou (aí o jogo usa o desenho de reserva)
 */
export function loadImage(url) {
  const hit = cache.get(url);
  if (hit) return hit;

  const img = new Image();
  img.ready = false;
  img.broken = false;
  img.decoding = 'async';
  img.onload = () => { img.ready = true; };
  img.onerror = () => { img.broken = true; };
  img.src = url;

  cache.set(url, img);
  return img;
}

/**
 * Recebe um mapa { nome: url } e devolve { nome: HTMLImageElement }, disparando
 * todos os downloads de uma vez. Use no topo do microjogo.
 *
 * @param {Record<string,string>} spec
 * @returns {Record<string,HTMLImageElement>}
 */
export function preloadImages(spec) {
  const bank = {};
  for (const name of Object.keys(spec)) bank[name] = loadImage(spec[name]);
  return bank;
}

/**
 * Versão hook: preenche o banco uma única vez (lazy) e nunca recomputa, mesmo
 * que `spec` seja um literal novo a cada render. As URLs de um jogo são fixas,
 * então travar na primeira montagem é o comportamento certo.
 *
 * @param {Record<string,string>} spec
 * @returns {Record<string,HTMLImageElement>}
 */
export function useImageBank(spec) {
  const ref = useRef(null);
  if (!ref.current) ref.current = preloadImages(spec);
  return ref.current;
}

/** true quando todas as imagens do banco já podem ser desenhadas. */
export function bankReady(bank) {
  for (const name of Object.keys(bank)) {
    const img = bank[name];
    if (!img.ready && !img.broken) return false;
  }
  return true;
}

/**
 * Desenha a imagem centrada em (cx, cy), cabendo num quadrado de lado `size`
 * (px de CSS), preservando a proporção — a maior dimensão vira `size`.
 *
 * Devolve false se a imagem ainda não está pronta, para o chamador decidir
 * pintar o desenho de reserva no lugar.
 *
 * @returns {boolean} pintou?
 */
export function drawImageCentered(ctx, img, cx, cy, size, rot = 0, alpha = 1) {
  if (!img || !img.ready) return false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;

  const scale = size / Math.max(iw, ih);
  const w = iw * scale;
  const h = ih * scale;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

/**
 * Desenha a imagem alinhada pela base, cabendo numa altura `height` (px de CSS)
 * e mantendo a proporção. Serve para sprites que "pisam" numa linha de chão
 * (corredor do dino), onde o que importa é a altura e o pé, não o centro.
 *
 * @param {number} bx  x do centro horizontal
 * @param {number} by  y da base (onde o pé encosta)
 * @returns {boolean} pintou?
 */
export function drawImageBottom(ctx, img, bx, by, height, alpha = 1) {
  if (!img || !img.ready) return false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;

  const scale = height / ih;
  const w = iw * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, bx - w / 2, by - height, w, height);
  ctx.restore();
  return true;
}
