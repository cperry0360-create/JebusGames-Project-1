# The peanut chip, and the level select as a road

Two independent fixes, both verified against rendered frames rather than
against computed layout values.

| commit | on | CI |
|---|---|---|
| `2a8e3d2` Two peanuts became one, and the level select became a road | `main` | **green** — [run 140](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34061613717), typecheck, 893 tests and the gated Pages deploy |
| `0f917f8` Write up the peanut chip and the level-select road | `main` | **green** — [run 141](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34061729910) |

---

## 1. The peanut chip was showing two peanuts

### What it was

The brief said the real peanut art was being drawn on top of an old
procedurally-drawn placeholder, and asked for the placeholder's draw call to be
deleted.

**There was no draw call.** The generated cut-out the brief is remembering —
`gen-icon-peanut`, built at boot by `src/systems/PeanutIcon.ts` — was already
gone. The placeholder that was still on screen is painted **into the plate
picture**: `public/assets/ui/hud_peanuts.webp` is a single 232x96 pill with a
plain white OUTLINE peanut drawn into its left end, from before the game had
peanut art. `HudScene.buildCounters` drew the real painted peanut over that
end, so the chip carried both and the white one poked out from behind the
brown.

That is why no amount of reading the code found a second draw: the second
peanut was in the picture.

```
sh tools/decode/run.sh public/assets/ui/hud_peanuts.webp plate.png
```
decodes the plate on its own and shows it.

### What was done

**The plate.** `tools/clear_peanut_plate.py` flattens that end back to the
plate's own field colour. Nothing is typed in: the field is a single uniform
`(17,19,21)` and the plate's field is symmetric about its centre column, so the
field's left edge on a row is the mirror of its right edge — and the right edge
is clean, because the placeholder was only ever at the left. The frame, its
bevel and both chamfered corners are never written to. It reports what it did
as a text picture of the result, so the edit can be read without a browser.

There is no PNG source for this plate — `art-source/` holds only the enemies,
nodes and props — so the input is a decode of the shipped WebP and the output
goes back through `tools/towebp` at q95. Re-encode error against the cleaned
PNG: **PSNR 46.1 dB, alpha bit-exact on every pixel.** The file went from 6858
to 4874 bytes, because a flat field codes smaller than a peanut.

Proof it landed, from `python3 tools/measure_art.py`:

| | before | after |
|---|---|---|
| `hud-peanuts` measured dark field | x66-217 | **x14-217** |

`dark_field` finds the field as the plate's longest run of dark columns, so on
a plate with an icon painted into it the run starts just past that icon. It now
starts at the field's own left edge. There is nothing left in that end.

**Where the icon goes.** It used to be centred on `fieldLeft / 2` — the middle
of the plate's *end*, not the middle of its empty field — at 0.14 of the plate
against the heart's 0.21, which is what pushed it out over the left frame. It
is now placed in `ui.counterIcon` in `art.json`, which is the box the heart
**painted into the lives plate** occupies, measured:

```
Counter icon box (from the heart painted into the lives plate)
  ink x21-74 y24-76 on a 229x96 plate
  -> {'left': 0.2188, 'top': 0.25, 'width': 0.5625, 'height': 0.5521}
```

Fractions of the plate's **height**, which is the one dimension all three
plates share (232x96, 229x96, 232x96). So the drawn peanut and the painted
heart keep the same margins as each other, which is the thing a player actually
reads: two chips side by side.

**Two numbers that were wrong underneath all of it.**

- `hud-peanut`'s `contentWidth`/`contentHeight` were `512x512`. That is the
  canvas; the ink is **498x400**. `fitInBox` and `fitInRect` both *divide* by
  these, so every peanut in the game was drawn 3% small — and, worse, a 1.25:1
  shape was being fitted as though it were square. This is exactly the stale
  measurement rule 7 in CLAUDE.md warns about, on art that had never been
  measured at all. `measure_art.py` has a UI-icons section now, so it can be
  re-derived.
- `hud-peanuts`'s `fieldLeft` was `0.2845`, which is where the *painted peanut*
  stopped. With the peanut gone, the same measurement returns `0.0647` — the
  field's own edge — and the counter would print over the icon. It is authored
  now, at the wave plate's `0.319`, measured on the identical 232x96 frame, so
  all three numbers start in the same place. `measure_art.py` prints a NOTE
  saying not to copy its own output for that one field, and `art.json` carries
  a `_field` note saying why.

