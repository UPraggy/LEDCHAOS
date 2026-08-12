# Deploy do CHAOS no GitHub Pages

Os **artefatos** já estão no repo. O que sobra são cliques na conta do Rafael
(GitHub e, se for usar domínio próprio, DNS) — nada disso precisa de senha aqui.

## O que já está pronto no código

| Artefato | Papel |
|---|---|
| `.github/workflows/deploy.yml` | Build + publish automáticos a cada push na `main` |
| `public/404.html` | Redirect SPA — faz `/join/7KX9Q` (QR) abrir direto sem 404 |
| snippet no `index.html` | Desempacota a rota que o 404.html mandou e entrega ao BrowserRouter |
| `vite.config.js` → `base: VITE_BASE \|\| '/'` | Caminho base configurável pelo build |

> **Por que o 404.html?** O Pages é estático e só tem `index.html`. Abrir uma
> rota profunda direto (o QR aponta para `/join/:id`) buscaria um arquivo que
> não existe. A técnica [rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages)
> (MIT) empacota a rota na query, devolve pro index e ele restaura. O usuário
> nunca vê o 404.

## Caminho A — endereço `*.github.io` (mais rápido, zero DNS)

Site em `https://<usuario>.github.io/<repo>/`.

1. **Push** do projeto para o GitHub (o Rafael faz — ver aviso no fim).
2. GitHub ▸ **Settings ▸ Pages ▸ Source = "GitHub Actions"**.
3. GitHub ▸ **Settings ▸ Secrets and variables ▸ Actions ▸ Variables** ▸ New:
   - `VITE_BASE` = `/<repo>/` (ex.: `/LEDCHAOS/`) — com as barras.
4. Em `public/404.html`, trocar `pathSegmentsToKeep = 0` → **`1`** e commitar.
5. Push na `main` → a Action builda e publica. O link sai no resumo do workflow.

## Caminho B — domínio próprio na raiz (ex.: `ledchaos.exemplo.com.br`)

Este é o alvo primário do `vite.config.js` (`base '/'`), então quase nada muda.

1. Passos 1 e 2 do Caminho A.
2. Em **Variables**, criar `CUSTOM_DOMAIN` = o domínio (sem `https://`).
   O workflow escreve o `CNAME` no build sozinho. **Não** mexer em `VITE_BASE`
   (fica `/`) nem no `pathSegmentsToKeep` (fica `0`).
3. **DNS** (no provedor do domínio — clique do Rafael):
   - subdomínio (`ledchaos.…`): registro **CNAME** → `<usuario>.github.io`.
   - raiz (`exemplo.com.br`): registros **A** para os IPs do Pages
     (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`).
4. GitHub ▸ Settings ▸ Pages ▸ **Custom domain** = o domínio ▸ salvar ▸ marcar
   **Enforce HTTPS** quando o certificado sair (alguns minutos).

## Checar antes de publicar

```bash
npm run build && npm run preview
```

Abrir o endereço do `preview`, navegar até uma sala e **dar F5 numa rota profunda**
(`/join/XXXX`): tem que recarregar a tela certa, não um 404. É o teste que prova
que o par 404.html + snippet está funcionando.

## Aviso (guardrail)

O **push, o login no GitHub e os registros de DNS são do Rafael** — este repo só
entrega os artefatos prontos. Nenhuma credencial dele é usada aqui.
