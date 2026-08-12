# 06 — OS 12 MICROJOGOS

> Referência de quem já está no jogo + receita para colocar o 13º.
> A fonte da verdade é sempre `src/games/<id>/index.js`. Esta tabela é um resumo — se
> divergir do código, o código está certo.

---

## 1) Tabela

| # | id | Nome | Emoji | hue | Categoria | Duração | Como se joga (1 frase) |
|---|---|---|---|---|---|---|---|
| 1 | `reaction` | REFLEXO | ⚡ | 190 | reflex | 15s | Toque assim que a tela acender; 3 chances, vale a mais rápida. |
| 2 | `slice` | FATIAR | 🔪 | 96 | precision | 30s | Arraste o dedo cortando o que sobe; bomba encerra. |
| 3 | `draw` | DESENHAR | 🎨 | 280 | creative | 30s | Desenhe a palavra com o dedo; acertar o palpite dos outros pontua. |
| 4 | `climb` | ESCALAR | 🧗 | 210 | platform | 30s | Segure ← ou → para mirar a queda; o pulo é automático. |
| 5 | `rhythm` | BATIDA | 🎵 | 320 | timing | 26s | Toque a faixa no instante em que o bloco cruza a linha. |
| 6 | `memory` | MEMÓRIA | 🧠 | 265 | memory | 30s | Veja a sequência e repita; ela cresce a cada nível. |
| 7 | `aim` | MIRA | 🎯 | 8 | reflex | 20s | Acerte os alvos, não toque nos ✕. |
| 8 | `tictactoe` | DUELO | ⚔️ | 45 | strategy | 25s | Três em linha, o máximo de vezes antes do tempo acabar. |
| 9 | `mash` | MARTELO | 👆 | 25 | speed | 15s | Toque sem parar; a barra desce sozinha se você parar. |
| 10 | `race` | CORRIDA | 🏁 | 170 | reflex | 25s | Desvie dos blocos, pegue as setas, vá o mais longe possível. |
| 11 | `grow` | CRESCER | 🔵 | 140 | reflex | 30s | Arraste para mover, colete esferas e cresça. |
| 12 | `dodge` | DESVIAR | 💥 | 300 | reflex | 30s | Arraste para mover, pegue cristais, fuja das minas. |

Todos: `minPlayers: 2`, `maxPlayers: 8`.
Categorias em uso: `reflex` `precision` `creative` `platform` `timing` `memory` `strategy` `speed`.
`hue` tinge a rodada inteira (`--game-hue`) — intro, contagem, HUD e resultado.

## 2) Entrada mobile por jogo

O celular é o alvo, não uma adaptação. Cada jogo usa **um** gesto dominante:

| Gesto | Jogos | Implementação |
|---|---|---|
| Toque simples | `reaction` `aim` `memory` `tictactoe` `rhythm` `mash` | DOM ou canvas + `attachPointer` |
| Arrasto contínuo | `slice` `draw` `grow` `dodge` | ponteiro amostrado no loop, `setPointerCapture` |
| Segurar (hold) | `climb` `race` | `_shared/HoldButton.jsx` |

Nenhum jogo depende de `hover`, de precisão de mouse, nem de duas mãos obrigatórias.
Ver `07-MOBILE.md` para as regras de área de toque, safe-area e teste em aparelho.

## 3) Chaos Events aceitos (`supports`)

`✓` = o jogo honra o efeito. Vazio = ignora **de propósito** (não é bug).

| id | scoreMultiplier | timeScale | sizeScale | invert | hidden | oneLife |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `reaction` | ✓ | | | ✓ | | |
| `slice` | ✓ | ✓ | ✓ | | | ✓ |
| `draw` | ✓ | | ✓ | | | |
| `climb` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `rhythm` | ✓ | | ✓ | ✓ | ✓ | |
| `memory` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `aim` | ✓ | ✓ | ✓ | | ✓ | |
| `tictactoe` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `mash` | ✓ | ✓ | ✓ | | ✓ | |
| `race` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `grow` | ✓ | ✓ | ✓ | ✓ | ✓ | |
| `dodge` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

`scoreMultiplier` está em todos porque quem aplica é o `scoreManager` — o jogo só declara.
`chaosEvents.js` **filtra** o sorteio por esta lista: um evento que nenhum jogo da rodada
suporta nunca é sorteado, então não existe card de CHAOS que não faça nada.

