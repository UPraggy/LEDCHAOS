import { useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import PlayerCard from '../../components/PlayerCard';
import PlayerAvatar from '../../components/PlayerAvatar';
import { useGame } from '../../state/GameProvider.jsx';
import { normalizeRoomCode } from '../../room/roomCode.js';
import { standings } from '../../engine/scoreManager.js';
import { allAchievements } from '../../engine/resultManager.js';
import { playSound } from '../../audio/soundManager.js';
import './FinalScore.css';

/** Altura relativa de cada degrau. 1º sempre o mais alto, mesmo com empate. */
const STEP = { 1: 100, 2: 72, 3: 56 };

/**
 * FinalScore — o fim da partida.
 *
 * Ordem pensada para celular: quem ganhou (grande), o pódio, as conquistas,
 * o resto do placar e só então os botões. Ninguém rola a tela para descobrir
 * quem venceu; rola para ver os detalhes.
 */
export default function FinalScore() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { room, match, replayMatch, exitMatch } = useGame();

  const code = normalizeRoomCode(roomId || '');

  const table = useMemo(() => (room ? standings(room.players) : []), [room]);
  const achievements = useMemo(
    () => (match && room ? allAchievements(match.records, match.history, room.players) : []),
    [match, room],
  );

  const champion = table[0] || null;
  const iWon = !!champion && champion.id === room?.hostId;

  useEffect(() => {
    playSound('victory');
  }, []);

  if (!room || room.id !== code) return <Navigate to={`/join/${code}`} replace />;
  if (!match) return <Navigate to={`/room/${code}`} replace />;

  const podium = table.filter((p) => p.position <= 3).slice(0, 3);
  const rest = table.filter((p) => !podium.includes(p));
  // 2º à esquerda, 1º no meio, 3º à direita — leitura de pódio de verdade.
  const ordered = [podium[1], podium[0], podium[2]].filter(Boolean);

  function handleReplay() {
    replayMatch();
    navigate(`/game/${room.id}`);
  }

  function handleLobby() {
    exitMatch();
    navigate(`/room/${room.id}`);
  }

  function handleHome() {
    exitMatch();
    navigate('/');
  }

  return (
    <Screen className="fscore">
      <header className="fscore__head">
        <p className="u-label">FIM DE PARTIDA · {match.totalRounds} DESAFIOS</p>
        <h1 className={`fscore__title u-display${iWon ? ' is-win' : ''}`}>
          {iWon ? 'VOCÊ VENCEU!' : `${champion?.name || '—'} VENCEU`}
        </h1>
      </header>

      <div className="fscore__podium">
        {ordered.map((player) => (
          <div
            key={player.id}
            className={`fscore__slot${player.position === 1 ? ' is-first' : ''}`}
          >
            <PlayerAvatar
              avatar={player.avatar}
              color={player.color}
              size={player.position === 1 ? 72 : 56}
              ring={player.position === 1}
              badge={player.position === 1 ? '🏆' : null}
            />
            <p className="fscore__slotName u-display">{player.name}</p>
            <p className="fscore__slotScore u-mono">{player.score}</p>
            <div
              className="fscore__step"
              style={{ height: `${STEP[player.position] || 44}px` }}
            >
              <span className="fscore__stepNum u-display">{player.position}º</span>
            </div>
          </div>
        ))}
      </div>

      {achievements.length > 0 ? (
        <section className="fscore__section">
          <p className="u-label">CONQUISTAS</p>
          <ul className="fscore__achievements">
            {achievements.map((item) => (
              <li key={item.id} className="fscore__ach">
                <span className="fscore__achEmoji" aria-hidden="true">{item.emoji}</span>
                <span className="fscore__achText">
                  <span className="fscore__achLabel u-display">{item.label}</span>
                  <span className="fscore__achWho">{item.player.name}</span>
                </span>
                <span className="fscore__achValue u-mono">{item.value}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="fscore__section">
          <p className="u-label">PLACAR</p>
          <div className="fscore__list">
            {rest.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                position={player.position}
                isYou={player.id === room.hostId}
                right={<span className="fscore__value u-mono">{player.score}</span>}
                meta={player.wins > 0 ? `${player.wins} vitória${player.wins > 1 ? 's' : ''}` : null}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="screen__spacer" />

      <div className="screen__actions">
        <Button variant="success" size="lg" icon="🔁" onClick={handleReplay}>JOGAR DE NOVO</Button>
        <Button variant="secondary" onClick={handleLobby}>VOLTAR PRA SALA</Button>
        <Button variant="ghost" size="sm" onClick={handleHome}>INÍCIO</Button>
      </div>
    </Screen>
  );
}
