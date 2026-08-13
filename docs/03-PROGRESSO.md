# 03 — PROGRESSO (histórico append-only)

> Regra: **nunca reescreva** entradas antigas do histórico. Ao concluir um passo, adicione uma
> entrada nova e atualize só a coluna Status da tabela.
> Formato: `[data] FASE — o que foi feito — pendências`.

## Roteiro de fases

| Fase | Escopo | Status |
|---|---|---|
| F0 | Scaffold (Vite/React), documentação base | ✅ feito |
| F1 | Design system: `tokens.css`, `global.css`, 15 componentes base | ✅ feito |
| F2 | Núcleo: state, room (ID/QR/link), engine, audio, input, data | ✅ feito |
| F3 | Telas + rotas + máquina de estados da partida + debug mode | ✅ feito |
| F4 | Microjogos 1–6: reaction, slice, draw, climb, rhythm, memory | ✅ feito |
| F5 | Microjogos 7–12: aim, tictactoe, mash, race, grow, dodge | ✅ feito |
| F6 | Verificação (`npm install`, build, navegador) + docs finais + README | ✅ feito |
| — | **MVP FECHADO** | ✅ |
| F7 | *(futuro)* Transporte WebRTC real — ver `05-FASE2-MULTIPLAYER.md` | 🟡 relay + P2P direto no código · F7-C pendente |

> ~~⚠️ **O projeto não builda antes de F5.**~~ *(resolvido em F5)* `engine/gameRegistry.js` importa
> estaticamente os 12 microjogos, então até a última pasta existir o `npm run build` falhava na
> resolução. Com os 12 no lugar, o build passa — mantido aqui só para explicar commits antigos.

---

## Histórico

### 2026-08-07 · F0 — Scaffold + documentação
- Criado projeto em `CHAOS/`: `package.json` (react 18, react-router-dom 6, qrcode 1.5), `vite.config.js`
  (`host:true` para acesso pelo celular na LAN), `index.html` (viewport mobile travado, fontes
  Space Grotesk/Inter/JetBrains Mono, `theme-color`), `.gitignore`.
- Docs: `00-HANDOFF.md` (entrada), `01-ARQUITETURA.md` (contrato do microjogo, action bus,
  chaos effects, scoring, máquina de estados), `03-PROGRESSO.md` (este).
- Decisão: identidade visual derivada da paleta **void-frio** Rafael MR
  (`#11131C` / periwinkle `#9DB1EA` / âmbar `#EAA94E` / bone `#F1EDE2`), adaptada para arcade
  com escala de matiz por microjogo (`--game-hue`).
- Pendências: nenhuma.

### 2026-08-07 · F1 — Design system
- `src/styles/tokens.css`: 3 camadas (primitivo → semântico → componente). Base-8, escala tipográfica
  1.25 (16/20/25/31/39/49/61/76), elevação 0–5, `--game-hue` como variável de rodada,
  `prefers-reduced-motion`, safe-area iOS.
- `src/styles/global.css`: reset, `#root` como app shell 100dvh, utilitários de layout,
  animações compartilhadas (`pop`, `shake`, `pulse`, `rise`, `flash`).
- `src/components/` (15): `Screen`, `Button`, `IconButton`, `PlayerAvatar`, `PlayerCard`, `Countdown`,
  `Timer`, `ScoreBadge`, `GameHeader`, `GameResult`, `ChaosEventBanner`, `QRCode`, `ProgressBar`,
  `ErrorBoundary`, `Logo`. Cada um em `<Nome>/index.jsx` + `<Nome>.css`, só `var(--token)`.
- Doc `02-DESIGN-SYSTEM.md` escrita.
- Pendências: nenhuma.

