# Level 9 geometry: the circuit board, and three things its brief gets wrong

**2026-09-13.** The geometry pass for level 9 — the inside of a computer, seen
from directly above. Plate converted and registered, trace derived, pads placed,
two engine questions answered.

**No level is built.** There is no `level9.json`, no `map_level9.json`, no row in
`levels.json`, no roster and no wave table. Nothing in this branch puts an enemy
on a board.

| commit | what | CI |
|---|---|---|
| `e0fc55c` | The plate, the tracer, the checker, the geometry file, the overlay, the two test rows | [run 330](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34769363730) green |
| `4818e52` | This report | [run 331](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34769540134) green |
| *this commit* | Close this table on run 331 | it edits this table and nothing else |

Branch `claude/level-9-geometry-uac8ax`. The session could not push to `main`;
the merge command is at the bottom of this file and was the first line of the
session's reply.

---

## The headline

**The board has one entrance, not two.** The brief asks for two on the west
edge, at 41–49% and 81–84% of the height. There is cyan at both. Only the first
is trace: at plate resolution the second is **165 pixels, two columns wide** —
the cooling tower's leftmost vent slot clipped by the frame — and it is
connected to nothing.

**The trace forks and rejoins.** The brief says one path, no forks, no branches.
The painted band encloses exactly one region, which is exactly one cycle: it
splits at **(96, 321)**, just inside the mouth, and the two arms meet again at
**(409, 525)**. They are wildly unequal — **1336 px against 418** — so the route
is 2491 px one way and 1572 the other.

**There is a dead-end spur**, an interior fifth terminal at **(910, 568)**.
Nothing walks it as the board stands. It is also the only place the paint offers
a second entrance, if level 9 wants one.

**The exit is where the brief says it is**, and this is the one place it agrees
with the paint: an interior door at **(1177, 329)**, mouth y 300–359, 92.0% of
the width.

**Fifteen pads, and the standoff runs the other way from the brief.** Pad centre
to route centreline is **69–194 px, median 93**, against the 43–87 / median 50
the brief states. Three of the fifteen **cannot reach the route at all** with the
shortest range in `towers.json`. **Three of fifteen cover two separate passes**,
not the twenty-of-twenty-two level 7 produced.

**Two entrances into one exit works today.** A fork that rejoins does not —
`validateLanes` calls it a circle. Both are demonstrated below.

---

## Step 1 — the plate

