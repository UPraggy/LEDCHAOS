import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import { attachPointer } from '../../engine/inputManager.js';
import { mapPerformance } from '../../engine/botProfile.js';
import { simulateBots } from '../_shared/bots.js';
import { useGameClock, useOutcome } from '../_shared/hooks.js';
import '../_shared/game.css';
import './Reaction.css';

/** Quantas chances cada um tem. Vale o MELHOR tempo, não a média. */
const ATTEMPTS = 3;
/** Pausa entre uma tentativa e a próxima. */
const HOLD = 900;
/** Tentativa queimada por tocar cedo. Pior que qualquer reflexo humano real. */
const EARLY_MS = 999;
const MIN_WAIT = 900;
const MAX_WAIT = 2600;

/**
 * REFLEXO — espere o sinal e toque.
 *
 * A tela inteira é o alvo: em celular, o gesto mais rápido possível é bater o
 * polegar onde ele já está. Alvo pequeno mediria mira, não reflexo.
 *
 * INVERTIDO troca o sinal: em vez de tocar quando acende, toque quando apaga.
 * A regra muda, o gesto não — dá para entender em menos de 5 segundos.
 */
export default function Reaction({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const invert = !!effects?.invert;

  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState('wait'); // wait | armed | hit | early
  const [times, setTimes] = useState([]);
  const [last, setLast] = useState(null);
  const [outcome, end] = useOutcome(onFinish);

  const stageRef = useRef(null);
  const modeRef = useRef(mode);
  const timesRef = useRef([]);
  const armedAtRef = useRef(0);
  const holdRef = useRef(0);
  const overRef = useRef(false);
  modeRef.current = mode;

  useEffect(() => () => clearTimeout(holdRef.current), []);

  /* ------------------------------------------------------------- fechamento */

  const closeRound = useCallback((list) => {
    if (overRef.current) return;
    overRef.current = true;
    clearTimeout(holdRef.current);

    const valid = list.filter((ms) => ms < EARLY_MS);
    const best = valid.length ? Math.round(Math.min(...valid)) : null;

    // score serve só para ordenar: quanto menor o tempo, maior o número.
    const mine = {
      playerId: localPlayerId,
      score: best == null ? 0 : Math.max(1, 10000 - best),
      display: best == null ? '—' : `${best}ms`,
      ...(best == null ? {} : { stat: { reactionMs: best } }),
    };

    const bots = simulateBots(players, localPlayerId, rng, (perf) => {
      const ms = Math.round(mapPerformance(perf, 620, 155));
      return { score: Math.max(1, 10000 - ms), display: `${ms}ms`, stat: { reactionMs: ms } };
    });

    end({
      entries: [mine, ...bots],
      value: best == null ? '—' : `${best}ms`,
      label: best == null ? 'NENHUM TEMPO VÁLIDO' : 'SEU MELHOR TEMPO',
      tone: best == null ? 'bad' : 'good',
      note: best == null ? 'Você tocou cedo nas três.' : null,
    });
  }, [players, localPlayerId, rng, end]);

  const { remaining } = useGameClock(duration, () => closeRound(timesRef.current), !outcome);

  /* -------------------------------------------------------------- tentativa */

  // Cada tentativa arma o sinal com um atraso diferente. Aleatório de verdade:
  // se fosse fixo, dava para decorar o tempo e "reagir" antes do estímulo.
  useEffect(() => {
    if (overRef.current) return undefined;
    setMode('wait');
    setLast(null);
    const wait = rng.range(MIN_WAIT, MAX_WAIT);
    const t = setTimeout(() => {
      if (overRef.current) return;
      armedAtRef.current = performance.now();
      setMode('armed');
      sound?.play?.('tick');
    }, wait);
    return () => clearTimeout(t);
  }, [attempt, rng, sound]);

  const commit = useCallback((ms) => {
    timesRef.current = [...timesRef.current, ms];
    setTimes(timesRef.current);
    const list = timesRef.current;
    clearTimeout(holdRef.current);
    holdRef.current = setTimeout(() => {
      if (list.length >= ATTEMPTS) closeRound(list);
      else setAttempt((value) => value + 1);
    }, HOLD);
  }, [closeRound]);

  const press = useCallback(() => {
    if (overRef.current) return;
    if (modeRef.current === 'armed') {
      const ms = Math.max(1, performance.now() - armedAtRef.current);
      sound?.play?.('hit');
      setMode('hit');
      setLast({ ms: Math.round(ms), early: false });
      commit(ms);
      return;
    }
    if (modeRef.current === 'wait') {
      // Queima a tentativa em vez de encerrar a rodada: errar não pode tirar o
      // jogador do jogo antes dos outros.
      sound?.play?.('miss');
      setMode('early');
      setLast({ ms: null, early: true });
      commit(EARLY_MS);
    }
  }, [commit, sound]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    // onDown, não onTap: onTap só dispara ao soltar o dedo, e isso somaria o
    // tempo de soltar ao reflexo medido.
    return attachPointer(el, { onDown: press }, { bus, playerId: localPlayerId });
  }, [press, bus, localPlayerId]);

  /* ------------------------------------------------------------------ visual */

  const lit = invert ? mode === 'wait' : mode === 'armed';
  const best = timesRef.current.filter((ms) => ms < EARLY_MS);
  const bestLabel = best.length ? `${Math.round(Math.min(...best))}ms` : '—';

  return (
    <div className="gscene rx">
      <GameHeader
        title="REFLEXO"
        instruction={invert ? 'Toque quando a tela APAGAR.' : 'Toque quando a tela ACENDER.'}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="MELHOR" value={bestLabel} tone="good" pulseKey={times.length} />
        <ScoreBadge
          label="TENTATIVA"
          value={`${Math.min(times.length + 1, ATTEMPTS)}/${ATTEMPTS}`}
        />
      </GameHeader>

      <div className="gscene__stage">
        <div
          ref={stageRef}
          className={[
            'rx__field',
            lit ? 'is-lit' : '',
            mode === 'early' ? 'is-early' : '',
            mode === 'hit' ? 'is-hit' : '',
          ].join(' ').trim()}
        >
          <div className="gcue">
            {mode === 'wait' ? (
              <>
                <p className="gcue__big rx__cue">ESPERE</p>
                <p className="gcue__small">
                  {invert ? 'não toque enquanto estiver aceso' : 'não toque antes do sinal'}
                </p>
              </>
            ) : null}

            {mode === 'armed' ? <p className="gcue__big rx__cue rx__cue--go">TOQUE!</p> : null}

            {mode === 'hit' ? (
              <>
                <p className="gcue__big rx__cue rx__cue--time">{last?.ms}ms</p>
                <p className="gcue__small">{verdict(last?.ms)}</p>
              </>
            ) : null}

            {mode === 'early' ? (
              <>
                <p className="gcue__big rx__cue rx__cue--bad">CEDO DEMAIS</p>
                <p className="gcue__small">tentativa perdida</p>
              </>
            ) : null}
          </div>
        </div>

        <ul className="rx__dots" aria-label="tentativas">
          {Array.from({ length: ATTEMPTS }, (_, index) => {
            const value = timesRef.current[index];
            const state = value == null ? 'idle' : value >= EARLY_MS ? 'bad' : 'ok';
            return (
              <li key={index} className={`rx__dot rx__dot--${state}`}>
                {value == null ? '·' : value >= EARLY_MS ? '✕' : Math.round(value)}
              </li>
            );
          })}
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

/** Comentário curto sobre o tempo. Serve para o jogador saber se foi bom. */
function verdict(ms) {
  if (ms == null) return '';
  if (ms < 180) return 'absurdo';
  if (ms < 240) return 'muito rápido';
  if (ms < 320) return 'bom';
  if (ms < 450) return 'dá para melhorar';
  return 'devagar';
}
