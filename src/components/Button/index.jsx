import { playSound } from '../../audio/soundManager.js';
import './Button.css';

/**
 * Botão principal do app. Alvo de toque ≥64px, som de clique embutido.
 *
 * @param {'primary'|'success'|'secondary'|'energy'|'ghost'|'cyan'|'danger'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} block   ocupa 100% da largura (padrão em mobile)
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = true,
  disabled = false,
  icon = null,
  hint = null,
  silent = false,
  onClick,
  type = 'button',
  ...rest
}) {
  function handleClick(event) {
    if (disabled) return;
    if (!silent) playSound('click');
    if (onClick) onClick(event);
  }

  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}${block ? ' btn--block' : ''}`}
      disabled={disabled}
      onClick={handleClick}
      {...rest}
    >
      {icon && <span className="btn__icon" aria-hidden="true">{icon}</span>}
      <span className="btn__label">{children}</span>
      {hint && <span className="btn__hint">{hint}</span>}
    </button>
  );
}
