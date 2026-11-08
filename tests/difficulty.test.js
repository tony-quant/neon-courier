// tests/difficulty.test.js — the levels get harder, never easier, and every level passes the reachability check.
// Measures per level: largest gap (tiles), largest step (tiles), walkers, pits. Each must be equal to or greater than
// the previous level's, and at least one must be strictly greater. Jump margins must be at least 5 percent.
// Stated difficulty (levels 2 and up) must match the layout. Run: node --test tests/difficulty.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = require('../tools/reachability.js');

const ROOT = path.join(__dirname, '..');
const LEVEL_FILES = R.levelFiles();
const levels = R.loadLevels(LEVEL_FILES).map((x) => {
  const L = R.buildLevel(x.def);
  const res = R.checkLevel(L);
  const geo = R.geometry(L, R.envelope());
  // Copy out of the sandbox realm so plain-object comparisons work.
  const stated = x.def.difficulty ? JSON.parse(JSON.stringify(x.def.difficulty)) : null;
  return { file: x.file, name: x.def.name, res: res, difficulty: geo.difficulty, minMargin: geo.minMargin, stated: stated };
});

test('every level is in order and passes the reachability check', () => {
  assert.ok(levels.length === 10, 'expected 10 levels, got ' + levels.length);
  for (const lv of levels) {
    assert.strictEqual(lv.res.status, 'PASS', lv.file + ': ' + (lv.res.lines || [lv.res.reason]).join('; '));
  }
});

test('the game loads the levels in the same order as the files are numbered', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const loaded = [...html.matchAll(/src="levels\/(level\d+\.js)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(loaded, levels.map((lv) => lv.file));
});

test('stated difficulty matches the layout for every level that states it', () => {
  for (const lv of levels) {
    if (!lv.stated) continue;
    assert.deepStrictEqual(lv.stated, {
      gapTiles: lv.difficulty.gapTiles, stepTiles: lv.difficulty.stepTiles,
      walkers: lv.difficulty.walkers, pits: lv.difficulty.pits,
    }, lv.file + ' states a difficulty that does not match its layout');
  }
});

test('difficulty never decreases from one level to the next, and each level adds something', () => {
  const keys = ['gapTiles', 'stepTiles', 'walkers', 'pits'];
  for (let i = 1; i < levels.length; i++) {
    const prev = levels[i - 1].difficulty, cur = levels[i].difficulty;
    for (const k of keys) {
      assert.ok(cur[k] >= prev[k], levels[i].file + ': ' + k + ' drops from ' + prev[k] + ' to ' + cur[k]);
    }
    assert.ok(keys.some((k) => cur[k] > prev[k]), levels[i].file + ' is not harder than the level before it');
  }
});

test('every jump has at least a 5 percent margin', () => {
  for (const lv of levels) {
    assert.ok(lv.minMargin >= 5, lv.file + ': smallest jump margin is ' + lv.minMargin.toFixed(1) + '%');
  }
});

test('print the difficulty table', () => {
  const rows = levels.map((lv) => [lv.file.replace('.js', ''), lv.difficulty.gapTiles, lv.difficulty.stepTiles,
    lv.difficulty.walkers, lv.difficulty.pits, lv.minMargin.toFixed(1) + '%', lv.res.status]);
  const head = ['level', 'gap (tiles)', 'step (tiles)', 'walkers', 'pits', 'min jump margin', 'reachability'];
  const table = [head].concat(rows).map((r) => '| ' + r.join(' | ') + ' |').join('\n');
  console.log(table);
  assert.ok(table.length > 0);
});
