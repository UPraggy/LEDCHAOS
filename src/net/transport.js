/**
 * transport — o cano por onde as mensagens andam.
 *
 * ┌─ CONTRATO ────────────────────────────────────────────────────────────────┐
 * │ {                                                                         │
 * │   role,          'host' | 'guest'                                         │
 * │   selfId,        id deste nó                                              │
 * │   send(msg, to)  convidado: `to` é ignorado (só existe o host)            │
 * │                  host: `to` = id do peer, ou null/omitido = broadcast     │
 * │   onMessage(fn)  fn(msg, fromId) → devolve unsubscribe                    │
 * │   onPeer(fn)     fn({ type:'join'|'leave', peerId }) → devolve unsubscribe │
 * │   peers()        [ids] conectados                                         │
 * │   close()        desliga e limpa TUDO (timers inclusive)                   │
 * │ }                                                                         │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Este arquivo entrega a implementação **loopback**: tudo em memória, num
 * aparelho só, sem rede e sem servidor. Ela existe por dois motivos:
 *
 *   1. É o que o MVP pode ter. Backend/WebSocket/WebRTC são proibidos aqui.
 *   2. É o jeito de testar a arquitetura host-autoritativa inteira sem depender
 *      de sinalização. Quando o transporte real entrar, ele implementa este
 *      mesmo contrato e nada acima dele muda.
 *
 * ⚠️ A entrega é SEMPRE assíncrona, mesmo com latência 0. Canal de rede nunca
 * entrega no mesmo tick; se o código de cima puder depender de entrega
 * síncrona, ele vai quebrar no dia em que o cano virar de verdade.
 *
 * Ver `docs/05-FASE2-MULTIPLAYER.md` §5.
 */

import { ROLES, allowedFrom, encode, decode } from './protocol.js';

/**
 * Cria um "hub" loopback: o lugar onde os nós fake se encontram.
 * @param {object} opts
 * @param {number} opts.latency  atraso base em ms (0 = microtask)
 * @param {number} opts.jitter   variação aleatória somada à latência, em ms
 * @param {function} opts.rng    fonte de aleatório para o jitter (injetável p/ teste)
 * @param {number} opts.loss     0–1, fração de mensagens descartadas (teste de robustez)
 */
export function createLoopbackHub({ latency = 0, jitter = 0, rng = Math.random, loss = 0 } = {}) {
  /** id → { id, role, listeners:Set, peerListeners:Set, open:boolean } */
  const nodes = new Map();
  const timers = new Set();
  let hostId = null;
  let closed = false;

  function delay() {
    return latency + (jitter > 0 ? rng() * jitter : 0);
  }

  function later(fn) {
    const d = delay();
    if (d <= 0) {
      queueMicrotask(() => {
        if (!closed) fn();
      });
      return;
    }
    const id = setTimeout(() => {
      timers.delete(id);
      if (!closed) fn();
    }, d);
    timers.add(id);
  }

  function deliver(target, wireText, fromId) {
    if (!target?.open) return;
    if (loss > 0 && rng() < loss) return; // pacote perdido de propósito
    later(() => {
      if (!target.open) return;
      const msg = decode(wireText); // passa por JSON de verdade: pega o não-serializável
      if (!msg) {
        console.warn('[CHAOS/net] mensagem descartada (inválida ou não serializável)');
        return;
      }
      target.listeners.forEach((fn) => {
        try {
          fn(msg, fromId);
        } catch (err) {
          console.error('[CHAOS/net] handler de mensagem falhou:', err);
        }
      });
    });
  }

  function announce(type, peerId) {
    nodes.forEach((node) => {
      if (node.id === peerId || !node.open) return;
      // convidado só enxerga o host; host enxerga todo mundo
      if (node.role === ROLES.GUEST && peerId !== hostId) return;
      later(() => {
        if (!node.open) return;
        node.peerListeners.forEach((fn) => {
          try {
            fn({ type, peerId });
          } catch (err) {
            console.error('[CHAOS/net] handler de peer falhou:', err);
          }
        });
      });
    });
  }

  /**
   * Conecta um nó ao hub e devolve um transporte que cumpre o contrato acima.
   * @param {object} opts { id, role }
   */
  function connect({ id, role = ROLES.GUEST } = {}) {
    if (closed) throw new Error('[CHAOS/net] hub já fechado');
    if (!id) throw new Error('[CHAOS/net] connect() precisa de um id');
    if (nodes.has(id)) throw new Error(`[CHAOS/net] id duplicado: ${id}`);
    if (role === ROLES.HOST && hostId) throw new Error('[CHAOS/net] já existe um host');

    const node = { id, role, listeners: new Set(), peerListeners: new Set(), open: true };
    nodes.set(id, node);
    if (role === ROLES.HOST) hostId = id;

    announce('join', id);

    return {
      role,
      selfId: id,

      send(msg, to = null) {
        if (!node.open) return false;
        if (!allowedFrom(role, msg?.k)) {
          // Fronteira de autoridade: convidado tentando mandar estado, por exemplo.
          console.warn(`[CHAOS/net] ${role} não pode enviar "${msg?.k}" — descartado`);
          return false;
        }

        let wire;
        try {
          wire = encode(msg);
        } catch {
          console.warn('[CHAOS/net] mensagem não serializável — descartada');
          return false;
        }

        if (role === ROLES.GUEST) {
          const host = hostId ? nodes.get(hostId) : null;
          if (!host) return false;
          deliver(host, wire, id);
          return true;
        }

        if (to) {
          deliver(nodes.get(to), wire, id);
          return true;
        }
        nodes.forEach((n) => {
          if (n.id !== id) deliver(n, wire, id);
        });
        return true;
      },

      onMessage(fn) {
        node.listeners.add(fn);
        return () => node.listeners.delete(fn);
      },

      onPeer(fn) {
        node.peerListeners.add(fn);
        return () => node.peerListeners.delete(fn);
      },

      peers() {
        if (role === ROLES.GUEST) return hostId ? [hostId] : [];
        return [...nodes.keys()].filter((k) => k !== id);
      },

      close() {
        if (!node.open) return;
        node.open = false;
        node.listeners.clear();
        node.peerListeners.clear();
        nodes.delete(id);
        if (hostId === id) hostId = null;
        announce('leave', id);
      },
    };
  }

  return {
    connect,
    get hostId() {
      return hostId;
    },
    size() {
      return nodes.size;
    },
    /** Desliga o hub inteiro e limpa timers pendentes — nada roda depois disto. */
    close() {
      closed = true;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      nodes.forEach((n) => {
        n.open = false;
        n.listeners.clear();
        n.peerListeners.clear();
      });
      nodes.clear();
      hostId = null;
    },
  };
}
