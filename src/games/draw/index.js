import Draw from './Draw.jsx';

export default {
  id: 'draw',
  name: 'DESENHAR',
  emoji: '🎨',
  instruction: 'Desenhe a palavra com o dedo. Quem adivinhar, pontua — e você também.',
  duration: 30000,
  hue: 280,
  category: 'creative',
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'sizeScale'],
  Component: Draw,
};
