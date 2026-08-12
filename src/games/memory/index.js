import Memory from './Memory.jsx';

export default {
  id: 'memory',
  name: 'MEMÓRIA',
  emoji: '🧠',
  instruction: 'Observe a sequência e repita. Ela cresce a cada nível.',
  duration: 30000,
  hue: 265,
  category: 'memory',
  minPlayers: 2,
  maxPlayers: 8,
  // timeScale aqui acelera (ou arrasta) a EXIBIÇÃO da sequência, não o relógio
  // da rodada. INVERTIDO manda repetir de trás para frente.
  supports: ['scoreMultiplier', 'timeScale', 'sizeScale', 'invert', 'hidden'],
  Component: Memory,
};
