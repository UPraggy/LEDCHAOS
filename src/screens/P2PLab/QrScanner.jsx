import { useEffect, useRef, useState } from 'react';
import { createScanner } from '../../net/qr/qrScan.js';
import Button from '../../components/Button';

/**
 * QrScanner — abre a câmera e devolve o texto do primeiro QR lido.
 *
 * A mecânica (getUserMedia, BarcodeDetector/jsQR, parar tracks) mora em
 * `net/qr/qrScan.js`. Aqui é só a casca visual + o ciclo de vida React:
 * começa ao montar (logo após o clique que renderiza isto — ainda dentro
 * do gesto do usuário, que o iOS exige) e para ao desmontar.
 */
export default function QrScanner({ onResult, onCancel, hint }) {
  const videoRef = useRef(null);
  const cbRef = useRef({ onResult, onCancel });
  cbRef.current = { onResult, onCancel };

  const [error, setError] = useState(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const scanner = createScanner({
      video: videoRef.current,
      onResult: (text) => cbRef.current.onResult(text),
      onError: (err) => setError(err.friendly || 'Não foi possível abrir a câmera.'),
    });
    setFallback(scanner.usesFallback);
    scanner.start();
    return () => scanner.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scan">
      <div className="scan__frame">
        <video ref={videoRef} className="scan__video" playsInline muted />
        <span className="scan__reticle" aria-hidden="true" />
      </div>
      {error ? (
        <p className="scan__err" role="alert">
          {error}
        </p>
      ) : (
        <p className="scan__hint">
          {hint || 'Aponte a câmera para o QR Code'}
          {fallback ? ' · modo compatível' : ''}
        </p>
      )}
      <Button variant="ghost" onClick={() => cbRef.current.onCancel()}>
        CANCELAR
      </Button>
    </div>
  );
}
