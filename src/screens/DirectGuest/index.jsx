import { useNavigate } from 'react-router-dom';
import Screen from '../../components/Screen';
import IconButton from '../../components/IconButton';
import IdentityForm from '../../components/IdentityForm';
import { QrImage, CopyHashRow, ImportPanel } from '../../net/qr/handshake.jsx';
import { useGame } from '../../state/GameProvider.jsx';
import { useDirectGuest, HS } from '../../net/useDirectGuest.js';
import LiveMirror from '../LiveGuest/LiveMirror.jsx';
import './DirectGuest.css';

/**
 * DirectGuest — o convidado entrando por MODO DIRETO (WebRTC P2P, zero-servidor).
 *
 * É o outro lado do DirectInvite (Lobby). Sem servidor de rendezvous, casar os
 * dois é um aperto de mão de dois QRs, feito aqui em dois passos:
 *
 *   1. LEIA O CONVITE DO HOST  → escaneia/cola a offer → gera a resposta (answer)
 *   2. MOSTRE A RESPOSTA       → o host lê o QR/hash e conclui → o canal abre
 *
 * Aberto o canal, o convidado dá HELLO e vira gente na sala do host (no lugar de
 * um bot). A partir daí a MESMA tela do relay assume: <LiveMirror> espelha a
 * festa ao vivo. Toda a lógica de cano/handshake mora em useDirectGuest; aqui é
 * só a casca do aperto de mão + a identidade.
 */
export default function DirectGuest() {
  const navigate = useNavigate();
  const { prefs, setName, setAvatar } = useGame();
  const guest = useDirectGuest({ name: prefs.name, avatar: prefs.avatar });

  // Canal aberto: entrega a tela ao espelho ao vivo (igualzinho ao LiveGuest).
  if (guest.hs === HS.LIVE) {
    return <LiveMirror link={guest} code="DIRETO" onExit={() => navigate('/')} />;
  }

  return (
    <Screen className="dg">
      <header className="dg__top">
        <IconButton label="Voltar" onClick={() => navigate('/')}>
          ←
        </IconButton>
        <p className="dg__title u-display">ENTRAR — MODO DIRETO</p>
        <span aria-hidden="true" />
      </header>

      <p className="dg__lead">
        Sem servidor: você e o host trocam <b>dois QRs</b>. Leia o convite dele, devolva sua
        resposta, e vocês conectam <b>direto</b>, de aparelho pra aparelho.
      </p>

      <IdentityForm name={prefs.name} avatar={prefs.avatar} onName={setName} onAvatar={setAvatar} />

      <div className="dg__stage">
        {guest.hs === HS.INVITE ? (
          <>
            <p className="dg__step u-label">1 · LEIA O CONVITE DO HOST</p>
            <ImportPanel
              cta="GERAR RESPOSTA"
              placeholder="cole aqui o hash de convite do host…"
              scanHint="Aponte para o QR do host"
              onSubmit={guest.submitInvite}
            />
            <p className="dg__hint">
              No aparelho do host, ele gera um <b>convite QR</b> no lobby. Escaneie aqui — ou cole o
              hash / anexe um print.
            </p>
          </>
        ) : guest.hs === HS.ANSWERING ? (
          <div className="dg__wait">
            <span className="dg__spinner" aria-hidden="true" />
            <p className="dg__hint">gerando sua resposta…</p>
          </div>
        ) : guest.hs === HS.ANSWER ? (
          <>
            <p className="dg__step u-label">2 · MOSTRE ESTA RESPOSTA AO HOST</p>
            <QrImage text={guest.answer} />
            <CopyHashRow text={guest.answer} />
            <p className="dg__hint">
              O host lê este QR (ou cola o hash) no lobby. Assim que ele concluir, você entra na
              festa — não feche esta tela.
            </p>
            <button type="button" className="dg__restart" onClick={guest.reset}>
              recomeçar com outro convite
            </button>
          </>
        ) : null}

        {guest.err ? (
          <p className="dg__err" role="alert">
            {guest.err}
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
