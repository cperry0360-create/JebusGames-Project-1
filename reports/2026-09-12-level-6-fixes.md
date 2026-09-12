# Level 6: a third spawn, a flame that reads as fire, and a real card

Three fixes. The third spawn is the one with the finding in it: adding a lane
that carries 4.7% of the traffic moved the level's measured win rate from 38%
to 13% **with that lane's spawns removed entirely**, because the soak's
scripted player ranks pads by distance to the nearest road and does not know
which roads matter.

## Commits

| commit | what | CI |
|---|---|---|
| `566deea` | the third spawn, the flame, the card, the soak heuristic | run 273 — **typecheck FAILED**, tests green, deploy skipped |
| `924c8db` | declare `flameArt` as the Sprite it holds, and a local guard | run 274 — **all five green**, deployed |
| `<this report>` | this file and its `SOAK-REPORT.md` section | markdown only; the deploy's paths filter skips it |

**`566deea` turned `main` red and this is the account of it**, because the
failure is the one CLAUDE.md warns about and it cost a cycle anyway.

`flameArt` stayed declared `Phaser.GameObjects.Image | null` while `showFlame`
was rewritten to assign `this.add.sprite(...)`. `tsc` in CI rejected four
lines — `.anims` and `.play` do not exist on an `Image`, twice each — and
`tools/tsdiff.sh` reported **212 against 212, nothing introduced**, because it
compares error COUNTS and with no `node_modules` every Phaser type is `any`.
`npm install` was tried again here and still answers **403** on
`@types/node`, so there is no way to run the real check from the sandbox.

A Sprite in an Image field is the nastiest shape of this bug: `Sprite extends
Image`, so the assignment itself is legal and only the first call that needs
the Sprite half fails.

Two things came out of it:

1. Every member the flame uses was then checked against `Sprite` one at a time
   — `setOrigin`, `setPosition`, `setRotation`, `setScale`, `setAlpha`,
   `setFrame`, `setVisible`, `width`, `anims.stop`, `anims.isPlaying`,
   `play({key, duration, repeat})`. The last three already appear in this same
   file at lines 3819, 3849 and 4055 and pass CI today.
2. **A local guard**, in `tests/level6map.test.ts`: it reads GameScene as text
   and pairs every `this.X = this.add.sprite(...)` with X's declaration. It was
   established to FAIL before it was trusted — reverting the declaration makes
   it report the whole four-line error in one line, locally, in half a second.
   That is not a replacement for `tsc`; it is the cheapest thing that catches
   this particular class where `tsdiff` cannot.

Run 274's Pages artifact is **32,942,907 bytes**, against 32,917,045 at
`dbaf734`: **+25,862 bytes**, which is the card (21,956) and the code.

**The served page is Cory's to confirm.** This sandbox cannot reach github.io —
the egress proxy answers 403 by policy — and no live check was made.

## The headline

- **The Rooster is still 7,500.** Re-derived from scratch against the
  three-spawn board: **181/480 (38%)** on normal, inside the 35-45% band.
  7,000 soaks at 50% and 8,000 at 28%, so 38% is the middle and not a figure
  that happened to survive.
- **The flame reads as painted art.** It was an `Image` squashed 4.69:1 and
  stuck on frame 0; it is a `Sprite`, uniformly scaled at **k = 1.6575**, that
  drew **10 distinct frames** of its 12 in one breath. Screenshot below.
- **The card is real art**, cropped from level 6's own plate: the wireframe
  unicorn and the roads that sweep past it.

---

## 1. The third spawn

### The geometry

`tools/level6_geometry.json` used to carry this as an excluded touch:

> `"south": {"span": [758, 940], "fraction": 0.6633, "why": "a band running off
> the frame at a shallow angle, not a terminal"}`

It is now an entrance. `tools/trace_level6.py` emits it -- so re-running the
tracer cannot revert it -- and the file carries a `_thirdEntrance` note saying
what changed.

