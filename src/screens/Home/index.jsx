import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Screen from '../../components/Screen';
import Logo from '../../components/Logo';
import Button from '../../components/Button';
import IconButton from '../../components/IconButton';
import { useGame } from '../../state/GameProvider.jsx';
import { normalizeRoomCode, isValidRoomCode, CODE_LENGTH } from '../../room/roomCode.js';
import { GAMES } from '../../engine/gameRegistry.js';
import './Home.css';

/**
 * Home — porta de entrada.
 * Três caminhos: criar sala, entrar por código, ou voltar pra sala salva.
 * Nada aqui depende de rede: a sala salva vem do localStorage.
 */

export default function Home() {
  const navigate = useNavigate();
  const { room, prefs, setMuted } = useGame();
  const [code, setCode] = useState('');
  const [help, setHelp] = useState(false);

  const valid = isValidRoomCode(code);

  function join(event) {
    event.preventDefault();
    if (valid) navigate(`/join/${code}`);
  }

  return (
    <Screen className="home">
      <div className="home__decor" aria-hidden="true">
        <span className="home__shape home__shape--1" />
        <span className="home__shape home__shape--2" />
        <span className="home__shape home__shape--3" />
        <span className="home__shape home__shape--4" />
      </div>

      <div className="home__top">
        <IconButton
          label={prefs.muted ? 'Ligar som' : 'Desligar som'}
          active={!prefs.muted}
          onClick={() => setMuted(!prefs.muted)}
        >
          {prefs.muted ? '🔇' : '🔊'}
        </IconButton>
        <IconButton label="Como jogar" onClick={() => setHelp(true)}>?</IconButton>
      </div>

      <div className="home__hero">
        <Logo size="lg" tagline />
        <p className="home__pitch">
          {GAMES.length} microjogos. Rodadas de 15 a 30 segundos.
          <br />
          Ninguém tem tempo de ficar bom em nada.
        </p>
      </div>

      <div className="screen__spacer" />

      <div className="home__actions">
        {room ? (
          <Button
            variant="secondary"
            icon="↩"
            hint={`${room.players.length} jogadores`}
            onClick={() => navigate(`/room/${room.id}`)}
          >
            VOLTAR PARA {room.id}
          </Button>
        ) : null}

        <Button variant="success" size="lg" icon="🎲" onClick={() => navigate('/create')}>
          CRIAR SALA
        </Button>

        <form className="home__join" onSubmit={join}>
          <input
            className="home__code"
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            placeholder="CÓDIGO"
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            maxLength={CODE_LENGTH}
            aria-label="Código da sala"
          />
          <Button variant="energy" block={false} disabled={!valid} type="submit">
            ENTRAR
          </Button>
        </form>

        <button className="home__p2p" type="button" onClick={() => navigate('/p2p')}>
          📡 conectar 2 celulares direto (P2P) →
        </button>
      </div>

      {help ? <HowToPlay onClose={() => setHelp(false)} /> : null}
    </Screen>
  );
}

function HowToPlay({ onClose }) {
  return (
    <div className="home__sheet" role="dialog" aria-modal="true" aria-label="Como jogar">
      <div className="home__sheetCard">
        <h2 className="home__sheetTitle u-display">COMO JOGA</h2>
        <ol className="home__steps">
          <li>
            <b>Crie a sala</b> e mostre o QR Code (ou manda o link) pra galera.
          </li>
          <li>
            <b>Cada rodada é um jogo novo</b>, sorteado. Você descobre no ar — a instrução aparece
            por 2 segundos antes do 3-2-1.
          </li>
          <li>
            <b>Pontos por colocação:</b> 1º ganha 100, 2º 75, 3º 50, do 4º pra baixo 25. Vencer
            seguido acumula bônus de sequência 🔥.
          </li>
          <li>
            <b>Eventos CHAOS</b> caem sem avisar: ponto dobrado, controle invertido, câmera lenta,
            tela na penumbra. Nunca na primeira rodada.
          </li>
          <li>
            No fim: pódio, ranking e conquistas (reflexo mais rápido, melhor artista, maior
            sequência…).
          </li>
        </ol>
        <p className="home__note">
          Nesta versão os outros jogadores são simulados no seu aparelho — o multiplayer em rede é a
          próxima fase. O código, o link e o QR já são reais.
        </p>
        <Button variant="primary" onClick={onClose}>ENTENDI</Button>
      </div>
    </div>
  );
}
