# Level 10 — the Vlaude fight. All eight pieces, and the number that had to move.

**2026-09-14.** The scene side of level 10 is built. Vlaude sits at the crystal
core, swaps to his code form, floats down to the lane, and all six
manipulations fire on the schedule his data has always described. The defeat
plays, the screen goes white, the comics roll and the credits follow them.

**His health came down from 36,000 to 26,000, and that is not a nerf — it is
the first time the number has been measured against the level the player
actually gets.** The old figure was taken with nothing firing.

**The single most useful thing in this report is the bug in "the white wash"
below.** Every number about that rectangle was correct and the screen still
never went white. Only a rendered frame could say so, and that is the whole of
CLAUDE.md's standing fact about a green suite and a sprite.

| commit | what | CI |
|---|---|---|
| `ca63ffc` | the berth, the float, the schedule, the six powers and the portal | covered by [run 378](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34907129792) **green** — never pushed alone |
| `1f9fc00` | the ending, the title card, and the silent audio hook | covered by run 378 **green** |
| `2c91381` | `run.sh vlaude` and `run.sh titlecard`, and the white wash that was never white | covered by run 378 **green** |
| `afaee71` | the re-soak: 36,000 → 26,000, and levels 1–9 unmoved | covered by run 378 **green** |
| `525ffff` | fourteen tests for the fight | [run 378](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34907129792) **green** |
| `e7809bf` | the countermeasure's HUD light, checked in a frame | [run 379](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34907285344) **green** |
| `fe9736a` | this report, and CLAUDE.md and `claude/context.md` reconciled with a level that has a fight | [run 380](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34907622764) **green** |
| *this commit* | run 380's row | it edits this table and nothing else. The table closes here for the reason the level 10 report's did — a CI row for the commit that writes the CI row needs a further commit, forever |

Branch `claude/vlaude-fight-scene-jrb368`. **The merge command is the first
line of this session's reply**, and the branch fast-forwards onto `main`.

---

## The brief said this was already on `main`. It is not.

The first line of the task reads *"Level 10's board, cast, waves and RULES are
already on main"*. They are not, and it is worth being exact about it because
two sessions in a row have now opened by discovering the same thing:

```
$ git rev-parse main
692a1fc70b22c9e8f5d75cc04392a657514e48ea
$ git ls-tree main --name-only src/data/ | grep level10
(nothing)
```

`main` has no `level10.json`, no `map_level10.json`, no `waves.level10.json`
and no `systems/Vlaude.ts`. All of it — the asset pass, the board, the cast,
the waves, the rules engine, the soak — is on this branch, which `main` is an
ancestor of. **Eleven commits of other sessions' work were already sitting
here before this one added six more.**

This session went ahead on top of it for the reason the level 10 report gives
for the same situation: the precondition's purpose is *do not build against
work that is not there*, and the work is there, on the branch this session is
required to develop on.

---

## 1 — The berth

`berthSprite(rules, phaseForWave(wave))` at `map_level10.json`'s `vlaudeBerth`
(1041.5, 269.0), at `displayHeight` 200, bobbing 7 px over 2.6 s. The sprite is
swapped when the wave count turns a phase: `enemy-vlaude` in chat,
`enemy-vlaude-code` in code, **nothing** in damaged.

**HE IS AN IMAGE AND NOTHING ELSE, AND THAT IS THE WHOLE OF "UNTARGETABLE".**
`syncVlaudeBerth` contains no `new Enemy`, no `health`, no health bar and no
`setInteractive` — a test greps its body for all four. There is nothing on the
board for a tower, an ability or a pointer to find, so "untargetable" cannot
drift out of step with "not on the board" the way a flag could.
`targetable(phase, floating)` is asked wherever the question comes up and there
is deliberately no second flag beside it.

**The bob runs on the REAL clock**, with the camera, not the scaled simulation
clock — he is not part of the simulation, and holding the world still for a hit
pause must not hold his breathing still with it.

He is `ySort`ed like everything else standing on the board, which is CLAUDE.md
rule 3 and is also what puts him behind the HUD: the HUD is a different SCENE,
and depth cannot cross a scene boundary at all.

---

## 2 — The float

On entering the damaged phase: hold `float.holdMs` (900), play
`fx-vlaude-path-change` at 340, then one eased traversal to the lane's first
waypoint over `travelMs` (3200) with `landingEase`, and `shakeMs` (600) of
camera shake on landing.

