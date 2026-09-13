# The HUD, shrunk to its corners — and why it was sitting on build pads

| commit | what | CI |
|---|---|---|
| `e361efe` | The shrink, the camera fix, the guard test, the difficulty label | [run 345](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34779617034) green |
| `9994199` | This report | [run 345](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34779617034) green |
| *this commit* | Closing this table on run 345 | it edits this table and nothing else |
`e361efe`, `9332930` and `9994199` were pushed together, so only the head got a run of its own; run 345 checked the tree containing all three. Green on changes, typecheck and test; deploy is skipped on a branch.


---

## What presentation.json's `hud` block actually says

The brief says the block's note records that the current sizes were measured off
rendered frames at a phone viewport. **It is half right, and the half that is
wrong matters**, so here is what is actually in there.

**There is no single `_note` on `hud`.** The reasoning is spread across six
per-field notes, and only some of them are measurements:

| field | what its note actually says |
|---|---|
| `layout._startWidth` | **A string-length argument, not a frame.** "With the name and the seconds gone the longest string it ever has to hold is `START WAVE 13`, so the plate is sized to that. 44 stays as the height because it is the minimum tap target and this is a button." |
| `_bossBarWidth` | **A measurement, and a correction.** 560 sat unread while `drawBossBar` took the message row's width — "563px on an 844px screen — 67% of the width for one wave in thirteen". |
| `_bossBarTop` | A deletion: a second opinion about a y the layout already owned. |
| `heroChip._note` | A design argument: the hero's health was drawn in two places. |
| `heroChip._size` | **The tap floor, reasoned not measured**: "60 clears the 44pt minimum with room to spare… a mis-tap on this walks the hero into a fireball." |
| `heroChip._gap` | **The only one measured at a phone viewport**: "Checked at 375x667 by the harness, which is where the row is tightest." |
| `cancel._note` | Playtest feedback: the grey wash read as disabled chrome. |

**So the load-bearing reasoning is about TAP TARGETS and STRING LENGTHS, not
about how big anything looked.** Every number that is defended is defended
because something is pressed (44pt) or because a label has to fit.

**Does that give a reason the carve-out does not cover?** No — and I checked
each one rather than assuming. The carve-out says readouts may shrink freely and
tappables keep 44x44, which is exactly the axis the existing notes reason along.
Nothing in the block argues that the counter plates need their size for
legibility, for the art, or for anything a rendered frame showed. The one note
that IS a frame measurement, `heroChip._gap`, is about a control and is
untouched.

**One thing the block did NOT say, and it turned out to be the constraint.** The
stack's total height matters as much as its width: the second row is placed
under whichever top-corner group is taller, and the build drawer's panel starts
under that. A first attempt at 26px plates came out at 56 tall against the 44 it
replaced and cost the drawer twelve pixels of grid on every screen.
`tests/drawer.test.ts`'s recorded heights caught it. The shipped 20+4+20 is
exactly 44 for that reason, and the reason is now written into
`layout._readoutHeight`.

---

## Before and after

| | before | after |
|---|---|---|
| counters | three plates in a ROW, `plateHeight` 44, number 22px, ~333 CSS px wide | **two plates STACKED**, `readoutHeight` 20 + `readoutGap` 4, number 15px, **48 CSS px wide** |
| the wave counter | a third plate in that row | **gone** — read off the control in the other corner |
| wave control | `startWidth` 168 / min 116, label 16px, `START WAVE 13` | **`startWidth` 132 / min 104**, label 14px, `▶ WAVE 13` |
| message row | **full width** less margins, 22 tall | **`messageWidth` 300, centred**, 22 tall |
| settings gear | 40 drawn, 44 tapped via a hardcoded `+ 4` | 40 drawn, 44 tapped via **`cornerButtonTapPad`** |
| difficulty label | 15px dim text over the map, all run | **gone** |

The wave control lost the word START rather than the number. What that word was
doing is already done twice over — by the plate's own enabled state, which greys
out the moment a wave is running, and by the play glyph — and dropping it is
what let the plate come down 36px without anything else getting smaller.

---

## The pad overlap: which of the four candidates it was

**All four descriptions in the brief are true of this game, and only one of them
is the cause.** Taking them in turn:

1. **"the map viewport is not inset below the HUD"** — TRUE, and deliberate.
2. **"the HUD scene draws over the full canvas with no reserved band"** — TRUE,
   same decision. The header of `src/systems/HudLayout.ts` records that reserved
   bands were **tried and reverted**: "on a 390px-tall phone the two strips ate
   a third of the screen, and thick black bars look worse than the collisions
   they prevented."
3. **"pads sit near the top edge of the plate"** — TRUE on most levels.
4. **"the camera zoom floor lets the plate fill the entire screen"** — TRUE, and
   **this is the one**, though not quite for the reason the wording suggests.

**THE CAMERA WAS PINNED.** `CameraMath.centerRange` returned a zero-width range
whenever the view covered the world on an axis:

```ts
if (half * 2 >= worldSize) return { min: worldSize / 2, max: worldSize / 2 }
```

and `display.json` set `boundsMarginPx: 0`. The run opens at cover zoom, which on
a 16:9 plate in a 16:9 window covers the world on **both** axes — so the camera
could not move at all. A build pad painted near the top or bottom edge of a plate
was therefore rendered under a HUD band with **no camera position available that
took it out**. Not a pad that is awkward to tap: a pad that is impossible to tap.

