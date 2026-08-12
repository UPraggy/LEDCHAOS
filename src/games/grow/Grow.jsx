import { useCallback, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { paintJoystick, useJoystick } from '../_shared/joystick.js';
import { mapPerformance } from '../../engine/botProfile.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import {
  prefersReducedMotion,
  readCssColors,
  useCanvasSize,
  useGameClock,
  useOutcome,
  useRaf,
} from '../_shared/hooks.js';
import '../_shared/game.css';
import './Grow.css';

/** Raio inicial em unidades de arena. Também é o 100% do placar. */
const R0_BASE = 0.045;
/** Unidades de arena por segundo no tamanho inicial. */
const BASE_SPEED = 1.15;
/** Quanto o tamanho pesa na velocidade. 0 = crescer é grátis; 1 = paralisa. */
const DRAG_EXP = 0.55;

const ORB_COUNT = 7;
const ORB_R = 0.028;
const GOLD_R = 0.038;
const ORB_LIFE = 5.5;
const GOLD_LIFE = 3.2;
/** Janela final em que a esfera encolhe antes de sumir. */
const ORB_FADE = 1.1;
const GOLD_CHANCE = 0.18;
const GOLD_VALUE = 2.5;
/** Área ganha por esfera comum, em frações da área inicial. */
const GAIN = 0.22;

const POP_LIFE = 0.45;
/** Folga mínima entre o jogador e uma esfera que nasce. */
const CLEAR = 0.16;

/**
 * Teto do passo de simulação, em segundos.
 *
 * A 1,15 unidade por segundo, um quadro de 50ms sob ACELERADO (1,5×) desloca
 * 0,086 — mais que a soma do raio do corpo com o da esfera. Testar sobreposição
 * uma vez por quadro deixaria atravessar o alvo justamente na rodada mais
 * rápida. Fatiar o quadro resolve sem espalhar teste de trajeto pelo código.
 */
const MAX_STEP = 0.016;

const TOKENS = [
  '--game-accent',
  '--game-accent-soft',
  '--game-accent-deep',
  '--color-warning',
  '--color-surface',
  '--color-surface-2',
  '--color-bg-deep',
  '--color-text',
];

/**
 * CRESCER — colete, cresça, fique lento.
 *
 * O laço inteiro cabe numa frase e se explica sem tutorial: encoste nas esferas
 * e você aumenta. O que faz disso um jogo é a segunda metade, que ninguém
 * precisa ler para descobrir — quanto maior, mais devagar. Crescer é o placar e
 * é a punição ao mesmo tempo, então a partida se equilibra sozinha: quem está
 * ganhando anda pior, e quem está atrás alcança.
 *
 * NÃO é comer os outros. Sem devorar rival e sem dividir a bolha, some a única
 * regra que precisaria de explicação, e o resultado deixa de depender de a IA
 * adversária jogar bem ou mal. Aqui a mão do jogador é a única variável.
 *
 * As esferas de OURO valem 2,5×, vivem menos e nascem longe: é a decisão da
 * rodada — o seguro perto ou o caro do outro lado da arena.
 */
