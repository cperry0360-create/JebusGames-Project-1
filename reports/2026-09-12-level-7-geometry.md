# Level 7 geometry: three highways, 22 pads, 20 of them double

Geometry and a report. The level is **not** built: no `levels.json` row, no
`map_level7.json`, no roster, no waves, no boss. Those are a separate pass, and
the nine `lvl7-*` sprites already in `art-source/` are untouched for it.

**The number the build session needs first: 22 pads, and 20 of them are inside
tower range of two highways at once.** Both boss HP values have to be soaked
against that, not against a pad count.

## Commits

| commit | what | CI |
|---|---|---|
| `fabc308` | the WebP plate, `art.json`, the tracer, the checker, `level7_geometry.json`, the overlay, one test expectation | run 277 — **`test`, `typecheck` and `changes` all green**; `deploy` skipped, because this is a branch and not `main` |
| `<this report>` | this file | markdown only; the deploy's paths filter skips it |

Reproduce the whole thing:

```bash
python3 tools/trace_level7.py --audit --overlay tools/L7_pads_overlay.png
python3 tools/check_level7.py --overlay
node --test 'tests/*.test.ts'
sh tools/tsdiff.sh 924c8db
```

`trace_level7.py` derives; `check_level7.py` reads the plate again — the
**shipped WebP**, area-averaged rather than point-sampled, with its own
thresholds, its own route to the road mask and level 4's geodesic — and
compares. They share no code beyond `img.py`/`png.py`, which is the division of
labour levels 3, 4, 6 and 8 use.

---

## 1. The plate

`art-source/map_level7.png`, 1672 × 941, encoded to
`public/assets/maps/map_level7.webp` at q95 via `tools/towebp/run.sh`:
**2.16 MB → 0.43 MB (80% off), PSNR 36.1 dB, alpha exact on every pixel, worst
single channel error 108.** The PNG stays in `art-source/`; the copy staged in
`public/` for the encode was deleted after it.

36.1 dB is below level 6's 39.2 at the same quality, and the worst-pixel figure
says where it went: this plate is hard outlines and flat asphalt, which is what
a lossy codec rings on. The checker reads the WebP rather than the PNG, so the
encode is inside the loop — every band extent, width and lane length below was
re-derived from the shipped file and agrees with the source to a pixel.

Registered in `src/data/art.json` twice, the way every other plate is:
`"map-level7": "maps/map_level7.webp"` under `files`, and `"level7":
"map-level7"` under `map`.

### Classification

| class | test (tracer) | share of the canvas |
|---|---|---|
| asphalt | saturation ≤ 40, luminance < 130 | 32.1% |
| road paint | sat ≤ 44 and lum ≥ 165 (white), or g−b ≥ 150 (yellow) | 2.4% |
| scrub | r > g > b, r−b ≥ 70, 60 ≤ lum < 210 | 58.8% |
| blocked | everything else | 6.7% |

Mid-asphalt reads (63, 62, 73) — saturation 10, luminance 66. An edge line is
(241, 244, 246) and a dash core (255, 224, 4). Scrub runs (218, 154, 78) in the
sun and (144, 120, 24) in the olive patches: r−b of 140 and 120, against a
dash's 251.

### The brief's area figures

| | brief | measured |
|---|---|---|
| road | 37% | **34.7%** anywhere on the plate; **30.0%** if you count only the three highways |
| ground | 59% | **59.6%** |
| props | 4% | **5.7%** |

**The road figure cannot land, and the brief disagrees with itself about it
before the plate is involved.** Bands at 16–26%, 41–52% and 67–77% of the
height are 10 + 11 + 10 = 31% of a full-width plate, not 37; the three heights
it gives in world pixels say the same thing, 67 + 75 + 70 = 212 of 720 = 29.4%.
Measured here the three highways are 30.0% and every road-coloured pixel
anywhere is 34.7%, the difference being the guard rails, cones, poles, signposts
and the wreck's bodywork, all of which are painted grey. Ground, the figure that
actually matters for pads, lands within 0.6 points. Recorded, not enforced.

---

## 2. The paint is part of the road — and here is how that was confirmed

