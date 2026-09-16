# Level 9's painted road gets walked

| commit | what | CI |
|---|---|---|
| `25e5688` | The flank lane: tracer, builder, map, wave table, `pickForBranch`, the `validateLanes` diamond fix, the soak's split traffic, the harness section | [run 398](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/35043316735) green |
| `0b5b331` | `tools/orphan_roads.py`, the mask fixture and `tests/orphanroads.test.ts` | run 398 green |
| `6fdba0c` | This report, `SOAK-REPORT.md` and `claude/context.md` | run 398 green |
| *this commit* | Closing this table on run 398 | it edits this table and nothing else |

All three were pushed together, so only the head got a run of its own; **run 398
checked the tree containing all three.** Green on `changes`, `typecheck`, `test`,
`deploy / build` and `deploy / deploy` — **five jobs, and the deploy RAN rather
than skipping**, because the push touched `src/`. So the live site carries the
flank. Read the job list, not the conclusion.

`main`'s tree was read back afterwards and carries `tests/level9.test.ts`,
`tests/orphanroads.test.ts` and `tests/fixtures/`, alongside the modified
`src/data/map_level9.json`, `src/systems/Lanes.ts` and `tools/`.

**Answers first.**

1. **The flank is a SHORTCUT, and a small one: 494.1 px against the 528.1 px of
   trunk it replaces — 6.4% shorter.** Not a cheap road. The south arm saves
   54.6% over the north and that is what a cheap road looks like.
2. **Five chips can cover it — 8, 9, 12, 13 and 15 — and pad 15 could cover
   nothing at all before.** 194.6 px from the trunk at a 132 px range, 73.9 px
   from the flank. Pads 1 and 7 still reach nothing.
3. **The orphan-road test flags exactly ONE other level over 3%, and it is
   level 6** at 7.05% — deliberate, and already pinned to the pixel by
   `tests/level6map.test.ts`. Level 1 is next at 1.25% and it is a footpath to
   the tavern door. So: one other level above the line, and it is a known
   decision rather than a finding.
4. **The finding in the brief is confirmed to the pixel, and its premise is
   not.** 13.82% orphaned, one region of 16,097 world px at x 894-1125,
   y 381-590. But the segment **does not leave the route and rejoin it**. It is
   a STUB: one end is the door junction, the other is a rounded cap on open
   substrate 112 px from the tail with 63 px of bare board between the kerbs.
5. **Level 9 now soaks 113/480 = 23.5%, against 191/480.** Nothing else moved.
   The recommended share is **0.10, which reads 152/480 = 32%** — see
   `SOAK-REPORT.md`.

---

# 1 — The measurement, confirmed

`tools/orphan_roads.py`, new in this change, thresholds each level's plate with
that level's own classifier and asks how much painted road has no lane within
60 world px of it.

Level 9, with the lanes as they were on `main`:

```
  level9  road   38783  orphan   4006   10.33%   (classifier matched 40787, 2004 dropped)
            16024 world px  x  894-1124  y  382- 590  (10.33%)
```

A direct re-measurement at full canvas resolution, against every pixel rather
than every second one, gives **13.82% of the raw cyan mask, and one connected
region of 16,097 px at x 894-1125, y 381-590** — the brief's 13.8% and its
"roughly 16,300 px at x 893-1125, y 381-589", to within a pixel. The two figures
differ because the tool drops the components no lane touches: the cooling
tower's vent slots and the fan housing are cyan and are not road. 10.33% is the
honest denominator; 13.82% is the brief's and it is right about the region.

**100% of that region lies within 28.5 px of the `spur` centreline already in
`tools/level9_geometry.json`.** The tracer has known about it since the level
was traced and calls it what it is: *"THERE IS A DEAD-END SPUR. A fifth
terminal, an interior one, where a rounded cap of trace ends on open substrate
near (897, 566). Nothing would ever walk it as the board stands."*

## What it actually connects to

**One end, not two.**

| end | where | on the route? |
|---|---|---|
| north | the **door junction** at (1103, 326) — `tail` waypoint 27 of 29, 74 px short of the door | yes |
| south | a rounded **cap** at (914.5, 568), on open substrate | **no** |

