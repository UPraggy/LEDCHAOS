import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { attachPointer } from '../../engine/inputManager.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { drawImageCentered, preloadImages } from '../_shared/assets.js';
import { useCanvasSize, useGameClock, useOutcome, useRaf } from '../_shared/hooks.js';
import '../_shared/game.css';
import './Trace.css';

const TAU = Math.PI * 2;

/* Cores literais: a caixa é creme fixo, então os pontos precisam do próprio
   contraste, independente do tema. Apagado lilás claro, marcado verde vivo. */
const DOT_OFF = '#D9D2F5';
const DOT_ON = '#7BE86A';
const INK = '#170F3E';

const IMG_SRC = { pincel: '/assets/jogo/pincel.png' };

/* Fração de pontos cobertos que "fecha" a forma, e a pausa até a próxima. */
const CLOSE_AT = 0.97;
const GAP_MS = 700;

/* Raio da forma dentro da caixa (fração do lado) e tolerância de acerto do
   dedo em cada eixo (§3.5: <6% em x E y). */
const RADIUS = 0.38;
const HIT = 0.06;

const KINDS = ['circle', 'square', 'triangle', 'star', 'heart'];
const LABEL = {
  circle: 'CÍRCULO',
  square: 'QUADRADO',
  triangle: 'TRIÂNGULO',
  star: 'ESTRELA',
  heart: 'CORAÇÃO',
};

/**
 * CONTORNO — cubra o desenho arrastando o dedo por cima dos pontos.
 *
 * A forma é uma sequência de pontos calculada (círculo, quadrado, triângulo,
 * estrela, coração) num espaço quadrado. Cada ponto acende quando o dedo passa
 * perto o bastante; a 97% cobertos a forma FECHA e a próxima entra. Quanto mais
 * formas fechar no tempo, maior a pontuação.
 */
