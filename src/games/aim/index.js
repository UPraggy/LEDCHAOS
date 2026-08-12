import Aim from './Aim.jsx';

export default {
  id: 'aim',
  name: 'MIRA',
  emoji: '🎯',
  instruction: 'Toque nos alvos com mira. Não toque nos ✕.',
  duration: 20000,
  hue: 8,
  category: 'reflex',
  minPlayers: 2,
  maxPlayers: 8,
  // Sem invert: aqui a cor e a forma dizem a MESMA coisa (alvo x armadilha).
  // Trocar o significado tornaria as duas pistas mentirosas ao mesmo tempo, e
  // isso não é caos — é bug.
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'hidden'],
  Component: Aim,
};
