# Level 3 — Sports Complex at Dusk

The first branching level, its cast, its boss ability, and what its difficulty
turned out to be limited by.

## Commits

| Commit | What | CI |
| --- | --- | --- |
| `23fc731` | Build level 3: the fork, its cast and its waves | ❌ asset budget only |
| `45ab91a` | Check level 3 against the plate it was drawn on | ❌ asset budget only |
| `c685efb` | Let the Rainbow Reaper switch the board off | ❌ asset budget only |
| `56bd234` | Put level 3 on the world map, and tune what can be tuned | ❌ asset budget only |

All pushed; `origin/main` is `56bd234` and the working tree is clean.
`npm test`: **707 tests, 706 pass**. The single failure is
`the deploy stays small enough to open on a phone`, red since `c9ea190` and
nothing to do with this work — see *Where this leaves the repository*. Every
one of the four CI runs failed on `npm test` and nothing else, which is that
one assertion. Note CI's `npx tsc --noEmit` step is **skipped** when tests
fail, so it has not run since `c9ea190`; the typecheck evidence here is local
`tsdiff`, which was clean at each commit.

---

## What level 3 is

Two gates on the left edge, whose lanes run separately and merge into a shared
tail before the exit. Fifteen pads, five new enemies, and a boss that switches
towers off instead of hitting them.

Every coordinate comes from `tools/level3_geometry.json`. Two things were
computed rather than copied, and both are recorded in `map_level3.json`'s own
notes:

- **The off-plate gateway points.** One at each gate and one at the exit, each a
  new point on the line the lane is already travelling as it reaches the edge —
  level 2's method, so enemies walk in and out rather than appearing.
- **The branch-end snap.** The traced branches stopped 3.26px (upper) and 8.47px
  (lower) short of the declared merge. A branch that does not end at the join
  makes an enemy step sideways as it transfers, so both were snapped onto it.

**The two routes are the same length: 1560.18 and 1560.15 px, gate to exit.**
That is in the geometry rather than arranged, and the wave table leans on it —
groups released from both gates on the same delay *arrive together*, so a split
wave is a two-front problem and not a queue.

It is also the **short** level: 1560 against level 1's 1976.9 and level 2's
1955.3, which is 21% less road and 21% less time under fire for the same health.
Its wave spacing is not copied from theirs and its health total is not directly
comparable to theirs.

### The cast

| id | name | hp | armor | speed | peanuts | lives | render |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `pompom` | Pom-Pom | 78 | 0 | 122 | 9 | 1 | 66px |
| `longsnap` | Long Snapper | 150 | 3 | 62 | 15 | 1 | 74px |
| `catcher` | The Catcher | 260 | 8 | 34 | 26 | 2 | 85px |
| `zamboni` | Zamboni Wraith | 520 | 12 | 26 | 48 | 3 | 85px |
| `unicornBoss` | The Rainbow Reaper | 9800 | 6 | 30 | 1800 | 15 | 140px |

Nothing existing changed. `tools/measure_art.py` measures the new art now: its
uniform scale exists to hold the Kenney-derived cast at one size relative to
each other and is derived from a 226px source, so applying it to art drawn at
880–1240px would put Pom-Pom on screen at 257px — four times the size of the
Bruiser she runs beside. The five carry explicit heights instead.

---

## The checker

`tools/check_level3.py` re-derives the geometry file's numbers off the painted
plate and reports where they disagree, failing over 3%.

- **Road width** — normals cast off each lane's centreline through the painted
  track, median per lane, and the **narrowest lane's** median is the answer. The
  road has to fit its tightest stretch, which is level 2's own stated rule.
  Comes out **55.0 against a declared 54.6 — 0.73%**. Measured lane by lane the
  shared tail reads 63.5 and the lower branch 69.0: the track there runs beside
  painted field markings and a pale apron no colour test separates from it. That
  is a limit of the measurement, not a wider road.
