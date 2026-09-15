# Level 9's build pads, at one size

| commit | what | CI |
|---|---|---|
| [`c9ea4f6`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/c9ea4f6) | The per-pad widths out of `map_level9.json` and its generator, the node fitted to `quietWorldWidth`, two guard tests, the four chips in `measure_art.py`, the `level9` harness measurement | [run 391](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34957175667) — all five jobs **success**, and `deploy / deploy` **RAN** |
| [`8d28e21`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/8d28e21) | This report, and `claude/context.md` | [run 392](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34957716284) — `changes`, `typecheck`, `test` **success**; `deploy` **skipped**, correctly: a markdown-only push does not republish |
| *this commit* | Closing this table on runs 391 and 392 | it edits this table and nothing else |

Read the job list, not the run's conclusion. `c9ea4f6` touched `src/`, so its run
**deployed**; this report does not, so its run skips `deploy` and that is the
`changes` job working as designed.

**Answers first.**

1. **The uniform size is 52.33 world pixels across, by WIDTH**, which is
   `presentation.json`'s `buildPad.quietScreenWidth` (90 screen px) over
   `display.json`'s `camera.defaultZoom` (1.72) — the same line and the same
   number the flagstone has always been fitted to on the other nine boards.
   Measured off the live scene at three viewports: **fitted width 52.33 to
   52.33, one distinct value** across all fourteen nodes.
2. **No pad floats on bare circuit board.** Every node is drawn wholly inside
   the painted chip it stands on, checked against all fifteen traced chip
   boxes. Nothing moved, so nothing could.
3. **Level 9 still soaks 191/480 (40%).** Byte-identical to the figure on
   record.

---

## The cause, confirmed before anything was changed

`src/data/map_level9.json` carried a `padArt` block with a `width` on every
entry:

```
144, 68, 133, 82, 85, 63, 122, 82, 81, 72, 70, 71, 150, 73, 72
```

Fifteen pads, **thirteen distinct values, a 2.38x spread.** `GameScene`
`createPads` read `padArt[i].width` and handed it to `fitContentWidth`, so the
drawn size of a build pad was a per-pad property on this board and nowhere else.

**Level 9 is the only map in the game with a `padArt` key.** Confirmed by
reading all ten map files: `map.json` and `map_level2..8,10.json` have no such
block, and every one of the ten — level 9 included — carries `spotRadius: 34`.

Where the widths came from is worth recording, because it explains why the
numbers looked reasonable. `tools/build_level9_map.py` generates this file from
`tools/level9_geometry.json`, and it was writing `float(chips[i]['w'])` — the
width of the **painted chip on the plate**, traced off the art. The board really
does have chips from 63x61 to 150x117, and the node art was being stretched to
cover each one.

### The second half: the art disagreed with the tap target

`BuildSystem.spotAt` is a circle of `radius = spotRadius`, which is **34 on all
ten levels**. It has never read `padArt`. So on level 9:

| pad | painted chip | drawn at | tap target |
|---|---|---|---|
| 12 | 150 x 117 | 150 px across | 68 px across |
| 5 | 63 x 61 | 63 px across | 68 px across |

The 150 px chip could not be pressed across most of its own face. The 63 px chip
was smaller than the circle that answered for it. Every pad on the board was
wrong in one direction or the other.

**And the brief's one factual slip is worth correcting, because the next session
will look for it.** The brief says the other nine levels derive pad size "from
`spotRadius`". They do not. `spotRadius` governs the **tap target** and nothing
else; the **drawn** size everywhere in the game is
`buildPad.quietScreenWidth / camera.defaultZoom`. Both are uniform across all
ten levels, which is what the brief was actually after, but they are two
different numbers and conflating them would send someone editing the wrong one.

The relationship that now holds on level 9 is the one that has always held
everywhere else: **the art is 52.33 px across inside a 68 px tap circle, 79% of
it.** The art never exceeds what can be pressed, on any pad, on any level. That
is the sense in which the drawn art now "matches" its tap target — it is
identical to the rest of the game, not pixel-equal to the circle.

