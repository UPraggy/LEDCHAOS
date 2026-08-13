import { useCallback, useEffect, useMemo, useRef } from 'react';
import Screen from '../../components/Screen';
import ErrorBoundary from '../../components/ErrorBoundary';
import { roundRng } from '../../engine/roundManager.js';
import { resolveEffects, getChaosEvent } from '../../engine/chaosEvents.js';
import { createActionBus } from '../../engine/inputManager.js';
import { playSound, playNote, playDrum, scaleFreq } from '../../audio/soundManager.js';

/**
 * GuestPlay — o convidado JOGANDO o próprio slot, no aparelho dele (F7-C).
 *
 * Cada microjogo do CHAOS é single-device: só lê o dedo LOCAL e SIMULA os outros
 * (games/_shared/bots.js). Então, no multi-device de verdade, o convidado precisa
 * MONTAR o mesmo microjogo no celular dele, jogar de fato, e reportar só o próprio
 * placar — não basta espelhar a tela grande. O host, a autoridade, funde esse
 * placar real sobre o bot fabricado antes de fechar a rodada (screens/Game →
 * mergeEntries; net → ACT_SCORE → onGuestScore).
 *
 * Reconstrução determinística: a mesma rodada nasce igual nos dois lados porque o
 * host transmite `{ round, gameId, chaos, seed }` e aqui reconstruímos rng
 * (roundRng) e effects (resolveEffects) a partir disso — mesma semente, mesmo
 * caos, mesma dificuldade bruta. O `bus` é um cano LOCAL e descartável: o
 * attachPointer roda o input do próprio convidado por ele e nenhum input remoto
 * precisa ser injetado (o convidado consome só o que é dele).
 *
 * É montado pelo LiveMirror só durante o JOGANDO, em tela cheia (Screen flush) —
 * fora disso o convidado volta a só espelhar a festa (intro, contagem, resultado).
 *
 * @param {object} props
 * @param {object} props.link  estado espelhado do host + `sendScore` (ver hooks)
 * @param {object} props.game  metadata do microjogo (getGame já resolvido)
 */
export default function GuestPlay({ link, game }) {
  const round = link.round;
  const GameComponent = game.Component;

  // Identidade viva num ref: o onFinish lê o link/sendScore mais recente sem
  // trocar de identidade a cada render (o microjogo guarda o onFinish do mount).
  const linkRef = useRef(link);
  linkRef.current = link;
  // Trava de "um placar por rodada": guarda o número da rodada já reportada,
  // igual ao doneRef do host. Evita reportar duas vezes (clique + fim do tempo).
  const sentRef = useRef(null);

  // Cano de input local e descartável. O convidado não injeta input remoto —
  // attachPointer chama o handler local direto; o bus só carrega o dedo dele.
  const bus = useMemo(() => createActionBus(), []);
  useEffect(() => () => bus.destroy(), [bus]);

  // Mesmo contrato de som do host (screens/Game): play/note sempre; drum/scale
  // são a camada musical (BEAT/PIANO).
  const sound = useMemo(
    () => ({ play: playSound, note: playNote, drum: playDrum, scale: scaleFreq }),
    [],
  );

  // Reconstruídos da rodada transmitida — mesma semente e mesmo caos que o host,
  // para o slot do convidado ser justo (invert/timeScale/sizeScale/hidden/oneLife
  // mexem no placar bruto).
  const rng = useMemo(() => roundRng(round.seed, round.round), [round.seed, round.round]);
  const effects = useMemo(() => resolveEffects(getChaosEvent(round.chaos)), [round.chaos]);

  // Fim da rodada no aparelho do convidado: extrai só o placar DELE e manda ao
  // host. Estável (deps []): lê tudo pelo linkRef, então não recria o onFinish.
  const handleFinish = useCallback((entries) => {
    const cur = linkRef.current;
    const roundNo = cur?.round?.round;
    if (roundNo == null) return;
    if (sentRef.current === roundNo) return; // já reportei esta rodada
    sentRef.current = roundNo;
    const mine = Array.isArray(entries)
      ? entries.find((e) => e.playerId === cur.selfId)
      : null;
    cur.sendScore?.({
      round: roundNo,
      score: Number.isFinite(mine?.score) ? mine.score : 0,
      display: mine?.display ?? null,
      stat: mine?.stat ?? null,
    });
  }, []);

  return (
    <Screen layout="flush" hue={game.hue} className="game">
      {/* Sem onError: se o microjogo explodir no celular do convidado, ele não
          reporta nada e o bot fabricado do host segura a vaga (mais gentil que
          mandar 0). O boundary mostra o próprio aviso até a próxima rodada. */}
      <ErrorBoundary resetKey={round.round} label={game.name}>
        <GameComponent
          key={`${game.id}-${round.round}`}
          players={link.players || []}
          localPlayerId={link.selfId}
          duration={game.duration}
          effects={effects}
          rng={rng}
          bus={bus}
          sound={sound}
          round={round.round}
          totalRounds={link.settings?.rounds ?? 1}
          onFinish={handleFinish}
        />
      </ErrorBoundary>
    </Screen>
  );
}
