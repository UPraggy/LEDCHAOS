import './Timer.css';

/**
 * Timer do microjogo. Anel + segundos. Fica vermelho e pulsa nos últimos 5s.
 *
 * @param {number} remaining ms restantes
 * @param {number} duration  ms totais
 */
export default function Timer({ remaining, duration }) {
  const safeDuration = Math.max(1, duration);
  const ratio = Math.max(0, Math.min(1, remaining / safeDuration));
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const urgent = remaining <= 5000;

  // Anel via conic-gradient: zero custo de layout, sem SVG.
  return (
    <div
      className={`timer${urgent ? ' timer--urgent' : ''}`}
      style={{ '--timer-ratio': ratio }}
      role="timer"
      aria-label={`${seconds} segundos restantes`}
    >
      <span className="timer__value u-mono">{seconds}</span>
    </div>
  );
}
