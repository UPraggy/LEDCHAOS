import {
  createRoom, addBot, removePlayer, updatePlayer, setRounds, setDifficulty,
  setMode, toggleGame, setSoloGame,
  resetScores, joinGuest, guestLeave, loadRoom, loadPrefs,
} from '../room/roomManager.js';
import {
  createMatch, nextRound, setPhase, finishRound, skipRound,
  setGameForRound, forceChaos, jumpToRound, PHASES,
} from '../engine/roundManager.js';
import { createRng } from '../engine/random.js';

/**
 * gameState — o reducer. É o ÚNICO lugar onde o estado muda.
 *
 * Ele não calcula nada: só chama roomManager (regra de sala) e roundManager
 * (regra de partida) e costura os dois. Se você precisar de lógica nova,
 * ela vai num desses módulos, não aqui.
 *
 * Estado:
 *   room   → sala + jogadores + pontuação  (persistido)
 *   match  → partida em andamento          (não persistido: recarregar = voltar ao lobby)
 *   prefs  → nome, avatar, mudo            (persistido)
 *   debug  → painel de debug ligado        (só em dev)
 */

export const ACTIONS = {
  PREFS_SET: 'prefs/set',

  ROOM_CREATE: 'room/create',
  ROOM_SET: 'room/set',
  ROOM_ADD_BOT: 'room/addBot',
  ROOM_REMOVE: 'room/removePlayer',
  ROOM_UPDATE_PLAYER: 'room/updatePlayer',
  ROOM_ROUNDS: 'room/rounds',
  ROOM_DIFFICULTY: 'room/difficulty',
  ROOM_MODE: 'room/mode',
  ROOM_TOGGLE_GAME: 'room/toggleGame',
  ROOM_SOLO_GAME: 'room/soloGame',
  ROOM_RESET_SCORES: 'room/resetScores',
  ROOM_GUEST_JOIN: 'room/guestJoin',
  ROOM_GUEST_LEAVE: 'room/guestLeave',
  ROOM_CLEAR: 'room/clear',

  MATCH_START: 'match/start',
  MATCH_PHASE: 'match/phase',
  MATCH_FINISH: 'match/finish',
  MATCH_SKIP: 'match/skip',
  MATCH_NEXT: 'match/next',
  MATCH_REPLAY: 'match/replay',
  MATCH_EXIT: 'match/exit',

  DEBUG_TOGGLE: 'debug/toggle',
  DEBUG_SET_GAME: 'debug/setGame',
  DEBUG_CHAOS: 'debug/forceChaos',
  DEBUG_ROUND: 'debug/setRound',
  DEBUG_SKIP: 'debug/skipCountdown',
};

export function createInitialState() {
  const prefs = loadPrefs();
  return {
    room: loadRoom(),
    match: null,
    prefs,
    debug: false,
  };
}