---

## The fix

`tools/build_level9_map.py` stops emitting `width`; `map_level9.json` was
**regenerated** from it rather than hand-edited, and the diff is the padArt
block and its `_padArt` note and nothing else — every waypoint, lane, build spot
and scenery item came back byte-identical, which is itself evidence the
generator is still in sync with the file.

`MapDef.padArt` is now `{ key: string }[]`. `createPads` fits a map-supplied
node with the same `fitContentWidth(img, key, quietWorldWidth)` the flagstone
gets.

**The four chip styles stay**, assigned per pad exactly as before:
`node-chip-cabled` x4, `node-chip-fan` x3, `node-chip-ram` x4,
`node-chip-square` x4. The variety was in the art and that part is good.

### Equal width, not equal footprint — and why

Each style has its own aspect, so "uniform" had to mean one or the other. Both
were built and both were rendered.

| style | ink (source px) | aspect | equal width | equal footprint |
|---|---|---|---|---|
| `node-chip-cabled` | 493 x 363 | 1.358:1 | 52.33 x 38.5 | 53.31 x 39.3 |
| `node-chip-ram` | 489 x 437 | 1.119:1 | 52.33 x 46.8 | 48.39 x 43.3 |
| `node-chip-square` | 456 x 420 | 1.086:1 | 52.33 x 48.2 | 47.66 x 43.9 |
| `node-chip-fan` | 492 x 480 | 1.025:1 | 52.33 x 51.1 | 46.31 x 46.1 |

Note first that **`fitInBox` would not have given a third option**: all four
chips are wider than tall, so fitting each into a square box reduces to fitting
by width. "Equal footprint" therefore had to mean equal ink AREA, normalised so
the geometric mean matches the flagstone's own 52.33 x 40.0.

**Equal width wins, and the rendered frames are why.** Reproduce with:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh level9 260 1400x900
python3 tools/harness/shrink.py tools/harness/shots/level9-1-board-1400x900.png 1000 --crop=727,100,563,400
```

That crop holds one of each style at once — cabled at top, ram in the middle and
lower centre, fan at right, square at top-left — and the two versions are very
close. What separates them:

- **Equal footprint makes no two styles the same width.** Widths run 46.31 to
  53.31, a 15% spread, and width is the dimension a player reads a row of pads
  across. "Every pad renders at ONE size" stops being checkable — the run prints
  *four* distinct values.
- **The height spread equal width leaves does not read as a size difference.**
  The cabled chip is 38.5 tall against the fan's 51.1, and in the frame it reads
  as a *low-profile connector strip* beside a *round fan* — a different kind of
  component, which is exactly what the four styles are for. Its aspect is its
  identity.
- **Equal footprint needs a rule that exists only for level 9**, plus a helper
  to implement it. That reintroduces "level 9 is special about pad sizing",
  which is the thing being removed.

Equal width is one line, one number, and the same line and number as the other
nine boards.

### `contentWidth`/`contentHeight` — checked, and already right

`tools/measure_art.py` did not cover the two pad arts or the four chips at all,
so it does now. Run `python3 tools/measure_art.py` and read the
**"Build pads and build-node chips"** section:

```
  prop-pad            canvas 320x290, ink x0-319 y0-289 -> 320x290  (1.103:1)
  prop-pad-flagstone  canvas 358x274, ink x1-356 y1-272 -> 356x272  (1.309:1)
  node-chip-cabled    canvas 503x373, ink x5-497 y5-367 -> 493x363  (1.358:1)
  node-chip-fan       canvas 502x490, ink x5-496 y5-484 -> 492x480  (1.025:1)
  node-chip-ram       canvas 499x447, ink x5-493 y5-441 -> 489x437  (1.119:1)
  node-chip-square    canvas 466x430, ink x5-460 y5-424 -> 456x420  (1.086:1)