// `bus` chega nas props e é ignorado de propósito: entrada contínua não vira
// evento. Na Fase 2 o anfitrião AMOSTRA o vetor do analógico no tique da
// simulação; mandar cada `pointermove` pela rede seria inundar o canal para
// reconstruir do outro lado exatamente o mesmo número. Ver _shared/joystick.js.
export default function Grow({
  players, localPlayerId, duration, effects, rng, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const invert = !!effects?.invert;
  const hidden = !!effects?.hidden;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const colorsRef = useRef(null);
  const worldRef = useRef(null);
  const overRef = useRef(false);
  const growRef = useRef(100);
  const shownRef = useRef(-1);
  const touchedRef = useRef(false);
  const reduceRef = useRef(prefersReducedMotion());

  const [percent, setPercent] = useState(100);
  const [golds, setGolds] = useState(0);
  const [touched, setTouched] = useState(false);
  const [outcome, end] = useOutcome(onFinish);

  /** Raio inicial já com o efeito do CHAOS. Constante durante a rodada. */
  const r0 = R0_BASE * sizeScale;

  // O analógico nasce onde o dedo encostar, em qualquer ponto da arena. Ver
  // _shared/joystick.js: é ele que mantém a mão fora de cima da bolha.
  const stick = useJoystick(canvasRef, { active: !outcome });

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const value = Math.round(mapPerformance(perf, 130, 330));
    return { score: value, display: `${value}%` };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const total = growRef.current;
    const world = worldRef.current;
    const taken = world?.taken ?? 0;
    const gold = world?.golds ?? 0;
    sound?.play?.(total >= 260 ? 'perfect' : 'score');

    end({
      entries: [
        { playerId: localPlayerId, score: total, display: `${total}%` },
        ...rivalFinals,
      ],
      value: `${total}%`,
      label: 'TAMANHO',
      tone: total >= 260 ? 'good' : total >= 180 ? 'neutral' : 'bad',
      note: gold > 0
        ? `${taken} esferas, ${gold} de ouro.`
        : `${taken} esferas, nenhuma de ouro.`,
    });
  }, [end, localPlayerId, rivalFinals, sound]);

  const { remaining, elapsed } = useGameClock(duration, closeRound, !outcome);

  /* ------------------------------------------------------------- simulação */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    if (!colorsRef.current) colorsRef.current = readCssColors(canvas, TOKENS);
    const colors = colorsRef.current;

    // A arena é medida em unidades de `u`, não em pixels: assim o círculo é
    // redondo, a velocidade é igual nos dois eixos e girar o aparelho ou a
    // barra do navegador subir não muda a dificuldade.
    const u = Math.min(w, h);
    const aw = w / u;
    const ah = h / u;

    if (!worldRef.current) worldRef.current = newWorld(rng, aw, ah, r0);
    const world = worldRef.current;

    // timeScale escala a SIMULAÇÃO, nunca o relógio da rodada.
    const simDt = outcome ? 0 : dt * timeScale;

    if (simDt > 0) {
      const s = stick.current;
      if (s.on && !touchedRef.current) {
        touchedRef.current = true;
        setTouched(true);
      }

      // INVERTIDO é um sinal trocado. O anel continua nascendo sob o dedo — o
      // que quebra é a direção, não a referência.
      const sign = invert ? -1 : 1;
      const vx = s.dx * sign;
      const vy = s.dy * sign;

      let left = simDt;
      while (left > 0) {
        const slice = Math.min(left, MAX_STEP);
        step(world, slice, rng, vx, vy, aw, ah, r0, sound, reduceRef.current);
        left -= slice;
      }

      // Um setState por esfera coletada (~25 na rodada), nunca um por quadro.
      const shown = Math.round(Math.sqrt(world.size) * 100);
      growRef.current = shown;
      if (shown !== shownRef.current) {
        shownRef.current = shown;
        setPercent(shown);
        setGolds(world.golds);
      }
    }

    paint(ctx, w, h, u, world, colors, r0);
    if (!outcome) paintJoystick(ctx, stick.current, colors);
  }, true);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, elapsed / duration);
  const ceiling = Math.max(percent, ...rivalFinals.map((entry) => entry.score), 200);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score, ratio, index * 1.1),
    };
  });

  const showHint = !touched && !outcome && elapsed < 3000;

  return (
    <div className="gscene gr">
      <GameHeader
        title="CRESCER"
        instruction={invert ? 'CONTROLE INVERTIDO.' : 'Colete as esferas. Ouro vale mais.'}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="TAMANHO" value={`${percent}%`} tone="accent" pulseKey={percent} />
        <ScoreBadge label="OURO" value={golds} tone={golds > 0 ? 'good' : 'neutral'} size="sm" />
      </GameHeader>

      <div className="gscene__stage">
        <canvas ref={canvasRef} className="gcanvas" />
        <RivalBars rivals={rivals} max={ceiling} />
        {hidden ? <div className="gveil" /> : null}

        {/* Fica embaixo de propósito: é onde o polegar já está, e é onde o
            analógico deve nascer para não tapar a arena. */}
        {showHint ? (
          <div className="gr__hint" aria-hidden="true">
            <span className="gr__hint-ring" />
            <span className="gr__hint-text">ARRASTE EM QUALQUER LUGAR</span>
          </div>
        ) : null}

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

/**
 * O mundo guarda `size` — a ÁREA em múltiplos da área inicial — e não o raio.
 *
 * É o que faz cada esfera valer visivelmente menos que a anterior sem nenhuma
 * regra extra: dobrar a área aumenta o raio em só 41%. O crescimento desacelera
 * sozinho, como acontece com qualquer coisa que cresce por acumulação.
 */
function newWorld(rng, aw, ah, r0) {
  const world = {
    x: aw / 2,
    y: ah / 2,
    size: 1,
    pulse: 0,
    taken: 0,
    golds: 0,
    orbs: new Array(ORB_COUNT).fill(null),
    pops: [],
  };
  for (let i = 0; i < ORB_COUNT; i += 1) resetOrb(world, i, rng, aw, ah, r0);
  return world;
}

function step(world, dt, rng, vx, vy, aw, ah, r0, sound, reduced) {
  let r = r0 * Math.sqrt(world.size);
  // Maior é mais lento. É a punição por estar ganhando, e é ela que mantém a
  // rodada em disputa até o fim.
  const speed = BASE_SPEED * Math.pow(Math.sqrt(world.size), -DRAG_EXP);

  world.pulse = Math.max(0, world.pulse - dt * 3);
  world.x += vx * speed * dt;
  world.y += vy * speed * dt;
  world.x = Math.max(r, Math.min(aw - r, world.x));
  world.y = Math.max(r, Math.min(ah - r, world.y));

  for (let i = 0; i < ORB_COUNT; i += 1) {
    const orb = world.orbs[i];
    orb.life -= dt;
    if (orb.life <= 0) {
      resetOrb(world, i, rng, aw, ah, r);
      continue;
    }

    if (Math.hypot(orb.x - world.x, orb.y - world.y) > r + orbRadius(orb)) continue;

    world.size += GAIN * (orb.gold ? GOLD_VALUE : 1);
    world.taken += 1;
    if (orb.gold) world.golds += 1;
    if (!reduced) world.pulse = 1;
    world.pops.push({ x: orb.x, y: orb.y, t: 0, gold: orb.gold });
    sound?.play?.(orb.gold ? 'perfect' : 'hit');

    // O raio mudou agora: a próxima esfera do mesmo quadro tem que ser testada
    // contra o corpo novo, não contra o do começo do quadro.
    r = r0 * Math.sqrt(world.size);
    resetOrb(world, i, rng, aw, ah, r);
  }

  for (let i = world.pops.length - 1; i >= 0; i -= 1) {
    world.pops[i].t += dt;
    if (world.pops[i].t > POP_LIFE) world.pops.splice(i, 1);
  }
}

/**
 * Sorteia uma posição nova para a esfera do índice dado.
 *
 * Nunca cola no jogador: ponto de graça tira a decisão de para onde ir, que é o
 * único verbo que este jogo tem. Também evita empilhar em cima de outra esfera,
 * senão duas viram uma só e a arena parece mais vazia do que está.
 */
function resetOrb(world, index, rng, aw, ah, playerR) {
  const gold = rng.chance(GOLD_CHANCE);
  const r = gold ? GOLD_R : ORB_R;
  const margin = r + 0.02;
  const clear = playerR + CLEAR;
  let x = aw / 2;
  let y = ah / 2;

  // Doze tentativas e segue o jogo. Insistir até achar o lugar perfeito
  // travaria o quadro numa arena cheia; a última tentativa é boa o bastante.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    x = rng.range(margin, aw - margin);
    y = rng.range(margin, ah - margin);
    if (Math.hypot(x - world.x, y - world.y) < clear) continue;

    let clash = false;
    for (let i = 0; i < ORB_COUNT; i += 1) {
      const other = world.orbs[i];
      if (i === index || !other) continue;
      if (Math.hypot(x - other.x, y - other.y) < r + other.r + 0.03) {
        clash = true;
        break;
      }
    }
    if (!clash) break;
  }

  world.orbs[index] = { x, y, r, gold, life: gold ? GOLD_LIFE : ORB_LIFE };
}

