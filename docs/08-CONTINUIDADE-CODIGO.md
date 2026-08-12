# 08 · PROMPT DE CONTINUIDADE — CÓDIGO

> **Para quê:** o código do CHAOS está fechado e jogável; a próxima entrada é **design e
> identidade visual**. Este arquivo existe para que, quando o design encostar (ou terminar), o
> **lado do código** volte exatamente de onde parou — em qualquer sessão, com qualquer IA, sem
> ninguém precisar reler o repo inteiro.
>
> Ele tem três coisas: o **prompt de continuidade** (§2), a **fronteira do que design pode mexer
> sozinho** (§3) e o **checklist de aceite** para rodar depois que a arte entrar (§4).

---

## 1. Como usar

**Sessão nova de código?** Abra a sessão **dentro de `CHAOS/`** (não na pasta-mãe
`ClaudCodeCodes/` — ver §5) e cole o bloco do §2 inteiro como primeira mensagem.

**Sessão nova de design?** Não é este arquivo. Use `04-PROMPT-DESIGN-CHAOS.md`, que já tem o
BLOCO BASE + P0–P5 + anexos de paleta, matiz por microjogo e critério de aceite de asset.

**Os dois lados se encontram** no §3 deste arquivo. Se um prompt de design pedir algo que o §3
marca como "exige código", isso vira tarefa de código — não improvise no CSS do componente.

---

## 2. O prompt (copiar do início ao fim do bloco)

````text
Você vai continuar o CHAOS — Microgame Party, um jogo de festa multiplayer mobile-first
em React 18 + JavaScript + JSX + Vite + CSS puro + Canvas 2D + Web Audio API.
O repositório está em CHAOS/. O MVP está FECHADO E JOGÁVEL — você não está começando nada
do zero, está dando manutenção e evolução.

ANTES DE TOCAR EM QUALQUER ARQUIVO, leia nesta ordem:
  1. CHAOS/docs/00-HANDOFF.md      (estado, mapa mental, regras de ouro)
  2. CHAOS/docs/01-ARQUITETURA.md  (contrato do microjogo, action bus, chaos effects, scoring)
  3. CHAOS/docs/07-MOBILE.md       (contrato mobile — obrigatório antes de mexer em microjogo)
  4. CHAOS/docs/03-PROGRESSO.md    (histórico; leia do fim para o começo)
Não abra o src/ inteiro. A arquitetura é modular de propósito: abra só a pasta do que vai mexer.

ESTADO ATUAL
- F0→F6 concluídas: 12 microjogos funcionando, partida completa de ponta a ponta
  (LOBBY → MATCH_START → GAME_INTRO → COUNTDOWN → PLAYING → GAME_FINISHED → ROUND_RESULT →
  NEXT_CHALLENGE → ... → FINAL_SCORE), avanço automático sem botão entre rodadas.
- F7-A: src/net/ tem protocolo + contrato de transporte + hub loopback. NÃO tem rede.
- F7-B (WebRTC + sinalização): NÃO IMPLEMENTAR. Está bloqueado por escopo do próprio dono
  do projeto, não por limitação técnica. Ver docs/05-FASE2-MULTIPLAYER.md §3 e §8.
- F8: sala de 2 jogadores liberada na criação, piso no "remover" do lobby, icon.svg +
  manifest.webmanifest. Verificado no navegador em 375x812.
- Pendente de arte: os assets de docs/04-PROMPT-DESIGN-CHAOS.md ainda não existem como
  arquivo. O jogo hoje roda com canvas procedural + tokens CSS + emoji + 3 SVGs inline.

PROIBIDO NO PROJETO (não negocie, não sugira alternativa "só dessa vez")
  TypeScript · Tailwind · Next.js · backend · banco de dados · WebSocket · WebRTC ·
  STUN/TURN/ICE/sinalização · autenticação · serviço externo de multiplayer ·
  asset ou música com direito autoral · clonar personagem, logo, UI, fase ou identidade
  visual de Fruit Ninja, Agar.io, Slither.io, Fall Guys, osu!, Gartic, Doodle Jump,
  jogo da velha comercial, WarioWare ou Mario Party (são inspiração, não molde).

