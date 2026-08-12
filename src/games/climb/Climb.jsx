import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import HoldButton from '../_shared/HoldButton.jsx';
import { drawImageCentered, preloadImages } from '../_shared/assets.js';
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
import './Climb.css';

/** Pixels por metro. Só existe para a altura virar um número legível. */
const PPM = 26;

/**
 * Especiais só entram acima disto (protótipo: 240 unidades). Os primeiros
 * metros são degraus normais: aprende-se a mira antes de a torre virar armadilha.
 */
const SPECIAL_GATE_M = 24;

/* Forças dos especiais em MÚLTIPLOS do pulo base — os números do handoff
   (pulo 540, mola 1020, foguete 1180, empurrão -420) viram razões, para
   sobreviverem à física relativa à tela que este port usa. */
const SPRING_MUL = 1020 / 540; //  ~1.89× → mola manda pra cima
const ROCKET_MUL = 1180 / 540; //  ~2.19× → foguete trava subindo
const HAZARD_MUL = -420 / 540; // ~-0.78× → perigo joga pra baixo
const ROCKET_MS = 1250; // duração do boost travado

/* Faces chapadas das plataformas — cores fixas do handoff, alto contraste
   sobre o fundo #170F3E. Sem gradiente: adesivo, não vidro. */
const PLAT = {
  solid: '#A78BFA',
  moving: '#4DE3E3',
  crumble: '#C08457',
  spring: '#FFCE31',
};

/* Avisos centrais — pílula que estoura e some. */
const WARN = {
  mola: { text: 'MOLA!', color: '#FFCE31' },
  foguete: { text: 'FOGUETE!', color: '#7BE86A' },
  quebrou: { text: 'QUEBROU', color: '#FF6B57' },
  bomba: { text: 'TOMOU!', color: '#FF6B57' },
  nuvem: { text: 'CAIU NA NUVEM', color: '#FF6B57' },
};

const IMG_SRC = {
  seta: '/assets/acoes/seta-cima.png',
  foguete: '/assets/acoes/foguete.png',
  bomba: '/assets/jogo/bomba.png',
  nuvem: '/assets/efeitos/nuvem-roxa.png',
  rastro: '/assets/efeitos/rastro-arco-iris.png',
};

const TOKENS = [
  '--game-accent',
  '--game-accent-soft',
  '--game-accent-deep',
  '--color-success',
  '--color-warning',
  '--color-danger',
  '--color-info',
  '--color-text',
  '--color-text-muted',
  '--color-bg-deep',
  '--color-surface-2',
  '--font-mono',
  '--font-display',
];

/**
 * ESCALAR — o pulo é automático, você só decide para onde cair.
 *
 * Tirar o pulo das mãos do jogador é o que faz isto caber num celular: sobra
 * uma decisão só — esquerda ou direita — e ela é tomada com o polegar em
 * repouso, sem timing. Quem erra não perde por reflexo lento, perde por ter
 * mirado mal.
 *
 * A tela dá a volta na horizontal de propósito. Em tela estreita, sair pela
 * borda seria morte certa e injusta; dando a volta, a borda vira atalho.
 *
 * A partir de 24 m a torre ganha temperos: molas amarelas que arremessam,
 * foguetes que travam a subida por um instante, e bombas/nuvens que empurram
 * pra baixo — cada um anunciado por uma pílula, para ninguém morrer sem saber.
 */
