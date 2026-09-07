# Courjahan Defense — the Level 5, 6 and 8 drops

One session, four briefs, one branch. This is the summary; each level has its
own full report and they are linked from their sections. Everything below is on
`claude/courjahan-defense-level-5-pto190` and **none of it is on `main`**.

## What landed, in one line each

| brief | outcome | state |
|---|---|---|
| **Level 5 — The Crossroads** | Built, tuned, soaked to 40% at 480 seeds | **Complete** |
| **Level 6 — the grey level** | Roster, flame, waves, tests; plate proved impossible as one texture | **Half done — blocked on art** |
| **Soak hero contamination** | Measured; the published numbers were never contaminated | **Complete** |
| **Level 8 — geometry** | Traced, cross-checked, 19 pads | **Complete** |
| **Level 8 — build** | Not started | **Blocked** — its gate is Level 5 on `main` |

## Commits

All sixteen, oldest first. Every run is `success` on both jobs (`npm test`,
`npx tsc --noEmit`).

| commit | what | CI |
|---|---|---|
| `ec70fe2` | Let a lane split, so a crossroads can have two exits | green, run 187 |
| `0713211` | Level 5's five new rules, scoped away from levels 1–4 | green, run 187 |
| `c3eb5b6` | Merge `origin/main` (level 6 art upload) | green, run 187 |
| `9fdb75e` | Build level 5: the crossroads, its cast, its night, its boss | green, run 187 |
| `e5703b3` | Teach the soak level 5, tune it to 40% at 480 seeds | green, run 189 |
| `b217803` | Level 6's roster, its flame, and the gate that stops it shipping untuned | green, run 190 |
| `a6a0a8f` | Write up level 5 and level 6's first pass | green, run 193 |
| `5c83e70` | Merge `origin/main` (level 8 art upload) | green, run 194 |
| `62b2965` | Fill in both reports' own CI rows | cancelled (superseded) |
| `f7a3ad9` | Name the commit `main` is actually on | green, run 196 |
| `526bcef` | Measure the hero question rather than assume it | green, run 199 |
| `5017963` | Merge `origin/main` | green, run 199 |
| `3ab4ba6` | Derive level 8's map geometry off the plate | green, run 200 |
| `eb2050a` | Write up the level 8 geometry pass | green, run 201 |
| `a14b2fa` | Fill in the level 8 report's own CI row | green, run 202 |

---

# Level 5 — The Crossroads

Full report: [`reports/2026-09-07-level-5.md`](2026-09-07-level-5.md)

## The engine change it needed

**Multiple spawns already worked** — levels 3 and 4 have two gates each.
**Multiple exits did not, and neither did a split.** Four things changed in
`src/systems/Lanes.ts` and `Gateway.ts`:

- `LaneDef.merge` became a list. One entry is the merge it always was; several
  are a split. Levels 3 and 4 need no edit, down to the JSON.
- The arm a walker takes is chosen once from a number it carries (`routePick`,
  rolled at spawn from its **own** RNG stream) rather than per frame — so an
  enemy on a junction cannot flicker, one long frame lands where ten short ones
  would, and the soak and the scene agree. `pickAt` mixes the junction's id in
  so a route with two splits does not send everything the same way at both.
- `validateLanes`' "exactly one terminal" rule was replaced by a narrower one
  that still catches the typo it was written for: *a lane that reaches an exit
  and that nothing feeds is a route with no gate.*
- Gate distances became per-lane. With two exits at different distances,
  everything on the longer arm would otherwise have leaked while still visible.

The leak system and the soak's pathing model both needed nothing.

## The plate was not the shape the brief described

The brief said two spawns and two exits. The plate is **three gates and one
exit** — west, north and south feeding an east arm. Read off the mask edges and
confirmed by cropping the right arm at full resolution. Built as the plate is
painted, not as the brief described it.

## The board

