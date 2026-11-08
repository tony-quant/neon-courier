# Neon Courier: sectors 4 to 20 brief

Written before any sector 4 to 20 is built. Each sector adds one new idea to the ones before it, and combines
earlier ideas from sector 9 on.

## Ideas, in order of difficulty

| Sector | New idea | Measures to add (walkers, pits, tight landings, length in tiles) |
|---|---|---|
| 4 | Long horizontal runs (12-tile floor runs with walkers on them) | 4, 6, 4, 72 |
| 5 | Twin pits: pairs of pits with one or two tiles of ground between (tight landings) | 5, 7, 6, 80 |
| 6 | Stair climb: several 3-tile girder steps in a row | 5, 7, 6, 88 |
| 7 | Walkers on girder platforms above the pits | 7, 8, 6, 96 |
| 8 | Vertical shafts: a 5-tile pit with a 3-tile girder mid-platform to climb out | 7, 9, 7, 104 |
| 9 | Two routes: a low floor route with pits, a high girder route; coins only on the high route | 8, 10, 7, 112 |
| 10 | Floorless platforms: girders over pits with no floor under them | 8, 11, 8, 120 |
| 11 | Combinations: stairs and walkers on girders | 9, 12, 8, 128 |
| 12 | Pit gauntlet: pits of 2 and 3 tiles with one tile of ground between | 10, 14, 10, 136 |
| 13 | Combinations: shafts and twin pits | 10, 15, 11, 144 |
| 14 | Combinations: floorless platforms and two routes | 11, 16, 11, 152 |
| 15 | Walker corridors: long runs with walkers in pairs | 12, 17, 12, 160 |
| 16 | Combinations: gauntlet and shafts | 12, 18, 13, 168 |
| 17 | Combinations: stairs, floorless platforms and walkers on girders | 13, 19, 14, 176 |
| 18 | Combinations: all earlier ideas, longer | 14, 20, 15, 184 |
| 19 | Forced climb with coins on the top route only (the coin rule applies) | 14, 21, 16, 192 |
| 20 | Finale: all ideas, in long runs | 15, 22, 17, 200 |

Numbers are the minimum for that sector. Each sector must be at least as large as the one before on every one of
the four, and add at least one strictly.

## Rules for every new sector (4 to 20)

- Gap and step (the largest air gap and the largest climb) are at most 3 tiles. This keeps every jump inside the
  5 percent margin rule with the standing jump (57.75 px) and the running jump (75.25 px).
- No sector repeats an earlier sector's obstacle sequence exactly (enforced by `tests/levelrules.test.js`).
- A wall that forces a climb is 3 tiles tall or taller.
- Every coin, checkpoint and exit passes the existing reachability check.
- A sector that claims a forced climb (header: `forced climb`, and `climb: true` in its level entry) must pass the
  coin rule: with the girders removed, no coin and no exit is reachable. Coins sit at least 3 tiles above a girder
  top so that the ground cannot reach them.
- Walkers stand on floor or girders and turn at ledges, as the existing walkers do.
- Each sector file's header names the sector and its idea.

## Not built, and why

- **Moving platforms and timed routes.** Level data is static, and the reachability check and the physics module do
  not model motion. Adding them would change the game's physics, so they are left out of this brief.
- **Enemies patrolling in two directions.** Walkers already turn at walls and ledges, so this is not a new idea.
  Walkers on girders (sector 7) cover the new part.

## Known limit

A standing jump clears a wall of up to 3.6 tiles, so a 3-tile forced-climb wall can be stood on from the ground.
The coin rule still holds, because the coins are on the girders. Forced-climb walls in sectors 4 to 20 are 3 tiles
tall, as the rule requires, and that limit applies to them.
