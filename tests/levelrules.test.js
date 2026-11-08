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
