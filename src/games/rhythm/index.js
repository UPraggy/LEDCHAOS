import Rhythm from './Rhythm.jsx';

export default {
  id: 'rhythm',
  name: 'BATIDA',
  emoji: '🎵',
  instruction: 'Toque a faixa quando o bloco cruzar a linha.',
  duration: 30000,
  hue: 320,
  category: 'timing',
  minPlayers: 2,
  maxPlayers: 8,
  // timeScale NÃO acelera o relógio (isso dessacaria o julgamento); ele aperta o
  // ESPAÇAMENTO do chart — RÁPIDO deixa as notas mais densas, LENTO mais
  // espaçadas — enquanto as janelas de acerto continuam em ms reais. sizeScale
  // fica de fora: mudar o tamanho do bloco quebraria a leitura da linha.
  // hidden (NA PENUMBRA) SAIU: apagar a pista de um jogo de RITMO deixa a batida
  // ilegível ("não dá para ver nada") — o desafio já é o tempo, não enxergar.
  supports: ['scoreMultiplier', 'timeScale', 'invert'],
  Component: Rhythm,
};
