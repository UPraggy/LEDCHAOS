import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { attachPointer } from '../../engine/inputManager.js';
import { mapPerformance } from '../../engine/botProfile.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { drawImageCentered, preloadImages } from '../_shared/assets.js';
import {
  prefersReducedMotion,
  readCssColors,
  useCanvasSize,
  useGameClock,
  useOutcome,
  useRaf,
} from '../_shared/hooks.js';
import '../_shared/game.css';
import './Slice.css';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/**
 * FATIAR — frutas e bombas sobem, você corta arrastando o dedo.
 *
 * Agora com FRUTA de verdade: cada objeto bom é um adesivo de fruta da pasta de
 * assets (melancia, maçã, laranja, banana, abacaxi, morango, uva, cereja, limão,
 * maçã-dourada); a bomba é o único perigo. A leitura de perigo continua
 * redundante — a bomba tem silhueta e cor próprias e desconta forte —, mas o
 * visual deixou de ser geometria e passou a ser o pomar adesivo do protótipo.
 *
 * O mundo roda em PORCENTAGEM da tela, não em pixels:
 *   x ∈ [0,100]   (0 = borda esquerda, 100 = direita)
 *   y ∈ [0,128]   (0 = topo, 100 = base do stage, >100 = já saiu por baixo)
 * Isso é o que conserta o bug de "objeto saindo do bloco": a velocidade lateral
 * é uma fração pequena da distância até o centro (50), então tudo tende a voltar
 * para o meio em vez de escapar pela lateral. E como a física é resolução-
 * independente, o mesmo lançamento se comporta igual em qualquer celular.
 *
 * timeScale (efeito CHAOS) não mexe no relógio da rodada: ele entra nas
 * constantes de física. A gravidade escala linear e a velocidade inicial pela
 * raiz — assim o ápice do arremesso não muda (a fruta não voa para fora do topo
 * no modo rápido), só o tempo de subida e descida encurta.
 */

/** Frutas boas (+10). Silhuetas distintas para não depender só de cor —
 *  cada uma é um adesivo próprio da pasta icones-todos. */
const FRUITS = [
  'melancia', 'maca', 'laranja', 'banana', 'abacaxi',
  'morango', 'uva', 'cereja', 'limao', 'maca-ouro',
];

const IMG_SRC = {
  melancia: '/assets/jogo/melancia.png',
  maca: '/assets/jogo/maca.png',
  laranja: '/assets/jogo/laranja.png',
  banana: '/assets/jogo/banana.png',
  abacaxi: '/assets/jogo/abacaxi.png',
  morango: '/assets/jogo/morango.png',
  uva: '/assets/jogo/uva.png',
  cereja: '/assets/jogo/cereja.png',
  limao: '/assets/jogo/limao.png',
  'maca-ouro': '/assets/jogo/maca-ouro.png',
  bomba: '/assets/jogo/bomba.png',
  ring: '/assets/efeitos/anel-fogo.png',
  boom: '/assets/efeitos/explosao.png',
  splat: '/assets/efeitos/splat.png',
  splash: '/assets/efeitos/splash.png',
  halo: '/assets/efeitos/halo.png',
};

/** Que respingo cada fruta joga ao ser cortada: polpa (splat) x suco (splash).
 *  Cítricas soltam água; o resto solta polpa. O que não estiver aqui cai no
 *  'splat' padrão (ver `GOO[kind] || 'splat'`). */
const GOO = {
  laranja: 'splash',
  limao: 'splash',
  uva: 'splash',
};

/** Pontos por corte. Bomba tira 30 e zera o combo. */
const FRUIT_POINTS = 10;
const BOMB_POINTS = -30;

/** Tolerância do corte, em % da largura (x) e da altura (y). Caixa generosa:
 *  perdoa dedo grosso em tela pequena sem virar "passei perto e cortou". */
const CUT_X = 11;
const CUT_Y = 9;

/** Tokens que o canvas precisa ler (canvas não entende var()). */
const TOKENS = [
  '--game-accent',
  '--game-accent-soft',
  '--color-danger',
  '--color-warning',
  '--color-bg-deep',
  '--color-text',
  '--font-mono',
  '--font-display',
];