REGRAS DE OURO DESTE REPO (as 7 estão em 00-HANDOFF.md §5; as que mais quebram são estas)
- Um microjogo = uma pasta em src/games/<id>/ com index.js (metadata) + <Nome>.jsx + .css.
  Nunca lógica de jogo em App.jsx nem em screens/Game.
- Nenhum hex ou medida solta em CSS de componente. Só var(--token). Tokens em
  src/styles/tokens.css, em 3 camadas (primitivo → semântico → componente).
- Todo microjogo limpa TUDO no unmount: rAF, setTimeout, setInterval, listeners de pointer,
  nós de áudio. Zero jogo rodando depois da tela de resultado.
- Todo microjogo tem que terminar. Existe watchdog em screens/Game — se travar ou estourar,
  a partida segue para a próxima rodada em vez de dar tela branca.
- Mobile é o único alvo: toque/arrasto/gesto, alvo ≥ 44px, Pointer Events, retrato,
  nada de :hover como informação.
- Input só entra pelo action bus (engine/inputManager.js). O microjogo não pode saber se a
  ação veio de mouse, dedo ou de uma mensagem de rede futura. É essa costura que deixa a
  Fase 2 possível sem reescrever microjogo.
- Ao terminar um passo, documente em docs/03-PROGRESSO.md. O histórico é APPEND-ONLY:
  para corrigir algo antigo, acrescente entrada nova dizendo que a linha antiga valia até ali.
  Nunca reescreva entrada passada.
- Commits: autor único é o Rafael. NUNCA adicione Co-Authored-By: Claude.