The brief's third instruction was the one with work in it: *the white edge lines
and yellow centre dashes are part of the road, a naive colour trace may split a
highway at the dashes or shrink it by excluding the edges, verify your mask
before trusting anything else and say how you confirmed it.*

Confirmed two ways, both of which are now assertions in `check_level7.py`.

**The edge lines cut each highway lengthwise, into three.** Mask this plate on
grey asphalt alone and it does not produce three slightly thin bands — it
produces **nine full-width components**:

| grey-only band | height |
|---|---|
| rows 118–121 | 4 px — the north highway's upper kerb outline |
| rows 124–178 | 55 px — its carriageway |
| rows 182–184 | 3 px — its lower kerb outline |
| rows 298–301 / 304–366 / 369–372 | 4 / 63 / 4 px — the middle highway |
| rows 483–485 / 488–547 / 550–553 | 3 / 60 / 4 px — the south highway |

Every white edge line runs the entire width of the plate, so each one is a clean
cut. Taken at face value that is six lanes and six slivers where there are three
lanes, and the carriageways measure **55, 63 and 60 px against the true 67, 75
and 71 — every road on the level 15–18% narrow.**

**The dashes derail the trace without severing anything, which is worse.** A
dash's core is unmistakable saturated yellow, but the antialiased rim either
side of it runs through mid-olive — (150, 114, 23), g−b of 91 — and the olive
scrub it would have to be told apart from reaches g−b 96. There is no threshold
between them. The resulting 1–4 px slit runs along the middle of the highway
wherever there is a dash, the gaps between dashes reconnect the band, so a
component count cannot see it — and it moves the deepest point of the distance
transform off the road's centre and into the middle of one carriageway. Before
this was fixed:

- the north lane traced at **y = 133** against its band's own centre of **151**;
- the south lane **entered in one carriageway (y = 499) and left in the other
  (y = 536)**;
- all six frame mouths came out split in two, because at the frame edge the slit
  is not an enclosed hole and filling holes cannot reach it.

**The mask that fixes both:** a morphological **reconstruction** — grey asphalt
seeds it and grows into white and yellow paint that the asphalt touches, so an
edge line is road because it is *part of* a highway and a white sign face out on
the scrub is not — followed by a **closing at r = 3**, which bridges the dash
outlines and cannot reach across a 111 px median. After it, all three lanes
trace dead straight down their own centre dashes, 2 vertices each after
Douglas-Peucker.

The checker re-tests both halves independently and fails if either stops
mattering: it asserts that a raw grey-only mask still yields more than three
full-width bands, that dropping the paint still costs each highway ≥ 8% of its
width, that **0 px** of edge line or centre dash sits outside the road mask, and
that each dash line sits within 4 px of its own band's centre (measured: 0.0,
1.0, 0.0 px).

One more thing had to be removed, and the two halves of the pass each found
their own instance of it. Props here are drawn in dark grey, so the classifier
calls them asphalt, and any that touch a highway join its component. The tracer
hit a post at x ≈ 1220 hanging off the bottom highway, which made that band
measure **171 px tall** against its siblings' 69 and 76. The checker, building
its mask by a different route, hit a different one: the signpost at the east
frame edge around y = 65, which gave the north highway **a second east opening**
and left 4.6% of its "road" with no lane down it. Both go the same way — an
opening at r = 4, which deletes anything under 8 px across and cannot dent a
67 px highway.

---

## 3. The three highways

| lane | rows | height | % of plate height (brief) | traced length | width, tracer | width, re-derived |
|---|---|---|---|---|---|---|
| north | 118–184 | **67 px** | 16.4–25.7% (16–26%) | **1279.0** | 67 | 67.0 (0.00%) |
| middle | 298–372 | **75 px** | 41.4–51.8% (41–52%) | **1279.0** | 75 | 75.0 (0.00%) |
| south | 483–553 | **71 px** | 67.1–76.9% (67–77%) | **1279.0** | 71 | 70.0 (1.41%) |

Every one of the brief's externally-measured figures lands. Road heights against
the briefed 67 / 75 / 70: **67 / 75 / 71**, all inside 1.5%. The widths were not
narrowed and the checker enforces a 60 px floor with the brief's reason attached,
so a later pass cannot quietly drift them back towards the 50 px house standard.

