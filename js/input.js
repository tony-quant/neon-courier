// js/input.js — one input layer for keyboard, gamepad and touch.
// Every source produces the same three actions:
//   moveX      -1..1 (analog)
//   jumpHeld   true while jump is held
//   jumpPressed one-shot edge, consumed by the physics step
// The source the player used most recently supplies the actions.
(function () {
  'use strict';

  const STICK_DEAD = 0.2;   // gamepad stick dead zone
  const TOUCH_DEAD = 10;    // css px of drag before the joystick responds
  const TOUCH_FULL = 48;    // css px of drag for full speed
  const SWIPE_DIST = 36;    // css px upward for a swipe-jump
  const SWIPE_TIME = 260;   // ms allowed for that swipe

  const KEYS_LEFT = ['ArrowLeft', 'KeyA'];
  const KEYS_RIGHT = ['ArrowRight', 'KeyD'];
  const KEYS_JUMP = ['Space', 'KeyW', 'ArrowUp'];
  const GAME_KEYS = new Set([...KEYS_LEFT, ...KEYS_RIGHT, ...KEYS_JUMP]);

  const keysDown = new Set();
  const src = {
    keyboard: { moveX: 0, held: false },
    gamepad: { moveX: 0, held: false },
    touch: { moveX: 0, held: false },
  };
  let active = 'keyboard';
  let jumpPending = false;
  let padWasActive = false;
  let padSeen = false;
  let padNoticeFrames = 0;   // shows "controller connected" on screen for a moment

  let joy = null;                  // floating joystick: {id, ox, oy, x, y}
  const rightTouches = new Map();  // id -> {y0, t0, swiped}
  let ringEl = null;
  let knobEl = null;

  function press(name) {
    active = name;
    jumpPending = true;
  }

  // ---------- keyboard ----------
  function onKeyDown(e) {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    keysDown.add(e.code);
    if (KEYS_JUMP.includes(e.code)) press('keyboard');
    else active = 'keyboard';
  }
  function onKeyUp(e) {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    keysDown.delete(e.code);
  }

  // ---------- gamepad (Gamepad API, standard mapping) ----------
  function pollGamepad() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    let pad = null;
    for (const p of pads) {
      if (p && p.connected !== false) { pad = p; break; }
    }
    if (!pad) {
      src.gamepad.moveX = 0;
      src.gamepad.held = false;
      padWasActive = false;
      padSeen = false;
      return;
    }
    if (!padSeen) {
      padSeen = true;
      padNoticeFrames = 180;
    }
    const b = pad.buttons || [];
    const down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    let x = (pad.axes && pad.axes[0]) || 0;
    if (Math.abs(x) < STICK_DEAD) x = 0;
    if (down(14)) x = -1;   // d-pad left
    if (down(15)) x = 1;    // d-pad right
    const jump = down(0);   // Cross / A
    const anyPressed = b.some((bt) => bt && bt.pressed);
    const isActive = x !== 0 || anyPressed;
    if (isActive && !padWasActive) active = 'gamepad';
    padWasActive = isActive;
    if (jump && !src.gamepad.held) press('gamepad');
    src.gamepad.moveX = x;
    src.gamepad.held = jump;
  }

  // ---------- touch ----------
  function isUi(target) {
    return !!(target && target.closest && target.closest('button, a, input'));
  }

  function joyMoveX() {
    const dx = joy.x - joy.ox;
    const m = Math.abs(dx);
    if (m <= TOUCH_DEAD) return 0;
    const speed = Math.min(1, (m - TOUCH_DEAD) / (TOUCH_FULL - TOUCH_DEAD));
    return dx < 0 ? -speed : speed;
  }

  function updateRing() {
    if (!ringEl) return;
    if (joy) {
      const dx = Math.max(-TOUCH_FULL, Math.min(TOUCH_FULL, joy.x - joy.ox));
      const dy = Math.max(-TOUCH_FULL, Math.min(TOUCH_FULL, joy.y - joy.oy));
      ringEl.style.transform = 'translate(' + joy.ox + 'px,' + joy.oy + 'px)';
      knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      ringEl.classList.add('on');
    } else {
      ringEl.classList.remove('on');
    }
  }

  function onTouchStart(e) {
    if (isUi(e.target)) return;
    e.preventDefault();
    const half = window.innerWidth / 2;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      if (x < half) {
        if (!joy) joy = { id: t.identifier, ox: x, oy: y, x: x, y: y };
        active = 'touch';
      } else {
        rightTouches.set(t.identifier, { y0: y, t0: performance.now(), swiped: false });
        press('touch');
      }
    }
    updateRing();
  }

  function onTouchMove(e) {
    if (isUi(e.target)) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy && t.identifier === joy.id) {
        joy.x = t.clientX;
        joy.y = t.clientY;
      }
      const r = rightTouches.get(t.identifier);
      if (r && !r.swiped) {
        const up = r.y0 - t.clientY;
        if (up >= SWIPE_DIST && performance.now() - r.t0 <= SWIPE_TIME) {
          // A quick upward swipe is a jump that is not held, so it gives a short hop.
          r.swiped = true;
        }
      }
    }
    updateRing();
  }

  function onTouchEnd(e) {
    if (!isUi(e.target)) e.preventDefault();
    for (const t of e.changedTouches) {
      if (joy && t.identifier === joy.id) joy = null;
      rightTouches.delete(t.identifier);
    }
    updateRing();
  }

  function reset() {
    keysDown.clear();
    joy = null;
    rightTouches.clear();
    jumpPending = false;
    src.keyboard.moveX = 0; src.keyboard.held = false;
    src.gamepad.moveX = 0; src.gamepad.held = false;
    src.touch.moveX = 0; src.touch.held = false;
    updateRing();
  }

  // Called once per 60 Hz physics step. Returns the active source's actions.
  function sample() {
    const left = KEYS_LEFT.some((k) => keysDown.has(k));
    const right = KEYS_RIGHT.some((k) => keysDown.has(k));
    src.keyboard.moveX = (right ? 1 : 0) - (left ? 1 : 0);
    src.keyboard.held = KEYS_JUMP.some((k) => keysDown.has(k));

    pollGamepad();

    src.touch.moveX = joy ? joyMoveX() : 0;
    src.touch.held = [...rightTouches.values()].some((r) => !r.swiped);

    if (padNoticeFrames > 0) padNoticeFrames--;
    const s = src[active];
    const out = { moveX: s.moveX, jumpHeld: s.held, jumpPressed: jumpPending };
    jumpPending = false;
    return out;
  }

  function init() {
    ringEl = document.getElementById('touch-ring');
    knobEl = document.getElementById('touch-knob');
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', reset);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    const opts = { passive: false };
    window.addEventListener('touchstart', onTouchStart, opts);
    window.addEventListener('touchmove', onTouchMove, opts);
    window.addEventListener('touchend', onTouchEnd, opts);
    window.addEventListener('touchcancel', onTouchEnd, opts);
  }

  init();

  window.Input = {
    sample: sample,
    reset: reset,
    activeSource: function () { return active; },
    padNotice: function () { return padNoticeFrames; },
    gamepadConnected: function () { return padSeen; },
  };
})();
