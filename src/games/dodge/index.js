import Dodge from './Dodge.jsx';

export default {
  id: 'dodge',
  name: 'DESVIAR',
  emoji: '💥',
  instruction: 'Arraste para mover. Pegue os cristais, fuja das minas.',
  duration: 30000,
  hue: 300,
  category: 'reflex',
  minPlayers: 2,
  maxPlayers: 8,
  // Único microjogo que aceita UMA VIDA: é o único em que existe morrer. Nos
  // outros o efeito não teria o que encerrar.
  // INVERTIDO nega o vetor do analógico; sizeScale muda o tamanho do corpo, que
  // aqui é hitbox pura — GIGANTE é castigo de verdade, e é para ser.
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'invert', 'hidden', 'oneLife'],
  Component: Dodge,
};
