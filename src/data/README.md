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
| `abilities.json` | The six active abilities: cooldown, radius, damage, duration |
| `draft.json` | Draw weights, opening hand size, tower cap, unlock waves |
| `presentation.json` | Shadows, idle bob, recoil, damage numbers, shake, scatter |
| `art.json` | **Every sprite in the game.** Files, ground variants, autotile roles, UI, effects, scenery |

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
- **`draft.damageArchetypes` / `answerArchetypes` drive the opening-hand rule.**
  DESIGN.md requires the opening two to cover a damage option and an AOE or
  control option. With a two-card hand that means a support tower can never
  open a run, only arrive as a later unlock — a consequence of the rule, not a
  bug. `tests/draft.test.ts` checks 3000 seeds.
- **`draft.unlockAfterWave` is `[4, 8]`** and both must land before the last
  wave or the unlock never happens; a test enforces that.
- **`presentation.decoration.minDistanceFromRoad` protects the plots that
  matter.** Scattered scenery blocks the tile it lands on, so it is kept away
  from the lane; every plot able to cover the road survives at any density.
## Swapping art

`art.json` is built so new art is a change to this file alone. Two fields carry
the work:

- **`files`** maps a key to a path under `assetRoot`, so a second art directory
  is just a different prefix — `"towers/tower_withholding.png"` sits beside
  `"kenney/towerDefense_tile203.png"` with no code change.
- **`render`** gives a key its anchor, on-screen height and shadow width, so art
  authored at 512px lands beside art authored at 64px. `anchorY: 1` puts the
  art's bottom edge on the tile's ground line, which is what stops a tall sprite
  floating. A test fails if anything taller than a tile is not base-anchored.

### How the tower values were measured

The six painted towers are in `public/assets/towers/`. Their `render` values are
measured from the art, not guessed. `tools/measure_art.py` reproduces them.

| | canvas | artwork | base ellipse | shadowWidth |
|---|---|---|---|---|
| Withholding Tower | 415x512 | 415x512 | 415px @ row 444 | 59.0 |
| Write-Off | 616x512 | 464x506 | 464px @ row 382 | 66.0 |
| Rounding Error | 336x512 | 201x512 | 201px @ row 433 | 28.6 |
| Escalation Clause | 462x512 | 454x510 | 454px @ row 397 | 64.6 |
| Filing Extension | 389x512 | 389x512 | 389px @ row 362 | 55.3 |
| Tax Shelter | 429x512 | 429x512 | 429px @ row 356 | 61.0 |

Three things the measurements settled:

**Half of them are not trimmed.** Rounding Error has 135px of transparent
padding across its width; Write-Off has 152px and 6 rows below the art. Anchors
are therefore computed from the *artwork's* bounds, not the canvas: `anchorY` is
`(contentBottom + 1) / canvasHeight`, which is 0.9902 for Write-Off rather than
1.0. Anchoring those at a flat 1.0 would float them by the padding.

**The bottom row is not the base.** Each tower is a 3/4 view, so its stone base
is an ellipse: the artwork widens to a maximum around 76-88% down and then
narrows to the ellipse's front edge. `shadowWidth` is the widest row in the
bottom third — the ellipse's true width — not the width at the bottom.

**The scale is uniform, not per-sprite.** All six are drawn at one consistent
scale in a 512-tall frame, so `displayHeight` is 72.8 for every one. Normalising
each tower's base to the same width instead would have stretched the thin
obelisk to 120px against the others' 66-79px, undoing the artist's proportions.
72.8 puts the widest base (Write-Off) at 66px against a 64px tile — a slight
overlap that reads as presence rather than crowding.

- **`art.json` is the only place a sprite is named.** Code asks for a *role*
  (`ART.fx.blast`, `ART.ui.towerBase`, a weighted `ART.ground.grass` variant,
  an autotile role) and `src/systems/Art.ts` resolves it. No `.ts` file may
  contain a sprite key or a filename; `tests/manifest.test.ts` fails if one
  does, naming the file. Swapping art packs is an edit to this file alone.
- **`art.json` filenames are real files** in `public/assets/kenney`. A test
  asserts every key resolves and that nothing references a sprite that is not
  in the manifest.
