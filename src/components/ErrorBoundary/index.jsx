import { Component } from 'react';
import './ErrorBoundary.css';

/**
 * Rede de segurança. Se um microjogo (ou qualquer subárvore) explodir,
 * o jogo NÃO fica em tela branca: mostra "ERRO NO JOGO" e chama onError,
 * que no screens/Game empurra a partida para a próxima rodada.
 *
 * Uso:
 *   <ErrorBoundary resetKey={round} onError={goNext} label="MICROJOGO">
 *     <Microgame … />
 *   </ErrorBoundary>
 *
 * `resetKey` muda ⇒ o boundary se recompõe (nova rodada tenta de novo).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log é o único canal de diagnóstico que temos (sem backend).
    console.error('[CHAOS] falha capturada:', error, info?.componentStack);
    if (this.props.onError) this.props.onError(error);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="eboundary" role="alert">
          <p className="eboundary__emoji" aria-hidden="true">💥</p>
          <p className="eboundary__title u-display">ERRO NO JOGO</p>
          <p className="eboundary__text">
            {this.props.label ? `${this.props.label} falhou. ` : ''}
            Pulando para o próximo desafio…
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
