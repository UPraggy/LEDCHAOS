/**
 * p2pTransport — o MESMO contrato de `transport.js`, mas o cano é WebRTC
 * DataChannel de verdade (P2P direto entre os aparelhos).
 *
 * ┌─ Por que existe ──────────────────────────────────────────────────────────┐
 * │ `createLoopbackHub` prova a arquitetura host-autoritativa num aparelho só. │
 * │ `createRelayHub` leva isso pra rede passando por um servidor WS burro.     │
 * │ Este aqui tira o servidor do meio do TRÁFEGO: o estado do host viaja       │
 * │ direto pro celular do convidado pelo DataChannel. Mesmo contrato de hub,   │
 * │ então netSession, telas e os 12 microjogos não sabem que mudou o cano.     │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A diferença honesta: NÃO existe rendezvous automático ────────────────────┐
 * │ O relay casa os dois lados pelo CÓDIGO da sala no servidor. Sem servidor,   │
 * │ o WebRTC precisa trocar offer/answer FORA DE BANDA — é o handshake por      │
 * │ QR/hash que `useP2P` + `signal/codec` já resolvem. Por isso o hub expõe um  │
 * │ `signaling` extra (além do contrato): é ali que a tela do lobby gera o      │
 * │ convite do host e cola a resposta do convidado. O contrato — connect/send/  │
 * │ onMessage/onPeer/peers/close — continua idêntico ao loopback e ao relay.    │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Topologia = ESTRELA. O host tem UM `peer` (RTCPeerConnection+DataChannel) por
 * convidado; o convidado tem UM peer só, para o host. Não há convidado↔convidado:
 * é o host que é a autoridade, então tudo passa por ele — igualzinho ao loopback.
 *
 * Cada APARELHO cria o seu próprio hub (como no relay): o host roda um hub em
 * papel 'host', cada convidado roda um hub em papel 'guest'. Eles nunca
 * compartilham memória — só os bytes que cruzam o DataChannel.
 *
 * As dependências (fábrica de peer e codec de signaling) são INJETÁVEIS de
 * propósito: em produção entram as reais (`webrtc/peer.js`, `signal/codec.js`);
 * num teste de Node dá pra injetar um par fake e exercitar o contrato inteiro
 * sem precisar de um RTCPeerConnection de verdade. Ver `scripts/p2p-contract.test.mjs`.
 *
 * Ver `docs/05-FASE2-MULTIPLAYER.md` §5 e `net/transport.js` (o contrato).
 */

import { ROLES, allowedFrom, encode, decode } from './protocol.js';
import { createPeer as realCreatePeer, PEER_EVENT } from './webrtc/peer.js';
import { encodeSignal as realEncode, decodeSignal as realDecode } from './signal/codec.js';

/** Como o convidado se refere ao host: um só, id fixo. É só rótulo de `fromId`. */
const HOST_ID = 'host';

/**
 * @param {object} [opts]
 * @param {(o:object)=>object} [opts.createPeer]      fábrica de peer (default: a real)
 * @param {(d:object)=>Promise<string>} [opts.encodeSignal]  offer/answer → texto do QR
 * @param {(t:string)=>Promise<object>} [opts.decodeSignal]  texto do QR → offer/answer
 */
