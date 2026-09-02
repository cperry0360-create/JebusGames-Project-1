# The control drawer, first slice — measured

2026-09-02. Behind the `controlDrawer` save flag, off by default. The build
ring is untouched and is still what a player gets.

Everything below is a measurement from `tools/harness` scenario `drawer`,
driven end to end at **844x390 and 568x320, at devicePixelRatio 1 and 3** —
all four combinations. Reproduce any line with:

    cd tools/harness && sh build.sh
    DPR=3 sh run.sh drawer 120 568x320
    sh both.sh drawer 120 568x320      # runs 1 and 3 and diffs screen space

---

## The answer to the question that was asked

> Report the drawer's measured width and the tile's measured tap area at both
> viewports, so I can judge whether 62px tiles are big enough for a thumb.

| | 844x390 | 568x320 |
|---|---|---|
| panel | **152 x 218** at 686,90 | **118 x 148** at 444,90 |
| grid (what the tiles are seen through) | 136 x 202 | 102 x 132 |
| **tile tap area** | **65 x 62** | **48 x 62** |
| tab | 34 x 88 at 804,155 closed, 652,155 open | 34 x 88 at 528,120 closed, 410,120 open |
| tiles visible without scrolling | 6 of 6 | 4 of 6 |
| maxScroll | 0 | 66 |

Identical at dpr 1 and dpr 3 in both cases; `both.sh` reports *screen space is
identical* for 16 fingerprint lines at each viewport.

**The number to judge is 48 x 62, not 62 x 62.** The height is fixed by data
and holds everywhere; the width is whatever two columns of the panel leave, and
at 568x320 that is 48. For reference, the tap targets already shipping in this
game are the ability icons at 64x64 and CANCEL at 100x40; Apple asks for 44x44
and Google for 48x48. So 48x62 clears both guidelines by the thinnest possible
margin, on the axis that matters least for a thumb reaching in from the right
edge of a phone held sideways.

If 48 is too narrow, the lever is `drawer.widths` in `presentation.json` — one
number, no code. 118 -> 136 buys 9px per tile. One column instead of two buys
102 x 62 and halves how many tiles are visible.

---

## What was found by driving it

Four faults, all of them invisible to the unit tests and all of them found by
the probe. Three were in code I had just written; one was older.

### 1. The board cancelled the pick it had just made — *in the same tap*

The headline. Selecting a tile collapses the panel, on purpose, so the board is
visible for the tap that follows. Then the scene's own `pointerdown` handler
asked `drawer.owns(x, y)` to decide whether the press belonged to the drawer —
and by then the panel the tap landed in was gone, so the answer was **false**.
The board scored a tap on a tile as a tap on bare ground, and the bare-ground
branch is the cancel. The drawer selected a tower and unselected it within
about four milliseconds.

A game object's `pointerdown` runs before the scene-level one. That ordering is
the whole bug, and nothing about it is visible in a screenshot or a rectangle.
The trace that found it:

    select(withholding)      <- the drawer's own handler
    collapse()               <- the panel closes
    pointer -> ui 726,129  open=false   <- the scene asks, too late
    select(null)             <- the board cancels it

Fixed with `ControlDrawer.claimsPress(x, y)`: `press` records that it took the
press *before* anything it does can move a rectangle, and reading the record
consumes it, so the flag cannot outlive one press even if the pointerup never
arrives.

**This cost four probe runs.** For three of them I was reading it as a sixth
instance of the canvas-pixels-vs-CSS-pixels bug, because the symptom — a press
that lands on nothing — is identical. It was not. The pointer maths was correct
throughout. The trace is now in the probe behind `?arg=diag`.

### 2. The tab sat on top of a tile

The tab was docked to the right edge and vertically centred, whether the panel
was out or not. At **568x320** its rectangle covered the right-hand column's
first two rows. `press` tests the tab before the tiles — it has to, two
rectangles cannot share a point and both be right — so pressing the top-right
tile *closed the drawer* instead of picking Writeoff.

At 844x390 the same overlap was a five-pixel sliver that the tile's centre
happened to miss. It would have shipped.