- **Branch lengths** — a geodesic through the painted track, penalised for
  running near the band's edge so it tracks the middle instead of clipping
  corners, then box-filtered (an unsmoothed 8-connected walk measures ~3% long
  on diagonals).

Hue does the classifying, not brightness: the dusk vignette darkens the track at
both gates and at the exit without changing what it is, and a brightness floor
loses exactly the ends the lengths are measured from.

`--overlay` draws the traced lanes and the pad cores back onto the plate.

### It found a real error on its first run

The geometry file shipped `lengths` of **upper 1366.5, lower 1395.5**. Its own
waypoints walk **1347.3 and 1333.6**; the plate traces **1351.6 and 1347.9**.
Two independent measurements agreeing to about a percent, both disagreeing with
what was declared — and the declared pair also has the two routes 29px apart
where every measurement says they are equal to a fraction of one.

Corrected, with the originals and the reasoning kept in the file's `_lengths`
note. **The coordinates were not touched**: a derived figure was brought into
line with the geometry it is derived from, which is exactly what happened to
level 2's 1916.7.

### The pads

All fifteen pass on their own terms, and the overlay confirms it by eye:

- **91.7 to 112.0 px** from the nearest lane, against a required 90–114 band and
  a shortest shooting tower of 132. This is the check level 2 shipped without,
  and its absence is why level 2 soaked 0 of 60.
- **Closest pair exactly 74.0**, over the 68 that `spotRadius` needs.
- **Worst non-turf blob in any 24px core is 14px** — scattered grass detail, not
  an object. Nothing stands on the track, the bleachers, a bench, the fence, a
  goal, the pool, a light pole, the cone or the football.

The plate ships as `.webp` and `tools/png.py` reads PNG, so `tools/decode/` was
added to put one through Chromium — the same machinery as `tools/reencode` and
`tools/mapcards`. It decodes at **canvas resolution**, since the map's
coordinate space is the 1280×720 canvas and the plate is exported at 3×. The
output is gitignored scratch.

---

## The boss ability

An optional `towerDisable` block makes an enemy a caster — data, reusable by any
boss. The Reaper: every 7s, a 1s telegraph, 3.5s of darkness, 260px reach.

**What it takes** is the most expensive tower in reach, where expensive means
peanuts actually sunk in (`investedIn`, so every tier and the spec count). That
is what makes it interesting rather than annoying: a cheap tower upgraded twice
outranks a dear one left at tier 1, so it punishes *concentration* and the
answer is spreading the investment. Ties go to the tower furthest along the
lane, measured as **road left to the exit** rather than road travelled — on a
fork the branches have their own zero, so "how far it has come" is not
comparable across them and "how much is left" is.

**The windup is the mechanic.** A disable that landed instantly would read as
the game breaking. So the bolt *is* the telegraph: it launches when the windup
starts, flies for exactly the windup, and lands when the disable does, with a
ring closing on the target. The target is chosen when the windup *starts*, so
what the telegraph points at is what goes down.

**Switched off means the reload stops too.** `Tower.tick` returns before the
cooldown runs and hands out a fresh interval on recovery, so 3.5s off costs 3.5s
*plus* a full reload. A disabled Shelter's aura goes dark with it.

Neither sheet loops seamlessly, so neither is asked to cycle: both play once,
and the overlay then holds its last frame pulsing its **alpha** — motion for the
whole duration with no seam.

One thing recorded rather than papered over: each countdown crosses zero a frame
late on floating point (7.0 minus 0.1 seventy times is +4e-16), so a cast cycle
is 8.2s rather than 8.0s. It is the same `> 0` the tower cooldowns already use.

---

## The simulator had to learn about forks first

`tools/soak/Sim.ts` walked one lane, and its own comment said this was the
change to make when a branching level existed to soak. It does now.

It takes the game's own `LaneNetwork` and `advance` rather than a paraphrase, so
a merge means one thing in both. Pads are measured against **every** lane: on
level 3 the trunk is the shared tail alone, so a pad covering the upper gate is
400px from "the lane" and the scripted player would never build it — the level 2
pad-range failure in a new disguise.

