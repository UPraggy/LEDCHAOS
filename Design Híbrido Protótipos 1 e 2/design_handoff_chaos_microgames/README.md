# Handoff: CHAOS — 10 microjogos jogáveis + modos de partida

## Visão geral

Este pacote descreve a evolução do protótipo do **CHAOS — Microgame Party** (jogo de festa
mobile-first, 2–8 jogadores, rodadas de 15–30s). Ele cobre três frentes:

1. **Dez microjogos com mecânica real** (não mais placeholders): CORTA FRUTA, RITMO, NA MOSCA,
   CORRIDA, CONTORNO, ESCALADA, PIANO TILE, MIRA, MEMÓRIA e MARTELO.
2. **Arte nova** — todos os avatares, ícones, selos e obstáculos passaram de SVG desenhado à mão
   para PNGs cartoon com contorno grosso (pasta `assets/`), incluindo sprites pixel-art para a
   CORRIDA.
3. **Dois modos de partida novos**: *PARTIDA* (escolher quais microjogos entram no sorteio) e
   *JOGO ÚNICO* (a partida inteira roda um microjogo só).

## Sobre os arquivos de design

O arquivo `CHAOS Prototipo.dc.html` deste pacote é uma **referência de design em HTML** — um
protótipo navegável que mostra aparência e comportamento pretendidos. **Não é código de produção
para copiar.** A tarefa é **recriar estes designs dentro do codebase CHAOS existente**
(React 18 + JSX sem TypeScript + Vite 5 + CSS puro com design tokens + Canvas 2D + Web Audio),
seguindo os contratos já estabelecidos em `docs/01-ARQUITETURA.md` e a receita de
`docs/06-MICROGAMES.md` §6.

O protótipo é um único componente com estado próprio porque essa é a forma do ambiente onde foi
feito. **No repo real cada microjogo é uma pasta isolada** (`src/games/<id>/`) que recebe props e
chama `onFinish` uma vez. A lógica de cada jogo descrita abaixo é fiel ao protótipo e foi escrita
para ser transposta quase linha a linha para dentro de um `Component` que usa `useRaf` /
`useGameClock` / `useOutcome` de `src/games/_shared/hooks.js`.

## Fidelidade

**Alta fidelidade (hifi).** Cores, tipografia, espaçamentos, durações de animação e valores de
física são finais e estão listados abaixo. A UI deve ser recriada fielmente usando os tokens do
`src/styles/tokens.css` — onde um valor deste documento divergir de um token existente, **o token
manda**, e o valor aqui indica a intenção (ex.: "amarelo de destaque" = `--c-accent`).

---

## 1. Contrato que cada microjogo novo precisa cumprir

Vale para **todos** os itens da seção 3. Repetido aqui para não precisar abrir outro documento:

```js
// src/games/<id>/index.js
import Componente from './Componente.jsx';

export default {
  id: '<id>',                 // igual ao nome da pasta
  name: 'NOME',               // caixa alta
  emoji: '🎮',
  hue: 0,                     // 0-360, tinge a rodada via --game-hue
  category: 'reflex',         // reflex|precision|creative|platform|timing|memory|strategy|speed
  instruction: '…',           // ensina em menos de 5s
  duration: 30000,            // ms, teto cru da rodada (NÃO aplicar timeScale aqui)
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale'],
  Component: Componente,
};
```

Depois: importar em `src/engine/gameRegistry.js` e adicionar ao array `RAW`. Nada mais no app
precisa saber que o jogo existe.

O `Component` recebe `{ players, localPlayerId, duration, effects, rng, bus, sound, round,
totalRounds, onFinish }` e deve:

- chamar `onFinish(entries)` **exatamente uma vez**, com um item por jogador
  (`{ playerId, score, display, stat? }`), `score` sempre "maior = melhor";
- gerar entrada também para os bots — usar `simulateBots` / `scaled` de `_shared/bots.js`;
- fechar em dois tempos: desenhar o próprio `GameResult` por `END_HOLD` (1100 ms) e só então
  chamar `onFinish` — `useOutcome` já faz isso;
