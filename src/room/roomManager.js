import { generateRoomCode } from './roomCode.js';
import { PLAYER_COLORS, DEFAULT_SKILL } from '../data/players.js';
import { AVATAR_IDS } from '../data/avatars.js';
import { makeBot } from '../engine/botProfile.js';
import { createRng } from '../engine/random.js';
import { GAME_IDS } from '../engine/gameRegistry.js';

/**
 * roomManager — dono do modelo de SALA. Funções puras: recebem uma sala,
 * devolvem uma sala NOVA (nunca mutam). O reducer em state/gameState.js só
 * chama estas funções, então a regra de sala vive num lugar só.
 *
 * Persistência: localStorage. Sem banco, sem backend.
 */

export const ROOM_KEY = 'chaos.room.v1';
export const PREFS_KEY = 'chaos.prefs.v1';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const ROUND_OPTIONS = [5, 7, 10];
export const DEFAULT_ROUNDS = 7;

/* ------------------------------------------------------------- modos (§2) */

export const MODES = ['partida', 'unico'];
export const DEFAULT_MODE = 'partida';
export const DEFAULT_SOLO_GAME = 'slice';

/** Filtra ids válidos e remove duplicatas, preservando a ordem do registry. */
function sanitizePicked(picked) {
  if (!Array.isArray(picked)) return GAME_IDS.slice();
  const set = new Set(picked.filter((id) => GAME_IDS.includes(id)));
  const clean = GAME_IDS.filter((id) => set.has(id));
  return clean.length ? clean : GAME_IDS.slice();
}

/** Um jogo solo válido, com fallback para o padrão e depois para o 1º do registry. */
function sanitizeSoloGame(soloGame) {
  if (GAME_IDS.includes(soloGame)) return soloGame;
  if (GAME_IDS.includes(DEFAULT_SOLO_GAME)) return DEFAULT_SOLO_GAME;
  return GAME_IDS[0];
}

/* ---------------------------------------------------------------- jogadores */

/** Menor id pN livre — permite remover o p3 e o próximo bot voltar a ser p3. */
function nextPlayerId(players) {
  for (let i = 1; i <= MAX_PLAYERS; i += 1) {
    const id = `p${i}`;
    if (!players.some((p) => p.id === id)) return id;
  }
  return `p${players.length + 1}`;
}

function slotIndex(id) {
  const n = parseInt(String(id).replace('p', ''), 10);
  return Number.isFinite(n) ? n - 1 : 0;
}

/** O humano. Sempre p1, sempre host nesta fase. */
export function makeHostPlayer({ name, avatar }) {
  return {
    id: 'p1',
    name: (name || 'VOCÊ').toUpperCase().slice(0, 10),
    avatar: avatar || AVATAR_IDS[0],
    color: PLAYER_COLORS[0],
    skill: null,
    isBot: false,
    score: 0,
    wins: 0,
    streak: 0,
    ready: true,
  };
}

/* -------------------------------------------------------------------- sala */

/**
 * @param {object} opts {id, name, avatar, rounds, difficulty, bots, mode, picked, soloGame}
 */
export function createRoom(opts = {}) {
  const {
    id = generateRoomCode(),
    name,
    avatar,
    rounds = DEFAULT_ROUNDS,
    difficulty = DEFAULT_SKILL,
    bots = 3,
    mode = DEFAULT_MODE,
    picked,
    soloGame,
  } = opts;

  const room = {
    id,
    hostId: 'p1',
    status: 'lobby', // lobby | playing | finished
    createdAt: Date.now(),
    players: [makeHostPlayer({ name, avatar })],
    settings: {
      rounds,
      difficulty,
      mode: MODES.includes(mode) ? mode : DEFAULT_MODE,
      picked: sanitizePicked(picked),
      soloGame: sanitizeSoloGame(soloGame),
    },
  };

  const rng = createRng();
  let next = room;
  for (let i = 0; i < bots; i += 1) next = addBot(next, rng);
  return next;
}

/** Adiciona um bot respeitando MAX_PLAYERS. */
export function addBot(room, rng = createRng()) {
  if (room.players.length >= MAX_PLAYERS) return room;
  const id = nextPlayerId(room.players);
  const index = slotIndex(id);
  const bot = makeBot(index, room.settings.difficulty, rng, room.players.map((p) => p.name));
  return { ...room, players: [...room.players, { ...bot, id }] };
}

/** Remove um jogador. O host (p1) nunca sai. */
export function removePlayer(room, playerId) {
  if (playerId === room.hostId) return room;
  return { ...room, players: room.players.filter((p) => p.id !== playerId) };
}

export function updatePlayer(room, playerId, patch) {
  return {
    ...room,
    players: room.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)),
  };
}

export function setRounds(room, rounds) {
  const value = ROUND_OPTIONS.includes(rounds) ? rounds : DEFAULT_ROUNDS;
  return { ...room, settings: { ...room.settings, rounds: value } };
}

/** Troca a dificuldade e re-sorteia o skill de quem já está na sala. */
export function setDifficulty(room, difficulty) {
  const rng = createRng();
  return {
    ...room,
    settings: { ...room.settings, difficulty },
    players: room.players.map((p) => {
      if (!p.isBot) return p;
      const fresh = makeBot(slotIndex(p.id), difficulty, rng, []);
      return { ...p, skill: fresh.skill };
    }),
  };
}

/* -------------------------------------------------------- modos: setters (§2) */

/** PARTIDA (sorteia entre os escolhidos) ou JOGO ÚNICO (só o soloGame). */
export function setMode(room, mode) {
  const value = MODES.includes(mode) ? mode : DEFAULT_MODE;
  return { ...room, settings: { ...room.settings, mode: value } };
}

