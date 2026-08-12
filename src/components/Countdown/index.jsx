import { useEffect, useRef, useState } from 'react';
import { playSound } from '../../audio/soundManager.js';
import './Countdown.css';

/**
 * Contagem 3 · 2 · 1 · JÁ! antes de cada microjogo.
 * Autolimpa o timer no unmount (regra do repo: nada de timer órfão).
 *
 * @param {number}   from   número inicial (default 3)
 * @param {number}   step   ms por passo (default 700)
 * @param {function} onDone chamado UMA vez, no fim
 * @param {string}   title  nome do microjogo
 * @param {string}   hint   instrução curta ("TOQUE QUANDO ACENDER")
 */
export default function Countdown({ from = 3, step = 700, onDone, title = null, hint = null }) {
  const [n, setN] = useState(from);
  const doneRef = useRef(false);
  const doneCb = useRef(onDone);
  doneCb.current = onDone;

  useEffect(() => {
    let timer = null;
    let current = from;

    playSound('countdown');

    function tick() {
      current -= 1;
      setN(current);
      if (current > 0) {
        playSound('countdown');
        timer = setTimeout(tick, step);
      } else {
        playSound('go');
        timer = setTimeout(() => {
          if (doneRef.current) return;
          doneRef.current = true;
          if (doneCb.current) doneCb.current();
        }, step);
      }
    }

    timer = setTimeout(tick, step);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [from, step]);

  return (
    <div className="cdown">
      {title && <p className="cdown__title u-display">{title}</p>}
      {hint && <p className="cdown__hint">{hint}</p>}
      <div className="cdown__number u-display" key={n}>
        {n > 0 ? n : 'JÁ!'}
      </div>
      <span className="cdown__ring" key={`r${n}`} aria-hidden="true" />
    </div>
  );
}
