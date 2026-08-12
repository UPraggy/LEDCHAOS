import reaction from '../games/reaction/index.js';
import slice from '../games/slice/index.js';
import draw from '../games/draw/index.js';
import climb from '../games/climb/index.js';
import rhythm from '../games/rhythm/index.js';
import memory from '../games/memory/index.js';
import aim from '../games/aim/index.js';
import tictactoe from '../games/tictactoe/index.js';
import mash from '../games/mash/index.js';
import race from '../games/race/index.js';
import grow from '../games/grow/index.js';
import dodge from '../games/dodge/index.js';
import osu from '../games/osu/index.js';
import piano from '../games/piano/index.js';
import trace from '../games/trace/index.js';

/**
 * gameRegistry — catálogo dos microjogos.
 *
 * ÚNICO lugar que conhece a lista. Para adicionar um microjogo:
 *   1. crie src/games/<id>/index.js exportando a metadata (ver 01-ARQUITETURA.md)
 *   2. importe aqui e coloque em RAW
 * Nada mais no app precisa mudar.
 *
 * Metadata inválida é DESCARTADA com aviso no console em vez de derrubar o app —
 * uma partida com 11 jogos ainda é uma partida; tela branca não é.
 */

const RAW = [
  reaction, slice, draw, climb, rhythm, memory,
  aim, tictactoe, mash, race, grow, dodge,
  osu, piano, trace,
];

const REQUIRED = ['id', 'name', 'instruction', 'duration', 'Component'];

function isValid(game) {
  if (!game || typeof game !== 'object') return false;
  const missing = REQUIRED.filter((key) => game[key] === undefined || game[key] === null);
  if (missing.length) {
    console.warn(`[CHAOS] microjogo ignorado (falta ${missing.join(', ')}):`, game?.id || game);
    return false;
  }
  return true;
}

export const GAMES = RAW.filter(isValid).map((game) => ({
  emoji: '🎮',
  hue: 36,
  category: 'reflex',
  minPlayers: 2,
  maxPlayers: 8,
  supports: [],
  ...game,
}));

export const GAME_IDS = GAMES.map((g) => g.id);

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

/** Jogos que aceitam esta quantidade de jogadores. */
export function gamesForPlayers(count) {
  return GAMES.filter((g) => count >= g.minPlayers && count <= g.maxPlayers);
}

/**
 * Monta a fila da partida.
 * Regra: passa por todos os jogos antes de repetir qualquer um, e nunca repete
 * o mesmo jogo em rodadas seguidas na virada de um ciclo para o outro.
 *
 * @param {object} rng
 * @param {number} count número de rodadas
 * @param {number} playerCount
 * @param {string[]|null} allowedIds subconjunto de jogos permitido (modos §2);
 *        `null`/vazio = todos. Se o filtro zerar a piscina (jogo escolhido não
 *        cabe na quantidade de jogadores), cai de volta para todos — sortear é
 *        melhor que travar a partida.
 */
export function buildQueue(rng, count, playerCount = 2, allowedIds = null) {
  let pool = gamesForPlayers(playerCount);
  if (allowedIds && allowedIds.length) {
    const allow = new Set(allowedIds);
    const filtered = pool.filter((g) => allow.has(g.id));
    if (filtered.length) pool = filtered;
  }
  if (!pool.length) return [];

  const queue = [];
  let bag = [];

  while (queue.length < count) {
    if (!bag.length) {
      bag = rng.shuffle(pool).map((g) => g.id);
      // Evita ciclo novo começando com o mesmo jogo que fechou o anterior.
      if (queue.length && bag.length > 1 && bag[0] === queue[queue.length - 1]) {
        [bag[0], bag[1]] = [bag[1], bag[0]];
      }
    }
    queue.push(bag.shift());
  }

  return queue;
}
