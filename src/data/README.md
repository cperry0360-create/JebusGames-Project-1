# /src/data

Every number that might need tuning lives here as JSON, never in a `.ts` file.

Code reads these files; code does not restate them. `src/types.ts` describes the
shape of each one — add a field there when you add one here.

| File | Contents |
|---|---|
| `display.json` | Canvas size, HUD bar height, background colour |
| `map.json` | Which painted plate to draw, the traced lane, the build spots, hero start |
| `rules.json` | Starting peanuts and lives, wave payout |
| `towers.json` | The six towers: cost, range, damage, fire rate, splash, slow, support |
| `enemies.json` | The three enemies: health, armour, speed, peanut reward, melee. Their on-screen size lives in `art.json` |
| `heroes.json` | Cory's stats and the whole Last Stand block |
| `waves.json` | Twelve waves: composition, spawn pacing, per-group delays |
| `abilities.json` | The six active abilities: cooldown, radius, damage, duration |
| `draft.json` | Draw weights, opening hand size, unlocked-type cap, unlock waves |
| `presentation.json` | Shadows, idle bob, recoil, muzzle, damage numbers, shake, health bars, facing dead zone |
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
- **The currency is peanuts.** Not gold. `rules.startingPeanuts`,
  `enemies.*.peanutReward`, `towers.*.cost`. A test fails if the word "gold"
  reappears anywhere in the shipped data.
- **`abilities.*.draftable` is what keeps Server Nuke out of the draft.** The
  flag sits on the ability rather than in a list of special ids somewhere else,
  so the draft pool is `filter(draftable)` and nothing has to remember.
- **`rules.serverNuke` holds the rare drop's whole rule set**: the per-kill
  chance, which enemy tiers can drop it, the share of max health a boss loses
  instead of dying, and the cast wind-up.
- **`enemies.politician.tax` is the whole boss mechanic.** Phases ordered
  healthiest first, each with the share of *current* peanuts he takes and how
  often; the first phase whose `aboveHealth` the boss is still above applies.
  `minimumTake` means a broke player still feels it. `blockable: false` keeps
  him walking through the line — held in place, he could be parked off-screen
  and ignored, which is the one thing the tax must not allow.
- **`enemies.*.tier` is `basic`, `elite` or `boss`.** It keys rules that care
  about importance rather than behaviour, which `role` already covers. Only
  elites and bosses can drop the nuke. There is no boss in Phase 1, so that
  branch is written and unreachable for now.
- **`abilities.scratchTicket` has a payout *range*, not a payout.**
  `payoutMin`/`payoutMax` are rolled when the card appears, and
  `autoRevealSeconds` is how long it waits before scratching itself. The
  ticket never pauses the wave, so that timer has to stay short.
- **`heroes.cory.lastStand` carries the whole vehicle form.** The multipliers
  for reach, hold and speed, the ramming damage and knockback, and the three
  timings of the transformation. Nothing about DAD MODE is in code.
- **`draft.unlockedTypeCap` is a cap on tower *types*, not on towers.** It is
  how many different towers the build menu ever offers. How many towers can
  stand on the map is `map.json.buildSpots.length` — seven. The field used to
  be called `towerCap`, which read like a placement limit and was taken for one.
- **`display.hudHeight` is shared, not just the HUD's own business.** There is
  no HUD bar any more — three counter plates sit in the top-left corner and the
  map runs to the full canvas — but the world still draws underneath them, so
  `tools/trace_map.py` uses this to keep build pads low enough that a tower on
  one is not decapitated, and a test enforces it.
- **`art.render.hud-*` carries each counter plate's empty field**, as
  `fieldLeft`/`fieldRight`/`fieldCentreY` fractions measured off the artwork.
  The HUD places its number from those rather than from a constant, so a
  redrawn plate with its icon somewhere else needs no code change.
- **`presentation.hud` is the counter layout**: plate height, the gap between
  them, the corner margins and the number's size and inset.
- **`presentation.muzzle` puts a shot at the top of a tower.** The towers are
  painted buildings: they do not rotate to aim (doing that laid them on their
  sides), so the muzzle flash and the recoil are the only aim cues there are.
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

| | canvas | content | base row | displayHeight | shadowWidth |
|---|---|---|---|---|---|
| Withholding Tower | 415x512 | 415x512 | 415px @ row 444 | 114.6 | 92.9 |
| Write-Off | 616x512 | 464x506 | 464px @ row 382 | 114.6 | 103.8 |
| Rounding Error | 336x512 | 201x512 | 201px @ row 433 | 114.6 | 45.0 |
| Escalation Clause | 462x512 | 461x510 | 454px @ row 397 | 114.6 | 101.6 |
| Filing Extension | 389x512 | 389x512 | 389px @ row 362 | 114.6 | 87.0 |
| Tax Shelter | 429x512 | 429x512 | 429px @ row 356 | 114.6 | 96.0 |

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
scale in a 512-tall frame, so `displayHeight` is the same for every one.
Normalising each tower's base to a common width instead would have stretched
the thin obelisk against the others, undoing the artist's proportions.

