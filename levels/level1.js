// levels/level1.js — tilemap data for "Sector 1: Rust Alley".
// Each row is one tile row (16 px). Each `E` is 10 empty tiles, so columns are easy to count.
//
// Legend:
//   #  solid concrete (blocks from all sides)
//   -  one-way girder (stand on top, jump up through it)
//   $  coin
//   p  player start
//   k  checkpoint (saves progress when touched)
//   e  walker enemy (patrols, stomp it from above)
//   x  exit (level complete)
//   .  empty air
//
// Add a new level by pushing another {name, rows} object onto window.LEVELS.
(function () {
  'use strict';
  const E = '..........';          // 10 empty tiles
  const row = function () { return Array.prototype.join.call(arguments, ''); };
  const SOLID = '##########';
  const SOLID_PIT_A = '#...######';   // pit at columns 21-23
  const SOLID_PIT_B = '##...#####';   // pit at columns 52-54
  const SOLID_PIT_C = '...#######';   // pit at columns 80-82 (last 10 columns of the row)

  window.LEVELS = window.LEVELS || [];
  window.LEVELS.push({
    name: 'Sector 1: Rust Alley',
    rows: [
      // 0-5: open sky
      row(E, E, E, E, E, E, E, E, E, '......'),
      row(E, E, E, E, E, E, E, E, E, '......'),
      row(E, E, E, E, E, E, E, E, E, '......'),
      row(E, E, E, E, E, E, E, E, E, '......'),
      row(E, E, E, E, E, E, E, E, E, '......'),
      row(E, E, E, E, E, E, E, E, E, '......'),
      // 6: coins above the first girder
      row(E, E, E, E, E, E, E, E, E, '......'),
      // 7: first girder
      row(E, E, E, E, E, E, E, E, E, '......'),
      // 8: coins above the second girder
      row(E, '.....$$...', '.....$$$$.', E, E, '.......$$$', E, E, E, '......'),
      // 9: second and third girders
      row(E, '....----..', '.....----.', E, E, '.......---', '--........', E, E, '......'),
      // 10: coins on the ground, wall base
      row('......$$$.', E, E, '...##.....', '$$$.......', '$$........', '...$$$....', '.....##...', E, '......'),
      // 11: player start, walker, checkpoint, second walker, exit
      row('...p......', E, E, '...##.e...', '.....k....', E, '.......e..', '.....##...', '....$.....', '..x...'),
      // 12-13: ground with three pits
      row(SOLID, SOLID, SOLID_PIT_A, SOLID, SOLID, SOLID_PIT_B, SOLID, SOLID, SOLID_PIT_C, '######'),
      row(SOLID, SOLID, SOLID_PIT_A, SOLID, SOLID, SOLID_PIT_B, SOLID, SOLID, SOLID_PIT_C, '######'),
    ],
  });
})();
