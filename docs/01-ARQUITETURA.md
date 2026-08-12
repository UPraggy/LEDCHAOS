# 01 — ARQUITETURA & CONTRATOS

> Contratos são a parte que **não pode** ser quebrada sem atualizar os 12 microjogos.
> Se você só vai criar/ajustar um microjogo: **§2, §3, §9, §10** e a receita em `06-MICROGAMES.md` §6.
> O resto é motor.

---

## 1) Fluxo de dados

```text
                      GameProvider (state/)
                              │  estado único: room + match + players
                              ▼
                        screens/Game
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
  engine/roundManager   games/<id>/Component   engine/scoreManager
  (sorteia jogo +       (gameplay puro,        (ranking → pontos
   chaos event)          isolado, canvas/DOM)   → streak → stats)
```

Entrada de comandos (hoje local, amanhã rede):

```text
                 games/<id>/Component
                          ▲
                          │  ações normalizadas
                    engine/inputManager  (action bus)
                          ▲
              ┌───────────┼───────────────┐
        pointer/teclado   │          bots simulados
        (jogador humano)  │
                    net/netSession  ← ação de outro aparelho (F7-A, hoje em loopback)
```

Ação normalizada — **este é o formato que a rede injeta**:

```js
{ type: 'PLAYER_ACTION', playerId: 'p2', action: 'TAP', payload: { x: 0.5, y: 0.3 }, t: 12345 }
```

O ramo `net/` **já existe e já funciona** — hoje sobre um hub em memória, sem rede nenhuma
(`05-FASE2-MULTIPLAYER.md` §8). Uma ação que entra por ele chega ao microjogo com `remote: true`
e nada mais de diferente: **nenhum dos 12 microjogos sabe de onde veio o comando**, e é
exatamente essa ignorância que faz o transporte real ser plugável depois.

Ações: `TAP` `PRESS` `RELEASE` `MOVE` `MOVE_LEFT` `MOVE_RIGHT` `SWIPE` `DRAW` `SELECT`.

## 2) CONTRATO DO MICROJOGO ⚠️

`src/games/<id>/index.js` exporta **default** um objeto de metadata:

```js
{
  id: 'reaction',            // único, igual ao nome da pasta
  name: 'REACTION',          // exibido em caixa alta
  emoji: '⚡',
  hue: 45,                   // 0-360: tinge a UI da rodada (--game-hue)
  category: 'reflex',        // reflex | precision | creative | platform | timing | memory | strategy | speed
  instruction: 'TOQUE QUANDO ACENDER',   // ensina em <5s, aparece no intro
  duration: 15000,           // ms — teto da rodada
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier','timeScale','invert','sizeScale','hidden'], // chaos effects que ele honra
  Component: ReactionGame,   // componente React do gameplay
}
```

O **Component** recebe:

```js
{
  players,        // [{id,name,avatar,color,skill,isBot}] — já filtrado p/ maxPlayers
  localPlayerId,  // id do jogador humano
  duration,       // ms — o teto CRU da rodada. NÃO leva timeScale (ver §3)
  effects,        // ver §3
  rng,            // rng determinístico da rodada — roundRng(seed, round)
  bus,            // action bus (engine/inputManager)
  sound,          // { play, note } — audio/soundManager
  round,          // nº da rodada atual (1-based)
  totalRounds,    // 5 | 7 | 10
  onFinish,       // (entries) => void  — CHAME EXATAMENTE UMA VEZ
}
```

`onFinish(entries)` — array com **um item por jogador**:

```js
[
  { playerId: 'p1', score: 99858, display: '142ms', stat: { reactionMs: 142 } },
  { playerId: 'p2', score: 99719, display: '281ms', stat: { reactionMs: 281 } },
]
```

- `score`: número onde **maior = melhor** (o engine ordena desc). Se a métrica natural for
  "menor é melhor" (tempo), converta: `score = BIG - ms`.
