# Level 9 back into band, and the flank put on painted road

| commit | what | CI |
|---|---|---|
| `da3b959` | `png.write` Paeth-filters rows once an image is over four megapixels | [run 403](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/35083832912) green |
| `f706d04` | The corridor painted into the plate, and the whole level 9 pipeline re-derived from it | run 403 green |
| `e505a4d` | `flankShare` 0.10 and PERPLEXED 7650, with `tools/soak/tune9.ts` | run 403 green |
| `a0cece1` | This report, `SOAK-REPORT.md` and `claude/context.md` | run 403 green |
| *this commit* | Closing this table on run 403 | it edits this table and nothing else |

All four were pushed together, so only the head got a run of its own; **run 403
checked the tree containing all four.** Green on `changes`, `typecheck`, `test`,
`deploy / build` and `deploy / deploy` — **five jobs, and the deploy RAN rather
than skipping**, because the push touched `src/` and `public/`. So the live site
carries the repainted plate and the retune. Read the job list, not the
conclusion.

**`main`'s tree was read back afterwards** and carries `tools/paint_level9_flank.py`
(11,709 bytes) and `tools/soak/tune9.ts`, alongside the rewritten
`tools/trace_level9.py` (54,917), `tools/check_level9.py` (38,500),
`tools/build_level9_map.py` (29,992), `tools/level9_geometry.json` (11,847) and
`tools/orphan_roads.py` (15,580), plus the repainted
`art-source/level9/map_level9.png` and `public/assets/maps/map_level9.webp`.

**Answers first.**

1. **Level 9 soaks 192/480 on normal — 40.0%** — against 113/480 (23.5%). That
   is the middle of the 35-45% band. Levels 1-8 and 10 are **identical integers
   on the same 480 seeds**.
2. **PERPLEXED's health did the work.** `flankShare` 0.25 → 0.10 carried it from
   23.5% to 33.5%; PERPLEXED 8100 → 7650 carried the remaining 6.5 points. The
   other three mini bosses were swept and are flat levers.
3. **The flank is 0.20% off-paint**, against 12.63% before, and it is now the
   **cleanest of the five lanes** — north 1.30%, south 0.56%, tail 0.61%, hook
   1.47%, flank 0.20%.
4. **`tests/orphanroads.test.ts` reads 0.00% orphaned road on level 9**, and no
   other level moved. The flank did not need lever 3: **wave composition was not
   touched.**

---

# 1 — The paint

## What was wrong

The spur was a **stub**, not a loop. Its north end was always the door junction;
its south end was a rounded cap on open substrate, 112 px from the trunk with
**62.6 px of unpainted board between the two kerbs**. `map_level9.json` bridged
that with one authored straight segment — the shape `map_level6.json` uses over
82 px — and a walker on it stood on the substrate beside a capacitor.

Measured per lane, as the share of each lane with no painted road under it
(`python3 tools/orphan_roads.py --lanes --only level9`, new in this change):

| lane | before | after |
|---|---|---|
| north | 1.30% | 1.30% |
| south | 0.56% | 0.56% |
| tail | 0.61% | 0.61% |
| hook | 0.33% | 1.47% |
| **flank** | **12.63%** | **0.20%** |
| flank's longest unpainted run | **62 px** | **1 px** |

The brief's own figures were north 2.1%, south 1.2%, tail 1.7%, hook 5.7%,
flank 15.2%. Mine are lower across the board and the ordering and the finding
are the same; the instruments differ in where they sample and how they treat
the off-plate gateway stretches. **What matters is the flank: an order of
magnitude worse than every other lane, and now the best of them.** The hook's
1.47% is not a regression — the hook is a different, shorter lane than it was,
because the tail is cut at a junction 5 px further east.

The residual 0.20% is 1 px at a time: a centreline clipping an antialiased kerb
at a corner, at the cyan classifier's own threshold. There is no run longer than
one pixel anywhere on the lane.

## How the corridor was painted

