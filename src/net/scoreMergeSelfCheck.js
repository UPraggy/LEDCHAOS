/**
 * scoreMergeSelfCheck — a PROVA da F7-C que roda no navegador, num clique.
 *
 * ┌─ Por que existe, além do teste de Node ────────────────────────────────────┐
 * │ `scripts/scoremerge-contract.test.mjs` prova a fusão em Node (32/32). Este  │
 * │ arquivo faz a MESMA prova dentro do bundle do Vite: sobe uma netSession de  │
 * │ host e uma de convidado sobre um loopback REAL, o convidado reporta o placar│
 * │ do próprio slot, o host arquiva no livro-caixa, funde sobre o bot fabricado │
 * │ e o resolveRound de VERDADE troca o vencedor da rodada. Mesmo espírito do   │
 * │ HubSelfCheck (prova clicável), só que para o "+ merge de scores".           │
 * │ Não precisa de dois aparelhos: mesma página, dois lados do cano.            │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Sem React, sem UI — devolve { ok, checks }. Quem chama (a P2PLab, em dev) pinta.
 */

import { createLoopbackHub } from './transport.js';
import { createNetSession } from './netSession.js';
import { createScoreLedger, mergeRealScores } from './scoreMerge.js';
import { resolveRound } from '../engine/scoreManager.js';
import { ROLES, ACT_SCORE } from './protocol.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Roda a prova ponta-a-ponta. `onStep` (opcional) alimenta a UI ao vivo.
 * @param {{ onStep?: (msg:string)=>void }} [opts]
 * @returns {Promise<{ ok:boolean, checks:{label:string, pass:boolean, note?:string}[], error?:string }>}
 */
export async function runScoreMergeSelfCheck({ onStep = () => {} } = {}) {
  const checks = [];
  const record = (label, pass, note) => {
    checks.push({ label, pass, note });
    onStep(`${pass ? '✓' : '✗'} ${label}`);
  };

  const hub = createLoopbackHub();
  const ledger = createScoreLedger();
  const busEvents = [];

  try {
    onStep('subindo host e convidado no mesmo cano…');
    const host = createNetSession({
      transport: hub.connect({ id: 'host', role: ROLES.HOST }),
      bus: { emit: (e) => busEvents.push(e) },
      handlers: { onGuestScore: (pid, payload) => ledger.record(payload?.round, pid, payload) },
    });
    const guest = createNetSession({
      transport: hub.connect({ id: 'fake-p2', role: ROLES.GUEST }),
      bus: null,
      localPlayerId: 'p2',
    });

    // 1) convidado se apresenta → host aprende fake-p2 → p2
    onStep('convidado se apresentando (HELLO)…');
    guest.hello({ id: 'p2', name: 'Gui' });
    await tick();

    // 2) convidado reporta o placar do próprio slot + uma ação normal (controle)
    onStep('convidado reportando o placar do próprio slot…');
    const sent = guest.sendScore({ round: 3, score: 999, display: '★', stat: { combo: 12 } });
    record('convidado consegue reportar (sendScore)', sent !== false);
    guest.sendAction('TAP', { x: 0.5, y: 0.5 });
    await tick();

    // 3) host arquivou o reporte com o playerId resolvido pelo PEER (não pelo payload)
    record('host arquivou 1 reporte na rodada 3', ledger.count(3) === 1, `count=${ledger.count(3)}`);
    record("reporte chega com o playerId do peer (p2) e score 999", ledger.peek(3).p2?.score === 999);
    record('stat do reporte sobrevive à serialização do cano', ledger.peek(3).p2?.stat?.combo === 12);

    // 4) SCORE não é input: NÃO entra no bus; TAP (ação normal) entra.
    record('SCORE não vaza para o action bus', !busEvents.some((e) => e.action === ACT_SCORE));
    record(
      'ação normal (TAP) ainda entra no bus como p2',
      busEvents.some((e) => e.type === 'PLAYER_ACTION' && e.action === 'TAP' && e.playerId === 'p2'),
    );

    // 5) fronteira de papel: host não reporta placar (é ação de convidado)
    record('host.sendScore → false (só convidado reporta)', host.sendScore({ round: 3, score: 1 }) === false);

    // 6) a fusão vira colocação de VERDADE: sem o reporte p2 perde; com ele, vence.
    onStep('fundindo o placar real e resolvendo a rodada…');
    const players = [
      { id: 'p1', name: 'Host', score: 0, wins: 0, streak: 0 },
      { id: 'p2', name: 'Gui', score: 0, wins: 0, streak: 0 },
    ];
    const local = [
      { playerId: 'p1', score: 500 }, // host fez muito
      { playerId: 'p2', score: 3 }, // bot fabricado p/ p2: iria em último
    ];
    const semFusao = resolveRound(local, players, {});
    record('sem fusão: p2 (bot) perde a rodada', semFusao.winnerIds[0] === 'p1');

    const merged = mergeRealScores(local, ledger.take(3));
    const comFusao = resolveRound(merged, players, {});
    record('com o placar reportado (999), p2 VENCE de verdade', comFusao.winnerIds[0] === 'p2');
    record('take consumiu a rodada 3 (host não espera retardatário)', ledger.count(3) === 0);

    guest.close();
    host.close();

    const ok = checks.every((c) => c.pass);
    return { ok, checks };
  } catch (err) {
    return { ok: false, checks, error: err?.message || String(err) };
  } finally {
    try {
      hub.close();
    } catch {
      /* noop */
    }
  }
}
