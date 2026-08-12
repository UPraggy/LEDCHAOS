import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import { attachPointer } from '../../engine/inputManager.js';
import { botPerformance, mapPerformance } from '../../engine/botProfile.js';
import { pickWord } from '../../data/words.js';
import { readCssColors, useCanvasSize, useGameClock, useOutcome } from '../_shared/hooks.js';
import '../_shared/game.css';
import './Draw.css';

const TAU = Math.PI * 2;

/** Paleta: tokens do design system, nunca hex solto. */
const PALETTE = [
  '--color-text',
  '--color-danger',
  '--color-warning',
  '--color-success',
  '--color-info',
  '--color-energy',
];

/** Espessura do traço, como fração da largura do canvas. */
const SIZES = [0.008, 0.018, 0.034];

/** De quanto em quanto tempo os adversários reavaliam o desenho. */
const THINK_MS = 350;

/**
 * DESENHAR — você desenha, os outros adivinham.
 *
 * Quem desenha é sempre o jogador local. Não é preguiça de design: adivinhar
 * exige digitar, e teclado em celular cobre metade da tela justamente onde o
 * desenho está. Na Fase 2, com celulares de verdade, o papel gira entre os
 * jogadores — o formato de resultado já é o mesmo.
 *
 * O acerto não é sorteado no relógio: cada adversário precisa de uma
 * QUANTIDADE DE TINTA na tela antes de acertar. Desenhar rápido e cheio faz o
 * palpite vir antes. É o que dá agência ao jogador — o placer depende do que
 * ele fez, não de um timer.
 */
