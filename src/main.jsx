import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GameProvider } from './state/GameProvider.jsx';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/global.css';

/**
 * Ponto de entrada.
 *
 * Ordem dos CSS importa: tokens.css antes de global.css, e os dois antes de
 * qualquer componente (os CSS de componente só consomem `var(--token)`).
 *
 * Sem <StrictMode> de propósito: em dev ele monta/desmonta/monta cada efeito,
 * o que num jogo cheio de requestAnimationFrame, timers de fase e Web Audio
 * gera loops e sons fantasmas só em desenvolvimento — atrapalha justamente o
 * que precisa ser depurado. O cleanup é garantido pelos hooks compartilhados
 * dos microjogos (games/_shared/hooks.js) e revisado a cada microjogo.
 */

// basename = o base do Vite (import.meta.env.BASE_URL): '/' em dev, '/LEDCHAOS/'
// no build de subpágina. Com ele o react-router prefixa TODA navegação interna
// (Route/Link/navigate) sozinho — só o QR externo e os assets do public/ ainda
// precisam do prefixo manual (ver src/lib/basePath.js).
createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <GameProvider>
      <App />
    </GameProvider>
  </BrowserRouter>,
);
