# CHAOS — Microgame Party

Jogo de festa **mobile-first**: a partida troca de microjogo a cada 15–30 segundos. Cada rodada é
uma interação só, aprendida em menos de 5 segundos, jogada com o dedo. Entre elas, nada de botão —
a partida anda sozinha do lobby até o placar final.

12 microjogos · 2–8 jogadores · rodadas de 5, 7 ou 10 · eventos CHAOS que viram a mesa no meio.

---

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. O Vite sobe com `host: true`, então o endereço de LAN que ele
imprime (`http://192.168.x.x:5173`) **abre direto no celular** — que é onde este jogo deve ser
testado. Ver `docs/07-MOBILE.md`.

```bash
npm run build      # → dist/
npm run preview    # serve o dist/ como produção
```

## Como se joga

1. **CRIAR SALA** — nome, avatar, número de rodadas, **quantos jogam (2 a 8)** e dificuldade dos
   oponentes. Dá para jogar **em dupla**: 2 é a primeira opção, não um caso de canto.
2. **LOBBY** — a sala tem um código curto (sem O/0/I/1), um link e um **QR Code**. Botões de copiar
   e compartilhar (Web Share API no celular).
3. **JOGAR** — sorteio de microjogo → instrução → 3‑2‑1 → jogo → resultado da rodada → próximo.
   Sem clique entre rodadas.
4. **PLACAR FINAL** — colocação, conquistas (⚡ reflexo, 🎨 artista, 🧗 altura, 🎯 precisão,
   🎵 combo, 👆 toques, 🔥 sequência) e **JOGAR DE NOVO**.

Pontuação: 1º **+100** · 2º **+75** · 3º **+50** · 4º+ **+25**, com bônus de sequência de vitórias
(a partir de x2, +25 por vitória, teto +100).

## Estado atual — o que é real e o que não é

| | |
|---|---|
| ✅ **Jogo completo e jogável** | 12 microjogos funcionando, partida inteira de ponta a ponta |
| ✅ **Identidade de sala real** | código, URL, QR Code, link compartilhável, rota `/join/:roomId` |
| ⚠️ **Multiplayer é local/simulado** | os outros jogadores são bots (FÁCIL/MÉDIO/DIFÍCIL) rodando no mesmo aparelho |
| ✅ **Protocolo e transporte prontos** | `src/net/` — mensagens, fronteira de autoridade e hub loopback (em memória) |
| ⛔ **Sem rede** | por decisão de escopo: nada de backend, banco, WebSocket, WebRTC ou login |

O transporte de rede é a **Fase 2** e tem plano escrito em `docs/05-FASE2-MULTIPLAYER.md`. A
arquitetura já foi construída para recebê-lo sem reescrever microjogo nenhum — ver a seção
"costuras" desse documento.

A **primeira metade já está no código** (F7-A): o `src/net/` define o protocolo, o contrato do
transporte e um hub *loopback* que roda tudo em memória. **Isso não é rede** — não há socket,
servidor nem WebRTC; o que existe é o encaixe por onde o cano de verdade entra sem tocar em
microjogo. A segunda metade (WebRTC + sinalização) segue **fora de escopo**, porque exige backend.

## Stack

React 18 · JavaScript + JSX (**sem TypeScript**) · Vite 5 · CSS puro com design tokens ·
Canvas 2D · Web Audio API (som 100% procedural, sem áudio licenciado) · `qrcode`.

Sem Tailwind, sem Next.js, sem framework de estado, sem UI kit.

## Onde fica o quê

```text
src/
├── components/   19 componentes de UI (Screen, Button, PlayerCard, QRCode, Timer, …)
├── screens/      Home · CreateRoom · JoinRoom · Lobby · Game · FinalScore
├── games/        os 12 microjogos + _shared/ (hooks, bots, joystick, HoldButton)
├── engine/       gameRegistry roundManager scoreManager resultManager
│                 chaosEvents botProfile inputManager random
├── room/         roomManager roomCode roomLink
├── audio/        soundManager (Web Audio procedural)
├── net/          protocol · transport (loopback) · netSession  ← F7-A, sem rede
├── state/        gameState (reducer puro) + GameProvider
├── data/         palavras, avatares, nomes
└── styles/       tokens.css · global.css

public/           icon.svg · manifest.webmanifest  (instalar na tela inicial)
```

Não há um único asset binário no repo: o jogo inteiro é canvas procedural, CSS, emoji e SVG.

## Documentação

Leia nesta ordem se for continuar o projeto:

| Doc | Para quê |
|---|---|
| [`docs/00-HANDOFF.md`](docs/00-HANDOFF.md) | **Comece aqui.** Contexto e regras de trabalho |
| [`docs/01-ARQUITETURA.md`](docs/01-ARQUITETURA.md) | Contratos que não se quebram (microjogo, action bus, chaos, scoring) |
| [`docs/02-DESIGN-SYSTEM.md`](docs/02-DESIGN-SYSTEM.md) | Tokens, tipografia, cor, acessibilidade |
| [`docs/03-PROGRESSO.md`](docs/03-PROGRESSO.md) | Histórico append-only: o que foi feito, quando e por quê |
| [`docs/04-PROMPT-DESIGN-CHAOS.md`](docs/04-PROMPT-DESIGN-CHAOS.md) | Prompts de arte: sprites, ícones, fundos, pacote SVG |
| [`docs/05-FASE2-MULTIPLAYER.md`](docs/05-FASE2-MULTIPLAYER.md) | Plano da rede + §8: o que já existe em `src/net/` (WebRTC **não implementado**) |
| [`docs/06-MICROGAMES.md`](docs/06-MICROGAMES.md) | Os 12 jogos em tabela + receita do 13º |
| [`docs/07-MOBILE.md`](docs/07-MOBILE.md) | Regras de toque, viewport, safe-area, teste em aparelho |

## Modo debug

Só existe em `npm run dev` — no build de produção o painel **não é incluído no bundle**
(`components/DebugPanel/DevOnly.jsx` explica como e por quê).

Para abrir: tecla **`D`** no navegador, ou **4 toques em 1,5s** no canto superior esquerdo no
celular. Dá para escolher o microjogo, forçar evento CHAOS, pular a contagem, terminar a rodada,
saltar de rodada, zerar o placar e adicionar/remover bots.

## Licença e créditos

Código e arte originais de **Rafael Moreira Ramos**. Nenhum asset, trilha, personagem, logo ou
identidade visual de terceiros. Os microjogos são *inspirados* em mecânicas clássicas de jogos
casuais — nenhum é clone de nada.
