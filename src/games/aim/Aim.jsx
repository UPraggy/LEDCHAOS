import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { attachPointer } from '../../engine/inputManager.js';
import { mapPerformance } from '../../engine/botProfile.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { pickTune, scheduleTune, midiToFreq } from '../_shared/melodies.js';
import { drawImageCentered, preloadImages } from '../_shared/assets.js';
import {
  readCssColors,
  useCanvasSize,
  useGameClock,
  useOutcome,
  useRaf,
} from '../_shared/hooks.js';
import '../_shared/game.css';
import './Aim.css';

const TAU = Math.PI * 2;

const IMG_SRC = {
  alvo: '/assets/jogo/alvo.png',
  bomba: '/assets/jogo/bomba.png',
};

/* Cores literais dos números flutuantes: ganho verde, perda vermelha. Ficam por
   cima dos PNGs e do palco roxo, então precisam de contraste próprio — não
   dependem do tema. */
const FLOAT_GAIN = '#7BE86A';
const FLOAT_LOSS = '#FF5C4D';

const TOKENS = [
  '--game-accent',
  '--color-info',
  '--color-danger',
  '--color-success',
  '--color-warning',
  '--color-text',
  '--color-text-muted',
  '--color-bg-deep',
  '--color-surface-2',
  '--font-mono',
];

/**
 * MIRA — dois tipos de alvo e um dedo só.
 *
 * A armadilha nunca é só "o vermelho": ela é uma BOMBA (`bomba.png`), forma
 * inconfundível, contra o ALVO de anéis (`alvo.png`). Quem não separa as cores
 * continua jogando pela forma, e ninguém perde ponto por causa da tela do
 * aparelho. Se um PNG ainda não carregou, o frame cai no desenho vetorial de
 * reserva (anéis / ✕) — nunca numa tela vazia.
 *
 * Cada acerto/erro cospe um número flutuante (`+N` verde / `−15` vermelho) que
 * sobe e some, para o ponto ser sentido no lugar onde o dedo tocou.
 *
 * Toque no vazio não pune. Em celular o dedo escorrega, e transformar
 * escorregão em castigo faria o jogador parar de tentar — que é o oposto do
 * que um microjogo de 20 segundos quer.
 */
