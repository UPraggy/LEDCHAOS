---
name: chaos-design
description: >
  Revisor e diretor de arte do CHAOS. Use quando for criar ou mexer em QUALQUER
  coisa visual do jogo — telas, microjogos, componentes, HUD, resultado, selos,
  galeria. Garante identidade "adesivo arcade" fiel (palco roxo, cartão creme,
  contorno de tinta, sombra pop sem blur, SEM gradiente na face), respeita o
  contrato de tokens (nunca hex literal), força 3+ variações antes de cravar e
  fecha com o crivo de 5 dimensões. Contraste é requisito, não enfeite.
---

# chaos-design — direção de arte do CHAOS

> Método destilado do "design-direction advisor" da comunidade open-source
> (abordagem huashu-design) e **reescrito do zero para o contrato deste repo**.
> Nada de marca d'água, nada de crédito em produto: o output é do Rafael.
> A fonte de verdade visual é sempre o repo, não esta skill.

## 0. Quando usar (roteamento)

| Situação | O que esta skill faz |
|---|---|
| Criar/reskin um microjogo | Impõe tokens + anti-slop + 3 variações + contraste antes de codar |
| Mexer em tela/HUD/componente | Confere identidade adesivo e o contrato de tokens |
| "Está feio", "revisa o design", "melhora" | Roda o **crivo de 5 dimensões** (§6) com Keep/Fix/Quick-Wins |
| "Faz mais versões", "quero ver direções" | Roda o **portão de 3 direções** (§5) |
| Galeria / variações de jogo | ≥3 variações por jogo em dimensões distintas (§5) |

## 1. Princípio #0 — o contrato do repo vence a suposição

Antes de desenhar qualquer coisa, **leia a fonte de verdade** e não invente por cima:

1. `src/styles/tokens.css` — a ÚNICA fonte dos valores. Cor, medida, sombra, fonte.
2. `docs/02-DESIGN-SYSTEM.md` — a intenção por trás dos tokens.
3. `Design Híbrido Protótipos 1 e 2/design_handoff_chaos_microgames/README.md` — o handoff dos microjogos.

Se um handoff, um print ou um pedido conflitar com o que está no repo, **o repo vence** —
e você avisa o conflito em vez de escolher no escuro. "Achismo" sobre um valor que já
existe em `tokens.css` é bug, não liberdade criativa.

## 2. Filosofia (prioridade de cima para baixo)

1. **Parta do que já existe.** O CHAOS já tem palco, cartão, tinta, selos PNG,
   sprites em `/public/assets`. Use o que está lá antes de gerar coisa nova.
2. **Mostre a suposição antes de executar.** Em mudança não-trivial, diga em uma
   linha "vou assumir X porque Y" e siga — não trave esperando resposta, mas deixe
   a suposição visível para o Rafael poder cortar.
3. **Dê variações, não "a resposta final".** 3+ variações em dimensões diferentes,
   do by-the-book ao ousado (§5). Deixe escolher e misturar.
4. **Placeholder honesto > implementação ruim.** Falta um sprite? Caixa tracejada
   "asset a definir" é melhor que um SVG torto que finge ser o produto.
5. **Sistema primeiro, não preenchimento.** Um token novo bem colocado vale mais
   que dez ajustes locais em hex.
6. **Anti-slop (§4).** É proteção da identidade, não frescura estética.

## 3. Contrato de identidade — "adesivo arcade" (inegociável)

- **Palco roxo** (`--void-*`) é o fundo/marca. O roxo do CHAOS **não é** "gradiente
  roxo de SaaS" (aquele é slop) — aqui é a assinatura do palco. A exceção "a marca
  usa" se aplica: use com orgulho.
- **Cartão creme** (`--color-surface`) é a superfície, com **contorno de tinta**
  (`--border-ink*`, `#170F3E`) e **sombra pop sólida sem blur** (`--shadow-pop-*`).
  É adesivo, não vidro: nada de glassmorphism, nada de blur na sombra.
- **SEM gradiente na face.** CTAs são cor **chapada** + contorno + sombra pop.
  A profundidade mora na quina escura da sombra, nunca num degradê na face.
  (As vars ainda se chamam `--grad-*` por legado — o valor é chapado.)
- **Títulos com traço:** `-webkit-text-stroke` + `paint-order: stroke fill`,
  fonte `--font-display` (Baloo 2). Rótulos em `--font-label` (Space Grotesk).
  Números/cronômetro em `--font-mono` (JetBrains Mono).
- **Movimento só em transform/opacity**, durações e easings dos tokens
  (`--ease-pop` para o overshoot arcade). Respeite `prefers-reduced-motion`.
- **Componente nunca usa hex literal.** Só `var(--token)`. Cor de jogo deriva de
  `--game-hue` (redeclarada em `.screen`/`.dev__*` — ver comentário no tokens.css).

