import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Screen from '../../components/Screen';
import Countdown from '../../components/Countdown';
import ChaosEventBanner from '../../components/ChaosEventBanner';
import ErrorBoundary from '../../components/ErrorBoundary';
import RoundResult from './RoundResult.jsx';
import { useGame } from '../../state/GameProvider.jsx';
import { normalizeRoomCode } from '../../room/roomCode.js';
import { getGame } from '../../engine/gameRegistry.js';
import { PHASES, TIMING, WATCHDOG_GRACE, roundRng } from '../../engine/roundManager.js';
import { playSound, playNote, playDrum, scaleFreq } from '../../audio/soundManager.js';
import './Game.css';

/** Quanto tempo o cartão de erro fica na tela antes de pular sozinho. */
const ERROR_HOLD = 1800;

/**
 * Game — o motor da partida em forma de tela.
 *
 * Ela não sabe jogar nada. Ela só conduz a máquina de fases e entrega ao
 * microjogo um contrato fixo de props. Regra que não se quebra: NENHUMA fase
 * espera clique. Intro, contagem e resultado avançam por timer; o microjogo
 * avança chamando onFinish. Se nada disso acontecer, o watchdog avança.
 *
 * Contrato do microjogo (não mude sem atualizar 01-ARQUITETURA.md):
 *   { players, localPlayerId, duration, effects, rng, bus, sound,
 *     round, totalRounds, onFinish }
 *
 * onFinish(entries) → [{ playerId, score, display?, stat? }, …]
 *   `score` é só para ordenar (maior = melhor). Os PONTOS da partida saem da
 *   colocação, no scoreManager — o microjogo não decide pontuação.
 */
