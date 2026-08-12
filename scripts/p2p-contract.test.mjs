/**
 * p2p-contract.test.mjs — prova, em Node puro, que `createP2PHub` cumpre o MESMO
 * contrato de transporte que o loopback (`net/transport.js`).
 *
 * WebRTC não roda em Node, então injetamos um PAR DE PEER FAKE (host+guest que
 * se acham por um "canal" embutido no objeto da offer) e um codec identidade.
 * O que sobra sendo testado é exatamente o que a task #19 entrega: o ADAPTADOR
 * que mapeia DataChannel → contrato de hub. A mecânica de RTCPeerConnection já
 * é provada pela P2PLab (teste de 2 abas, #18); aqui blindamos o mapeamento.
 *
 *   node scripts/p2p-contract.test.mjs
 */

import { createP2PHub } from '../src/net/p2pTransport.js';
import { PEER_EVENT } from '../src/net/webrtc/peer.js';
import * as P from '../src/net/protocol.js';

/* ── util de teste (zero-dep) ─────────────────────────────────────────────── */
let passed = 0;
const fails = [];
function ok(cond, label) {
  if (cond) {
    passed += 1;
  } else {
    fails.push(label);
    console.error('  ✗', label);
  }
}
const tick = () => new Promise((r) => setTimeout(r, 0)); // esvazia microtasks + 1 macrotask
const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

/* ── par de peer FAKE ──────────────────────────────────────────────────────
 * host cria o "canal" e o embute na offer; guest lê da offer e liga o lado dele.
 * O objeto atravessa o codec identidade intacto. Entrega é ASSÍNCRONA de
 * propósito — o contrato exige que rede nunca entregue no mesmo tick. */
