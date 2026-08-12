# 05 — FASE 2: MULTIPLAYER REAL

> **Estado, 2026-08-11 — o cano de verdade está no ar.**
>
> | Etapa | Status |
> |---|---|
> | **F7-A — protocolo + transporte + loopback** (`src/net/`) | ✅ **no código**, ver §8 |
> | **F7-B — transporte real (relay WebSocket) + presença + companion** | ✅ **no código**, ver §9 |
> | **F7-C — cada celular joga o próprio slot (merge de scores no host)** | ⛔ **pendente** — o único marco que falta, ver §9 |
>
> A F7-B trocou a rota "sinalização + WebRTC" (§3) por um **relay WebSocket burro** — mais simples,
> chega ao mesmo lugar para um jogo de sala e é exatamente a opção "recomendada" da tabela do §3,
> só que roteando mensagens de jogo em vez de SDP/ICE. Continua **cumprida à risca** a regra que
> importa: o relay **não guarda estado de jogo** e **não pontua** (§7). Tudo é **opt-in** por
> `VITE_RELAY_URL` — sem a env, o CHAOS roda idêntico à Fase 1 (host + bots, um aparelho só).
>
> O que a F7-B entrega de real: transporte WebSocket, relay LAN, **presença** (o convidado entra no
> lugar de um bot; se cair, a cadeira volta a ser bot) e **companion ao vivo** (`/live/:code` espelha
> a partida no celular do convidado). O que **ainda não** é real: o convidado controlar o próprio
> slot DENTRO do microjogo — os 12 microjogos são single-device e o host simula os outros slots. Esse
> é o marco F7-C, honestamente separado em §9 (não dá para testar sem 2 aparelhos).
>
> Se você é a IA/pessoa que vai implementar a F7-C: leia `01-ARQUITETURA.md` §1 e §2, depois §8 e
> §9 deste arquivo, e só então §2–§4.

---

## 1) O que já está pronto para a rede (as costuras)

O MVP foi construído com quatro decisões que só fazem sentido pensando na Fase 2. Elas já estão
no código, funcionando, sem custo:

| Costura | Onde | Por que importa na rede |
|---|---|---|
| **Action bus** | `engine/inputManager.js` | O microjogo nunca escuta o dedo. Ele escuta ações normalizadas. Injetar `{playerId:'p3', action:'TAP'}` vindo de um `RTCDataChannel` é idêntico a injetar do ponteiro local. |
| **RNG determinístico com semente** | `engine/random.js` + `roundRng(seed, round)` | Mesma `seed` + mesma rodada = mesmo mundo em todos os aparelhos. Não é preciso transmitir onde nasce cada obstáculo. |
| **Entrada contínua amostrada, não transmitida** | `_shared/joystick.js` | O loop lê a posição *atual* do dedo. Vira 15 amostras/s na rede em vez de 120 eventos/s — é a diferença entre caber e não caber num data channel. |
| **Resultado como lista, não como estado** | `onFinish(entries)` | A rodada termina com um array pequeno e serializável. É exatamente o que o host precisa mandar de volta. |

**Consequência prática:** o transporte entra por baixo do bus. Os 12 microjogos não sabem que
existe rede — hoje, nem depois.

## 2) Modelo: host-autoritativo

Um jogador é o **host** (quem criou a sala). Ele roda a única cópia que vale da máquina de fases.

```text
   celular do host                          celular do convidado
 ┌──────────────────────┐                 ┌──────────────────────┐
 │ GameProvider (dono)  │                 │ GameProvider (espelho)│
 │ roundManager ────────┼── estado ──────►│ (só aplica o que      │
 │ scoreManager         │                 │  chega, não decide)   │
 │        ▲             │◄── ações ───────┼──── inputManager      │
 │   inputManager       │                 │        ▲              │
 └────────┼─────────────┘                 └────────┼──────────────┘
       dedo do host                            dedo do convidado
```

- **Convidado** manda ação, recebe estado. Não sorteia jogo, não decide chaos event, não pontua.
- **Host** é a autoridade. Se ele cair, a partida cai — aceitável para um jogo de festa
  presencial de 5 minutos; migração de host é v3, não v2.