- `display`: string curta mostrada no resultado da rodada (`'142ms'`, `'92m'`, `'87%'`).
- `stat` (opcional): métricas para as conquistas finais. Chaves reconhecidas em
  `engine/resultManager.js` (`STAT_RULES`) — hoje: `reactionMs`(min), `climbHeight`(max),
  `accuracy`(max), `artistScore`(max), `combo`(max), `taps`(max).

**Obrigações do Component**

1. Chamar `onFinish` **uma única vez** (`useFinishOnce` já guarda isso).
2. Limpar tudo no unmount (rAF/timers/listeners/áudio). Nada pode continuar rodando depois do
   resultado.
3. Funcionar com 2 jogadores e degradar bem com 8.
4. Produzir entradas para **todos** os jogadores (bots incluídos) — `games/_shared/bots.js`.
5. Nunca depender de `hover` ou de mouse preciso.
6. **Fechar em dois tempos** (ver abaixo).

### Fechamento em dois tempos ⚠️

`onFinish` desmonta o microjogo na hora. Chamar direto no último toque significa que o jogador
**nunca vê o que fez** — a tela troca antes do olho registrar.

O contrato é: o microjogo desenha o **próprio** `GameResult` por `END_HOLD` (1100ms) e só então
chama `onFinish`. `games/_shared/hooks.js` faz isso pronto:

```js
const { outcome, finish } = useOutcome(onFinish);   // finish(entries) → mostra, espera, encerra
if (outcome) return <GameResult entries={outcome} />;
```

## 3) Chaos Events → `effects`

`engine/chaosEvents.js` sorteia (nem toda rodada tem) e entrega um objeto plano:

```js
{
  scoreMultiplier: 2,   // DOUBLE SCORE — aplicado pelo scoreManager, o jogo ignora
  timeScale: 1,         // SPEED UP 1.5 / SLOW MOTION 0.6 — afeta duração e velocidades
  invert: false,        // INVERTED — inverte eixo/controles
  sizeScale: 1,         // TINY 0.6 / GIANT 1.6 — escala de alvos/jogador
  hidden: false,        // HIDDEN — reduz visibilidade (vinheta/piscar)
  oneLife: false,       // ONE LIFE — primeiro erro encerra a participação
}
```

O microjogo honra o que faz sentido para ele (declare em `supports`). Não honrar um efeito é
aceitável; **quebrar por causa dele não é**. `eventsFor(game)` filtra o sorteio por `supports`,
então um evento que ninguém honra nunca aparece na tela.

**Duas regras que já foram quebradas e não podem voltar a ser:**

- **`timeScale` escala a SIMULAÇÃO, nunca o relógio da rodada.** ACELERADO deixa os obstáculos
  mais rápidos; ele **não** encurta os 30 segundos. Se o relógio encolhesse, o watchdog (que conta
  `duration + folga`) e o HUD passariam a discordar do jogo. Por isso o Component recebe `duration`
  cru — multiplicar é decisão de quem simula.
- **`sizeScale` se aplica ao TETO DE TAMANHO, nunca via `transform: scale()` em coisa tocável.**
  MINÚSCULO com `scale(0.6)` encolhe junto a área de toque e mata os 44px mínimos. Calcule o raio
  já escalado; deixe a área de toque fora da conta.

## 4) Máquina de estados da partida

```text
LOBBY → MATCH_START → GAME_INTRO → COUNTDOWN → PLAYING
      → GAME_FINISHED → ROUND_RESULT → (próxima rodada) → … → FINAL_SCORE
```

`state.match`:

```js
{ phase:'playing', round:3, totalRounds:7, currentGameId:'reaction', chaosEvent:null, history:[] }
```

Transições ficam em `screens/Game/index.jsx`. **Nenhuma fase espera clique:** intro, contagem e
resultado avançam por timer (`TIMING` em `roundManager.js`); a fase de jogo avança quando o
microjogo chama `onFinish`. A partida é contínua, sem botão entre rodadas.