**That change found a real bug in the Haymaker.** Knockback wrote `distance` and
not `laneDistance`, so once position came from the lane-local number the punch
stopped moving anything: it lowered the target's priority and left it standing.
Levels 1 and 2 soaked 34/60 and 0/60 with the split in and the knockback not
fixed, against 47/60 and 7/60 before. With both distances moved, as `Enemy.ts`
does it, they are back to 47/60 and 7/60 with identical loss distributions.

---

## Difficulty: what was tuned, and what it ran into

### The numbers

**Before: 0 of 60. After: 0 of 60.** The curve changed a great deal and the win
rate did not move, because the win rate is not decided by anything the curve
controls.

What the curve *did* change is the rank game, and it is now healthy:

| | first version | shipped |
| --- | --- | --- |
| reach the boss | 45/60 | **44/60** |
| arrive with full lives | — | **24/60** |
| lost a life by wave 4 | 13/60 | 0/60 |
| total health | 32786 | 28470 |
| peanuts per point of health | 0.1265 | **0.1334** |

The opening is 150 against level 1's 330. Level 3 asks a player to cover **two
gates** from one purse, on a lane 21% shorter, with the fastest enemy in the
game as its filler.

The curve was not hand-fitted. A search ran every (start, growth) pair and kept
those whose *generated* waves satisfy every shipped test — the 0.130 purse
floor, no step over 55%, no wave lighter than the one before, the boss inside
80%, the heavier gate changing hands. Forty-four pass; this is the best of them
on "reaches the boss intact". Reproduce with `python3 tools/gen_waves3.py`.

### Why the band is unreachable with the allowed levers

| | boss | hp | armor | speed | lane | under fire | dps needed | wins |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| level 1 | The Politician | 4600 | 0 | 22 | 1976.9 | 89.9s | **51.2** | 47/60 |
| level 2 | The Devil | 6200 | 4 | 26 | 1955.3 | 75.2s | **82.4** | 7/60 |
| level 3 | The Rainbow Reaper | 9800 | 6 | 30 | 1560.2 | 52.0s | **188.4** | 0/60 |

3.7× level 1's requirement, before armour. Holding everything else and moving
only the Reaper's health, 60 seeds a point:

| boss hp | 9800 | 6200 | 4600 | 3200 | 2800 | 2400 | 2000 | 1600 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wins of 60 | 0 | 0 | 0 | 6 | 19 | **34** | **42** | 49 |

**The 35–45 band is a Reaper of about 2000–2400 health.**

Note it is still 0/60 at 4600 — level 1's *own* boss. So this is not only the
9800: level 3's board is poorer than level 1's (2700 peanuts earned against
4139) and has half the time to use it. The economy test caps rank income at
about 2885 for this cast, which is level 1's 2835, while level 3 needs perhaps
twice the board.

So the target cannot be reached with the levers this task allowed. Enemy counts
and per-wave health scaling change how many runs *reach* the boss; nothing in
either changes what happens when they get there. The levers that would are the
Reaper's health, speed or armour — all enemy base stats, all explicitly out of
scope. **Reported rather than reached past the brief for.**

### The purse shaped the waves more than taste did

Every rank-and-file enemy on this level pays less per point of health than any
on levels 1 and 2 — pompom 0.115, longsnap 0.100, catcher 0.100, zamboni 0.092,
against level 1's 0.121/0.175/0.129. `rules.json` is shared, so the Reaper's
1800 is the only thing holding the average over the 0.130 line `content.test.ts`
requires, and more rank health *dilutes* him. That puts a **ceiling** on total
rank health of about 25500 — the opposite of the direction difficulty usually
pushes — while wave 12 has a **floor** of 5445 because a boss wave may only be
80% heavier than the one before it. Between them the curve must be steep, and
Pom-Pom must be about two thirds of the health in the run.

