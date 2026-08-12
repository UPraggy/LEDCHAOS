/**
 * qrScan — lê um QR Code pela câmera do celular.
 *
 * Dois caminhos, escolhidos por suporte do navegador:
 *   • BarcodeDetector — nativo, rápido (Chrome/Android).
 *   • jsQR — fallback em JS puro (iOS/Safari NÃO tem BarcodeDetector).
 *
 * A câmera exige contexto seguro (HTTPS ou localhost) e um gesto do usuário
 * para começar — por isso `start()` deve ser chamado a partir de um clique.
 */

import jsQR from 'jsqr';

const SUPPORTS_DETECTOR = typeof window !== 'undefined' && 'BarcodeDetector' in window;

/**
 * @param {object} opts
 * @param {HTMLVideoElement} opts.video   elemento onde a câmera aparece
 * @param {(text:string)=>void} opts.onResult  chamado uma vez, no primeiro QR lido
 * @param {(err:Error)=>void} [opts.onError]   erro amigável (permissão, etc.)
 */
export function createScanner({ video, onResult, onError }) {
  let stream = null;
  let raf = 0;
  let canvas = null;
  let ctx = null;
  let detector = null;
  let stopped = false;

  function fail(code, friendly) {
    const err = new Error(code);
    err.friendly = friendly;
    stop();
    if (onError) onError(err);
  }

  async function start() {
    stopped = false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return fail('CAMERA_INSECURE', 'A câmera precisa de HTTPS (ou localhost) para abrir.');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, // câmera traseira
        audio: false,
      });
    } catch (e) {
      const name = e && e.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        return fail('CAMERA_DENIED', 'Permissão da câmera necessária para escanear.');
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return fail('CAMERA_NONE', 'Nenhuma câmera encontrada neste aparelho.');
      }
      return fail('CAMERA_FAIL', 'Não foi possível abrir a câmera.');
    }
    if (stopped) return stop();

    video.srcObject = stream;
    video.setAttribute('playsinline', 'true'); // iOS: não entra em tela cheia
    video.muted = true;
    try {
      await video.play();
    } catch {
      /* alguns navegadores resolvem no próximo tick */
    }

    if (SUPPORTS_DETECTOR) {
      try {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch {
        detector = null;
      }
    }
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    raf = requestAnimationFrame(tick);
  }

  async function tick() {
    if (stopped) return;
    if (video.readyState < 2 || !video.videoWidth) {
      raf = requestAnimationFrame(tick);
      return;
    }
    let text = null;
    try {
      if (detector) {
        const codes = await detector.detect(video);
        if (codes && codes.length) text = codes[0].rawValue;
      } else {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (found && found.data) text = found.data;
      }
    } catch {
      /* frame ruim: tenta o próximo */
    }
    if (text) {
      const out = onResult;
      stop();
      if (out) out(text);
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (video) {
      try {
        video.srcObject = null;
      } catch {
        /* noop */
      }
    }
  }

  return { start, stop, usesFallback: !SUPPORTS_DETECTOR };
}
