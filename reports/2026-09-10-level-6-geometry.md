# Level 6 map geometry, derived off the painted plate

**The headline is the pad standoff, and it is not the finding the brief
expected.** Level 6's eighteen painted pads sit 70–103 world px from a lane
centreline, median 81, against levels 2–4's 90–114. That is about 20% closer,
not half. The brief's "48 to 84, median 57" is a real measurement of this plate
— it is the distance from a pad's centre to the *edge of the paint*, and mine
reads 51–77, median 61 — but the 90–114 it was compared against is measured to
the *centreline*. Two different rulers.

The direction of the finding survives and it still moves the Rooster, just not
by the factor claimed. With the shortest tower range of 112, a tower at level
6's median standoff covers **154 px of lane**; at level 3's it covers 91 and at
level 8's 130. So one gun does about **1.7× the work here that it does on level
3** and 1.19× what it does on level 8. Soak the Rooster against this board and
never against another level's boss — but budget for a board that is a little
under twice as hot as level 3, not four times.

**And a bigger thing than any of that: the two lanes merge.** The brief says
they do not, twice, and says the level's roster and flame mechanic depend on it.
The paint disagrees. Details in §3.

---

## Commits

| Commit | What | CI |
|---|---|---|
| `12491fe` | Derive level 6's map geometry off the painted plate | **green** — `test`, `typecheck` and `changes` all success; `deploy` skipped, as it is on every branch that is not `main` ([run 34475601026](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34475601026)) |
| this report | markdown only; its row is filled by the commit after it | |

Branch: `claude/level-6-map-geometry-zw4qb1`. Nothing here is on `main`.

## How to reproduce every number in this file

```bash
python3 tools/trace_level6.py --overlay tools/L6_pads_overlay.png   # ~11s
python3 tools/check_level6.py --overlay                            # ~7s
node --test 'tests/*.test.ts'
sh tools/tsdiff.sh 128c289
```

`trace_level6.py` derives; `check_level6.py` reads the plate again with its own
thresholds, its own downsample and level 4's geodesic and compares. They share
no code beyond `img.py`/`png.py`, which is the same division of labour levels 3,
4 and 8 use.

---

## 1. The plate

`art-source/map_level6.png`, 1672 × 941, encoded to
`public/assets/maps/map_level6.webp` at q95 via `tools/towebp/run.sh`:
**2.19 MB → 0.42 MB (81% off), PSNR 39.2 dB, alpha exact on every pixel.** The
PNG stays in `art-source/`; the copy that was briefly in `public/` was deleted
after the encode.

Registered in `src/data/art.json` twice, the way every other plate is: as
`"map-level6": "maps/map_level6.webp"` under `files`, and as
`"level6": "map-level6"` under `map`.

`tests/levelart.test.ts`'s orphan list grew by one entry as a result. That test
enumerates level art no shipped level loads; level 6 has no row in
`levels.json`, so its plate joins its four roster sprites there. The expected
list was updated and the comment says why. It empties on its own when level 6
ships.

### Classification

| class | test | share of the canvas |
|---|---|---|
| road | `r>g>b`, `r−g ≥ 40`, `b ≥ 40`, `lum > 110` | 22.4% |
| floor | `b>g>r`, `b−r ≥ 20`, `106 ≤ lum < 150` | 45.9% |
| pad | `b>g>r`, `b−r ≥ 20`, `78 ≤ lum < 106` | 16.2% |
| blocked | everything else | 15.5% |

Floor and pad separate on luminance alone and the gap is wide: a painted pad's
interior tops out at **105** and the floor starts at **121**. The tracer splits
at 106 and the checker at 112, at opposite ends of that gap, and both find the
same eighteen ellipses to within 0.3 px of centre.

---

## 2. The frame is touched six times; four of them are openings