| | |
|---|---|
| `entrances.flank` | `[849, 719]` |
| `openings.south59` | span `[758, 940]`, 182 canvas px, 66.4% across the bottom |
| on the source plate | 990-1228 of 1672, **238 px**, 59.2% to 73.4% |
| still excluded | the TOP touch only -- the scaffold's planking, a 2007 px blob connected to no road |

The tracer's terminal count went from "four on the vertical edges" to "five:
two west, two east, one south", and `tools/check_level6.py` was changed to
match rather than to tolerate it -- it now demands five openings on the band,
exactly one on the bottom edge, and that the flank reaches `east83`:

    --- the openings ---
      openings on the band: 5  = 2 west + 2 east + 1 south   excluded touches: 0
      south59 centre x= 850.0 = 66.4% of the frame  (brief 66%)
      north   EXCLUDED touch 783-832, centre 63.1% of the width, 50 px, off the band

    --- which entrance reaches which exit ---
      north entrance -> east73: reachable
      north entrance -> east83: NO PATH IN THE PAINT
      south entrance -> east73: reachable
      south entrance -> east83: NO PATH IN THE PAINT
      flank entrance -> east73: NO PATH IN THE PAINT
      flank entrance -> east83: reachable

The last two lines are the old `_conflict` read the other way round: no west
entrance reaches the east 82.8% exit, and the bottom one does. Exit 0, 99
lines, ending `the plate and tools/level6_geometry.json agree.`

The bottom mouth's width gate moved with it. It had been inside the
excluded-touch loop, and leaving it there once `EXCLUDED` lost its `south` key
would have been a check that could no longer fail.

### The route, and it is ALL PAINTED

`src/data/map_level6.json` grows one lane:

    {"id": "flank", "waypoints": [...57 points...],
     "merge": {"into": "lower", "atIndex": 23}}

It walks the band from the bottom mouth, round the U-turn at (92, 469), and
back east to **(592, 475)** -- which is exactly the point the lower lane's
connector joins that band, so it merges there. **Not one fabricated pixel was
added.** The 82 px authored segment from 2026-09-11 is still the only invented
road on the level, and `tests/level6map.test.ts` still pins it as the one
segment whose two ends come from different painted roads.

| | |
|---|---|
| flank length | **1425.7 px** (1485.7 with its off-plate gateway) |
| its route, end to end | **2260.4 px** = 1485.7 + the 774.7 of `lower` after the join |
| merges into `lower` at | 830.9 px along it, index 23 |
| gateway | `[849, 779]`, straight below the mouth -- level 5's south gate convention |
| closest it comes to `upper` | 225.9 px |
| closest it comes to `lower` (away from the join) | 29.9 px |

**It is a flank by DIRECTION, not by speed.** 1425.7 px to the junction against
`lower`'s own 830.9, so a Sprinter out of the bottom mouth arrives there **4.0 s
later** than one that came in the front door. What it buys is the approach: it
comes up through the bottom-left, the quarter of the board nothing walked
before. Making it a fast flank means fabricating a cut straight up from the
mouth -- about 175 px of unpainted ground -- and that was not done.

**It revives four dead pads.** Pads 9, 12, 16 and 18 reached no road at all
before; they were painted to serve this band. Only **pad 2** still reaches
nothing, and it reached nothing on the painted layout too.

`laneLengthPx` moved from 1711.1 to **2260.4**, because the flank's route is
now the longest walk on the level -- longer than either front lane.

### The waves

Three of thirteen, Sprinters only, in the back half:

| wave | group | delay |
|---|---|---|
| 8 | 3 Sprinters | 6 s |
| 10 | 4 Sprinters | 9 s |
| 12 | 4 Sprinters | 12 s |

**11 bodies, 4.7% of the level**, against 223 down the two front lanes.
`tests/level6.test.ts` gates all of it -- two or three waves, wave 7 or later,
Sprinters only, under 10% of the bodies -- because the easiest way for a later
pass to ruin level 6 is to make this a third front.

