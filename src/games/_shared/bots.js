import { botPerformance, mapPerformance } from '../../engine/botProfile.js';

/**
 * Simulação dos outros jogadores.
 *
 * Enquanto não há rede (Fase 2), os adversários são simulados — mas o microjogo
 * nunca sabe disso. Ele recebe uma lista de resultados no MESMO formato que a
 * rede vai entregar depois: { playerId, score, display, stat }.
 *
 * Trocar isto por resultados vindos de outro celular é substituir a chamada,
 * não reescrever o microjogo.
 */

/**
 * Gera o resultado de cada adversário.
 *
 * @param {object[]} players     todos os jogadores da sala
 * @param {string} localPlayerId quem está no celular
 * @param {object} rng           gerador da rodada (determinístico)
 * @param {function} map         (perf 0..1, player) → { score, display?, stat? }
 * @param {number} luck          0..1 quanto de sorte pura entra
 * @returns {object[]} entradas prontas para o onFinish
 */
export function simulateBots(players, localPlayerId, rng, map, luck = 0.35) {
  return players
    .filter((player) => player.id !== localPlayerId)
    .map((player) => {
      const perf = botPerformance(player.skill, rng, luck);
      const result = map(perf, player) || {};
      return { playerId: player.id, score: 0, ...result };
    });
}

/**
 * Atalho para o caso mais comum: o desempenho vira um número num intervalo.
 *
 * @param {number} worst valor de um desempenho ruim
 * @param {number} best  valor de um desempenho ótimo
 * @param {function} shape (valor, player) → { score, display?, stat? }
 */
export function scaled(worst, best, shape) {
  return (perf, player) => shape(mapPerformance(perf, worst, best), player);
}

/**
 * Agenda ações de bot dentro de uma janela de tempo, para jogos em que o
 * adversário precisa APARECER agindo (ritmo, mira, corrida) e não só entregar
 * um número no fim.
 *
 * Devolve o cleanup — guarde e chame no useEffect.
 *
 * @param {object[]} schedule [{ atMs, run }]
 * @returns {function} cleanup
 */
export function scheduleActions(schedule) {
  const timers = schedule.map((item) => setTimeout(item.run, Math.max(0, item.atMs)));
  return () => timers.forEach(clearTimeout);
}

/**
 * Junta o resultado do jogador local com o dos adversários.
 * Ordem não importa (o scoreManager ordena), mas manter o local em primeiro
 * facilita ler o log no debug.
 */
export function withLocal(local, bots) {
  return [local, ...bots];
}

/**
 * Onde o adversário está NESTE instante, dado onde ele vai terminar.
 *
 * Serve para as barras ao vivo (RivalBars): o valor final já foi sorteado no
 * começo da rodada, aqui só se distribui esse total ao longo do tempo. Se
 * fosse linear pareceria um loading bar; a ondinha dá a impressão de que o
 * outro deu uma arrancada e depois errou umas.
 *
 * @param {number} final valor no fim da rodada
 * @param {number} ratio 0..1 quanto da rodada já passou
 * @param {number} offset defasagem por jogador, para não subirem em bloco
 */
export function paceValue(final, ratio, offset = 0) {
  const t = Math.max(0, Math.min(1, ratio));
  const wobble = 1 + 0.14 * Math.sin(t * 6.3 + offset);
  return final * Math.min(1, t * wobble);
}
