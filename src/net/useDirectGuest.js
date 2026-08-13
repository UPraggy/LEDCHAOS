import { useEffect, useMemo, useRef, useState } from 'react';
import { createP2PHub } from './p2pTransport.js';
import { createNetSession } from './netSession.js';
import { ROLES } from './protocol.js';
import { LINK, deviceGuestId } from './useGuestLink.js';

/**
 * useDirectGuest — o convidado do MODO DIRETO (WebRTC P2P, zero-servidor).
 *
 * É o gêmeo do useGuestLink: mesmo papel (espelhar o host, a autoridade), mesmo
 * formato de retorno (status/selfId/players/settings/round/phase/result/final/ping),
 * então o <LiveMirror> pinta os dois iguais. A ÚNICA diferença é o cano e como os
 * lados se acham: sem servidor de rendezvous, o host e o convidado trocam
 * offer/answer FORA DE BANDA, por QR/hash. Isso vira um aperto de mão manual:
 *
 *   host  ── convite (offer) ──►  QR  ──►  convidado.submitInvite()
 *   convidado ── resposta (answer) ──►  QR  ──►  host.acceptAnswer()
 *   ↳ canal abre → onPeer('join') → hello() → o convidado vira gente na sala
 *
 * ⚠️ Timing P2P: no relay o canal já está aberto quando conectamos, então o
 * `hello()` sai na hora. Aqui o DataChannel só abre DEPOIS que o host aceita a
 * resposta — por isso o hello espera o 'join' do transporte (antes disso o
 * `send` volta false e o host nunca saberia que o convidado chegou).
 *
 * Paridade com useGuestLink (F7-C): este hook entrega PRESENÇA + espelho ao vivo,
 * NÃO manda placar. O slot do convidado é simulado no host (o seam multi-device);
 * ver games/_shared/bots.js e docs/05-FASE2-MULTIPLAYER.md §7.
 *
 * @param {object} opts
 * @param {string} opts.name    nome do convidado (vitrine)
 * @param {string} opts.avatar  id do avatar do convidado
 */

/** Passo do aperto de mão manual (sem servidor casa os lados sozinho). */
export const HS = {
  INVITE: 'invite', //     preciso do convite (offer) do host
  ANSWERING: 'answering', // gerando a resposta a partir do convite
  ANSWER: 'answer', //     resposta pronta: mostrar ao host e esperar o canal abrir
  LIVE: 'live', //         canal aberto: espelhando a festa
};

export function useDirectGuest({ name, avatar }) {
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

  const [hs, setHs] = useState(HS.INVITE);
  const [answer, setAnswer] = useState(''); // texto da resposta (QR/hash) p/ o host
  const [err, setErr] = useState('');
  // Geração do hub: bump remonta um hub LIMPO. Necessário porque `acceptInvite`
  // registra o peer ANTES de validar o offer — um convite inválido deixaria o
  // slot HOST_ID preso ("já há um convite em andamento") e travaria a 2ª tentativa.
  const [gen, setGen] = useState(0);

  const sessionRef = useRef(null);
  const hubRef = useRef(null);
  // Identidade num ref para o efeito de conexão não remontar o cano a cada tecla.
  const idRef = useRef({ name, avatar });
  idRef.current = { name, avatar };

  /* --------------------------------------------------------- o hub + sessão */
  // Monta UMA vez por geração (papel convidado). O canal só abre quando o host
  // aceita a resposta; por isso o hello mora no onPeer('join'), não eager.
  useEffect(() => {
    const hub = createP2PHub();
    const session = createNetSession({
      transport: hub.connect({ id: guestId, role: ROLES.GUEST }),
      bus: null, // convidado não injeta no bus local: ele só espelha
      localPlayerId: guestId,
      handlers: {
        onRoom: (players, settings) =>
          setState((s) => ({ ...s, status: LINK.LIVE, players, settings })),
        onRound: (round) => setState((s) => ({ ...s, round, result: null })),
        onPhase: (phase) => setState((s) => ({ ...s, phase })),
        onResult: (entries, standings) =>
          setState((s) => ({ ...s, result: { entries, standings } })),
        onFinal: (achievements, standings) =>
          setState((s) => ({ ...s, final: { achievements, standings }, phase: 'final' })),
        onPong: (ms) => setState((s) => ({ ...s, ping: ms })),
        onPeer: (type) => {
          // Só existe um peer: o host. Ele entrando = canal aberto → é AGORA que
          // o hello alcança o host (antes disso o send falha). Ele saindo = o
          // canal caiu; sem servidor não há reconexão automática (fica esperando).
          if (type === 'join') {
            const live = sessionRef.current;
            if (live) {
              live.hello({ id: guestId, name: idRef.current.name, avatar: idRef.current.avatar });
              live.ping();
            }
            setHs(HS.LIVE);
            setState((s) => ({ ...s, status: LINK.LIVE }));
          } else if (type === 'leave') {
            setState((s) => ({ ...s, status: LINK.WAITING }));
          }
        },
      },
    });
    session.hub = hub;
    sessionRef.current = session;
    hubRef.current = hub;

    return () => {
      session.close(); // manda BYE se o canal estava aberto
      hub.close();
      sessionRef.current = null;
      hubRef.current = null;
    };
  }, [guestId, gen]);

  /* ------------------------------------------------- identidade mudou depois */
  // Trocar nome/avatar reapresenta ao host SEM derrubar o canal (só quando vivo).
  useEffect(() => {
    const session = sessionRef.current;
    if (!session || hs !== HS.LIVE) return;
    session.hello({ id: guestId, name, avatar });
  }, [name, avatar, guestId, hs]);

  /* ------------------------------------------------------ aperto de mão (QR) */
  // Recebe o convite (offer) do host e produz a resposta (answer) pra devolver.
  async function submitInvite(inviteText) {
    const hub = hubRef.current;
    if (!hub || !inviteText?.trim()) return;
    setErr('');
    setHs(HS.ANSWERING);
    try {
      const answerText = await hub.signaling.acceptInvite(inviteText.trim());
      setAnswer(answerText);
      setHs(HS.ANSWER);
    } catch {
      // Convite ruim deixa o slot preso: remonta um hub limpo pra próxima tentativa.
      setErr('Convite inválido — confira o QR/hash do host e tente de novo.');
      setAnswer('');
      setHs(HS.INVITE);
      setGen((g) => g + 1);
    }
  }

  // Recomeçar do zero (host regenerou o convite, ou o convidado quer outro).
  function reset() {
    setErr('');
    setAnswer('');
    setHs(HS.INVITE);
    setGen((g) => g + 1);
  }

  return { ...state, hs, answer, err, submitInvite, reset };
}
