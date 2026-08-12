/**
 * p2pSelfCheck — a PROVA que roda no navegador: dois `createP2PHub` REAIS,
 * com `webrtc/peer.js` e `signal/codec.js` de verdade, conectando um ao outro
 * na MESMA página por loopback de WebRTC.
 *
 * ┌─ Por que existe, além do teste de Node ────────────────────────────────────┐
 * │ `scripts/p2p-contract.test.mjs` prova o MAPEAMENTO do adaptador com peers   │
 * │ fake (25/25) — exaustivo, mas não toca no RTCPeerConnection. Este arquivo   │
 * │ fecha o buraco: EXECUTA o adaptador sobre DataChannel de verdade, exercendo │
 * │ o codec real (deflate/base64url) e o handshake offer/answer não-trickle.    │
 * │ É o mesmo espírito da P2PLab (prova clicável), só que para o HUB, não para  │
 * │ um par solto. Não precisa de dois aparelhos: mesma página, dois hubs.       │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Não depende de React nem de UI — devolve um relatório { ok, checks }. Quem
 * chama (a P2PLab, em dev) só pinta o resultado. O wiring de GameProvider com
 * vários convidados é outra tarefa (F7-C); aqui é só a prova do transporte.
 */

import { createP2PHub } from './p2pTransport.js';
import * as P from './protocol.js';

/** Espera uma condição virar verdadeira, ou estoura no timeout. */
function waitFor(cond, { timeout = 6000, every = 30, label = 'condição' } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let done = false;
      try {
        done = cond();
      } catch (err) {
        return reject(err);
      }
      if (done) return resolve();
      if (Date.now() - t0 > timeout) return reject(new Error(`timeout esperando: ${label}`));
      setTimeout(tick, every);
    };
    tick();
  });
}

/**
 * Roda a prova ponta-a-ponta. `onStep` (opcional) recebe cada marco para a UI
 * mostrar progresso ao vivo. Sempre encerra os dois hubs no fim (mesmo se falhar).
 *
 * @param {{ onStep?: (msg:string)=>void }} [opts]
 * @returns {Promise<{ ok:boolean, checks:{label:string, pass:boolean, note?:string}[], error?:string }>}
 */
export async function runP2PSelfCheck({ onStep = () => {} } = {}) {
  const checks = [];
  const record = (label, pass, note) => {
    checks.push({ label, pass, note });
    onStep(`${pass ? '✓' : '✗'} ${label}`);
  };

  // Dois hubs REAIS: sem injeção, então usa peer.js + codec.js de produção.
  const hostHub = createP2PHub();
  const guestHub = createP2PHub();

  try {
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

    // 1) handshake por signaling real (offer → answer), como o lobby faria por QR.
    onStep('gerando convite (offer + ICE)…');
    const { peerId, invite } = await hostHub.signaling.createInvite();
    record('host gera convite com peerId sintético', peerId === 'g1', peerId);
    record('convite é texto de QR/hash (codec real)', typeof invite === 'string' && invite.length > 0);

    onStep('convidado aceitando o convite (answer + ICE)…');
    const answer = await guestHub.signaling.acceptInvite(invite);
    record('convidado devolve resposta (texto)', typeof answer === 'string' && answer.length > 0);

    onStep('host colando a resposta…');
    await hostHub.signaling.acceptAnswer(peerId, answer);

    // 2) o DataChannel abre dos dois lados (isto é o WebRTC de verdade subindo).
    onStep('abrindo o DataChannel direto…');
    await waitFor(() => host.peers().length === 1 && guest.peers().length === 1, {
      label: 'canal aberto nos dois lados',
    });
    record('host vê o convidado (join g1)', hostPeers.some((e) => e.type === 'join' && e.peerId === 'g1'));
    record('convidado vê o host (join host)', guestPeers.some((e) => e.type === 'join' && e.peerId === 'host'));
    record('size()=2 nos dois hubs', hostHub.size() === 2 && guestHub.size() === 2);

    // 3) convidado → host: ação real cruza o canal e chega com fromId correto.
    onStep('convidado enviando HELLO + AÇÃO…');
    guest.send(P.hello({ id: 'p2', name: 'P2' }));
    guest.send(P.act('TAP', { x: 0.5, y: 0.5 }));
    await waitFor(() => hostMsgs.some((x) => x.m.k === P.MSG.ACT), { label: 'host recebe a ação' });
    record(
      "host recebe HELLO do convidado (fromId 'g1')",
      hostMsgs.some((x) => x.m.k === P.MSG.HELLO && x.f === 'g1'),
    );
    record(
      "host recebe AÇÃO do convidado (fromId 'g1')",
      hostMsgs.some((x) => x.m.k === P.MSG.ACT && x.m.a === 'TAP' && x.f === 'g1'),
    );

    // 4) host → todos: estado real cruza o canal e chega com fromId = 'host'.
    onStep('host transmitindo o estado (ROUND)…');
    const bcast = host.send(P.round({ round: 1, gameId: 'slice', seed: 7 }));
    record('host.send broadcast retorna true', bcast === true);
    await waitFor(() => guestMsgs.some((x) => x.m.k === P.MSG.ROUND), { label: 'convidado recebe o estado' });
    record(
      "convidado recebe ROUND (fromId 'host')",
      guestMsgs.some((x) => x.m.k === P.MSG.ROUND && x.m.gameId === 'slice' && x.f === 'host'),
    );

    // 5) fronteira de autoridade sobrevive ao cano real: convidado não manda estado.
    record('convidado NÃO envia estado (round) → false', guest.send(P.round({ round: 2, gameId: 'x', seed: 1 })) === false);
    record('host NÃO envia ação (act) → false', host.send(P.act('TAP')) === false);

    // 6) saída limpa: convidado cai → host recebe leave e limpa o peer.
    onStep('convidado encerrando…');
    guestHub.close();
    await waitFor(() => hostPeers.some((e) => e.type === 'leave' && e.peerId === 'g1'), {
      label: 'host detecta a saída',
      timeout: 8000,
    });
    record("host recebe leave 'g1' quando o convidado cai", true);
    record('host.peers() volta a vazio', host.peers().length === 0);

    const ok = checks.every((c) => c.pass);
    return { ok, checks };
  } catch (err) {
    return { ok: false, checks, error: err?.message || String(err) };
  } finally {
    try {
      hostHub.close();
    } catch {
      /* noop */
    }
    try {
      guestHub.close();
    } catch {
      /* noop */
    }
  }
}
