#!/usr/bin/env node
'use strict';
// tools/reachability.js — the only reachability check (see CLAUDE.md).
// For every level in levels/*.js it proves that each coin, checkpoint and exit can be reached from the spawn point.
// - Constants are read from js/game.js (GRAVITY, JUMP_V, RELEASE_MULT, RUN, ...), not typed in here.
// - Movement mirrors js/game.js: stepPlayer, moveX, moveY and groundProbe, in the same order.
// - Graph: each standable tile top is a node. An edge A -> B exists when a trajectory from A (standing jump, running
//   jump, or running off the edge) first lands on B without touching a solid tile.
// - Enemies are ignored. Any limit (time or node count) gives INCONCLUSIVE, which counts as a failure.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GAME_SRC = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
const K = {};
for (const name of ['W', 'H', 'T', 'STEP', 'EPS', 'GRAVITY', 'MAX_FALL', 'RUN', 'ACC_GROUND', 'FRIC_GROUND',
  'ACC_AIR', 'FRIC_AIR', 'JUMP_V', 'RELEASE_MULT', 'COYOTE', 'BUFFER', 'PLAYER_W', 'PLAYER_H']) {
  // Value is a number or simple arithmetic such as 1 / 60 (only digits, dots, spaces and / are accepted).
  const m = GAME_SRC.match(new RegExp('\\b' + name + '\\s*=\\s*([-0-9. /]+?)\\s*[;,]'));
  if (!m || !/^-?[0-9.\s/]+$/.test(m[1])) throw new Error('constant not found in js/game.js: ' + name);
  K[name] = Function('return (' + m[1] + ');')();
}
const T = K.T, STEP = K.STEP, EPS = K.EPS;
const MAX_FRAMES = 240;      // 4 seconds of play per trajectory
const MAX_NODES = 5000;
const TIME_LIMIT_MS = 60000;

// ---- levels, read the same way the game reads them ----
function loadLevels() {
  const out = [];
  const dir = path.join(ROOT, 'levels');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox);
    (sandbox.window.LEVELS || []).forEach((def) => out.push({ file: f, def }));
  }
  return out;
}

function buildLevel(def) {
  const cols = Math.max.apply(null, def.rows.map((r) => r.length));
  const grid = def.rows.map((r) => r.padEnd(cols, '.').split(''));
  const L = { name: def.name, cols: cols, rows: grid.length, grid: grid, widthPx: cols * T, heightPx: grid.length * T,
    coins: [], checkpoints: [], exits: [], spawn: null };
  grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch === 'p') L.spawn = { x: c * T + 3, y: (r + 1) * T - K.PLAYER_H, w: K.PLAYER_W, h: K.PLAYER_H };
    if (ch === '$') L.coins.push({ c: c, r: r, x: c * T + 4, y: r * T + 4, w: 8, h: 8 });
    if (ch === 'k') L.checkpoints.push({ c: c, r: r, x: c * T, y: r * T, w: T, h: T });
    if (ch === 'x') L.exits.push({ c: c, r: r, x: c * T, y: r * T, w: T, h: T });
  }));
  if (!L.spawn) throw new Error(def.name + ': no start tile (p)');
  return L;
}

