# The level select, redesigned: ten levels, two rows, one screen

2026-09-13

**All ten levels fit without scrolling.** Confirmed from rendered frames at
1280x720, 844x390, 844x390 with a 0,47,21,47 notch, 956x305 and 1400x900. No
two nodes overlap, no label is clipped, and level order is followable at all
five. Portrait (375x667, 390x844) is gated by the rotate overlay, which is the
correct answer for portrait rather than a skipped check.

## Commits

| commit | what | CI |
| --- | --- | --- |
| `171f02d` | Ten levels in two rows of five, and the level select fits on one screen | run 307: **green** (`npm test` pass, `npx tsc --noEmit` pass, deploy skipped: not `main`) |
| `aa059d2` | Write up the level select redesign | run 308: **green** (`npm test` pass, `npx tsc --noEmit` pass, deploy skipped: not `main`) |

Branch: `claude/level-select-redesign-3h5pkj`. Base: `bda5eaf`, which is
`origin/main` at the time of writing.

---

## Step 1 — the free win, on its own

`src/data/levels.json` said `plannedLevels: 20`. Scope is ten, so it is 10.

`roadWidth` is `margin*2 + node.width + (slots-1)*pitch`, so at the old
one-row layout that is:

| slots | roadWidth (design units) | against a 1280 box |
| --- | --- | --- |
| 20 | 4310 | 3.37 screens |
| 10 | 2210 | 1.73 screens |

**What the screen looked like after only that change**, from
`sh tools/harness/run.sh worldmap 140 1280x720` and its frame:

```
road 2210 world units across 1280 visible = 1.73 screens
slots 10  maxScroll 930  (0 would mean the bar must not be drawn)
```

Six of the ten nodes were visible; level 6 was cut by the right edge and
levels 7–10 were entirely off screen. **The scrollbar was still needed** —
`maxScroll(1280)` was 930, so the bar drew and the road still had to be
dragged. Halving the road halved the problem and did not solve it.

### What else depends on `plannedLevels`

`Levels.ts` reads it into `ROAD_SLOTS`, clamped up to `LEVELS.length` so a
built level always has a slot. Everything else reaches it through
`ROAD_SLOTS` or through `WorldRoad.roadNodes()`. Changing it to 10 broke
exactly two assertions out of 1055, both of which had hardcoded the twenty:

- `tests/worldmap.test.ts` — `assert.ok(ROAD_SLOTS >= 20, 'the planned
  campaign is no longer on the map')`
- `tests/worldmap.test.ts` — `assert.ok(roadWidth() > display.width * 2, 'the
  road is under two screens long; check whether the bar is still needed')`

Nothing in the game logic broke: unbuilt slots already draw as COMING SOON
plates, `nextLevelId` already returns null past the last built level, and the
victory screen already offers LEVEL SELECT rather than pointing NEXT LEVEL at
an unbuilt slot. Two stale comments claiming "four levels are built and the
road has twenty slots" (`GameScene.ts`, `Levels.ts`) were corrected; they were
wrong about both numbers.

---

## Step 2 — the constraint, measured

### Before

| | design units |
| --- | --- |
| band | 100 … 596 (496 available) |
| node | 160 x 107, framePad 8 → framed 168 x 115 |
| pitch / margin | 210 / 80 |
| label gap / reserve | 10 / 152 |
| block height (frame + gap + reserve) | 277 |
| sway | ±105, step 0.75 rad per index |

Two rows of that block want `2 x 277 = 554` against 496 — **58 units over**,
not the ~12 the brief estimated. (The brief's 508 counted the node's picture
height rather than the framed height, and one label gap rather than two.)

### After

| | design units |
| --- | --- |
| band | 86 … 608 (522 available) |
| node | unchanged: 160 x 107, framePad 8 |
| pitch / margin | **240** / 80 → roadWidth **1280**, exactly the design box |
| rows | 5 per row, gap 8, turn bow 118 |
| label gap / reserve / wrap | **8 / 122 / 220** |
| block height | **245** |
| sway | **±11**, step 1.5708 rad per *screen slot* |
| road height (2 rows + gap + full swing) | **520** of 522 |

Node centres, from `WorldRoad.roadNodes()`:

```
 slot 1  x  160  y 155.5      slot 6  x 1120  y 408.5
 slot 2  x  400  y 166.5      slot 7  x  880  y 397.5
 slot 3  x  640  y 155.5      slot 8  x  640  y 408.5
 slot 4  x  880  y 144.5      slot 9  x  400  y 419.5
 slot 5  x 1120  y 155.5      slot 10 x  160  y 408.5
```