- **Simulação local otimista** do próprio jogador (o boneco anda no dedo, sem esperar o host).
  Só o placar é autoritativo. Ninguém tolera 80ms de latência no próprio toque; todo mundo
  tolera o placar aparecer 80ms depois.

## 3) Sinalização — o problema real

WebRTC precisa trocar SDP/ICE **antes** de conectar, e isso não acontece por telepatia. As opções,
com o custo honesto de cada uma:

| Opção | Servidor? | Custo | Veredito |
|---|---|---|---|
| Sinalização manual (colar SDP no QR/link) | não | SDP não cabe confortavelmente num QR; UX péssima com 8 jogadores | descartado |
| Servidor de sinalização mínimo (~80 linhas, WebSocket) | sim, mas efêmero | um processo Node barato; **não** guarda estado de jogo | **recomendado** |
| PeerJS / Firebase / serviço pronto | terceiro | rápido de subir, mas cria dependência externa e conta paga | evitar |

O servidor de sinalização **não é backend de jogo**: ele encaminha SDP/ICE por `roomId` e esquece.
Zero regra de jogo do lado dele — se ele virar autoridade, a Fase 2 falhou.

**A sala já está pronta para isso.** `room/roomCode.js` gera o ID, `roomLink.js` gera a URL e o
QR já aponta para `/join/:roomId`. O que falta é o canal, não a identidade.

## 4) Protocolo (esboço)

Mensagens pequenas, JSON, sem versionar cedo demais. Campo `t` = `performance.now()` do emissor.

**Convidado → host**

```js
{ k:'act', a:'TAP', p:{x:0.5,y:0.3}, t:12345 }   // ação normalizada (mesmo formato do bus local)
{ k:'ping', t:12345 }
```

**Host → todos**

```js
{ k:'room',  players:[…], settings:{rounds:7} }             // lobby mudou
{ k:'round', round:3, gameId:'race', chaos:'INVERTED', seed:918273 }  // começa rodada
{ k:'phase', phase:'playing' }                              // avanço da máquina de fases
{ k:'result', entries:[…], standings:[…] }                  // fim da rodada
{ k:'final', achievements:[…] }
```

Note o que **não** está aqui: posição de obstáculo, spawn, física. Isso tudo sai do
`roundRng(seed, round)` — cada aparelho reconstrói o mesmo mundo sozinho.

## 5) Ordem de implementação

1. ✅ `net/transport.js` — contrato abstrato + `createLoopbackHub()` (fake, tudo num aparelho só).
   Feito primeiro de propósito: permite testar a arquitetura inteira sem servidor nenhum.
2. ✅ Transporte real — trocamos WebRTC por **relay WebSocket** (`net/wsTransport.js` +
   `server/relay.js`). Mesmo contrato do loopback; ver §9.
3. ⛔ `net/peer.js` — `RTCPeerConnection` + `RTCDataChannel` P2P. **Dispensado por ora**: o relay
   resolve LAN presencial sem STUN/TURN. Fica para v3 se a latência do relay incomodar.
4. ✅ Ligar o transport ao `GameProvider` — o host já anuncia sala, rodada, fase e resultado, e
   faz o "upgrade" loopback→relay quando `VITE_RELAY_URL` existe (§9).
5. ✅ Ligar ao bus: mensagem `act` que chega vira `bus.emit(...)` — a ponte existe
   (`netSession.handleAct`). ⚠️ Mas os microjogos ainda **não consomem** esse input remoto (F7-C).
6. ✅ Convidado aplica o que o host manda sem tocar no reducer da partida — é o companion
   `useGuestLink` + `LiveGuest` (`/live/:code`), que assina `onRoom/onRound/onPhase/onResult/onFinal`
   e só espelha. O host é a única autoridade.
7. ✅ Bot vira humano quando alguém entra e volta a bot se cair (`roomManager.joinGuest/guestLeave`
   + actions `ROOM_GUEST_JOIN/LEAVE`; a vaga é a mesma, o `Player.isBot` alterna).

## 6) Armadilhas conhecidas

- **Não** transmita a posição do dedo a cada evento de ponteiro. Amostre no loop (§1).
- **Não** deixe o convidado calcular pontos. Duas máquinas somando pontos = duas verdades.
- **Não** confie no relógio do convidado. `t` serve para ordenar e medir latência, não para julgar
  quem tocou primeiro — quem julga é o host, com o relógio dele.
