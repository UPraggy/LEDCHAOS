import Piano from './Piano.jsx';

export default {
  id: 'piano',
  name: 'PIANO',
  emoji: '🎹',
  instruction: 'Toque nas peças escuras antes que caiam. Fuja das bombas.',
  duration: 30000,
  hue: 185,
  category: 'speed',
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'timeScale', 'hidden'],
  Component: Piano,
};
