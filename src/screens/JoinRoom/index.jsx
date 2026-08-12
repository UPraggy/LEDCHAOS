import { useNavigate, useParams } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import IdentityForm from '../../components/IdentityForm';
import { useGame } from '../../state/GameProvider.jsx';
import { normalizeRoomCode, isValidRoomCode } from '../../room/roomCode.js';
import { DEFAULT_ROUNDS } from '../../room/roomManager.js';
import { DEFAULT_SKILL } from '../../data/players.js';
import './JoinRoom.css';

/**
 * Entrar numa sala. É o destino do QR Code e do link compartilhado.
 *
 * Dois caminhos, escolhidos por `VITE_RELAY_URL`:
 *
 * • SEM relay (fluxo local de sempre): "entrar" monta uma sala local com o MESMO
 *   id do link. Quem abriu vê o mesmo código, o mesmo lobby e joga a mesma
 *   partida — só que contra oponentes simulados no próprio aparelho.
 *
 * • COM relay: o convidado é de VERDADE. Vamos para `/live/:code`, que abre o
 *   WebSocket, ocupa uma cadeira na sala do host (no lugar de um bot) e espelha a
 *   partida ao vivo. Aqui NÃO criamos sala local de propósito: se criássemos, o
 *   celular do convidado viraria um segundo host no mesmo código.
 *
 * A exceção é `alreadyIn` — o host reabrindo o próprio link no MESMO aparelho.
 * Esse continua sendo o dono da sala, então segue para o lobby local, nunca pro
 * `/live`. Por isso a bifurcação do relay fica DEPOIS de tratar `alreadyIn`.
 */
export default function JoinRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { room, prefs, setName, setAvatar, joinRoom, setRoom } = useGame();

  const code = normalizeRoomCode(roomId || '');
  const valid = isValidRoomCode(code);
  const relayUrl = import.meta.env.VITE_RELAY_URL;

  // Já estou nessa sala (recarreguei a página, voltei do jogo) → direto pro lobby.
  const alreadyIn = room && room.id === code;
  // Convidado de verdade: relay ligado e eu ainda não sou dono desta sala.
  const liveMode = !!relayUrl && !alreadyIn;

  function handleJoin() {
    const name = prefs.name.trim() || 'VOCÊ';

    if (alreadyIn) {
      // Só atualiza minha identidade e segue — não recria a sala nem zera placar.
      setRoom({
        ...room,
        players: room.players.map((p) =>
          p.id === room.hostId ? { ...p, name, avatar: prefs.avatar } : p,
        ),
      });
      navigate(`/room/${code}`);
      return;
    }

    if (liveMode) {
      // Nada de sala local: quem manda é o host. Vamos ao vivo pelo relay.
      // A identidade (nome/avatar) já está salva nas prefs e o /live se apresenta.
      navigate(`/live/${code}`);
      return;
    }

    joinRoom({
      id: code,
      name,
      avatar: prefs.avatar,
      rounds: DEFAULT_ROUNDS,
      difficulty: DEFAULT_SKILL,
    });
    navigate(`/room/${code}`);
  }

  if (!valid) {
    return (
      <Screen layout="center">
        <div className="join__bad">
          <p className="join__badIcon" aria-hidden="true">
            🚫
          </p>
          <p className="join__badTitle u-display">CÓDIGO INVÁLIDO</p>
          <p className="join__badText">
            <b>{String(roomId || '').toUpperCase()}</b> não parece um código de sala.
            Um código tem 5 caracteres, sem <b>O</b>, <b>0</b>, <b>I</b> nem <b>1</b> —
            justamente para ninguém errar ao digitar.
          </p>
          <div className="screen__actions">
            <Button onClick={() => navigate('/')}>VOLTAR PARA O INÍCIO</Button>
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="join__top">
        <IconButton label="Voltar" onClick={() => navigate('/')}>
          ←
        </IconButton>
        <p className="join__title u-display">ENTRAR NA SALA</p>
        <span aria-hidden="true" />
      </div>

      <div className="join__code">
        <p className="join__codeLabel u-label">SALA</p>
        <p className="join__codeValue u-mono">{code}</p>
        <p className="join__codeHint">o código veio do link · sem O, 0, I ou 1</p>
      </div>

      <IdentityForm
        name={prefs.name}
        avatar={prefs.avatar}
        onName={setName}
        onAvatar={setAvatar}
      />

      <div className="screen__spacer" />

      <div className="screen__actions">
        <Button
          variant="energy"
          size="lg"
          onClick={handleJoin}
          hint={liveMode ? 'conectando ao vivo com o host' : null}
        >
          {alreadyIn ? 'VOLTAR PRO LOBBY' : liveMode ? 'ENTRAR AO VIVO' : 'ENTRAR NA SALA'}
        </Button>
      </div>
    </Screen>
  );
}
