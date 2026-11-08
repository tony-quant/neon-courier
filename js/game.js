// js/game.js — physics at a fixed 60 Hz, rendering every animation frame, UI glue.
(function () {
  'use strict';

  const W = 384, H = 216, T = 16;
  const STEP = 1 / 60;
  const EPS = 0.0001;

  // Tuning. Change these numbers to change the feel.
  const GRAVITY = 900;        // px/s^2
  const MAX_FALL = 420;       // px/s
  const RUN = 105;            // px/s top speed
  const ACC_GROUND = 1100;    // px/s^2
  const FRIC_GROUND = 1200;
  const ACC_AIR = 650;
  const FRIC_AIR = 220;
  const JUMP_V = 330;         // px/s launch speed (about 3.7 tiles high when held)
  const RELEASE_MULT = 2.6;   // extra gravity while rising and jump is released (short hop)
  const COYOTE = 6;           // steps (~100 ms) you can still jump after leaving a ledge
  const BUFFER = 6;           // steps (~100 ms) a jump press is remembered before landing
  const INVULN = 60;          // steps of protection after respawning
  const WALK = 40;            // walker speed px/s
  const PLAYER_W = 10, PLAYER_H = 14;
  const ENEMY_W = 12, ENEMY_H = 12;

  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const octx = off.getContext('2d');

  const muteBtn = document.getElementById('mute');
  const winEl = document.getElementById('win');
  const winStats = document.getElementById('win-stats');
  const restartBtn = document.getElementById('restart');
  const portraitQuery = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

  let world = null;
  let manualMode = false;    // tests can take over stepping so timing is exact
  let jumpHeldNow = false;   // jump-held state from this step, used for stomp bounce height

  // ---------- level parsing and tile queries ----------
  function parseLevel(def) {
    const cols = Math.max.apply(null, def.rows.map(function (r) { return r.length; }));
    const grid = def.rows.map(function (r) { return r.padEnd(cols, '.').split(''); });
    const L = {
      name: def.name, cols: cols, rows: grid.length, grid: grid,
      widthPx: cols * T, heightPx: grid.length * T,
      coins: [], enemySpawns: [], checkpoints: [], exits: [], spawn: null,
    };
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ch = grid[r][c];
        if (ch === 'p') {
          L.spawn = { x: c * T + 3, y: (r + 1) * T - PLAYER_H };
          grid[r][c] = '.';
        } else if (ch === '$') {
          L.coins.push({ c: c, r: r, x: c * T + 4, y: r * T + 4 });
          grid[r][c] = '.';
        } else if (ch === 'e') {
          L.enemySpawns.push({ x: c * T + 2, y: (r + 1) * T - ENEMY_H });
          grid[r][c] = '.';
        } else if (ch === 'k') {
          L.checkpoints.push({ c: c, r: r, x: c * T + 3, y: (r + 1) * T - PLAYER_H });
        } else if (ch === 'x') {
          L.exits.push({ c: c, r: r });
        }
      }
    }
    if (!L.spawn) throw new Error('Level has no start tile (p)');
    return L;
  }

  function solidAt(L, c, r) {
    if (c < 0 || c >= L.cols) return true;   // level edges are walls
    if (r < 0 || r >= L.rows) return false;  // open above, and below is the pit
    return L.grid[r][c] === '#';
  }
  function oneWayAt(L, c, r) {
    if (c < 0 || c >= L.cols || r < 0 || r >= L.rows) return false;
    return L.grid[r][c] === '-';
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function approach(v, target, amount) {
    if (v < target) return Math.min(target, v + amount);
    return Math.max(target, v - amount);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------- physics ----------
  function moveX(L, e, dx) {
    e.x += dx;
    if (dx === 0) return false;
    const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - EPS) / T);
    if (dx > 0) {
      const c = Math.floor((e.x + e.w - EPS) / T);
      for (let r = r0; r <= r1; r++) {
        if (solidAt(L, c, r)) { e.x = c * T - e.w; return true; }
      }
    } else {
      const c = Math.floor(e.x / T);
      for (let r = r0; r <= r1; r++) {
        if (solidAt(L, c, r)) { e.x = (c + 1) * T; return true; }
      }
    }
    return false;
  }

  // Returns true if the entity landed on something this step.
  function moveY(L, e, dy, prevBottom) {
    e.y += dy;
    const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - EPS) / T);
    if (dy > 0) {
      const bottom = e.y + e.h;
      const rStart = Math.floor(prevBottom / T);
      const rEnd = Math.floor((bottom - EPS) / T);
      for (let r = rStart; r <= rEnd; r++) {
        const rowTop = r * T;
        if (rowTop < prevBottom - EPS) continue;   // we were already below this row's top
        for (let c = c0; c <= c1; c++) {
          if (solidAt(L, c, r) || oneWayAt(L, c, r)) {
            e.y = rowTop - e.h;
            e.vy = 0;
            return true;
          }
        }
      }
    } else if (dy < 0) {
      const r = Math.floor(e.y / T);
      const prevTop = e.y - dy;
      if (prevTop >= (r + 1) * T - EPS) {
        for (let c = c0; c <= c1; c++) {
          if (solidAt(L, c, r)) {
            e.y = (r + 1) * T;
            e.vy = 0;
            return false;
          }
        }
      }
    }
    return false;
  }

  // True when the entity stands on solid ground (or a girder) right now.
  function groundProbe(L, e) {
    if (e.vy < 0) return false;
    const r = Math.floor((e.y + e.h + 1) / T);
    const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - EPS) / T);
    const feet = e.y + e.h;
    for (let c = c0; c <= c1; c++) {
      if (solidAt(L, c, r)) return true;
      if (oneWayAt(L, c, r) && Math.abs(r * T - feet) <= 1.5) return true;
    }
    return false;
  }

  function puff(n, x, y, color) {
    for (let i = 0; i < n; i++) {
      world.particles.push({
        x: x + (Math.random() - 0.5) * 8, y: y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40,
        life: 20 + Math.floor(Math.random() * 10), size: 2, color: color,
      });
    }
  }

  function stepPlayer(inp) {
    const p = world.player;
    const L = world.level;
    const prevBottom = p.y + p.h;

    // Horizontal: accelerate toward the target speed, or slow down with friction.
    if (Math.abs(inp.moveX) > 0.02) {
      const target = inp.moveX * RUN;
      p.vx = approach(p.vx, target, (p.onGround ? ACC_GROUND : ACC_AIR) * STEP);
    } else {
      p.vx = approach(p.vx, 0, (p.onGround ? FRIC_GROUND : FRIC_AIR) * STEP);
    }
    if (Math.abs(p.vx) > 4) p.face = p.vx > 0 ? 1 : -1;

    // Jump timers: coyote time and jump buffering.
    if (inp.jumpPressed) p.jumpBuf = BUFFER;
    else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.onGround) p.coyote = COYOTE;
    else if (p.coyote > 0) p.coyote--;

    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -JUMP_V;
      p.jumpBuf = 0;
      p.coyote = 0;
      p.onGround = false;
      puff(4, p.x + p.w / 2, p.y + p.h, '#f2f4ff');
      Sound.play('jump');
    }

    // Vertical: heavier gravity while rising without the jump held gives a short hop.
    let g = GRAVITY;
    if (p.vy < 0 && !inp.jumpHeld) g *= RELEASE_MULT;
    p.vy = Math.min(MAX_FALL, p.vy + g * STEP);

    moveX(L, p, p.vx * STEP);
    moveY(L, p, p.vy * STEP, prevBottom);
    p.onGround = groundProbe(L, p);
    p.anim += Math.abs(p.vx) * STEP * 0.4;
    if (p.invuln > 0) p.invuln--;

    if (p.y > L.heightPx + 24) respawn('pit');
  }

  function stepEnemy(e, L) {
    if (!e.alive) {
      if (e.squash > 0) e.squash--;
      return;
    }
    e.anim += STEP * 8;
    const dx = e.dir * WALK * STEP;
    const frontX = e.dir > 0 ? e.x + e.w : e.x - EPS;
    const frontCol = Math.floor(frontX / T);
    e.x += dx;
    // Turn at walls and at ledges.
    const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - EPS) / T);
    let blocked = false;
    for (let r = r0; r <= r1; r++) if (solidAt(L, frontCol, r)) blocked = true;
    const rBelow = Math.floor((e.y + e.h + 1) / T);
    const ledge = !solidAt(L, frontCol, rBelow) && !oneWayAt(L, frontCol, rBelow);
    if (blocked || ledge) {
      e.x -= dx;
      e.dir = -e.dir;
    }
  }

  function checkEnemies(prevBottom) {
    const p = world.player;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (!overlap(p, { x: e.x, y: e.y, w: e.w, h: e.h })) continue;
      const stomp = p.vy > 0 && prevBottom <= e.y + 5;
      if (stomp) {
        e.alive = false;
        e.squash = 24;
        p.vy = -JUMP_V * (jumpHeldNow ? 0.95 : 0.7);
        world.stomps++;
        Sound.play('stomp');
        puff(6, e.x + 6, e.y + 8, '#ff3b9a');
      } else if (p.invuln <= 0) {
        respawn('hit');
        return;
      }
    }
  }

  function collectCoins() {
    const p = world.player;
    for (const co of world.coins) {
      if (co.taken) continue;
      if (overlap(p, { x: co.x, y: co.y, w: 8, h: 8 })) {
        co.taken = true;
        world.coinsTaken++;
        Sound.play('coin');
        puff(3, co.x + 4, co.y + 4, '#ffd23f');
      }
    }
  }

  function checkTiles() {
    const p = world.player;
    const L = world.level;
    for (let i = 0; i < L.checkpoints.length; i++) {
      const cp = L.checkpoints[i];
      if (world.checkpointIdx === i) continue;
      if (overlap(p, { x: cp.c * T, y: cp.r * T, w: T, h: T })) {
        world.checkpointIdx = i;
        world.checkpointCell = { c: cp.c, r: cp.r };
        world.checkpointSpawn = { x: cp.x, y: cp.y };
        world.snapshot = captureSnapshot();
        world.cpFlash = 90;
        Sound.play('checkpoint');
      }
    }
    for (const ex of L.exits) {
      if (!world.won && overlap(p, { x: ex.c * T, y: ex.r * T, w: T, h: T })) {
        world.won = true;
        Sound.play('win');
        showWin();
      }
    }
  }

  function captureSnapshot() {
    return {
      coins: world.coins.map(function (c) { return c.taken; }),
      enemies: world.enemies.map(function (e) {
        return { x: e.x, y: e.y, dir: e.dir, alive: e.alive, squash: e.squash, anim: e.anim };
      }),
    };
  }

  function restoreSnapshot(snap) {
    world.coins.forEach(function (c, i) { c.taken = snap.coins[i]; });
    world.coinsTaken = world.coins.filter(function (c) { return c.taken; }).length;
    world.enemies.forEach(function (e, i) { Object.assign(e, snap.enemies[i]); });
  }

  // Respawn at the last checkpoint (or the start), restoring the world to that moment.
  function respawn() {
    const p = world.player;
    const at = world.checkpointSpawn || world.level.spawn;
    restoreSnapshot(world.snapshot);
    p.x = at.x; p.y = at.y;
    p.vx = 0; p.vy = 0;
    p.onGround = false; p.coyote = 0; p.jumpBuf = 0;
    p.invuln = INVULN;
    world.deaths++;
    Sound.play('hurt');
  }

  function stepCamera() {
    const p = world.player;
    const L = world.level;
    const lookAhead = clamp(p.vx * 0.35, -40, 40);
    const tx = clamp(p.x + p.w / 2 - W / 2 + lookAhead, 0, L.widthPx - W);
    const ty = clamp(p.y - H * 0.55, 0, Math.max(0, L.heightPx - H));
    const k = 1 - Math.exp(-STEP * 7);
    world.cam.x += (tx - world.cam.x) * k;
    world.cam.y += (ty - world.cam.y) * k;
  }

  function stepParticles() {
    const keep = [];
    for (const q of world.particles) {
      q.x += q.vx * STEP;
      q.y += q.vy * STEP;
      q.vy += 300 * STEP;
      q.life--;
      if (q.life > 0) keep.push(q);
    }
    world.particles = keep;
  }

  function update() {
    const inp = Input.sample();
    jumpHeldNow = inp.jumpHeld;
    world.time += STEP;
    if (world.cpFlash > 0) world.cpFlash--;
    if (world.hintT > 0) world.hintT--;

    if (world.won) {
      if (inp.jumpPressed) reset();
      stepParticles();
      stepCamera();
      return;
    }
    const prevBottom = world.player.y + world.player.h;
    stepPlayer(inp);
    for (const e of world.enemies) stepEnemy(e, world.level);
    checkEnemies(prevBottom);
    if (world.player.y <= world.level.heightPx) {
      collectCoins();
      checkTiles();
    }
    stepParticles();
    stepCamera();
  }

  // ---------- state creation ----------
  function makeWorld(level) {
    const w = {
      level: level,
      player: {
        x: level.spawn.x, y: level.spawn.y, w: PLAYER_W, h: PLAYER_H,
        vx: 0, vy: 0, onGround: false, coyote: 0, jumpBuf: 0,
        face: 1, anim: 0, invuln: 0,
      },
      coins: level.coins.map(function (c) { return { x: c.x, y: c.y, taken: false }; }),
      coinsTaken: 0,
      enemies: level.enemySpawns.map(function (s, i) {
        return { id: i, x: s.x, y: s.y, w: ENEMY_W, h: ENEMY_H, dir: -1, alive: true, squash: 0, anim: 0 };
      }),
      checkpointIdx: -1,
      checkpointCell: null,
      checkpointSpawn: null,
      snapshot: null,
      cam: { x: 0, y: 0 },
      particles: [],
      won: false,
      deaths: 0,
      stomps: 0,
      time: 0,
      cpFlash: 0,
      hintT: 240,
    };
    return w;
  }

  // Copy of the coin and enemy state, used for checkpoints and respawns.
  function initialSnapshot(w) {
    return {
      coins: w.coins.map(function (c) { return c.taken; }),
      enemies: w.enemies.map(function (e) {
        return { x: e.x, y: e.y, dir: e.dir, alive: e.alive, squash: e.squash, anim: e.anim };
      }),
    };
  }

  const LEVEL = parseLevel(window.LEVELS[0]);

  function reset() {
    world = makeWorld(LEVEL);
    world.snapshot = initialSnapshot(world);
    world.cam.x = clamp(world.player.x + world.player.w / 2 - W / 2, 0, LEVEL.widthPx - W);
    world.cam.y = clamp(world.player.y - H * 0.55, 0, Math.max(0, LEVEL.heightPx - H));
    Input.reset();
    winEl.classList.remove('show');
  }

  function showWin() {
    winStats.textContent = 'Coins ' + world.coinsTaken + '/' + world.coins.length +
      '  ·  Deaths ' + world.deaths;
    winEl.classList.add('show');
  }

  // ---------- rendering and loop ----------
  function paused() {
    return manualMode || portraitQuery.matches || document.hidden;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    const cssW = Math.max(1, Math.floor(W * s));
    const cssH = Math.max(1, Math.floor(H * s));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
  }

  function draw() {
    Render.draw(octx, world);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (paused()) {
      acc = 0;
    } else {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) {
        update();
        acc -= STEP;
        n++;
      }
      if (n === 5) acc = 0;
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- UI ----------
  function refreshMute() {
    muteBtn.textContent = Sound.isMuted() ? 'SOUND OFF' : 'SOUND ON';
  }

  let triedFullscreen = false;
  function onFirstGesture() {
    Sound.unlock();
    if (triedFullscreen) return;
    triedFullscreen = true;
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen().then(function () {
          try {
            if (screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(function () {});
            }
          } catch (e) { /* not supported */ }
        }).catch(function () {});
      }
    } catch (e) { /* not supported */ }
  }

  muteBtn.addEventListener('click', function () {
    Sound.toggle();
    refreshMute();
  });
  restartBtn.addEventListener('click', function () { reset(); });
  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyM' && !e.repeat) { Sound.toggle(); refreshMute(); }
    if (e.code === 'KeyR' && !e.repeat) reset();
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
    window.addEventListener(type, onFirstGesture, { capture: true, passive: true });
  });
  // Stop double-tap zoom and the iOS gesture zoom.
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker not registered:', err);
    });
  }

  // Small read/teleport hooks used by the automated tests and for debugging.
  window.__game = {
    state: function () {
      const p = world.player;
      return {
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, face: p.face,
        enemies: world.enemies.map(function (e) { return { x: e.x, y: e.y, alive: e.alive, dir: e.dir }; }),
        coinsTaken: world.coinsTaken, coinsTotal: world.coins.length,
        checkpointIdx: world.checkpointIdx, checkpointSpawn: world.checkpointSpawn,
        won: world.won, deaths: world.deaths, stomps: world.stomps,
        invuln: p.invuln, source: Input.activeSource(),
        spawn: LEVEL.spawn, levelWidth: LEVEL.widthPx, levelHeight: LEVEL.heightPx,
        cols: LEVEL.cols, rows: LEVEL.rows, cam: { x: world.cam.x, y: world.cam.y },
      };
    },
    setPlayer: function (x, y, vx, vy) {
      const p = world.player;
      p.x = x; p.y = y; p.vx = vx || 0; p.vy = vy || 0; p.onGround = false; p.jumpBuf = 0; p.coyote = 0;
    },
    reset: reset,
    // Manual mode stops the automatic loop. stepFrames(n) then runs exactly n physics steps.
    manual: function (on) { manualMode = !!on; acc = 0; },
    stepFrames: function (n) {
      for (let i = 0; i < n; i++) update();
      draw();
    },
  };

  refreshMute();
  resize();
  reset();
  last = performance.now();
  requestAnimationFrame(frame);
})();
