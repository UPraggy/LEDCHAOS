/**
 * soundManager — Web Audio API, 100% procedural.
 * Nenhum arquivo de áudio, nenhuma música com direitos autorais:
 * tudo é oscilador + ruído + envelope gerado na hora.
 *
 * Arquitetura do barramento (montada no primeiro gesto do usuário):
 *
 *     vozes ─┬─► [dry] ──────────────────────────┐
 *            └─► [send] ─► convolver (reverb) ─► [wet] ─► saturação ─► limiter ─► master ─► saída
 *
 *  - saturação (WaveShaper tanh): arredonda picos, dá calor de "fita".
 *  - limiter (DynamicsCompressor): segura o volume quando vários sons empilham,
 *    então nada estoura mesmo com combo alto no jogo de música.
 *  - reverb curto (impulso sintético): dá ar/espaço sem molhar demais.
 *
 * Regras:
 *  - O AudioContext só nasce depois do primeiro gesto (política dos browsers).
 *  - playSound()/playNote() NUNCA lançam erro. Áudio travado = no-op silencioso.
 *  - Mute persiste em localStorage (chaos.prefs.v1).
 */

const PREFS_KEY = 'chaos.prefs.v1';
const MASTER_LEVEL = 0.62;

let ctx = null;
let master = null; // gain final (o mute mora aqui)
let dryBus = null; // soma seca das vozes
let reverbIn = null; // entrada do reverb (sends das vozes)
let muted = readMuted();
const listeners = new Set();

function readMuted() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return false;
    return JSON.parse(raw).muted === true;
  } catch {
    return false;
  }
}

function writeMuted(value) {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    prefs.muted = value;
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* localStorage cheio ou bloqueado: som continua funcionando na sessão */
  }
}

/* ────────────────────────── barramento ────────────────────────── */

/** Curva tanh suave: passa quase linear no nível normal, comprime só o pico. */
function saturationCurve(k = 1.35) {
  const n = 1024;
  const curve = new Float32Array(n);
  const denom = Math.tanh(k);
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / denom;
  }
  return curve;
}

/** Impulso sintético estéreo: ruído que decai. Vira o "espaço" do reverb. */
function makeImpulse(seconds = 1.1, decay = 2.6) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
  }
  return buffer;
}

function buildGraph() {
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_LEVEL;

  // Limiter: pega os picos de vários sons somados sem "abaixar" o mix inteiro.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 14;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.14;

  // Saturação: calor + trava macia antes do limiter.
  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve();
  shaper.oversample = '2x';

  dryBus = ctx.createGain();
  dryBus.gain.value = 1;

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(1.1, 2.8);
  reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.85;

  // Roteamento: seco e molhado se juntam antes da saturação.
  dryBus.connect(shaper);
  reverbIn.connect(convolver);
  convolver.connect(reverbOut);
  reverbOut.connect(shaper);
  shaper.connect(limiter);
  limiter.connect(master);
  master.connect(ctx.destination);
}

/** Cria (ou retoma) o contexto. Chamar em resposta a um gesto do usuário. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      buildGraph();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = !!value;
  writeMuted(muted);
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.02);
  }
  listeners.forEach((fn) => fn(muted));
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

/** Assina mudanças de mute (retorna unsubscribe). */
export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ────────────────────────── primitivas ────────────────────────── */

/** Liga a saída de uma voz ao barramento seco + (opcional) ao reverb. */
function route(outNode, reverb) {
  outNode.connect(dryBus);
  if (reverb > 0 && reverbIn) {
    const send = ctx.createGain();
    send.gain.value = reverb;
    outNode.connect(send);
    send.connect(reverbIn);
  }
}

/**
 * Voz tonal com envelope ADSR de verdade.
 * `spread` (cents) adiciona um segundo oscilador em uníssono desafinado — dá corpo.
 * `pan` (-1..1) posiciona no estéreo (usado pelas pistas do jogo de música).
 */
function tone({
  freq = 440,
  to = null,
  dur = 0.12,
  type = 'sine',
  gain = 0.3,
  delay = 0,
  attack = 0.006,
  decay = 0.05,
  sustain = 0.72,
  release = 0.09,
  detune = 0,
  spread = 0,
  pan = 0,
  reverb = 0.15,
}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const env = ctx.createGain();

  const oscs = [];
  const mk = (cents) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune + cents;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    osc.connect(env);
    oscs.push(osc);
  };
  mk(0);
  if (spread > 0) mk(spread); // uníssono: engrossa sem virar acorde

  // ADSR — attack/decay exponenciais (musicais), release até ~zero.
  const peak = Math.max(0.0001, gain / (spread > 0 ? 1.7 : 1));
  const sus = Math.max(0.0001, peak * sustain);
  const relStart = Math.max(t0 + attack + decay, t0 + dur);
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  env.gain.exponentialRampToValueAtTime(sus, t0 + attack + decay);
  env.gain.setValueAtTime(sus, relStart);
  env.gain.exponentialRampToValueAtTime(0.0001, relStart + release);

  let out = env;
  if (pan !== 0 && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    env.connect(panner);
    out = panner;
  }
  route(out, reverb);

  const stopAt = relStart + release + 0.02;
  oscs.forEach((osc) => {
    osc.start(t0);
    osc.stop(stopAt);
  });
}