export default function Climb({
  players, localPlayerId, duration, effects, rng, bus, sound,
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
  const imagesRef = useRef(null);
  const dirRef = useRef(0);
  const overRef = useRef(false);
  const heightRef = useRef(0);
  const shownRef = useRef(0);
  const milestoneRef = useRef(0);
  const reduceRef = useRef(prefersReducedMotion());

  const [height, setHeight] = useState(0);
  const [holding, setHolding] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    // §3.11: metros do bot = perf * 190; score = metros * 12.
    const metres = Math.round(mapPerformance(perf, 8, 190));
    return { score: metres * 12, display: `${metres} m`, meters: metres };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(({ fell = false } = {}) => {
    if (overRef.current) return;
    overRef.current = true;
    const metres = Math.floor(heightRef.current);
    sound?.play?.(fell ? 'miss' : 'score');

    end({
      entries: [
        {
          playerId: localPlayerId,
          score: metres * 12, // §3.11
          display: `${metres} m`,
          stat: { climbHeight: metres },
        },
        ...rivalFinals,
      ],
      value: `${metres}m`,
      label: 'ALTURA',
      tone: fell ? 'bad' : 'good',
      note: fell ? 'Você caiu.' : 'Chegou ao fim de pé.',
    });
  }, [end, localPlayerId, rivalFinals, sound]);

  const { remaining, elapsed } = useGameClock(duration, closeRound, !outcome);

  /* -------------------------------------------------------------- controle */

  const hold = useCallback((value) => {
    dirRef.current = invert ? -value : value;
    setHolding(value);
  }, [invert]);

  const release = useCallback(() => {
    dirRef.current = 0;
    setHolding(0);
  }, []);

  // Teclado é cortesia para depurar no desktop; o jogo é feito para o polegar.
  useEffect(() => {
    const down = (event) => {
      if (event.key === 'ArrowLeft') hold(-1);
      if (event.key === 'ArrowRight') hold(1);
    };
    const up = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [hold, release]);

  // O bus existe para a Fase 2: quando o movimento vier pela rede, ele entra
  // exatamente por aqui, com a mesma forma do toque local.
  useEffect(() => {
    if (!bus?.on) return undefined;
    return bus.on((action) => {
      if (action.playerId !== localPlayerId) return;
      if (action.action === 'MOVE_LEFT') hold(-1);
      if (action.action === 'MOVE_RIGHT') hold(1);
      if (action.action === 'RELEASE') release();
    });
  }, [bus, hold, localPlayerId, release]);

  /* ------------------------------------------------------------- simulação */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    if (!colorsRef.current) colorsRef.current = readCssColors(canvas, TOKENS);
    const colors = colorsRef.current;
    if (!imagesRef.current) imagesRef.current = preloadImages(IMG_SRC);
    const images = imagesRef.current;
    if (!worldRef.current) worldRef.current = newWorld(w, h, rng, sizeScale);
    const world = worldRef.current;

    // Gancho SÓ de desenvolvimento: expõe o mundo para a bancada dirigir um
    // auto-escalador (captura de galeria/QA). Fora do DEV nem existe.
    if (import.meta.env.DEV) window.__climb = { world, w, h };

    // timeScale escala a SIMULAÇÃO, nunca o relógio da rodada.
    const simDt = outcome ? 0 : dt * timeScale;

    if (simDt > 0) step(world, simDt, w, h, rng, dirRef.current, sizeScale, sound, reduceRef.current);

    const metres = Math.max(0, -world.best) / PPM;
    if (metres > heightRef.current) {
      heightRef.current = metres;
      const mark = Math.floor(metres / 25);
      if (mark > milestoneRef.current) {
        milestoneRef.current = mark;
        sound?.play?.('perfect');
      }
      // Só empurra estado quando o METRO INTEIRO muda. Sem isso o React
      // re-renderiza a cena 60x/s por causa de um número no cabeçalho.
      const shown = Math.floor(metres);
      if (shown !== shownRef.current) {
        shownRef.current = shown;
        setHeight(shown);
      }
    }

    if (world.dead && !overRef.current) {
      closeRound({ fell: true });
      return;
    }

    paint(ctx, world, w, h, colors, images);
  }, true);

  /* ----------------------------------------------------------------- render */

  const ratio = Math.min(1, elapsed / duration);
  const ceiling = Math.max(height, ...rivalFinals.map((entry) => entry.meters), 20);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.meters, ratio, index * 1.4),
    };
  });

  return (
    <div className="gscene cl">
      <GameHeader
        title="ESCALAR"
        instruction={invert ? 'CONTROLES INVERTIDOS.' : 'Segure ← ou → . O pulo é automático.'}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="ALTURA" value={`${height}m`} tone="accent" />
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

      <div className="gscene__pad cl__pad">
        <HoldButton
          className="cl__btn"
          label="←"
          ariaLabel="esquerda"
          active={holding === -1}
          onHold={() => hold(-1)}
          onRelease={release}
        />
        <HoldButton
          className="cl__btn"
          label="→"
          ariaLabel="direita"
          active={holding === 1}
          onHold={() => hold(1)}
          onRelease={release}
        />
      </div>
    </div>
  );
}

/* ========================================================================= */
/* mundo                                                                      */
/* ========================================================================= */