## 5) Pontuação

`engine/scoreManager.js`:

| Posição | Pontos |
|---|---|
| 1º | 100 |
| 2º | 75 |
| 3º | 50 |
| 4º+ | 25 |

- Empate: mesma posição, mesmos pontos.
- `scoreMultiplier` do Chaos Event multiplica os pontos da rodada.
- **Streak:** vitórias consecutivas. Bônus `+25` a partir da 2ª (`x2 → +25`, `x3 → +50`, teto `+100`).

## 6) Estrutura de pastas

```text
src/
├── components/   Screen Button IconButton Logo PlayerAvatar PlayerCard Countdown Timer
│                 ScoreBadge GameHeader GameResult ChaosEventBanner QRCode ProgressBar
│                 ErrorBoundary RotateHint IdentityForm SegmentedControl DebugPanel/
├── screens/      Home CreateRoom JoinRoom Lobby Game (+RoundResult.jsx) FinalScore
├── games/        reaction slice draw climb rhythm memory aim tictactoe mash race grow dodge
│   └── _shared/  hooks.js bots.js joystick.js HoldButton.jsx RivalBars.jsx game.css
├── engine/       gameRegistry roundManager scoreManager resultManager
│                 chaosEvents botProfile inputManager random
├── room/         roomManager roomCode roomLink
├── audio/        soundManager
├── net/          protocol (mensagens + autoridade) transport (contrato + loopback) netSession
├── state/        gameState (reducer puro) GameProvider.jsx (contexto)
├── data/         players words avatars
└── styles/       tokens.css global.css
```

Cada componente é `<Nome>/index.jsx` + `<Nome>.css`. Três arquivos do plano original **não
existem** e não devem ser recriados: `engine/gameManager.js` (virou `gameRegistry` + `roundManager`),
`engine/useRafLoop.js` e `engine/useCountdown.js` (viraram `games/_shared/hooks.js`, junto do
resto do que só microjogo usa).

### `games/_shared/` — não reimplemente

| Arquivo | Dá |
|---|---|
| `hooks.js` | `useGameClock` `useRaf` `useCanvasSize` `readCssColors` `useFinishOnce` `useLatest` `useOutcome` `END_HOLD` |
| `bots.js` | `simulateBots` `scaled` `scheduleActions` `withLocal` `paceValue` |
| `joystick.js` | `useJoystick` `paintJoystick` `STICK_RADIUS` |
| `HoldButton.jsx` | botão de segurar (`setPointerCapture` + `onPointerCancel`) |
| `RivalBars.jsx` | barras de progresso dos rivais durante a rodada |

**`readCssColors(el, names)` existe porque Canvas não enxerga `var(--token)`.** Um `ctx.fillStyle =
'var(--color-accent)'` é silenciosamente ignorado. Leia os tokens uma vez no mount e guarde.

**`useCanvasSize` trava o DPR em 2.** Celular com DPR 3 ou 4 quadruplica a área a pintar sem ganho
visível — é a diferença entre 60fps e 25fps num aparelho intermediário.

## 7) Persistência

Só `localStorage`, chave `chaos.room.v1` (sala/jogadores/placar) e `chaos.prefs.v1` (som).
Serve para sobreviver a refresh no desenvolvimento. **Não é banco** e não sincroniza nada.

## 8) Robustez

- `components/ErrorBoundary` envolve o microjogo, com `resetKey={round}`. Erro → tela `ERRO NO JOGO`
  → `ERROR_HOLD` (1800ms) → próxima rodada. Ninguém perde pontos.
- **Watchdog:** se o jogo não chamar `onFinish` até `duration + WATCHDOG_GRACE` (4000ms), o engine
  aborta a rodada e segue. É por isso que `timeScale` não pode encolher o relógio (§3) — watchdog e
  jogo passariam a contar coisas diferentes.
