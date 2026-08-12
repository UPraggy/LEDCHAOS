# 00 — HANDOFF (leia primeiro)

> **Para outra IA / outro dev:** este é o ponto de entrada. Leia este arquivo + `01-ARQUITETURA.md`
> antes de tocar em código. Depois consulte `03-PROGRESSO.md` para saber o que já está feito.
> **Não** leia todos os arquivos do `src/` de uma vez — a arquitetura é modular de propósito
> justamente para você abrir só a pasta do que vai mexer.

---

## 0) Estado — atualizado em 2026-08-09

**MVP fechado e jogável.** F0→F6 concluídas: 12 microjogos funcionando, partida completa de ponta a
ponta, build limpo (223 módulos, sem warnings), testado em viewport de celular.

**F7-A também está no código:** `src/net/` (protocolo + contrato de transporte + hub loopback).
**Continua sem rede** — é tudo em memória, num aparelho só; nenhum backend, WebSocket ou WebRTC
entrou. O que falta é o cano de verdade (**F7-B**), e ele está **bloqueado por escopo**: WebRTC
precisa trocar SDP/ICE antes de conectar, o que exige servidor de sinalização, que é backend.
Não desbloqueie isso por conta própria. Ver `05-FASE2-MULTIPLAYER.md` §3 e §8.

**F8:** sala de **2 jogadores** liberada na tela de criar (o motor já aceitava; a UI é que não
oferecia — e o seletor tinha um off-by-one entre rótulo e resultado), piso no "remover" do lobby,
e `public/icon.svg` + `manifest.webmanifest` para instalar na tela inicial.
Detalhe por fase em `03-PROGRESSO.md`.

**Próxima fase é design/identidade visual, não código.** Se você é a IA do lado do código e
chegou aqui depois disso, comece por **`08-CONTINUIDADE-CODIGO.md`**: tem o prompt de retomada,
a fronteira do que o design muda sozinho (token) e do que exige código, e o checklist para
rodar quando a arte entrar.

## 1) O que é

**CHAOS — Microgame Party.** Jogo de festa multiplayer mobile-first para 2–8 jogadores.
A partida não é um jogo só: ela troca constantemente entre **microjogos de 15–30 s**.
12 microjogos, 5/7/10 rodadas, pontuação por ranking, Chaos Events, ranking final e conquistas.

- **Stack:** React 18 + JavaScript + JSX + Vite + CSS puro + Canvas 2D + Web Audio API.
- **Proibido no projeto:** TypeScript, Tailwind, Next.js, backend, banco, WebSocket, WebRTC, auth.
- **Identidade visual:** derivada de `ME/GUIA_DEFINITIVODESIGN_16062026` + `ME/PlanejamentoCarreira/06-identidade-visual.md`
  (paleta *void-frio* Rafael MR), adaptada para arcade. Ver `02-DESIGN-SYSTEM.md`.

## 2) Rodar

```bash
cd CHAOS
npm install
npm run dev
```

Abre em `http://localhost:5173`. O Vite está com `host: true`, então o celular na mesma
Wi-Fi abre pelo IP do PC (`http://192.168.x.x:5173`) — é assim que o QR Code funciona de verdade.

## 3) Estado do multiplayer (IMPORTANTE)

| Camada | Status |
|---|---|
| Identidade de sala (ID, URL, QR, copiar, compartilhar, rota `/join/:id`) | ✅ **funcional agora** |
| Lobby, jogadores, partida, microjogos, placar, resultado | ✅ **funcional agora** (local/simulado) |
| Protocolo + contrato de transporte + hub loopback (`src/net/`) | ✅ **no código** — F7-A, **sem rede** |
| Transporte device-to-device (WebRTC / DataChannel / signaling) | ⛔ **não implementado de propósito** — F7-B, bloqueado |

Jogadores que não são o humano são **bots simulados** com perfil de habilidade (`skill` 0–1).
A arquitetura já é *host-autoritativa* e consome **ações normalizadas**, então trocar
"bot local" por "mensagem de rede" na Fase 2 não exige reescrever microjogo nenhum.

A F7-A já prova isso rodando: em dev, `window.__chaosNet.guest('p2')` pluga um "outro aparelho"
fake no hub e a ação dele cai no action bus real como `{playerId:'p2', action:'TAP', remote:true}` —
indistinguível de um dedo local. Ver `05-FASE2-MULTIPLAYER.md` §8.

## 4) Mapa mental de 30 segundos

```text
App.jsx (rotas)
   └─ GameProvider  ← estado único da sala/partida (state/)
        ├─ screens/Home | CreateRoom | JoinRoom | Lobby | Game | RoundResult | FinalScore
        └─ screens/Game  ← MÁQUINA DE ESTADOS da partida
              ├─ engine/roundManager  (que microjogo vem agora? tem Chaos Event?)
              ├─ games/<id>/Component (o microjogo em si, isolado)
              ├─ engine/scoreManager  (ranking → pontos → streak)
              └─ engine/resultManager (conquistas finais)
```

## 5) Regras de ouro deste repo

1. **Um microjogo = uma pasta** em `src/games/<id>/` com `index.js` (metadata) + `<Nome>.jsx` + `.css`.
   Nunca coloque lógica de jogo em `App.jsx` nem em `screens/Game`.
2. **Contrato do microjogo é sagrado** (`01-ARQUITETURA.md` §2). Se você mudar o contrato,
   mude os 12 jogos e atualize a doc.
3. **Nenhum hex/medida solta no CSS de componente.** Só `var(--token)`. Tokens em `src/styles/tokens.css`.
4. **Todo microjogo limpa tudo no unmount**: `rAF`, `setTimeout`, `setInterval`, listeners de pointer,
   nós de áudio. Zero jogo rodando depois da tela de resultado.
5. **Todo microjogo tem que terminar.** Existe watchdog no `screens/Game` — se o jogo travar ou
   estourar, a partida segue para a próxima rodada em vez de dar tela branca.
6. **Mobile é o único alvo.** Toque/arrasto/gesto, alvo ≥ 44px, Pointer Events, zero `:hover`
   como informação, retrato. Contrato completo em **`07-MOBILE.md` — leia antes de fazer microjogo.**
7. **Documente ao terminar um passo** em `03-PROGRESSO.md` (histórico append-only).

## 6) Índice da documentação

| Arquivo | Conteúdo |
|---|---|
| `../README.md` | porta de entrada do repo (como rodar, o que é, estado) |
| `00-HANDOFF.md` | este arquivo — visão geral e como continuar |
| `01-ARQUITETURA.md` | contratos: microjogo, action bus, chaos effects, scoring |
| `02-DESIGN-SYSTEM.md` | tokens, paleta, tipografia, componentes, regras WCAG |
| `03-PROGRESSO.md` | histórico append-only do que foi feito, por fase |
| `04-PROMPT-DESIGN-CHAOS.md` | prompt-mestre para gerar/evoluir todo o design do sistema |
| `05-FASE2-MULTIPLAYER.md` | plano da rede + **§8: o que a F7-A já pôs em `src/net/`** |
| `06-MICROGAMES.md` | ficha técnica dos 12 microjogos (regra, métrica, controles) |
| `07-MOBILE.md` | **contrato mobile obrigatório** — gestos, Pointer Events, canvas em DPR, zona do polegar |
| `08-CONTINUIDADE-CODIGO.md` | **prompt para retomar o código** + fronteira design↔código + checklist de aceite da arte |
