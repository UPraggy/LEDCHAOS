# 02 · DESIGN SYSTEM

> Fonte única: `src/styles/tokens.css`. **Componente nunca usa hex/px solto.** Só `var(--token)`.
> Se um valor não existe como token, o certo é criar o token — não escrever o número.

---

## 1. Origem

Herdado da identidade **Rafael MR** (`ME/GUIA_DEFINITIVODESIGN_16062026` + `ME/PlanejamentoCarreira/06-identidade-visual.md`), variante **void-frio**, e adaptado para arcade:

| Da marca (mantido) | Só do jogo (novo) |
|---|---|
| VOID `#11131C` · BONE `#F1EDE2` | Violeta neon `#7C5CFF` (energia do CHAOS) |
| PERIWINKLE `#9DB1EA` (estrutura/info) | Ciano `#4DE3E3`, Ouro `#FFD34E` |
| ÂMBAR `#EAA94E` (ação/CTA) | 8 cores de jogador `--p1..--p8` |
| GREEN `#7BBF5E` · ROSE `#C5402A` | `--glow-*`, `--ease-pop`, `--game-hue` |
| Space Grotesk + Inter + JetBrains Mono | Escala tipográfica até `--fs-6xl` |

Diferença de intenção: portfólio = **calmo e editorial**; CHAOS = **energético e imediato**. Mesma paleta, contraste e movimento maiores.

---

## 2. As 3 camadas

```
PRIMITIVO   --void-700, --amber-400, --space-4, --fs-xl, --radius-md
    ↓ (só o tokens.css referencia primitivo)
SEMÂNTICO   --color-bg, --color-action, --color-danger, --color-text-muted
    ↓ (é isso que o componente usa)
COMPONENTE  --btn-height, --card-radius, --hud-height, --screen-max
```

Trocar a cor de ação do app inteiro = mudar 1 linha (`--color-action`).

---

## 3. Cor semântica — quando usar o quê

| Token | Uso | Nunca |
|---|---|---|
| `--color-action` (âmbar) | CTA primária, o caminho principal | 2 CTAs âmbar na mesma tela |
| `--color-info` (periwinkle) | ação secundária, dado, estrutura | como "sucesso" |
| `--color-energy` (violeta) | evento CHAOS, ações "grandes" | texto corrido |
| `--color-success` / `--danger` / `--warning` | feedback de jogo (acerto, erro, alerta) | decoração |
| `--game-accent` | tudo que pertence à **rodada atual** | fora de um microjogo |

Texto: `--color-text` (corpo) → `--color-text-muted` (secundário) → `--color-text-dim` (label). Nunca inventar um 4º nível.

### `--game-hue` (o truque da identidade por rodada)
Cada microjogo declara `hue` no metadata. A tela de jogo injeta `--game-hue`, e `--game-accent`, `--game-wash` e `--game-glow` derivam por HSL. Resultado: 12 microjogos com cara própria, **zero CSS duplicado**.

---

## 4. Medida

- **Espaço:** base 8 (`--space-2..10`); `--space-1` (4px) só para ajuste ótico.
- **Tipo:** base 16 × 1.25 → 16 / 20 / 25 / 31 / 39 / 49 / 61 / 76. Corpo nunca abaixo de `--fs-base` em mobile; `--fs-xs` só em label/legenda.
- **Fontes:** `--font-display` (**Baloo 2**) em título/botão/corpo grande — títulos ganham contorno de tinta via `.u-titlestroke`; `--font-label` (Space Grotesk) em rótulo maiúsculo pequeno + `--track-wider`; `--font-sans` (Baloo 2) em texto corrido; `--font-mono` (JetBrains Mono) em **todo número** (tempo, pontos, código de sala) — `tabular-nums` impede o número de "pular".
- **Raio:** `sm 8` chip · `md 14` botão/card pequeno · `lg 22` card · `xl 32` painel · `pill` avatar/anel.
- **Toque:** `--tap-min 44px` mínimo absoluto, `--tap-big 64px` para botão de tela. WCAG 2.2 pede 24; jogo de festa em celular pede 44+.

---

## 5. Movimento

Só `transform` e `opacity` (nunca `width`/`top`/`filter` animado).

| Duração | Uso |
|---|---|
| `--duration-instant 90ms` | reação de toque |
| `--duration-fast 140ms` | hover/press, barra de progresso |
| `--duration-base 220ms` | entrada de elemento |
| `--duration-slow 340ms` | entrada de tela |
| `--duration-slower 520ms` | transição de fase, varredura |

`--ease-pop` (overshoot) é a assinatura arcade — usar em contagem, badge, botão pressionado. `--ease-out` para entradas de tela.

Keyframes compartilhados em `global.css`: `pop popOut rise riseOut shake pulse spinSlow flash sweep floatY wob shine toastIn stamp`. **Não criar keyframe novo se um destes serve.** (`wob` = balanço de adesivo p/ logo; `shine` = brilho que varre o botão; `toastIn` = aviso entra de baixo; `stamp` = selo bate na tela.)

`prefers-reduced-motion: reduce` já zera tudo globalmente — nenhum componente precisa tratar isso de novo.

---

## 6. Componentes (`src/components/`)