`tools/paint_level9_flank.py`, and **nothing in it is drawn by hand**.

- **The colour is the plate's own road.** A cross-section is measured at two
  places where the spur runs straight and clean — plate x 2900 and 2950, lit
  half-width 68.5 px, bright edge streaks at ±54 and ±56, no centre line —
  averaged, mirrored, and used as a lookup from distance-to-the-road's-edge. The
  new trace has the same width, kerb, glow and inner streaks because it **is**
  the old one's profile.
- **The kerb comes from the union, not from the corridor.** A capsule stamped
  with its own kerb draws a dark outline straight across the two roads it joins
  — a T-junction with a wall in it. The distance transform (Danielsson's
  four-pass vector propagation, exact rather than chamfer, because the kerb is
  3.5 px on a 68 px road and a 4% error would smear it) runs on the **union** of
  the existing lit trace and the new capsule, so a kerb is drawn only where the
  joined shape actually has an edge.
- **Only what the corridor changed is repainted.** Two wrong answers were
  rendered and looked at first. Repainting the whole write zone redraws the old
  road's inner streaks around the union's boundary while the artist's own
  streaks survive just outside it, and the junction fills with stranded arcs.
  Repainting none of it leaves the spur's **rounded cap** — which is lit trace —
  sitting inside the merged junction as a pill. What is rewritten is the pixels
  the corridor made *deeper*: an old edge decoration now well inside the joined
  road. Everything else is the artist's and is kept.

## Where it runs, and the two it had to miss

Three routes were rendered over the plate and compared before one was taken.

The channel is genuinely tight. The **capacitor** holds x 899-926 for y 478-536;
**chip 13's** ink ends at x 852-855 below y 521. A vertical through that window
needs a centre between **x 875.3 and 876.7** — a 1.4 px window — and then cannot
reach the cap without crossing the SMD pad column at x 876-886. That candidate
was rendered: it covers chip 13's corner and the pads.

The **straight run from the trunk to the cap** misses the capacitor entirely,
clears chip 13, and crosses **one small surface-mount component**, which the
trace is painted over. That is what a board looks like where a trace runs:
components do not sit under traces.

## The plate, and one thing it cost

`art-source/level9/map_level9.png` and `public/assets/maps/map_level9.webp` are
both rewritten. The webp is re-encoded at q95, the same quality the map's own
`_plate` note records, and lands at 1.38 MB against 1.36 MB — **the deploy is
unaffected in size.**

The source PNG was the surprise. `tools/png.py`'s `write` emitted filter type 0
on every row, which is fine for debug overlays and catastrophic for a painting:
re-encoding came out at **14.9 MB against the art tool's 7.7 MB**. Measured on
this plate, all at zlib 9 — filter 0 14.9 MB, Sub 11.2, Up 9.8, **Paeth 9.0**.
So the writer Paeth-filters now, above four megapixels only, because Paeth costs
36 seconds of pure Python and the measuring tools write a great many small
overlays. The plate lands at **8.6 MB**.

---

# 2 — The tracer had to learn a second cycle

Painting the corridor turns the spur from a stub into a loop, so the band
encloses **two** regions instead of one and `S` — the band pixel geodesically
farthest from the entrance, which was the cap — is not a terminal any more.
Three things changed in `tools/trace_level9.py`, and the method did not.

**The two faces are ordered by centroid x** and the gap is asserted: the west
face (the two arms) is centred at x=384, the east face (the hook and the flank)
at x=994.

**The flank's two junctions come out of the same ring-and-rest method `A` and
`B` already used** — one method, twice. Cutting the east ring out of the band
leaves exactly two runs: everything west of the flank junction, which is the one
holding the entrance, and the door stub east of the door junction.

**Then they are refined by where two walks part company**, because a ring is
band within 1.7 trace widths of its face and therefore *overshoots* a junction
by whatever reach is left when it arrives — measured, 46 px west of the flank
junction and 38 px east of the door one. Close enough to cut the cycle in the
right two places, far too coarse to ship as a node.

