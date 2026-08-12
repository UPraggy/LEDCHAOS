import './RotateHint.css';

/**
 * CHAOS é um jogo de celular em retrato. Todos os microjogos assumem uma tela
 * alta e estreita (plataformas subindo, arena quadrada, botões grandes embaixo
 * onde o polegar alcança).
 *
 * Em paisagem num celular a tela viraria uma faixa de 300px de altura e os
 * jogos ficariam injogáveis. Em vez de tentar reflowar 12 microjogos, cobrimos
 * a tela e pedimos para girar de volta.
 *
 * A visibilidade é 100% CSS (`@media (orientation: landscape)` + altura curta),
 * então não há listener de resize/orientationchange rodando durante a partida —
 * zero custo dentro do requestAnimationFrame dos jogos.
 */
export default function RotateHint() {
  return (
    <div className="rotate" role="alert" aria-live="polite">
      <div className="rotate__phone" aria-hidden="true">
        📱
      </div>
      <p className="rotate__title u-display">GIRE O CELULAR</p>
      <p className="rotate__text">CHAOS foi feito para jogar em pé, com uma mão.</p>
    </div>
  );
}
