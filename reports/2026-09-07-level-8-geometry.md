# Level 8 — "The Optimization" — map geometry

Geometry and a report only, as briefed. No level, no enemies, no wave table.

## Commits

| commit | what | CI |
| --- | --- | --- |
| [`3ab4ba6`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/3ab4ba6) | Derive level 8's map geometry off the plate | [green](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34162597775) |
| [`eb2050a`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/eb2050a) | This report | [green](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34162746703) |

Branch `claude/courjahan-defense-level-5-pto190`. Not on `main` — see **How to
land it** at the bottom.

## The three things asked for up front

**Nineteen pads.** Not fourteen, and not forced toward it. That is what levels
3 and 4's own rules give on this board: a radius-24 core entirely on classified
carpet, 90–114 px from the shipped centreline, 74 px apart, taken best-first by
uncovered lane. Nineteen is more than levels 3 and 4 carry, and the reason is
that the board is bigger, not that the rules were loosened — level 3 has 2681 px
of road for 15 pads and level 4 2689 px for 14, which is 179 and 192 px of road
per pad; level 8 has 4036 px for 19, which is 175. The pads reach 71.3% of the
route (76% of the shared spine, 77% of the south branch, 36% of the short east
branch).

**Two-exit support is NOT on `main`.** It exists, it works, and the sim models
it — `chooseContinuation`, `pickAt` and `routePick` in `src/systems/Lanes.ts`,
mirrored by `routePick` in `tools/soak/Sim.ts` and carried through spawns,
splits and summons — but all of it is on this branch. `origin/main`'s
`src/systems/Lanes.ts` is at `60d0029` and has no `chooseContinuation`, no
`laneDefs`, and a `validateLanes` that still enforces exactly one terminal. It
would reject a two-exit map outright. **Level 8 cannot be built until this
branch merges**, which is the same dependency Level 6 has.

**Level 8 is unreachable, and the gap is two levels wide, not one.**
`levels.json` runs `level1 → level2 → level3 → level4 → level5` and stops.
Level 6's rules and waves exist on this branch but it has no `levels.json` row
(it is waiting on its plate). Level 7 does not exist in any form, and I have not
invented one. `Levels.isLevelUnlocked` reads a single `unlockedBy` id and
`nextLevelId` finds the level whose `unlockedBy` names this one, so the roster
is a strict chain — and `tests/levels.test.ts` enforces it three ways: every
`unlockedBy` must name a level in the roster (line 42), the prerequisite must
appear earlier in the array (line 48), and the whole chain must walk back to the
one level with `unlockedBy: null` (line 75). A `level8` row with
`unlockedBy: "level7"` therefore fails the suite the moment it is added.

Two ways forward, and this is Cory's call:

1. **Ship it unregistered**, exactly as Level 6 is now: the rules, map, waves
   and tests land, no `levels.json` row, and a test asserts the row is absent
   with the reason. Nothing is reachable, nothing is broken, and the row is one
   line whenever 6 and 7 exist.
2. **Register it behind Level 5** — `unlockedBy: "level5"` — which passes the
   suite and makes it playable now, at the cost of the story running 5 → 8.

I would take (1). It is what Level 6 already does, it does not encode a
progression nobody has designed, and it does not need to be undone later.

## What the plate says

Plate: `art-source/Courjahan_Defense_Level8_4K.png`, 3840 × 2160, fitted to the
1280 × 720 canvas. An abandoned corporate office floor — warm tan dirt track
over flat muted blue-grey carpet, with desks, filing cabinets, cabling, server
racks, robot carts, signage, the Performance Review gate and two hazard-striped
conveyors on it.

| | traced | brief | |
| --- | --- | --- | --- |
| road openings | 3 | 3 | ✓ |
| west opening centre | y 116 = **16.0%** of height | 16% | ✓ |
| east opening centre | y 544 = **75.6%** of height | 75% | ✓ |
| south opening centre | x 1076 = **83.9%** of width | 85% | ✓ |
| south mouth width | 153 px = **3.00** road widths | ~2.8 | ✓ |
| road width | **51** (shared spine median; the checker gets 50) | ~50 | ✓ |
| total road length | **4036** | ~4554 | **11.4% short** |

