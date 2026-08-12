import { createRng, randomSeed } from './random.js';
import { buildQueue, getGame, GAMES, GAME_IDS } from './gameRegistry.js';
import { rollChaosEvent, resolveEffects, getChaosEvent, eventsFor } from './chaosEvents.js';
import { resolveRound } from './scoreManager.js';
import { accumulateStats, emptyRecords } from './resultManager.js';

/**
 * roundManager — a máquina de rodadas. Puro: recebe estado, devolve estado.
 *
 * Fluxo por rodada:
 *   intro → countdown → playing → result → (próxima rodada | final)
 *
 * A rodada AVANÇA SOZINHA. Nenhuma fase espera clique — quem controla o tempo
 * são os componentes de tela (Countdown, RoundResult) chamando `nextRound`.
 */

export const PHASES = {
  INTRO: 'intro',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESULT: 'result',
  FINAL: 'final',
};

/** Se o microjogo não chamar onFinish até duration + isto, o watchdog encerra. */
export const WATCHDOG_GRACE = 4000;

/** Tempos das fases automáticas (ms). */
export const TIMING = {
  intro: 1900,
  result: 3200,
};

/** RNG da rodada: determinística a partir de (seed, round). */
export function roundRng(seed, round) {
  return createRng((seed ^ Math.imul(round, 0x9e3779b1)) >>> 0);
}

/* --------------------------------------------------------------- criar/entrar */

/**
 * Piscina efetiva de microjogos, segundo o modo da sala (§2.2 do handoff).
 * Devolve uma lista de IDS — nunca vazia:
 *   - 'unico'   → só o `soloGame` (a partida inteira é ele)
 *   - 'partida' → só os habilitados em `picked` (fallback defensivo: todos)
 * Nenhum microjogo precisa saber em que modo está; só a fila muda.
 */
export function effectiveGamePool(settings) {
  const mode = settings?.mode || 'partida';
  if (mode === 'unico') {
    const solo = settings?.soloGame && getGame(settings.soloGame) ? settings.soloGame : GAME_IDS[0];
    return [solo];
  }
  const picked = Array.isArray(settings?.picked)
    ? settings.picked.filter((id) => getGame(id))
    : [];
  return picked.length ? picked : GAME_IDS;
}

export function createMatch(room, seedOverride) {
  const seed = seedOverride ?? randomSeed();
  const rng = createRng(seed);
  const totalRounds = room?.settings?.rounds || 7;
  const pool = effectiveGamePool(room?.settings);
  const queue = buildQueue(rng, totalRounds, room?.players?.length || 2, pool);

  const base = {
    seed,
    totalRounds,
    queue,
    round: 0,
    phase: PHASES.INTRO,
    gameId: null,
    chaosEvent: null,
    effects: resolveEffects(null),
    results: null,
    records: emptyRecords(),
    history: [],
    error: null,
    skipCountdown: false,
  };

  return enterRound(base, 1);
}

/** Prepara a rodada N: escolhe o jogo da fila e sorteia o evento CHAOS. */
export function enterRound(match, round) {
  const gameId = match.queue[round - 1] || GAMES[0]?.id || null;
  const game = getGame(gameId);
  const rng = roundRng(match.seed, round);
  const chaosEvent = game ? rollChaosEvent(rng, round, game) : null;

  return {
    ...match,
    round,
    gameId,
    chaosEvent,
    effects: resolveEffects(chaosEvent),
    phase: PHASES.INTRO,
    results: null,
    error: null,
  };
}

export function isLastRound(match) {
  return match.round >= match.totalRounds;
}

/** Fim da rodada: ou vai para a próxima, ou fecha a partida. */
export function nextRound(match) {
  if (isLastRound(match)) return { ...match, phase: PHASES.FINAL, error: null };
  return enterRound(match, match.round + 1);
}

export function setPhase(match, phase) {
  return { ...match, phase };
}

/* ------------------------------------------------------------------ resultado */

/**
 * Garante exatamente uma entrada por jogador.
 * Microjogo que esquecer alguém não deixa o jogador sem pontos: ele entra por
 * último com a marcação "—". Entrada duplicada: vale a primeira.
 */
export function normalizeEntries(entries, players) {
  const list = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const clean = [];

  list.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const { playerId } = entry;
    if (!playerId || seen.has(playerId)) return;
    if (!players.some((p) => p.id === playerId)) return;
    seen.add(playerId);
    clean.push({
      ...entry,
      score: Number.isFinite(entry.score) ? entry.score : 0,
    });
  });

  const scores = clean.map((e) => e.score);
  const floor = scores.length ? Math.min(...scores) - 1 : 0;

  players.forEach((player) => {
    if (seen.has(player.id)) return;
    clean.push({ playerId: player.id, score: floor, display: '—', stat: null });
  });

  return clean;
}

/**
 * Fecha a rodada. Devolve um PATCH — o reducer costura em match + room, porque
 * pontuação vive no jogador (room) e histórico vive na partida (match).
 *
 * @returns {{results, players, records, history, winnerIds}}
 */
export function finishRound(match, players, entries) {
  const clean = normalizeEntries(entries, players);
  const resolved = resolveRound(clean, players, match.effects);

  return {
    results: resolved.results,
    players: resolved.players,
    winnerIds: resolved.winnerIds,
    records: accumulateStats(match.records, clean),
    history: [
      ...match.history,
      {
        round: match.round,
        gameId: match.gameId,
        chaosEventId: match.chaosEvent?.id || null,
        results: resolved.results,
      },
    ],
  };
}

/**
 * Rodada abortada (erro no microjogo ou watchdog).
 * Ninguém pontua e ninguém perde sequência — a rodada simplesmente não contou.
 * Registra no histórico para não sumir sem explicação.
 */
export function skipRound(match, reason = 'error') {
  return {
    ...match,
    error: reason,
    results: null,
    history: [
      ...match.history,
      {
        round: match.round,
        gameId: match.gameId,
        chaosEventId: match.chaosEvent?.id || null,
        results: [],
        skipped: reason,
      },
    ],
  };
}

/* ---------------------------------------------------------------- debug only */

/** Troca o microjogo da rodada atual (painel de debug). */
export function setGameForRound(match, gameId) {
  const game = getGame(gameId);
  if (!game) return match;

  const queue = match.queue.slice();
  queue[match.round - 1] = gameId;

  // Mantém o evento CHAOS só se o novo jogo souber lidar com ele.
  const keep = match.chaosEvent && eventsFor(game).some((e) => e.id === match.chaosEvent.id);
  const chaosEvent = keep ? match.chaosEvent : null;

  return {
    ...match,
    queue,
    gameId,
    chaosEvent,
    effects: resolveEffects(chaosEvent),
    phase: PHASES.INTRO,
    results: null,
    error: null,
  };
}

/** Força um evento CHAOS, mesmo que o jogo não o suporte (painel de debug). */
export function forceChaos(match, eventId) {
  const event = eventId ? getChaosEvent(eventId) : null;
  return { ...match, chaosEvent: event, effects: resolveEffects(event) };
}

/** Pula para uma rodada específica (painel de debug). */
export function jumpToRound(match, round) {
  const target = Math.max(1, Math.min(match.totalRounds, round));
  return enterRound(match, target);
}