### What gave, and why those were the cheapest places

**1. The label reserve: 152 → 122 (30 units a row, 60 over two).**

This is the biggest single saving and it costs nothing visible. The name under
a node used to wrap to the **node's own 160 units**, at which
`SPORTS COMPLEX AT DUSK` sets three lines. At a pitch of 240 there are 72
units of empty road between framed neighbours, so the name can wrap to 220 and
still leave 20 units between one caption's box and the next — and at 220 that
same name sets **two** lines.

Measured, not estimated. A new harness scenario, `labelprobe`, builds every
real level name and every real unlock line in the real face at the real size
and reports the worst case:

```
wrap 160: worst name 87 [SPORTS COMPLEX AT DUSK (3 lines)]
wrap 220: worst name 58 [COURJAHAN VILLAGE (2 lines)]

name wrap 160 / unlock wrap 200: worst NODE needs 147 [Sports Complex at Dusk (3 + 2 lines)]
name wrap 220 / unlock wrap 230: worst NODE needs 118 [Sports Complex at Dusk (2 + 2 lines)]
```

Note the *worst NODE*, not the worst name added to the worst unlock line —
those belong to two different levels and no node ever sets both. The old 152
sat over a measured 147 (five of slack); the new 122 sits over a measured 118
(four). The probe also confirms the presentation note's original figure of 147
was right, so the reserve was never wrong, only generous for a layout with a
whole band to itself.

**Shrinking the node was the alternative and it is the one the brief warned
off.** It is worse than the brief says, too: at five across, `margin*2 +
node.width + 4*pitch = 1280` means shrinking the node buys width for the pitch
at a 1:4 ratio, and a narrower node forces a narrower label wrap, which puts
the reserve straight back up.

**2. The scrollbar's strip: band bottom 596 → 608, and top 100 → 86.**

The band used to stop at 596 because the scrollbar sat at 610. **A road that
fits draws no bar** (`drawBar` returns on its first line when `maxScroll` is
zero), so that strip is the band's now. This is a knowing trade, recorded in
`presentation.json`: if the planned count ever outgrew two rows, a bar at 610
would draw over the second row's names.

Both band edges are **read off a rendered frame**, by the new `roadfit`
scenario, rather than estimated from font sizes:

```
chrome: the title ends at 72, the bottom bar starts at 635 (1280x720)
chrome: the title ends at 72, the bottom bar starts at 621 (844x390)
chrome: the title ends at 72, the bottom bar starts at 610 (956x305)
```

**The bottom is set by a phone, not by a desktop**, and this is the one that
would have been got wrong by inspection. BACK is 54 design units tall in the
source, but `tapFloor` grows every control until it is 44 CSS pixels; at
956x305 the design box fits at 0.4236, so the same button is 104 design units
tall and its plate starts at 610. Reading the chrome off a 1280x720 frame
would have put the band's bottom 25 units inside it on the viewport that
matters most. 608 clears the worst of them, and `roadfit` asserts it at every
viewport.

The title moved from y 54 to y 44 — ten units, which is most of what the wave
got. Its ink now ends at 72 and the band starts at 86, which is where the open
node's pulse ring (12 units above its frame) stops.

**3. The wave: ±105 → ±11.**

What is left after the two rows and the row gap. Peak-to-peak *is* the cost,
whatever shape the wave is — a rectified wave, an asymmetric one and a
sinusoid all pay the same — so there is no cleverer curve that buys more of
it. Only a shorter reserve or a taller band would, and both are spent.

### Why two rows of five and not something else

Ten in one row needs 2210 against 1280. To fit one row the node drops to about
104 wide, at which the longest name wraps to four or five lines and the
reserve goes back up past where it started — the brief's own warning, and the
probe confirms the direction (wrap 160 already costs three lines).

Other shapes were measured and rejected:

- **A half-pitch stagger between rows** (row two offset by 120) needs
  `roadWidth = 1400` at pitch 240, so the pitch has to drop to 210 — at which
  the label wrap drops to ~200 and the reserve returns to 152. Net loss.
- **A wider node to carry bigger cakes.** At five across, `margin*2 + width +
  4*pitch ≤ 1280` with `pitch ≥ width + 8 + gap` allows a 200-unit node — but
  the card crop is 3:2, so 200 wide is 133 tall, which is +26 a row and +52
  over two. There is no 52 to spend.
- **Two rows with labels above row two**, so the deepest thing is a frame
  rather than a caption. The sum is identical: `2*(115 + gap + reserve) +
  rowgap` however the two blocks are oriented.

So: two rows of five, as the brief expected.

---

## Step 3 — the road still reads as a road

