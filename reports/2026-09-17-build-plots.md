# The hand-authored build plots

`tools/plots.json` has been on `main` for a while carrying a hand-placed set of
build plots for nine of the ten levels. This is the pass that put them into the
game: which file on each level actually owns the pads, what the new boards
measure, what broke, and what it cost in the soak.

| commit | what | CI |
|---|---|---|
| _(filled in below once the push lands)_ | | |

**Level 6 is not in `plots.json` and was not touched.** Its eighteen pads are
byte-identical to what `main` shipped, and the soak agrees: 99/480, which is
exactly the published figure. That is the control for everything else here.

---

## 1 — which file owns the pads, per level

The only test that settles this is: **run the builder and see whether it
reproduces the shipped map byte-for-byte.** A geometry file that no longer
matches its output means the map was hand-edited after the last build and the
builder would throw that edit away.

| level | builder exists | builder reproduces the shipped map | decision | where the plots went |
|---|---|---|---|---|
| 1 | no | — | map JSON is the source | `src/data/map.json` |
| 2 | no | — | map JSON is the source | `src/data/map_level2.json` |
| 3 | no | — | map JSON is the source, geometry is a test-bound mirror | both |
| 4 | no | — | map JSON is the source, geometry is a test-bound mirror | both |
| 5 | no | — | map JSON is the source, geometry is a second copy | both |
| 6 | yes | **yes**, byte-for-byte | generated — and left alone | nowhere |
| 7 | yes | **yes**, byte-for-byte | GENERATED | `tools/level7_geometry.json` |
| 8 | yes | **yes**, byte-for-byte | GENERATED | `tools/level8_geometry.json` |
| 9 | yes | **yes**, byte-for-byte | GENERATED | `tools/level9_geometry.json` |
| 10 | yes | **no** — one line differed | GENERATED, after the hand edit was folded back | `tools/level10_geometry.json` |

Reproduce the test with a clean tree:

```bash
for n in 6 7 8 9 10; do
  python3 tools/build_level${n}_map.py >/dev/null
  git diff --quiet src/data/map_level${n}.json && echo "level $n identical" || echo "level $n DIFFERS"
done
```

### Levels 6, 7, 8 and 9 are generated and say so

Each declares itself generated in its `note`, each has a
`tools/build_levelN_map.py`, and each builder reproduced its shipped map with
no diff at all. Their plots went into the geometry file and the map was rebuilt.

### Level 10 is generated too, and the builder had drifted by one sentence

`build_level10_map.py` rewrote exactly one line — the `_vlaudeBerth` prose note.
Somebody had edited that sentence in the map after the last build. Nothing
numeric differed, `buildSpots` included.

That is a hand edit to a generated file, so it was folded back into the builder
(`tools/build_level10_map.py`, the `_vlaudeBerth` string) **before** anything
else was written, and the builder then reproduced the shipped map byte-for-byte
like the other four. Level 10's plots went into `tools/level10_geometry.json`.

### Levels 1 and 2 have no geometry file and no builder

Nothing can regenerate `src/data/map.json` or `src/data/map_level2.json`, so the
map is the source and the plots were written straight into it.

`tools/check_level2.py --emit` can re-derive level 2's map from
`tools/level2_path_overlay.png`, which has **fifteen green rings** painted on it.
The hand-authored set is ten. **So `check_level2.py` will now disagree with the
shipped map about the pads** — it is not in CI and nothing else reads it, but
re-emitting from that overlay would silently restore the old fifteen. Left as
found and recorded here rather than papered over.

### Levels 3, 4 and 5 have a geometry file but no builder

`tools/level{3,4}_geometry.json` hold `pads` and `tools/level5_geometry.json`
holds `buildSpots`, and all three matched their map exactly before this pass.
There is no `build_level3_map.py`. For 3 and 4 the map and the geometry file are
**asserted equal by `tests/level{3,4}.test.ts`**, so they are one fact stored
twice; level 5 has no such test but `tools/trace_level5.py` wrote both files and
leaving one behind would put a second, wrong copy of the board in the repository.

All three had the plots written into **both** files, by `tools/apply_plots.py`,
which also re-derives every number in those files that is a function of where
the pads are.

### A caveat that applies to all seven geometry files

`tools/trace_level*.py` regenerates each geometry file **including its pads**,
from the painted plate, using the scoring sweep. Re-running a trace will
therefore overwrite the hand-authored plots with algorithmic ones. Each geometry
file now carries a `_pads` note saying so in as many words.