- **Não** mande o estado inteiro a 60Hz. Estado só muda em transição de fase; entre elas o que
  viaja é ação (pouco) e o mundo é reconstruído por `seed` (nada).
- **Watchdog continua obrigatório.** Hoje ele cobre microjogo travado; na Fase 2 passa a cobrer
  também convidado que sumiu no meio da rodada. `WATCHDOG_GRACE` provavelmente precisa subir.
- **Reconexão:** o `localStorage` (`chaos.room.v1`) já guarda sala e jogador. Voltar para a mesma
  sala depois de um refresh é um caso a tratar, não a inventar do zero.

## 7) O que NÃO fazer

Nada nesta Fase 2 justifica: banco de dados, autenticação, conta de usuário, matchmaking público
ou lobby global. CHAOS é um jogo de sala — as pessoas estão no mesmo sofá, o QR Code na tela de
alguém é a autenticação. Se aparecer login, o projeto virou outra coisa.

---

## 8) F7-A — o que já está no código (`src/net/`)

Três arquivos, ~430 linhas, **zero rede**. Verificados por 19 asserções em teste de fumaça e
exercitados no app rodando.

| Arquivo | Responsabilidade | Não faz |
|---|---|---|
| `protocol.js` | vocabulário (`MSG`), construtores, `encode/decode`, **`allowedFrom()`** | não conhece transporte |
| `transport.js` | o *contrato* do cano + `createLoopbackHub()` (memória, latência/jitter/perda simuláveis) | não conhece jogo |
| `netSession.js` | a ponte: `act` que chega vira `bus.emit(...)`; host expõe `broadcast*` | não conhece React |

### A fronteira de autoridade é código, não convenção

`allowedFrom(papel, tipo)` divide as mensagens em duas listas fechadas: convidado só manda
`hello/bye/act/ping`, host só manda `room/round/phase/result/final/pong`. A checagem roda **duas
vezes** — ao enviar (`transport.send`) e ao receber (`netSession.onMessage`) — porque na F7-B o
emissor deixa de ser confiável. Um convidado que tente mandar `result` é descartado com warn.
É o §6 ("não deixe o convidado calcular pontos") transformado em invariante.

### Decisões que parecem detalhe e não são

- **Entrega é sempre assíncrona, mesmo com latência 0** (`queueMicrotask`). Canal de rede nunca
  entrega no mesmo tick; se o código de cima puder depender disso, quebra no dia da troca.
- **Tudo passa por `JSON.stringify` de verdade**, inclusive no loopback. É o que pega payload
  cíclico/não-serializável agora, em vez de na primeira conexão real.
- **O carimbo `t` do convidado nunca é usado para julgar.** `handleAct` reescreve com o relógio do
  host. Relógio de convidado ordena e mede latência; quem julga é o host.
- **`hub.close()` limpa os timers pendentes.** Regra 4 do repo vale para a rede também.

### Como o host anuncia

`GameProvider` tem quatro efeitos que fazem broadcast quando o estado muda: sala, rodada
(`round + gameId + chaos + seed`), fase e resultado. Com zero convidados é no-op — mas o caminho
é exercitado a cada partida, então não apodrece. **O mundo não viaja:** só a `seed` vai, e cada
aparelho reconstrói a rodada com `roundRng(seed, round)`.

### Testar um "segundo aparelho" sem rede (só em `npm run dev`)

`window.__chaosNet` existe apenas em dev — **não entra no bundle de produção** (conferido:
0 ocorrências em `dist/`). No console do navegador:

```js
const g = __chaosNet.guest('p2');          // convidado fake entra no hub
__chaosNet.bus.on(console.log);            // escuta o action bus real do app
g.sendAction('TAP', { x: .5, y: .5 });     // → {playerId:'p2', action:'TAP', remote:true}
g.close();
```

É assim que se desenvolve a F7-B antes de existir transporte. Para simular rede ruim, o hub
aceita `{ latency, jitter, loss }` — troque a construção no `GameProvider`.

### O que falta para o multiplayer ser real

Só a F7-C (§9). **Nenhum microjogo é afetado pelo que já foi feito.**

---

## 9) F7-B — o cano real, a presença e o companion (`src/net/` + `server/`)

