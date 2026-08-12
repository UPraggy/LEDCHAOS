import Timer from '../Timer';
import './GameHeader.css';

/**
 * HUD superior comum a TODOS os microjogos.
 * Mantém o jogador orientado: onde estou, quanto falta, o que fazer.
 *
 * @param {string} title      nome do microjogo
 * @param {string} instruction instrução de 1 linha (o jogo se explica sozinho)
 * @param {number} round      rodada atual
 * @param {number} totalRounds
 * @param {number} remaining  ms
 * @param {number} duration   ms
 * @param {node}   right      badges extras (pontos, combo…)
 */
export default function GameHeader({
  title,
  instruction = null,
  round = null,
  totalRounds = null,
  remaining = null,
  duration = null,
  children = null,
}) {
  return (
    <header className="ghead">
      <div className="ghead__top">
        <div className="ghead__id">
          {round !== null && (
            <span className="ghead__round u-mono">
              {round}/{totalRounds}
            </span>
          )}
          <span className="ghead__title u-display">{title}</span>
        </div>
        {remaining !== null && <Timer remaining={remaining} duration={duration} />}
      </div>

      {instruction && <p className="ghead__instruction">{instruction}</p>}
      {children && <div className="ghead__badges">{children}</div>}
    </header>
  );
}