| Componente | Papel | Props-chave |
|---|---|---|
| `Screen` | casca de tela: safe-area, retrato, scroll interno | `layout` `noPad` `hue` |
| `Button` | CTA. Som de clique embutido | `variant` (primary/secondary/energy/ghost/danger), `size`, `block` |
| `IconButton` | ação só-ícone (sempre com `label`) | `active` |
| `Logo` | marca CHAOS (o "O" é um alvo) | `size` `tagline` |
| `PlayerAvatar` | avatar SVG procedural | `avatar` `color` `size` `badge` `ring` `dim` |
| `PlayerCard` | linha de jogador (lobby/resultado/placar) | `player` `position` `right` `delta` `isHost` `isYou` |
| `Countdown` | 3·2·1·JÁ! com som, autolimpa timer | `from` `step` `onDone` `title` `hint` |
| `Timer` | anel + segundos, urgente ≤5s | `remaining` `duration` |
| `ScoreBadge` | pílula de pontuação no HUD | `label` `value` `tone` |
| `GameHeader` | HUD superior comum aos 12 jogos | `title` `instruction` `round` `remaining` |
| `GameResult` | overlay de resultado pessoal do microjogo | `value` `label` `tone` |
| `ChaosEventBanner` | anúncio do evento CHAOS | `event` |
| `ProgressBar` | progresso genérico | `value` (0–1) `color` `label` |
| `QRCode` | QR da sala via lib `qrcode` (canvas) | `value` `size` |
| `ErrorBoundary` | rede de segurança anti-tela-branca | `onError` `resetKey` `label` |

Convenção: `components/<Nome>/index.jsx` + `<Nome>.css`. Import fica `import Button from '../../components/Button'`.

---

## 7. Checklist antes de dar um componente por pronto

- [ ] Nenhum hex, `px` mágico ou `ms` solto no CSS — só `var(--token)`
- [ ] Alvo interativo ≥ `--tap-min`
- [ ] Contraste texto ≥ 4.5:1 · borda/ícone ≥ 3:1
- [ ] Funciona **sem** `:hover` (celular não tem hover)
- [ ] Animação só em `transform`/`opacity`
- [ ] `:focus-visible` visível (herda do `global.css`)
- [ ] Cabe em 360px de largura sem quebrar
- [ ] Ícone/emoji decorativo tem `aria-hidden="true"`; botão só-ícone tem `aria-label`

---

## 8. Anti-padrões (reprovam revisão)

- `background: #1E2231` → use `var(--color-surface)`
- `font-size: 13px` → use a escala
- `transition: all` → nomeie as propriedades
- Animar `width`/`height`/`top` → use `transform`
- Botão de 32px em tela de jogo → `--tap-big`
- Dois CTAs âmbar competindo na mesma tela
- Texto em `--fs-xs` como corpo de leitura

---

## 9. Identidade "ADESIVO ARCADE" (protótipo aplicado 2026-08-11)

Os **nomes** de token de §1–§8 continuam válidos; só os **valores** mudaram para bater com o
protótipo (`Design Híbrido Protótipos 1 e 2/CHAOS Prototipo.dc.html`). O modelo de superfície
**inverteu**: antes = superfície escura + texto claro; agora = **cartão creme sobre palco roxo,
texto de tinta**.

| Assinatura | Token | Valor |
|---|---|---|
| Tinta (contorno/traço/texto) | `--color-ink` | `#170F3E` |
| Palco (fundo da tela) | `--color-bg` | roxo `#2E2080`, gradiente radial no `#root::before` |
| Cartão-adesivo | `--color-surface` | creme `#FFFDF7` |
| Contorno | `--border-ink` / `--border-ink-thick` | 3px / 4px sólidos de tinta |
| Sombra "pop" (sólida, sem blur) | `--shadow-pop-sm/md/lg/xl` | `0 Npx 0 var(--ink)` |
| Título com traço | classe `.u-titlestroke` | `-webkit-text-stroke` + `paint-order` |
| CTA verde / violeta / âmbar | `--grad-green/violet/amber` | CRIAR SALA / ENTRAR / COMEÇAR |
| Texto sobre o palco (não no cartão) | `--color-text-on-stage` | creme `#FFFDF7` |

**Regra de contexto:** dentro de um cartão creme, use `--color-text` (tinta). Direto sobre o
palco roxo (títulos de tela, HUD), use `--color-text-on-stage` (creme) — senão o contraste morre.

### Assets binários (a 1ª exceção à regra "tudo procedural")

67 PNGs do protótipo vivem em **`public/assets/<pasta>/<nome>.png`** — servidos como estáticos,
referenciados por caminho absoluto (`/assets/jogo/melancia.png`). Escolhi `public/` sobre
`src/assets/` porque são sprites de jogo trocáveis a quente e não precisam passar pelo hash do
bundler; o caminho é estável e cacheável.

| Pasta | Conteúdo | Consumido por |
|---|---|---|
| `acoes/` | play, fechar, foguete, seta-cima, seta-curva, nota-dupla, cometa-cristal, raio-impacto | UI / climb / rhythm |
| `dino/` | dino-corre/pula/abaixa, cacto, cacto-duplo, pterodatilo | race (runner) |
| `efeitos/` | anel-fogo, explosao, nuvem-roxa | feedback de acerto |
| `jogo/` | melancia, bomba, coracao, gema, moeda, nota-musical, alvo, cerebro, chama, pincel, raio, trofeu | slice / aim / memory / rhythm |
| `personagens/` | 12 avatares (broto, cacto, capitao, chama, coelha, dj, fantasma, gata, panda, punk, robo, tubarao) | PlayerAvatar |
| `recompensas/` | medalha-ouro/prata/bronze, estrela, escudo, cronometro, moeda, gema, raio | FinalScore / conquistas |
| `selos/` | perfect, great, good, miss, chaos, chaos-event, victory, win-streak | julgamento / carimbos |
| `simbolos/` | coroa, estrela, alvo, gema, raio, pincel, cronometro, duvida, nota-musical | ícones de HUD/lobby |

O restante do jogo (cenário, partículas, formas) continua **canvas procedural** — os PNGs são a
camada de personagem/ícone/selo, não o mundo.