**HE IS INVULNERABLE FOR THE WHOLE TRAVERSAL AND NOT BECAUSE A FLAG SAYS SO.**
There is still no `Enemy`: it is an Image on a tween. `vlaudeFloating` is handed
to `targetable`, which is the one function that answers "may anything damage
him", and the probe sampled it **17 times over 4,745 ms** — every 120 ms from
the first frame of the hold to the landing — for a frame in which it was true
or an `Enemy` existed. There is none.

**THE CODE FORM IS WHAT FALLS.** He leaves the core whole and the landing is
what damages him, which is why the wave table's Vlaude wears
`enemy-vlaude-damaged` and the float does not.

**The camera is sent to look at it.** A phone's world camera shows about a
third of the board and the core is in the upper right; without `rig.lookAt` the
whole beat happens off the side of the screen. That is level 9's rupture
lesson, learned from a frame, applied here before it could be learned again.

### The one place the brief contradicted itself, and how it was read

The brief says both of these:

> He becomes one [an Enemy] when the float lands, and that frame is the first
> frame he is targetable.

> After landing, the wave's `vlaude` spawn proceeds normally.

Those cannot both be literally true: the damaged phase starts on **wave 13** and
the wave table spawns `vlaude` on **wave 18**. One of them has to own the
`Enemy`, and it is the wave table — three things depend on it. `leakEndsRun`
compares by **def identity** against the def the wave spawns; the soak spawns
him on wave 18 and every published health figure is measured against that; and
`berthSprite` returns `null` for the damaged phase, which says in the module
that nothing is drawn at the berth once the float is over.

**So: the float plays at wave 13, ends at the west gate, and the berth is empty
from then on. The Enemy arrives with wave 18, from the gate he flew to.** The
animation and the spawn agree about where he went, which is why the float lands
on `pointAt(0)` rather than in the middle of the road.

---

## 3 — The telegraph and the schedule

`armedAt(rules, wave)` on every wave start; `tickSchedule` every frame, on the
scaled clock, with `globalCooldownSeconds` (9) as the floor between two casts.
A row that is ready but blocked keeps its readiness, so a power is delayed
rather than dropped — that is the module's behaviour and the scene does not
second-guess it.

Every cast plays `manipulations.telegraph.fx` at size 300 for exactly
`leadSeconds` (1.1), and the effect is queued to land when the telegraph
finishes. `with` fires a second power on the SAME telegraph — one warning, two
changes — which is what an authored combination is. Waves 14 and 16 carry them.

`combinationProblems(rules)` runs at level load and says so loudly (a log line
per problem and a player-visible alert). It is **empty** on the shipped
schedule, and `tests/level10.test.ts` and the harness both assert that, which
is what makes it fatal in CI rather than merely noisy at runtime.

---

## 4 — The six powers

| power | what the scene does | which module function decides |
|---|---|---|
| `buildLock` | padlocks on 3 pads for 12 s; the node stays drawn and dims to 0.35 | `lockTargets` picks, `buildable` gates, `lockedPadStillFires` is the assertion |
| `speedAlter` | ×1.45 on everything on the board for 10 s, with `icon-haste` over each | `hasteMultiplier`, `hasteSeconds`, `HASTE_OFF` |
| `duplicateEnemy` | the fx over the original, the copy inserted after 880 ms at the same place and health share | `copyTargets`, `copyCount` |
| `generateWall` | a wall at a `hazardSpot`, intact → cracked → rubble | `wallLook` returns the picture AND `blocks` from one call |
| `generateWeapon` | a hostile turret on an empty pad, holding it | `weaponPad` |
| `createEnemies` | 3 real units from the pool at 1.1 s apart, capped at 9 alive | the data's own pool and caps |

### The build lock never costs the player anything they built

**A tower on a locked pad survives, keeps firing, keeps its upgrades and keeps
its pad.** `castBuildLock` writes to `padLocks` and to nothing else — a test
greps its whole body for `build.occupy`, `build.release`, `destroyTower`,
`sellTower`, `landDisable` and `disabledFor` and fails on any of them.

The gate for NEW placement is `buildable`, asked in one place —
`GameScene.padOpen` — which **eight** build paths now go through (the ring, the
drawer, the ghost, the hover, the affordability check, the anchor, the
placement itself and the pad art). `BuildSystem.isFree` is still what
`restoreRun` asks, deliberately: a saved board must not be refused by a lock
that no longer exists.