### What the flank is actually worth

| flank | 480 seeds, normal |
|---|---|
| removed entirely | 182/480 (38%) |
| **as shipped, 11 bodies** | **181/480 (38%)** |
| doubled, 22 bodies | 202/480 (42%) |

**It makes the level very slightly EASIER.** A Sprinter is 50 health that pays
22 peanuts and it walks 1425 px of road past four pads that covered nothing
before. Nobody should read the flank as this level's difficulty. The Rooster is.

---

## 2. The finding: the soak's scripted player did not know which roads matter

This is the part worth reading.

Adding the flank lane to the map dropped the measured win rate from **38% to
13%** at a fixed Rooster HP of 7,500 -- **with the flank's spawn groups removed
entirely**. Nothing walked the new lane and the level got three times harder.

`tools/soak/Sim.ts` fills pads "nearest the road first", where "the road" is
the nearest point on any lane. Four of level 6's pads sit closer to the flank
than to either front lane, so:

| pad | position in the build queue, 2 lanes | 3 lanes |
|---|---|---|
| **12** | 16th of 18 | **1st** |
| 9 | 14th | 9th |
| 18 | 15th | 11th |
| 16 | 18th | 12th |

The scripted player spent its opening purse covering a lane that carried
nothing. A person looking at the board would not.

### The fix, and the one that did not work

Each lane's **traffic share** is computed from the wave table -- what spawns on
it plus everything that merges into it, so a trunk carries the whole level:

| level | shares |
|---|---|
| 1, 2 | main 100% |
| 3 | main 100%, upper 54.7%, lower 45.3% |
| 4 | main 100%, upper 52.7%, lower 47.3% |
| 5 | main 100%, west 34.0%, north 33.5%, south 32.5% |
| **6** | upper 49.6%, lower 50.4%, **flank 4.7%** |

**Weighting the distance by the share was tried first and is wrong.** It ranks
by `distance / share`, which also re-ranks levels 3, 4 and 5 -- their branches
carry 32-55% against a trunk's 100% -- and it moved all three: level 3 88% to
96%, level 4 62% to 72%, level 5 45% to 64%. That was caught by running the
regression, not by reasoning about it; the comment claiming "every share is 1
on a map that feeds one trunk" was simply false.

**What shipped is an exclusion.** A lane under `MINOR_LANE_SHARE = 0.2` is left
out of the pad ranking; every pad is still in the queue, it just stops jumping
it for a trickle. There is a factor of seven of clear air between 4.7% and
32.5%, so this changes level 6 and nothing else -- which is measured below, not
assumed.

---

## 3. The flame

### What was wrong, and it was not the anchor

`fx-rooster-flame` is a **12-frame sheet**, 181 x 181 per cell, `contentWidth`
181. The old code did:

    this.add.image(0, 0, rules.fx)      // an Image, so no animation
    art.setDisplaySize(rules.reach, rules.width)   // 300 x 64
    art.setDepth(GROUND_DEPTH + 7)      // -993

Three defects in three lines:

1. **4.69:1 anisotropy.** A square cell squashed to 300 x 64 smears every
   painted detail along one axis into a gradient. Same failure as the Mind
   Laser.
2. **Stuck on frame 0** of twelve. An `Image` cannot play an animation, so the
   whole breath was one still of a fire.
3. **Depth -993**, below every tower and enemy on the board (they y-sort 0 to
   720). The fire drew *behind* the tower it was burning.

### What it is now

| | |
|---|---|
| object | `Sprite` |
| scale | **k = reach / contentWidth = 300 / 181 = 1.6575**, on BOTH axes |
| measured `scaleY / scaleX` | **1.000000** -- aspect exactly preserved |
| displayed | 300.0 x 300.0 (the ink is 300 x 278.4) |
| origin | `anchorX`/`anchorY` from art.json (0, 0.5138), not hardcoded |
| position | the **beak** |
| depth | `LAYER.worldOverlay + 10` = 100010, against a board top of 113 |
| animation | **10 of 12 distinct frames drawn in one breath** |

