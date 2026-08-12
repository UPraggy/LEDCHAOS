import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { paceValue, simulateBots } from '../_shared/bots.js';
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

/** Tônica da melodia (A3). A partitura anda numa pentatônica a partir daqui:
 *  qualquer sequência de acertos soa consonante — nunca "erra" de nota. */
const ROOT_MIDI = 57;

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
 * A partitura é gerada na hora a partir do rng da rodada — mesma semente, mesma
 * música. Nenhum áudio gravado: os tons saem do Web Audio no momento do acerto,
 * então a "música" é literalmente o que você toca. Cada bloco carrega seu grau
 * na pentatônica; tocar a fase inteira desenha uma melodia de verdade.
 *
 * Tipos de nota: TAP (padrão), HOLD (segura e solta no fim), ESTRELA (liga a
 * ENERGIA ×2 por 5 s) e DUPLA (vale mais). timeScale não mexe no relógio do
 * julgamento — ele aperta o ESPAÇAMENTO do chart (mais denso = mais difícil),
 * mantendo as janelas de acerto em milissegundos reais.
 */
export default function Rhythm({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const invert = !!effects?.invert;
  const hidden = !!effects?.hidden;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const colorsRef = useRef(null);
  const startRef = useRef(0);
  const overRef = useRef(false);
  const pulseRef = useRef([0, 0, 0, 0]);
  const heldRef = useRef([null, null, null, null]); // nota em segurança por coluna
  const energyUntilRef = useRef(-1); // ms de jogo até quando a ENERGIA ×2 dura
  const grooveRef = useRef(-1); // último oitavo já disparado no groove
  const fxRef = useRef({ rings: [], sparks: [], words: [] });
  const tallyRef = useRef({ pontos: 0, hits: 0, misses: 0, combo: 0, best: 0 });

  const [beatMs] = useState(() => Math.round(rng.range(430, 500)));
  const [chart] = useState(() => buildChart(rng, timeScale));
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

  // A NOTA é a recompensa. Faixa vira PAN; a qualidade do acerto muda o timbre.
  const playNote = useCallback((laneIndex, deg, perfeito, type) => {
    const pan = ((laneIndex - (LANES - 1) / 2) / ((LANES - 1) / 2)) * 0.55;
    const freq = sound?.scale ? sound.scale(ROOT_MIDI, deg) : 440;
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
      playNote(col, target.deg, perfeito);
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
      playNote(col, target.deg, perfeito, target.type);
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
      playNote(col, note.deg, true);
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

    const energyActive = now < energyUntilRef.current;
    paint(ctx, w, h, colors, chart, now, pulseRef.current, fx, invert, energyActive, tallyRef.current.combo);
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
        instruction={invert ? 'FAIXAS TROCADAS.' : `Toque na linha · ${Math.round(60000 / beatMs)} BPM`}
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
        {hidden ? <div className="gveil" /> : null}

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

      <div className="gscene__pad rh__pad">
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
 * Gera as 110 notas antes de começar.
 *
 * Regras de jogabilidade: nunca repetir a faixa anterior (senão vira
 * metrônomo) e a melodia caminha numa pentatônica (qualquer sequência soa
 * musical). O ESPAÇAMENTO é dividido por timeScale — RÁPIDO aperta o chart,
 * LENTO o afrouxa, sem mexer nas janelas de acerto (que ficam em ms reais).
 */
function buildChart(rng, timeScale) {
  const notes = [];
  let t = LEAD;
  let lane = rng.int(0, LANES - 1);
  let deg = 0; // grau atual na pentatônica
  let dir = 1; // sentido do passo melódico

  const stepMelody = () => {
    const jump = rng.chance(0.22) ? rng.pick([2, 3, 4]) : rng.pick([1, 1, 2]);
    deg += dir * jump;
    if (deg > 11) { deg = 11; dir = -1; }
    else if (deg < 0) { deg = 0; dir = 1; }
    else if (rng.chance(0.3)) dir *= -1;
    return deg;
  };

  for (let i = 0; i < NOTE_COUNT; i += 1) {
    lane = (lane + rng.pick([1, 2, 3])) % LANES; // nunca a mesma faixa seguida
    const d = stepMelody();

    const roll = rng.range(0, 1);
    let type = 'tap';
    if (roll < 0.20) type = 'hold';
    else if (roll < 0.25) type = 'star'; // 5% do total
    else if (roll < 0.32) type = 'double'; // 7% do total

    const len = type === 'hold' ? 620 + rng.range(0, 620) : 0;
    notes.push({ id: i, t, lane, deg: d, type, len, judged: null, held: false });

    const gap = (type === 'hold' ? len + 320 : 360 + rng.range(0, 200)) / timeScale;
    t += gap;
  }

  return notes;
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, colors, chart, now, pulses, fx, invert, energyActive, combo) {
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

  ctx.fillStyle = energyActive ? colors['--color-warning'] : colors['--color-text'];
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, hitY - 2, w, 4);
  ctx.globalAlpha = 1;

  for (let c = 0; c < LANES; c += 1) {
    ctx.fillStyle = LANE_COLORS[c];
    ctx.globalAlpha = 0.32 + pulses[c] * 0.68;
    ctx.fillRect(c * laneW + 4, hitY - 5, laneW - 8, 10);
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
