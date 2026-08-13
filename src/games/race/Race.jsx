import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import HoldButton from '../_shared/HoldButton.jsx';
import { mapPerformance } from '../../engine/botProfile.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { drawImageBottom, preloadImages } from '../_shared/assets.js';
import {
  prefersReducedMotion,
  useCanvasSize,
  useGameClock,
  useOutcome,
  useRaf,
} from '../_shared/hooks.js';
import '../_shared/game.css';
import './Race.css';

/**
 * CORRIDA — o runner do dinossauro.
 *
 * Substitui o antigo carrinho de cima por um corredor lateral no estilo do jogo
 * do Chrome offline, com os sprites pixel-art da pasta assets/dino. A leitura é
 * imediata para qualquer pessoa: cacto no chão → PULA; pterodáctilo no ar →
 * ABAIXA. Um erro nunca tira ponto na hora; tira VELOCIDADE — o mundo desacelera
 * e o prejuízo é sentido pelo resto da rodada, não anunciado numa caixinha.
 *
 * A arena é BRANCA de propósito (#FFFFFF), como o original: é o único jogo do
 * CHAOS que abre mão do palco roxo, porque o contraste preto-no-branco do
 * dino é a própria identidade do brinquedo. Por isso as cores aqui são LITERAIS
 * (#FFFFFF / #535353 / #EDEDED), não tokens do tema.
 *
 * O mundo roda em PORCENTAGEM da largura da arena (x ∈ 0..100), então trocar de
 * celular ou girar a tela muda o quanto se enxerga, nunca a dificuldade — que
 * está toda em % percorridos e frações de segundo.
 *
 * timeScale escala a SIMULAÇÃO (velocidade de rolagem e de spawn), nunca o
 * relógio da rodada E NUNCA o pulo. O salto tem física fixa (vy/gravidade
 * constantes): no modo ACELERADO o obstáculo chega mais cedo, mas o arco do
 * pulo é o mesmo — a janela de acerto encolhe, e é aí que mora o desafio.
 */

/** Onde o dino fica na largura da arena (%). O resto do mundo desliza por ele. */
const DINO_X = 22;

/** Chão em `bottom: 22%`. A altura do pulo `y` vira `+ y*0.42%` de bottom. */
const GROUND_BOTTOM = 0.22;
const HEIGHT_TO_BOTTOM = 0.0042;

/** Alturas dos sprites, em fração da arena. Largura é sempre automática. */
const RUN_H = 0.13;
const DUCK_H = 0.07;

/** Pulo: física fixa. Ápice ≈ y=31.6 → ~13% da arena (172²… ver cabeçalho). */
const JUMP_V0 = 142;
const GRAVITY = 168 * 1.9;
/** Cacto/duplo são "limpos" só com o pulo alto o bastante (y acima disto). */
const CLEAR_Y = 25;

/** Velocidade de rolagem, em % da arena por segundo (carrega o timeScale).
 *  Rápido desde a largada (SPEED0 alto) e acelerando FORTE ao longo da rodada:
 *  com SPEED_ACCEL 2.8 e teto 112, a pista só chega no máximo perto dos ~21s de
 *  30, então ela cresce durante quase o jogo inteiro ("vai acelerando com o
 *  tempo"). O pulo continua com física fixa — quem sobe a velocidade encolhe a
 *  janela de acerto, não muda o arco do salto. */
const SPEED0 = 54;
const SPEED_ACCEL = 2.8;
const SPEED_MAX = 112;
/** Metros do HUD = distância acumulada; 0.42 calibra "quanto anda por %". */
const DIST_K = 0.42;

/** Bater: 700ms sem novas colisões e a velocidade cai para 72%. */
const STUN = 0.7;
const CRASH_KEEP = 0.72;
/** Penalidade de metros por batida no cálculo do score final. */
const CRASH_PENALTY = 260;

/**
 * Obstáculos. `meia` é a meia-largura da janela de colisão (spec §3.4): o dino
 * tem meia-largura implícita de 7, então bate quando |x-22| < 7 + meia.
 *   - cacto/duplo pousam no chão (bottom 22%) e se limpam PULANDO.
 *   - ptero voa em bottom 36% e se limpa só ABAIXANDO — pular entra bem nele.
 */
const OBST = {
  cacto: { img: 'cacto', h: 0.11, bottom: 0.22, meia: 5.5, fly: false },
  duplo: { img: 'duplo', h: 0.10, bottom: 0.22, meia: 6.5, fly: false },
  ptero: { img: 'ptero', h: 0.07, bottom: 0.36, meia: 6.0, fly: true },
};
const OBST_TYPES = ['cacto', 'duplo', 'ptero'];