```

**`art.json` already carried the ink for all six and is unchanged.** That is a
finding, not a skipped step: the four chips were exported with 5 px of
transparent margin all round and whoever wrote those entries measured the ink
rather than the canvas. Had they carried the canvas, `fitContentWidth` would
draw each chip 2% small and by a *different* 2% per file — invisible while the
target was already a different number on every pad, and visible now that it is
one number. The measurement is in the tool so the next re-export re-derives it
instead of trusting this paragraph.

---

## Verification

Everything below marked **FRAME** came off a rendered frame from
`tools/harness/`. Everything else is a test, a typecheck or a simulation.

### FRAME — all fifteen pads, three viewports

The `level9` harness scenario now measures every pad off the live scene. It
gained five `expect()` checks (81 -> 86 in the run), and prints a row per pad.

| viewport | fitted width | distinct values | styles | nodes off their painted chip |
|---|---|---|---|---|
| 1400x900 | 52.33 to 52.33 | **1** | all 4 | **none** |
| 844x390 | 52.33 to 52.33 | **1** | all 4 | **none** |
| 667x375 | 52.33 to 52.33 | **1** | all 4 | **none** |

```
pad art: asked for 90 screen px at the default zoom of 1.72 = 52.33 world px
across; the tap target is a 34 px circle, 68 px across
  pad  0 at (782, 106)  node-chip-cabled   canvas 53.4 x 39.6 (peak 56.1)  ink 52.33 across -- 79% of the tap target
  pad  1 at (622, 108)  node-chip-square   canvas 53.5 x 49.3 (peak 56.1)  ink 52.33 across -- 79% of the tap target
  ...
  pad  9: the sign, canvas 81.7 x 74.0 -- not a node, and sized by height not width
  fifteen pads, 14 of them nodes: fitted width 52.33 to 52.33, 1 distinct value
  styles on the board: node-chip-cabled node-chip-fan node-chip-ram node-chip-square
  nodes reaching past their painted chip: none