The cap's nearest point on the tail is (858.0, 468.7), **111.9 px away
centreline to centreline**. Measured paint to paint — the nearest lit pixel of
the spur to the nearest lit pixel of the trunk — the gap is **62.6 px of bare
substrate**, with a painted capacitor and two small ICs sitting in it.

So the brief's "leaves the `tail` lane and rejoins it" is half right. It rejoins
at the door, exactly as hoped. It leaves nowhere: the paint stops.

---

# 2 — What was built, and the one thing that is authored

## The house answer to a gap, and it is not new

`tests/level6map.test.ts` opens with it:

> The plate MERGES its two lanes and leaves the east 82.8% exit fed only by a
> band no entrance reaches [...] so the map joins the south lane to that
> unreachable band **across a gap that has no road painted on it. Cory chose
> that over re-painting the plate.**

That join is **82.0 px, from (591, 393) to (592, 475)**, and the test pins it to
the pixel. Level 9's is the same shape and 30 px longer, and it is the second
authored coordinate in `tools/build_level9_map.py` after the gateway point.

**It threads the one clear corridor the substrate offers.** Chip 13's right edge
is at x=855 and the painted capacitor starts at x=903; the join runs between
them, touching neither. That was checked from a rendered frame, not reasoned
about — see §4.

## The lanes

`tail` used to run rejoin → door. It is cut at the join and the far half is a new
lane, so the split can happen where a lane ends, which is the only place
`LaneNetwork` puts one.

| lane | from | to | px | continues |
|---|---|---|---|---|
| `north` (main) | gateway (-60, 324) | rejoin (409, 525) | 1499.4 | `tail` @0 |
| `south` | the same gateway | the same rejoin | 585.5 | `tail` @0 |
| `tail` | rejoin (409, 525) | **flank junction (858.0, 468.7)** | 484.6 | `hook` @0 ×3, `flank` @0 ×1 |
| `flank` | the junction | door junction (1103, 326) | **494.1** | `hook` @15 |
| `hook` | the junction | **the door (1177, 329)** | 602.2 | — the only terminal |

Route lengths, from either mouth: **2586.1 via the trunk, 2552.1 via the
flank** from the north; 1672.3 and 1638.3 from the south.

**It is a SPLIT, not a second entrance**, which is level 5's crossroads shape and
needed nothing new from the engine: `tail` names two continuations with weights
and the arm is settled from the number the walker was given **at spawn**. No
mid-route lane switching was built and none is needed.

## The share, per wave, in the table

`map_level9.json` gains `flankId: "flank"` — which lane a wave means. Each of the
sixteen waves in `waves.level9.json` gains `flankShare: 0.25`. At spawn,
`GameScene.flankPickFor` and `Sim.ts` each roll once and turn the answer into the
one number the walker carries, through a new `pickForBranch` in `Lanes.ts`.

`pickForBranch` walks the real `chooseContinuation`/`pickAt` rather than
inverting the hash, for the reason `pickForTerminal`'s own note gives: a second
copy of that mixing would drift from the first. It is not `pickForTerminal`,
because both arms end on the same terminal and the junction is most of a board
away from anything that spawns.

A map without `flankId`, or a wave without `flankShare`, is untouched: the split
falls back to the map's own 3:1 weights, which is what every split did before.

## Shortcut or detour

**A SHORTCUT, by 34.0 px — 6.4%.**

| | px |
|---|---|
| the flank | **494.1** |
| the stretch of `hook` it replaces (junction → door junction) | **528.1** |
| saved | 34.0 (6.4%) |

Against the number the brief offers for scale: the south arm is 585.5 px against
the north's 1499.4 — **913.8 px and 54.6% saved**, and the wave table knows south
is the cheap road. The flank is not in that category. It is a lateral road: the
same walk, past different guns.

That is what made a quarter a defensible starting share and it is not what made
the level harder. See §5.

## Which chips can cover it

At 132 px, the shortest attacking range in `towers.json`:

| pad | x, y | to trunk | to flank |
|---|---|---|---|
| 8 | 1005.5, 354.0 | 92.5 | **97.1** |
| 9 | 830.0, 358.0 | 83.0 | **114.2** |
| 12 | 986.0, 483.0 | 103.0 | **84.2** |
| 13 | 780.5, 579.0 | 104.0 | **121.9** |
| **15** | **947.5, 641.5** | **194.6 — out of range of everything** | **73.9** |

