import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { pickTune, scheduleTune, midiToFreq } from '../_shared/melodies.js';
import {
  readCssColors,
  useCanvasSize,
  useGameClock,
  useOutcome,
  useRaf,
} from '../_shared/hooks.js';
import '../_shared/game.css';
import './Rhythm.css';

/** Quatro faixas: os quatro dedos de baixo, um por coluna. */
const LANES = 4;

/** Tempo que um bloco leva do topo da tela até a linha de acerto. */
const TRAVEL = 1750;

/** Silêncio de entrada antes do primeiro bloco tocável (conta o compasso). */
const LEAD = TRAVEL + 300;

/** Altura da linha de acerto, em fração da tela. */
const HIT_FRAC = 0.82;

/** Janela de acerto (ms de distância do tempo exato) e a fatia PERFEITO. */
const HIT_WINDOW = 175;
const PERFECT_WINDOW = 70;

/** Quantas notas o chart pré-gera. A rodada é fechada pelo relógio (30 s), então
 *  o rabo que não couber é só reserva — segura os modos LENTO/RÁPIDO sem estourar. */
const NOTE_COUNT = 110;

/** Duração da ENERGIA ×2 depois de pegar uma estrela. */
const ENERGY_MS = 5000;

/** Cores das faixas, na ordem do handoff (§5). Literais de propósito: são a
 *  identidade rítmica fixada no design, não derivam do hue do jogo. Índice = a
 *  COLUNA na tela (esquerda→direita), que é a mesma do botão embaixo. */
const LANE_COLORS = ['#7BE86A', '#FF6B8B', '#FFCE31', '#4DE3E3'];

const WORD_GOOD = '#7BE86A';
const WORD_OK = '#FFCE31';
const SPARK_LIGHT = '#FFFDF7';

const TOKENS = [
  '--color-text',
  '--color-text-muted',
  '--color-bg-deep',
  '--color-surface',
  '--color-surface-2',
  '--color-danger',
  '--color-warning',
  '--color-ink',
  '--font-mono',
];

/**
 * BATIDA — quatro faixas de notas descendo até a linha; um dedo por coluna.
 *
 * A partitura é uma MÚSICA DE VERDADE (domínio público: Ode à Alegria, Para
 * Elisa, Brilha Estrela…), sorteada pelo rng da rodada — mesma semente, mesma
 * canção. Nenhum áudio gravado: cada bloco carrega o MIDI real da nota e o tom
 * sai do Web Audio no momento do acerto, então a "música" é literalmente o que
 * você toca — tocar a fase inteira toca a melodia reconhecível. O andamento
 * (beatMs) vem do bpm da própria música, e o groove + o pulso visual dos botões
 * andam nessa mesma batida (o pedido: "a arte acompanha o ritmo da música").
 *
 * Tipos de nota: TAP (padrão), HOLD (nota longa da melodia — segura e solta no
 * fim), ESTRELA (liga a ENERGIA ×2 por 5 s) e DUPLA (vale mais). timeScale não
 * mexe no relógio do julgamento — ele aperta o beatMs (mais denso = mais
 * difícil), mantendo as janelas de acerto em milissegundos reais.
 */
