/**
 * compactSignal — encolhe a descrição WebRTC para um QR REALMENTE escaneável.
 *
 * ┌ O problema ────────────────────────────────────────────────────────────────┐
 * │ A SDP crua de um datachannel tem ~1770 chars: 10 candidatos ICE (metade      │
 * │ deles TCP porta 9, inúteis), o fingerprint em hex e boilerplate repetido.    │
 * │ Mesmo com deflate (codec.js) sobra ~950 chars → QR versão ~40, módulos       │
 * │ minúsculos que NENHUMA câmera de celular lê à distância normal.              │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌ A ideia ───────────────────────────────────────────────────────────────────┐
 * │ Quase toda a SDP de um datachannel é CONSTANTE e pode ser reconstruída do    │
 * │ outro lado. O que muda de conexão pra conexão é pouca coisa:                 │
 * │   ice-ufrag · ice-pwd · fingerprint (32 bytes) · setup · candidatos UDP.     │
 * │ Serializamos SÓ isso, em binário compacto (fingerprint como 32 bytes crus,   │
 * │ não 95 chars de hex), e no destino remontamos a SDP a partir de um template  │
 * │ fixo. Resultado: ~315 chars → QR versão ~11, fácil de ler.                   │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Formato marcado com 'Z' no 1º caractere (o codec sabe distinguir de 'C'/'R').
 * Só candidatos UDP host/srflx entram; TCP e o resto do boilerplate são jogados
 * fora e recriados. Se a SDP fugir do padrão (falta ufrag/pwd/fingerprint),
 * `encodeCompactSignal` lança e o chamador cai no caminho deflate (maior, porém
 * universal).
 */

export const COMPACT_FLAG = 'Z';

const SETUP_TO_N = { actpass: 0, active: 1, passive: 2, holdconn: 3 };
const N_TO_SETUP = ['actpass', 'active', 'passive', 'holdconn'];

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

/* ── writer/reader de bytes ────────────────────────────────────────────────── */