**Five, and pad 15 is the point.** It is one of the three pads
`map_level9.json` has always recorded as unable to reach the route at all, and
the flank puts a road 73.9 px from it. Pads 1 (156.6) and 7 (132.4) still reach
nothing — `padsUnreachableEvenWithFlank` in the geometry file says so.

So the answer to "is this a route no tower can reach" is no, comfortably, and
the change hands a dead pad back to the board.

---

# 3 — Nothing was hand-edited

`map_level9.json` is generated, and still is.

| file | what changed |
|---|---|
| `tools/trace_level9.py` | derives the join (nearest point on the traced tail to the traced cap), measures the bare crossing against the plate, and measures the flank against the stretch it replaces. Writes `flank` and `nodes.flankJoin` into the geometry file, plus `padStandoffToFlank`, `padsCoveringFlank` and `padsUnreachableEvenWithFlank` |
| `tools/level9_geometry.json` | regenerated. It reproduced byte for byte before the new keys were added, which is how the tracer was checked |
| `tools/build_level9_map.py` | cuts `tail` at the join, builds `flank` and `hook`, asserts the cut against the geometry file's own answer |
| `src/data/map_level9.json` | rebuilt |

Two cross-checks are asserted rather than trusted:

- The builder **re-derives the join against the polyline it ships** rather than
  copying the geometry file's, and asserts the two agree to within an eighth of
  a road width. They are 3.55 px apart, because the geometry's is the nearest
  point on the raw geodesic and the map ships a simplified polyline that
  `simplify` is allowed 1.2 px of deviation on.
- **Only `hook` may cross `gateX`.** `Gateway.distanceAtX` takes the FIRST
  crossing, so a second lane reaching x=1145 would be handed a gate distance part
  way along itself. The builder asserts every other lane stays west of it. The
  flank rejoins 74.1 px short of the door and therefore inherits the door's gate
  and fade rather than needing its own, which is the answer to the brief's
  warning about `exit._note`.

## One bug found in the builder

`flank_lane = [join] + reversed(spur)[1:]` — the `[1:]` is the idiom the rest of
that file uses to avoid repeating a shared junction point, and the flank shares
nothing with the join. It dropped the **painted cap**, cut the corner there, and
took 23 px off the lane. Caught because the tracer and the builder disagreed
about the flank's length by more than the node snaps could explain.

## And one bug fixed in the engine

`validateLanes` reported level 9's new diamond as *"merges in a circle"*. This is
the bug `map_level9.json`'s own `_lanes` note has described since the level was
traced, and the note's own one-line fix is now applied: the cycle check keeps one
visited set **per path** rather than one shared across sibling branches. A real
cycle is still caught — `tests/lanes.test.ts` has one and it still fails. The
runtime was never affected; `routesFrom` already recursed per arm.

---

# 4 — Verified from rendered frames

`sh tools/harness/run.sh level9 220 1400x900`, which now carries a flank section.
Every claim below is read off the live scene or the live plate texture; none of
it is in `tests/`, and could not be — no test in this repository imports Phaser.

**From the live scene:**

```
lanes=["north","south","tail","flank","hook"]  entrances=["north","south"]  exits=["hook"]  pads=15
  lane flank: 494 px, [858,469] -> [1103,326]
  lane hook:  602 px, [858,469] -> [1177,329]
  the door: (1177, 329), 103 px inside the nearest frame edge of 1280x720
```

**Enemies walk the bottom-right trace** —
`tools/harness/shots/level9-4b-flank-1400x900.png`. Six packets placed down the
flank, all six inside x 880-1140, y 320-600, which is the region the orphan
occupied:

```
  six walkers placed down the flank: (967,567) (1031,561) (1078,518) (1101,460) (1102,396) (1103,332)
```

**They rejoin correctly and still leak at the door.** A walker stepped over the
end of the flank is polled every frame until it transfers:

```
  a flanker over the junction: lane=hook at (1108, 326)
  a flanker through the door: lives 19 -> 16
```

**The marker set is unchanged** — one mouth, one door:

```
  badges: spawn(["north","south"]) at (80,321) exit(["hook"]) at (1177,329)
```

`flank` and `hook` both start mid-board and both are fed into, so `markersFor`
draws neither a spawn nor an exit badge for them. Neither gets an octopus or a
reaper.

