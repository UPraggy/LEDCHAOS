# 09 · Prompts de assets faltantes

> Para gerar os PNGs que ainda faltam mantendo a identidade **adesivo arcade** do CHAOS.
> Cada prompt já vem com a direção de arte embutida — é só colar num gerador de imagem
> (Midjourney / DALL·E / SD / Nano-Banana etc.), gerar em **quadrado**, e passar pelo
> pós-processamento do fim do arquivo antes de jogar em `public/assets/jogo/`.

O que **existe** hoje em `assets/jogo/`: `melancia, coracao, gema, moeda, chama, bomba,
alvo, cerebro, nota-musical, pincel, raio, trofeu`. Todos são as versões **inteiras**.
O buraco real é: **nenhuma fruta tem a versão CORTADA** (duas metades) — e o FATIAR pede
variedade de frutas. Este doc cobre as duas coisas.

---

## 0 · Direção de arte (bloco reutilizável)

Cole este bloco de estilo em **todo** prompt (é o que faz os assets combinarem entre si):

```
STICKER ARCADE STYLE — chunky cartoon sticker, bold uniform dark-ink outline
(#170F3E, thick and even like a vinyl die-cut), flat cel shading with 2–3 tone
steps, one soft cream highlight (#FFFDF7) top-left, saturated candy palette,
NO gradient mesh, NO photorealism, NO thin lines, NO text. Centered single
object, ~80% of frame, small even margin, front 3/4 view. Transparent
background. Square 1:1, high resolution. Playful, juicy, mobile-game readable
at 48px. Consistent scale and outline weight with a fruit-ninja style icon set.
```

Paleta de apoio (use conforme a fruta): amarelo `#FFCE31`, laranja `#FF9F1C`,
verde `#7BE86A`, ciano `#4DE3E3`, rosa `#FF6B8B`, vermelho `#FF5C4D`, roxo `#7C5CFF`,
papel `#FFFDF7`. Contorno **sempre** `#170F3E`.

