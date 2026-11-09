// tests/support/rules.js — the level rules, shared by the rule tests and the scripted playthrough.
'use strict';
const CHECKPOINT_GAP_TILES = 8;  // a walker is at least this far from a checkpoint (the rule in checkpointViolations/walkerViolations)

// The obstacle sequence of a sector: each column as the shape of rows 8 to 13 (solid, girder, air, walker), with runs of
// identical columns merged. Coins, the checkpoint, the exit and the start are not obstacles and are left out.
function obstacleSequence(rows) {
  const W = Math.max.apply(null, rows.map((r) => r.length));
  const out = [];
  for (let c = 0; c < W; c++) {
    let key = '';
    for (let r = 8; r <= 13; r++) {
      const ch = (rows[r] || '').charAt(c);
      key += ch === 'e' ? 'w' : ch === '#' ? '#' : ch === '-' ? '-' : '.';
    }
    if (out.length && out[out.length - 1][0] === key) out[out.length - 1][1]++;
    else out.push([key, 1]);
  }
  return JSON.stringify(out);
}

// Grid helpers. A walker stands on row r of its tile, on the surface at row r+1.
function findTile(rows, ch) {
  const out = [];
  rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row.charAt(c) === ch) out.push({ r: r, c: c }); });
  return out;
}
// A walker's surface row is solid or girder under it; any column of that row that is not ground is a pit or a ledge end.
function surfaceEdges(rows, s, W) {
  const edges = [];
  for (let j = 0; j < W; j++) {
    const ch = (rows[s] || '').charAt(j);
    if (ch !== '#' && ch !== '-') edges.push(j);
  }
  return edges;
}

// Spawn spacing, from the game's own numbers. A walker moves WALK = 40 px/s (js/game.js). The player can react within
// the longest reaction window, 15 frames (0.25 s), and then needs a standing jump's air time, 2 * JUMP_V / GRAVITY =
// 2 * 330 / 900 = 0.733 s, to clear it. In that time a walker covers 40 * (0.25 + 0.733) = 39.3 px. Add a 2-tile margin
// (32 px): 71.3 px, which is 4.46 tiles, so the rule is 4.5 tiles (72 px). In whole columns a walker must be at least 5
// columns from the spawn (4 columns is 64 px, short of 72). A checkpoint respawn keeps the 8-tile rule (larger).
const WALK_PX_PER_S = 40;
const SPAWN_SPACING_PX = 72;
const SPAWN_SPACING_DERIVATION = (WALK_PX_PER_S * (15 / 60 + 2 * 330 / 900) + 2 * 16);   // 71.3 px, rounded up to 72

function walkerViolations(lv) {
  const rows = lv.def.rows;
  const W = lv.L.cols;
  const walkers = findTile(rows, 'e');
  const spawn = findTile(rows, 'p')[0];
  const checkpoints = findTile(rows, 'k');
  const v = [];
  for (const w of walkers) {
    const edges = surfaceEdges(rows, w.r + 1, W);
    const near = edges.filter((j) => Math.abs(j - w.c) < 6);
    if (near.length) v.push('(a) walker at column ' + w.c + ' is within 6 tiles of a pit or ledge edge at column ' + near[0]);
    if (spawn && Math.abs(w.c - spawn.c) * 16 < SPAWN_SPACING_PX) {
      v.push('(e) walker at column ' + w.c + ' is within ' + (SPAWN_SPACING_PX / 16) + ' tiles of the spawn (column ' + spawn.c + ')');
    }
    for (const k of checkpoints) if (Math.abs(w.c - k.c) < 8) v.push('(b) walker at column ' + w.c + ' is within 8 tiles of the checkpoint (column ' + k.c + ')');
  }
  for (let i = 0; i < walkers.length; i++) for (let j = i + 1; j < walkers.length; j++) {
    if (Math.abs(walkers[i].c - walkers[j].c) < 10) v.push('(c) walkers at columns ' + walkers[i].c + ' and ' + walkers[j].c + ' are less than 10 tiles apart');
  }
  for (let x0 = 0; x0 <= Math.max(0, W - 20); x0++) {
    const inWin = walkers.filter((w) => w.c >= x0 && w.c <= x0 + 19);
    if (inWin.length > 1) v.push('(d) ' + inWin.length + ' walkers in the 20-tile stretch from column ' + x0);
  }
  return [...new Set(v)];
}

function checkpointViolations(lv) {
  const rows = lv.def.rows;
  const W = lv.L.cols;
  const v = [];
  const cps = findTile(rows, 'k');
  if (cps.length !== 1) v.push('expected one checkpoint, found ' + cps.length);
  for (const k of cps) {
    const pct = (k.c / W) * 100;
    if (pct < 45 || pct > 55) v.push('checkpoint at column ' + k.c + ' is ' + pct.toFixed(1) + '% of the length (45 to 55 required)');
    const under = (rows[k.r + 1] || '').charAt(k.c);
    if (under !== '#' && under !== '-') v.push('checkpoint at column ' + k.c + ' is not on a landing');
  }
  return v;
}


module.exports = { obstacleSequence, findTile, surfaceEdges, walkerViolations, checkpointViolations, SPAWN_SPACING_PX, CHECKPOINT_GAP_TILES };
