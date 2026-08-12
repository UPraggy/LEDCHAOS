import { useEffect } from 'react';
import { playSound } from '../../audio/soundManager.js';
import './ChaosEventBanner.css';

/**
 * Banner do evento CHAOS da rodada. Aparece por cima da intro do microjogo,
 * grita o que mudou e sai. Só isso — o efeito em si é aplicado pelo engine.
 *
 * @param {object} event {id, name, emoji, description}
 */
export default function ChaosEventBanner({ event }) {
  useEffect(() => {
    if (event) playSound('chaos');
  }, [event]);

  if (!event) return null;

  return (
    <div className="chaosb" role="status">
      <span className="chaosb__flash" aria-hidden="true" />
      <p className="chaosb__kicker u-display">EVENTO CHAOS</p>
      <p className="chaosb__name u-display">
        <span className="chaosb__emoji" aria-hidden="true">{event.emoji}</span>
        {event.name}
      </p>
      <p className="chaosb__desc">{event.description}</p>
    </div>
  );
}