### 2026-08-07 · F2 — Núcleo
- `engine/random.js` (mulberry32 + `range/int/chance/pick/shuffle/jitter/fork`, `seed` exposto),
  `engine/inputManager.js` (`createActionBus` + `attachPointer` normalizando Pointer Events em
  TAP/PRESS/RELEASE/SWIPE — **é aqui que a Fase 2 injeta ações da rede**),
  `engine/useRafLoop.js` (dt limitado a 50ms, callback em ref, `cancelAnimationFrame` no cleanup),
  `engine/useGameClock.js` (relógio da rodada: `remaining/elapsed/progress` + `onExpire` único),
  `engine/botProfile.js` (`rollSkill`, `makeBot`, `botPerformance` → 0..1, `mapPerformance`, `botDelay`),
  `engine/chaosEvents.js` (8 eventos, 35% de chance, nunca na rodada 1, filtro por `game.supports`),
  `engine/scoreManager.js` (100/75/50/25, empate divide posição, multiplicador, streak +25 até +100,
  `standings`), `engine/resultManager.js` (records por stat + conquistas + maior sequência),
  `engine/gameRegistry.js` (catálogo dos 12 + `buildQueue` com sacola embaralhada),
  `engine/roundManager.js` (`PHASES`, `TIMING`, `WATCHDOG_GRACE`, `createMatch/enterRound/nextRound`,
  `normalizeEntries`, `finishRound`, `skipRound`, + helpers de debug).
- `room/roomCode.js` (alfabeto sem O/0/I/1, 5 chars, `crypto` quando disponível),
  `room/roomLink.js` (`origin + /join/:id`, clipboard com fallback, Web Share API),
  `room/roomManager.js` (CRUD de sala/jogadores 2–8, rodadas 5/7/10, dificuldade,
  localStorage `chaos.room.v1` + prefs `chaos.prefs.v1`).
- `state/gameState.js` (reducer puro — não calcula nada, só costura roomManager + roundManager) e
  `state/GameProvider.jsx` (contexto + ações prontas + persistência + desbloqueio de áudio no 1º gesto).
- `data/words.js` (128 palavras PT-BR + `pickWordOptions`/`maskWord`).
- **Desvios do plano (intencionais):**
  1. `useCountdown.js` → virou `useGameClock.js`. O componente `Countdown` já era dono do 3-2-1;
     o que os microjogos precisavam era do relógio da rodada.
  2. `gameManager.js` não existe: foi dissolvido em `gameRegistry.js` (catálogo/fila) +
     `roundManager.js` (máquina de rodadas). Duas responsabilidades, dois arquivos.
  3. 8 eventos CHAOS, não 9. O "RANDOM" do briefing **é** o próprio sorteio cego — um card visível
     que não faz nada seria pior que não ter card.
- Pendências: nenhuma. (F2 fecha aqui; F3 é a primeira fase que renderiza algo.)

### 2026-08-07 · F3 — Telas, rotas e máquina de estados
- 6 telas em `src/screens/`: `Home`, `CreateRoom`, `JoinRoom`, `Lobby`, `Game` (+ `RoundResult.jsx`),
  `FinalScore`. `App.jsx` só roteia; nada de `App.jsx` monolítico.
- `Game/index.jsx` é o motor em forma de tela: conduz INTRO → COUNTDOWN → PLAYING → RESULT por
  **timer**, nunca por clique. Watchdog em `duration + WATCHDOG_GRACE` aborta rodada travada;
  `ErrorBoundary` com `resetKey={round}` transforma crash de microjogo em "pular rodada".
- `DebugPanel` + `RotateHint` criados.
- Pendências: nenhuma.

### 2026-08-08 · F4 — Microjogos 1–6
- `reaction`, `slice`, `draw`, `climb`, `rhythm`, `memory`. DOM onde o jogo é de alvos discretos
  (reaction, memory), Canvas onde há movimento contínuo.
- Nasceu `games/_shared/`: `hooks.js` (`useRafLoop` + `useGameClock`, movidos de `engine/`),
  `canvas.js` (`fitCanvas` com DPR travado em 2, `readCssColors` — Canvas não enxerga `var(--token)`),
  `bots.js`, `GameShell.jsx`.
- **Contrato de fechamento em dois tempos:** o microjogo desenha o próprio `GameResult` por
  `END_HOLD` (1100ms) *antes* de chamar `onFinish`. Sem isso o jogador nunca vê o que fez.
- Pendências: nenhuma.

### 2026-08-09 · F5 — Microjogos 7–12
- `aim`, `tictactoe` (DUELO), `mash`, `race`, `grow`, `dodge`. Com isso os 12 imports estáticos do
  `gameRegistry.js` resolvem e **o projeto builda pela primeira vez**.
