# /src/data

Every number that might need tuning lives here as JSON, never in a `.ts` file.

Code reads these files; code does not restate them. `src/types.ts` describes the
shape of each one — add a field there when you add one here.

| File | Contents |
|---|---|
| `display.json` | Canvas size, grid tile size, background colour |
| `map.json` | Grid size and origin, lane waypoints, hero start, scenery |
| `rules.json` | Starting gold and lives, wave payout |
| `towers.json` | The six towers: cost, range, damage, fire rate, splash, slow, support |
| `enemies.json` | The three enemies: health, armour, speed, reward, melee |
| `heroes.json` | Cory's stats and the whole Last Stand block |
| `waves.json` | Eight waves: composition, spawn pacing, per-group delays |
| `art.json` | Logical sprite key to real Kenney filename |

## Notes on specific numbers

- **`heroes.cory.lastStand.healthThreshold` is `0.25`.** DESIGN.md fixes the
  Last Stand trigger at 25% for every hero. `tests/rules.test.ts` asserts it.
- **`towers.*.buildTime` is `0`.** Tier 1 places instantly by design. The field
  exists so tiers 2 and 3 have somewhere to live when upgrades arrive.
- **`towers.*.supportRadius` non-zero marks a support tower.** It never fires;
  it adds `supportDamageBonus` to every tower in radius. Bonuses stack.
- **`enemies.*.armor` is flat damage reduction**, floored at 1 damage per hit so
  nothing is ever fully immune. `ignoresArmor` on a tower bypasses it entirely.
- **`map.json.waypoints` are tile-lattice coordinates, not tile centres.** The
  road is two tiles wide and its centreline runs along the boundary between two
  rows or columns. Segments must stay axis-aligned, and the lane must never
  narrow to one tile — the Kenney pack has no grass-on-both-sides tile, and
  `tests/logic.test.ts` fails if the lane pinches.
- **`art.json` filenames are real files** in `public/assets/kenney`. A test
  asserts every key resolves and that nothing references a sprite that is not
  in the manifest.