**One new helper.** `fitInBox` takes a single number and can only fit a square;
fitting a 1.25:1 peanut into a 0.96:1 slot by one number is what overflowed the
plate. `fitInRect(sprite, key, w, h)` in `systems/Art.ts` is the rectangle fit.

### Every other HUD icon: checked, none stacked

| icon | how it is drawn | stacked? |
|---|---|---|
| lives (heart) | painted into `hud_lives.webp`; nothing drawn over it | no |
| wave (chevrons) | painted into `hud_wave.webp`; nothing drawn over it | no |
| settings gear | drawn, on `ui-btn-icon` — decoded, an **empty** plate | no |
| CANCEL glyph | drawn; there is no cancel art under it | no |
| NUKE | painted into `btn_nuke_up.webp`; heading and hint sit above and below it | no |
| ability cards | carry their own painted frames | no |
| build-ring tiles | tower art on the empty `ui-btn-icon` plate, padlock beside | no |

`HudScene` only ever branches on `name === 'peanuts'`, so the other two counter
plates never had anything drawn over them; the frame confirms it.

One thing worth naming that is **not** this bug: `ability_cory_1.webp` and
`ability_cory_2.webp` are themselves placeholder pictures — a hatched disc
reading `HAY / TEMP` and `SPK / LOCKED`. They stand in *for* art rather than
*under* it, so nothing is stacked, but the files say TEMP and they ship.

