import Reaction from './Reaction.jsx';

export default {
  id: 'reaction',
  name: 'REFLEXO',
  emoji: '⚡',
  instruction: 'Toque assim que a tela acender. Três chances, vale a mais rápida.',
  duration: 15000,
  hue: 190,
  category: 'reflex',
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'invert'],
  Component: Reaction,
};
