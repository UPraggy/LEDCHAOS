import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../../components/Screen';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import IdentityForm from '../../components/IdentityForm';
import SegmentedControl from '../../components/SegmentedControl';
import { useGame } from '../../state/GameProvider.jsx';
import { generateRoomCode } from '../../room/roomCode.js';
import {
  ROUND_OPTIONS,
  DEFAULT_ROUNDS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_MODE,
  DEFAULT_SOLO_GAME,
} from '../../room/roomManager.js';
import { GAMES } from '../../engine/gameRegistry.js';
import { SKILL_PRESETS, DEFAULT_SKILL } from '../../data/players.js';
import './CreateRoom.css';

const ROUND_OPTS = ROUND_OPTIONS.map((n) => ({
  value: n,
  label: String(n),
  hint: 'RODADAS',
}));

const SKILL_OPTS = Object.entries(SKILL_PRESETS).map(([key, preset]) => ({
  value: key,
  label: preset.label,
}));

// Valor = TOTAL de jogadores na sala (o humano + os bots), igual ao que está
// escrito no botão. Já foi a contagem de bots, e aí o rótulo "4" produzia 3
// jogadores; se mexer aqui, mantenha valor e rótulo sendo a mesma coisa.
// A lista abre em 2 (dupla no mesmo sofá é o caso mais comum); o padrão da tela
// continua 4, logo abaixo. Sem `hint` por opção: com 5 colunas num celular de
// 360px o texto repetido não cabe, e o rótulo da seção já explica o número.
const PLAYER_OPTS = [2, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }));

/**
 * Criar sala. Tudo que o host decide antes de existir uma sala.
 *
 * O código da sala é gerado AQUI (não dentro do reducer) porque precisamos do id
 * para navegar. `dispatch` é assíncrono em relação ao `navigate`: se esperássemos
 * o estado voltar para saber o id, chegaríamos em /room/undefined.
 */
export default function CreateRoom() {
  const navigate = useNavigate();
  const { prefs, setName, setAvatar, createRoom } = useGame();

  const [rounds, setRounds] = useState(DEFAULT_ROUNDS);
  const [difficulty, setDifficulty] = useState(DEFAULT_SKILL);
  const [total, setTotal] = useState(4);

  // Modos (§2). picked começa com TODOS os jogos; soloGame com o padrão.
  const [mode, setMode] = useState(DEFAULT_MODE);
  const [picked, setPicked] = useState(() => GAMES.map((g) => g.id));
  const [soloGame, setSoloGame] = useState(DEFAULT_SOLO_GAME);

  const unico = mode === 'unico';

  // Multi-select na PARTIDA (nunca esvazia: desmarcar o último é no-op);
  // single-select no JOGO ÚNICO (a partida inteira roda esse jogo).
  function handlePick(id) {
    if (unico) {
      setSoloGame(id);
      return;
    }
    setPicked((prev) => {
      const has = prev.includes(id);
      if (has && prev.length === 1) return prev; // não deixa zerar
      return has ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  function handleCreate() {
    const id = generateRoomCode();
    const name = prefs.name.trim() || 'VOCÊ';
    createRoom({
      id,
      name,
      avatar: prefs.avatar,
      rounds,
      difficulty,
      bots: total - 1,
      mode,
      picked,
      soloGame,
    });
    navigate(`/room/${id}`);
  }

  return (
    <Screen>
      <div className="create__top">
        <IconButton label="Voltar" onClick={() => navigate('/')}>
          ←
        </IconButton>
        <p className="create__title u-display">CRIAR SALA</p>
        <span className="create__spacerTop" aria-hidden="true" />
      </div>

      <IdentityForm
        name={prefs.name}
        avatar={prefs.avatar}
        onName={setName}
        onAvatar={setAvatar}
      />

      {/* MODO — PARTIDA (sorteia) x JOGO ÚNICO (§2.3a) */}
      <div className="create__mode">
        <p className="create__modeLabel">MODO</p>
        <div className="modeTrack" role="tablist" aria-label="Modo de partida">
          <button
            type="button"
            role="tab"
            aria-selected={!unico}
            className={`modeBtn${!unico ? ' is-on' : ''}`}
            onClick={() => setMode('partida')}
          >
            PARTIDA
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={unico}
            className={`modeBtn${unico ? ' is-on' : ''}`}
            onClick={() => setMode('unico')}
          >
            JOGO ÚNICO
          </button>
        </div>
      </div>

      {/* MICROJOGOS — multi-select na partida, single-select no jogo único (§2.3b) */}
      <div className="create__games">
        <p className="create__modeLabel">
          {unico ? 'ESCOLHA O MICROJOGO' : 'MICROJOGOS NA PARTIDA'}
        </p>
        <div className="gamesGrid">
          {GAMES.map((g) => {
            const on = unico ? soloGame === g.id : picked.includes(g.id);
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                className={`gameCell${on ? ' is-on' : ''}`}
                onClick={() => handlePick(g.id)}
              >
                <span className="gameCell__icon" aria-hidden="true">{g.emoji}</span>
                <span className="gameCell__name">{g.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="create__settings">
        <SegmentedControl
          label="DURAÇÃO DA PARTIDA"
          name="rodadas"
          options={ROUND_OPTS}
          value={rounds}
          onChange={setRounds}
        />
        <SegmentedControl
          label={`QUANTOS JOGAM (${MIN_PLAYERS} A ${MAX_PLAYERS})`}
          name="jogadores"
          options={PLAYER_OPTS}
          value={total}
          onChange={setTotal}
        />
        <SegmentedControl
          label="NÍVEL DOS OPONENTES"
          name="dificuldade"
          options={SKILL_OPTS}
          value={difficulty}
          onChange={setDifficulty}
        />
      </div>

      <p className="create__note">
        Você joga como <b>Jogador 1</b>. Os outros são oponentes simulados até o
        multiplayer em rede entrar (Fase 2) — dá pra convidar gente pelo QR Code do lobby
        de qualquer forma.
      </p>

      <div className="screen__spacer" />

      <div className="screen__actions">
        <Button variant="success" size="lg" onClick={handleCreate}>
          CRIAR SALA
        </Button>
      </div>
    </Screen>
  );
}
