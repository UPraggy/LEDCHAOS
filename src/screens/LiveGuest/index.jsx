import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../../state/GameProvider.jsx';
import { useGuestLink } from '../../net/useGuestLink.js';
import { normalizeRoomCode, isValidRoomCode } from '../../room/roomCode.js';
import LiveMirror from './LiveMirror.jsx';

/**
 * LiveGuest — a festa no seu bolso, pelo RELAY (`VITE_RELAY_URL`).
 *
 * É o convidado quando existe um relay `wss://` no build: o celular entra na sala
 * do host pelo WebSocket, vira gente de verdade no lobby (no lugar de um bot) e
 * espelha a partida ao vivo via <LiveMirror>. Toda a apresentação mora no
 * LiveMirror (compartilhado com o modo DIRETO, zero-servidor); aqui só ligamos o
 * cano do relay (useGuestLink) e entregamos o `link` pra ele pintar.
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

  return <LiveMirror link={link} code={code} onExit={() => navigate('/')} />;
}
