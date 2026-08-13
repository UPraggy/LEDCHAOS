/**
 * useP2P — orquestra o handshake WebRTC por QR/hash para a UI React.
 *
 * A UI só chama métodos ("sou host", "colei a offer", "manda mensagem") e lê
 * estado. Toda a mecânica mora em `webrtc/peer.js`; a troca de blobs, em
 * `signal/codec.js`. Aqui é a ponte + a máquina de passos.
 *
 * Passos:
 *   host:   HOST_CREATING → HOST_INVITE (mostra QR/hash da offer)
 *                         → HOST_WAIT (colou a answer) → CONNECTED
 *   guest:  GUEST_WAIT_OFFER (escaneia/cola a offer)
 *                         → GUEST_ANSWER (mostra QR/hash da answer) → CONNECTED
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPeer, PEER_EVENT } from './webrtc/peer.js';
import { encodeSignal, decodeSignal } from './signal/codec.js';

export const STEP = {
  IDLE: 'idle',
  HOST_CREATING: 'host-creating',
  HOST_INVITE: 'host-invite',
  HOST_WAIT: 'host-wait',
  GUEST_WAIT_OFFER: 'guest-wait-offer',
  GUEST_ANSWER: 'guest-answer',
  CONNECTED: 'connected',
  FAILED: 'failed',
};

/** Só bytes anônimos — nada que identifique o aparelho fisicamente. */
function anonId(prefix) {
  const b = new Uint8Array(6);
  (globalThis.crypto || {}).getRandomValues?.(b);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

const MAX_LOG = 80;

export function useP2P() {
  const peerRef = useRef(null);
  // Trava anti-falso-positivo: uma vez CONECTADO, um erro transitório de ICE
  // (ex.: 'disconnected' que se recupera sozinho) NÃO deve virar FALHOU.
  const connectedRef = useRef(false);
  const idsRef = useRef(null);
  if (!idsRef.current) {
    idsRef.current = { playerId: anonId('p'), connectionId: anonId('c') };
  }

  const [step, setStep] = useState(STEP.IDLE);
  const [offerText, setOfferText] = useState(''); // blob p/ o host mostrar
  const [answerText, setAnswerText] = useState(''); // blob p/ o guest devolver
  const [status, setStatus] = useState({ connection: 'new', ice: 'new', dc: 'none' });
  const [log, setLog] = useState([]);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);

  const pushLog = useCallback((type, detail) => {
    setLog((prev) => {
      const next = [...prev, { type, detail, n: prev.length + 1 }];
      return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
    });
  }, []);

  const syncStatus = useCallback(() => {
    const p = peerRef.current;
    if (!p) return;
    const s = p.snapshot();
    setStatus({ connection: s.connectionState, ice: s.iceConnectionState, dc: s.dataChannelState });
  }, []);

  const handleEvent = useCallback(
    ({ type, detail }) => {
      pushLog(type, detail);
      syncStatus();
      if (type === PEER_EVENT.CHANNEL_OPEN) {
        connectedRef.current = true;
        setError(null); // conectou: limpa qualquer aviso transitório (senão fica 🟢 CONECTADO com banner vermelho embaixo)
        setStep(STEP.CONNECTED);
      }
      if (type === PEER_EVENT.MESSAGE && detail?.data != null) {
        setMessages((m) => [...m, { from: 'peer', text: String(detail.data), at: m.length }]);
      }
      if (type === PEER_EVENT.ERROR) {
        // erro de conexão não derruba a UI; só registra. Falha dura vira FAILED —
        // mas SÓ se ainda não conectou: depois de aberto, o ICE pode piscar
        // 'disconnected' e se recuperar, e isso não é uma falha real.
        if (detail?.where === 'connection' && !connectedRef.current) {
          setError({ code: 'P2P_FAILED', friendly: 'A conexão P2P não pôde ser estabelecida.' });
          setStep(STEP.FAILED);
        }
      }
    },
    [pushLog, syncStatus],
  );

  function freshPeer(role) {
    if (peerRef.current) peerRef.current.close();
    connectedRef.current = false;
    setError(null);
    const p = createPeer({ role, onEvent: handleEvent });
    peerRef.current = p;
    return p;
  }

  /* ── HOST ──────────────────────────────────────────────────────────────── */

  const startHost = useCallback(async () => {
    try {
      setStep(STEP.HOST_CREATING);
      const p = freshPeer('host');
      const offer = await p.createOffer();
      setOfferText(await encodeSignal(offer));
      setStep(STEP.HOST_INVITE);
    } catch (e) {
      setError({ code: e.message, friendly: e.friendly || 'Não foi possível criar a sala.' });
      setStep(STEP.FAILED);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleEvent]);

  /** Host recebeu a answer do convidado (colada ou escaneada). */
  const acceptAnswerText = useCallback(async (text) => {
    const p = peerRef.current;
    if (!p) return;
    try {
      const answer = await decodeSignal(text);
      if (answer.type !== 'answer') throw invalid('Isso não é uma resposta de convidado.');
      await p.acceptAnswer(answer);
      setStep(STEP.HOST_WAIT); // agora é aguardar o ICE/DataChannel abrir
    } catch (e) {
      setError({ code: e.message, friendly: e.friendly || 'Resposta inválida.' });
    }
  }, []);

  /* ── GUEST ─────────────────────────────────────────────────────────────── */

  const startGuest = useCallback(() => {
    freshPeer('guest');
    setStep(STEP.GUEST_WAIT_OFFER);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleEvent]);

  /** Convidado recebeu a offer do host (colada ou escaneada) → devolve answer. */
  const acceptOfferText = useCallback(async (text) => {
    const p = peerRef.current;
    if (!p) return;
    try {
      const offer = await decodeSignal(text);
      if (offer.type !== 'offer') throw invalid('Isso não é um convite de host.');
      const answer = await p.acceptOffer(offer);
      setAnswerText(await encodeSignal(answer));
      setStep(STEP.GUEST_ANSWER);
    } catch (e) {
      setError({ code: e.message, friendly: e.friendly || 'Oferta inválida.' });
    }
  }, []);

  /* ── comum ─────────────────────────────────────────────────────────────── */

  const sendMessage = useCallback((text) => {
    const p = peerRef.current;
    const clean = String(text || '').trim();
    if (!p || !clean) return false;
    if (!p.send(clean)) return false;
    setMessages((m) => [...m, { from: 'me', text: clean, at: m.length }]);
    return true;
  }, []);

  const reset = useCallback(() => {
    if (peerRef.current) peerRef.current.close();
    peerRef.current = null;
    connectedRef.current = false;
    setStep(STEP.IDLE);
    setOfferText('');
    setAnswerText('');
    setStatus({ connection: 'new', ice: 'new', dc: 'none' });
    setLog([]);
    setMessages([]);
    setError(null);
  }, []);

  // Desliga a conexão ao desmontar (trocar de tela) — nada de peer órfão.
  useEffect(() => () => peerRef.current && peerRef.current.close(), []);

  // Ponte de DEBUG (só em dev): deixa inspecionar/automatizar o handshake pelo
  // console (ex.: teste de duas abas). Removida do bundle de produção.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__p2p = { step, offerText, answerText, status, ids: idsRef.current };
    return undefined;
  }, [step, offerText, answerText, status]);

  return {
    ids: idsRef.current,
    step,
    offerText,
    answerText,
    status,
    log,
    messages,
    error,
    isConnected: step === STEP.CONNECTED,
    startHost,
    acceptAnswerText,
    startGuest,
    acceptOfferText,
    sendMessage,
    reset,
    clearError: () => setError(null),
  };
}

function invalid(friendly) {
  const err = new Error('INVALID_SIGNAL');
  err.friendly = friendly;
  return err;
}