**Six terminals, one west and one east per highway, all on a vertical edge**,
nothing on the top or bottom frame. Entrances at (0, 151), (0, 335), (0, 518);
exits at (1279, 151), (1279, 335), (1279, 518).

**They never touch.** Nearest approach, measured with a plain BFS from one
painted band read on the other:

| pair | bare scrub between the paint | between centrelines |
|---|---|---|
| north–middle | **112 px** | 184 px |
| middle–south | **110 px** | 183 px |
| north–south | **298 px** | 367 px |

The checker gates that at 100 px, which a real merge would trip and measurement
noise cannot. It also checks that the shipped lines *cover* the paint — 100.00%
of every carriageway pixel is within one road width of a centreline — and that
painted area over painted width matches the declared 3837.0 total (3830.7, 0.16%
out, an identity that touches no geodesic at all).

The length gate is the brief's **3%** on both width and length, and it holds: the
independent re-trace walks 1270.0 against 1279.0, **0.70% out**. Worth saying
plainly, because `check_level6.py` had to widen its length gate to 6% and
`check_level8.py` to 10% — those are serpentines, where two geodesics that weight
"the middle" differently disagree about how long a road is. These lanes are
straight, so the two walks have nothing to disagree about.

### The four scrub strips

| strip | rows | height | brief |
|---|---|---|---|
| above the north highway | 0–117 | **118 px** | 118 |
| between north and middle | 185–297 | **113 px** | 113 |
| between middle and south | 373–482 | **110 px** | 110 |
| below the south highway | 554–719 | **166 px** | 167 |

---

## 4. The pads, and the standoff the brief expected to have to relax

**The house standoff was not relaxed, and did not need to be.** The brief warned
that the medians are only 110–113 px tall, that a pad centred in one sits
roughly 55 px from each highway, about half the 90–114 that levels 2 through 4
hold, and that this is level 6's situation again.

The 55 px is right and the conclusion does not follow, because the two numbers
are measured to different things. **Levels 2 through 4 measure standoff centre
to lane CENTRELINE, not to the kerb** — that is what `HOUSE_STANDOFF` in
`check_level6.py` means and how level 6's figures were compared. 55 px of median
scrub plus a 35 px half-width **is a 90 px standoff**, which is the band's own
near edge. So the pads are derived with levels 3, 4 and 8's rules unchanged:
radius-24 core entirely on scrub, 90–114 px from the nearest centreline, 74 px
between centres, a 34 px tap target fully on the board, best-first by uncovered
lane added, stopping when the best pad left adds none.

**Measured standoff: 91.0 to 105.0, median 91.0.** Twenty of the twenty-two sit
at exactly 91. That is not comfort — it is the near edge of the band with one
pixel of room, and it is why the checker re-derives every standoff against its
own re-traced centreline rather than reading the file. Both medians force their
pads into a **4 px vertical window**: y ∈ 241–244 upstairs, y ∈ 425–428
downstairs, because ≥ 90 from the highway above and ≥ 90 from the one below
leaves nothing else.

### The 22 pads

| # | centre | → north | → middle | → south | standoff | covers |
|---|---|---|---|---|---|---|
| 0 | 1162, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 1 | 990, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 2 | 862, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 3 | 706, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 4 | 578, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 5 | 450, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 6 | 322, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 7 | 138, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 15 | 1086, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 16 | 246, 242 | 91.0 | 93.0 | 276.0 | 91.0 | north + middle |
| 8 | 266, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 9 | 86, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 10 | 834, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 11 | 1014, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 12 | 706, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 13 | 578, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 14 | 450, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 17 | 374, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 18 | 938, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 19 | 190, 426 | 275.0 | 91.0 | 92.0 | 91.0 | middle + south |
| 20 | 758, 46 | 105.0 | 289.0 | 472.0 | 105.0 | north only |
| 21 | 1026, 610 | 459.0 | 275.0 | 92.0 | 92.0 | south only |

Closest pair 76.0 px against the 74 px rule. Every core is 100% scrub, checked
pixel by pixel with a second classifier: **0 px off, largest solid blob 0 px,
on all 22.**

### How many reach two highways: **20 of 22**