The snake is the shape: row one runs left to right, the road bows out to the
right and drops, row two runs right to left. `WorldRoad.placeOf` gives each
slot a `column` (its place in level order within the row) and a `slot` (its
place across the screen), and on every second row those run opposite ways.

**The wave is phased off the screen slot, not off the level number.** This is
the thing that would quietly break if someone re-derived it: with slot
phasing, the vertical clearance between one row's deepest reserved name and
the next row's frame is exactly `rows.gap` at every column. Phase it off the
level number instead and the mirrored row drifts in and out of step with the
one above — at this amplitude, row two's frames land 14 units inside row one's
captions. `worldmap.test.ts` asserts the constant clearance by screen slot so
the property is guarded rather than commented.

**The turn bows 118 units, and that number is not taste.** The two nodes
either side of a turn share a screen slot, so a straight connector is a plumb
line down through the middle of the caption it is leaving. A rendered frame at
a bow of 46 shows the road drawn through its own label; 118 clears the
220-wide caption box. `roadPath()` returns the polyline — node centres plus
the three bow points — so the scene draws the same curve the tests measure.

Everything else is unchanged: path bed/surface/dots, badge, cake row, pulse
ring, tick, padlock, plate, and the three state colours.

---

## Step 4 — the tests, and proof they catch a real failure

Both new tests are in `tests/worldmap.test.ts` and both ask `WorldRoad` for
the same rectangles the scene draws. No constants are copied.

- **`no two framed nodes overlap`** — every pair of `nodeRect`s, then every
  pair of `nodeBlock`s (frame plus reserved caption), which is the collision
  that actually shipped twice.
- **`no label block leaves the band`** — every block's top against
  `band.top` and its bottom against `band.bottom`, plus `roadHeight()`
  against the band as a whole.

Run red on purpose, then restored:

| break | what failed |
| --- | --- |
| `rows.gap: 8 → -140` | `no two framed nodes overlap`: *slots 1 and 10 overlap*; `no node's name lands on another node`: *slots 1 and 10 overlap once their names are counted* |
| `band.bottom: 608 → 596` | `no label block leaves the band`: *slot 4 rides over the top of the band by 5*; *the road is 10 units too tall for its band* |
| `label.reserve: 122 → 160` | `no label block leaves the band`: *slot 1 rides over the top of the band by 26*; *the road is 74 units too tall for its band* |

With the road centred in its band, a road that is too tall spills at both
ends, which is why breaks 2 and 3 report the top edge. The suite is green with
the breaks reverted: **1058 tests, 1058 pass**.

`roadfit` is the same two checks off a rendered frame, plus three the source
tests cannot make: every node wholly inside the *viewport* in CSS pixels, the
deepest **ink** (not the reserve) inside the band, and the serpentine actually
walking 1..10 without doubling back.

### The `screens` audit was exempting the whole road

A hole worth naming. `screens` is told to ignore everything inside the
scrolling container, because content running off the edge of the screen is
what scrolling *is*. On `main` at 844x390 it printed:

```
2-WORLDMAP: 61 drawn, 3 live, 0 fault(s)
  39 object(s) scrolled off screen, not audited
```

At ten levels in two rows nothing scrolls, so that blanket exemption would
have hidden every node from the one audit that looks at a whole screen. The
scene now exposes `scrolls()` and the harness asks instead of assuming. After
the change, at every landscape viewport:

```
2-WORLDMAP: 70 drawn, 3 live, 0 fault(s)
```

---

## Step 5 — the cakes, resolved in CSS pixels

The finding was that **32 meant CSS pixels** and the setting was in design
units, and the screen is fitted from the 1280x720 box down onto the viewport,
so the two are only equal at a fit of 1.

The node cannot be widened: five across pins it at 160, and the card crop is
3:2, so any extra width costs height the band has not got. So the presentation
changed instead — **the cake row is allowed off the edges of the card into the
road, exactly the way the name under it now is.** At a pitch of 240 there are
72 units of road between framed neighbours; the plate spends 34 of them and
leaves 38 between one node's row and the next.

| | before | after |
| --- | --- | --- |
| `cakes.nodeSize` | 44 | **57** |
| `cakes.nodeDrop` | 40 | 24 |
| `cakes.nodePlate.pad` | 7 | 5 |
| row width (3 + gaps) | 148 | 192 |
| plate width | 162 | 202 (node frame is 168) |

57 rather than 59 because `fitInBox` scales the 1024-square canvas until the
ink extents in `art.json` (926 x 982) fit, so the drawn quad is about 4%
larger than the figure.

