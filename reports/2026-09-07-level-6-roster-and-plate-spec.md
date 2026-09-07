# Level 6 — the roster, the flame, and why the plate has to be re-rendered

Built from the brief of 2026-09-07. Branch
`claude/courjahan-defense-level-5-pto190` (the session's forced branch; Level 6
shares it with Level 5).

| commit | what | CI |
|---|---|---|
| `b217803` | Level 6's roster, its flame, and the gate that stops it shipping untuned | **green, run 190** |
| `a6a0a8f` | This report and level 5's | **green, run 193** |
| `5c83e70` | Merge `origin/main` (the level 8 art upload) | **green, run 194** |

**Dependency check first.** The brief says to stop if Level 5 has not landed on
`main`. **It has not.** Level 5 is on this branch, pushed and green, and `main`
is still at `aa96a06`. The two-spawn/two-exit capability the brief depends on
*exists* — `ec70fe2` on this branch — so nothing here re-implements pathing or
leak handling. But it is not on `main`, and Level 6 cannot be finished until it
is. What is built here is the half the brief itself says does not depend on the
plate.

---

## The three answers the brief asked for first

### 1. Maximum texture width — and no, a single-plate Level 6 is not possible

**Measured, in this environment.** A WebGL probe run under the harness's own
renderer flags (`--use-gl=angle --use-angle=swiftshader`, per RENDER-QUALITY.md,
because the default `--disable-gpu` drops Phaser to CANVAS and makes every WebGL
reading null):

| | |
|---|---|
| context | WebGL 1.0 (OpenGL ES 2.0 Chromium) |
| renderer | ANGLE (Google, Vulkan 1.3.0, SwiftShader) |
| `MAX_TEXTURE_SIZE` | **8192** |
| `MAX_RENDERBUFFER_SIZE` | 8192 |

Then an actual upload test — `texImage2D` at increasing widths, reading
`glGetError` each time:

| width | at height 1080 | at height 316 |
|---|---|---|
| 2048 | ok | ok |
| 3840 | ok | ok |
| 4096 | ok | ok |
| 6144 | ok | ok |
| 8192 | ok | ok |
| **10240** | **fails** | **fails** |
| 12288 | fails | fails |
| 16384 | fails | fails |

**The decisive fact is in the last column: 10240×316 fails exactly as
10240×1080 does.** `MAX_TEXTURE_SIZE` is a **per-dimension cap, not an area
cap**. A very long, very short plate gets no relief from being short. A
10,000px-wide plate is rejected outright.

**What this environment can and cannot tell you.** 8192 is SwiftShader's
number — a software rasteriser on a Linux container. It is *not* a phone's, and
there is no device here to ask. What can be said with confidence:

- **The conservative floor on shipping mobile GPUs is 4096.** WebGL 1's
  *guaranteed* minimum is only 64, so 4096 is a de-facto floor rather than a
  spec one — but it is the number older Mali and Adreno parts report, and it is
  the number this project has implicitly been targeting: **every shipped plate
  is 3840×2160 or smaller.** Level 5's is 1920×1080.
- Recent iOS and Android parts report 8192 or 16384. Targeting those means
  abandoning the older half of the install base.
- Above the texture cap there is a second, softer ceiling — **VRAM**. A texture
  costs width × height × 4 bytes decoded regardless of how well the WebP
  compresses. Level 4's plate is 3840×2160 = **31.6 MB** resident.

**Conclusion: a single-plate Level 6 is not possible, and it is not close.**

Level 6's world is 2970 × 720 (2.32× level 4's width, same height). Even at
**1.0× resolution** — one texture pixel per world pixel, softer than any plate
in the game — that is a 2970px-wide texture, which fits. But at the 2×–3×
resolution every other plate ships at it is 5,940 to 8,910px wide: **over the
4096 floor by 1.5× to 2.2×, and at the top end over 8192 too.** The 316px-tall
proof rescaled to a usable height lands near 10,000px, which fails even on
SwiftShader's generous 8192.

**Level 6 must be tiled.** That is a firm answer and Cory can render against it.

### 2. The flame's anisotropy: **2.41 : 1**