- `_shared/HoldButton.jsx` (botão de segurar com `setPointerCapture` + `onPointerCancel`) e
  `_shared/joystick.js` (**entrada contínua é AMOSTRADA, não transmitida** — o loop lê a posição
  atual; isso é o que deixa o joystick compatível com a rede da Fase 2).
- Regras de simulação que valem para quem for escrever o 13º jogo:
  - **um corpo móvel** (RACE) → colisão varrida (*swept*), evita atravessar obstáculo em dt grande;
  - **dois corpos móveis** (GROW, DODGE) → simulação em sub-passos, `MAX_STEP = 0.016`;
  - arena medida em unidades de `u = Math.min(w, h)` (`aw = w/u`, `ah = h/u`) — o mundo tem o mesmo
    tamanho relativo em qualquer tela;
  - `sizeScale` (chaos TINY/GIANT) **nunca** via `transform: scale()` em coisa tocável — aplica-se ao
    teto de tamanho, senão o alvo de toque encolhe junto e quebra os 44px;
  - nada de `Math.random()` na pintura — tremor cosmético usa seno determinístico.
- Pendências: nenhuma.

### 2026-08-09 · F6 — Verificação e fechamento do MVP
- `npm install` → 95 pacotes. `npm run build` → **220 módulos, ~1.5s**, `index.html` 1.19 kB,
  CSS 59.82 kB (gzip 10.73), JS 315.66 kB (gzip 104.30). Sem warnings.
- Testado no navegador em viewport 375×812, com `error`/`unhandledrejection`/`console.error`
  coletados: os **12 microjogos montam e rodam sem erro**; a partida avança sozinha de ponta a ponta
  (intro → contagem → jogo → resultado → … → placar final) sem nenhum clique entre rodadas;
  eventos CHAOS chegam aos jogos (verificados `UMA VIDA` no dodge e `GIGANTE` no grow); o caminho de
  erro se cura sozinho (FORÇAR ERRO → cartão de erro → próxima rodada); no `/results/:id` sobram
  **0 canvas** montados. Guardas de rota conferidas: `/join/:id`, sala inexistente, rota inválida.
- Conquistas validadas com dado real (não com o placar aleatório do debug): jogando REFLEXO de
  verdade saiu `⚡ REFLEXO MAIS RÁPIDO · VOCÊ · 78ms`.
- **2 bugs achados e corrigidos:**
  1. `Lobby` lia `player.bot`; o campo do modelo é `player.isBot`. Efeito: todo jogador — inclusive
     bot — aparecia com a legenda "VOCÊ".
  2. **Modo debug era inalcançável.** `debug` nasce `false` e o único `toggleDebug` estava *dentro*
     do painel. Criado `DebugPanel/useDebugGesture.js`: tecla `D` (navegador) ou 4 toques em 1,5s no
     canto superior esquerdo, num hotspot de 56px (celular). Listener em fase de **captura**, porque
     os microjogos capturam o ponteiro.
- **Painel de debug agora some do build de produção.** `{import.meta.env.DEV && <Panel/>}` apagava da
  tela mas não do arquivo — o `import` estático obriga o bundler a incluir tudo. Medido: as strings
  do painel e a classe `.dbg__fab` estavam dentro do `dist/`. Corrigido com `DebugPanel/DevOnly.jsx`
  (import **dinâmico** dentro de ramo morto). Depois: −4,5 kB de JS, −2,3 kB de CSS, nenhum chunk
  extra gerado, e no `npm run preview` o gesto secreto não responde.
- `DebugPanel` foi promovido de `Game` para `App.jsx`. Ganhos: o gesto funciona em **qualquer** tela,
  sumiram 5 repetições, e o painel deixa de fechar sozinho a cada troca de fase (antes ele remontava
  junto com o `<Screen>` da fase).
- Docs finais: `05-FASE2-MULTIPLAYER.md`, `06-MICROGAMES.md`, `README.md`; `01-ARQUITETURA.md`
  atualizada com o que F4/F5 mudaram.
- Pendências: nenhuma para o MVP. Próximo passo real é F7 (transporte).

