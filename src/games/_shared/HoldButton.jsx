/**
 * Botão de segurar.
 *
 * `setPointerCapture` é o detalhe que faz isto funcionar no celular: sem ele,
 * arrastar o polegar um milímetro para fora do botão dispara `pointerleave` e
 * o personagem trava no meio do movimento. Com captura, o dedo só solta quando
 * solta mesmo — e `onPointerCancel` cobre o resto (chamada entrando, gesto do
 * sistema, aba trocando).
 *
 * O visual fica com quem usa: passe `className` e estilize `.sua-classe.is-on`.
 *
 * @param {string} label      o que aparece no botão ('←', '→', 'PULAR'…)
 * @param {string} ariaLabel  como o leitor de tela anuncia
 * @param {boolean} active    desenha o estado pressionado
 * @param {function} onHold   dedo encostou
 * @param {function} onRelease dedo saiu (soltou ou cancelou)
 */
export default function HoldButton({
  label,
  ariaLabel,
  active = false,
  onHold,
  onRelease,
  className = 'ghold',
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`${className}${active ? ' is-on' : ''}`}
      aria-label={ariaLabel || label}
      disabled={disabled}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onHold?.();
      }}
      onPointerUp={() => onRelease?.()}
      onPointerCancel={() => onRelease?.()}
    >
      <span aria-hidden="true">{label}</span>
    </button>
  );
}