- limpar rAF, timers e listeners no unmount;
- usar `rng` (nunca `Math.random()`) para toda aleatoriedade de jogo;
- alvos tocáveis ≥ 44 px, sem depender de `hover`.

**Aviso de dependência:** o protótipo simula os bots com um sorteio simples
(`skill.min + rng() * (skill.max - skill.min)`). No repo, use `_shared/bots.js` — os valores de
"performance esperada" de cada jogo estão na tabela de bots (seção 3.11) e devem alimentar
`paceValue`/`scaled`, não uma nova simulação paralela.

---

## 2. Modos de partida (novo)

### 2.1 Estado

Três campos novos no `state/gameState.js` (reducer puro), persistidos junto com as opções da sala:

| Campo | Tipo | Default | Significado |
|---|---|---|---|
| `mode` | `'partida' \| 'unico'` | `'partida'` | Modo da partida |
| `picked` | `string[]` | todos os ids do registry | Microjogos habilitados no sorteio |
| `soloGame` | `string` | `'slice'` | Microjogo do modo JOGO ÚNICO |

Ações: `SET_MODE`, `TOGGLE_GAME` (liga/desliga um id em `picked`; **nunca deixa a lista vazia** —
desmarcar o último é no-op), `SET_SOLO_GAME`.

### 2.2 Efeito no sorteio

`engine/roundManager.js` hoje sorteia sobre todo o registry. Passa a sortear sobre a **fila
efetiva**:

```js
function effectiveQueue(state, registry) {
  if (state.mode === 'unico') return [state.soloGame];
  const list = registry.filter((g) => state.picked.includes(g.id));
  return list.length ? list : registry;          // fallback defensivo
}
```

No modo `unico` a partida roda o mesmo microjogo em todas as rodadas (5, 7 ou 10) — o número de
rodadas continua valendo. Nenhum microjogo precisa saber em que modo está.

### 2.3 UI — tela CRIAR SALA

Dois blocos novos, inseridos **entre** o card branco do avatar/nome e o bloco "DURAÇÃO DA
PARTIDA", usando exatamente o mesmo padrão visual dos seletores já existentes:

**a) MODO** — rótulo `Space Grotesk 11px/700, letter-spacing .2em, uppercase, #CFC4FF`, seguido do
trilho: `display:flex; gap:6px; padding:6px; border:4px solid #170F3E; border-radius:22px;
background:#2A1C74; box-shadow:0 5px 0 #170F3E`. Dois botões `flex:1`, `min-height:48px`,
`border-radius:14px`, `border:3px solid`. Selecionado: fundo `#FFCE31`, borda `#170F3E`, texto
`#170F3E`. Não selecionado: fundo transparente, borda `rgba(255,253,247,.18)`, texto `#E7E0FF`.
Rótulos: **PARTIDA** e **JOGO ÚNICO**, 17px/800.

**b) MICROJOGOS NA PARTIDA** (título vira **ESCOLHA O MICROJOGO** quando `mode === 'unico'`) —
grade `grid-template-columns: repeat(2,1fr); gap:7px`. Cada célula é um botão
`min-height:54px; padding:6px 10px; border-radius:16px; border:3px solid; display:flex; gap:9px;
align-items:center` com o ícone do jogo (28×28, `object-fit:contain`) e o nome
(14px/800, uppercase, elipse no overflow). Ligado: fundo `#FFCE31`, borda `#170F3E`, texto
`#170F3E`, `opacity:1`. Desligado: fundo `rgba(255,253,247,.1)`, borda `rgba(255,253,247,.2)`,
texto `#E7E0FF`, `opacity:.5`. Ativo (`:active`): `transform: scale(.95)`.

Em `mode === 'partida'` a grade é **multi-seleção**; em `mode === 'unico'` é **seleção única**.

---

## 3. Os microjogos

Nomenclatura: **id do protótipo → destino no repo**. Onde já existe um jogo com a mesma ideia, o
trabalho é substituir a mecânica/arte do existente; onde não existe, é pasta nova.

### 3.1 CORTA FRUTA — `slice` (existente, revisar)

- **hue** 96 · **duração** 30 000 ms · **categoria** `precision` · gesto: arrasto contínuo.
- Objetos sobem do fundo em arco balístico. Spawn a cada `760 / timeScale` ms, 1 objeto (65%) ou
  2 (35%).
