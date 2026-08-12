# CHAOS · Relay

Cano WebSocket que liga o **host** (quem cria a sala) aos **convidados** (quem
entra pelo QR/código). Ele é burro de propósito: junta sockets por código de
sala e empurra bytes. Nada de estado de jogo — a autoridade é sempre o host, no
navegador.

Sem o relay, o jogo **continua funcionando**: cai no modo local (host + bots),
exatamente como antes. O relay é o que troca bot por gente de verdade.

## Rodar

```bash
cd server
npm install
npm start
```

Sobe em `ws://0.0.0.0:8787`. Porta alternativa:

```bash
PORT=9000 npm start
```

## Ligar o app ao relay

O app procura o relay em `VITE_RELAY_URL`. Como o celular abre o jogo pelo IP da
sua máquina na LAN (o mesmo IP do QR), aponte o relay para esse IP — não para
`localhost`, que no celular seria o próprio celular.

Crie `CHAOS/.env.local`:

```
VITE_RELAY_URL=ws://192.168.0.10:8787
```

(Troque `192.168.0.10` pelo IP da sua máquina na rede. É o mesmo IP que aparece
no terminal do `npm run dev` do Vite, em "Network".)

Depois:

```bash
# terminal 1 — o cano
cd server && npm start

# terminal 2 — o jogo
cd .. && npm run dev
```

Abra o QR no celular. O aparelho entra na sala pelo relay e aparece no lobby do
host como jogador de verdade.

## Como testar sem dois aparelhos

Abra o app em duas abas do navegador (ou uma aba normal + uma anônima). Uma cria
a sala (host); a outra abre `/join/CODIGO` (convidado). As duas passam pelo mesmo
relay e se enxergam.

## Portas

| O quê        | Porta padrão |
|--------------|--------------|
| Vite (app)   | 5173         |
| Relay (este) | 8787         |

Libere a porta do relay no firewall se o celular não conectar (Windows costuma
perguntar na primeira execução do `node`).
