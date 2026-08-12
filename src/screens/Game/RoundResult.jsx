import { useEffect } from 'react';
import Screen from '../../components/Screen';
import PlayerCard from '../../components/PlayerCard';
import ProgressBar from '../../components/ProgressBar';
import { useGame } from '../../state/GameProvider.jsx';
import { getGame } from '../../engine/gameRegistry.js';
import { TIMING } from '../../engine/roundManager.js';
import { playSound } from '../../audio/soundManager.js';
import './RoundResult.css';

/**
 * Resultado da rodada. Fica ~3s e sai sozinho — nunca espera clique.
 *
 * Mostra o que o jogador quer saber nessa ordem: quem ganhou, quanto EU fiz,
 * quanto cada um somou. A pontuação total fica na barra do rodapé para dar a
 * sensação de progresso da partida sem virar uma tabela.
 */
export default function RoundResult() {
  const { room, match, nextRound } = useGame();
  const results = match?.results || [];
  const game = match ? getGame(match.gameId) : null;

  const winner = results.find((r) => r.position === 1) || null;
  const me = results.find((r) => r.playerId === room?.hostId) || null;
  const iWon = !!winner && winner.playerId === room?.hostId;

  useEffect(() => {
    playSound(iWon ? 'victory' : 'score');
  }, [iWon]);

  useEffect(() => {
    const t = setTimeout(() => nextRound(), TIMING.result);
    return () => clearTimeout(t);
  }, [nextRound]);

  function playerOf(id) {
    return room?.players.find((p) => p.id === id) || null;
  }

  const winnerName = winner ? playerOf(winner.playerId)?.name || '—' : '—';
  const verdict = iWon ? 'VOCÊ VENCEU!' : `${winnerName} VENCEU`;

  return (
    <Screen hue={game?.hue}>
      <div className="rres__head">
        <p className="u-label">
          DESAFIO {match.round}/{match.totalRounds} · {game?.name || ''}
        </p>
        <p className={`rres__verdict u-display${iWon ? ' is-win' : ''}`}>{verdict}</p>
        {me ? (
          <p className="rres__mine">
            você fez <b className="u-mono">{me.display ?? me.score}</b>
            {me.position > 1 ? ` · ${me.position}º lugar` : ''}
          </p>
        ) : null}
      </div>

      {match.effects?.scoreMultiplier > 1 ? (
        <p className="rres__mult u-display">
          💎 PONTOS DOBRADOS NESTA RODADA
        </p>
      ) : null}

      <div className="rres__list">
        {results.map((result) => {
          const player = playerOf(result.playerId);
          if (!player) return null;
          return (
            <PlayerCard
              key={result.playerId}
              player={player}
              position={result.position}
              highlight={result.position === 1}
              isYou={result.playerId === room.hostId}
              right={<span className="rres__value u-mono">{result.display ?? result.score}</span>}
              delta={result.points}
              meta={result.streak >= 2 ? `🔥 SEQUÊNCIA x${result.streak}` : null}
            />
          );
        })}
      </div>

      <div className="screen__spacer" />

      <div className="rres__progress">
        <ProgressBar
          value={match.round / match.totalRounds}
          label="PARTIDA"
          right={`${match.round}/${match.totalRounds}`}
          size="sm"
        />
      </div>
    </Screen>
  );
}
