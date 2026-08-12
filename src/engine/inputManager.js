/**
 * inputManager — normaliza ENTRADA.
 *
 * Todo microjogo recebe ações num formato só:
 *   { type:'PLAYER_ACTION', playerId, action, payload, t }
 *
 * Isso é a costura da Fase 2: hoje as ações nascem de Pointer Events locais;
 * amanhã podem nascer de uma mensagem de rede. O microjogo não sabe a diferença.
 *
 * Ações: TAP PRESS RELEASE MOVE MOVE_LEFT MOVE_RIGHT SWIPE DRAW SELECT
 */

export const ACTIONS = {
  TAP: 'TAP',
  PRESS: 'PRESS',
  RELEASE: 'RELEASE',
  MOVE: 'MOVE',
  MOVE_LEFT: 'MOVE_LEFT',
  MOVE_RIGHT: 'MOVE_RIGHT',
  SWIPE: 'SWIPE',
  DRAW: 'DRAW',
  SELECT: 'SELECT',
};

/** Barramento de ações. Um por partida. */
export function createActionBus() {
  const all = new Set();
  const byAction = new Map();

  function emit(message) {
    all.forEach((fn) => {
      try {
        fn(message);
      } catch (err) {
        console.error('[CHAOS] handler de ação falhou:', err);
      }
    });
    const list = byAction.get(message.action);
    if (list) {
      list.forEach((fn) => {
        try {
          fn(message);
        } catch (err) {
          console.error('[CHAOS] handler de ação falhou:', err);
        }
      });
    }
  }

  return {
    /** envia uma ação normalizada */
    send(playerId, action, payload = null) {
      emit({ type: 'PLAYER_ACTION', playerId, action, payload, t: performance.now() });
    },
    /** injeta uma mensagem já formada (usado pela rede na Fase 2) */
    emit,
    /** escuta tudo */
    on(fn) {
      all.add(fn);
      return () => all.delete(fn);
    },
    /** escuta uma ação específica */
    onAction(action, fn) {
      if (!byAction.has(action)) byAction.set(action, new Set());
      byAction.get(action).add(fn);
      return () => byAction.get(action)?.delete(fn);
    },
    destroy() {
      all.clear();
      byAction.clear();
    },
  };
}

/** Converte um PointerEvent em coordenadas do elemento (px e normalizadas 0–1). */
export function pointerPoint(event, element) {
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return {
    x,
    y,
    nx: rect.width ? x / rect.width : 0,
    ny: rect.height ? y / rect.height : 0,
    w: rect.width,
    h: rect.height,
  };
}

/**
 * Liga Pointer Events num elemento e devolve a função de limpeza.
 * SEMPRE guardar o retorno e chamar no cleanup do useEffect.
 *
 * @param {HTMLElement} el
 * @param {object} handlers {onDown,onMove,onUp,onTap,onSwipe}
 * @param {object} opts {bus, playerId, tapMaxMs, tapMaxPx, swipeMinPx}
 * @returns {function} cleanup
 */
export function attachPointer(el, handlers = {}, opts = {}) {
  if (!el) return () => {};

  const {
    bus = null,
    playerId = 'p1',
    tapMaxMs = 300,
    tapMaxPx = 14,
    swipeMinPx = 26,
  } = opts;

  const active = new Map();

  function down(event) {
    const p = pointerPoint(event, el);
    active.set(event.pointerId, { start: p, last: p, t0: performance.now() });
    try {
      el.setPointerCapture(event.pointerId);
    } catch {
      /* alguns browsers recusam captura: segue sem */
    }
    if (bus) bus.send(playerId, ACTIONS.PRESS, { x: p.nx, y: p.ny });
    if (handlers.onDown) handlers.onDown(p, event);
  }

  function move(event) {
    const track = active.get(event.pointerId);
    const p = pointerPoint(event, el);
    if (track) {
      track.last = p;
      if (handlers.onMove) handlers.onMove(p, event, track);
    } else if (handlers.onHover) {
      handlers.onHover(p, event);
    }
  }

  function up(event) {
    const track = active.get(event.pointerId);
    active.delete(event.pointerId);
    const p = pointerPoint(event, el);

    if (bus) bus.send(playerId, ACTIONS.RELEASE, { x: p.nx, y: p.ny });
    if (handlers.onUp) handlers.onUp(p, event, track);

    if (!track) return;

    const dx = p.x - track.start.x;
    const dy = p.y - track.start.y;
    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - track.t0;

    if (dist >= swipeMinPx && handlers.onSwipe) {
      const swipe = { dx, dy, dist, dt, from: track.start, to: p };
      if (bus) bus.send(playerId, ACTIONS.SWIPE, swipe);
      handlers.onSwipe(swipe, event);
      return;
    }

    if (dt <= tapMaxMs && dist <= tapMaxPx) {
      if (bus) bus.send(playerId, ACTIONS.TAP, { x: p.nx, y: p.ny });
      if (handlers.onTap) handlers.onTap(p, event);
    }
  }

  function cancel(event) {
    const track = active.get(event.pointerId);
    active.delete(event.pointerId);
    if (handlers.onCancel) handlers.onCancel(event, track);
  }

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);

  return function cleanup() {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('lostpointercapture', cancel);
    active.clear();
  };
}