const IMG_SRC = {
  corre: '/assets/dino/dino-corre.png',
  pula: '/assets/dino/dino-pula.png',
  abaixa: '/assets/dino/dino-abaixa.png',
  cacto: '/assets/dino/cacto.png',
  duplo: '/assets/dino/cacto-duplo.png',
  ptero: '/assets/dino/pterodatilo.png',
};

export default function Race({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const hidden = !!effects?.hidden;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const imagesRef = useRef(null);
  if (!imagesRef.current) imagesRef.current = preloadImages(IMG_SRC);

  const worldRef = useRef(null);
  if (!worldRef.current) worldRef.current = newWorld(timeScale);

  const overRef = useRef(false);
  const distRef = useRef(0);
  const shownRef = useRef(-1);
  const reduceRef = useRef(prefersReducedMotion());

  const [metres, setMetres] = useState(0);
  const [crashes, setCrashes] = useState(0);
  const [ducking, setDucking] = useState(false);
  const [outcome, end] = useOutcome(onFinish);

  // Adversários já têm o total decidido no começo; as barras só distribuem no
  // tempo. Bot (§3.11): m = perf*640, score = m*10.
  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const m = Math.max(0, Math.round(mapPerformance(perf, 0, 640)));
    return { m, score: m * 10, display: `${m} m` };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const metros = Math.round(distRef.current);
    const batidas = worldRef.current?.crashes ?? 0;
    const score = Math.max(0, metros * 10 - batidas * CRASH_PENALTY);
    sound?.play?.(batidas === 0 ? 'perfect' : 'score');

    end({
      entries: [
        { playerId: localPlayerId, score, display: `${metros} m` },
        ...rivalFinals.map((r) => ({ playerId: r.playerId, score: r.score, display: r.display })),
      ],
      value: `${metros} m`,
      label: 'DISTÂNCIA',
      tone: batidas === 0 ? 'good' : score > 0 ? 'neutral' : 'bad',
      note: batidas === 0
        ? 'Sem uma batida!'
        : `${batidas} batida${batidas > 1 ? 's' : ''}.`,
    });
  }, [end, localPlayerId, rivalFinals, sound]);

  const { remaining, elapsed } = useGameClock(duration, closeRound, !outcome);

  /* -------------------------------------------------------------- controle */

  const jump = useCallback(() => {
    const wld = worldRef.current;
    if (!wld || wld.ducking) return;
    // Só pula do chão: nada de pulo duplo. wld.y<=0.5 é "praticamente pousado".
    if (wld.y <= 0.5 && wld.vy <= 0) {
      wld.vy = JUMP_V0;
      sound?.play?.('hit');
    }
  }, [sound]);

  const duckOn = useCallback(() => {
    const wld = worldRef.current;
    if (wld) wld.ducking = true;
    setDucking(true);
  }, []);

  const duckOff = useCallback(() => {
    const wld = worldRef.current;
    if (wld) wld.ducking = false;
    setDucking(false);
  }, []);

  // Teclado é cortesia de desktop; o jogo é feito para dois polegares.
  useEffect(() => {
    const down = (event) => {
      if (event.repeat) return;
      if (event.key === 'ArrowUp' || event.key === ' ' || event.key === 'w') jump();
      if (event.key === 'ArrowDown' || event.key === 's') duckOn();
    };
    const up = (event) => {
      if (event.key === 'ArrowDown' || event.key === 's') duckOff();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [jump, duckOn, duckOff]);

  // Entrada da Fase 2 chega com a mesma forma do toque local.
  useEffect(() => {
    if (!bus?.on) return undefined;
    return bus.on((action) => {
      if (action.playerId !== localPlayerId) return;
      if (action.action === 'JUMP') jump();
      if (action.action === 'DUCK') duckOn();
      if (action.action === 'RELEASE') duckOff();
    });
  }, [bus, localPlayerId, jump, duckOn, duckOff]);

  /* ------------------------------------------------------------- simulação */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    const world = worldRef.current;
    const images = imagesRef.current;

    // timeScale escala a SIMULAÇÃO, nunca o relógio da rodada.
    const simDt = outcome ? 0 : dt * timeScale;

    if (simDt > 0) {
      step(world, dt, timeScale, rng, sound, reduceRef.current);
      distRef.current = world.dist;

      const whole = Math.round(world.dist);
      if (whole !== shownRef.current) {
        shownRef.current = whole;
        setMetres(whole);
        setCrashes(world.crashes);
      }
    }

    paint(ctx, w, h, world, images);
  }, true);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, elapsed / duration);
  const ceiling = Math.max(metres, ...rivalFinals.map((r) => r.m), 200);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.m, ratio, index * 0.9),
    };
  });

  return (
    <div className="gscene rc">
      <GameHeader
        title="CORRIDA"
        instruction="Pule os cactos · abaixe dos pterodáctilos"
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="DISTÂNCIA" value={`${metres} m`} tone="accent" />
        <ScoreBadge
          label="BATIDAS"
          value={crashes}
          tone={crashes === 0 ? 'good' : 'bad'}
          size="sm"
        />
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

      <div className="gscene__pad rc__pad">
        <HoldButton
          className="rc__btn rc__btn--duck"
          label="ABAIXAR"
          ariaLabel="abaixar"
          active={ducking}
          onHold={duckOn}
          onRelease={duckOff}
        />
        <HoldButton
          className="rc__btn rc__btn--jump"
          label="PULAR"
          ariaLabel="pular"
          onHold={jump}
          onRelease={() => {}}
        />
      </div>
    </div>
  );
}

