import { useState } from 'react';
import { useGame } from '../../state/GameProvider.jsx';
import useDebugGesture from './useDebugGesture.js';
import { GAMES } from '../../engine/gameRegistry.js';
import { CHAOS_EVENTS } from '../../engine/chaosEvents.js';
import { PHASES } from '../../engine/roundManager.js';
import { MAX_PLAYERS, MIN_PLAYERS } from '../../room/roomManager.js';
import './DebugPanel.css';

/**
 * Painel de testes. Só existe em `npm run dev` — quem decide é o Game, que
 * checa `debugAvailable` (import.meta.env.DEV) antes de montar.
 *
 * Fica recolhido num botão pequeno no canto de CIMA: a metade de baixo da tela
 * é onde o polegar joga, e um painel lá viraria toque acidental no meio da
 * partida. Aberto, ele cobre a tela de propósito — é uma ferramenta, não um HUD.
 *
 * O componente é montado SEMPRE em dev, mesmo com `debug` desligado: é ele que
 * escuta o gesto secreto que liga o modo (ver `useDebugGesture.js`). Desligado,
 * ele não desenha nada — só fica ouvindo.
 */
export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const {
    room, match, debug,
    addBot, removePlayer, debugResetScores,
    debugSetGame, debugChaos, debugRound, debugSkipCountdown,
    setPhase, finishRound, skipRound, toggleDebug,
  } = useGame();

  // Antes de qualquer `return`: o gesto precisa continuar ouvindo mesmo quando o
  // painel está invisível, que é justamente o estado em que ele é útil.
  useDebugGesture(toggleDebug);

  if (!room || !debug) return null;

  const phase = match?.phase ?? null;
  const bots = room.players.filter((p) => p.id !== room.hostId);
  const rounds = match ? Array.from({ length: match.totalRounds }, (_, i) => i + 1) : [];

  /** Encerra a rodada agora com placar aleatório, só para ver o resultado. */
  function finishNow() {
    finishRound(room.players.map((player) => ({
      playerId: player.id,
      score: Math.floor(Math.random() * 1000),
      display: 'DEBUG',
    })));
  }

  if (!open) {
    return (
      <button
        type="button"
        className="dbg__fab u-mono"
        onClick={() => setOpen(true)}
        aria-label="Abrir painel de testes"
      >
        ⚙
      </button>
    );
  }

  return (
    <div className="dbg" role="dialog" aria-label="Painel de testes">
      <div className="dbg__head">
        <p className="dbg__title u-display">DEBUG</p>
        <button type="button" className="dbg__close u-mono" onClick={() => setOpen(false)} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="dbg__body">
        <p className="dbg__state u-mono">
          {phase ? `fase: ${phase}` : 'sem partida'}
          {match ? ` · rodada ${match.round}/${match.totalRounds}` : ''}
          {match?.gameId ? ` · ${match.gameId}` : ''}
        </p>

        {/* ---------------------------------------------------------- partida */}
        <section className="dbg__group">
          <p className="dbg__label">PARTIDA</p>
          <div className="dbg__row">
            <button
              type="button"
              className="dbg__btn"
              onClick={debugSkipCountdown}
              disabled={!match}
            >
              {match?.skipCountdown ? 'CONTAGEM: OFF' : 'PULAR CONTAGEM'}
            </button>
            <button
              type="button"
              className="dbg__btn"
              onClick={finishNow}
              disabled={phase !== PHASES.PLAYING}
            >
              TERMINAR JOGO
            </button>
            <button
              type="button"
              className="dbg__btn"
              onClick={() => skipRound('debug')}
              disabled={!match}
            >
              FORÇAR ERRO
            </button>
            <button
              type="button"
              className="dbg__btn"
              onClick={() => setPhase(PHASES.FINAL)}
              disabled={!match}
            >
              IR PRO FINAL
            </button>
            <button type="button" className="dbg__btn" onClick={debugResetScores}>
              ZERAR PLACAR
            </button>
          </div>
        </section>

        {/* --------------------------------------------------------- microjogo */}
        <section className="dbg__group">
          <p className="dbg__label">ESCOLHER JOGO ({GAMES.length})</p>
          <div className="dbg__row">
            {GAMES.map((game) => (
              <button
                key={game.id}
                type="button"
                className={`dbg__btn${match?.gameId === game.id ? ' is-on' : ''}`}
                onClick={() => debugSetGame(game.id)}
                disabled={!match}
              >
                {game.emoji} {game.name}
              </button>
            ))}
            {GAMES.length === 0 ? <p className="dbg__empty">nenhum jogo registrado</p> : null}
          </div>
        </section>

        {/* ------------------------------------------------------ evento CHAOS */}
        <section className="dbg__group">
          <p className="dbg__label">EVENTO CHAOS</p>
          <div className="dbg__row">
            <button
              type="button"
              className={`dbg__btn${!match?.chaosEvent ? ' is-on' : ''}`}
              onClick={() => debugChaos(null)}
              disabled={!match}
            >
              NENHUM
            </button>
            {CHAOS_EVENTS.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`dbg__btn${match?.chaosEvent?.id === event.id ? ' is-on' : ''}`}
                onClick={() => debugChaos(event.id)}
                disabled={!match}
              >
                {event.emoji} {event.name}
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ rodada */}
        {match ? (
          <section className="dbg__group">
            <p className="dbg__label">IR PARA A RODADA</p>
            <div className="dbg__row">
              {rounds.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`dbg__btn dbg__btn--num u-mono${match.round === n ? ' is-on' : ''}`}
                  onClick={() => debugRound(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* --------------------------------------------------------- jogadores */}
        <section className="dbg__group">
          <p className="dbg__label">JOGADORES ({room.players.length}/{MAX_PLAYERS})</p>
          <div className="dbg__row">
            <button
              type="button"
              className="dbg__btn"
              onClick={addBot}
              disabled={room.players.length >= MAX_PLAYERS}
            >
              + BOT
            </button>
            <button
              type="button"
              className="dbg__btn"
              onClick={() => removePlayer(bots[bots.length - 1]?.id)}
              disabled={room.players.length <= MIN_PLAYERS || bots.length === 0}
            >
              − BOT
            </button>
          </div>
        </section>

        <button type="button" className="dbg__btn dbg__btn--wide" onClick={toggleDebug}>
          FECHAR DEBUG
        </button>
      </div>
    </div>
  );
}
