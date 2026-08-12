/**
 * peer — abstração de UMA conexão WebRTC P2P (host ⇄ um par).
 *
 * A UI React NUNCA toca no RTCPeerConnection direto. Toda a mecânica —
 * offer, answer, ICE, DataChannel, estados, envio/recebimento, fechar — mora
 * aqui. Quem usa só chama métodos de alto nível e ouve eventos.
 *
 * ┌ Signaling é NON-TRICKLE (por causa do QR/hash) ────────────────────────────┐
 * │ Normalmente os ICE candidates "pingam" aos poucos e iriam num canal ao vivo.│
 * │ Como o nosso canal de signaling é UM blob estático (QR ou hash colado),     │
 * │ esperamos o gathering TERMINAR e a SDP já sai com os candidatos embutidos.  │
 * │ Assim um único QR/hash carrega tudo que o outro lado precisa.               │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Contrato de troca:
 *   host:   createOffer() → (compartilha) → acceptAnswer(answer)
 *   guest:  acceptOffer(offer) → devolve answer → (compartilha de volta)
 *
 * As descrições trafegam como objetos simples { type, sdp }. Comprimir/encodar
 * para caber no QR é trabalho do codec (`net/signal/codec.js`), não daqui.
 */

import { defaultRtcConfig } from './iceConfig.js';

/** Tipos de evento — a UI de debug monta o log a partir daqui. */
export const PEER_EVENT = {
  CREATED: 'peerconnection-created',
  OFFER_CREATED: 'offer-created',
  ANSWER_CREATED: 'answer-created',
  LOCAL_SET: 'local-description-set',
  REMOTE_SET: 'remote-description-set',
  ICE_GATHERING: 'ice-gathering',
  ICE_CANDIDATE: 'ice-candidate',
  ICE_STATE: 'ice-connection-state',
  ICE_CONNECTED: 'ice-connected',
  CONN_STATE: 'connection-state',
  CHANNEL_OPEN: 'datachannel-open',
  CHANNEL_CLOSED: 'datachannel-closed',
  MESSAGE: 'message-received',
  ERROR: 'error',
  CLOSED: 'connection-closed',
};

const CHANNEL_LABEL = 'c'; // curto de propósito: menos bytes na SDP → QR menor

/**
 * @param {object} opts
 * @param {'host'|'guest'} opts.role
 * @param {object} [opts.rtcConfig]   config do RTCPeerConnection (default: STUN)
 * @param {number} [opts.iceTimeout]  ms p/ desistir de esperar mais candidatos
 * @param {(evt:{type:string,detail?:any})=>void} [opts.onEvent]
 */
