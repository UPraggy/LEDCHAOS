import './ScoreBadge.css';

/**
 * Pílula de pontuação/estatística. Usada no HUD dos microjogos.
 *
 * @param {'neutral'|'good'|'bad'|'accent'} tone
 */
export default function ScoreBadge({ label, value, tone = 'neutral', size = 'md', pulseKey = null }) {
  return (
    <div className={`sbadge sbadge--${tone} sbadge--${size}`} key={pulseKey ?? undefined}>
      {label && <span className="sbadge__label">{label}</span>}
      <span className="sbadge__value u-mono">{value}</span>
    </div>
  );
}