function fakePeerFactory() {
  return function makePeer({ role, onEvent = () => {} }) {
    const listeners = new Set();
    const side = { listeners, onEvent };
    let ch = null; // { host: side, guest: side }
    const other = () => (role === 'host' ? ch?.guest : ch?.host);
    return {
      role,
      async createOffer() {
        ch = { host: side, guest: null };
        return { type: 'offer', __ch: ch };
      },
      async acceptOffer(offer) {
        ch = offer.__ch;
        ch.guest = side;
        queueMicrotask(() => onEvent({ type: PEER_EVENT.CHANNEL_OPEN }));
        return { type: 'answer', __ch: ch };
      },
      async acceptAnswer(answer) {
        ch = answer.__ch;
        queueMicrotask(() => onEvent({ type: PEER_EVENT.CHANNEL_OPEN }));
      },
      send(text) {
        const o = other();
        if (!o) return false;
        queueMicrotask(() => o.listeners.forEach((fn) => fn(text)));
        return true;
      },
      onMessage(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      isOpen() {
        return !!other();
      },
      close() {
        onEvent({ type: PEER_EVENT.CLOSED });
        const o = other();
        if (o) queueMicrotask(() => o.onEvent({ type: PEER_EVENT.CONN_STATE, detail: { state: 'closed' } }));
      },
      snapshot() {
        return {};
      },
    };
  };
}

/* ── o teste ──────────────────────────────────────────────────────────────── */
async function main() {
  const fake = fakePeerFactory();
  const id = (x) => x; // codec identidade: offer/answer passam intactos

  const hostHub = createP2PHub({ createPeer: fake, encodeSignal: id, decodeSignal: id });
  const guestHub = createP2PHub({ createPeer: fake, encodeSignal: id, decodeSignal: id });

  const host = hostHub.connect({ id: 'host', role: P.ROLES.HOST });
  const guest = guestHub.connect({ id: 'p2', role: P.ROLES.GUEST });

  const hostMsgs = [];
  const guestMsgs = [];
  const hostPeers = [];
  const guestPeers = [];
  host.onMessage((m, f) => hostMsgs.push({ m, f }));
  guest.onMessage((m, f) => guestMsgs.push({ m, f }));
  host.onPeer((e) => hostPeers.push(e));
  guest.onPeer((e) => guestPeers.push(e));

  // estado inicial: ninguém conectado
  ok(hostHub.hostId === 'host', 'host.hostId = seu próprio id');
  ok(guestHub.hostId === null, 'guest.hostId = null antes de conectar');
  ok(eqArr(host.peers(), []), 'host.peers() vazio no início');
  ok(eqArr(guest.peers(), []), 'guest.peers() vazio no início');

  // handshake fora de banda (o que a tela do lobby faria via QR/hash)
  const { peerId, invite } = await hostHub.signaling.createInvite();
  ok(peerId === 'g1', 'host cria vaga com peerId sintético g1');
  const answer = await guestHub.signaling.acceptInvite(invite);
  await hostHub.signaling.acceptAnswer(peerId, answer);
  await tick();

  // join dos dois lados
  ok(hostPeers.some((e) => e.type === 'join' && e.peerId === 'g1'), "host recebe onPeer join 'g1'");
  ok(guestPeers.some((e) => e.type === 'join' && e.peerId === 'host'), "guest recebe onPeer join 'host'");
  ok(eqArr(host.peers(), ['g1']), 'host.peers() = [g1] após abrir');
  ok(eqArr(guest.peers(), ['host']), 'guest.peers() = [host] após abrir');
  ok(guestHub.hostId === 'host', 'guest.hostId = host após abrir');
  ok(hostHub.size() === 2 && guestHub.size() === 2, 'size() = 2 dos dois lados (self + par)');

  // convidado → host: ação vira mensagem com fromId = peerId do convidado
  const before = hostMsgs.length;
  guest.send(P.hello({ id: 'p2', name: 'P2' }));
  guest.send(P.act('TAP', { x: 0.5, y: 0.5 }));
  ok(hostMsgs.length === before, 'entrega é ASSÍNCRONA (nada no mesmo tick)');
  await tick();
  ok(
    hostMsgs.some((x) => x.m.k === P.MSG.HELLO && x.f === 'g1'),
    "host recebe HELLO do guest com fromId 'g1'",
  );
  ok(
    hostMsgs.some((x) => x.m.k === P.MSG.ACT && x.m.a === 'TAP' && x.f === 'g1'),
    "host recebe ACT do guest com fromId 'g1'",
  );

  // host → todos: estado chega no guest com fromId = 'host'
  const gBefore = guestMsgs.length;
  const okBroadcast = host.send(P.round({ round: 1, gameId: 'slice', seed: 7 })); // to=null → broadcast
  ok(okBroadcast === true, 'host.send broadcast retorna true');
  ok(guestMsgs.length === gBefore, 'broadcast também é assíncrono');
  await tick();
  ok(
    guestMsgs.some((x) => x.m.k === P.MSG.ROUND && x.m.gameId === 'slice' && x.f === 'host'),
    "guest recebe ROUND com fromId 'host'",
  );

  // host → um peer específico (to = peerId)
  const gBefore2 = guestMsgs.length;
  host.send(P.phase('countdown'), 'g1');
  await tick();
  ok(guestMsgs.length > gBefore2 && guestMsgs.at(-1).m.k === P.MSG.PHASE, 'host.send(to=g1) entrega no peer certo');

  // fronteira de autoridade: cada papel só manda o que pode
  ok(guest.send(P.result([], null)) === false, 'guest NÃO pode enviar estado (result) → false');
  ok(guest.send(P.round({ round: 2, gameId: 'x', seed: 1 })) === false, 'guest NÃO pode enviar round → false');
  ok(host.send(P.act('TAP')) === false, 'host NÃO pode enviar ação (act) → false');
  await tick();
  ok(!hostMsgs.some((x) => x.m.k === P.MSG.RESULT), 'estado recusado do guest nunca chega ao host');

  // saída: convidado cai → host recebe leave e limpa o peer
  guestHub.close();
  await tick();
  ok(hostPeers.some((e) => e.type === 'leave' && e.peerId === 'g1'), "host recebe onPeer leave 'g1'");
  ok(eqArr(host.peers(), []), 'host.peers() volta a vazio após o guest sair');

  // encerramento do host não estoura
  hostHub.close();
  ok(host.send(P.room([], {})) === false, 'após close, send é no-op (false)');

  /* ── veredito ── */
  const total = passed + fails.length;
  if (fails.length === 0) {
    console.log(`\n✓ p2p-contract: ${passed}/${total} asserções passaram — createP2PHub cumpre o contrato.`);
    process.exit(0);
  } else {
    console.error(`\n✗ p2p-contract: ${fails.length}/${total} FALHARAM:`);
    fails.forEach((f) => console.error('   -', f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('erro no teste:', err);
  process.exit(1);
});
