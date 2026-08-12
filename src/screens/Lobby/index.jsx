import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import PlayerCard from '../../components/PlayerCard';
import QRCode from '../../components/QRCode';
import SegmentedControl from '../../components/SegmentedControl';
import { useGame } from '../../state/GameProvider.jsx';
import { normalizeRoomCode } from '../../room/roomCode.js';
import { roomUrl, prettyRoomUrl, copyText, shareRoom, canShare } from '../../room/roomLink.js';
import {
  ROUND_OPTIONS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  canStart,
} from '../../room/roomManager.js';
import { SKILL_PRESETS } from '../../data/players.js';
import { playSound } from '../../audio/soundManager.js';
import './Lobby.css';

const ROUND_OPTS = ROUND_OPTIONS.map((n) => ({ value: n, label: String(n) }));
const SKILL_OPTS = Object.entries(SKILL_PRESETS).map(([key, p]) => ({ value: key, label: p.label }));

/**
 * Lobby. É a sala de espera e o centro de convite.
 *
 * O QR Code aponta para window.location.origin + /join/<id>. Com `host: true` no
 * Vite, o celular na mesma Wi-Fi abre esse link de verdade — é o pedaço de
 * multiplayer que já funciona hoje, antes de existir transporte.
 */
export default function Lobby() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const {
    room,
    addBot,
    removePlayer,
    setRounds,
    setDifficulty,
    leaveRoom,
    startMatch,
  } = useGame();

  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  useEffect(() => () => clearTimeout(toastRef.current), []);

  function flash(message) {
    setToast(message);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2200);
  }

  const code = normalizeRoomCode(roomId || '');

  // Link aberto sem sala montada (celular do amigo, aba nova) → passa pelo /join,
  // que é onde a pessoa escolhe nome e avatar. Nunca lobby vazio.
  if (!room || room.id !== code) {
    return <Navigate to={`/join/${code}`} replace />;
  }

  const url = roomUrl(room.id);
  const full = room.players.length >= MAX_PLAYERS;
  // Simétrico ao `full`: no piso, some o "remover". Dá pra jogar em dupla, mas
  // não dá pra ficar sozinho e travar o botão de começar sem entender por quê.
  const atFloor = room.players.length <= MIN_PLAYERS;
  const ready = canStart(room);

  async function handleCopy() {
    playSound('click');
    flash((await copyText(url)) ? 'LINK COPIADO' : 'NÃO DEU PRA COPIAR');
  }

  async function handleShare() {
    playSound('click');
    const result = await shareRoom(room.id);
    if (result === 'copied') flash('LINK COPIADO');
    else if (result === 'failed') flash('NÃO DEU PRA COMPARTILHAR');
  }

  function handleStart() {
    playSound('roundStart');
    startMatch();
    navigate(`/game/${room.id}`);
  }

  function handleLeave() {
    leaveRoom();
    navigate('/');
  }

  return (
    <Screen>
      <div className="lobby__top">
        <IconButton label="Sair da sala" onClick={handleLeave}>
          ←
        </IconButton>
        <div className="lobby__code">
          <p className="lobby__codeLabel u-label">SALA</p>
          <p className="lobby__codeValue u-mono">{room.id}</p>
        </div>
        <span aria-hidden="true" />
      </div>

      <div className="lobby__invite">
        <QRCode value={url} size={168} caption={prettyRoomUrl(room.id)} />
        <div className="lobby__inviteActions">
          <Button variant="cyan" size="sm" icon="🔗" onClick={handleCopy}>
            COPIAR LINK
          </Button>
          {canShare() ? (
            <Button variant="danger" size="sm" icon="📤" onClick={handleShare}>
              COMPARTILHAR
            </Button>
          ) : null}
        </div>
      </div>

      <section className="lobby__section">
        <div className="lobby__sectionHead">
          <p className="u-label">
            JOGADORES {room.players.length}/{MAX_PLAYERS}
          </p>
          {!full ? (
            <button type="button" className="lobby__add" onClick={() => { playSound('tap'); addBot(); }}>
              + ADICIONAR
            </button>
          ) : null}
        </div>

        <div className="lobby__players">
          {room.players.map((player, index) => (
            <PlayerCard
              key={player.id}
              player={player}
              position={index + 1}
              isHost={player.id === room.hostId}
              isYou={player.id === room.hostId}
              meta={player.isBot ? SKILL_PRESETS[room.settings.difficulty]?.label : 'VOCÊ'}
              onRemove={
                player.id === room.hostId || atFloor
                  ? null
                  : () => removePlayer(player.id)
              }
            />
          ))}
        </div>
      </section>

      <section className="lobby__section">
        <SegmentedControl
          label="RODADAS"
          name="rodadas"
          options={ROUND_OPTS}
          value={room.settings.rounds}
          onChange={setRounds}
        />
        <SegmentedControl
          label="NÍVEL DOS OPONENTES"
          name="dificuldade"
          options={SKILL_OPTS}
          value={room.settings.difficulty}
          onChange={setDifficulty}
        />
      </section>

      <div className="screen__spacer" />

      <div className="screen__actions">
        <Button variant="primary" size="lg" icon={ready ? '▶' : null} disabled={!ready} onClick={handleStart}>
          {ready ? 'COMEÇAR PARTIDA' : `PRECISA DE ${MIN_PLAYERS} JOGADORES`}
        </Button>
      </div>

      {toast ? (
        <p className="lobby__toast u-display" role="status">
          {toast}
        </p>
      ) : null}
    </Screen>
  );
}