`measure_art.py` measures the hot core at **93px of the 181px cell, centred at
0.5138**. The brief said 98px and 0.539; the brief also said to trust the tool
if it disagreed, so 93 and 0.5138 are what shipped. The difference is where the
sample is taken across the cell width, and it is small.

At a 300px reach and a 64px corridor:

```
scaleX = reach / contentWidth   = 300 / 181 = 1.6575
scaleY = width / beamCoreHeight =  64 /  93 = 0.6882
anisotropy = 1.6575 / 0.6882    = 2.408 : 1
```

For comparison: the Mind Laser shipped at **8.25 : 1** with the
`contentHeight` bug, which flattened every painted highlight into a smooth
gradient, and its fix brought it to **2.8 : 1**. The flame is better than the
fixed laser. `tests/level6.test.ts` asserts it stays under 3.0.

The registration is the shape the brief asked for: `anchorX: 0`, `stretch:
"line"`, `sheet { frameWidth: 181, frameHeight: 181, frames: 12 }`,
`beamCoreHeight: 93`. The sheet was measured, not trusted: 2172 × 181 is
exactly 12 × 181 wide, ink runs the full width of every frame (muzzle flush
left, tail off the right edge, as described), and the vertical ink is y6–y173.
Nothing was re-sliced.

**Not verified from a rendered frame.** The flame has no way onto the board yet
— it belongs to a boss on a level that has no map, so no scenario can spawn it.
The anisotropy above is arithmetic over measured numbers, and it is the same
arithmetic `GameScene.updateHeldBeam` performs; whether the *painting* survives
being drawn at 2.41:1 has to be looked at in the map pass.

### 3. The Rooster's HP is unset, and a test holds it there

`enemies.json` gives `rooster.maxHealth: null`. Two tests in
`tests/level6.test.ts` gate it:

- **`a level cannot ship with a boss whose health is unset`** walks every level
  registered in `levels.json`, reads its wave table, and fails if any spawned
  enemy has a non-numeric or non-positive `maxHealth`. It also asserts the
  Rooster *is* null right now, so the test is testing something rather than
  passing vacuously.
- **`an unregistered wave table belongs to a level that is genuinely
  unfinished`** closes the loophole. `rules.test.ts`'s "every enemy is fought
  somewhere" check was broadened to read every `waves*.json` on disk, so Level
  6's four enemies are not reported as dead weight while their level has no
  row. That broadening would otherwise let a genuinely dead enemy hide behind an
  orphaned table — so an unregistered table has to belong to a level whose boss
  has no health. **The exemption closes itself the moment somebody fills the
  number in.**

`EnemyDef.maxHealth` is now `number | null` for this reason, and `Enemy`'s
constructor reads `?? 0` with a comment saying why the branch is unreachable
and why 0 beats a throw.

---

## The plate: measured, and not converted

`art-source/` holds three staging images. **None of them was converted into
`public/assets/maps/`**, and `art-source/` sits outside `public/` so none of
them reaches the deploy.

| file | size |
|---|---|
| `courjahan_level6_2lane (1).png` | 2970 × 316 |
| `level6_2lane_preview (1).png` | 1600 × 710 |
| `_verify-contact-sheet.png` | 1801 × 912 |

### The three faults, confirmed

**1. The stitched plate is 2970 × 316, a 9.40:1 strip.**
Level 4's world is 1280 × 720.

- 316 / 720 = **43.9%** of the height — the brief said 44%. ✓
- 2970 / 1280 = **2.32×** the width — the brief said 2.3×. ✓

**2. Clearance below the lower lane is 25px = 7.9% of plate height.**
`tools/level6_geometry.json` records `clearance_below_lower_lane_px: 25`.
25 / 316 = **7.91%**. The project's own segment rules — written into
`stitch_lanes.py`'s docstring — require **at least 12% of image height as open
ground below the lower road**, "because that margin is where tower pads go". At
316px that would be 37.9px. **Short by 12.9px, or 34% of what is required.**

**3. 316px is contact-sheet resolution.** Every shipped plate in this project
is 2160px tall (levels 1–4) or 1080px (level 5). 316 is **29% of the smallest
one that ships**, and 15% of the largest.

