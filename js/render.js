// js/render.js — everything on screen is drawn in code with fillRect.
// Logical resolution 384x216. The game draws into an offscreen canvas of that size.
(function () {
  'use strict';
  const W = 384, H = 216, T = 16;

  // Limited palette (one place to change the whole look).
  const P = {
    sky0: '#07060f', sky1: '#120e2e', sky2: '#1c1446', sky3: '#2b1a55',
    far: '#1b1842', near: '#2a2257',
    conc: '#343856', concHi: '#4f5685', concLo: '#1d2036', crack: '#1d2036',
    neonC: '#38f2ff', neonP: '#ff3b9a', coin: '#ffd23f', orange: '#ff8a3d',
    white: '#f2f4ff', bodyL: '#d6dff0', bodyD: '#5a6480', gray: '#6b6f8a',
    black: '#07060f', girder: '#ff3b9a',
    winC: '#2f8794', winP: '#9a3d6e',   // muted background windows (calmer than neonC/neonP)
  };

  function hash(n) {
    const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  function drawSky(g) {
    const bands = [[0, 70, P.sky0], [70, 130, P.sky1], [130, 180, P.sky2], [180, H, P.sky3]];
    for (const b of bands) {
      g.fillStyle = b[2];
      g.fillRect(0, b[0], W, b[1] - b[0]);
    }
  }

  function drawStars(g) {
    g.fillStyle = P.white;
    g.globalAlpha = 0.6;
    for (let i = 0; i < 36; i++) {
      const x = Math.floor(hash(i * 1.7) * W);
      const y = Math.floor(hash(i * 2.9) * 80);
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
  }

  // Procedural skyline. camX * par gives the parallax offset.
  function drawSkyline(g, camX, par, color, seed, detailed) {
    const BW = 20;
    const off = camX * par;
    const i0 = Math.floor(off / BW) - 1;
    const n = Math.ceil(W / BW) + 3;
    for (let k = 0; k < n; k++) {
      const i = i0 + k;
      const x = Math.round(i * BW - off);
      const bw = BW + Math.floor(hash(i * 3.1 + seed) * 6);
      const h = 40 + Math.floor(hash(i * 5.7 + seed) * 90);
      const top = H - h;
      const ruined = hash(i * 7.3 + seed) > 0.7;
      g.fillStyle = color;
      if (ruined) {
        // Broken building: the top is cut back on one side.
        const cut = 14 + Math.floor(hash(i * 2.2 + seed) * 14);
        g.fillRect(x, top + cut, bw, H - top - cut);
        g.fillRect(x, top, Math.floor(bw * 0.4), cut);
      } else {
        g.fillRect(x, top, bw, H - top);
      }
      if (detailed) {
        for (let wy = top + 6; wy < H - 10; wy += 7) {
          for (let wx = x + 3; wx < x + bw - 3; wx += 5) {
            if (hash(wx * 0.37 + wy * 1.9 + i) > 0.8) {
              g.fillStyle = hash(wx + wy) > 0.5 ? P.winC : P.winP;
              g.fillRect(wx, wy, 2, 3);
            }
          }
        }
      }
    }
  }

  function drawRain(g, t) {
    g.globalAlpha = 0.14;
    g.fillStyle = P.neonC;
    for (let k = 0; k < 36; k++) {
      const x = Math.floor(hash(k * 3.3) * W);
      const y = Math.floor(((hash(k * 5.1) * H) + t * 55) % H);
      g.fillRect(x, y, 1, 3);
    }
    g.globalAlpha = 1;
  }

  function drawSolid(g, L, c, r, x, y) {
    g.fillStyle = P.conc;
    g.fillRect(x, y, T, T);
    g.fillStyle = P.concLo;
    g.fillRect(x, y + T - 2, T, 2);
    g.fillRect(x + T - 1, y, 1, T);
    const cx = x + 3 + Math.floor(hash(c * 13.7 + r * 3.1) * 8);
    const cy = y + 4 + Math.floor(hash(c * 2.3 + r * 7.7) * 7);
    g.fillStyle = P.crack;
    g.fillRect(cx, cy, 1, 3);
    g.fillRect(cx + 1, cy + 3, 1, 2);
    g.fillRect(cx + 2, cy + 4, 2, 1);
    const openAbove = r - 1 < 0 || L.grid[r - 1][c] !== '#';
    if (openAbove) {
      g.fillStyle = P.neonC;           // neon edge where the top is open to the sky
      g.fillRect(x, y, T, 1);
      g.fillStyle = P.concHi;
      g.fillRect(x, y + 1, T, 1);
    } else {
      g.fillStyle = P.concHi;
      g.fillRect(x, y, T, 1);
    }
  }

  function drawGirder(g, x, y) {
    g.fillStyle = P.girder;
    g.fillRect(x, y, T, 4);
    g.fillStyle = P.white;
    g.fillRect(x, y, T, 1);
    g.fillStyle = P.black;
    g.fillRect(x + 2, y + 2, 1, 1);
    g.fillRect(x + T - 3, y + 2, 1, 1);
  }

  function drawFlag(g, x, y, on, t) {
    g.fillStyle = P.gray;
    g.fillRect(x + 7, y + 1, 2, 15);
    g.fillStyle = on ? P.neonC : P.gray;
    const wave = on ? Math.round(Math.sin(t * 6)) : 0;
    g.fillRect(x + 9, y + 1 + (wave > 0 ? 0 : 1), 6, 5);
    if (on) {
      g.fillStyle = P.neonC;
      g.globalAlpha = 0.35;
      g.fillRect(x + 4, y - 2, 8, 20);
      g.globalAlpha = 1;
    }
  }

  function drawExit(g, x, y, t) {
    g.fillStyle = P.black;
    g.fillRect(x + 2, y, 12, 16);
    const pulse = (Math.sin(t * 4) + 1) / 2;
    g.fillStyle = pulse > 0.5 ? P.neonP : P.neonC;
    g.fillRect(x + 2, y, 12, 1);
    g.fillRect(x + 2, y, 1, 16);
    g.fillRect(x + 13, y, 1, 16);
  }

  function drawTiles(g, world) {
    const L = world.level;
    const cam = world.cam;
    const c0 = Math.max(0, Math.floor(cam.x / T));
    const c1 = Math.min(L.cols - 1, Math.floor((cam.x + W) / T));
    const r0 = Math.max(0, Math.floor(cam.y / T));
    const r1 = Math.min(L.rows - 1, Math.floor((cam.y + H) / T));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const ch = L.grid[r][c];
        const x = c * T - cam.x, y = r * T - cam.y;
        if (ch === '#') drawSolid(g, L, c, r, x, y);
        else if (ch === '-') drawGirder(g, x, y);
        else if (ch === 'k') {
          const on = world.checkpointCell && world.checkpointCell.c === c && world.checkpointCell.r === r;
          drawFlag(g, x, y, !!on, world.time);
        } else if (ch === 'x') drawExit(g, x, y, world.time);
      }
    }
  }

  function drawCoins(g, world) {
    for (let i = 0; i < world.coins.length; i++) {
      const co = world.coins[i];
      if (co.taken) continue;
      const x = Math.round(co.x - world.cam.x), y = Math.round(co.y - world.cam.y);
      if (x < -8 || x > W) continue;
      const w = 2 + Math.round(Math.abs(Math.sin(world.time * 3 + i)) * 4);
      const left = x + Math.round((8 - w) / 2);
      g.fillStyle = P.orange;
      g.fillRect(left - 1, y - 1, w + 2, 10);
      g.fillStyle = P.coin;
      g.fillRect(left, y, w, 8);
      if (w > 3) { g.fillStyle = P.white; g.fillRect(left + 1, y + 1, 1, 2); }
    }
  }

  function drawWalker(g, e, cam, t) {
    const x = Math.round(e.x - cam.x), y = Math.round(e.y - cam.y);
    if (!e.alive) {
      if (e.squash > 0) {
        g.fillStyle = P.neonP;
        g.fillRect(x, y + 9, 12, 3);
      }
      return;
    }
    g.fillStyle = P.neonP;
    g.fillRect(x + 1, y + 2, 10, 7);
    g.fillRect(x + 3, y, 6, 2);
    g.fillStyle = P.coin;
    const ex = e.dir > 0 ? x + 7 : x + 3;
    g.fillRect(ex, y + 4, 2, 2);
    const s = Math.floor(e.anim) % 2;
    g.fillStyle = P.gray;
    g.fillRect(x + (s ? 1 : 2), y + 9, 2, 3);
    g.fillRect(x + (s ? 9 : 8), y + 9, 2, 3);
  }

  function drawEnemies(g, world) {
    for (const e of world.enemies) {
      if (!e.alive && e.squash <= 0) continue;
      drawWalker(g, e, world.cam, world.time);
    }
  }

  // The player hitbox is 10x14 at (x, y). The sprite is drawn inside it and mirrored by facing.
  function drawPlayer(g, p, cam, t) {
    if (p.invuln > 0 && Math.floor(p.invuln / 4) % 2 === 0) return;
    const px = Math.round(p.x - cam.x), py = Math.round(p.y - cam.y);
    g.save();
    g.translate(px + 5, 0);
    g.scale(p.face >= 0 ? 1 : -1, 1);
    g.translate(-(px + 5), 0);
    g.fillStyle = P.orange;
    g.fillRect(px, py + 4, 2, 6);                   // courier bag on the back
    g.fillStyle = P.bodyL;
    g.fillRect(px + 2, py + 0, 6, 5);               // head
    g.fillRect(px + 2, py + 5, 6, 6);               // torso
    g.fillStyle = P.neonC;
    g.fillRect(px + 5, py + 2, 3, 1);               // visor
    g.fillStyle = P.bodyD;
    g.fillRect(px + 2, py + 10, 6, 1);              // belt
    const running = p.onGround && Math.abs(p.vx) > 20;
    const s = running ? Math.floor(p.anim) % 2 : 0;
    if (!p.onGround) {
      g.fillRect(px + 2, py + 11, 2, 3);
      g.fillRect(px + 6, py + 11, 2, 2);
    } else {
      g.fillRect(px + (s ? 2 : 3), py + 11, 2, 3);
      g.fillRect(px + (s ? 6 : 5), py + 11, 2, 3);
    }
    g.restore();
  }

  function drawParticles(g, world) {
    for (const q of world.particles) {
      g.fillStyle = q.color;
      g.fillRect(Math.round(q.x - world.cam.x), Math.round(q.y - world.cam.y), q.size, q.size);
    }
  }

  function drawHud(g, world) {
    g.font = '10px monospace';
    g.textBaseline = 'top';
    g.fillStyle = P.black;
    g.fillRect(4, 4, 92, 14);
    g.fillStyle = P.coin;
    g.fillText('COINS ' + world.coinsTaken + '/' + world.coins.length, 8, 7);
    if (world.cpFlash > 0) {
      g.fillStyle = P.neonC;
      const msg = 'CHECKPOINT';
      g.fillText(msg, Math.round((W - g.measureText(msg).width) / 2), 24);
    }
    g.globalAlpha = 0.7;
    g.fillStyle = P.gray;
    const label = 'build ' + (window.BUILD_VERSION || 'dev');
    g.fillText(label, W - Math.round(g.measureText(label).width) - 4, H - 11);
    g.globalAlpha = 1;
    if (window.Input && Input.padNotice() > 0) {
      const msg = 'CONTROLLER CONNECTED';
      g.fillStyle = P.neonC;
      g.fillText(msg, Math.round((W - g.measureText(msg).width) / 2), 24);
    }
    if (world.hintT > 0) {
      const msg = 'DRAG LEFT TO RUN  -  TAP RIGHT TO JUMP';
      const tw = Math.round(g.measureText(msg).width);
      const x = Math.round((W - tw) / 2);
      g.globalAlpha = Math.min(1, world.hintT / 60);
      g.fillStyle = P.black;
      g.fillRect(x - 6, H - 24, tw + 12, 16);
      g.fillStyle = P.white;
      g.fillText(msg, x, H - 20);
      g.globalAlpha = 1;
    }
  }

  function drawScanlines(g) {
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
  }

  // Draws one complete frame of the world into the logical 384x216 canvas g.
  function draw(g, world) {
    const cam = world.cam;
    g.imageSmoothingEnabled = false;
    drawSky(g);
    drawStars(g);
    drawSkyline(g, cam.x, 0.2, P.far, 1, false);
    drawSkyline(g, cam.x, 0.45, P.near, 9, true);
    drawRain(g, world.time);
    drawTiles(g, world);
    drawCoins(g, world);
    drawEnemies(g, world);
    drawPlayer(g, world.player, cam, world.time);
    drawParticles(g, world);
    drawHud(g, world);
    drawScanlines(g);
  }

  window.Render = { draw: draw, palette: P };
})();