The scale is set from the set's *median* base, so one unusually wide or narrow
tower cannot drag the rest. The target is 1.2x the painted road's width —
`map.json.roadWidth`, measured by the tracer — which is 73px. A test checks the
median base against the road rather than against a remembered number, so a new
map with a wider road resizes the towers with it.

### How the enemy values were measured

The three painted enemies are in `public/assets/enemies/`. `tools/measure_art.py`
reproduces their `render` values too.

| | canvas | feet | on screen | anchorX | shadowWidth |
|---|---|---|---|---|---|
| Final Notice (brute) | 428x512 | x14-349 | 55.2x66.0 | 0.4241 | 43.3 |
| Late Filer (soldier) | 366x339 | x38-231 | 47.2x43.7 | 0.3675 | 25.0 |
| Shredder (scout) | 271x273 | x22-172 | 34.9x35.2 | 0.3579 | 19.5 |

All three are fully trimmed, so `anchorY` is exactly 1: the bottom of the canvas
is the ground line. Three things are different from the towers:

**The base is the feet, not the widest row.** The towers are buildings, so the
widest row near the bottom is the base ellipse. These are characters holding
things. The brute's leaf blower is the widest thing in his bottom third and
runs to 95% of his width, so the tower heuristic would have given him a shadow
wide enough to cover the barrel — at an `anchorX` of 0.499, which looks
perfectly reasonable and is wrong. The measurement instead takes the *ground
silhouette*: the lowest opaque pixel in each column, cut below whatever the
character is carrying, which leaves exactly two groups per sprite — two feet.

**The cut cannot be one number.** The brute's blower hangs to within 10% of his
ground line while the scout's trailing skate is 13% above hers, so any single
depth would either swallow the blower or lose a foot. The cut is per sprite,
listed in `measure_art.py`, and the script prints the foot groups it found so
the choice stays checkable.

**The anchor is nowhere near centre, and that is correct.** A character with a
prop out to one side has feet well off the frame's middle: 0.358 for the scout.
So the art's origin stays at the frame's *horizontal centre* and the sprite is
offset instead — see `applyGroundRender` in `src/systems/Art.ts`. That keeps a
horizontal flip a plain mirror about the character rather than about its feet,
which would make a unit jump sideways every time it turned around.

**The scale is uniform, as with the towers.** The three arrived already sized
against each other with the brute tallest at 512px, so one scale factor
(0.1289) preserves that. Normalising them to a common height would make a
roller-skating goblin the same size as an armoured brute.

- **`presentation.healthBar` sizes a bar from its sprite.** Width is
  `widthFactor` of the sprite's on-screen width, clamped, so the three enemies
  get visibly different bars; the bar floats `gapAbovePx` above the art's own
  top edge, so taller art carries its bar higher without a per-enemy number.
- **`presentation.facing.deadZone` stops units spinning on corners.** On a
  near-vertical stretch of lane the heading's sideways component is noise, so
  below this threshold the current facing is kept. This map's steepest leg
  drifts 3px west over 92px; `tests/logic.test.ts` checks the dead zone covers
  it.

### How the hero values were measured

`tools/measure_art.py` measures Cory the same way it measures the enemies, and
his two forms need different rules.

| | canvas | stands on | shadow | on screen |
|---|---|---|---|---|
| Cory on foot | 449x470 | x134-408 (both shoes) | same | 57.9x60.6 |
| Cory in the SUV | 900x588 | x216-752 (the wheels) | the whole body | 127.3x83.2 |

**He is drawn at the enemy scale, not his own.** The art arrived sized against
the enemies, so he reuses their factor. Giving him a separate one would let the
two drift apart the next time either changed.

**The SUV is sized by width, not height.** 2.2x his on-screen width. Matched to
his height instead it would be a toy; the whole point is that it is wider than
the 61px road and does not fit in the lane.

**A vehicle's shadow is not its wheelbase.** Measured from the wheels, the
shadow was invisible: unlike a pair of legs, the body overhangs the contact
patches and covers it completely. It spans the whole artwork instead, which is
both what a car actually shadows and the only version you can see. The anchor
still comes from the wheels, so he sits on the road rather than floating.

**Both hero sprites face LEFT**, the opposite of the enemy art. `Facing.ts` is
asked about the reversed heading rather than being given a second rule.

- **`art.json` is the only place a sprite is named.** Code asks for a *role*
  (`ART.fx.blast`, `ART.map.level1`, `ART.ui.towerBase`) and
  `src/systems/Art.ts` resolves it. No `.ts` file may
  contain a sprite key or a filename; `tests/manifest.test.ts` fails if one
  does, naming the file. Swapping art packs is an edit to this file alone.
- **`art.json` filenames are real files** under `public/assets/`. A test
  asserts every key resolves and that nothing references a sprite that is not
  in the manifest.