/**
 * Raio efetivo da esfera.
 *
 * No fim da vida ela encolhe — e encolhe de verdade: o mesmo raio serve para o
 * desenho e para a colisão. Diminuir só na pintura seria mentir sobre o alvo,
 * e o jogador culparia o toque, não o relógio.
 */
function orbRadius(orb) {
  const fade = Math.min(1, orb.life / ORB_FADE);
  return orb.r * (0.45 + 0.55 * fade);
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, u, world, colors, r0) {
  ctx.fillStyle = colors['--color-bg-deep'];
  ctx.fillRect(0, 0, w, h);

  drawGrid(ctx, w, h, u, colors);
  drawWalls(ctx, w, h, colors);

  for (let i = 0; i < ORB_COUNT; i += 1) {
    const orb = world.orbs[i];
    if (orb) drawOrb(ctx, orb, u, colors);
  }

  for (let i = 0; i < world.pops.length; i += 1) drawPop(ctx, world.pops[i], u, colors);

  drawBlob(ctx, world, u, r0, colors);
}

/**
 * Malha de fundo.
 *
 * A arena é fixa, sem câmera: sem nenhuma referência atrás, um círculo se
 * movendo num fundo liso parece parado. A malha é o que transforma
 * deslocamento em sensação de deslocamento.
 */
