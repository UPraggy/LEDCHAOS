import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import PlayerCard from '../../components/PlayerCard';
import QRCode from '../../components/QRCode';
import SegmentedControl from '../../components/SegmentedControl';
import { QrImage, CopyHashRow, ImportPanel } from '../../net/qr/handshake.jsx';
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
    directSignaling,
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

      {room.settings.direct ? (
        <DirectInvite signaling={directSignaling} full={full} onFlash={flash} />
      ) : (
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
      )}

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
              meta={
                player.isBot
                  ? SKILL_PRESETS[room.settings.difficulty]?.label
                  : player.id === room.hostId
                    ? 'VOCÊ'
                    : 'AO VIVO'
              }
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

/**
 * DirectInvite — o centro de convite do MODO DIRETO (WebRTC P2P, zero-servidor).
 *
 * Sem servidor de rendezvous, não existe link mágico que case os dois lados: o
 * host abre UMA conexão por convidado e a troca de offer/answer viaja FORA de
 * banda. Aqui isso vira um aperto de mão de dois QRs, um convidado por vez:
 *
 *   1. GERAR CONVITE → mostra o QR/hash da OFFER (o convidado lê no /direto)
 *   2. o convidado devolve a RESPOSTA (QR/hash) → o host cola aqui → conecta
 *
 * Ao conectar, o canal abre, o convidado dá HELLO e ele aparece na lista de
 * jogadores acima (tomando a vaga de um bot). O painel volta ao início, pronto
 * para o próximo — até a sala encher. A `signaling` vem do createP2PHub via
 * GameProvider; `full` esconde o gerador quando não há mais vaga.
 */
function DirectInvite({ signaling, full, onFlash }) {
  const [invite, setInvite] = useState(null); // { peerId, text } | null
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function generate() {
    playSound('tap');
    setErr('');
    setBusy(true);
    try {
      const { peerId, invite: text } = await signaling.createInvite();
      setInvite({ peerId, text });
    } catch {
      setErr('Não deu pra gerar o convite. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  async function accept(answerText) {
    if (!invite) return;
    setErr('');
    try {
      await signaling.acceptAnswer(invite.peerId, answerText);
      onFlash('CONVIDADO CHEGANDO…');
      setInvite(null); // volta ao início, pronto pro próximo convidado
    } catch {
      setErr('Resposta inválida — confira o QR/hash do convidado.');
    }
  }

  return (
    <div className="lobby__direct">
      <p className="lobby__directHead u-label">CONEXÃO DIRETA · SEM SERVIDOR</p>

      {full ? (
        <p className="lobby__directFull">Sala cheia 🎉 — todo mundo conectado. Bora começar!</p>
      ) : !signaling ? (
        <p className="lobby__directHint">preparando o canal direto…</p>
      ) : !invite ? (
        <>
          <p className="lobby__directHint">
            Cada amigo entra por um <b>QR</b>, direto no seu aparelho — sem site, sem servidor.
            Gere um convite por vez.
          </p>
          <Button variant="cyan" size="lg" icon="📡" disabled={busy} onClick={generate}>
            {busy ? 'GERANDO…' : 'GERAR CONVITE'}
          </Button>
        </>
      ) : (
        <>
          <p className="lobby__directStep u-label">1 · MOSTRE ESTE QR AO CONVIDADO</p>
          <QrImage text={invite.text} />
          <CopyHashRow text={invite.text} />
          <p className="lobby__directHint">
            No celular dele, na tela inicial, ele toca <b>entrar por QR — modo direto</b> e lê este
            QR (ou cola o hash).
          </p>

          <hr className="lobby__directSep" />

          <p className="lobby__directStep u-label">2 · COLE A RESPOSTA DELE</p>
          <ImportPanel
            cta="CONECTAR"
            placeholder="cole aqui o hash de resposta do convidado…"
            scanHint="Aponte para o QR de resposta"
            onSubmit={accept}
          />
          <button
            type="button"
            className="lobby__directCancel"
            onClick={() => {
              setInvite(null);
              setErr('');
            }}
          >
            cancelar convite
          </button>
        </>
      )}

      {err ? (
        <p className="lobby__directErr" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
