/**
 * scoreManager — pontuação. Puro, sem React, sem estado.
 *
 * Pontos por colocação: 1º 100 · 2º 75 · 3º 50 · 4º+ 25.
 * Empate divide a MESMA colocação e os MESMOS pontos (dois primeiros levam 100
 * cada, e o próximo é 3º). Perder ainda dá 25 — a spec pede que seja divertido
 * mesmo perdendo, então ninguém termina a rodada com zero.
 */

export const POINTS_BY_POSITION = [100, 75, 50, 25];
export const STREAK_BONUS_STEP = 25;
export const STREAK_BONUS_CAP = 100;

export function pointsForPosition(position) {
  return POINTS_BY_POSITION[Math.min(position, POINTS_BY_POSITION.length) - 1];
}

/**
 * Bônus por sequência de vitórias. Só a partir da 2ª consecutiva.
 * x2 → +25, x3 → +50, x4 → +75, x5+ → +100 (teto).
 */
export function streakBonus(streak) {
  if (!streak || streak < 2) return 0;
  return Math.min(STREAK_BONUS_CAP, (streak - 1) * STREAK_BONUS_STEP);
}

/**
 * Ordena por `score` (maior é melhor) e atribui colocação com empate.
 * @param {Array} entries [{playerId, score, display, stat}]
 * @returns {Array} mesmas entradas + {position}
 */
export function rankEntries(entries) {
  const sorted = entries.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  let position = 0;
  let lastScore = null;

  return sorted.map((entry, index) => {
    if (lastScore === null || (entry.score ?? 0) !== lastScore) {
      position = index + 1;
      lastScore = entry.score ?? 0;
    }
    return { ...entry, position };
  });
}

/**
 * Resolve a rodada inteira: colocação → pontos → bônus de sequência.
 *
 * @param {Array}  entries  saída do microjogo (onFinish)
 * @param {Array}  players  jogadores da sala (para ler streak atual)
 * @param {object} effects  efeitos CHAOS (usa scoreMultiplier)
 * @returns {{results:Array, players:Array, winnerIds:string[]}}
 */
export function resolveRound(entries, players, effects = {}) {
  const multiplier = effects.scoreMultiplier || 1;
  const ranked = rankEntries(entries);
  const winnerIds = ranked.filter((r) => r.position === 1).map((r) => r.playerId);

  const results = ranked.map((entry) => {
    const player = players.find((p) => p.id === entry.playerId);
    const won = entry.position === 1;
    const nextStreak = won ? (player?.streak || 0) + 1 : 0;

    const base = pointsForPosition(entry.position) * multiplier;
    const bonus = won ? streakBonus(nextStreak) : 0;

    return {
      ...entry,
      base,
      bonus,
      streak: nextStreak,
      points: base + bonus,
      multiplier,
    };
  });

  const updatedPlayers = players.map((player) => {
    const result = results.find((r) => r.playerId === player.id);
    // Quem não jogou (não devia acontecer) fica intacto, mas perde a sequência.
    if (!result) return { ...player, streak: 0 };
    return {
      ...player,
      score: (player.score || 0) + result.points,
      wins: (player.wins || 0) + (result.position === 1 ? 1 : 0),
      streak: result.streak,
    };
  });

  return { results, players: updatedPlayers, winnerIds };
}

/** Classificação geral: score desc, desempate por vitórias e depois por nome. */
export function standings(players) {
  const sorted = players.slice().sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.wins || 0) !== (a.wins || 0)) return (b.wins || 0) - (a.wins || 0);
    return a.name.localeCompare(b.name);
  });

  const out = [];
  sorted.forEach((player, index) => {
    const prev = out[index - 1];
    const tied = prev
      && (prev.score || 0) === (player.score || 0)
      && (prev.wins || 0) === (player.wins || 0);
    out.push({ ...player, position: tied ? prev.position : index + 1 });
  });
  return out;
}