// ---- physics, mirrored from js/game.js ----
function solidAt(L, c, r) {
  if (c < 0 || c >= L.cols) return true;
  if (r < 0 || r >= L.rows) return false;
  return L.grid[r][c] === '#';
}
function oneWayAt(L, c, r) {
  if (c < 0 || c >= L.cols || r < 0 || r >= L.rows) return false;
  return L.grid[r][c] === '-';
}
function moveX(L, e, dx) {
  e.x += dx;
  if (dx === 0) return;
  const r0 = Math.floor(e.y / T), r1 = Math.floor((e.y + e.h - EPS) / T);
  if (dx > 0) {
    const c = Math.floor((e.x + e.w - EPS) / T);
    for (let r = r0; r <= r1; r++) if (solidAt(L, c, r)) { e.x = c * T - e.w; return; }
  } else {
    const c = Math.floor(e.x / T);
    for (let r = r0; r <= r1; r++) if (solidAt(L, c, r)) { e.x = (c + 1) * T; return; }
  }
}
function moveY(L, e, dy, prevBottom) {
  e.y += dy;
  const c0 = Math.floor(e.x / T), c1 = Math.floor((e.x + e.w - EPS) / T);
  if (dy > 0) {
    const bottom = e.y + e.h;
    const rStart = Math.floor(prevBottom / T), rEnd = Math.floor((bottom - EPS) / T);
    for (let r = rStart; r <= rEnd; r++) {
      const rowTop = r * T;
      if (rowTop < prevBottom - EPS) continue;
      for (let c = c0; c <= c1; c++) {
        if (solidAt(L, c, r) || oneWayAt(L, c, r)) { e.y = rowTop - e.h; e.vy = 0; return; }
      }
    }
  } else if (dy < 0) {
    const r = Math.floor(e.y / T);
    const prevTop = e.y - dy;
    if (prevTop >= (r + 1) * T - EPS) {
      for (let c = c0; c <= c1; c++) if (solidAt(L, c, r)) { e.y = (r + 1) * T; e.vy = 0; return; }
    }
  }
}
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
function approach(v, target, amount) {
  if (v < target) return Math.min(target, v + amount);
  return Math.max(target, v - amount);
}
// One physics step, same order as stepPlayer in js/game.js (no enemies, no pit respawn here).
function stepPlayer(L, p, inp) {
  const prevBottom = p.y + p.h;
  if (Math.abs(inp.moveX) > 0.02) p.vx = approach(p.vx, inp.moveX * K.RUN, (p.onGround ? K.ACC_GROUND : K.ACC_AIR) * STEP);
  else p.vx = approach(p.vx, 0, (p.onGround ? K.FRIC_GROUND : K.FRIC_AIR) * STEP);
  if (inp.jumpPressed) p.jumpBuf = K.BUFFER;
  else if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.onGround) p.coyote = K.COYOTE;
  else if (p.coyote > 0) p.coyote--;
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = -K.JUMP_V; p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
  }
  let g = K.GRAVITY;
  if (p.vy < 0 && !inp.jumpHeld) g *= K.RELEASE_MULT;
  p.vy = Math.min(K.MAX_FALL, p.vy + g * STEP);
  moveX(L, p, p.vx * STEP);
  moveY(L, p, p.vy * STEP, prevBottom);
  p.onGround = groundProbe(L, p);
}

// ---- graph ----
function standable(L, c, r) {
  if (c < 0 || c >= L.cols || r < 0 || r >= L.rows) return false;
  const ch = L.grid[r][c];
  if (ch !== '#' && ch !== '-') return false;
  return !(r > 0 && L.grid[r - 1][c] === '#');
}
// Node id = r * cols + c for a standable tile top. Null when the player is not standing on one.
function nodeAt(L, p) {
  const feet = p.y + p.h;
  const r = Math.round(feet / T);
  if (Math.abs(feet - r * T) > 0.01) return null;
  const c = Math.floor((p.x + p.w / 2) / T);
  return standable(L, c, r) ? r * L.cols + c : null;
}
// Movement modes a player can use from a surface. Jump modes hold jump for the whole arc (highest arc).
const MODES = [
  { dir: 0, jump: true, jumpFrame: 0 },                       // standing jump
  { dir: 1, jump: true, jumpFrame: 0 }, { dir: -1, jump: true, jumpFrame: 0 },   // jump at once, moving
  { dir: 1, jump: true, jumpFrame: 8 }, { dir: -1, jump: true, jumpFrame: 8 },   // running jump after 8 steps of run-up
  { dir: 1, jump: false }, { dir: -1, jump: false },           // run off an edge
];
// Simulates one trajectory from a surface. Returns the node it first lands on (a different surface, or the same
// one after a jump), or null if it falls into a pit or runs out of frames. onBox sees every player box on the way.
function simulate(L, startX, startNode, mode, onBox) {
  const r = Math.floor(startNode / L.cols);
  const p = { x: startX, y: r * T - K.PLAYER_H, w: K.PLAYER_W, h: K.PLAYER_H, vx: 0, vy: 0, onGround: true, coyote: 0, jumpBuf: 0 };
  if (onBox) onBox(p);
  let airborne = false;
  for (let f = 0; f < MAX_FRAMES; f++) {
    const inp = { moveX: mode.dir, jumpPressed: mode.jump && f === mode.jumpFrame, jumpHeld: mode.jump && f >= mode.jumpFrame };
    stepPlayer(L, p, inp);
    if (onBox) onBox(p);
    if (p.y > L.heightPx + 24) return null;
    if (!p.onGround) { airborne = true; continue; }
    const nd = nodeAt(L, p);
    if (nd === null) continue;
    if (nd !== startNode) return nd;
    if (airborne) return startNode;
  }
  return null;
}
function overlapBox(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function startXs(L, node) {
  const c = node % L.cols;
  const xs = [];
  for (let x = c * T; x <= c * T + T - K.PLAYER_W; x++) xs.push(x);
  return xs;
}

function checkLevel(L) {
  const t0 = Date.now();
  const nodes = [];
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) if (standable(L, c, r)) nodes.push(r * L.cols + c);
  if (nodes.length > MAX_NODES) return { status: 'INCONCLUSIVE', reason: 'node count ' + nodes.length + ' over limit ' + MAX_NODES };
  const spawnNode = nodeAt(L, L.spawn);
  if (spawnNode === null) return { status: 'FAIL', reason: 'spawn is not on a standable tile' };

  // Pass 1: edges.
  const adj = new Map();
  for (const n of nodes) {
    if (Date.now() - t0 > TIME_LIMIT_MS) return { status: 'INCONCLUSIVE', reason: 'time limit reached while building the graph' };
    const out = new Set();
    for (const x of startXs(L, n)) {
      for (const mode of MODES) {
        const nd = simulate(L, x, n, mode, null);
        if (nd !== null && nd !== n) out.add(nd);
      }
    }
    adj.set(n, out);
  }
  // Breadth-first search from the spawn node.
  const reach = new Set([spawnNode]);
  const queue = [spawnNode];
  while (queue.length) {
    const n = queue.shift();
    for (const m of adj.get(n) || []) if (!reach.has(m)) { reach.add(m); queue.push(m); }
  }
  // Pass 2: every box a reachable player can occupy (start positions and all trajectory frames).
  const targets = [];
  L.coins.forEach((t) => targets.push({ kind: 'coin', t: t, box: t, hit: false }));
  L.checkpoints.forEach((t) => targets.push({ kind: 'checkpoint', t: t, box: t, hit: false }));
  L.exits.forEach((t) => targets.push({ kind: 'exit', t: t, box: t, hit: false }));
  for (const n of reach) {
    for (const x of startXs(L, n)) {
      for (const mode of MODES) {
        simulate(L, x, n, mode, (p) => {
          for (const tg of targets) if (!tg.hit && overlapBox(p, tg.box)) tg.hit = true;
        });
      }
    }
  }
  const lines = [];
  const counts = { coin: [0, 0], checkpoint: [0, 0], exit: [0, 0] };
  for (const tg of targets) {
    counts[tg.kind][1]++;
    if (tg.hit) counts[tg.kind][0]++;
    else {
      const what = tg.kind === 'coin' ? 'coin' : tg.kind;
      lines.push('FAIL ' + what + ' at row ' + tg.t.r + ' col ' + tg.t.c + ' is not reachable from the start');
    }
  }
  const summary = 'coins ' + counts.coin[0] + '/' + counts.coin[1] + ', checkpoints ' + counts.checkpoint[0] + '/' +
    counts.checkpoint[1] + ', exits ' + counts.exit[0] + '/' + counts.exit[1] + '; graph ' + nodes.length + ' surfaces, ' +
    reach.size + ' reachable; ' + (Date.now() - t0) + ' ms';
  return { status: lines.length ? 'FAIL' : 'PASS', lines: lines, summary: summary, checks: targets.length };
}

