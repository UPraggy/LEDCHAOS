import Mash from './Mash.jsx';

export default {
  id: 'mash',
  name: 'MARTELO',
  emoji: '👆',
  instruction: 'Toque sem parar. A barra cai sozinha se você parar.',
  duration: 15000,
  hue: 25,
  category: 'speed',
  minPlayers: 2,
  maxPlayers: 8,
  // Sem invert: aqui existe uma ação só. "Inverter" viraria "não toque", que
  // é outro jogo — e um jogo de 15 segundos em que a instrução é ficar parado
  // não é caos, é tela travada.
  // timeScale mexe na VELOCIDADE DA QUEDA da barra, não no relógio.
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'hidden'],
  Component: Mash,
};
