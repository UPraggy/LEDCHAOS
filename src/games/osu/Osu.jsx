import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { attachPointer } from '../../engine/inputManager.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { useCanvasSize, useGameClock, useOutcome, useRaf } from '../_shared/hooks.js';
import '../_shared/game.css';
import './Osu.css';

const TAU = Math.PI * 2;
const AR = 950; // janela de aproximação do anel (ms)
const CIRCLE_R = 39; // raio do círculo (px) — círculo de 78px do §3.3
const HEAD_HIT = 50; // tolerância de toque no centro (px)
const BALL_R = 16; // bolinha do slider (32px)
const N_NOTES = 70;

/* Cores literais (§3.3): a arena é escura, os alvos trazem a cor. */
const TAP_FILL = 'rgba(255,107,214,.85)';
const SLIDER_FILL = 'rgba(77,227,227,.85)';
const TAP_RING = '#FFCE31';
const SLIDER_RING = '#4DE3E3';
const INK = '#170F3E';
const CREAM = '#FFFDF7';
const GOOD = '#7BE86A';
const BAD = '#FF5C4D';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/**
 * NA MOSCA (osu) — acerte os círculos no instante certo e siga os sliders.
 *
 * Cada nota tem um anel que encolhe até o círculo; tocar quando os dois se
 * encontram vale PERFEITO. 30% são sliders: encoste na cabeça e arraste a
 * bolinha até o fim. Combo dá bônus; sair do trilho ou errar o tempo zera.
 */
