# CHAOS — Auditoria de design (crivo de 5 dimensões)

> Revisão feita com o método da skill [`chaos-design`](../.claude/skills/chaos-design/SKILL.md)
> (crivo de 5 dimensões, destilado da abordagem huashu-design e reescrito para o
> contrato deste repo — **sem marca d'água, sem crédito em produto**).
> Evidência: prints reais capturados via Visual Inspector em `2026-08-12` +
> leitura direta de `src/styles/tokens.css` e dos componentes.
> **Avalia-se o design, não o designer.**

## Prints de referência

| Tela | Print | Observação |
|---|---|---|
| Landing (framing real, retrato ≤520px centrado no palco) | `galeria/review/home.png` | Representa o alvo mobile |
| FATIAR — banca de dev | `galeria/review/slice-devbench.png` | Largura de desktop (a banca `/dev` usa a tela toda p/ ferramentas); o jogo em si é retrato |
| MARTELO — selo "METADE!" | `galeria/review/mash-selo.png` | Selo dinâmico no meio da jogada |

## Placar

| # | Dimensão | Nota | Resumo |
|---|---|---|---|
| 1 | Coerência filosófica | **9/10** | Adesivo arcade fiel; tokens em 3 camadas; faces chapadas. Único ruído: comentário obsoleto no tokens.css. |
| 2 | Hierarquia visual | **8/10** | Logo e CTAs mandam bem; vão vertical morto na landing e chips de avatar soltos. |
| 3 | Execução de detalhe | **9/10** | paint-order, sombra pop sem blur, anel de tempo, selos com contorno de tinta, "O" = alvo. |
| 4 | Funcionalidade | **8/10** | Alvos ≥44px, reduced-motion, feedback na hora. Checar contraste do placeholder/lnk P2P. |
| 5 | Inovação | **8/10** | Direção autoral real (anti-slop), tema por jogo, selo duplo (PNG + CSS). |
| | **Total** | **42/50** | Base sólida e coesa; ajustes de polimento, nada estrutural. |

---

## ✅ Keep (o que já está ótimo — não mexer)

- **Identidade adesivo coesa e autoral.** Contorno de tinta `#170F3E`, sombra pop
  **sólida sem blur**, faces **chapadas** (confirmado em `Button.css`: `background:
  var(--grad-green)` é cor plana; a faixa diagonal é o **sheen** `::before`, reflexo
  de adesivo — não gradiente). Isso é o oposto de AI-slop: carrega marca.
- **Tokens em 3 camadas** (primitivo → semântico → componente) com a regra de ouro
  "componente nunca usa hex literal". Fonte única de verdade real, não decorativa.
- **Logo CHAOS com o "O" virando alvo/anel** — marca memorável e temática (mira/party).
- **HUD dos jogos** (anel de tempo, `RivalBars`, `PONTOS`) legível e consistente entre
  jogos; o `--game-hue` é re-derivado no wrapper certo (o bug do anel sempre-âmbar já
  foi corrigido — ver comentário em `tokens.css`).
- **Feedback na hora, por jogo e sem redundância:** pops in-canvas (FATIAR/MIRA),
  selos dinâmicos de marco (MARTELO), banner de 5 estados + linha animada (DUELO),
  selo PNG `level-up` + estados de pad (MEMÓRIA). Aplicado onde havia lacuna, não em bloco.

## 🔧 Fix (por gravidade)

- ⚡ **Contraste a validar.** Placeholder "CÓDIGO" (roxo atenuado sobre creme) e o link
  "conectar 2 celulares direto (P2P)" (pequeno, violeta sobre palco) — medir **≥4.5:1**
  no Visual Inspector. Se falhar, escurecer o placeholder um tom e engrossar o link.
- 💡 **Comentário obsoleto no `tokens.css`.** O cabeçalho ainda diz "CTAs em gradiente
  vivo", mas as faces são chapadas (o Rafael pediu p/ tirar gradiente). Atualizar o
  texto; num passe futuro, renomear `--grad-*` → `--cta-*` para o nome não mentir.
- 💡 **Vão vertical morto na landing.** Entre o tagline e as CTAs sobra um bloco vazio
  grande; os chips de avatar (rosa/ciano/amarelo) flutuam soltos. Apertar o ritmo
  vertical **ou** agrupar os chips numa fileira "quem já está na sala".
- 💡 **Sheen do botão forte.** `.btn::before` usa `rgba(255,255,255,0.45)` varrendo a
  cada 3.6s. Sobre verde/âmbar chega a piscar o contraste do rótulo ao cruzar.
  Considerar `0.28–0.32` ou parar o loop após 1–2 passadas.

_Nenhum ⚠️ fatal encontrado._

## ⚡ Quick Wins (≤5 min — faça estes 3 primeiro)

1. **Corrigir o comentário do topo do `tokens.css`** ("gradiente vivo" → "faces
   chapadas; profundidade na sombra pop"). 1 linha, tira a contradição da doc.
2. **Baixar o sheen** do `.btn::before` de `0.45` → `~0.30` (contraste do rótulo mais estável).
3. **Escurecer o placeholder do campo CÓDIGO** um tom (sólido `--bone-500` em vez do dim)
   para cravar a leitura sem depender de medição.

---

### Como reproduzir esta auditoria
1. `npm run dev` (porta 5175) e abrir `/` e `/dev/:gameId`.
2. Print via Visual Inspector (`browser_open` → `browser_eval location.assign(...)` →
   `browser_screenshot`), mobile-first quando possível.
3. Rodar o crivo de 5 dimensões da skill `chaos-design` §6, com Keep / Fix / Quick-Wins.