A F7-B pegou o contrato da F7-A e plugou um transporte de verdade **sem tocar nos 12 microjogos**.
Tudo é **opt-in**: `VITE_RELAY_URL` ausente = Fase 1 idêntica.

### Peças

| Arquivo | Papel | Não faz |
|---|---|---|
| `server/relay.js` | relay WebSocket LAN (porta 8787). Encaminha `{t:'msg'}` por código de sala; anuncia join/leave | não conhece regra de jogo, não pontua, não guarda partida |
| `net/wsTransport.js` | `createRelayHub({url,code})` — **mesmo contrato** do loopback (`connect/close/hostId/size`), com fila de saída, reconexão com backoff+jitter | não conhece React nem jogo |
| `net/useGuestLink.js` | hook do CONVIDADO: abre o hub como GUEST, faz `hello()`, espelha `room/round/phase/result/final/pong` no React | não despacha no reducer da partida |
| `screens/LiveGuest/` | a tela `/live/:code` — companion mobile-first que mostra sala, desafio, rodada, fase, resultado e placar ao vivo | não roda microjogo |

Do lado do host, o `GameProvider` ganhou um efeito de **upgrade**: quando `VITE_RELAY_URL` existe e
esta aba é a dona da sala (`room.hostId === 'p1'`), ele troca o loopback por um `createRelayHub`
como HOST, com handlers `onJoin → ROOM_GUEST_JOIN` e `onLeave → ROOM_GUEST_LEAVE`. Os quatro efeitos
de broadcast (sala/rodada/fase/resultado) continuam iguais — leem `netRef.current` fresco, então
valem para loopback e relay sem ramificação.

### Presença: bot ↔ humano

`roomManager.joinGuest(room, player)` remove um bot e senta o humano na mesma vaga (ou reconecta,
se o id já existia); `guestLeave(room, id)` devolve a cadeira para um bot. O host nunca é afetado.
O id do convidado é **estável por aparelho** (`localStorage: chaos.guest.v1`), então refresh/reconry
recuperam a mesma cadeira.

### Por que o convidado NÃO cria sala local

O celular do convidado também roda `GameProvider`, que viraria relay-host se tivesse uma sala com
`hostId==='p1'`. Se o convidado criasse sala local, existiriam **dois hosts no mesmo código**. Por
isso o `JoinRoom`, com relay ligado, manda o convidado para `/live/:code` **sem** chamar `joinRoom()`
— o `LiveGuest` abre seu próprio hub como GUEST e nada mais. Um host, um ou mais convidados, um código.

### Como rodar (2 aparelhos na mesma LAN)

```bash
# 1) sobe o relay (uma vez)
cd server && npm install && npm start        # ws://0.0.0.0:8787

# 2) aponta o app para o IP da LAN (não "localhost" — o celular não te alcança)
#    .env.local na raiz do CHAOS:            (ver .env.example)
#    VITE_RELAY_URL=ws://192.168.0.10:8787
npm run dev -- --host                        # --host expõe o Vite na LAN
```

Host cria a sala no PC/tela grande; convidado abre o QR no celular → cai em `/live/:code`, entra no
lugar de um bot, e acompanha tudo ao vivo.

### F7-C — o marco que falta (honesto)

Hoje o convidado tem **presença + espelho**, não **controle de jogo**. Motivo, sem rodeio: os 12
microjogos são **single-device**. Cada um lê só o input do jogador LOCAL (callback direto do ponteiro)
e **simula** todos os outros slots com `simulateBots(players, localPlayerId, …)` em
`games/_shared/bots.js` — que filtra por `id !== localPlayerId`, **não** por `isBot`. Ou seja: o
`act` remoto até chega no bus (§5.5), mas nenhum microjogo o consome; o slot do convidado é simulado
no host.

F7-C = cada celular joga o próprio slot e os placares se fundem no host. O trabalho mora em **dois
lugares só**, não nos microjogos:

1. **`simulateBots`** é o seam — trocar "simular este slot" por "usar o resultado que chegou do
   celular daquele slot". O comentário no arquivo já aponta isso.
2. **Finalização de rodada** no host — juntar o resultado local do host com os resultados remotos
   dos convidados antes de `broadcastResult`.

Não dá para testar sem 2 aparelhos de verdade, por isso está documentado como marco separado — não
foi fingido em lugar nenhum do código.
