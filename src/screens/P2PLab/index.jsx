import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import { useP2P, STEP } from '../../net/useP2P.js';
import { runP2PSelfCheck } from '../../net/p2pSelfCheck.js';
import { runScoreMergeSelfCheck } from '../../net/scoreMergeSelfCheck.js';
import { toDataUrl } from '../../net/qr/qrGen.js';
import { decodeImageFile } from '../../net/qr/qrScan.js';
import { canShare, copyText } from '../../room/roomLink.js';
import QrScanner from './QrScanner.jsx';
import './P2PLab.css';

/**
 * P2PLab — a PROVA de conexão P2P por QR/hash, sem servidor.
 *
 * Esta tela só consome `useP2P()`: chama métodos ("sou host", "colei a offer",
 * "manda mensagem") e pinta o estado. Nenhuma linha de WebRTC aqui — a mecânica
 * mora em `net/webrtc` e `net/signal`. É o critério de sucesso do protótipo:
 * dois celulares conectam, ambos mostram CONECTADO e trocam mensagens pelo
 * DataChannel, sem servidor de jogo e sem servidor de signaling.
 *
 * Fluxo (sinalização manual):
 *   HOST  cria → mostra QR/hash da OFFER → cola a ANSWER do convidado → conecta
 *   GUEST entra → lê a OFFER (QR/hash) → mostra QR/hash da ANSWER → conecta
 */
export default function P2PLab() {
  const navigate = useNavigate();
  const p2p = useP2P();
  const { step, offerText, answerText, status, log, messages, error } = p2p;

  // Papel inferido do que já temos em mãos (o host tem a offer; o guest, a answer).
  const role = offerText ? 'HOST' : answerText ? 'CONVIDADO' : null;

  function goHome() {
    p2p.reset();
    navigate('/');
  }

  return (
    <Screen className="lab">
      <div className="lab__top">
        <IconButton label="Voltar" onClick={goHome}>
          ←
        </IconButton>
        <p className="lab__title u-display">MULTIPLAYER P2P</p>
        <span aria-hidden="true" />
      </div>

      {role && step !== STEP.IDLE ? (
        <p className={`lab__role lab__role--${role === 'HOST' ? 'host' : 'guest'}`}>
          {role === 'HOST' ? '📡 VOCÊ É O HOST' : '📲 VOCÊ É O CONVIDADO'}
        </p>
      ) : null}

      {error && step !== STEP.FAILED ? (
        <div className="lab__err" role="alert">
          <span>{error.friendly}</span>
          <button className="lab__errX" onClick={p2p.clearError} aria-label="Fechar aviso">
            ✕
          </button>
        </div>
      ) : null}

      <Body p2p={p2p} />
    </Screen>
  );
}

/* ── corpo por passo ─────────────────────────────────────────────────────── */