export function reducer(state, action) {
  switch (action.type) {
    /* ------------------------------------------------------------- prefs */
    case ACTIONS.PREFS_SET:
      return { ...state, prefs: { ...state.prefs, ...action.patch } };

    /* -------------------------------------------------------------- sala */
    case ACTIONS.ROOM_CREATE: {
      const room = createRoom({
        id: action.id,
        name: action.name ?? state.prefs.name,
        avatar: action.avatar ?? state.prefs.avatar,
        rounds: action.rounds,
        difficulty: action.difficulty,
        bots: action.bots,
        mode: action.mode,
        picked: action.picked,
        soloGame: action.soloGame,
        direct: action.direct,
      });
      return { ...state, room, match: null };
    }

    case ACTIONS.ROOM_SET:
      return { ...state, room: action.room };

    case ACTIONS.ROOM_ADD_BOT:
      return state.room ? { ...state, room: addBot(state.room, createRng()) } : state;

    case ACTIONS.ROOM_REMOVE:
      return state.room ? { ...state, room: removePlayer(state.room, action.playerId) } : state;

    case ACTIONS.ROOM_UPDATE_PLAYER:
      return state.room
        ? { ...state, room: updatePlayer(state.room, action.playerId, action.patch) }
        : state;

    case ACTIONS.ROOM_ROUNDS:
      return state.room ? { ...state, room: setRounds(state.room, action.rounds) } : state;

    case ACTIONS.ROOM_DIFFICULTY:
      return state.room
        ? { ...state, room: setDifficulty(state.room, action.difficulty) }
        : state;

    case ACTIONS.ROOM_MODE:
      return state.room ? { ...state, room: setMode(state.room, action.mode) } : state;

    case ACTIONS.ROOM_TOGGLE_GAME:
      return state.room ? { ...state, room: toggleGame(state.room, action.gameId) } : state;

    case ACTIONS.ROOM_SOLO_GAME:
      return state.room ? { ...state, room: setSoloGame(state.room, action.gameId) } : state;

    case ACTIONS.ROOM_RESET_SCORES:
      return state.room ? { ...state, room: resetScores(state.room) } : state;

    // Convidado de verdade entrou pela rede (host recebeu HELLO). SEMPRE ganha
    // cadeira — o convidado tem que JOGAR (host x convidados disputando), esse é
    // o ponto do modo direto. Antes a gente barrava HELLO que chegasse depois do
    // START (para o placar não pular), mas o aperto de mão por QR leva segundos:
    // um HELLO tardio deixava o convidado BANIDO (sem cadeira → me===null → só a
    // tela "NO PALCO AGORA", nunca jogando). joinGuest é seguro em qualquer fase:
    // reconexão (id já na sala) só re-marca a cadeira como gente e MANTÉM o placar;
    // cadeira nova toma o lugar de um bot. Placar embaralhado numa rodada é um mal
    // menor perto de o convidado não conseguir jogar de jeito nenhum.
    case ACTIONS.ROOM_GUEST_JOIN: {
      if (!state.room) return state;
      return { ...state, room: joinGuest(state.room, action.player) };
    }

    // Convidado caiu: a cadeira vira bot para o placar não abrir buraco. Seguro
    // em qualquer fase.
    case ACTIONS.ROOM_GUEST_LEAVE:
      return state.room ? { ...state, room: guestLeave(state.room, action.playerId) } : state;

    case ACTIONS.ROOM_CLEAR:
      return { ...state, room: null, match: null };

    /* ----------------------------------------------------------- partida */
    case ACTIONS.MATCH_START: {
      if (!state.room) return state;
      const room = resetScores(state.room);
      return {
        ...state,
        room: { ...room, status: 'playing' },
        match: createMatch(room, action.seed),
      };
    }

    case ACTIONS.MATCH_PHASE:
      return state.match ? { ...state, match: setPhase(state.match, action.phase) } : state;

    case ACTIONS.MATCH_FINISH: {
      if (!state.match || !state.room) return state;
      // Blindagem: só a fase PLAYING pode encerrar. Um onFinish atrasado que
      // chegue depois do resultado é ignorado em vez de pontuar duas vezes.
      if (state.match.phase !== PHASES.PLAYING) return state;

      const patch = finishRound(state.match, state.room.players, action.entries);
      return {
        ...state,
        room: { ...state.room, players: patch.players },
        match: {
          ...state.match,
          phase: PHASES.RESULT,
          results: patch.results,
          records: patch.records,
          history: patch.history,
          error: null,
        },
      };
    }

    case ACTIONS.MATCH_SKIP: {
      if (!state.match) return state;
      return { ...state, match: skipRound(state.match, action.reason) };
    }

    case ACTIONS.MATCH_NEXT: {
      if (!state.match) return state;
      const match = nextRound(state.match);
      const status = match.phase === PHASES.FINAL ? 'finished' : 'playing';
      return {
        ...state,
        room: state.room ? { ...state.room, status } : state.room,
        match,
      };
    }

    case ACTIONS.MATCH_REPLAY: {
      if (!state.room) return state;
      const room = resetScores(state.room);
      return {
        ...state,
        room: { ...room, status: 'playing' },
        match: createMatch(room),
      };
    }

    case ACTIONS.MATCH_EXIT:
      return {
        ...state,
        room: state.room ? { ...resetScores(state.room), status: 'lobby' } : null,
        match: null,
      };

    /* ------------------------------------------------------------- debug */
    case ACTIONS.DEBUG_TOGGLE:
      return { ...state, debug: !state.debug };

    case ACTIONS.DEBUG_SET_GAME:
      return state.match
        ? { ...state, match: setGameForRound(state.match, action.gameId) }
        : state;

    case ACTIONS.DEBUG_CHAOS:
      return state.match ? { ...state, match: forceChaos(state.match, action.eventId) } : state;

    case ACTIONS.DEBUG_ROUND:
      return state.match ? { ...state, match: jumpToRound(state.match, action.round) } : state;

    // Interruptor fixo, não de uma vez só: testar 7 rodadas esperando 3 s de
    // contagem em cada uma é o que faz a gente parar de testar.
    case ACTIONS.DEBUG_SKIP:
      return state.match
        ? { ...state, match: { ...state.match, skipCountdown: !state.match.skipCountdown } }
        : state;

    default:
      return state;
  }
}

/**
 * Entrar numa sala pelo link/QR.
 * Sem transporte (Fase 2), "entrar" cria a sala LOCALMENTE com o código lido.
 * A tela deixa isso claro para o jogador. A assinatura já é a definitiva:
 * quando a rede existir, só o corpo desta função muda.
 */
export function joinRoomAction({ id, name, avatar, rounds, difficulty }) {
  return { type: ACTIONS.ROOM_CREATE, id, name, avatar, rounds, difficulty };
}