**A locked pad stays DRAWN.** It is empty ground the player is being told they
may not use, and hiding it would say the pad had gone rather than that it was
shut. `presentation.json`'s new `buildPad.lockedAlpha` (0.35) is how dim.

### The haste is assigned, never accumulated, and is not the Performance Review

`Enemy.hasteSpeed` is a third multiplier slot beside `speedScale` and
`reviewSpeed`, multiplied into the same line. It is **assigned** — a second
cast inside the window leaves it at 1.45 rather than 2.1025, which the probe
checks — and restored by assigning `HASTE_OFF`.

It is deliberately **not** `review()`. That is permanent (`reviewed` is a
latch), once-only, and also makes the enemy 10% bigger; a temporary repeating
haste routed through it would grow every enemy it touched by 10% for good and
could never be taken off.

The icon is a **sweep**, in `syncStatusMarkers`, beside burn/control/review and
last of the four — so a body that dies mid-haste cannot leave an icon behind.
Haste is last because it is the one that comes back off by itself.

### A duplicate does not duplicate

The copy carries `copyDepth: 1` and `copyTargets` refuses anything at or above
the limit. Bosses and callbacks are excluded by id, and the id is looked up
**by def identity** through a map built from `enemies.json` itself — a name
lookup would be wrong for exactly the reason the level is funny, since the four
callbacks deliberately share their originals' names.

The probe casts once (2 copies, both at depth 1), asks `copyTargets` over a
field of copies only (0 offered), and then casts again with only copies on the
board: the population does not grow.

### The wall denies ground, and its collision clears with its picture

`blocksEnemies` is **false** and stays false: a wall that stopped Vlaude's own
walkers would be a gift — the player would let him build them and shoot the
queue. What it does is deny the ground, at exactly two places, both of which
refuse **out loud** rather than clamping the point somewhere else:

- the hero's move order (`orderHero`), and
- a garrison's rally (`orderRally`).

The picture and the collision come out of **one `wallLook` call** and are
written on the same frame, so a broken wall cannot end up drawn as rubble while
still stopping things. Verified in three frames: `prop-wall-intact` /
`blocks=true`, `prop-wall-cracked` / `blocks=true` below 0.45, and
`prop-wall-rubble-b` / `blocks=false` at zero, with `wallBlocks()` at its own
centre answering false on the same frame.

**The hero is the answer to it.** He is what the wall denies ground to, so he is
what takes it down: inside his own `attackRange` of one he swings at it on his
own interval for his own damage, less its armour. Nothing else in this game
damages a structure, so there is no second path to keep in step.

### The countermeasure suppresses a tower; it never destroys one

`turret-vlaude-countermeasure` on an EMPTY pad, holding it (`occupiesPad`), 1400
health, 8 armour, range 210, 26 damage every 1.6 s, `targetsTowers` and
`targetsHero`. Killing it pays 90 peanuts and gives the pad back, and
`icon-tower-boost` is lit in screen space while any is alive.

**IT NEEDED TWO NUMBERS THAT DID NOT EXIST, AND THEY ARE THE ONLY TWO THIS
SESSION INVENTED.** Both are in `level10.json`, both carry their own `_note`:

- **`generateWeapon.towerHealth: 420`** — this game has **no tower health**.
  Every other attack on a tower is a DISABLE: the Rainbow Reaper switches one
  off, the Glitch Bug takes one away, and neither carries a damage number. The
  countermeasure does, so there had to be something for that damage to come off.
  420 is sixteen shots, 25.6 seconds of one turret's undivided attention.
- **`generateWeapon.towerDownSeconds: 8`** — how long the tower's lights are out
  once the pool is spent, through the Rainbow Reaper's own `landDisable`, so a
  player who has met one already knows what they are looking at. The pool
  refills the moment it goes dark: **the countermeasure suppresses, it never
  accumulates and it never destroys.** The player loses a gun for eight seconds,
  which is an option rather than an investment — the same rule `buildLock` is
  held to, and a test greps `hitTowerWithCountermeasure` for `destroyTower` and
  `build.release`.

`Tower` grew no field. The pool is a `Map<Tower, number>` on the scene, spent by
this one weapon and read by nothing else.

---

## 5 — The callback portal

`fx-vlaude-recall-portal` at the spawn mouth, `callbacks.leadMs` (900) **ahead
of** the unit, for `durationMs` (880) at size 300.

