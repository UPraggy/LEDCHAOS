import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Config do Vite.
 *
 * appType 'spa' (default) garante fallback para index.html em rotas profundas
 * como /join/7KX9Q — necessário para o QR Code funcionar no celular.
 *
 * ── Endurecimento de produção (só no `build`) ────────────────────────────────
 * O JS de frontend é sempre inspecionável — isto NÃO é anti-debugging. A meta é
 * só reduzir exposição casual, como o Rafael pediu:
 *   • sourcemap OFF          → não publica o código-fonte legível
 *   • drop console/debugger  → sem logs de debug vazando em produção
 *   • legalComments 'none'   → sem banners de licença identificando libs
 *   • nomes de chunk opacos  → sem "P2PLab-xyz.js" denunciando a estrutura
 * Em dev nada disso se aplica: console e nomes de arquivo continuam úteis.
 *
 * ── base ─────────────────────────────────────────────────────────────────────
 * O jogo é publicado como SUBPÁGINA de projeto: upraggy.github.io/LEDCHAOS/
 * (a raiz do domínio hospeda o portfólio, igual ao SaiBH). Então o build assume
 * base '/LEDCHAOS/' por padrão — sobrescrevível por VITE_BASE se um dia mudar.
 *
 * DEV continua em '/' de propósito: o QR aponta pro IP da LAN na raiz
 * (http://192.168.x.x:5173/join/…) e o celular precisa abrir sem o prefixo.
 * Só o build carrega o /LEDCHAOS/. Trocar aqui exige trocar também o
 * pathSegmentsToKeep do public/404.html (ver docs/DEPLOY.md).
 */
export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  return {
    base: isBuild ? (process.env.VITE_BASE || '/LEDCHAOS/') : '/',
    plugins: [react()],

    esbuild: {
      legalComments: 'none',
      drop: isBuild ? ['console', 'debugger'] : [],
    },

    build: {
      sourcemap: false,
      minify: 'esbuild',
      target: 'es2019', // transpila `?.`/`??` p/ Safari iOS mais antigo ainda rodar
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          // nomes opacos: sem pistas da estrutura interna nos arquivos publicados
          entryFileNames: 'a/[hash].js',
          chunkFileNames: 'a/[hash].js',
          assetFileNames: 'a/[hash][extname]',
        },
      },
    },

    server: {
      host: true, // expõe na LAN: o celular abre o QR apontando pro IP do PC
      port: 5173,
    },
    preview: {
      host: true,
      port: 4173,
    },
  };
});
