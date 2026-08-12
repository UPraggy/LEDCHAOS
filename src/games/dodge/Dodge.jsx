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
import './Dodge.css';

/** Raio do corpo em unidades de arena. Aqui é hitbox pura: não cresce. */
const BODY_R = 0.042;
/** Unidades de arena por segundo. */
const SPEED = 1.25;

const SHARD_COUNT = 3;
const SHARD_R = 0.026;
const SHARD_POINTS = 10;

const HAZ_R = 0.05;
const HAZ_START = 3;
const HAZ_MAX = 8;
/** Segundos entre uma mina nova e outra. */
const HAZ_RAMP = 4.5;
const HAZ_SLOW = 0.45;
const HAZ_FAST = 0.78;

const HIT_COST = 15;
/** Tempo sem controle depois da batida. */
const STUN = 0.6;
/** Invencibilidade depois da batida: sem isso, uma mina parada em cima drena. */
const SAFE = 1.2;

const POP_LIFE = 0.4;
/** Folga mínima entre o corpo e um cristal que nasce. */
const CLEAR = 0.22;

/**
 * Teto do passo de simulação, em segundos.
 *
 * Corpo e mina se movem, então o que importa é a velocidade RELATIVA: até 2,0
 * unidades por segundo, e 3,0 sob ACELERADO. Num quadro de 50ms isso é 0,15 —
 * bem mais que os 0,092 dos dois raios somados, e a mina passaria por dentro do
 * jogador sem encostar. Com dois corpos em movimento, fatiar o quadro é mais
 * simples e mais correto que testar o trajeto de cada um contra o do outro.
 */
const MAX_STEP = 0.016;

const TOKENS = [
  '--game-accent',
  '--game-accent-soft',
  '--game-accent-deep',
  '--color-success',
  '--color-danger',
  '--color-surface',
  '--color-surface-2',
  '--color-bg-deep',
  '--color-text',
];

/**
 * DESVIAR — o mesmo dedo faz as duas coisas.
 *
 * Só existe um verbo, mover, e ele serve para pegar e para fugir ao mesmo
 * tempo. É daí que vem a tensão: o cristal que vale ponto está sempre do lado
 * errado, e ir buscá-lo é a decisão de encostar num perigo que se move sozinho.
 *
 * A batida cobra PONTO e cobra TEMPO — o corpo trava por meio segundo. O ponto
 * é o placar; o tempo travado é o que dói de verdade, porque a arena continua
 * andando enquanto o jogador assiste.
 *
 * A invencibilidade depois da batida não é generosidade: sem ela uma mina
 * parada em cima do corpo atordoado cobraria a mesma dívida cinco vezes, e a
 * rodada acabaria por acidente em vez de por decisão.
 */