**No enemy walks off the painted road anywhere on the level, except the authored
join.** Asked of **the plate texture itself** through `textures.getPixel`, with
the tracer's own cyan test, walking every lane at 4 world px:

```
  sampling plate map-level9 at 3840x2160 (3.0x world scale)
  off the paint: flank (872,493) -> (902,545), 60 px
```

**One run, on the flank, 60 px** — against the geometry file's 63.1 px measured
independently in Python. Every other pixel of every other lane on this board has
cyan trace under it.

`tests/level9.test.ts` asserts the same property a second way, against the
committed mask, and names the corridor: the join's endpoints must both sit
between x=855 and x=903.

**And here is the compromise, on purpose:**
`tools/harness/shots/level9-4c-join-1400x900.png` holds one walker at the middle
of the join and photographs it. It reads as a small robot crossing 60 px of
circuit board between two traces, beside a capacitor, for about a quarter of a
second. **That is the one thing in this change somebody might want reversed**, and
reversing it means painting 63 px of trace onto
`art-source/level9/map_level9.png` and re-running the tracer — see §7.

## Layout, at the required sizes

`sh tools/harness/run.sh screens 160 <vp>`:

| viewport | result |
|---|---|
| 667x375 | 1 fault — `SMALL Title [title:version-stamp (hidden dev door, not a tap target)]` |
| 844x390 | the same one |
| 844x390, `INSETS=0,47,21,47` | the same one; no NOTCH fault |
| 1400x900 | **no layout faults** |
| 375x667 (portrait) | `portrait is gated; the screens behind it are not a player-facing layout` — the correct answer |

The single fault is on the Title screen, is the harness's own labelled
exemption, and is not touched by this change.

## Three pre-existing harness faults, reproduced on an unmodified tree

`run.sh level9` reports `*** 3 of 98 checks failed ***`. All three are
`claude/context.md`'s existing open item and **all three were reproduced,
identically, on a worktree checked out at `5418c5c` with none of this change in
it**, where it reads `*** 3 of 86 checks failed ***`:

```
  *** 4 scenery items declared, 8 built
  *** START RUN would begin level10
  *** the rebuilt board has 8 scenery items
```

The flank added twelve checks and failed none of them.

---

# 5 — The soak

Full tables are in `SOAK-REPORT.md`. The short version:

**Level 9 goes 191/480 → 113/480. 39.8% → 23.5%. Nothing else moved** — levels
1-8 and 10 are identical integers on the same 480 seeds, and the baseline column
reproduces every published figure including level 9's 191.

**The share matters less than the fact of the road.** At 0.05 the level already
reads 33%; at 0.25 it reads 23%. The step between them is at 0.20, and it is the
simulator's `MINOR_LANE_SHARE` threshold rather than anything a player would
feel: under a fifth of the traffic and the scripted player keeps the board it
always built, at a fifth and above it covers the flank first.

**Why harder at all.** Level 9's board is thin and its own map note says so —
three pads out of range of the route, only three covering two passes. Spreading
it over a second road costs more than a 6.4% shortcut does.

**THE BALANCING RECOMMENDATION: 0.10, which is 152/480 = 32%.** Shipped at 0.25
because that is what the brief asked to start at, and because the number lives in
the wave table precisely so that changing it is one edit and no rebuild.
Bringing level 9 the rest of the way to its old 40% is a mini-boss health pass
and was not attempted.

## One change to the simulator, and it was forced

`laneTraffic` in `tools/soak/Sim.ts` walked `net.transferFrom`, whose own
docstring says it returns **the first arm at a split** and is "the wrong function
to move a walker with". It was being used to move the level's whole body count.
On a split that gives the first arm 100% and every other arm 0%, so level 9's
flank measured **0% traffic with a quarter of every wave on it** — which put it
under `MINOR_LANE_SHARE` and kept the three pads covering it out of the scripted
player's ranking. That is the level 6 flank failure read backwards, off the same
number.

It now spreads across every arm by share, taking the share from the wave's own
`flankShare` where the map declares an optional branch and from the map's split
weights otherwise. **Level 5 is the only other splitting map and it does not
move**: its crossroads arms already carry direct spawns well over the threshold.
218/480 in both columns.

---

# 6 — The standing check

`tests/orphanroads.test.ts`, with `tools/orphan_roads.py` and
`tests/fixtures/road-masks.json`.