Two further measurements, for the re-render:

- The traced lanes sit at normalized y **0.227–0.603** (upper) and
  **0.751–0.915** (lower), against the render rules' pinned 32% and 72% at the
  edges — so the upper lane wanders considerably more than the rule intends.
- Minimum gap between the lanes is 0.2274 normalized = **71.9px** on this
  plate. The lanes never touch, which is the one thing the proof does prove.

**So no map was built.** No `map_level6.json`, no pads, no geometry derived from
the proof. The normalized waypoints in `level6_geometry.json` describe *this*
plate and will not survive a re-render; they are reference only, and the file
says so.

### `tools/stitch_lanes.py` — the invocation, and a warning

```
python3 tools/stitch_lanes.py --dir segments/ --lanes 2 --target 2970 --scale 1 --out level6
```
Outputs `level6.png`, `level6_path.json` and `level6_paths_preview.png`. Useful
flags: `--minseg` (smallest usable slice, default 460), `--max-resid` (join
residual it will accept, default 5.0px), `--no-mirror`, `--scale`.

**It does not run in this environment and I could not confirm that it works.**
It imports `numpy` and `PIL`, neither of which is present, and neither is
installable — `pip3 install numpy pillow` returns *"Could not find a version
that satisfies the requirement"*, the same registry block CLAUDE.md documents
for npm. The file was read end to end and its argument parser and pipeline are
coherent, but **that is a code reading, not a run.** It has to be executed on
Cory's machine.

---

## The re-render specification

### The per-segment prompt

Taken from `stitch_lanes.py`'s own RENDER RULES block, which already encodes
all three constraints the brief asks for. Use it verbatim, **one segment per
image**:

> The dirt road enters the LEFT edge at exactly 32% of the image height and
> exits the RIGHT edge at exactly 32%, both running horizontally. A second dirt
> road enters the LEFT edge at exactly 72% and exits the RIGHT edge at exactly
> 72%, also horizontal. Both roads keep the same width at both edges and never
> touch each other. Leave at least 12% of the image height as open ground below
> the lower road. Between the edges both roads may curve freely. Do not draw any
> panel labels, borders, captions or text.

Plus the level's own subject, which the theme section below describes.

Why each clause matters, from the tool's own notes: pinning **both edges** is
what lets segments chain in any order; pinning **both lanes** is what stops them
converging across a segment; the **12% margin** is the buildable ground.

Note that the prompt as written *already satisfies* the clearance rule: a lower
lane pinned at 72% leaves 28% below it at the edges. The proof plate fails the
rule because it predates the constraint, not because the constraint is wrong.

### Target dimensions, working backwards

**World:** 2970 × 720. Width from the brief's 2.3× of level 4; height held at
720 so the camera, the character scales and the 12% pad margin all mean what
they mean on every other level. 12% of 720 = **86 world px** below the lower
lane, which is about one pad's depth (pads sit 46–110px from a lane).

**Four segments**, matching the four the proof already chains
(`level6_geometry.json` lists `map6-1` … `map6-4`). Each covers 742.5 × 720
world px — an aspect of 1.031:1, essentially square.

| option | per segment | resolution | VRAM (4 tiles) | vs 4096 floor |
|---|---|---|---|---|
| **recommended** | **2048 × 2048** | **2.76×** | 67.1 MB | ok, 2× headroom |
| fallback | 1536 × 1536 | 2.07× | 37.7 MB | ok, 2.7× headroom |
| minimum | 1024 × 1024 | 1.38× | 16.8 MB | ok |

**Recommendation: four segments at 2048 × 2048.**

- 2.76× world resolution sits between level 3's and level 4's 3×, and well
  above level 5's 1.5×.
- 2048 is a **power of two**, which also lifts these four out of the NPOT
  bucket RENDER-QUALITY.md flags — 67 of 109 textures are non-power-of-two and
  therefore cannot have mipmaps under WebGL 1. These four could.
- Every dimension is half the conservative 4096 floor.
- The 3% aspect difference between 2048:2048 and 742.5:720 is absorbed by
  `setDisplaySize`, as it is on every plate today.

