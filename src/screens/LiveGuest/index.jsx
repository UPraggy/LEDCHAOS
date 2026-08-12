import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import PlayerCard from '../../components/PlayerCard';
import PlayerAvatar from '../../components/PlayerAvatar';
import { useGame } from '../../state/GameProvider.jsx';
import { useGuestLink, LINK } from '../../net/useGuestLink.js';
import { normalizeRoomCode, isValidRoomCode } from '../../room/roomCode.js';
import { getGame } from '../../engine/gameRegistry.js';
import { PHASES } from '../../engine/roundManager.js';
import './LiveGuest.css';

/**
 * LiveGuest — a festa no seu bolso.
 *
 * É a tela do CONVIDADO quando o transporte de verdade está ligado
 * (`VITE_RELAY_URL`). O celular entra na sala do host pelo relay, vira gente de
 * verdade no lobby (no lugar de um bot) e ESPELHA a partida ao vivo: sala,
 * desafio, rodada, fase, resultado e placar — tudo anunciado pelo host, que é a
 * autoridade. Nada de jogo nasce aqui; este é o lado que escuta.
 *
 * Sem `VITE_RELAY_URL`, esta rota nem é usada — o `JoinRoom` manda para o fluxo
 * local de sempre. Se alguém abrir `/live/...` sem relay, caímos de volta lá.
 */