- Fila apontando para jogo inexistente → tela `DESAFIO INDISPONÍVEL` → pula em 600ms.
- Rota `/join/:id` com código inválido cai numa tela de erro navegável. Rota desconhecida cai no
  `*` → Home. **Nunca tela branca.**
- `gameRegistry` **descarta** metadata inválida com `console.warn` em vez de derrubar o app: uma
  partida com 11 jogos ainda é uma partida.

## 9) Regras de simulação (canvas)

Descobertas escrevendo os 12 — valem para o 13º:

- **Um corpo móvel** contra cenário (`race`) → **colisão varrida** (*swept*). Com dt grande o corpo
  atravessa o obstáculo entre dois frames; o teste varrido cobre o trajeto inteiro.
- **Dois ou mais corpos móveis** (`grow`, `dodge`) → **sub-passos**, `MAX_STEP = 0.016`. Varrer
  todos contra todos custa caro e ainda erra.
- **Arena em unidades de `u = Math.min(w, h)`** → `aw = w/u`, `ah = h/u`. O mundo tem o mesmo
  tamanho relativo num iPhone SE e num tablet. Sem isso, telas altas viram jogos fáceis.
- **`dt` travado** (`useRaf` limita a 50ms). Aba em segundo plano devolve um `dt` gigante; sem teto,
  o jogador reaparece do outro lado do mapa.
- **Nada de `Math.random()` na pintura.** Tremor cosmético usa seno determinístico do tempo. Duas
  máquinas pintando o mesmo frame de formas diferentes é o começo do fim para a Fase 2 — e mesmo
  hoje, `Math.random()` num loop de 60fps cintila.
- Toda aleatoriedade de jogo vem do `rng` recebido por prop, nunca de `Math.random()`.

## 10) Entrada contínua: AMOSTRADA, não transmitida

`_shared/joystick.js` e os jogos de arrasto **não** reagem a cada evento de ponteiro. Eles guardam
a posição atual e o loop **lê** essa posição uma vez por frame.

Parece detalhe e não é: um dedo arrastando gera ~120 eventos/s. Transmitir isso pela rede na Fase 2
é impossível; amostrar dá ~15 leituras/s significativas. A decisão está tomada agora para não
precisar reescrever os 4 jogos de arrasto depois.

Ponteiro: sempre `setPointerCapture` + `onPointerCancel`. Sem o cancel, uma chamada telefônica no
meio do arrasto deixa o dedo "grudado".

## 11) Ferramentas de dev

- **`DebugPanel/useDebugGesture.js`** — liga o modo debug: tecla `D` (navegador) ou 4 toques em
  1,5s num hotspot de 56px no canto superior esquerdo (celular). O listener é de **fase de captura**,
  porque os microjogos capturam o ponteiro e comeriam o gesto.
- **`DebugPanel/DevOnly.jsx`** — a única porta que o app conhece. Existe para o painel **sumir do
  build de produção**, e o detalhe importa: `{import.meta.env.DEV && <Panel/>}` com `import`
  **estático** apaga o painel da tela mas **não** do arquivo — o bundler é obrigado a incluir o
  módulo. Só um `import()` **dinâmico** dentro de um ramo comprovadamente morto é eliminado.
  Medido: −4,5 kB de JS e −2,3 kB de CSS.
- `DebugPanel` é montado em `App.jsx`, fora das rotas — assim o gesto vale em qualquer tela e o
  painel não fecha sozinho a cada troca de fase.
- **Não existe `<StrictMode>`**, de propósito: o duplo-mount de dev dispara duas vezes os efeitos
  que iniciam áudio, rAF e timers de rodada, e o ruído resultante escondia bug de verdade. A
  contrapartida é que limpeza de efeito precisa ser verificada na mão — ver a checklist em
  `06-MICROGAMES.md` §6.