| edge | span (canvas px) | centre | width | terminal? |
|---|---|---|---|---|
| west | 66–104 | **11.8%** of the height | 39 | yes — north lane in |
| west | 132–168 | **20.8%** | 37 | yes — south lane in |
| east | 505–547 | **73.1%** | 43 | yes — the only exit anything reaches |
| east | 575–618 | **82.8%** | 44 | yes — reachable from no entrance (§3) |
| north | 783–832 | **63.1%** of the width | 50 | **no** |
| south | 758–940 | 59.2–73.4% | **183 canvas px = 239 plate px** | **no** |

All four terminals land within 0.8% of the fractions the brief gives, and both
excluded touches land where it says. The brief's "241 px mouth" is in **plate**
pixels: 183 canvas px × 1672/1280 = 239.

The two exclusions are not judgement calls, they are properties:

- **The top touch is the scaffold's planking.** Its wood is warm tan and a plain
  colour test calls it road — which is exactly why a naive trace finds six
  openings. It is a **2007 px blob connected to no road at all**, so dropping
  components under 20 000 px removes it and the checker asserts it stays
  disconnected.
- **The bottom touch is a band running off the frame** at a shallow angle. A
  43-px-wide road crossing the frame at ~13° cuts a 183 px chord in the bottom
  row, which is what is there. It is on the band; it is not a terminal.

The rule the tracer applies, and the checker re-tests, is **terminals are on the
vertical edges only**.

---

## 3. THE TWO LANES MERGE

The brief:

> TWO SEPARATE LANES, both running the full length. This is NOT a fork and NOT a
> merge. Independent parallel roads, the level's whole design. […] That is one
> entrance and one exit per lane. Both exits cost lives.

The plate:

- **West 11.8% and west 20.8% join at (1050, 441)** and share the last **267 px**
  out to the east 73.1% exit.
- **East 82.8% is reachable from neither entrance.** It is fed by a third band
  that enters the frame at the bottom edge (x 758–940), U-turns at the far left
  around x = 40, and runs back down to the exit. 2235 px of painted road that
  nothing walks.

This is not a classifier artifact and not a hairline bridge:

| test | result |
|---|---|
| geodesic west12 → east83 | **no path** |
| geodesic west21 → east83 | **no path** |
| cut a 46 px disc at (1055, 440) | component splits into **three** arms: 53 389, 45 962 and 8 152 px |
| Euler number of the component | **1**, i.e. no loop — a tree with exactly one Y |
| bottleneck width on the west12↔west21 route | **32 px**, i.e. a full road, not a bridge |
| widest gap the two lanes hold elsewhere | 59.6 px centreline-to-centreline = **19.6 px of bare floor** |

`tools/L6_pads_overlay.png` shows it: red is the north lane, blue the south,
yellow the band nothing reaches. They converge at the right-hand side of the
board and leave as one road.

The geometry file records this rather than papering over it. `lanes.north` and
`lanes.south` are the two full centrelines from their own entrance to the exit
they actually reach; `merge` carries the junction and how far along each lane
its shared tail begins; `orphanBand` carries the third band, its terminal and
the note that nothing walks it. A `_conflict` string at the top of the file says
the same thing in one paragraph, so nobody reads the numbers without reading it.

**Nothing was moved, re-routed or invented to make the brief true.** Building
level 6 as designed needs new art or a new design; this pass cannot supply
either, and guessing a lane that is not painted would be a fabricated
measurement in a file whose whole job is not to contain one.

### What it costs, concretely

- One exit is dead. Both exits are supposed to cost lives; only one can be
  reached.
- Both spawns funnel into one exit, so the last 267 px is a single choke and
  every tower covering it covers both waves.
- `src/systems/Flame.ts` and `src/data/level6.json` both assert the Rooster's
  corridor "cannot leave its lane — level 6's two lanes are parallel and never
  meet, so that is a property of the map rather than a check in code." Over the
  shared tail that is false by definition. See §6.

---

## 4. Road width and road length

