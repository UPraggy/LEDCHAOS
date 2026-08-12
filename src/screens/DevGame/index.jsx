import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GAMES, getGame } from '../../engine/gameRegistry.js';
import { createRng, randomSeed } from '../../engine/random.js';
import { createActionBus } from '../../engine/inputManager.js';
import { playSound, playNote, playDrum, scaleFreq } from '../../audio/soundManager.js';
import './DevGame.css';

/**
 * DevGame — bancada de teste de microjogo (SÓ EM DESENVOLVIMENTO).
 *
 * O app real só chega num microjogo pelo fluxo criar→lobby→partida, e a rodada
 * sorteia o jogo. Testar UM jogo (contraste, assets, física) por esse caminho é
 * lento e escorregadio. Esta tela monta qualquer jogo do registro isolado, com o
 * MESMO contrato de props que o motor entrega, mais botões para ligar os efeitos
 * do CHAOS e repetir a rodada. Não vai para produção: a rota é cortada fora de
 * import.meta.env.DEV e o componente entra por import dinâmico.
 *
 *   /dev            grade com todos os jogos
 *   /dev/:gameId    monta aquele jogo
 */

/** Jogadores de mentira: um humano (eu) + três bots com cor e nome. */
const PLAYERS = [
  { id: 'p1', name: 'VOCÊ', color: 'hsl(268 84% 64%)', avatar: 'punk' },
  { id: 'p2', name: 'PANDA', color: 'hsl(190 82% 58%)', avatar: 'panda' },
  { id: 'p3', name: 'ROBÔ', color: 'hsl(48 96% 56%)', avatar: 'robo' },
  { id: 'p4', name: 'GATA', color: 'hsl(4 84% 62%)', avatar: 'gata' },
];

const LOCAL_ID = 'p1';

/** Efeitos do CHAOS que a bancada sabe alternar, com seus ciclos de valores. */
const TOGGLES = [
  { key: 'timeScale', label: 'TEMPO', cycle: [1, 0.5, 1.6], fmt: (v) => `${v}x` },
  { key: 'sizeScale', label: 'TAMANHO', cycle: [1, 0.7, 1.4], fmt: (v) => `${v}x` },
  { key: 'scoreMultiplier', label: 'PONTOS', cycle: [1, 2, 3], fmt: (v) => `${v}x` },
  { key: 'oneLife', label: 'UMA VIDA', cycle: [false, true], fmt: (v) => (v ? 'ON' : 'off') },
  { key: 'hidden', label: 'PENUMBRA', cycle: [false, true], fmt: (v) => (v ? 'ON' : 'off') },
  { key: 'invert', label: 'INVERTER', cycle: [false, true], fmt: (v) => (v ? 'ON' : 'off') },
];

export default function DevGame() {
  const { gameId } = useParams();
  const game = gameId ? getGame(gameId) : null;

  if (!gameId) return <Picker />;
  if (!game) return <Missing id={gameId} />;
  return <Bench game={game} />;
}

/* ------------------------------------------------------------------ grade */

function Picker() {
  return (
    <div className="dev">
      <header className="dev__top">
        <h1 className="dev__title u-display">BANCADA</h1>
        <Link className="dev__back" to="/">← app</Link>
      </header>
      <p className="dev__hint">{GAMES.length} jogos no registro. Toque para abrir isolado.</p>
      <div className="dev__grid">
        {GAMES.map((g) => (
          <Link key={g.id} className="dev__card" to={`/dev/${g.id}`} style={{ '--game-hue': g.hue }}>
            <span className="dev__emoji" aria-hidden="true">{g.emoji}</span>
            <span className="dev__name u-display">{g.name}</span>
            <span className="dev__id">{g.id}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Missing({ id }) {
  return (
    <div className="dev">
      <header className="dev__top">
        <h1 className="dev__title u-display">SEM ESSE JOGO</h1>
        <Link className="dev__back" to="/dev">← bancada</Link>
      </header>
      <p className="dev__hint">Nenhum jogo com id "{id}" no registro.</p>
    </div>
  );
}

/* --------------------------------------------------------------- bancada */

function Bench({ game }) {
  const [effects, setEffects] = useState({});
  const [result, setResult] = useState(null);
  const [runKey, setRunKey] = useState(1);
  const seedRef = useRef(randomSeed());

  // Barramento e som são estáveis pela vida da bancada; a rng nasce de novo a
  // cada corrida para a partida ser reproduzível dentro da mesma seed base.
  const bus = useMemo(() => createActionBus(), []);
  const sound = useMemo(
    () => ({ play: playSound, note: playNote, drum: playDrum, scale: scaleFreq }),
    [],
  );
  const rng = useMemo(() => createRng((seedRef.current ^ (runKey * 0x9e3779b1)) >>> 0), [runKey]);

  const GameComponent = game.Component;

  function cycle(toggle) {
    setEffects((prev) => {
      const cur = prev[toggle.key] ?? toggle.cycle[0];
      const idx = toggle.cycle.indexOf(cur);
      const nextVal = toggle.cycle[(idx + 1) % toggle.cycle.length];
      const nextEffects = { ...prev };
      if (nextVal === toggle.cycle[0]) delete nextEffects[toggle.key];
      else nextEffects[toggle.key] = nextVal;
      return nextEffects;
    });
  }

  function replay() {
    setResult(null);
    setRunKey((k) => k + 1);
  }

  const ranked = result
    ? [...result]
        .map((e) => ({ ...e, player: PLAYERS.find((p) => p.id === e.playerId) }))
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    : null;

  return (
    <div className="dev dev--bench">
      <div className="dev__bar">
        <Link className="dev__back" to="/dev">←</Link>
        <span className="dev__badge u-display" style={{ '--game-hue': game.hue }}>
          {game.emoji} {game.name}
        </span>
        <div className="dev__toggles">
          {TOGGLES.map((t) => {
            const val = effects[t.key] ?? t.cycle[0];
            const on = val !== t.cycle[0];
            return (
              <button
                key={t.key}
                type="button"
                className={`dev__toggle${on ? ' is-on' : ''}`}
                onClick={() => cycle(t)}
              >
                <b>{t.label}</b>
                <i>{t.fmt(val)}</i>
              </button>
            );
          })}
        </div>
        <button type="button" className="dev__replay" onClick={replay}>↻ repetir</button>
      </div>

      <div className="dev__stage" style={{ '--game-hue': game.hue }}>
        <GameComponent
          key={`${game.id}-${runKey}`}
          players={PLAYERS}
          localPlayerId={LOCAL_ID}
          duration={game.duration}
          effects={effects}
          rng={rng}
          bus={bus}
          sound={sound}
          round={1}
          totalRounds={5}
          onFinish={(entries) => setResult(entries)}
        />
      </div>

      {ranked ? (
        <div className="dev__result">
          <div className="dev__resultHead">
            <b className="u-display">FIM · onFinish</b>
            <button type="button" className="dev__replay" onClick={replay}>jogar de novo</button>
          </div>
          <ol className="dev__ranks">
            {ranked.map((e, i) => (
              <li key={e.playerId} className={e.playerId === LOCAL_ID ? 'is-me' : ''}>
                <span className="dev__rank">{i + 1}</span>
                <span className="dev__who" style={{ color: e.player?.color }}>
                  {e.player?.name || e.playerId}
                </span>
                <span className="dev__disp">{e.display ?? '—'}</span>
                <span className="dev__raw">score {Math.round(e.score ?? 0)}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