---

## Deviations from the brief, and why

1. **`runsClearedToUnlock` is 2, not the 1 the brief named.** The two halves of
   the brief disagree: it also asks to confirm level 3 is locked until level 2
   has been cleared once and open after. 1 is level 2's *own* threshold, so at 1
   both open together — and START RUN, which asks for the furthest unlocked
   level, would walk a player who has just finished level 1 straight past level
   2 into level 3. At 2 the confirmation holds. One line in `levels.json` puts
   it back and its note says so. Neither value can gate on level 2
   *specifically*: the save counts runs, not which levels they were on.
2. **The geometry file's `lengths` were corrected**, as above. Coordinates
   untouched.
3. **Six tests changed.** Each encoded something that was a fact about levels 1
   and 2 rather than a design law, and each is updated with its reasoning rather
   than relaxed: the enemy-size bound now covers the rank and file (and gains
   the never-checked property that a boss outsizes its escort); Depreciation is
   held to the cast it was tuned against, because raising `maxArmorShred` from 7
   to 12 is a 71% buff landing on levels 1 and 2 to make a level 3 enemy legal;
   "three fightable types" became a floor; the role check groups by role instead
   of keying by it (it had been silently discarding one of two armoured types)
   and is scoped per level; the shadow floor moved 0.25 → 0.20 for Pom-Pom,
   whose arms span the canvas and whose feet are 222px of 896; and the
   tick-ordering check looks for the *firing* cooldown now that recovery hands
   out a second one.

---

## Where this leaves the repository

### Blocked — the asset budget, and the deploy behind it

`main` has been red since `c9ea190`, and because `deploy` is gated on `checks`,
**the deploy job has been skipped on every commit since**. The last successful
deploy was `0c3abc1f`. Nothing in this report is on the live site, and neither
is the world map screen, branching lanes, air/ground targeting or summons.

| | assets |
| --- | ---: |
| `8ec7086` last green baseline | 34.5MB |
| `0c3abc1f` last successful deploy | 38.0MB ✅ |
| `6507abd` after the uploads | 48.6MB ❌ |
| `d3598ce` six cutscene stills | 50.4MB ❌ |
| `7e0bd71` six dummy tower PNGs | 53.9MB ❌ |
| cap | 40MB |

It is still climbing: three more upload commits landed while this work was in
flight, adding 15.9MB between them.

This is uploaded art, not mine — level 3 added only a 35KB card. Two remedies,
either of which I can do on a word:

1. **Move `public/assets/maps/L3_trace.png` (2.12MB) to `tools/`.** It is a
   tracing overlay, not a shipped asset; `map_level2.json`'s note sets the
   precedent. Not enough on its own.
2. **Re-encode the seven uploaded PNGs to WebP** via `tools/reencode`. On past
   ratios that is roughly 10.6MB down to 1–2MB, which clears the cap.

### Waiting on a decision

- **Level 3 is 0/60 against a 35–45 target**, and the gap is the boss rather
  than the waves. The band is a Reaper of about 2000–2400 health against the
  9800 specified. Changing that is an enemy base stat and was out of scope here.
- **Level 2 is 7/60** against the same band, unchanged, for the same reason.

### Carried forward

- **`Levels.isLevelCleared` is derived, not recorded.** The save counts runs
  cleared, not which levels they were on. Fixing it needs a new save field and a
  migration.
- **`tsdiff`'s blind spot for files new since the baseline** now covers
  `TowerDisable.ts` as well as `Lanes.ts` and `AirCover.ts`. All three are
  Phaser-free by design, so it holds — by convention rather than by a check.
- **Art sizing against rule 7.** The five new sprites are 880–1240px sources
  rendering at 66–140px, which is 7.1× for the boss (right on the formula) but
  12–17× for the four mascots. The brief fixed the render heights, so the fix is
  smaller sources; re-encoding them would serve rule 7 and the asset cap at
  once.
