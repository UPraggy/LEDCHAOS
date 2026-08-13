/**
 * codec — o que vira TEXTO no QR Code e no "copiar hash".
 *
 * Uma descrição WebRTC ({ type, sdp }) é texto longo e repetitivo. Para caber
 * num QR nítido e num hash curto de mandar no WhatsApp temos DOIS caminhos, e o
 * primeiro caractere marca qual foi usado:
 *
 *   'Z'  compacto  — só {ufrag,pwd,fingerprint,setup,candidatos UDP} em binário;
 *                    a SDP é REMONTADA de um template no destino. ~200–320 chars,
 *                    QR versão ~11: o único que a câmera de celular lê de fato.
 *   'C'  comprimido — { type, sdp }→JSON→deflate→base64url. Fallback universal
 *                    (SDP fora do padrão datachannel); blob grande, QR denso.
 *   'R'  cru        — sem compressão (iOS antigo sem CompressionStream).
 *
 * O compacto é tentado primeiro (com auto-checagem de roundtrip); se a SDP não
 * for do feitio esperado, cai no deflate. O decode reconhece os três pelo 1º
 * char — retrocompatível com convites 'C'/'R' já gerados.
 */

import { encodeCompactSignal, decodeCompactSignal, COMPACT_FLAG } from './compactSignal.js';

export const SIGNAL_KIND = { OFFER: 'offer', ANSWER: 'answer' };
const VERSION = 1;

const hasCompression =
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/* ── base64url ⇄ bytes ─────────────────────────────────────────────────────── */

function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── deflate / inflate via streams nativos ─────────────────────────────────── */

async function pipe(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

const deflate = (bytes) => pipe(bytes, new CompressionStream('deflate-raw'));
const inflate = (bytes) => pipe(bytes, new DecompressionStream('deflate-raw'));

/* ── API ───────────────────────────────────────────────────────────────────── */

/**
 * Encoda uma descrição para caber no QR/hash.
 * @param {{type:'offer'|'answer', sdp:string}} desc
 * @returns {Promise<string>} texto do QR/hash (marcado 'C' ou 'R')
 */
export async function encodeSignal(desc) {
  if (!desc || !desc.sdp || !desc.type) {
    throw invalid('Descrição WebRTC vazia ou incompleta.');
  }
  // Caminho compacto 'Z' (o que torna o QR realmente escaneável). Auto-checa o
  // roundtrip: se o blob não decodifica de volta pro mesmo tipo, desce pro deflate.
  try {
    const z = encodeCompactSignal(desc);
    const back = decodeCompactSignal(z);
    if (back.type === desc.type && back.sdp) return z;
  } catch {
    /* SDP fora do padrão datachannel — segue no deflate abaixo */
  }
  const json = JSON.stringify({ v: VERSION, k: desc.type, s: desc.sdp });
  const raw = new TextEncoder().encode(json);
  if (hasCompression) {
    try {
      return 'C' + bytesToB64url(await deflate(raw));
    } catch {
      /* se a compressão falhar, segue cru */
    }
  }
  return 'R' + bytesToB64url(raw);
}

/**
 * Decoda o texto do QR/hash de volta para { type, sdp }.
 * @param {string} text
 * @returns {Promise<{type:'offer'|'answer', sdp:string}>}
 */
export async function decodeSignal(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw invalid('Nada foi colado/lido.');
  const flag = trimmed[0];
  if (flag === COMPACT_FLAG) {
    try {
      return decodeCompactSignal(trimmed);
    } catch {
      throw invalid('Convite compacto ilegível.');
    }
  }
  const body = trimmed.slice(1);
  let jsonBytes;
  try {
    const bytes = b64urlToBytes(body);
    jsonBytes = flag === 'C' ? await inflate(bytes) : bytes;
  } catch {
    throw invalid('Código ilegível (não parece um convite válido).');
  }
  let obj;
  try {
    obj = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw invalid('Convite corrompido.');
  }
  if (!obj || obj.v !== VERSION || (obj.k !== 'offer' && obj.k !== 'answer') || !obj.s) {
    throw invalid('Convite de um formato/versão que não reconheço.');
  }
  return { type: obj.k, sdp: obj.s };
}

function invalid(friendly) {
  const err = new Error('INVALID_SIGNAL');
  err.friendly = friendly;
  return err;
}

/** Comprime tanto que sabemos se o texto tende a caber num QR nítido. */
export const QR_SAFE_LEN = 1200; // acima disto, empurramos o usuário pro "copiar hash"