export function createP2PHub({
  createPeer = realCreatePeer,
  encodeSignal = realEncode,
  decodeSignal = realDecode,
} = {}) {
  let role = null;
  let selfId = null;
  let closed = false;

  // host: peerId → { peer, open }   ·   guest: um único link sob a chave HOST_ID
  const links = new Map();
  let peerSeq = 0;

  const msgListeners = new Set();
  const peerListeners = new Set();

  /* ------------------------------------------------------------ recebimento */

  /** Texto cru do DataChannel → mensagem decodificada → ouvintes. SEMPRE async
   *  (o contrato exige: canal de rede nunca entrega no mesmo tick). */
  function deliverIn(wireText, fromId) {
    if (closed) return;
    const msg = decode(wireText); // passa pelo JSON de verdade: filtra lixo/inválido
    if (!msg) {
      console.warn('[CHAOS/net] p2p: mensagem descartada (inválida ou não serializável)');
      return;
    }
    queueMicrotask(() => {
      if (closed) return;
      msgListeners.forEach((fn) => {
        try {
          fn(msg, fromId);
        } catch (err) {
          console.error('[CHAOS/net] p2p: handler de mensagem falhou:', err);
        }
      });
    });
  }

  function emitPeer(type, peerId) {
    if (closed) return;
    queueMicrotask(() => {
      if (closed) return;
      peerListeners.forEach((fn) => {
        try {
          fn({ type, peerId });
        } catch (err) {
          console.error('[CHAOS/net] p2p: handler de peer falhou:', err);
        }
      });
    });
  }

  /** Traduz os eventos crus do peer em join/leave do contrato. */
  function bindPeerEvents(peerId, link) {
    return ({ type, detail }) => {
      if (type === PEER_EVENT.CHANNEL_OPEN) {
        if (!link.open) {
          link.open = true;
          emitPeer('join', peerId);
        }
        return;
      }
      // Queda do canal, falha de conexão ou fechamento explícito = o par saiu.
      const dropped =
        type === PEER_EVENT.CHANNEL_CLOSED ||
        type === PEER_EVENT.CLOSED ||
        (type === PEER_EVENT.CONN_STATE &&
          (detail?.state === 'failed' || detail?.state === 'disconnected' || detail?.state === 'closed'));
      if (dropped && links.get(peerId) === link) {
        const wasOpen = link.open;
        link.open = false;
        links.delete(peerId);
        if (wasOpen) emitPeer('leave', peerId);
      }
    };
  }

  /* --------------------------------------------------------------- emissão */

  function sendFrom(msg, to) {
    if (closed) return false;
    // Fronteira de autoridade: idêntica ao loopback. Convidado não manda estado.
    if (!allowedFrom(role, msg?.k)) {
      console.warn(`[CHAOS/net] p2p: ${role} não pode enviar "${msg?.k}" — descartado`);
      return false;
    }
    let wire;
    try {
      wire = encode(msg);
    } catch {
      console.warn('[CHAOS/net] p2p: mensagem não serializável — descartada');
      return false;
    }

    if (role === ROLES.GUEST) {
      // `to` é ignorado: convidado só fala com o host.
      const link = links.get(HOST_ID);
      if (!link?.open) return false;
      return link.peer.send(wire);
    }

    // host
    if (to) {
      const link = links.get(to);
      if (!link?.open) return false;
      return link.peer.send(wire);
    }
    // broadcast: para todo convidado com canal aberto
    let any = false;
    links.forEach((link) => {
      if (link.open) any = link.peer.send(wire) || any;
    });
    return any || links.size === 0; // sala vazia: broadcast é no-op bem-sucedido
  }

  /* ------------------------------------------------------------- transporte */

  function makeTransport() {
    return {
      role,
      selfId,
      send: sendFrom,
      onMessage(fn) {
        msgListeners.add(fn);
        return () => msgListeners.delete(fn);
      },
      onPeer(fn) {
        peerListeners.add(fn);
        return () => peerListeners.delete(fn);
      },
      peers() {
        if (role === ROLES.GUEST) {
          const link = links.get(HOST_ID);
          return link?.open ? [HOST_ID] : [];
        }
        return [...links.entries()].filter(([, l]) => l.open).map(([id]) => id);
      },
      close: teardown,
    };
  }

  /* -------------------------------------------------------------- signaling
   * Superfície EXTRA (fora do contrato) para a troca de offer/answer por QR/hash.
   * Preenchida conforme o papel em connect(). */
  const signaling = {};

  function setupHostSignaling() {
    /** Host: abre uma vaga nova e devolve o convite (texto do QR/hash). */
    signaling.createInvite = async () => {
      if (closed) throw new Error('[CHAOS/net] p2p: hub fechado');
      const peerId = `g${(peerSeq += 1)}`;
      const link = { peer: null, open: false };
      const peer = createPeer({ role: ROLES.HOST, onEvent: bindPeerEvents(peerId, link) });
      link.peer = peer;
      links.set(peerId, link);
      peer.onMessage((text) => deliverIn(text, peerId));
      const offer = await peer.createOffer();
      return { peerId, invite: await encodeSignal(offer) };
    };
    /** Host: cola a resposta daquele convidado e fecha o handshake dele. */
    signaling.acceptAnswer = async (peerId, answerText) => {
      const link = links.get(peerId);
      if (!link) throw new Error(`[CHAOS/net] p2p: convite ${peerId} não existe`);
      await link.peer.acceptAnswer(await decodeSignal(answerText));
    };
  }

  function setupGuestSignaling() {
    /** Convidado: cola o convite do host e devolve a resposta (texto do QR/hash). */
    signaling.acceptInvite = async (inviteText) => {
      if (closed) throw new Error('[CHAOS/net] p2p: hub fechado');
      if (links.has(HOST_ID)) throw new Error('[CHAOS/net] p2p: já há um convite em andamento');
      const link = { peer: null, open: false };
      const peer = createPeer({ role: ROLES.GUEST, onEvent: bindPeerEvents(HOST_ID, link) });
      link.peer = peer;
      links.set(HOST_ID, link);
      peer.onMessage((text) => deliverIn(text, HOST_ID));
      const answer = await peer.acceptOffer(await decodeSignal(inviteText));
      return encodeSignal(answer);
    };
  }

  /* -------------------------------------------------------------- teardown */

  function teardown() {
    if (closed) return;
    closed = true;
    links.forEach((link) => {
      try {
        link.peer?.close();
      } catch {
        /* noop */
      }
    });
    links.clear();
    msgListeners.clear();
    peerListeners.clear();
  }

  /* ---------------------------------------------------------------- hub API */

  function connect({ id, role: r = ROLES.GUEST } = {}) {
    if (closed) throw new Error('[CHAOS/net] p2p: hub já fechado');
    if (!id) throw new Error('[CHAOS/net] p2p: connect() precisa de um id');
    if (role) throw new Error('[CHAOS/net] p2p: este hub já conectou (um aparelho, um papel)');
    role = r;
    selfId = id;
    if (role === ROLES.HOST) setupHostSignaling();
    else setupGuestSignaling();
    return makeTransport();
  }

  return {
    connect,
    signaling,
    get hostId() {
      if (role === ROLES.HOST) return selfId;
      return links.get(HOST_ID)?.open ? HOST_ID : null;
    },
    size() {
      const open = [...links.values()].filter((l) => l.open).length;
      return role ? open + 1 : open; // +1 = este próprio aparelho
    },
    close: teardown,
  };
}
