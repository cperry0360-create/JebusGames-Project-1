# /src/data

Every number that might need tuning lives here as JSON, never in a `.ts` file.

Code reads these files; code does not restate them. `src/types.ts` describes the
shape of each one — add a field there when you add one here.

| File | Contents |
|---|---|
| `display.json` | Canvas size, background colour |
| `map.json` | Which painted plate to draw, the traced lane, the build spots, hero start |
| `rules.json` | Starting gold and lives, wave payout |
| `towers.json` | The six towers: cost, range, damage, fire rate, splash, slow, support |
| `enemies.json` | The three enemies: health, armour, speed, reward, melee |
| `heroes.json` | Cory's stats and the whole Last Stand block |
| `waves.json` | Twelve waves: composition, spawn pacing, per-group delays |
| `abilities.json` | The six active abilities: cooldown, radius, damage, duration |
| `draft.json` | Draw weights, opening hand size, tower cap, unlock waves |
| `presentation.json` | Shadows, idle bob, recoil, damage numbers, shake |
| `art.json` | **Every sprite in the game.** Files, map plates, UI, effects, scenery, brand marks |
| `branding.json` | Splash timing, corner-mark size and placement, credits layout |
| `credits.json` | Every line of credit copy, so adding a name never touches code |

## Notes on specific numbers

- **`heroes.cory.lastStand.healthThreshold` is `0.25`.** DESIGN.md fixes the
  Last Stand trigger at 25% for every hero. `tests/rules.test.ts` asserts it.
- **`towers.*.buildTime` is `0`.** Tier 1 places instantly by design. The field
  exists so tiers 2 and 3 have somewhere to live when upgrades arrive.
- **`towers.*.supportRadius` non-zero marks a support tower.** It never fires;
  it adds `supportDamageBonus` to every tower in radius. Bonuses stack.
- **`enemies.*.armor` is flat damage reduction**, floored at 1 damage per hit so
  nothing is ever fully immune. `ignoresArmor` on a tower bypasses it entirely.
- **`map.json.waypoints` and `buildSpots` are canvas pixels.** The plate is
  16:9 and scaled to fill the canvas, so canvas pixels are the map's own
  coordinate space and there is no tile conversion anywhere. Both lists were
  traced out of the painted artwork by `tools/trace_map.py`; re-run it when the
  art changes rather than nudging numbers by hand. The first and last waypoints
  sit off-screen so enemies walk in through the arch and out through the gate.
- **`map.json.spotRadius` is the click target and the highlight, in one.** A
  spot is a circle, not a tile. `tests/logic.test.ts` fails if two spots are
  closer than twice this — overlapping highlights would make a click ambiguous
  — or if any spot sits within `spotRadius + 20` of the lane, which would put a
  tower in the road.
- **`draft.damageArchetypes` / `answerArchetypes` drive the opening-hand rule.**
  DESIGN.md requires the opening two to cover a damage option and an AOE or
  control option. With a two-card hand that means a support tower can never
  open a run, only arrive as a later unlock — a consequence of the rule, not a
  bug. `tests/draft.test.ts` checks 3000 seeds.
- **`draft.unlockAfterWave` is `[4, 8]`** and both must land before the last
  wave or the unlock never happens; a test enforces that.

## Swapping art

`art.json` is built so new art is a change to this file alone. Two fields carry
the work:

- **`files`** maps a key to a path under `assetRoot`, so a second art directory
  is just a different prefix — `"towers/tower_withholding.png"` sits beside
  `"kenney/towerDefense_tile203.png"` with no code change.
- **`render`** gives a key its anchor, on-screen height and shadow width, so art
  authored at 512px lands beside art authored at 64px. `anchorY: 1` puts the
  art's bottom edge on its build spot's ground line, which is what stops a tall
  sprite floating. A test fails if tall art is not base-anchored.

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
72.8 puts the widest base (Write-Off) at 66px, just under the 68px build-spot
circle — it fills its spot without spilling onto its neighbours.

- **`art.json` is the only place a sprite is named.** Code asks for a *role*
  (`ART.fx.blast`, `ART.map.level1`, `ART.ui.towerBase`) and
  `src/systems/Art.ts` resolves it. No `.ts` file may
  contain a sprite key or a filename; `tests/manifest.test.ts` fails if one
  does, naming the file. Swapping art packs is an edit to this file alone.
- **`art.json` filenames are real files** under `public/assets/`. A test
  asserts every key resolves and that nothing references a sprite that is not
  in the manifest.