---

## 2 — what was written, and the two new tools

**`tools/apply_plots.py`** writes `tools/plots.json` into the authoritative
files and re-derives the pad-dependent numbers. `--check` verifies the shipped
tree carries the plots AND that every generated map is still what its builder
writes.

**`tools/check_plots.py`** checks every pad on every board off the **shipped
map** — road clearance, plate edges, tap-target spacing and tower reach.

**`tools/padcounts.py`** prints the per-level pad counts, read from each board's
own source. Two map notes used to spell the list out as prose and both were
wrong the moment any board changed size.

### Re-derived, not carried forward

Every figure in a geometry file that is a function of the pads was recomputed.
The formulas were validated first by reproducing the **stored** values from the
**stored** pads:

| figure | reproduced? |
|---|---|
| level 9 `padStandoffToFlank` | exact, all fifteen |
| level 9 `padsCoveringFlank` | exact |
| level 9 `closestPadPair` | exact |
| level 9 `padsCoveringTwoPasses` at both ranges | exact (3 and 2) |
| level 10 `padStandoff` | 9 of 12 exact, 3 within 0.1 px |
| level 10 `closestPadPair` | exact |
| level 10 `padsCoveringTwoPasses` at both ranges | exact (5 and 7) |
| level 7 `padsCoveringTwoLanes` | exact (20) |
| level 7 / 8 / 5 `coverage` | within 0.005 on every lane |

The residuals are the simplification tolerance: the trace measures against a
full-resolution geodesic and the geometry file ships a line simplified to 1.2 px.

---

## 3 — every plot passed every check

`python3 tools/check_plots.py`, off the shipped maps:

```
lvl pads road edge road radial plate closest pair reach
  1   10     13.71       14.46    ok        125.1  10/10
  2   10     31.10       31.10    ok        119.1  10/10
  3   14     17.41       17.59    ok         79.0  14/14
  4   14     10.09       10.38    ok         96.2  14/14
  5   18     10.39       10.39    ok         75.2  18/18
  6   18     28.75       28.81    ok        157.8  17/18
      dead: pad 2 at (1167.1,53) is 228.8 px from the nearest road edge
  7   17     10.42       10.42    ok         92.0  17/17
  8   20      9.38       10.02    ok         80.4  20/20
  9   15     23.92       23.96    ok        120.1  14/15
 10   21     10.27       10.27    ok         90.0  21/21

0 faults.
```

**No plot overlaps the road on any level.** **No plot sits off the plate.**
**No two tap targets overlap** — the closest pair anywhere is 75.2 px on level
5, clearing 2 × `spotRadius` = 68 by 7.2 and the sweep's old 74 by 1.2.

### Two conventions, because `plots.json` and I did not measure the same thing

`road edge` is the true shortest distance from the pad's **ellipse outline**
(68 × 42, `spotRadius` by `spotRadius × PAD_SQUASH`) to the painted edge.
`road radial` is the distance along the line joining the centres less the
ellipse's radius in that direction, which is what `plots.json`'s own
`summary.minRoadGap` reports. The radial figures reproduce the summary block:

| level | `plots.json` claims | radial, measured | ellipse edge, measured |
|---|---|---|---|
| 1 | 14 | 14.46 | 13.71 |
| 2 | 31 | 31.10 | 31.10 |
| 3 | 17 | 17.59 | 17.41 |
| 4 | 10 | 10.38 | 10.09 |
| 5 | 10 | 10.39 | 10.39 |
| 7 | 10 | 10.42 | 10.42 |
| 8 | 10 | 10.02 | **9.38** |
| 9 | 24 | 23.96 | 23.92 |
| 10 | 10 | 10.27 | 10.27 |

**Level 8's tightest pad clears the paint by 9.38 px under the strict ellipse
measure and by 10.02 under `plots.json`'s own.** It is clear either way; it is
the only level where the two conventions land on opposite sides of 10, and it is
recorded so nobody re-derives it and thinks the road moved. The road data has
not changed: `roadWidth` and every waypoint on every level are untouched.

**`waypoints` IS A LANE.** It is each map's main lane and it is never repeated
inside `lanes`. The first version of the checker read only `lanes` and reported
level 6's own untouched pads as 530 px from any road. Both new tools carry the
warning in a comment.

### Reachable