/**
 * Coordenadas: `y` do mundo cresce para BAIXO e o começo é y = 0. Subir é ir
 * para o negativo. `cam` é o y do topo da tela; `screenY = y - cam`.
 */
function newWorld(w, h, rng, sizeScale) {
  const world = {
    cam: -h * 0.72,
    best: 0,
    dead: false,
    t: 0,
    platforms: [],
    hazards: [],
    dust: [],
    trail: [],
    warn: null,
    nextHazardY: -SPECIAL_GATE_M * PPM - h * 0.6,
    stars: Array.from({ length: 34 }, () => ({
      x: rng.range(0, w),
      y: rng.range(0, h * 2),
      r: rng.range(0.8, 2.2),
      depth: rng.range(0.25, 0.7),
    })),
    spawnY: 0,
    player: {
      x: w / 2,
      y: -30,
      vx: 0,
      vy: 0,
      r: Math.max(14, w * 0.045),
      squash: 0,
      boost: 0,
    },
  };

  // Plataforma inicial larga: ninguém começa caindo.
  world.platforms.push(make(w / 2, 0, w * 0.42, 'solid'));
  let y = 0;
  while (y > world.cam - h) {
    y -= rng.range(h * 0.11, h * 0.2);
    world.platforms.push(spawnPlatform(y, w, h, rng, sizeScale, false));
  }
  world.spawnY = y;
  return world;
}

function make(x, y, width, kind) {
  return { x, y, w: width, kind, vx: 0, alive: true, fade: 1, used: false, rocket: false, rocketTaken: false };
}

function makeHazard(y, w, h, rng) {
  const kind = rng() < 0.5 ? 'bomba' : 'nuvem';
  const r = Math.max(16, w * 0.062);
  return { x: rng.range(r, w - r), y, kind, r, dead: false, fade: 1 };
}

function spawnPlatform(y, w, h, rng, sizeScale, aboveGate) {
  const width = Math.max(46, w * rng.range(0.2, 0.32)) * sizeScale;
  const x = rng.range(width / 2, w - width / 2);

  // Abaixo do portão dos especiais, tudo é degrau normal: o jogo se apresenta
  // antes de complicar. Acima, entram mola / móvel / quebradiça na proporção
  // do handoff (12 / 16 / 14 %), senão normal.
  let platform;
  if (!aboveGate) {
    platform = make(x, y, width, 'solid');
  } else {
    const roll = rng();
    if (roll < 0.12) platform = make(x, y, width, 'spring');
    else if (roll < 0.28) {
      platform = make(x, y, width, 'moving');
      platform.vx = rng.pick([-1, 1]) * w * rng.range(0.14, 0.26);
    } else if (roll < 0.42) platform = make(x, y, width, 'crumble');
    else platform = make(x, y, width, 'solid');
  }

  // Foguete: 7% das plataformas não-quebradiças carregam um. O item flutua
  // acima da plataforma, pulsando — é a recompensa mais visível da torre.
  if (aboveGate && platform.kind !== 'crumble' && platform.kind !== 'spring' && rng() < 0.07) {
    platform.rocket = true;
  }
  return platform;
}