Regras técnicas (valem para todos):
- **Fundo transparente** de verdade (PNG com alpha), não branco.
- **Sem sombra** embutida no sprite — a sombra é desenhada pelo motor.
- Objeto **centralizado** e recortado no bounding box com margem mínima e igual.
- A metade cortada tem que ter a **polpa/miolo à mostra** (cara de "acabou de ser
  fatiado"), com a mesma casca/contorno da versão inteira, pra leitura instantânea.

---

## 1 · Cortadas das frutas que já existem (PRIORIDADE)

O FATIAR já usa estes 5 objetos inteiros. Faltam as metades para o momento do corte.
Gere **duas metades separadas** ou **uma metade** (ver convenção de nomes no fim).

### 1.1 `melancia-corte`
```
[STICKER ARCADE STYLE] A watermelon sliced clean in half: two halves drifting
apart, bright red-pink juicy flesh (#FF6B8B core, #FF5C4D rim) with dark seeds,
thick green rind (#3FBF52 / #7BE86A) and cream inner ring, glossy wet cut face.
Juice droplets flying. Same chunky ink outline as a whole cartoon watermelon.
```

### 1.2 `coracao-corte`
```
[STICKER ARCADE STYLE] A glossy candy heart split into two clean halves pulling
apart, deep pink/red (#FF6B8B outer, #FF5C4D shadow), the inner cut face a lighter
pink (#FFB8D2) with a soft cream shine. Cute, not gory. Sparks/droplets between
the halves.
```

### 1.3 `gema-corte`
```
[STICKER ARCADE STYLE] A cyan gemstone shattered into two crystal halves, faceted
cut planes catching light, cyan (#4DE3E3 face, #0E7A7A depth, #A8F4F4 highlight),
sharp geometric facets, tiny sparkle glints. Clean break, two pieces separating.
```

### 1.4 `moeda-corte`
```
[STICKER ARCADE STYLE] A golden coin sliced in half, two half-discs tilting apart,
gold (#FFCE31 face, #C25E00 edge shadow, #FFFDF7 shine), the sliced edge showing a
bright metal cross-section. Star or lightning emboss on the face, playful shine
sparkles.
```

### 1.5 `chama-corte`
```
[STICKER ARCADE STYLE] A cartoon flame split into two flame-halves flicking apart,
orange-to-yellow body (#FF9F1C to #FFCE31, #FF5C4D base), a hotter white-cream core
(#FFFDF7) exposed at the cut, tiny ember sparks. Keeps the same rounded flame
silhouette as a whole flame sticker.
```

---

## 2 · Frutas novas (variedade extra — INTEIRA + CORTADA)

Enriquecem o sorteio do FATIAR. Gere **as duas versões** de cada (nome `<fruta>` e
`<fruta>-corte`), no mesmo estilo, pra entrarem no `FRUITS` do jogo sem destoar.

### 2.1 `banana` / `banana-corte`
```
INTEIRA: [STICKER ARCADE STYLE] A ripe cartoon banana, bright yellow (#FFCE31 body,
#FF9F1C shadow), brown tips, soft cream highlight. Slight curve, chunky.
CORTE:   [STICKER ARCADE STYLE] A banana chopped into two pieces, creamy pale inner
flesh (#FFFDF7 / #F0ECFF) exposed at the cut, yellow peel around the rim, the two
chunks separating.
```

### 2.2 `morango` / `morango-corte`
```
INTEIRA: [STICKER ARCADE STYLE] A plump strawberry, red body (#FF5C4D, #FF6B8B),
tiny yellow seeds, green leafy crown (#7BE86A), cream shine.
CORTE:   [STICKER ARCADE STYLE] A strawberry halved lengthwise, pale pink-cream
inner flesh (#FFB8D2 to #FFFDF7) with faint seed lines and a white core, red skin
rim, green crown on one half. Two halves apart, juice droplets.
```

### 2.3 `laranja` / `laranja-corte`
```
INTEIRA: [STICKER ARCADE STYLE] A round orange, vivid (#FF9F1C, #FFCE31 highlight,
#C25E00 shadow), dimpled peel texture (subtle), tiny green leaf.
CORTE:   [STICKER ARCADE STYLE] An orange cut in half showing classic citrus
segments radiating from the center, juicy (#FF9F1C flesh, #FFCE31, cream pith rim),
glossy wet face, droplets. Two halves separating.
```

### 2.4 `abacaxi` / `abacaxi-corte`
```
INTEIRA: [STICKER ARCADE STYLE] A cartoon pineapple, golden diamond-crosshatch body
(#FFCE31, #FF9F1C), spiky green crown (#7BE86A, #3FBF52), cream shine.
CORTE:   [STICKER ARCADE STYLE] A pineapple slice/chunk cut open, pale yellow ringed
flesh (#FFCE31 to #FFFDF7 core), golden rind edge, green crown on the top piece.
Two pieces apart.
```

### 2.5 `uva` / `uva-corte`
```
INTEIRA: [STICKER ARCADE STYLE] A small cluster of purple grapes (#7C5CFF, #A78BFA
highlight, #4A2FA8 shadow), a green stem and tiny leaf, glossy cream shine.
CORTE:   [STICKER ARCADE STYLE] A single grape sliced in half, translucent pale-green
inner flesh (#B7F5AC / #FFFDF7) with a tiny seed, purple skin rim (#7C5CFF). Two
halves apart with a juice bead.
```

---

## 3 · Efeito de corte extra (opcional, melhora o feedback)

### 3.1 `respingo` (splash de suco genérico, colorizável)
```
[STICKER ARCADE STYLE] A dynamic juice splash / burst shape only (no fruit), a
cluster of chunky droplets and a curved splatter arc, pure WHITE (#FFFFFF) with the
same dark ink outline (#170F3E), on transparent background. Meant to be tinted per
fruit color in-engine. Radial, energetic, arcade.
```
> Branco de propósito: o motor pinta com a cor da fruta cortada (`tint`/`filter`).

---

## 4 · Convenção de nomes e destino

| Item | Arquivo | Pasta |
|---|---|---|
| Fruta inteira | `<fruta>.png` | `public/assets/jogo/` |
| Fruta cortada | `<fruta>-corte.png` | `public/assets/jogo/` |
| Splash genérico | `respingo.png` | `public/assets/efeitos/` |

- Nomes **sem acento e minúsculos** (o resto da pasta segue isso: `melancia`, `coracao`).
- Uma metade OU as duas metades juntas no mesmo PNG — **as duas juntas** é mais simples
  de desenhar no canvas (uma imagem só, some com fade). Se vier em duas metades separadas,
  nomear `<fruta>-corte-a.png` / `<fruta>-corte-b.png`.

## 5 · Pós-processamento (antes de commitar)

1. **Recortar no alfa** (trim) pra não sobrar margem transparente — o motor centraliza
   pelo bounding box, então margem sobrando desalinha o sprite.
2. Garantir **fundo transparente** (matar qualquer branco de fundo do gerador).
3. Redimensionar pro teto de ~**512×512** (o canvas reduz na hora; PNG grande só pesa).
4. Otimizar (`pngquant`/`oxipng`) — bundle mobile agradece.
5. Conferir a **leitura a 48px**: se sumir o contorno, engrossar antes de aprovar.

## 6 · Como entra no jogo (referência)

`src/games/slice/Slice.jsx`:
- `FRUITS = ['melancia','coracao','gema','moeda','chama', ...novas]` — adicionar o nome.
- `IMG_SRC` — mapear `<fruta>: '/assets/jogo/<fruta>.png'` (e a `-corte` num `IMG_CUT`).
- Ao acertar uma fruta, trocar o sprite inteiro pelo `-corte` por ~180ms com as metades
  se afastando (empurrar as duas na direção do corte) antes do fade — é o "cortou" que
  o Rafael pediu ("inteira e cortada").