**The lead is worked out from the WAVE TABLE rather than from the spawner**,
because the spawner can only ever report a spawn that has already happened. At
`startWave` the scene walks the wave's own groups, finds any whose enemy is in
`callbackOrder`, and schedules the portal at
`max(0, delay / gameSpeed * 1000 - leadMs)` — the division is because the group
delay is in simulation seconds and `delayedCall` is on the wall clock.

**DECORATION ONLY.** `recallPortal` contains no `new Enemy` and no `spawn`, a
test says so, and the probe confirms the enemy count does not move when it
plays. The art is abstract silhouettes and must not be read as containing the
unit: the four callbacks would arrive on exactly the same frames with the whole
function deleted.

---

## 6 — The ending

### Frames 0 to 6, and never the seventh

`fx-vlaude-defeat` is eight frames and the eighth is a hard-edged white
rectangle filling its cell; over this dark chamber that reads as a rendering
bug rather than as a flash. So the sheet is **played by hand**, one frame at a
time on a `time.addEvent`, and `playEffect` is deliberately not used — it would
run the clip to its end, and the end is the frame that must never be drawn.
`defeatReachedFade(rules, frame)` is the cue; on it the sprite comes off and the
wash takes over.

The probe polls the display list every 20 ms for the whole animation and records
every frame index the sprite is ever seen wearing:

```
  frames drawn as a sprite: [0,1,2,3,4,5,6]
```

### THE WHITE WASH WAS NEVER WHITE

This is the finding of the session and it is worth the space.

```js
this.add.rectangle(0, 0, w, h, 0xffffff, 0)   // ← the SIXTH argument is FILL alpha
...
this.tweens.add({ targets: wash, alpha: 1 })  // ← this animates the OBJECT's alpha
```

The rectangle reached `alpha === 1` with a fill that was still fully
transparent. **Every number about it was correct**: it existed, it was on the
fixed UI camera, its `cameraFilter` excluded the world camera, its depth was
above the results dialog, and the probe read `alpha 1.00` off it and passed. The
screen never changed colour.

It was found by looking at the picture, which is the only thing that could have
found it. The fill is opaque now and the object is faded in instead, and the
probe asks about **both** numbers and takes a frame at full opacity.

### And it is screen space, proved by panning the board underneath it

`asScreenSpace` — CLAUDE.md hard rule 4. The probe pans the world camera 400×200
and zooms it 1.4× while the wash is up:

```
  cameraFilter=1  world camera id=1  ui camera id=2  ignored by the world camera=true
  after a 400x200 pan and a 1.4x zoom: (1342, 674) -> (1342, 674)
```

`tools/harness/shots/vlaude-20-white-screen-space-*.png` is that frame: the
board has visibly moved and the white still covers the glass edge to edge,
including the letterbox.

The run ends **from inside the white** — `whiteWash` calls `endRun('won')` — and
`checkWaveOver` stands down while the defeat is playing so the results dialog
cannot open over the top of the level's own ending. That is level 9's
`delayResults` lesson applied to a different ending.

### The comics, and the credits after them

**A run has now been played to a win through all three panels, which had never
been done.** `run.sh titlecard` wins a level 10 run, walks the outro one tap at
a time, and checks each panel's texture key against `outroPanelsFor('level10')`
in order. A LOSS plays nothing: the probe loses a run first and checks that
neither `Cutscene` nor `Credits` is running.

**The credits now roll from the end of the comic sequence, and they did not
before.** `CreditsScene` was reachable only from the title screen. It takes a
hand-over target now, `CutsceneScene` carries a `thenData` for the next hop, and
`leaveWon` asks `nextLevelId(...) === null` — *is the game over* — rather than
comparing a level id. The button the player actually pressed is carried through
both: LEVEL SELECT → comic → roll → **world map**, not the title screen.

---

## 7 — The title card, and a hook that makes no sound

`cutscenes/titlecard_level10.webp` has been on disk since the asset pass and
nothing played it. It plays full-screen before the level now, **held 4,200 ms**
— about twice a comic panel's reading beat, which is the joke: the machine has
taken the title card as well — and it advances **itself**, though a tap still
works. A card is shown, not read.

It is drawn by `CutsceneScene`, which already fits a 16:9 picture to any
viewport and preloads it; teaching a second scene to do the same would be two
places holding one layout. The chain is **card → comic → level**, so a level
with both gets the order for free. Level 10 has no opening comic, so today it is
card → level.