### 2026-08-09 · F6 (adendo) — correções de documentação
> O histórico é append-only, então as entradas acima ficam como estão. As correções vivem aqui.

- **A entrada de F4 está errada em dois nomes de arquivo.** `games/_shared/canvas.js` e
  `games/_shared/GameShell.jsx` **nunca existiram**. O que existe é `hooks.js` (que absorveu
  `useCanvasSize` e `readCssColors`) e `RivalBars.jsx` + `game.css`. Conteúdo de `_shared/` real:
  `hooks.js` `bots.js` `joystick.js` `HoldButton.jsx` `RivalBars.jsx` `game.css`.
- **`01-ARQUITETURA.md` estava mentindo em três pontos** e foi corrigida:
  1. dizia que o Component recebe `duration` "já multiplicado pelo timeScale" — recebe **cru**
     (`Game/index.jsx` passa `game.duration`). O contrário disso é a regra de F5: `timeScale`
     escala a simulação, **nunca** o relógio da rodada, senão o watchdog e o HUD discordam do jogo;
  2. omitia `round` e `totalRounds` do contrato de props;
  3. a árvore de pastas ainda listava `gameManager.js`, `useRafLoop.js` e `useCountdown.js`, os três
     dissolvidos em F2/F4; e a lista de categorias trazia `rhythm`/`arena`, que ninguém usa (as
     reais são `reflex precision creative platform timing memory strategy speed`).
- Adicionadas à `01-ARQUITETURA.md` as regras que só existiam na cabeça de quem escreveu os jogos:
  fechamento em dois tempos (`useOutcome`/`END_HOLD`), `sizeScale` no teto de tamanho, colisão
  varrida × sub-passos, unidades de arena, `dt` travado, proibição de `Math.random()` na pintura,
  entrada contínua amostrada, e o porquê de não haver `<StrictMode>`.
- Escritos: `05-FASE2-MULTIPLAYER.md` (plano do transporte — arquitetura, zero implementação),
  `06-MICROGAMES.md` (tabela dos 12 + `supports` + conquistas + receita do 13º), `README.md`.
- Pendências: nenhuma. **MVP fechado.**

### 2026-08-09 · F7-A — camada de transporte (protocolo + loopback)

Primeiro passo da Fase 2. **Não é rede**: é o contrato por onde a rede vai passar. Continua valendo
a proibição do MVP — nenhum backend, WebSocket, WebRTC, STUN/TURN ou serviço externo entrou.

- Novo `src/net/` com três arquivos (~430 linhas):
  - `protocol.js` — `MSG` (hello/bye/act/ping · pong/room/round/phase/result/final), construtores,
    `encode/decode` que nunca lançam, e **`allowedFrom(papel, tipo)`**;
  - `transport.js` — o *contrato* do cano (`send/onMessage/onPeer/peers/close`) + `createLoopbackHub()`,
    implementação em memória com `latency`/`jitter`/`loss` simuláveis;
  - `netSession.js` — a ponte. `act` que chega vira `bus.emit({...remote:true})`; host expõe `broadcast*`.
- `GameProvider` virou host de um hub loopback e anuncia sala, rodada, fase e resultado. Com zero
  convidados o broadcast é no-op, mas o caminho roda a cada partida — não apodrece.
- **Decisões que valem mais que o código:**
  1. **autoridade é invariante, não convenção** — `allowedFrom` roda no envio *e* na recepção;
     convidado que tente mandar `result` é descartado. Duas máquinas somando ponto = duas verdades;
  2. **entrega sempre assíncrona**, mesmo com latência 0 (`queueMicrotask`) — canal de rede nunca
     entrega no mesmo tick, e código que dependa disso quebraria na troca pelo cano real;
  3. **tudo passa por `JSON.stringify` de verdade, inclusive no loopback** — payload cíclico é
     pego agora, não na primeira conexão real;
  4. **o carimbo `t` do convidado nunca julga** — `handleAct` reescreve com o relógio do host;
  5. `hub.close()` limpa timers pendentes (regra 4 do repo vale para a rede também).
- Dev-only: `window.__chaosNet` (`.guest(id)`, `.bus`, `.hub`) permite plugar um "segundo aparelho"
  pelo console sem rede nenhuma. **Confirmado que não entra em produção:** 0 ocorrências em `dist/`.
