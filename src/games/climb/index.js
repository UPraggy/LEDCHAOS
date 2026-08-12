import Climb from './Climb.jsx';

export default {
  id: 'climb',
  name: 'ESCALAR',
  emoji: '🧗',
  instruction: 'Segure ← ou → para mirar a queda. Você pula sozinho.',
  duration: 30000,
  hue: 210,
  category: 'platform',
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'invert', 'hidden'],
  Component: Climb,
};