/* ========================================================================= */
/* mundo                                                                      */
/* ========================================================================= */

function newWorld(timeScale) {
  return {
    dist: 0,
    speed: SPEED0 * timeScale,
    y: 0,          // altura do pulo (0 = no chão)
    vy: 0,
    ducking: false,
    stun: 0,
    shake: 0,
    shakeT: 0,
    seal: null,    // { life, max } do "BATEU!"
    cloud: 0,      // rolagem paralaxe das nuvens
    gap: 68,       // % percorridos até o próximo obstáculo
    obstacles: [],
    crashes: 0,
    seq: 0,
  };
}

function step(world, dt, timeScale, rng, sound, reduced) {
  // Velocidade sobe sozinha até o teto (que carrega o timeScale): a pista fica
  // difícil sem eu pedir.
  world.speed = Math.min(SPEED_MAX * timeScale, world.speed + SPEED_ACCEL * timeScale * dt);
  const scroll = world.speed * dt;

  world.dist += world.speed * dt * DIST_K;
  world.cloud += scroll * 0.22;
  world.stun = Math.max(0, world.stun - dt);
  world.shakeT += dt;
  world.shake = Math.max(0, world.shake - dt * 3.1);
  if (world.seal) {
    world.seal.life -= dt;
    if (world.seal.life <= 0) world.seal = null;
  }

  // Pulo: integra a física fixa. Enquanto está no ar (ou subindo), y anda.
  if (world.vy !== 0 || world.y > 0) {
    world.vy -= GRAVITY * dt;
    world.y += world.vy * dt;
    if (world.y <= 0) { world.y = 0; world.vy = 0; }
  }

  // Semeia obstáculos por distância percorrida, sempre fora da tela (x=104). O
  // espaçamento sobe junto com o teto de velocidade (46+..): assim o intervalo em
  // SEGUNDOS entre obstáculos no topo da pista continua ≳ o tempo de um pulo, e a
  // pista fica mais RÁPIDA sem virar dois cactos colados impossíveis de limpar.
  world.gap -= scroll;
  if (world.gap <= 0) {
    world.seq += 1;
    world.obstacles.push({ id: world.seq, tipo: rng.pick(OBST_TYPES), x: 104, done: false });
    world.gap = 46 + rng() * 52;
  }

  // Move e resolve. A colisão é decidida no CRUZAMENTO do centro do dino: é o
  // ponto de aproximação máxima dentro da janela |x-22| < 7+meia, e o único
  // instante que a física do pulo consegue cobrir (o ápice passa exatamente
  // aqui quando o tempo do salto está certo).
  for (let i = world.obstacles.length - 1; i >= 0; i -= 1) {
    const obst = world.obstacles[i];
    const prev = obst.x;
    obst.x -= scroll;

    if (!obst.done && prev > DINO_X && obst.x <= DINO_X) {
      obst.done = true;
      if (world.stun <= 0) {
        const cfg = OBST[obst.tipo];
        const cleared = cfg.fly
          ? (world.ducking && world.y <= 2)   // ptero: abaixado no chão
          : (world.y > CLEAR_Y);              // cacto/duplo: pulo alto
        if (!cleared) crash(world, sound, reduced);
      }
    }

    if (obst.x < -14) world.obstacles.splice(i, 1);
  }
}

function crash(world, sound, reduced) {
  world.speed = Math.max(SPEED0 * 0.6, world.speed * CRASH_KEEP);
  world.stun = STUN;
  world.crashes += 1;
  world.seal = { life: 0.9, max: 0.9 };
  if (!reduced) world.shake = 1;
  sound?.play?.('miss');
}

