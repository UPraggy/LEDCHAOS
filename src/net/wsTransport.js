/**
 * wsTransport — o transporte DE VERDADE.
 *
 * Cumpre o mesmíssimo contrato do loopback (ver transport.js). Onde o loopback
 * junta os nós em memória, aqui o ponto de encontro é um relay WebSocket: um
 * servidor bobo que só empurra bytes de um lado pro outro, sem entender nada de
 * jogo (ver server/relay.js). Toda a autoridade continua no host; o relay é um
 * cano, não um juiz.
 *
 * ┌─ CONTRATO (idêntico ao loopback) ─────────────────────────────────────────┐
 * │ { role, selfId, send(msg,to), onMessage(fn), onPeer(fn), peers(), close() }│
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * A troca é literal: onde o Provider fazia `createLoopbackHub()`, agora faz
 * `createRelayHub({ url, code })`. Tela e microjogo não sabem a diferença.
 *
 * ⚠️ Entrega assíncrona: WebSocket nunca entrega no mesmo tick — a propriedade
 * que o loopback simulava de propósito aqui é de graça.
 *
 * Envelope de fio (JSON) entre cliente e relay:
 *   cliente → relay: { t:'join', room, id, role }
 *                    { t:'msg', to, data }        data = mensagem do protocolo já em texto
 *                    { t:'bye' }
 *   relay → cliente: { t:'welcome', id, role, peers:[...] }
 *                    { t:'peer', kind:'join'|'leave', id }
 *                    { t:'msg', from, data }
 *                    { t:'error', reason }
 *
 * Ver `docs/05-FASE2-MULTIPLAYER.md` §5 e §7.
 */

import { ROLES, allowedFrom, encode, decode } from './protocol.js';

/** Tentativas de reconexão antes de desistir, e o teto do backoff. */
const RECONNECT_TRIES = 6;
const RECONNECT_BASE = 600; // ms
const RECONNECT_CAP = 8000; // ms

/**
 * Cria um "hub" ligado a um relay WebSocket. Mesma superfície do loopback
 * (`connect`, `close`, `hostId`, `size`) para ser troca direta no Provider.
 *
 * @param {object} opts
 * @param {string} opts.url    ws://IP:PORTA do relay (LAN-first)
 * @param {string} opts.code   código da sala — é o endereço no relay
 * @param {function} [opts.rng] fonte de aleatório (jitter do backoff; injetável p/ teste)
 */