export function createPeer({ role, rtcConfig, iceTimeout = 2500, onEvent } = {}) {
  if (typeof RTCPeerConnection === 'undefined') {
    const err = new Error('WEBRTC_UNSUPPORTED');
    err.friendly = 'Este navegador não suporta WebRTC.';
    throw err;
  }

  const emit = (type, detail) => {
    if (onEvent) {
      try {
        onEvent({ type, detail });
      } catch {
        /* um handler de debug quebrado nunca derruba a conexão */
      }
    }
  };

  const pc = new RTCPeerConnection(rtcConfig || defaultRtcConfig());
  emit(PEER_EVENT.CREATED, { role });

  let channel = null;
  let closed = false;
  const msgListeners = new Set();

  function attachChannel(dc) {
    channel = dc;
    dc.onopen = () => emit(PEER_EVENT.CHANNEL_OPEN);
    dc.onclose = () => emit(PEER_EVENT.CHANNEL_CLOSED);
    dc.onmessage = (e) => {
      emit(PEER_EVENT.MESSAGE, { data: e.data });
      msgListeners.forEach((fn) => {
        try {
          fn(e.data);
        } catch (err) {
          emit(PEER_EVENT.ERROR, { where: 'onmessage', message: String(err) });
        }
      });
    };
  }

  // Host cria o canal ANTES da offer; guest recebe o canal do host.
  if (role === 'host') {
    attachChannel(pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
  } else {
    pc.ondatachannel = (e) => attachChannel(e.channel);
  }

  pc.onconnectionstatechange = () => {
    emit(PEER_EVENT.CONN_STATE, { state: pc.connectionState });
    if (pc.connectionState === 'failed') {
      emit(PEER_EVENT.ERROR, { where: 'connection', message: 'connection failed' });
    }
  };

  pc.oniceconnectionstatechange = () => {
    const s = pc.iceConnectionState;
    emit(PEER_EVENT.ICE_STATE, { state: s });
    if (s === 'connected' || s === 'completed') emit(PEER_EVENT.ICE_CONNECTED);
  };

  /** Espera o ICE gathering fechar (ou o timeout) — é o que torna a SDP completa. */
  function waitIceComplete() {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    emit(PEER_EVENT.ICE_GATHERING, { state: pc.iceGatheringState });
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        cleanup();
        resolve();
      };
      const onState = () => {
        if (pc.iceGatheringState === 'complete') finish();
      };
      const onCand = (e) => {
        if (e.candidate) emit(PEER_EVENT.ICE_CANDIDATE, { candidate: e.candidate.candidate });
        else finish(); // candidato null = fim do gathering
      };
      function cleanup() {
        pc.removeEventListener('icegatheringstatechange', onState);
        pc.removeEventListener('icecandidate', onCand);
        clearTimeout(timer);
      }
      pc.addEventListener('icegatheringstatechange', onState);
      pc.addEventListener('icecandidate', onCand);
      // Alguns candidatos (ex.: STUN inacessível) nunca fecham; não travamos.
      const timer = setTimeout(finish, iceTimeout);
    });
  }

  function plain(desc) {
    return { type: desc.type, sdp: desc.sdp };
  }

  return {
    role,

    /** HOST: cria a offer com os candidatos embutidos. Retorna { type, sdp }. */
    async createOffer() {
      if (role !== 'host') throw new Error('createOffer é só do host');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emit(PEER_EVENT.OFFER_CREATED);
      emit(PEER_EVENT.LOCAL_SET);
      await waitIceComplete();
      return plain(pc.localDescription);
    },

    /** GUEST: aceita a offer do host e devolve a answer (com candidatos). */
    async acceptOffer(offer) {
      if (role !== 'guest') throw new Error('acceptOffer é só do guest');
      await pc.setRemoteDescription(offer);
      emit(PEER_EVENT.REMOTE_SET);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit(PEER_EVENT.ANSWER_CREATED);
      emit(PEER_EVENT.LOCAL_SET);
      await waitIceComplete();
      return plain(pc.localDescription);
    },

    /** HOST: recebe a answer do guest e fecha o handshake. */
    async acceptAnswer(answer) {
      if (role !== 'host') throw new Error('acceptAnswer é só do host');
      await pc.setRemoteDescription(answer);
      emit(PEER_EVENT.REMOTE_SET);
    },

    /** Envia texto pelo DataChannel. Retorna false se o canal não estiver aberto. */
    send(data) {
      if (!channel || channel.readyState !== 'open') return false;
      try {
        channel.send(data);
        return true;
      } catch (err) {
        emit(PEER_EVENT.ERROR, { where: 'send', message: String(err) });
        return false;
      }
    },

    /** Assina mensagens recebidas. Retorna unsubscribe. */
    onMessage(fn) {
      msgListeners.add(fn);
      return () => msgListeners.delete(fn);
    },

    /** Estado atual, para a UI pintar os selos de debug. */
    snapshot() {
      return {
        role,
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
        dataChannelState: channel ? channel.readyState : 'none',
      };
    },

    isOpen() {
      return !!channel && channel.readyState === 'open';
    },

    close() {
      if (closed) return;
      closed = true;
      msgListeners.clear();
      try {
        if (channel) channel.close();
      } catch {
        /* noop */
      }
      try {
        pc.close();
      } catch {
        /* noop */
      }
      emit(PEER_EVENT.CLOSED);
    },
  };
}
