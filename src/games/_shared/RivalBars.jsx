import './game.css';

/**
 * Fita de progresso dos adversários, no topo da área de jogo.
 *
 * Existe por um motivo de sensação: sem isto o jogador joga sozinho e só
 * descobre que havia uma disputa na tela de resultado. Com isto ele sente o
 * outro encostando.
 *
 * Mostra no máximo 5. Em tela de celular, oito barrinhas viram ruído e ocupam
 * espaço que é do jogo.
 *
 * @param {object[]} rivals [{ id, name, color, value }]
 * @param {number} max valor que representa a barra cheia
 */
export default function RivalBars({ rivals = [], max = 1, limit = 5 }) {
  if (!rivals.length) return null;

  const top = [...rivals].sort((a, b) => b.value - a.value).slice(0, limit);
  const ceiling = Math.max(max, 1);

  return (
    <div className="grivals" aria-hidden="true">
      {top.map((rival) => (
        <div className="grival" key={rival.id}>
          <span className="grival__name">{rival.name}</span>
          <span className="grival__track">
            <span
              className="grival__fill"
              style={{
                width: `${Math.max(0, Math.min(100, (rival.value / ceiling) * 100))}%`,
                '--grival-color': rival.color,
              }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
