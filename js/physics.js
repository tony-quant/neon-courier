// js/physics.js — the movement and jump rules as a pure module. No canvas, DOM, audio, input or globals.
// Used by the game (js/game.js), by the Node reachability check (tools/reachability.js) and by any future port.
// stepPlayer takes a level, a player state and one frame of input, and returns a NEW player state plus events
// (jumped, pit). The caller decides what to do with the events (sound, particles, respawn).
(function (root) {
  'use strict';

  const C = {
    W: 384, H: 216, T: 16,
    STEP: 1 / 60,               // fixed physics step, seconds
    EPS: 0.0001,
    GRAVITY: 900,               // px/s^2
    MAX_FALL: 420,              // px/s
    RUN: 105,                   // px/s top speed
    ACC_GROUND: 1100,           // px/s^2
    FRIC_GROUND: 1200,
    ACC_AIR: 650,
    FRIC_AIR: 220,
    JUMP_V: 330,                // px/s launch speed
    RELEASE_MULT: 2.6,          // extra gravity while rising with jump released (short hop)
    COYOTE: 6,                  // steps you can still jump after leaving a ledge
    BUFFER: 6,                  // steps a jump press is remembered before landing
    PLAYER_W: 10, PLAYER_H: 14,
  };

  function solidAt(L, c, r) {
    if (c < 0 || c >= L.cols) return true;   // level edges are walls
    if (r < 0 || r >= L.rows) return false;  // open above, and below is the pit
    return L.grid[r][c] === '#';
  }
  function oneWayAt(L, c, r) {
    if (c < 0 || c >= L.cols || r < 0 || r >= L.rows) return false;
    return L.grid[r][c] === '-';
  }
  function approach(v, target, amount) {
    if (v < target) return Math.min(target, v + amount);
    return Math.max(target, v - amount);
  }

  // Moves the box e horizontally, stopping at solid tiles. Mutates e (always a copy inside stepPlayer).
  function moveX(L, e, dx) {
    e.x += dx;
    if (dx === 0) return false;
    const r0 = Math.floor(e.y / C.T), r1 = Math.floor((e.y + e.h - C.EPS) / C.T);
    if (dx > 0) {
      const c = Math.floor((e.x + e.w - C.EPS) / C.T);
      for (let r = r0; r <= r1; r++) {
        if (solidAt(L, c, r)) { e.x = c * C.T - e.w; return true; }
      }
    } else {
      const c = Math.floor(e.x / C.T);
      for (let r = r0; r <= r1; r++) {
        if (solidAt(L, c, r)) { e.x = (c + 1) * C.T; return true; }
      }
    }
    return false;
  }

  // Moves the box e vertically. Lands on solid tiles and on girders (one-way, from above only).
  function moveY(L, e, dy, prevBottom) {
    e.y += dy;
    const c0 = Math.floor(e.x / C.T), c1 = Math.floor((e.x + e.w - C.EPS) / C.T);
    if (dy > 0) {
      const bottom = e.y + e.h;
      const rStart = Math.floor(prevBottom / C.T);
      const rEnd = Math.floor((bottom - C.EPS) / C.T);
      for (let r = rStart; r <= rEnd; r++) {
        const rowTop = r * C.T;
        if (rowTop < prevBottom - C.EPS) continue;   // we were already below this row's top
        for (let c = c0; c <= c1; c++) {
          if (solidAt(L, c, r) || oneWayAt(L, c, r)) {
            e.y = rowTop - e.h;
            e.vy = 0;
            return true;
          }
        }
      }
    } else if (dy < 0) {
      const r = Math.floor(e.y / C.T);
      const prevTop = e.y - dy;
      if (prevTop >= (r + 1) * C.T - C.EPS) {
        for (let c = c0; c <= c1; c++) {
          if (solidAt(L, c, r)) {
            e.y = (r + 1) * C.T;
            e.vy = 0;
            return false;
          }
        }
      }
    }
    return false;
  }

  // True when the box stands on solid ground or a girder right now.
  function groundProbe(L, e) {
    if (e.vy < 0) return false;
    const r = Math.floor((e.y + e.h + 1) / C.T);
    const c0 = Math.floor(e.x / C.T), c1 = Math.floor((e.x + e.w - C.EPS) / C.T);
    const feet = e.y + e.h;
    for (let c = c0; c <= c1; c++) {
      if (solidAt(L, c, r)) return true;
      if (oneWayAt(L, c, r) && Math.abs(r * C.T - feet) <= 1.5) return true;
    }
    return false;
  }

  function makePlayer(x, y) {
    return { x: x, y: y, w: C.PLAYER_W, h: C.PLAYER_H, vx: 0, vy: 0, onGround: false, coyote: 0, jumpBuf: 0,
      face: 1, anim: 0, invuln: 0 };
  }

  // One physics step. Input: { moveX (-1..1), jumpPressed (bool, this step), jumpHeld (bool) }.
  // Returns { player: new state, jumped: null or {x, y} at the jump, pit: true if the player fell below the level }.
  function stepPlayer(L, player, inp) {
    const p = Object.assign({}, player);
    const events = { player: p, jumped: null, pit: false };
    const prevBottom = p.y + p.h;

    // Horizontal: accelerate toward the target speed, or slow down with friction.
    if (Math.abs(inp.moveX) > 0.02) {
      const target = inp.moveX * C.RUN;
      p.vx = approach(p.vx, target, (p.onGround ? C.ACC_GROUND : C.ACC_AIR) * C.STEP);
    } else {
      p.vx = approach(p.vx, 0, (p.onGround ? C.FRIC_GROUND : C.FRIC_AIR) * C.STEP);
    }
    if (Math.abs(p.vx) > 4) p.face = p.vx > 0 ? 1 : -1;

    // Jump timers: coyote time and jump buffering.
    if (inp.jumpPressed) p.jumpBuf = C.BUFFER;
    else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.onGround) p.coyote = C.COYOTE;
    else if (p.coyote > 0) p.coyote--;

    if (p.jumpBuf > 0 && p.coyote > 0) {
      events.jumped = { x: p.x + p.w / 2, y: p.y + p.h };
      p.vy = -C.JUMP_V;
      p.jumpBuf = 0;
      p.coyote = 0;
      p.onGround = false;
    }

    // Vertical: heavier gravity while rising without the jump held gives a short hop.
    let g = C.GRAVITY;
    if (p.vy < 0 && !inp.jumpHeld) g *= C.RELEASE_MULT;
    p.vy = Math.min(C.MAX_FALL, p.vy + g * C.STEP);

    moveX(L, p, p.vx * C.STEP);
    moveY(L, p, p.vy * C.STEP, prevBottom);
    p.onGround = groundProbe(L, p);
    p.anim += Math.abs(p.vx) * C.STEP * 0.4;
    if (p.invuln > 0) p.invuln--;

    if (p.y > L.heightPx + 24) events.pit = true;
    return events;
  }

  const api = { C: C, solidAt: solidAt, oneWayAt: oneWayAt, approach: approach, moveX: moveX, moveY: moveY,
    groundProbe: groundProbe, makePlayer: makePlayer, stepPlayer: stepPlayer };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Physics = api;
})(typeof window !== 'undefined' ? window : globalThis);
