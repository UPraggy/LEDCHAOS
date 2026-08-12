# 07 — CONTRATO MOBILE (obrigatório para os 12 microjogos)

> **Decisão do dono do projeto (07/08/2026):** CHAOS é **exclusivamente mobile**.
> Não é "responsivo que também funciona no celular" — é um jogo de celular que,
> num monitor grande, continua sendo um celular centralizado na tela.
> Toda interação é **toque, arrasto e gesto**. Teclado e mouse são apenas
> conveniências de desenvolvimento, nunca o controle principal.

Se você está implementando um microjogo (F4/F5), este arquivo é tão obrigatório
quanto o contrato do `01-ARQUITETURA.md` §2.

---

## 1) Regras que não se negociam

1. **Retrato.** Tela alta e estreita. Em paisagem de celular, `components/RotateHint`
   cobre tudo e pede para girar — não tente reflowar o jogo.
2. **Pointer Events, sempre.** `onPointerDown` / `onPointerMove` / `onPointerUp` /
   `onPointerCancel`. Nunca `onMouseDown` + `onTouchStart` em paralelo (dispara duas vezes).
3. **`setPointerCapture`** em qualquer arrasto (SLICE, DRAW, DODGE, GROW). Sem isso,
   o dedo saindo do canvas mata o gesto no meio.
4. **`onPointerCancel` = solta o controle.** O celular cancela o pointer quando entra
   ligação, notificação ou gesto do sistema. Se você só tratar `pointerup`, o jogador
   fica com o botão "grudado" pressionado.
5. **`touch-action: none`** em qualquer superfície de gesto. Já está global para `canvas`
   (`global.css`); em `div` de controle, declare no CSS do próprio jogo.
6. **Alvo de toque ≥ 44px** (`--tap-min`). Botão de controle de jogo usa `--tap-big`.
7. **Zona do polegar.** Controles ficam nos **35% de baixo** da tela. O topo é HUD
   (placar, timer, rodada) — nunca coloque algo que precise ser tocado a cada segundo lá.
8. **Nada de `:hover` como informação.** No celular ele não existe (ou fica preso após o
   toque). Feedback é `:active`, mudança de cor/escala, som ou partícula.
9. **Sem seleção de texto, sem menu de contexto.** Já resolvido em `global.css`
   (`user-select: none`, `-webkit-touch-callout: none`). Não reative.
10. **Nada de gesto do sistema.** Não use swipe de borda (volta do Android/iOS),
    não use double-tap (vira zoom), não use long-press (vira menu).
11. **Uma mão.** Todo microjogo tem que ser jogável com o polegar de uma mão.
    Exceção autorizada: os que pedem duas mãos por design (MASH, RACE com ← →) —
    aí os dois botões ficam nos cantos de baixo, longe um do outro.
12. **60fps num celular médio.** Canvas dimensionado por `devicePixelRatio` limitado a
    **2** (`Math.min(dpr, 2)`), não a 3 — em tela 3x o custo de pixel triplica de graça.

## 2) Gesto de cada microjogo (referência rápida)

| Jogo | Gesto principal | Detalhe mobile |
|---|---|---|
| REACTION | tap | alvo grande e central; o dedo não precisa mirar |
| SLICE | **arrasto** contínuo | rastro do dedo; `pointercapture`; corta ao cruzar o objeto |
| DRAW | **arrasto** livre | pincel/borracha; barra de cores com alvos ≥44px |
| CLIMB | 2 botões ← → | botões grandes fixos embaixo, `pointerdown`→hold, `pointerup`/`cancel`→solta |
| BEAT | tap ritmado | zona de acerto larga; latência de toque compensada |
| MEMORY | tap em grade | 4–6 botões enormes; sem drag |
| AIM | tap preciso | alvos com raio generoso (dedo ≠ mouse) |
| DUEL | tap em grade 3×3 | célula ≥ 72px |
| MASH | tap repetido | botão gigante; aceitar múltiplos pointers (2 dedos alternando) |
| RACE | tap **ou** ← → | tap = pulo; controle único, sem combinação |
| GROW | **arrasto** (joystick relativo) | o dedo puxa a direção; não teleporta o círculo |
| DODGE | **arrasto** (joystick relativo) | idem; nunca posicione o jogador embaixo do dedo |

> **Joystick relativo (GROW/DODGE):** o personagem segue a *direção* do dedo em relação
> ao ponto onde ele tocou, não a posição absoluta. Se seguisse a posição absoluta, o dedo
> cobriria exatamente o que o jogador precisa ver.

## 3) Canvas em celular — receita padrão

```js
// dentro do jogo, no mount e no resize
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const rect = canvas.getBoundingClientRect();   // tamanho CSS real (não window)
canvas.width = Math.round(rect.width * dpr);
canvas.height = Math.round(rect.height * dpr);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);        // desenhe em px CSS, não em px físico
```

Coordenada do dedo → coordenada do canvas:

```js
const rect = canvas.getBoundingClientRect();
const x = e.clientX - rect.left;
const y = e.clientY - rect.top;   // já em px CSS, casa com o setTransform acima
```

Altura: use o espaço que sobrou (`flex: 1`), nunca `100vh` — a barra de endereço do
celular muda de tamanho durante o scroll. O `#root` usa `100dvh` e o resto é flex.

## 4) Como testar (nesta ordem)

1. **Browser pane em preset `mobile`** (375×812) — pega layout quebrado e overflow.
2. **`npm run dev` + celular na mesma Wi-Fi** (`host: true` já configurado) — é o único
   jeito de sentir latência de toque, `pointercancel` real e 60fps de verdade.
3. **Girar o celular** — o `RotateHint` tem que cobrir a tela.
4. **Tocar com dois dedos** — nada pode dar zoom nem quebrar (`user-scalable=no` no
   `index.html` cuida do zoom; o jogo cuida de múltiplos pointers).

## 5) Onde o mobile já está resolvido (não refaça)

| Arquivo | O que garante |
|---|---|
| `index.html` | `viewport-fit=cover`, `user-scalable=no`, `theme-color`, web-app capable |
| `src/styles/global.css` | `100dvh`, `overscroll-behavior: none`, `touch-action` em canvas, `user-select: none`, moldura retrato centralizada acima de 560px |
| `src/styles/tokens.css` | `--tap-min` (44px), `--tap-big`, `--safe-top`, `--safe-bottom` |
| `src/engine/inputManager.js` | normaliza pointer → ação (`TAP`, `PRESS`, `RELEASE`, `MOVE_LEFT/RIGHT`, `SWIPE`, `DRAW`) |
| `src/components/RotateHint` | camada de celular deitado, 100% CSS (zero listener) |