It is **not** filed in `cutscenes.json`. That file's two maps mean "what plays
before" and "what plays after", and every reader of them — `panelsFor`,
`shouldPlay`, `cutsceneProblems`, the loadout hand-over — means exactly that. A
title card is neither, and a test asserts it appears in neither map.

### The "Oh boy" clip does not exist

**No clip was recorded, none was generated, and no other line was substituted
for it.** A stand-in voice would be a lie about whose voice it is, in a game
whose `ATTRIBUTIONS.md` names the three people who actually recorded one.

The beat is **wired** and the hook is **named**: `level10.json`'s
`titleCard.audioCue` is `"vlaude-oh-boy"`, and `LoadoutScene.titleCardCue` logs
it at the exact moment it would have played, where a crash report or a soak log
will show it. It is deliberately **not** routed through `Audio.play`, whose
`Cue` type is `keyof audio.json`'s cues — wiring it would have needed a fake row
for a file nobody recorded. A test asserts `audio.json` has **no** row for that
cue, so the day a clip is recorded, the test fails until somebody wires it
through `play()`.

---

## 8 — The re-soak

### The number

**Vlaude is 26,000. 195/480 = 40.6% on normal, Cory on every seed.**

`node --experimental-strip-types tools/soak/tune10.ts 480 level10 normal cory`,
which is the method every published per-level figure in `SOAK-REPORT.md` uses —
measured rather than assumed: the same driver returns level 8's published
200/480 and level 9's 191/480 as the same integers. **No hero's values were
touched.**

| Vlaude health | 20,000 | 22,000 | 24,000 | **26,000** | 28,000 |
|---|---|---|---|---|---|
| win rate (480, normal, Cory) | 66.0% | 56.9% | 48.3% | **40.6%** | 35.6% |

The coarse 120-seed pass that found the knee: 10,000 → 91.7%, 14,000 → 88.3%,
20,000 → 60.8%, 22,000 → 50.0%, 23,000 → 45.8%, 24,000 → 40.8%, 25,000 → 34.2%,
26,000 → 32.5%, 36,000 → 12.5%.

**120 AND 480 DISAGREE BY EIGHT POINTS ON THE CHOSEN VALUE** — 26,000 reads
32.5% over 120 and 40.6% over 480. `tune10.ts`'s own header warned about a
6.4-point swing; this is bigger. Iterate at 120, publish only at 480.

**The old 36,000 was not wrong; it was measured on a different level.** It was
taken with Vlaude walking the lane and not one manipulation firing. At 36,000
with the powers live, the same 120-seed pass reads **12.5%**. The board did not
change and the boss did not change — the level now does what its data always
said it did.

### THE CAVEAT, STATED PLAINLY

**The runner fires three of the six powers and cannot express the other three
at all.** This is read out of the source rather than asserted.

| power | in the sim | why |
|---|---|---|
| `speedAlter` | **yes** | a third multiplier slot on the sim's enemy, beside `speedScale` and `reviewSpeed`, through `hasteMultiplier` / `HASTE_OFF` / `hasteSeconds` |
| `duplicateEnemy` | **yes** | through `copyTargets` and `copyCount`, copy at depth 1, so a duplicate cannot duplicate in either |
| `createEnemies` | **yes** | real rows from the pool, at the gate, staggered and under `maxAliveFromThisPower` |
| `buildLock` | **no** | `BuildSystem` models `occupied` and nothing else. There is no lock state for `isFree` to read; the nearest thing it has is a Glitch Bug *destroying* a tower, which frees a pad and can never forbid one |
| `generateWall` | **no** | the sim's hero is a fixed point at `totalLength * 0.5` and never moves, so ground denied to the hero and to a garrison is invisible to it |
| `generateWeapon` | **no** | there is no tower health, so a turret that suppresses a tower over time is a third thing it cannot say |

Teaching it those three is a change to the SIMULATOR rather than to the level
and **was decided against deliberately**, on the brief's own instruction. The
sim *counts* the casts it cannot answer rather than approximating them, and a
test greps it for `towerHealth`, `towerDownSeconds`, `padLocks` and
`wallBlocks` so it cannot quietly start pretending.

**So 26,000 is tuned against a board that is EASIER than the one the player
gets, and the real fight is harder than 40.6%.** Quote the number with that
sentence attached or do not quote it. It is in `SOAK-REPORT.md` and in
`enemies.json`'s `_health` in those words.