```

**THE MEASUREMENT HAS A TRAP IN IT AND THE FIRST VERSION FELL IN.** Every pad
breathes — `scale` from `base` to `base * 1.05`, yoyo, forever — and they are
deliberately **phase-offset**, one stagger step of `pulseMs / n` apart, so no two
pads are at the same point of the breath at the same instant. Reading
`displayWidth` once therefore reported **"13 distinct values, 52.78 to 54.94"**
on a board where every pad is fitted to the same number — and 52.78 to 54.94 is
exactly 52.33 to 52.33 x 1.05. That is the animation working correctly, reported
as the bug being fixed. Dividing by `scale` does not help either: the tween
writes `scale` itself, so `base` is not recoverable from one frame.

The scenario now samples every pad every 30 ms for **two full pulse periods** and
takes each pad's minimum, which is its `base` and nothing else. It also converts
`displayWidth` (the CANVAS, margins included) back to ink by multiplying through
`contentWidth`, which is why the printed figure is comparable with
`quietScreenWidth / defaultZoom`.

### FRAME — no pad floats on bare circuit board

The concern in the brief was real in principle: a pad drawn at 150 might have
been positioned for the larger art. **It was not.** `tools/build_level9_map.py`
places each build spot at the **centre of its painted chip's traced box**, so
shrinking the node keeps it centred on the same chip. Checked rather than
argued: the scenario holds all fifteen traced boxes and compares each node's
rectangle against its chip's.

The binding case is the smallest chip — pad 5 at (460, 231), painted 63 x 61.
The tallest style at 52.33 wide is the fan at 51.1, and the widest sprite
including margins is 53.5. Both fit. **Zero pads reach past their painted chip,
at all three viewports. No coordinates to report, because there is nothing to
report.**

Also visible in the frame, and worth saying plainly: the painted chips on the
plate are still thirteen different sizes, because that is the *plate art* and it
was not touched. What changed is that the build-node marker on top of them is
now one size. On the big chips the marker no longer covers the whole chip, which
is how the other nine boards have always looked.

### FRAME — no pad on the road, every pad buildable

`python3 tools/check_level9.py` re-derives the geometry from the painted plate
and agrees with `tools/level9_geometry.json`: *"15 pads, one per painted chip.
Closest pair 120.6 px. standoff 69.4-194.3, median 93.3."* Every pad's 24 px core
sits on chip rather than board. Unchanged — **no pad moved, and no pad could
have: this change touches only how large a picture is drawn.**

In the frame, the `level9` scenario builds **15 of 15** towers.

The three pads that cannot reach the route at the shortest tower range (pads 1,
7 and 15) are a **pre-existing, documented property of this board**, recorded in
`map_level9.json`'s own `_buildSpots` note, and not a finding here.

### The pad tests named in the brief

| test | result |
|---|---|
| `tests/hudpads.test.ts` | 5 passing — reachability, and the newer "no HUD element overlaps a VISIBLE build pad" |
| `tests/buildpad.test.ts` | 10 passing (8 existing + 2 new) |
| the drawing rule from `reports/2026-09-14-ui-cleanup.md` | `padShowing` still returns false when `hudStandsOn` is true; asserted by the existing `a pad disappears under the tower built on it` test, which pins `img.setVisible(this.padShowing(spot))` |
| whole suite | **1156 passing, 0 failing** |

**And `hudpads.test.ts` asserts REACHABILITY, not disjointness.** It was green for
a day while pads were visibly covered. Nothing here leans on it.

### The guard

Two new tests in `tests/buildpad.test.ts`:

1. **`no map carries a per-pad art size`** — sweeps every `src/data/map*.json`,
   and for any `padArt` block requires each entry to carry the single field
   `key`. `width`, `height`, `size`, `scale`, `displayWidth`, `displayHeight`,
   `contentWidth`, `contentHeight` and `radius` are named explicitly so the
   failure message says what the rule is. It also checks the block's length
   against `buildSpots`.
2. **`a level with its own node art is sized like every other pad`** — reads
   `createPads` and requires the node branch to go through
   `fitContentWidth(img, key, quietWorldWidth)`, and that nothing reads a width
   off the map. The data guard alone could be satisfied by putting a different
   hardcoded number in the code instead.

**Both were confirmed to FAIL when the old behaviour is put back**, which is the
step this repository has learned not to skip:

```
not ok 9 - no map carries a per-pad art size
  error: map_level9.json: padArt[0] carries "width". A map may name a pad's
  picture, never its size — that is quietScreenWidth / defaultZoom for every
  pad in the game.

not ok 10 - a level with its own node art is sized like every other pad
  error: a map-supplied node is sized by something other than the one pad width
```

This covers level 10 and anywhere else: the sweep is over every map file, not
over level 9.

### FRAME — levels 1 to 8 and 10 unchanged

By construction the node branch is reachable only when a map has a `padArt`
block, and level 9 is the only one that does. Checked in frames anyway:

- `sh tools/harness/run.sh levelart 300 1400x900` — **"level art is complete on
  every level checked"**, with a board screenshot for levels 1, 2, 3, 4, 5, 9
  and 10. Levels 1, 3 and 10 were opened and looked at: uniform flagstone ovals
  and one `DO NOT BUILD HERE` sign on each, exactly as before.
- `sh tools/harness/run.sh screens 200 1400x900` — **no layout faults at
  1400x900**, across Title, WorldMap, all five Loadout heroes, Cutscene and the
  level 1 Game board.

### The three viewports the brief asks for

| viewport | result |
|---|---|
| 375x667 | **portrait, gated** — the rotate overlay, which is the correct answer for a landscape-only game, not a skipped check |
| 667x375 (its landscape) | 1 fault: `SMALL Title [title:version-stamp (hidden dev door, not a tap target)]` |
| 390x844 | **portrait, gated** |
| 844x390 (its landscape) | 1 fault: the same version stamp |
| 1400x900 desktop | **no layout faults** |

**The version-stamp fault is pre-existing and long documented** — it is the
hidden five-tap dev door, deliberately under 44pt and self-labelled, recorded in
at least six earlier reports going back to 2026-09-06. It is on the Title
screen, which has no build pads.

### Typecheck

```
sh tools/tsdiff.sh c1682ab
baseline c1682ab: 214 distinct errors; working tree: 214
--- introduced by the working tree ---
(nothing)
```

`c1682ab` is green on run 388, all five jobs. **And CI's real `npx tsc --noEmit`
agrees** — run 391's `typecheck` job is success, which is the only complete
typecheck available, since there is no `node_modules` in this sandbox and every
Phaser type is `any` here.

### The soak

```
node --experimental-strip-types tools/soak/level.ts 480 level9
level9 [normal]: 191/480 wins  (40%)
  lost after wave: w3x22 w4x60 w5x24 w6x7 w7x47 w11x42 w15x87
  average lives left on a win: 13.5