export default function Aim({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const hidden = !!effects?.hidden;

  const canvasRef = useRef(null);
  const sizeRef = useCanvasSize(canvasRef);
  const colorsRef = useRef(null);
  const imagesRef = useRef(null);
  const worldRef = useRef(null);
  const overRef = useRef(false);
  const tallyRef = useRef({ score: 0, hits: 0, misses: 0, combo: 0, best: 0 });
  const rngRef = useRef(rng);
  // Relógio da música (tempo REAL, não escalado): a canção não pode acelerar
  // junto com o RÁPIDO. `melodyRef` guarda a partitura achatada + o cursor da
  // próxima nota a soar; `grooveRef` é o último oitavo já batido pela bateria.
  const musicStartRef = useRef(0);
  const melodyRef = useRef({ events: [], cursor: 0 });
  const grooveRef = useRef(-1);
  const reduceMotionRef = useRef(false);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [outcome, end] = useOutcome(onFinish);

  // Música de fundo reconhecível (Ode à Alegria, Para Elisa…) sorteada pela
  // mesma seed da rodada. `beatMs` sai do bpm da própria música — SEM dividir
  // pelo timeScale, senão a canção correria no modo rápido. Os alvos nascem
  // nessa mesma grade, então a arte "acompanha o ritmo" como o Rafael pediu.
  const [tune] = useState(() => pickTune(rng));
  const [beatMs] = useState(() => Math.max(220, Math.round(60000 / tune.bpm)));

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const value = Math.round(mapPerformance(perf, 40, 460) / 5) * 5;
    return { score: value, display: `${value} pts` };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const tally = tallyRef.current;
    const total = tally.hits + tally.misses;
    const acc = total ? Math.round((tally.hits / total) * 100) : 0;

    end({
      entries: [
        {
          playerId: localPlayerId,
          score: Math.max(0, tally.score),
          display: `${Math.max(0, tally.score)} pts`,
          stat: { accuracy: acc },
        },
        ...rivalFinals,
      ],
      value: `${acc}%`,
      label: 'PRECISÃO',
      tone: acc >= 75 ? 'good' : acc >= 45 ? 'neutral' : 'bad',
      note: `${tally.hits} alvos · sequência máxima x${tally.best}`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ------------------------------------------------------------ contagem */

  // Devolve a variação de pontos (delta) para quem chamou desenhar o número
  // flutuante no lugar do toque. 0 = evento sem placar (alvo que expirou).
  const register = useCallback((kind) => {
    const tally = tallyRef.current;
    let delta = 0;
    if (kind === 'hit') {
      tally.hits += 1;
      tally.combo += 1;
      tally.best = Math.max(tally.best, tally.combo);
      // O bônus de sequência tem teto: sem ele, uma sequência longa decidiria
      // a rodada sozinha e o final viraria formalidade.
      delta = 10 + Math.min(tally.combo, 10);
      tally.score += delta;
      sound?.play?.(tally.combo >= 5 ? 'perfect' : 'hit');
    } else {
      tally.misses += 1;
      tally.combo = 0;
      if (kind === 'trap') {
        delta = -15;
        tally.score += delta;
        sound?.play?.('miss');
      }
    }
    const total = tally.hits + tally.misses;
    setScore(Math.max(0, tally.score));
    setCombo(tally.combo);
    setAccuracy(total ? Math.round((tally.hits / total) * 100) : 100);
    return delta;
  }, [sound]);

  /* ---------------------------------------------------- movimento reduzido */

  // Quem pede menos movimento não recebe o "respiro" dos alvos na batida (a
  // música continua; só a pulsação visual é gated).
  useEffect(() => {
    reduceMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  }, []);

  /* --------------------------------------------------------------- toque */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || outcome) return undefined;

    return attachPointer(canvas, {
      onDown: (point) => {
        const world = worldRef.current;
        if (!world || overRef.current) return;

        let picked = null;
        let best = Infinity;
        for (let i = 0; i < world.targets.length; i += 1) {
          const target = world.targets[i];
          if (target.dead) continue;
          const distance = Math.hypot(point.x - target.x, point.y - target.y);
          // Alvo pequeno merece uma folga de dedo; grande, nenhuma.
          if (distance > target.r * target.scale + 8) continue;
          if (distance < best) { best = distance; picked = target; }
        }
        if (!picked) return;

        picked.dead = true;
        picked.popped = picked.trap ? 'trap' : 'hit';
        picked.popAt = performance.now();
        const delta = register(picked.trap ? 'trap' : 'hit');
        pushFloat(world, picked.x, picked.y - picked.r * 0.6, delta);
      },
    }, { bus, playerId: localPlayerId });
  }, [bus, localPlayerId, outcome, register]);

  /* ------------------------------------------------------------- simulação */

  useRaf((dt) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (!ctx || w < 2 || h < 2) return;

    if (!colorsRef.current) colorsRef.current = readCssColors(canvas, TOKENS);
    if (!imagesRef.current) imagesRef.current = preloadImages(IMG_SRC);
    if (!worldRef.current) worldRef.current = { targets: [], floats: [] };
    if (!musicStartRef.current) {
      // Só no primeiro frame: zera o relógio da música e achata a partitura
      // pra cobrir a rodada inteira (+4s de folga no fim).
      musicStartRef.current = performance.now();
      melodyRef.current = {
        events: scheduleTune(tune, { startMs: 0, totalMs: duration + 4000, beatMs }),
        cursor: 0,
      };
    }

    const world = worldRef.current;
    const now = performance.now();
    const simDt = outcome ? 0 : dt * 1000 * timeScale;
    const musicT = now - musicStartRef.current;
    const progress = Math.min(1, musicT / duration);

    // ------------------------------------------- música + batida (tempo real)
    let beatPulse = 0;
    if (!outcome) {
      // Melodia: dispara cada nota da partitura na hora exata — nota a nota, é
      // a canção tocada de verdade, sem áudio gravado nem API externa.
      const mel = melodyRef.current;
      while (mel.cursor < mel.events.length && mel.events[mel.cursor].atMs <= musicT) {
        const ev = mel.events[mel.cursor];
        const noteDur = Math.min(0.26, (ev.durMs / 1000) * 0.9);
        sound?.note?.(midiToFreq(ev.midi), noteDur, 'triangle', 0.15, { reverb: 0.3, sustain: 0.6 });
        mel.cursor += 1;
      }

      // Groove na grade de oitavos: bumbo no tempo, caixa no contratempo,
      // chimbal em todo oitavo. E é AQUI que os alvos nascem — na batida.
      const eighth = beatMs / 2;
      const idx = Math.floor(musicT / eighth);
      if (idx > grooveRef.current) {
        const from = Math.max(grooveRef.current + 1, idx - 1);
        for (let k = from; k <= idx; k += 1) {
          if (k < 0) continue;
          const onBeat = k % 2 === 0;
          if (onBeat) sound?.drum?.('kick', { gain: 0.4 });
          if (k % 4 === 2) sound?.drum?.('snare', { gain: 0.2 });
          sound?.drum?.('hat', { gain: onBeat ? 0.05 : 0.09, open: k % 8 === 6 });

          // Alvo na batida: no tempo sempre; no contratempo só quando aperta
          // (rápido ou reta final). Teto de 6 vivos pra não virar bagunça.
          const alive = world.targets.reduce((n, t) => n + (t.dead ? 0 : 1), 0);
          if ((onBeat || timeScale > 1 || progress > 0.55) && alive < 6) {
            spawn(world, w, h, rngRef.current, progress, sizeScale);
          }
        }
        grooveRef.current = idx;
      }

      // Pulso da batida (1 no ataque, decai até o próximo tempo). Gated por
      // reduce-motion; alimenta o "respiro" dos alvos no paint.
      const beatPhase = (musicT % beatMs) / beatMs;
      beatPulse = reduceMotionRef.current ? 0 : Math.max(0, 1 - beatPhase * 2.6);
    }

    // ---------------------------------- envelhecimento dos alvos (escala c/ timeScale)
    if (simDt > 0) {
      let expired = 0;
      for (let i = world.targets.length - 1; i >= 0; i -= 1) {
        const target = world.targets[i];
        target.age += simDt;
        if (!target.dead && target.age >= target.life) {
          target.dead = true;
          // Deixar um alvo bom passar conta contra a precisão; deixar uma
          // armadilha passar é exatamente o que se pedia.
          if (!target.trap) { target.popped = 'gone'; target.popAt = now; expired += 1; }
        }
        if (target.dead && now - (target.popAt || 0) > 260) {
          world.targets.splice(i, 1);
        }
      }
      for (let i = 0; i < expired; i += 1) register('gone');
    }

    paint(ctx, w, h, colorsRef.current, worldRef.current, imagesRef.current, now, beatPulse);
  }, true);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, Math.max(0, 1 - remaining / duration));
  const ceiling = Math.max(score, ...rivalFinals.map((entry) => entry.score), 200);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score, ratio, index * 1.15),
    };
  });

  return (
    <div className="gscene am">
      <GameHeader
        title="MIRA"
        instruction={`${tune.name} · acerte o alvo, a bomba tira ponto`}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="PONTOS" value={score} tone="good" pulseKey={score} />
        <ScoreBadge label="PRECISÃO" value={`${accuracy}%`} tone={accuracy >= 70 ? 'accent' : 'neutral'} size="sm" />
        <ScoreBadge label="SEQ." value={`x${combo}`} tone="neutral" size="sm" />
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
    </div>
  );
}

