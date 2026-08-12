/**
 * scoremerge-contract.test.mjs — prova, em Node puro, o "+ merge de scores" da
 * F7-C: o host troca o adversário FABRICADO pelo placar REAL que o celular dele
 * reportou, e a COLOCAÇÃO da rodada muda por causa disso.
 *
 * Três camadas, da mais pura à ponta-a-ponta:
 *   1. mergeRealScores / createScoreLedger  — semântica pura, sem rede.
 *   2. resolveRound REAL                     — a fusão vira colocação de verdade
 *                                              (winner troca de bot para gente).
 *   3. netSession sobre loopback REAL        — o convidado dá sendScore, o cano
 *                                              entrega assíncrono, o host resolve
 *                                              o playerId pelo peer e arquiva.
 *
 * Não importa roundManager/gameRegistry de propósito: aquilo puxa os 12
 * microjogos em JSX, que o Node não parseia. resolveRound (scoreManager) é puro
 * e é o que decide a pontuação — é ele que precisa refletir a fusão.
 *
 *   node scripts/scoremerge-contract.test.mjs
 */

import { mergeRealScores, createScoreLedger } from '../src/net/scoreMerge.js';
import { resolveRound } from '../src/engine/scoreManager.js';
import { createLoopbackHub } from '../src/net/transport.js';
import { createNetSession } from '../src/net/netSession.js';
import { ROLES, MSG, ACT_SCORE } from '../src/net/protocol.js';