## 4) Conquistas — quem alimenta o quê

A tela final só mostra conquista que teve dado real. Quem produz `stat`:

| Chave | Conquista | Direção | Jogo que emite |
|---|---|---|---|
| `reactionMs` | ⚡ REFLEXO MAIS RÁPIDO | menor | `reaction` |
| `artistScore` | 🎨 MELHOR ARTISTA | maior | `draw` |
| `climbHeight` | 🧗 SUBIU MAIS ALTO | maior | `climb` |
| `accuracy` | 🎯 MELHOR PRECISÃO | maior | `aim` |
| `combo` | 🎵 MAIOR COMBO | maior | `rhythm` |
| `taps` | 👆 MAIS TOQUES | maior | `mash` |
| — | 🔥 MAIOR SEQUÊNCIA | maior | derivada do histórico (≥ x2) |

Os outros 6 jogos não emitem `stat` — é opcional e forçar um número inventado só polui a
tela final. Regras em `engine/resultManager.js` (`STAT_RULES`).

## 5) Ferramentas compartilhadas (`src/games/_shared/`)

Não reimplemente nada disto:

| Arquivo | O que dá |
|---|---|
| `hooks.js` | `useGameClock` (relógio da rodada), `useRaf` (loop com dt travado), `useCanvasSize` (resize + DPR ≤ 2), `readCssColors` (Canvas **não** lê `var(--token)`), `useFinishOnce`, `useLatest`, `useOutcome` + `END_HOLD` |
| `bots.js` | `simulateBots`, `scaled`, `scheduleActions`, `withLocal`, `paceValue` |
| `joystick.js` | `useJoystick`, `paintJoystick`, `STICK_RADIUS` |
| `HoldButton.jsx` | botão de segurar com `setPointerCapture` + `onPointerCancel` |
| `RivalBars.jsx` | barras de progresso dos rivais durante a partida |
| `game.css` | classes de layout comuns aos microjogos |

## 6) Receita do 13º microjogo

1. **Escolha uma interação só.** Se precisa de duas frases para explicar, não cabe em 20s.
2. `mkdir src/games/<id>/` com `index.js` (metadata), `<Nome>.jsx` (gameplay), `<Nome>.css`.
3. `index.js` exporta o objeto de metadata — contrato completo em `01-ARQUITETURA.md` §2.
4. Importe em `engine/gameRegistry.js` e adicione ao array `RAW`. **Só isso.** Nada mais no app
   precisa saber que ele existe.
5. Produza entrada para **todos** os jogadores, bots inclusive (`_shared/bots.js`).
6. Feche em dois tempos: mostre o `GameResult` por `END_HOLD` e **depois** chame `onFinish`
   (use `useOutcome`, que já faz isso). Quem chama `onFinish` direto rouba do jogador a única
   chance de ver o que fez.
7. Declare em `supports` só o que você realmente implementou.
8. Teste: 2 jogadores, 8 jogadores, com cada chaos event que você declarou, e no celular.

**Checklist de aceitação** (o que reprova um microjogo):

- [ ] chama `onFinish` exatamente uma vez;
- [ ] limpa rAF, timers e listeners no unmount (nada rodando depois do resultado);
- [ ] funciona com o dedo, sem `hover`, alvos ≥ 44px;
- [ ] `sizeScale` aplicado ao **teto de tamanho**, nunca via `transform: scale()` em coisa tocável;
- [ ] `timeScale` afeta a simulação, **nunca** o relógio da rodada;
- [ ] sem `Math.random()` na pintura (use `rng` ou seno determinístico);
- [ ] toda aleatoriedade de jogo vem do `rng` recebido por prop.

## 7) Física — qual modelo usar

- **Um corpo móvel** contra cenário (`race`) → **colisão varrida** (*swept*). Em dt grande o
  corpo atravessaria o obstáculo; o teste varrido pega a passagem inteira.
- **Dois ou mais corpos móveis** (`grow`, `dodge`) → **sub-passos**, `MAX_STEP = 0.016`. Varrer
  todos contra todos fica caro e ainda erra; passo pequeno resolve.
- Arena em unidades de `u = Math.min(w, h)`: `aw = w/u`, `ah = h/u`. O mundo tem o mesmo tamanho
  relativo num iPhone SE e num tablet.