- Cada objeto: `x` inicial `14 + rng()*72` (% da arena), `y = 112%`,
  `vx = (50 - x) * 0.22 + (rng()*16 - 8)`, `vy = -(104 + rng()*16) * sqrt(timeScale)`,
  gravidade `108 * timeScale` %/s², rotação inicial aleatória e `spin` de `-110..110`°/s.
  Tamanho `60 + rng()*16` px (com `sizeScale`: `40 + rng()*8`). Removido ao passar de `y > 128%`.
- 22% dos objetos são bomba (`assets/jogo/bomba.png`); o resto sorteia entre melancia, coração,
  gema, moeda e chama (`assets/jogo/*.png`).
- Corte: enquanto o ponteiro está pressionado, a cada `pointermove` converte-se a posição para %
  da arena e testa-se cada objeto com tolerância `|Δx| < 11` e `|Δy| < 9` (a tolerância inclui um
  peso de 0,15 sobre o ponto anterior, o que cobre movimentos rápidos entre frames).
- Pontuação: fruta `+10`, bomba `-30` (piso 0). Combo incrementa a cada fruta e **zera** ao
  soltar o dedo ou cortar bomba; o selo `COMBO xN` aparece a partir de 3.
- Feedback: fruta → `assets/efeitos/anel-fogo.png` 76 px com `burst 420ms`; bomba →
  `assets/efeitos/explosao.png` 96 px + `shake 320ms` na arena. Número flutuante `+10`/`-30`
  (JetBrains Mono 22px/800, contorno 5px `#170F3E`) com `scorePop 700ms`.
- Rastro do dedo: até 9 pontos, círculos `#FFFDF7` de `4 + i*1.4` px, `opacity 0.12 + i*0.09`.
- **onFinish**: `score = pontos * 6`, `display = '<pontos> pts'`.

### 3.2 RITMO — `rhythm` (existente, reescrever para 4 teclas)

- **hue** 320 · **duração** 30 000 ms · **categoria** `timing` · gesto: toque + segurar.
- Pista vertical com **4 faixas** de 25%, linha de acerto em `top: 82%`. Cores das faixas:
  `#7BE86A`, `#FF6B8B`, `#FFCE31`, `#4DE3E3`.
- Chart gerado no início da rodada (110 notas). Para cada nota: 20% `hold`, senão `tap`; 5% do
  total é nota **estrela**, mais 7% nota **dupla**. `len` de hold: `620 + rng()*620` ms. Intervalo
  até a próxima: hold → `len + 320`; tap → `360 + rng()*200`; tudo dividido por `timeScale`.
- Tempo de viagem (`TRAVEL`) **1750 ms**. Posição vertical da nota:
  `top = 82 * (1 - (t - now) / TRAVEL)` %. Altura do hold: `(len / TRAVEL) * 82` %.
- Janela de acerto: `|t - now| < 175` ms. `< 70` ms = **PERFEITO** (+20), senão +10.
  Nota dupla +35, nota estrela ativa **ENERGIA x2 por 5 s** (+20 na hora).
  Hold: +12 ao segurar, +30 ao soltar dentro de `t + len - 220`; soltar antes zera o combo.
- Bônus de combo: `+min(20, combo)` por acerto; multiplicador ×2 enquanto a energia estiver ativa.
- **Efeitos de acerto** (pedido explicitamente): a cada acerto, na linha de acerto da faixa —
  1. anel de 74 px na cor da faixa com `burst 460ms`;
  2. 5 faíscas circulares de `6–14 px` alternando `#FFFDF7` e a cor da faixa, espalhadas
     `±8%` em x e `78–86%` em y, com `scorePop 620ms`;
  3. palavra do julgamento (`PERFEITO` verde `#7BE86A`, senão amarelo `#FFCE31`), 19px/800,
     contorno 5px, em `top: 70%`, com `scorePop 700ms`.
  Todos os três são removidos após 700 ms.
- Combo ≥ 5 mostra `xN` gigante no centro da pista (JetBrains Mono 40px, contorno 7px, `.9` de
  opacidade).
