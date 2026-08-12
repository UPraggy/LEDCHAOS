import './Screen.css';

/**
 * Casca de tela. Toda tela do app usa isso — garante safe-area,
 * largura de retrato, scroll interno (nunca scroll do body) e
 * a animação de entrada padrão.
 *
 * @param {'stack'|'center'} layout  stack = empilha do topo; center = centraliza tudo
 * @param {boolean} noPad            para telas de jogo, que ocupam a tela inteira
 */
export default function Screen({ children, layout = 'stack', noPad = false, className = '', hue = null }) {
  const style = hue === null || hue === undefined ? undefined : { '--game-hue': hue };
  return (
    <div
      className={`screen screen--${layout}${noPad ? ' screen--flush' : ''} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