```

**191 of 480, unchanged**, and it could not have been otherwise: `Sim.ts` reads
build spots, not pad art. It is reported because the brief asked and because a
moved pad would have shown up here.

---

## What was NOT checked

- **The `level9` scenario reports 3 of 86 checks failed, and all three are
  pre-existing.** They were reproduced on an unmodified tree before any edit:
  *"4 scenery items declared, 8 built"*, *"the rebuilt board has 8 scenery
  items"* (the three arcs and the screen each count twice somewhere between the
  map and the scene graph) and *"START RUN would begin level10"* (the harness's
  own save state has every level cleared). None of them is about pads and none
  of them is new. **They are an open item, not a closed one.**
- **The `padart` scenario was not re-run.** It measures the flagstone on level 1
  and this change cannot reach it; `screens` covers that board.
- **Levels 6, 7 and 8 have no frame in this report.** `levelart` walks 1-5, 9 and
  10 only. The argument for them is structural — no `padArt` key, so the changed
  branch is unreachable — plus the data guard, which sweeps all ten map files.
- **No real device.** Everything here is headless Chromium at `dpr 3` on the
  Canvas2D path.
- **Whether 52.33 px is the right size for a chip node**, as opposed to the
  right *consistent* size. It is what every other pad in the game is. If it
  turns out to read small against level 9's larger painted chips, the number to
  move is `presentation.json`'s `quietScreenWidth`, and it moves every board at
  once — which is the point.

---

## Where this leaves the repository

- **`main` is at `c9ea4f6`** and its tree contains the change: `padArt` on
  `refs/heads/main` is fifteen key-only entries, confirmed by reading the file
  back from GitHub. Run 391 is green on all five jobs and **`deploy / deploy`
  ran**, so the live site carries it — this was a `src/` push, not a
  documentation one.
- **Nothing is in flight and nothing is blocked.** No branch, no PR.
- **The camera, the scroll clamp and camera bounds were not touched.**
- **Carried forward from `reports/2026-09-15-blockers.md` and `claude/context.md`**,
  still open and still untouched by this work:
  - Level 7's spawn and exit badges are invisible on the Highway. ~9 luma of
    contrast; it is an **art** job, not an alpha one.
  - `run.sh drawer`'s two pre-existing findings — 6 of 7 towers visible, and
    re-tapping the selected tile not cancelling — both wanting a decision, and
    both wanting the harness's duplicate tile centres established first.
  - The soak understates level 10 for an **incomplete** board, where a
    countermeasure takes a spare pad from wave 11. Teaching `Sim.ts` that is not
    asked for.
- **New, small, and opened by this report:** level 9's scenery count disagrees
  with its declaration — 4 declared, 8 built. Pre-existing, reproduced on an
  unmodified tree, and the `level9` scenario has been reporting it for a while.
  It is two `expect()` failures out of 86 and nobody has looked at it.