function Body({ p2p }) {
  const navigate = useNavigate();
  const { step, offerText, answerText, status, log, messages, error } = p2p;

  switch (step) {
    case STEP.IDLE:
      return <Idle onHost={p2p.startHost} onGuest={p2p.startGuest} />;

    case STEP.HOST_CREATING:
      return <Waiting text="Gerando o convite e descobrindo rotas de rede…" />;

    case STEP.HOST_INVITE:
      return (
        <div className="lab__stage">
          <p className="lab__stepLabel u-label">PASSO 1 · MOSTRE O CONVITE</p>
          <QrImage text={offerText} />
          <CopyHashRow text={offerText} />
          <p className="lab__hint">O parceiro escaneia este QR — ou cola o hash — no aparelho dele.</p>

          <hr className="lab__sep" />

          <p className="lab__stepLabel u-label">PASSO 2 · COLE A RESPOSTA DELE</p>
          <ImportPanel
            cta="CONCLUIR"
            placeholder="cole aqui o hash de resposta do convidado…"
            scanHint="Aponte para o QR de resposta"
            onSubmit={p2p.acceptAnswerText}
          />
          <StatesPanel status={status} log={log} />
        </div>
      );

    case STEP.HOST_WAIT:
      return (
        <div className="lab__stage">
          <Waiting text="Resposta recebida. Abrindo o canal direto…" />
          <StatesPanel status={status} log={log} />
        </div>
      );

    case STEP.GUEST_WAIT_OFFER:
      return (
        <div className="lab__stage">
          <p className="lab__stepLabel u-label">PASSO 1 · LEIA O CONVITE DO HOST</p>
          <ImportPanel
            cta="GERAR RESPOSTA"
            placeholder="cole o hash que o host te mandou…"
            scanHint="Aponte para o QR do host"
            onSubmit={p2p.acceptOfferText}
          />
          <p className="lab__hint">Escaneie o QR do host ou cole o hash que ele compartilhou.</p>
        </div>
      );

    case STEP.GUEST_ANSWER:
      return (
        <div className="lab__stage">
          <p className="lab__stepLabel u-label">PASSO 2 · DEVOLVA A RESPOSTA</p>
          <QrImage text={answerText} />
          <CopyHashRow text={answerText} />
          <p className="lab__hint">
            Mostre este QR ao host (ou mande o hash). Assim que ele concluir, vocês conectam.
          </p>
          <StatesPanel status={status} log={log} />
        </div>
      );

    case STEP.CONNECTED:
      return (
        <div className="lab__stage lab__stage--live">
          <div className="lab__ok">
            <span className="lab__okDot" aria-hidden="true" />
            CONECTADO
          </div>
          <p className="lab__hint">
            Conexão direta pronta ✅ — os aparelhos se falam sem servidor. Para uma{' '}
            <b>partida completa com placar</b>, crie uma sala de verdade.
          </p>
          <Chat messages={messages} onSend={p2p.sendMessage} />
          <StatesPanel status={status} log={log} />
          <Button
            variant="energy"
            onClick={() => {
              p2p.reset();
              navigate('/create');
            }}
          >
            CRIAR SALA COM PLACAR
          </Button>
          <Button variant="ghost" onClick={p2p.reset}>
            ENCERRAR CONEXÃO
          </Button>
        </div>
      );

    case STEP.FAILED:
    default:
      return (
        <div className="lab__fail">
          <span className="lab__okDot lab__okDot--bad" aria-hidden="true" />
          <p className="lab__failTitle u-display">NÃO CONECTOU</p>
          <p className="lab__failText">
            {error?.friendly || 'A conexão P2P não pôde ser estabelecida.'}
          </p>
          <p className="lab__hint">
            Provável NAT/firewall bloqueando o caminho direto. No mesmo Wi-Fi costuma funcionar; entre
            redes diferentes, um servidor TURN resolveria (fase futura).
          </p>
          <Button variant="energy" onClick={p2p.reset}>
            TENTAR DE NOVO
          </Button>
        </div>
      );
  }
}

/* ── escolha inicial ─────────────────────────────────────────────────────── */

function Idle({ onHost, onGuest }) {
  return (
    <div className="lab__intro">
      <p className="lab__lead">
        <b>Modo direto:</b> dois celulares na <b>mesma rede</b>, sem servidor — uma prova de conexão
        (chat). Para uma <b>partida com placar</b>, use <b>CRIAR SALA</b> na tela inicial.
      </p>

      <div className="lab__cards">
        <button className="pick pick--host" type="button" onClick={onHost}>
          <span className="pick__emoji" aria-hidden="true">
            📡
          </span>
          <span className="pick__t u-display">SOU O HOST</span>
          <span className="pick__d">gera o convite direto</span>
        </button>

        <button className="pick pick--guest" type="button" onClick={onGuest}>
          <span className="pick__emoji" aria-hidden="true">
            📲
          </span>
          <span className="pick__t u-display">SOU CONVIDADO</span>
          <span className="pick__d">escaneia ou cola o convite</span>
        </button>
      </div>

      <p className="lab__note u-muted">
        A câmera precisa de HTTPS (ou localhost). Mesmo Wi-Fi conecta fácil; redes diferentes
        dependem do NAT de cada lado.
      </p>

      {import.meta.env.DEV ? <HubSelfCheck /> : null}
      {import.meta.env.DEV ? <ScoreMergeSelfCheck /> : null}
    </div>
  );
}

/**
 * HubSelfCheck — prova do ADAPTADOR (createP2PHub) sobre WebRTC de VERDADE, num
 * clique só. Sobe dois hubs reais na mesma página, faz o handshake por loopback
 * e confere o contrato inteiro (join, ação→host, estado→convidado, fronteira de
 * autoridade, saída limpa). Só aparece em dev — não vai para o build de produção.
 */