The three that DO run go through the same `systems/Vlaude.ts` functions
`GameScene` calls, so the pacing, the global cooldown, the two combination rows
and the no-duplicate-of-a-duplicate rule are one implementation and not two.

### Levels 1 to 9, same seeds, nothing moved

| level | published | this pass | |
|---|---|---|---|
| level1 | 428/480 (89.2%) | 428/480 | identical |
| level2 | 255/480 (53.1%) | 255/480 | identical |
| level3 | 422/480 (87.9%) | 422/480 | identical |
| level4 | 299/480 (62.3%) | 299/480 | identical |
| level5 | 218/480 (45.4%) | 218/480 | identical |
| level6 | 210/480 (43.8%) | 210/480 | identical |
| level7 | 198/480 (41.3%) | 198/480 | identical |
| level8 | 200/480 (41.7%) | 200/480 | identical |
| level9 | 191/480 (39.8%) | 191/480 | identical |

`vlaudeRules` answers null on all nine, so `tickVlaude` returns on its first
line there. **Levels 1 and 3 are still outside the band at 89% and 88%** —
pre-existing, carried forward again, untouched.

### What the leaks say

At 26,000 over 480 seeds: `vlaude` 258, `packet` 247, `dataBug` 219,
`serverWalker` 189, `corrupt` 137, `mashDroneCameraman` 25. Before, with
nothing firing: `vlaude` 281, `packet` 164, `corrupt` 107, `dataBug` 92.

**The escort's rank order changed and that is the powers showing up in the
numbers.** Level 9's units now get through in counts within thirty of the boss
himself, because something is hastening them, doubling them and adding to them.

---

## Verification

| what | result |
|---|---|
| `npm test` | **1136 pass, 0 fail** (1122 before, 14 new) |
| `sh tools/tsdiff.sh ffea4aa` | 213 → 214: **one** introduced line, `CutsceneScene.ts` `Property 'time' does not exist` |
| `sh tools/harness/build.sh` | staged 131 modules |
| `sh tools/harness/run.sh vlaude` | **88 assertions, 0 failures** at 1400×708, 844×390 and 667×375 |
| `sh tools/harness/run.sh titlecard` | **20 assertions, 0 failures** at 1400×708 and 844×390 |
| `sh tools/harness/run.sh levelart` | level art complete on every level; 92 keys asked for, 92 resident on level 10 |
| `sh tools/harness/run.sh screens` | unchanged from the previous session's baseline — see below |
| CI | runs 378, 379 and 380 **green** |

**The one tsdiff line is cascade, and it is the kind CLAUDE.md warns about.**
`Scene.time` is public Phaser API and every other scene in this repository uses
it; without `node_modules` the base class is unresolved, so a new member access
on it produces a fresh error line locally. It is named here rather than filtered
out, because the file's own header says a line mentioning a Phaser type can be
either cascade or fault and has to be read rather than counted.

### `screens`, at the three viewports

- **667×375** — 1 fault: `Title [title:version-stamp (hidden dev door, not a tap target)]`
- **844×390** — 1 fault: the same stamp
- **1280×720** — clean

Both are pre-existing, annotated by the scenario itself as not a tap target, and
identical to what `reports/2026-09-14-level-10.md` recorded.

### FROM RENDERED FRAMES

**Every one of these came from a picture and/or a live scene read, and the
previous session could check none of them because none of them existed.**
Reproduce with `sh tools/harness/build.sh && sh tools/harness/run.sh vlaude 400`
and `... run.sh titlecard 300`.

