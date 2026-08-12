/**
 * Palavras do DRAW.
 * Critério: substantivo concreto, desenhável em 30 segundos com traço tosco,
 * reconhecível por qualquer um. Nada abstrato ("saudade"), nada de marca,
 * nada de personagem — tudo aqui é domínio comum.
 */

export const WORDS = [
  'CASA', 'GATO', 'SOL', 'ÁRVORE', 'CARRO', 'PEIXE', 'LUA', 'FLOR',
  'BOLA', 'LIVRO', 'CHAVE', 'RELÓGIO', 'ÓCULOS', 'SAPATO', 'CHAPÉU', 'GUARDA-CHUVA',
  'BICICLETA', 'AVIÃO', 'BARCO', 'TREM', 'FOGUETE', 'BALÃO', 'PIPA', 'PONTE',
  'CASTELO', 'IGREJA', 'FAROL', 'MOINHO', 'ESCADA', 'JANELA', 'PORTA', 'CADEIRA',
  'MESA', 'CAMA', 'SOFÁ', 'LÂMPADA', 'VELA', 'XÍCARA', 'GARRAFA', 'PANELA',
  'COLHER', 'FACA', 'PIZZA', 'BOLO', 'SORVETE', 'BANANA', 'ABACAXI', 'MELANCIA',
  'MORANGO', 'UVA', 'CENOURA', 'MILHO', 'PIPOCA', 'HAMBÚRGUER', 'CAFÉ', 'OVO',
  'QUEIJO', 'PÃO', 'LEITE', 'MEL', 'CACTO', 'GIRASSOL', 'COGUMELO', 'FOLHA',
  'MONTANHA', 'VULCÃO', 'ILHA', 'PRAIA', 'ONDA', 'NUVEM', 'CHUVA', 'ARCO-ÍRIS',
  'ESTRELA', 'PLANETA', 'COMETA', 'RAIO', 'NEVE', 'FOGO', 'RIO', 'DESERTO',
  'CACHORRO', 'PÁSSARO', 'COBRA', 'ARANHA', 'ABELHA', 'BORBOLETA', 'FORMIGA', 'CARANGUEJO',
  'POLVO', 'TUBARÃO', 'BALEIA', 'TARTARUGA', 'SAPO', 'COELHO', 'RATO', 'PINGUIM',
  'ELEFANTE', 'GIRAFA', 'LEÃO', 'MACACO', 'URSO', 'CAVALO', 'VACA', 'PORCO',
  'GALINHA', 'OVELHA', 'CORUJA', 'MORCEGO', 'DINOSSAURO', 'DRAGÃO', 'ROBÔ', 'FANTASMA',
  'CAVEIRA', 'CORAÇÃO', 'CÉREBRO', 'MÃO', 'OLHO', 'DENTE', 'PÉ', 'BIGODE',
  'COROA', 'ESPADA', 'ESCUDO', 'BÚSSOLA', 'MAPA', 'AMPULHETA', 'TESOURA', 'MARTELO',
];

/** Três opções para o desenhista escolher, sem repetir. */
export function pickWordOptions(rng, count = 3) {
  return rng.shuffle(WORDS).slice(0, count);
}

/** Uma palavra só. */
export function pickWord(rng) {
  return rng.pick(WORDS);
}

/**
 * Máscara para o feed de palpites: C _ _ _ (mostra a primeira letra).
 * Mantém hífen e espaço visíveis para dar pista de formato.
 */
export function maskWord(word) {
  return word
    .split('')
    .map((ch, i) => {
      if (i === 0) return ch;
      if (ch === ' ' || ch === '-') return ch;
      return '_';
    })
    .join(' ');
}
