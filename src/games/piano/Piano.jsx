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
import './Piano.css';

const COLS = 4;
const TILE_H = 22; // % da altura
const SPAWN_GAP = 24; // % entre topos (§3.7: "última percorreu 24%")
const CAP_SPEED = 96; // teto de velocidade (%/s)
const SPEED_STEP = 0.9; // ganho por acerto
const SLOW_MS = 3200; // duração da câmera lenta da GEMA
const SLOW_FACTOR = 0.45;

/* Cores literais das peças sobre a caixa creme (§3.7). */
const KIND_FILL = { normal: '#170F3E', ouro: '#FFCE31', gema: '#4DE3E3', bomba: '#FF5C4D' };
const KIND_POINTS = { normal: 10, ouro: 30, gema: 10, bomba: -25 };
const INK = '#170F3E';
const DIV = '#E4DDF6';

const IMG_SRC = {
  moeda: '/assets/recompensas/moeda.png',
  gema: '/assets/recompensas/gema.png',
  bomba: '/assets/jogo/bomba.png',
};
const KIND_IMG = { ouro: 'moeda', gema: 'gema', bomba: 'bomba' };

/**
 * PIANO TILE — toque nas peças que descem antes que escapem por baixo.
 *
 * Quatro colunas creme; a coluna inteira é tocável. Peças normais (escuras)
 * valem +10, OURO +30, GEMA +10 com câmera-lenta, BOMBA −25 e tranco. Tocar
 * coluna vazia custa −5; deixar peça normal cair também é erro. A velocidade
 * sobe a cada acerto — é a dificuldade escalando sozinha.
 */