**The fallback matters.** 67 MB of resident texture is 2.1× level 4's whole
plate, on a board 2.3× the size — proportionate, but heavy for a low-end phone
that is also holding every enemy, tower and UI atlas. If the map pass sees
memory pressure, 1536 × 1536 halves it and is still 2.07×, better than level 5.

### One engine change the map pass will need

`GameScene.drawPlate()` draws **one** image. A tiled plate needs it to draw N
side by side, each `setDisplaySize`d to its own slice of the world. That is a
small, contained change — but it does not exist yet, and it is on the critical
path for the map pass. Worth doing before the art lands rather than after.

---

## Assets

Five PNGs converted at q95. **The three plate images were not converted** and
the PNG originals all stay in `art-source/`.

| | |
|---|---|
| **before** | 27,993,745 bytes |
| **after** | 28,886,019 bytes |
| **added** | 892,274 bytes | **+3.1%** |

| file | source | webp | PSNR |
|---|---|---|---|
| `enemies/enemy_scrapper.webp` | 556 × 611 | 69,334 | 44.4 dB |
| `enemies/enemy_sprinter.webp` | 611 × 649 | 68,068 | 43.5 dB |
| `enemies/enemy_bruiser.webp` | 782 × 692 | 94,180 | 45.1 dB |
| `enemies/boss_rooster.webp` | 1254 × 1224 | 484,666 | 34.6 dB |
| `effects/fx_rooster_flame.webp` | 2172 × 181 | 176,026 | 31.3 dB |

Alpha is exact on all five (0 pixels differ). `contentWidth`/`contentHeight` in
`art.json` come from `measure_art.py`'s INK output; the Rooster's ink is
1251 × 1224 inside a 1254 × 1224 canvas, and the other three are tight crops
where ink and canvas coincide.

### The 7× rule: all four clear it

| sprite | drawn at | rule wants | has | ratio |
|---|---|---|---|---|
| Scrapper | 68.0 | 483 | 611 | **1.26×** ✓ |
| Sprinter | 64.0 | 455 | 649 | **1.43×** ✓ |
| Bruiser | 85.0 | 604 | 692 | **1.15×** ✓ |
| The Rooster | 145.0 | 1031 | 1224 | **1.19×** ✓ |

**Nothing falls short.** Worth stating plainly because Level 5's cast, measured
the same way an hour earlier, cleared *none* of it (0.63×–0.82×). Nothing was
upscaled. `tests/level6.test.ts` asserts this so a re-export cannot quietly
break it.

### Facing

All four are drawn facing **right** and declared `artFacing: "right"`. Each was
opened and looked at — the Rooster's head, beak and flame all point right, and
the three mannequins run and stand rightward. Nothing in the engine can derive
this from the pixels, and a wrong value walked level 3's boss backwards through
the entire map. A test asserts the declaration for all four.

### The Rooster's anchor needed a rule

It is drawn mid-leap: wings out, tail plumes sweeping down to the left, one
foot raised. The ground silhouette therefore finds **tail, not feet** — at its
0.90 band the deepest run is x5–710 of a 1254px canvas, which is a feather. It
takes a **body shadow and a body anchor** (ink centre, 0.5008), the rule the
Zamboni, the Glitch Bug and Level 5's Glider already have.

---

## The theme

Level 6 is an unfinished level that knows it. The three rank and file are grey
untextured mannequins with two dots for eyes; the Rooster is the only fully
finished thing in the level. **Nothing here tints them, details them or "fixes"
them**, and both `enemies.json` and `level6.json` carry a note saying so, so a
later pass does not helpfully repaint the joke.

---

## The roster

| id | name | hp | armor | speed | pay | lives | dmg | interval | drawn at |
|---|---|---|---|---|---|---|---|---|---|
| `scrapper` | Scrapper | 110 | 2 | 92 | 11 | 1 | 9 | 0.85 | 68 |
| `sprinter` | Sprinter | 70 | 0 | 150 | 9 | 1 | 6 | 0.60 | 64 |
| `bruiser6` | Bruiser | 420 | 12 | 34 | 34 | 2 | 22 | **1.85** | **85** |
| `rooster` | The Rooster | **null** | 6 | 30 | 1600 | 14 | 0 | 99 | 145 |