**The beak was measured, not guessed.** The boss art carries a painted jet and
the jet's narrowest column is where it leaves the head: **(863, 308.5)** on the
1254 x 1224 frame. The origin is `(0.5008 x 1254, 1.0 x 1224)` and one source
pixel is `displayHeight / frameHeight = 145 / 1224` world px, which gives
**+27.8 forward and 108.5 up**. Those are `beakForward` and `beakRise` on
`enemy-rooster` in art.json, and `tests/level6map.test.ts` pins them -- they go
stale on a re-export exactly the way `contentWidth` does.

`beakForward` is along the heading rather than along +x, so a left-facing boss
needs no special case: `cos(heading)` does it, and no private field on `Enemy`
is touched.

Measured live, in the same frame: **flame origin 489.8,8.0 -- beak expected
489.8,8.0 -- off by 0.00 px**, where the boss's midpoint would have been
462.9,116.5.

### Two bugs the harness caught that reading would not have

- **`tickRooster` was called from inside `tickNight`**, which returns on its
  first line when a level has no `phases` block. Level 6 has none -- that is
  level *five's* rules block -- so the flame did nothing at all. The scenario
  reported the Rooster spawning, walking, and never once stopping or breathing.
- **The beak was read off the wrong render entry.** `renderFor(rules.fx)` is
  the *flame's* config and has no `beakForward`, so the offset came out 0 and
  the corridor started at the Rooster's midpoint: "flame origin at 482.4,113.0,
  beak expected 511.0,4.5".

### No animation was registered, deliberately

The clip is the one `registerEffectAnims` already builds for every sheet in the
manifest, keyed by the texture -- which is exactly the key `forgetEffectAnims`
drops when level art is freed. Nothing new is registered, so the null-frame trap
from `9e389b8` cannot re-open through this path. If the flame ever gets its own
clips they go through that same path.

### The scorch marker

Also moved, from `GROUND_DEPTH + 8` to `t.y + 6`: a burn mark on a tower was
drawing under the plate.

### The cone art has NOT landed

`art-source/fx_rooster_flame_cone.png` is **not in the repository**. Everything
above is the existing 12-frame flame rendered correctly, which fixes all three
defects -- and the screenshot shows it reading as painted fire rather than a
gradient. What it is not is the intended cone.

When the cone arrives nothing in the scene needs changing: the scale is
`reach / contentWidth`, so a 400-wide cone gives **k = 300 / 400 = 0.75** and a
300 x 225 sprite, and the origin comes from the art's own `anchorX: 0`,
`anchorY: 0.5`. What it needs is the file, an `art.json` entry with
`contentWidth`/`contentHeight` from `tools/measure_art.py` INK output, a
`sheet` of `{frameWidth: 400, frameHeight: 300, frames: 10}`, and `fx` in
`level6.json` pointed at the new key. **`fx-rooster-flame` was NOT retired**,
because retiring the only flame art the game has would leave the Rooster with
nothing to breathe.

### Still true, still not fixed: the corridor crosses lanes

Unchanged from 2026-09-11 and re-measured on every harness run: a breath from
**25.7%** of the upper lane and **7.3%** of the lower puts the other road inside
the corridor. The corridor is a straight 300 px capsule and both roads
serpentine. `reach` and `width` are data; this is a decision, not a bug with an
obvious fix.

---

## 4. The card

`public/assets/ui/card_level6.webp`, 300 x 200, 21,956 bytes -- produced by
`tools/mapcards/run.sh cards`, the tool the other five came from, and copied
into `public/` by hand the way that tool's header says to.

**The crop is the wireframe unicorn and the two roads that sweep past it**:
`[0.66, 0.20, 0.32, 0.379]`, which is 1104,188 535x357 off the 1672x941 plate.
0.32 x 1672 = 535.0 and 0.379 x 941 = 356.6, a ratio of **1.5002** -- the card's
own 3:2, so the cover fit throws essentially nothing away.

