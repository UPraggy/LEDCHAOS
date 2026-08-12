import { useCallback, useEffect, useRef, useState } from 'react';
import './selos.css';

/* ===========================================================================
   Selos de pontuação — o retorno "na hora" que faltava no meio da jogada.

   Antes: cada jogo tinha (ou não) seu próprio número flutuante em `.gpop`, com
   texto solto ("absurdo", "bom") decidido caso a caso. Não havia um veredito
   comum, nem os pontos, nem o "SUBIU DE NÍVEL".

   Aqui mora UM só carimbo, na identidade do jogo (adesivo: contorno de tinta,
   fonte display para a palavra, mono para os pontos, cor do estado). O jogo só
   dispara `fire()` no ponto do acerto e esquece o resto — o selo sobe, carimba
   e some sozinho, e some junto quando a rodada desmonta.

   Fica DENTRO do `.gscene__stage` (que é position:relative), então as coords
   são relativas ao campo de jogo. `fire` aceita tanto x/y do stage quanto
   clientX/clientY de um evento de ponteiro — converte pela caixa da camada.
   =========================================================================== */

let SEQ = 0;

/**
 * @typedef {Object} SeloOpts
 * @property {number} [x]        px relativo ao stage (centro do selo)
 * @property {number} [y]        px relativo ao stage
 * @property {number} [clientX]  alternativa: coord de tela (convertida)
 * @property {number} [clientY]
 * @property {string} [text]     veredito: 'PERFEITO', 'BOM', 'ERROU'…
 * @property {number} [points]   +100 / -30 (sinal vira o prefixo)
 * @property {'good'|'great'|'bad'|'accent'} [tone]
 * @property {boolean} [big]     banner central que carimba (SUBIU DE NÍVEL)
 * @property {number} [ttl]      ms em tela (default 850, big 1100)
 */

/**
 * Camada de selos para um microjogo.
 *
 * @param {{max?:number}} [config] teto de selos simultâneos (evita enxame)
 * @returns {{ fire:(o:SeloOpts)=>number, center:(o:SeloOpts)=>number, layer:JSX.Element }}
 */
export function useSelos({ max = 5 } = {}) {
  const [items, setItems] = useState([]);
  const layerRef = useRef(null);
  const timersRef = useRef(new Map());

  const drop = useCallback((id) => {
    setItems((list) => list.filter((s) => s.id !== id));
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
  }, []);

  const fire = useCallback((opts = {}) => {
    const id = (SEQ += 1);

    // Converte coord de tela → coord do stage, se foi isso que veio.
    let { x, y } = opts;
    if (x == null && opts.clientX != null) {
      const rect = layerRef.current?.getBoundingClientRect();
      if (rect) { x = opts.clientX - rect.left; y = opts.clientY - rect.top; }
    }

    const selo = {
      id,
      x: x ?? null,
      y: y ?? null,
      text: opts.text ?? '',
      points: opts.points ?? null,
      tone: opts.tone ?? 'good',
      big: !!opts.big,
      ttl: opts.ttl ?? (opts.big ? 1100 : 850),
    };

    setItems((list) => {
      const next = [...list, selo];
      // Estoura o mais antigo se passou do teto — em jogo de martelar, dez selos
      // empilhados viram ruído e comem frame.
      return next.length > max ? next.slice(next.length - max) : next;
    });

    const timer = setTimeout(() => drop(id), selo.ttl);
    timersRef.current.set(id, timer);
    return id;
  }, [drop, max]);

  /** Atalho: selo grande no centro do campo (SUBIU DE NÍVEL, COMBO). */
  const center = useCallback(
    (opts = {}) => fire({ ...opts, x: null, y: null, big: opts.big ?? true }),
    [fire],
  );

  // Rodada desmonta a cada jogo: mata timers pendentes para não chamar setState
  // num componente morto.
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach((t) => clearTimeout(t)); timers.clear(); };
  }, []);

  const layer = (
    <div className="selos" ref={layerRef} aria-hidden="true">
      {items.map((s) => {
        const centered = s.x == null;
        return (
          <div
            key={s.id}
            className={[
              'selo',
              `selo--${s.tone}`,
              s.big ? 'selo--big' : '',
              centered ? 'selo--center' : '',
            ].join(' ').trim()}
            style={centered ? undefined : { left: `${s.x}px`, top: `${s.y}px` }}
          >
            {s.text ? <span className="selo__word">{s.text}</span> : null}
            {s.points != null ? (
              <span className="selo__pts">
                {s.points > 0 ? `+${s.points}` : `${s.points}`}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return { fire, center, layer };
}

/* ------------------------------------------------------------------ veredito */

/**
 * Veredito comum por qualidade 0..1 (1 = perfeito). Devolve { text, tone } já
 * pronto para o `fire`. Uniformiza a linguagem entre os jogos de tempo/mira.
 *
 * @param {number} q 0..1
 * @returns {{text:string, tone:'good'|'great'|'bad'}}
 */
export function judge(q) {
  if (q >= 0.9) return { text: 'PERFEITO', tone: 'great' };
  if (q >= 0.65) return { text: 'ÓTIMO', tone: 'good' };
  if (q >= 0.35) return { text: 'BOM', tone: 'good' };
  return { text: 'ERROU', tone: 'bad' };
}
