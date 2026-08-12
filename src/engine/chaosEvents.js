/**
 * Eventos CHAOS — a virada que impede a partida de virar rotina.
 *
 * Contrato: cada evento devolve `effects` PLANO. O microjogo lê só o que
 * declarou em `supports` e ignora o resto. Nenhum microjogo precisa conhecer
 * o nome dos eventos, só as chaves de efeito.
 *
 *   { scoreMultiplier, timeScale, invert, sizeScale, hidden, oneLife }
 *
 * Regras de sorteio: nunca na rodada 1 (o jogador precisa ver o jogo limpo
 * uma vez), ~35% de chance, e só eventos que o microjogo suporta.
 */

export const CHAOS_CHANCE = 0.35;

export const NEUTRAL_EFFECTS = {
  scoreMultiplier: 1,
  timeScale: 1,
  invert: false,
  sizeScale: 1,
  hidden: false,
  oneLife: false,
};

export const CHAOS_EVENTS = [
  {
    id: 'doubleScore',
    name: 'PONTO DOBRADO',
    emoji: '💎',
    description: 'Esta rodada vale o dobro de pontos.',
    requires: 'scoreMultiplier',
    effects: { scoreMultiplier: 2 },
  },
  {
    id: 'inverted',
    name: 'INVERTIDO',
    emoji: '🔄',
    description: 'Os controles trocaram de lado. Boa sorte.',
    requires: 'invert',
    effects: { invert: true },
  },
  {
    id: 'speedUp',
    name: 'ACELERADO',
    emoji: '⚡',
    description: 'Tudo 50% mais rápido.',
    requires: 'timeScale',
    effects: { timeScale: 1.5 },
  },
  {
    id: 'slowMotion',
    name: 'CÂMERA LENTA',
    emoji: '🐌',
    description: 'Tudo mais devagar. Precisão importa mais.',
    requires: 'timeScale',
    effects: { timeScale: 0.6 },
  },
  {
    id: 'oneLife',
    name: 'UMA VIDA',
    emoji: '💀',
    description: 'Um erro e a sua rodada acaba.',
    requires: 'oneLife',
    effects: { oneLife: true },
  },
  {
    id: 'tiny',
    name: 'MINÚSCULO',
    emoji: '🐜',
    description: 'Os alvos encolheram.',
    requires: 'sizeScale',
    effects: { sizeScale: 0.6 },
  },
  {
    id: 'giant',
    name: 'GIGANTE',
    emoji: '🐘',
    description: 'Tudo enorme — e mais difícil de desviar.',
    requires: 'sizeScale',
    effects: { sizeScale: 1.6 },
  },
  {
    id: 'hidden',
    name: 'NA PENUMBRA',
    emoji: '🌫️',
    description: 'Você só vê parte da tela.',
    requires: 'hidden',
    effects: { hidden: true },
  },
];

/** Junta os efeitos do evento sobre o neutro. Sempre devolve o objeto completo. */
export function resolveEffects(event) {
  if (!event) return { ...NEUTRAL_EFFECTS };
  return { ...NEUTRAL_EFFECTS, ...event.effects };
}

/** Eventos que este microjogo consegue honrar. */
export function eventsFor(game) {
  const supports = game?.supports || [];
  return CHAOS_EVENTS.filter((e) => supports.includes(e.requires));
}

export function getChaosEvent(id) {
  return CHAOS_EVENTS.find((e) => e.id === id) || null;
}

/**
 * Sorteia o evento da rodada (ou null).
 * O evento ALEATÓRIO da spec é justamente este sorteio: em vez de um card
 * "RANDOM" que não faz nada visível, o próprio sistema escolhe às cegas entre
 * os eventos válidos — o jogador nunca sabe o que vem.
 *
 * @param {object} rng
 * @param {number} round rodada atual (1-based)
 * @param {object} game  metadata do microjogo
 */
export function rollChaosEvent(rng, round, game) {
  if (round <= 1) return null;
  const pool = eventsFor(game);
  if (!pool.length) return null;
  if (!rng.chance(CHAOS_CHANCE)) return null;
  return rng.pick(pool);
}