/* ── util de teste (zero-dep) ─────────────────────────────────────────────── */
let passed = 0;
const fails = [];
function ok(cond, label) {
  if (cond) passed += 1;
  else {
    fails.push(label);
    console.error('  ✗', label);
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ── 1) mergeRealScores — semântica pura ──────────────────────────────────── */
{
  const local = [
    { playerId: 'p1', score: 30, display: '30' }, // host (real)
    { playerId: 'p2', score: 10, display: 'bot' }, // bot fabricado
    { playerId: 'p3', score: 50, display: 'bot' }, // bot fabricado
  ];

  ok(mergeRealScores(local, null).length === 3, 'realById null → identidade (mesma cardinalidade)');
  ok(mergeRealScores(local, {})[1].score === 10, 'realById vazio → não toca no fabricado');

  const merged = mergeRealScores(local, { p2: { score: 88, display: '★', stat: { hits: 9 } } });
  ok(merged.length === 3, 'cardinalidade preservada na fusão');
  ok(merged[1].score === 88 && merged[1].display === '★', 'placar real sobrepõe o do bot (score+display)');
  ok(merged[1].stat?.hits === 9, 'stat real também entra');
  ok(merged[1].real === true, 'cadeira fundida é marcada real:true');
  ok(merged[0].score === 30 && merged[2].score === 50, 'slots sem reporte ficam intactos');

  ok(local[1].score === 10, 'entrada original NÃO é mutada (imutável)');

  const ghost = mergeRealScores(local, { pX: { score: 999 } });
  ok(ghost.length === 3 && ghost.every((e) => e.score !== 999), 'reporte de quem não está na rodada é ignorado');

  const bad = mergeRealScores(local, { p2: { score: NaN } });
  ok(bad[1].score === 10, 'score não-finito é recusado (mantém o fabricado)');
  const noScore = mergeRealScores(local, { p2: { display: 'só texto' } });
  ok(noScore[1].score === 10 && noScore[1].display === 'só texto', 'reporte sem score troca só o display');
}

/* ── 2) createScoreLedger — livro-caixa por rodada ────────────────────────── */
{
  const led = createScoreLedger();
  ok(Object.keys(led.take(1)).length === 0, 'take de rodada vazia → {}');

  led.record(3, 'p2', { round: 3, score: 42, display: '42' });
  led.record(3, 'p3', { round: 3, score: 7 });
  ok(led.count(3) === 2, 'count reflete os reportes gravados');
  ok(led.peek(3).p2.score === 42, 'peek lê sem consumir');
  ok(led.count(3) === 2, 'peek não esvazia');

  const taken = led.take(3);
  ok(taken.p2.score === 42 && taken.p3.score === 7, 'take devolve todos da rodada');
  ok(led.count(3) === 0, 'take esvazia a rodada');

  led.record(4, 'p2', { round: 4, score: 1 });
  led.clear();
  ok(led.count(4) === 0, 'clear zera tudo');
}

/* ── 3) integração com resolveRound — a colocação MUDA ────────────────────── */
{
  const players = [
    { id: 'p1', name: 'Host', score: 0, wins: 0, streak: 0 },
    { id: 'p2', name: 'Gui', score: 0, wins: 0, streak: 0 },
    { id: 'p3', name: 'Ana', score: 0, wins: 0, streak: 0 },
  ];
  // Rodada como o microjogo entrega no HOST: p1 real no meio, p2/p3 bots.
  const local = [
    { playerId: 'p1', score: 40 },
    { playerId: 'p2', score: 5 }, // bot fabricado: p2 iria em último
    { playerId: 'p3', score: 60 },
  ];

  const semFusao = resolveRound(local, players, {});
  ok(!semFusao.winnerIds.includes('p2'), 'sem fusão: p2 (bot) NÃO vence');
  const p2Antes = semFusao.results.find((r) => r.playerId === 'p2');
  // POINTS_BY_POSITION = [100,75,50,25]: com 3 jogadores o último é 3º e leva 50.
  ok(p2Antes.position === 3 && p2Antes.points === 50, 'sem fusão: p2 é 3º (último), leva 50');

  // p2 é um celular de verdade e mandou 95: agora ele ganha a rodada.
  const merged = mergeRealScores(local, { p2: { score: 95, display: '95' } });
  const comFusao = resolveRound(merged, players, {});
  ok(comFusao.winnerIds.length === 1 && comFusao.winnerIds[0] === 'p2', 'com fusão: p2 (real) VENCE');
  const p2Depois = comFusao.results.find((r) => r.playerId === 'p2');
  ok(p2Depois.position === 1 && p2Depois.points === 100, 'com fusão: p2 é 1º, leva 100');
  const p3Depois = comFusao.results.find((r) => r.playerId === 'p3');
  ok(p3Depois.position === 2, 'com fusão: p3 cai para 2º');
}

/* ── 4) ponta-a-ponta sobre o loopback REAL ───────────────────────────────── */
async function e2e() {
  const hub = createLoopbackHub();
  const ledger = createScoreLedger();
  const busEvents = [];

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

  // convidado se apresenta (host aprende fake-p2 → p2) e depois reporta o placar
  guest.hello({ id: 'p2', name: 'Gui' });
  await tick();

  const sent = guest.sendScore({ round: 3, score: 999, display: '★', stat: { combo: 12 } });
  ok(sent !== false, 'guest.sendScore envia (convidado pode)');
  guest.sendAction('TAP', { x: 0.5, y: 0.5 }); // ação normal, controle
  await tick();

  // o reporte foi para o livro, com o playerId resolvido pelo PEER (não pelo payload)
  ok(ledger.count(3) === 1, 'host arquivou 1 reporte na rodada 3');
  ok(ledger.peek(3).p2?.score === 999, 'reporte chega com o playerId certo (p2) e score 999');
  ok(ledger.peek(3).p2?.stat?.combo === 12, 'stat do reporte sobrevive ao JSON do cano');

  // SCORE não é input: NÃO entrou no bus. TAP (ação normal) entrou.
  ok(!busEvents.some((e) => e.action === ACT_SCORE), 'SCORE não vaza para o action bus');
  ok(busEvents.some((e) => e.type === 'PLAYER_ACTION' && e.action === 'TAP' && e.playerId === 'p2'),
    'ação normal (TAP) ainda entra no bus como p2');

  // host não pode reportar placar (é ação de convidado)
  ok(host.sendScore({ round: 3, score: 1 }) === false, 'host.sendScore → false (só convidado reporta)');

  // e o reporte real fecha o ciclo: fundido, muda a rodada
  const players = [
    { id: 'p1', name: 'Host', score: 0, wins: 0, streak: 0 },
    { id: 'p2', name: 'Gui', score: 0, wins: 0, streak: 0 },
  ];
  const local = [{ playerId: 'p1', score: 500 }, { playerId: 'p2', score: 3 }];
  const merged = mergeRealScores(local, ledger.take(3));
  ok(resolveRound(merged, players, {}).winnerIds[0] === 'p2', 'placar reportado (999) faz p2 vencer de verdade');
  ok(ledger.count(3) === 0, 'take consumiu a rodada 3');

  guest.close();
  host.close();
  hub.close();
}

/* ── veredito ─────────────────────────────────────────────────────────────── */
e2e()
  .then(() => {
    const total = passed + fails.length;
    if (fails.length === 0) {
      console.log(`\n✓ scoremerge-contract: ${passed}/${total} asserções passaram — a fusão de placares (F7-C) cumpre o contrato.`);
      process.exit(0);
    } else {
      console.error(`\n✗ scoremerge-contract: ${fails.length}/${total} FALHARAM:`);
      fails.forEach((f) => console.error('   -', f));
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('erro no teste:', err);
    process.exit(1);
  });