/** Ruído filtrado — corpo de percussão, sopros, impactos. */
function noise({
  dur = 0.14,
  gain = 0.22,
  delay = 0,
  cutoff = 1400,
  sweepTo = null,
  type = 'lowpass',
  q = 0.7,
  pan = 0,
  reverb = 0.1,
}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + delay;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(cutoff, t0);
  filter.Q.value = q;
  if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);

  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t0);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filter);
  filter.connect(env);

  let out = env;
  if (pan !== 0 && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    env.connect(panner);
    out = panner;
  }
  route(out, reverb);

  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* ────────────────────────── percussão ────────────────────────── */
/* Bateria sintética para o jogo de música. Seca e curta, com pegada. */

function kick({ delay = 0, gain = 0.9 } = {}) {
  // Corpo: seno com queda de tom rápida (150→48). Clique: ruído bem curto.
  tone({ freq: 150, to: 48, dur: 0.16, type: 'sine', gain, attack: 0.002, decay: 0.05, sustain: 0.2, release: 0.09, reverb: 0, delay });
  noise({ dur: 0.03, gain: 0.18, cutoff: 2600, type: 'highpass', reverb: 0, delay });
}

function hat({ delay = 0, gain = 0.16, open = false } = {}) {
  noise({ dur: open ? 0.14 : 0.035, gain, cutoff: 8200, type: 'highpass', q: 1.2, reverb: 0.05, delay });
}

function snare({ delay = 0, gain = 0.34 } = {}) {
  // Corpo tonal + estalo de ruído em banda média.
  tone({ freq: 190, to: 150, dur: 0.12, type: 'triangle', gain: gain * 0.7, attack: 0.002, decay: 0.05, sustain: 0.15, release: 0.08, reverb: 0.08, delay });
  noise({ dur: 0.14, gain, cutoff: 2400, sweepTo: 1200, type: 'bandpass', q: 0.8, reverb: 0.12, delay });
}

/* ────────────────────────── escala musical ────────────────────────── */

const A4 = 440;

/** MIDI → Hz (temperamento igual). Base para pistas sempre afinadas. */
export function midiToFreq(midi) {
  return A4 * 2 ** ((midi - 69) / 12);
}

/** Pentatônica maior (em semitons a partir da tônica): nunca soa errado junto. */
export const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