One entrance (west), a fork at **(1072, 356)** immediately past the Performance
Review gate, and two exits. Shared spine 1328.8 px, east branch 391.6, south
branch 2315.2. The east route is 1720.5 end to end and the south 3644.0 — the
south is **2.1×** the east, which is the level's whole shape and worth knowing
before the wave table is written.

The south mouth's centre, x 1076, is the terminal, as briefed. Its width is not
a road width and is kept out of the median; left in it drags the figure up by a
third.

### The road length does not agree with the brief, and the mask is not why

The brief says to stop and say so rather than proceed if a trace is more than 5%
off either reference. The width lands on 50–51 either way. The length does not,
and here is everything I have:

| measurement | method | result |
| --- | --- | --- |
| shared + east + south | tracer's geodesic, point-sampled mask | **4035.7** |
| road pixels ÷ road width | touches no trace at all | **4066** |
| shared + east + south | checker's geodesic, area-averaged mask | **3836.1** |
| road pixels ÷ road width | checker's mask | **4218** |
| — | the brief | **4554** |

Four measurements, two independent code paths, two differently-built masks. They
span 3836–4218 and every one of them sits 7–16% under 4554. Against that:

- the three frame openings land where the brief says to within 1.1% of the
  frame,
- the road width lands on the brief's figure,
- the road is a single connected component of 207,395 px with nothing else
  larger than 1960 px (which is the stack of cardboard boxes bottom-left — tan,
  correctly excluded by not touching the road), and
- the overlay shows the traced line on the paint down its whole length.

So I do not believe the mask is at fault, and I am reporting the disagreement
rather than trying to close it. My reading is that **4554 is about 11% high** —
possibly measured along an edge of the road rather than its centre, or including
the wide bottom mouth at its painted width. `check_level8.py` prints all four
numbers next to the reference on every run and does not fail on it, because a
gate that fails every run for as long as a stale reference stands is not a gate.

**This wants a decision before Level 8's waves are written**, because
`laneLengthPx` in `levels.json` is derived from it and feeds difficulty scaling.
The value the geometry supports is 3644.0 (longest route), not 4554.

## The pads

Nineteen. Every one measured by `check_level8.py`, which does not import the
tracer:

| pad | x | y | to lane | nearest pad | core off-carpet |
| --- | --- | --- | --- | --- | --- |
| 1 | 202 | 406 | 91.2 | 100.0 | 0 |
| 2 | 466 | 414 | 90.3 | 88.4 | 0 |
| 3 | 846 | 598 | 91.6 | 86.3 | 0 |
| 4 | 814 | 322 | 91.0 | 125.3 | 0 |
| 5 | 654 | 222 | 92.0 | 75.5 | 0 |
| 6 | 302 | 406 | 101.0 | 76.0 | 0 |
| 7 | 330 | 94 | 90.6 | 157.2 | 0 |
| 8 | 534 | 234 | 95.2 | 120.6 | 0 |
| 9 | 634 | 586 | 90.1 | 100.0 | 0 |
| 10 | 694 | 286 | 91.7 | 75.5 | 0 |
| 11 | 1054 | 554 | 91.5 | 212.6 | 0 |
| 12 | 378 | 406 | 97.0 | 76.0 | 0 |
| 13 | 922 | 114 | 91.2 | 218.8 | 0 |
| 14 | 1174 | 310 | 91.4 | 135.4 | 0 |
| 15 | 734 | 586 | 92.6 | 100.0 | 0 |
| 16 | 1130 | 182 | 91.2 | 135.4 | 0 |
| 17 | 866 | 682 | 90.8 | 86.3 | 0 |
| 18 | 482 | 54 | 91.2 | 157.2 | 0 |
| 19 | 478 | 598 | 90.7 | 156.5 | 2 px, 2 px blob |

Standoff 90.1–101.0 against the 90–114 band. Closest pair 75.47 px against a
floor of 74. Pad 19's core contains two carpet-coloured-but-not-carpet pixels;
`MIN_OBSTRUCTION_BLOB` is 30, so that is painted speckle, not an object.

The conveyor hazard striping, the Performance Review hardware, the signs, the
racks and the cabling are all excluded — see the probes below.

