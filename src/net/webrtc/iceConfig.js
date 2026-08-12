/**
 * Configuração de ICE — o único ponto onde ficam os servidores auxiliares.
 *
 * Deixado isolado de propósito: trocar/estender STUN ou LIGAR TURN no futuro é
 * mexer SÓ aqui, sem tocar na lógica de conexão (`peer.js`) nem na UI.
 *
 * ┌ O que cada peça faz (honestamente) ───────────────────────────────────────┐
 * │ STUN  descobre teu IP:porta público (reflexivo). Ajuda dois celulares a se │
 * │       acharem pela internet. É de graça e não vê o teu tráfego.            │
 * │ TURN  faz PONTE quando o P2P direto é bloqueado (NAT simétrico, CGNAT de   │
 * │       operadora 4G/5G). Retransmite os dados → tem custo/servidor. NÃO     │
 * │       usamos agora; a arquitetura já aceita quando você quiser.            │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * STUN não garante conexão: se a rota direta não existir, só TURN resolve.
 */

/** STUN públicos do Google — trocáveis. Vários = mais chance de gathering ok. */
export const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
];

/**
 * TURN — VAZIO por enquanto (sem servidor, como pedido). Quando quiser cobrir
 * as redes que bloqueiam P2P, preencha aqui e nada mais muda:
 *
 *   export const TURN_SERVERS = [{
 *     urls: 'turn:seu-turn.exemplo.com:3478',
 *     username: '...',
 *     credential: '...',
 *   }];
 */
export const TURN_SERVERS = [];

/** Monta o `iceServers` no formato do RTCPeerConnection. */
export function buildIceServers({ stun = STUN_SERVERS, turn = TURN_SERVERS } = {}) {
  const servers = [];
  if (stun && stun.length) servers.push({ urls: stun });
  for (const t of turn || []) servers.push(t);
  return servers;
}

/** Config padrão passada ao RTCPeerConnection. */
export function defaultRtcConfig() {
  return {
    iceServers: buildIceServers(),
    // 'all' = tenta host + reflexivo (+ relay se um dia houver TURN).
    iceTransportPolicy: 'all',
  };
}