`tests/hudpads.test.ts` is the reachability check — it sweeps the whole zoom
band at six viewports, with and without a notch, and finds a clear 44 pt tap
circle on **every one of the 157 pads on all ten levels**. It reads the data
rather than a pad count, so it covered the new boards without an edit.

---

## 4 — level 9: the same fifteen chips, and `padArt` follows them

Every level 9 plot moved, by **6.08 px at most**, and the **order changed** —
`plots.json` sorts by x, the trace sorted by chip bounding box top-to-bottom.
The pairing is proved rather than assumed: `apply_plots.py` refuses to write
unless each plot lands inside exactly one painted chip's bounding box and the
fifteen pair one-to-one.

| now | was | chip box | from | to | moved | art |
|---|---|---|---|---|---|---|
| 1 | 10 | 179,331,250,400 | 214.5, 365.5 | 214, 368 | 2.55 | node-chip-square |
| 2 | 3 | 265,120,397,220 | 331, 170 | 332, 164 | **6.08** | node-chip-cabled |
| 3 | 7 | 284,273,405,385 | 344.5, 329 | 344, 332 | 3.04 | node-chip-ram |
| 4 | 14 | 317,572,389,643 | 353, 607.5 | 353, 607 | 0.50 | node-chip-square |
| 5 | 6 | 429,201,491,261 | 460, 231 | 460, 228 | 3.00 | node-chip-ram |
| 6 | 11 | 472,436,541,503 | 506.5, 469.5 | 506, 469 | 0.71 | node-chip-square |
| 7 | 2 | 588,75,655,141 | 621.5, 108 | 622, 106 | 2.06 | node-chip-square |
| 8 | 13 | 706,521,855,637 | 780.5, 579 | 784, 578 | 3.64 | node-chip-cabled |
| 9 | 1 | 710,49,853,163 | 781.5, 106 | 785, 106 | 3.50 | node-chip-cabled |
| 10 | 5 | 763,200,847,280 | 805, 240 | 804, 241 | 1.41 | node-chip-ram |
| 11 | 9 | 790,320,870,396 | 830, 358 | 831, 358 | 1.00 | node-chip-ram |
| 12 | 15 | 912,606,983,677 | 947.5, 641.5 | 948, 642 | 0.71 | node-chip-fan |
| 13 | 12 | 951,447,1021,519 | 986, 483 | 988, 482 | 2.24 | node-chip-fan |
| 14 | 8 | 965,310,1046,398 | 1005.5, 354 | 1008, 355 | 2.69 | node-chip-fan |
| 15 | 4 | 1058,139,1139,213 | 1098.5, 176 | 1097, 176 | 1.50 | node-chip-cabled |

**Every chip kept its own node picture.** The distribution is unchanged —
cabled ×4, ram ×4, square ×4, fan ×3 — and `padChips`, `suggestedNodeByAspect`
and `suggestedNodeBalanced` were all permuted to follow.

**`padArt` carries no width and must not.** The task brief describes it as
giving each plot its own width from 63 to 150; that was removed before this
pass. Pad size is one derivation for the whole game
(`presentation.buildPad.quietScreenWidth` over `display.camera.defaultZoom`) and
`tests/buildpad.test.ts` fails if any map file grows a per-pad size again. The
`key` is the only thing there and the only thing that had to be realigned.

Two index lists moved with the renumbering and one of them changed in substance:

- `padsCoveringFlank` reads `[8, 11, 12, 13, 14]` where it read `[8, 9, 12, 13, 15]`.
  **Same five chips, renumbered.**
- `padsUnreachableEvenWithFlank` is `[9]` where it was `[1, 7]`, and that is a
  real change from a 3.5 px move: the chip that was pad 7 at 132.1 px from the
  trunk is pad 3 at 130.5 and is now inside the 132 px range. The chip that was
  pad 1 at 155.9 is pad 9 at 159.1 and still reaches nothing.

---

## 5 — what the new boards measure

