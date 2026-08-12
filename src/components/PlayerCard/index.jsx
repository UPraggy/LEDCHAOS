import PlayerAvatar from '../PlayerAvatar';
import './PlayerCard.css';

/**
 * Card de jogador. Usado no lobby, no resultado da rodada e no placar final.
 *
 * @param {object} player   {id,name,avatar,color,score,streak,isBot,skill}
 * @param {number} position 1..8 (mostra medalha nos 3 primeiros) — opcional
 * @param {string} right    conteúdo à direita (pontos, tempo, "PRONTO")
 * @param {string} delta    ganho da rodada (+100)
 * @param {boolean} isHost
 * @param {boolean} isYou
 */
export default function PlayerCard({
  player,
  position = null,
  right = null,
  delta = null,
  isHost = false,
  isYou = false,
  meta = null,
  highlight = false,
  onRemove = null,
  style,
}) {
  const medal = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : null;

  return (
    <div
      className={`pcard${highlight ? ' pcard--win' : ''}${isYou ? ' pcard--you' : ''}`}
      style={{ '--pcard-color': player.color, ...style }}
    >
      {position !== null && (
        <span className="pcard__pos u-mono" aria-label={`posição ${position}`}>
          {medal || position}
        </span>
      )}

      <PlayerAvatar
        avatar={player.avatar}
        color={player.color}
        size={44}
        ring={highlight}
        badge={isHost ? '👑' : player.streak >= 2 ? '🔥' : null}
      />

      <div className="pcard__info">
        <p className="pcard__name">
          {player.name}
          {isYou && <span className="pcard__you">VOCÊ</span>}
        </p>
        <p className="pcard__meta">
          {meta || (player.isBot ? `BOT · ${Math.round((player.skill || 0) * 100)}%` : 'JOGADOR LOCAL')}
        </p>
      </div>

      {delta !== null && <span className="pcard__delta u-mono">{delta}</span>}
      {right !== null && <span className="pcard__right u-mono">{right}</span>}

      {onRemove && (
        <button type="button" className="pcard__remove" onClick={onRemove} aria-label={`remover ${player.name}`}>
          ✕
        </button>
      )}
    </div>
  );
}
