#!/usr/bin/env node
'use strict';
// tools/record-trace.js — records the player's physics state after every frame of fixed, seeded input sequences
// by running the real game in headless Chromium. The output is the reference that the pure module must reproduce
// (tests/physics.test.js). Enemies are switched off and a sequence stops at a pit or a win, so every recorded frame is
// pure movement. Run once before a change to movement, and again only if the level or the sequences change.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PORT = 4199;
const OUT = process.env.TRACE_OUT || path.join(ROOT, 'tests', 'fixtures', 'physics-trace.json');

function rng(seed) {                       // mulberry32: same numbers on every run
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeInputs(seed, frames) {
  const r = rng(seed);
  const out = [];
  let moveX = 0, held = false, segLeft = 0;
  const speeds = [-1, -0.6, -0.3, 0, 0.3, 0.6, 1];
  for (let f = 0; f < frames; f++) {
    if (segLeft <= 0) {
      moveX = speeds[Math.floor(r() * speeds.length)];
      held = r() < 0.6;
      segLeft = 5 + Math.floor(r() * 35);
    }
    segLeft--;
    const press = r() < 0.08;
    out.push({ moveX: moveX, jumpHeld: held, jumpPressed: press });
  }
  return out;
}
const STARTS = [null, { x: 60, y: 178 }, { x: 250, y: 150 }, { x: 300, y: 100 }, { x: 420, y: 160 },
  { x: 560, y: 176 }, { x: 700, y: 150 }, { x: 900, y: 120 }];

function startServer() {
  return new Promise((resolve, reject) => {
    const srv = spawn('node', [path.join(ROOT, 'tests', 'serve.js')], { env: Object.assign({}, process.env, { PORT: String(PORT) }) });
    srv.stdout.on('data', (d) => { if (String(d).includes('serving')) resolve(srv); });
    srv.on('error', reject);
  });
}

async function main() {
  const srv = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__game);
    const sequences = [];
    for (let i = 0; i < STARTS.length * 2; i++) {
      const start = STARTS[i % STARTS.length];
      const inputs = makeInputs(1000 + i, 400);
      const res = await page.evaluate(([inputs, start]) => {
        const g = window.__game;
        let w = null, cur = null;
        window.Render.draw = function (ctx, world) { w = world; };
        window.Input.sample = function () { return cur; };
        g.manual(true);
        g.reset(); g.stepFrames(0);
        w.enemies.forEach((e) => { e.alive = false; });
        if (start) g.setPlayer(start.x, start.y, 0, 0);
        const deaths0 = w.deaths;
        const states = [];
        let used = 0;
        for (const inp of inputs) {
          cur = inp;
          g.stepFrames(1);
          if (w.deaths !== deaths0 || w.won) break;
          const p = w.player;
          states.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, coyote: p.coyote, jumpBuf: p.jumpBuf,
            face: p.face, anim: p.anim, invuln: p.invuln });
          used++;
        }
        const startState = null;
        return { states: states, used: used };
      }, [inputs, start]);
      sequences.push({ start: start, inputs: inputs.slice(0, res.used), states: res.states });
    }
    const levelSrc = fs.readFileSync(path.join(ROOT, 'levels', 'level1.js'));
    const crypto = require('crypto');
    const fixture = {
      note: 'Reference physics trace recorded from the game (headless Chromium). Enemies off; stops at pit or win.',
      levelSha256: crypto.createHash('sha256').update(levelSrc).digest('hex'),
      sequences: sequences,
    };
    fs.writeFileSync(OUT, JSON.stringify(fixture));
    const frames = sequences.reduce((n, s) => n + s.states.length, 0);
    console.log('recorded ' + sequences.length + ' sequences, ' + frames + ' frames -> ' + path.relative(ROOT, OUT));
  } finally {
    await browser.close();
    srv.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