- **onFinish**: `score = pontos * 3`, `display = '<pontos> pts'`, `stat: { combo: comboMáximo }`.

### 3.3 NA MOSCA — `osu` (**pasta nova**)

- **hue** 320 · **duração** 30 000 ms · **categoria** `timing` · gesto: toque + arrasto.
- Círculos numerados (1→5, ciclando) aparecem em posições livres da arena com um **anel de
  aproximação** que fecha: `scale = 1 + 1.9 * ((t - now) / AR)`, com `AR = 950` ms, mínimo 1.
- 30% das notas são **slider**: um rastro reto de `18 + rng()*16` % de comprimento em ângulo
  aleatório, `len = 700` ms. Posição da bolinha ao longo do rastro:
  `k = clamp((now - t) / len, 0, 1)`.
- Chart: 70 notas; intervalo `520 + rng()*260` ms (tap) ou `len + 380` ms (slider), dividido por
  `timeScale`. Posições: `x = 18 + rng()*64`, `y = 16 + rng()*66` (%), extremidade do slider
  limitada a `12..88`.
- Julgamento do tap: ignora toques com `|t - now| > 260`; `< 95` ms → **PERFEITO** (+30),
  `< 175` ms → **BOM** (+18), senão erro (combo zera). Slider: +15 ao encostar na cabeça, +40 ao
  soltar dentro de `t + len - 180`; sair mais de 14% de distância da bolinha durante o arrasto
  cancela e zera o combo. Nota não tocada até `t + 200` ms conta erro.
- Bônus de combo `+min(20, combo)`. Combo ≥ 3 aparece no canto inferior esquerdo
  (JetBrains Mono 26px, contorno 6px, `#FFCE31`).
- Visual: círculo 78 px, fundo `rgba(255,107,214,.85)` (tap) ou `rgba(77,227,227,.85)` (slider),
  borda `5px #FFFDF7` + `box-shadow 0 0 0 4px #170F3E`, número 30px/800 branco. Anel de
  aproximação `4px` em `#FFCE31` (tap) / `#4DE3E3` (slider). Rastro do slider: cápsula
  `border:4px solid rgba(255,253,247,.5)`, fundo `rgba(255,253,247,.1)`, altura 26 px. Bolinha:
  32 px `#FFCE31` com borda `4px #170F3E`. Fundo da arena:
  `radial-gradient(120% 100% at 50% 0%, #2B1D7A, #150F3C)`.
- Acerto: anel de 86 px na cor do julgamento com `burst 460ms` + palavra 20px/800 com
  `scorePop 700ms`, ambos removidos em 700 ms.
- **onFinish**: `score = pontos * 4`, `display = '<pontos> pts'`, `stat: { accuracy }`.

### 3.4 CORRIDA — `race` (existente, substituir por runner com sprites)

- **hue** 170 · **duração** 30 000 ms · **categoria** `reflex` · gesto: dois botões (segurar para
  abaixar, tocar para pular).
- Arena **branca** (`#FFFFFF`), linha de chão sólida `4px #535353` em `bottom: 22%`, faixa
  tracejada abaixo (`repeating-linear-gradient(90deg,#535353 0 14px,transparent 14px 46px)`)
  rolando com a velocidade. Duas nuvens `56×16 px` `#EDEDED` em parallax (22% da velocidade).
- Velocidade inicial `46 * timeScale` %/s, cresce `+1.6/s` até o teto `96 * timeScale`.
  Distância: `dist += speed * dt * 0.42` (arredondada = metros do HUD).
- Pulo: `vy = 142`, gravidade `168 * 1.9` por segundo; a altura `y` vira `bottom: calc(22% + y*0.42%)`.
  Apex ≈ 13% da arena. Só é possível pular com `y <= 0.5`.
- Obstáculos: spawn quando o `gap` zera, `gap = 40 + rng()*46` (em % percorridos). Tipos sorteados
  1/3 cada: `cacto` (altura 11%), `duplo` (10%), `ptero` (7%, `bottom: 36%`).
