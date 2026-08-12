import { useEffect, useRef, useState } from 'react';
import QR from 'qrcode';
import './QRCode.css';

/**
 * QR Code da sala. Renderiza em <canvas> pela lib `qrcode` (não implementamos
 * QR na mão). Cores fixas de alto contraste: módulos void sobre bone —
 * é o que a câmera precisa, não é lugar para gradiente.
 *
 * @param {string} value URL completa (ex.: https://host:5173/join/7KX9Q)
 * @param {number} size  px
 */
export default function QRCode({ value, size = 200, caption = null }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !value) return undefined;

    QR.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#170F3EFF', light: '#FFFDF7FF' },
    })
      .then(() => {
        if (!cancelled) setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <figure className="qr" style={{ '--qr-size': `${size}px` }}>
      <div className="qr__frame">
        {/* Se o QR falhar, a sala ainda funciona pelo link/código — nunca tela vazia. */}
        {failed ? (
          <p className="qr__fallback">
            QR indisponível.
            <br />
            Use o código da sala.
          </p>
        ) : (
          <canvas ref={canvasRef} className="qr__canvas" aria-label="QR Code da sala" role="img" />
        )}
      </div>
      {caption && <figcaption className="qr__caption">{caption}</figcaption>}
    </figure>
  );
}
