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

const RULES = require('./support/rules.js');
const { obstacleSequence, findTile, surfaceEdges, walkerViolations, checkpointViolations } = RULES;

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

test('live sectors: walker rules (a) to (e) hold', () => {
  const bad = [];
  for (const lv of live) for (const m of walkerViolations(lv)) bad.push(lv.file + ': ' + m);
  assert.deepStrictEqual(bad, [], 'walker rule failures:\n' + bad.join('\n'));
});