export function createRelayHub({ url, code, rng = Math.random } = {}) {
  if (!url) throw new Error('[CHAOS/net] createRelayHub precisa de uma url');
  if (!code) throw new Error('[CHAOS/net] createRelayHub precisa de um código de sala');

  /** id → node (cada aparelho normalmente tem 1; 2 quando se testa guest na mesma máquina) */
  const nodes = new Map();
  let hostId = null;
  let closed = false;

  function noteHost(role, id) {
    if (role === ROLES.HOST) hostId = id;
  }

  /**
   * Abre um nó no relay e devolve um transporte que cumpre o contrato.
   * @param {object} opts { id, role }
   */
  function connect({ id, role = ROLES.GUEST } = {}) {
    if (closed) throw new Error('[CHAOS/net] hub já fechado');
    if (!id) throw new Error('[CHAOS/net] connect() precisa de um id');
    if (nodes.has(id)) throw new Error(`[CHAOS/net] id duplicado: ${id}`);

    const listeners = new Set(); // fn(msg, fromId)
    const peerListeners = new Set(); // fn({ type, peerId })
    const peerSet = new Set(); // ids que este nó enxerga
    const outbox = []; // mensagens presas enquanto o socket não abre
    const node = { id, role, open: true };
    nodes.set(id, node);
    noteHost(role, id);

    let ws = null;
    let tries = 0;
    let reconnectTimer = null;
    let joined = false;

    function emitPeer(type, peerId) {
      peerListeners.forEach((fn) => {
        try {
          fn({ type, peerId });
        } catch (err) {
          console.error('[CHAOS/net] handler de peer falhou:', err);
        }
      });
    }

    function emitMessage(msg, fromId) {
      listeners.forEach((fn) => {
        try {
          fn(msg, fromId);
        } catch (err) {
          console.error('[CHAOS/net] handler de mensagem falhou:', err);
        }
      });
    }

    function flushOutbox() {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      while (outbox.length) ws.send(outbox.shift());
    }

    function raw(frame) {
      const text = JSON.stringify(frame);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(text);
      else outbox.push(text); // segura até abrir/reabrir — nada se perde no aperto do início
    }

    function handleFrame(text) {
      let frame;
      try {
        frame = JSON.parse(text);
      } catch {
        return; // lixo na rede não derruba a partida
      }
      if (!frame || typeof frame.t !== 'string') return;

      switch (frame.t) {
        case 'welcome': {
          joined = true;
          tries = 0;
          if (Array.isArray(frame.peers)) {
            frame.peers.forEach((peerId) => {
              if (peerId === id || peerSet.has(peerId)) return;
              peerSet.add(peerId);
              if (role === ROLES.GUEST) hostId = peerId; // convidado só enxerga o host
              emitPeer('join', peerId);
            });
          }
          break;
        }
        case 'peer': {
          const peerId = frame.id;
          if (!peerId || peerId === id) break;
          if (frame.kind === 'join') {
            if (peerSet.has(peerId)) break;
            peerSet.add(peerId);
            if (role === ROLES.GUEST) hostId = peerId;
            emitPeer('join', peerId);
          } else if (frame.kind === 'leave') {
            if (!peerSet.delete(peerId)) break;
            if (role === ROLES.GUEST && hostId === peerId) hostId = null;
            emitPeer('leave', peerId);
          }
          break;
        }
        case 'msg': {
          // decode faz o mesmo papel do loopback: valida forma e ignora garbage.
          const msg = decode(frame.data);
          if (!msg) {
            console.warn('[CHAOS/net] mensagem descartada (inválida na rede)');
            break;
          }
          emitMessage(msg, frame.from);
          break;
        }
        case 'error':
          console.error(`[CHAOS/net] relay recusou: ${frame.reason || 'desconhecido'}`);
          break;
        default:
          break;
      }
    }

    function scheduleReconnect() {
      if (closed || !node.open) return;
      if (tries >= RECONNECT_TRIES) {
        console.warn('[CHAOS/net] relay inalcançável — desistindo da reconexão');
        return;
      }
      const backoff = Math.min(RECONNECT_CAP, RECONNECT_BASE * 2 ** tries);
      const wait = backoff + rng() * (backoff / 2); // jitter: evita reconectar todos juntos
      tries += 1;
      reconnectTimer = setTimeout(open, wait);
    }

    function open() {
      if (closed || !node.open) return;
      reconnectTimer = null;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        console.error('[CHAOS/net] não abriu o WebSocket:', err);
        scheduleReconnect();
        return;
      }

      ws.addEventListener('open', () => {
        // (Re)apresenta este nó ao relay. No reconnect isto re-registra a
        // presença; o host re-anuncia a sala em cima do onPeer('join').
        raw({ t: 'join', room: code, id, role });
        flushOutbox();
      });
      ws.addEventListener('message', (ev) => handleFrame(ev.data));
      ws.addEventListener('close', () => {
        if (closed || !node.open) return;
        joined = false;
        scheduleReconnect();
      });
      ws.addEventListener('error', () => {
        // 'error' vem sempre seguido de 'close'; deixa o close cuidar do retry.
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      });
    }

    open();

    const transport = {
      role,
      selfId: id,

      send(msg, to = null) {
        if (!node.open) return false;
        if (!allowedFrom(role, msg?.k)) {
          // Fronteira de autoridade: convidado tentando mandar estado, por exemplo.
          console.warn(`[CHAOS/net] ${role} não pode enviar "${msg?.k}" — descartado`);
          return false;
        }

        let data;
        try {
          data = encode(msg);
        } catch {
          console.warn('[CHAOS/net] mensagem não serializável — descartada');
          return false;
        }

        // Convidado ignora `to`: no relay só existe o host como destino dele.
        const target = role === ROLES.GUEST ? null : to;
        raw({ t: 'msg', to: target, data });
        return true;
      },

      onMessage(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },

      onPeer(fn) {
        peerListeners.add(fn);
        return () => peerListeners.delete(fn);
      },

      peers() {
        return [...peerSet];
      },

      close() {
        if (!node.open) return;
        node.open = false;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        if (ws) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              if (joined) ws.send(JSON.stringify({ t: 'bye' }));
              ws.close();
            } else {
              ws.close();
            }
          } catch {
            /* já estava caindo */
          }
        }
        ws = null;
        listeners.clear();
        peerListeners.clear();
        peerSet.clear();
        outbox.length = 0;
        nodes.delete(id);
        if (hostId === id) hostId = null;
      },
    };

    node.transport = transport;
    return transport;
  }

  return {
    connect,
    get hostId() {
      return hostId;
    },
    size() {
      return nodes.size;
    },
    /** Desliga o hub inteiro: fecha todo nó local e seu socket. */
    close() {
      closed = true;
      // snapshot: transport.close() remove de `nodes` no meio da iteração.
      [...nodes.values()].forEach((node) => {
        try {
          node.transport?.close();
        } catch (err) {
          console.error('[CHAOS/net] erro fechando nó do relay:', err);
        }
      });
      nodes.clear();
      hostId = null;
    },
  };
}
