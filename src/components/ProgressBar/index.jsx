import './ProgressBar.css';

/**
 * Barra de progresso genérica (MASH, RACE, carregamento de rodada…).
 *
 * @param {number} value  0–1
 * @param {string} color  cor da barra (default: accent da rodada)
 * @param {string} label  texto curto à esquerda
 * @param {string} value  texto curto à direita
 */
export default function ProgressBar({ value = 0, color = null, label = null, right = null, size = 'md' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`pbar pbar--${size}`} style={color ? { '--pbar-color': color } : undefined}>
      {(label || right) && (
        <div className="pbar__meta">
          {label && <span className="pbar__label">{label}</span>}
          {right && <span className="pbar__right u-mono">{right}</span>}
        </div>
      )}
      <div
        className="pbar__track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'progresso'}
      >
        <div className="pbar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