### Width

| measurement | value |
|---|---|
| tracer, median of normals over all three bands | **40.0** |
| checker, independently | **39.5** (1.25% apart) |
| the two apart | 1.25%, inside the brief's 3% gate |
| tan + the black kerb the art draws round it | 47–48 |
| the brief's reference | 43 → **−7%** |
| house standard | 50 (L4), 51 (L8), 54.6 (L3), 62 (L5), 80 (L1) |

Sensitivity was checked before the number was believed: moving the road
thresholds from `r−g≥35, b≥30, lum>95` to `r−g≥45, b≥45, lum>120` moves the road
pixel count by 2.5% and the width by under a pixel. A vertical cut at x = 300
reads tan from y = 131 to y = 170 with 4 px of kerb either side, which is the
same 40.

**40 is what the paint is.** It is the narrowest road in the game by a clear
margin.

### Length

| measurement | value |
|---|---|
| traced, north + south + orphan, shared tail counted once | **5086.9** |
| road pixels ÷ road width, which touches no geodesic | **5111.5** (201 509 px ÷ 40) |
| the two apart | **0.5%** |
| the brief's reference | 5694 → **−10.7%** |

Per band: north 1645.7, south 1473.3, orphan 2235.0, shared tail 267.1.

The brief's own pair is internally inconsistent with the plate: 43 × 5694 is
245 000 px of road and the painting has 201 509. My pair multiplies out to
203 500, which is the paint. Both reference figures are recorded in
`check_level6.py` and printed on every run, and neither is enforced — the same
handling `check_level8.py` gives its brief's road length, and for the same
reason: enforcing a figure the plate does not support fails every run forever.

### The 3% gate on lane lengths did not hold, and why

The brief asks the checker to fail on more than 3% disagreement in re-derived
lengths. It cannot, and the reason is about geodesics rather than about this
plate. The tracer's centre-seeking cost is `1 + 24/depth`; level 4's, which the
checker reuses so that the two walks really are two walks, is
`1 + 2.2·((maxdepth−depth)/maxdepth)³`. Level 4's is much the shallower — a 2.7×
spread from the middle of the road to its kerb against the tracer's 6× — so on a
serpentine it rounds the inside of every bend:

| lane | tracer | re-traced | apart |
|---|---|---|---|
| north | 1645.7 | 1566.8 | 4.8% |
| south | 1473.3 | 1399.5 | 5.0% |
| orphan | 2235.0 | 2106.6 | 5.8% |

Re-normalising level 4's penalty makes it worse in both directions and that was
measured, not assumed (maxdepth 26 → 4.8%, 20 → 5.3%, 14 → 6.4%, 10 → 7.2%).
Level 8 hit the same wall and set 10%.

So the length gate is **6%**, and the work the 3% gate was standing in for is
done by three tests that are tighter and do not care which geodesic drew the
line:

- **Every shipped vertex on paint and near its middle** — 0 of 79 north and 0 of
  57 south vertices off the paint, 0 nearer the kerb than 45% of the half-width.
- **The shipped lines cover the paint** — 99.78% of painted road pixels sit
  within one road width of some shipped centreline. A lane that skipped a
  stretch or took the wrong arm leaves a hole here that no length figure has to
  notice.
- **The area identity** — road pixels ÷ road width against the declared total
  road length, gated at 3%, lands at **0.48%**.

The width gate is the brief's 3% and it holds.

---

## 5. The eighteen pads

Found by colour, not derived from clear ground. Every one comes out with an
ellipse fill (blob area over the area of its bounding ellipse) of 0.99–1.01,
which is what a painted ellipse looks like and what a shadow or a smear does
not.

`→lane` is centre to the nearest lane centreline. `→paint` is centre to the
nearest painted road pixel — the brief's ruler.