- Verificação: 19/19 asserções num smoke test em Node sobre os módulos reais (ação remota → bus,
  fronteira de autoridade, host→convidado, assincronia, `close()`, lixo não-serializável, peers,
  latência). No app rodando, um convidado fake mandou `TAP` e ele chegou no action bus real como
  `{playerId:'p2', action:'TAP', remote:true}`. Build: **223 módulos**, sem warnings.
- Pendências: **F7-B (sinalização + WebRTC) segue bloqueada por escopo** — WebRTC precisa trocar
  SDP/ICE antes de conectar, e isso exige servidor de sinalização, que é backend. Decisão do Rafael.
  Ver `05-FASE2-MULTIPLAYER.md` §3 e §8.

### 2026-08-09 · F8 — sala de 2 jogadores + ícone/manifest

Pedido do Rafael: *"o jogo tem que ser de dois jogadores também, não precisa de muitos."*

**O motor sempre aceitou 2** (`MIN_PLAYERS = 2`, `canStart` já checava isso, os 12 microjogos
pontuam contra uma lista de rivais de tamanho qualquer — inclusive o DUELO, que apesar do nome
não exige um tabuleiro 1v1). **Quem não deixava era só a tela de criar sala.**

- `screens/CreateRoom` — o seletor oferecia `[2,3,5,7]` **bots** com rótulos `3/4/6/8`. Agora é
  `PLAYER_OPTS = [2,3,4,6,8]` e o valor é o **total**, igual ao que está escrito no botão.
  - **Bug real que isso destapou:** o `value` das opções era contagem de bot, mas o estado
    comparado (`total`) era o total. Consequência: (a) no padrão `total = 4` **nenhuma opção
    ficava acesa**, porque 4 não estava na lista de valores; (b) tocar no botão escrito "4"
    gravava `total = 3` e a sala nascia com **3 jogadores**. Rótulo e resultado agora são a
    mesma grandeza — é o que o comentário no arquivo pede para não regredir.
  - Rótulo da seção virou `QUANTOS JOGAM (2 A 8)`, que diz o mínimo em vez de só o teto.
  - Saiu o `hint: 'JOGADORES'` de cada opção: com 5 colunas num aparelho de 360px o texto
    repetido não cabe (`flex: 1 1 0` → ~60px por coluna). O rótulo da seção cobre o sentido.
- `screens/Lobby` — o "remover" não tinha piso: dava para tirar o bot, ficar sozinho e travar
  no botão *PRECISA DE 2 JOGADORES* sem entender o motivo. Agora `atFloor` esconde o remover
  em 2 jogadores, simétrico ao `full` que já escondia o "+ ADICIONAR" em 8.
- **Ícone e manifest** (`public/`, os dois primeiros arquivos que o projeto tem lá):
  `icon.svg` desenha a marca — o alvo que é o "O" de CHAOS em `components/Logo` — e
  `manifest.webmanifest` fecha o *add to home screen* que o `index.html` já prometia com
  `apple-mobile-web-app-capable` mas não entregava (`display: standalone`,
  `orientation: portrait`, tema `#0B0D14`). O SVG repete os hex dos tokens **de propósito**:
  ícone é servido fora do app e não enxerga `var(--token)` — o comentário no arquivo diz de onde
  veio cada cor. Continua **zero asset binário** no repo.
  - Limitação honesta: iOS ignora SVG em `apple-touch-icon` e quer PNG. É o único lugar do
    projeto que pede um raster, e ele é passo de arte — ver `04-PROMPT-DESIGN-CHAOS.md`.
- Verificação: **32/32 asserções** em Node sobre os módulos reais — sala de 2 (host + 1 bot, sem
  colidir nome nem cor), `canStart` true em 2 e false em 1, a escada inteira `[2,3,4,6,8]` gerando
  exatamente o número escrito no botão, pontuação de dupla (1º +100, 2º +75), streak subindo para 2
  com bônus, empate dando 1º para os dois, e tabela final de 2 linhas ordenada.
  Build: **223 módulos**, sem warnings; `icon.svg` e `manifest.webmanifest` copiados para `dist/`.