function drawGrid(ctx, w, h, u, colors) {
  const gap = u * 0.16;
  ctx.strokeStyle = colors['--color-surface'];
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = gap; x < w; x += gap) {
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, h);
  }
  for (let y = gap; y < h; y += gap) {
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(w, Math.round(y) + 0.5);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A borda existe para o jogador saber onde acaba a arena antes de bater nela. */
function drawWalls(ctx, w, h, colors) {
  ctx.strokeStyle = colors['--color-surface-2'];
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}

/**
 * Esfera comum e esfera de ouro.
 *
 * A de ouro é dourada, é maior E tem uma estrela dentro. Três canais dizendo a
 * mesma coisa, porque quem não separa dourado de verde-claro precisa ler a
 * diferença pela forma e pelo tamanho.
 */
function drawOrb(ctx, orb, u, colors) {
  const r = orbRadius(orb) * u;
  const cx = orb.x * u;
  const cy = orb.y * u;

  ctx.fillStyle = orb.gold ? colors['--color-warning'] : colors['--game-accent-soft'];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  if (!orb.gold) {
    // Um brilho fora do centro dá volume sem custar nada — a esfera lê como
    // objeto, e não como mancha de tinta.
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = colors['--color-text'];
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.32, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  ctx.strokeStyle = colors['--color-bg-deep'];
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI / 2) * i;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r * 0.72, cy + Math.sin(angle) * r * 0.72);
  }
  ctx.stroke();
}

/** Anel que abre e some no lugar da esfera coletada. É o "peguei". */
function drawPop(ctx, pop, u, colors) {
  const k = pop.t / POP_LIFE;
  ctx.globalAlpha = (1 - k) * 0.8;
  ctx.strokeStyle = pop.gold ? colors['--color-warning'] : colors['--game-accent'];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(pop.x * u, pop.y * u, (0.03 + k * 0.06) * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A bolha do jogador: cresce, pulsa ao comer, e mantém o anel sempre visível. */
function drawBlob(ctx, world, u, r0, colors) {
  const base = r0 * Math.sqrt(world.size) * u;
  const r = base * (1 + world.pulse * 0.09);
  const cx = world.x * u;
  const cy = world.y * u;

  ctx.fillStyle = colors['--game-accent-deep'];
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = colors['--game-accent'];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = colors['--color-text'];
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.globalAlpha = 0.5;
  ctx.fillStyle = colors['--color-text'];
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, cy - r * 0.34, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
