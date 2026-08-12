/**
 * qrGen — desenha o texto de signaling como QR Code.
 *
 * Uso só a lib `qrcode` (gerar QR à mão é muito código). Quanto maior o texto,
 * mais baixa a correção de erro (ECC) para caber mais dados no mesmo QR. Se
 * nem assim couber, a lib lança erro e a UI orienta o "copiar hash".
 */

import QRCode from 'qrcode';

/** ECC conforme o tamanho: texto curto pode ter correção alta; longo, baixa. */
function pickEcc(len) {
  if (len <= 300) return 'M';
  if (len <= 800) return 'L';
  return 'L';
}

/**
 * Gera um data URL (PNG) do QR. A UI põe num <img> e escala por CSS.
 * @returns {Promise<string>} dataURL
 * @throws se o texto for grande demais até para ECC baixo (→ usar hash)
 */
export async function toDataUrl(text, { margin = 2, scale = 6, ecc } = {}) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: ecc || pickEcc(text.length),
    margin,
    scale, // px por módulo; o CSS reescala pro tamanho da tela
    color: { dark: '#1a1420', light: '#ffffff' }, // tinta-escura sobre branco: leitura fácil
  });
}

/** true se dá para gerar um QR deste texto (senão a UI mostra só o hash). */
export async function fitsInQr(text) {
  try {
    await QRCode.toString(text, { errorCorrectionLevel: pickEcc(text.length), type: 'utf8' });
    return true;
  } catch {
    return false;
  }
}