export default function Rhythm({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const invert = !!effects?.invert;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const padRef = useRef(null); // recebe --beat pra pulsar as barras dos botões
  const colorsRef = useRef(null);
  const startRef = useRef(0);
  const overRef = useRef(false);
  const pulseRef = useRef([0, 0, 0, 0]);
  const heldRef = useRef([null, null, null, null]); // nota em segurança por coluna
  const energyUntilRef = useRef(-1); // ms de jogo até quando a ENERGIA ×2 dura
  const grooveRef = useRef(-1); // último oitavo já disparado no groove
  const reduceMotionRef = useRef(false); // desliga o pulso decorativo se pedido
  const fxRef = useRef({ rings: [], sparks: [], words: [] });
  const tallyRef = useRef({ pontos: 0, hits: 0, misses: 0, combo: 0, best: 0 });

  // Sorteia a música e trava o andamento nela: beatMs = uma batida do bpm da
  // canção, dividida por timeScale (RÁPIDO/LENTO adensa/afrouxa junto).
  const [tune] = useState(() => pickTune(rng));
  const [beatMs] = useState(() => Math.max(210, Math.round((60000 / tune.bpm) / timeScale)));
  const [chart] = useState(() => buildChart(rng, tune, beatMs));
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  // Bots (§3.11): pts = perf*900, score = pts*3, display = "<pts> pts".
  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const pts = Math.round((perf * 900) / 5) * 5;
    return { score: pts * 3, display: `${pts} pts`, stat: { combo: Math.round(perf * 40) } };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const tally = tallyRef.current;
    const total = tally.hits + tally.misses;
    const accuracy = total ? Math.round((tally.hits / total) * 100) : 0;

    end({
      entries: [
        {
          playerId: localPlayerId,
          score: tally.pontos * 3, // score de ranqueamento = pontos ×3 (§3.2)
          display: `${tally.pontos} pts`,
          stat: { combo: tally.best },
        },
        ...rivalFinals,
      ],
      value: `${tally.pontos}`,
      label: 'PONTOS',
      tone: accuracy >= 70 ? 'good' : accuracy >= 40 ? 'neutral' : 'bad',
      note: `${accuracy}% de acerto · sequência máxima x${tally.best}`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ----------------------------------------------------------------- áudio */

  // A NOTA é a recompensa — e é a nota REAL da melodia (freq direto do MIDI,
  // porque a fachada de som não expõe midiToFreq e a pentatônica não daria uma
  // canção clássica). Faixa vira PAN; a qualidade do acerto muda o timbre.
  const playNote = useCallback((laneIndex, midi, perfeito, type) => {
    const pan = ((laneIndex - (LANES - 1) / 2) / ((LANES - 1) / 2)) * 0.55;
    const freq = midiToFreq(midi);
    if (perfeito) {
      sound?.note?.(freq, 0.2, 'triangle', 0.2, { pan, reverb: 0.3, sustain: 0.78 });
      sound?.note?.(freq * 2, 0.16, 'sine', 0.09, { pan, reverb: 0.34 }); // oitava de brilho
    } else {
      sound?.note?.(freq, 0.16, 'triangle', 0.17, { pan, reverb: 0.24 });
    }
    if (type === 'star') sound?.note?.(freq * 1.5, 0.2, 'sine', 0.09, { pan, reverb: 0.42 }); // quinta cintilante
  }, [sound]);

  /* -------------------------------------------------------------- efeitos */

  // Rastro de acerto: anel na cor da faixa, faíscas e a palavra do julgamento.
  // Cosmético — usa Math.random (não consome a semente do chart).
  const spawnFx = useCallback((col, perfeito, word, now) => {
    const color = LANE_COLORS[col];
    const fx = fxRef.current;
    fx.rings.push({ col, born: now, max: 460, color });
    for (let s = 0; s < 5; s += 1) {
      fx.sparks.push({
        col,
        born: now,
        max: 620,
        dx: (Math.random() - 0.5) * 0.16, // ±8% da largura
        y0: 0.78 + Math.random() * 0.08, // 78–86% da altura
        size: 6 + Math.random() * 8,
        color: s % 2 === 0 ? SPARK_LIGHT : color,
      });
    }
    if (word) fx.words.push({ col, born: now, max: 700, text: word, color: perfeito ? WORD_GOOD : WORD_OK });
  }, []);

  /* --------------------------------------------------------------- toque */

  // Encosta o dedo: julga a nota mais próxima na coluna. Tocar no vazio não pune
  // (é ritmo, não reação) — só acende o pulso da faixa.
  const press = useCallback((buttonIndex) => {
    if (overRef.current) return;
    // INVERTIDO troca os cantos: o botão da esquerda passa a valer a faixa da
    // direita. `buttonIndex` é a COLUNA na tela; `lane` é a nota lógica.
    const col = buttonIndex;
    const lane = invert ? LANES - 1 - col : col;
    const now = performance.now() - startRef.current;
    pulseRef.current[col] = 1;

    let target = null;
    let best = Infinity;
    for (let i = 0; i < chart.length; i += 1) {
      const note = chart[i];
      if (note.lane !== lane || note.judged) continue;
      const delta = Math.abs(note.t - now);
      if (delta < best) { best = delta; target = note; }
    }
    if (!target || best > HIT_WINDOW) return;

    const perfeito = best <= PERFECT_WINDOW;
    const tally = tallyRef.current;
    const energyActive = now < energyUntilRef.current;

    tally.hits += 1;
    tally.combo += 1;
    tally.best = Math.max(tally.best, tally.combo);

    if (target.type === 'hold') {
      target.judged = 'HOLD';
      target.held = true;
      heldRef.current[col] = target;
      let gain = 12 + Math.min(20, tally.combo); // +12 ao segurar
      if (energyActive) gain *= 2;
      tally.pontos += gain;
      spawnFx(col, perfeito, 'SEGURA', now);
      playNote(col, target.midi, perfeito);
    } else {
      target.judged = perfeito ? 'PERFEITO' : 'ACERTO';
      let base = perfeito ? 20 : 10;
      let word = perfeito ? 'PERFEITO' : 'ÓTIMO';
      if (target.type === 'double') { base += 35; word = perfeito ? 'PERFEITO' : 'DUPLA'; }
      if (target.type === 'star') {
        base = 20;
        word = 'ESTRELA';
        energyUntilRef.current = now + ENERGY_MS; // liga a ENERGIA ×2
      }
      let gain = base + Math.min(20, tally.combo); // bônus de sequência
      if (energyActive) gain *= 2;
      tally.pontos += gain;
      spawnFx(col, perfeito, word, now);
      playNote(col, target.midi, perfeito, target.type);
    }

    setScore(tally.pontos);
    setCombo(tally.combo);
    if (tally.combo % 8 === 0) sound?.play?.('combo');
  }, [chart, invert, playNote, sound, spawnFx]);

  // Solta o dedo: só importa se havia um HOLD em andamento nesta coluna.
  const release = useCallback((buttonIndex) => {
    const col = buttonIndex;
    const note = heldRef.current[col];
    if (!note) return;
    heldRef.current[col] = null;
    note.held = false;
    const now = performance.now() - startRef.current;
    const tally = tallyRef.current;

    if (now >= note.t + note.len - 220) {
      note.judged = 'HOLD_OK';
      tally.combo += 1;
      tally.best = Math.max(tally.best, tally.combo);
      let gain = 30 + Math.min(20, tally.combo); // +30 ao soltar no fim
      if (now < energyUntilRef.current) gain *= 2;
      tally.pontos += gain;
      spawnFx(col, true, 'SOLTA', now);
      playNote(col, note.midi, true);
      setScore(tally.pontos);
    } else {
      note.judged = 'HOLD_EARLY'; // soltou cedo demais: zera o combo
      tally.combo = 0;
      sound?.play?.('miss');
    }
    setCombo(tally.combo);
  }, [playNote, sound, spawnFx]);

  useEffect(() => {
    if (!bus?.on) return undefined;
    return bus.on((action) => {
      if (action.playerId !== localPlayerId) return;
      const lane = action.payload?.lane;
      if (typeof lane !== 'number') return;
      if (action.action === 'TAP') press(lane);
      else if (action.action === 'RELEASE') release(lane);
    });
  }, [bus, localPlayerId, press, release]);

  // O pulso na batida é decoração; quem pede menos movimento não recebe.
  useEffect(() => {
    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  /* ------------------------------------------------------------- simulação */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    if (!colorsRef.current) colorsRef.current = readCssColors(canvas, TOKENS);
    if (!startRef.current) startRef.current = performance.now();
    const colors = colorsRef.current;
    const now = performance.now() - startRef.current;

    if (!outcome) {
      const tally = tallyRef.current;
      let broke = false;
      let dirty = false;
      for (let i = 0; i < chart.length; i += 1) {
        const note = chart[i];
        if (note.judged) {
          // HOLD segurado até passar do fim: completa sozinho, como se soltasse
          // no tempo certo. Sem isto, quem segura até o talo nunca ganharia o +30.
          if (note.judged === 'HOLD' && note.held && now > note.t + note.len) {
            note.judged = 'HOLD_OK';
            note.held = false;
            const col = invert ? LANES - 1 - note.lane : note.lane;
            heldRef.current[col] = null;
            tally.combo += 1;
            tally.best = Math.max(tally.best, tally.combo);
            let gain = 30 + Math.min(20, tally.combo);
            if (now < energyUntilRef.current) gain *= 2;
            tally.pontos += gain;
            dirty = true;
          }
          continue;
        }
        if (now - note.t > HIT_WINDOW) {
          note.judged = 'MISS';
          tally.misses += 1;
          tally.combo = 0;
          broke = true;
        }
      }
      if (broke) { setCombo(0); sound?.play?.('miss'); }
      if (dirty || broke) { setScore(tally.pontos); setCombo(tally.combo); }

      // Groove de acompanhamento: bateria sintética presa à grade real de tempo
      // (LEAD + beatMs), independente do chart — é o "colchão" por baixo da
      // melodia. Kick no tempo, caixa no contratempo forte, chimbal no oitavo.
      const eighth = beatMs / 2;
      const idx = Math.floor((now - LEAD) / eighth);
      if (idx > grooveRef.current) {
        const from = Math.max(grooveRef.current + 1, idx - 1);
        for (let k = from; k <= idx; k += 1) {
          if (k < 0) continue;
          if (k % 2 === 0) sound?.drum?.('kick', { gain: 0.5 });
          if (k % 4 === 2) sound?.drum?.('snare', { gain: 0.26 });
          sound?.drum?.('hat', { gain: k % 2 === 0 ? 0.07 : 0.11, open: k % 8 === 6 });
        }
        grooveRef.current = idx;
      }
    }

    for (let i = 0; i < LANES; i += 1) {
      pulseRef.current[i] = Math.max(0, pulseRef.current[i] - dt * 4);
    }
    // Poda os efeitos vencidos (todos somem em ≤700 ms).
    const fx = fxRef.current;
    fx.rings = fx.rings.filter((r) => now - r.born < r.max);
    fx.sparks = fx.sparks.filter((s) => now - s.born < s.max);
    fx.words = fx.words.filter((wd) => now - wd.born < wd.max);

    // Pulso na MESMA grade do groove/melodia: pico na batida, decai até a
    // próxima. Alimenta a linha de acerto (canvas) e as barras dos botões (via
    // --beat no CSS) — a arte "acompanha o ritmo" mesmo sem o dedo tocar.
    const sinceLead = now - LEAD;
    const beatPulse = (reduceMotionRef.current || sinceLead < 0)
      ? 0
      : Math.max(0, 1 - ((sinceLead % beatMs) / beatMs) * 2.6);
    if (padRef.current) padRef.current.style.setProperty('--beat', beatPulse.toFixed(3));

    const energyActive = now < energyUntilRef.current;
    paint(ctx, w, h, colors, chart, now, pulseRef.current, fx, invert, energyActive, tallyRef.current.combo, beatPulse);
  }, true);

  /* ----------------------------------------------------------------- render */

  const timeRatio = duration ? Math.max(0, Math.min(1, 1 - remaining / duration)) : 0;
  const ceiling = Math.max(score * 3, ...rivalFinals.map((entry) => entry.score), 900);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score, timeRatio, index * 1.2),
    };
  });

  const handlers = (index) => ({
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      press(index);
    },
    onPointerUp: () => release(index),
    onPointerCancel: () => release(index),
  });

  return (
    <div className="gscene rh">
      <GameHeader
        title="BATIDA"
        instruction={invert ? 'FAIXAS TROCADAS.' : `${tune.name} · ${Math.round(60000 / beatMs)} BPM`}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="PONTOS" value={score} tone="good" pulseKey={score} />
        <ScoreBadge label="SEQ." value={`x${combo}`} tone={combo >= 5 ? 'accent' : 'neutral'} size="sm" />
      </GameHeader>

      <div className="gscene__stage">
        <canvas ref={canvasRef} className="gcanvas" />
        <RivalBars rivals={rivals} max={ceiling} />

        {outcome ? (
          <div className="gover">
            <GameResult
              value={outcome.value}
              label={outcome.label}
              tone={outcome.tone}
              note={outcome.note}
            />
          </div>
        ) : null}
      </div>

      <div className="gscene__pad rh__pad" ref={padRef}>
        {Array.from({ length: LANES }, (item, index) => (
          <button
            key={index}
            type="button"
            className="rh__key"
            style={{ '--lane': LANE_COLORS[index] }}
            aria-label={`faixa ${index + 1}`}
            {...handlers(index)}
          >
            <span className="rh__key-bar" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* partitura                                                                  */
/* ========================================================================= */

/**
 * Constrói o chart a partir da MÚSICA sorteada: cada nota da partitura (já
 * achatada em ms por `scheduleTune`, na grade do bpm/timeScale) vira um bloco
 * carregando o MIDI real — tocar a fase inteira toca a canção reconhecível.
 *
 * Sobre a partitura pura, só duas regras de jogabilidade: (1) nunca a mesma
 * faixa duas vezes seguidas (senão vira metrônomo numa coluna só) e (2) as
 * notas longas da melodia (mínima+) viram HOLD; nas curtas rola estrela/dupla.
 * O ESPAÇAMENTO já vem de `beatMs` (bpm ÷ timeScale) — RÁPIDO adensa a música,
 * LENTO a espaça, sem tocar nas janelas de acerto (que ficam em ms reais).
 */
function buildChart(rng, tune, beatMs) {
  const events = scheduleTune(tune, { startMs: LEAD, totalMs: 34000, beatMs, maxNotes: NOTE_COUNT });
  const notes = [];
  let lane = rng.int(0, LANES - 1);

  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    lane = (lane + rng.pick([1, 2, 3])) % LANES; // nunca a mesma faixa seguida

    let type = 'tap';
    let len = 0;
    if (ev.durMs >= beatMs * 1.5) {
      // Nota longa da melodia → HOLD (segura e solta). Encurta um tico pra
      // deixar respiro antes da próxima, e limita pra não virar barra gigante.
      type = 'hold';
      len = Math.min(ev.durMs * 0.8, beatMs * 1.6);
    } else {
      const roll = rng.range(0, 1);
      if (roll < 0.06) type = 'star'; // ~6%: liga a ENERGIA ×2
      else if (roll < 0.16) type = 'double'; // ~10%: vale mais
    }

    notes.push({ id: i, t: ev.atMs, lane, midi: ev.midi, type, len, judged: null, held: false });
  }

  return notes;
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, colors, chart, now, pulses, fx, invert, energyActive, combo, beatPulse = 0) {
  const laneW = w / LANES;
  const hitY = h * HIT_FRAC;
  const noteH = Math.max(16, h * 0.032);

  ctx.clearRect(0, 0, w, h);

  /* -------------------------------------------------------------- faixas */

  for (let c = 0; c < LANES; c += 1) {
    const x = c * laneW;
    const color = LANE_COLORS[c];

    ctx.fillStyle = colors['--color-surface-2'];
    ctx.globalAlpha = c % 2 === 0 ? 0.16 : 0.1;
    ctx.fillRect(x, 0, laneW, h);
    ctx.globalAlpha = 1;

    // Pulso: acende a faixa junto à linha ao tocar (confirma o botão pego).
    const pulse = pulses[c];
    if (pulse > 0) {
      ctx.globalAlpha = pulse * 0.4;
      ctx.fillStyle = color;
      ctx.fillRect(x, hitY - h * 0.3, laneW, h * 0.3);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = colors['--color-bg-deep'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  /* ------------------------------------------------------- linha de acerto */

  // A linha de acerto ENGROSSA na batida (beatPulse pico=1) e afina até a
  // próxima — é a batida da música virando movimento, sem depender do toque.
  const lineH = 2 + beatPulse * 3;
  ctx.fillStyle = energyActive ? colors['--color-warning'] : colors['--color-text'];
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, hitY - lineH, w, lineH * 2);
  ctx.globalAlpha = 1;

  for (let c = 0; c < LANES; c += 1) {
    // Tampa da faixa: brilha no toque (pulses[c]) E respira na batida (beatPulse).
    const capH = 10 + beatPulse * 6;
    ctx.fillStyle = LANE_COLORS[c];
    ctx.globalAlpha = Math.min(1, 0.32 + pulses[c] * 0.68 + beatPulse * 0.22);
    ctx.fillRect(c * laneW + 4, hitY - capH / 2, laneW - 8, capH);
    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------- blocos */

  for (let i = 0; i < chart.length; i += 1) {
    const note = chart[i];
    const headDelta = note.t - now;
    if (headDelta > TRAVEL || headDelta < -HIT_WINDOW - 260) continue;

    const done = note.judged && note.judged !== 'MISS';
    // Notas já acertadas somem rápido; MISS escorre um pouco em vermelho.
    if (done && headDelta < -60 && note.type !== 'hold') continue;

    const col = invert ? LANES - 1 - note.lane : note.lane;
    const x = col * laneW;
    const color = LANE_COLORS[col];
    const yHead = hitY * (1 - headDelta / TRAVEL);

    /* corpo do HOLD: barra alta ligando a cabeça (t) ao fim (t+len) */
    if (note.type === 'hold') {
      const tailDelta = note.t + note.len - now;
      const yTail = hitY * (1 - tailDelta / TRAVEL);
      const top = Math.min(yHead, yTail);
      const barH = Math.abs(yHead - yTail);
      const holding = note.held;
      ctx.globalAlpha = note.judged === 'HOLD_EARLY' ? 0.25 : holding ? 0.85 : 0.55;
      ctx.fillStyle = color;
      roundRect(ctx, x + laneW * 0.3, top, laneW * 0.4, Math.max(barH, noteH), 8);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (note.judged === 'HOLD_EARLY') continue;
    }

    if (note.judged === 'MISS') {
      ctx.globalAlpha = Math.max(0, 1 + (headDelta + HIT_WINDOW) / 260) * 0.35;
      ctx.fillStyle = colors['--color-danger'];
    } else if (done) {
      ctx.globalAlpha = Math.max(0, 1 + headDelta / 60);
      ctx.fillStyle = colors['--color-text'];
    } else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
    }

    const headH = note.type === 'star' ? noteH * 1.18 : noteH;
    roundRect(ctx, x + laneW * 0.12, yHead - headH / 2, laneW * 0.76, headH, 7);
    ctx.fill();

    if (!note.judged) {
      // Contorno de tinta = adesivo, e destaca o bloco do campo escuro.
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors['--color-bg-deep'];
      ctx.lineWidth = 2;
      ctx.stroke();

      // Base clara alinhada à linha: referência dura para o olho.
      ctx.fillStyle = colors['--color-text'];
      ctx.globalAlpha = 0.75;
      ctx.fillRect(x + laneW * 0.12, yHead + headH / 2 - 3, laneW * 0.76, 3);

      if (note.type === 'star') {
        // Anel branco de estrela.
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = colors['--color-surface'];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + laneW * 0.5, yHead, headH * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      } else if (note.type === 'double') {
        // Pip gêmeo acima: sinaliza "vale mais".
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        roundRect(ctx, x + laneW * 0.24, yHead - headH / 2 - 9, laneW * 0.52, 5, 3);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------------------------------------------- efeitos */

  // Anéis: explodem na cor da faixa junto à linha.
  for (let i = 0; i < fx.rings.length; i += 1) {
    const r = fx.rings[i];
    const p = (now - r.born) / r.max;
    const cx = (r.col + 0.5) * laneW;
    const radius = 12 + p * Math.min(62, laneW * 0.5);
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 6 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(cx, hitY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Faíscas: alternam creme e cor da faixa, sobem e encolhem.
  for (let i = 0; i < fx.sparks.length; i += 1) {
    const s = fx.sparks[i];
    const p = (now - s.born) / s.max;
    const cx = (s.col + 0.5) * laneW + s.dx * w;
    const y = (s.y0 - p * 0.12) * h;
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.fillStyle = s.color;
    const size = s.size * (1 - p * 0.7);
    ctx.fillRect(cx - size / 2, y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;

  // Palavra do julgamento: verde (PERFEITO) ou amarelo, contorno de tinta.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < fx.words.length; i += 1) {
    const wd = fx.words[i];
    const p = (now - wd.born) / wd.max;
    const cx = (wd.col + 0.5) * laneW;
    const y = h * 0.70 - p * 20;
    ctx.globalAlpha = Math.max(0, 1 - p * p);
    ctx.font = `800 ${Math.round(Math.min(w * 0.05, 19))}px ${colors['--font-mono'] || 'monospace'}`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = colors['--color-ink'];
    ctx.lineJoin = 'round';
    ctx.strokeText(wd.text, cx, y);
    ctx.fillStyle = wd.color;
    ctx.fillText(wd.text, cx, y);
  }
  ctx.globalAlpha = 1;

  /* ------------------------------------------------------- ENERGIA / combo */

  if (energyActive) {
    ctx.globalAlpha = 0.9;
    ctx.font = `800 ${Math.round(Math.min(w * 0.045, 16))}px ${colors['--font-mono'] || 'monospace'}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors['--color-ink'];
    ctx.lineJoin = 'round';
    ctx.strokeText('ENERGIA ×2', w / 2, h * 0.08);
    ctx.fillStyle = colors['--color-warning'];
    ctx.fillText('ENERGIA ×2', w / 2, h * 0.08);
    ctx.globalAlpha = 1;
  }

  // Multiplicador gigante no centro quando a sequência embala.
  if (combo >= 5) {
    ctx.globalAlpha = 0.9;
    ctx.font = `700 40px ${colors['--font-mono'] || 'monospace'}`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = colors['--color-ink'];
    ctx.lineJoin = 'round';
    ctx.strokeText(`×${combo}`, w / 2, h * 0.42);
    ctx.fillStyle = colors['--color-surface'];
    ctx.fillText(`×${combo}`, w / 2, h * 0.42);
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