- Não verificado no navegador: o preview server não sobe neste ambiente e o `requestAnimationFrame`
  não dispara no painel oculto (medido: 0 fps, `visibilityState: "hidden"`), então nenhum microjogo
  roda aqui. A partida foi jogada e verificada na F6.
- Pendências: nenhuma nova. F7-B segue bloqueada por escopo.

### 2026-08-09 · F8-bis — preview server destravado + verificação no navegador

Corrige o último item da entrada anterior ("não verificado no navegador"). O histórico é
append-only, então a linha de cima fica como estava: **ela valia até aqui**.

**Por que o preview não subia.** Não era o `launch.json`. O harness monta o *cwd* do processo a
partir da pasta da sessão e valida que ele seja relativo à raiz do projeto; quando a sessão abre
em `ClaudCodeCodes/` (a pasta-mãe, que tem vários projetos) e o alvo é a subpasta `CHAOS/`, a
validação falha com `cwd must be a relative path within the project root` — inclusive com o campo
`cwd` explícito, que o `LEDGBOrchestor` usa e funciona lá. O que muda entre os dois casos não é o
arquivo, é onde a sessão foi aberta.

- **Correção:** `CHAOS/.claude/launch.json`, no mesmo formato de `AutoShorts` e `sshEditor`
  (`npm run dev`, porta 5173, sem `cwd`). Com a sessão aberta **dentro de `CHAOS/`**,
  `preview_start` funciona pelo nome. Abrindo na pasta-mãe, use `preview_start { url }` apontando
  para um Vite já de pé — foi o que se fez aqui.
- Não deixei `launch.json` na raiz: ele é rejeitado de qualquer jeito e só confundiria.

**O que passou a ser verificado de verdade, em `375x812`:**

- Home renderiza com **zero erro de console**, e mostra sozinho o atalho *VOLTAR PARA 47XV7 ·
  2 jogadores* — sala de dupla persistida no `localStorage`.
- `QUANTOS JOGAM (2 A 8)` traz `2 3 4 6 8` com o **4 marcado** por padrão. Antes do conserto
  nenhuma opção acendia, porque o valor era contagem de bots e o estado era o total.
- Cada opção mede **60×44px** — bate o alvo mínimo de toque de `07-MOBILE.md`, e confirma que
  tirar o `hint` era necessário: "JOGADORES" não cabe em 60px.
- Clicar em **2** e criar leva a `/room/D9FD2` com `JOGADORES 2/8`: host humano (`isBot:false`,
  `skill:null`) + bot `IGOR` (`skill:0.5`, MÉDIO), cores `#EAA94E` e `#9DB1EA` sem colidir,
  **0 botões de remover** (o `atFloor` segurou), `COMEÇAR PARTIDA` habilitado e QR Code na tela.
  É exatamente o bug de off-by-one fechado ponta a ponta — esse clique antes gerava 1 jogador.

**O que continua sem dar para verificar aqui:** o painel do browser fica oculto, então
`screenshot` e clique sintético (`computer`) expiram, e o `requestAnimationFrame` não dispara —
**nenhum microjogo roda neste ambiente**. Interação foi feita por `.click()` via JS, que aciona o
handler do React igual. A partida em si segue apoiada na verificação da F6, em aparelho.

---

### 2026-08-09 · F9 — doc preparada para a entrada do design

Nenhuma linha de código nesta etapa, de propósito: o código está fechado e a próxima frente é
identidade visual. O que faltava era a doc estar pronta para receber o design **sem** que o lado
do código se perca no meio do caminho.

**Novo: `08-CONTINUIDADE-CODIGO.md`.** Três coisas dentro:

1. **Prompt de continuidade** (§2) — bloco autocontido para colar numa sessão nova. Carrega
   estado (F0→F8 feitas, F7-B bloqueada), ordem de leitura, lista de proibido, regras de ouro,
   como rodar, e as duas regras que mais somem no meio do contexto: histórico append-only e
   **autor único nos commits, nunca `Co-Authored-By`**.
2. **Fronteira design ↔ código** (§3) — tabela do que é troca de token (design resolve sozinho)
   contra o que exige mexer em componente, microjogo ou metadata. Junto, as três armadilhas já
   conhecidas: `public/icon.svg` não enxerga `var(--token)`; `--game-hue` é metadata em
   `src/games/<id>/index.js`, não CSS; e 44px de alvo de toque não cede por estética — no
   `SegmentedControl` de 5 opções em 375px cada opção mede exatamente 60×44.