/** Frequência do grau `i` da pentatônica a partir de uma tônica MIDI. */
export function scaleFreq(rootMidi, i) {
  const step = PENTATONIC[((i % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length];
  const octave = Math.floor(i / PENTATONIC.length) * 12;
  return midiToFreq(rootMidi + step + octave);
}

/* ────────────────────────── catálogo ────────────────────────── */

const SOUNDS = {
  click: () => tone({ freq: 640, to: 500, dur: 0.05, type: 'triangle', gain: 0.16, reverb: 0.08 }),

  tap: () => tone({ freq: 880, to: 680, dur: 0.06, type: 'square', gain: 0.13, reverb: 0.06 }),

  tick: () => tone({ freq: 1250, dur: 0.028, type: 'square', gain: 0.08, reverb: 0.03 }),

  select: () => {
    tone({ freq: 540, to: 720, dur: 0.07, type: 'triangle', gain: 0.15, reverb: 0.1 });
  },

  hit: () => {
    tone({ freq: 520, to: 920, dur: 0.1, type: 'triangle', gain: 0.24, spread: 6, reverb: 0.18 });
    noise({ dur: 0.05, gain: 0.09, cutoff: 3000, type: 'highpass', reverb: 0.1 });
  },

  perfect: () => {
    // Arpejo maior brilhante com um toque de reverb — a recompensa "premium".
    [880, 1174, 1568, 2093].forEach((f, i) =>
      tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.2, delay: i * 0.04, spread: 5, reverb: 0.28 }),
    );
    noise({ dur: 0.05, gain: 0.06, cutoff: 6000, type: 'highpass', delay: 0.02, reverb: 0.2 });
  },

  miss: () => {
    tone({ freq: 220, to: 82, dur: 0.24, type: 'sawtooth', gain: 0.18, decay: 0.08, sustain: 0.5, reverb: 0.12 });
    noise({ dur: 0.18, gain: 0.12, cutoff: 900, sweepTo: 300, reverb: 0.08 });
  },

  score: () => {
    [660, 990].forEach((f, i) =>
      tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.2, delay: i * 0.06, spread: 4, reverb: 0.2 }),
    );
  },

  coin: () => {
    tone({ freq: 988, dur: 0.06, type: 'square', gain: 0.16, reverb: 0.14 });
    tone({ freq: 1319, dur: 0.14, type: 'square', gain: 0.16, delay: 0.06, reverb: 0.18 });
  },

  powerup: () => {
    // Escadinha subindo — clássico de "peguei algo bom".
    [523, 659, 784, 1046, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.1, type: 'square', gain: 0.14, delay: i * 0.05, reverb: 0.16 }),
    );
  },

  countdown: () => tone({ freq: 440, dur: 0.14, type: 'square', gain: 0.2, reverb: 0.12 }),

  go: () => {
    tone({ freq: 660, to: 1320, dur: 0.3, type: 'square', gain: 0.26, spread: 8, reverb: 0.2 });
    noise({ dur: 0.2, gain: 0.12, cutoff: 3200, sweepTo: 6000, type: 'highpass', reverb: 0.15 });
  },

  roundStart: () => {
    // Fanfarra curta em terças — anuncia o desafio.
    [392, 523, 659].forEach((f, i) =>
      tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.2, delay: i * 0.07, spread: 6, reverb: 0.24 }),
    );
    kick({ delay: 0 });
  },

  victory: () => {
    // Acorde arpejado + baixo sustentado + prato: comemoração cheia.
    [523, 659, 784, 1046, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.36, type: 'triangle', gain: 0.22, delay: i * 0.1, spread: 7, reverb: 0.34 }),
    );
    tone({ freq: 261, dur: 0.95, type: 'sine', gain: 0.12, delay: 0.1, reverb: 0.3 });
    noise({ dur: 0.5, gain: 0.05, cutoff: 5000, type: 'highpass', delay: 0.1, reverb: 0.4 });
  },

  chaos: () => {
    tone({ freq: 150, to: 1500, dur: 0.45, type: 'sawtooth', gain: 0.2, spread: 12, reverb: 0.22 });
    noise({ dur: 0.4, gain: 0.14, cutoff: 600, sweepTo: 3000, reverb: 0.2 });
  },

  whoosh: () => noise({ dur: 0.26, gain: 0.16, cutoff: 500, sweepTo: 2600, type: 'bandpass', q: 0.6, reverb: 0.2 }),

  join: () => {
    [523, 784].forEach((f, i) =>
      tone({ freq: f, dur: 0.14, type: 'sine', gain: 0.18, delay: i * 0.05, spread: 4, reverb: 0.22 }),
    );
  },

  error: () => {
    tone({ freq: 240, dur: 0.14, type: 'square', gain: 0.18, reverb: 0.08 });
    tone({ freq: 175, dur: 0.22, type: 'square', gain: 0.16, delay: 0.13, reverb: 0.08 });
  },

  // ── percussão do jogo de música (acessível via sound.play('kick') etc.) ──
  kick: () => kick(),
  snare: () => snare(),
  hat: () => hat(),
  hatOpen: () => hat({ open: true }),

  // combo do BEAT: pratinho + nota alta, sensação de "tá on fire".
  combo: () => {
    tone({ freq: 1568, dur: 0.12, type: 'triangle', gain: 0.16, spread: 6, reverb: 0.3 });
    hat({ open: true, gain: 0.1 });
  },
};

/** Toca um som do catálogo. Seguro: nome inválido / áudio travado = no-op. */
export function playSound(name) {
  if (muted) return;
  if (!ctx) {
    // Tenta destravar no próprio gesto que gerou o som (clique, toque no canvas).
    if (!unlockAudio()) return;
  }
  const fn = SOUNDS[name];
  if (!fn) return;
  try {
    fn();
  } catch {
    /* nunca deixar áudio derrubar o jogo */
  }
}

/**
 * Nota livre — usada pelo BEAT para construir a melodia procedural.
 * Blend de triângulo + uníssono leve + reverb: soa musical, não "beep".
 */
export function playNote(freq, dur = 0.12, type = 'triangle', gain = 0.2, opts = {}) {
  if (muted) return;
  if (!ctx && !unlockAudio()) return;
  try {
    tone({
      freq,
      dur,
      type,
      gain,
      spread: opts.spread ?? 5,
      pan: opts.pan ?? 0,
      reverb: opts.reverb ?? 0.24,
      attack: opts.attack ?? 0.005,
      release: opts.release ?? Math.min(0.18, dur * 0.9),
      sustain: opts.sustain ?? 0.65,
    });
  } catch {
    /* idem */
  }
}

/** Percussão direta para o groove do jogo de música. Seguro como playSound. */
export function playDrum(name, opts = {}) {
  if (muted) return;
  if (!ctx && !unlockAudio()) return;
  try {
    if (name === 'kick') kick(opts);
    else if (name === 'snare') snare(opts);
    else if (name === 'hat') hat(opts);
  } catch {
    /* idem */
  }
}

export const SOUND_NAMES = Object.keys(SOUNDS);
