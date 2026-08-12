import './Logo.css';

/**
 * Marca do jogo. CHAOS escrito em display, com o "O" virando um alvo —
 * a referência é o toque, que é o verbo do jogo inteiro.
 *
 * @param {'sm'|'md'|'lg'} size
 */
export default function Logo({ size = 'lg', tagline = false }) {
  return (
    <div className={`logo logo--${size}`}>
      <div className="logo__word" aria-label="CHAOS">
        <span className="logo__letter">C</span>
        <span className="logo__letter">H</span>
        <span className="logo__letter">A</span>
        <span className="logo__target" aria-hidden="true">
          <span className="logo__ring" />
          <span className="logo__dot" />
        </span>
        <span className="logo__letter">S</span>
      </div>
      {tagline && <p className="logo__tagline">MICROGAME PARTY</p>}
    </div>
  );
}