**And nothing in the repository was in a position to notice.** The HUD is screen
space and the pads are world space; `tests/hudlayout.test.ts` proves the HUD's
rectangles are disjoint **from each other**, which on a full-bleed map says
nothing at all about what is underneath them. `tools/harness/run.sh padhud` is
new and is the first thing that compares the two.

### Measured, at the opening camera

Collisions between a HUD rectangle and a pad's 44pt tap rect, worst level:

| viewport | before | after the shrink | pads that cannot be freed |
|---|---|---|---|
| 667x375 | **12** (level 6) | 8 | **0** |
| 844x390 | **9** (level 6) | 7 | **0** |
| 1280x720 | **6** (level 6) | 3 | **0** |

Both edges were affected on every measurement: `counters`, `startButton`,
`messageRow` and `settings` at the top, `abilities`, `heroChip` and `cancel` at
the bottom.

### The fix

The rig takes the **live HUD band plus half a build pad** as its vertical bounds
margin, converted to world units at each frame's zoom
(`my = hudBand / z`). `hudBandHeight` measures the band off the layout's own
rectangles rather than summing config, because on a narrow screen the ability row
shrinks and CANCEL does not. It is refreshed on every resize, because a rotation
or a notch moves it.

The `padClearancePx: 24` is the pad's own half-height, not a fudge: clearing a
band means moving the pad's **edge** past it. Without it, level 8's pad 16 —
world y=682 against a 720 plate — came **four world units** short at 667x375 with
a notch, the tightest viewport the game supports.

### What is NOT fixed, and cannot be

**Pads still sit under the HUD at rest**, and the arithmetic says they must. The
map is full-bleed and the run opens at cover zoom, so the board exactly fills the
screen; the two bands come to about 100 CSS px of a 390px-tall phone. The only
ways to a literal zero are a letterboxed map — tried, reverted, with the reason
written down — or a map that does not fill the screen. **What changed is that
every one of them can now be panned clear**, which is the guarantee that decides
whether a pad is buildable, and it is what `tests/hudpads.test.ts` asserts.

---

## The guard test

`tests/hudpads.test.ts`, four tests, six viewports, with and without a notch,
every level. **It was vacuous twice before it bit**, and both reasons are written
into it:

1. **`buildSpots` are `[x, y]` pairs, not `{x, y}`.** Reading `.y` off one gives
   `undefined`, which compares false against every bound, skips every sample and
   passes. Found by mutating `hudBandHeight` to `return 0` and watching the test
   stay green.
2. **The band is screen pixels where `centerRange` wants world units.** 82 screen
   pixels is 157 world units at 667x375, and the difference is the whole margin.

Four mutations checked and each produced the failure it should: seeding the rig's
band from nothing, restoring the full-width message row, un-shrinking the
readouts, and removing `CameraRig.lookAt`.

**Portrait is excluded from the tap-floor and reachability checks, and that is an
answer rather than a gap.** The game is landscape-only and a portrait viewport
gets a full-screen rotate overlay with the scene paused behind it. The layout
still computes — at 375x667 the ability row comes out 24px tall — but asserting
44pt against a screen the player is being told to turn over measures something
nobody can touch.

---

## Verified from rendered frames

Everything in this section came from `tools/harness/`, which is the only thing in
this repository that looks at a pixel. **None of it is from the nine scenarios
that assert nothing** (`ui`, `muzzle`, `buildall`, `rockets`, `retreat`,
`regressions`, `poor`, `typegame`, `meteor`).

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh padhud 500 667x375     # and 844x390, and 1280x720
sh tools/harness/run.sh screens 200 844x390
INSETS=0,47,21,47 sh tools/harness/run.sh screens 200 844x390
```

- **Every level, three viewports: 0 pads that cannot be freed from the HUD.**
- **The new HUD layout read off a frame** at 844x390: two small stacked readouts
  in the top-left, `▶ WAVE 1` and the gear in the top-right, and no ghost text
  anywhere on the map.
- **`screens`: one fault, pre-existing and unrelated** — the Title screen's
  version stamp, which the harness itself annotates as "hidden dev door, not a
  tap target". The identical line comes out of a worktree at `cff5a46`.
- Portrait is reported as gated, which is the correct answer rather than a
  skipped check.

`npm run test`: 1092 passing. `sh tools/tsdiff.sh c6e75fb`: 213/213, zero
introduced, and no new-file warning.

---

## Where this leaves the repository

**DONE.** The HUD is in its corners, no pad on any level at any landscape
viewport is unreachable, and a test fails if either regresses.

**OPEN:**

1. **At-rest overlap is down, not gone** — 8 / 7 / 3 worst-case at the three
   viewports. Reducing it further means a decision about full-bleed that is
   above this pass's pay grade: a letterboxed map was tried and reverted once
   already, and the other lever is opening the run zoomed in enough that the
   plate's edges are off screen, which defeats `openingView`'s documented
   purpose of showing the whole board before the first wave.
2. **The `screens` version-stamp fault** is pre-existing at both phone sizes.
   Either the harness should stop counting a control it already annotates as not
   a tap target, or the stamp should be 44pt.
3. **`art.json` still carries a `wave` counter plate that nothing draws.** It is
   left in the manifest deliberately — not drawing it and deleting it are
   different decisions — but it is dead weight until one is taken.