export default function Slice({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const oneLife = !!effects?.oneLife;
  const hidden = !!effects?.hidden;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const colorsRef = useRef(null);
  const imagesRef = useRef(null);
  if (!imagesRef.current) imagesRef.current = preloadImages(IMG_SRC);

  const worldRef = useRef(newWorld());
  const lastPointRef = useRef(null);
  const overRef = useRef(false);

  const scoreRef = useRef(0);
  const slicedRef = useRef(0);
  const bombRef = useRef(0);
  const comboRef = useRef(0);
  const bestComboRef = useRef(0);
  const reduceRef = useRef(prefersReducedMotion());

  const [score, setScore] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  // Adversários já têm o total decidido no começo da rodada; as barras ao vivo
  // só distribuem esse número no tempo. Bot: pts ≈ perf*320, score = pts*6.
  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const pts = Math.max(0, Math.round(mapPerformance(perf, 0, 320)));
    return { pts, score: pts * 6, display: `${pts} pts` };
  }));

  /* ------------------------------------------------------------- fechamento */

  const closeRound = useCallback(({ blownUp = false } = {}) => {
    if (overRef.current) return;
    overRef.current = true;
    const pontos = scoreRef.current;

    end({
      entries: [
        { playerId: localPlayerId, score: pontos * 6, display: `${pontos} pts` },
        ...rivalFinals.map((r) => ({ playerId: r.playerId, score: r.score, display: r.display })),
      ],
      value: `${pontos}`,
      label: blownUp ? 'BOMBA!' : 'SUA PONTUAÇÃO',
      tone: blownUp ? 'bad' : pontos > 0 ? 'good' : 'neutral',
      note: blownUp
        ? 'Uma bomba e acabou.'
        : `${slicedRef.current} cortes · combo máx x${bestComboRef.current}`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining, elapsed } = useGameClock(duration, closeRound, !outcome);

  /* --------------------------------------------------------------- pontuação */

  const award = useCallback((object) => {
    const world = worldRef.current;

    if (object.kind === 'bomb') {
      scoreRef.current = Math.max(0, scoreRef.current + BOMB_POINTS);
      bombRef.current += 1;
      comboRef.current = 0;
      setScore(scoreRef.current);
      sound?.play?.('miss');

      // explosão + tremor
      world.bursts.push({ x: object.x, y: object.y, img: 'boom', size: 96, life: 0.42, max: 0.42 });
      world.pops.push(makePop(object.x, object.y, `${BOMB_POINTS}`, 'bad'));
      if (!reduceRef.current) world.shake = 1;
      return;
    }

    scoreRef.current += FRUIT_POINTS;
    slicedRef.current += 1;
    comboRef.current += 1;
    if (comboRef.current > bestComboRef.current) bestComboRef.current = comboRef.current;
    setScore(scoreRef.current);
    sound?.play?.(comboRef.current >= 3 ? 'perfect' : 'hit');

    // Corte em sequência (combo ≥3) ganha um halo dourado grande, atrás de tudo:
    // é o prêmio visual de manter a corrente sem encostar em bomba.
    if (comboRef.current >= 3) {
      world.bursts.push({ x: object.x, y: object.y, img: 'halo', size: 132, life: 0.55, max: 0.55 });
    }
    // respingo atrás do anel: a polpa/água voa antes do halo de corte.
    world.bursts.push({ x: object.x, y: object.y, img: GOO[object.kind] || 'splat', size: 92, life: 0.5, max: 0.5 });
    world.bursts.push({ x: object.x, y: object.y, img: 'ring', size: 76, life: 0.42, max: 0.42 });
    world.pops.push(makePop(object.x, object.y, `+${FRUIT_POINTS}`, 'good'));
    if (comboRef.current >= 3) {
      world.combo = { text: `COMBO x${comboRef.current}`, life: 0.7, max: 0.7 };
    }
  }, [sound]);

  /* ------------------------------------------------------------------ corte */

  // Testa a caixa de corte ao longo do segmento (ponto anterior → atual), em %.
  // Amostrar o segmento é o que faz um arrasto rápido pegar vários de uma vez —
  // sem isso, entre dois frames o dedo "pula" por cima da fruta e não corta.
  const cut = useCallback((ax, ay, bx, by) => {
    const world = worldRef.current;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.min(20, Math.ceil(len / 2.5)));

    for (let i = 0; i < world.objects.length; i += 1) {
      const object = world.objects[i];
      if (!object.alive) continue;

      let cutIt = false;
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const px = ax + dx * t;
        const py = ay + dy * t;
        if (Math.abs(object.x - px) < CUT_X && Math.abs(object.y - py) < CUT_Y) {
          cutIt = true;
          break;
        }
      }
      if (!cutIt) continue;

      object.alive = false;
      award(object);
      if (object.kind === 'bomb' && oneLife) {
        closeRound({ blownUp: true });
        return;
      }
    }
  }, [award, closeRound, oneLife]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || outcome) return undefined;

    // O ponteiro já vem normalizado (nx,ny ∈ 0..1); o mundo é %, então basta
    // ×100. Guardar o trail em % faz o desenho não depender do tamanho atual.
    const toWorld = (point) => ({ x: point.nx * 100, y: point.ny * 100 });

    return attachPointer(canvas, {
      onDown: (point) => {
        const p = toWorld(point);
        lastPointRef.current = p;
        worldRef.current.trail = [p];
      },
      onMove: (point) => {
        const p = toWorld(point);
        const previous = lastPointRef.current;
        const trail = worldRef.current.trail;
        trail.push(p);
        if (trail.length > 9) trail.shift();
        if (previous) cut(previous.x, previous.y, p.x, p.y);
        lastPointRef.current = p;
      },
      onUp: () => { lastPointRef.current = null; comboRef.current = 0; },
      onCancel: () => { lastPointRef.current = null; comboRef.current = 0; },
    }, { bus, playerId: localPlayerId });
  }, [cut, bus, localPlayerId, outcome]);

  /* ------------------------------------------------------------- simulação */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    if (!colorsRef.current) colorsRef.current = readCssColors(canvas, TOKENS);
    const colors = colorsRef.current;
    const images = imagesRef.current;
    const world = worldRef.current;

    const simDt = outcome ? 0 : dt;
    const ratio = Math.min(1, elapsed / duration);

    // constantes carregam o timeScale (ver cabeçalho): gravidade linear, v0 raiz
    const gravity = 108 * timeScale;

    if (simDt > 0) {
      world.timer -= simDt;
      if (world.timer <= 0) {
        // Mais fruta no ar: a onda quase sempre traz 2, às vezes 3, e o intervalo
        // entre ondas encurtou. A tela fica cheia de coisa para cortar — que é a
        // graça — sem virar chuva impossível. A chance de bomba (no spawn) cai um
        // pouco para que a densidade extra pese em fruta, não em perigo.
        const wave = rng.chance(0.32) ? 3 : rng.chance(0.6) ? 2 : 1;
        for (let i = 0; i < wave; i += 1) spawn(world, rng, sizeScale, timeScale, w, h);
        world.timer = (520 / timeScale) / 1000;
      }

      for (let i = 0; i < world.objects.length; i += 1) {
        const object = world.objects[i];
        object.vy += gravity * simDt;
        object.x += object.vx * simDt;
        object.y += object.vy * simDt;
        object.rot += object.spin * simDt;
      }
      world.objects = world.objects.filter((o) => o.alive && o.y < 128);

      for (let i = 0; i < world.bursts.length; i += 1) world.bursts[i].life -= dt;
      world.bursts = world.bursts.filter((b) => b.life > 0);

      for (let i = 0; i < world.pops.length; i += 1) world.pops[i].life -= dt;
      world.pops = world.pops.filter((p) => p.life > 0);

      if (world.combo) {
        world.combo.life -= dt;
        if (world.combo.life <= 0) world.combo = null;
      }
    }

    world.shake = Math.max(0, world.shake - dt * 3.2);

    /* ---------------------------------------------------------------- pintar */

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (world.shake > 0) {
      const amount = world.shake * 9;
      ctx.translate((Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount);
    }

    const px = (x) => (x / 100) * w;
    const py = (y) => (y / 100) * h;

    // objetos
    for (let i = 0; i < world.objects.length; i += 1) {
      const o = world.objects[i];
      const img = images[o.kind === 'bomb' ? 'bomba' : o.kind];
      const painted = drawImageCentered(ctx, img, px(o.x), py(o.y), o.size, o.rot);
      if (!painted) drawFallback(ctx, o, px(o.x), py(o.y), colors);
    }

    // estouros (anel de fogo / explosão) — crescem e somem
    for (let i = 0; i < world.bursts.length; i += 1) {
      const b = world.bursts[i];
      const k = 1 - b.life / b.max;
      const size = b.size * (0.6 + k * 0.7);
      drawImageCentered(ctx, images[b.img], px(b.x), py(b.y), size, 0, 1 - k);
    }

    // rastro do dedo (creme, visível sobre o fundo escuro)
    drawTrail(ctx, world.trail, px, py);

    // números flutuantes
    for (let i = 0; i < world.pops.length; i += 1) drawPop(ctx, world.pops[i], px, py, colors);

    // selo de combo no centro-alto
    if (world.combo) drawCombo(ctx, world.combo, w, colors);

    ctx.restore();
  }, true);

  /* ----------------------------------------------------------------- render */

  const ratio = Math.min(1, elapsed / duration);
  const ceiling = Math.max(score, ...rivalFinals.map((r) => r.pts), 60);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((p) => p.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.pts, ratio, index * 1.7),
    };
  });

  return (
    <div className="gscene sl">
      <GameHeader
        title="FATIAR"
        instruction={oneLife ? 'UMA BOMBA E ACABOU.' : 'Arraste para cortar. Fuja das bombas.'}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="PONTOS" value={score} tone="good" pulseKey={score} />
      </GameHeader>

      <div className="gscene__stage">
        <canvas ref={canvasRef} className="gcanvas" />
        <RivalBars rivals={rivals} max={ceiling} />
        {hidden ? <div className="gveil" /> : null}

        <ul className="sl__key" aria-hidden="true">
          <li className="sl__key-item">
            <img className="sl__ico" src="/assets/jogo/melancia.png" alt="" />
            <span className="sl__val sl__val--good">+10</span>
          </li>
          <li className="sl__key-item">
            <img className="sl__ico" src="/assets/jogo/bomba.png" alt="" />
            <span className="sl__val sl__val--bad">−30</span>
          </li>
        </ul>

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

function newWorld() {
  return { objects: [], bursts: [], pops: [], trail: [], combo: null, timer: 0.4, shake: 0, seq: 0 };
}

/**
 * Lança um objeto do rodapé. Tudo em % da tela.
 *
 * vx puxa de leve para o centro (50): quanto mais na lateral nasce, mais forte
 * volta — é o que impede o objeto de escapar pela borda. vy sai negativo (sobe)
 * e escala pela raiz do timeScale para o ápice não mudar.
 */
function spawn(world, rng, sizeScale, timeScale, w, h) {
  const roll = rng();
  const kind = roll < 0.20 ? 'bomb' : rng.pick(FRUITS);

  const x = 14 + rng() * 72;
  const vx = (50 - x) * 0.22 + (rng() * 16 - 8);
  const vy = -(104 + rng() * 16) * Math.sqrt(timeScale);

  // tamanho de desenho em px; encolhe/cresce com o efeito sizeScale
  const shortSide = Math.min(w, h);
  const size = (shortSide * (0.16 + rng() * 0.04)) * sizeScale;

  world.seq += 1;
  world.objects.push({
    id: world.seq,
    kind,
    x,
    y: 112,
    vx,
    vy,
    size,
    rot: rng() * TAU,
    spin: rng.range(-110, 110) * DEG,
    alive: true,
  });
}

function makePop(x, y, text, tone) {
  return { x, y, text, tone, life: 0.7, max: 0.7 };
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

/** Enquanto o PNG não carregou (primeiros frames), uma bolinha da cor do jogo
 *  no lugar — nunca um buraco vazio. */
function drawFallback(ctx, object, cx, cy, colors) {
  const r = object.size * 0.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = object.kind === 'bomb' ? colors['--color-danger'] : colors['--game-accent'];
  ctx.fill();
}

/**
 * Rastro do dedo: até 9 bolinhas creme, a mais nova maior e mais opaca.
 * Creme (#FFFDF7) porque o stage é escuro — o tom de tinta (#170F3E) sumia no
 * fundo, que era exatamente o bug do "não vejo o corte".
 */
function drawTrail(ctx, trail, px, py) {
  if (!trail || trail.length === 0) return;
  ctx.fillStyle = '#FFFDF7';
  for (let i = 0; i < trail.length; i += 1) {
    ctx.globalAlpha = 0.12 + i * 0.09;
    ctx.beginPath();
    ctx.arc(px(trail[i].x), py(trail[i].y), 4 + i * 1.4, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Número que sobe onde o corte aconteceu. Mono, contorno de tinta grosso para
 *  ficar legível sobre qualquer coisa. */
function drawPop(ctx, pop, px, py, colors) {
  const t = 1 - pop.life / pop.max;
  const x = px(pop.x);
  const y = py(pop.y) - t * 46;
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  ctx.font = `800 22px ${colors['--font-mono'] || 'monospace'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = colors['--color-text'] || '#170F3E';
  ctx.strokeText(pop.text, x, y);
  ctx.fillStyle = pop.tone === 'bad' ? colors['--color-danger'] : '#FFFDF7';
  ctx.fillText(pop.text, x, y);
  ctx.globalAlpha = 1;
}

/** Selo "COMBO xN" no alto-centro quando o combo passa de 3. */
function drawCombo(ctx, combo, w, colors) {
  const t = 1 - combo.life / combo.max;
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  const size = 26 + (1 - Math.abs(0.5 - t) * 2) * 8;
  ctx.font = `800 ${size}px ${colors['--font-display'] || 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = colors['--color-text'] || '#170F3E';
  ctx.strokeText(combo.text, w / 2, 54);
  ctx.fillStyle = colors['--color-warning'] || '#FFCE31';
  ctx.fillText(combo.text, w / 2, 54);
  ctx.globalAlpha = 1;
}