3. **Checklist de aceite da arte** (§4) — build limpo, zero hex solto, contraste sobre a
   superfície real, 8 cores de jogador distinguíveis com 2/3/8 na tela, alvo medido em 375×812,
   os 12 microjogos ainda terminando e limpando, fonte local sem CDN.

Também deixei registrado ali o limite honesto do ambiente de agente: DOM, console e
`getBoundingClientRect` funcionam; `requestAnimationFrame` não dispara e o painel fica oculto,
então **animação, canvas e "é gostoso de jogar?" só em aparelho**.

**Ponteiros atualizados:** `00-HANDOFF.md` §0 aponta para o novo arquivo logo depois do bloco da
F8, e o índice do §6 ganhou a linha do `08-`.

**Segue pendente:** os assets de `04-PROMPT-DESIGN-CHAOS.md` (P1–P5) ainda são prompt, não
arquivo — é exatamente o que abre agora; o `apple-touch-icon` PNG; e a F7-B, bloqueada por
escopo.

### 2026-08-13 · F7-B-direto — cano P2P zero-servidor por handshake de 2 QR

Segundo transporte real, irmão do relay, **sem servidor nenhum** (nem relay, nem rendezvous) —
resposta literal ao pedido do Rafael: *"conexão compartilhando IP via qrcode… deixei 0 servidor…
sem precisar de site externo nenhum… até 8 (sala cheia)"*. Liga o `createP2PHub` (WebRTC
DataChannel, já provado na F7 anterior) no **fluxo de jogo de verdade**, não numa prova solta. Tudo
**opt-in** pelo flag `settings.direct`: sem ele (e sem `VITE_RELAY_URL`), o app roda idêntico à F1.

- **`CreateRoom`** — CONEXÃO = CELULARES grava `settings.direct = true` (#57).
- **`net/qr/handshake.jsx`** — widgets `QrImage`/`CopyHashRow`/`ImportPanel` compartilhados pelos
  dois lados do aperto de mão, migrados da P2PLab (#58).
- **`state/GameProvider.jsx`** — efeito P2P do host: `directMode && !relayUrl && hostsThisRoom` abre
  `createP2PHub()` como HOST com o **mesmo** `netSession`/handlers do relay e expõe `hub.signaling`
  ao Lobby via `directSignaling`; teardown restaura o loopback (#59).
- **`screens/Lobby/` (`DirectInvite`)** — GERAR CONVITE (`createInvite` → QR da offer) → COLE A
  RESPOSTA (`acceptAnswer` → conecta). Um convidado por vez, até encher (#60).
- **`screens/Home` → `/direct`** — `screens/DirectGuest/` + `net/useDirectGuest.js`: lê o convite
  (`acceptInvite` → answer), mostra o QR da resposta, dá `hello()` **dentro do `onPeer('join')`**
  (o DataChannel P2P só abre depois do host aceitar). Extraí o `LiveMirror` do `LiveGuest` para os
  dois canos usarem a **mesma** apresentação ao vivo; o `LiveGuest` virou wrapper fino do relay.
  Retry limpo por contador `gen` (remonta hub a cada convite inválido) (#61).

**Verificação:** `npm run build` OK (261 módulos); `npm test` verde (25/25 p2p-contract + 32/32
scoremerge-contract). Igual ao `useGuestLink`, o convidado direto é **presença + espelho**, não roda
o próprio slot — isso continua sendo a **F7-C** (pendente, honesta).

**Limitação honesta (§10 do `05-FASE2-MULTIPLAYER.md`):** `createP2PHub` usa **só STUN, sem TURN**
(TURN é servidor → fora por projeto). Mesma Wi-Fi conecta; **4G ↔ Wi-Fi com CGNAT duro pode não
fechar** — não é bug, é a física do NAT sem TURN; alternativa é a mesma rede ou o relay (F7-B).

**Pendente:** prova de 2 celulares de verdade (roteiro no §10); e a F7-C (runner do lado convidado).