- Colisão: `|obstáculo.x - 22| < 7 + meiaLargura[tipo]`, com
  `meiaLargura = { cacto: 5.5, duplo: 6.5, ptero: 6 }`. Cacto é limpo com `y > 25`; pterodátilo
  **só** abaixando. Batida: 700 ms de atordoamento (sem novas colisões), velocidade cai para 72%,
  selo `BATEU!` + `shake 320ms`.
- Sprites (pasta `assets/dino/`, PNG pixel-art já recortado no bounding box):
  `dino-corre.png`, `dino-pula.png` (no ar), `dino-abaixa.png` (agachado, altura 7% contra 13%),
  `cacto.png`, `cacto-duplo.png`, `pterodatilo.png`. Todos com `width:auto` e altura em % — nunca
  fixar largura, os sprites têm proporções diferentes.
- **onFinish**: `score = max(0, metros * 10 - batidas * 260)`, `display = '<metros> m'`.

### 3.5 CONTORNO — `trace` (**pasta nova**; o `draw` atual continua existindo)

- **hue** 45 · **duração** 30 000 ms · **categoria** `creative` · gesto: arrasto contínuo.
- Área de desenho **quadrada** (`aspect-ratio: 1`), fundo `#FFFDF7`, borda `5px #170F3E`,
  `border-radius: 28px`, `box-shadow: 0 8px 0 #170F3E`.
- A forma é uma sequência de pontos calculada (nada de SVG desenhado à mão), centrada em
  `(50%, 50%)` com raio 38% da caixa:
  - **CÍRCULO** 64 pontos; **QUADRADO** 4 lados × 16; **TRIÂNGULO** 3 lados × 22 (vértices
    `(0,-1.05) (1,.75) (-1,.75)`); **ESTRELA** 10 vértices alternando raio 1 e 0.46, 7 pontos por
    aresta; **CORAÇÃO** 66 pontos da paramétrica
    `x = 16 sin³t / 17`, `y = -(13 cos t − 5 cos 2t − 2 cos 3t − cos 4t) / 17`.
- Ponto é marcado quando o dedo passa a menos de 6% em x **e** em y. Não marcado: 9 px `#D9D2F5`;
  marcado: 13 px `#7BE86A`.
- Ao atingir **97%** a forma "fecha": selo `FECHOU!` (`pop 320ms`, fundo `#7BE86A`) e, 700 ms
  depois, a próxima forma entra. O pincel (`assets/jogo/pincel.png`, 44 px) segue o dedo.
- Barra de progresso no topo: trilho `#2A1C74` com preenchimento
  `linear-gradient(90deg,#7BE86A,#4DE3E3)`, borda `4px #170F3E`, altura 18 px.
- **Regra de disputa pedida**: quem fecha primeiro ganha a rodada; os demais pontuam pela
  porcentagem. Isso cai naturalmente do score:
  `score = (formasFechadas * 100 + porcentagemAtual) * 8`,
  `display = '<formas> formas · <pct>%'`, `stat: { artistScore }`.

### 3.6 ESCALADA — `climb` (existente, adicionar especiais)

- **hue** 210 · **duração** 30 000 ms · **categoria** `platform` · gesto: segurar ← / →.
- Física: gravidade `980 * timeScale` por segundo, pulo automático ao encostar (`vy = 540`),
  deslocamento lateral `78 %/s`, wrap horizontal em 4% / 96%. Câmera fixa: o jogador fica em
  `top: 62%` e o mundo rola (`unit = 100 / 460`).
- Plataformas a cada ~108 unidades de altura, largura 30%. Tipos (sorteados só acima de 240 de
  altura): **mola** 12% (`#FFCE31`, pulo `vy = 1020`, seta `assets/acoes/seta-cima.png`),
  **móvel** 16% (`#4DE3E3`, vai e volta a 26 u/s entre 12% e 88%), **quebradiça** 14%
  (`#C08457` → some com `opacity .35`, não devolve pulo), senão **normal** (`#A78BFA`).
- **Foguete**: 7% das plataformas não-quebradiças carregam `assets/acoes/foguete.png` (34 px).
  Ao pegar: `vy` travado em 1180 por 1250 ms, o item aparece acima do avatar pulsando, e nenhum
  obstáculo atinge o jogador durante o boost.
