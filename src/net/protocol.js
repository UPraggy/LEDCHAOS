/**
 * protocol — o vocabulário da rede.
 *
 * Mensagens pequenas, JSON puro, sem versionar cedo demais. Este arquivo não
 * conhece transporte nenhum: ele só diz QUAIS mensagens existem, QUEM pode
 * mandar cada uma e COMO viram texto.
 *
 * A regra de autoridade mora aqui, em `allowedFrom()`: convidado manda AÇÃO,
 * host manda ESTADO. Um convidado nunca manda `result` — se mandasse,
 * existiriam duas máquinas somando ponto e duas verdades sobre quem ganhou.
 *
 * Ver `docs/05-FASE2-MULTIPLAYER.md` §4 e §6.
 */

export const ROLES = { HOST: 'host', GUEST: 'guest' };

export const MSG = {
  // convidado → host
  HELLO: 'hello', // "cheguei, esse é meu jogador"
  BYE: 'bye', // "saí"
  ACT: 'act', // ação normalizada (mesmo formato do action bus local)
  PING: 'ping',
  // host → todos
  PONG: 'pong',
  ROOM: 'room', // o lobby mudou
  ROUND: 'round', // começa uma rodada
  PHASE: 'phase', // avanço da máquina de fases
  RESULT: 'result', // fim de rodada
  FINAL: 'final', // fim de partida
};

const FROM_GUEST = new Set([MSG.HELLO, MSG.BYE, MSG.ACT, MSG.PING]);
const FROM_HOST = new Set([MSG.PONG, MSG.ROOM, MSG.ROUND, MSG.PHASE, MSG.RESULT, MSG.FINAL]);

/**
 * Nome de ação RESERVADO: o convidado reportando o resultado do PRÓPRIO slot no
 * fim da rodada. Anda dentro de um ACT de propósito — reportar o próprio placar
 * É uma ação de convidado, então não abre buraco na fronteira de autoridade
 * (`allowedFrom`): continua sendo o host quem funde e quem anuncia o RESULT.
 * O host resolve o playerId pelo peer que enviou; o convidado não pode forjar
 * o placar de outro. Ver `netSession.handleAct` e `net/scoreMerge.js`.
 */
export const ACT_SCORE = 'SCORE';

/** Reporte de placar do convidado: { round, score, display?, stat? }. */
export const scoreReport = ({ round, score, display = null, stat = null }) =>
  act(ACT_SCORE, { round, score, display, stat });

/** Relógio do emissor. Serve para ORDENAR e medir latência — nunca para julgar. */
export const stamp = () => Math.round(performance.now());

/* ------------------------------------------------------------ construtores */

export const hello = (player) => ({ k: MSG.HELLO, player, t: stamp() });
export const bye = () => ({ k: MSG.BYE, t: stamp() });
export const act = (action, payload = null) => ({ k: MSG.ACT, a: action, p: payload, t: stamp() });
export const ping = () => ({ k: MSG.PING, t: stamp() });
export const pong = (t0) => ({ k: MSG.PONG, t0, t: stamp() });

export const room = (players, settings) => ({ k: MSG.ROOM, players, settings, t: stamp() });

export const round = ({ round: n, gameId, chaos = null, seed }) => ({
  k: MSG.ROUND,
  round: n,
  gameId,
  chaos,
  seed,
  t: stamp(),
});

export const phase = (name) => ({ k: MSG.PHASE, phase: name, t: stamp() });

export const result = (entries, standings = null) => ({ k: MSG.RESULT, entries, standings, t: stamp() });

export const final = (achievements, standings = null) => ({
  k: MSG.FINAL,
  achievements,
  standings,
  t: stamp(),
});

/* --------------------------------------------------------------- validação */

/** Mensagem tem forma de mensagem? */
export function isValid(msg) {
  if (!msg || typeof msg !== 'object') return false;
  if (typeof msg.k !== 'string') return false;
  return FROM_GUEST.has(msg.k) || FROM_HOST.has(msg.k);
}

/**
 * Quem manda o quê. É a fronteira de autoridade do modelo host-autoritativo.
 * @param {'host'|'guest'} senderRole papel de QUEM ENVIOU
 * @param {string} kind msg.k
 */
export function allowedFrom(senderRole, kind) {
  return senderRole === ROLES.GUEST ? FROM_GUEST.has(kind) : FROM_HOST.has(kind);
}

/* ---------------------------------------------------------- serialização */

export function encode(msg) {
  return JSON.stringify(msg);
}

/** Devolve a mensagem ou `null` — nunca lança. Lixo na rede não derruba a partida. */
export function decode(text) {
  try {
    const msg = typeof text === 'string' ? JSON.parse(text) : text;
    return isValid(msg) ? msg : null;
  } catch {
    return null;
  }
}