Names live on those four rows in `enemies.json` and nowhere else;
`level6.json`'s `roster` maps them to their parts. Renaming for the kids is four
edits in one place.

### Three deviations from the brief, all stated

**1. `bruiser6`, not `bruiser`.** `lateFiler` is already called **Bruiser** on
screen — level 1's first enemy, shipped months ago. Two rows may share a *name*
(the Glitch Lich King has two) but not an *id*, and renaming level 1's would
rename an enemy players have already met.

**2. The Bruiser swings every 1.85s, not 1.5s.** `armor.test.ts` requires that
Cory survive ten seconds with `blockCapacity` (3) of the heaviest rank-and-file
attacker on him at once. At 22 damage every 1.5s that is 44/s and he is gone in
**8.2 seconds**. At 1.85s it is 11.9/s each and he lasts **10.1**. The damage
per swing is the brief's and is untouched — a heavy slow attacker should hit
hard and rarely, and it was the *rate* that broke the floor. 11.89 dps also
lands him level with the Overpacker's 11.88, the heaviest thing in the game
before him.

**3. The Bruiser is drawn at 85, not ~92.** Every tower in the game is 87.1px
tall and `content.test.ts` holds the rank and file under that. A 92px Bruiser
would be the only ordinary enemy on the board taller than every building on it.
85 is what level 3's and level 5's heaviest elites already are.

### And one conflict, recorded rather than resolved

**The brief asks for the Sprinter at 150 to be the fastest unit in the game. It
is not — it is second.**

| | | |
|---|---|---|
| 1st | **Baby Frank** (level 5) | **172** |
| 2nd | **Sprinter** (level 6) | **150** |
| 3rd | Tiny Glitch (level 3) | 140 |

Level 5 shipped Baby Frank at 172 about an hour before this brief was written,
explicitly to beat Tiny Glitch's 140 — so the two briefs are simply in conflict
and neither of them could have known. **Neither number has been changed.** A
test asserts the *fact* rather than the wish, so whichever way it is resolved
the test has to be edited deliberately.

Options, none taken: raise the Sprinter above 172; lower Baby Frank below 150;
or accept that the fastest unit in the game belongs to Level 5 and the Sprinter
is the fastest thing *in Level 6*.

---

## The flame

`src/systems/Flame.ts`, configured entirely from `level6.json`:

| field | value |
|---|---|
| `intervalSeconds` | 6, measured from the moment the fire goes **out** |
| `stopSeconds` | 1 |
| `telegraphSeconds` | 0.8 |
| `flameSeconds` | 1 |
| `reach` | 300 |
| `width` | 64 (full corridor) |
| `damagePerSecond` | 90, ticking every 0.2 |
| `scorchSeconds` | 4 |
| `towerFireRateMultiplier` | 0.5 |
| `scorchFx` | `fx-burn` — existing art, nothing added |
| `harmsEnemies` | false |

**The telegraph is the Glitch Bug's mechanism, not a parallel one.** Cooldown →
a windup that is visible before anything lands → the effect, and a caster killed
*mid-windup* lands nothing. `Flame.ts`'s header says why it is a separate module
rather than a branch inside `Disabler`: `pickDisableTarget` answers "which
*one*" and this answers "everything along a line", and folding them together
gives a `Disabler` whose `target` is sometimes a tower and sometimes a
direction — two mechanics wearing one name. The **scorch** is a genuine reuse:
it is `Tower.fireIntervalScale`, the field Level 5's acid puddles added.

**Two things about it are written down rather than left to be found:**

1. **The stop and the fire are separate clocks.** The brief's arithmetic — a
   1.0s stop with a 0.8s telegraph inside it — leaves **0.2 seconds** of a
   damage-over-time effect, which at a 0.2s tick is one tick: a burst with extra
   steps. `flameSeconds` is therefore its own number, so the warning keeps its
   full 0.8s and the fire can outlast the stop. Both are JSON.