`art-source/level9/map_level9.png`, 3840×2160 RGB, 7.77 MB. Converted through
`tools/towebp` (Chromium's libwebp — there is no cwebp in this environment) at
q95:

| | |
|---|---|
| `public/assets/maps/map_level9.webp` | **1.36 MB**, 82% off |
| PSNR over visible pixels | **40.5 dB** |
| alpha | none either side (both RGB), 0 px off |
| dimensions | 3840×2160 both sides |

The PNG stays in `art-source/level9/`.

### Registered in `art.json`, and what that costs

```json
"files": { "map-level9": "maps/map_level9.webp" },
"map":   { "level9": "map-level9" }
```

Both rows, and the second one matters more than it looks. `art.map`'s values are
`PLATE_KEYS`, `PLATE_KEYS` are `LEVEL_ART_KEYS`, and `queueArt` skips every level
art key — so **boot never queues this plate and nobody downloads it** until level
9 gets a row in `levels.json`. With only the `files` row it would have been boot
art, and every player on the title screen would have paid 1.36 MB for a level
that does not exist.

`tests/levelart.test.ts` asserts exactly that, and it has a list for it. Level
7's plate sat on that list for the same reason after its own geometry pass;
`map-level9` is on it now, with a note, and it leaves the day level 9 gets a row.

### The deploy cap went 41 → 43, and that is a decision, not a side effect

`tests/content.test.ts` caps `public/` at 41 MB. The plate takes the total from
40.39 to **41.75**. The cap is now **43**, which leaves 1.25 MB of headroom — the
same tightness it has had at every setting.

This is the second raise in one day and the note in that test says a budget with
room for the next mistake is not a budget, so: what it buys is one plate, of the
same category as the fourteen machine tower skins the last raise bought — level
art, downloaded by nobody today.

**And the next plate does not fit.** `map_level10.png` is the same 3840×2160 and
will land within a few hundred KB of this one, which would need a third raise
inside a week. The answer both previous raises wrote down is still undone:
re-encoding the fourteen machine tower skins at the quality their originals ship
at gives back about **2.4 MB** — more than level 10's whole plate — for no
content change. See `reports/2026-09-13-restore-tower-assets.md`. **A human
should take that decision before level 10's plate arrives.**

---

## Step 2 — the trace

`tools/trace_level9.py` derives it; `tools/check_level9.py` reads the plate again
with its own classifier and an **area-averaged** downsample against the tracer's
**point sample**, re-walks everything, and compares. Two readings of the paint,
not one read twice — levels 3, 4 and 8's division of labour.

Run them:

```bash
python3 tools/trace_level9.py --overlay tools/L9_pads_overlay.png
python3 tools/check_level9.py --overlay
```

### What the classifier finds

| | tracer (point-sampled) | checker (area-averaged) |
|---|---|---|
| cyan trace | 162,039 px, **17.6%** of the plate | — |
| neutral grey | 127,655 px, **13.9%** | — |
| the connected trace | 158,131 px after pinholes | 157,735 px |
| enclosed regions over 2000 px | **1**, of 140,939 px | **1**, of 140,979 px |

The brief's references are trace about 18% and grey chips about 13%. Both land.

### 1. ONE PATH — no. It forks and rejoins.

Everything on the west half of the board is a loop. The evidence is three
independent measurements that agree:

- **The band encloses exactly one region**, 140,939 px. A planar region with one
  hole is a graph with one cycle. Cap the hole-fill at 2000 px and that region
  survives; the pinholes inside the glow (pale circuit detail the classifier
  reads as not-glow, 4.5k px of it) do not.
- **Cutting the band at (96, 321) severs the entrance stub** and nothing else — a
  3,989 px piece, bbox 0,290–75,355. Scanning a 45 px disc along the stub, it
  separates for x = 50…100 and stops at x = 110, because by 110 the column spans
  both arms.
- **The ring of paint within 1.7 trace widths of the enclosed region** is the
  cycle, and exactly two runs of band hang off it: the stub and everything east
  of (409, 525).

Two junctions, and they are derived rather than typed: level 8 wrote its fork
into the geometry file as a literal, and there are four junctions here.

| node | where | how it is found |
|---|---|---|
| **A** fork | (96, 321) | the ring pixel nearest the entrance stub, climbed to mid-band |
| **B** rejoin | (409, 525) | the ring pixel nearest the rest of the board, same |
| **C** door junction | (1103, 326) | the last pixel the walks B→door and B→spur have in common |
| **X** door | (1177, 329) | the middle of the trace's last full-width column |
| **S** spur cap | (910, 568) | the band pixel geodesically farthest from the entrance |

### 2. TWO ENTRANCES ON THE LEFT EDGE — no. One.

Measured at both resolutions, and the external measurement reproduces exactly —
it is the *connectivity* it did not check.

| west-edge cyan | canvas (1280×720) | plate (3840×2160) | connected to the trace? |
|---|---|---|---|
| upper | y 291–355, **40.4%–49.3%** | y 871–1066, 40.3%–49.4% | **yes**, 1,381,576 px component spanning the board |
| lower | y 569–602, **79.0%–83.6%** | y 1706–1806, 79.0%–83.6% | **no**, a **165 px** component, bbox (0,1706)–(1,1806) |

The lower one is **two pixel columns wide at 4K**. Rendered at 7× it is
unmistakable: it is the leftmost of the cooling tower's glowing vent slots, and
the tower's metalwork fills the corner around it. The trace never comes within
200 px of it — below y=355 the band's leftmost pixel is x=95.

`check_level9.py` asserts both halves: that (45, 590) is still cyan, so the check
is testing something, and that it is still **not** on the band.

**The entrance terminal is (0, 323)**, the centre of a 65 px mouth.

### 3. THE EXIT IS NOT ON A FRAME EDGE — correct, and it measures where the brief says

| | brief | measured |
|---|---|---|
| x | ≈ 1181 (92.3%) | **1177 (92.0%)** |
| mouth y | 299–359 (42%–50%) | **300–359 (41.7%–49.9%)** |

The terminal is **(1177, 329)**. `x = 1177` is the last column where the band is
one run at least 0.6 of a trace tall; past it the housing's own dark frame line
cuts across, leaving a 4 px tip at x=1178–1179 that is 30 px off the centreline.
**Not the band's rightmost pixel** — that would have put the terminal at (1179,
358) and the fade in the wrong place.

The machine housing is not buildable: it is not grey-chip, so it cannot hold a
pad, and no pad is near it.

### 4. BUILDABLE IS THE GREY CHIPS ONLY — correct, and there are exactly fifteen

Detected by low saturation against a board where everything else is strongly
tinted. The threshold has enormous daylight either side:

