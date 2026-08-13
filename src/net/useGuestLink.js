import { useEffect, useMemo, useRef, useState } from 'react';
import { createRelayHub } from './wsTransport.js';
import { createNetSession } from './netSession.js';
import { ROLES } from './protocol.js';

/**
 * useGuestLink — o convidado, do lado do celular.
 *
 * É o espelho do host. O host é a AUTORIDADE: ele anuncia sala, rodada, fase,
 * resultado e placar; este hook só escuta e reflete no React. Nada de estado de
 * jogo nasce aqui — se nascesse, existiriam duas verdades sobre quem ganhou.
 *
 *   host  ──room/round/phase/result──►  relay  ──►  useGuestLink  ──►  <LiveGuest/>
 *
 * A conexão é a MESMA de verdade do host (createRelayHub + createNetSession),
 * só que com o papel invertido (GUEST). O convidado se apresenta com `hello()`
 * e, no lugar de um bot, vira gente na sala do host (ver roomManager.joinGuest).
 *
 * ⚠️ O convidado PODE mandar ações (`sendAction`), mas os 12 microjogos de hoje
 * só consomem o input do jogador LOCAL de cada aparelho — o slot do convidado é
 * simulado no host (ver games/_shared/bots.js, o seam multi-device). Por isso
 * este hook entrega PRESENÇA + espelho ao vivo, não controle de jogo. Ver
 * `docs/05-FASE2-MULTIPLAYER.md` §7.
 *
 * @param {object} opts
 * @param {string} opts.url    ws://IP:PORTA do relay
 * @param {string} opts.code   código da sala
 * @param {string} opts.name   nome do convidado (vitrine)
 * @param {string} opts.avatar id do avatar do convidado
 */

const GUEST_ID_KEY = 'chaos.guest.v1';

/** Id estável POR APARELHO: a mesma cadeira ao recarregar/reconectar.
 *  Exportado porque o convidado DIRETO (useDirectGuest) usa a mesma cadeira. */
export function deviceGuestId() {
  try {
    const saved = localStorage.getItem(GUEST_ID_KEY);
    if (saved) return saved;
    const fresh = `g-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    localStorage.setItem(GUEST_ID_KEY, fresh);
    return fresh;
  } catch {
    // Modo privado / storage travado: id só para esta sessão, ainda funciona.
    return `g-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Status legível da ligação, derivado dos sinais do transporte. */
export const LINK = {
  CONNECTING: 'connecting', // abrindo / esperando o host aparecer
  LIVE: 'live', //          host presente e anunciando
  WAITING: 'waiting', //     host caiu; o socket reconecta sozinho
};

export function useGuestLink({ url, code, name, avatar }) {
  const guestId = useMemo(deviceGuestId, []);

  const [state, setState] = useState(() => ({
    status: LINK.CONNECTING,
    selfId: guestId,
    players: null, // roster vindo do host (ROOM)
    settings: null, // { rounds, difficulty }
    round: null, // { round, gameId, chaos, seed }
    phase: null, // intro | countdown | playing | result | final
    result: null, // { entries, standings } da última rodada
    final: null, // { achievements, standings } no fim
    ping: null, // ms do último PONG
  }));

  const sessionRef = useRef(null);
  // Identidade num ref para o efeito de conexão não reabrir o cano a cada tecla.
  const idRef = useRef({ name, avatar });
  idRef.current = { name, avatar };

  /* ------------------------------------------------------------- a conexão */
  useEffect(() => {
    if (!url || !code) return undefined;

    let hostSeen = false;
    const hub = createRelayHub({ url, code });
    const session = createNetSession({
      transport: hub.connect({ id: guestId, role: ROLES.GUEST }),
      bus: null, // convidado não injeta no bus local: ele só espelha
      localPlayerId: guestId,
      handlers: {
        onRoom: (players, settings) => {
          hostSeen = true;
          setState((s) => ({ ...s, status: LINK.LIVE, players, settings }));
        },
        onRound: (round) => setState((s) => ({ ...s, round, result: null })),
        onPhase: (phase) => setState((s) => ({ ...s, phase })),
        onResult: (entries, standings) =>
          setState((s) => ({ ...s, result: { entries, standings } })),
        onFinal: (achievements, standings) =>
          setState((s) => ({ ...s, final: { achievements, standings }, phase: 'final' })),
        onPong: (ms) => setState((s) => ({ ...s, ping: ms })),
        onPeer: (type, peerId) => {
          // O convidado só "enxerga" o host como peer. Ele entrando = ligação viva;
          // saindo = o cano reconecta sozinho e o host re-anuncia a sala.
          if (type === 'join') {
            hostSeen = true;
            setState((s) => ({ ...s, status: LINK.LIVE }));
          } else if (type === 'leave') {
            setState((s) => ({ ...s, status: LINK.WAITING }));
          }
          void peerId;
        },
      },
    });
    session.hub = hub;
    sessionRef.current = session;

    // Se apresenta ao host: no lugar de um bot, entra gente de verdade.
    session.hello({ id: guestId, name: idRef.current.name, avatar: idRef.current.avatar });
    // Mede a latência de largada (e serve de "cutuca" caso o host já esteja lá).
    session.ping();

    // Rede de segurança: se em alguns segundos o host não apareceu, seguimos em
    // "conectando" (a UI mostra o aviso) — o socket continua tentando.
    const nudge = setTimeout(() => {
      if (!hostSeen) session.ping();
    }, 2500);

    return () => {
      clearTimeout(nudge);
      session.close(); // manda BYE: a cadeira dele vira bot no host
      hub.close();
      sessionRef.current = null;
    };
  }, [url, code, guestId]);

  /* ------------------------------------------------- identidade mudou depois */
  // Trocar nome/avatar na tela reapresenta ao host SEM derrubar a conexão.
  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    session.hello({ id: guestId, name, avatar });
  }, [name, avatar, guestId]);

  return state;
}