2. **The corridor is a capsule, not a rectangle.** `distanceToSegment` clamps,
   so the ends are round and the fire actually reaches `reach + width/2` =
   **332px**, not 300. That is what a plume looks like and it is the shape every
   other area check in this codebase makes — but it is 32px more than the number
   in the config, and somebody measuring it in a soak would otherwise report the
   reach as wrong.

**It never crosses lanes**, and that is a property of the *map* rather than a
check in code: the corridor runs along the heading the boss is walking, and
Level 6's two lanes are parallel and never meet. Which is one more reason the
map matters.

---

## The waves

`src/data/waves.level6.json`, 13 waves, both lanes live throughout, no
mid-level boss appearance.

| wave | name | rank-and-file hp | step | spawns |
|---|---|---|---|---|
| 1 | Grey Box | 440 | — | 4 |
| 2 | The Other Rail | 540 | +22.7% | 6 |
| 3 | Placeholder Rush | 700 | +29.6% | 10 |
| 4 | Two Grey Files | 1010 | +44.3% | 11 |
| 5 | Untextured | 1190 | +17.8% | 13 |
| 6 | The Wall Arrives | 1740 | +46.2% | 12 |
| 7 | Low Poly Count | 2100 | +20.7% | 16 |
| 8 | Asset Pending | 2700 | +28.6% | 19 |
| 9 | Are We Out Of Ideas | 3540 | +31.1% | 21 |
| 10 | Ship It | 4320 | +22.0% | 26 |
| 11 | Feature Freeze | 5300 | +22.7% | 30 |
| 12 | Release Candidate | 6360 | +20.0% | **34** |
| 13 | The Rooster | 1880 escort | — | 21 |

Every step is upward and inside the 55% cap. The heavier lane alternates on
every wave and the two lanes carry different *kinds* of pressure on the same
wave, so a symmetric board is wrong on one side of every one. A test asserts
both.

**The spawn counts are the number to watch on this level, not the health.** The
route is roughly 50 seconds of walk at these speeds against 15–25 on every level
before it, so far more is alive at once than any board has had to hold: 34
bodies on wave 12, against Level 5's 30 at its heaviest on a lane a third the
length. If the map-pass soak reports the level *stuck* rather than lost, that is
the first place to look.

**Two things the map pass has to fix, both already known:**

1. **The topology does not validate yet.** `Lanes.validateLanes` reports *"a
   lane that reaches an exit and that nothing merges into is a route with no
   gate"* — a rule written for Level 5 to catch a *forgotten* merge, which is
   exactly what a second independent route looks like from outside. `main` is
   exempt, so one of Level 6's two lanes passes and the other does not. The fix
   is one more property, not a relaxation: a lane with no continuation is legal
   if a spawn group names it, which the wave table can answer and the lane list
   cannot. It is left undone because a validator change with no map to validate
   is a change nothing can be run against.
2. **The economy will fall through the floor when the boss HP lands.** The run
   pays **0.147** peanuts per point of rank-and-file health, above the 0.13
   floor. The Rooster's health is unset, and every point of it goes into the
   denominator: at 6,000 the ratio falls to **0.124** and `content.test.ts`'s
   floor fails. The answer will be either fewer boss hit points or a larger
   purse, and it has to be decided the moment the HP is picked.

---

## The simulator

`Sim.ts` learned the flame, so the eventual boss tuning is not measured against
a board where it does nothing — which is exactly how Level 4's boss came to be
tuned against a board where the Beacon aura did nothing.

**Modelled exactly**, sharing `systems/Flame.ts` with the scene: the six-second
cadence measured from the moment the fire goes out; the 0.8s telegraph during
which nothing is damaged; the rule that a boss killed mid-telegraph burns
nothing; the corridor's geometry including its round tip; damage-per-tick to the
hero and to the Ima Dummy's lads; the scorch's fire-rate halving and its four
seconds, refreshed every frame a tower is in the fire; and the rule that the
fire never touches another enemy.

**Approximated: the heading.** The scene reads the boss's facing off the lane it
is walking; the sim casts the corridor along the direction it actually moved
last frame. Identical on a straight run, drifting by a few degrees through a
bend. Level 6's lanes are nearly straight so the two agree closely — but it is
an approximation, and a level with a hairpin would need it replaced with a lane
lookup.