Fixed: the tab travels with the panel — right edge when closed, immediately
outside the panel's left edge when open — which is also the better read, since
the handle now moves with the thing it handles. `tests/drawer.test.ts` asserts
no tile overlaps the tab at any of four viewports.

### 3. The grid did not scroll

There was no drag handler at all. `scrollToTile` existed, the probe called it,
and every tile "was reachable" — by the harness. At 568x320 the content is 202
tall in a 132-tall grid, so a player could see four of the six towers and had
no gesture that could reach the other two.

This is exactly the mistake the old build menu made, and the probe was about to
repeat it. Fixed: a drag on the open panel scrolls the grid, the pick moved
from press to **release** so a scroll that starts on a tile does not also buy
it, and a scroll indicator appears on the grid's right edge only when there is
something to scroll to. Measured: a drag from the grid's bottom to its top
moves scroll 0 -> 66 of 66, selects nothing, and the tile it lands on then
presses normally.

### 4. The settings row that turns the feature on did nothing

Older, and the worst of the four. `flagHit` — the whole-row target for NEW
CONTROL DRAWER — was pushed into the panel's `hits` list but never added to the
panel's layer, so it kept the default depth of 0 while the modal blocker sits
at `depth - 1`. **The blocker swallowed every press on it.**

The settings probe listed it, measured it as on screen, and counted it among
"7 of 7 reachable", because being in `hits` is what the probe enumerates.
Reachable was never the same claim as pressable.

    pressed the drawer row: flag false -> false   *** THE FLAG DID NOT APPLY ***

Fixed with one `this.layer.add(flagHit)`. `tests/settings.test.ts` now asserts
that every object pushed into `hits` is also in the layer, and the settings
probe presses the row and checks the save flips *and* that the drawer goes live
without a restart:

    pressed the drawer row: flag false -> true   drawer live = true  applied at runtime

### An aside: the padlock rendered every frame and could not be seen

Locked tiles draw a padlock. It was drawn in `COLOR.panelEdge` — 0x3d4a59, from
the bevelled-plate palette this drawer explicitly does not use — on a 0x4a3a2a
tile. It rendered correctly at both ratios and was invisible in every
screenshot. Now `drawer.lockFill` / `drawer.lockEdge` in the data, light on
dark, and a test forbids a Graphics colour in this file coming from the theme.

---

## The flow, driven

At every one of the four combinations, in order, all clean:

- flag defaults **off**; the drawer draws nothing and hits nothing
- flipping it in settings makes the drawer live with no restart
- the tab is on screen and overlaps none of counters / start / gear /
  abilities / cancel / hero row / message row
- pressing the tab opens the panel; the panel overlaps none of those either
- all **6 of 6** tiles press and select, locked ones inert
- dragging scrolls the grid, does not pick, does not close (568x320 only;
  844x390 correctly reports maxScroll 0)
- picking collapses the drawer and the scene learns the pick
- panning the board does not lose the pick
- tapping a pulsing node places the tower **on that node**, deducts exactly its
  cost (400 -> 320 for an 80p Withholding), and clears the pick — **no
  confirmation step**
- an empty node with nothing picked does nothing, and does not open the ring
- both cancels work: re-tapping the tile, and tapping bare ground
- turning the flag off brings the build ring straight back

## What was NOT checked

- Only the two viewports asked for. 390x844 (portrait) is covered by the unit
  tests' rectangles but was not driven.
- Real touch. Every press here is a synthetic mouse event; multi-touch, palm
  rejection and momentum flings are untested.
- The drawer during an active wave under load. Every run above places one tower
  in wave 1.
- Nothing beyond the six active units: no passives, no consumables, no upgrade
  screen. Tapping a placed tower still opens the ledger card unchanged.

## Open, deliberately not built

- **No undo window.** The brief says a confirm on every build is friction on
  the most common action in the game, and to add an undo instead *if
  playtesting shows mis-taps are costly*. Playtesting has not happened.
- **No momentum on the scroll.** The drag stops when the finger stops.
- **The drawer and the ring both exist.** That is the point — they are meant to
  be compared on the same device minutes apart. One of them gets deleted after.