export default function Piano({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const hidden = !!effects?.hidden;

  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const imagesRef = useRef(null);
  const worldRef = useRef(null);
  const overRef = useRef(false);
  const ptsRef = useRef(0);
  const hitsRef = useRef(0);
  const missRef = useRef(0);
  const floatsRef = useRef([]);

  const [pts, setPts] = useState(0);
  const [shake, setShake] = useState(false);
  const [outcome, end] = useOutcome(onFinish);
  const shakeTimer = useRef(0);

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    // §3.11: pts=round(perf*560) → score=pts*5.
    const p = Math.round(perf * 560);
    return { score: p * 5, display: `${p} pts` };
  }));

  /* ------------------------------------------------------------- fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const total = hitsRef.current + missRef.current;
    const accuracy = total ? hitsRef.current / total : 0;
    const score = Math.max(0, ptsRef.current) * 5;

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
      tone: ptsRef.current >= 260 ? 'good' : ptsRef.current >= 120 ? 'neutral' : 'bad',
      note: `${hitsRef.current} acerto${hitsRef.current === 1 ? '' : 's'} · ${Math.round(accuracy * 100)}% de precisão.`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ---------------------------------------------------------------- efeitos */

  const pushFloat = useCallback((x, y, text, good) => {
    floatsRef.current.push({ x, y, text, good, born: performance.now() });
  }, []);

  const bump = useCallback((delta) => {
    ptsRef.current += delta;
    setPts(Math.max(0, ptsRef.current));
  }, []);

  const doShake = useCallback(() => {
    setShake(true);
    clearTimeout(shakeTimer.current);
    shakeTimer.current = window.setTimeout(() => setShake(false), 320);
  }, []);

  useEffect(() => () => clearTimeout(shakeTimer.current), []);

  /* ------------------------------------------------------------------ toque */

  const tap = useCallback((px, py) => {
    const world = worldRef.current;
    const { w, h } = sizeRef.current;
    if (!world || overRef.current || w < 2) return;

    const col = Math.min(COLS - 1, Math.max(0, Math.floor((px / w) * COLS)));

    // Pega a peça mais baixa (maior y) ainda ativa naquela coluna.
    let target = null;
    for (let i = 0; i < world.tiles.length; i += 1) {
      const t = world.tiles[i];
      if (t.col !== col || t.hit) continue;
      if (!target || t.y > target.y) target = t;
    }

    if (!target) {
      // Coluna vazia: penaliza (§3.7).
      bump(-5);
      missRef.current += 1;
      sound?.play?.('miss');
      pushFloat(px, py, '−5', false);
      return;
    }

    target.hit = true;
    const delta = KIND_POINTS[target.kind];
    bump(delta);

    if (target.kind === 'bomba') {
      missRef.current += 1;
      doShake();
      sound?.play?.('miss');
      pushFloat(target.cx, target.cy, '−25', false);
    } else {
      hitsRef.current += 1;
      world.speed = Math.min(CAP_SPEED, world.speed + SPEED_STEP);
      if (target.kind === 'gema') world.slowUntil = performance.now() + SLOW_MS;
      sound?.play?.(target.kind === 'ouro' ? 'perfect' : 'hit');
      pushFloat(target.cx, target.cy, `+${delta}`, true);
    }
  }, [bump, doShake, pushFloat, sizeRef, sound]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || outcome) return undefined;
    return attachPointer(el, {
      onDown: (p) => tap(p.x, p.y),
    }, { bus, playerId: localPlayerId, tapMaxMs: 400 });
  }, [bus, localPlayerId, outcome, tap]);

  /* ------------------------------------------------------------------ mundo */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    if (!imagesRef.current) imagesRef.current = preloadImages(IMG_SRC);
    if (!worldRef.current) {
      worldRef.current = { tiles: [], speed: 40 * timeScale, slowUntil: 0, lastCol: -1 };
    }
    const world = worldRef.current;
    const now = performance.now();
    const simDt = outcome ? 0 : dt;

    // Velocidade efetiva (com câmera-lenta da gema).
    const slow = now < world.slowUntil ? SLOW_FACTOR : 1;
    const step = world.speed * slow * simDt;

    // Move e resolve peças que escaparam por baixo.
    if (!outcome) {
      for (let i = world.tiles.length - 1; i >= 0; i -= 1) {
        const t = world.tiles[i];
        t.y += step;
        if (t.hit) {
          t.fade = (t.fade ?? 1) - simDt * 6;
          if (t.fade <= 0) world.tiles.splice(i, 1);
        } else if (t.y > 100) {
          // Peça não-bomba que passa é erro; bomba que passa não é (§3.7).
          if (t.kind !== 'bomba') missRef.current += 1;
          world.tiles.splice(i, 1);
        }
      }

      // Spawn: quando não há peças ou a mais recente (menor y) já desceu o gap.
      let topY = Infinity;
      for (let i = 0; i < world.tiles.length; i += 1) {
        if (world.tiles[i].y < topY) topY = world.tiles[i].y;
      }
      if (world.tiles.length === 0 || topY >= (SPAWN_GAP - TILE_H)) {
        spawn(world, rng);
      }
    }

    paint(ctx, w, h, world, imagesRef.current, floatsRef.current, now);
  }, true);

  /* ----------------------------------------------------------------- render */

  const ratio = Math.min(1, Math.max(0, 1 - remaining / duration));
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score / 5, ratio, index * 9),
    };
  });
  const ceiling = Math.max(pts, ...rivals.map((r) => r.value), 200);

  return (
    <div className="gscene pn">
      <GameHeader
        title="PIANO"
        instruction="Toque nas peças escuras. Fuja das bombas."
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="PONTOS" value={pts} tone="good" pulseKey={pts} />
      </GameHeader>

      <div className="gscene__stage">
        <RivalBars rivals={rivals} max={ceiling} />

        <div className={`pn__box${shake ? ' is-shake' : ''}`} ref={boxRef}>
          <canvas ref={canvasRef} className="pn__canvas" />
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
/* mundo                                                                      */
/* ========================================================================= */

/** Sorteia o tipo da peça segundo os pesos do §3.7. */
function pickKind(rng) {
  const r = rng();
  if (r < 0.08) return 'ouro';
  if (r < 0.15) return 'gema';
  if (r < 0.24) return 'bomba';
  return 'normal';
}

/** Cria uma peça acima do topo, numa coluna diferente da última. */
function spawn(world, rng) {
  let col = rng.int(0, COLS - 1);
  if (col === world.lastCol) col = (col + 1) % COLS;
  world.lastCol = col;
  world.tiles.push({ col, y: -TILE_H, kind: pickKind(rng), hit: false, cx: 0, cy: 0 });
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function paint(ctx, w, h, world, images, floats, now) {
  // Fundo creme + divisórias de coluna.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, w, h);
  const colW = w / COLS;
  ctx.strokeStyle = DIV;
  ctx.lineWidth = 3;
  for (let c = 1; c < COLS; c += 1) {
    ctx.beginPath();
    ctx.moveTo(c * colW, 0);
    ctx.lineTo(c * colW, h);
    ctx.stroke();
  }
  if (!world) return;

  const tileH = (TILE_H / 100) * h;
  const inset = 5;

  for (let i = 0; i < world.tiles.length; i += 1) {
    const t = world.tiles[i];
    const x = t.col * colW + inset;
    const y = (t.y / 100) * h;
    const tw = colW - inset * 2;
    t.cx = x + tw / 2;
    t.cy = y + tileH / 2;

    ctx.save();
    ctx.globalAlpha = t.hit ? Math.max(0, t.fade ?? 1) : 1;

    roundRect(ctx, x, y, tw, tileH, 14);
    ctx.fillStyle = KIND_FILL[t.kind];
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Ícone das peças especiais.
    const imgKey = KIND_IMG[t.kind];
    if (imgKey && images?.[imgKey]) {
      drawImageCentered(ctx, images[imgKey], t.cx, t.cy, Math.min(tw, tileH) * 0.66);
    }
    ctx.restore();
  }

  drawFloats(ctx, floats, now);
}

function drawFloats(ctx, floats, now) {
  for (let i = floats.length - 1; i >= 0; i -= 1) {
    const f = floats[i];
    const t = (now - f.born) / 640;
    if (t >= 1) { floats.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.font = '800 24px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#170a3a';
    ctx.strokeText(f.text, f.x, f.y - t * 36);
    ctx.fillStyle = f.good ? '#7BE86A' : '#FF5C4D';
    ctx.fillText(f.text, f.x, f.y - t * 36);
    ctx.restore();
  }
}
