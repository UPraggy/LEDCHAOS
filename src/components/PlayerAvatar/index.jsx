import { useState } from 'react';
import { getAvatarImage, getAvatarName } from '../../data/avatars.js';
import './PlayerAvatar.css';

/**
 * Avatar do jogador = personagem-adesivo (PNG do protótipo).
 * @param {string} avatar   id do avatar (avatar-01..12) ou índice numérico
 * @param {string} color    cor do jogador (hex) — vira o anel de destaque
 * @param {number} size     px
 * @param {boolean} dim     estado apagado (ex.: eliminado / não pronto)
 * @param {string}  badge   emoji/texto pequeno no canto (ex.: 👑 host, 🔥 streak)
 * @param {boolean} ring    anel colorido de destaque
 * @param {boolean} float   flutuação suave (avatar em destaque, tipo "você")
 */
export default function PlayerAvatar({
  avatar = 'avatar-01',
  color = 'var(--p1)',
  size = 48,
  dim = false,
  badge = null,
  ring = false,
  float = false,
}) {
  const [broken, setBroken] = useState(false);
  const src = getAvatarImage(avatar);
  const name = getAvatarName(avatar);

  return (
    <span
      className={`avatar${dim ? ' avatar--dim' : ''}${ring ? ' avatar--ring' : ''}${float ? ' avatar--float' : ''}`}
      style={{ '--avatar-size': `${size}px`, '--avatar-color': color }}
    >
      {broken ? (
        // Fallback: disco na cor do jogador com a inicial do personagem.
        <span className="avatar__fallback" aria-hidden="true">
          {name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <img
          className="avatar__img"
          src={src}
          alt={`Avatar ${name}`}
          draggable="false"
          onError={() => setBroken(true)}
        />
      )}
      {badge && <span className="avatar__badge">{badge}</span>}
    </span>
  );
}