- **Perigos**: bombas (`assets/jogo/bomba.png`) e nuvens (`assets/efeitos/nuvem-roxa.png`) a cada
  ~430 unidades (55% de chance por faixa). Colisão (`|Δx| < 9` e `|Δy| < 30`) joga o jogador para
  baixo (`vy = -420`) e mostra o aviso.
- Avisos: pílula central `pop 300ms` — `MOLA!` (amarelo), `FOGUETE!` (verde), `QUEBROU` /
  `TOMOU!` / `CAIU NA NUVEM` (vermelho `#FF6B57`). Somem em 900 ms.
- Altura exibida: `round(maiorAltura / 10)` metros.
- **onFinish**: `score = metros * 12`, `display = '<metros> m'`, `stat: { climbHeight }`.

### 3.7 PIANO TILE — `piano` (**pasta nova**)

- **hue** 185 · **duração** 30 000 ms · **categoria** `speed` · gesto: toque.
- Fundo branco-osso `#FFFDF7`, 4 colunas de 25% separadas por `3px #E4DDF6`; cada coluna inteira
  é uma área tocável.
- Peças de 22% de altura descem a `speed` %/s, começando em `40 * timeScale` e subindo `+0.9` a
  cada acerto até o teto de 96. Nova peça quando a última percorreu 24% (`y = -22%`).
- Tipos sorteados: `ouro` 8% (`assets/recompensas/moeda.png`, +30), `gema` 7%
  (`assets/recompensas/gema.png`, +10 e **câmera lenta 3,2 s** a 45% da velocidade), `bomba` 9%
  (`assets/jogo/bomba.png`, −25 e `shake 320ms` se tocada), senão normal (+10).
- Cores: normal `#170F3E`, ouro `#FFCE31`, gema `#4DE3E3`, bomba `#FF5C4D`; peça com
  `border:4px solid #170F3E; border-radius:14px; padding:3px`.
- Erros: tocar coluna vazia = `-5`; deixar peça não-bomba passar de `y > 100%` = erro.
  Bomba que passa não é erro.
- **onFinish**: `score = pontos * 5`, `display = '<pontos> pts'`.

### 3.8 MIRA — `aim` (existente, só arte)

Mecânica inalterada; os alvos passam a ser `assets/jogo/alvo.png` e as bombas
`assets/jogo/bomba.png` (74 px, `sizeScale` reduz para 48). Números flutuantes `+1`/`-1` verdes e
vermelhos com `scorePop`.

### 3.9 MEMÓRIA — `memory` (existente, só arte)

Quatro pads 2×2 com `assets/jogo/gema.png`, `moeda.png`, `coracao.png`, `nota-musical.png`.
Cor acesa/apagada por pad: `#4DE3E3/#1E7C8C`, `#FFCE31/#8A6B14`, `#FF6B8B/#8A2E45`,
`#7BE86A/#2E7A34`. Pad aceso: `opacity 1`, `scale(1.05)`, sombra `0 3px 0` (apagado: `.55`,
`scale(1)`, sombra `0 8px 0`). Sequência: 620 ms por passo (dividido por `timeScale`), aceso
durante 55% do passo. Erro reinicia do nível 1 mantendo o recorde. Pílula de status:
`OLHE A SEQUÊNCIA` / `SUA VEZ` / `NÍVEL N ✓` (verde) / `ERROU · RECOMEÇANDO` (vermelho).

### 3.10 MARTELO — `mash` (existente, só arte)

Mecânica inalterada. O botão ganha `assets/jogo/raio.png` (44 px) ao lado do texto `TOQUE!`.

### 3.11 Referência de desempenho dos bots

Valores que o protótipo usa para converter a "performance" `perf` (0–1) do bot em resultado.
Alimente `_shared/bots.js` com eles em vez de recalcular:

| Jogo | Resultado do bot | Score |
|---|---|---|
| `slice` | `pts = perf * 320` | `pts * 6` |
| `rhythm` | `pts = perf * 900` | `pts * 3` |
| `osu` | `pts = perf * 780` | `pts * 4` |
| `race` | `m = perf * 640` | `m * 10` |
| `trace` | `formas = floor(perf * 2.8)`, `pct = resto * 100` | `(formas*100 + pct) * 8` |
| `climb` | `m = perf * 190` | `m * 12` |
| `piano` | `pts = perf * 560` | `pts * 5` |
| `aim` | `acertos = perf * 16` | `acertos * 100` |
| `memory` | `nível = max(1, perf * 9)` | `nível * 220` |
| `mash` | `t = duração * (1.3 - perf*0.88)` | `1000 + (duração - t)/10` |

