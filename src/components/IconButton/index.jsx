import { playSound } from '../../audio/soundManager.js';
import './IconButton.css';

/** Botão só de ícone/emoji. Sempre com aria-label (é o único texto que existe). */
export default function IconButton({ children, label, onClick, active = false, silent = false, ...rest }) {
  function handleClick(event) {
    if (!silent) playSound('click');
    if (onClick) onClick(event);
  }

  return (
    <button
      type="button"
      className={`icon-btn${active ? ' icon-btn--active' : ''}`}
      aria-label={label}
      title={label}
      onClick={handleClick}
      {...rest}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
