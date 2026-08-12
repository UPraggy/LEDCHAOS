import { useCallback, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { mapPerformance } from '../../engine/botProfile.js';
import { simulateBots } from '../_shared/bots.js';
import { useGameClock, useOutcome, useRaf } from '../_shared/hooks.js';
import { useSelos } from '../_shared/Selos.jsx';
import { asset } from '../../lib/basePath.js';
import '../_shared/game.css';
import './Mash.css';

/** Toques necessários para encher a barra do zero, sem queda. */
const TAPS_TO_WIN = 55;
const GAIN = 100 / TAPS_TO_WIN;
/** Queda em % por segundo. Exige ~3,5 toques/s só para segurar a barra. */
const DRAIN = 7;
/** Quem enche a barra pontua acima de QUALQUER um que não encheu. */
const FINISH_BASE = 1000;

/**
 * MARTELO — encher a barra antes dos outros.
 *
 * A barra cai sozinha. Sem a queda, o jogo seria só "quem tem o celular mais
 * responsivo": bastaria somar toques até o fim e o placar seria uma contagem.
 * Com a queda, parar custa caro e o jogo passa a ser sobre RITMO sustentado —
 * dá para virar o jogo no fim, e dá para perder o que já se ganhou.
 *
 * A rodada fecha no instante em que você chega a 100%. É uma corrida: acabou
 * quando alguém cruza a linha, não quando o relógio zera.
 */
export default function Mash({
  players, localPlayerId, duration, effects, rng, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const hidden = !!effects?.hidden;

  const overRef = useRef(false);
  const startRef = useRef(performance.now());
  const fillRef = useRef(0);
  const tapsRef = useRef(0);
  const shownRef = useRef(0);

  const [percent, setPercent] = useState(0);
  const [taps, setTaps] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  // Selos de marco: dois carimbos no meio do campo que transformam "encher a
  // barra" numa corrida com balizas. Não há selo por toque — a martelada já é
  // rápida demais para caber um setState por dedo (ver useRaf abaixo).
  const { center: fireMilestone, layer: selosLayer } = useSelos({ max: 2 });
  const milesRef = useRef({ half: false, final: false });

  /* Cada adversário recebe o instante em que TERMINARIA a barra. Quem passa do
     tempo da rodada simplesmente não termina — e a barra dele para onde parou. */
  const [rivalRuns] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => ({
    finishMs: Math.round(mapPerformance(perf, duration * 1.3, duration * 0.42)),
  })));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback((finishMs) => {
    if (overRef.current) return;
    overRef.current = true;

    const done = finishMs != null;
    const reached = done ? 100 : Math.floor(fillRef.current);
    const myTaps = tapsRef.current;

    end({
      entries: [
        {
          playerId: localPlayerId,
          score: scoreOf(done ? finishMs : null, reached, duration),
          display: done ? `${(finishMs / 1000).toFixed(1)}s` : `${reached}%`,
          stat: { taps: myTaps },
        },
        ...rivalRuns.map((run) => {
          const rivalDone = run.finishMs <= duration;
          const rivalPercent = Math.min(100, Math.round((duration / run.finishMs) * 100));
          return {
            playerId: run.playerId,
            score: scoreOf(rivalDone ? run.finishMs : null, rivalPercent, duration),
            display: rivalDone ? `${(run.finishMs / 1000).toFixed(1)}s` : `${rivalPercent}%`,
          };
        }),
      ],
      value: done ? `${(finishMs / 1000).toFixed(1)}s` : `${reached}%`,
      label: done ? 'PARA ENCHER' : 'DA BARRA',
      tone: done ? 'good' : reached >= 60 ? 'neutral' : 'bad',
      note: `${myTaps} toques`,
    });
  }, [duration, end, localPlayerId, rivalRuns]);

  const { remaining } = useGameClock(duration, () => closeRound(null), !outcome);

  /* ------------------------------------------------------------------ toque */

  const hit = useCallback(() => {
    if (overRef.current) return;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    fillRef.current = Math.min(100, fillRef.current + GAIN);
    sound?.play?.('tap');

    // Marcos disparam uma única vez cada, na subida. A barra também cai, então
    // guardo a passagem num flag em vez de comparar o valor atual — reencostar
    // no 50% depois de escorregar não recarimba.
    const miles = milesRef.current;
    if (!miles.half && fillRef.current >= 50) {
      miles.half = true;
      fireMilestone({ text: 'METADE!', tone: 'accent', ttl: 720 });
    }
    if (!miles.final && fillRef.current >= 80) {
      miles.final = true;
      // Lima, não âmbar: aos 80% o tubo já está quase todo laranja, e um selo
      // âmbar sobre laranja viveria só do contorno. O verde-lima crava por cima.
      fireMilestone({ text: 'RETA FINAL!', tone: 'good', ttl: 820 });
    }

    if (fillRef.current >= 100) {
      setPercent(100);
      sound?.play?.('victory');
      closeRound(Math.round(performance.now() - startRef.current));
    }
  }, [closeRound, sound, fireMilestone]);

  /* --------------------------------------------------------------- a queda */

  // A barra só existe como número inteiro no estado: 100 valores possíveis em
  // 15 segundos é barato, e a transição de 90ms do CSS costura o resto. Nunca
  // um setState por frame.
  useRaf((dt) => {
    if (overRef.current) return;
    fillRef.current = Math.max(0, fillRef.current - DRAIN * timeScale * dt);
    const next = Math.floor(fillRef.current);
    if (next !== shownRef.current) {
      shownRef.current = next;
      setPercent(next);
    }
  }, !outcome);

  /* ---------------------------------------------------------------- render */

  const elapsed = duration - remaining;
  const rivals = rivalRuns.map((run) => {
    const player = players.find((item) => item.id === run.playerId);
    return {
      id: run.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: Math.min(100, Math.round((elapsed / run.finishMs) * 100)),
    };
  });

  return (
    <div className="gscene ms" style={{ '--ms-scale': sizeScale }}>
      <GameHeader
        title="MARTELO"
        instruction="Toque sem parar até encher."
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="TOQUES" value={taps} tone="accent" pulseKey={taps} />
      </GameHeader>

      <div className="gscene__stage ms__stage">
        <div className={`ms__tube${percent >= 100 ? ' is-full' : ''}`}>
          <div className="ms__fill" style={{ height: `${percent}%` }} />
          {/* A linha de chegada precisa estar desenhada o tempo todo: saber o
              quanto falta é metade da tensão do jogo. */}
          <div className="ms__goal" aria-hidden="true" />
          <div className="ms__percent" role="status" aria-live="off">{percent}%</div>
        </div>

        <RivalBars rivals={rivals} max={100} />
        {selosLayer}
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

      <div className="gscene__pad ms__pad">
        <button
          type="button"
          className="ms__tap"
          aria-label="toque para encher a barra"
          disabled={!!outcome}
          // onPointerDown, não onClick: em celular o clique só nasce ao SOLTAR,
          // e isso cortaria a metade da velocidade de quem martela de verdade.
          // Um pointer por dedo, então os dois polegares contam — e usar os
          // dois é estratégia legítima num jogo chamado MARTELO.
          onPointerDown={hit}
        >
          <img className="ms__bolt" src={asset('/assets/jogo/raio.png')} alt="" draggable="false" />
          <span className="ms__tap-text">TOQUE!</span>
          <img className="ms__bolt ms__bolt--flip" src={asset('/assets/jogo/raio.png')} alt="" draggable="false" />
        </button>
      </div>
    </div>
  );
}

/**
 * Terminar sempre vale mais do que não terminar.
 *
 * O piso de quem encheu (1000) fica acima do teto de quem não encheu (99% →
 * 891), então nenhuma barra quase cheia passa na frente de uma barra cheia.
 */
function scoreOf(finishMs, reached, duration) {
  if (finishMs == null) return Math.round(reached * 9);
  return FINISH_BASE + Math.round((duration - finishMs) / 10);
}