| level | pads was → now | standoff was | standoff now | closest pair was → now |
|---|---|---|---|---|
| 1 | 7 → **10** | 86.8–118.9 | 79.0–149.1 | 186.3 → 125.1 |
| 2 | 15 → **10** | 97.7–107.7 | 92.8–133.1 | 73.5 → 119.1 |
| 3 | 15 → **14** | 91.7–111.9 | 66.1–140.9 | 74.0 → 79.0 |
| 4 | 14 → 14 | 90.9–111.0 | 56.8–151.2 | 74.1 → 96.2 |
| 5 | 14 → **18** | 48.0–92.4 | 62.5–155.2 | 68.2 → 75.2 |
| 6 | 18 → 18 | 69.9–248.8 | *unchanged* | 157.8 |
| 7 | 22 → **17** | 91.0–105.0 | 67.0–83.0 | 76.0 → 92.0 |
| 8 | 19 → **20** | 90.1–101.0 | 56.8–122.8 | 75.5 → 80.4 |
| 9 | 15 → 15 | 69.4–156.6 | 68.8–159.1 | 120.6 → 120.1 |
| 10 | 12 → **21** | 90.1–106.4 | 53.6–146.3 | 76.4 → 90.0 |

**The scoring sweep's 90–114 px standoff band is gone on every board it used to
hold.** That band was the sweep's own parameter. A person placing pads against a
painting puts one inside a hairpin at 54 px and another out on open ground at
159, and both are deliberate. What replaced it in the tests is the claim the
band stood in for: a tower on this pad can shoot at painted road.

Coverage — how much of each lane is inside the shortest tower's range of a pad —
moved a long way, and not always down:

| level | lane | was | now |
|---|---|---|---|
| 4 | shared tail | 45% | **86.7%** |
| 4 | upper branch | — | 41.9% |
| 4 | lower branch | — | 65.8% |
| 5 | west / east / north / south | 81 / 77.6 / 100 / 93.2 | **68.5 / 66.9 / 83.7 / 50.8** |
| 7 | north / middle / south | 90.2 / 94.1 / 83.1 | **62.9 / 72.3 / 70.9** |
| 8 | shared / south / east | 71 / 77.4 / 35.7 | **61 / 58 / 47.3** |
| 10 | the one lane | 94.2 | 94.9 |

**Level 4's defining property is inverted.** It was built so that east of the
merge is snow, rock and ice pond and only three of fourteen pads could reach the
shared tail — "a player who lets a wave through the fork has almost no second
chance". The hand-placed plots put four pads on the trunk and take it to 86.7%
covered while the branches fall. `tests/level4.test.ts` records the new numbers
and says in a comment that it used to say the opposite.

**Level 7 lost a third of its board.** Five pads fewer and the uncovered road
went from 408 px to 1,201 px across the three highways; the longest dead stretch
on the north lane went from 72 px to 219. Its whole-lane coverage ordering
flipped too — the south lane used to be the least covered and the north lane is
now — though the south lane still has the longest dead tail (265 px), which is
what the Transporter fight is built on.

**Level 10 is the biggest board in the game now** at 21 pads, where it was the
second-smallest at 12. Lane coverage is unchanged, because the sweep optimised
for exactly that and a hand cannot beat it at its own game. What nine more pads
buy is depth: more guns on the same road.

### Pads no tower can reach

| level | pads | cheapest tower (132) reaches the centreline from | reaches the near paint edge from |
|---|---|---|---|
| 1–5, 8, 10 | 10, 10, 14, 14, 18, 20, 21 | 9, 9, 12, 11, 13, 20, 20 | **all of them** |
| 6 *(untouched)* | 18 | 17 | 17 — pad 2 is the painted dead one |
| 7 | 17 | 17 | 17 |
| 9 | 15 | 14 | 14 — pad 9 is the dead chip |

The two boards with a pad no tower reaches are level 6, whose own map file says
`PAD 2 AT (1167, 53) IS DEAD ... It is painted on; it stays`, and level 9, whose
pad 9 is a painted chip 159.1 px from the trunk and 381.4 from the flank. Both
are pre-existing facts about the art. `check_plots.py` prints them as `dead`
lines and does not fail on them.

---

## 6 — the soak builder's zero-damage cap follows the boards by itself

**Confirmed: nothing in `tools/soak/builder.json` was edited and every cap
moved.** The cap is `max(min, floor(pads * padShare))` with `padShare` 0.2 and
`min` 1, and `tests/soakbuilder.test.ts` re-derives it from the shipped map for
every level.

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| pads was | 7 | 15 | 15 | 14 | 14 | 18 | 22 | 19 | 15 | 12 |
| cap was | 1 | 3 | 3 | 2 | 2 | 3 | 4 | 3 | 3 | 2 |
| pads now | 10 | 10 | 14 | 14 | 18 | 18 | 17 | 20 | 15 | 21 |
| **cap now** | **2** | **2** | **2** | **2** | **3** | **3** | **3** | **4** | **3** | **4** |

