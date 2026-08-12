import { useCallback, useEffect, useRef, useState } from 'react';
import GameHeader from '../../components/GameHeader';
import GameResult from '../../components/GameResult';
import ScoreBadge from '../../components/ScoreBadge';
import RivalBars from '../_shared/RivalBars.jsx';
import { mapPerformance } from '../../engine/botProfile.js';
import { paceValue, simulateBots } from '../_shared/bots.js';
import { useGameClock, useOutcome } from '../_shared/hooks.js';
import { asset } from '../../lib/basePath.js';
import '../_shared/game.css';
import './Memory.css';

/**
 * Os quatro botões.
 *
 * Cada um carrega TRÊS pistas independentes: posição fixa na grade, cor e um
 * ícone PNG próprio (gema, moeda, coração, nota). Quem não distingue as cores
 * continua jogando pelo ícone — e todo mundo joga pela posição, que é o que a
 * mão memoriza de verdade. Cada pad tem seu par aceso/apagado (§3.9), cores
 * literais para o contraste não depender do tema.
 */
const PADS = [
  { id: 0, img: '/assets/jogo/gema.png', name: 'gema', lit: '#4DE3E3', off: '#1E7C8C', freq: 392 },
  { id: 1, img: '/assets/jogo/moeda.png', name: 'moeda', lit: '#FFCE31', off: '#8A6B14', freq: 523.25 },
  { id: 2, img: '/assets/jogo/coracao.png', name: 'coração', lit: '#FF6B8B', off: '#8A2E45', freq: 659.25 },
  { id: 3, img: '/assets/jogo/nota-musical.png', name: 'nota musical', lit: '#7BE86A', off: '#2E7A34', freq: 784 },
];

/** Tamanho da sequência por nível: 3, 4, 5, 6 e daí em diante 6 sempre novas. */
const MAX_LEN = 6;
const BASE_LEN = 3;

const SHOW_ON = 420;
const SHOW_OFF = 180;
const LEAD_IN = 620;
const LEVEL_GAP = 700;

