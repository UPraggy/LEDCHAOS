import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';
import { toDataUrl } from './qrGen.js';
import { decodeImageFile } from './qrScan.js';
import { canShare, copyText } from '../../room/roomLink.js';
import QrScanner from './QrScanner.jsx';
import './handshake.css';

/**
 * handshake — os três widgets do aperto de mão P2P por QR/hash.
 *
 * Nasceram dentro da tela /p2p (a PROVA de conexão) e viraram compartilhados
 * quando o mesmo aperto de mão passou a valer no fluxo real: o host gera o
 * convite no Lobby e o convidado devolve a resposta na tela direta. Sem
 * servidor de rendezvous, offer e answer viajam FORA de banda — é o que estes
 * widgets desenham (QR grande) e resgatam (colar / escanear / anexar foto).
 *
 *   QrImage      — pinta um texto de signaling como QR (com aviso se não couber)
 *   CopyHashRow  — copiar / compartilhar o mesmo texto como hash
 *   ImportPanel  — colar hash, escanear QR ao vivo, ou anexar um print do QR
 */

/** Desenha o texto de signaling como QR. Se não couber, orienta o "copiar hash". */
export function QrImage({ text }) {
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
        Não deu pra desenhar o QR aqui.
        <br />
        Toque em <b>ENVIAR QR</b> abaixo.
      </div>
    );
  }
  if (!src) return <div className="qr qr--msg">gerando QR…</div>;
  return <img className="qr" src={src} alt="QR Code de conexão" />;
}

/**
 * ShareQrButton — o jeito FÁCIL de mandar o convite: compartilha a IMAGEM do QR.
 *
 * Em vez de copiar um hash gigante (que o WhatsApp quebra em linhas e a pessoa
 * cola errado), gera o PNG do QR e abre o menu nativo com o ARQUIVO — a pessoa
 * escolhe WhatsApp e manda a figura. Quem recebe abre em /direto e toca em
 * "LER QR DE UMA FOTO". Sem câmera, sem hash, sem mesma rede.
 *
 * Sem Web Share de arquivo (desktop, navegador antigo): baixa o PNG para anexar
 * à mão. É a mesma imagem — só muda quem aperta "enviar".
 */
export function ShareQrButton({ text, label = 'ENVIAR QR' }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function send() {
    setBusy(true);
    setNote('');
    try {
      const dataUrl = await toDataUrl(text, { scale: 8, margin: 3 });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'chaos-qr.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'CHAOS — QR de conexão' });
        setBusy(false);
        return;
      }

      // fallback desktop: baixa o PNG para a pessoa anexar onde quiser.
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'chaos-qr.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setNote('QR salvo na galeria/downloads — anexe no WhatsApp.');
    } catch (err) {
      if (err && err.name === 'AbortError') { setBusy(false); return; } // fechou o menu: ok
      setNote('Não deu pra gerar a imagem do QR.');
    }
    setBusy(false);
  }

  return (
    <div className="qrsend">
      <Button variant="energy" icon="📤" disabled={busy} onClick={send}>
        {busy ? 'GERANDO…' : label}
      </Button>
      {note ? <p className="qrsend__note">{note}</p> : null}
    </div>
  );
}

/** Copiar/compartilhar o convite — manda o hash pra quem não está do seu lado. */
export function CopyHashRow({ text }) {
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

/**
 * Receber o QR do outro lado. Dois jeitos: ESCANEAR ao vivo (câmera) ou LER a
 * FOTO que a pessoa te mandou (o print do QR).
 *
 * `hidePaste` (padrão true no fluxo direto) esconde o campo de colar hash — o
 * Rafael não quer hash, só a imagem. A prova /p2p passa `hidePaste={false}` e
 * mantém o textarea para depurar. Serve host e convidado.
 */
export function ImportPanel({ cta, placeholder, scanHint, onSubmit, hidePaste = true }) {
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

  // Fluxo direto: só as duas formas por IMAGEM, com rótulo que se explica.
  // Nada de hash — é o que confundia o Rafael.
  if (hidePaste) {
    return (
      <div className="import import--simple">
        <div className="import__actions">
          <Button variant="energy" icon="📷" onClick={() => setScanning(true)}>
            ESCANEAR COM A CÂMERA
          </Button>
          <Button variant="cyan" icon="🖼️" onClick={() => fileRef.current?.click()}>
            LER QR DE UMA FOTO
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

/** Copia texto: Clipboard API com o truque do textarea como rede de segurança. */
export async function copyToClipboard(text) {
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