function HubSelfCheck() {
  const [state, setState] = useState('idle'); // idle | running | done
  const [checks, setChecks] = useState([]);
  const [error, setError] = useState('');
  const [live, setLive] = useState('');

  async function run() {
    setState('running');
    setChecks([]);
    setError('');
    setLive('');
    const report = await runP2PSelfCheck({ onStep: (m) => setLive(m) });
    setChecks(report.checks);
    setError(report.error || '');
    setState('done');
  }

  const allPass = state === 'done' && !error && checks.every((c) => c.pass);

  return (
    <div className="hubcheck">
      <div className="hubcheck__head">
        <span className="hubcheck__tag u-label">DEV · PROVA DO HUB P2P</span>
        <Button variant="cyan" block={false} disabled={state === 'running'} onClick={run}>
          {state === 'running' ? 'RODANDO…' : state === 'done' ? 'RODAR DE NOVO' : 'RODAR PROVA'}
        </Button>
      </div>

      {state === 'running' && live ? <p className="hubcheck__live u-mono">{live}</p> : null}

      {state === 'done' ? (
        <>
          <p className={`hubcheck__verdict ${allPass ? 'is-ok' : 'is-bad'}`}>
            {allPass ? `✓ ${checks.length}/${checks.length} — createP2PHub cumpre o contrato sobre WebRTC real` : '✗ falhou'}
          </p>
          <ul className="hubcheck__list">
            {checks.map((c, i) => (
              <li key={i} className={c.pass ? 'is-ok' : 'is-bad'}>
                <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> {c.label}
                {c.note ? <em className="u-mono"> ({c.note})</em> : null}
              </li>
            ))}
          </ul>
          {error ? <p className="hubcheck__err u-mono">erro: {error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * ScoreMergeSelfCheck — prova da F7-C ("cada celular joga o próprio slot + merge
 * de scores") num clique. Sobe host+convidado num loopback real, o convidado
 * reporta o placar do próprio slot, o host funde sobre o bot fabricado e o
 * resolveRound de verdade troca o vencedor da rodada. Só em dev — não vai ao build.
 */
function ScoreMergeSelfCheck() {
  const [state, setState] = useState('idle'); // idle | running | done
  const [checks, setChecks] = useState([]);
  const [error, setError] = useState('');
  const [live, setLive] = useState('');

  async function run() {
    setState('running');
    setChecks([]);
    setError('');
    setLive('');
    const report = await runScoreMergeSelfCheck({ onStep: (m) => setLive(m) });
    setChecks(report.checks);
    setError(report.error || '');
    setState('done');
  }

  const allPass = state === 'done' && !error && checks.every((c) => c.pass);

  return (
    <div className="hubcheck">
      <div className="hubcheck__head">
        <span className="hubcheck__tag u-label">DEV · PROVA DA FUSÃO DE PLACARES (F7-C)</span>
        <Button variant="cyan" block={false} disabled={state === 'running'} onClick={run}>
          {state === 'running' ? 'RODANDO…' : state === 'done' ? 'RODAR DE NOVO' : 'RODAR PROVA'}
        </Button>
      </div>

      {state === 'running' && live ? <p className="hubcheck__live u-mono">{live}</p> : null}

      {state === 'done' ? (
        <>
          <p className={`hubcheck__verdict ${allPass ? 'is-ok' : 'is-bad'}`}>
            {allPass
              ? `✓ ${checks.length}/${checks.length} — o placar real do celular funde e troca o vencedor da rodada`
              : '✗ falhou'}
          </p>
          <ul className="hubcheck__list">
            {checks.map((c, i) => (
              <li key={i} className={c.pass ? 'is-ok' : 'is-bad'}>
                <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span> {c.label}
                {c.note ? <em className="u-mono"> ({c.note})</em> : null}
              </li>
            ))}
          </ul>
          {error ? <p className="hubcheck__err u-mono">erro: {error}</p> : null}
        </>
      ) : null}
    </div>
  );
}

/* ── peças ───────────────────────────────────────────────────────────────── */

function Waiting({ text }) {
  return (
    <div className="lab__wait">
      <span className="spinner" aria-hidden="true" />
      <p className="lab__waitText">{text}</p>
    </div>
  );
}

/** Desenha o texto de signaling como QR. Se não couber, orienta o "copiar hash". */
function QrImage({ text }) {
  const [src, setSrc] = useState('');
  const [tooBig, setTooBig] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc('');
    setTooBig(false);
    toDataUrl(text)
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setTooBig(true));
    return () => {
      alive = false;
    };
  }, [text]);

  if (tooBig) {
    return (
      <div className="qr qr--msg">
        Convite grande demais para um QR nítido nesta rede.
        <br />
        Use o <b>copiar hash</b> abaixo.
      </div>
    );
  }
  if (!src) return <div className="qr qr--msg">gerando QR…</div>;
  return <img className="qr" src={src} alt="QR Code de conexão" />;
}

/** Copiar/compartilhar o convite — manda o hash pra quem não está do seu lado. */
function CopyHashRow({ text }) {
  const [done, setDone] = useState(false);

  async function copy() {
    const ok = await copyToClipboard(text);
    setDone(ok);
    if (ok) setTimeout(() => setDone(false), 1600);
  }

  // COMPARTILHAR: no celular abre o menu nativo (WhatsApp, etc.); sem Web Share,
  // cai no copiar. Reusa o copyText de roomLink (mesmo padrão do lobby real).
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CHAOS — convite de conexão', text });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return; // usuário fechou o menu: tudo certo
    }
    const ok = await copyText(text);
    setDone(ok);
    if (ok) setTimeout(() => setDone(false), 1600);
  }

  const preview = text.length > 34 ? `${text.slice(0, 24)}…${text.slice(-6)}` : text;

  return (
    <div className="hash">
      <code className="hash__preview u-mono">{preview}</code>
      {canShare() ? (
        <Button variant="energy" block={false} icon="📤" onClick={share}>
          ENVIAR
        </Button>
      ) : null}
      <Button variant="cyan" block={false} onClick={copy}>
        {done ? '✓ COPIADO' : 'COPIAR'}
      </Button>
    </div>
  );
}

/** Colar hash, escanear QR ao vivo OU anexar uma foto do QR — serve host e convidado. */
function ImportPanel({ cta, placeholder, scanHint, onSubmit }) {
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [imgErr, setImgErr] = useState('');
  const fileRef = useRef(null);

  // ANEXAR IMAGEM: lê o QR de um print/foto — rede de segurança para quando a
  // câmera não abre (LAN http://, permissão negada, aparelho sem câmera).
  async function pickImage(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // permite reescolher a mesma imagem depois
    if (!file) return;
    setImgErr('');
    try {
      onSubmit(await decodeImageFile(file));
    } catch (err) {
      setImgErr(err.friendly || 'Não foi possível ler o QR dessa imagem.');
    }
  }

  if (scanning) {
    return (
      <QrScanner
        hint={scanHint}
        onResult={(t) => {
          setScanning(false);
          onSubmit(t);
        }}
        onCancel={() => setScanning(false)}
      />
    );
  }

  return (
    <div className="import">
      <textarea
        className="import__box u-mono"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        spellCheck="false"
        autoCapitalize="none"
        autoCorrect="off"
        aria-label={placeholder}
      />
      <div className="import__actions">
        <Button variant="energy" block={false} disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
          {cta}
        </Button>
        <Button variant="ghost" block={false} icon="📷" onClick={() => setScanning(true)}>
          ESCANEAR QR
        </Button>
        <Button variant="ghost" block={false} icon="🖼️" onClick={() => fileRef.current?.click()}>
          ANEXAR IMAGEM
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
      </div>
      {imgErr ? (
        <p className="scan__err" role="alert">
          {imgErr}
        </p>
      ) : null}
    </div>
  );
}

/** Selos de estado (a "prova" que o Rafael quer ver) + log só em dev. */
function StatesPanel({ status, log }) {
  return (
    <div className="states">
      <div className="states__row">
        <Chip label="Conexão" value={status.connection} />
        <Chip label="ICE" value={status.ice} />
        <Chip label="Canal" value={status.dc} />
      </div>
      {import.meta.env.DEV && log.length ? (
        <details className="states__log">
          <summary>log de eventos ({log.length})</summary>
          <ol>
            {log.slice(-16).map((e) => (
              <li key={e.n} className="u-mono">
                {e.type}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function Chip({ label, value }) {
  return (
    <div className={`chip chip--${stateTone(value)}`}>
      <span className="chip__k u-label">{label}</span>
      <span className="chip__v u-mono">{value}</span>
    </div>
  );
}

function Chat({ messages, onSend }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(e) {
    e.preventDefault();
    if (onSend(text)) setText('');
  }

  return (
    <div className="chat">
      <div className="chat__list" ref={listRef}>
        {messages.length === 0 ? (
          <p className="chat__empty">Canal aberto. Manda a primeira mensagem 👋</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.from}`}>
            {m.text}
          </div>
        ))}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          className="chat__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="mensagem…"
          autoComplete="off"
          aria-label="Mensagem"
        />
        <Button variant="energy" block={false} type="submit" disabled={!text.trim()}>
          ▶
        </Button>
      </form>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function stateTone(s) {
  if (s === 'connected' || s === 'completed' || s === 'open') return 'ok';
  if (s === 'failed' || s === 'closed' || s === 'disconnected') return 'bad';
  return 'wait';
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no fallback */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