// Derived jump envelope, from the same physics on a flat floor (printed for comparison with the analytic values).
function envelope() {
  const cols = 60, rows = 12;
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(r === 10 ? '#' : '.'));
  const L = { cols: cols, rows: rows, grid: grid, heightPx: rows * T };
  const p = { x: 100, y: 10 * T - K.PLAYER_H, w: K.PLAYER_W, h: K.PLAYER_H, vx: 0, vy: 0, onGround: true, coyote: 0, jumpBuf: 0 };
  let minY = p.y;
  stepPlayer(L, p, { moveX: 0, jumpPressed: true, jumpHeld: true });
  for (let f = 0; f < 200; f++) { stepPlayer(L, p, { moveX: 0, jumpPressed: false, jumpHeld: true }); minY = Math.min(minY, p.y); }
  const standRise = 10 * T - K.PLAYER_H - minY;
  return { standRise: standRise, analyticPeak: K.JUMP_V * K.JUMP_V / (2 * K.GRAVITY) };
}

module.exports = { stepPlayer, buildLevel, checkLevel, envelope, loadLevels, K };

function main() {
const env = envelope();
console.log('reachability: physics from js/game.js constants');
console.log('  standing jump rise (stepped): ' + env.standRise.toFixed(2) + ' px, analytic v^2/2g: ' + env.analyticPeak.toFixed(2) + ' px');
let failed = 0, checks = 0;
for (const { file, def } of loadLevels()) {
  const L = buildLevel(def);
  const res = checkLevel(L);
  if (res.status === 'INCONCLUSIVE') {
    console.log('[' + def.name + '] INCONCLUSIVE: ' + res.reason + ' (counts as a failure)');
    failed++;
    continue;
  }
  checks += res.checks;
  console.log('[' + def.name + '] (' + file + ') ' + res.status + ': ' + res.summary);
  for (const line of res.lines) console.log('  ' + line);
  if (res.status !== 'PASS') failed++;
}
console.log(failed ? 'reachability: FAILED' : 'reachability: PASS (' + checks + ' targets checked)');
process.exit(failed ? 1 : 0);
}

if (require.main === module) main();
