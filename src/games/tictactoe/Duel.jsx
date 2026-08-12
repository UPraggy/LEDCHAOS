import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { mapPerformance } from '../../engine/botProfile.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { useGameClock, useOutcome } from '../_shared/hooks.js';
import '../_shared/game.css';
import './Duel.css';

const ME = 'X';
const FOE = 'O';

/** As oito linhas, com as pontas em coordenadas de célula (0..3). */
const LINES = [
  { cells: [0, 1, 2], x1: 0.15, y1: 0.5, x2: 2.85, y2: 0.5 },
  { cells: [3, 4, 5], x1: 0.15, y1: 1.5, x2: 2.85, y2: 1.5 },
  { cells: [6, 7, 8], x1: 0.15, y1: 2.5, x2: 2.85, y2: 2.5 },
  { cells: [0, 3, 6], x1: 0.5, y1: 0.15, x2: 0.5, y2: 2.85 },
  { cells: [1, 4, 7], x1: 1.5, y1: 0.15, x2: 1.5, y2: 2.85 },
  { cells: [2, 5, 8], x1: 2.5, y1: 0.15, x2: 2.5, y2: 2.85 },
  { cells: [0, 4, 8], x1: 0.28, y1: 0.28, x2: 2.72, y2: 2.72 },
  { cells: [2, 4, 6], x1: 2.72, y1: 0.28, x2: 0.28, y2: 2.72 },
];

const EMPTY = Array(9).fill(null);
const THINK_MS = 480;
const SHOW_MS = 1000;

/**
 * DUELO — jogo da velha em série contra a máquina.
 *
 * Uma partida só duraria oito segundos e deixaria metade da rodada vazia; por
 * isso o placar não é a partida, é quantas você fecha antes do tempo acabar.
 * Isso também conserta o empate: no jogo da velha bem jogado o empate é o
 * normal, e aqui empatar rápido ainda te move para a próxima chance.
 *
 * A máquina erra de propósito. Uma IA perfeita empata sempre, e um microjogo
 * onde ninguém ganha não é um microjogo — é uma parede.
 */