> **the fifteenth chip is 3,675 px and the largest neutral-grey blob under it is
> 188** (224 in the checker's reading). A factor of thirteen. `MIN_CHIP_AREA` is
> 2,000.

| | brief | measured |
|---|---|---|
| count | 15 | **15** |
| median | 83 × 77 | **81 × 75** |
| smallest | 65 × 62 | **63 × 61** |
| largest | 152 × 118 | **150 × 117** |

Every one within 3 px. The consistent 1–2 px undershoot is the classifier's edge
landing inside the bevel rather than outside it.

No pad is derived from open board area. The substrate between chips is scenery.

### The fifth terminal the brief does not mention

**A dead-end spur.** A rounded cap of trace at **(910, 568)**, on open substrate,
375.8 px of trace from the junction at C. It is the point on the whole board
geodesically farthest from the entrance (1783 px), and 24% of a 34 px ring around
it is trace, against about two thirds for a point mid-run.

Two readings of it, and this pass does not choose:

- **Scenery.** Traces dead-end at vias on a real board; it is the fiction working
  as intended, and towers simply overlook it.
- **A second entrance.** It has the exact shape of an interior spawn — a trace
  that starts nowhere and runs to the exit. That would give level 9 the "two
  entrances, one exit" the brief asks for, just not where the brief puts it. It
  joins 454 px short of the door, against 1418 px for the main route, so it would
  be a short back door, not a second lane — level 8's east branch is 391 px
  against the south's 2315, so short arms are already in the game.

The geometry file carries it as `deadEnd` either way, and `check_level9.py`
verifies it is still a dead end.

### The numbers, against the brief's references

| | brief | traced | independent | agree? |
|---|---|---|---|---|
| trace width | 44.7 | **47.5** (checker 47.0) | — | +6%, and the house standard is 50 |
| total trace length | 3,649 | **3,284** (checker 3,283) | 3,329 by area ÷ width | **−10%** |

**The length disagrees with the brief and this is reported rather than
enforced,** which is level 8's situation repeated exactly. Two independent
measurements of the same paint agree with each other to **1.4%** and sit 10%
under the brief; the one frame opening lands where the brief says to a fraction
of a percent; and the overlay shows the traced line on the paint down its whole
length. Level 8's brief was 11% over its plate in the same way.

At the roster's median walk speed (58 px/s, `enemies.json`) the routes run:

| route | length | at 58 px/s |
|---|---|---|
| entrance → **north arm** → door | **2,491 px** | ≈ 43 s |
| entrance → **south arm** → door | **1,572 px** | ≈ 27 s |

The brief's ~61 s is for its own 3,649 figure, which is the whole painted trace
rather than either route. **Nothing walks 3,284 px on this board.** If the arms
both carry traffic, half the wave has 16 seconds less road than the other half,
and that is a balance fact rather than a measuring one.

| stretch | length | median width |
|---|---|---|
| stem, mouth → fork | 87.0 | 64 (the mouth flare, not the trace) |
| **north arm**, fork → rejoin | **1336.3** | 44.5 |
| **south arm**, fork → rejoin | **417.7** | 49.0 |
| tail, rejoin → door junction | 1002.5 | 48.0 |
| door, junction → terminal | 65.0 | — |
| spur, junction → dead end | 375.8 | — |

---

## Step 3 — the build pads

One pad per grey chip, centred on it. **Fifteen.** Closest pair **120.6 px**,
comfortably over level 4's 74 px rule. Every pad core (radius 24) sits on chip:
the worst is 33 px of non-chip in a 1,809 px core with a largest solid run of
**8 px**, which is a screw head.

| pad | x | y | chip | to route | to spur | passes @132 | @112 |
|---|---|---|---|---|---|---|---|
| 1 | 781.5 | 106.0 | 144×115 | **155.9** | 392.1 | **0** | 0 |
| 2 | 621.5 | 108.0 | 68×67 | 74.7 | 530.4 | 1 | 1 |
| 3 | 331.0 | 170.0 | 133×101 | 96.0 | 706.3 | 1 | 1 |
| 4 | 1098.5 | 176.0 | 82×75 | 93.3 | 154.6 | 1 | 1 |
| 5 | 805.0 | 240.0 | 85×81 | 101.2 | 311.4 | **2** | **2** |
| 6 | 460.0 | 231.0 | 63×61 | 83.1 | 565.8 | 1 | 1 |
| 7 | 344.5 | 329.0 | 122×113 | **132.1** | 618.1 | **0** | 0 |
| 8 | 1005.5 | 354.0 | 82×89 | 92.5 | 96.5 | **2** | **2** |
| 9 | 830.0 | 358.0 | 81×77 | 83.0 | 226.4 | **2** | 1 |
| 10 | 214.5 | 365.5 | 72×70 | 89.7 | 728.7 | 1 | 1 |
| 11 | 506.5 | 469.5 | 70×68 | **69.4** | 419.7 | 1 | 1 |
| 12 | 986.0 | 483.0 | 71×73 | 102.8 | 84.0 | 1 | 1 |
| 13 | 780.5 | 579.0 | 150×117 | 104.0 | 134.5 | 1 | 1 |
| 14 | 353.0 | 607.5 | 73×72 | 73.5 | 562.9 | 1 | 1 |
| 15 | 947.5 | 641.5 | 72×72 | **194.3** | 74.5 | **0** | 0 |

### THE STANDOFF, AND IT RUNS THE OTHER WAY FROM THE BRIEF

The brief says the chips sit **43 to 87** px from the trace, median 50, against
levels 2–4's 90–114, and concludes that towers cover the trace from close range
and the board holds more effective DPS than fifteen pads suggests.

**Measured on the house metric — pad centre to the nearest route centreline,
which is what `check_level8.py` computes and what the 90–114 refers to — level 9
is 69.4 to 194.3, median 93.3.** That is not tighter than levels 2–4. It sits at
the bottom of their band in the middle and blows through the top at both ends.

The brief's figure is almost certainly a different measurement. Three metrics on
the same fifteen chips:

| metric | min | median | max |
|---|---|---|---|
| **pad centre → route centreline** (the house metric) | 69.4 | **93.3** | 194.3 |
| pad centre → nearest painted trace pixel | 47.0 | 64.4 | 131.2 |
| **chip edge → nearest painted trace pixel** | 14.0 | 22.0 | 47.2 |

Add half a trace width to the third row and it becomes 38 / 46 / 71 — which is
the brief's 43 / 50 / 87 to within the classifier's edge. **The brief is
measuring from the chip's edge; the pad sits at the chip's centre, and a chip
here is 63 to 150 px across.** Half a chip is the whole difference.

**So do not carry the brief's conclusion into the boss soak.** The board is not
DPS-dense. It is the reverse:

- **Three pads cannot reach the route at all** at `towers.json`'s shortest
  attacking range. Pads 1 and 7 are the two big chips in the middle of the
  board's open areas; pad 15 is the bottom-right chip, 194 px from the route and
  74 px from the dead-end spur it would be covering instead.
- **Only three of fifteen cover two separate passes** at 132, two at 112 — on a
  board whose path visibly doubles back four times. The chips are painted in the
  middle of the open areas the trace loops around, not in the medians between
  its passes. Compare level 7, where 20 of 22 reached two highways.
- **Twelve pads' worth of guns, not fifteen.** A roster set against fifteen
  towers' raw DPS is 20% too generous before the first shot.

"Covers two passes" is defined here as: two stretches of the route within tower
range, separated by more than one tower range of route distance. Without that
separation clause the apex of a hairpin — where the trace curls continuously
around a pad — scores as two, and pad 11, tucked inside the hairpin at (506,
469), is exactly that case. It is one pass.

### A stale number, found on the way

`tools/trace_level6.py`, `_level7.py` and `_level8.py` all carry

```python
TOWER_RANGE = 112       # the shortest range in the tower pool
```

**`src/data/towers.json` says the shortest attacking range is 132** (the Rounding
Error; the Shelter is 0 because it is an aura and shoots nothing). 112 is not any
tower's range and has not been for some time. That is exactly what CLAUDE.md's
first hard rule exists to stop, so `trace_level9.py` reads the file instead — and
reports **both**, because every coverage figure for levels 6, 7 and 8 was
measured at 112 and comparing across levels needs the same ruler.

Levels 6–8's coverage percentages are therefore measured with a range 15% short.
Not corrected here: re-deriving three levels' geometry is its own pass.

### The overlay

`tools/L9_pads_overlay.png` — the plate with the six centrelines drawn on it
(white stem, **yellow** north arm, **magenta** south arm, green tail, red door,
grey spur), the five nodes ringed, and the fifteen pad cores. Reproduce with:

```bash
python3 tools/trace_level9.py --overlay tools/L9_pads_overlay.png
python3 tools/check_level9.py --overlay   # the checker's own, gitignored
```

---

## Step 4 — the four build-node variants

Measured off the files. Ink extents at alpha > 16, the threshold
`tools/measure_art.py` uses:

| variant | file | ink | aspect |
|---|---|---|---|
| `node_chip_square` | 932×860 | 912×840 | 1.086 |
| `node_chip_ram` | 998×893 | 978×873 | 1.120 |
| `node_chip_fan` | 1004×979 | 984×959 | **1.026** |
| `node_chip_cabled` | 1005×746 | 985×726 | **1.357** |

**They must be sized to the chip, not to themselves.** Each is about 1000 px of
ink against painted chips averaging 81×75 world px — roughly 12× — so `fitInBox`
against the chip's own extents is the only correct sizing. Nothing here is wired
up; `art.json` has no row for any of them.

### Nearest aspect alone is a degenerate answer

| variant | chips | |
|---|---|---|
| `node_chip_cabled` | 1, 3, 13 | the three landscape chips |
| `node_chip_square` | 4, 7 | |
| `node_chip_fan` | 2, 5, 6, 8, 9, 10, 11, 12, 14, 15 | **ten** |
| `node_chip_ram` | — | **none** |

Three of the four variants are within 0.1 of square and so is most of the board,
so nearest-match puts one look on two thirds of the pads on the only level in the
game that has four. Reported because it is the measurement.

### The suggested mapping: ranked by aspect, dealt into four runs

Every variant used, the most landscape chips still on the most landscape node:

| variant | chips | worst aspect error |
|---|---|---|
| `node_chip_cabled` (1.357) | **1, 3, 4, 13** | 0.264 |
| `node_chip_ram` (1.120) | **5, 6, 7, 9** | 0.087 |
| `node_chip_square` (1.086) | **2, 10, 11, 14** | 0.072 |
| `node_chip_fan` (1.026) | **8, 12, 15** | 0.105 |

The one uncomfortable placement is **pad 4** (82×75, aspect 1.093) on the cabled
node: it is only fourth-most landscape, and 0.264 of aspect error is a visibly
stretched picture. If the build session would rather keep the cabled node to the
three genuinely landscape chips (1, 3, 13) and give pad 4 to `ram`, that is a
better-looking board and the mapping above should not stop it — this is a
starting point, not a constraint. Both mappings are in the geometry file as
`suggestedNodeBalanced` and `suggestedNodeByAspect`.

---

## Step 5 — what an exit animation would take

The brief asks what would be needed to play level 1's spawn animation in reverse
at an interior exit. **Read, not built.**

### What level 1 actually does at its spawn

Three separate things, and only one of them is the fade:

1. **The lane runs off the plate.** `map.json`'s first waypoint is `[-60, 402]`
   and its last is `[1340, 454]` — both outside the 1280×720 box. The enemy has
   road to stand on before it is visible.
2. **`emergeFromX` → a lane distance → a fade.** `map.entrance.emergeFromX` is
   `60.0`; `Gateway.distanceAtX` converts it once at scene start into
   `mouthDistance`; `Enemy.applyEmergence` holds `sinceMouth` at −1 until the
   enemy passes it, and `Gateway.emergeState` then returns **alpha 0 before the
   mouth** and a `fadeMs: 400` ramp from `startScale: 0.9` to 1 after it. Alpha
   0, not a low alpha — that is what stops a ghost showing against the stone.
3. **A piece of the plate is cut out and drawn in front.**
   `GameScene.createArchOccluders` reads `map.entrance.arch.near.outline` — a
   ten-point polygon fitted to the painted stone — clips a canvas texture to it
   at *plate* resolution, and places it at `near.depth: 448.1`. Depth is `y` in
   this game (`DepthSort.ySort`), so that number is the lane's lowest point under
   the arch plus half a road width plus a margin. **This is the part that makes
   it read as coming out of somewhere** rather than fading in on open ground.

There is also an `onEmerge` hook fired at the mouth — the goblin's greeting and
the Politician's entrance hang off it rather than off the spawn.

### The reverse already half exists, and it is already distance-based

Level 1's own **exit** is the reverse of (2): `map.exit` gives `gateX: 1205.0`
and `vanishX: 1235.0`, `laneGates` turns them into `gateDistance` and
`stopDistance` per lane, and `Gateway.vanishAlpha` ramps 1 → 0 across that span.
`Enemy.leaked()` is then `laneDistance >= stopDistance` and nothing else.

**None of that assumes a frame edge.** It is pure lane distance. A lane that ends
at (1177, 329) leaks at (1177, 329).

### So what the build session would have to do

**Already there, nothing to write:**

- the fade out, measured in lane distance;
- the leak at the end of the lane;
- per-lane gate distances, so a fork does not leak the long arm early.

**Three things to write:**

1. **Pick `gateX` and `vanishX`, and check the route crosses them once.**
   `distanceAtX` returns the **first** crossing of a given x, which is the one
   real generalisation limit: the mechanism is keyed to an x, not to a point. On
   this board the route's maximum x before the final approach is about **1139**
   (the right-hand hook), and the door approach runs from there to 1177 — so
   `gateX ≈ 1145`, `vanishX ≈ 1177` crosses exactly once, with **6 px of
   margin**. That is tight enough to be worth an assertion rather than a
   comment, and it is the thing to re-check if the trace is ever repainted. A
   `distanceAtPoint` would remove the constraint entirely and is a small
   addition to `Gateway.ts` if anyone would rather not live with 6 px.
2. **An occluder at the door.** The mechanism exists and is entrance-only in
   three places: the field lives at `map.entrance.arch.near`, so `MapDef` needs
   an equivalent under `exit`; `createArchOccluders()` returns early when
   `entrance` is absent; and `ARCH_NEAR_KEY` is a single texture key, so a
   second occluder would overwrite the first and needs to become per-piece.
   Making it take `(outline, depth, key)` and calling it for both ends is the
   whole change. The outline itself is an art job — fit it to the housing's
   left face the way level 1's was fitted to the pier, by thresholding the
   housing's grey in a box around the door and thinning the hull, **not** by
   eye from a crop: level 1's first outline was traced by eye and enclosed
   15.7% grass.
   The depth follows level 1's formula: the lane's lowest y in the doorway
   (≈ 329) plus half the trace width (23.75) plus the lane spread plus a
   margin — call it **≈ 380**, recomputed rather than pasted.
3. **A scale term on the way out, if the enemy should shrink into the door
   rather than only fade.** `emergeState` returns `{alpha, scale}`;
   `vanishAlpha` returns a number. Symmetry would mean `vanishState` returning
   both and `Enemy.applyVanish` applying the scale the way `applyEmergence`
   does. Small, and genuinely optional — the fade alone plus the occluder reads
   as "went inside".

**What is NOT needed:** no change to the leak, no change to the lane network, no
change to `levels.json`, and no off-plate waypoint at the exit. Level 1 and 8
extend their lanes past the frame (`x = 1340`, `x = 1340.0`, `y = 779.0`) because
their exits are frame edges; this one must **not** — the lane ends at the door.

---

## Step 6 — the geometry file

`tools/level9_geometry.json`. Level 8's shape where it applies, plus what this
board has that level 8 does not.

| key | |
|---|---|
| `world` / `plate` | `[1280, 720]` / `[3840, 2160]` |
| `entrances.west` | terminal `[0, 323]`, opening `[291, 355]` |
| `_entrances` | why there is only one |
| `exit` | terminal `[1177, 329]`, opening `[300, 359]` — the interior door |
| `deadEnd` | terminal `[910, 568]` |
| `nodes` | `fork [96, 321]`, `rejoin [409, 525]`, `doorJunction [1103, 326]` |
| `centreline` | `stem`, `north`, `south`, `tail`, `door`, `spur` |
| `lengths` / `routes` / `traceLength` | per stretch / per arm / 3284.41 |
| `traceWidth` | 47.5 |
| `towerRange` / `legacyTowerRange` | 132 / 112 |
| `pads` / `padChips` / `padStandoff` / `padStandoffToSpur` | 15 each |
| `padsUnreachable` | `[1, 7, 15]` |
| `padsCoveringTwoPasses` | 3 (2 at the legacy range) |
| `nodeArt` / `suggestedNodeBalanced` / `suggestedNodeByAspect` | Step 4 |

There is no `mainMerge`, no `lanes` and no `buildSpots`: those are level data and
this is not a level.

### `tools/check_level9.py`, and proof that it moves

It re-derives the trace width and every length and fails over 3%, verifies all
fifteen pad cores sit on grey chip rather than substrate, verifies the exit
terminal is where the trace actually ends, verifies the cooling tower slot is
still cyan and still not on the trace, verifies the spur is still a dead end, and
renders the overlay. Nine classifier probes with known answers run first, and the
run stops before any geometry if one comes out wrong.

**The gate is 3%, which is what the brief asks and what this plate can carry.**
Level 8 had to open its length gate to 10% because its road is almost all curve
and the two geodesics cut corners differently; this board is long straight runs
joined by chamfered corners, where the middle is the same line whichever cost
function draws it. Worst disagreement between the two readings:

| stretch | tracer | checker | apart |
|---|---|---|---|
| stem | 87.0 | 87.0 | 0.00% |
| north | 1336.3 | 1336.8 | 0.03% |
| south | 417.7 | 417.2 | 0.11% |
| tail | 1002.5 | 1002.3 | 0.02% |
| door | 65.0 | 65.1 | 0.04% |
| spur | 375.8 | 374.9 | 0.26% |
| whole trace | 3284.4 | 3283.3 | **0.04%** |
| width | 47.5 | 47.0 | 1.05% |

**Then the checker was broken on purpose, seven ways, and it caught all seven:**

| break | caught by |
|---|---|
| a pad moved onto bare substrate | `pad 11: its centre is not inside any grey chip` |
| the exit moved to the frame | `the door measures (1177, 329) against the geometry file's [1279, 329]` |
| the trace width set to 60 | mid-band vertex check, then the width gate |
| the two arms swapped | `the north line re-traces at 417.2 against 1336.3, 68.78% out` |
| a length set to 1200 | `the tail line re-traces at 1002.3 against 1200.0, 16.48% out` |
| the dead end moved mid-run | `the point at (700, 470) has trace 47% of the way round it` |
| a centreline vertex moved off the paint | `1 of the tail line's 28 shipped vertices are not on painted trace` |

CLAUDE.md says not to trust a first red result, and the corollary is that a green
one is worth nothing until the instrument has been shown to move. This one does.

### Two harness faults found on the way, recorded because both looked like product bugs

- **The west mouth read as two openings.** A single dark row at y=295 — a painted
  highlight, one pixel of it — split the run, and the checker reported "the trace
  has 2 frame opening(s) (west, west)", which is *exactly* the brief's claim it
  was written to refute. Runs closer than 6 px are now one opening.
- **The trace measured 38 px wide instead of 48, a 20% error with no visible
  cause.** The glow has pale circuit detail drawn inside it — hairlines, vias,
  little rings — and a classifier tuned to the glow's colour reads those as
  not-glow. The width normal then stops at the first hairline it meets. Closing
  pinholes under 2000 px fixed it and took every length disagreement from 3–8%
  down to under 0.3% at the same time. **Had the gate been looser this would have
  shipped as a real measurement.**

---

## Step 7 — the two engine questions

Probed against `src/systems/Lanes.ts` directly, with three synthetic maps.

### 1. Two entrances, one exit: **YES, and it is the oldest multi-lane shape in the game**

```
TWO ENTRANCES, ONE EXIT          validateLanes -> []
   terminals from stem: [ 'tail' ]  from spur: [ 'tail' ]
   route length from stem: 1418   from spur: 454
   pickForTerminal(stem -> tail): 0.5
```

Nothing to build. `Lanes.ts`'s own opening comment says so: *"Levels 3 and 4 need
two spawn gates whose lanes run separately and then meet before the exit."* A
second lane carries `entrance: true` — which exists precisely so `validateLanes`
does not reject a lane that nothing merges into — and a `merge` into the trunk at
a named waypoint index. `laneGates` gives each lane its own gate distances, so
two entrances at different distances from the door do not leak each other early.

**Confirmed before anyone builds on it.**

### 2. An interior exit: **YES for the leak. One thing assumes an x, and nothing assumes an edge.**

`Enemy.leaked()` is:

```ts
if (this.lanes && this.lanes.transferFrom(this.laneId)) return false
return this.laneDistance >= this.gatesHere().stopDistance
```

A lane distance and nothing else. `stopDistance` defaults to the lane's own
`totalLength`, so **a lane that ends at (1177, 329) leaks at (1177, 329)** with no
change to anything. Every leak point in the game so far is at a frame edge
because every lane so far ends at one — that is the map data, not the system.

What does carry an assumption, in decreasing order of how much it matters:

| what | assumes | for level 9 |
|---|---|---|
| `Gateway.distanceAtX` | an **x**, and takes the **first** crossing | fine, but only just: the route's max x before the final approach is ≈1139 and the door is at 1177. `gateX ≈ 1145` has 6 px of margin. Worth asserting. |
| `GameScene.createArchOccluders` | an **entrance** — returns early without one, and `ARCH_NEAR_KEY` is a single key | an exit occluder needs a schema field and a per-piece key. Step 5. |
| every shipped map's last waypoint | runs **past the frame** (`x = 1340`, `y = 779.0`) | level 9's must not. A convention, not a rule. |
| `vanishAlpha` | nothing — distance only | fine |
| `laneGates` | nothing — per lane, distance only | fine |

### And the shape the board is actually painted in does NOT validate

```
DIAMOND (fork that rejoins)      validateLanes -> ["lane \"stem\" merges in a circle through \"tail\""]
   terminals from stem: [ 'tail' ]  routeLengths: [ 2200, 1469 ]
BOTH                             validateLanes -> ["lane \"stem\" merges in a circle through \"tail\""]
```

**This is a false positive in the validator, and the runtime underneath it is
fine.** `LaneNetwork` resolves the diamond correctly — one terminal, two route
lengths, walkers split at the fork and rejoin. It is `validateLanes`'s cycle
detector that is wrong: it walks continuations with a **single `walked` set
shared across sibling branches** instead of a set local to each path, so the
second arm finds `tail` already visited and reports a circle that is not there.

```ts
const walked = new Set<string>([d.id])
const step = (at: LaneDef): void => {
  for (const m of contsOf(at)) {
    ...
    if (walked.has(next.id)) { problems.push(`... merges in a circle through ...`); continue }
    walked.add(next.id)
    step(next)
  }
}
```

A diamond is not a cycle. Every existing map is a tree or a set of trees, so
nothing has hit this.

**The fix is one line — pass a path-local set down the recursion — and it is not
taken here**, because this pass produces geometry and a validator change wants
its own tests. Whoever builds level 9 hits it on the first `npm test` and should
fix it there rather than reshaping the board around it. Flagged, with a
reproduction, so that nobody spends an afternoon on it.

---

## Verification

| check | result |
|---|---|
| `node --test 'tests/*.test.ts'` | **1088 pass, 0 fail** |
| `sh tools/tsdiff.sh cff5a46` | baseline 213 distinct errors, working tree 213, **0 introduced** |
| `python3 tools/check_level9.py --overlay` | **the plate and tools/level9_geometry.json agree** |
| the checker broken seven ways | **7 of 7 caught** |
| `tools/towebp` PSNR on the plate | 40.5 dB, 0 alpha error, dimensions unchanged |
| deploy total | 41.75 MB against a cap of 43 |

`cff5a46` is `main` and is [run 329](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34767917791)
green.

### What was NOT checked

- **The harness was not run, and there is no frame to run it against.** This
  branch adds no `.ts`, changes no scene, changes no level data and draws
  nothing new: `map-level9` is a plate key that no level loads, so no rendered
  frame differs from `main`'s. The two test edits are a number and a list entry.
  CLAUDE.md's rule is about UI changes and there is no UI change here.
- **No enemy has walked this board.** Every length is a measurement of paint, not
  of a run. The 43 s and 27 s figures are arithmetic at the roster's *median*
  speed against a roster level 9 does not have.
- **The four node variants were not rendered on the plate.** The mapping is
  aspect arithmetic; nobody has looked at a fan node sitting on chip 8.
- **The exit animation was not built, and the housing outline was not traced.**
  Step 5 is a reading of `Gateway.ts`, `Enemy.ts` and `GameScene.ts`, not a
  prototype.
- **`validateLanes`'s cycle bug was reproduced but not fixed**, and no test was
  added for it.
- **Levels 6–8 were not re-measured at range 132.** Their coverage percentages
  are 15% short on range and stay that way until someone re-runs them.
- **The trace was not checked at plate resolution for the pads**, only for the
  two west-edge openings. Everything else is measured at 1280×720, which is the
  resolution the game plays at.

---

## Where this leaves the repository

**In flight**

- Branch `claude/level-9-geometry-uac8ax`, two commits, fast-forwardable onto
  `main`. Merge command below.

**Waiting on a decision**

- **The deploy cap, properly.** 43 holds level 9 and not level 10. The 2.4 MB
  re-encode of the fourteen machine tower skins is now named in three reports and
  is bigger than the problem it would solve. Someone should take it.
- **Is the dead-end spur scenery or a second entrance?** The paint does not say.
  It is the only place level 9 can have two entrances, and it is short — 454 px
  against 1418.
- **Do both arms of the fork carry traffic, or does the level pick one?** They
  are 1336 and 418 px. A 50/50 split means half of every wave has 16 seconds less
  road than the other half. If only one arm is wanted, the other is 1336 px of
  painted trace with nothing on it, which will look like a bug.
- **The four node variants' mapping.** The balanced one above stretches pad 4;
  the honest alternative is three cabled nodes and a `ram` on pad 4.

**Blocked, waiting on somebody else's fix**

- **`validateLanes` rejects the shape this board is painted in.** One line in
  `src/systems/Lanes.ts`. The build session hits it immediately.

**Carried forward from `reports/2026-09-12-level-9-10-art-manifest.md`**

- `titlecard_level10.png` was never uploaded.
- Six sprites' `artFacing` contradicts that brief and the pattern says the
  external inspection was mirrored. Still unconfirmed. **This report is the
  second brief in two days whose external measurements reproduce exactly and
  whose interpretation is wrong** — the cooling tower slot really is cyan at
  81–84%, and the chips really are 43–87 px from the trace measured from their
  edges. Both times the number was right and the thing it was called was not.
  That pattern is worth carrying into the facing decision.
- The six mechanics with art and no implementation; `prop_vlaude_screen.png`'s
  directory.

**New, and not this pass's to fix**

- **`TOWER_RANGE = 112` is stale in three tracers.** Levels 6, 7 and 8's
  coverage figures are measured at a range 15% shorter than any tower has.
- **Six comic PNGs landed at the repository root** in `bee7fa3` and `cff5a46`
  — `comic_eliminated_positions.png`, `comic_fired_early_retirement.png`,
  `comic_job_at_vlaude.png`, `comic_l3_unicorn_boss.png`,
  `comic_l4_glitch_king.png`, `comic_l9_cancer.png`, 24.3 MB between them. The
  same thing the art audit sorted out two days ago, beside `package.json` again.
  They are outside `public/` so they cost the deploy nothing, but they want
  sorting into `art-source/`, and **an unreferenced-asset sweep must not touch
  them** — see CLAUDE.md's standing fact about `bda5eaf` and `eda11dc`.

---

## Merging

```
git checkout main && git merge --ff-only claude/level-9-geometry-uac8ax && git push origin main
```