function step(world, dt, w, h, rng, dir, sizeScale, sound, reduced) {
  const player = world.player;
  world.t += dt;

  const gravity = h * 2.6;
  const jump = -Math.sqrt(2 * gravity * h * 0.29);
  const speed = w * 1.15;
  const boosting = player.boost > 0;

  /* ------------------------------------------------------------ jogador */

  player.vx = dir * speed;
  player.x += player.vx * dt;
  // dá a volta na tela: a borda é atalho, não parede
  if (player.x < -player.r) player.x = w + player.r;
  if (player.x > w + player.r) player.x = -player.r;

  const previousFeet = player.y;

  if (boosting) {
    // Foguete: velocidade travada subindo, sem gravidade, imune a tudo.
    player.boost -= dt;
    player.vy = jump * ROCKET_MUL;
    player.y += player.vy * dt;
    if (!reduced && world.t - (world.lastTrail || 0) > 0.02) {
      world.lastTrail = world.t;
      world.trail.push({ x: player.x, y: player.y + player.r, life: 0.4, max: 0.4 });
    }
  } else {
    player.vy += gravity * dt;
    player.y += player.vy * dt;
  }
  player.squash = Math.max(0, player.squash - dt * 5);

  /* --------------------------------------------------------- plataformas */

  for (let i = 0; i < world.platforms.length; i += 1) {
    const platform = world.platforms[i];

    if (platform.kind === 'moving' && platform.alive) {
      platform.x += platform.vx * dt;
      const half = platform.w / 2;
      if (platform.x < half) { platform.x = half; platform.vx *= -1; }
      if (platform.x > w - half) { platform.x = w - half; platform.vx *= -1; }
    }

    if (!platform.alive) {
      platform.fade -= dt * 2.2;
      platform.y += dt * h * 0.5;
      continue;
    }

    // Pega o foguete ao passar perto do item (mesmo sem pisar). Vale durante
    // a subida do próprio boost? Não: já está imune, pegar de novo é ruído.
    if (platform.rocket && !platform.rocketTaken && !boosting) {
      const itemY = platform.y - player.r * 2.6;
      if (Math.abs(player.x - platform.x) < player.r * 1.4
        && Math.abs(player.y - itemY) < player.r * 1.6) {
        platform.rocketTaken = true;
        player.boost = ROCKET_MS / 1000;
        say(world, 'foguete');
        sound?.play?.('score');
      }
    }

    // Só colide caindo, e só se os pés CRUZARAM o topo neste quadro. Testar
    // sobreposição em vez de cruzamento deixaria o jogador atravessar a
    // plataforma quando a queda for mais rápida que a espessura dela.
    if (boosting) continue;
    if (player.vy <= 0) continue;
    if (previousFeet > platform.y || player.y < platform.y) continue;
    if (Math.abs(player.x - platform.x) > platform.w / 2 + player.r * 0.45) continue;

    player.y = platform.y;
    player.vy = platform.kind === 'spring' ? jump * SPRING_MUL : jump;
    player.squash = 1;
    sound?.play?.(platform.kind === 'spring' ? 'perfect' : 'tap');

    if (platform.kind === 'spring') say(world, 'mola');
    if (platform.kind === 'crumble') { platform.alive = false; say(world, 'quebrou'); }

    if (!reduced) {
      for (let k = 0; k < 5; k += 1) {
        world.dust.push({
          x: player.x + rng.jitter(player.r),
          y: platform.y,
          vx: rng.jitter(w * 0.16),
          vy: -rng.range(0, h * 0.08),
          life: 0.34,
          max: 0.34,
        });
      }
    }
  }

  /* -------------------------------------------------------------- perigos */

  if (!boosting) {
    for (let i = 0; i < world.hazards.length; i += 1) {
      const hz = world.hazards[i];
      if (hz.dead) continue;
      if (Math.abs(player.x - hz.x) < player.r * 0.9 + hz.r * 0.5
        && Math.abs(player.y - hz.y) < player.r * 1.1 + hz.r * 0.5) {
        hz.dead = true;
        player.vy = jump * HAZARD_MUL; // empurra pra BAIXO
        say(world, hz.kind);
        sound?.play?.('miss');
      }
    }
  }

  /* ------------------------------------------------------------- câmera */

  // A câmera só sobe. Descer junto com a queda esconderia o buraco e tiraria
  // do jogador a única informação que importa nesse momento: quanto falta.
  const target = player.y - h * 0.42;
  if (target < world.cam) world.cam = target;
  if (player.y < world.best) world.best = player.y;

  /* ------------------------------------------------------------- geração */

  const metresNow = Math.max(0, -world.best) / PPM;
  const density = Math.min(1, metresNow / 200);
  const hazardBand = h * 0.72;
  while (world.spawnY > world.cam - h * 0.6) {
    world.spawnY -= rng.range(h * 0.11, h * 0.2 + h * 0.04 * density);
    const aboveGate = metresNow > SPECIAL_GATE_M;
    world.platforms.push(spawnPlatform(world.spawnY, w, h, rng, sizeScale, aboveGate));

    // Faixas de perigo a cada ~banda, 55% de chance, só acima do portão.
    if (aboveGate && world.spawnY <= world.nextHazardY) {
      world.nextHazardY -= hazardBand;
      if (rng() < 0.55) {
        world.hazards.push(makeHazard(world.spawnY - rng.range(h * 0.03, h * 0.08), w, h, rng));
      }
    }
  }

  const floor = world.cam + h + 240;
  world.platforms = world.platforms.filter((platform) => platform.y < floor && platform.fade > 0);
  world.hazards = world.hazards.filter((hz) => !hz.dead && hz.y < floor);

  for (let i = 0; i < world.dust.length; i += 1) {
    const speck = world.dust[i];
    speck.x += speck.vx * dt;
    speck.y += speck.vy * dt;
    speck.life -= dt;
  }
  world.dust = world.dust.filter((speck) => speck.life > 0);

  for (let i = 0; i < world.trail.length; i += 1) world.trail[i].life -= dt;
  world.trail = world.trail.filter((t) => t.life > 0);

  if (world.warn) {
    world.warn.t += dt;
    if (world.warn.t > 0.9) world.warn = null;
  }

  // Durante o boost não se morre; fora dele, sair pela base é queda.
  if (!boosting && player.y - world.cam > h + player.r * 3) world.dead = true;
}