### Reproduce the frames

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh screens 150 844x390
python3 tools/harness/shrink.py tools/harness/shots/screens-5-game-844x390.png 900 --crop=6,6,240,50
```

Before: the white outline peanut visible behind the brown one, the brown one
overhanging the pill's left bevel. After: one peanut, inside the pill, with the
heart's own margins.

---

## 2. The level select is a road

### What it was

Four full-size cards at hand-authored `mapPosition`s in `levels.json`, and
every fault in the brief came out of that one decision:

- **(a) four different sizes.** The card *rectangles* were in fact identical —
  288.8x192.5 CSS at 1400x820, all four. What differed was the pictures: each
  card is cropped from its own level plate at its own apparent scale, and with
  the cards scattered diagonally and their captions wrapping to one, two or
  three lines, the four blocks read as four different sizes.
- **(b) the path skipped a level.** The trail was drawn between `LEVELS[i]` and
  `LEVELS[i+1]` — correct — but the POSITIONS were not in level order. Level 4
  sat at x 0.03, the far left, and `levels.json`'s own `_mapPosition4` note
  explains why: two cards can only stack with 284px between centres, the band
  allows 244, so nothing could stack and the only x left was under 173. The
  long run was therefore level 3 → level 4, right to left across the whole
  screen, passing near Head Office on the way.
- **(c)** nothing said which level a card was.
- **(d)** there was no room for a fifth level, never mind twenty.
- **(e)** the cards ran along a diagonal, leaving a large empty triangle.
- **(f)** there is no scrollbar in the code at any viewport (see the open item
  at the end).

### What it is now

One winding road of identical numbered nodes, laid out by **level order**,
carrying every planned level whether it is built or not.

```
road 4310 world units across 1558 visible = 2.77 screens
slots 20  maxScroll 2752
```

| | value | why |
|---|---|---|
| node | 160x107 + 8 frame | 3:2, the aspect the card art is cropped at, so no picture is stretched |
| pitch | 210 | 42 units of road showing between framed neighbours |
| margin | 80 | each end |
| band | y 100–596 | between the title and the scrollbar |
| sway | ±105, step 0.75 | not a neat fraction of a turn, so the road does not repeat over 20 nodes and no two neighbours land level |
| label | 22px, wrapped to 160, 152 reserved | 22 is the floor for a fitted menu screen |
| badge | r21, 24px | top-left of every node |
| scrollbar | y 610, 12 tall, 620 wide | horizontal, absent when the road fits |

**(a) Identical.** Every node is the same box — built, locked and unbuilt
alike. A test asserts it for all 20 slots.

**(b) One unbroken path.** A single `strokePoints` polyline through every node
in order, drawn as a bed, a lighter surface and evenly spaced steps, passing
*behind* the nodes rather than stopping at them. A road that stops at each
place reads as links; one that passes behind reads as a road.

**(c) A numbered badge** on every node, 1 to 20.

**(d) Three states, and 20 slots.**

| state | look |
|---|---|
| cleared | full colour, green frame, a tick |
| open (unplayed) | full colour, amber frame, and the only thing on the screen that moves — a pulsing ring |
| locked | picture darkened to a cool grey under a padlock; or, past level 4, a bare dark plate with the number and a padlock |

Unbuilt slots also carry `COMING SOON`. A padlock alone reads as *you have not
earned this* when the truth is *this does not exist yet*, and a player who
reads the first goes looking for what they missed.

Sixteen invented level names would be inventing the campaign, so there are
none. `art-source/nodes/prop_coming_soon.png` — a painted COMING SOON fence —
exists but is not shipped; see the open items.

**(e) The vertical band.** The wave is centred on the node **block** (node +
the room its name and unlock line need) rather than on the band, because
centring the wave itself pushes the deepest name past the bottom while leaving
the same air at the top — which is the shape the old screen had. Content now
runs design y 104 to 592 of 720, plus the title at 24–84 and BACK at 635–689.

The first pass at this got it wrong in a way worth recording: at a reserve of
118 the deepest node's `Clear 2 runs to unlock` landed **under the scrollbar**.
The reserve is measured off a rendered frame now — `SPORTS COMPLEX AT DUSK`
wraps to three lines and its unlock line to two, 147 units — not counted in
lines.

**(f) The scrollbar.** Horizontal, because that is the axis the road runs on.
Drawn rather than made a control: the map is dragged directly, so the bar
reports position and there is no 8-pixel tap target to miss. It is not drawn at
all when `maxScroll` is 0. Styled as a parchment thumb in a dark rounded track,
against the design box so it is centred under the road at every shape.

**The camera does not move.** CLAUDE.md rule 4 puts camera gestures on
GameScene's `CameraRig` alone, so the map is a `Container` inside the fixed
design-box fit and its `x` is what scrolls. The scroll window is inset by the
safe area — the one thing design-box menus get for free and a scrolling screen
does not, since the road is clamped to what the *camera* sees, which is the
whole canvas, notch included. That was a real fault the harness caught: the
first node's tap target landed 39pt from the left edge of a screen with a 47pt
notch.

The screen opens centred on the level the player is up to. The road is nearly
three screens long; opening at slot one every time would hide their own
position behind a drag they have no reason to expect.

### A level's position is no longer data

`mapPosition` is gone from `levels.json`. **Order is the position**, so the two
cannot disagree again — which is the root cause of (b), not a symptom of it.
`plannedLevels: 20` is new and says how long the road is.

The geometry lives in `src/systems/WorldRoad.ts`, Phaser-free, and **the tests
measure that module rather than a copy of it.** This matters here specifically:
the last two level briefs each shipped a world map whose content overlapped,
and both times the test that should have caught it had re-derived the scene's
layout from constants copied out of the scene. `level4.test.ts`'s own comment
says so. There is one copy now, and the overlap check covers all 20 slots
rather than the four that are built.

### The harness had to learn that a map can scroll

Two changes to `tools/harness/`:

1. `screens` now marks the children of a scene's `road` container and audits
   only those that are **wholly** on screen — not clipped, because a
   half-visible tap target measures under 44pt and reads as SMALL. Content
   running past the edge of a scrolling map is the feature; reporting it as cut
   off would report the feature. Without this the map reported 26 OFF faults
   for a road doing exactly what a road is for. Each run says how many objects
   it skipped.
2. A new `worldmap` scenario. **Establish that the thing you are measuring can
   move before you report that it did not** — a scrolling container that never
   scrolled would make the audit above go quiet and pass.

```
$ sh tools/harness/run.sh worldmap 90 844x390
road 4310 world units across 1558 visible = 2.77 screens
slots 20  maxScroll 2752  (0 would mean the bar must not be drawn)
level 1 sits at {"x":87,"y":145}
after a drag of 506px, level 1 sits at {"x":-234,"y":145}  *** MOVED ***
scroll is now 592 of 2752
dragged back: level 1 at {"x":87,"y":145}  scroll 0
a 40px LEFT DRAG starting and ending on level 1: Loadout running = false  (correct)
a TAP on level 1: Loadout running = true  (correct)
```

The drag test is deliberately **short and leftward**. A long drag ends where
the card *used to be* — the card travels with the finger — so it lands on empty
parchment and proves nothing; a rightward drag at scroll 0 is clamped and moves
the map not at all. The first version of this scenario made both mistakes and
reported a tap failure that was the scenario's own fault, not the game's.

---

## Verification

`sh tools/harness/run.sh screens 150 <vp>`, reading the picture as well as the
numbers.

| viewport | world map | whole sweep |
|---|---|---|
| 844x390 | 0 faults | 1 — the Title version stamp, pre-existing |
| 667x375 | 0 faults | 1 — the same |
| 1400x820 | 0 faults | **0** |
| 844x390, `INSETS=0,47,21,47` | 0 faults | 1 — the same |
| 375x667 | portrait gated, gate covers 500x697 of a 500x697 window | — |
| 390x844 | portrait gated, gate covers 500x890 of a 500x890 window | — |

The one recurring fault is `SMALL Title [title:version-stamp (hidden dev door,
not a tap target)]`, which is on `main` before this change and whose own name
says it is not a tap target.

The notch row was red before the safe-area inset went in
(`NOTCH WorldMap Rectangle @ 39,107 86x59`) and is green after.

Other gates:

- `npm test` — **893 pass, 0 fail** (886 before; 7 new in `tests/worldmap.test.ts`).
- `sh tools/tsdiff.sh db84211` — four new lines, all of the
  `Property 'cameras' does not exist on type 'WorldMapScene'` shape, which is
  the Phaser cascade this tool exists to cancel: `cameras`, `input`, `time` and
  `tweens` are new *to this class*, not new errors. No `TS2307` warning, so
  nothing is locally unchecked.
- `sh tools/harness/run.sh realboot 120 844x390` — Title, Loadout, Game and Hud
  all build with nothing forced; 20 objects drawn, map plate present, no
  required art missing.

### What was NOT checked

- **A real device.** Everything here is headless Chromium at `--force-device-scale-factor=3`.
- **The scrollbar's hidden state on screen.** At 20 levels the road is always
  longer than the viewport, so `maxScroll` is never 0 in a real frame. The
  hidden branch is covered by a unit test (`maxScroll(roadWidth()) === 0`) and
  by reading `drawBar`, not by a picture.
- **Touch**, as opposed to mouse. The harness drives Phaser through
  `MouseEvent`; pinch and two-finger gestures are not exercised on this screen
  (there are none to exercise — the camera does not move).
- **The other three cleared/open state combinations on a rendered frame.** The
  save in the harness has `runsCleared` 0, so the frames show one open node and
  the rest locked. `cleared` — the green frame and tick — is covered by unit
  tests over `nodeState`, not by a picture.
- **`tools/harness/run.sh towerpanel`** could not be used to check the tower
  panel's icons: it throws `Cannot read properties of undefined (reading
  'hitAreas')` because its pad click does not open the build menu. Confirmed
  identical on `db84211` in a scratch worktree, so it is **pre-existing** and
  not caused by this change. The build ring's icons were checked through the
  `ui` scenario instead.

---

## Where this leaves the repository

**In flight:** nothing. `2a8e3d2` is on `main`.

**Opened by this change:**

- **The scrollbar in the brief could not be reproduced.** The brief describes
  "a large black vertical pill on the left of a map that runs horizontally".
  There is no scrollbar in `WorldMapScene` on `main` before this change, no
  scrollbar drawn by any menu scene, and `html`/`body` are `overflow: hidden`
  so the document cannot produce one either. It did not appear at 844x390,
  667x375 or 1400x820, with or without a notch. The most likely explanation is
  a scroll indicator belonging to whatever is *hosting* the page — a browser
  chrome overlay or an embedding iframe — rather than to the game. The fix
  asked for has been built regardless: the axis is horizontal, it hides when
  the content fits, and it is styled rather than a default control. **If the
  black pill is still there after this deploys, it is not the game's and the
  next step is to find out what it belongs to.**
- **`art-source/nodes/` is not shipped.** It holds `prop_coming_soon.png` — a
  painted COMING SOON fence — plus `node_level`, `node_elite`, `node_merchant`,
  `node_mystery`, `node_rest` and a `map_world.webp`. The unbuilt slots draw a
  flat plate today. The fence would be a straight improvement and those node
  icons are what a Phase 2 node map wants; neither is in this pass, because
  shipping new art is not what was asked for.
- **`public/assets/ui/icon_sell.webp` is an orphan.** `art.json` does not name
  it and a test asserts `art.files['icon-sell']` is undefined, so the file
  ships and nothing can draw it.
- **`ability_cory_1.webp` and `ability_cory_2.webp` say TEMP** on their face.
  So do the optional icons `realboot` reports absent: `ability-bailey-1`,
  `ability-eli-1`, `ability-eli-2`.
- **`towerpanel` is broken in the harness**, on `main`, as above. Its pad click
  no longer opens the build menu — probably the press-and-hold problem the
  harness README already records for `build()`.

**Carried forward from `2026-09-06-soak-support-modeling.md`:** nothing in that
report's open list is touched here.
