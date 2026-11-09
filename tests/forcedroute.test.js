// tests/forcedroute.test.js — the forced-route rule. A sector is forced when the exit cannot be reached by the ground and
// girder surfaces alone (walking, stepping down, and standing jumps up onto a surface that touches it in x). Running
// jumps across gaps are not allowed in that route, so a forced sector needs a running jump somewhere. Sector 1 is exempt.
// Every live sector is checked (index.html). Run: node --test tests/forcedroute.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = require('../tools/reachability.js');
const Physics = require('../js/physics.js');

const C = Physics.C;
const T = C.T;
const standable = R.standable;
const ROOT = path.join(__dirname, '..');
const EXEMPT = ['Sector 1: Rust Alley'];

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
// Forced-route rule (separate from the reachability check). A route that avoids the obstacle uses only ground and
// girder surfaces: the player walks along them, steps down, or climbs with a standing jump (no running jump, so no gap
// can be crossed). If the spawn point can reach the exit that way, the sector is not forced to use a running jump, and
// it fails with "route not forced". Sector 1 is exempt. Enumerates every such route (capped).
const FORCED_ROUTE_EXEMPT = ['Sector 1: Rust Alley'];
function avoidanceRoutes(L, env, cap) {
  cap = cap || 200;
  const segs = surfaces(L);
  const at = (c, r) => (c < 0 || c >= L.cols || r < 0 || r >= L.rows) ? '#' : L.grid[r][c];
  const label = (sg) => 'row ' + sg.row + ' cols ' + sg.c0 + '-' + sg.c1;
  const exitCell = L.exits[0];
  const spawnCol = Math.floor((L.spawn.x + C.PLAYER_W / 2) / T), spawnRow = Math.round((L.spawn.y + C.PLAYER_H) / T);
  const start = segs.find((sg) => sg.row === spawnRow && sg.c0 <= spawnCol && spawnCol <= sg.c1);
  const goal = exitCell ? segs.find((sg) => sg.row === exitCell.r + 1 && sg.c0 <= exitCell.c && exitCell.c <= sg.c1) : null;
  if (!start || !goal) return { routes: [], reason: !start ? 'no start surface' : 'no exit surface' };
  // Edges: walk along a surface (none needed), step down or climb with a standing jump where the two touch in x.
  const out = new Map(segs.map((sg) => [sg, []]));
  for (const A of segs) for (const B of segs) {
    if (A === B) continue;
    const touch = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0);
    if (touch <= 0) continue;                                    // must overlap in x
    if (B.top === A.top) continue;                               // same height: already one surface, or a pit
    if (B.top < A.top) {                                         // climb: needs a standing jump
      const rise = A.top - B.top;
      if (rise > env.hStand) continue;
      // a solid block between the two surfaces stops the climb
      let blocked = false;
      for (let c = Math.max(A.c0, B.c0); c <= Math.min(A.c1, B.c1); c++)
        for (let r = B.row + 1; r < A.row; r++) if (at(c, r) === '#') blocked = true;
      if (blocked) continue;
    }
    out.get(A).push(B);                                          // climb, or step/fall down
  }
  const routes = [];
  const path = [start];
  const seen = new Set([start]);
  (function walk(sg) {
    if (routes.length >= cap) return;
    if (sg === goal) { routes.push(path.map(label).join(' -> ')); return; }
    for (const nx of out.get(sg)) {
      if (seen.has(nx)) continue;
      seen.add(nx); path.push(nx);
      walk(nx);
      path.pop(); seen.delete(nx);
    }
  })(start);
  return { routes: routes, reason: null };
}
function forcedRoute(L, env, name) {
  const res = avoidanceRoutes(L, env);
  const exempt = FORCED_ROUTE_EXEMPT.indexOf(name) >= 0;
  const forced = res.routes.length === 0;
  return { name: name, routes: res.routes, reason: res.reason, forced: forced || exempt,
    status: (forced || exempt) ? 'route forced' : 'route not forced' };
}


const liveFiles = [...fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').matchAll(/src="levels\/(level\d+\.js)"/g)].map((m) => m[1]);
const levels = R.loadLevels(R.levelFiles());
const env = R.envelope();

test('every live sector except sector 1 is forced: no route without a running jump reaches its exit', () => {
  const bad = [];
  for (const file of liveFiles) {
    const x = levels.find((lv) => lv.file === file);
    if (!x || EXEMPT.indexOf(x.def.name) >= 0) continue;
    const f = forcedRoute(R.buildLevel(x.def), env, x.def.name);
    if (f.status !== 'route forced') bad.push(file + ': ' + f.routes.slice(0, 2).join(' | '));
  }
  assert.deepStrictEqual(bad, [], 'routes that avoid the running jump:\n' + bad.join('\n'));
});

test('sector 1 is exempt from the forced-route rule', () => {
  const x = levels.find((lv) => lv.def.name === 'Sector 1: Rust Alley');
  assert.ok(x, 'sector 1 is in levels/');
  assert.ok(EXEMPT.indexOf(x.def.name) >= 0);
});