Faixas de `perf` por dificuldade: FÁCIL `0.24–0.50`, MÉDIO `0.45–0.74`, DIFÍCIL `0.68–0.95`.

---

## 4. Chaos events

Os três efeitos que os jogos novos honram:

- `scoreMultiplier` — aplicado pelo `scoreManager`, o jogo só declara.
- `timeScale` — 1,5× (ACELERADO) ou 0,6× (CÂMERA LENTA). Afeta **a simulação**: velocidade de
  spawn, gravidade, velocidade das peças/notas. **Nunca** o relógio da rodada.
- `sizeScale` — MINÚSCULO encolhe alvos/frutas. Aplicar no **teto de tamanho** do objeto, nunca
  via `transform: scale()` em algo tocável.

Declaração sugerida em `supports`:

| Jogo | scoreMultiplier | timeScale | sizeScale |
|---|:-:|:-:|:-:|
| `slice` | ✓ | ✓ | ✓ |
| `rhythm` | ✓ | ✓ | |
| `osu` | ✓ | ✓ | ✓ |
| `race` | ✓ | ✓ | |
| `trace` | ✓ | | ✓ |
| `climb` | ✓ | ✓ | |
| `piano` | ✓ | ✓ | |

---

## 5. Design tokens

### Cores

| Uso | Hex |
|---|---|
| Tinta (contorno de tudo) | `#170F3E` |
| Fundo da tela | `#2E2080` sobre `#3A2790` |
| Gradiente do palco | `#3A2790 → #241B5E → #150F3C` |
| Papel / cards claros | `#FFFDF7` |
| Campo dentro de card claro | `#F0ECFF` |
| Trilho de seletor | `#2A1C74` |
| Amarelo de destaque | `#FFCE31` |
| Laranja (ação principal) | `#FF9F1C` (claro `#FFC864`, escuro `#C25E00`) |
| Verde (confirmar) | `#7BE86A` (claro `#B7F5AC`, escuro `#3FBF52`) |
| Roxo (secundário) | `#7C5CFF` (claro `#A78BFA`) |
| Ciano | `#4DE3E3` (claro `#A8F4F4`, escuro `#0E7A7A`) |
| Rosa | `#FF6B8B` / `#FF6BD6` (rítmicos) |
| Vermelho (erro) | `#FF5C4D` / `#FF6B57` |
| Texto claro sobre roxo | `#E7E0FF`; secundário `#CFC4FF`; terciário `#9C8FD8` |
| Texto escuro secundário | `#7A6FB5`; sobre amarelo `#8A6B00` |
| Cinza do runner | linha `#535353`, nuvem `#EDEDED`, fundo `#FFFFFF` |

Faixas do RITMO, em ordem: `#7BE86A`, `#FF6B8B`, `#FFCE31`, `#4DE3E3`.

### Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Display / UI | **Baloo 2** 600/700/800 | títulos, botões, nomes (uppercase, `letter-spacing .02–.06em`) |
| Rótulo | **Space Grotesk** 500/700 | rótulos de seção 10–12px, `letter-spacing .18–.2em`, uppercase |
| Numérico | **JetBrains Mono** 700/800 | código da sala, placar, cronômetro, distância, pontos |

Títulos grandes usam `-webkit-text-stroke: 5–9px #170F3E` com `paint-order: stroke fill`.
Escala em uso: 68px (logo), 50–54px (título de tela), 38–42px, 26–28px (botão principal),
19–24px (nome/valor), 15–17px (corpo), 10–13px (rótulo).

### Forma e profundidade

- Raios: 999px (pílula), 34px (arena grande), 28px (arena), 26px (card), 24px (botão principal),
  22px (trilho), 20px, 16–18px (botão pequeno), 14px (item de seletor).