export default function Draw({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const sizeScale = effects?.sizeScale ?? 1;

  const canvasRef = useRef(null);
  const colorsRef = useRef(null);
  const strokesRef = useRef([]);
  const currentRef = useRef(null);
  const inkRef = useRef(0);
  const startRef = useRef(0);
  const correctRef = useRef([]);
  const overRef = useRef(false);

  const [word] = useState(() => pickWord(rng));
  const [colorIndex, setColorIndex] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(1);
  const [erasing, setErasing] = useState(false);
  const [guesses, setGuesses] = useState([]);
  const [solved, setSolved] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  const sizeRef = useCanvasSize(canvasRef, ({ w, h }) => {
    // Redimensionar zera o bitmap do canvas. Os traços vivem em coordenadas
    // normalizadas justamente para poderem ser repintados aqui — girar o
    // aparelho ou abrir o teclado não pode apagar o desenho.
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) repaint(ctx, strokesRef.current, w, h);
  });

  /* ---------------------------------------------------------- adversários */

  const [rivals] = useState(() => players
    .filter((player) => player.id !== localPlayerId)
    .map((player, index) => {
      const perf = botPerformance(player.skill, rng, 0.4);
      return {
        id: player.id,
        name: player.name,
        color: player.color,
        // tinta necessária, medida em "larguras de tela" de traço
        need: mapPerformance(perf, 18, 5),
        earliest: mapPerformance(perf, 15000, 3600),
        nextWrong: 1600 + index * 650 + rng.range(0, 1400),
        done: false,
      };
    }));

  const [decoys] = useState(() => rng.shuffle(
    // chutes errados saem da mesma lista: adversário chutando outra coisa
    // desenhável soa real, lista genérica de "palavras erradas" não
    Array.from({ length: 40 }, () => pickWord(rng)).filter((item) => item !== word),
  ));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;

    const hits = correctRef.current;
    const first = hits.length ? Math.min(...hits.map((hit) => hit.ms)) : null;
    // O desenhista ganha por QUANTOS entenderam e por QUÃO CEDO o primeiro
    // entendeu. Desenhar bem é as duas coisas ao mesmo tempo.
    const speed = first == null ? 0 : Math.max(0, Math.round((duration - first) / 100));
    const mine = hits.length * 100 + speed;

    const rest = rivals.map((rival) => {
      const hit = hits.find((item) => item.playerId === rival.id);
      if (!hit) return { playerId: rival.id, score: 0, display: '—' };
      return {
        playerId: rival.id,
        score: 100 + Math.max(0, Math.round((duration - hit.ms) / 120)),
        display: `${(hit.ms / 1000).toFixed(1)}s`,
      };
    });

    end({
      entries: [
        {
          playerId: localPlayerId,
          score: mine,
          display: `${hits.length}/${rivals.length}`,
          stat: { artistScore: mine },
        },
        ...rest,
      ],
      value: `${hits.length}/${rivals.length}`,
      label: 'ADIVINHARAM',
      tone: hits.length ? 'good' : 'bad',
      note: first == null
        ? `Ninguém entendeu "${word}".`
        : `Primeiro acerto em ${(first / 1000).toFixed(1)}s.`,
    });
  }, [duration, end, localPlayerId, rivals, word]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ---------------------------------------------------------------- pincel */

  // O pincel vive num ref, não nas dependências do efeito: se trocar de cor
  // reatachasse o pointer, um traço em andamento morreria no meio do dedo.
  const brushRef = useRef(null);
  brushRef.current = () => {
    const colors = colorsRef.current || {};
    return {
      color: colors[PALETTE[colorIndex]] || '#FFFFFF',
      width: SIZES[sizeIndex] * sizeScale * (erasing ? 2.2 : 1),
      erase: erasing,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!colorsRef.current) colorsRef.current = readCssColors(canvas, PALETTE);
    if (outcome) return undefined;

    const ctx = canvas.getContext('2d');

    return attachPointer(canvas, {
      onDown: (point) => {
        const stroke = { ...brushRef.current(), pts: [{ x: point.nx, y: point.ny }] };
        currentRef.current = stroke;
        strokesRef.current.push(stroke);
        paintDot(ctx, stroke, point.x, point.y, sizeRef.current.w);
      },
      onMove: (point) => {
        const stroke = currentRef.current;
        if (!stroke) return;
        const { w, h } = sizeRef.current;
        const previous = stroke.pts[stroke.pts.length - 1];
        const from = { x: previous.x * w, y: previous.y * h };
        stroke.pts.push({ x: point.nx, y: point.ny });
        paintSegment(ctx, stroke, from, point, w);
        // tinta medida em larguras de tela: independe do tamanho do aparelho
        inkRef.current += Math.hypot(point.x - from.x, point.y - from.y) / w;
      },
      onUp: () => { currentRef.current = null; },
      onCancel: () => { currentRef.current = null; },
    }, { bus, playerId: localPlayerId });
  }, [bus, localPlayerId, outcome, sizeRef]);

  /* -------------------------------------------------------------- palpites */

  useEffect(() => {
    if (outcome) return undefined;
    startRef.current = performance.now();

    const timer = setInterval(() => {
      const elapsed = performance.now() - startRef.current;
      const ink = inkRef.current;
      const posted = [];

      rivals.forEach((rival) => {
        if (rival.done) return;

        if (ink >= rival.need && elapsed >= rival.earliest) {
          rival.done = true;
          correctRef.current.push({ playerId: rival.id, ms: elapsed });
          posted.push({ rival, text: word, correct: true });
          return;
        }
        if (elapsed >= rival.nextWrong && ink > 1.2) {
          rival.nextWrong = elapsed + 2200 + Math.random() * 2600;
          const guess = decoys[Math.floor(Math.random() * decoys.length)];
          posted.push({ rival, text: guess, correct: false });
        }
      });

      if (!posted.length) return;

      if (posted.some((item) => item.correct)) sound?.play?.('score');
      setSolved(correctRef.current.length);
      setGuesses((list) => [
        ...list,
        ...posted.map((item, index) => ({
          key: `${item.rival.id}-${Math.round(elapsed)}-${index}`,
          name: item.rival.name,
          color: item.rival.color,
          text: item.text,
          correct: item.correct,
        })),
      ].slice(-4));

      // Todos entenderam: não há mais nada a desenhar, a rodada acabou.
      if (correctRef.current.length >= rivals.length) closeRound();
    }, THINK_MS);

    return () => clearInterval(timer);
  }, [closeRound, decoys, outcome, rivals, sound, word]);

  /* ------------------------------------------------------------ ferramentas */

  const clear = useCallback(() => {
    strokesRef.current = [];
    currentRef.current = null;
    const ctx = canvasRef.current?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (ctx) ctx.clearRect(0, 0, w, h);
    sound?.play?.('click');
  }, [sizeRef, sound]);

  const undo = useCallback(() => {
    strokesRef.current.pop();
    const ctx = canvasRef.current?.getContext('2d');
    const { w, h } = sizeRef.current;
    if (ctx) repaint(ctx, strokesRef.current, w, h);
    sound?.play?.('tap');
  }, [sizeRef, sound]);

  /* ----------------------------------------------------------------- render */

  return (
    <div className="gscene dw">
      <GameHeader
        title="DESENHAR"
        instruction="Desenhe com o dedo. Eles chutam sozinhos."
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <div className="dw__word">
          <span className="dw__word-label">SUA PALAVRA</span>
          <strong className="dw__word-value">{word}</strong>
        </div>
        <div className="dw__solved">
          <span className="dw__solved-value">{solved}</span>
          <span className="dw__solved-label">/{rivals.length}</span>
        </div>
      </GameHeader>

      <div className="gscene__stage dw__board">
        <canvas ref={canvasRef} className="gcanvas" />

        <ul className="dw__feed" aria-live="polite">
          {guesses.map((guess) => (
            <li
              key={guess.key}
              className={`dw__guess${guess.correct ? ' dw__guess--hit' : ''}`}
            >
              <span className="dw__guess-who" style={{ color: guess.color }}>{guess.name}</span>
              <span className="dw__guess-text">{guess.text}</span>
              {guess.correct ? <span className="dw__guess-tag">ACERTOU</span> : null}
            </li>
          ))}
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

      <div className="gscene__pad dw__pad">
        <div className="dw__colors">
          {PALETTE.map((token, index) => (
            <button
              key={token}
              type="button"
              className={`dw__swatch${index === colorIndex && !erasing ? ' is-on' : ''}`}
              style={{ '--swatch': `var(${token})` }}
              aria-label={`cor ${index + 1}`}
              onPointerDown={() => { setColorIndex(index); setErasing(false); sound?.play?.('tap'); }}
            />
          ))}
        </div>

        <div className="dw__tools">
          {SIZES.map((value, index) => (
            <button
              key={value}
              type="button"
              className={`dw__tool dw__tool--size${index === sizeIndex ? ' is-on' : ''}`}
              aria-label={`espessura ${index + 1}`}
              onPointerDown={() => { setSizeIndex(index); sound?.play?.('tap'); }}
            >
              <span className="dw__dot" style={{ '--dot': `${6 + index * 7}px` }} />
            </button>
          ))}
          <button
            type="button"
            className={`dw__tool${erasing ? ' is-on' : ''}`}
            onPointerDown={() => { setErasing((value) => !value); sound?.play?.('tap'); }}
          >
            APAGAR
          </button>
          <button type="button" className="dw__tool" onPointerDown={undo}>VOLTAR</button>
          <button type="button" className="dw__tool dw__tool--warn" onPointerDown={clear}>LIMPAR</button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================= */
/* pintura                                                                    */
/* ========================================================================= */

/** Prepara o contexto para um traço. `destination-out` é o que apaga. */
function apply(ctx, stroke, w) {
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = Math.max(1.5, stroke.width * w);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function paintDot(ctx, stroke, x, y, w) {
  apply(ctx, stroke, w);
  ctx.beginPath();
  ctx.arc(x, y, ctx.lineWidth / 2, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function paintSegment(ctx, stroke, from, to, w) {
  apply(ctx, stroke, w);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

/** Repinta tudo do zero. Usado ao redimensionar e ao desfazer. */
function repaint(ctx, strokes, w, h) {
  ctx.clearRect(0, 0, w, h);
  strokes.forEach((stroke) => {
    apply(ctx, stroke, w);
    const points = stroke.pts;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x * w, points[0].y * h, ctx.lineWidth / 2, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(points[0].x * w, points[0].y * h);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x * w, points[i].y * h);
      ctx.stroke();
    }
  });
  ctx.globalCompositeOperation = 'source-over';
}