The only edit to `builder.json` was its `_zeroDamage` prose, which spelled the
old counts and old caps out as a sentence.

---

## 7 — the soak: **comparison only**

**THESE FIGURES ARE NOT A TUNING TARGET AND NOTHING WAS RETUNED.** No boss
health, no tower stat, no wave table and no level rule was touched in this pass.
Two reasons they cannot be used to tune:

1. No level is inside the 35–45% band, before or after, so there is no
   before-and-after "in band" to preserve.
2. The soak builder's peanut-sink artefact is still open — `SOAK-REPORT.md` and
   `CLAUDE.md` both say an unknown but substantial part of the previous row is
   still instrument rather than game — and this pass puts a second variable on
   top of it.

480 seeds, `normal`, `node --experimental-strip-types tools/soak/level.ts 480 levelN normal`:

| | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|---|---|---|---|---|---|---|---|---|
| pads before | 7 | 15 | 15 | 14 | 14 | 18 | 22 | 19 | 15 | 12 |
| **pads now** | 10 | 10 | 14 | 14 | 18 | 18 | 17 | 20 | 15 | 21 |
| published | 434 | 218 | 431 | 314 | 274 | 99 | 135 | 154 | 146 | 132 |
| **measured** | **453** | **250** | **429** | **347** | **380** | **99** | **13** | **239** | **148** | **285** |
| change | +19 | +32 | −2 | +33 | +106 | **0** | **−122** | +85 | +2 | **+153** |
| now, as % | 94.4 | 52.1 | 89.4 | 72.3 | 79.2 | 20.6 | **2.7** | 49.8 | 30.8 | 59.4 |

Aggregate 2,137 → 2,243 of 4,800: **+2.2 points, and the aggregate hides
everything that matters.**

### Level 6 is the control and it is exact

**99/480, the published figure to the run.** Level 6 is not in `plots.json`, its
map and geometry file are byte-identical to `main`'s, and it lands on the same
number. That is what makes the other nine rows comparable to the published ones
at all: same simulator, same seeds, same builder, only the boards moved.

### Why each level moved — whole-board road coverage at the shortest range (132)

| level | pads | road covered, before → after | soak |
|---|---|---|---|
| 1 | 7 → 10 | 56.1% → 54.4% (−1.7) | 434 → 453 |
| 2 | 15 → 10 | 71.9% → 65.2% (−6.7) | 218 → 250 |
| 3 | 15 → 14 | 68.8% → 62.8% (−6.0) | 431 → 429 |
| 4 | 14 → 14 | 63.8% → 65.0% (+1.2) | 314 → 347 |
| 5 | 14 → 18 | 83.5% → 71.5% (−12.0) | 274 → 380 |
| 6 | 18 → 18 | 68.4% → 68.4% (0) | 99 → 99 |
| 7 | 22 → 17 | 86.0% → 75.1% (−10.9) | 135 → **13** |
| 8 | 19 → 20 | 79.9% → 76.1% (−3.9) | 154 → 239 |
| 9 | 15 → 15 | 79.9% → 80.3% (+0.3) | 146 → 148 |
| 10 | 12 → 21 | 91.3% → 92.2% (+0.9) | 132 → 285 |

**Pad COUNT moves the soak more than coverage does**, and the two disagree
sharply on levels 5 and 7. The soak's player builds on every pad it can afford,
so a pad is a gun: level 5 lost twelve points of coverage, gained four pads and
went up 106 runs; level 7 lost eleven points of coverage AND five pads and lost
122. Level 2 lost five pads and still went up, which is level 2 being one boss
check and nothing else — that is the level's own known shape, not a plot effect.

### Level 7, in detail, because it is the one that fell over

| | pads | north | middle | south | uncovered road, total | longest dead stretch | pads covering two lanes |
|---|---|---|---|---|---|---|---|
| sweep | 22 | 90.2% | 94.1% | 83.5% | 408 px | 189 px (south) | 20 |
| plots | 17 | 62.9% | 72.3% | 70.9% | **1,201 px** | **265 px (south), 219 (north)** | 15 |

Five pads fewer, the uncovered road nearly tripled, and the north highway now
has a 219 px stretch no tower can reach where it had 72. Both of level 7's
bosses were soaked against a 22-pad board with 20 doubles; neither number means
anything on this one. **Not retuned.**