| # | centre | w × h | squash | →lane | →paint |
|---|---|---|---|---|---|
| 1 | 669.0, 52.2 | 118 × 91 | 0.771 | 80.7 | 61.4 |
| 2 | **1167.1, 53.0** | 113 × 89 | 0.788 | **248.8** | **224.5** |
| 3 | 287.5, 61.5 | 118 × 93 | 0.788 | 89.7 | 70.6 |
| 4 | 805.1, 145.2 | 121 × 89 | 0.736 | 103.1 | 76.9 |
| 5 | 1088.5, 189.8 | 118 × 90 | 0.763 | 90.8 | 67.1 |
| 6 | 552.3, 192.2 | 120 × 87 | 0.725 | 79.0 | 60.0 |
| 7 | 253.7, 295.4 | 116 × 89 | 0.767 | 81.0 | 61.0 |
| 8 | 664.2, 325.5 | 115 × 86 | 0.748 | 73.6 | 53.8 |
| 9 | 85.5, 325.6 | 115 × 86 | 0.748 | 81.4 | 60.2 |
| 10 | 979.7, 345.5 | 119 × 87 | 0.731 | 79.6 | 58.8 |
| 11 | 1189.5, 426.0 | 116 × 91 | 0.784 | 87.7 | 68.1 |
| 12 | 226.1, 451.8 | 114 × 83 | 0.728 | **70.0** | **51.6** |
| 13 | 815.6, 456.1 | 110 × 78 | 0.709 | 71.0 | 51.0 |
| 14 | 990.5, 511.2 | 112 × 83 | 0.741 | 75.9 | 55.1 |
| 15 | 675.8, 571.7 | 117 × 86 | 0.735 | 79.8 | 60.0 |
| 16 | 285.8, 606.9 | 117 × 92 | 0.786 | 86.4 | 67.4 |
| 17 | 892.4, 642.6 | 112 × 88 | 0.786 | 81.0 | 60.0 |
| 18 | 508.9, 670.6 | 110 × 79 | 0.718 | 86.3 | 62.2 |

Median painted ellipse **116 × 88**, which is the brief's 116 × 87. Every pad's
radius-24 core sits entirely on buildable ground (floor or painted pad); none
runs off the frame; the checker's independent read puts every centre within
0.3 px of these.

### Finding (a): the standoff, corrected

Measured the same way on every level:

| level | centre → centreline | centre → paint edge | road width |
|---|---|---|---|
| **6** | **70.0 – 103.1, median 81.1** | **51.0 – 76.9, median 60.6** | 40 |
| 3 | 91.7 – 112.0, median 102.4 | 64.4 – 84.7, median 75.1 | 54.6 |
| 4 | 90.9 – 111.0, median 101.9 | 65.9 – 86.0, median 76.9 | 50 |
| 8 | 90.1 – 101.0, median 91.2 | 64.6 – 75.5, median 65.7 | 51 |