| claim | how, and the frame |
|---|---|
| Vlaude sits at the crystal core in chat mode and cannot be damaged | `vlaude-1-berth-chat-*.png`, and `levelart-level10-*.png` shows him from the plain level-art pass. `enemy-vlaude` at (1042, 276) against a berth of (1041.5, 269) — the 7 px is the bob — at 202 px. A tower built on the nearest pad finds **0 enemies** on the board |
| he swaps to the code form at wave 7 and still cannot be damaged | `vlaude-2-berth-code-*.png`. `phase code`, `sprite enemy-vlaude-code`, `targetable() === false`, 0 Enemies |
| the float plays at wave 13, is invulnerable throughout, and he becomes targetable exactly on lane contact | `vlaude-3-float-hold`, `vlaude-4-float-travel`, `vlaude-5-float-landed`. **17 samples over 4,745 ms; targetable at any point: false; an Enemy at any point: false**, and `targetable()` true on the frame after |
| he hovers, casts a shadow, and is hit by anti-Glider fire | `vlaude-6-on-the-lane-*.png`. `glides: true`, `layer: undefined`, **3 children** with a visible `Image` shadow first, and a tower's damage path takes him 26000 → 25510 |
| reaching the exit ends the run immediately, before any life is deducted | `vlaude-7-exit-ends-run-*.png`. **lives 20 → 20, phase `lost`**, against a `livesCost` of 19 that is never charged |
| each of the six powers telegraphs, lands, shows its icon, and restores | `vlaude-8` … `vlaude-17`. `powers fired in a rendered frame: all six`. The telegraph queues `["buildLock","speedAlter"]` landing in 0.89 s; the haste marker is `haste`; the padlocks are 3 sprites on 3 pads; the countermeasure light is `icon-tower-boost` and goes out with the last turret |
| a tower on a locked pad survives and keeps firing | `vlaude-8-build-lock-*.png`. alive=true, pad still occupied=true, `lockedPadStillFires()`=true, and the enemy on the road in front of it drops to **61/72** |
| a duplicate does not duplicate | `vlaude-10-duplicate-*.png`. 2 → 3 on the board, **2 marked at depth 1**; `copyTargets` over copies only offers **0**; a second cast with only copies on the board does not grow it |
| a wall reaches rubble and clears its collision | `vlaude-11`, `-12`, `-13`. intact/blocks=true → cracked/blocks=true → **rubble-b/blocks=false**, with `wallBlocks()` at its own centre false on the same frame |
| a countermeasure is destroyed and pays peanuts | `vlaude-14`, `-15`. `turret-vlaude-countermeasure` on pad 1, 17 shots put `Slingshot` out for 8 s **without destroying it**, then **+90 peanuts and pad 1 free** |
| the defeat draws frames 0–6 and NO white rectangle sprite | `vlaude-19a-defeat-frames-*.png`. Polled every 20 ms: `frames drawn as a sprite: [0,1,2,3,4,5,6]` |
| the white fade is screen space and survives a camera pan | `vlaude-20a-white-full-*.png` (the whole glass white, letterbox included) and `vlaude-20-white-screen-space-*.png` (the board panned 400×200 and zoomed 1.4× underneath it, the wash unmoved at (1342, 674)) |
| comics play in order on a win and not on a loss, and the credits follow | `titlecard-3-loss-no-comic`, `titlecard-4-won`, `titlecard-5-outro-1/2/3`, `titlecard-6-credits`. A loss reaches neither scene; a win walks all three panels in `cutscenes.json`'s order and hands over to a roll of 460 objects, itself bound for `WorldMap` |
| the title card plays before the level | `titlecard-1-card`, `titlecard-2-into-the-level`. BEGIN → the card, `holdMs 4200`, covering 83% of a 1400×708 viewport and 71% of 844×390, advancing itself after 3,944 ms **with no tap** |

### Every effect sheet is inside the level's own art list

`freeLevelArt` passes `levelArtKeys(level.id)` to `forgetEffectAnims` and then
removes the same textures, so a sheet **inside** that list is handled by
construction. All five are:

```
effect sheets: fx-vlaude-defeat fx-vlaude-duplication fx-vlaude-generation
               fx-vlaude-path-change fx-vlaude-recall-portal
outside this level's art list: none
```

Checked three ways: in `GameScene.checkVlaudeData` at level load (loud, not
fatal), in `tests/level10.test.ts`, and in the harness against the live
manifest.

### What was NOT checked

- **A full unassisted playthrough of all eighteen waves in the browser.** The
  probe drives the board by hand — it sets the wave index, holds the wave open
  and calls the powers directly — which is how level 9's scenario works and is
  the only way to reach wave 18's state in under a minute. What a player's own
  run feels like across eighteen waves is still unmeasured by anything but the
  soak, and the soak cannot see three of the powers.
- **The deploy artifact.** `deploy` runs on `refs/heads/main` only, so it cannot
  be built from a branch. Nothing here adds an asset, so the level 10 report's
  estimate of about 58.4 MB stands unchanged.
- **The per-level budget.** Unchanged for the same reason: no new art. Level 10
  keeps its 0.29 MB of headroom.