### Level 10, the other end

12 pads → 21, the smallest board but one becoming the biggest in the game. Lane
coverage barely moved (94.2% → 94.9%) because the sweep optimised for exactly
that and a hand cannot beat it at its own game; what nine more pads buy is
depth. Vlaude's 26,000 hp was soaked at 12 pads and 132/480. He now loses
285/480. **Not retuned.**

---

## 8 — verification

Everything below was run on this working tree. Where it says *from a rendered
frame*, a picture was produced and looked at, not only a number read.

### Tests and typecheck

```
npm test                       1194 passing, 0 failing
sh tools/tsdiff.sh 7eb04a5     baseline 214 distinct errors; working tree 214
                               --- introduced by the working tree ---   (none)
```

`tsdiff` is blind to anything that is not an error locally, and this pass
touched no Phaser member, so CI's `npx tsc --noEmit` is still the first thing
that can be sure.

### Geometry, off the shipped maps

```
python3 tools/check_plots.py     0 faults   (section 3)
python3 tools/apply_plots.py --check
                                 every level's plots match tools/plots.json AND
                                 every generated map is what its builder writes
python3 tools/padcounts.py       10, 10, 14, 14, 18, 18, 17, 20, 15, 21
```

### From rendered frames

A new harness scenario, `sh tools/harness/run.sh plots 420 844x390`, starts all
ten levels in turn, reads the pads off the **running scene**, and screenshots
each whole board at the floor of the zoom band.

```
level1   spots 10  drawn 10  map==engine true  worst pad-to-paint 17.9 px
level2   spots 10  drawn 10  map==engine true  worst pad-to-paint 38.8 px
level3   spots 14  drawn 14  map==engine true  worst pad-to-paint 17.8 px
level4   spots 14  drawn 14  map==engine true  worst pad-to-paint 10.7 px
level5   spots 18  drawn 18  map==engine true  worst pad-to-paint 10.4 px
level6   spots 18  drawn 18  map==engine true  worst pad-to-paint 28.8 px
level7   spots 17  drawn 17  map==engine true  worst pad-to-paint 10.4 px
level8   spots 20  drawn 20  map==engine true  worst pad-to-paint 10.2 px
level9   spots 15  drawn 15  map==engine true  worst pad-to-paint 24.0 px
level10  spots 21  drawn 21  map==engine true  worst pad-to-paint 10.3 px
RESULT every board built its pads where the map puts them, none drawn on the
road, level 9's four node pictures each on their own chip
```

- **Every level's plots are where `plots.json` puts them** — the engine's own
  `build.spots` equal the shipped `buildSpots` on all ten boards, and the
  screenshots show them against the painting.
- **No plot overlaps the road on any level** — worst is level 8 at 10.2 px in
  the live scene, and the pictures agree: every pad sits on grass, scrub,
  carpet, plating or substrate beside the paint.
- **Level 9's chips still sit under their plots at the right sizes** — the
  scenario prints the texture that landed on each spot against the `padArt` key
  the map asked for, and the screenshot shows each node picture centred inside
  its larger painted chip. One pad per board draws the SIGN instead
  (`GameScene.signSpotIndex`, the pad nearest the spawn); on level 9 that is pad
  1, and it is the same painted chip it was before.
- **Level 6 is untouched** — `git diff` reports no change to
  `src/data/map_level6.json` or `tools/level6_geometry.json`, and its frame is
  the board it always was.

Screenshots (gitignored, reproduce with the command above):
`tools/harness/shots/plots-level{1..10}-844x390.png`, shrunk for reading with
`python3 tools/harness/shrink.py <file> 950`.

### Towers can be built on every plot

```
sh tools/harness/run.sh buildall 260 844x390 level1    10 of 10 pads built
sh tools/harness/run.sh buildall 500 844x390 level5    18 of 18 pads built
sh tools/harness/run.sh buildall 560 844x390 level10   21 of 21 pads built
```

**And the first run of that was a HARNESS BUG, not a product one.** `buildall`
and the shared `build()` helper both read `SPOTS`, the `map.json` the harness
imports at the top — level 1's. On level 5 they aimed the camera at level 1's
pads, the ring never opened, and the scenario reported *the ring did not open*
on nine of eighteen pads as though the game had refused them; past level 1's
seventh pad it threw outright. Both now read the running scene's spots. This is
the failure CLAUDE.md warns about in as many words: three of the four faults the
input harness first "found" were bugs in the harness. **Do not trust a first
red result.**