/* ========================================================================= */
/* mundo                                                                      */
/* ========================================================================= */

function spawn(world, w, h, rng, progress, sizeScale) {
  const base = Math.min(w, h) * 0.085 * sizeScale;
  const r = base * rng.range(0.82, 1.18);
  const margin = r + 14;
  const trap = rng.chance(0.2 + progress * 0.18);

  let x = 0;
  let y = 0;
  // Até seis tentativas para não nascer em cima de outra bolha: sobreposição
  // faria o toque acertar a de baixo e parecer injustiça.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    x = rng.range(margin, w - margin);
    y = rng.range(margin, h - margin);
    const clear = world.targets.every((other) => (
      other.dead || Math.hypot(other.x - x, other.y - y) > (other.r + r) * 1.05
    ));
    if (clear) break;
  }

  world.targets.push({
    x,
    y,
    r,
    trap,
    age: 0,
    life: (trap ? 1700 : 1550) - progress * 620,
    scale: 0,
    dead: false,
    popped: null,
    popAt: 0,
    spin: rng.range(0, TAU),
  });
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

function paint(ctx, w, h, colors, world, images, now, beatPulse = 0) {
  ctx.clearRect(0, 0, w, h);
  if (!world) return;

  // A arte "respira" na batida: o alvo desenhado incha ~9% no ataque e volta.
  // É só no DESENHO — o raio de acerto (target.scale) não muda, então mirar
  // continua justo.
  const throb = 1 + beatPulse * 0.09;

  for (let i = 0; i < world.targets.length; i += 1) {
    const target = world.targets[i];

    if (target.dead) {
      const t = Math.min(1, (now - (target.popAt || 0)) / 260);
      target.scale = 1 + t * 0.55;
      drawPop(ctx, target, colors, 1 - t);
      continue;
    }

    // Entra crescendo e, no fim da vida, encolhe: o tamanho é o relógio de
    // cada bolha, e dá para ler sem olhar o cabeçalho.
    const grow = Math.min(1, target.age / 130);
    const left = 1 - target.age / target.life;
    const fade = left < 0.28 ? left / 0.28 : 1;
    target.scale = grow * (0.55 + 0.45 * fade);

    // O PNG cabe num quadrado de lado ≈ diâmetro do alvo (com uma folga de 15%
    // porque os sprites têm margem transparente). A bomba balança de leve — vida
    // sem custo de leitura. Se a imagem ainda não veio, cai no vetor.
    const size = target.r * target.scale * 2.3 * throb;
    const img = target.trap ? images?.bomba : images?.alvo;
    const rot = target.trap ? Math.sin(now / 260 + target.spin) * 0.14 : 0;
    if (!drawImageCentered(ctx, img, target.x, target.y, size, rot)) {
      if (target.trap) drawTrap(ctx, target, colors);
      else drawTarget(ctx, target, colors);
    }
  }

  drawFloats(ctx, world, colors, now);
}