Ten in the upper median (north + middle), ten in the lower (middle + south), one
in the top strip and one in the bottom strip covering a single lane each.

**That is not an artefact of the greedy.** Before any pad is chosen, the placement
rules admit **1,207 candidate positions**, and **399 of them (33%) are inside
tower range of two lane centrelines at once** — 186 in the upper median, 213 in
the lower. The two-lane property is a fact about the board.

What it means for the boss soak, stated plainly for the build session: **a
21-tower build on this board brings roughly 42 lanes-worth of covered road**,
because all but two of the pads are firing at two highways. Compare level 4,
where 14 pads cover one lane each. A boss HP figure carried across from a
single-lane level will melt here; a figure set against 22 towers' raw DPS will
be three times too high for what actually reaches any one lane, since each
median tower divides its fire between two roads and cannot shoot both at once.
Soak it, do not scale it.

### Where the guns cannot reach

Coverage: **north 90.2%, middle 94.1%, south 83.1%.** High by house standards —
level 8's three lanes sit at 71%, 36% and 77%. Every hole is at a mouth:

| lane | unreachable stretches |
|---|---|
| north | x 0–72, x 1228–1279 |
| middle | x 0–20, x 1225–1279 |
| south | x 0–22, **x 1090–1279** |

Enemies get a free run of 20–72 px on the way in and 50–190 px on the way out.
The south lane's 190 px is the one worth knowing about and it has a cause on the
plate: **a rusted pickup with its bonnet up, plus a spare tyre, sits in the lower
median at about x 1095–1215, y 380–455.** Its bodywork is dark rust and grey, so
the classifier reads a third of a pad core there as asphalt — no core fits, no
pad can be placed, and the last 190 px of the south highway before its exit
cannot be covered by anything. The checker probes that wreck explicitly, as
`unbuildable` rather than as a prop, because the interesting thing about it is
that it never looks like an obstruction (its largest non-classified blob is
10 px) and still keeps towers off the corner.

### The overlay

```bash
python3 tools/trace_level7.py --overlay tools/L7_pads_overlay.png
python3 tools/harness/shrink.py tools/L7_pads_overlay.png 950
```

`tools/L7_pads_overlay.png` is committed, as levels 3, 4, 5, 6 and 8's are: the
three centrelines over the real plate, north red, middle cyan, **south magenta
and deliberately not yellow** — an overlay line the same colour as the paint it
is meant to be checked against proves nothing — with each pad's 24 px core in
red and its 34 px tap target in white. The checker writes its own to
`tools/decode/out/level7_pads.png`, which is gitignored.

Read the picture as well as the numbers: it is how the wreck was identified, and
it shows several pads whose *tap target* clips a rock while their *core* does
not. The core is the rule; the ring is only the hit box.

---

## 5. The two questions

### Three independent lanes, three spawns, three exits: the engine handles it

`systems/Lanes.ts` is general in the right way. A map's lanes are a list, each
lane either names continuations or runs to an exit, and **more than one terminal
has been legal since level 5** — its two exits both cost lives, and the rule
that used to demand exactly one terminal was replaced with a narrower one
(`entrance: true` marks a lane walkers arrive on, so a terminal nothing merges
into is still reachable). Level 6 already ships three lane records. Nothing caps
lanes or terminals at two: `validateLanes` counts, names and cycle-checks them
without a bound; `LaneNetwork.terminals`/`routeLengths` recurse over the list;
`GameScene` iterates `this.lanes.lanes` for the gateway table, the spawn
markers, `roadLeftFrom` and the rally; `spawnLaneIds` collects gates from the
wave table; `leak()` charges `livesCost` with no reference to which exit was
used, so **all three lanes cost lives for free**. `tools/soak/Sim.ts` reads
`level.map` generically and iterates `net.lanes`.

Level 7's shape is therefore: `mainId` renames the `waypoints` lane (level 6's
trick), the other two go in `lanes` with `entrance: true` and no `merge`.

**What does assume one lane, and it is four already-known sites.** From
`reports/2026-09-10-level-6-geometry.md` section 7, carried unaddressed through
two reports: `GameScene.this.lane` is *main's path*, and four places still use
it as a stand-in for "the road".