*(Pad 2 excluded from level 6's range — see below.)*

Levels 3, 4 and 8's `PAD_MIN_FROM_LANE`/`PAD_MAX_FROM_LANE` of 90–114 is a
centre-to-**centreline** band; `trace_level8.py` measures it with
`dist_to_lines` against the lane polylines and `check_level4.py` with
`point_to_polyline`. The brief's 48–84 is a centre-to-**paint** figure. Compare
like with like and level 6's pads are **20% closer than levels 3 and 4's and 11%
closer than level 8's**, not 50%.

That is still a real balance change and it is bigger than 20% sounds, because
what a tower buys is the *chord* of lane inside its range, and the chord grows
much faster than the standoff shrinks:

| level | median standoff | lane covered by one 112-range tower |
|---|---|---|
| **6** | **81.1** | **154.5 px** |
| 8 | 91.2 | 130.0 px |
| 4 | 101.9 | 93.0 px |
| 3 | 102.4 | 90.7 px |

**1.7× level 3's coverage per gun.** The pads were not moved and are not
rejected; they are painted on, and moving them would be redrawing the art. The
Rooster's HP has to be soaked against *this* board.

### The eighteenth pad is dead

**Pad 2, at (1167, 53), is 248.8 px from the nearest lane.** The shortest tower
range in the pool is 112. Nothing built there can reach any road, on any lane,
ever. It passes every ground test, it will draw correctly, and a player who
builds on it has bought a tower that fires at nothing. `check_level6.py` names
it on every run. Reported, not fixed — it is painted on, like the rest.

Excluding it, the seventeen live pads run 70.0–103.1 to a centreline (median
81.0) and 51.0–76.9 to paint (median 60.6).

### Finding (c): the squash

The painted ellipses are drawn at a median height-to-width of **0.748**
(0.709–0.788; the checker reads 0.757 on its own thresholds). The engine draws
every ground marking at **0.62** — `PAD_SQUASH` in `src/scenes/GameScene.ts` and
`GROUND_SQUASH` in `src/systems/AbilityRunner.ts`, the same constant twice.

So an engine-drawn ring on one of these pads will be about **18% flatter than
the paint under it**, and it will also be much smaller: the build-spot footprint
radius is 34, so the ring is 68 × 42 against a painted ellipse of 116 × 87.
Neither number is changed here. Both are worth a decision in the map pass —
matching the engine to the paint would move every ability telegraph on every
level, and matching the paint to the engine is a re-export.

---

## 6. Finding (b): a 40 px road under this roster

Sprite widths are `displayHeight × contentWidth / contentHeight` from
`art.json`; `shadowWidth` is the measured ground footprint.

| enemy | display h | display w | shadow w | shadow ÷ 40 | sprite ÷ 40 |
|---|---|---|---|---|---|
| Sprinter | 64 | 60.3 | 43.9 | 1.10 | 1.51 |
| Scrapper | 68 | 61.9 | 47.7 | 1.19 | 1.55 |
| **Bruiser** | **85** | **96.1** | **65.1** | **1.63** | **2.40** |
| Rooster | 145 | 148.2 | 148.6 | 3.71 | 3.70 |

The brief says the Bruiser is "about 92 world px"; `art.json` says
`displayHeight` 85, which is 96.1 px *wide*. Either reading gives the same
answer: **its shadow alone is 63% wider than the road it walks on**, overhanging
the paint by about 12.5 px each side. On level 5's 62 px road the same shadow
overhangs by 1.5 px; on level 4's 50 px road, 7.5.

Two consequences, neither of which is a reason to rescale the art:

1. **Nothing on this board spreads across the lane.** `Enemy.ts` computes
   `room = max(0, laneHalfWidth − displayWidth/2) × 0.72`. With `laneHalfWidth`
   20, the *smallest* enemy in the roster is 60.3 px wide, so `room` is 0 for
   all four and every enemy walks the exact centreline. That is the single-file
   failure `rules.json`'s `laneSpread` note was written to fix — "a wave was a
   single file and two enemies at different speeds walked straight through each
   other" — and it means splash covers a line here, not a band. In fairness this
   roster collapses to 0 on every road in the game except level 1's 80 px; level
   6 just has the largest margin of failure.
2. **The flame's width was set against a road that does not exist.**
   `level6.json` says "64 is about a road's width, so the fire fills the lane it
   is in and nothing either side of it." The road is 40. A 64 px corridor is
   **1.6× the road**, spilling 12 px past the paint on each side.

### And the flame can cross lanes anyway

`Flame.ts` delegates the guarantee to the map — "it cannot leave its own lane …
that is a property of the map rather than a check in code" — so the map's
checker is where it gets tested. It does not hold, and not only because of the
merge:

The corridor is a **straight** capsule 300 px along the boss's heading; the
roads are serpentines. Sampling every 2 px along each lane's pre-merge stretch
and casting the corridor:

| boss walking | fraction of its pre-merge walk that puts the other lane inside the corridor | closest approach |
|---|---|---|
| north lane | **19–20%** | **0.0 px** (fire half-width 32) |
| south lane | **15–21%** | **0.0 px** |

A boss at (132, 112) on the north lane sends its corridor clean through the
south lane at (337, 214). A boss at the south entrance (8, 150) walking east
puts the north lane, which is descending into that y, inside its corridor at
(306, 150). And over the last 267 px the two lanes are one road, so the corridor
covers both by definition.

Recorded, not fixed. `check_level6.py` prints it on every run.

---

## 7. Step 5 — does the engine handle fully independent parallel lanes?

**The pathing and leak systems do. Four call sites that use "the main lane" as a
stand-in for "the road" do not, and level 6 is the first map where that
substitution is wrong.**

### What already works

`src/systems/Lanes.ts` builds the network as `[main (map.waypoints),
...map.lanes]` and a lane with no `merge` is documented as one that "runs to an
exit". Two lanes, neither declaring a merge, is therefore a legal and
already-modelled shape — it is not the fork-that-rejoins case wearing a
disguise:

- `LaneNetwork.transferFrom(id)` returns null for a lane with no continuation.
- `Enemy.leaked()` is exactly `if (transferFrom(laneId)) return false; return
  laneDistance >= gatesHere().stopDistance` — per lane, with no reference to a
  trunk.
- `Gateway.laneGates()` builds `mouthDistance`/`gateDistance`/`stopDistance`
  **per lane**, converting the plate's `emergeFromX`/`gateX`/`vanishX` through
  each lane's own `distanceAtX`. Its header already says why: "a map may now
  have more than one exit and they need not be equidistant". Level 6's two exits
  are both at x = 1279, so one `gateX` serves both.
- `terminals()`, `routeLengths()` and `routeLength()` all return per-route
  answers and already handle more than one.
- `validateLanes()` does not require lanes to connect to each other, so two
  disjoint lanes raise nothing.
- `WaveSpawner` carries a `lane` per spawn group, so waves can be aimed at
  either.
- `Rally.nearestOnLanes()` walks `net.lanes` — every lane, not main.
- `roadLeftFrom()` in `GameScene` walks `this.lanes.lanes` — every lane.

### What does not

`GameScene` sets `this.lane = this.lanes.main.path` with the comment that main
"is what the board bounds, the sign placement and the gateway distances are all
measured against". On levels 3, 4 and 5 main is the **shared trunk**, so every
enemy walks it and "the main lane" is a fair proxy for "the road". On level 6
there is no shared trunk before the last 267 px, so main is one lane out of
three and four things measure against half a board:

| site | what it does | on level 6 |
|---|---|---|
| `drawCoveredLane` (GameScene ~2585) | paints the stretch of road a selected tower covers | a tower on the south lane shows **no** covered stretch |
| `washLane` (~3195) | the targeting overlay for path-restricted abilities | paints only the north lane |
| `validCastPoint` (~3218) | `pathOnlyWithin`: a summon may only be cast within *n* px of `this.lane` | **summons are refused outright anywhere near the south lane** |
| `powerHazard` (~4139) | turns a Spike Strip to `this.lane.headingNear(x, y)` | laid at the north lane's angle on the south lane |

The third is a functional bug, not a cosmetic one: the Gnomes and anything else
carrying `pathOnlyWithin` become uncastable on half the map.

**So: say it before anyone builds on it.** The distinction matters, and the fix
is small and local — those four want "the nearest point on any lane", which
`Rally.nearestOnLanes` already computes and `roadLeftFrom` already demonstrates
the loop for. It is not in this pass's scope and no code was changed for it.

One more thing a builder needs: `main` is `map.waypoints` and is mandatory, so
level 6's `map_level6.json` has to put one of the two lanes there and the other
in `lanes` with no `merge`. Given the merge the plate actually has, the honest
map file today is closer to level 4's `upper`/`lower`/`main` shape than to two
independent lanes — which is another way of saying §3 has to be resolved before
the map file can be written at all.

---

## 8. What was NOT checked

- **Nothing was rendered.** No harness run, no screenshot, no frame. This pass
  produced a plate, a geometry file, a checker and two overlays; it built no UI
  and no scene, so there was nothing for `tools/harness/` to look at. The nine
  non-asserting harness scenarios and the black-`GL=1`-screenshot problem named
  in the brief were therefore not touched and remain open.
- **No soak.** The Rooster's HP is not tuned here and the wave table was not
  run. §5 says what the board's DPS profile is; converting that into a boss
  number is the soak's job and needs the map file, which needs §3 resolved.
- **No `map_level6.json`, no `levels.json` row.** The brief says not to build
  the level and it was not built.
- **The pads' spacing to each other** was not gated. Levels 3, 4 and 8 enforce
  74 px between pad centres because they *place* pads; these are painted, so the
  artist's spacing is the answer and gating it would only be a way to fail.
- **`npm install` / `tsc` directly** — unavailable as always. `sh tools/tsdiff.sh
  128c289` reports 212 distinct errors in the working tree against 212 in the
  baseline: **nothing introduced**.
- The full suite passes: **1024 tests, 0 failures**.

---

## Where this leaves the repository

**In flight**

- Branch `claude/level-6-map-geometry-zw4qb1`, one commit, fast-forwardable onto
  `main`. Merge command is in the covering message.

**Blocked, and this is the one that matters**

- **Level 6 cannot be built as designed.** The plate merges the two lanes and
  leaves one exit unreachable. Three ways out, none of which this pass can
  choose: re-paint the plate so each entrance runs to its own exit; re-design
  level 6 as a two-spawn merge map, which is levels 3 and 4's shape and which
  the engine already supports completely; or accept the paint and re-write the
  roster and flame notes that depend on the lanes being independent. Until that
  decision lands there is no `map_level6.json` to write and no soak to run.
- The Rooster's HP is unset and should stay unset. Whatever board level 6 ends
  up with, it is not comparable to any earlier level's: one tower covers 1.7×
  the lane it covers on level 3.

**Waiting on a decision**

- **Road width 40 against a house standard of 50.** Every level 6 enemy already
  collapses to the lane centreline, the Bruiser's shadow overhangs the paint by
  12.5 px a side, and the flame's `width: 64` was written against a road that is
  40. Rescale the art, re-paint the road wider, or accept it and retune
  `flame.width` — all three are map-pass calls and none was taken here.
- **Pad ellipses at 0.748 squash against the engine's 0.62**, and 116 × 87
  painted against a 68 × 42 engine ring. Matching the engine to the paint moves
  every ability telegraph on every level; matching the paint to the engine is a
  re-export.
- **`this.lane` as a stand-in for "the road"** at the four sites in §7. Harmless
  on levels 1–5, wrong on any map without a shared trunk. Fix it before level 6
  ships, whichever shape level 6 ends up being.

**Carried forward from `reports/2026-09-07-level-6-roster-and-plate-spec.md`**

- The stitched 2970 × 316 proof and everything derived from it is superseded.
  `tools/level6_geometry.json` was **replaced**, not edited: the old file
  described the strip's normalised waypoints and four contact-sheet segments and
  every number in it was wrong for this art. The stale paragraph in
  `src/data/level6.json`'s `_note` that pointed at it has been rewritten.
- Still open from that report and untouched here: the level 6 row in
  `levels.json`, the map file, the pads in the map file, and the soak.

**Carried forward from the brief, unaddressed**

- Nine harness scenarios still run zero assertions.
- Every `GL=1` screenshot is still black for want of `preserveDrawingBuffer`;
  the `renderer.snapshot` route with a disarmed pending snapshot on timeout is
  still unwritten.
