# Deploy do CHAOS no GitHub Pages

O jogo é publicado em **domínio próprio na raiz**:
**`https://ledchaos.rafaelmr.com.br/`**.

Os **artefatos já estão prontos e configurados para esse endereço** — o build
assume `base '/'` e o `public/CNAME` fixa o domínio. O que sobra são cliques na
conta do Rafael (apontar o Pages e criar 1 registro de DNS); nenhuma credencial
é usada aqui.

**Modelo de publicação:** *Deploy from a branch*. O **código-fonte fica na
`main`**; o **site buildado é empurrado para o branch `gh-pages`** (só o `dist/`,
sem histórico do código). O Pages serve o `gh-pages` na raiz, e o domínio próprio
aponta pra ele.

## O que já está pronto no código

| Artefato | Papel |
|---|---|
| `.github/workflows/deploy.yml` | A cada push na `main`: builda e **force-pusha o `dist/` para o branch `gh-pages`**. `VITE_BASE` cai em `/` por padrão. |
| `public/CNAME` | `ledchaos.rafaelmr.com.br` — o Vite copia pro `dist/`, o workflow empurra pro `gh-pages`, e o Pages fixa o domínio. |
| `vite.config.js` | Build e dev assumem `base '/'` (domínio na raiz; o QR aponta pro IP da LAN na raiz). |
| `public/404.html` | Redirect SPA com `pathSegmentsToKeep = 0` — faz `/join/7KX9Q` (QR) abrir direto, sem 404. |
| snippet no `index.html` | Desempacota a rota que o 404.html mandou e entrega ao BrowserRouter. |
| `src/lib/basePath.js` | Fonte única do prefixo de base: `asset()` e `BASE` para sprites, `<img>`, avatares e a URL do QR. Com base `/`, tudo já sai certo. |
| `<BrowserRouter basename>` | `import.meta.env.BASE_URL` (= `/`) → navegação interna na raiz. |

> **Por que o 404.html?** O Pages é estático e só tem `index.html`. Abrir uma
> rota profunda direto (o QR aponta para `/join/:id`) buscaria um arquivo que não
> existe. A técnica [rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages)
> (MIT) empacota a rota na query, devolve pro index e ele restaura. O usuário
> nunca vê o 404. Com `pathSegmentsToKeep = 0` (domínio na raiz) o caminho inteiro
> é rota — nenhum segmento é tratado como base.

## Passo a passo (domínio próprio — configuração atual)

Tudo no **navegador externo do Rafael**, logado na conta dele. O `gh-pages` já
nasce populado (o build local semeou o branch); estes cliques apontam o Pages e o
DNS para ele:

1. GitHub ▸ **Settings ▸ Actions ▸ General ▸ Workflow permissions =
   "Read and write permissions"** ▸ Save. Sem isto o workflow leva **403** ao
   escrever no `gh-pages` (os deploys automáticos futuros param — o branch
   semeado à mão continua no ar, mas não se atualiza sozinho).
2. GitHub ▸ **Settings ▸ Pages ▸ Source = "Deploy from a branch"** ▸
   Branch: **`gh-pages`** ▸ Pasta: **`/ (root)`** ▸ Save.
3. **DNS** — no provedor onde o `rafaelmr.com.br` é gerenciado, criar 1 registro:
   **CNAME** · nome `ledchaos` · valor `upraggy.github.io` (sem `https://`, sem
   barra). É o que faz o subdomínio resolver para o Pages.
4. GitHub ▸ **Settings ▸ Pages ▸ Custom domain** = `ledchaos.rafaelmr.com.br` ▸
   Save. O GitHub valida o DNS (pode levar alguns minutos) e depois libera
   **Enforce HTTPS** — marque quando aparecer.
5. Dali em diante, cada push na `main` rebuilda e atualiza o `gh-pages` sozinho.
   Site no ar em **`https://ledchaos.rafaelmr.com.br/`** (1ª publicação + validação
   de DNS/HTTPS podem levar de minutos a algumas horas na propagação).

## Checar antes de publicar

```bash
npm run build && npm run preview
```

O `preview` serve exatamente o `dist/` de produção, já na raiz `/`. Abrir o
endereço que ele imprime, navegar até uma sala e **dar F5 numa rota profunda**
(`/join/XXXX`): tem que recarregar a tela certa, não um 404. É o teste que prova
que o par 404.html + snippet está funcionando. Confira também que os sprites
carregam (barra de rede sem 404 em `/assets/...`) e que `dist/CNAME` existe.

## Alternativa futura — subpágina de projeto

Se um dia o CHAOS voltar a ser subpágina (ex.: `upraggy.github.io/LEDCHAOS/`,
sem domínio próprio), o caminho base vira `/LEDCHAOS/`:

1. **Variables**: `VITE_BASE` = `/LEDCHAOS/` (ou trocar o default do workflow).
2. `public/404.html`: `pathSegmentsToKeep` = **1** (preserva o 1º segmento base).
3. Remover `public/CNAME` e, em Settings ▸ Pages ▸ **Custom domain**, deixar
   **vazio** — domínio próprio serve a raiz e conflita com o subcaminho.

## Aviso (guardrail)

O **push, o login no GitHub e os registros de DNS são do Rafael** — este repo só
entrega os artefatos prontos. Nenhuma credencial dele é usada aqui.