**Coverage is deliberately uneven.** The east branch is only 36% covered because
it is 392 px long and ends at the frame 84 px past the fork; there is not room
for a pad that reaches its far end and keeps 74 px from its neighbours. That is
a real property of the board, not a placement failure, and it means the east exit
is the cheap one for the player to leak into. Whoever writes the waves should
know that before splitting spawn weights.

## Method

`tools/trace_level8.py` derives. `tools/check_level8.py` verifies, and it does
not import the tracer — it reads the plate again with its own classifier written
to its own thresholds, an **area-averaged** downsample against the tracer's
**point** sample, and **level 4's** geodesic rather than level 5's. Where the
two agree, two readings of the paint agree.

```
python3 tools/trace_level8.py --overlay tools/L8_pads_overlay.png    # ~25 min
python3 tools/trace_level8.py --audit                               # the conveyor exclusion
python3 tools/check_level8.py --overlay                             # ~12 min, exit 0 = agree
```

Both are pure Python, no dependencies, and run in the agent environment.

### The classifier, and proof it can fail

Road is warm tan **with real blue in it** — `r > g > b`, `r − g ≥ 38`,
`b ≥ 42`. That last clause is the entire conveyor exclusion: the hazard striping
is saturated yellow-orange with `b` near zero and is otherwise a perfect match
for the track. Carpet is `b > g ≥ r`, `b − r ≥ 28`, luminance 42–132.

Eight probes run before anything else and stop the run if any is wrong. A prop
is tested as a **solid blob** rather than as an absence, because the server racks
are painted dark blue-purple and some of their panels do fall inside the
carpet's colour box:

| probe | road | carpet | biggest solid | expected |
| --- | --- | --- | --- | --- |
| the road, the loop's lower arm | 98.5% | 0% | 7 px | road ✓ |
| the road, below the fork | 99.7% | 0% | 1 px | road ✓ |
| the carpet, inside the loop | 0% | 100% | 0 px | carpet ✓ |
| the carpet, above the loop | 0% | 100% | 0 px | carpet ✓ |
| the top-right conveyor | 0% | 34.4% | 523 px | prop ✓ |
| the bottom-right conveyor | 0% | 33.9% | 382 px | prop ✓ |
| the top-centre server rack | 0% | 49.1% | 325 px | prop ✓ |
| the Performance Review hardware | 0% | 0.9% | 790 px | prop ✓ |

Props read 325–790 px of connected obstruction; open carpet reads 0–47. That
separation is the property the pad core test leans on, so it is the one worth
proving still holds.

### Where the shipped line actually runs

The two geodesics disagree on **length** by 4.3–8.0% — the checker's cuts
corners the tracer goes round, and the shortest lane moves most, which is what
corner-cutting does. Neither is wrong; a curve has no single length until you say
where the line runs. So the length gate is 10% (level 4's own width gate is 8%,
for the same kind of reason), and the line's actual placement is checked
directly instead, where it does not matter which geodesic drew it:

| lane | vertices | off the paint | riding the kerb | worst clearance |
| --- | --- | --- | --- | --- |
| shared | 53 | 0 | 0 | 18.0 px at (106, 134) |
| east | 17 | 0 | 0 | 15.0 px at (1046, 450) |
| south | 71 | 0 | 0 | 18.0 px at (693, 382) |

Every shipped vertex is on painted road and at least 45% of the half-width from
its edge. The three gate vertices sit on the frame and are exempt, since being
at the frame is what makes them gates.

## Three bugs the cross-check found

All three were real, all three changed the answer, and none would have been
visible from the tracer alone. This is what the second implementation is for.

**1. `despeckle` stopped walking a component once it passed `max_area`** and
left the pixels it had already queued marked `seen`. The rest of that same
component then started its own walks, hemmed in by that stale frontier, and came
out as a handful of small blobs which were then swallowed. On this plate it ate
two bites out of the bottom mouth and **split one opening into two, so the
tracer reported four openings where the brief says three**. Every component is
now walked to its end; it is O(n) either way.

**2. Pads were measured to the raw geodesic** while the geometry file ships the
**simplified** polyline. Simplification moves the line, always inward on a
corner, always in the direction that breaks the near edge of the standoff band:
**eleven of twenty pads were 83–90 px from the line that actually shipped** when
the rule says 90–114. They are measured to the shipped line now.