export default function Trace({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const hidden = !!effects?.hidden;

  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const imagesRef = useRef(null);
  const fingerRef = useRef({ x: 0, y: 0, down: false });
  const overRef = useRef(false);
  const formasRef = useRef(0);
  const gapRef = useRef(0);

  const bagRef = useRef(null);
  if (!bagRef.current) bagRef.current = rng.shuffle(KINDS);
  const shapeRef = useRef(null);
  if (!shapeRef.current) {
    const first = takeKind(bagRef, rng);
    shapeRef.current = { kind: first, dots: buildDots(first), marked: 0, closed: false };
  }

  const [kind, setKind] = useState(shapeRef.current.kind);
  const [pct, setPct] = useState(0);
  const [formas, setFormas] = useState(0);
  const [seal, setSeal] = useState(false);
  const [outcome, end] = useOutcome(onFinish);

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    // §3.11: formas=floor(perf*2.8), pct=resto → score=(formas*100+pct)*8.
    const raw = perf * 2.8;
    const f = Math.floor(raw);
    const p = Math.round((raw - f) * 100);
    return { score: (f * 100 + p) * 8, display: `${f} forma${f === 1 ? '' : 's'}` };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const done = formasRef.current;
    const shape = shapeRef.current;
    const current = shape && !shape.closed
      ? Math.round((shape.marked / shape.dots.length) * 100)
      : 0;
    const score = (done * 100 + current) * 8;

    end({
      entries: [
        {
          playerId: localPlayerId,
          score,
          display: `${done} forma${done === 1 ? '' : 's'} · ${current}%`,
          stat: { artistScore: score },
        },
        ...rivalFinals,
      ],
      value: `${done}`,
      label: 'FORMAS',
      tone: done >= 2 ? 'good' : done >= 1 ? 'neutral' : 'bad',
      note: done
        ? `${done} fechada${done === 1 ? '' : 's'} · ${current}% na atual.`
        : `Chegou a ${current}% da primeira.`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ---------------------------------------------------------------- fecha */

  const closeShape = useCallback(() => {
    const shape = shapeRef.current;
    if (!shape || shape.closed) return;
    shape.closed = true;
    formasRef.current += 1;
    setFormas(formasRef.current);
    setSeal(true);
    sound?.play?.('perfect');

    gapRef.current = window.setTimeout(() => {
      if (overRef.current) return;
      const next = takeKind(bagRef, rng);
      shapeRef.current = { kind: next, dots: buildDots(next), marked: 0, closed: false };
      setKind(next);
      setPct(0);
      setSeal(false);
    }, GAP_MS);
  }, [rng, sound]);

  useEffect(() => () => clearTimeout(gapRef.current), []);

  /* --------------------------------------------------------------- toque */

  const mark = useCallback((px, py) => {
    const shape = shapeRef.current;
    const { w, h } = sizeRef.current;
    if (!shape || shape.closed || overRef.current || w < 2) return;

    const side = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const r = RADIUS * side;
    const thr = HIT * side;

    let changed = false;
    for (let i = 0; i < shape.dots.length; i += 1) {
      const d = shape.dots[i];
      if (d.marked) continue;
      const dx = cx + d.x * r;
      const dy = cy + d.y * r;
      if (Math.abs(px - dx) < thr && Math.abs(py - dy) < thr) {
        d.marked = true;
        shape.marked += 1;
        changed = true;
      }
    }
    if (!changed) return;

    const covered = shape.marked / shape.dots.length;
    setPct(Math.round(covered * 100));
    if (covered >= CLOSE_AT) closeShape();
    else sound?.note?.(220 + shape.marked * 6, 0.05, 'sine', 0.05);
  }, [closeShape, sizeRef, sound]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || outcome) return undefined;
    return attachPointer(el, {
      onDown: (p) => { fingerRef.current = { x: p.x, y: p.y, down: true }; mark(p.x, p.y); },
      onMove: (p) => { fingerRef.current = { x: p.x, y: p.y, down: true }; mark(p.x, p.y); },
      onUp: (p) => { fingerRef.current = { x: p.x, y: p.y, down: false }; },
    }, { bus, playerId: localPlayerId });
  }, [bus, localPlayerId, outcome, mark]);

  /* ------------------------------------------------------------- pintura */

  useRaf(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;
    if (!imagesRef.current) imagesRef.current = preloadImages(IMG_SRC);
    paint(ctx, w, h, shapeRef.current, fingerRef.current, imagesRef.current);
  }, true);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, Math.max(0, 1 - remaining / duration));
  const localUnits = formas + pct / 100;
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score / 800, ratio, index * 1.1),
    };
  });
  const ceiling = Math.max(localUnits, ...rivals.map((r) => r.value), 2.8);

  return (
    <div className="gscene tc">
      <GameHeader
        title="CONTORNO"
        instruction={`Cubra o ${LABEL[kind]} arrastando o dedo.`}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="FORMAS" value={formas} tone="good" pulseKey={formas} />
        <ScoreBadge label="ATUAL" value={`${pct}%`} tone={pct >= 60 ? 'accent' : 'neutral'} size="sm" />
      </GameHeader>

      <div className="gscene__stage">
        <RivalBars rivals={rivals} max={ceiling} />

        <div className="tc__bar" aria-hidden="true">
          <span className="tc__bar-fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="tc__box" ref={boxRef}>
          <canvas ref={canvasRef} className="tc__canvas" />
          {seal ? <div className="tc__seal"><span>FECHOU!</span></div> : null}
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
/* formas                                                                     */
/* ========================================================================= */

/** Tira a próxima forma da sacola embaralhada, reabastecendo quando esvazia. */
function takeKind(bagRef, rng) {
  if (!bagRef.current.length) bagRef.current = rng.shuffle(KINDS);
  return bagRef.current.shift();
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Pontos normalizados da forma em [-1..1], centrados em (0,0). O caller
 * multiplica por raio e soma o centro da caixa. Contagens do §3.5.
 */
function buildDots(kind) {
  const pts = [];
  const push = (x, y) => pts.push({ x, y, marked: false });

  if (kind === 'circle') {
    for (let i = 0; i < 64; i += 1) {
      const a = (i / 64) * TAU;
      push(Math.cos(a), Math.sin(a));
    }
  } else if (kind === 'square') {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let s = 0; s < 4; s += 1) {
      const [ax, ay] = c[s];
      const [bx, by] = c[(s + 1) % 4];
      for (let j = 0; j < 16; j += 1) {
        const t = j / 16;
        push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  } else if (kind === 'triangle') {
    const v = [[0, -1.05], [1, 0.75], [-1, 0.75]];
    for (let s = 0; s < 3; s += 1) {
      const [ax, ay] = v[s];
      const [bx, by] = v[(s + 1) % 3];
      for (let j = 0; j < 22; j += 1) {
        const t = j / 22;
        push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  } else if (kind === 'star') {
    const verts = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i / 10) * TAU;
      const rad = i % 2 === 0 ? 1 : 0.46;
      verts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
    }
    for (let s = 0; s < 10; s += 1) {
      const [ax, ay] = verts[s];
      const [bx, by] = verts[(s + 1) % 10];
      for (let j = 0; j < 7; j += 1) {
        const t = j / 7;
        push(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  } else {
    // coração: paramétrica clássica, normalizada por 17 para caber em [-1..1].
    for (let i = 0; i < 66; i += 1) {
      const t = (i / 66) * TAU;
      const x = (16 * Math.sin(t) ** 3) / 17;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17;
      push(clamp(x, -1.05, 1.05), clamp(y, -1.05, 1.05));
    }
  }

  return pts;
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, shape, finger, images) {
  ctx.clearRect(0, 0, w, h);
  if (!shape) return;

  const side = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = RADIUS * side;

  for (let i = 0; i < shape.dots.length; i += 1) {
    const d = shape.dots[i];
    const x = cx + d.x * r;
    const y = cy + d.y * r;
    ctx.beginPath();
    if (d.marked) {
      // Marcado: bolota verde maior com contorno de tinta — salta na caixa creme.
      ctx.arc(x, y, 6.5, 0, TAU);
      ctx.fillStyle = DOT_ON;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else {
      ctx.arc(x, y, 4.5, 0, TAU);
      ctx.fillStyle = DOT_OFF;
      ctx.fill();
    }
  }

  // Pincel segue o dedo enquanto arrasta. Sem PNG ainda: pinga uma bolinha.
  if (finger?.down) {
    if (!drawImageCentered(ctx, images?.pincel, finger.x, finger.y, 44)) {
      ctx.beginPath();
      ctx.arc(finger.x, finger.y, 7, 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
    }
  }
}