**Not modelled: the summoned fighters.** The soak has never put them on the
board, so the fire has two kinds of victim here and three in the game.

### Levels 1–5 are unaffected

480 seeds each, same seeds, **after** the Level 6 roster, flame and simulator
changes landed:

| level | before Level 6 | after | loss distribution |
|---|---|---|---|
| level1 | 420/480 (88%) | 420/480 (88%) | identical |
| level2 | 235/480 (49%) | 235/480 (49%) | identical |
| level3 | 413/480 (86%) | 413/480 (86%) | identical |
| level4 | 285/480 (59%) | 285/480 (59%) | identical |
| level5 | 194/480 (40%) | 194/480 (40%) | identical |

**Hero rotation: Cory only.** `tools/soak/level.ts` pins one hero; the
seven-hero rotation in `run.ts` was not used, so no Courtland contamination in
any number in this report. Difficulty normal throughout.

**Level 6 was not soaked** and could not be: no map, no pads, no boss health.

---

## Verification

- **989 tests pass**, including 12 new ones in `tests/level6.test.ts`.
- **`sh tools/tsdiff.sh 7f37ab4`** introduces four errors, all four the
  documented Phaser cascade (`Property 'x'/'y' does not exist on type
  'Fighter'/'Soldier'` in `GameScene.ts`, from Level 5's puddle code). Confirmed
  cascade rather than fault: the same messages are in the baseline for `Enemy`,
  `Hero`, `Tower` and `Projectile`.
- **CI green** on `b217803` (run 190).

**From rendered frames: nothing in this report.** Level 6 has no map, so it
cannot be entered, and no harness scenario can reach any of it. The flame's
anisotropy, the 7× ratios and the asset budget are all measurements over files
and arithmetic over the manifest — real numbers, but not pictures. The one
visual check performed was **opening all five source PNGs and looking at them**,
which is how `artFacing` was set and how the Rooster's leaping pose was found.

**Harness scenarios NOT relied on:** none of `ui`, `muzzle`, `buildall`,
`rockets`, `retreat`, `regressions`, `poor` or `typegame` was used for any claim
here. They still throw on their first line and report success.

---

## Where this leaves the repository

**Blocked, and this is the one that matters**

- **Level 6's plate has to be re-rendered before anything else can happen.**
  Four segments, the prompt above, **2048 × 2048 each**. Until then: no map, no
  pads, no boss HP, no soak, no level-select row.
- **A single-plate Level 6 is not possible.** Answered above, with the upload
  test behind it. Cory can render against that now.

**Waiting on a decision**

- **The Sprinter/Baby Frank speed conflict.** Three options above; none taken.
- **Which resolution for the segments** — 2048 (recommended) or 1536 (if
  texture memory bites).

**Open, not blocking**

- `stitch_lanes.py` cannot be run in the agent environment (no `numpy`, no
  `PIL`, registry unreachable). It has to be run on Cory's machine.
- `GameScene.drawPlate()` draws one image and will need to draw N.
- The wave table's economy ratio will fail its floor once the boss HP lands.
- `validateLanes` needs the spawn-group property before two parallel routes
  will validate.
- Level 4 soaks at 59%, outside the 35–45% band — pre-existing, carried forward
  from the Level 5 report.
- Level 5's whole cast is 18–37% short of the 7× rule — carried forward.
- The Spike Strip / Glider question on Level 5 is still open — carried forward.

**How to land it**

The branch is a clean fast-forward from `main` as of `249c215`:

```
git checkout main && git merge --ff-only claude/courjahan-defense-level-5-pto190 && git push
```

That lands Level 5 *and* Level 6's first pass together, which also clears
Level 6's own dependency — the two-spawn/two-exit capability reaches `main` in
the same merge.

**Not in this pass, by instruction**

`map_level6.json`, the pads, the boss HP, the soak, and the `levels.json` row
that would make Level 6 reachable and pay cakes. The row is deliberately absent:
`Levels.loadLevel` throws for a level with no map, and the cake thresholds are
already shared by every story level in `cakes.json`, so Level 6 gets them for
free the moment its row exists.
