import { PLAYER_COLORS, BOT_NAMES, SKILL_PRESETS } from '../data/players.js';
import { AVATAR_IDS } from '../data/avatars.js';

/**
 * Bots. Enquanto o transporte de rede não existe (Fase 2), os outros jogadores
 * são simulados — mas com a MESMA forma de dado de um humano, então trocar
 * simulação por rede depois não mexe em nenhum microjogo.
 *
 * `skill` ∈ 0..1. É a única alavanca: cada microjogo traduz skill no seu
 * próprio número (ms de reação, altura, precisão…) via botPerformance().
 */

/** Sorteia skill dentro do preset (EASY/MEDIUM/HARD). */
export function rollSkill(preset, rng) {
  const p = SKILL_PRESETS[preset] || SKILL_PRESETS.MEDIUM;
  return Number(rng.range(p.min, p.max).toFixed(3));
}

/**
 * Cria um bot para o slot `index` (0-based; slot 0 é sempre o humano).
 * @param {number} index      posição no array de jogadores
 * @param {string} preset     EASY|MEDIUM|HARD
 * @param {object} rng
 * @param {string[]} usedNames nomes já em uso
 */
export function makeBot(index, preset, rng, usedNames = []) {
  const pool = BOT_NAMES.filter((n) => !usedNames.includes(n));
  const name = rng.pick(pool.length ? pool : BOT_NAMES);
  return {
    id: `p${index + 1}`,
    name,
    avatar: AVATAR_IDS[index % AVATAR_IDS.length],
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    skill: rollSkill(preset, rng),
    isBot: true,
    score: 0,
    wins: 0,
    streak: 0,
    ready: true,
  };
}

/**
 * Desempenho do bot NESTA rodada, em 0..1 (0 = péssimo, 1 = perfeito).
 * Skill puxa a média; a variância é maior para skill baixa — bot ruim é
 * imprevisível, bot bom é consistente. Nunca 0 nem 1 exatos: sempre há chance.
 *
 * @param {number} skill 0..1
 * @param {object} rng
 * @param {number} luck  0..1 quanto de sorte pura entra (default 0.35)
 */
export function botPerformance(skill, rng, luck = 0.35) {
  const s = Math.max(0, Math.min(1, skill ?? 0.5));
  const consistency = 0.35 + s * 0.5; // bom = consistente
  const noise = rng.jitter((1 - consistency) * luck * 2);
  const value = s * (1 - luck) + rng() * luck + noise;
  return Math.max(0.03, Math.min(0.99, value));
}

/**
 * Mapeia desempenho para um valor no intervalo do microjogo.
 * @param {number} perf 0..1
 * @param {number} worst valor de um desempenho ruim
 * @param {number} best  valor de um desempenho ótimo
 */
export function mapPerformance(perf, worst, best) {
  return worst + (best - worst) * perf;
}

/**
 * Sorteia o instante (ms) em que um bot "agiria" dentro de uma janela.
 * Usado por jogos de reação/ritmo/aim para agendar ações plausíveis.
 */
export function botDelay(skill, rng, fastMs, slowMs) {
  return mapPerformance(botPerformance(skill, rng), slowMs, fastMs);
}
