import Grow from './Grow.jsx';

export default {
  id: 'grow',
  name: 'CRESCER',
  emoji: '🔵',
  instruction: 'Arraste para mover. Colete as esferas e cresça.',
  duration: 30000,
  hue: 140,
  category: 'reflex',
  minPlayers: 2,
  maxPlayers: 8,
  // INVERTIDO nega o vetor do analógico — o dedo vai para um lado, a bolha vai
  // para o outro. sizeScale entra no raio INICIAL, que é também a régua do
  // placar (100% = raio inicial), então MINÚSCULO e GIGANTE continuam
  // comparáveis no ranking.
  // oneLife fica de fora: aqui não existe morrer, só crescer devagar.
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'invert', 'hidden'],
  Component: Grow,
};
