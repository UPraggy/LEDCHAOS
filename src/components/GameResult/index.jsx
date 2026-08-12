import { useEffect } from 'react';
import { playSound } from '../../audio/soundManager.js';
import './GameResult.css';

/**
 * Overlay de fim de microjogo — mostra o resultado PESSOAL do jogador local.
 * Some sozinho quando a tela de rodada assume. Não decide nada:
 * quem pontua é o engine.
 *
 * @param {string} value  valor grande ("142ms", "18.4m", "92%")
 * @param {string} label  o que é ("SUA REAÇÃO", "ALTURA")
 * @param {'good'|'bad'|'neutral'} tone
 * @param {string} note   linha extra opcional
 */
export default function GameResult({ value, label, tone = 'neutral', note = null, sound = true }) {
  useEffect(() => {
    if (!sound) return;
    playSound(tone === 'bad' ? 'miss' : 'score');
  }, [sound, tone]);

  return (
    <div className={`gresult gresult--${tone}`} role="status">
      <p className="gresult__label u-display">{label}</p>
      <p className="gresult__value u-mono">{value}</p>
      {note && <p className="gresult__note">{note}</p>}
      <p className="gresult__wait">APURANDO A RODADA…</p>
    </div>
  );
}
