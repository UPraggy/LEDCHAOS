# CHAOS · Progresso

Registro vivo do que está pronto, do que estou fazendo agora e dos próximos
passos. Atualizado conforme o trabalho anda (não só no fim).

**Fase atual — Overhaul VISUAL / ASSETS / GAMEPLAY.** Pedidos do Rafael:
aplicar os assets/PNGs e a Identidade Visual de verdade em todos os jogos; tirar
o gradiente laranja feio (misturar espresso + âmbar do portfólio V5); consertar o
FATIAR (ver o corte, objetos dentro do bloco, frutas e bombas); escrever prompts
dos assets que faltam (frutas inteira **e** cortada); e **fazer todos os jogos do
protótipo, inclusive os documentados** (dinossauro, música, etc.), cuidando do
CONTRASTE. Ordem de trabalho: A (modos) → D (assets) → C (revisões) → B (jogos
novos). Regra: se o handoff conflitar com um contrato do repo, o **contrato do
repo vence**.

Fonte da verdade do design:
`Design Híbrido Protótipos 1 e 2/design_handoff_chaos_microgames/README.md`.

---

## Pronto (passe de enquadramento mobile — pedido "texto/personagens saindo")

Auditoria de overflow no shell a 430px (largura de celular real), validada tela a
tela pelo Visual Inspector. Três correções + varredura das demais telas:

- **(A) Botões de convite (COPIAR LINK / COMPARTILHAR).** O rótulo cortava
  horizontalmente e o multi-palavra quebrava em 2 linhas dentro da altura fixa.
  Causa: `.btn { overflow:hidden }` zera o `min-width:auto`, então o `flex-wrap`
  nunca disparava e os dois ficavam espremidos lado a lado. Fix em dois pontos:
  `white-space:nowrap` no `.btn__label` (rótulo nunca quebra em 2 linhas) +
  `min-width:13rem` nos botões de convite (piso = largura de "COMPARTILHAR", então
  quando não cabem os dois na linha eles empilham full-width).
- **(C) Avatar "saindo do enquadramento" (criar/entrar).** O preview grande era um
  `PlayerAvatar float` nu que vazava por cima de "SEU NOME". Agora vive numa moldura
  `.identity__avatar` (mesma célula-adesivo do grid, `overflow:hidden`) que trava o
  sticker dentro. Vale para as duas telas (é o `IdentityForm` compartilhado).
- **(D) Varredura das outras telas.** Lobby (START + segmentados RODADAS/NÍVEL) e
  Entrar-na-sala: sem vazamento. **Achado na Home:** o botão "VOLTAR PARA <código>"
  tinha o `hint` ("N jogadores") posicionado `absolute right` colidindo com o
  rótulo centralizado. Corrigido tornando o hint uma **legenda empilhada** (`.btn__text`
  em coluna: rótulo em cima, hint pequeno embaixo) — nunca mais colide, serve tanto
  p/ hint curto quanto longo (ex.: "conectando ao vivo com o host" no modo relay do
  Entrar), com `text-overflow:ellipsis` de guarda. Build limpo (255 módulos).

Arquivos: `components/Button/{index.jsx,Button.css}`,
`components/IdentityForm/{index.jsx,IdentityForm.css}`, `screens/Lobby/Lobby.css`.

---

## Pronto (fase visual)

- **#22 · `assets.js`** — banco de imagens p/ canvas: `preloadImages`,
  `drawImageCentered`, `drawImageBottom` (alinha pela base — chave para sprites
  de chão como o dino).
- **#23 · FATIAR (§3.1)** — reescrito com PNGs de frutas + bomba, rastro do
  corte visível, física em espaço-porcentagem (objetos param de escapar do
  bloco). Corte usa cores literais (creme + tinta) pra legibilidade.
- **#24 · Fim do gradiente laranja** — trocado o `--grad-amber` feio; passe de
  contraste no tema, misturando espresso + âmbar da identidade V5.
- **#25 · Prompts de assets faltantes** — `docs/09-PROMPTS-ASSETS.md`: direção de
  arte adesivo-arcade + prompts das frutas cortadas e frutas extras (inteira +
  `-corte`), convenção de nomes e pós-processamento.
