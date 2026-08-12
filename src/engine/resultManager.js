/**
 * resultManager — memória da partida.
 *
 * Cada microjogo pode devolver `stat` em onFinish. Aqui guardamos só o RECORDE
 * de cada métrica ao longo da partida, e no final viram as conquistas da tela
 * de resultado. O microjogo não sabe nada disso: ele só reporta um número.
 *
 * Para adicionar uma conquista nova: registre a chave em STAT_RULES.
 */

export const STAT_RULES = {
  reactionMs: { dir: 'min', emoji: '⚡', label: 'REFLEXO MAIS RÁPIDO', format: (v) => `${Math.round(v)}ms` },
  artistScore: { dir: 'max', emoji: '🎨', label: 'MELHOR ARTISTA', format: (v) => `${Math.round(v)} pts` },
  climbHeight: { dir: 'max', emoji: '🧗', label: 'SUBIU MAIS ALTO', format: (v) => `${Math.round(v)}m` },
  accuracy: { dir: 'max', emoji: '🎯', label: 'MELHOR PRECISÃO', format: (v) => `${Math.round(v)}%` },
  combo: { dir: 'max', emoji: '🎵', label: 'MAIOR COMBO', format: (v) => `x${Math.round(v)}` },
  taps: { dir: 'max', emoji: '👆', label: 'MAIS TOQUES', format: (v) => `${Math.round(v)}` },
};

export function emptyRecords() {
  return {};
}

/**
 * Atualiza os recordes com as stats de uma rodada.
 * @param {object} records  acumulado atual { [statKey]: {playerId, value} }
 * @param {Array}  entries  resultados da rodada (com .stat opcional)
 */
export function accumulateStats(records, entries) {
  const next = { ...records };

  entries.forEach((entry) => {
    const stat = entry.stat;
    if (!stat) return;

    Object.keys(stat).forEach((key) => {
      const rule = STAT_RULES[key];
      const value = stat[key];
      if (!rule || typeof value !== 'number' || !Number.isFinite(value)) return;

      const current = next[key];
      const better = !current
        || (rule.dir === 'min' ? value < current.value : value > current.value);
      if (better) next[key] = { playerId: entry.playerId, value };
    });
  });

  return next;
}

/**
 * Conquistas da tela final. Só entra o que realmente aconteceu na partida —
 * nada de card vazio "sem dados".
 * @returns {Array} [{id, emoji, label, value, playerId, player}]
 */
export function buildAchievements(records, players) {
  return Object.keys(STAT_RULES)
    .filter((key) => records[key])
    .map((key) => {
      const rule = STAT_RULES[key];
      const record = records[key];
      return {
        id: key,
        emoji: rule.emoji,
        label: rule.label,
        value: rule.format(record.value),
        playerId: record.playerId,
        player: players.find((p) => p.id === record.playerId) || null,
      };
    })
    .filter((a) => a.player);
}

/**
 * A maior sequência de vitórias da partida, lida do histórico de rodadas.
 * Vira a conquista 🔥 MAIOR SEQUÊNCIA.
 */
export function longestStreak(history, players) {
  const best = { playerId: null, value: 0 };
  history.forEach((round) => {
    (round.results || []).forEach((r) => {
      if ((r.streak || 0) > best.value) {
        best.value = r.streak;
        best.playerId = r.playerId;
      }
    });
  });

  if (!best.playerId || best.value < 2) return null;
  return {
    id: 'streak',
    emoji: '🔥',
    label: 'MAIOR SEQUÊNCIA',
    value: `x${best.value}`,
    playerId: best.playerId,
    player: players.find((p) => p.id === best.playerId) || null,
  };
}

/** Todas as conquistas juntas, prontas para a tela final. */
export function allAchievements(records, history, players) {
  const list = buildAchievements(records, players);
  const streak = longestStreak(history, players);
  if (streak && streak.player) list.push(streak);
  return list;
}