export default function Duel({
  players, localPlayerId, duration, effects, rng, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const misere = !!effects?.invert;
  const hidden = !!effects?.hidden;

  const overRef = useRef(false);
  const tallyRef = useRef({ wins: 0, draws: 0, losses: 0 });

  const [board, setBoard] = useState(EMPTY);
  const [turn, setTurn] = useState(ME);
  const [verdict, setVerdict] = useState(null);
  const [tally, setTally] = useState({ wins: 0, draws: 0, losses: 0 });
  const [outcome, end] = useOutcome(onFinish);

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const wins = Math.round(mapPerformance(perf, 0.4, 3.4));
    const draws = Math.round(mapPerformance(1 - perf, 0.2, 1.8));
    return { score: wins * 100 + draws * 25, display: `${wins}V` };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback(() => {
    if (overRef.current) return;
    overRef.current = true;
    const { wins, draws, losses } = tallyRef.current;
    const score = wins * 100 + draws * 25;

    end({
      entries: [
        { playerId: localPlayerId, score, display: `${wins}V ${draws}E ${losses}D` },
        ...rivalFinals,
      ],
      value: `${wins}`,
      label: 'VITÓRIAS',
      tone: wins >= 2 ? 'good' : wins >= 1 ? 'neutral' : 'bad',
      note: `${draws} empate(s) · ${losses} derrota(s)`,
    });
  }, [end, localPlayerId, rivalFinals]);

  const { remaining } = useGameClock(duration, closeRound, !outcome);

  /* ------------------------------------------------------------- partida */

  const settle = useCallback((next, mover) => {
    const line = findLine(next, mover);
    if (line) {
      // No modo maldito, fechar a linha é derrota. Quem fechou perde.
      const winner = misere ? other(mover) : mover;
      return { line, winner };
    }
    if (next.every(Boolean)) return { line: null, winner: null };
    return null;
  }, [misere]);

  const apply = useCallback((next, mover) => {
    setBoard(next);
    const done = settle(next, mover);
    if (!done) {
      setTurn(other(mover));
      return;
    }

    const tallyNow = tallyRef.current;
    if (done.winner === ME) { tallyNow.wins += 1; sound?.play?.('victory'); }
    else if (done.winner === FOE) { tallyNow.losses += 1; sound?.play?.('miss'); }
    else { tallyNow.draws += 1; sound?.play?.('tick'); }

    setTally({ ...tallyNow });
    setVerdict(done);
  }, [settle, sound]);

  const play = useCallback((index) => {
    if (overRef.current || verdict || turn !== ME || board[index]) return;
    sound?.play?.('tap');
    const next = board.slice();
    next[index] = ME;
    apply(next, ME);
  }, [apply, board, sound, turn, verdict]);

  /* Vez da máquina. */
  useEffect(() => {
    if (outcome || verdict || turn !== FOE) return undefined;
    const timer = setTimeout(() => {
      const index = chooseMove(board, rng, misere);
      if (index < 0) return;
      const next = board.slice();
      next[index] = FOE;
      apply(next, FOE);
    }, Math.max(120, Math.round(THINK_MS / timeScale)));
    return () => clearTimeout(timer);
  }, [apply, board, misere, outcome, rng, timeScale, turn, verdict]);

  /* Fim de partida: mostra a linha e recomeça sozinho. */
  useEffect(() => {
    if (!verdict || outcome) return undefined;
    const timer = setTimeout(() => {
      setBoard(EMPTY);
      setVerdict(null);
      // Quem começa alterna a cada partida: sair sempre na frente contra uma
      // IA que erra deixaria a rodada fácil demais.
      const played = tallyRef.current.wins + tallyRef.current.draws + tallyRef.current.losses;
      setTurn(played % 2 === 0 ? ME : FOE);
    }, Math.max(400, Math.round(SHOW_MS / timeScale)));
    return () => clearTimeout(timer);
  }, [outcome, timeScale, verdict]);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, Math.max(0, 1 - remaining / duration));
  const score = tally.wins * 100 + tally.draws * 25;
  const ceiling = Math.max(score, ...rivalFinals.map((entry) => entry.score), 200);
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(entry.score, ratio, index * 1.2),
    };
  });

  const mood = verdict
    ? verdict.winner === ME ? 'win' : verdict.winner === FOE ? 'lose' : 'draw'
    : turn === ME ? 'you' : 'wait';
  const status = {
    win: 'VOCÊ VENCEU', lose: 'VOCÊ PERDEU', draw: 'EMPATE',
    you: 'SUA VEZ', wait: 'PENSANDO…',
  }[mood];

  return (
    <div className="gscene du" style={{ '--du-scale': sizeScale }}>
      <GameHeader
        title="DUELO"
        instruction={misere ? 'MALDITO: fechar 3 em linha faz VOCÊ perder.' : 'Feche três em linha antes dela.'}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="VITÓRIAS" value={tally.wins} tone="good" pulseKey={tally.wins} />
        <ScoreBadge label="EMPATES" value={tally.draws} tone="neutral" size="sm" />
      </GameHeader>

      <div className="gscene__stage du__stage">
        <div className={`du__status du__status--${mood}`} key={status}>
          {status}
        </div>

        <div className="du__board">
          {board.map((mark, index) => (
            <button
              key={index}
              type="button"
              className={`du__cell${mark ? ` is-${mark === ME ? 'me' : 'foe'}` : ''}`}
              aria-label={`casa ${index + 1}${mark ? `, ${mark === ME ? 'você' : 'máquina'}` : ', vazia'}`}
              disabled={!!mark || turn !== ME || !!verdict || !!outcome}
              onPointerDown={() => play(index)}
            >
              <span className="du__mark" aria-hidden="true">{mark === ME ? '✕' : mark === FOE ? '◯' : ''}</span>
            </button>
          ))}

          {verdict?.line ? (
            <svg className="du__line" viewBox="0 0 3 3" aria-hidden="true">
              <line
                x1={verdict.line.x1}
                y1={verdict.line.y1}
                x2={verdict.line.x2}
                y2={verdict.line.y2}
                pathLength="1"
              />
            </svg>
          ) : null}
        </div>

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
/* regras                                                                     */
/* ========================================================================= */

function other(mark) { return mark === ME ? FOE : ME; }

function findLine(board, mark) {
  for (let i = 0; i < LINES.length; i += 1) {
    const line = LINES[i];
    if (line.cells.every((cell) => board[cell] === mark)) return line;
  }
  return null;
}

/** Índice que fecha a linha de `mark`, ou -1. */
function winningMove(board, mark) {
  for (let i = 0; i < LINES.length; i += 1) {
    const cells = LINES[i].cells;
    const mine = cells.filter((cell) => board[cell] === mark).length;
    const free = cells.filter((cell) => !board[cell]);
    if (mine === 2 && free.length === 1) return free[0];
  }
  return -1;
}

/**
 * A máquina.
 *
 * Ganhar > bloquear > centro > canto > resto, com uma chance real de jogar
 * qualquer coisa. Essa chance é o que mantém o jogo ganhável: sem ela o jogo
 * da velha empata para sempre e o microjogo perde a graça.
 */
function chooseMove(board, rng, misere) {
  const free = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
  if (!free.length) return -1;

  if (misere) {
    // Maldito: fugir de fechar a própria linha é a única regra que importa.
    const safe = free.filter((index) => {
      const test = board.slice();
      test[index] = FOE;
      return !findLine(test, FOE);
    });
    const pool = safe.length ? safe : free;
    return pool[rng.int(0, pool.length - 1)];
  }

  if (rng.chance(0.22)) return free[rng.int(0, free.length - 1)];

  const win = winningMove(board, FOE);
  if (win >= 0) return win;

  const block = winningMove(board, ME);
  if (block >= 0 && !rng.chance(0.18)) return block;

  if (!board[4]) return 4;

  const corners = [0, 2, 6, 8].filter((index) => !board[index]);
  if (corners.length) return corners[rng.int(0, corners.length - 1)];

  return free[rng.int(0, free.length - 1)];
}
