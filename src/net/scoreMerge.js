/**
 * scoreMerge — o "+ merge de scores" da F7-C, isolado e puro.
 *
 * O microjogo continua single-device: ele chama `simulateBots` e entrega
 * `onFinish([local, ...bots])` como sempre. A rede não reescreve isso. O que a
 * F7-C faz é, SÓ NO HOST, trocar a entrada FABRICADA de um adversário pela
 * entrada REAL que o celular dele reportou — antes de `finishRound` calcular a
 * colocação. Com zero convidados conectados, `take()` volta vazio e a fusão é
 * identidade: o jogo se comporta byte a byte como o de hoje.
 *
 * Duas peças, ambas sem React e sem transporte (por isso testáveis em Node):
 *   - createScoreLedger(): guarda os reportes por (round → playerId).
 *   - mergeRealScores(local, real): sobrepõe os reais sobre os fabricados.
 *
 * Formato da entrada é o mesmo em toda a base: { playerId, score, display?, stat? }.
 */

/**
 * Sobrepõe placares REAIS sobre a lista local (que veio com bots fabricados).
 *
 * Regras, todas conservadoras:
 *   - só substitui slots que EXISTEM na rodada (cast é do host; reporte de
 *     quem não está jogando esta rodada é ignorado);
 *   - `score` só entra se for número finito — senão mantém o fabricado, para um
 *     reporte corrompido nunca zerar a colocação de ninguém;
 *   - preserva a ordem da lista local (o scoreManager reordena de qualquer jeito,
 *     mas manter estável facilita ler o log);
 *   - nunca muta a lista nem as entradas de entrada.
 *
 * @param {{playerId:string,score:number,display?:string,stat?:any}[]} localEntries
 * @param {Record<string,{score?:number,display?:string,stat?:any}>} realById
 * @returns {object[]} nova lista, mesma cardinalidade da local
 */
export function mergeRealScores(localEntries, realById) {
  const list = Array.isArray(localEntries) ? localEntries : [];
  if (!realById || typeof realById !== 'object') return list.slice();

  return list.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const real = realById[entry.playerId];
    if (!real) return entry;

    const merged = { ...entry };
    if (Number.isFinite(real.score)) merged.score = real.score;
    if (real.display != null) merged.display = real.display;
    if (real.stat != null) merged.stat = real.stat;
    merged.real = true; // marca de depuração: esta cadeira foi de gente, não de bot
    return merged;
  });
}

/**
 * Livro-caixa dos reportes de convidado, indexado por rodada.
 *
 * O host grava cada reporte assim que chega; quando SUA própria rodada fecha,
 * ele `take(round)` — pega o que chegou ATÉ ALI e limpa. Fiel à filosofia da
 * casa ("a sala nunca trava esperando a rede"): o host não espera retardatário.
 * Um reporte que chega depois do RESULT fica guardado e simplesmente não é usado
 * (a rodada já fechou) — o convidado cai no placar simulado só naquela rodada.
 */
export function createScoreLedger() {
  /** @type {Map<number, Map<string, object>>} round → (playerId → payload) */
  const byRound = new Map();

  return {
    /** Grava (ou sobrescreve) o reporte de um jogador numa rodada. */
    record(round, playerId, payload) {
      if (round == null || !playerId) return;
      let slot = byRound.get(round);
      if (!slot) {
        slot = new Map();
        byRound.set(round, slot);
      }
      slot.set(playerId, {
        score: payload?.score,
        display: payload?.display ?? null,
        stat: payload?.stat ?? null,
      });
    },

    /** Devolve { playerId → payload } da rodada e a esvazia. Nunca null. */
    take(round) {
      const slot = byRound.get(round);
      if (!slot) return {};
      byRound.delete(round);
      return Object.fromEntries(slot);
    },

    /** Espia sem consumir (para debug/painel). */
    peek(round) {
      const slot = byRound.get(round);
      return slot ? Object.fromEntries(slot) : {};
    },

    /** Quantos jogadores já reportaram nesta rodada. */
    count(round) {
      return byRound.get(round)?.size ?? 0;
    },

    /** Esquece tudo (troca de partida). */
    clear() {
      byRound.clear();
    },
  };
}