Chosen off `preview_level6.png` by looking at it. The level's joke is that
nothing in it got finished, and the unicorn is the one object that still says so
at 300 x 200: a blue wireframe horse on a plinth is unmistakable where a white
cube and a traffic cone are just shapes. The scaffolding in the bottom-left was
the other candidate and makes a worse card -- it sits in a corner with one road,
so half the crop is empty floor.

Registered as `files["card-level6"]` and `worldMap.cards.level6` now points at
it instead of at `map-level6`.

**And a test that fails if a registered level has no real card.** The old check
only asked that the key existed and named a file in the manifest -- both of
which a *plate* satisfies, which is how level 6 shipped with a placeholder. It
now also requires the key to be `card-<id>`, the file to match
`ui/card_level\d+\.webp`, and the file to be on disk.

---

## 5. NOT A BUG: the upper lane appears to jump over the lower one

**Deliberate. Do not straighten it.**

It is recorded here because it looks exactly like a tracing error and the next
session to open this level will want to tidy it. The two front lanes' centrelines
come within **59.6 px** of each other at (195, 207), and the road is 40 px wide
-- so there are **19.6 px of bare floor** between the two painted edges at their
tightest. At that separation the painted kerbs read as one road passing over
another. They never touch: `tests/level6map.test.ts` asserts the closest approach
exceeds `roadWidth` and pins the 59.6 so a re-trace that moves it has to say so.

It fits the unfinished-level theme, which is the whole point of the level.

---

## 6. The re-soak

Full tables in `SOAK-REPORT.md` under **2026-09-12**.

**Hero: Cory, and only Cory.** `tools/soak/level.ts` calls
`simulate(seed, 'normal', LEVEL, undefined, DIFFICULTY)` -- the fourth argument
is the hero and it passes `undefined`, so `Sim.ts` resolves `DEFAULT_HERO_ID`
for all 480 seeds. The by-seed rotation belongs to `run.ts`, the whole-game
soak, and none of these numbers used it. No hero's values were touched.

### Does the simulator model the third spawn?

Confirmed before any number was trusted, and by driving it rather than reading
it:

- `spawn()` reads the group's lane (`sp.lane ?? MAIN_LANE`) and resolves it
  through `net.lane`, so a `flank` group spawns on the flank.
- Walking a flank walker with the shared `advance()`: **one transition,
  `flank -> lower` at total distance 1486.0**, finishing on `lower` after
  2262.0 -- which matches `routeLengths('flank')` of 2260.4 to the 2 px step.
- The leak check is `on.merge === null && laneDistance >= totalLength`, so
  reaching the end of the flank costs no life. Confirmed in the running game
  too: "a flank walker at the end of its lane is now on: lower alive=true
  lives 20 -> 20".
- What it models of the flame is unchanged from 2026-09-11 and still shares
  `systems/Flame.ts` with the scene. The heading is still approximated from the
  movement delta; the summoned fighters are still not modelled.

**And its player model did NOT model it**, which is section 2 and is the reason
the first number it produced was 13%.

### The Rooster, re-derived

| rooster.maxHealth | 120 seeds | |
|---|---|---|
| 4,500 | 86 (72%) | |
| 5,500 | 66 (55%) | |
| 6,300 | 43 (36%) | |
| 7,000 | 31 (26%) | |
| **7,500** | **18 (15%)** | before the heuristic fix |
| 9,000 | 4 (3%) | |

That sweep was run *before* section 2's fix and is kept because it is what a
flat-looking table looks like when the harness is wrong rather than the level.
After the fix, at 480 seeds:

| rooster.maxHealth | 480 seeds |
|---|---|
| 7,000 | 240/480 (50%) |
| **7,500** | **181/480 (38%)** |
| 8,000 | 132/480 (28%) |

