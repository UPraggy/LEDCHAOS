# 04 · PROMPTS DE DESIGN — CHAOS

Prompts prontos para gerar **identidade, sprites, ícones, objetos, fundos e um
pacote de SVGs** do CHAOS. Servem para IA de imagem (Midjourney / DALL·E / SDXL),
para IA de código que escreve SVG (Claude / GPT) e para briefar um ilustrador
humano — o que muda é só qual seção você cola.

**Como usar:** todo prompt aqui é `BLOCO BASE` + `bloco específico`. O BLOCO BASE
carrega paleta, restrições legais e regras de mobile; sem ele os assets voltam
bonitos e inúteis (fundo branco, traço fino, 200 cores).

| Prompt | Gera | Formato de saída |
|---|---|---|
| [P0](#p0--prompt-mestre-do-design-system) | Sistema visual inteiro | Especificação + tokens |
| [P1](#p1--sprites) | Avatares e personagens | SVG / PNG @3x |
| [P2](#p2--ícones-de-ui) | Ícones da interface | SVG 24×24 |
| [P3](#p3--objetos-dos-microjogos) | Props jogáveis | SVG 64×64 |
| [P4](#p4--backgrounds-e-cenários) | Fundos por microjogo | SVG / CSS |
| [P5](#p5--expansão-de-svgs-pacote-completo) | Pacote fechado + pipeline | Pasta `src/assets/` |

---

## BLOCO BASE (colar em TODOS os prompts)

```
CONTEXTO
Estou criando assets para o CHAOS, um jogo de festa multiplayer para CELULAR.
Partidas de 7 desafios curtíssimos (15-30s cada). Tom: energético, arcade
moderno, "neon sobre concreto escuro". Público adulto/jovem jogando junto na
mesma sala. Playful, NÃO infantil. Colorido, NÃO poluído. Premium, NÃO corporativo.

PALETA FECHADA (não invente cores fora desta lista)
Fundos:      #07080E  #0B0D14  #11131C  #171A26
Superfícies: #1E2231  #272C3D
Bordas:      #343A50  #4A5270
Texto:       #F1EDE2 (claro)  #C9C3B4 (médio)  #8E897C (apagado)
Âmbar (ação principal):   #EAA94E   claro #F4CD8A   escuro #B9772E
Periwinkle (informação):  #9DB1EA   claro #B4C4F1   escuro #4A66CC
Violeta (energia CHAOS):  #7C5CFF   claro #C3AEFF   escuro #4A2FB8
Sucesso #A6E86A · Erro #FF6B57 · Alerta #FFD34E · Ciano #4DE3E3
Cores de jogador (1 a 8): #EAA94E #9DB1EA #7BBF5E #FF6B8B #4DE3E3 #9A7BFF #FFD34E #FF8A3D

REGRAS DE FORMA
- Cantos arredondados sempre (raio 8 / 14 / 22 / 32px na escala do app).
- Geometria simples: círculo, cápsula, retângulo arredondado, triângulo suave.
- Contorno grosso e uniforme quando houver (3-4px em 64px), NUNCA traço fino.
- Silhueta legível a 24px. Se some ao reduzir, está errado.
- Glow sutil como acento, não como iluminação da cena inteira.
- Sombra é profundidade (offset Y + blur), nunca realismo.

REGRAS DE MOBILE (inegociáveis)
- Tudo será visto em tela de ~360-430px de largura, retrato, com o dedo em cima.
- Contraste mínimo 4.5:1 para texto e 3:1 para elementos de interface sobre #0B0D14.
- Nada de detalhe menor que 2px na escala final.
- O asset precisa funcionar sob brilho de sol e com o polegar cobrindo 1/3 da tela.
- Sem texto embutido na arte (o texto é HTML, para poder traduzir).

RESTRIÇÕES LEGAIS (obrigatórias)
- Arte 100% original. NÃO copie, referencie ou aproxime personagens, logotipos,
  interfaces, fases, mascotes ou identidade visual de jogos existentes —
  especialmente Fruit Ninja, Agar.io, Slither.io, Fall Guys, osu!, Gartic,
  Doodle Jump, WarioWare e Mario Party.
- Sem marcas registradas, sem fontes proprietárias, sem fotos, sem clip-art de
  terceiros. Nada gerado pode depender de licença externa.
- Se a ideia só funciona porque "lembra" um jogo famoso, descarte a ideia.

O QUE EVITAR
Gradiente arco-íris; drop shadow padrão do editor; degradê cinza corporativo;
estética "dashboard SaaS"; mascote fofinho infantil; pixel art (não combina com
a tipografia do app); realismo; lens flare; textura de papel; emoji desenhado à
mão imitando emoji de sistema.
```

---

## P0 · Prompt mestre do design system

> Use quando quiser **regenerar ou expandir o sistema inteiro**. Devolve
> especificação, não imagem. É o prompt que o usuário pediu como "prompt geral
> para construir todo o design do sistema".

```
[COLE O BLOCO BASE AQUI]

TAREFA
Projete o design system visual completo de um jogo de festa mobile chamado CHAOS.
Entregue uma ESPECIFICAÇÃO IMPLEMENTÁVEL, não um moodboard.

ARQUITETURA EXIGIDA (3 camadas de tokens CSS, nesta ordem)
1. PRIMITIVOS  — a paleta bruta, escala de espaço base-8, escala tipográfica
   modular (16px × 1.25), raios, sombras, durações, curvas de easing.
   Nome sem semântica: --void-800, --amber-400, --space-4, --fs-lg.
2. SEMÂNTICOS  — o que a coisa SIGNIFICA: --color-bg, --color-surface,
   --color-action, --color-danger, --color-text-muted. Componente só usa esta camada.
3. COMPONENTE  — só quando o valor é exclusivo de um componente:
   --btn-height, --card-radius, --hud-height.
Regra dura: nenhum componente escreve hex. Só var(--token).

ENTREGUE
A. PALETA
   Papel de cada cor, par de contraste testado sobre #0B0D14 (informe o ratio),
   e a regra de quando NÃO usar cada uma.
B. TIPOGRAFIA
   Três famílias com fallback de sistema (sem webfont externa, sem licença):
   - display: títulos, placar, contagem regressiva. Peso 800-900, tracking largo,
     caixa alta. Precisa parecer "letreiro de fliperama", não "logo de startup".
   - sans: corpo, instruções.
   - mono: números que mudam (tempo, pontos, ms). Tabular, para não tremer.
   Defina escala 12/14/16/20/25/31/39/49/61px e a que cada tamanho serve.
C. ESPAÇO E FORMA
   Escala base-8. Cinco raios. Cinco níveis de elevação (sombra + borda, porque
   sombra sozinha some em fundo escuro).
D. MOVIMENTO
   Quatro durações (100/160/240/400ms) e quatro curvas, incluindo uma "pop"
   com overshoot para acerto/pontuação. Regra: só transform e opacity são
   animados. Tudo desligado sob prefers-reduced-motion.
E. TEMA POR MICROJOGO
   Um único número (matiz HSL 0-360) deve ser capaz de recolorir a cena inteira.
   Especifique as variáveis derivadas (accent, accent-soft, accent-deep, wash, glow)
   e como elas se combinam com a paleta fixa sem brigar com ela.
F. COMPONENTES (estados: normal / pressionado / desabilitado / foco visível)
   Botão (3 tamanhos, 5 variantes), cartão de jogador, avatar, medidor de tempo,
   barra de progresso, selo de pontuação, controle segmentado, banner de evento,
   contagem regressiva, HUD de microjogo, tela de resultado.
   Alvo de toque mínimo 44px de altura real, 48px para ação primária.
G. ACESSIBILIDADE
   Contrastes verificados, foco visível de 3px que não depende de cor sozinha,
   estado nunca comunicado só por cor, respeito a prefers-reduced-motion e
   safe-area do iPhone.
H. ANTI-PADRÕES
   Liste 10 coisas que fariam este jogo parecer um dashboard corporativo, e a
   correção de cada uma.

FORMATO DA RESPOSTA
Markdown com um bloco de CSS custom properties pronto para colar em tokens.css,
mais uma tabela de decisões ("quando usar X em vez de Y").
Sem lorem ipsum, sem imagem, sem "considere talvez". Decida.
```

---

## P1 · Sprites

> Avatares dos 8 jogadores e as poucas figuras animadas que aparecem dentro dos
> microjogos (o alpinista do CLIMB, o corredor do RACE, a bolha do GROW).

```
[COLE O BLOCO BASE AQUI]

TAREFA
Crie um conjunto de SPRITES de personagem para o CHAOS.

CONCEITO DO PERSONAGEM
Criaturas geométricas minimalistas e expressivas — NÃO humanoides, NÃO mascotes
fofinhos, NÃO animais. Pense em "formas com atitude": um bloco, uma gota, um
cristal, um anel, uma estrela arredondada, uma cápsula, um trapézio, um losango.
A personalidade vem inteira dos OLHOS e da INCLINAÇÃO do corpo. Sem boca, sem
braços, sem pernas, sem acessório. Um traço, uma forma, dois olhos.

ENTREGÁVEL 1 — OS 8 AVATARES
- 8 formas visualmente distintas mesmo em escala de cinza (teste: imprima em
  preto e branco a 32px; se dois se confundem, redesenhe).
- A COR é aplicada por fora, via variável. Desenhe cada sprite com uma cor
  chapada substituível (use currentColor no SVG) + no máximo 2 tons derivados
  para volume. Nada de cor codificada por dentro.
- Tamanhos de uso: 32px (lista), 48px (cartão), 72px (pódio), 96px (destaque).
- Cada avatar em 3 expressões: NEUTRO, VITÓRIA, DERROTA. A expressão muda só o
  olho e a inclinação — a silhueta é sempre a mesma, para o jogador reconhecer
  "sou eu" instantaneamente.

ENTREGÁVEL 2 — SPRITES DE JOGO
- Alpinista (CLIMB): a mesma criatura, em 3 poses — subindo, no ar, aterrissando.
- Corredor (RACE): 2 poses de passada + 1 de tropeço.
- Bolha (GROW): forma que escala de 16px a 200px sem perder o traço (contorno
  precisa ser proporcional, não fixo).
- Alvo (AIM/REACTION): anel de acerto e anel de erro, mesma forma, cores opostas.

REGRAS TÉCNICAS
- SVG vetorial, viewBox="0 0 64 64", sem transform aninhado, sem filtro pesado,
  sem máscara, sem <image>, sem <text>.
- Preencher com currentColor onde a cor do jogador deve entrar; usar
  fill-opacity para os tons derivados. Zero hex hardcoded exceto o preto do olho.
- Cada sprite em UM único <svg>, sem <defs> compartilhado entre arquivos.
- Se a saída for raster: PNG com transparência, 3 densidades (64/128/192px),
  sem antialias sujo nas bordas.

TESTE DE ACEITE
Coloque os 8 lado a lado a 32px sobre #0B0D14. Se você precisar da cor para
distinguir dois deles, o par está reprovado.
```

---

## P2 · Ícones de UI

```
[COLE O BLOCO BASE AQUI]

TAREFA
Crie o conjunto de ÍCONES DE INTERFACE do CHAOS.

LISTA COMPLETA (não invente, não omita)
Navegação:  voltar, casa, sair, fechar (✕), mais (+), menos (−), engrenagem
Sala:       QR code, link/corrente, compartilhar, copiar, pessoa, pessoa+, coroa (host)
Partida:    play, replay, relógio/tempo, troféu, medalha, alvo, chama (sequência)
Áudio:      som ligado, som desligado, vibração
Feedback:   check, alerta (!), erro (✕ em círculo), raio (rápido), coração/vida
Microjogos: um pictograma para cada um dos 12 — reflexo, corte, desenho, escalada,
            ritmo, memória, mira, duelo, martelo, corrida, crescimento, desvio

ESPECIFICAÇÃO TÉCNICA (rígida)
- Grade de 24×24 com área segura de 20×20 (2px de respiro em volta).
- Traço de 2px, cap e join ARREDONDADOS, alinhado ao pixel (coordenadas em
  múltiplos de 0.5 para o traço cair no meio do pixel).
- Estilo OUTLINE por padrão. Cada ícone também numa versão SÓLIDA para estado ativo.
- Sem cor: stroke="currentColor" fill="none". A cor vem do CSS. Nunca hex.
- viewBox="0 0 24 24", sem width/height fixos no arquivo.
- Sem sombra, sem gradiente, sem texto, sem detalhe interno menor que 2px.
- Metáfora universal. Se precisa de legenda, o ícone falhou.

CONSISTÊNCIA
- Mesmo peso óptico entre todos (um ícone denso ao lado de um vazio quebra a régua).
- Ângulos só em 0°, 45° e 90°. Curvas com raio consistente.
- Os 12 pictogramas de microjogo precisam parecer uma FAMÍLIA e ao mesmo tempo
  serem distinguíveis a 24px — teste os 12 numa fileira só.

FORMATO DA RESPOSTA
Um bloco de código por ícone, com o SVG completo e o nome do arquivo em
kebab-case (ex.: icon-share.svg, icon-game-slice.svg).
```

---

## P3 · Objetos dos microjogos

> As peças que o jogador realmente toca, corta, coleta e desvia.

```
[COLE O BLOCO BASE AQUI]

TAREFA
Crie os OBJETOS JOGÁVEIS dos microjogos do CHAOS. Estes não são ilustrações:
são peças funcionais que aparecem em movimento, em canvas, sobre fundo escuro,
e precisam ser lidas em menos de 0,2 segundo.

INVENTÁRIO POR JOGO
SLICE   — 4 objetos "bons" (formas orgânicas geométricas, NÃO frutas realistas),
          1 objeto "raro" dourado, 1 objeto "perigoso". Cada um com uma versão
          INTEIRA e duas METADES de corte (esquerda/direita) que encaixam.
          O perigoso precisa gritar PERIGO pela FORMA (bicos, ângulo agudo),
          não só pela cor — daltônico também joga.
AIM     — alvo bom (anel concêntrico) e alvo ruim (forma espinhosa), mesma
          área de toque, silhueta oposta.
GROW    — pastilhas coletáveis em 3 tamanhos + a bolha do jogador.
DODGE   — obstáculo móvel (bloco com movimento sugerido por chanfro/rastro),
          coletável de bônus, marcador de zona segura.
CLIMB   — plataforma normal, plataforma frágil, plataforma móvel, plataforma
          de impulso. Diferença legível pela BORDA, não por textura.
RACE    — obstáculo baixo (pular), obstáculo alto (desviar), linha de chegada.
MASH    — o botão gigante em 3 estados: repouso, pressionado, saturado (100%).
RHYTHM  — nota (a que desce), zona de acerto, e o "pulso" de PERFEITO/BOM/ERRO.
MEMORY  — 6 símbolos de sequência, distinguíveis por FORMA antes de por cor.
DUELO   — as duas marcas do tabuleiro 3×3 (não use X e O literais; invente duas
          marcas geométricas de peso igual) e a linha de vitória animável.
DRAW    — cursor de pincel, borracha, e os chips de cor da paleta.
REAÇÃO  — o alvo que acende, em estado apagado, armado e acertado.

REGRAS FUNCIONAIS (mais importantes que a beleza)
- LEGIBILIDADE EM MOVIMENTO: o objeto será visto girando, escalando e
  atravessando a tela. Detalhe interno complexo vira borrão. Máximo 3 elementos
  por objeto.
- HITBOX HONESTA: a silhueta visível tem que corresponder à área tocável.
  Nada de aura decorativa maior que o objeto — o jogador acha que errou.
- PAR DE OPOSTOS: sempre que houver "bom vs. ruim", os dois precisam ter
  contraste de FORMA (redondo vs. anguloso), de COR e de PESO VISUAL. Três
  canais redundantes, porque é jogo rápido em tela pequena.
- ESCALA MÍNIMA: nada abaixo de 44px de área tocável na tela real.
- ESTADOS: cada objeto precisa de repouso, ativo/tocado e destruído/coletado.

FORMATO
SVG viewBox="0 0 64 64", currentColor onde a cor é dinâmica, sem <defs> global.
Entregue também, para cada objeto, uma linha descrevendo a ANIMAÇÃO esperada
(ex.: "gira 180° em 400ms com ease-out; ao ser cortado, as metades se afastam
40px e desvanecem em 300ms").
```

---

## P4 · Backgrounds e cenários

```
[COLE O BLOCO BASE AQUI]

TAREFA
Crie os FUNDOS do CHAOS. Um fundo aqui tem uma única obrigação: dar identidade
ao microjogo sem competir com nada que se mexe na frente dele.

PRINCÍPIO
O fundo é atmosfera, não cenário. Ele é escuro, de baixo contraste interno, e
recolorido por UMA variável de matiz. Se um objeto do jogo passar por cima e
ficar difícil de ver, o fundo está errado — não o objeto.

CAMADAS (exatamente três)
1. BASE      — cor sólida quase preta (#0B0D14 a #11131C). Nunca branco, nunca
               gradiente claro.
2. ATMOSFERA — um brilho radial amplo e muito suave na cor do microjogo,
               opacidade 6-12%, posicionado fora do centro da ação.
3. TEXTURA   — padrão geométrico repetível, opacidade 3-6%: grade, pontos,
               diagonais, ondas, hexágonos. Nada figurativo. Nada que crie
               falso movimento (moiré em tela pequena é náusea).

FUNDOS PEDIDOS (um por microjogo, todos derivados do mesmo esqueleto)
reflexo (ciano) · corte (verde-lima) · desenho (magenta) · escalada (azul) ·
ritmo (rosa) · memória (violeta) · mira (vermelho) · duelo (âmbar) ·
martelo (laranja) · corrida (turquesa) · crescimento (verde) · desvio (magenta)

Mais três fundos de tela cheia:
- HOME     — o mais expressivo dos três; pode ter movimento lento (partículas
             grandes e lentas, 20-40s de ciclo, no máximo 12 partículas).
- LOBBY    — calmo, quase liso, porque a atenção vai para o QR Code e a lista.
- RESULTADO — celebratório: raios de luz suaves saindo do centro-topo, sem
             confete realista, sem brilho que ofusque o placar.

REGRAS TÉCNICAS
- Preferir CSS puro (radial-gradient, linear-gradient, repeating-linear-gradient)
  a arquivo de imagem. Se precisar de SVG, que seja um <pattern> tileável de no
  máximo 2KB.
- Nada de animação que rode durante o gameplay: o fundo é ESTÁTICO enquanto o
  microjogo está ativo, para não roubar frame nem bateria. Movimento só em
  Home, Lobby e Resultado.
- Respeitar prefers-reduced-motion desligando qualquer movimento.
- Tudo precisa continuar legível com o brilho do celular no mínimo.

FORMATO
Para cada fundo: o CSS completo usando var(--game-hue) onde couber, mais uma
frase sobre a sensação pretendida.
```

---

## P5 · Expansão de SVGs (pacote completo)

> Este é o prompt de "faça o pacote inteiro e me entregue pronto para o repo".

```
[COLE O BLOCO BASE AQUI]

TAREFA
Produza o PACOTE DE SVGs do CHAOS, pronto para entrar num projeto React + Vite
(JavaScript, sem TypeScript, sem Tailwind, sem biblioteca de ícones externa).

ESTRUTURA DE PASTAS EXIGIDA
src/assets/
  avatars/    avatar-01.svg … avatar-08.svg      (+ -win / -lose)
  icons/      icon-<nome>.svg                     (24×24, outline)
  icons/solid/icon-<nome>.svg                     (24×24, sólido)
  objects/    obj-<jogo>-<nome>.svg               (64×64)
  patterns/   pattern-<nome>.svg                  (tile, ≤2KB)
  brand/      logo-chaos.svg, logo-mark.svg

CONVENÇÕES OBRIGATÓRIAS
- kebab-case em tudo. Sem espaço, sem acento, sem maiúscula no nome de arquivo.
- viewBox sempre presente; width/height NUNCA no arquivo (quem dimensiona é o CSS).
- Cor dinâmica via currentColor. Cor fixa só quando for semanticamente fixa
  (o vermelho de perigo, o dourado do raro) e sempre um hex da paleta.
- shape-rendering="geometricPrecision" em formas curvas pequenas.
- Sem <script>, sem <foreignObject>, sem <image>, sem <text>, sem link externo,
  sem comentário de editor (Figma/Illustrator sujam o arquivo — limpe).
- IDs prefixados pelo nome do arquivo (ex.: id="obj-slice-bomb__core"), porque
  SVG inline compartilha namespace de ID no documento e IDs repetidos quebram
  máscara e gradiente silenciosamente.
- Cada arquivo abaixo de 3KB não minificado. Se passar, simplifique o path.

ENTREGUE TAMBÉM
1. Um componente React único que carrega qualquer ícone por nome, sem
   biblioteca externa, usando import.meta.glob do Vite (JSX, não TSX).
2. Um arquivo de índice listando todos os nomes disponíveis, para o autocomplete
   e para o painel de debug.
3. Uma folha de contato: um HTML estático que renderiza TODOS os assets em
   fundo #0B0D14, nos tamanhos reais de uso (24 / 32 / 48 / 64px), para revisão
   visual de uma vez só.
4. Um checklist de aceite marcável, um item por regra desta seção.

CRITÉRIO DE REPROVAÇÃO (seja rigoroso consigo mesmo)
Reprove e refaça qualquer asset que: dependa de cor para ser entendido; suma a
24px; tenha traço abaixo de 2px; use gradiente de mais de 2 paradas; tenha ID
não prefixado; passe de 3KB; ou lembre visualmente qualquer jogo comercial
existente.
```

---

## Anexo A · Paleta em hex (copiável)

```
VOID      #07080E  #0B0D14  #11131C  #171A26  #1E2231  #272C3D  #343A50  #4A5270
BONE      #FBF9F4  #F1EDE2  #C9C3B4  #8E897C  #5C5851
PERIWINKLE #D6E0FA #B4C4F1  #9DB1EA  #6C8BE8  #4A66CC  #2F4494
ÂMBAR     #FBE4BE  #F4CD8A  #EAA94E  #DE9128  #B9772E
VIOLETA   #C3AEFF  #9A7BFF  #7C5CFF  #4A2FB8
FEEDBACK  #A6E86A verde · #FF6B57 vermelho · #FFD34E ouro · #4DE3E3 ciano
JOGADORES #EAA94E #9DB1EA #7BBF5E #FF6B8B #4DE3E3 #9A7BFF #FFD34E #FF8A3D
```

## Anexo B · Matiz (`hue`) de cada microjogo

O `hue` vai no `meta` de cada microjogo e o `<Screen hue={…}>` recolore a cena
inteira sozinho. Um número, não uma paleta.

| Microjogo | `hue` | Sensação |
|---|---:|---|
| reaction | 190 | ciano elétrico, tensão |
| slice | 96 | verde-lima, corte |
| draw | 280 | magenta, criação |
| climb | 210 | azul, altitude |
| rhythm | 320 | rosa, batida |
| memory | 265 | violeta, mente |
| aim | 8 | vermelho, alvo |
| tictactoe | 45 | âmbar, duelo |
| mash | 25 | laranja, força |
| race | 170 | turquesa, velocidade |
| grow | 140 | verde, expansão |
| dodge | 300 | magenta, perigo |

## Anexo C · Checklist de aceite de qualquer asset

- [ ] Legível a 24px sobre `#0B0D14`
- [ ] Entendível em escala de cinza (não depende de cor)
- [ ] Traço ≥ 2px na escala final
- [ ] `viewBox` presente, `width`/`height` ausentes
- [ ] `currentColor` onde a cor é dinâmica
- [ ] IDs prefixados pelo nome do arquivo
- [ ] < 3KB, sem metadado de editor
- [ ] Área tocável ≥ 44px quando for interativo
- [ ] Silhueta = hitbox (sem aura decorativa maior que o objeto)
- [ ] Não lembra nenhum jogo comercial existente

## Anexo D · Como plugar no código

SVG inline é o formato certo aqui: aceita `currentColor`, entra no bundle sem
requisição extra e pode ser animado por CSS. `<img src="...svg">` não faz nada
disso.

```jsx
// src/components/Icon/index.jsx — carrega qualquer ícone por nome, sem lib externa.
const FILES = import.meta.glob('../../assets/icons/*.svg', {
  eager: true, query: '?raw', import: 'default',
});

const BY_NAME = Object.fromEntries(
  Object.entries(FILES).map(([path, svg]) => [
    path.split('/').pop().replace('icon-', '').replace('.svg', ''),
    svg,
  ]),
);

export const ICON_NAMES = Object.keys(BY_NAME).sort();

export default function Icon({ name, size = 24, label = null }) {
  const svg = BY_NAME[name];
  if (!svg) return null;
  return (
    <span
      className="icon"
      style={{ width: size, height: size }}
      role={label ? 'img' : 'presentation'}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

```css
/* A cor vem de fora — é por isso que o SVG usa currentColor. */
.icon { display: inline-flex; color: inherit; }
.icon svg { width: 100%; height: 100%; display: block; }
```

> `dangerouslySetInnerHTML` aqui é seguro porque a fonte são arquivos do próprio
> repositório, embutidos em tempo de build. Se um dia o SVG vier de fora
> (upload, API), isto vira XSS — nesse caso, sanitize antes.

---

**Ver também:** [00-HANDOFF.md](00-HANDOFF.md) · [01-ARQUITETURA.md](01-ARQUITETURA.md) ·
[07-MOBILE.md](07-MOBILE.md)