- **#26 · CORRIDA / runner do dino (§3.4)** — `race` reescrito de carrinho-de-cima
  para corredor lateral estilo Chrome offline. Arena BRANCA (#FFFFFF), chão
  sólido + faixa tracejada rolando, nuvens em parallax, sprites de
  `assets/dino/` (corre/pula/abaixa, cacto, cacto-duplo, pterodáctilo).
  Dois botões: **PULAR** (toque) e **ABAIXAR** (segurar). `timeScale` acelera o
  MUNDO, nunca o pulo (a janela de acerto encolhe = dificuldade do CHAOS). Erro
  não tira ponto na hora: tira VELOCIDADE (atordoa 700ms + selo "BATEU!"). Bot
  §3.11: `m=perf*640`, `score=m*10`. Build limpo (239 módulos).
- **#31 · Fim dos gradientes + cor de jogo VIVA (design fiel)** — duas coisas:
  1. **Varredura anti-degradê.** Todo palco de jogo, componentes compartilhados
     (Button, ProgressBar, ErrorBoundary), o pulso de faixa do rhythm e os
     `--grad-*` viraram **faces chapadas** — profundidade vem da pop-shadow
     sólida, nunca de degradê. Mantidos de propósito: anel cônico do Timer
     (mecanismo), brilho varrendo o botão (`::before`), grade 1px do MIRA
     (referência funcional) e a vinheta do PENUMBRA (modificador de gameplay,
     desligado por padrão).
  2. **Sistema de cor por jogo consertado (bug real).** Os tokens HSL derivados
     (`--game-accent/-soft/-deep/-wash/-glow`) eram resolvidos **uma vez** no
     `:root`; trocar `--game-hue` num descendente não os re-derivava, então a
     cor de cada jogo estava **inerte**. Re-declarei os derivados nos wrappers
     que recebem o hue (`.screen`, `.dev__*`) — agora título, cronômetro, anéis
     e preenchimentos finalmente vestem o hue do jogo.
  3. **Fundo da tela unificado (§5 do handoff).** `.gscene`, `Countdown` e
     `GameResult` deixaram de pintar o fundo com `--game-wash` (que deixava os
     hues quentes — âmbar, rosa — **marrons**, criando um degrau feio sobre o
     campo) e passaram a usar o **roxo-médio da marca `#2E2080`** (`--color-bg`),
     chapado e igual para todo jogo. O hue vive só nos ACENTOS, como o handoff
     manda. Conferido no **Visual Inspector** (:3100) em hues quente (mash/aim) e
     frio (race): chrome roxo coeso + arena por-jogo + acento colorido. Build
     limpo (CSS 78.66 kB).

- **#27 · BATIDA / rhythm (§3.2)** — reescrito de 3 → **4 pistas**. O motor de
  som pentatônico elogiado foi **preservado inteiro** (cada nota carrega o `deg`
  da escala; timbre por julgamento; groove kick/snare/hat travado no grid real).
  Novidades do handoff: **holds** (segurar até o fim = bônus, soltar cedo zera a
  sequência), **estrela** (energia → **ENERGIA ×2** por 5 s, com brilho extra na
  oitava), **duplas** (pip gêmeo, +35), efeitos de acerto (anéis + faíscas +
  palavras PERFEITO/BOM saltando) e **combo gigante `×N`** no centro quando ≥5.
  `timeScale` reinterpretado como **densidade do chart** (aperta o espaçamento,
  não o relógio — julgamento continua em ms reais), resolvendo a antiga tensão
  com o contrato do repo. `score = pontos×3`, cor do resultado pela precisão.
  4 pistas verde/rosa/ouro/ciano com contorno de tinta sobre highway escura
  (#150F3C) — contraste forte. **Conferido no Visual Inspector** (:3100):
  render fiel, **0 erros / 0 warnings** no console (`audit_console_errors`).

- **#28 · Reskin com PNGs (§3.8–3.10)** — assets reais entraram em `aim`,
  `memory` e `mash`, sempre com contraste forte e sem degradê:
  - **MIRA (§3.8)** — alvos = `alvo.png`, armadilhas = `bomba.png` via
    `drawImageCentered` (com queda graciosa pro vetor enquanto o PNG decodifica);
    `register` devolve o `delta` real e cada acerto/erro cospe um número
    flutuante `+N` verde / `−15` vermelho subindo do ponto tocado.
  - **MEMÓRIA (§3.9)** — os 4 pads viraram PNG (gema/moeda/coração/nota) com par
    **aceso/apagado** de cores literais: apagado afunda numa pop-shadow longa
    (`0 8px 0`) a 55% de opacidade, aceso encurta (`0 3px 0`), cresce e ilumina.
    **Só arte + textos de status** (SUA VEZ / OLHE A SEQUÊNCIA / NÍVEL N ✓) —
    mantida a mecânica do repo (fim-no-erro + placar por níveis/velocidade); a
    ideia do handoff de "erro reinicia no nível 1" foi descartada (contrato do
    repo vence).
  - **MARTELO (§3.10)** — o botão TOQUE! ganhou dois `raio.png` (44 px fixos, um
    espelhado) ladeando o texto, com contorno de tinta sólido — cara de botão de
    fliperama.
  - **Conferido no Visual Inspector** (:3100) nos três: PNGs renderizam com
    contraste forte, pop-shadow adesiva e **zero gradientes**; console limpo —
    **0 erros / 0 warnings / 0 pageErrors / 0 failed** (`audit_console_errors`).
    Build limpo (239 módulos, CSS 78.79 kB).

- **#29 · Jogos novos (§3.3 `osu`, §3.7 `piano`, §3.5 `trace`)** — os três
  microjogos que faltavam do protótipo, implementados e registrados no
  `gameRegistry.js` (agora **15 jogos**). Bots pela tabela §3.11 (osu
  `pts=perf*780→score*4`; piano `pts=perf*560→score*5`; trace
  `formas=floor(perf*2.8), pct=resto → (formas*100+pct)*8`).
  - **NA MOSCA (§3.3)** — arena única de mira: círculos com anel de aproximação
    (ouro) + sliders para arrastar. Alvo rosa, slider ciano, selo "PERDEU" no
    erro. Arena chapada na cor funda (contrato do repo vence o radial-gradient
    do handoff); a cor vem dos alvos.
  - **PIANO (§3.7)** — quatro colunas creme, peças escuras caindo; toque na
    peça certa, evite a bomba (`bomba.png`), pegue moeda/gema
    (`recompensas/`). Bomba = três canais de erro (som + número vermelho +
    sacudida). Tabuleiro inteiro no canvas, sem degradê.
  - **CONTORNO (§3.5)** — área quadrada creme + trilha de pontos (estrela
    lilás) pra cobrir com o dedo; barra de progresso CHAPADA na cor do jogo;
    selo verde "FECHOU!" quando a forma passa de 97%. Pincel = `jogo/pincel`.
  - **Correção de layout (RivalBars).** Nos jogos de canvas cheio a fita de
    rivais flutua sobre o canvas (inofensivo); nestes três a caixa é um **card
    emoldurado**, então a fita cruzava a moldura. Movi `<RivalBars>` para o
    topo do stage em fluxo normal (`.grivals { position: static }`, largura =
    a da caixa) — pilha limpa `[header][rivais][caixa]`. **Conferido no Visual
    Inspector** (:3100): os três renderizam certo, sem sobreposição. Build
    limpo (248 módulos, CSS 81.58 kB).

- **Galeria de jogos e assets** (pedido do Rafael: "uma pasta com foto de todos
  os jogos, com suas variações de ícones e imagens") — `docs/galeria/`,
  auto-contida: `index.html` (página adesivo-arcade, roxo + creme + tinta, sem
  degradê) + `telas/` (15 screenshots `NN-id.png`, tirados no dev bench) +
  `assets/` (cópia dos 67 PNGs em 8 categorias). A página mostra cada jogo com
  foto + emoji + categoria + chip de hue + miniaturas dos PNGs que ele usa
  (ou "arte vetorial"), e a biblioteca completa agrupada por categoria.
  **Conferida no Visual Inspector** via `file://`: fotos e miniaturas carregam,
  identidade fiel. Abrir: `docs/galeria/index.html`.

- **#30 · Modos (§2)** — dois modos de partida, sem nenhum microjogo precisar
  saber em que modo está (só a fila muda):
  1. **Estado (`room.settings`).** Três campos novos, persistidos junto com as
     opções da sala: `mode` (`'partida'` | `'unico'`, padrão `partida`), `picked`
     (ids habilitados, padrão = todos) e `soloGame` (padrão `slice`). Setters puros
     no `roomManager`: `setMode`, `toggleGame` (**nunca esvazia** — desmarcar o
     último é no-op) e `setSoloGame`; tudo passa por `sanitizePicked`/
     `sanitizeSoloGame` (descartam id inválido). Migração no `loadRoom` para salas
     antigas que não tinham esses campos. Ações no reducer: `ROOM_MODE`,
     `ROOM_TOGGLE_GAME`, `ROOM_SOLO_GAME`, expostas no `GameProvider`.
  2. **Sorteio (`roundManager.effectiveGamePool`).** `createMatch` monta a fila
     sobre uma **piscina efetiva**: `unico` → só o `soloGame` (a partida inteira é
     ele, respeitando a contagem de rodadas); `partida` → só os `picked` (fallback
     defensivo para todos). `buildQueue` ganhou o parâmetro `allowedIds` e cai de
     volta para todos se o filtro zerar a piscina — sortear é melhor que travar.
  3. **UI — CRIAR SALA (§2.3).** Dois blocos novos **entre** o cartão de
     identidade e a "DURAÇÃO DA PARTIDA": **MODO** (trilho PARTIDA / JOGO ÚNICO,
     amarelo #FFCE31 selecionado) e **MICROJOGOS** (grade 2 colunas de 15 células
     emoji+nome; título vira **ESCOLHA O MICROJOGO** no modo único). Multi-select
     na partida, single-select no único. **Conferido no Visual Inspector** (:3100):
     os dois modos renderizam fiéis, a seleção única migra de célula ao trocar de
     jogo, e o console fica **0 erros / 0 warnings / 0 pageErrors / 0 failed**.
     Build limpo (248 módulos, CSS 83.12 kB).

- **CLIMB — especiais (§3.6) + FATIAR mais frutas + galeria com prints reais**
  1. **ESCALAR (climb).** Plataforma-**mola** (lança pra cima), **foguete** e
     **perigos** (bomba flutuante) entraram com aviso visual antes do evento.
     Verifiquei no dev bench com um auto-escalador que mira sempre a plataforma
     mais **alta ainda abaixo dos pés** (única onde dá pra pousar): cruza os 24 m
     e dispara mola/foguete/perigo — prints `climb_1/2/3` mostram 30 m / bomba a
     67 m / mola a 204 m.
  2. **FATIAR (slice) — mais frutas.** Densidade/spawn aumentados: a rodada agora
     enche a tela de frutas (melancia, banana, e a **chuva** com vários alvos ao
     mesmo tempo), mantendo bombas como risco. Prints `slice_1/2/3`.
  3. **Galeria CHAOS — prints REAIS, não ícones (§gal).** Reescrevi
     `docs/galeria/index.html`: cada um dos 15 jogos mostra **3 telas reais**
     capturadas ao vivo no dev bench (`/dev/<jogo>`, retrato 440×920) — 45 PNGs em
     `docs/galeria/assets/prints/`. Antes eram montagens de ícones; agora é o
     render do jogo rodando (esperar / acertar / erro / evento / resultado). A
     captura usa um orquestrador (`sweep.cjs`) que abre a sessão em retrato,
     injeta um **driver por jogo** (corta fruta, escala, martela o botão, contorna
     a forma, toca no ritmo, pula o dino, etc.) e tira screenshots cronometrados
     em 3 momentos. Diagnósticos resolvidos: **reaction** ficava travado no
     estado GO (passivo) → driver que toca o palco cicla os estados; **trace**
     mostrava 0% (só o objetivo) → driver que arrasta pelas arestas gera a
     cobertura. CSS da galeria recorta a barra de toggles do bench
     (`transform: translateY(-15%)` num box retrato) → thumbnail mostra só o jogo.
     Conferido servindo a pasta em HTTP e abrindo no Visual Inspector: os 45
     prints carregam e o corte fica limpo. Seções **Biblioteca em uso** (67
     assets) e **Extras — icones-todos** (60, com os **NOVO** marcados) mantidas
     como catálogo para a IA de design.
  4. **Ícones — usar todos (§icons).** Os naturais entraram nos jogos
     (climb/slice/memory). O restante dos **NOVO** (badges +100/+50/−30, LEVEL UP,
     vidas, poção, portal, tornado, halo, cometas, rastro arco-íris, impacto) está
     **catalogado na galeria** com badge NOVO + nota "candidatos para a IA de
     design propor onde encaixar" — que é como o Rafael pediu para repassar. Forçar
     os 60 em 15 jogos prejudicaria contraste/leitura; a colocação fina fica para
     o passe de design.

## Pronto (fase design-review + deploy + skills)

- **#37 · Skill huashu-design integrada (sem marca d'água) + DESIGN-REVIEW.md.**
  A skill de design entrou **sanitizada**: princípios e checklist absorvidos em
  `.claude/skills/chaos-design/SKILL.md`, **sem importar nenhuma marca d'água**
  ("Created by Huashu Design" ficou de fora, como o Rafael pediu). Escrevi
  `docs/DESIGN-REVIEW.md` — auditoria em 5 dimensões, **42/50** (coerência 9,
  hierarquia 8, execução 9, funcionalidade 8, inovação 8), com prints reais em
  `docs/galeria/review/`. Achado importante confirmado no código
  (`Button.css`): o brilho que varre o CTA (`.btn::before`, branco 0.45,
  `shine 3.6s`) **não é um gradiente** — é luz de adesivo de propósito; não deve
  ser sinalizado como violação. Correções anotadas: contraste do placeholder do
  CÓDIGO e do link P2P (≥4.5:1), comentário obsoleto no `tokens.css` ("CTAs em
  gradiente vivo" — hoje são chapados) e reduzir o brilho 0.45→0.30.
- **#38 · Selos/badges de pontuação nos jogos.** Passe cirúrgico: o MARTELO
  (única lacuna real de feedback) ganhou selo de veredito + pontos; os jogos de
  canvas já cospem números na tela e Reaction/Memory/Duel já eram expressivos.
- **#39 · Artefatos de deploy do GitHub Pages (prontos, verificados).** O
  problema do Pages com SPA (rota profunda de QR tipo `/join/:id` dá 404 no
  primeiro acesso, porque Pages é estático) foi resolvido com o par
  rafgraph/spa-github-pages (MIT): `public/404.html` empacota o caminho numa
  query e redireciona; um trecho no `<head>` do `index.html` desempacota antes do
  app subir. Somado: workflow `.github/workflows/deploy.yml` (Actions → Pages,
  `VITE_BASE` e `CUSTOM_DOMAIN` parametrizados, `.nojekyll`) e `docs/DEPLOY.md`
  com os dois caminhos (path `github.io` vs. domínio raiz). **Verificado de ponta
  a ponta** num emulador de GH-Pages (`ghpages.cjs`, serve 404.html com status
  404): acesso frio a `/join/TEST123` → `location.pathname` restaurado exatamente
  e a tela real ENTRAR NA SALA renderizou (grade de avatares, CTA roxo com o
  brilho de adesivo — corroborando o achado do review). **O push, o login e o DNS
  são cliques do Rafael; este repo só entrega os artefatos** — nenhuma credencial
  dele é usada.
- **#40 · Catálogo de skills no portfólio.** `ME/PlanejamentoCarreira/
  13-skills-claude-code.md`: skills boas curadas (licença, por que serve, como
  aplicar), destaque para huashu-design e para a trilha de áudio.
- **#41 · Skill `game-audio` (sem API) no portfólio — construída e verificada.**
  Em `ME/PlanejamentoCarreira/skills/game-audio/`. Sintetiza SFX/chiptune/UI do
  zero, **só Python/FFmpeg/Web Audio, sem nenhuma nuvem/chave/conta**. Três
  motores, os três **testados nesta máquina**: Node (`synth.mjs` 6 receitas +
  `chiptune.mjs` loop) e Python 3.12 (`synth.py` stdlib puro) geraram WAVs que
  passaram no validador zero-dep (`validate.mjs`) com **pico −1.00 dBFS, 0
  clipping**; o loop fecha com **seam 0.008** (limite de clique é 0.05) graças ao
  crossfade de emenda. `webaudio-sfx.js` toca no navegador sem baixar arquivo
  (reaproveitável no CHAOS). `convert.sh` (FFmpeg, OGG/MP3/loudnorm) é opcional.
  Descoberta: o Python **não** estava quebrado para isso — o travamento do Avast
  é só em pip/TLS de rede, não em script stdlib local; a doc foi corrigida.
- **#42 · Deploy reconfigurado para SUBPÁGINA `/LEDCHAOS/` (padrão SaiBH) —
  construído e verificado no `dist/`.** A raiz do domínio do Rafael é o portfólio,
  então o CHAOS tem de viver num subcaminho, igual ao SaiBH:
  **`upraggy.github.io/LEDCHAOS/`**. Num subcaminho, três coisas quebram se o base
  não for propagado — assets 404, rota interna erra o prefixo e o QR cai na raiz
  (portfólio). Resolvido com uma **fonte única de base** e um choke-point:
  1. **`src/lib/basePath.js`** — `BASE` (= `import.meta.env.BASE_URL`, sempre com
     `/` no fim) e `asset(path)` que prefixa o base sem duplicar barra. Guarda
     `|| '/'` pra nunca quebrar num import fora do browser.
  2. **Sprites de canvas (6 jogos) num só ponto.** `games/_shared/assets.js` →
     `loadImage` passou a fazer `img.src = asset(url)`. Como climb/trace/piano/
     aim/race/slice **todos** carregam via `preloadImages(IMG_SRC)`, uma linha
     base-prefixou todo sprite de canvas. Cache continua chaveado pela `url` crua.
  3. **`<img>` inline e avatares.** Envolvidos em `asset(...)`: mash (raio),
     memory (level-up + pads), slice (legenda melancia/bomba); `getAvatarImage`
     em `data/avatars.js` agora devolve `asset(...)`.
  4. **Rota interna.** `<BrowserRouter basename={import.meta.env.BASE_URL}>` —
     react-router prefixa Route/Link/navigate sozinho.
  5. **QR externo.** `room/roomLink.js` monta `${origin}${BASE}join/${id}` — o
     convite abre `/LEDCHAOS/join/…`, não a raiz.
  6. **Config.** `vite.config.js` → build assume `base '/LEDCHAOS/'` (dev fica em
     `/` pro QR da LAN); `public/404.html` → `pathSegmentsToKeep = 1`;
     `manifest.webmanifest` → caminhos relativos (`./`, `./icon.svg`);
     `deploy.yml` → `VITE_BASE` default `/LEDCHAOS/`, CNAME segue condicional (não
     escrito no github.io). **Verificado no build:** `dist/index.html` com
     `/LEDCHAOS/icon.svg`, `/LEDCHAOS/manifest.webmanifest` e os chunks
     `/LEDCHAOS/a/*.js|css`; o literal `/LEDCHAOS/` inlinado no bundle JS
     (BASE_URL resolvido); `dist/404.html` com `pathSegmentsToKeep = 1`; manifest
     relativo. `npm test` **57/57**, `npm run build` OK (255 módulos).
- **#43 · Deploy migrado para *Deploy from a branch* + DOMÍNIO PRÓPRIO na raiz.**
  O Rafael habilitou o Pages, **criou o CNAME `ledchaos.rafaelmr.com.br`** (commit
  "Create CNAME" na `main`) e pediu: fonte na `main`, **página no `gh-pages`**. O
  CNAME reverteu a decisão de subpágina do #42 — domínio próprio serve na raiz, e
  base `/LEDCHAOS/` deixaria o site em branco. Confirmado com ele e reconfigurado:
  1. **`deploy.yml` reescrito.** Um job só: `npm ci` → build (`VITE_BASE` `/`) →
     dentro do `dist/` faz `git init` + commit + **force-push pro `gh-pages`** via
     `GITHUB_TOKEN`. Saíram `upload-pages-artifact`/`deploy-pages`.
     `permissions: contents: write`. O `gh-pages` guarda **só o site** (sem
     histórico do código), substituído inteiro a cada deploy; `.nojekyll` desliga
     o Jekyll.
  2. **Base revertida pra raiz** (desfaz o #42): `vite.config.js` base `/`;
     `public/404.html` `pathSegmentsToKeep = 0`; **`CNAME` movido pra
     `public/CNAME`** (Vite copia pro `dist/` → `gh-pages`, fixando o domínio no
     modelo branch). `basePath.js`/`roomLink.js`/`asset()` são base-driven → com
     `BASE='/'` já saem certos, sem tocar em código de jogo. QR vira
     `https://ledchaos.rafaelmr.com.br/join/…`.
  3. **`gh-pages` PUBLICADO pelo CI (ponta a ponta funcionando).** O push da `main`
     (`e50b340`) disparou o workflow, que buildou e **force-pushou o site pro
     `gh-pages`** (`1e677eb`) — o token **já tinha `contents: write`**, sem 403.
     Conteúdo do branch conferido: `CNAME` = `ledchaos.rafaelmr.com.br`,
     `index.html` com refs na raiz (`/a/…`, `/icon.svg`), `404.html` `keep=0`,
     `.nojekyll` presente, 90+ sprites. O seed manual foi recusado só porque o
     branch já existia (o CI chegou antes) — irrelevante. **Sobra só clique/DNS do
     Rafael:** apontar Pages Source no `gh-pages`, DNS `CNAME ledchaos →
     upraggy.github.io` e Custom domain. Docs (`DEPLOY.md`) e #21 atualizados.

## Pronto (fase F7 · transporte P2P)

- **#19 · Adapter de transporte sobre DataChannel (`createP2PHub`) — construído e
  provado 3 vezes.** `src/net/p2pTransport.js` é o **mesmo contrato de hub** do
  loopback e do relay (`connect`/`send`/`onMessage`/`onPeer`/`peers`/`close`), só
  que o cano é WebRTC DataChannel de verdade — estado do host viaja **direto** pro
  celular do convidado, sem servidor no tráfego. Topologia estrela (host tem um
  `peer` por convidado; convidado tem um só, pro host), `peerId` sintético (`g1`,
  `g2`…), entrega sempre assíncrona e **fronteira de autoridade idêntica** (o
  convidado não consegue enviar estado). Como P2P **não tem rendezvous**, o hub
  expõe um `signaling` extra (fora do contrato) pra troca de offer/answer por
  QR/hash — é onde o lobby vai gerar o convite e colar a resposta. **Três provas:**
  (1) `scripts/p2p-contract.test.mjs` — Node puro, **25/25** asserções com par de
  peer fake + codec identidade (blinda o mapeamento DataChannel→contrato);
  (2) seam de integração conferido contra o `webrtc/peer.js` real — cada método
  (`createOffer`/`acceptOffer`/`acceptAnswer`/`onMessage`/`send`/`close`), cada
  evento (`CHANNEL_OPEN`/`CHANNEL_CLOSED`/`CLOSED`/`CONN_STATE`+`detail.state`) e
  as strings de papel (`ROLES.HOST='host'`/`GUEST='guest'`) batem; (3)
  `src/net/p2pSelfCheck.js` — **prova no navegador**: sobe dois hubs REAIS na mesma
  página (peer.js + codec.js de produção), faz o handshake por loopback de WebRTC
  e confere o contrato inteiro num clique. A prova aparece na P2PLab só em **dev**
  (`import.meta.env.DEV`) — o build de produção não a inclui. `npm run build` OK
  (252 módulos). O wiring no `GameProvider` (trocar o loopback pelo P2P com vários
  convidados) é a #20, não esta. Detalhes no cabeçalho de `p2pTransport.js`.

- **#20 · F7-C — "cada celular joga o próprio slot + merge de scores" (metade
  provável construída e provada).** O seam `simulateBots` deixou de ser o fim da
  linha: agora existe o caminho real para o placar de um celular de verdade
  **substituir** a entrada fabricada daquele slot antes de a rodada ser pontuada —
  **sem tocar em nenhum dos 12 microjogos**.
  1. **Vocabulário (`protocol.js`).** `ACT_SCORE` + `scoreReport({round, score,
     display, stat})`. O reporte viaja **dentro de um ACT**, então a fronteira de
     autoridade não abre buraco: `allowedFrom(GUEST, ACT)` continua verdadeiro e
     nada novo precisou ser liberado para o convidado.
  2. **Fusão pura (`net/scoreMerge.js`, sem React/sem rede).** `mergeRealScores`
     sobrepõe o placar real sobre o do bot **só** nos slots que reportaram, recusa
     `score` não-finito (reporte corrompido nunca zera ninguém), nunca muta a
     entrada e marca a cadeira fundida `real:true`. `createScoreLedger` é o
     livro-caixa por rodada: o host grava cada reporte e, quando **sua** rodada
     fecha, `take(round)` pega o que chegou até ali e limpa — fiel à casa, **a
     sala nunca trava esperando a rede** (retardatário fica guardado e não é usado).
  3. **Host consome (`netSession.js`).** `handleAct` intercepta o `ACT_SCORE`
     **antes do bus**: não é input de jogo, então vai para o handler `onGuestScore`
     — e o `playerId` sai do **peer**, não do payload (um convidado não forja o
     placar de outro). O convidado ganhou `sendScore(entry)`; no host é no-op.
  4. **Ponto de fusão (`GameProvider` + `Game/index.jsx`).** O Provider mantém o
     ledger, limpa-o a cada `match.seed` novo e expõe `mergeEntries(round, entries)`.
     O `handleFinish` da tela de jogo funde **exatamente** na borda
     `onFinish → finishRound`. **Com zero convidados conectados, `take()` volta `{}`
     e a fusão é identidade — o jogo local se comporta byte a byte como hoje.**
  5. **Provado duas vezes.** `scripts/scoremerge-contract.test.mjs` — Node puro,
     **32/32**: semântica da fusão (identidade, substituição por playerId, guarda de
     não-finito, imutabilidade, reporte fantasma ignorado), o ledger inteiro
     (record/peek/count/take-limpa/clear), a **virada de colocação real** via o
     `resolveRound` de verdade (p2 fabricado perde → p2 real com 999 vence e leva
     100) e o **ponta-a-ponta sobre o loopback** (convidado `sendScore` → host
     arquiva pelo peer → SCORE **não** vaza pro bus, mas o TAP normal entra → host
     não pode reportar). E `src/net/scoreMergeSelfCheck.js` — a **mesma prova
     clicável dentro do bundle** do Vite, na P2PLab, só em dev. `npm test` roda os
     dois contratos (25/25 P2P + 32/32 fusão); `npm run build` OK (254 módulos).
  6. **O que ainda precisa de 2 aparelhos.** A **fusão** (metade que dá pra provar
     numa página) está pronta e verde. O que falta é a **UX visível**: o celular do
     convidado rodando o microjogo por conta própria (guiado por `onPhase/onRound`)
     e chamando `sendScore` no fim — o runner de jogo do lado convidado. Isso é,
     por natureza, um teste de 2 telas físicas; o seam por baixo já está no lugar e
     documentado (`bots.js` L10-12: "trocar isto é substituir a chamada, não
     reescrever o microjogo").

## Pronto (fase F7-B-direto · cano P2P zero-servidor por 2 QR)

Pedido do Rafael, literal: *"quero um modo de conexão… compartilhando IP via
qrcode"*, *"deixe sem cloudflare relay"*, *"deixei 0 servidor"*, *"Até 8 (sala
cheia)"*, *"não quero precisar usar o Render, quero algo sem precisar de site
externo nenhum"*. Entregue: um **segundo transporte real**, irmão do relay, que
não usa **servidor nenhum** — nem relay, nem rendezvous. Liga o `createP2PHub`
(WebRTC DataChannel, #19) no **fluxo de jogo de verdade**, não numa prova solta.

- **#57 · Flag `direct` na sala.** `CreateRoom` ganhou CONEXÃO = **CELULARES**, que
  grava `settings.direct = true`. Sem o flag (e sem `VITE_RELAY_URL`), o app roda
  idêntico à Fase 1.
- **#58 · Widgets de handshake compartilhados** (`net/qr/handshake.jsx`): `QrImage`,
  `CopyHashRow`, `ImportPanel` (câmera + colar + anexar imagem) — usados pelos dois
  lados do aperto de mão, migrados da P2PLab.
- **#59 · Efeito P2P no host** (`GameProvider.jsx`): quando `directMode &&
  !relayUrl && hostsThisRoom`, abre `createP2PHub()` como HOST com o **mesmo**
  `netSession` do relay (handlers `onJoin/onLeave/onGuestScore`) e expõe
  `hub.signaling` ao Lobby via `directSignaling`. Teardown restaura o loopback.
- **#60 · Painel de convite no Lobby** (`DirectInvite`): **GERAR CONVITE** →
  `signaling.createInvite()` mostra o QR da offer; **COLE A RESPOSTA** →
  `signaling.acceptAnswer(peerId, resposta)` conecta. Um convidado por vez, até a
  sala encher (esconde o gerador no `full`).
- **#61 · Convidado direto** (`Home` → **entrar por QR — modo direto** → `/direct`):
  `screens/DirectGuest/` + `net/useDirectGuest.js`. Lê o convite
  (`signaling.acceptInvite` → answer), mostra o QR da resposta; ao abrir o canal dá
  `hello()` **dentro do `onPeer('join')`** (no P2P o DataChannel só abre depois que
  o host aceita — enviar antes cairia no vazio). A apresentação ao vivo é o **mesmo**
  componente do relay: extraí o `LiveMirror` do `LiveGuest`, e o `LiveGuest` virou
  um wrapper fino do relay. Retry limpo por contador `gen` (remonta hub a cada erro
  de convite, contornando o slot preso do `acceptInvite`).

**Verificação:** `npm run build` OK (261 módulos, sem erros — só o aviso de chunk
>500kB pré-existente). `npm test` verde: **25/25** (p2p-contract) + **32/32**
(scoremerge-contract). Igual ao `useGuestLink`, o convidado direto é **presença +
espelho**, não roda o próprio slot ainda — isso é a F7-C (§9), pendente e honesta.

**Limitação honesta (documentada em `05-FASE2-MULTIPLAYER.md` §10):** o
`createP2PHub` usa **só STUN do Google, sem TURN** (TURN é servidor → fora por
projeto). Mesma Wi-Fi conecta; **4G ↔ Wi-Fi com CGNAT duro pode não fechar** — não
é bug, é a física do NAT sem TURN. Nesse caso, o caminho é a mesma rede ou o relay
(F7-B). **Prova real = 2 celulares**, roteiro passo a passo no §10.

## Próximos passos

1. **#21 · Deploy no GitHub Pages (DOMÍNIO PRÓPRIO na raiz, modelo *branch*)** —
   **código na `main` + `gh-pages` JÁ PUBLICADO pelo CI** (ver #43): o workflow
   rodou, buildou e empurrou o site pro `gh-pages` sem 403 (o token já tinha
   escrita). O pipeline técnico está **fechado**. Falta **só clique/DNS do
   Rafael**, no navegador externo dele — e a permissão de escrita já provou estar
   ok, então o passo de Workflow permissions vira só conferência:
   1. GitHub → **Settings ▸ Pages ▸ Source = "Deploy from a branch"** ▸
      Branch **`gh-pages`** ▸ `/ (root)` ▸ Save. **(passo crítico — sem isto o
      Pages não serve o `gh-pages`.)**
   2. **DNS** no provedor do `rafaelmr.com.br`: **CNAME** `ledchaos` →
      `upraggy.github.io` (sem `https://`, sem barra).
   3. GitHub → **Settings ▸ Pages ▸ Custom domain** = `ledchaos.rafaelmr.com.br` ▸
      Save (ele pode já ter feito ao criar o CNAME) ▸ marcar **Enforce HTTPS**
      quando o GitHub validar o DNS.
   4. Conferir o site em **`https://ledchaos.rafaelmr.com.br/`** (após validação de
      DNS/HTTPS) — e dar **F5 numa rota profunda** (`/join/XXXX`) pra provar o
      404.html. Passo a passo completo em `docs/DEPLOY.md`.
   *(Conferência opcional: Settings ▸ Actions ▸ General ▸ Workflow permissions =
   "Read and write permissions" — já efetivo, mas bom garantir pros deploys
   futuros.)*
2. **F7-C — runner do lado convidado (precisa de 2 aparelhos).** A fusão de placares
   já está pronta e provada; falta a UX do convidado rodando o microjogo por conta
   própria e reportando `sendScore` no fim. Só valida com 2 telas físicas.
3. **Verificação visual pixel-a-pixel** — ver nota abaixo (o único passo que não
   consigo me auto-servir).

## Verificação visual — via Visual Inspector (:3100)

O QA visual agora **está funcionando** pelo Visual Inspector (LAN :3100):
`browser_navigate` → `browser_screenshot` → decodifica o base64 e leio o PNG.
Foi assim que confirmei a cor por jogo e o fim do fundo marrom (mash, aim, race,
draw, climb). Ressalva conhecida: o `requestAnimationFrame` pausa quando o painel
do navegador está oculto — com o Inspector no ar isso deixa de bloquear, mas os
canvases (dino, fatiar) precisam de uma tela ativa para animar no screenshot.

---

## Conexão (fase anterior — F7-B, concluída)

Transporte WS real (`createRelayHub`), relay burro (`server/relay.js`),
presença bot↔humano, companion ao vivo (`/live/:code`). Detalhes em
`docs/05-FASE2-MULTIPLAYER.md` §9.

**F7-C — estado atual (parcial, honesto):** a **fusão de placares** está feita e
provada (32/32 em Node + prova clicável na P2PLab) — o host já sabe trocar a
entrada fabricada de um slot pelo placar real que aquele celular reportou, antes
de pontuar a rodada, **sem reescrever os 12 microjogos** e com identidade byte a
byte quando não há convidado. O que **ainda falta** é a ponta visível: o convidado
rodando o microjogo por conta própria (guiado por `onPhase/onRound`) e chamando
`sendScore` no fim — o runner de jogo do lado convidado. Essa metade é um teste de
2 telas físicas; o seam por baixo (`simulateBots` → `mergeEntries`) já está no
lugar. Ver a entrada **#20** em "Próximos passos" acima.
