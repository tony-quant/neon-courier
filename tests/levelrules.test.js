// tests/levelrules.test.js — the rules for sectors 4 and up (docs/levels-brief.md). No sector repeats an earlier sector's
// obstacle sequence exactly. A wall in a sector 4+ is 3 tiles tall or taller. Gap and step are at most 3 tiles. From
// sector 4 on, each sector is at least as large as the one before on walkers, pits, tight landings and length (in
// tiles), and adds at least one. Run: node --test tests/levelrules.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../tools/reachability.js');

const FIRST_NEW = 4;                      // sector number of the first sector the rules apply to
const levels = R.loadLevels(R.levelFiles()).map((x, i) => ({ number: i + 1, file: x.file, def: x.def, L: R.buildLevel(x.def) }));

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

test('no two sectors have the same obstacle sequence', () => {
  const seen = new Map();
  for (const lv of levels) {
    const sig = obstacleSequence(lv.def.rows);
    assert.ok(!seen.has(sig), lv.file + ' repeats the obstacle sequence of ' + seen.get(sig));
    seen.set(sig, lv.file);
  }
});

test('every wall in a sector 4 or up is 3 tiles tall or taller', () => {
  for (const lv of levels) {
    if (lv.number < FIRST_NEW) continue;
    const rows = lv.def.rows;
    const W = Math.max.apply(null, rows.map((r) => r.length));
    for (let c = 0; c < W; c++) {
      const at = (r) => (rows[r] || '').charAt(c);
      if (at(11) !== '#') continue;                 // a wall stands on the floor with solid tiles at row 11
      let top = 11;                                 // count the solid tiles from row 11 up
      while (top > 0 && at(top - 1) === '#') top--;
      const h = 12 - top;
      assert.ok(h >= 3, lv.file + ': the wall at column ' + c + ' is ' + h + ' tiles tall (3 or more is required)');
    }
  }
});

test('gap and step are at most 3 tiles in every sector 4 or up', () => {
  for (const lv of levels) {
    if (lv.number < FIRST_NEW) continue;
    const res = R.checkLevel(lv.L);
    assert.ok(res.difficulty.gapTiles <= 3, lv.file + ': gap ' + res.difficulty.gapTiles + ' tiles');
    assert.ok(res.difficulty.stepTiles <= 3, lv.file + ': step ' + res.difficulty.stepTiles + ' tiles');
  }
});

test('from sector 4 on, each sector is at least as large as the one before, and adds at least one measure', () => {
  const keys = ['walkers', 'pits', 'tightLandings'];
  let prev = null;
  for (const lv of levels) {
    const res = R.checkLevel(lv.L);
    const cur = {
      walkers: res.difficulty.walkers, pits: res.difficulty.pits, tightLandings: res.difficulty.tightLandings,
      length: lv.L.cols,
    };
    if (lv.number >= FIRST_NEW && prev) {
      const all = keys.concat(['length']);
      for (const k of all) {
        assert.ok(cur[k] >= prev[k], lv.file + ': ' + k + ' drops from ' + prev[k] + ' to ' + cur[k]);
      }
      assert.ok(all.some((k) => cur[k] > prev[k]), lv.file + ' does not add anything to the sector before it');
    }
    prev = cur;
  }
});

// ---- live sectors: checkpoint and walker rules ----
// The rules below apply to every sector that index.html loads (the live sectors), in the order it loads them.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const liveFiles = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src="levels\/(level\d+\.js)"/g)].map((m) => m[1]);
const live = liveFiles.map((f) => levels.find((lv) => lv.file === f)).filter(Boolean);

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
    if (spawn && Math.abs(w.c - spawn.c) < 8) v.push('(b) walker at column ' + w.c + ' is within 8 tiles of the spawn (column ' + spawn.c + ')');
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

test('live sectors: each checkpoint is on a landing and 45 to 55 percent along the sector', () => {
  const bad = [];
  for (const lv of live) {
    const cps = findTile(lv.def.rows, 'k');
    const res = R.checkLevel(lv.L);
    const cpFail = (res.lines || []).filter((l) => l.indexOf('FAIL checkpoint') === 0);
    if (cpFail.length) bad.push(lv.file + ': ' + cpFail.join('; '));
    for (const m of checkpointViolations(lv)) bad.push(lv.file + ': ' + m);
    if (!cps.length) bad.push(lv.file + ': no checkpoint');
  }
  assert.deepStrictEqual(bad, [], 'checkpoint rule failures:\n' + bad.join('\n'));
});

test('live sectors: walker rules (a) to (d) hold', () => {
  const bad = [];
  for (const lv of live) for (const m of walkerViolations(lv)) bad.push(lv.file + ': ' + m);
  assert.deepStrictEqual(bad, [], 'walker rule failures:\n' + bad.join('\n'));
});
