/**
 * relay — o cano de verdade do CHAOS.
 *
 * Um servidor WebSocket BOBO de propósito. Ele não sabe o que é uma rodada, um
 * ponto, um jogador. Ele só faz três coisas:
 *
 *   1. junta sockets por CÓDIGO DE SALA;
 *   2. leva a mensagem do convidado até o host daquela sala;
 *   3. leva a mensagem do host até um convidado (ou todos).
 *
 * Toda a autoridade — quem pontua, quem ganhou, qual é a fase — mora no HOST, no
 * navegador. Se este processo cair, ninguém "perde a verdade": é só o cano. Essa
 * é a razão de ele ser burro. Cano inteligente é cano que vira fonte de bug e de
 * verdade divergente.
 *
 * Autoridade de ROTEAMENTO (a única que o relay impõe):
 *   convidado → só fala com o host da sala.
 *   host      → fala com um convidado (`to`) ou com todos (broadcast).
 *   convidado → convidado: NUNCA. Eles nem se enxergam.
 *
 * Presença (espelha o loopback do cliente):
 *   convidado enxerga só o host; host enxerga todos os convidados.
 *
 * Rodar:   node server/relay.js         (porta 8787 por padrão)
 *          PORT=9000 node server/relay.js
 * LAN:     escuta em 0.0.0.0 — o celular conecta em ws://IP-DO-PC:8787
 *
 * Ver `docs/05-FASE2-MULTIPLAYER.md` §7.
 */

import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;
const HEARTBEAT_MS = 30_000;

/** code → { host: ws|null, guests: Map<id, ws> } */
const rooms = new Map();

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { host: null, guests: new Map() };
    rooms.set(code, room);
  }
  return room;
}

function dropRoomIfEmpty(code) {
  const room = rooms.get(code);
  if (room && !room.host && room.guests.size === 0) rooms.delete(code);
}

function send(ws, frame) {
  if (ws && ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      /* socket caindo: ignora */
    }
  }
}

function log(...args) {
  // Um servidor de festa vive num terminal aberto; o log é a única janela dele.
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

/* ------------------------------------------------------------------ entrada */

function handleJoin(ws, { room: code, id, role }) {
  if (!code || !id || (role !== 'host' && role !== 'guest')) {
    send(ws, { t: 'error', reason: 'join inválido' });
    return;
  }

  const room = getRoom(code);
  ws.meta = { code, id, role };

  if (role === 'host') {
    // Reconexão do mesmo host: assume a vaga. Host diferente numa sala que já
    // tem dono é recusado — duas autoridades quebrariam a partida.
    if (room.host && room.host !== ws && room.host.meta?.id !== id) {
      send(ws, { t: 'error', reason: 'a sala já tem um host' });
      return;
    }
    room.host = ws;
    // host enxerga todos os convidados presentes
    send(ws, { t: 'welcome', id, role, peers: [...room.guests.keys()] });
    // convidados que já estavam esperando: avisa que o host chegou
    room.guests.forEach((g) => send(g, { t: 'peer', kind: 'join', id }));
    log(`[${code}] host ${id} entrou (${room.guests.size} convidado(s) esperando)`);
    return;
  }

  // guest
  const previous = room.guests.get(id);
  room.guests.set(id, ws);
  // convidado só enxerga o host
  send(ws, { t: 'welcome', id, role, peers: room.host ? [room.host.meta.id] : [] });
  // host fica sabendo do convidado (novo — reconexão do mesmo id não duplica)
  if (room.host && !previous) send(room.host, { t: 'peer', kind: 'join', id });
  log(`[${code}] convidado ${id} entrou (host ${room.host ? 'presente' : 'ausente'})`);
}

function handleMsg(ws, { to, data }) {
  const meta = ws.meta;
  if (!meta) return;
  const room = rooms.get(meta.code);
  if (!room) return;

  if (meta.role === 'guest') {
    // convidado só alcança o host, aconteça o que acontecer com `to`
    send(room.host, { t: 'msg', from: meta.id, data });
    return;
  }

  // host
  if (to) {
    const g = room.guests.get(to);
    if (g) send(g, { t: 'msg', from: meta.id, data });
    return;
  }
  room.guests.forEach((g) => send(g, { t: 'msg', from: meta.id, data }));
}

function handleLeave(ws) {
  const meta = ws.meta;
  if (!meta) return;
  const room = rooms.get(meta.code);
  if (!room) return;

  if (meta.role === 'host') {
    if (room.host === ws) {
      room.host = null;
      room.guests.forEach((g) => send(g, { t: 'peer', kind: 'leave', id: meta.id }));
      log(`[${meta.code}] host ${meta.id} saiu`);
    }
  } else {
    // só remove se ainda é o socket atual daquele id (evita reconexão se auto-derrubar)
    if (room.guests.get(meta.id) === ws) {
      room.guests.delete(meta.id);
      if (room.host) send(room.host, { t: 'peer', kind: 'leave', id: meta.id });
      log(`[${meta.code}] convidado ${meta.id} saiu`);
    }
  }
  ws.meta = null;
  dropRoomIfEmpty(meta.code);
}

/* -------------------------------------------------------------------- servidor */

// HTTP mínimo só para o health check da hospedagem: o Render (e afins) faz um
// GET / e espera uma resposta viva — WebSocket puro não responderia e o serviço
// seria marcado "unhealthy". O upgrade para WS acontece no MESMO servidor/porta.
const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('CHAOS relay ok');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.meta = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return; // lixo: ignora, não derruba
    }
    if (!frame || typeof frame.t !== 'string') return;

    switch (frame.t) {
      case 'join':
        handleJoin(ws, frame);
        break;
      case 'msg':
        handleMsg(ws, frame);
        break;
      case 'bye':
        handleLeave(ws);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => handleLeave(ws));
  ws.on('error', () => {
    /* o close vem logo atrás e faz a limpeza */
  });
});

/* Heartbeat: derruba socket zumbi (celular que dormiu, wifi que caiu sem FIN). */
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* ignora */
    }
  });
}, HEARTBEAT_MS);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  log(`CHAOS relay ouvindo na porta ${PORT} (WebSocket + health HTTP em /)`);
  log('Local: aponte o app com VITE_RELAY_URL=ws://IP-DA-SUA-LAN:' + PORT);
  log('Produção: VITE_RELAY_URL=wss://SEU-SERVICO.onrender.com');
});

// Encerra limpo no Ctrl+C — sem deixar a porta presa.
function shutdown() {
  log('encerrando relay…');
  clearInterval(heartbeat);
  wss.close();
  server.close(() => process.exit(0));
  // se algum socket travar o close, força a saída
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