**3. The standoff used a chamfer distance**, which overestimates a true
Euclidean distance by up to 5.6% at about 22° off an axis — so a pad could pass
a "≥ 90" test while sitting 85 px from the road. Replaced with Danielsson's
transform (propagate offsets, not distances), exact to well under a pixel and
still O(n).

A fourth thing was corrected rather than found: **"24 px core" means a disc of
radius 24 in `check_level3.py` and `check_level4.py`** — a 48 px footprint —
while `tools/trace_level5.py` read the same phrase as a 24 px box and tested a
12 px radius, a quarter of the area. The brief says to mirror levels 3 and 4
exactly, so this uses theirs. It cost three pads (23 → 20).

## What was NOT checked

- **Nothing was rendered.** No harness run, no screenshot, no game code touched.
  There is no `map_level8.json`, no plate in `public/assets/`, and no
  `art.json` entry, so there is nothing to render yet. All of that belongs to
  the build pass.
- **The pads have not been played.** Nineteen pads at 71.3% coverage is a
  statement about geometry, not about difficulty. Whether this board is too
  generous is a soak question.
- **`laneLengthPx` has not been set** for level 8, pending the road-length
  decision above.
- **Level 5's geometry has not been re-derived** after the `despeckle` fix — see
  below.
- **The `--audit` conveyor dump was not re-run** after the despeckle fix. The
  exclusion is instead evidenced by the two conveyor probes in `check_level8.py`,
  which are stronger (they test the shipping classifier, not a sampled
  approximation of it).

## Where this leaves the repository

**In flight**

- Level 8's geometry is derived, cross-checked and committed. `check_level8.py`
  exits 0.
- Level 5 and Level 6's first pass are still on this branch and still not on
  `main`.

**Blocked**

- **The Level 8 BUILD brief is blocked and I have not started it.** It is gated
  on Level 5 being on `main`, and Level 5 is not on `main` — `origin/main` is at
  `60d0029` and has neither `map_level5.json` nor fork support in `Lanes.ts`.
  Merging this branch clears the gate.
- **Level 8 cannot be built until this branch merges.** `origin/main` has no
  fork support in `Lanes.ts`, and Level 8 is a fork.
- **Level 6's plate has to be re-rendered** — four segments at 2048 × 2048.
  Carried forward.

**Waiting on a decision**

- **The road length.** The plate says 4036 and the brief says 4554, and I
  cannot make the plate say 4554. `laneLengthPx` depends on it.
- **How Level 8 becomes reachable** — unregistered like Level 6, or
  `unlockedBy: "level5"`. I recommend unregistered.
- **`tools/trace_level5.py` carries the same `despeckle` bug**, and fixing it
  moves **4.3% of level 5's mask** (measured: 39,894 of 921,600 canvas pixels;
  road grows 161,231 → 163,077, +1.1%). Level 5's geometry is shipped and its
  boss is tuned against 480 soaked seeds, so I have not touched it. Re-deriving
  it would move the lanes and the pads and invalidate the Batula tuning. My
  recommendation is to leave it and fix the tracer only if Level 5's art is ever
  re-exported — but it should be a decision, not a silence.
- The Sprinter/Baby Frank speed conflict on Level 6. Carried forward.
- The Spike Strip / Glider question on Level 5. Carried forward.

**Open, not blocking**

- Level 4 soaks at 59%, outside the 35–45% band. Carried forward.
- Level 5's whole cast is 18–37% short of the 7× art rule. Carried forward.
- `validateLanes` needs the spawn-group property before Level 6's two parallel
  routes will validate. Carried forward.
- `GameScene.drawPlate()` draws one image and will need to draw N for Level 6.
  Carried forward.
- The east branch's 36% coverage is a real board property and should shape
  Level 8's spawn weights.

**How to land it**

The branch is a clean fast-forward from `main` as of `60d0029`:

```
git checkout main && git merge --ff-only claude/courjahan-defense-level-5-pto190 && git push
```

That lands Level 5, Level 6's first pass, the hero-contamination instrument and
Level 8's geometry together, and clears the fork dependency that Levels 6 and 8
both have.
