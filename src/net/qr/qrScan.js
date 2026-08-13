/**
 * qrScan — leitura de QR Code por FOTO/print (sem câmera).
 *
 * A leitura AO VIVO pela câmera mora agora no <QrScanner> (react-zxing, ZXing
 * puro em JS). Aqui fica só o caminho por imagem: uma rede de segurança para
 * quando a câmera não abre (contexto inseguro na LAN http://, permissão negada
 * ou aparelho sem câmera) — o usuário anexa um print do QR e decodificamos com
 * o jsQR, que é ótimo para imagem parada (o ponto fraco dele era só o vídeo).
 */

import jsQR from 'jsqr';

/**
 * decodeImageFile — lê um QR de uma FOTO/print, sem câmera e sem exigir HTTPS.
 *
 * @param {File|Blob} file  imagem escolhida num <input type="file">
 * @returns {Promise<string>} o texto embutido no QR
 * @throws {Error} com `.friendly` quando não dá pra ler
 */
export function decodeImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(scanError('IMG_NONE', 'Nenhuma imagem selecionada.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        // Limita o lado maior a 1000px: QR não precisa de mais e evita canvas gigante.
        const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        // 'attemptBoth' cobre QR claro-no-escuro E escuro-no-claro (prints variados).
        const found = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
        if (found && found.data) return resolve(found.data);
        return reject(
          scanError('IMG_NO_QR', 'Não achei um QR nessa imagem. Tente uma foto mais nítida e reta.'),
        );
      } catch {
        return reject(scanError('IMG_FAIL', 'Não foi possível ler a imagem.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(scanError('IMG_FAIL', 'Não foi possível abrir a imagem.'));
    };
    img.src = url;
  });
}

function scanError(code, friendly) {
  const err = new Error(code);
  err.friendly = friendly;
  return err;
}
