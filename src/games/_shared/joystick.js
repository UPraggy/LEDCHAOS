import { useEffect, useRef } from 'react';
import { attachPointer } from '../../engine/inputManager.js';

/** Raio do anel em px de CSS. É o curso do polegar, não o tamanho do desenho. */
export const STICK_RADIUS = 62;
/** Raio do botão que segue o dedo. */
const KNOB = 20;

/**
 * Analógico flutuante: nasce onde o dedo encosta.
 *
 * Um analógico fixo num canto obriga o polegar a procurar o lugar certo sem
 * olhar — e em celular o olho está na arena, não na mão. Nascendo sob o dedo,
 * ele está sempre no lugar certo por definição.
 *
 * Também é o motivo de NÃO usar "o círculo segue o dedo": nesse esquema a mão
 * fica exatamente em cima do personagem e tapa o que interessa. Aqui o dedo
 * fica onde quiser (embaixo, de lado) e a arena continua visível.
 *
 * O estado vive num ref porque quem lê é o laço de animação. Um `useState`
 * aqui seria um render por movimento de dedo — dezenas por segundo, à toa.
 *
 * Fase 2: entrada contínua não vira evento de rede. O anfitrião amostra este
 * vetor no tique da simulação; mandar cada `pointermove` pela rede seria
 * inundar o canal para reconstruir do outro lado exatamente este mesmo número.
 */
export function useJoystick(elementRef, { active = true, radius = STICK_RADIUS } = {}) {
  const stick = useRef({ on: false, ax: 0, ay: 0, kx: 0, ky: 0, dx: 0, dy: 0, mag: 0 });

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !active) return undefined;
    const s = stick.current;

    const aim = (p) => {
      const vx = p.x - s.ax;
      const vy = p.y - s.ay;
      const dist = Math.hypot(vx, vy);
      const reach = Math.min(dist, radius);
      s.mag = radius ? reach / radius : 0;
      s.dx = dist ? (vx / dist) * s.mag : 0;
      s.dy = dist ? (vy / dist) * s.mag : 0;
      s.kx = s.ax + (dist ? (vx / dist) * reach : 0);
      s.ky = s.ay + (dist ? (vy / dist) * reach : 0);
    };

    const drop = () => {
      s.on = false;
      s.dx = 0;
      s.dy = 0;
      s.mag = 0;
    };

    // Um segundo dedo re-ancora o analógico. É de propósito: trocar de polegar
    // no meio da rodada não deveria exigir soltar o primeiro.
    return attachPointer(el, {
      onDown: (p) => {
        s.on = true;
        s.ax = p.x; s.ay = p.y;
        s.kx = p.x; s.ky = p.y;
        s.dx = 0; s.dy = 0; s.mag = 0;
      },
      onMove: (p) => { if (s.on) aim(p); },
      onUp: drop,
      onCancel: drop,
    });
  }, [active, elementRef, radius]);

  return stick;
}

/**
 * Desenha o analógico no canvas.
 *
 * Só aparece enquanto o dedo está encostado: em repouso ele seria um enfeite
 * no meio da arena, e a arena é pequena.
 */
export function paintJoystick(ctx, stick, colors, radius = STICK_RADIUS) {
  if (!stick.on) return;

  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = colors['--color-text'];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(stick.ax, stick.ay, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.62;
  ctx.fillStyle = colors['--game-accent'];
  ctx.beginPath();
  ctx.arc(stick.kx, stick.ky, KNOB, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