export default function Dodge({
  players, localPlayerId, duration, effects, rng, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const invert = !!effects?.invert;
  const hidden = !!effects?.hidden;
  const oneLife = !!effects?.oneLife;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const colorsRef = useRef(null);
  const worldRef = useRef(null);
  const overRef = useRef(false);
  const scoreRef = useRef(0);
  const shownRef = useRef(-1);
  const touchedRef = useRef(false);
  const reduceRef = useRef(prefersReducedMotion());
  const deadRef = useRef(false);

  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [touched, setTouched] = useState(false);
  const [outcome, end] = useOutcome(onFinish);

  const bodyR = BODY_R * sizeScale;

  const stick = useJoystick(canvasRef, { active: !outcome });

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const value = Math.round(mapPerformance(perf, 90, 260));
    return { score: value, display: `${value}` };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback((reason) => {
    if (overRef.current) return;
    overRef.current = true;
    const total = scoreRef.current;
    const world = worldRef.current;
    const taken = world?.taken ?? 0;
    const hurt = world?.hits ?? 0;
    sound?.play?.(reason === 'dead' ? 'miss' : total >= 200 ? 'perfect' : 'score');

    end({
      entries: [
        { playerId: localPlayerId, score: total, display: `${total}` },
        ...rivalFinals,
      ],
      value: `${total}`,
      label: 'PONTOS',
      tone: reason === 'dead' ? 'bad' : total >= 200 ? 'good' : total >= 130 ? 'neutral' : 'bad',
      note: reason === 'dead'
        ? 'Uma vida, uma batida.'
        : `${taken} cristais, ${hurt} batida${hurt === 1 ? '' : 's'}.`,
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

    // Arena medida em unidades de `u`: círculo redondo, velocidade igual nos
    // dois eixos, e a dificuldade não muda com o tamanho da tela.
    const u = Math.min(w, h);
    const aw = w / u;
    const ah = h / u;

    if (!worldRef.current) worldRef.current = newWorld(rng, aw, ah, bodyR);
    const world = worldRef.current;

    // timeScale escala a SIMULAÇÃO, nunca o relógio da rodada.
    const simDt = outcome ? 0 : dt * timeScale;

    if (simDt > 0) {
      const s = stick.current;
      if (s.on && !touchedRef.current) {
        touchedRef.current = true;
        setTouched(true);
      }

      const sign = invert ? -1 : 1;
      const vx = s.dx * sign;
      const vy = s.dy * sign;

      let left = simDt;
      while (left > 0) {
        const slice = Math.min(left, MAX_STEP);
        step(world, slice, rng, vx, vy, aw, ah, bodyR, sound, reduceRef.current);
        left -= slice;
      }

      scoreRef.current = world.score;
      if (world.score !== shownRef.current) {
        shownRef.current = world.score;
        setScore(world.score);
        setHits(world.hits);
      }

      // UMA VIDA encerra na primeira batida. O deadRef evita chamar duas vezes
      // se duas minas encostarem no mesmo passo.
      if (oneLife && world.hits > 0 && !deadRef.current) {
        deadRef.current = true;
        closeRound('dead');
      }
    }

    paint(ctx, w, h, u, world, colors, bodyR);
    if (!outcome) paintJoystick(ctx, stick.current, colors);
  }, true);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, elapsed / duration);
  const ceiling = Math.max(score, ...rivalFinals.map((entry) => entry.score), 150);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score, ratio, index * 1.1),
    };
  });

  const instruction = oneLife
    ? 'UMA BATIDA E ACABOU.'
    : invert ? 'CONTROLE INVERTIDO.' : 'Pegue os cristais. Fuja das minas.';

  const showHint = !touched && !outcome && elapsed < 3000;

  return (
    <div className="gscene dg">
      <GameHeader
        title="DESVIAR"
        instruction={instruction}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="PONTOS" value={score} tone="accent" pulseKey={score} />
        <ScoreBadge
          label="BATIDAS"
          value={hits}
          tone={hits > 0 ? 'bad' : 'neutral'}
          size="sm"
        />
      </GameHeader>

      <div className="gscene__stage">
        <canvas ref={canvasRef} className="gcanvas" />
        <RivalBars rivals={rivals} max={ceiling} />
        {hidden ? <div className="gveil" /> : null}

        {/* No terço de baixo: é onde o polegar já está, e é onde o analógico
            deve nascer para não tapar a arena. */}
        {showHint ? (
          <div className="dg__hint" aria-hidden="true">
            <span className="dg__hint-ring" />
            <span className="dg__hint-text">ARRASTE EM QUALQUER LUGAR</span>
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

function newWorld(rng, aw, ah, bodyR) {
  const world = {
    x: aw / 2,
    y: ah / 2,
    t: 0,
    score: 0,
    taken: 0,
    hits: 0,
    stun: 0,
    safe: 0,
    flash: 0,
    shake: 0,
    shards: new Array(SHARD_COUNT).fill(null),
    hazards: [],
    pops: [],
  };
  for (let i = 0; i < SHARD_COUNT; i += 1) resetShard(world, i, rng, aw, ah, bodyR);
  // As primeiras minas nascem longe: a rodada começa com um segundo de arena
  // limpa, tempo de entender o que é o quê antes de precisar fugir.
  for (let i = 0; i < HAZ_START; i += 1) world.hazards.push(makeHazard(rng, aw, ah, world));
  return world;
}

function step(world, dt, rng, vx, vy, aw, ah, bodyR, sound, reduced) {
  world.t += dt;
  world.stun = Math.max(0, world.stun - dt);
  world.safe = Math.max(0, world.safe - dt);
  world.flash = Math.max(0, world.flash - dt * 2.5);
  world.shake = Math.max(0, world.shake - dt * 3);

  // Atordoado o corpo não anda. É a metade cara da batida: o placar perde 15,
  // mas o que dói é ver a arena continuar sem você.
  if (!world.stun) {
    world.x += vx * SPEED * dt;
    world.y += vy * SPEED * dt;
  }
  world.x = Math.max(bodyR, Math.min(aw - bodyR, world.x));
  world.y = Math.max(bodyR, Math.min(ah - bodyR, world.y));

  // A arena engrossa sozinha. Sem isso os últimos dez segundos são iguais aos
  // primeiros — e uma rodada que não aperta no fim não tem fim, só acaba.
  const want = Math.min(HAZ_MAX, HAZ_START + Math.floor(world.t / HAZ_RAMP));
  while (world.hazards.length < want) world.hazards.push(makeHazard(rng, aw, ah, world));

  for (let i = 0; i < world.hazards.length; i += 1) {
    const haz = world.hazards[i];
    haz.x += haz.vx * dt;
    haz.y += haz.vy * dt;
    haz.spin += dt * haz.turn;

    // Quica nas paredes. Reposiciona antes de inverter para a mina não ficar
    // presa vibrando na borda quando o passo é grande.
    if (haz.x < HAZ_R) { haz.x = HAZ_R; haz.vx = Math.abs(haz.vx); }
    if (haz.x > aw - HAZ_R) { haz.x = aw - HAZ_R; haz.vx = -Math.abs(haz.vx); }
    if (haz.y < HAZ_R) { haz.y = HAZ_R; haz.vy = Math.abs(haz.vy); }
    if (haz.y > ah - HAZ_R) { haz.y = ah - HAZ_R; haz.vy = -Math.abs(haz.vy); }

    if (world.safe > 0) continue;
    if (Math.hypot(haz.x - world.x, haz.y - world.y) > bodyR + HAZ_R) continue;

    world.score = Math.max(0, world.score - HIT_COST);
    world.hits += 1;
    world.stun = STUN;
    world.safe = SAFE;
    world.flash = 1;
    if (!reduced) world.shake = 1;
    world.pops.push({ x: world.x, y: world.y, t: 0, bad: true });
    sound?.play?.('miss');
  }

  for (let i = 0; i < SHARD_COUNT; i += 1) {
    const shard = world.shards[i];
    if (Math.hypot(shard.x - world.x, shard.y - world.y) > bodyR + SHARD_R) continue;

    world.score += SHARD_POINTS;
    world.taken += 1;
    world.pops.push({ x: shard.x, y: shard.y, t: 0, bad: false });
    sound?.play?.('hit');
    resetShard(world, i, rng, aw, ah, bodyR);
  }

  for (let i = world.pops.length - 1; i >= 0; i -= 1) {
    world.pops[i].t += dt;
    if (world.pops[i].t > POP_LIFE) world.pops.splice(i, 1);
  }
}

/**
 * Sorteia um cristal longe do corpo e longe das minas.
 *
 * Nascer colado no jogador daria ponto de graça; nascer em cima de uma mina
 * daria um ponto que só se pega apanhando. Nenhum dos dois é uma decisão, e
 * decidir para onde ir é a única coisa que este jogo pede.
 */
function resetShard(world, index, rng, aw, ah, bodyR) {
  const margin = SHARD_R + 0.03;
  let x = aw / 2;
  let y = ah / 2;

  for (let attempt = 0; attempt < 14; attempt += 1) {
    x = rng.range(margin, aw - margin);
    y = rng.range(margin, ah - margin);
    if (Math.hypot(x - world.x, y - world.y) < bodyR + CLEAR) continue;

    let clash = false;
    for (let i = 0; i < world.hazards.length; i += 1) {
      const haz = world.hazards[i];
      if (Math.hypot(x - haz.x, y - haz.y) < HAZ_R + SHARD_R + 0.05) { clash = true; break; }
    }
    if (clash) continue;

    for (let i = 0; i < SHARD_COUNT; i += 1) {
      const other = world.shards[i];
      if (i === index || !other) continue;
      if (Math.hypot(x - other.x, y - other.y) < SHARD_R * 2 + 0.06) { clash = true; break; }
    }
    if (!clash) break;
  }

  world.shards[index] = { x, y };
}

/**
 * A mina nova entra por uma borda, apontada para dentro.
 *
 * Aparecer do nada no meio da arena seria injusto de um jeito que o jogador
 * sente mas não consegue nomear: a batida viria de um lugar que não existia no
 * quadro anterior. Vindo da parede, ela sempre foi vista antes de encostar.
 */
function makeHazard(rng, aw, ah, world) {
  const side = rng.int(0, 3);
  const speed = rng.range(HAZ_SLOW, HAZ_FAST);
  let x = aw / 2;
  let y = ah / 2;
  let vx = 0;
  let vy = 0;

  if (side === 0) { x = rng.range(HAZ_R, aw - HAZ_R); y = HAZ_R; vy = speed; }
  else if (side === 1) { x = aw - HAZ_R; y = rng.range(HAZ_R, ah - HAZ_R); vx = -speed; }
  else if (side === 2) { x = rng.range(HAZ_R, aw - HAZ_R); y = ah - HAZ_R; vy = -speed; }
  else { x = HAZ_R; y = rng.range(HAZ_R, ah - HAZ_R); vx = speed; }

  // Uma inclinação de lado impede que todas as minas fiquem quicando em linhas
  // retas paralelas — em meio minuto isso vira um padrão que se decora.
  const drift = rng.range(-0.55, 0.55) * speed;
  if (vx === 0) vx = drift; else vy = drift;

  // Empurra para longe do jogador se ela nasceu bem em cima dele.
  if (world && Math.hypot(x - world.x, y - world.y) < HAZ_R + 0.2) {
    x = x < aw / 2 ? HAZ_R : aw - HAZ_R;
  }

  return { x, y, vx, vy, spin: rng.range(0, Math.PI), turn: rng.range(1.6, 3.2) };
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, u, world, colors, bodyR) {
  // Tremor determinístico: senoide rápida em vez de Math.random(), porque o
  // mundo roda numa semente e o desenho acompanha.
  const ox = world.shake > 0 ? Math.sin(world.t * 88) * world.shake * 5 : 0;

  ctx.fillStyle = colors['--color-bg-deep'];
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox, 0);

  drawGrid(ctx, w, h, u, colors);
  drawWalls(ctx, w, h, colors);

  for (let i = 0; i < SHARD_COUNT; i += 1) drawShard(ctx, world.shards[i], u, colors);
  for (let i = 0; i < world.hazards.length; i += 1) drawHazard(ctx, world.hazards[i], u, colors);
  for (let i = 0; i < world.pops.length; i += 1) drawPop(ctx, world.pops[i], u, colors);

  drawBody(ctx, world, u, bodyR, colors);
  ctx.restore();

  // Clarão vermelho na batida: o número no cabeçalho é pequeno demais para ser
  // o único aviso de que algo custou caro.
  if (world.flash > 0) {
    ctx.fillStyle = colors['--color-danger'];
    ctx.globalAlpha = world.flash * 0.2;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

/** Sem malha, um círculo num fundo liso parece parado mesmo andando. */
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

function drawWalls(ctx, w, h, colors) {
  ctx.strokeStyle = colors['--color-surface-2'];
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
}

/**
 * O cristal é um losango verde e liso; a mina é uma estrela vermelha e espinhosa.
 *
 * Silhuetas opostas de propósito: pontudo para fora lê como ameaça em qualquer
 * cultura, e quem não separa verde de vermelho decide pela forma — que é
 * legível até de canto de olho, no meio da fuga.
 */
function drawShard(ctx, shard, u, colors) {
  if (!shard) return;
  const r = SHARD_R * u;
  const cx = shard.x * u;
  const cy = shard.y * u;

  ctx.fillStyle = colors['--color-success'];
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = colors['--color-bg-deep'];
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawHazard(ctx, haz, u, colors) {
  const r = HAZ_R * u;
  const cx = haz.x * u;
  const cy = haz.y * u;
  const spikes = 8;

  ctx.fillStyle = colors['--color-danger'];
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = haz.spin + (Math.PI / spikes) * i;
    const reach = i % 2 === 0 ? r : r * 0.62;
    const px = cx + Math.cos(angle) * reach;
    const py = cy + Math.sin(angle) * reach;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Núcleo escuro: dá profundidade e mantém a mina legível por cima da malha.
  ctx.fillStyle = colors['--color-bg-deep'];
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPop(ctx, pop, u, colors) {
  const k = pop.t / POP_LIFE;
  ctx.globalAlpha = (1 - k) * 0.85;
  ctx.strokeStyle = pop.bad ? colors['--color-danger'] : colors['--color-success'];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(pop.x * u, pop.y * u, (0.03 + k * 0.07) * u, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** O corpo do jogador. Pisca enquanto está invencível — e é assim que ele
 *  descobre que ainda está, sem uma caixa de texto explicando. */
function drawBody(ctx, world, u, bodyR, colors) {
  const r = bodyR * u;
  const cx = world.x * u;
  const cy = world.y * u;

  if (world.safe > 0 && Math.floor(world.safe * 14) % 2 === 0) return;

  ctx.fillStyle = colors['--game-accent-deep'];
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
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
