# Deploy do CHAOS no GitHub Pages

O jogo é publicado como **subpágina de projeto**, igual ao SaiBH: a raiz do
domínio hospeda o portfólio, e o CHAOS vive em
**`https://upraggy.github.io/LEDCHAOS/`**.

Os **artefatos já estão prontos e configurados para esse endereço** — o build
assume `base '/LEDCHAOS/'` sozinho. O que sobra são cliques na conta do Rafael
(login no GitHub e habilitar o Pages); nenhuma credencial é usada aqui.

## O que já está pronto no código

| Artefato | Papel |
|---|---|
| `.github/workflows/deploy.yml` | Build + publish automáticos a cada push na `main`. `VITE_BASE` já cai em `/LEDCHAOS/` por padrão. |
| `vite.config.js` | Build assume `base '/LEDCHAOS/'`; **dev fica em `/`** (o QR aponta pro IP da LAN na raiz). |
| `public/404.html` | Redirect SPA com `pathSegmentsToKeep = 1` — faz `/LEDCHAOS/join/7KX9Q` (QR) abrir direto, sem 404. |
| snippet no `index.html` | Desempacota a rota que o 404.html mandou e entrega ao BrowserRouter. |
| `src/lib/basePath.js` | Fonte única do prefixo de base: `asset()` e `BASE` para sprites, `<img>`, avatares e a URL do QR. |
| `<BrowserRouter basename>` | `import.meta.env.BASE_URL` → toda navegação interna já sai com `/LEDCHAOS/`. |

> **Por que o 404.html?** O Pages é estático e só tem `index.html`. Abrir uma
> rota profunda direto (o QR aponta para `/LEDCHAOS/join/:id`) buscaria um
> arquivo que não existe. A técnica [rafgraph/spa-github-pages](https://github.com/rafgraph/spa-github-pages)
> (MIT) empacota a rota na query, devolve pro index e ele restaura. O usuário
> nunca vê o 404. Com `pathSegmentsToKeep = 1` o primeiro segmento (`LEDCHAOS`)
> é preservado como base e não é confundido com a rota.

## Passo a passo (subpágina — configuração atual)

Tudo no **navegador externo do Rafael**, logado na conta dele:

1. **Push** do projeto para `UPraggy/LEDCHAOS`, branch `main`.
2. GitHub ▸ **Settings ▸ Pages ▸ Source = "GitHub Actions"**.
3. GitHub ▸ **Settings ▸ Pages ▸ Custom domain**: deixar **vazio**. Se houver um
   domínio salvo aí, **remover** — um domínio próprio serve a *raiz* e entra em
   conflito com o caminho `/LEDCHAOS/`.
4. (Opcional) **Variables** não precisa de nada: o `VITE_BASE` já cai em
   `/LEDCHAOS/` pelo default do workflow. Só crie a variável se um dia o caminho
   mudar.
5. Cada push na `main` builda e publica. O link sai no resumo do workflow:
   **`https://upraggy.github.io/LEDCHAOS/`**.

## Checar antes de publicar

```bash
npm run build && npm run preview
```

O `preview` serve exatamente o `dist/` de produção, já sob `/LEDCHAOS/`. Abrir o
endereço que ele imprime (termina em `/LEDCHAOS/`), navegar até uma sala e **dar
F5 numa rota profunda** (`/LEDCHAOS/join/XXXX`): tem que recarregar a tela certa,
não um 404. É o teste que prova que o par 404.html + snippet está funcionando.
Confira também que os sprites carregam (barra de rede sem 404 em `/assets/...`).

## Alternativa futura — domínio próprio na raiz

Se um dia o CHAOS ganhar domínio próprio na raiz (ex.: `ledchaos.exemplo.com.br`),
o caminho base volta a ser `/`:

1. **Variables**: `VITE_BASE` = `/` e `CUSTOM_DOMAIN` = o domínio (sem `https://`).
   O workflow escreve o `CNAME` no build sozinho.
2. `public/404.html`: `pathSegmentsToKeep` = **0**.
3. **DNS** (no provedor do domínio): subdomínio → **CNAME** `upraggy.github.io`;
   raiz → registros **A** para os IPs do Pages (`185.199.108.153`, `.109.153`,
   `.110.153`, `.111.153`).
4. GitHub ▸ Settings ▸ Pages ▸ **Custom domain** = o domínio ▸ **Enforce HTTPS**.

## Aviso (guardrail)

O **push, o login no GitHub e os registros de DNS são do Rafael** — este repo só
entrega os artefatos prontos. Nenhuma credencial dele é usada aqui.