export default function Memory({
  players, localPlayerId, duration, effects, rng, bus, sound,
  round, totalRounds, onFinish,
}) {
  const timeScale = effects?.timeScale ?? 1;
  const sizeScale = effects?.sizeScale ?? 1;
  const backwards = !!effects?.invert;
  const hidden = !!effects?.hidden;

  const overRef = useRef(false);
  const startRef = useRef(0);
  const stepRef = useRef(0);
  const clearedRef = useRef(0);
  const clearMsRef = useRef(0);

  const [sequence, setSequence] = useState(() => growSequence(rng, [], BASE_LEN));
  const [phase, setPhase] = useState('watch');
  const [flash, setFlash] = useState(-1);
  const [wrong, setWrong] = useState(-1);
  const [step, setStep] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [outcome, end] = useOutcome(onFinish);

  const [rivalFinals] = useState(() => simulateBots(players, localPlayerId, rng, (perf) => {
    const levels = Math.round(mapPerformance(perf, 0.6, 5.4));
    const speed = Math.round(mapPerformance(perf, 180, 2100));
    return {
      score: levels * 1000 + (levels ? speed : 0),
      display: levels ? `nível ${levels}` : '—',
    };
  }));

  /* ------------------------------------------------------------ fechamento */

  const closeRound = useCallback((failed) => {
    if (overRef.current) return;
    overRef.current = true;
    const levels = clearedRef.current;
    // O bônus congela no instante em que o último nível fechou. Assim, entre
    // dois jogadores no mesmo nível, ganha quem chegou lá antes — e falhar
    // cedo não vira vantagem.
    const bonus = levels ? Math.max(0, Math.round((duration - clearMsRef.current) / 10)) : 0;

    end({
      entries: [
        { playerId: localPlayerId, score: levels * 1000 + bonus, display: levels ? `nível ${levels}` : '—' },
        ...rivalFinals,
      ],
      value: `${levels}`,
      label: 'NÍVEIS',
      tone: levels >= 3 ? 'good' : levels >= 1 ? 'neutral' : 'bad',
      note: failed
        ? `Errou na sequência de ${sequence.length}.`
        : levels
          ? 'O tempo acabou com você de pé.'
          : 'Nem um nível fechado.',
    });
  }, [duration, end, localPlayerId, rivalFinals, sequence.length]);

  const { remaining } = useGameClock(duration, () => closeRound(false), !outcome);

  useEffect(() => { startRef.current = performance.now(); }, []);

  /* ---------------------------------------------------------- exibição */

  useEffect(() => {
    if (phase !== 'watch' || outcome) return undefined;

    let index = 0;
    let timer = 0;
    const on = Math.max(90, Math.round(SHOW_ON / timeScale));
    const off = Math.max(60, Math.round(SHOW_OFF / timeScale));

    // Um timer por vez, sempre agendado pelo anterior: o clearTimeout do
    // cleanup basta para matar a cadeia inteira quando o microjogo desmonta.
    const tick = () => {
      if (index >= sequence.length) {
        setFlash(-1);
        setPhase('input');
        return;
      }
      const pad = PADS[sequence[index]];
      setFlash(pad.id);
      sound?.note?.(pad.freq, on / 1400, 'sine', 0.14);
      timer = setTimeout(() => {
        setFlash(-1);
        index += 1;
        timer = setTimeout(tick, off);
      }, on);
    };

    timer = setTimeout(tick, Math.round(LEAD_IN / timeScale));
    return () => clearTimeout(timer);
  }, [outcome, phase, sequence, sound, timeScale]);

  /* --------------------------------------------------------------- toque */

  const press = useCallback((padId) => {
    if (overRef.current || phase !== 'input') return;

    const at = stepRef.current;
    // De trás para frente: a sequência mostrada é a mesma, só a ordem cobrada
    // muda. Ler ao contrário é o desafio inteiro.
    const expected = backwards ? sequence[sequence.length - 1 - at] : sequence[at];
    const pad = PADS[padId];

    if (padId !== expected) {
      setWrong(padId);
      sound?.play?.('miss');
      sound?.note?.(110, 0.22, 'sawtooth', 0.14);
      closeRound(true);
      return;
    }

    sound?.note?.(pad.freq, 0.12, 'sine', 0.16);
    stepRef.current = at + 1;
    setStep(at + 1);

    if (at + 1 < sequence.length) {
      sound?.play?.('tap');
      return;
    }

    // Nível fechado.
    clearedRef.current += 1;
    clearMsRef.current = performance.now() - startRef.current;
    stepRef.current = 0;
    setCleared(clearedRef.current);
    setStep(0);
    setPhase('pause');
    sound?.play?.('perfect');

    const nextLen = Math.min(BASE_LEN + clearedRef.current, MAX_LEN);
    setSequence((current) => growSequence(rng, current, nextLen));
  }, [backwards, closeRound, phase, rng, sequence, sound]);

  // A pausa entre níveis existe para o jogador registrar que acertou antes de
  // a próxima sequência começar a piscar.
  useEffect(() => {
    if (phase !== 'pause' || outcome) return undefined;
    const timer = setTimeout(() => setPhase('watch'), Math.round(LEVEL_GAP / timeScale));
    return () => clearTimeout(timer);
  }, [outcome, phase, timeScale]);

  useEffect(() => {
    if (!bus?.on) return undefined;
    return bus.on((action) => {
      if (action.playerId !== localPlayerId || action.action !== 'TAP') return;
      const pad = action.payload?.pad;
      if (typeof pad === 'number') press(pad);
    });
  }, [bus, localPlayerId, press]);

  /* ---------------------------------------------------------------- render */

  const ratio = Math.min(1, Math.max(0, 1 - remaining / duration));
  const rivals = rivalFinals.map((entry, index) => {
    const player = players.find((item) => item.id === entry.playerId);
    return {
      id: entry.playerId,
      name: player?.name || '—',
      color: player?.color,
      value: paceValue(Math.floor(entry.score / 1000), ratio, index * 1.1),
    };
  });
  const ceiling = Math.max(cleared, ...rivals.map((rival) => rival.value), 4);

  const status = phase === 'input'
    ? (backwards ? 'SUA VEZ · AO CONTRÁRIO' : 'SUA VEZ')
    : phase === 'pause' ? `NÍVEL ${cleared} ✓` : 'OLHE A SEQUÊNCIA';

  return (
    <div className="gscene mm" style={{ '--mm-scale': sizeScale }}>
      <GameHeader
        title="MEMÓRIA"
        instruction={backwards ? 'A ORDEM ESTÁ INVERTIDA.' : 'Observe, depois repita.'}
        round={round}
        totalRounds={totalRounds}
        remaining={remaining}
        duration={duration}
      >
        <ScoreBadge label="NÍVEL" value={cleared + 1} tone="accent" pulseKey={cleared} />
        <ScoreBadge label="PASSOS" value={sequence.length} tone="neutral" size="sm" />
      </GameHeader>

      <div className="gscene__stage mm__stage">
        <div className={`mm__status mm__status--${phase}`} key={status}>
          {phase === 'pause' && cleared > 0 ? (
            <img className="mm__levelup" src={asset('/assets/selos/level-up.png')} alt="" draggable="false" />
          ) : null}
          {status}
        </div>

        <div className="mm__dots" aria-hidden="true">
          {sequence.map((item, index) => (
            <span
              key={index}
              className={`mm__dot${phase === 'input' && index < step ? ' is-done' : ''}`}
            />
          ))}
        </div>

        <div className="mm__grid">
          {PADS.map((pad) => (
            <button
              key={pad.id}
              type="button"
              className={[
                'mm__pad',
                flash === pad.id ? 'is-lit' : '',
                wrong === pad.id ? 'is-wrong' : '',
              ].filter(Boolean).join(' ')}
              style={{ '--pad-lit': pad.lit, '--pad-off': pad.off }}
              aria-label={pad.name}
              disabled={phase !== 'input' || !!outcome}
              onPointerDown={() => press(pad.id)}
            >
              <img className="mm__img" src={asset(pad.img)} alt="" draggable="false" />
            </button>
          ))}
        </div>

        <RivalBars rivals={rivals} max={ceiling} />
        {hidden ? <div className="gveil" /> : null}

        {outcome ? (
          <div className="gover">
            <GameResult
              value={outcome.value}
              label={outcome.label}
              tone={outcome.tone}
              note={outcome.note}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* sequência                                                                  */
/* ========================================================================= */

/**
 * Cresce a sequência até `length`, mantendo o que já existia.
 *
 * Ao chegar no teto (6) a lista inteira é trocada: decorar por repetição pára
 * de funcionar e o nível 5 em diante vira memória de verdade.
 */
function growSequence(rng, current, length) {
  if (current.length >= length) return randomSequence(rng, length);

  const next = current.slice();
  while (next.length < length) {
    next.push(nextPad(rng, next[next.length - 1]));
  }
  return next;
}

function randomSequence(rng, length) {
  const list = [];
  while (list.length < length) list.push(nextPad(rng, list[list.length - 1]));
  return list;
}

/** Nunca repete o pad anterior: dois iguais em fila leem como um toque só. */
function nextPad(rng, previous) {
  if (previous === undefined) return rng.int(0, PADS.length - 1);
  return (previous + rng.int(1, PADS.length - 1)) % PADS.length;
}