export default function Osu({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const hidden = !!effects?.hidden;

  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const clockRef = useRef(0);
  const overRef = useRef(false);
  const activeRef = useRef(null);
  const burstsRef = useRef([]);
  const ptsRef = useRef(0);
  const hitsRef = useRef(0);
  const missRef = useRef(0);
  const comboRef = useRef(0);

  const [chart] = useState(() => buildChart(rng, timeScale));
  const chartRef = useRef(chart);

  const [pts, setPts] = useState(0);
  const [combo, setCombo] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    // §3.11: pts=round(perf*780) → score=pts*4.
    const p = Math.round(perf * 780);
    return { score: p * 4, display: `${p} pts` };
  }));

  /* ------------------------------------------------------------- fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const total = hitsRef.current + missRef.current;
    const accuracy = total ? hitsRef.current / total : 0;
    const score = Math.max(0, ptsRef.current) * 4;

    end({
      entries: [
        {
          playerId: localPlayerId,
          score,
          display: `${Math.max(0, ptsRef.current)} pts`,
          stat: { accuracy },
        },
        ...rivalFinals,
      ],
      value: `${Math.max(0, ptsRef.current)}`,
      label: 'PONTOS',
      tone: ptsRef.current >= 400 ? 'good' : ptsRef.current >= 180 ? 'neutral' : 'bad',
      note: `${hitsRef.current} acerto${hitsRef.current === 1 ? '' : 's'} · ${Math.round(accuracy * 100)}% de precisão.`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ------------------------------------------------------------------ notas */

  const burst = useCallback((x, y, word, color) => {
    burstsRef.current.push({ x, y, word, color, born: performance.now() });
  }, []);

  const bumpPts = useCallback((delta) => {
    ptsRef.current += delta;
    setPts(Math.max(0, ptsRef.current));
  }, []);

  const resetCombo = useCallback(() => {
    comboRef.current = 0;
    setCombo(0);
  }, []);

  const gainCombo = useCallback(() => {
    comboRef.current += 1;
    setCombo(comboRef.current);
    return Math.min(20, comboRef.current);
  }, []);

  const px = useCallback((nx) => (nx / 100) * sizeRef.current.w, [sizeRef]);
  const py = useCallback((ny) => (ny / 100) * sizeRef.current.h, [sizeRef]);

  /* -------------------------------------------------------------- interação */

  const onDown = useCallback((x, y) => {
    if (overRef.current) return;
    const now = clockRef.current;
    const notes = chartRef.current;

    // 1) engatar a cabeça de um slider ocioso sob o dedo.
    for (let i = 0; i < notes.length; i += 1) {
      const n = notes[i];
      if (n.resolved || n.type !== 'slider' || n.state !== 'idle') continue;
      if (now < n.t - 260 || now > n.t + 200) continue;
      if (dist(x, y, px(n.x), py(n.y)) < HEAD_HIT) {
        n.state = 'holding';
        activeRef.current = n;
        bumpPts(15);
        sound?.play?.('hit');
        burst(px(n.x), py(n.y), '+15', SLIDER_RING);
        return;
      }
    }

    // 2) julgar o tap mais próximo dentro da janela.
    let best = null;
    let bestDelta = Infinity;
    for (let i = 0; i < notes.length; i += 1) {
      const n = notes[i];
      if (n.resolved || n.type !== 'tap') continue;
      if (dist(x, y, px(n.x), py(n.y)) >= HEAD_HIT) continue;
      const d = Math.abs(n.t - now);
      if (d <= 260 && d < bestDelta) { best = n; bestDelta = d; }
    }
    if (!best) return;

    best.resolved = true;
    const cx = px(best.x);
    const cy = py(best.y);
    if (bestDelta < 95) {
      const bonus = gainCombo();
      bumpPts(30 + bonus);
      hitsRef.current += 1;
      sound?.play?.('perfect');
      burst(cx, cy, 'PERFEITO', GOOD);
    } else if (bestDelta < 175) {
      const bonus = gainCombo();
      bumpPts(18 + bonus);
      hitsRef.current += 1;
      sound?.play?.('hit');
      burst(cx, cy, 'BOM', TAP_RING);
    } else {
      resetCombo();
      missRef.current += 1;
      sound?.play?.('miss');
      burst(cx, cy, 'ERRO', BAD);
    }
  }, [burst, bumpPts, gainCombo, resetCombo, px, py, sound]);

  const onMove = useCallback((x, y) => {
    const n = activeRef.current;
    if (!n || overRef.current) return;
    const now = clockRef.current;
    const k = clamp((now - n.t) / n.len, 0, 1);
    const bx = px(n.x) + (px(n.tx) - px(n.x)) * k;
    const by = py(n.y) + (py(n.ty) - py(n.y)) * k;
    const stray = 0.14 * Math.min(sizeRef.current.w, sizeRef.current.h);
    if (dist(x, y, bx, by) > stray) {
      // Saiu do trilho: cancela e zera combo (§3.3).
      n.resolved = true;
      activeRef.current = null;
      resetCombo();
      missRef.current += 1;
      sound?.play?.('miss');
      burst(bx, by, 'SAIU', BAD);
    }
  }, [burst, resetCombo, px, py, sizeRef, sound]);

  const onUp = useCallback(() => {
    const n = activeRef.current;
    if (!n || overRef.current) return;
    activeRef.current = null;
    const now = clockRef.current;
    const bx = px(n.x) + (px(n.tx) - px(n.x));
    const by = py(n.y) + (py(n.ty) - py(n.y));
    n.resolved = true;
    if (now >= n.t + n.len - 180) {
      const bonus = gainCombo();
      bumpPts(40 + bonus);
      hitsRef.current += 1;
      sound?.play?.('perfect');
      burst(bx, by, 'PERFEITO', GOOD);
    } else {
      resetCombo();
      missRef.current += 1;
      sound?.play?.('miss');
      burst(bx, by, 'CEDO', BAD);
    }
  }, [burst, bumpPts, gainCombo, resetCombo, px, py, sound]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || outcome) return undefined;
    return attachPointer(el, {
      onDown: (p) => onDown(p.x, p.y),
      onMove: (p) => onMove(p.x, p.y),
      onUp: () => onUp(),
      onCancel: () => onUp(),
    }, { bus, playerId: localPlayerId });
  }, [bus, localPlayerId, outcome, onDown, onMove, onUp]);

  /* ------------------------------------------------------------------ mundo */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    const now = performance.now();
    if (!outcome) {
      clockRef.current += dt * 1000;
      resolveMisses(chartRef.current, clockRef.current, activeRef, {
        onMiss: (n) => {
          missRef.current += 1;
          resetCombo();
          burst(px(n.x), py(n.y), 'PERDEU', BAD);
        },
        onHold: (n) => {
          const bonus = gainCombo();
          bumpPts(40 + bonus);
          hitsRef.current += 1;
          burst(px(n.tx), py(n.ty), 'PERFEITO', GOOD);
        },
      });
    }

    paint(ctx, w, h, chartRef.current, clockRef.current, comboRef.current, burstsRef.current, now);
  }, true);

  /* ----------------------------------------------------------------- render */

  const ratio = Math.min(1, Math.max(0, 1 - remaining / duration));
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score / 4, ratio, index * 11),
    };
  });
  const ceiling = Math.max(pts, ...rivals.map((r) => r.value), 300);

  return (
    <div className="gscene os">
      <GameHeader
        title="NA MOSCA"
        instruction="Toque quando o anel fechar. Arraste os sliders."
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="PONTOS" value={pts} tone="good" pulseKey={pts} />
        {combo >= 3 ? <ScoreBadge label="COMBO" value={`${combo}x`} tone="accent" size="sm" /> : null}
      </GameHeader>

      <div className="gscene__stage">
        <RivalBars rivals={rivals} max={ceiling} />

        <div className="os__box" ref={boxRef}>
          <canvas ref={canvasRef} className="os__canvas" />
        </div>

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
    </div>
  );
}

/* ========================================================================= */
/* chart                                                                      */
/* ========================================================================= */

function buildChart(rng, timeScale) {
  const notes = [];
  let t = 1400; // lead-in: dá tempo do primeiro anel aparecer.
  for (let i = 0; i < N_NOTES; i += 1) {
    const num = (i % 5) + 1;
    const x = 18 + rng() * 64;
    const y = 16 + rng() * 66;
    if (rng() < 0.30) {
      const len = 700;
      const lenPct = 18 + rng() * 16;
      const angle = rng() * TAU;
      const tx = clamp(x + Math.cos(angle) * lenPct, 12, 88);
      const ty = clamp(y + Math.sin(angle) * lenPct, 12, 88);
      notes.push({ i, num, type: 'slider', t, x, y, tx, ty, len, resolved: false, state: 'idle' });
      t += (len + 380) / timeScale;
    } else {
      notes.push({ i, num, type: 'tap', t, x, y, resolved: false });
      t += (520 + rng() * 260) / timeScale;
    }
  }
  return notes;
}