> **Both targets have to be deep in an arm, and the door is not one of them.**
> Walking to the door was the obvious choice and it is wrong here: the flank is
> shorter than the hook, so the shortest path from the rejoin to the door goes
> **round the flank**, both walks take the same arm, and they part at the far end
> of it. Measured, that put both nodes on the bottom of the flank — 202 px and
> 280 px from where they belong. The targets are the top of the hook and the
> bottom of the flank.

**The hook and the flank are told apart by how far up the board they go**, not
by length: y=167 against y=337, asserted with a 100 px floor. Their lengths are
within 12% of each other and would be a coin toss.

One number moved for a reason worth recording: the trace width is the median
over the trunk, and the trunk used to be stem + both arms + `tail`, where `tail`
ran all the way to the door junction. Cutting it split that stretch in two, and
measuring only `tail` read **46.0** instead of 47.5 — a derived number moving
because a name moved. The hook is in the sample now and `roadWidth` is 47.5,
unchanged.

## The checker agrees, independently

`tools/check_level9.py` re-derives all of it off a **box-filtered** copy of the
same plate — deliberately a different sampling from the tracer's point-sampled
one — and says *"the plate and tools/level9_geometry.json agree."*

| line | re-traced | geometry | out by |
|---|---|---|---|
| stem | 87.0 | 87.0 | 0.00% |
| north | 1336.8 | 1336.3 | 0.04% |
| south | 417.2 | 417.7 | 0.11% |
| tail | 478.5 | 478.5 | 0.01% |
| hook | 525.1 | 524.9 | 0.02% |
| **flank** | **467.5** | **468.6** | **0.23%** |
| door | 59.0 | 59.0 | 0.01% |

Its dead-end test is **inverted**: the old cap must now *not* be a dead end. And
it is tested by connectivity rather than by a ring share — a 34 px ring reads
45% at a corner, which sits on any threshold you would pick, while the band
walks **97 px** from the flank junction to the old cap against **107 px** as the
crow flies. Before the corridor, that walk was the long way round the board.

## The lanes that ship

| lane | from | to | px | continues |
|---|---|---|---|---|
| `north` (main) | gateway (-60, 324) | rejoin (409, 525) | 1499.4 | `tail` @0 |
| `south` | the same gateway | the same rejoin | 585.5 | `tail` @0 |
| `tail` | rejoin | **flank junction (863, 474)** | 488.5 | `hook` @0 ×3, `flank` @0 ×1 |
| `flank` | the junction | door junction (1109, 330) | **479.0** | `hook` @14 |
| `hook` | the junction | **the door (1177, 329)** | 603.6 | — the only terminal |

**The flank is a SHORTCUT by 56.5 px — 10.6%** — against the 535.5 px of hook it
replaces. It was 6.4% before the repaint; the corridor is a slightly straighter
line than the authored join was.

Route lengths: 2591.4 via the trunk, 2534.9 via the flank from the north mouth;
1677.6 and 1621.1 from the south. `levels.json`'s `laneLengthPx` for level 9 is
updated from 2586.1 to 2591.4 — `tests/levels.test.ts` checks that against the
map and caught it.

**One authored coordinate is left in `tools/build_level9_map.py`**, and it is
the gateway point off the west edge that every level has. The flank's authored
join is gone; `split_at_nearest` is gone with it.

---

# 3 — The retune

## Lever 1: the share

`flankShare` 0.25 → 0.10 on all sixteen waves. **161/480, 33.5%.**

The share was always the smaller lever and the previous report said so: at 0.05
the level already read 33%. The road *existing* costs most of it, because it
spreads a board that is already thin — three of level 9's fifteen pads cannot
reach the trunk at all — over a second road.

## Lever 2: the mini bosses, swept one at a time

All four scaled together is too blunt to tune with: **x0.99 reads 34% and x0.90
reads 55%**, twenty-one points for a tenth of the health. So each was swept
alone, 120 seeds, `tools/soak/tune9.ts`:

**HAT-GTT** (650, armour 4, speed 26) — flat.

| health | 500 | 575 | **650** | 725 | 800 |
|---|---|---|---|---|---|
| win rate | 39% | 39% | **34%** | 34% | 35% |

**CANCER** (3100, armour 14, speed 24) — flat, and not monotone.

| health | 2500 | 2800 | **3100** | 3400 | 3700 |
|---|---|---|---|---|---|
| win rate | 38% | 36% | **34%** | 38% | 33% |

**NO-PILOT** (3400, armour 6, speed 58) — mild and monotone; moves wave 12 only.

| health | 2800 | 3100 | **3400** | 3700 | 4000 |
|---|---|---|---|---|---|
| win rate | 36% | 35% | **34%** | 33% | 32% |
| losses at wave 12 | 3 | 5 | 9 | 11 | 14 |

**PERPLEXED** (8100, armour 12, speed 28) — **steep, monotone, and it moves wave
16 and nothing else.**

| health | 6800 | 7400 | **8100** | 8700 | 9300 |
|---|---|---|---|---|---|
| win rate | 52% | 49% | **34%** | 26% | 18% |
| losses at wave 16 | 7 | 10 | 28 | 38 | 47 |

Every other wave's loss count is *identical* across PERPLEXED's whole range.
That is what a clean single-variable lever looks like, and the other three are
not it.

**Armour is untouched on all four**, which is `difficulty.json`'s own reasoning:
armour changes which towers are viable rather than how hard the level is.

## Choosing the value, at 480 and not at 120

| PERPLEXED health | 7500 | 7600 | **7650** | 7700 | 7800 | 7850 | 7900 | 8100 |
|---|---|---|---|---|---|---|---|---|
| 480 seeds | 206 | 200 | **192** | 187 | 183 | 177 | 170 | 161 |
| rate | 42.9% | 41.7% | **40.0%** | 39.0% | 38.1% | 36.9% | 35.4% | 33.5% |

**The two sample sizes disagree by several points and 7650 is the value that
survives both:** it reads 40% over 120 seeds and 40.0% over 480. 7800 reads 42%
over 120 and 38.1% over 480 — which is exactly the trap `tune10.ts`'s header
warns about, and the reason nothing is published off 120.

## Lever 3 was not needed

**Wave composition was not touched.** No wave's enemies, counts, intervals,
delays or lanes changed; the only edit to `waves.level9.json` is the sixteen
`flankShare` values and its `_flank` note.

## One near miss worth recording

The first attempt at the health edit was `sed -i 's/"maxHealth": 8100,/…/'`. It
hit **two** rows: PERPLEXED and level 8's CEO, which has the same health. That
would have retuned level 8 while claiming not to. It was reverted and the row
located by its `sprite` instead. The re-soak below is what would have caught it
anyway, but only after the fact.

---

# 4 — The soak

`node --experimental-strip-types tools/soak/level.ts 480 <level>`, and confirmed
on the published driver: `tune10.ts 480 level9 normal cory` returns the same
192/480.

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | **9** | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| before | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | **113** | 195 |
| after | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | **192** | 195 |
| % after | 89 | 53 | 88 | 62 | 45 | 44 | 41 | 38 | **40** | 41 |

**Nine levels, identical integers, same seeds.** Level 9 is the only number that
moved, which is what was asked for.

The step by step: **113/480 (23.5%)** → share 0.10 → **161/480 (33.5%)** →
PERPLEXED 7650 → **192/480 (40.0%)**. The repaint itself is worth about two
points of that: 8100 with share 0.10 read 152/480 before the plate changed and
161/480 after, because the flank came out slightly shorter and its junction
moved 5 px.

---

# 5 — From rendered frames

`sh tools/harness/run.sh level9 220 1400x900`.

