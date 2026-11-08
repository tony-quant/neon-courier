#!/usr/bin/env node
'use strict';
// tools/reachability.js — the only reachability check (see CLAUDE.md).
// For every level it proves that each coin, checkpoint and exit can be reached from the spawn point.
// The movement rules come from js/physics.js (the same module the game uses), not from a copy here.
// Graph: each standable tile top is a node. An edge A -> B exists when a trajectory from A (standing jump, running
// jump, or running off an edge) first lands on B without touching a solid tile. Enemies are ignored.
// Any limit reached (nodes, time, frames) gives INCONCLUSIVE, which counts as a failure.
// Usage: node tools/reachability.js [--level <file.js>]   (default: every file in levels/)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Physics = require('../js/physics.js');

const ROOT = path.join(__dirname, '..');
const C = Physics.C;
const T = C.T;
const LIMITS = { maxFrames: 240, maxNodes: 5000, timeMs: 60000 };   // 4 s per trajectory

// ---- levels, read the same way the game reads them ----
function loadLevels(files) {
  const out = [];
  for (const file of files) {
    const sandbox = { window: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox);
    (sandbox.window.LEVELS || []).forEach((def) => out.push({ file: path.basename(file), def: def }));
  }
  return out;
}
function levelFiles() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--level');
  if (i >= 0) return [path.resolve(args[i + 1])];
  const dir = path.join(ROOT, 'levels');
  const natural = (a, b) => (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0) || (a < b ? -1 : 1);
  return fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort(natural).map((x) => path.join(dir, x));
}

function buildLevel(def) {
  const cols = Math.max.apply(null, def.rows.map((r) => r.length));
  const grid = def.rows.map((r) => r.padEnd(cols, '.').split(''));
  const L = { name: def.name, cols: cols, rows: grid.length, grid: grid, widthPx: cols * T, heightPx: grid.length * T,
    coins: [], checkpoints: [], exits: [], spawn: null, walkers: 0 };
  grid.forEach((row, r) => row.forEach((ch, c) => {
    if (ch === 'p') L.spawn = { x: c * T + 3, y: (r + 1) * T - C.PLAYER_H, w: C.PLAYER_W, h: C.PLAYER_H };
    if (ch === '$') L.coins.push({ c: c, r: r, x: c * T + 4, y: r * T + 4, w: 8, h: 8 });
    if (ch === 'k') L.checkpoints.push({ c: c, r: r, x: c * T, y: r * T, w: T, h: T });
    if (ch === 'x') L.exits.push({ c: c, r: r, x: c * T, y: r * T, w: T, h: T });
    if (ch === 'e') L.walkers++;
  }));
  if (!L.spawn) throw new Error(def.name + ': no start tile (p)');
  return L;
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
// Movement modes from a surface. Jump modes hold jump for the whole arc (the highest arc).
const MODES = [
  { dir: 0, jump: true, jumpFrame: 0 },                                           // standing jump
  { dir: 1, jump: true, jumpFrame: 0 }, { dir: -1, jump: true, jumpFrame: 0 },    // jump at once, moving
  { dir: 1, jump: true, jumpFrame: 8 }, { dir: -1, jump: true, jumpFrame: 8 },    // running jump after 8 steps
  { dir: 1, jump: false }, { dir: -1, jump: false },                              // run off an edge
];
// Simulates one trajectory. Returns { status, node } where status is:
//   'land'   first landing on another surface (node) or back on the start after a jump,
//   'fell'   fell into a pit,
//   'stuck'  never left the start surface (for example walked into a wall),
//   'limit'  still in the air when the frame limit ran out (cannot judge: inconclusive).
// onBox sees every player box on the way.
function simulate(L, startX, startNode, mode, onBox, limits) {
  const r = Math.floor(startNode / L.cols);
  let p = Physics.makePlayer(startX, r * T - C.PLAYER_H);
  if (onBox) onBox(p);
  let airborne = false;
  for (let f = 0; f < limits.maxFrames; f++) {
    const inp = { moveX: mode.dir, jumpPressed: mode.jump && f === mode.jumpFrame, jumpHeld: mode.jump && f >= mode.jumpFrame };
    const res = Physics.stepPlayer(L, p, inp);
    p = res.player;
    if (onBox) onBox(p);
    if (res.pit) return { status: 'fell', node: null };
    if (!p.onGround) { airborne = true; continue; }
    const nd = nodeAt(L, p);
    if (nd === null) continue;
    if (nd !== startNode) return { status: 'land', node: nd };
    if (airborne) return { status: 'land', node: startNode };
  }
  return { status: airborne ? 'limit' : 'stuck', node: null };
}
// Surfaces of the level, grouped into runs of standable tiles at the same height.
function surfaces(L) {
  const segs = [];
  for (let r = 0; r < L.rows; r++) {
    let start = -1;
    for (let c = 0; c <= L.cols; c++) {
      const ok = c < L.cols && standable(L, c, r);
      if (ok && start < 0) start = c;
      if (!ok && start >= 0) { segs.push({ row: r, c0: start, c1: c - 1, top: r * T, x0: start * T, x1: c * T }); start = -1; }
    }
  }
  return segs;
}
// Difficulty measures and jump margins. A margin is how much of the jump is left over: gaps are compared with the
// running-jump reach (the player's width is added, because the player's left edge has to travel that far), steps
// with the standing-jump height (or the running height when the jump also crosses a gap).
function geometry(L, env) {
  const PW = C.PLAYER_W;
  const segs = surfaces(L);
  const floorTop = segs.length ? Math.max.apply(null, segs.map((s) => s.top)) : 0;
  let maxGapPx = 0, maxStepPx = 0, pits = 0;
  const jumps = [];
  const where = (A, B) => 'row ' + A.row + ' cols ' + A.c0 + '-' + A.c1 + ' and row ' + B.row + ' cols ' + B.c0 + '-' + B.c1;
  // Gaps: neighbouring surfaces at the same height, left to right.
  const byTop = new Map();
  segs.forEach((sg) => { if (!byTop.has(sg.top)) byTop.set(sg.top, []); byTop.get(sg.top).push(sg); });
  byTop.forEach((list) => {
    list.sort((a, b) => a.x0 - b.x0);
    for (let i = 0; i + 1 < list.length; i++) {
      const left = list[i], right = list[i + 1];
      const gap = right.x0 - left.x1;
      // Pits are gaps in the ground: open air between two ground surfaces. A solid block in between is a wall, not a pit.
      // Gaps between girders are covered by the reachability check, not by these measures.
      if (gap <= 0 || left.top !== floorTop) continue;
      let air = true;
      for (let c = left.c1 + 1; c < right.c0; c++) if (L.grid[left.row][c] === '#') air = false;
      if (!air) continue;
      maxGapPx = Math.max(maxGapPx, gap);
      pits++;
      jumps.push({ kind: 'pit', where: where(left, right), margin: (env.dRun - (gap + PW)) / env.dRun * 100 });
    }
  });
  // Steps: surfaces at different heights that touch in x.
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j];
      const touch = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
      if (A.top === B.top || touch <= 0) continue;
      const rise = Math.abs(A.top - B.top);
      maxStepPx = Math.max(maxStepPx, rise);
      jumps.push({ kind: 'step', where: where(A, B), margin: (env.hStand - rise) / env.hStand * 100 });
    }
  }
  const minMargin = jumps.length ? Math.min.apply(null, jumps.map((j) => j.margin)) : 100;
  return {
    difficulty: { gapTiles: maxGapPx / T, stepTiles: maxStepPx / T, walkers: L.walkers, pits: pits },
    jumps: jumps, minMargin: minMargin,
  };
}

