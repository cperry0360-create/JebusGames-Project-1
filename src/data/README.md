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

### The pending tower swap

The six painted towers are not in the repo yet. Once
`public/assets/towers/tower_*.png` are committed, this is the whole change:

```jsonc
"files": {
  "turret-ledger":     "towers/tower_withholding.png",   // Withholding Tower
  "turret-writeoff":   "towers/tower_writeoff.png",      // Write-Off
  "turret-rounding":   "towers/tower_rounding.png",      // Rounding Error
  "turret-escalation": "towers/tower_escalation.png",    // Escalation Clause
  "turret-extension":  "towers/tower_filing.png",        // Filing Extension
  "turret-shelter":    "towers/tower_tax.png"            // Tax Shelter
},
"render": {
  "turret-ledger":     { "anchorY": 1, "displayHeight": 92, "shadowWidth": 46 },
  "turret-writeoff":   { "anchorY": 1, "displayHeight": 92, "shadowWidth": 46 },
  "turret-rounding":   { "anchorY": 1, "displayHeight": 92, "shadowWidth": 46 },
  "turret-escalation": { "anchorY": 1, "displayHeight": 96, "shadowWidth": 50 },
  "turret-extension":  { "anchorY": 1, "displayHeight": 92, "shadowWidth": 46 },
  "turret-shelter":    { "anchorY": 1, "displayHeight": 92, "shadowWidth": 46 }
},
"ui": { "towerBase": null }
```

`displayHeight` around 92 on a 64px tile gives a tower roughly 1.4 tiles tall —
present without swamping its neighbours. Tune per sprite once they can be seen;
the widths are guesses until someone looks at the art. Setting `towerBase` to
`null` drops the Kenney plate, since the painted towers carry their own base.

- **`art.json` is the only place a sprite is named.** Code asks for a *role*
  (`ART.fx.blast`, `ART.ui.towerBase`, a weighted `ART.ground.grass` variant,
  an autotile role) and `src/systems/Art.ts` resolves it. No `.ts` file may
  contain a sprite key or a filename; `tests/manifest.test.ts` fails if one
  does, naming the file. Swapping art packs is an edit to this file alone.
- **`art.json` filenames are real files** in `public/assets/kenney`. A test
  asserts every key resolves and that nothing references a sprite that is not
  in the manifest.