function makeWriter() {
  const a = [];
  return {
    u8: (n) => a.push(n & 255),
    u16: (n) => { a.push((n >> 8) & 255, n & 255); },
    u32: (n) => { a.push((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255); },
    str: (s) => {
      const b = new TextEncoder().encode(s);
      if (b.length > 255) throw fail('Campo longo demais para o QR compacto.');
      a.push(b.length & 255);
      for (let i = 0; i < b.length; i += 1) a.push(b[i]);
    },
    bytes: (b) => { for (let i = 0; i < b.length; i += 1) a.push(b[i]); },
    out: () => Uint8Array.from(a),
  };
}

function makeReader(u) {
  let i = 0;
  return {
    u8: () => u[i++],
    u16: () => { const v = (u[i] << 8) | u[i + 1]; i += 2; return v; },
    // sem operadores bit-a-bit no topo: evita estouro de sinal em 32 bits
    u32: () => { const v = (u[i] * 16777216) + ((u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]); i += 4; return v >>> 0; },
    str: () => { const n = u[i++]; const s = new TextDecoder().decode(u.subarray(i, i + n)); i += n; return s; },
    bytes: (n) => { const s = u.subarray(i, i + n); i += n; return s; },
  };
}

/* ── parse da SDP → só o que importa ───────────────────────────────────────── */

function parseSdp(sdp) {
  const get = (re) => {
    const m = sdp.match(re);
    return m ? m[1] : null;
  };
  const ufrag = get(/a=ice-ufrag:(\S+)/);
  const pwd = get(/a=ice-pwd:(\S+)/);
  const fp = get(/a=fingerprint:sha-256 ([0-9A-Fa-f:]+)/i);
  const setup = get(/a=setup:(\S+)/);
  if (!ufrag || !pwd || !fp || !setup) {
    throw fail('SDP sem os campos essenciais (ufrag/pwd/fingerprint/setup).');
  }
  const cands = [];
  for (const line of sdp.split(/\r?\n/)) {
    if (line.indexOf('a=candidate:') !== 0) continue;
    const t = line.slice(2).split(' '); // "candidate:FOUND COMP PROTO PRIO IP PORT typ TYPE ..."
    if ((t[2] || '').toLowerCase() !== 'udp') continue; // TCP fora
    const type = t[7];
    if (type !== 'host' && type !== 'srflx') continue; // relay/prflx fora
    let raddr = null;
    let rport = null;
    for (let k = 8; k < t.length - 1; k += 1) {
      if (t[k] === 'raddr') raddr = t[k + 1];
      if (t[k] === 'rport') rport = parseInt(t[k + 1], 10);
    }
    cands.push({ prio: parseInt(t[3], 10) >>> 0, ip: t[4], port: parseInt(t[5], 10), type, raddr, rport });
  }
  return { ufrag, pwd, fp, setup, cands };
}

/* ── remontagem da SDP a partir do template fixo ───────────────────────────── */

// Session-id constante: o outro lado não valida esse número, só precisa existir.
const TEMPLATE_SESSION_ID = '4611686018427387904';

function buildSdp(kind, f) {
  let s = '';
  s += 'v=0\r\n';
  s += `o=- ${TEMPLATE_SESSION_ID} 2 IN IP4 127.0.0.1\r\n`;
  s += 's=-\r\n';
  s += 't=0 0\r\n';
  s += 'a=group:BUNDLE 0\r\n';
  s += 'a=extmap-allow-mixed\r\n';
  s += 'a=msid-semantic: WMS\r\n';
  s += 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n';
  s += 'c=IN IP4 0.0.0.0\r\n';
  let fi = 1;
  for (const c of f.cands) {
    s += `a=candidate:${fi} 1 udp ${c.prio} ${c.ip} ${c.port} typ ${c.type}`;
    if (c.type === 'srflx') s += ` raddr ${c.raddr || '0.0.0.0'} rport ${c.rport || 0}`;
    s += ' generation 0\r\n';
    fi += 1;
  }
  s += `a=ice-ufrag:${f.ufrag}\r\n`;
  s += `a=ice-pwd:${f.pwd}\r\n`;
  s += 'a=ice-options:trickle\r\n';
  s += `a=fingerprint:sha-256 ${f.fp}\r\n`;
  s += `a=setup:${f.setup}\r\n`;
  s += 'a=mid:0\r\n';
  s += 'a=sctp-port:5000\r\n';
  s += 'a=max-message-size:262144\r\n';
  return s;
}

/* ── API ───────────────────────────────────────────────────────────────────── */

/**
 * Serializa { type, sdp } no formato compacto 'Z…'. Lança se a SDP não for do
 * feitio esperado (datachannel), para o chamador cair no deflate.
 * @param {{type:'offer'|'answer', sdp:string}} desc
 * @returns {string}
 */
export function encodeCompactSignal(desc) {
  if (!desc || !desc.sdp || !desc.type) throw fail('Descrição WebRTC vazia.');
  const p = parseSdp(desc.sdp);
  const w = makeWriter();
  w.u8(desc.type === 'answer' ? 1 : 0); // flags: bit0 = answer
  w.str(p.ufrag);
  w.str(p.pwd);
  const fpb = Uint8Array.from(p.fp.split(':').map((h) => parseInt(h, 16)));
  if (fpb.length !== 32) throw fail('Fingerprint sha-256 fora do tamanho.');
  w.u8(fpb.length);
  w.bytes(fpb);
  w.u8(SETUP_TO_N[p.setup] ?? 0);
  // host antes de srflx, no máximo 6 candidatos (sobra é redundância de rede).
  const cands = p.cands
    .slice()
    .sort((a, b) => (a.type === 'host' ? 0 : 1) - (b.type === 'host' ? 0 : 1))
    .slice(0, 6);
  w.u8(cands.length);
  for (const c of cands) {
    w.u8(c.type === 'srflx' ? 1 : 0);
    w.u32(c.prio >>> 0);
    w.str(c.ip);
    w.u16(c.port);
    if (c.type === 'srflx') {
      w.str(c.raddr || '0.0.0.0');
      w.u16(c.rport || 0);
    }
  }
  return COMPACT_FLAG + bytesToB64url(w.out());
}

/**
 * Reconstrói { type, sdp } a partir do texto compacto 'Z…'.
 * @param {string} text
 * @returns {{type:'offer'|'answer', sdp:string}}
 */
export function decodeCompactSignal(text) {
  let r;
  try {
    r = makeReader(b64urlToBytes(String(text).slice(1)));
  } catch {
    throw fail('Convite compacto ilegível.');
  }
  const kind = (r.u8() & 1) ? 'answer' : 'offer';
  const ufrag = r.str();
  const pwd = r.str();
  const fpb = r.bytes(r.u8());
  const fp = Array.from(fpb)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
  const setup = N_TO_SETUP[r.u8()] || 'actpass';
  const n = r.u8();
  const cands = [];
  for (let i = 0; i < n; i += 1) {
    const type = r.u8() ? 'srflx' : 'host';
    const prio = r.u32();
    const ip = r.str();
    const port = r.u16();
    let raddr = null;
    let rport = null;
    if (type === 'srflx') {
      raddr = r.str();
      rport = r.u16();
    }
    cands.push({ type, prio, ip, port, raddr, rport });
  }
  return { type: kind, sdp: buildSdp(kind, { ufrag, pwd, fp, setup, cands }) };
}

function fail(friendly) {
  const err = new Error('COMPACT_SIGNAL');
  err.friendly = friendly;
  return err;
}