RODAR
  cd CHAOS && npm install && npm run dev     → http://localhost:5173
  Vite está com host: true, então o celular na mesma Wi-Fi abre pelo IP do PC
  (http://192.168.x.x:5173) — é assim que o QR Code funciona de verdade.
  Existe CHAOS/.claude/launch.json (preview_start pelo nome "chaos"), e ele só funciona
  com a sessão aberta DENTRO de CHAOS/. Da pasta-mãe, use preview_start { url }.

SE A TAREFA VIER DO LADO DO DESIGN
  Leia docs/08-CONTINUIDADE-CODIGO.md §3 antes: lá está o que é troca de token (design faz
  sozinho, código nem entra) e o que exige mexer em componente/microjogo. E rode o §4 antes
  de dar por pronto.

COMO TRABALHAR
  Documente, separe em passos, deixe histórico para a próxima IA continuar, economize
  contexto e token. Nada de refatoração oportunista fora do escopo pedido.
````

---

## 3. Fronteira design ↔ código

Regra de bolso: **se dá para resolver em `tokens.css` ou em arquivo de asset, é design. Se muda
markup, estado, geometria de canvas ou regra de jogo, é código.**

| O que muda | Onde | Precisa de código? |
|---|---|---|
| Paleta, matiz, contraste, cores de jogador `--p1..--p8` | `src/styles/tokens.css` (camada primitiva) | **Não** |
| Espaçamento, raio, sombra, escala tipográfica | `src/styles/tokens.css` | **Não** |
| Papel semântico (o que é "perigo", "sucesso", "superfície elevada") | `tokens.css` camada semântica | **Não** |
| Fonte nova | `tokens.css` + `global.css` (`@font-face` + arquivo local) | **Não**, se for local e sem CDN |
| Duração/curva de animação | tokens de movimento | **Não** |
| Ícone novo ou trocado | `src/assets/icons/*.svg` + componente `Icon` (`04-…` Anexo D) | **Sim, uma vez** — criar a pasta e o componente; depois é só soltar arquivo |
| Sprite / objeto / background de microjogo | `src/games/<id>/` | **Sim** — quem desenha no canvas é o microjogo; asset novo é carga + desenho novos |
| `--game-hue` por rodada | `src/games/<id>/index.js` (metadata) | **Sim** (é metadata, não CSS) |
| Layout de tela, hierarquia, ordem de elementos | `src/screens/<Tela>/` | **Sim** |
| Estados de componente (loading, disabled, erro) | `src/components/<Componente>/` | **Sim** |
| Logo | `src/components/Logo/` + `public/icon.svg` + `manifest.webmanifest` | **Sim** — são 3 lugares, e o SVG do `public/` **não enxerga `var(--token)`**: ali o hex vai escrito, com comentário dizendo de qual token ele saiu |

**Três armadilhas que já morderam este repo e vão morder de novo:**

1. **`public/icon.svg` não lê token.** É servido como arquivo estático, fora do CSS do app.
   Trocar a paleta nos tokens **não** troca o ícone da tela inicial — tem que editar o hex lá,
   e o comentário ao lado existe para dizer qual token ele deveria acompanhar.
2. **`--game-hue` é metadata, não estilo.** Cada microjogo declara o próprio matiz em
   `index.js`. Mudar identidade por rodada é mexer em 12 arquivos de metadata, não no CSS.
3. **Alvo de toque não é negociável por estética.** No `SegmentedControl` com 5 opções em
   375px, cada opção mede **60×44px** — exatamente o piso de 44px do `07-MOBILE.md`. Não cabe
   texto auxiliar dentro, e diminuir para "respirar melhor" quebra o contrato mobile.

---

## 4. Checklist de aceite quando o design entrar

Rode isto **antes** de dar qualquer rodada de design por concluída. É o mesmo rigor de
`02-DESIGN-SYSTEM.md` §7, só que na ordem em que as coisas quebram na prática.

- [ ] `npm run build` limpo — sem warning novo. (A referência atual é **223 módulos, build limpo.**)
- [ ] Nenhum hex ou `px` solto entrou em CSS de componente. Só `var(--token)`.
- [ ] Contraste: texto de corpo ≥ 4.5:1, texto grande e ícone informativo ≥ 3:1, sobre a
      superfície em que ele realmente aparece — não sobre o `--void-800` "teórico".
- [ ] As 8 cores de jogador continuam distinguíveis **entre si** com 2, 3 e 8 jogadores na tela,
      e nenhuma sumiu no fundo.
- [ ] Alvo de toque ≥ 44px em tudo que é tocável, medido em **375×812** (não no desktop).
- [ ] Retrato: nenhuma tela ganhou rolagem horizontal; `RotateHint` continua coerente.
- [ ] Os 12 microjogos ainda **terminam** e ainda **limpam tudo** — o watchdog não pode estar
      salvando ninguém em silêncio.
- [ ] Nada de `:hover` carregando informação que o toque não recebe.
- [ ] Se entrou fonte: arquivo local no repo, sem CDN, sem chamada externa em runtime.
- [ ] Entrada nova em `03-PROGRESSO.md` (append-only) dizendo o que mudou e o que ficou de fora.

**O que não dá para verificar no ambiente de agente:** o painel de browser fica oculto, então
`screenshot` e clique sintético expiram e o `requestAnimationFrame` **não dispara** — microjogo
não roda ali. DOM, console e medida (`getBoundingClientRect`) funcionam. Animação, canvas e
"o jogo é gostoso de jogar?" **só em aparelho**.

---

## 5. Pendências e bloqueios conhecidos

| Item | Situação |
|---|---|
| Assets de arte (sprites, ícones, objetos, backgrounds, expansão SVG) | **Existem como prompt**, não como arquivo — `04-PROMPT-DESIGN-CHAOS.md`. É exatamente a fase que o Rafael vai abrir agora. |
| `apple-touch-icon` PNG | Único raster que o projeto precisa (iOS ignora SVG nesse slot). Não começado. |
| F7-B — WebRTC + sinalização | **Bloqueado por escopo do dono do projeto.** Não desbloqueie por conta própria. |
| `preview_start` pelo nome | Só com a sessão aberta **dentro de `CHAOS/`**. Da pasta-mãe `ClaudCodeCodes/`, o harness rejeita com `cwd must be a relative path within the project root` — e o campo `cwd` no `launch.json` **não** resolve. Da pasta-mãe, use `preview_start { url }` apontando para um Vite já de pé. |
| Confiança na jogabilidade | Vem da sessão F6, em aparelho. Nada no ambiente de agente substitui isso. |

---

**Ver também:** [00-HANDOFF.md](00-HANDOFF.md) · [01-ARQUITETURA.md](01-ARQUITETURA.md) ·
[02-DESIGN-SYSTEM.md](02-DESIGN-SYSTEM.md) · [04-PROMPT-DESIGN-CHAOS.md](04-PROMPT-DESIGN-CHAOS.md) ·
[07-MOBILE.md](07-MOBILE.md)
