# Neon Courier

A small 2D platformer: a robot courier crosses a ruined neon city. Plain HTML5 canvas and
vanilla JavaScript, no build step for the game, no art files, works offline after the first visit.

## Files

| Path | What it is |
|---|---|
| `index.html`, `css/style.css` | Page shell, canvas, touch ring, sound toggle, level-complete and rotate screens |
| `js/game.js` | Physics at a fixed 60 Hz, tile collision, enemies, checkpoints, camera, loop. **Tuning constants are at the top.** |
| `js/input.js` | One input layer for keyboard, gamepad and touch. The last source used wins. |
| `js/render.js` | All drawing in code, in one palette (`P`) |
| `js/audio.js` | Sound effects made with Web Audio. Mute state is saved. |
| `levels/level1.js` | Level data as ASCII tiles. Legend is at the top of the file. |
| `manifest.webmanifest`, `icons/` | Install metadata and 192/512 px icons |
| `sw.js` | **Generated** by `tools/build.js`. Caches every file. The cache name is a hash of the content. |
| `tools/build.js` | Regenerates `sw.js` (`npm run build`) |
| `tools/make-icons.js` | Regenerates the icons (`npm run icons`) |
| `tests/` | Playwright end-to-end tests (`npm test`) |

## Develop

```
npm install
npm run build        # regenerate sw.js after any change to the game files
npm test             # build + run all browser tests (headless Chromium)
```

## Add a level

Add a new `{ name, rows }` object to `window.LEVELS` in a new file under `levels/`, and load that file
before `js/game.js` in `index.html`. Rows use the legend in `levels/level1.js`.

<!-- docs-only filter test -->