/** Dispara um aviso central (pílula que estoura e some em 900 ms). */
function say(world, key) {
  const w = WARN[key];
  if (!w) return;
  world.warn = { text: w.text, color: w.color, t: 0 };
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, world, w, h, colors, images) {
  ctx.clearRect(0, 0, w, h);

  /* --------------------------------------------------------------- fundo */

  // Estrelas com paralaxe: a única pista de que o mundo está se movendo
  // quando não há plataforma na tela.
  ctx.fillStyle = colors['--game-accent-soft'];
  for (let i = 0; i < world.stars.length; i += 1) {
    const star = world.stars[i];
    const y = mod(star.y - world.cam * star.depth, h * 2) - h * 0.5;
    if (y < -10 || y > h + 10) continue;
    ctx.globalAlpha = star.depth * 0.5;
    ctx.beginPath();
    ctx.arc(star.x, y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* ------------------------------------------------------------- réguas */

  ctx.font = `600 11px ${colors['--font-mono'] || 'monospace'}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const step10 = PPM * 10;
  const first = Math.ceil((world.cam + h) / -step10) * -step10;
  for (let y = first; y > world.cam - step10; y -= step10) {
    const metres = Math.round(-y / PPM);
    if (metres <= 0) continue;
    const screenY = y - world.cam;
    ctx.strokeStyle = colors['--color-surface-2'];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(w, screenY);
    ctx.stroke();
    ctx.fillStyle = colors['--color-text-muted'];
    ctx.fillText(`${metres}m`, 6, screenY - 9);
  }

  /* -------------------------------------------------------- plataformas */

  for (let i = 0; i < world.platforms.length; i += 1) {
    drawPlatform(ctx, world.platforms[i], world.cam, world.t, colors, images);
  }

  /* --------------------------------------------------------------- perigos */

  for (let i = 0; i < world.hazards.length; i += 1) {
    const hz = world.hazards[i];
    const img = hz.kind === 'bomba' ? images.bomba : images.nuvem;
    const size = hz.r * 2.4;
    const painted = drawImageCentered(ctx, img, hz.x, hz.y - world.cam, size);
    if (!painted) {
      ctx.fillStyle = hz.kind === 'bomba' ? colors['--color-danger'] : colors['--game-accent-soft'];
      ctx.beginPath();
      ctx.arc(hz.x, hz.y - world.cam, hz.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* -------------------------------------------------------------- poeira */

  ctx.fillStyle = colors['--game-accent-soft'];
  for (let i = 0; i < world.dust.length; i += 1) {
    const speck = world.dust[i];
    ctx.globalAlpha = Math.max(0, speck.life / speck.max) * 0.7;
    ctx.beginPath();
    ctx.arc(speck.x, speck.y - world.cam, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Rastro arco-íris atrás do foguete.
  for (let i = 0; i < world.trail.length; i += 1) {
    const t = world.trail[i];
    const a = Math.max(0, t.life / t.max);
    drawImageCentered(ctx, images.rastro, t.x, t.y - world.cam, world.player.r * 2.2, 0, a * 0.8);
  }

  drawPlayer(ctx, world.player, world.cam, world.t, colors, images);
  drawWarn(ctx, world.warn, w, h, colors);
}

function drawPlatform(ctx, platform, cam, time, colors, images) {
  const y = platform.y - cam;
  const half = platform.w / 2;
  const thickness = 12;

  ctx.globalAlpha = Math.max(0, platform.fade);

  const base = PLAT[platform.kind] || PLAT.solid;

  ctx.fillStyle = base;
  roundRect(ctx, platform.x - half, y, platform.w, thickness, 6);
  ctx.fill();

  // Borda de tinta embaixo: dá o corte de adesivo sem custar sombra borrada.
  ctx.strokeStyle = colors['--color-bg-deep'];
  ctx.lineWidth = 2;
  ctx.stroke();

  // Frágil e móvel se distinguem por MARCA, não só por cor: entalhes na
  // quebradiça, setas na que anda, ícone de seta na mola.
  if (platform.kind === 'crumble') {
    ctx.fillStyle = colors['--color-bg-deep'];
    const notches = Math.max(2, Math.floor(platform.w / 22));
    for (let i = 0; i < notches; i += 1) {
      const nx = platform.x - half + ((i + 0.5) * platform.w) / notches;
      ctx.fillRect(nx - 2, y + 2, 4, thickness - 4);
    }
  } else if (platform.kind === 'moving') {
    ctx.strokeStyle = colors['--color-bg-deep'];
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const cy = y + thickness / 2;
    const dir = Math.sign(platform.vx) || 1;
    for (let i = -1; i <= 1; i += 2) {
      const ax = platform.x + i * 9;
      ctx.beginPath();
      ctx.moveTo(ax - 3 * dir, cy - 3);
      ctx.lineTo(ax + 3 * dir, cy);
      ctx.lineTo(ax - 3 * dir, cy + 3);
      ctx.stroke();
    }
  } else if (platform.kind === 'spring') {
    const bob = Math.sin(time * 6) * 2;
    drawImageCentered(ctx, images.seta, platform.x, y - 12 + bob, 22);
  }

  // Foguete flutuando acima da plataforma, pulsando.
  if (platform.rocket && !platform.rocketTaken) {
    const pulse = 1 + Math.sin(time * 5) * 0.12;
    const iy = y - platform.w * 0 - 34 + Math.sin(time * 3) * 3;
    drawImageCentered(ctx, images.foguete, platform.x, iy, 32 * pulse);
  }

  ctx.globalAlpha = 1;
}

/**
 * O escalador: um bloco arredondado que estica ao subir e achata ao bater.
 * Squash-and-stretch é o que dá peso a uma forma geométrica sem custar arte.
 */
function drawPlayer(ctx, player, cam, time, colors, images) {
  const y = player.y - cam;
  const squash = player.squash;
  const rx = player.r * (1 + squash * 0.34);
  const ry = player.r * (1 - squash * 0.3);

  ctx.save();
  ctx.translate(player.x, y - ry);

  ctx.fillStyle = colors['--game-accent'];
  roundRect(ctx, -rx, -ry, rx * 2, ry * 2, Math.min(rx, ry) * 0.55);
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = colors['--color-text'];
  ctx.stroke();

  // Núcleo claro: o olho do foguete. Dá direção sem precisar de rosto.
  ctx.fillStyle = colors['--color-text'];
  ctx.beginPath();
  ctx.arc(0, -ry * 0.15, Math.min(rx, ry) * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Durante o boost, o foguete paira sobre a cabeça pulsando.
  if (player.boost > 0) {
    const pulse = 1 + Math.sin(time * 12) * 0.16;
    drawImageCentered(ctx, images.foguete, player.x, y - player.r * 3, 30 * pulse);
  }
}

/** Pílula central que estoura (0–300 ms) e some (600–900 ms). */
function drawWarn(ctx, warn, w, h, colors) {
  if (!warn) return;
  const t = warn.t;
  const pop = t < 0.3 ? easeOutBack(t / 0.3) : 1;
  const alpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.3);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w / 2, h * 0.3);
  ctx.scale(pop, pop);

  ctx.font = `800 ${Math.max(20, w * 0.075)}px ${colors['--font-display'] || 'sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = w * 0.05;
  const tw = ctx.measureText(warn.text).width;
  const pillW = tw + padX * 2;
  const pillH = Math.max(34, w * 0.11);

  ctx.fillStyle = warn.color;
  roundRect(ctx, -pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = colors['--color-bg-deep'];
  ctx.stroke();

  ctx.fillStyle = colors['--color-bg-deep'];
  ctx.fillText(warn.text, 0, 2);
  ctx.restore();
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
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

/** Módulo que funciona com negativo — o `%` do JS não serve para a paralaxe. */
function mod(value, size) {
  return ((value % size) + size) % size;
}
