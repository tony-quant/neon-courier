// tests/physics.test.js — the pure module (js/physics.js) must reproduce, frame for frame and exactly, the physics
// trace recorded from the game before the extraction (tests/fixtures/physics-trace.json). Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const Physics = require('../js/physics.js');

const ROOT = path.join(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'physics-trace.json'), 'utf8'));
const levelSrc = fs.readFileSync(path.join(ROOT, 'levels', 'level1.js'), 'utf8');

function buildLevel(src) {
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox);
  const def = sandbox.window.LEVELS[0];
  const cols = Math.max.apply(null, def.rows.map((r) => r.length));
  const grid = def.rows.map((r) => r.padEnd(cols, '.').split(''));
  let spawn = null;
  grid.forEach((row, r) => row.forEach((ch, c) => { if (ch === 'p') spawn = { c: c, r: r }; }));
  return { cols: cols, rows: grid.length, grid: grid, heightPx: grid.length * Physics.C.T,
    spawn: { x: spawn.c * Physics.C.T + 3, y: (spawn.r + 1) * Physics.C.T - Physics.C.PLAYER_H } };
}

const FIELDS = ['x', 'y', 'vx', 'vy', 'onGround', 'coyote', 'jumpBuf', 'face', 'anim', 'invuln'];

test('the recorded trace was made from this level file', () => {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'levels', 'level1.js'))).digest('hex');
  assert.strictEqual(sha, fixture.levelSha256, 'levels/level1.js changed since the trace was recorded');
});

test('every recorded frame is reproduced exactly by js/physics.js', () => {
  const L = buildLevel(levelSrc);
  let frames = 0, jumps = 0;
  fixture.sequences.forEach((seq, si) => {
    const start = seq.start ? Physics.makePlayer(seq.start.x, seq.start.y) : Physics.makePlayer(L.spawn.x, L.spawn.y);
    let p = start;
    seq.states.forEach((want, f) => {
      const res = Physics.stepPlayer(L, p, seq.inputs[f]);
      p = res.player;
      if (res.jumped) jumps++;
      const got = {};
      FIELDS.forEach((k) => { got[k] = p[k]; });
      assert.deepStrictEqual(got, want, 'sequence ' + si + ', frame ' + f + ' differs');
      frames++;
    });
  });
  assert.ok(frames >= 5000, 'expected the full recorded trace, got ' + frames + ' frames');
  assert.ok(jumps >= 100, 'trace must include jumps, got ' + jumps);
  console.log('physics: ' + frames + ' frames, ' + jumps + ' jumps, all identical');
});
