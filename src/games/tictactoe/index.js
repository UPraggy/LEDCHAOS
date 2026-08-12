import Duel from './Duel.jsx';

export default {
  id: 'tictactoe',
  name: 'DUELO',
  emoji: '⚔️',
  instruction: 'Três em linha. Ganhe o máximo de partidas antes do tempo.',
  duration: 25000,
  hue: 45,
  category: 'strategy',
  minPlayers: 2,
  maxPlayers: 8,
  // INVERTIDO vira jogo da velha maldito: quem fecha a linha PERDE.
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'invert', 'hidden'],
  Component: Duel,
};
