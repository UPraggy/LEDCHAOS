import Race from './Race.jsx';

export default {
  id: 'race',
  name: 'CORRIDA',
  emoji: '🦖',
  instruction: 'Pule os cactos, abaixe dos pterodáctilos. Vá o mais longe possível.',
  duration: 30000,
  hue: 170,
  category: 'reflex',
  minPlayers: 2,
  maxPlayers: 8,
  // timeScale acelera o MUNDO (rolagem e spawn), nunca o relógio da rodada — e
  // nunca o pulo: o mundo fica mais rápido, o salto continua o mesmo, e é isso
  // que faz o modo ACELERADO doer.
  supports: ['scoreMultiplier', 'timeScale', 'hidden'],
  Component: Race,
};
