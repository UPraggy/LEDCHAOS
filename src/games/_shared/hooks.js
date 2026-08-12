import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hooks de runtime dos microjogos.
 *
 * Tudo aqui existe por um motivo só: microjogo não pode vazar timer, rAF nem
 * listener. Cada hook devolve o cleanup certo, então o microjogo só descreve o
 * que quer e esquece o resto.
 */

/* ------------------------------------------------------------------ relógio */

/**
 * Relógio da rodada, em TEMPO REAL.
 *
 * Importante: `timeScale` (evento ACELERADO / CÂMERA LENTA) NÃO entra aqui.
 * O watchdog do Game corta a rodada em `duration + WATCHDOG_GRACE` de tempo
 * real — se a câmera lenta esticasse o relógio, o watchdog mataria a partida no
 * meio. timeScale escala a SIMULAÇÃO (velocidade dos objetos, spawn), nunca a
 * duração. Está documentado em 01-ARQUITETURA.md.
 *
 * @param {number} duration ms
 * @param {function} onEnd  chamado uma única vez quando zera
 * @param {boolean} active  pausa o relógio quando false
 * @returns {{remaining:number, elapsed:number, done:boolean, stop:function}}
 */
export function useGameClock(duration, onEnd, active = true) {
  const [remaining, setRemaining] = useState(duration);
  const doneRef = useRef(false);
  const startRef = useRef(0);
  const pausedRef = useRef(0);
  const shownRef = useRef(duration);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const stop = useCallback(() => {
    doneRef.current = true;
  }, []);

  useEffect(() => {
    if (!active) {
      pausedRef.current = performance.now();
      return undefined;
    }
    // Retomar depois de pausa não pode "comer" tempo do jogador.
    if (pausedRef.current && startRef.current) {
      startRef.current += performance.now() - pausedRef.current;
    }
    pausedRef.current = 0;
    if (!startRef.current) startRef.current = performance.now();

    let frame = 0;
    const tick = () => {
      if (doneRef.current) return;
      const left = Math.max(0, duration - (performance.now() - startRef.current));
      // Só atualiza o estado a cada 100ms. Sem isto o microjogo inteiro
      // re-renderiza 60x por segundo por causa de um relógio que ninguém lê
      // com essa precisão — e a simulação, que roda no canvas, paga a conta.
      if (Math.ceil(left / 100) !== Math.ceil(shownRef.current / 100)) {
        shownRef.current = left;
        setRemaining(left);
      }
      if (left <= 0) {
        doneRef.current = true;
        shownRef.current = 0;
        setRemaining(0);
        endRef.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, active]);

  return { remaining, elapsed: duration - remaining, done: doneRef.current, stop };
}

/* ---------------------------------------------------------------------- rAF */

/**
 * Laço de animação. Entrega `dt` em segundos, já limitado.
 *
 * O teto de dt não é preciosismo: quando o jogador troca de aba ou atende uma
 * ligação, o rAF volta com um salto de segundos e o objeto atravessa a tela
 * inteira num frame — colisão perdida, jogo quebrado.
 *
 * @param {function} callback (dt, now) — recebe a versão mais recente sempre
 * @param {boolean} active
 * @param {number} maxDt segundos
 */
export function useRaf(callback, active = true, maxDt = 0.05) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    let last = performance.now();

    const loop = (now) => {
      const dt = Math.min((now - last) / 1000, maxDt);
      last = now;
      cbRef.current?.(dt, now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active, maxDt]);
}

/* ------------------------------------------------------------------- canvas */

/**
 * Dimensiona o canvas pelo pai, com DPR limitado a 2.
 *
 * Teto de 2: em celular topo de linha o DPR chega a 3-4, e um canvas 4x é
 * 16x mais pixels para pintar por frame. A 30s de jogo isso é bateria e frame
 * drop sem ganho visual nenhum.
 *
 * O contexto já vem com a transform aplicada — desenhe em px de CSS e NÃO
 * chame setTransform/resetTransform dentro do seu laço.
 *
 * @returns {object} ref com { w, h, dpr } em px de CSS
 */
export function useCanvasSize(canvasRef, onResize = null) {
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const cbRef = useRef(onResize);
  cbRef.current = onResize;

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    function resize() {
      const rect = parent.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      sizeRef.current = { w, h, dpr };
      cbRef.current?.(sizeRef.current);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canvasRef]);

  return sizeRef;
}

/**
 * Lê tokens do CSS para usar no canvas.
 *
 * Canvas não entende `var(--token)`: fillStyle precisa de uma cor concreta. Em
 * vez de repetir hex dentro do JS (e a paleta viver em dois lugares), o jogo
 * pergunta ao elemento qual é o valor computado. `--game-accent` chega aqui já
 * como `hsl(190 82% 62%)`, com o matiz da rodada aplicado.
 *
 * @param {Element} el elemento dentro da árvore que tem os tokens
 * @param {string[]} names ['--color-success', '--game-accent', …]
 * @returns {object} { '--color-success': 'rgb(…)', … }
 */
export function readCssColors(el, names) {
  const out = {};
  if (!el) return out;
  const style = getComputedStyle(el);
  names.forEach((name) => {
    out[name] = style.getPropertyValue(name).trim() || '#FFFFFF';
  });
  return out;
}

/** Respeita quem pediu menos animação. Consultado uma vez, no mount. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/* ------------------------------------------------------------------- fechar */

/**
 * Garante que `onFinish` roda UMA vez só.
 * O Game também tem essa trava, mas o microjogo tem N caminhos de saída
 * (tempo, objetivo cumprido, uma vida perdida) e é fácil chamar duas vezes.
 */
export function useFinishOnce(onFinish) {
  const doneRef = useRef(false);
  const fnRef = useRef(onFinish);
  fnRef.current = onFinish;

  return useCallback((entries) => {
    if (doneRef.current) return;
    doneRef.current = true;
    fnRef.current?.(entries);
  }, []);
}

/**
 * Valor que sobrevive a re-render sem causar um. Para estado de simulação
 * (posições, velocidades) que muda 60x por segundo e não pertence ao React.
 */
export function useLatest(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/* ---------------------------------------------------------------- desfecho */

/** Quanto tempo o microjogo mostra o próprio resultado antes de entregar. */
export const END_HOLD = 1100;

/**
 * Fecha o microjogo em dois tempos: mostra o desfecho, DEPOIS entrega.
 *
 * `finishRound` troca a fase na hora e desmonta o microjogo — se ele chamasse
 * onFinish direto, o jogador nunca veria o próprio resultado (o "142ms", o
 * "12 acertos"). Então o jogo chama `end({...})`, o card fica no ar por
 * END_HOLD e só então o onFinish acontece.
 *
 * A folga cabe no watchdog: duration + 1100 < duration + WATCHDOG_GRACE.
 *
 * @param {function} onFinish do contrato do microjogo
 * @param {number} hold ms
 * @returns {[object|null, function]} [desfecho, end({ entries, ...card })]
 */
export function useOutcome(onFinish, hold = END_HOLD) {
  const [outcome, setOutcome] = useState(null);
  const finish = useFinishOnce(onFinish);
  const armedRef = useRef(false);

  const end = useCallback((payload) => {
    if (armedRef.current) return;
    armedRef.current = true;
    setOutcome(payload || {});
  }, []);

  useEffect(() => {
    if (!outcome) return undefined;
    const t = setTimeout(() => finish(outcome.entries || []), hold);
    return () => clearTimeout(t);
  }, [outcome, hold, finish]);

  return [outcome, end];
}
