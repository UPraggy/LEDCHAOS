import Osu from './Osu.jsx';

export default {
  id: 'osu',
  name: 'NA MOSCA',
  emoji: '🎯',
  instruction: 'Toque no círculo quando o anel fechar. Arraste os sliders.',
  duration: 30000,
  hue: 320,
  category: 'timing',
  minPlayers: 2,
  maxPlayers: 8,
  supports: ['scoreMultiplier', 'timeScale', 'hidden'],
  Component: Osu,
};