export default function Game() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const {
    room, match, bus, mergeEntries,
    setPhase, finishRound, skipRound, nextRound,
  } = useGame();

  const code = normalizeRoomCode(roomId || '');
  const phase = match?.phase ?? null;
  const round = match?.round ?? 0;
  const error = match?.error ?? null;
  const game = match ? getGame(match.gameId) : null;

  // Trava contra onFinish duplicado dentro da MESMA rodada (jogo que chama no
  // clique e de novo no fim do tempo). O reducer também blinda por fase; aqui é
  // barato e evita até o dispatch.
  const doneRef = useRef(0);

  /* ------------------------------------------------------- intro → contagem */
  useEffect(() => {
    if (phase !== PHASES.INTRO) return undefined;
    playSound('roundStart');
    const t = setTimeout(() => setPhase(PHASES.COUNTDOWN), TIMING.intro);
    return () => clearTimeout(t);
  }, [phase, round, setPhase]);

  /* ------------------------------------------- contagem pulada (só em debug) */
  useEffect(() => {
    if (phase !== PHASES.COUNTDOWN || !match?.skipCountdown) return undefined;
    const t = setTimeout(() => setPhase(PHASES.PLAYING), 0);
    return () => clearTimeout(t);
  }, [phase, round, match?.skipCountdown, setPhase]);

  /* ----------------------------------------------------------- watchdog */
  // Se o microjogo travar, congelar ou esquecer de terminar, a partida não
  // morre com ele: passa da hora + folga e a rodada é abortada.
  useEffect(() => {
    if (phase !== PHASES.PLAYING || !game) return undefined;
    const t = setTimeout(() => skipRound('watchdog'), game.duration + WATCHDOG_GRACE);
    return () => clearTimeout(t);
  }, [phase, round, game, skipRound]);

  /* ------------------------------------------------------- erro → próxima */
  useEffect(() => {
    if (!error) return undefined;
    playSound('miss');
    const t = setTimeout(() => nextRound(), ERROR_HOLD);
    return () => clearTimeout(t);
  }, [error, round, nextRound]);

  /* --------------------------------------------------------- fim da partida */
  useEffect(() => {
    if (phase === PHASES.FINAL) navigate(`/results/${code}`, { replace: true });
  }, [phase, code, navigate]);

  /* ------------------------------------------------- props fixas do microjogo */
  // Contrato de som do microjogo: play(nome) e note(freq) sempre existiram.
  // drum(nome) e scale(root,i) são a camada musical do jogo de música (BEAT).
  const sound = useMemo(
    () => ({ play: playSound, note: playNote, drum: playDrum, scale: scaleFreq }),
    [],
  );
  const rng = useMemo(
    () => (match ? roundRng(match.seed, match.round) : null),
    [match?.seed, match?.round], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleFinish = useMemo(() => (entries) => {
    if (doneRef.current === round) return;
    doneRef.current = round;
    // F7-C: onde o adversário fabricado cede lugar ao celular de verdade. Se
    // ninguém reportou (jogo local), `mergeEntries` devolve a lista intacta.
    finishRound(mergeEntries(round, entries));
  }, [round, finishRound, mergeEntries]);

  /* --------------------------------------------------------------- guardas */
  if (!room || room.id !== code) return <Navigate to={`/join/${code}`} replace />;
  if (!match) return <Navigate to={`/room/${code}`} replace />;
  if (phase === PHASES.FINAL) return null; // o efeito acima já está navegando

  /* ------------------------------------------------------------- erro visível */
  if (error) {
    return (
      <Screen layout="center" hue={game?.hue}>
        <div className="game__error" role="alert">
          <p className="game__errorEmoji" aria-hidden="true">💥</p>
          <p className="game__errorTitle u-display">ERRO NO JOGO</p>
          <p className="game__errorText">
            {game ? `${game.name} não conseguiu terminar. ` : ''}
            Ninguém perde pontos. Indo para o próximo desafio…
          </p>
        </div>
      </Screen>
    );
  }

  /* ------------------------------------------------------------------ fases */
  if (phase === PHASES.RESULT) return <RoundResult />;

  if (phase === PHASES.INTRO) {
    return (
      <Screen layout="center" hue={game?.hue}>
        <div className="game__intro" key={round}>
          <p className="game__introRound u-label">
            DESAFIO {round} DE {match.totalRounds}
          </p>
          <p className="game__introEmoji" aria-hidden="true">{game?.emoji || '🎮'}</p>
          <h1 className="game__introName u-display">{game?.name || 'DESAFIO'}</h1>
          <p className="game__introText">{game?.instruction || 'Prepare-se.'}</p>
          {match.chaosEvent ? <ChaosEventBanner event={match.chaosEvent} /> : null}
        </div>
      </Screen>
    );
  }

  if (phase === PHASES.COUNTDOWN) {
    return (
      <Screen layout="center" hue={game?.hue}>
        {match.skipCountdown ? null : (
          <Countdown
            key={round}
            from={3}
            onDone={() => setPhase(PHASES.PLAYING)}
            title={game?.name}
            hint={game?.instruction}
          />
        )}
      </Screen>
    );
  }

  /* --------------------------------------------------------------- jogando */
  const GameComponent = game?.Component;

  if (!GameComponent) {
    // Fila apontando para um jogo que não existe mais. Não trava: aborta a rodada.
    return (
      <Screen layout="center">
        <div className="game__error" role="alert">
          <p className="game__errorEmoji" aria-hidden="true">🕳️</p>
          <p className="game__errorTitle u-display">DESAFIO INDISPONÍVEL</p>
          <p className="game__errorText">Pulando…</p>
          <MissingGame onMissing={skipRound} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen layout="flush" hue={game.hue} className="game">
      <ErrorBoundary
        resetKey={round}
        label={game.name}
        onError={() => skipRound('crash')}
      >
        <GameComponent
          key={`${game.id}-${round}`}
          players={room.players}
          localPlayerId={room.hostId}
          duration={game.duration}
          effects={match.effects}
          rng={rng}
          bus={bus}
          sound={sound}
          round={round}
          totalRounds={match.totalRounds}
          onFinish={handleFinish}
        />
      </ErrorBoundary>
    </Screen>
  );
}

/** Dispara o skip no próximo tick — não dá para despachar durante o render. */
function MissingGame({ onMissing }) {
  useEffect(() => {
    const t = setTimeout(() => onMissing('missing'), 600);
    return () => clearTimeout(t);
  }, [onMissing]);
  return null;
}
