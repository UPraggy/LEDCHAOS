import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RotateHint from './components/RotateHint';
import DebugPanel from './components/DebugPanel/DevOnly.jsx';
import Home from './screens/Home';
import CreateRoom from './screens/CreateRoom';
import JoinRoom from './screens/JoinRoom';
import LiveGuest from './screens/LiveGuest';
import DirectGuest from './screens/DirectGuest';
import Lobby from './screens/Lobby';
import Game from './screens/Game';
import FinalScore from './screens/FinalScore';
import P2PLab from './screens/P2PLab';

// Bancada de teste de microjogo: só existe em desenvolvimento. O import é
// dinâmico e a rota é condicional, então nada disso vai para o bundle de produção.
const DevGame = import.meta.env.DEV ? lazy(() => import('./screens/DevGame')) : null;

/**
 * Rotas do CHAOS.
 *
 *   /                  Home
 *   /create            criar sala (nome, avatar, rodadas, dificuldade)
 *   /join/:roomId      destino do QR Code / link compartilhado
 *   /live/:roomId      companion do convidado ao vivo (só com VITE_RELAY_URL)
 *   /direct            convidado do MODO DIRETO (WebRTC P2P, zero-servidor, QR)
 *   /room/:roomId      lobby (QR, jogadores, configurações, START)
 *   /game/:roomId      partida (máquina de estados das rodadas)
 *   /results/:roomId   placar final + conquistas
 *   /p2p               laboratório P2P: prova de conexão direta (QR/hash, sem servidor)
 *   *                  qualquer outra coisa volta pra Home (nunca tela branca)
 *
 * `/live/:roomId` é o convidado de VERDADE: com o relay ligado, o celular entra
 * na sala do host pelo WebSocket, ocupa uma cadeira (no lugar de um bot) e
 * espelha a partida ao vivo. Sem `VITE_RELAY_URL`, a própria tela redireciona
 * de volta para `/join/:roomId` — o fluxo local de sempre.
 *
 * O `*` é a última linha de defesa contra URL torta. A penúltima é o
 * `appType:'spa'` do Vite, que devolve o index.html para /join/7KX9Q em vez
 * de 404 — sem isso o QR Code aberto no celular quebraria.
 *
 * <RotateHint /> fica fora das rotas de propósito: é uma camada de celular
 * deitado que vale para qualquer tela, inclusive no meio de um microjogo.
 *
 * <DebugPanel /> segue a mesma lógica e ganha duas coisas por estar aqui: o
 * gesto secreto que o liga passa a funcionar em QUALQUER tela (dá para preparar
 * uma sala já no lobby), e ele deixa de ser repetido em cada fase da partida.
 * Em produção o componente inteiro some do bundle — ver DevOnly.jsx.
 */

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/join/:roomId" element={<JoinRoom />} />
        <Route path="/live/:roomId" element={<LiveGuest />} />
        <Route path="/direct" element={<DirectGuest />} />
        <Route path="/room/:roomId" element={<Lobby />} />
        <Route path="/game/:roomId" element={<Game />} />
        <Route path="/results/:roomId" element={<FinalScore />} />
        <Route path="/p2p" element={<P2PLab />} />
        {DevGame ? (
          <Route
            path="/dev/:gameId?"
            element={(
              <Suspense fallback={null}>
                <DevGame />
              </Suspense>
            )}
          />
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <RotateHint />
      <DebugPanel />
    </>
  );
}