/* ========================================================================= */
/* pintura — tudo em cores literais do dino (branco/cinza), não em tokens.    */
/* ========================================================================= */

const INK = '#170F3E';
const GROUND = '#535353';
const CLOUD = '#EDEDED';
const RED = '#FF5C4D';
const CREAM = '#FFFDF7';

function paint(ctx, w, h, world, images) {
  const ox = world.shake > 0 ? Math.sin(world.shakeT * 90) * world.shake * 5 : 0;

  // Arena branca (o dino abre mão do palco roxo — é a graça do brinquedo).
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox, 0);

  const groundY = h * (1 - GROUND_BOTTOM);

  drawClouds(ctx, w, h, world);
  drawGround(ctx, w, h, groundY, world);

  // Obstáculos.
  for (let i = 0; i < world.obstacles.length; i += 1) {
    const obst = world.obstacles[i];
    const cfg = OBST[obst.tipo];
    if (obst.x < -14 || obst.x > 112) continue;
    const bx = (obst.x / 100) * w;
    const by = h * (1 - cfg.bottom);
    const oh = cfg.h * h;
    const ok = drawImageBottom(ctx, images[cfg.img], bx, by, oh);
    if (!ok) drawBoxFallback(ctx, bx, by, oh * 0.62, oh);
  }

  // Dino.
  drawDino(ctx, w, h, world, images);

  ctx.restore();

  // Selo "BATEU!" fora do shake, para ficar legível mesmo tremendo.
  if (world.seal) drawSeal(ctx, world.seal, w, h);
}

/** Duas nuvens em parallax lento (#EDEDED), embrulhando na largura. */
function drawClouds(ctx, w, h, world) {
  ctx.fillStyle = CLOUD;
  const bases = [[28, 0.18], [72, 0.30]];
  for (let i = 0; i < bases.length; i += 1) {
    const [bx, ry] = bases[i];
    const x = (mod(bx - world.cloud, 128) - 14) / 100 * w;
    const y = h * ry;
    roundRect(ctx, x, y, 56, 16, 8);
    ctx.fill();
    roundRect(ctx, x + 16, y - 8, 30, 16, 8);
    ctx.fill();
  }
}

/** Linha sólida + faixa tracejada rolando com a velocidade. */
function drawGround(ctx, w, h, groundY, world) {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, groundY - 2, w, 4);

  // Tracejado: traço 14px, vão 32px (período 46px), deslizando com a distância.
  const period = 46;
  const off = mod(world.dist * 3.4, period);
  const y = groundY + 8;
  for (let x = -off; x < w + period; x += period) {
    ctx.fillRect(x, y, 14, 4);
  }
}

/** O dino: corre no chão, `pula` no ar, `abaixa` agachado. Pisca ao apanhar. */
function drawDino(ctx, w, h, world, images) {
  // Pisca no atordoamento: sem isso o jogador não entende o tranco e culpa o
  // jogo, não a batida.
  if (world.stun > 0 && Math.floor(world.stun * 22) % 2 === 0) return;

  const airborne = world.y > 0.5;
  const crouched = world.ducking && !airborne;

  const footFrac = GROUND_BOTTOM + world.y * HEIGHT_TO_BOTTOM;
  const footY = h * (1 - footFrac);
  const dh = (crouched ? DUCK_H : RUN_H) * h;
  const bx = (DINO_X / 100) * w;

  const sprite = airborne ? images.pula : (crouched ? images.abaixa : images.corre);
  const ok = drawImageBottom(ctx, sprite, bx, footY, dh);
  if (!ok) drawBoxFallback(ctx, bx, footY, dh * 0.7, dh);
}

/** Reserva enquanto o PNG não carregou: um bloco cinza-escuro, nunca um vazio. */
function drawBoxFallback(ctx, bx, by, bw, bh) {
  ctx.fillStyle = GROUND;
  roundRect(ctx, bx - bw / 2, by - bh, bw, bh, 6);
  ctx.fill();
}

/** "BATEU!" no centro-alto, com o pop e o contorno de tinta do resto do jogo. */
function drawSeal(ctx, seal, w, h) {
  const t = 1 - seal.life / seal.max;
  const alpha = Math.max(0, 1 - t * t);
  const size = 30 + (1 - Math.abs(0.5 - t) * 2) * 8;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.strokeText('BATEU!', w / 2, h * 0.3);
  ctx.fillStyle = RED;
  ctx.fillText('BATEU!', w / 2, h * 0.3);
  ctx.restore();
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

/** Módulo que funciona com negativo — o `%` do JS não serve para rolagem. */
function mod(value, size) {
  return ((value % size) + size) % size;
}
