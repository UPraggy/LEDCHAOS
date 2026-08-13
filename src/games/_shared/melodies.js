/* melodies.js — músicas RECONHECÍVEIS de domínio público para a BATIDA e a NA
 * MOSCA. O motor de som (soundManager) é 100% Web Audio procedural: `sound.note`
 * toca UMA frequência na hora, e `sound.scale` só sabe a pentatônica maior — que
 * NÃO expressa uma melodia clássica de verdade. Então aqui a gente guarda a
 * partitura em MIDI e converte pra Hz na mão (`midiToFreq`), e o jogo dispara
 * cada nota na batida certa a partir do próprio loop de RAF (mesma grade do
 * groove). Sem áudio gravado, sem API externa: é a canção tocada nota a nota.
 *
 * Formato de cada nota: [midi, batidas]. midi 0 = PAUSA (só empurra o relógio,
 * não vira som nem bloco). As durações são em BATIDAS (semínima = 1); o jogo
 * multiplica por `beatMs` (derivado do bpm da própria música) pra virar ms.
 */

// MIDI → Hz, temperamento igual, A4 (midi 69) = 440 Hz. Igual ao midiToFreq
// interno do soundManager, mas exportado aqui porque a fachada de som não o expõe.
export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

// C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, B4=71, C5=72 … (referência rápida).
export const TUNES = [
  {
    id: 'ode',
    name: 'ODE À ALEGRIA',
    bpm: 118,
    // Beethoven, 9ª Sinfonia — o tema mais reconhecível do mundo. Dó maior.
    notes: [
      [64, 1], [64, 1], [65, 1], [67, 1],
      [67, 1], [65, 1], [64, 1], [62, 1],
      [60, 1], [60, 1], [62, 1], [64, 1],
      [64, 1.5], [62, 0.5], [62, 2],
      [64, 1], [64, 1], [65, 1], [67, 1],
      [67, 1], [65, 1], [64, 1], [62, 1],
      [60, 1], [60, 1], [62, 1], [64, 1],
      [62, 1.5], [60, 0.5], [60, 2],
    ],
  },
  {
    id: 'twinkle',
    name: 'BRILHA ESTRELA',
    bpm: 120,
    // "Twinkle Twinkle" / "Ah! vous dirai-je, maman" (Mozart). Dó maior.
    notes: [
      [60, 1], [60, 1], [67, 1], [67, 1],
      [69, 1], [69, 1], [67, 2],
      [65, 1], [65, 1], [64, 1], [64, 1],
      [62, 1], [62, 1], [60, 2],
      [67, 1], [67, 1], [65, 1], [65, 1],
      [64, 1], [64, 1], [62, 2],
      [67, 1], [67, 1], [65, 1], [65, 1],
      [64, 1], [64, 1], [62, 2],
      [60, 1], [60, 1], [67, 1], [67, 1],
      [69, 1], [69, 1], [67, 2],
      [65, 1], [65, 1], [64, 1], [64, 1],
      [62, 1], [62, 1], [60, 2],
    ],
  },
  {
    id: 'fur-elise',
    name: 'PARA ELISA',
    bpm: 96,
    // Beethoven, "Für Elise" — o motivo de abertura. Lá menor, com o Ré# cromático
    // (75) que só sai porque a gente calcula a frequência direto.
    notes: [
      [76, 0.5], [75, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [71, 0.5], [74, 0.5], [72, 0.5],
      [69, 1], [0, 0.5], [60, 0.5], [64, 0.5], [69, 0.5],
      [71, 1], [0, 0.5], [64, 0.5], [68, 0.5], [71, 0.5],
      [72, 1], [0, 0.5], [64, 0.5],
      [76, 0.5], [75, 0.5], [76, 0.5], [75, 0.5], [76, 0.5], [71, 0.5], [74, 0.5], [72, 0.5],
      [69, 1], [0, 0.5], [60, 0.5], [64, 0.5], [69, 0.5],
      [71, 1], [0, 0.5], [64, 0.5], [72, 0.5], [71, 0.5], [69, 2],
    ],
  },
  {
    id: 'jingle',
    name: 'BATE O SINO',
    bpm: 120,
    // "Jingle Bells" — refrão. Dó maior. O [0,2] é a respirada antes da 2ª frase.
    notes: [
      [64, 1], [64, 1], [64, 2],
      [64, 1], [64, 1], [64, 2],
      [64, 1], [67, 1], [60, 1], [62, 1],
      [64, 2], [0, 2],
      [65, 1], [65, 1], [65, 1], [65, 1],
      [65, 1], [64, 1], [64, 1], [64, 1],
      [64, 1], [67, 1], [67, 1], [65, 1],
      [62, 2], [60, 2],
    ],
  },
  {
    id: 'frere',
    name: 'FREI JORGE',
    bpm: 108,
    // "Frère Jacques" / "Frei Jorge" — cânone infantil. Dó maior.
    notes: [
      [60, 1], [62, 1], [64, 1], [60, 1],
      [60, 1], [62, 1], [64, 1], [60, 1],
      [64, 1], [65, 1], [67, 2],
      [64, 1], [65, 1], [67, 2],
      [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1],
      [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1],
      [60, 1], [55, 1], [60, 2],
      [60, 1], [55, 1], [60, 2],
    ],
  },
];

// Sorteia uma música. Mesma seed → mesma canção (chart determinístico).
export function pickTune(rng) {
  return TUNES[rng.int(0, TUNES.length - 1)];
}

/**
 * Achata a partitura em eventos ABSOLUTOS { atMs, midi, durMs } a partir de
 * `startMs`, repetindo a melodia até cobrir `totalMs` (ou bater em `maxNotes`).
 * As pausas (midi <= 0) só empurram o relógio — não viram evento.
 *
 * `beatMs` é a duração de UMA batida (semínima) já pronta pra usar — o chamador
 * embute o bpm da música e (na BATIDA) o timeScale, pra melodia, groove e blocos
 * andarem todos na mesma grade.
 */
export function scheduleTune(tune, { startMs = 0, totalMs, beatMs, maxNotes = Infinity }) {
  const events = [];
  const endMs = startMs + totalMs;
  let t = startMs;
  let guard = 0;
  while (t < endMs && events.length < maxNotes && guard < 512) {
    guard += 1;
    for (let i = 0; i < tune.notes.length; i += 1) {
      const [midi, beats] = tune.notes[i];
      const durMs = beats * beatMs;
      if (midi > 0) events.push({ atMs: t, midi, durMs });
      t += durMs;
      if (t >= endMs || events.length >= maxNotes) break;
    }
  }
  return events;
}
