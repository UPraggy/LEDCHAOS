# Prompt para o Claude Code

Cole o texto abaixo em uma sessão do Claude Code aberta na raiz do repositório **CHAOS**, com esta
pasta de handoff acessível (ex.: copiada para a raiz do projeto).

---

Você vai implementar uma leva de trabalho no repositório CHAOS (React 18 + JSX sem TypeScript,
Vite 5, CSS puro com design tokens, Canvas 2D, Web Audio procedural — sem Tailwind, sem TS, sem
framework de estado).

**Antes de escrever qualquer código, leia nesta ordem:**

1. `README.md` do repo
2. `docs/00-HANDOFF.md` — regras de trabalho
3. `docs/01-ARQUITETURA.md` §2, §3, §9, §10 — o contrato do microjogo, que é inquebrável
4. `docs/06-MICROGAMES.md` §5 e §6 — ferramentas compartilhadas e a receita do microjogo novo
5. `docs/02-DESIGN-SYSTEM.md` — tokens
6. `design_handoff_chaos_microgames/README.md` — a especificação desta leva

O `design_handoff_chaos_microgames/CHAOS Prototipo.dc.html` é **referência de design**, não código
para copiar: é um protótipo em HTML feito em outro ambiente. Abra no navegador para ver o
comportamento (o canto superior esquerdo abre um painel de debug que pula para qualquer tela).
Recrie o que ele mostra usando os padrões que já existem no repo.

## O que fazer

**A) Modos de partida** (`docs` do handoff, seção 2)
- Três campos novos no `state/gameState.js`: `mode`, `picked`, `soloGame`, com as ações
  `SET_MODE`, `TOGGLE_GAME`, `SET_SOLO_GAME`. `picked` nunca pode ficar vazio.
- `engine/roundManager.js` sorteia sobre a fila efetiva (`picked`, ou só `soloGame` no modo
  único). Nenhum microjogo pode precisar saber em que modo está.
- `screens/CreateRoom` ganha o seletor MODO e a grade de escolha de microjogos, com o visual
  descrito na seção 2.3 do handoff.

**B) Microjogos novos** — três pastas novas, seguindo a receita de `06-MICROGAMES.md` §6
(`index.js` + `<Nome>.jsx` + `<Nome>.css`, registrados em `engine/gameRegistry.js`):
- `osu` — NA MOSCA (handoff §3.3): círculos numerados com anel de aproximação + sliders de
  arrastar.
- `piano` — PIANO TILE (handoff §3.7).
- `trace` — CONTORNO (handoff §3.5): traçar o contorno de formas geradas por fórmula.

**C) Microjogos existentes a revisar**
- `rhythm` — reescrever para 4 faixas com notas de segurar, energia x2 e **efeitos visuais de
  acerto** (anel, faíscas e palavra de julgamento; handoff §3.2).
- `race` — substituir pelo runner estilo dinossauro, com os sprites de `assets/dino/`
  (handoff §3.4).
- `climb` — adicionar mola, foguete, plataforma quebradiça, plataforma móvel e perigos
  (handoff §3.6).
- `slice`, `aim`, `memory`, `mash` — trocar a arte pelos PNGs de `assets/` conforme o handoff.

**D) Assets**
- Copiar `design_handoff_chaos_microgames/assets/` para dentro do projeto (decida entre
  `public/assets/` e `src/assets/` conforme a convenção que preferir; hoje o repo não tem nenhum
  binário, então documente a escolha em `docs/02-DESIGN-SYSTEM.md`).

## Regras que não podem ser quebradas

- `onFinish` é chamado **exatamente uma vez** por rodada, com entrada para **todos** os jogadores,
  bots inclusive (`_shared/bots.js`; use as fórmulas da tabela §3.11 do handoff).
- Fechamento em dois tempos: mostrar o `GameResult` por `END_HOLD` e só então chamar `onFinish` —
  use `useOutcome`.
- Toda aleatoriedade de jogo vem do `rng` recebido por prop. Nada de `Math.random()`, e nada de
  aleatório na pintura.
- `timeScale` afeta a simulação, **nunca** o relógio da rodada. `sizeScale` mexe no teto de
  tamanho, nunca em `transform: scale()` de coisa tocável.
- Limpar rAF, timers e listeners no unmount.
- Mobile-first: alvos ≥ 44 px, sem `hover`, `touch-action: none` nas áreas de gesto,
  `setPointerCapture` no arrasto.
- Declarar em `supports` só o que foi realmente implementado (tabela na §4 do handoff).
- Nada de TypeScript, Tailwind ou dependência nova.

## Como entregar

Trabalhe em etapas verificáveis, nesta ordem: **(A) modos → (D) assets → (C) revisões →
(B) jogos novos**. Depois de cada etapa, rode `npm run dev`, teste no viewport de celular e faça
um commit próprio. Ao final, acrescente uma entrada em `docs/03-PROGRESSO.md` (é append-only) e
atualize a tabela de `docs/06-MICROGAMES.md` com os jogos novos e revisados.

Para cada microjogo, antes de dar por pronto, passe o checklist de aceitação de
`docs/06-MICROGAMES.md` §6, com 2 jogadores, com 8 jogadores e com cada chaos event declarado.

Se algo do handoff conflitar com um contrato do repo, **o contrato do repo vence** — e me diga
qual foi o conflito em vez de resolver no silêncio.