/* ------------------------------------------------------------ números +N/−N */

/**
 * Empurra um número flutuante no ponto do toque. `delta` 0 não gera nada
 * (alvo que só expirou). Teto de 24 para o array nunca crescer sem limite numa
 * rajada de toques.
 */
function pushFloat(world, x, y, delta) {
  if (!world || !delta) return;
  world.floats.push({
    x,
    y,
    text: delta > 0 ? `+${delta}` : `−${-delta}`,
    up: delta > 0,
    born: performance.now(),
  });
  if (world.floats.length > 24) world.floats.shift();
}

function drawFloats(ctx, world, colors, now) {
  const list = world.floats;
  if (!list) return;
  const font = colors['--font-mono'] || 'monospace';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `800 24px ${font}`;

  for (let i = list.length - 1; i >= 0; i -= 1) {
    const f = list[i];
    const t = (now - f.born) / 640;
    if (t >= 1) { list.splice(i, 1); continue; }

    // Sobe ~36 px e some; um pequeno "pop" de escala no começo (scorePop).
    const y = f.y - t * 36;
    const pop = t < 0.18 ? 0.7 + (t / 0.18) * 0.45 : 1.15 - t * 0.15;

    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.translate(f.x, y);
    ctx.scale(pop, pop);
    // Contorno grosso de tinta escura: o número tem que aparecer sobre o PNG
    // claro e sobre o palco roxo, sem depender da cor de fundo.
    ctx.lineWidth = 6;
    ctx.strokeStyle = colors['--color-bg-deep'];
    ctx.fillStyle = f.up ? FLOAT_GAIN : FLOAT_LOSS;
    ctx.strokeText(f.text, 0, 0);
    ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
}

function drawTarget(ctx, target, colors) {
  const r = target.r * target.scale;
  const color = colors['--color-info'];

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(target.x, target.y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, r * 0.14);
  ctx.beginPath();
  ctx.arc(target.x, target.y, r * 0.92, 0, TAU);
  ctx.stroke();

  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.beginPath();
  ctx.arc(target.x, target.y, r * 0.5, 0, TAU);
  ctx.stroke();

  // Os quatro traços de mira: é o que diz "aqui" mesmo em escala de cinza.
  ctx.beginPath();
  ctx.moveTo(target.x - r * 1.05, target.y);
  ctx.lineTo(target.x - r * 0.72, target.y);
  ctx.moveTo(target.x + r * 0.72, target.y);
  ctx.lineTo(target.x + r * 1.05, target.y);
  ctx.moveTo(target.x, target.y - r * 1.05);
  ctx.lineTo(target.x, target.y - r * 0.72);
  ctx.moveTo(target.x, target.y + r * 0.72);
  ctx.lineTo(target.x, target.y + r * 1.05);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(target.x, target.y, r * 0.16, 0, TAU);
  ctx.fill();
}

function drawTrap(ctx, target, colors) {
  const r = target.r * target.scale;
  const color = colors['--color-danger'];

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(target.x, target.y, r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = colors['--color-bg-deep'];
  ctx.lineWidth = Math.max(3, r * 0.2);
  ctx.lineCap = 'round';
  const arm = r * 0.44;
  ctx.beginPath();
  ctx.moveTo(target.x - arm, target.y - arm);
  ctx.lineTo(target.x + arm, target.y + arm);
  ctx.moveTo(target.x + arm, target.y - arm);
  ctx.lineTo(target.x - arm, target.y + arm);
  ctx.stroke();
}

function drawPop(ctx, target, colors, alpha) {
  if (alpha <= 0) return;
  const r = target.r * target.scale;
  const color = target.popped === 'hit'
    ? colors['--color-success']
    : target.popped === 'trap'
      ? colors['--color-danger']
      : colors['--color-text-muted'];

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.16 * alpha);
  ctx.beginPath();
  ctx.arc(target.x, target.y, r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
