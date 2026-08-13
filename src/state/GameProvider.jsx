import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ACTIONS, createInitialState, reducer, joinRoomAction } from './gameState.js';
import { saveRoom, savePrefs, clearRoom } from '../room/roomManager.js';
import { createActionBus } from '../engine/inputManager.js';
import { unlockAudio, onMuteChange, setMuted, isMuted } from '../audio/soundManager.js';
import { createLoopbackHub } from '../net/transport.js';
import { createRelayHub } from '../net/wsTransport.js';
import { createP2PHub } from '../net/p2pTransport.js';
import { createNetSession } from '../net/netSession.js';
import { createScoreLedger, mergeRealScores } from '../net/scoreMerge.js';
import { ROLES } from '../net/protocol.js';

/**
 * GameProvider — o contexto único do jogo.
 *
 * Expõe estado + ações prontas (nada de dispatch solto nas telas) + o
 * barramento de ações. Persiste sala e preferências no localStorage.
 *
 * Hooks: useGame() para tudo, useRoom() e useMatch() para atalhos.
 */

const GameContext = createContext(null);

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  // Um barramento por sessão. A camada de rede injeta ações aqui.
  const busRef = useRef(null);
  if (!busRef.current) busRef.current = createActionBus();

  /* -------------------------------------------------------------- rede (F7-A)
   * Este aparelho é sempre o HOST, num hub loopback: tudo em memória, sem rede
   * e sem servidor — que é o que o MVP permite. O valor de ter isto ligado
   * agora é que o caminho host→estado e ação→bus já é REAL; o transporte de
   * verdade entra trocando `createLoopbackHub()` por outro que cumpra o mesmo
   * contrato, sem tocar em tela nem em microjogo. Ver docs/05-FASE2. */
  // Livro-caixa dos placares reais reportados pelos convidados (F7-C). Vive
  // fora do reducer porque é acumulador de rede, não estado de UI: o host grava
  // aqui à medida que os reportes chegam e consome no fecho da rodada.
  const ledgerRef = useRef(null);
  if (!ledgerRef.current) ledgerRef.current = createScoreLedger();

  // Grava um reporte de convidado. O mesmo handler serve o loopback e o relay:
  // o host é sempre o mesmo, só o cano muda.
  const recordGuestScore = useRef((playerId, payload) => {
    ledgerRef.current.record(payload?.round, playerId, payload);
  }).current;

  const netRef = useRef(null);
  if (!netRef.current) {
    const hub = createLoopbackHub();
    netRef.current = createNetSession({
      transport: hub.connect({ id: 'host', role: ROLES.HOST }),
      bus: busRef.current,
      handlers: { onGuestScore: recordGuestScore },
    });
    netRef.current.hub = hub; // o hub é quem aceita novos nós (convidado real, na F7-B)
  }

  useEffect(() => {
    const net = netRef.current;
    return () => {
      net.close();
      net.hub.close(); // limpa timers pendentes: nada roda depois do unmount
    };
  }, []);

  useEffect(() => {
    // Só em dev: permite plugar um "convidado" fake pelo console e dirigir a
    // partida como se viesse de outro aparelho, sem rede nenhuma. É assim que
    // se testa a F7-B antes de existir transporte real.
    //   const g = __chaosNet.guest('p2');  g.sendAction('TAP', {x:.5,y:.5})
    if (!import.meta.env.DEV) return undefined;
    const net = netRef.current;
    window.__chaosNet = {
      net,
      hub: net.hub,
      bus: busRef.current,
      guest(playerId = 'p2', handlers = {}) {
        const g = createNetSession({
          transport: net.hub.connect({ id: `fake-${playerId}`, role: ROLES.GUEST }),
          bus: null,
          localPlayerId: playerId,
          handlers,
        });
        g.hello({ id: playerId, name: playerId.toUpperCase() });
        return g;
      },
    };
    return () => {
      delete window.__chaosNet;
    };
  }, []);

  /* --------------------------------------------------- rede DE VERDADE (F7-B)
   * O transporte real é OPT-IN: só liga se `VITE_RELAY_URL` estiver definido
   * (arquivo .env.local, ausente por padrão). Sem ele, tudo acima continua
   * idêntico ao de hoje — host + bots, 100% local, zero rede.
   *
   * Quando liga, a troca é literal (é o que transport.js prometia): o mesmo
   * netSession(host), só que o loopback vira um `createRelayHub`. Nada nas telas
   * nem nos 12 microjogos muda — o broadcast que já existia passa a sair pela
   * rede, e um convidado que dá HELLO vira jogador de verdade no lugar de um bot.
   *
   * Só o HOST desta sala abre o relay. Chaveado no CÓDIGO da sala: sala nova =
   * canal novo. Se o relay estiver fora do ar, o wsTransport tenta reconectar em
   * silêncio e o jogo segue com os bots — a sala nunca trava esperando a rede. */
  const relayUrl = import.meta.env.VITE_RELAY_URL;
  const roomId = state.room?.id ?? null;
  const hostsThisRoom = state.room ? state.room.hostId === 'p1' : false;
  // Modo direto (zero-servidor): a sala pediu WebRTC P2P por handshake de QR.
  const directMode = state.room?.settings?.direct === true;

  // Superfície de signaling do cano direto exposta ao Lobby: o host gera um
  // convite (offer) por convidado e cola a resposta (answer). Só existe no modo
  // direto — relay/loopback têm rendezvous automático e não precisam disto.
  const [directSignaling, setDirectSignaling] = useState(null);

  // Espelho da sala p/ o efeito empurrar o estado atual assim que o cano abrir,
  // sem re-derrubar o relay a cada jogador que entra.
  const roomRef = useRef(state.room);
  roomRef.current = state.room;

  useEffect(() => {
    if (!relayUrl || !roomId || !hostsThisRoom) return undefined;

    const bus = busRef.current;
    const loopback = netRef.current; // guardado para restaurar no teardown

    const hub = createRelayHub({ url: relayUrl, code: roomId });
    const session = createNetSession({
      transport: hub.connect({ id: 'host', role: ROLES.HOST }),
      bus,
      handlers: {
        // Convidado se apresentou: entra no lugar de um bot (só no lobby).
        onJoin: (player) => dispatch({ type: ACTIONS.ROOM_GUEST_JOIN, player }),
        // Convidado caiu/saiu: a cadeira volta a ser bot.
        onLeave: (playerId) => dispatch({ type: ACTIONS.ROOM_GUEST_LEAVE, playerId }),
        // Convidado reportou o placar do próprio slot (F7-C): vai para o livro.
        onGuestScore: recordGuestScore,
      },
    });
    session.hub = hub;
    netRef.current = session; // a partir daqui, todo broadcast sai pela rede

    // Empurra a sala atual imediatamente: um convidado que já estava esperando
    // (host reconectou) recebe o estado sem depender de mexer no elenco.
    const room = roomRef.current;
    if (room) session.broadcastRoom(room.players, room.settings);

    return () => {
      session.close();
      hub.close();
      netRef.current = loopback; // volta ao loopback: o app segue offline
    };
  }, [relayUrl, roomId, hostsThisRoom]);

  /* --------------------------------------------- rede DIRETA, ZERO-SERVIDOR (P2P)
   * Mesma peça que o relay, mas o cano é `createP2PHub` (WebRTC DataChannel) e
   * NÃO há servidor de rendezvous: o host abre uma conexão por convidado e a
   * troca de offer/answer sai por FORA da rede — QR/hash colado à mão no Lobby.
   *
   * O contrato é idêntico ao do relay (mesmo netSession host, mesmos handlers
   * onJoin/onLeave/onGuestScore), então telas e microjogos continuam cegos ao
   * cano. A única superfície extra é `hub.signaling`, que exponho ao Lobby via
   * `directSignaling` para ele gerar convites e aceitar respostas.
   *
   * Só liga quando a sala foi criada em modo direto E não há relay configurado
   * (o relay, se existir, tem rendezvous automático e é o caminho preferido). */
  useEffect(() => {
    if (relayUrl || !directMode || !roomId || !hostsThisRoom) return undefined;

    const bus = busRef.current;
    const loopback = netRef.current; // guardado para restaurar no teardown

    const hub = createP2PHub();
    const session = createNetSession({
      transport: hub.connect({ id: 'host', role: ROLES.HOST }),
      bus,
      handlers: {
        onJoin: (player) => dispatch({ type: ACTIONS.ROOM_GUEST_JOIN, player }),
        onLeave: (playerId) => dispatch({ type: ACTIONS.ROOM_GUEST_LEAVE, playerId }),
        onGuestScore: recordGuestScore,
      },
    });
    session.hub = hub;
    netRef.current = session; // a partir daqui, todo broadcast sai pelos canos P2P

    // Lobby ganha a manivela do handshake (createInvite / acceptAnswer).
    setDirectSignaling(hub.signaling);

    // Empurra a sala atual assim que um convidado abre o canal (broadcastRoom é
    // no-op enquanto ninguém conectou; cada `onJoin` re-emite via o efeito de sala).
    const room = roomRef.current;
    if (room) session.broadcastRoom(room.players, room.settings);

    return () => {
      setDirectSignaling(null);
      session.close();
      hub.close();
      netRef.current = loopback; // volta ao loopback: o app segue offline
    };
  }, [relayUrl, directMode, roomId, hostsThisRoom]);

  /* ------------------------------------------------- placares reais (F7-C)
   * Partida nova (seed muda) ou saída (seed some) zera o livro-caixa: reportes
   * de uma partida nunca vazam para a próxima. */
  useEffect(() => {
    ledgerRef.current.clear();
  }, [state.match?.seed]);

  // Funde os placares reais recebidos até agora sobre a lista local (com bots) e
  // ESVAZIA a rodada no livro. Chamada uma vez por rodada, na Game, no onFinish.
  // Sem convidados conectados devolve a lista intacta — retrocompatível.
  const mergeEntries = useRef((roundNo, entries) =>
    mergeRealScores(entries, ledgerRef.current.take(roundNo))).current;

  /* ---------------------------------------------------------- persistência */
  useEffect(() => {
    if (state.room) saveRoom(state.room);
    else clearRoom();
  }, [state.room]);

  useEffect(() => {
    savePrefs({ name: state.prefs.name, avatar: state.prefs.avatar });
  }, [state.prefs.name, state.prefs.avatar]);

  /* -------------------------------------------- host: estado sai por broadcast
   * O host é a autoridade. Ele não pede nada a ninguém: quando o estado muda
   * aqui, ele ANUNCIA. Com zero convidados conectados o broadcast é no-op —
   * mas o caminho existe e é exercitado a cada partida. */
  const phase = state.match?.phase ?? null;
  const round = state.match?.round ?? null;
  const gameId = state.match?.gameId ?? null;

  useEffect(() => {
    if (!state.room) return;
    netRef.current.broadcastRoom(state.room.players, state.room.settings);
  }, [state.room]);

  useEffect(() => {
    if (!round || !gameId) return;
    netRef.current.broadcastRound({
      round,
      gameId,
      chaos: state.match?.chaosEvent?.id ?? null,
      seed: state.match?.seed,
    });
    // O mundo não viaja: cada aparelho reconstrói a rodada de roundRng(seed, round).
  }, [round, gameId]);

  useEffect(() => {
    if (!phase) return;
    netRef.current.broadcastPhase(phase);
  }, [phase]);

  useEffect(() => {
    const results = state.match?.results;
    if (!results) return;
    netRef.current.broadcastResult(results.entries ?? results, results.standings ?? null);
  }, [state.match?.results]);

  /* ----------------------------------------------- áudio: destravar + mudo */
  useEffect(() => {
    // Política dos browsers: o AudioContext só nasce depois de um gesto real.
    function unlock() {
      unlockAudio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    }
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    // soundManager é o dono do mudo (e da persistência dele); o estado só espelha.
    dispatch({ type: ACTIONS.PREFS_SET, patch: { muted: isMuted() } });
    return onMuteChange((muted) => dispatch({ type: ACTIONS.PREFS_SET, patch: { muted } }));
  }, []);

  /* --------------------------------------------------------------- ações */
  const actions = useMemo(() => ({
    setName: (name) => dispatch({ type: ACTIONS.PREFS_SET, patch: { name } }),
    setAvatar: (avatar) => dispatch({ type: ACTIONS.PREFS_SET, patch: { avatar } }),
    setMuted: (value) => setMuted(value),

    createRoom: (opts) => dispatch({ type: ACTIONS.ROOM_CREATE, ...opts }),
    joinRoom: (opts) => dispatch(joinRoomAction(opts)),
    setRoom: (room) => dispatch({ type: ACTIONS.ROOM_SET, room }),
    addBot: () => dispatch({ type: ACTIONS.ROOM_ADD_BOT }),
    removePlayer: (playerId) => dispatch({ type: ACTIONS.ROOM_REMOVE, playerId }),
    updatePlayer: (playerId, patch) => dispatch({ type: ACTIONS.ROOM_UPDATE_PLAYER, playerId, patch }),
    setRounds: (rounds) => dispatch({ type: ACTIONS.ROOM_ROUNDS, rounds }),
    setDifficulty: (difficulty) => dispatch({ type: ACTIONS.ROOM_DIFFICULTY, difficulty }),
    setMode: (mode) => dispatch({ type: ACTIONS.ROOM_MODE, mode }),
    toggleGame: (gameId) => dispatch({ type: ACTIONS.ROOM_TOGGLE_GAME, gameId }),
    setSoloGame: (gameId) => dispatch({ type: ACTIONS.ROOM_SOLO_GAME, gameId }),
    leaveRoom: () => dispatch({ type: ACTIONS.ROOM_CLEAR }),

    startMatch: (seed) => dispatch({ type: ACTIONS.MATCH_START, seed }),
    setPhase: (phase) => dispatch({ type: ACTIONS.MATCH_PHASE, phase }),
    finishRound: (entries) => dispatch({ type: ACTIONS.MATCH_FINISH, entries }),
    skipRound: (reason) => dispatch({ type: ACTIONS.MATCH_SKIP, reason }),
    nextRound: () => dispatch({ type: ACTIONS.MATCH_NEXT }),
    replayMatch: () => dispatch({ type: ACTIONS.MATCH_REPLAY }),
    exitMatch: () => dispatch({ type: ACTIONS.MATCH_EXIT }),

    toggleDebug: () => dispatch({ type: ACTIONS.DEBUG_TOGGLE }),
    debugSetGame: (gameId) => dispatch({ type: ACTIONS.DEBUG_SET_GAME, gameId }),
    debugChaos: (eventId) => dispatch({ type: ACTIONS.DEBUG_CHAOS, eventId }),
    debugRound: (round) => dispatch({ type: ACTIONS.DEBUG_ROUND, round }),
    debugSkipCountdown: () => dispatch({ type: ACTIONS.DEBUG_SKIP }),
    debugResetScores: () => dispatch({ type: ACTIONS.ROOM_RESET_SCORES }),
  }), []);

  const value = useMemo(() => ({
    room: state.room,
    match: state.match,
    prefs: state.prefs,
    debug: state.debug,
    debugAvailable: import.meta.env.DEV,
    bus: busRef.current,
    net: netRef.current,
    directSignaling, // manivela do handshake P2P (null fora do modo direto)
    mergeEntries, // (round, entries) → entries com placares reais fundidos (F7-C)
    scoreLedger: ledgerRef.current, // livro-caixa dos reportes (debug/painel)
    dispatch,
    ...actions,
  }), [state, actions, mergeEntries, directSignaling]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame() precisa estar dentro de <GameProvider>');
  return ctx;
}

export function useRoom() {
  return useGame().room;
}

export function useMatch() {
  return useGame().match;
}