**Why a fixture.** There is no WebP decoder in node and `npm install` answers 403
here, so a test cannot open a plate. The tool thresholds each plate with that
level's own classifier — copied from that level's tracer or checker, with the
level it came from — and writes the mask run-length encoded at half resolution.
The test measures that mask against the **live map JSON**. So the half that
drifts when somebody moves a lane is read fresh, and the half that only changes
with the art is the fixture. `python3 tools/orphan_roads.py --write` after
touching a plate.

**Only lane-touching components are kept.** Level 9's classifier also matches the
cooling tower's vent slots and the fan housing, which are cyan and are not road,
and they are connected to nothing. The spur IS connected — it hangs off the door
junction — so it stays, which is the whole point.

## What it finds on all ten levels

Before the flank:

| level | orphaned | what it is |
|---|---|---|
| **9** | **10.33%** | the dead-end spur. This change. Now **0.00%** |
| **6** | **7.05%** | the band the authored 82 px join steps over, x 650-990, y 364-448 |
| 1 | 1.25% | the footpath up to the tavern door, x 982-1062, y 248-294 |
| 7 | 0.25% | a road sign post and a rock, grey enough to read as asphalt |
| 8 | 0.04% | 88 px against the bottom frame |
| 5 | 0.02% | 32 px against the bottom frame |
| 3 | 0.00% | one pixel at x=1278 |
| 2, 4, 10 | 0.00% | — |

**Level 6 is the only one over the 3% line and it is deliberate**, not a finding.
The brief expected level 6's *bottom opening* to light up; it does not, because
that opening is the `flank` lane and three wave groups spawn on it. What lights
up instead is the stretch of band its **authored join steps over** — the level is
designed as two independent roads and the plate merges them, so the join drops
the south lane onto the lower band and the merged middle stretch is walked by
nothing. `tests/level6map.test.ts` pins that join to the pixel. It is in the
test's `ALLOWED` table at 8% with the reason attached; every other level gets the
3% rule with no exemption list.

**The test can go red.** Removing the `flank` lane from `map_level9.json` gives:

```
not ok 2 - no level leaves more than a few percent of its painted road unwalked
    level9: 10.33% of its painted road has no lane within 60 px, over the 3% it is
    allowed. The furthest painted pixel from any lane is at (1084, 544).
```

That was run, not assumed. A third test pins level 9 at exactly 0.00%.

---

# 7 — Where this leaves the repository

**In flight:** nothing. Everything below is on `main`.

**Waiting on a decision — one, and it is the only one:**

- **The 60 px authored join.** Level 9's flank crosses bare board for 60 px
  because the spur is a stub and the plate does not connect it. Level 6 does the
  same thing over 82 px and `tests/level6map.test.ts` records that Cory chose
  that over repainting the plate, which is why this took the same road without
  asking. **If the answer here is different, the fix is to paint ~63 px of trace
  into `art-source/level9/map_level9.png` between chip 13's right edge and the
  capacitor, re-encode, and re-run `tools/trace_level9.py`** — the flank's
  waypoints are derived from the paint, so they would follow by themselves and
  nothing else in this change would move. `level9-4c-join-1400x900.png` is the
  picture to judge it on.

**Open, and carried forward:**

- **Level 9 is out of the 35-45% band at 23.5%.** Ship-blocking? No. But it is
  sixteen points from where it was tuned, the recommendation is `flankShare`
  0.10 for 32%, and getting back to 40% wants a mini-boss health pass.
- **Level 9 declares 4 scenery items and builds 8.** Unchanged, unexamined,
  reproduced on `5418c5c`. `claude/context.md`'s open item, and now confirmed as
  pre-existing rather than suspected.
- **`START RUN would begin level10`** in `run.sh level9` is the harness's own
  save state having every level cleared. Also pre-existing.
- **Pads 1 and 7 on level 9 still cover nothing**, at 156.6 and 132.4 px against
  a 132 px shortest range. Pad 7 misses by four tenths of a pixel. A separate
  pass owns pad positions and this change did not touch them.
- **`tools/orphan_roads.py` uses level 7's asphalt seed without the paint
  reconstruction** the tracer does. It cannot change which components are found,
  only their width, and level 7 reads 0.25%. Noted in the tool.