/**
 * Liga/desliga um microjogo da partida.
 * NUNCA esvazia a lista: desmarcar o último habilitado é no-op — uma partida
 * precisa de ao menos um jogo para sortear.
 */
export function toggleGame(room, gameId) {
  if (!GAME_IDS.includes(gameId)) return room;
  const current = sanitizePicked(room.settings?.picked);
  const has = current.includes(gameId);
  if (has && current.length === 1) return room; // não deixa zerar
  const next = has ? current.filter((id) => id !== gameId) : [...current, gameId];
  return { ...room, settings: { ...room.settings, picked: sanitizePicked(next) } };
}

/** Define o microjogo do modo JOGO ÚNICO. */
export function setSoloGame(room, gameId) {
  return { ...room, settings: { ...room.settings, soloGame: sanitizeSoloGame(gameId) } };
}

/* -------------------------------------------------- convidados de verdade (rede)
 *
 * Quando o transporte real está ligado, um convidado que entra pelo QR não é um
 * bot: é gente. Ele ENTRA no lugar de um bot (a festa mantém o tamanho que o
 * host combinou). Se cair, a cadeira vira bot de novo — para o placar não abrir
 * um buraco no meio da partida. Ver GameProvider (handlers onJoin/onLeave). */

/** Nome do convidado, mesma higienização do host. */
function cleanGuestName(name) {
  const s = (name || '').toString().toUpperCase().trim().slice(0, 10);
  return s || null;
}

/**
 * Um convidado de verdade entrou pela rede.
 * @param {object} room
 * @param {object} player { id, name, avatar }  — id é o do convidado (tag das ações dele)
 */
export function joinGuest(room, player) {
  if (!room || !player?.id) return room;

  // Reconexão: o id já está na sala → reafirma que é gente e atualiza a vitrine.
  const existing = room.players.find((p) => p.id === player.id);
  if (existing) {
    return updatePlayer(room, player.id, {
      isBot: false,
      skill: null,
      ready: true,
      name: cleanGuestName(player.name) || existing.name,
      avatar: AVATAR_IDS.includes(player.avatar) ? player.avatar : existing.avatar,
    });
  }

  let base = room;
  if (base.players.length >= MAX_PLAYERS) {
    const bot = base.players.find((p) => p.isBot);
    if (!bot) return room; // festa cheia de humanos: não cabe mais ninguém
    base = { ...base, players: base.players.filter((p) => p.id !== bot.id) };
  }

  const index = base.players.length;
  const human = {
    id: player.id,
    name: cleanGuestName(player.name) || `P${index + 1}`,
    avatar: AVATAR_IDS.includes(player.avatar) ? player.avatar : AVATAR_IDS[index % AVATAR_IDS.length],
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    skill: null,
    isBot: false,
    score: 0,
    wins: 0,
    streak: 0,
    ready: true,
  };
  return { ...base, players: [...base.players, human] };
}

/**
 * Convidado caiu/saiu: a cadeira vira bot (mesmo lugar, mantém nome e avatar
 * para a leitura não pular). O host nunca é afetado.
 */
export function guestLeave(room, playerId, rng = createRng()) {
  if (!room) return room;
  const p = room.players.find((x) => x.id === playerId);
  if (!p || p.id === room.hostId || p.isBot) return room;
  const filler = makeBot(0, room.settings.difficulty, rng, []);
  return updatePlayer(room, playerId, { isBot: true, skill: filler.skill, ready: true });
}

/** Zera pontuação/vitórias/sequência — usado no PLAY AGAIN e no debug. */
export function resetScores(room) {
  return {
    ...room,
    status: 'lobby',
    players: room.players.map((p) => ({ ...p, score: 0, wins: 0, streak: 0 })),
  };
}

export function canStart(room) {
  return !!room && room.players.length >= MIN_PLAYERS;
}

/* ------------------------------------------------------------ persistência */

export function loadRoom() {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    if (!raw) return null;
    const room = JSON.parse(raw);
    // Validação mínima: sala corrompida é sala descartada, nunca tela branca.
    if (!room || !room.id || !Array.isArray(room.players) || !room.players.length) return null;
    if (!room.settings) room.settings = { rounds: DEFAULT_ROUNDS, difficulty: DEFAULT_SKILL };
    // Migração de salas antigas (sem os campos de modo §2).
    if (!MODES.includes(room.settings.mode)) room.settings.mode = DEFAULT_MODE;
    room.settings.picked = sanitizePicked(room.settings.picked);
    room.settings.soloGame = sanitizeSoloGame(room.settings.soloGame);
    return room;
  } catch {
    return null;
  }
}

export function saveRoom(room) {
  try {
    if (!room) localStorage.removeItem(ROOM_KEY);
    else localStorage.setItem(ROOM_KEY, JSON.stringify(room));
  } catch {
    /* modo privado / storage cheio: o jogo segue, só não sobrevive ao reload */
  }
}

export function clearRoom() {
  try {
    localStorage.removeItem(ROOM_KEY);
  } catch {
    /* ignora */
  }
}

/* ------------------------------------------------- preferências do jogador */

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    return {
      muted: prefs.muted === true,
      name: typeof prefs.name === 'string' ? prefs.name : '',
      avatar: AVATAR_IDS.includes(prefs.avatar) ? prefs.avatar : AVATAR_IDS[0],
    };
  } catch {
    return { muted: false, name: '', avatar: AVATAR_IDS[0] };
  }
}

export function savePrefs(patch) {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, ...patch }));
  } catch {
    /* ignora */
  }
}
