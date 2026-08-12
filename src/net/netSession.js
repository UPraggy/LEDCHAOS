/**
 * netSession — a ponte entre o transporte e o resto do jogo.
 *
 * É o ÚNICO lugar que conhece os dois lados. Acima dele, ninguém sabe que
 * existe rede: o microjogo escuta o action bus, as telas leem o estado.
 * Abaixo dele, o transporte só move bytes.
 *
 *   convidado ──act──►  netSession(host)  ──bus.emit──►  microjogo
 *   host       ──phase/round/result──►  netSession(convidado)  ──handlers──►  estado
 *
 * A linha que importa é `bus.emit(...)` em `handleAct()`: é ali que uma ação
 * que veio de outro aparelho vira indistinguível de um dedo local. Nenhum dos
 * 12 microjogos precisa saber.
 *
 * Ver `docs/05-FASE2-MULTIPLAYER.md` §1 e §5.
 */

import { ROLES, MSG, ACT_SCORE, allowedFrom } from './protocol.js';
import * as P from './protocol.js';

/**
 * @param {object} opts
 * @param {object} opts.transport  qualquer coisa que cumpra o contrato de transport.js
 * @param {object} opts.bus        action bus (engine/inputManager)
 * @param {string} opts.localPlayerId  id do jogador deste aparelho
 * @param {object} opts.handlers   callbacks do lado convidado + eventos de peer
 */
export function createNetSession({ transport, bus, localPlayerId = 'p1', handlers = {} } = {}) {
  if (!transport) throw new Error('[CHAOS/net] netSession precisa de um transport');

  const isHost = transport.role === ROLES.HOST;
  /** peerId → playerId (o host precisa saber de quem é cada ação) */
  const players = new Map();
  const unsubs = [];
  let closed = false;

  function call(name, ...args) {
    const fn = handlers[name];
    if (typeof fn !== 'function') return;
    try {
      fn(...args);
    } catch (err) {
      console.error(`[CHAOS/net] handlers.${name} falhou:`, err);
    }
  }

  /* ------------------------------------------------------------ recebimento */

  function handleAct(msg, fromId) {
    const playerId = players.get(fromId) || fromId;

    // Reporte de placar do próprio slot (fim da rodada) NÃO é input de jogo:
    // não entra no bus, vai para o livro-caixa do host (F7-C). O playerId sai
    // do peer, não do payload — convidado não forja o placar de outro.
    if (msg.a === ACT_SCORE) {
      call('onGuestScore', playerId, msg.p, fromId);
      return;
    }

    // Ação de outro aparelho entra no bus como se fosse local.
    // Carimbo é o do HOST: relógio de convidado ordena, não julga (§6 da doc).
    bus?.emit({
      type: 'PLAYER_ACTION',
      playerId,
      action: msg.a,
      payload: msg.p,
      t: performance.now(),
      remote: true,
    });
  }

  function onMessage(msg, fromId) {
    if (closed) return;

    // Quem mandou tinha direito de mandar isso? Convidado nunca manda estado.
    const senderRole = isHost ? ROLES.GUEST : ROLES.HOST;
    if (!allowedFrom(senderRole, msg.k)) {
      console.warn(`[CHAOS/net] "${msg.k}" recusada de ${fromId} (papel ${senderRole})`);
      return;
    }

    switch (msg.k) {
      /* ---- host recebendo ---- */
      case MSG.HELLO:
        if (msg.player?.id) players.set(fromId, msg.player.id);
        call('onJoin', msg.player, fromId);
        break;
      case MSG.BYE:
        call('onLeave', players.get(fromId) || fromId, fromId);
        players.delete(fromId);
        break;
      case MSG.ACT:
        handleAct(msg, fromId);
        break;
      case MSG.PING:
        transport.send(P.pong(msg.t), fromId);
        break;

      /* ---- convidado recebendo ---- */
      case MSG.PONG:
        call('onPong', Math.round(performance.now()) - msg.t0);
        break;
      case MSG.ROOM:
        call('onRoom', msg.players, msg.settings);
        break;
      case MSG.ROUND:
        call('onRound', { round: msg.round, gameId: msg.gameId, chaos: msg.chaos, seed: msg.seed });
        break;
      case MSG.PHASE:
        call('onPhase', msg.phase);
        break;
      case MSG.RESULT:
        call('onResult', msg.entries, msg.standings);
        break;
      case MSG.FINAL:
        call('onFinal', msg.achievements, msg.standings);
        break;
      default:
        break;
    }
  }

  unsubs.push(transport.onMessage(onMessage));
  unsubs.push(
    transport.onPeer(({ type, peerId }) => {
      if (type === 'leave') {
        call('onLeave', players.get(peerId) || peerId, peerId);
        players.delete(peerId);
      }
      call('onPeer', type, peerId);
    }),
  );

  /* --------------------------------------------------------------- emissão */

  const api = {
    role: transport.role,
    isHost,
    selfId: transport.selfId,
    peers: () => transport.peers(),

    /** Convidado: manda uma ação para o host. No host isto é no-op (já está no bus). */
    sendAction(action, payload = null) {
      if (isHost || closed) return false;
      return transport.send(P.act(action, payload));
    },

    /**
     * Convidado: reporta o placar do PRÓPRIO slot no fim da rodada (F7-C).
     * O host funde isto sobre o bot fabricado antes de calcular a colocação.
     * @param {{round:number, score:number, display?:string, stat?:any}} entry
     */
    sendScore(entry) {
      if (isHost || closed) return false;
      return transport.send(P.scoreReport(entry));
    },

    /** Convidado: se apresenta ao host ao entrar. */
    hello(player) {
      if (isHost || closed) return false;
      return transport.send(P.hello(player));
    },

    bye() {
      if (isHost || closed) return false;
      return transport.send(P.bye());
    },

    ping() {
      if (isHost || closed) return false;
      return transport.send(P.ping());
    },

    /* --- host: estado sai daqui, sempre em broadcast --- */
    broadcastRoom(playerList, settings) {
      if (!isHost || closed) return false;
      return transport.send(P.room(playerList, settings));
    },
    broadcastRound(info) {
      if (!isHost || closed) return false;
      return transport.send(P.round(info));
    },
    broadcastPhase(name) {
      if (!isHost || closed) return false;
      return transport.send(P.phase(name));
    },
    broadcastResult(entries, standings) {
      if (!isHost || closed) return false;
      return transport.send(P.result(entries, standings));
    },
    broadcastFinal(achievements, standings) {
      if (!isHost || closed) return false;
      return transport.send(P.final(achievements, standings));
    },

    /** Troca os callbacks sem recriar a sessão (o Provider re-renderiza muito). */
    setHandlers(next) {
      Object.assign(handlers, next);
    },

    localPlayerId,

    close() {
      if (closed) return;
      closed = true;
      if (!isHost) transport.send(P.bye());
      unsubs.forEach((off) => off());
      unsubs.length = 0;
      players.clear();
      transport.close();
    },
  };

  return api;
}
