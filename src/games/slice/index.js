import Slice from './Slice.jsx';

export default {
  id: 'slice',
  name: 'FATIAR',
  emoji: '🔪',
  instruction: 'Arraste o dedo para cortar. Desvie das bombas.',
  duration: 30000,
  hue: 96,
  category: 'precision',
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'oneLife'],
  Component: Slice,
};