1. **`validCastPoint` (GameScene.ts:3263) — the functional one, and on level 7
   it is worse than on level 6.** `pathOnlyWithin` measures to main's path only,
   so a path-restricted ability would be refused over **two of the three
   highways**. This has to be fixed before level 7 is playable, not before it is
   polished.
2. **`drawCoveredLane` (2624)** — the wash showing which stretch of road a
   tower covers. On this board a median tower covers two highways, and this
   would wash one of them. It is the UI that communicates the level's defining
   feature, so it would be communicating the wrong thing.
3. **`washLane` (3237)** — the targeting overlay, same defect, same cause.
4. **`powerHazard` (4184)** — the Spike Strip's ground-strip heading. **Harmless
   here specifically**: all three lanes run at heading 0, so main's answer is
   every lane's answer. It is still wrong in principle.

`tickRooster` already reads the boss's own lane and does not add to the list.
The gateway is per-lane (`byLane`, added for level 5's two exits) and all three
of level 7's lanes exit at the same x anyway.

Two smaller things the build session will meet:

- `tests/levels.test.ts`'s map table needs a `level7: 'map_level7'` row. It
  fails loudly — "has no map file in this test's table; add it" — so it cannot
  be missed. `laneLengthPx` must equal the longest route, which will be whatever
  the map's off-frame extension makes of 1279.0.
- The soak's `MINOR_LANE_SHARE = 0.2` demotes pads beside a lane carrying under
  20% of traffic (it exists for level 6's 4.7% flank). Three roughly equal lanes
  carry about 33% each, so all three rank normally and nothing is demoted — but
  a wave table that makes one lane a trickle would trip it.

### Lane length: 1279.0 px each, and the brief's comparisons are both off

Each lane traces **1279.0 px**, dead straight, gate to gate, re-derived at
1270.0 (0.70%). Total painted road 3837.0.

The brief's "about 1,280 world px" is exact. Its two comparisons are not:

| | route | level 7 as a fraction |
|---|---|---|
| level 7, one lane | 1279.0 | — |
| level 4 (`laneLengthPx`) | 1479.0 | 86%, not "the same" |
| level 6 (`laneLengthPx`, its longest route) | 2260.4 | **57%, not a quarter** |
| level 6, total painted road | 5086.9 | 25% — this is where "a quarter" comes from |

So level 7's lane is a quarter of *all the road on level 6*, and 57% of the
longest walk a level 6 enemy actually takes. The pressure story in the brief
survives either way; the number to build waves against is **1279.0 per lane**.

Traversal time, since "21 seconds at standard speed" needs a speed:

| at | seconds over 1279 px |
|---|---|
| 60 px/s (the ~1× band: lateFiler 58, longsnap 62) | **21.3 s** |
| 92 px/s (scrapper) | 13.9 s |
| 122 px/s (shredder, pompom) | 10.5 s |
| 150 px/s (sprinter) | **8.5 s** |

21 seconds is right for a standard walker. **A level whose pitch is "fast
enemies" should expect 8–14 seconds**, which is the real constraint on wave
spacing: at sprinter speed an enemy crosses the whole board in the time a
Courjahan tower fires a handful of shots, and on three lanes at once.

---

## 6. What is waiting for the build pass

All nine sprites are present in `art-source/`, none converted, none registered —
`grep -c lvl7 src/data/art.json` returns 0:

| file | bytes |
|---|---|
| `lvl7-enemy-hatchback.png` | 372,761 |
| `lvl7-enemy-musclecar.png` | 362,640 |
| `lvl7-enemy-van.png` | 712,391 |
| `lvl7-miniboss-rig.png` | 824,426 |
| `lvl7-boss-transporter.png` | 866,052 |
| `lvl7-cargo-red.png` | 149,225 |
| `lvl7-cargo-blue.png` | 174,061 |
| `lvl7-cargo-yellow.png` | 137,349 |
| `lvl7-cargo-green.png` | 159,463 |

Rule 7 applies when they are converted: size against physical pixels, then
`python3 tools/measure_art.py` and update `contentWidth`/`contentHeight` in
`art.json`.

---

## 7. Verification, and what was not checked

**Run.** `node --test 'tests/*.test.ts'` — **1035 passing, 0 failing.** One
expectation changed: `tests/levelart.test.ts`'s orphan list now reads
`['map-level7']` instead of `[]`, with a note saying why. That list grew by five
when level 6's art landed and emptied on its own when level 6 got a
`levels.json` row; this is the same thing happening again, and 0.43 MB that
arrives with no level until it does.

**Run.** `sh tools/tsdiff.sh 924c8db` — **212 against 212, nothing introduced.**
Worth the usual caveat, which cost a cycle in the last pass: `tsdiff` compares
error *counts* and without `node_modules` every Phaser type is `any`, so it
cannot see a Phaser access rule. **This pass changed no `.ts` source at all** —
one test expectation, two JSON keys, three new Python files — so there is
nothing for that blind spot to hide.

**Run.** `sh tools/harness/run.sh screens 140 844x390` — **1 layout fault, and
it is pre-existing.** The fault is `SMALL Title [title:version-stamp (hidden dev
door, not a tap target)]`, which the harness itself labels as not a tap target.
Confirmed rather than assumed: the two tracked files were stashed, the harness
rebuilt and re-run, and the baseline reports the identical single fault. Nothing
in this pass can reach a screen — a plate key is level art by construction
(`PLATE_KEYS` derives from `art.map`), so it is not in the boot manifest and
nothing loads it.

**Not checked.**

- **The plate has never been rendered in the game**, at any viewport, because no
  level points at it. Everything above is measured off the file. The first thing
  the build pass should do after adding the `levels.json` row is a harness
  `screens` run at 375×667, 390×844 and desktop, in both orientations.
- **No soak.** There is no roster, no waves and no tower set for this level, so
  there is no win rate and no boss HP. The pad count and the two-lane count are
  the inputs that pass is owed.
- **No portrait check** beyond the existing rotate-overlay gate.
- The nine non-asserting harness scenarios and the black `GL=1` screenshots are
  untouched and still unrepaired.

---

## Where this leaves the repository

**On the branch `claude/level-7-geometry-wsbyqq`, green, fast-forwardable onto
`main`.** The session could not push to `main`; the merge command is the first
line of the closing message.

**Landed in this pass**

- `public/assets/maps/map_level7.webp` and its two `art.json` keys.
- `tools/trace_level7.py`, `tools/check_level7.py`,
  `tools/level7_geometry.json`, `tools/L7_pads_overlay.png`.
- One test expectation, which empties itself when level 7 ships.

**Handed to the build pass**

1. **22 pads, 20 covering two highways.** Soak both boss HP values against that.
2. **1279.0 px per lane**; 8.5–21.3 s to cross depending on speed.
3. **The south lane's last 190 px cannot be covered** — the wreck in the lower
   median. Either the waves account for it or the art moves.
4. `mainId` + two `entrance: true` lanes with no `merge`, and a
   `level7: 'map_level7'` row in `tests/levels.test.ts`'s table.
5. Nine sprites to convert, `measure_art.py` after.

**Blocked on a decision**

- **Nothing in the geometry.** Every brief figure landed except the 37% road
  area, which the brief contradicts itself on, and the standoff, which turned out
  not to need the relaxation the brief expected.

**Carried forward, unaddressed** — from `2026-09-10-level-6-geometry.md` and
`2026-09-12-level-6-fixes.md`

- **The four `this.lane` sites.** `validCastPoint` refuses path-only abilities
  over two of level 7's three lanes; `drawCoveredLane` and `washLane` would show
  one highway of the two a median tower covers. **Fix these before level 7 is
  played, not before it is polished.** `powerHazard` is harmless on this map
  (every lane runs at heading 0) and still wrong.
- The level 6 items: the cone art, the flame crossing lanes (25.7% / 7.3%), the
  flank's 4.0 s late arrival, `width: 64` against a 40 px road, the painted pad
  squash 0.748 against the engine's 0.62, `plannedLevels: 20` → 10, and pad 2 at
  (1167, 53) reaching no road.
- Levels 1 and 3 soak at 89% and 88%, outside the 35–45% band. Pre-existing.
- The nine non-asserting harness scenarios; black `GL=1` screenshots.
