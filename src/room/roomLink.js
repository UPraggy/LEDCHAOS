/**
 * Link da sala.
 * A origem vem SEMPRE de window.location.origin — nunca domínio fixo.
 * Assim o mesmo build funciona em localhost, no IP da LAN (é o que o celular
 * lê no QR) e em produção, sem trocar uma linha.
 *
 * O BASE entra porque o QR é uma URL EXTERNA, montada à mão — o react-router não
 * a prefixa. Na subpágina /LEDCHAOS/ o convite precisa ser .../LEDCHAOS/join/ID,
 * senão o celular cairia na raiz do host (o portfólio) e não na sala.
 */

import { BASE } from '../lib/basePath.js';

/** URL de convite: http://192.168.0.10:5173/join/7KX9Q (ou .../LEDCHAOS/join/… em produção) */
export function roomUrl(roomId) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${BASE}join/${roomId}`;
}

/** Versão curta para exibir na tela sem estourar a largura do celular. */
export function prettyRoomUrl(roomId) {
  return roomUrl(roomId).replace(/^https?:\/\//, '');
}

/** Copia texto. Usa a Clipboard API e cai para o truque do textarea se falhar. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* segue para o fallback */
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Compartilha via Web Share API (nativo no celular).
 * @returns {'shared'|'copied'|'failed'}
 */
export async function shareRoom(roomId) {
  const url = roomUrl(roomId);
  const payload = {
    title: 'CHAOS',
    text: `Entra na minha sala do CHAOS: ${roomId}`,
    url,
  };

  try {
    if (navigator.share) {
      await navigator.share(payload);
      return 'shared';
    }
  } catch (err) {
    // Cancelar o menu nativo cai aqui: não é erro, e não devemos copiar de novo.
    if (err && err.name === 'AbortError') return 'failed';
  }

  return (await copyText(url)) ? 'copied' : 'failed';
}

export function canShare() {
  return typeof navigator !== 'undefined' && !!navigator.share;
}
