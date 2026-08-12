import PlayerAvatar from '../PlayerAvatar';
import { AVATAR_IDS, getAvatarName } from '../../data/avatars.js';
import { PLAYER_COLORS } from '../../data/players.js';
import { playSound } from '../../audio/soundManager.js';
import './IdentityForm.css';

/**
 * Nome + avatar do jogador local. Usado ao criar e ao entrar numa sala.
 * O nome é sempre maiúsculo e curto (10 chars) porque ele aparece em HUD de
 * jogo, onde não há espaço para "Rafael Moreira Ramos".
 */
export default function IdentityForm({ name, avatar, onName, onAvatar }) {
  const color = PLAYER_COLORS[0];

  return (
    <div className="identity">
      <div className="identity__head">
        <PlayerAvatar avatar={avatar} color={color} size={78} float />
        <div className="identity__field">
          <label className="identity__label u-label" htmlFor="identity-name">
            SEU NOME
          </label>
          <input
            id="identity-name"
            className="identity__input"
            value={name}
            onChange={(e) => onName(e.target.value.toUpperCase().slice(0, 10))}
            placeholder="VOCÊ"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            maxLength={10}
          />
        </div>
      </div>

      <div className="identity__grid" role="radiogroup" aria-label="Escolha seu avatar">
        {AVATAR_IDS.map((id) => {
          const active = id === avatar;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`Avatar ${getAvatarName(id)}`}
              className={`identity__pick${active ? ' is-active' : ''}`}
              onClick={() => {
                playSound('tap');
                onAvatar(id);
              }}
            >
              <PlayerAvatar avatar={id} color={color} size={34} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
