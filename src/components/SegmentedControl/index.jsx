import { playSound } from '../../audio/soundManager.js';
import './SegmentedControl.css';

/**
 * Escolha única em linha (rodadas, dificuldade).
 * Cada opção é um alvo de toque cheio — nada de <select> nativo, que num
 * celular abre uma roleta e mata o ritmo da tela.
 *
 * @param {{value:any,label:string,hint?:string}[]} options
 */
export default function SegmentedControl({ label = null, options = [], value, onChange, name }) {
  return (
    <div className="segmented">
      {label ? <p className="segmented__label u-label">{label}</p> : null}
      <div className="segmented__track" role="radiogroup" aria-label={label || name}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              className={`segmented__option${active ? ' is-active' : ''}`}
              onClick={() => {
                playSound('click');
                if (!active && onChange) onChange(option.value);
              }}
            >
              <span className="segmented__value">{option.label}</span>
              {option.hint ? <span className="segmented__hint">{option.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
