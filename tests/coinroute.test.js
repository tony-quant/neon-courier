// tests/coinroute.test.js — the coin rule. Every coin and the exit of every sector must be reached by a route. Sector 3
// is a forced climb: with its girder steps removed (the only way up), no coin and no exit may be reachable. That is the
// route to every coin and the exit passing through the climb. Run: node --test tests/coinroute.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const R = require('../tools/reachability.js');

const CLIMB_SECTORS = ['Sector 3: Forced Climb'];
const levels = R.loadLevels(R.levelFiles());

test('every coin and the exit of every sector is reached by a route', () => {
  for (const x of levels) {
    const res = R.checkLevel(R.buildLevel(x.def));
    assert.strictEqual(res.status, 'PASS', x.file + ': ' + (res.lines || [res.reason]).join('; '));
  }
});

test('a climb sector: with the girder steps removed, no coin and no exit is reachable', () => {
  for (const x of levels) {
    if (CLIMB_SECTORS.indexOf(x.def.name) < 0) continue;
    const L = R.buildLevel(x.def);
    const noGirders = { name: x.def.name + ' (no girders)', rows: x.def.rows.map((r) => r.replace(/-/g, '.')) };
    const res = R.checkLevel(R.buildLevel(noGirders));
    assert.notStrictEqual(res.status, 'INCONCLUSIVE', x.file + ': ' + res.reason);
    const coinLines = (res.lines || []).filter((l) => l.indexOf('FAIL coin ') === 0).length;
    const exitLines = (res.lines || []).filter((l) => l.indexOf('FAIL exit ') === 0).length;
    assert.strictEqual(coinLines, L.coins.length, x.file + ': ' + L.coins.length + ' coins, ' + coinLines +
      ' unreachable without the girders; a coin is reachable on the ground route');
    assert.strictEqual(exitLines, L.exits.length, x.file + ': the exit is reachable without the girders');
  }
});