| | |
|---|---|
| road width | **62** (narrowest arm's median, junction excluded) |
| routes | west 1436.4, south 1217.3, north 1170.1 — a 22.7% spread |
| arrival | equalised in the wave table, not the geometry |
| pads | **14** |
| coverage | **85.4%** of the whole route |
| closest pair | 68.15 px (floor 68) — tightest of the five levels |

Two placer bugs were found **by looking at the overlay picture, not the
numbers**: the night field was misclassified (the graveyard is `b > g > r`, not
`r >= g`) so all fourteen pads landed on the meadow; and the candidate sort ran
backwards, putting every pad against the outer edges of the plate.

## The cast

| id | name | hp | armor | speed | lives |
|---|---|---|---|---|---|
| `thrall` | Thrall | 70 | 0 | 46 | 1 |
| `glider` | Glider | 150 | 2 | 74 | 1 |
| `babyFrank` | Baby Frank | 34 | 0 | **172** | 1 |
| `vampireElite` | Vampire Elite | 540 | 11 | 30 | 3 |
| `vampireLord` | Vampire Lord | 1200 | 6 | 34 | 4 |
| `batula` | **Batula** | **4500** | 8 | 22 | 15 |

## Five systems, all scoped off by data

`DayNight.ts`, `Vampirism.ts`, `AcidPuddle.ts`, `NightRules.ts` and the bleed
rules. A level names its own rules file on its `levels.json` row;
`Levels.levelRules()` returns null for a level that names none; every system is
a no-op on null. Levels 1–4 name none. That is a property of the data, not a
claim about where an `if` was written.

Design decisions worth remembering:

- **The dusk flip is timed in seconds from wave 5's first spawn**, not as a
  fraction of the wave. A wave has no length until it is over, so a fraction
  would fire at a different moment every run and the soak could not reproduce
  it. Speed and sun damage blend across the 2.5 s fade; lifesteal does not,
  because half a lifesteal is not a thing.
- **Bleed cuts on `single-target` and `control` only** — aimed fire and thorns.
  `aoe` is excluded because a blast crushes rather than cuts. That makes bleed a
  property of sustained aimed fire, which is the counterplay the level is built
  on.
- **Bleed is flat and small** — 1.5/stack/second, not a share of max health. Its
  job is to switch lifesteal off, not to be a damage source. Had it been a
  percentage, the boss sensitivity table would have come back flat.
- **Batula is the first boss the line can hold**, and that is the trap: he heals
  for all of the 55 he hits for, so the line that stops him is the line feeding
  him. Made unholdable, his lifesteal — the whole level — would never come up.
- **The acid clock runs on movement**, so a held Batula is not quietly building
  a puddle to drop the instant he is free. Slowing him is therefore a real
  reward rather than an exploit.

## The soak

**Batula shipped at 4500 HP.** The sensitivity table (120 seeds, one variable at
a time, `enemies.json` restored between rows) was steep and monotonic, and the
losses on every wave *before* the boss were identical across all seven rows —
which is the one-variable property showing rather than being claimed.

```
level5 [normal]: 194/480 wins (40%)      target band 35–45%
lost after wave: w5×6 w6×5 w7×37 w8×15 w9×22 w10×40 w11×161
average lives left on a win: 13.5
```

**56.3% of all losses are on wave 12, the boss.** The dusk flip takes 6 runs in
480 — 1.3%.

**It was not that way an hour earlier, and that is the finding.** Waves 10 and
11 were originally heavier than the boss wave and took most of the losses, with
**zero** at wave 12 at any Batula health from 4200 to 16000. Flattening 10 and
11 is what made the table mean anything.

**Levels 1–4 are bit-identical** at 480 seeds, win rate and loss distribution
both, before and after — and again after Level 6's roster landed.

## Open on Level 5

**The Spike Strip / Glider question, reported and deliberately not decided.**
The Spike Strip is a ground effect and the Glider hovers, so a night that
converts every Thrall into a Glider also switches a tower off. Three readings
are defensible and it is a design call, not a bug.

---

# Level 6 — the grey level

Full report:
[`reports/2026-09-07-level-6-roster-and-plate-spec.md`](2026-09-07-level-6-roster-and-plate-spec.md)

## The finding that mattered: a single-plate Level 6 is impossible

Measured with a WebGL upload probe under the harness's own renderer flags:

| width | at height 1080 | at height 316 |
|---|---|---|
| 8192 | ok | ok |
| **10240** | **fails** | **fails** |

**10240×316 fails exactly as 10240×1080 does.** `MAX_TEXTURE_SIZE` is a
**per-dimension cap, not an area cap** — a very long, very short plate gets no
relief from being short.

Level 6's world is 2970 × 720. At the 2–3× resolution every other plate ships
at, that is 5,940–8,910 px wide: over the 4096 mobile floor by 1.5–2.2×, and at
the top end over 8192 too. **Level 6 must be tiled — four segments at
2048 × 2048.** The re-render specification and the per-segment prompt are in the
full report; Cory can render against it now.

## What shipped

- **Four enemies** — Scrapper, Sprinter, Bruiser, and the Rooster.
- **The Rooster's flame** (`src/systems/Flame.ts`), reusing the Glitch Bug's
  telegraph mechanism. Anisotropy **2.41 : 1**, against the Mind Laser's fixed
  2.8 and its broken 8.25. `tests/level6.test.ts` holds it under 3.0.
- **13 waves**, every step upward and inside the 55% cap, both lanes live
  throughout.
- **The boss HP is deliberately unset** (`rooster.maxHealth: null`) with two
  tests gating it — one that fails if any registered level spawns an enemy with
  non-numeric health *and asserts the Rooster is null right now*, so it is not
  passing vacuously; and one that closes the unregistered-wave-table loophole
  the first one opens. **The exemption closes itself the moment somebody fills
  the number in.**

## Three deviations from the brief, all stated

1. **`bruiser6`, not `bruiser`** — level 1's `lateFiler` is already called
   Bruiser on screen and renaming it would rename an enemy players have met.
2. **The Bruiser swings every 1.85 s, not 1.5 s.** At 1.5 s, three of them kill
   Cory in 8.2 seconds and `armor.test.ts`'s ten-second floor fails. Damage per
   swing is untouched; it was the *rate* that broke the floor.
3. **The Bruiser is drawn at 85, not ~92** — every tower is 87.1 px tall and a
   92 px Bruiser would be the only ordinary enemy taller than every building.

## And one conflict, recorded rather than resolved

**The brief asks for the Sprinter at 150 to be the fastest unit in the game. It
is second.** Baby Frank shipped at 172 about an hour earlier, explicitly to beat
Tiny Glitch's 140 — the two briefs are in conflict and neither could have known.
**Neither number was changed.** A test asserts the *fact*, so whichever way it
is resolved the test has to be edited deliberately.

## Two things the map pass has to fix, both already known

1. **The topology does not validate yet.** `validateLanes`' new rule was written
   for Level 5 to catch a forgotten merge, which is exactly what a second
   independent route looks like from outside. The fix is one more property — a
   lane with no continuation is legal if a spawn group names it — not a
   relaxation. Left undone because a validator change with no map to validate is
   a change nothing can be run against.
2. **The economy falls through its floor when the boss HP lands.** The run pays
   0.147 peanuts per point of rank-and-file health against a 0.13 floor; at a
   6,000 HP Rooster it falls to 0.124 and `content.test.ts` fails. Fewer boss
   hit points or a larger purse — decided the moment the HP is picked.

---

# The soak hero question

Full report:
[`reports/2026-09-07-one-transformation-and-courtlands-three.md`](2026-09-07-one-transformation-and-courtlands-three.md)

The note asked whether the soak's hero rotation had contaminated Level 5's
tuning, since `run.ts` plays Courtland roughly one seed in seven and his
abilities are deliberately overtuned.

**It had not.** `tools/soak/level.ts` — which produced every number in the Level
5 report **and** every published figure in `SOAK-REPORT.md` — calls `simulate`
with `heroFor` undefined and `Sim.ts` resolves `DEFAULT_HERO_ID` there. Measured
over 60 seeds of level 4: `{"cory": 60}` against the rotation's `{"cory": 26,
"courtland": 9, …}`. **Courtland played nothing.**

The published table *had* moved, by +6 to +33 runs in 120, and that was worth
finding on its own. Bisected: the mover is `0c4c274`, and it is the
**transformation** half of that commit rather than the Courtland half — "one
transformation at half health" applies to whichever hero plays, which is always
Cory. Level 2 carries a further +17 from its own Devil nerf at `862ecf7`. Both
are deliberate, documented gameplay changes, and nothing moved after `0c4c274`.

`tools/soak/heroes.ts` is the instrument, kept because the question will come up
again. What it shows is that **Courtland's overtuning is level-specific, not
general**:

| level | Cory-pinned | rotated | Courtland's own seeds |
|---|---|---|---|
| level1 | 420/480 (88%) | 339/480 (71%) | 44/69 (64%) |
| level2 | 235/480 (49%) | 166/480 (35%) | 20/69 (29%) |
| level3 | 413/480 (86%) | 309/480 (64%) | 58/69 (84%) |
| level4 | 285/480 (59%) | 273/480 (57%) | 60/69 (87%) |
| level5 | 194/480 (40%) | 161/480 (34%) | 33/69 (48%) |

He is +28 points over Cory on level 4 and +8 on level 5, but **24 worse on level
1 and 20 worse on level 2**. The rotation's overall deficit is mostly Han, Eli
and Bailey. **Courtland's values are untouched, as asked.**

---

# Level 8 — The Optimization (geometry only)

Full report:
[`reports/2026-09-07-level-8-geometry.md`](2026-09-07-level-8-geometry.md)

Geometry and a report only, as briefed. No level, no enemies, no wave table.

## What the plate says

| | traced | brief | |
|---|---|---|---|
| road openings | 3 | 3 | ✓ |
| west centre | y 116 = **16.0%** of height | 16% | ✓ |
| east centre | y 544 = **75.6%** of height | 75% | ✓ |
| south centre | x 1076 = **83.9%** of width | 85% | ✓ |
| south mouth | 153 px = **3.00** road widths | ~2.8 | ✓ |
| road width | **51** | ~50 | ✓ |
| total road length | **4036** | ~4554 | **11.4% short** |

One entrance, a fork at **(1072, 356)** beside the Performance Review gate, two
exits. The south route is **2.1×** the east — worth knowing before the wave
table is written.

## Nineteen pads, and why that is the honest number

Not fourteen, and not nudged toward it. Levels 3 and 4's own rules, unchanged:
radius-24 core entirely on classified carpet, 90–114 px from the shipped
centreline, ≥74 px apart, best-first by uncovered lane. It is *more* than levels
3 and 4 carry because the board is bigger — **175 px of road per pad here
against their 179 and 192**.

Measured standoff 90.1–101.0, closest pair 75.47, every core clean, 71.3% route
coverage. **The east branch is only 36% covered** because it is 392 px long and
ends 84 px past the fork; there is no room for a pad that reaches its far end
and keeps its distance from its neighbours. That is a real property of the board
and it means the east exit is the cheap one to leak into.

## The road length does not agree, and the mask is not why

The brief said to stop and say so rather than proceed past a 5% disagreement.

| measurement | method | result |
|---|---|---|
| shared + east + south | tracer's geodesic, point-sampled mask | **4035.7** |
| road pixels ÷ road width | touches no trace at all | **4066** |
| shared + east + south | checker's geodesic, area-averaged mask | **3836.1** |
| road pixels ÷ road width | checker's mask | **4218** |
| — | the brief | **4554** |

Four measurements, two independent code paths, two differently-built masks; they
span 3836–4218 and every one sits 7–16% under 4554. Meanwhile the three openings
land within 1.1% of the frame positions the brief states, the width lands on the
brief's figure, and the overlay shows the line on the paint end to end. **I do
not believe the mask is at fault — I believe 4554 is about 11% high.**
`check_level8.py` prints all four next to the reference every run and does not
fail on it.

## Three bugs the independent checker found in my own tracer

None would have been visible from the tracer alone. This is what the second
implementation is for.

1. **`despeckle` abandoned large components mid-walk** and left the pixels it had
   already queued marked `seen`. The rest of that component then started its own
   walks, hemmed in by that stale frontier, and came out as small blobs that were
   swallowed. **It reported four frame openings where the brief says three.**
2. **Pads were measured to the raw geodesic** while the geometry file ships the
   *simplified* polyline. Simplification moves the line inward on every corner —
   **eleven of twenty pads were 83–90 px from the line that actually shipped**
   under a 90–114 rule.
3. **The standoff used a chamfer distance**, which overestimates Euclidean by up
   to 5.6% at ~22° off an axis, so a pad could pass a "≥ 90" test at 85 px.
   Replaced with Danielsson's transform.

A fourth was corrected rather than found: **"24 px core" means a disc of radius
24** in `check_level3.py` and `check_level4.py` — a 48 px footprint — while
`trace_level5.py` read it as a 24 px box and tested a 12 px radius, a quarter of
the area. Levels 3 and 4's reading is the one used here. It cost three pads.

## Two questions the brief asked

**Two-exit support is NOT on `main`.** It exists and the sim models it —
`chooseContinuation`, `pickAt`, `routePick` in `Lanes.ts`, mirrored through
spawns, splits and summons in `tools/soak/Sim.ts` — but all of it is on this
branch. `origin/main`'s `Lanes.ts` has no `chooseContinuation`, no `laneDefs`,
and a `validateLanes` that still demands exactly one terminal. **It would reject
a fork map outright.**

**Level 8 is unreachable, and the gap is two levels wide.** `levels.json` runs
level1 → level5 and stops. Level 6 exists on this branch with no roster row
(waiting on its plate); Level 7 does not exist in any form and I did not invent
one. `tests/levels.test.ts` enforces the chain three ways, so a `level8` row with
`unlockedBy: "level7"` fails the suite immediately. Two options: ship it
unregistered exactly as Level 6 is (recommended), or register it behind Level 5
and let the story run 5 → 8.

---

# Where this leaves the repository

## Blocked

- **The Level 8 build brief has not been started.** Its gate is Level 5 on
  `main`, and Level 5 is not on `main`. Merging this branch clears it.
- **Level 6's plate must be re-rendered** as four 2048 × 2048 segments before its
  map, pads, boss HP, soak or level-select row can exist.

## Waiting on a decision

| | |
|---|---|
| **Level 8's road length** | Plate says 4036, brief says 4554. `laneLengthPx` depends on it. |
| **How Level 8 becomes reachable** | Unregistered (recommended) or `unlockedBy: "level5"`. |
| **`trace_level5.py`'s `despeckle` bug** | Fixing it moves **4.3%** of Level 5's mask (39,894 of 921,600 px; road +1.1%). Re-deriving would move the lanes and pads and invalidate Batula's 480-seed tuning. Recommendation: leave it, fix only if Level 5's art is re-exported — but decide, don't drift. |
| **Spike Strip vs the Glider** (Level 5) | Three defensible readings, none taken. |
| **Sprinter vs Baby Frank** (Level 6) | Three options, none taken. |
| **Level 6's segment resolution** | 2048 (recommended) or 1536 if texture memory bites. |

## Open, not blocking

- Level 4 soaks at **59%**, outside the 35–45% band. Pre-existing — support-aura
  modelling raised it from the 38% its own notes record.
- Level 5's whole cast is **18–37% short of the 7× art rule**.
- `validateLanes` needs the spawn-group property before Level 6's two parallel
  routes will validate.
- `GameScene.drawPlate()` draws one image and will need to draw N for Level 6.
- `tools/stitch_lanes.py` cannot run in the agent environment (no numpy, no PIL,
  registry unreachable) — it has to be run on Cory's machine.
- Level 6's economy ratio will fail its floor once the boss HP lands.

## How to land it

The branch is a clean fast-forward from `main` as of `60d0029`:

```
git checkout main && git merge --ff-only claude/courjahan-defense-level-5-pto190 && git push
```

That lands Level 5, Level 6's first pass, the hero instrument and Level 8's
geometry together, and clears the fork dependency that Levels 6 and 8 both have.