## 4. Anti-slop — o que EVITAR no CHAOS (com o porquê)

| Padrão-slop | Por que é slop | No CHAOS |
|---|---|---|
| Gradiente roxo "techy" na face | Fórmula genérica de landing de IA/SaaS | Palco roxo é OK (é a marca); **face chapada** sempre |
| Emoji como ícone | "não ficou pro, joga um emoji" — dilui identidade | Use os **selos/sprites PNG** de `/assets`, nunca emoji de UI |
| Card arredondado + borda-accent à esquerda | Cliché Material/Tailwind 2020-24, virou ruído | Cartão creme + **contorno de tinta + sombra pop** |
| SVG desenhando rosto/objeto/produto | SVG de IA sai com proporção torta, zero marca | Use **PNG real** do repo; sem asset → placeholder honesto |
| Fonte de sistema (Inter/Arial) como display | Não dá pra ver que "é desenhado" | **Baloo 2** no display, sempre |
| Fundo `#0D1117` uniforme + neon genérico | Solução preguiçosa de dev-tool | Palco tem os `--void-*` com profundidade autoral |
| Sombra com blur / vidro / neon fake | Contradiz o "adesivo" | **Sombra pop sólida** na cor da tinta |

**Fronteira:** "a marca já usa" é o ÚNICO motivo legítimo de exceção. O palco roxo
e o overshoot arcade são autorais — não confundir com o roxo-slop.

## 5. Portão de 3 direções (antes de cravar)

Nunca entregue uma versão só. Gere **3+ variações em dimensões distintas** e
apresente lado a lado, da mais segura à mais ousada:

- **Visual** — peso do contorno, tamanho da sombra pop, densidade.
- **Interação** — o que dá feedback (selo? flash? shake? combo?).
- **Cor** — qual `--game-hue`, qual semântica de acerto/erro.
- **Layout** — HUD em cima vs. dividido, campo cheio vs. respirando.
- **Animação** — overshoot vs. seco, entrada por escala vs. deslize.

Isso é exatamente a régua da galeria: **≥3 variações por jogo**, cada uma
mudando uma dimensão real (não a mesma coisa recolorida).

## 6. Crivo de 5 dimensões (revisão)

Quando o pedido for "revisa / está bom? / melhora", pontue **0–10 cada** e
entregue o veredito. **Avalie o design, não o designer.**

1. **Coerência filosófica** — segue o adesivo arcade e os tokens? Sem hex solto?
2. **Hierarquia visual** — o olho vai pro que importa (placar, alvo, tempo)?
3. **Execução de detalhe** — contorno, paint-order, sombra pop, tracking, mono nos números.
4. **Funcionalidade** — legível em mobile ao sol? Alvo ≥44px? Contraste do texto
   sobre a face? Feedback na hora do acerto?
5. **Inovação** — tem uma ideia própria ou é o mínimo esperado?

**Saída:** nota total · **Keep** (o que já está ótimo) · **Fix** (com gravidade
⚠️ fatal / ⚡ importante / 💡 polimento) · **Quick Wins** (as 3 coisas de ≤5 min).

### Contraste é gate, não opinião
- Texto sobre CTA/face: mira **≥4.5:1** (corpo) e **≥3:1** (título grande).
- Selo/veredito sobre fundo do jogo: o contorno de tinta é o que garante a leitura —
  se o selo vive só da cor da face, troca o tom (foi por isso que o "RETA FINAL"
  do MARTELO virou lima em vez de âmbar sobre o tubo laranja).
- Confira com o **Visual Inspector** (print real do `/dev/:gameId`), não no olho.

## 7. Protocolo de portão (checkpoint)

Mudança visual grande = pare e mostre **antes de espalhar pelo repo**:
1. Um print/descrição da direction escolhida (das 3).
2. Quais tokens novos/alterados (se houver) e por quê.
3. Só então propague para os outros jogos/telas.

Nenhum tom de "pode ir com tudo" pula este passo em mudança de identidade —
"vá fazendo" autoriza executar, não redesenhar a marca sem mostrar.

## 8. Referências no repo (a verdade mora aqui)

- `src/styles/tokens.css` — tokens (fonte única).
- `src/styles/global.css` — base/reset.
- `docs/02-DESIGN-SYSTEM.md` — sistema de design.
- `docs/06-MICROGAMES.md` — contrato dos microjogos.
- `docs/DESIGN-REVIEW.md` — a última auditoria de 5 dimensões.
- `src/games/_shared/Selos.jsx` + `selos.css` — selos dinâmicos (veredito+pontos).
- `/public/assets/selos/*` — selos PNG fixos (good/great/perfect/miss/level-up/victory…).