**7,500, unchanged.** The third spawn and the heuristic fix very nearly cancel:
the flank is worth about +1 point and the ranking fix about +25 at this HP.
`src/data/enemies.json` is byte-identical to `dbaf734`.

### Loss distribution, 480 seeds, shipped values

    level6 [normal]: 181/480 wins  (38%)
    lost after wave: w4x1 w5x18 w6x28 w7x10 w8x1 w9x1 w12x240
    average lives left on a win: 18.4

**240 of 299 losses (80%) are on the boss wave.** 59 losses (12% of runs) are in
the first half, mostly waves 5 and 6 where the lower lane's coverage is
thinnest.

### Levels 1-5, same seeds, before and after

Against a clean `git worktree` at `dbaf734`, 480 seeds each, normal:

| level | before | after | |
|---|---|---|---|
| level1 | 428/480 (89%) | 428/480 (89%) | identical |
| level2 | 255/480 (53%) | 255/480 (53%) | identical |
| level3 | 422/480 (88%) | 422/480 (88%) | identical |
| level4 | 299/480 (62%) | 299/480 (62%) | identical |
| level5 | 218/480 (45%) | 218/480 (45%) | identical |

**Not one outcome differs.** This run is the whole reason the weighted version
of section 2's fix was thrown away: it reported 96%, 72% and 64% here.

Levels 1 and 3 remain well outside the band at 89% and 88%. Pre-existing,
untouched.

---

## 7. Verification

### From rendered frames

`sh tools/harness/run.sh level6 420 844x390` -- **RESULT: no faults.** Every row
below is read off a running scene:

| check | result |
|---|---|
| lanes the scene builds | `["upper","lower","flank"]`, 2 fronts + 1 merging flank |
| both front lanes carry enemies | `["lower","upper"]` |
| the upper exit costs lives | 20 -> 19 |
| the lower exit costs lives | 19 -> 18 |
| **the flank spawns from the bottom** | `Sprinter at 849,775` (mouth at 849,719) |
| **the flank merges, it is not an exit** | `now on: lower  alive=true  lives 20 -> 20` |
| the Rooster telegraphs before it breathes | yes, and the fire is never live during the telegraph |
| the boss is held still for it | yes |
| a tower standing in the fire is scorched | yes |
| **flame object** | `Sprite`, `scaleY/scaleX = 1.000000`, 300.0x300.0 |
| **frames drawn in one breath** | 10 distinct of 12 |
| **flame depth vs board** | 100010 vs a board top of 113 |
| **flame origin vs the beak** | off by **0.00 px** |
| level 6's node, 4 levels cleared | slot 6 at (1210, 207), reads **locked** |
| ...5 levels cleared | reads **open** |
| console errors / uncaught exceptions | **none**; `bootFailed: false`, `directorError: null` |

Screenshots: `level6-0-map-locked`, `-0-map-open`, `-1-board`, `-2-bothlanes`,
`-2b-flank`, `-3-exits`, `-4-telegraph`, `-5-flame`, `-6-after`,
`-7-flame-portrait`. Reproduce with the command above; they are gitignored on
purpose.

**`level6-7-flame-portrait.png` is the flame one.** It parks the boss at lane
distance 1371 -- (1050, 420), mid-board -- because the scorch check's parking
spot is (481, 113) where the camera cannot centre above him and the fire lands
half off the frame. That first attempt caught 20 px of flame at the frame edge
and could not be read at all.

**Read as a picture**: the fire is a large painted flame with distinct tongues,
a hard dark outline and a bright yellow core, drawn over the road and the pads.
It is not a gradient. The card was read the same way, at card size, before being
shipped.

### Not from rendered frames

Stated plainly, because the difference matters:

- Every number in section 1's geometry table, section 2 entirely, and the whole
  re-soak. Those are `check_level6.py`, `LaneNetwork` driven directly, and
  `tools/soak/level.ts`.
- The cross-lane percentages (25.7% / 7.3%) are computed twice -- once inside
  the running game by the harness scenario and once offline against the shipped
  map -- and the two agree to 0.3 points. The *geometry* is not a rendered
  frame either way.