### The HUD, at 844x390

`sh tools/harness/run.sh padhud 420 844x390`, run on this tree and on a
worktree at `7eb04a5` so the two are the same measurement:

| | pads | overlaps at rest | by element | not freed by panning alone |
|---|---|---|---|---|
| `7eb04a5` | 151 | 31 | abilities 16, messageRow 9, heroChip 4, startButton 2 | **17** |
| this tree | 157 | 36 | messageRow 15, abilities 12, heroChip 6, startButton 2, counters 1 | **22** |

- **The ability row covers fewer plots than it did** — 12 against 16 — on a
  board with six more pads. The brief's "24 down to 17" figure is the last
  column, and it is **17 → 22**.
- Those 22 are pads panning alone cannot free at the opening zoom. **Zooming
  can**: `tests/hudpads.test.ts` sweeps the whole zoom band at six viewports
  with and without a notch and finds a clear 44 pt tap circle on all 157 pads
  on all ten levels.

### Screens

| viewport | this tree | `7eb04a5` |
|---|---|---|
| 375x667 | portrait is gated | — |
| 390x844 | portrait is gated | — |
| 667x375 | 1 fault: `SMALL Title [title:version-stamp]` | — |
| 844x390 | 1 fault: `SMALL Title [title:version-stamp]` | **identical** |
| 1280x720 | no faults | — |

The one fault is the Title screen's version stamp, a hidden dev door that is
deliberately not a tap target. It is pre-existing and byte-for-byte the same on
the baseline worktree.

### `run.sh difficulty` is red and is no redder

```
this tree   RESULT *** 2 faults ***
            *** the HUD does not show the difficulty
            *** a mid-run change to the save reached the run
7eb04a5     RESULT *** 2 faults ***   (the same two)
```

Pre-existing, not touched here.

---

## Where this leaves the repository

**In flight:** nothing. Everything in this pass is on `main`.

**Stale and knowingly left stale — every boss health figure in the game.** Boss
health is derived by soak against a specific board, and nine of the ten boards
just changed size. That is on top of the two existing reasons they were already
stale (the guaranteed Ima Dummy Tower, then the soak builder's role rules).
Named explicitly: **Vlaude at 26,000**, level 9's **PERPLEXED at 7,650**, level
8's **CEO**, both of level 7's bosses, level 4's **unicorn**, level 2's **Devil
at 5,200**, and the 24,265 damage median in `reports/2026-09-15-blockers.md`.

**Blocked on a decision, not on work:**

- **Level 7 at 2.7% is the thing to look at first.** It is not a bug — every
  plot on it passes every check and the board is simply smaller and thinner. It
  is a design question: seventeen hand-placed plots is what a person wanted
  there, and the level was built around twenty-two.
- **Retuning is still blocked by the peanut-sink artefact**, unchanged from
  `reports/2026-09-17-soak-builder.md`: the soak's upgrade loop tiers every
  tower it owns, so roughly three peanuts in ten still go through towers that
  cannot shoot. Settle that, re-measure, then look at levels. A number produced
  today is not a tuning target.

**Carried forward from the previous report and still open:**

- The soak builder's peanut sink (above).
- No level is in the 35–45% band. It was true before this pass and it is true
  after.

**New, small, and left as found:**

- **`tools/check_level2.py --emit` will now disagree with level 2's map.** Its
  overlay has fifteen green rings painted on it and the board has ten plots.
  Re-emitting from that overlay would silently restore the sweep's fifteen. Not
  in CI, nothing else reads it.
- **`tools/trace_level*.py` still regenerates pads.** Re-running a trace on
  levels 3, 4, 5, 7, 8, 9 or 10 overwrites the hand-authored plots with
  algorithmic ones. Each geometry file carries a `_pads` note saying so.
- **Level 1's plot at (366, 93)** puts the tallest tower's roof at world y=6,
  above the legacy `display.hudHeight` line of 62. It is the only level-1 plot
  that does, and it joins four on level 6, three on level 8, two on level 9 and
  one on level 7 that already did. `src/data/README.md` and
  `tests/logic.test.ts` both now say that the rule was only ever level 1's and
  that `tests/hudpads.test.ts` is the instrument that answers the real question.