- **Portrait.** Gated, as always — the rotate overlay shows and the screens
  behind it are not a player-facing layout, which is the correct answer for a
  landscape-only game rather than a skipped check.

---

## What the repository contradicted, and what was changed because of it

1. **"Already on main" — no.** See the section at the top. `main` is `692a1fc`
   and has none of level 10.
2. **The float vs. the wave-18 spawn.** Resolved in favour of the wave table,
   with the reasoning written out above.
3. **The title card's numbers were promised to `presentation.json` and are not
   there.** `cutscenes.json`'s `_level10` note says *"presentation.json's
   `titleCard` says how long it holds"*; `presentation.json` has no `titleCard`
   key and never had one. The block is in `level10.json` instead, which is what
   the brief asked for, and `cutscenes.json`'s note has NOT been rewritten —
   it is a prediction that turned out differently and is worth more as a record
   than as a tidy sentence. Anyone reading it should look in `level10.json`.
4. **Tower health does not exist.** Two numbers were added for it; see section
   4. They are the only two this session invented.
5. **`gliding` was unreachable on level 10, which is a real latent bug and is
   fixed.** `glides` costs an enemy two things — ground hazards and ground slow
   miss it — and both were read off `NightRules.gliding`, which is **null for
   any level without a day/night block**. Level 10 has no sky. So the flag on
   Vlaude and on the Content Drone did nothing at all, on the one level whose
   BOSS hovers. `GameScene` reads the block off `levelRules` directly now;
   level 5 gets the same object out of the same file, and its 218/480 is
   unchanged.
6. **The `ASSERTS_NOTHING` list the brief quoted was right and matches the
   repository**: five — `muzzle`, `rockets`, `retreat`, `regressions`,
   `meteor`. `poor` still exits `UNKNOWN SCENARIO`. `ui`, `buildall` and
   `typegame` all run and assert. Nothing to correct.
7. **`enemies.json`'s old `_health` note said the runner "cannot answer any of
   them"; `reports/2026-09-14-level-10.md` said three of six.** The report was
   right, and the note now agrees with it and names which three.
8. **`icon-build-locked`, `icon-haste` and `icon-tower-boost` are BOOT art, not
   level art.** `level10.json`'s `hud._note` calls them "art this level already
   ships", which is true but reads as though they arrive with the level. They
   do not: they are in the boot manifest, which is why the fight can draw them
   without adding a key to `levelArt.byLevel`.

---

## Where this leaves the repository

**IN FLIGHT:** branch `claude/vlaude-fight-scene-jrb368`, eighteen commits,
green on runs 367, 368, 370–373, 376, 378, 379 and 380, fast-forwardable onto
`main`.
It carries the asset pass, the level, and now the fight.

1. **`main` is `692a1fc` and has none of it.** Three sessions' work is on one
   branch. The merge command is the first line of this session's reply.
2. **The 26,000 is a three-of-six figure.** Do not compare it to levels 1 to 9
   without the caveat. The real fight is harder than 40.6%, by an amount nobody
   has measured.
3. **`BuildSystem` still has no lock state and the sim's hero still never
   moves.** Fixing either is a change to the simulator, not to the level, and
   it is the only way the other three powers ever reach a win rate.
4. **The results screen still says "More levels coming soon" at the end of the
   story.** `endRun`'s `noMore` branch is reached exactly when `nextLevelId` is
   null, which is now the moment a player finishes the game — and
   `levels.json`'s `_plannedLevels` says ten is the final scope. It is
   pre-existing and was not touched; it is a one-line string and a tone
   decision, and the tone decision is not this session's to make.
5. **The wall is broken by the hero and by nothing else.** No tower shoots a
   structure, because no tower in this game ever has. If the wall should be
   shootable, that is a change to `Tower.tick`'s target list and it is not a
   small one.
6. **`icon-route-locked` is still registered and drawn by nothing**, and the two
   route-gate props are still unconverted in `art-source/level10/`. Route
   switching was cut. All three are named in `level10.json`'s `hud._unused` so a
   sweep finds a sentence rather than a candidate.
7. **The "Oh boy" clip is still the only missing asset in the level**, and the
   hook is named, wired and silent. A test fails the day a row for it lands in
   `audio.json` without a `play()` beside it.
8. **The deploy artifact size is still unconfirmed**, for the third report
   running: `deploy` cannot run on a branch.