export default function LiveGuest() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { prefs } = useGame();

  const relayUrl = import.meta.env.VITE_RELAY_URL;
  const code = normalizeRoomCode(roomId || '');
  const usable = !!relayUrl && isValidRoomCode(code);

  // Hook sempre chamado (ordem estável); quando não dá para usar, entra "morto".
  const link = useGuestLink({
    url: usable ? relayUrl : null,
    code: usable ? code : null,
    name: prefs.name,
    avatar: prefs.avatar,
  });

  // Sem relay ou código inválido → esta tela não faz sentido: fluxo local.
  if (!usable) return <Navigate to={`/join/${code}`} replace />;

  const players = link.players || [];
  const me = players.find((p) => p.id === link.selfId) || null;
  const total = link.settings?.rounds ?? null;
  const phase = link.phase;
  const game = link.round ? getGame(link.round.gameId) : null;

  const isFinal = phase === PHASES.FINAL || !!link.final;
  const isResult = phase === PHASES.RESULT && !!link.result;
  const inChallenge = !!link.round && !isResult && !isFinal;

  function playerOf(id) {
    return players.find((p) => p.id === id) || null;
  }

  /* --------------------------------------------------------------- palco */
  function renderStage() {
    if (isFinal) return renderFinal();
    if (isResult) return renderResult();
    if (inChallenge) return renderChallenge();
    return renderLobby();
  }

  /* -- fim de jogo: placar derivado dos scores que o host transmitiu (ROOM) -- */
  function renderFinal() {
    const standings = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const winner = standings[0] || null;
    const iWon = !!winner && winner.id === link.selfId;
    return (
      <section className="live__final">
        <p className="live__kicker u-label">FIM DE JOGO</p>
        <p className="live__finalEmoji" aria-hidden="true">{iWon ? '🏆' : '🎉'}</p>
        <h1 className={`live__title u-display${iWon ? ' is-win' : ''}`}>
          {iWon ? 'VOCÊ VENCEU!' : `${winner?.name || '—'} VENCEU`}
        </h1>
        <div className="live__list">
          {standings.map((player, i) => (
            <PlayerCard
              key={player.id}
              player={player}
              position={i + 1}
              highlight={i === 0}
              isYou={player.id === link.selfId}
              right={<span className="u-mono">{player.score ?? 0}</span>}
            />
          ))}
        </div>
        <div className="screen__actions">
          <Button variant="primary" size="lg" onClick={() => navigate('/')}>
            SAIR DA FESTA
          </Button>
        </div>
      </section>
    );
  }

  /* ---- resultado da rodada: entries que o host transmitiu (RESULT) ---- */
  function renderResult() {
    const entries = [...(link.result.entries || [])].sort((a, b) => a.position - b.position);
    const winner = entries.find((e) => e.position === 1) || null;
    const iWon = !!winner && winner.playerId === link.selfId;
    const winnerName = winner ? playerOf(winner.playerId)?.name || '—' : '—';
    return (
      <section className="live__result">
        <p className="u-label">
          DESAFIO {link.round?.round}
          {total ? `/${total}` : ''} · {game?.name || ''}
        </p>
        <p className={`live__verdict u-display${iWon ? ' is-win' : ''}`}>
          {iWon ? 'VOCÊ VENCEU!' : `${winnerName} VENCEU`}
        </p>
        <div className="live__list">
          {entries.map((entry) => {
            const player = playerOf(entry.playerId);
            if (!player) return null;
            return (
              <PlayerCard
                key={entry.playerId}
                player={player}
                position={entry.position}
                highlight={entry.position === 1}
                isYou={entry.playerId === link.selfId}
                right={<span className="u-mono">{entry.display ?? entry.score}</span>}
                delta={entry.points}
                meta={entry.streak >= 2 ? `🔥 SEQUÊNCIA x${entry.streak}` : null}
              />
            );
          })}
        </div>
      </section>
    );
  }

  /* ---- desafio no ar: intro / contagem / jogando ---- */
  function renderChallenge() {
    const badge =
      phase === PHASES.PLAYING ? 'NO PALCO AGORA'
        : phase === PHASES.COUNTDOWN ? 'JÁ VAI COMEÇAR…'
          : 'PREPARE-SE';
    return (
      <section className="live__hero" key={link.round.round}>
        <p className="live__round u-label">
          DESAFIO {link.round.round}{total ? ` DE ${total}` : ''}
        </p>
        <p className="live__emoji" aria-hidden="true">{game?.emoji || '🎮'}</p>
        <h1 className="live__name u-display">{game?.name || 'DESAFIO'}</h1>
        <p className="live__instruction">{game?.instruction || 'Prepare-se.'}</p>
        <p className={`live__badge u-label${phase === PHASES.PLAYING ? ' is-live' : ''}`}>
          {badge}
        </p>
        <p className="live__mirrorNote">o desafio roda na tela grande · aqui você acompanha ao vivo</p>
      </section>
    );
  }

  /* ---- lobby: esperando o host começar ---- */
  function renderLobby() {
    return (
      <section className="live__lobby">
        <p className="live__kicker u-label">VOCÊ ESTÁ NA FESTA</p>
        <h1 className="live__title u-display">
          {link.status === LINK.LIVE ? 'AGUARDANDO O HOST' : 'ENTRANDO NA SALA…'}
        </h1>
        <p className="live__sub">
          {link.status === LINK.LIVE
            ? 'Quando o host começar, o desafio aparece aqui.'
            : 'Ligando no relay da sala. Isso leva um instante.'}
        </p>
        {players.length ? (
          <div className="live__roster">
            <p className="live__rosterHead u-label">JOGADORES {players.length}</p>
            {players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isYou={player.id === link.selfId}
                meta={player.isBot ? 'BOT' : player.id === link.selfId ? 'VOCÊ' : 'NO CELULAR'}
              />
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <Screen hue={game?.hue}>
      <header className="live__top">
        <IconButton label="Sair da festa" onClick={() => navigate('/')}>
          ←
        </IconButton>
        <div className="live__id">
          <p className="live__idLabel u-label">SALA</p>
          <p className="live__code u-mono">{code}</p>
        </div>
        <StatusChip status={link.status} ping={link.ping} />
      </header>

      {me ? (
        <div className="live__me" style={{ '--pcard-color': me.color }}>
          <PlayerAvatar avatar={me.avatar} color={me.color} size={40} />
          <div className="live__meInfo">
            <p className="live__meName">{me.name}</p>
            <p className="live__meTag u-label">ESSE É VOCÊ</p>
          </div>
          <span className="live__meScore u-mono">{me.score ?? 0}</span>
        </div>
      ) : null}

      <main className="live__stage">{renderStage()}</main>
    </Screen>
  );
}

/** Chip de status da ligação: verde vivo, âmbar reconectando, cinza abrindo. */
function StatusChip({ status, ping }) {
  const label =
    status === LINK.LIVE ? 'AO VIVO'
      : status === LINK.WAITING ? 'RECONECTANDO'
        : 'CONECTANDO';
  return (
    <span className={`live__chip live__chip--${status}`} role="status">
      <span className="live__dot" aria-hidden="true" />
      {label}
      {status === LINK.LIVE && ping != null ? <b className="u-mono">{ping}ms</b> : null}
    </span>
  );
}
