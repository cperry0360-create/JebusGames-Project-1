# Level 2, traced off its painted overlay

2026-09-04.

| | commit | CI |
|---|---|---|
| Level 2 map data, its checker, and the overlay out of `public/` | `e369489` | green ([run](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33863764698)) |

PR [#2](https://github.com/cperry0360-create/JebusGames-Project-1/pull/2), open,
branch `claude/level2-volcanic-map-recreation-3szo07`. Nothing is on `main`.

---

## 0. Read this first: the report this was to be recreated from does not exist

The task was to recreate the level 2 work from
`reports/2026-09-04-level-2-volcanic-map.md`, "which reproduces every changed
and added file in full."

**That file is not in the repository, is not in any commit on any branch, is not
in the reflog or among the dangling objects, and is not attached to the one
other PR.** The only level 2 material that exists is the pair of uploads in
`c64737a`: `map_level2.webp` and `level2_path_overlay.png`.

So none of what follows is a transcription. It is the work redone from the
overlay, which is the same source the original had. Where the three corrections
gave a number, that number is here. Everything else is derived fresh, and the
places where my reconstruction and the corrections disagree slightly are called
out in §5 rather than smoothed over.

## 1. What the overlay is, and why level 2 gets a checker instead of a tracer

Level 1 was traced by `tools/trace_map.py`, which had to decide for itself what
was road and what was grass, and had to be re-tuned twice when the art changed
under it.

Level 2 arrived with the answers drawn on. `level2_path_overlay.png` is the
volcanic plate at 1440x810 — 1.125x the 1280x720 canvas — with:

- the lane's centre stroked in **cyan**, 9,641 px, about four px wide, running
  edge to edge;
- seventeen candidate tower pads ringed and **numbered** in green, 0 through 16,
  424 px per ring.

Nothing has to be classified to find the route: it is authored art. That turns
the tool round. There is no trace to make and then trust, there is a drawing to
agree with — so `tools/check_level2.py` re-derives every number and reports
where `map_level2.json` disagrees with the painting. `--emit` prints the JSON it
would produce instead.

Reproduce:

```
python3 tools/check_level2.py                 # ~4 min, pure python, no deps
python3 tools/check_level2.py --emit
```

Both take `--overlay` and `--map`.

## 2. The numbers

```
overlay 1440x810  (0.8889 canvas px per overlay px)
  lane stroke 9641 px, pad rings 7208 px
  road band 158340 px, 945 filled, lane component 154387 px
  lava 66455 px, 9903 px of embers and sparks dropped
  road half-width along the lane: narrowest 22.2, median 32.9, widest 46.2 canvas px
  17 pad rings

waypoints: 49 stored, worst deviation from the painted centre 1.0 overlay px
roadWidth: 65.8 stored, 65.8 measured
buildSpots: 15 stored against 17 rings; closest pair 2-5 at 59.0 canvas px
  pads 2 and 5 are 59.0 px apart; their 34px tap rings overlap
  pads 5 and 7 are 59.6 px apart; their 34px tap rings overlap
  ring at 0.054,0.356 (canvas 69.3, 256.0) carries no pad
  ring at 0.385,0.948 (canvas 493.3, 682.7) carries no pad
heroStart (611.0, 633.3): 120x55 footprint has 0 lava px in it and clears lava
  by 109.3; road edge 94.2, nearest pad 78.9 canvas px

map_level2.json agrees with the overlay
```

**Method, per number.**

- **`roadWidth` 65.8.** The same method level 1's 80.0 comes from: the median
  clearance from the lane's centre to the nearest pixel that is not road,
  doubled, on the same four-neighbour metric so the two plates are comparable.
  Median and not widest, because the lane has to fit its narrowest stretch —
  which here is 22.2 against a widest of 46.2. This road is 18% tighter than
  level 1's, so every lateral figure derived from it moves with it.
  <br>Two passes matter before measuring. Small dark gaps in the road (pebbles,
  cracks) are filled — 945 px — or a pebble mid-lane halves the measured width.
  And the road band also matches pale boulders all over the plate, so only the
  component the cyan stroke runs down is kept: 158,340 px of band, 154,387 px of
  lane.
- **49 waypoints.** The cyan stroke walked as a geodesic from edge to edge
  (a per-column sample cannot work: the lane doubles back through four S-bends),
  each step re-centred in the stroke, box-filtered, then Douglas-Peucker at 1.1
  overlay px. Worst deviation **1.0 overlay px, 0.9 canvas px**, against a stroke
  four px wide — the route is inside the paint for its whole length.
- **15 pads** from 17 rings, at the ring centroids. See §4.
- **`heroStart` (611.0, 633.3).** See §3.

## 3. `heroStart`: measured against the plate, with the sprite's real height

The value this replaces is `(588.0, 128.0)`.

The lane's own highest point on this plate is **y = 163.7**. A hero whose feet
are at y=128 is above every part of the board the enemies ever walk on, on a
plate where everything above the lane's top bend is lava field. He is about 120
world px tall, so his head is over the top edge of the painting; **129 px of his
footprint are in molten rock**.

The replacement was picked by requiring his whole 120x55 footprint to be clear
of lava, then keeping the clearances that made the old spot look defensible.
What it measures:

| | old (588.0, 128.0) | new (611.0, 633.3) |
|---|---|---|
| lava px under the footprint | 129 | **0** |
| nearest lava | 0.0 | **109.3** |
| road-edge clearance | 186.7 | 94.2 |
| nearest pad | 106.5 | 78.9 |

The old note derived the position from clearances alone, which is exactly how a
spot in a lava field passes: clearances say nothing about what is painted
underneath. The note now says what it is measured against.

**Lava needs a despeckle pass.** A single 1-px painted ember 31 px from his feet
read as lava underneath him. Blobs under 60 overlay px are embers and sparks on
rock, not molten ground; 9,903 px go that way.

## 4. Two rings carry no pad, and that is deliberate

Confirmed: the rings at **0.054,0.356** (canvas 69.3, 256.0) and **0.385,0.948**
(canvas 493.3, 682.7) are meant to be absent, and `check_level2.py` **prints**
them rather than failing.

They are the only two of the seventeen that do not clear the plate edge. The
first is 69 px from the left edge, inside the stretch where enemies are still
fading in from off the plate; the second is 36 px from the bottom, closer than
the pad plate's own half-width of 39.7 world px, so its dirt oval would hang off
the painting. **Every other ring clears every edge by at least 79 px.**

The script never fails on an unclaimed ring. Which candidates become pads is a
design decision the art cannot record, and a check that failed on one is a check
somebody silences.

*Caveat, stated plainly:* the corrections confirmed these two are meant to be
absent but did not say why, and the missing report is where the reason lived.
Edge clearance is the only measurement that separates exactly these two from the
other fifteen — lava clearance does not (the bottom one is the second-best of
all seventeen at 74.7), nor does distance to the lane. The rationale above is
therefore mine, fitted to the data, not recovered.

## 5. Where my numbers and the corrections differ

Small, and worth having on the record rather than quietly rounded:

| | correction said | measured here |
|---|---|---|
| road-edge clearance at `heroStart` | 96 | **94.2** |
| nearest-pad clearance at `heroStart` | 80 | **78.9** |
| lane's highest point | 163 | **163.7** |

Both clearances are within 2 px, which is what a different distance metric or a
slightly different road mask costs; the position itself is unchanged and both
still clear the thresholds the checker holds (90 and 75). The notes in
`map_level2.json` carry **my** measured figures, because the point of correction
2 is that a file must not document a number its own check disagrees with.

The waypoint deviation is exact: the note said 0.6, `check_level2.py` reports
**1.0**, and the note says 1.0. The 0.6 was a figure from an earlier simplifier
epsilon that nothing re-measured when the epsilon moved.

**Why the ends had to change.** With the end waypoints dragged out to x=-60 and
x=1340 in place — how level 1 does it — the worst deviation was **13.0 overlay
px**, not 1.0. Level 1 gets away with the drag because that lane meets both
edges flat; this one arrives on a slope, so holding y while moving x 62 px swung
the opening segment right off the paint. Each run-off point is now a *new* point
on the heading the lane already has when it reaches the edge, and every traced
point survives. This is the one place the level 2 data is shaped differently
from level 1's on purpose.

## 6. The overlay is out of `public/`

`public/assets/maps/level2_path_overlay.png` → `tools/level2_path_overlay.png`.

1.9MB, and exactly one thing opens it: `check_level2.py`. Everything under
`public/` is deployed whether or not the manifest points at it, so it was 1.9MB
on every phone for a file the game never reads — the same rule that took the
10.9MB plate PNG and 282 unused pack tiles out of the deploy, and the same rule
`content.test.ts`'s deploy budget exists to enforce. It now lives beside the
script that reads it. `check_level2.py` takes `--overlay`, defaulting there.

`tests/level2.test.ts` holds it: the file must exist under `tools/`, must not
exist under `public/assets/maps/`, and the script must not name the old path.

## 7. What else is in the diff

- **`src/data/art.json`** — `map-level2` → `maps/map_level2.webp`, and
  `art.map.level2`. The plate is a first-class manifest role like level 1's, so
  which painting level 2 draws stays a config change. The webp was already in
  `public/` and referenced by nothing.
- **`tests/level2.test.ts`**, six tests. CI has no PNG decoder and no business
  reading a 1.9MB image, so these hold the properties that survive without the
  overlay: the file is the same shape of map as level 1's; the plate resolves to
  a file that exists and is not level 1's painting; the lane crosses the plate,
  runs off both ends and has no zero-length hop; every pad is on the plate, off
  the road, and inside the roster's longest range (215); and the hero starts
  inside the band the lane occupies — the part of the old `heroStart` that was
  wrong without opening the image at all.

## 8. Known, not fixed: the pads are spaced by the art, not by the game

The painter spaced the rings by the circle drawn in the overlay — about 15 world
px across — not by the **34 px tap radius** the game gives a node. Two pairs are
inside two tap radii and their tap targets overlap:

| pair | apart |
|---|---|
| 2 – 5 | 59.0 |
| 5 – 7 | 59.6 |
| 5 – 6 | 69.3 (clears by 1.3) |

Level 1's closest pair is **186.3**, held there by a 141 px minimum in the
tracer with an explicit reason: no two spots may cover the same bend, or two
spots are spending one decision. Fifteen pads on one board is also a lot against
level 1's seven, and a four-tower cap.

This is fixed by moving a ring in the overlay, not by editing the JSON, so it is
reported on every run and left for the art. `tests/level2.test.ts` holds only
the part that is not a judgement call — no pad inside another's ring — and says
in the test why the threshold is not 2x.

It has to be resolved before anyone plays this map.

## 9. Not checked

- **Nothing was rendered.** `GameScene` is untouched, per the task; level 2 does
  not load and the harness has no scenario for it. Every number here is measured
  off the overlay, not observed on a board.
- **The plate itself.** `map_level2.webp` was never decoded — `png.py` reads PNG
  and there is no webp decoder or Pillow in this environment. The overlay is the
  plate at 1440x810 with annotations, so it stands in for it; a difference
  between the two (a re-export, a mismatched crop) would not be caught.
- **Balance.** No wave, economy or tuning work for a second map. `roadWidth`
  65.8 against level 1's 80.0 means enemies spread across a narrower lane, which
  changes what splash is worth; nothing was re-derived.
- **The furniture.** Level 2 has no arch, gate, sign, innkeeper or Bailey clumps,
  and `map_level2.json` carries none of those blocks. Whether the volcano needs
  its own entrance and exit treatment is unasked.
- **Marker numbering.** The rings are numbered 0-16 in the art. The numbers are
  read by eye in this report and by position in the script; nothing OCRs them,
  and `buildSpots` order is the overlay's reading order, top to bottom, which is
  *not* the painted numbering.

## Where this leaves the repository

- **Waiting on you:** whether 15 pads is the intended count for a second board
  at all (level 1 has 7, with a four-tower cap); the two overlapping tap-target
  pairs in §8, which are an art fix; whether `heroStart` at (611.0, 633.3) reads
  right on the actual board, which is a look, not a measurement.
- **In flight:** PR #2, green, not merged. `checks.yml` is `branches-ignore:
  [main]`, so nothing on this branch has run against `main` and nothing should
  until the PR merges.
- **Closed:** the overlay's 1.9MB deploy cost; the `heroStart` lava field; the
  0.6-vs-1.0 deviation the file documented against its own check.
- **Blocked on nothing.**
- Carried forward from `2026-09-04-node-first-build.md`, unchanged by this work:
  re-cut the sign art at ~270px wide; the 568x320 drawer grid lever; whether the
  drawer's tab bar has words; the sign *text* alignment item; the hero
  walk-sheet redraw (not a task unless you say so). Longer-standing: 18 trait
  phrases await approval; towers 0.91x the lane; balance not re-tuned for the v2
  lane; `icon_confirm.png` and `assets/nodes` unreferenced; `checks` not a
  required status on PRs; `hud_peanut_icon.png` unwired.