- Bordas: 6px (arena/botão grande), 5px (card, botão principal), 4px (botão pequeno, chip),
  3px (item de seletor, selo).
- Sombra é sempre **sólida deslocada**, nunca desfocada: `0 10px 0 #170F3E` (grande),
  `0 8px 0` (botão principal), `0 7px 0` (card), `0 5px 0` (chip), `0 4px 0` (pílula).
- Estado `:active` afunda: `transform: translateY(4–8px)` com a sombra reduzida ao mesmo tanto
  (ex.: `0 8px 0` → `0 2px 0` com `translateY(6px)`), transição `90ms ease` (60–70 ms nos botões
  de gameplay).

### Animações

| Nome | Duração / curva | Uso |
|---|---|---|
| `pop` | 380–500ms `cubic-bezier(.34,1.56,.64,1)` | selos, contagem, resultados |
| `rise` | 300–380ms `cubic-bezier(.05,.7,.1,1)` | entrada de tela e de card |
| `burst` | 420–460ms `ease-out` | anel de acerto (escala .4→1.8, opacidade 1→0) |
| `scorePop` | 620–700ms `ease-out` | número/palavra flutuante subindo |
| `shake` | 320ms `ease` | erro grave (bomba, batida) |
| `floatY` | 2.4–11s `ease-in-out` infinito | itens flutuando |
| `shine` | 2.2–3.4s `ease-in-out` infinito | brilho varrendo botão principal |
| `podRise` | 620ms `cubic-bezier(.34,1.56,.64,1)` | degraus do pódio |
| `targetIn` | 180ms `cubic-bezier(.34,1.56,.64,1)` | alvo entrando |

---

## 6. Assets

Todos em `assets/` neste pacote; copiar para `public/assets/` (ou `src/assets/`, conforme a
convenção do projeto) mantendo a estrutura de pastas. Observação importante: **o repo hoje não
tem nenhum asset binário** — este pacote muda isso, então vale decidir a pasta e registrar em
`docs/02-DESIGN-SYSTEM.md`.

| Pasta | Conteúdo | Onde é usado |
|---|---|---|
| `assets/personagens/` | 12 PNGs (gata, robo, panda, dj, chama, coelha, fantasma, punk, tubarao, capitao, cacto, broto) | avatares: seletor, lobby, resultado, pódio, escalada |
| `assets/jogo/` | melancia, coração, gema, moeda, chama, bomba, alvo, raio, cérebro, nota-musical, pincel, troféu | frutas do slice, alvos, pads da memória, ícones de intro |
| `assets/simbolos/` | coroa, alvo, raio, estrela, cronômetro, dúvida, gema, nota-musical, pincel | coroa do anfitrião, ícones de chaos, ajuda |
| `assets/recompensas/` | medalhas ouro/prata/bronze, moeda, gema, estrela, cronômetro, escudo, raio | pódio, peças especiais do piano, chaos |
| `assets/selos/` | chaos, chaos-event, victory, great, good, perfect, miss, win-streak | resultado de rodada e placar final |
| `assets/acoes/` | play, fechar, seta-curva, seta-cima, foguete, nota-dupla, raio-impacto, cometa-cristal | botões e especiais da escalada |
| `assets/efeitos/` | explosao, anel-fogo, nuvem-roxa | cortes, perigos |
| `assets/dino/` | dino-corre, dino-pula, dino-abaixa, cacto, cacto-duplo, pterodatilo | CORRIDA (pixel-art, já recortado) |

Os PNGs do dino vieram do usuário e foram recortados no bounding box alfa — não têm margem, então
alinhar pelo `bottom` funciona direto. Os demais têm contorno escuro embutido e combinam com a
tinta `#170F3E`.

---

## 7. Arquivos deste pacote

| Arquivo | O que é |
|---|---|
| `PROMPT.md` | Prompt pronto para colar no Claude Code |
| `CHAOS Prototipo.dc.html` | Protótipo navegável (referência de design, não código de produção) |
| `assets/` | Todos os PNGs usados |

Para ver o protótipo: abrir o HTML no navegador. O canto superior esquerdo da tela do celular
abre um painel de debug que pula direto para qualquer tela ou microjogo.
