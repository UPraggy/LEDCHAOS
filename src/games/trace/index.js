import Trace from './Trace.jsx';

export default {
  id: 'trace',
  name: 'CONTORNO',
  emoji: '✏️',
  instruction: 'Cubra o contorno arrastando o dedo pelos pontos.',
  duration: 30000,
  hue: 45,
  category: 'creative',
  minPlayers: 2,
  maxPlayers: 8,
  // Sem sizeScale: um transform:scale() na caixa quebraria o mapeamento
  // ponteiro↔canvas (getBoundingClientRect passaria a ser a caixa escalada).
  supports: ['scoreMultiplier', 'hidden'],
  Component: Trace,
};