- The flank's **4.0 s later than the front door** is arithmetic on the route
  lengths, not a stopwatch on a frame.

### Layout

| viewport | result |
|---|---|
| 844x390 | 1 fault |
| 667x375 | 1 fault |
| 1280x800 | **no faults** |
| 844x390, `INSETS=0,47,21,47` | 1 fault |
| 390x844 (portrait) | gated by the rotate overlay, which is correct |

The single fault is `SMALL Title [title:version-stamp (hidden dev door, not a
tap target)]` and is pre-existing -- the same sweep on a clean checkout reports
the same one. WorldMap draws 61 objects, 0 faults, now with a real card.

### Tests and typecheck

- **1,035 tests, 0 failures** (was 1,033; the flame pin and the sprite-field
  guard are the two new ones).
- `sh tools/tsdiff.sh dbaf734`: **212 against 212 -- nothing introduced**, and
  **that reading was wrong**: see the commit table. It compares error counts and
  cannot see a real Phaser type error. `npm install` still answers 403, so
  there is no real typecheck available here at all.
- `python3 tools/build_level6_map.py` twice in a row leaves the same md5, so the
  generator reproduces the shipped map exactly.

### Untouched, and still open

The nine non-asserting harness scenarios (`ui`, `muzzle`, `buildall`,
`rockets`, `retreat`, `regressions`, `poor`, `typegame`, `meteor`) and the black
`GL=1` screenshots -- `renderer.snapshot` with a disarmed pending snapshot on
timeout is still unwritten. Neither was in scope here and neither was started.

---

## Where this leaves the repository

**Landed on `main`**

- The third spawn, the flame's rendering, the card, the soak heuristic, and a
  re-derived Rooster at the same 7,500.

**One thing this pass added to the toolbox**

- `tests/level6map.test.ts` now guards the sprite-field/factory mismatch
  locally. It is narrow on purpose -- it knows about `add.sprite`, `add.image`,
  `add.text`, `add.graphics`, `add.container` and `add.rectangle` -- and it
  fails loudly if its regex stops matching, so it cannot rot into a test that
  checks nothing. Worth widening the moment another class of Phaser error gets
  through `tsdiff`.

**Waiting on Cory**

1. **The cone art.** `art-source/fx_rooster_flame_cone.png` is not in the repo.
   Section 3 lists exactly what dropping it in needs; nothing in the scene has
   to change. `fx-rooster-flame` cannot be retired until it exists.
2. **The flame crosses lanes**, 25.7% / 7.3%. Shorten `reach`, narrow `width`,
   or accept it. Any of the three needs a re-soak. Carried from 2026-09-11.
3. **A fast flank?** The painted route arrives 4.0 s *later* than the front
   door. Making it a real shortcut costs about 175 px of fabricated road up from
   the mouth, and a re-soak.
4. **`width: 64` against a 40 px road** -- the fire is 1.6x the paint. Carried.
5. **`plannedLevels: 20` -> 10.** One JSON line and one test line; see
   2026-09-11 section 7. Still not done, still deliberate.
6. **The pad squash**, 0.748 painted against the engine's 0.62. Carried.

**Carried forward, unaddressed**

- **The four `this.lane` sites** from 2026-09-10 section 7 --
  `drawCoveredLane`, `washLane`, `validCastPoint`, `powerHazard`.
  `validCastPoint` is the functional one: `pathOnlyWithin` refuses summons
  anywhere near the lower lane, and now near the flank too. **Fix these before
  anyone plays level 6 seriously.** `tickRooster` reads the boss's own lane and
  does not add to the list.
- Pad 2 at (1167, 53) still reaches no road, and always will -- it is painted on.
- The nine non-asserting harness scenarios and the black `GL=1` screenshots.
- Levels 1 and 3 soak at 89% and 88%, outside the 35-45% band. Pre-existing.