function overlapBox(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function startXs(L, node) {
  const c = node % L.cols;
  const xs = [];
  for (let x = c * T; x <= c * T + T - C.PLAYER_W; x++) xs.push(x);
  return xs;
}

function checkLevel(L, limits) {
  limits = Object.assign({}, LIMITS, limits || {});
  const t0 = Date.now();
  const geo = geometry(L, envelope());
  const nodes = [];
  for (let r = 0; r < L.rows; r++) for (let c = 0; c < L.cols; c++) if (standable(L, c, r)) nodes.push(r * L.cols + c);
  if (nodes.length > limits.maxNodes) {
    return { status: 'INCONCLUSIVE', reason: 'node count ' + nodes.length + ' over limit ' + limits.maxNodes };
  }
  const spawnNode = nodeAt(L, L.spawn);
  if (spawnNode === null) return { status: 'FAIL', reason: 'spawn is not on a standable tile' };

  // Pass 1: edges.
  const adj = new Map();
  let limitHit = null;
  for (const n of nodes) {
    if (Date.now() - t0 > limits.timeMs) return { status: 'INCONCLUSIVE', reason: 'time limit ' + limits.timeMs + ' ms reached' };
    const out = new Set();
    for (const x of startXs(L, n)) {
      for (const mode of MODES) {
        const res = simulate(L, x, n, mode, null, limits);
        if (res.status === 'limit') limitHit = limitHit || 'frame limit ' + limits.maxFrames + ' reached';
        if (res.status === 'land' && res.node !== n) out.add(res.node);
      }
    }
    adj.set(n, out);
  }
  if (limitHit) return { status: 'INCONCLUSIVE', reason: limitHit };

  // Breadth-first search from the spawn node.
  const reach = new Set([spawnNode]);
  const queue = [spawnNode];
  while (queue.length) {
    const n = queue.shift();
    for (const m of adj.get(n) || []) if (!reach.has(m)) { reach.add(m); queue.push(m); }
  }

  // Pass 2: every box a reachable player can occupy (start positions and every trajectory frame).
  const targets = [];
  L.coins.forEach((t) => targets.push({ kind: 'coin', t: t, box: t, hit: false }));
  L.checkpoints.forEach((t) => targets.push({ kind: 'checkpoint', t: t, box: t, hit: false }));
  L.exits.forEach((t) => targets.push({ kind: 'exit', t: t, box: t, hit: false }));
  for (const n of reach) {
    for (const x of startXs(L, n)) {
      for (const mode of MODES) {
        simulate(L, x, n, mode, (p) => {
          for (const tg of targets) if (!tg.hit && overlapBox(p, tg.box)) tg.hit = true;
        }, limits);
      }
    }
  }

  const lines = [];
  const counts = { coin: [0, 0], checkpoint: [0, 0], exit: [0, 0] };
  for (const tg of targets) {
    counts[tg.kind][1]++;
    if (tg.hit) counts[tg.kind][0]++;
    else lines.push('FAIL ' + tg.kind + ' at row ' + tg.t.r + ' col ' + tg.t.c + ' is not reachable from the start');
  }
  const summary = 'coins ' + counts.coin[0] + '/' + counts.coin[1] + ', checkpoints ' + counts.checkpoint[0] + '/' +
    counts.checkpoint[1] + ', exits ' + counts.exit[0] + '/' + counts.exit[1] + '; graph ' + nodes.length +
    ' surfaces, ' + reach.size + ' reachable; ' + (Date.now() - t0) + ' ms';
  const thin = geo.jumps.filter((j) => j.margin < 5);
  thin.forEach((j) => lines.push('FAIL ' + j.kind + ' margin ' + j.margin.toFixed(1) + '% at ' + j.where + ' (below 5%)'));
  return { status: lines.length ? 'FAIL' : 'PASS', lines: lines,
    summary: summary + '; min jump margin ' + geo.minMargin.toFixed(1) + '%',
    checks: targets.length, difficulty: geo.difficulty, minMargin: geo.minMargin };
}

// Jump envelope from the same physics, on a flat floor (printed for comparison).
function envelope() {
  const cols = 60, rows = 12;
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(r === 10 ? '#' : '.'));
  const L = { cols: cols, rows: rows, grid: grid, heightPx: rows * T };
  let p = Physics.makePlayer(100, 10 * T - C.PLAYER_H);
  p.onGround = true;
  let minY = p.y;
  p = Physics.stepPlayer(L, p, { moveX: 0, jumpPressed: true, jumpHeld: true }).player;
  for (let f = 0; f < 200; f++) {
    p = Physics.stepPlayer(L, p, { moveX: 0, jumpPressed: false, jumpHeld: true }).player;
    minY = Math.min(minY, p.y);
  }
  const standRise = 10 * T - C.PLAYER_H - minY;
  // Running jump: run for 30 steps to full speed, then jump with jump held; reach is the distance the player's left
  // edge travels to land at the same height.
  let q = Physics.makePlayer(100, 10 * T - C.PLAYER_H);
  q.onGround = true;
  for (let f = 0; f < 30; f++) q = Physics.stepPlayer(L, q, { moveX: 1, jumpPressed: false, jumpHeld: false }).player;
  const x0 = q.x;
  let runMinY = q.y;
  q = Physics.stepPlayer(L, q, { moveX: 1, jumpPressed: true, jumpHeld: true }).player;
  for (let f = 0; f < 200; f++) {
    q = Physics.stepPlayer(L, q, { moveX: 1, jumpPressed: false, jumpHeld: true }).player;
    runMinY = Math.min(runMinY, q.y);
    if (q.onGround && q.vy >= 0 && q.x > x0 + 4) break;
  }
  return { standRise: standRise, hStand: standRise, hRun: 10 * T - C.PLAYER_H - runMinY, dRun: q.x - x0,
    analyticPeak: C.JUMP_V * C.JUMP_V / (2 * C.GRAVITY) };
}

module.exports = { buildLevel, checkLevel, envelope, geometry, loadLevels, levelFiles, LIMITS };

function main() {
  const env = envelope();
  console.log('reachability: movement from js/physics.js');
  console.log('  standing jump rise (stepped): ' + env.standRise.toFixed(2) + ' px, analytic v^2/2g: ' + env.analyticPeak.toFixed(2) + ' px');
  let failed = 0, checks = 0;
  for (const { file, def } of loadLevels(levelFiles())) {
    const res = checkLevel(buildLevel(def));
    if (res.status === 'INCONCLUSIVE') {
      console.log('[' + def.name + '] (' + file + ') INCONCLUSIVE: ' + res.reason + ' (counts as a failure)');
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
