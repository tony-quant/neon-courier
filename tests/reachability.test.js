// tests/reachability.test.js — the check must pass the fixed level, fail the pre-fix level by naming the row-6
// coins, and report INCONCLUSIVE (never PASS) when any limit is hit. Run: node --test tests/reachability.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { buildLevel, checkLevel, loadLevels, LIMITS } = require('../tools/reachability.js');

const ROOT = path.join(__dirname, '..');
const fixedDef = loadLevels([path.join(ROOT, 'levels', 'level1.js')])[0].def;
const oldDef = loadLevels([path.join(ROOT, 'tests', 'fixtures', 'level1-before-fix.js')])[0].def;

test('the fixed level passes: every coin, the checkpoint and the exit are reachable', () => {
  const res = checkLevel(buildLevel(fixedDef));
  assert.strictEqual(res.status, 'PASS', res.lines ? res.lines.join('; ') : res.reason);
  assert.strictEqual(res.checks, 23);
});

test('the pre-fix level fails and names the row-6 coins and the thin step', () => {
  const res = checkLevel(buildLevel(oldDef));
  assert.strictEqual(res.status, 'FAIL');
  // The two coins are named, and the 80 px step up to the row-7 girder is reported as a thin-margin jump.
  assert.ok(res.lines.includes('FAIL coin at row 6 col 15 is not reachable from the start'), res.lines.join('; '));
  assert.ok(res.lines.includes('FAIL coin at row 6 col 16 is not reachable from the start'), res.lines.join('; '));
  assert.ok(res.lines.some((l) => /^FAIL step margin -?[0-9.]+% at row 7 cols 14-17/.test(l)), res.lines.join('; '));
});

test('node limit: a level over the limit is INCONCLUSIVE, not PASS', () => {
  const res = checkLevel(buildLevel(fixedDef), { maxNodes: 5 });
  assert.strictEqual(res.status, 'INCONCLUSIVE');
  assert.match(res.reason, /node count/);
});

test('frame limit: a trajectory still in the air at the limit makes the result INCONCLUSIVE', () => {
  // A jump needs about 44 frames to land; 3 frames cannot finish any arc.
  const res = checkLevel(buildLevel(fixedDef), { maxFrames: 3 });
  assert.strictEqual(res.status, 'INCONCLUSIVE');
  assert.match(res.reason, /frame limit/);
});

test('time limit: an expired time budget is INCONCLUSIVE, not PASS', () => {
  // A negative budget is already expired at the first check, so the outcome does not depend on machine speed.
  const res = checkLevel(buildLevel(fixedDef), { timeMs: -1 });
  assert.strictEqual(res.status, 'INCONCLUSIVE');
  assert.match(res.reason, /time limit/);
});

test('default limits are the ones the check reports', () => {
  assert.ok(LIMITS.maxFrames >= 60 && LIMITS.maxNodes >= 1000 && LIMITS.timeMs >= 1000);
});