/** Passivamente resolve notas que expiraram sem toque, e sliders segurados
 *  até o fim (§3.3: nota não tocada até t+200 = erro). */
function resolveMisses(notes, now, activeRef, cb) {
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i];
    if (n.resolved) continue;
    if (n.type === 'tap') {
      if (now > n.t + 260) { n.resolved = true; cb.onMiss(n); }
    } else if (n.state === 'idle') {
      if (now > n.t + 200) { n.resolved = true; cb.onMiss(n); }
    } else if (n.state === 'holding' && now > n.t + n.len + 250) {
      // Seguiu até o fim sem soltar: conta como acerto.
      n.resolved = true;
      activeRef.current = null;
      cb.onHold(n);
    }
  }
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, notes, now, combo, bursts, wallNow) {
  ctx.clearRect(0, 0, w, h);

  const toX = (nx) => (nx / 100) * w;
  const toY = (ny) => (ny / 100) * h;

  // Desenha as notas ativas de trás para frente (a mais nova por cima).
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    const n = notes[i];
    if (n.resolved) continue;
    if (now < n.t - AR) continue;
    const cx = toX(n.x);
    const cy = toY(n.y);

    if (n.type === 'slider') {
      const hx = cx;
      const hy = cy;
      const tx = toX(n.tx);
      const ty = toY(n.ty);
      // Trilho: borda clara larga, depois o miolo translúcido por cima.
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.lineWidth = BALL_R * 2 + 8;
      ctx.strokeStyle = 'rgba(255,253,247,.5)';
      ctx.stroke();
      ctx.lineWidth = BALL_R * 2;
      ctx.strokeStyle = 'rgba(255,253,247,.12)';
      ctx.stroke();

      drawRing(ctx, hx, hy, ringScale(n.t, now), SLIDER_RING);
      drawCircle(ctx, hx, hy, SLIDER_FILL, n.num);

      // Bolinha viaja da cabeça ao fim conforme k.
      if (now >= n.t) {
        const k = clamp((now - n.t) / n.len, 0, 1);
        const bx = hx + (tx - hx) * k;
        const by = hy + (ty - hy) * k;
        ctx.beginPath();
        ctx.arc(bx, by, BALL_R, 0, TAU);
        ctx.fillStyle = TAP_RING;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
    } else {
      drawRing(ctx, cx, cy, ringScale(n.t, now), TAP_RING);
      drawCircle(ctx, cx, cy, TAP_FILL, n.num);
    }
  }

  drawBursts(ctx, bursts, wallNow);

  // Combo grande no canto inferior esquerdo (mono, contorno de tinta).
  if (combo >= 3) {
    ctx.font = '800 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.strokeText(`${combo}x`, 14, h - 12);
    ctx.fillStyle = TAP_RING;
    ctx.fillText(`${combo}x`, 14, h - 12);
  }
}

function ringScale(t, now) {
  return Math.max(1, 1 + 1.9 * ((t - now) / AR));
}

function drawRing(ctx, cx, cy, scale, color) {
  if (scale <= 1.02) return;
  ctx.beginPath();
  ctx.arc(cx, cy, CIRCLE_R * scale, 0, TAU);
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function drawCircle(ctx, cx, cy, fill, num) {
  // Contorno de tinta por fora (box-shadow 0 0 0 4px), borda creme, miolo colorido.
  ctx.beginPath();
  ctx.arc(cx, cy, CIRCLE_R + 4.5, 0, TAU);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, CIRCLE_R, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = CREAM;
  ctx.stroke();

  ctx.fillStyle = CREAM;
  ctx.font = '800 30px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), cx, cy + 1);
}

function drawBursts(ctx, bursts, now) {
  for (let i = bursts.length - 1; i >= 0; i -= 1) {
    const b = bursts[i];
    const age = now - b.born;
    if (age > 700) { bursts.splice(i, 1); continue; }

    // Anel de burst (460ms): expande de 30 a 86px e some.
    if (age < 460) {
      const rt = age / 460;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 15 + rt * 43, 0, TAU);
      ctx.lineWidth = 4;
      ctx.globalAlpha = 1 - rt;
      ctx.strokeStyle = b.color;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Palavra do julgamento (700ms): sobe e some.
    const wt = age / 700;
    ctx.save();
    ctx.globalAlpha = 1 - wt * wt;
    ctx.font = '800 20px "Baloo 2", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(b.word, b.x, b.y - 30 - wt * 26);
    ctx.fillStyle = b.color;
    ctx.fillText(b.word, b.x, b.y - 30 - wt * 26);
    ctx.restore();
  }
}
