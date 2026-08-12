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
 * No domínio próprio (ledchaos.rafaelmr.com.br) o site fica na RAIZ → base '/'.
 * Se um dia publicar no caminho de projeto (upraggy.github.io/LEDCHAOS/), rode
 * o build com VITE_BASE=/LEDCHAOS/ que os caminhos se ajustam sozinhos.
 */
export default defineConfig(({ command }) => {
  const isBuild = command === 'build';

  return {
    base: process.env.VITE_BASE || '/',
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
