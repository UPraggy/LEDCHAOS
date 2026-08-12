import { useEffect, useRef } from 'react';

/** Lado do canto sensível, em px. Um pouco maior que o alvo mínimo de toque. */
const HOTSPOT = 56;
/** Toques necessários e janela para completar a sequência. */
const TAPS = 4;
const WINDOW = 1500;

/**
 * Gesto secreto que liga/desliga o painel de testes.
 *
 * O painel só se fecha por dentro — sem isto, `debug` nasce `false` e não existe
 * caminho para ligá-lo. Era um beco sem saída: a ferramenta existia inteira e
 * ninguém conseguia abrir a porta.
 *
 * Duas entradas, porque são dois contextos de teste diferentes:
 *
 *   • tecla `D` — para quem está no navegador do PC, com teclado à mão;
 *   • 4 toques rápidos no canto superior ESQUERDO — para quem está no celular
 *     de verdade, que é onde o jogo precisa ser testado.
 *
 * O canto de cima à esquerda é o lugar mais improvável de um jogo mobile
 * segurado com uma mão: o polegar direito não alcança sem virar o aparelho, e
 * nenhum microjogo põe alvo ali. Quatro toques em 1,5s não acontecem por acaso.
 *
 * Nada disso vaza para o usuário final: quem monta este hook é o painel, e o
 * painel só é montado sob `import.meta.env.DEV`. No build de produção o código
 * inteiro é removido pelo bundler.
 *
 * @param {() => void} onToggle chamado a cada ativação
 */
export default function useDebugGesture(onToggle) {
  // A callback vive num ref para o efeito não reassinar os listeners a cada
  // render — reassinar zeraria a contagem de toques no meio do gesto.
  const fire = useRef(onToggle);
  fire.current = onToggle;

  useEffect(() => {
    const taps = { n: 0, t: 0 };

    function onKey(event) {
      if (event.key !== 'd' && event.key !== 'D') return;
      // Não sequestra o `d` de ninguém digitando um nome ou um código de sala.
      const el = event.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      fire.current?.();
    }

    function onDown(event) {
      if (event.clientX > HOTSPOT || event.clientY > HOTSPOT) {
        taps.n = 0;
        return;
      }
      const now = event.timeStamp;
      taps.n = now - taps.t > WINDOW ? 1 : taps.n + 1;
      taps.t = now;
      if (taps.n >= TAPS) {
        taps.n = 0;
        fire.current?.();
      }
    }

    // Fase de captura: os microjogos capturam o ponteiro e param a propagação;
    // na descida o evento passa por aqui antes de qualquer um deles.
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, []);
}