**Measured CSS sizes, off rendered frames** (`roadfit` reports the cake's
drawn rectangle through the scene's own camera):

| viewport | design-box fit | cake, CSS px | was, at 44 units |
| --- | --- | --- | --- |
| 1400x900 (desktop) | 1.094 | 65.0 | 48.1 |
| 1280x720 | 1.000 | 59.4 | 45.9 |
| **844x390 (iPhone landscape)** | 0.5417 | **32.2** | **23.8** |
| 844x390 with a notch | 0.5417 | 30.5 | 22.6 |
| 956x305 (Safari, Share sheet open) | 0.4236 | 25.2 | 18.6 |

**32.2 CSS px at 844x390 is the number the brief asked for, met.** It is still
a function of the viewport and no design-unit figure can be 32 everywhere: at
956x305 the fit is 0.42 and these are 25 CSS px. The fit is what shrinks them
there, not the cake — and at that viewport the *whole screen* is 42% of design
scale, chrome included.

`tests/cakes.test.ts` now asserts the floor in CSS pixels at 844x390, derived
from the art manifest rather than assumed 1:1, and asserts the plate's width
against the **pitch** rather than the card. It used to assert `>= 32 design
units` and `row width <= node width`, which are two different claims from the
one the finding made and neither of which could see 24.

---

## Verification

Typecheck: `sh tools/tsdiff.sh bda5eaf` — baseline 212 distinct errors,
working tree 212, **none introduced**. The blind spot in `CLAUDE.md` applies
as always; nothing here touches a Phaser member that `tsdiff` cannot see
(`Phaser.Math.Vector2` is the only Phaser API added, and it is public).

Tests: `node --test 'tests/*.test.ts'` — **1058 tests, 1058 pass, 0 fail**.

### Rendered frames

Reproduce with `sh tools/harness/build.sh` then the command in each row.
Screenshots are gitignored on purpose.

| viewport | command | result |
| --- | --- | --- |
| 1280x720 | `sh tools/harness/run.sh roadfit 160 1280x720` | all 10 nodes fit, none overlap, none leaves the band |
| 844x390 | `sh tools/harness/run.sh roadfit 160 844x390` | same |
| 844x390 + notch | `INSETS=0,47,21,47 sh tools/harness/run.sh roadfit 160 844x390` | same |
| 956x305 | `sh tools/harness/run.sh roadfit 160 956x305` | same |
| 1400x900 | `sh tools/harness/run.sh roadfit 160 1400x900` | same |

**Which claims came from rendered frames.** All of these, and each was read as
a picture as well as a number:

- *All ten nodes visible without scrolling* — `roadfit` converts every node's
  frame to CSS pixels through the scene's own camera and asserts it is inside
  the viewport; the frame shows ten cards. At every viewport above.
- *No two overlap* — `roadfit`'s pairwise check, and the picture.
- *No label is clipped* — `roadfit` finds the deepest **ink** on the road
  (591, `"Clear THE CROSSROADS to unlock"`) against a band bottom of 608 and
  a chrome top of 610 at the worst viewport.
- *Level order is followable* — the serpentine check, and the picture: 1–5
  left to right along the top, a bow out to the right, 6–10 right to left
  along the bottom.
- *The turn does not draw through its own caption* — read off the picture at a
  bow of 46 (it did) and at 118 (it does not). The numbers cannot see this.
- *The cake CSS sizes* in the table above — every one measured off a drawn
  object, not computed.
- *The band's edges* — the title's ink end and the chrome's start, per
  viewport, off the frame.

`sh tools/harness/run.sh screens 160 <vp>` at 375x667, 390x844, 844x390,
956x305 and 1400x900:

- 375x667 and 390x844: **portrait is gated**; the rotate overlay covers the
  window and the menus behind it are not a player-facing layout.
- 844x390: 1 fault — `SMALL Title [title:version-stamp]`. **Pre-existing**:
  the identical fault is reported by the same command on `bda5eaf`.
- 956x305: 2 faults — the same version stamp, plus `OVER Title Rectangle
  @410,154 <> Rectangle @423,190`. **Both pre-existing on `bda5eaf`**,
  verified by running the audit against a worktree at that commit.
- 1400x900: no layout faults.
- WorldMap itself: **0 faults at every landscape viewport**, now that the road
  is actually audited (see Step 4).

### The 56.6 MB TileSprite fix still holds

`sh tools/harness/run.sh texmem 200 <vp>`. The background is the camera's
size with `tilePosition` scrolled, not the world's:

| viewport | TileSprite canvas | that texture | world map total |
| --- | --- | --- | --- |
| 1280x720 | 1282 x 722 | 3.5 MB | 87.3 MB |
| 844x390 | 1562 x 722 | 4.3 MB | 88.1 MB |
| 956x305 | 2260 x 722 | 6.2 MB | 90.0 MB |

The world-sized sprite it replaced was 6870 x 2160 = **56.6 MB**. At the worst
of the three viewports the ground is now 6.2 MB, 89% smaller. Note the canvas
grows with the viewport's *aspect*, not with the road — halving the road's
width from 4310 to 2210 and then to 1280 changed nothing here, because the
sprite stopped being sized by the road in the first place. The largest single
texture on this screen is `ui-title-bg` at 7.9 MB, still resident from the
title.

### Other scenarios re-run

`worldmap`, `cakes`, `cakestate`, `locked`, `difficulty`, `mapedge` — all
clean. Two harness defects fixed on the way past, both of which made a
scenario fail for a reason that was not the reason it named:

- **`cakes` failed on `main`, and had nothing to do with this work.** It took
  the first three cakes in y-then-x order and called them level 1's, which has
  not been true since the road got a wave — the highest built node on the wave
  is not level 1. It reported `level 1 banked 3; its node lights 0` against a
  save that was correct and a screen that was correct. It now finds the three
  cakes nearest level 1's node, from `WorldRoad`, and passes:
  `level 1 banked 3; the three cakes nearest its node at 160,156 light 3`.
- **`worldmap` flagged an unmoved road as a fault.** Not moving is correct
  now; it compares against `maxScroll` and says which answer it expected.

### Not checked, or checked and not conclusive

- **`noderings` is flaky at its own threshold and it is not this change.** It
  samples build-pad ring contrast in GameScene, which this work does not
  touch. Three consecutive runs of the same tree reported 34 (TOO FAINT, its
  target is 35–50), 41 (OK) and 35 (OK); `bda5eaf` reported 36. A 35-unit
  boundary on a measurement that moves ±7 run to run is a harness threshold
  problem, not a regression.
- **`nodefirst` reports `no placement instruction is shown`** and does so
  identically on `bda5eaf`. Pre-existing, unrelated to this screen.
- **The `ASSERTS_NOTHING` list is five, not nine.** The brief lists nine
  scenarios that do not assert; `ui`, `buildall`, `poor` and `typegame` have
  since been repaired. The five that remain are `muzzle`, `rockets`,
  `retreat`, `regressions` and `meteor`, and none of them was touched here.
- **No `GL=1` screenshot was needed.** Nothing in this change is about the
  drawing context; every frame above is from the default Canvas2D path, which
  is what the layout and the CSS-pixel measurements are about.
- **Row two is five COMING SOON plates**, because six levels are built. What
  ten built levels look like on this layout cannot be checked until they
  exist; the geometry is identical either way, and the reserve is measured
  against the longest name that exists today.

---

## Where this leaves the repository

**In flight: nothing is merged.** `claude/level-select-redesign-3h5pkj` is two
commits ahead of `origin/main` (`bda5eaf`) and fast-forwards cleanly. Both CI runs
are green (307 on the code, 308 on this report). This session cannot push to `main`, so the
branch is waiting on:

```
git fetch origin && git checkout main && git merge --ff-only origin/claude/level-select-redesign-3h5pkj && git push origin main
```

Three sessions in a row have ended with green work sitting on an unmerged
branch. This is the fourth branch; it is not in the game until that command
runs.

**Open, carried forward:**

1. **The two Title-screen faults at 956x305 and 844x390 are still open.** The
   `SMALL` version stamp is deliberate and documented as a hidden dev door;
   the `OVER` between two Title rectangles at 956x305 is not, and nobody has
   looked at it. Both predate this work.
2. **`noderings` has a threshold it cannot hold.** It will keep failing about
   one run in three on unchanged code, and a check that fails at random is a
   check people learn to ignore. Either widen the band or sample more frames.
3. **`nodefirst` reports no placement instruction**, on `main` and here.
   Unexamined.
4. **Raising `plannedLevels` above 10 is no longer free**, and levels.json now
   says so. Eleven slots is a third row, and two rows already use 498 of the
   band's 522 units. A third row would need the reserve to come down again or
   the node to shrink.
5. **The scrollbar's y of 610 is now inside the band.** It never draws, so it
   is harmless — but if the road ever stops fitting, the bar would draw across
   the second row's names. `worldmap.test.ts` asserts `maxScroll` is zero at
   the design width, which is what keeps the trade honest.
6. **Five harness scenarios still assert nothing**: `muzzle`, `rockets`,
   `retreat`, `regressions`, `meteor`.