**The flank runs on painted trace for its whole length.** Asked of the **plate
texture itself** through `textures.getPixel`, walking every lane at 4 world px
with the tracer's own cyan test:

```
  sampling plate map-level9 at 3840x2160 (3.0x world scale)
```

and nothing else — the block prints a line per off-paint run and there are none.
The scenario's assertion is inverted from last time, when it required exactly
one and named it.

**Enemies on it look like they are on a road.**
`tools/harness/shots/level9-4c-corridor-1400x900.png` holds a walker at the
middle of what used to be the bare crossing, at (894, 532). It stands on trace.
The previous session's frame of the same spot —
`level9-4c-join-1400x900.png` — has it on the substrate beside a capacitor.
`level9-4b-flank-1400x900.png` is the wide shot: six walkers down the flank,
all six inside the region the orphan occupied.

**Both streams still reach the door and still cost lives.**

```
  lanes=["north","south","tail","flank","hook"]  entrances=["north","south"]  exits=["hook"]  pads=15
    lane tail: 489 px, [409,525] -> [863,474]
    lane flank: 479 px, [863,474] -> [1109,330]
    lane hook:  604 px, [863,474] -> [1177,329]
  a leak at the interior door: lives 20 -> 19          <- down the trunk
  a flanker over the junction: lane=hook at (1115, 330)
  a flanker through the door: lives 16 -> 12           <- round the flank
  badges: spawn(["north","south"]) at (80,321) exit(["hook"]) at (1177,329)
```

The badge set is unchanged: one mouth, one door.

## Layout

| viewport | result |
|---|---|
| 667x375 | 1 fault — `SMALL Title [title:version-stamp (hidden dev door, not a tap target)]` |
| 844x390 | the same one |
| 1400x900 | **no layout faults** |
| 375x667 (portrait) | `portrait is gated` — the correct answer |

The single fault is the harness's own labelled exemption on the Title screen and
is not touched by this change.

## Three pre-existing harness faults

`run.sh level9` reports `*** 3 of 96 checks failed ***` — the same three
`claude/context.md` already carries, reproduced last session on a worktree at
`5418c5c` with none of this work in it: the scenery double-count (twice) and
`START RUN would begin level10`, which is the harness's own save state having
every level cleared.

---

# 6 — Where this leaves the repository

**In flight:** nothing. Everything above is on `main`.

**Closed by this pass:**

- **The flank's authored join.** Gone. The last report listed it as the one open
  decision; the corridor is painted, the geometry is derived from it, and
  `tools/build_level9_map.py` is back to exactly one authored coordinate — the
  gateway point every level has.
- **Level 9 out of band.** 40.0%, the middle of 35-45%.

**Open, and carried forward:**

- **Level 9 declares 4 scenery items and builds 8.** Unchanged, unexamined,
  reproduced on `5418c5c`.
- **`START RUN would begin level10`** in `run.sh level9` — the harness's save
  state, also pre-existing.
- **Pads 1 and 7 on level 9 still cover nothing**, at 156.6 and 132.4 px against
  a 132 px shortest range. Pad 7 misses by four tenths of a pixel. A separate
  pass owns pad positions and this change did not touch them.
- **Level 6 reads 7.05% orphaned road** and is the only level over the
  orphan-road test's 3% line. It is deliberate — the band its authored 82 px
  join steps over — and is in the test's `ALLOWED` table with the reason.
- **`tools/png.py` writes Paeth-filtered PNGs at 8.6 MB where the original art
  tool managed 7.7 MB.** Adaptive per-row filter selection would close most of
  that and costs four passes of pure Python. Not worth it until something else
  needs to re-encode a plate.
- **The soak's `MINOR_LANE_SHARE` cliff at 0.20 is still there.** A lane
  carrying under a fifth of the bodies stays out of the scripted player's pad
  ranking, so `flankShare` 0.19 and 0.20 are two different boards rather than
  two difficulties. The shipped 0.10 is well clear of it, but a later tuning
  pass that walks the share upward will hit it.
