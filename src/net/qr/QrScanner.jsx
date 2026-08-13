import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useZxing } from 'react-zxing';
import Button from '../../components/Button';
import './handshake.css';

/**
 * QrScanner — overlay de tela cheia que abre a câmera e devolve o texto do
 * primeiro QR lido.
 *
 * Decodificação por react-zxing (ZXing puro em JS): sem WASM e sem CDN — combina
 * com o "zero servidor" do modo direto, e lê QR de frame de câmera bem melhor que
 * o jsQR que usávamos na unha antes (o motivo do "não escaneia" no celular).
 *
 * Vai num PORTAL para o <body> de propósito:
 *   1. o visor cobre a página inteira → nenhum texto da tela por baixo se
 *      sobrepõe ao scanner nem vaza na horizontal no mobile;
 *   2. escapa do `transform` que o `.screen` mantém após a animação de entrada
 *      (`rise ... both`) — que prenderia um `position:fixed` comum dentro da tela.
 *
 * Monta logo após o clique em ESCANEAR (ainda dentro do gesto do usuário, que o
 * iOS exige para abrir a câmera) e desmonta ao ler/cancelar.
 */
export default function QrScanner({ onResult, onCancel, hint }) {
  // callbacks sempre atuais, sem recriar o hook da câmera a cada render
  const cb = useRef({ onResult, onCancel });
  cb.current = { onResult, onCancel };

  // Câmera exige contexto seguro: fora de HTTPS/localhost o getUserMedia nem existe.
  const insecure = typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia;
  const [error, setError] = useState(
    insecure
      ? 'A câmera precisa de HTTPS. Toque em CANCELAR e use “anexar imagem” com um print do QR.'
      : null,
  );

  const { ref } = useZxing({
    paused: insecure, // sem câmera possível: não tenta abrir, só mostra o aviso
    constraints: { audio: false, video: { facingMode: 'environment' } }, // traseira
    timeBetweenDecodingAttempts: 150,
    onDecodeResult(result) {
      cb.current.onResult(result.getText());
    },
    onError(err) {
      setError(friendlyCameraError(err));
    },
    // onDecodeError dispara a cada frame que não achou QR — ruído esperado, ignore.
  });

  const overlay = (
    <div className="scan" role="dialog" aria-modal="true" aria-label="Escanear QR Code">
      <p className="scan__hint">{hint || 'Aponte a câmera para o QR Code'}</p>

      <div className="scan__frame">
        <video ref={ref} className="scan__video" playsInline muted />
        <span className="scan__reticle" aria-hidden="true" />
      </div>

      {error ? (
        <p className="scan__err" role="alert">
          {error}
        </p>
      ) : null}

      <div className="scan__bar">
        <Button variant="ghost" onClick={() => cb.current.onCancel()}>
          CANCELAR
        </Button>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/** Mapeia o erro de câmera (getUserMedia) para uma frase clara em PT. */
function friendlyCameraError(err) {
  const name = (err && (err.name || err.constructor?.name)) || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permissão da câmera negada. Libere a câmera nas configurações ou use “anexar imagem”.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return 'Câmera indisponível neste aparelho. Toque em CANCELAR e use “anexar imagem” com um print.';
  }
  return 'Não foi possível abrir a câmera. Toque em CANCELAR e use “anexar imagem” com um print do QR.';
}
