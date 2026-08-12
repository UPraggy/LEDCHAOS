/** Cores dos 8 slots de jogador (tokens --p1..--p8 espelhados em JS p/ uso no canvas) */
export const PLAYER_COLORS = [
  '#EAA94E',
  '#9DB1EA',
  '#7BBF5E',
  '#FF6B8B',
  '#4DE3E3',
  '#9A7BFF',
  '#FFD34E',
  '#FF8A3D',
];

/** Nomes de bots — curtos, caibam em card de celular */
export const BOT_NAMES = [
  'ANA', 'LUCAS', 'JULIA', 'PEDRO', 'BIA', 'THIAGO', 'LARA', 'RAFA',
  'NINA', 'DAVI', 'MEL', 'IGOR', 'CLARA', 'BRUNO', 'YAN', 'DUDA',
];

/** Perfis de habilidade dos bots (skill 0–1) */
export const SKILL_PRESETS = {
  EASY: { label: 'FÁCIL', min: 0.24, max: 0.5 },
  MEDIUM: { label: 'MÉDIO', min: 0.45, max: 0.74 },
  HARD: { label: 'DIFÍCIL', min: 0.68, max: 0.95 },
};

export const DEFAULT_SKILL = 'MEDIUM';
