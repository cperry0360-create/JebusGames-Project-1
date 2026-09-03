# Sign lettering overlays, and a quad disagreement resolved

2026-09-03. Wires `sign_moes.png`, `sign_courjahan.png` and `sign_tavern.png`
as lettering-only overlays on the boards painted into the map plate, deletes
the old board-and-post sprites, and settles which of the two recorded quads for
the tavern board was right.

## The disagreement: mine was wrong on the tavern, and by a lot

The instruction was to use my own quad if I had one and say how far apart they
are, because a disagreement means one of us measured the wrong edge. I had one
for each board, from the v2 re-trace. Compared in plate pixels on the 3840x2160
source:

### Tavern board

| | TL | TR | BR | BL | top edge |
|---|---|---|---|---|---|
| mine (`signs.tavern`) | 2750,323 | 2979,343 | 2965,503 | 2765,467 | **+5.02°** |
| uploaded | 2763,324 | 2965,360 | 2963,491 | 2761,461 | **+10.30°** |
| corner delta | 12.8 | 22.6 | 11.6 | 7.5 | 5.3° apart |

Centres agree to 2.1 px. The angle does not, and **the uploaded one is right.**
Drawn back onto the plate, my top edge leaves the board about a third of the way
along and finishes up in the tavern's blue roof; the uploaded edge runs down the
inside of the top rail for its whole length. My quad is also not a rectangle —
top 229.8 px against bottom 202.9 — which is the tell that it was never a fit to
one flat board.

I took my top edge off the mounting hardware, not the board.

That board has now defeated four separate automatic fits. Three are recorded in
the note it replaces (min-area rectangle at 18°, a four-vertex hull landing on
the chamfer midpoints, a parallelogram dragged to 17° by the mounting rings).
I tried a fourth for this report — per-column extremes over the wood field
alone, with the rounded corners trimmed — and it came back at **+17.98°** top
and **+19.45°** bottom, with sides 28° off vertical. Drawn back it is a
parallelogram running off the crop entirely. The wood field's visible boundary
is the underside of a frame rail that thickens toward the right, so its slope is
not the board's slope, and no amount of trimming fixes that.

Conclusion: this board is not fittable by edge detection. The measurement off
the art is the one to trust, and it is verified the only way that works here —
by compositing the overlay onto the plate and looking at the result.

### Held board

We agree here.

| | top edge angle | width | centre |
|---|---|---|---|
| mine (`signs.held`) | −7.99° | 128.0 | 2680.2, 607.0 |
| uploaded | −6.61° | 138.7 | 2680.1, 618.0 |
| independent fit, wood field only | −5.64° top / −6.65° bottom | 121.3 | 2681.6, 607.2 |

Corners are 9–16 px apart on a 3840 px plate. The uploaded angle sits between my
recorded −8.0 and the fresh fit's −6.15 mean, so it is the better of the three.
Its width is larger than both because it spans the painted frame rather than the
wood inside it — which is correct for a placement rect, and is what the 94%
inset then pulls back off.

I took the uploaded quad for both.

## What changed

The old sprites were **a board with a post**, placed by a `board*` rectangle
measured inside their own canvas so the post could hang below the villager's
hand. That whole mechanism is gone. Both boards are painted into the plate, the
overlays are lettering on a transparent canvas, and the canvas *is* the
placement rectangle.

- **`src/data/map.json`** — `signs` is now the operative data rather than a
  record: `centre` and `size` as fractions of the plate, `rotationDeg`, and
  `inset`. The quad each came from is kept beside it. The separate
  `sign: {x, y, boardWidth}` block is gone; the innkeeper's board is derived
  from `signs.held` now, so there is one place to change.
- **`src/systems/SignPlacement.ts`** (new, Phaser-free) — `placeSign(board,
  worldW, worldH, inset?)` converts fractions to world units and returns the
  rect, the rotation in radians, and the rotated foot for depth sorting.
- **`src/ui/SignBribe.ts`** — no origin games, no board fractions, no fitting.
  `pay()` calls `setTexture` and nothing else.
- **`src/scenes/GameScene.ts`** — builds the tavern overlay too, as a plain
  image with nothing bound to it.
- **`src/data/art.json`** — `prop-sign-tavern` added; the two stale `render`
  entries deleted. They recorded a 300x400 and a 292x400 content box against
  files that are 640x456, and `boardBottom` fractions describing a post that no
  longer exists.
- **`tools/measure_art.py`** — its Signboards pass measured that post. It now
  prints the canvases and says there is nothing to measure, because a silently
  skipped step is how the stale numbers survived.

Rotation is applied by the engine (`setRotation`), never baked, so the texture
is resampled once.

## Measured, by driving

New harness scenario `lettering` reads each sprite out of the live scene and
compares it against `placeSign(map.signs[...])`. All four combinations of
{844x390, 568x320} x {dpr 1, dpr 3}:

```
held  : world 893.4,206.0  size 43.4x30.9  rot  -6.65deg  depth 223.9  src 640x456
tavern: world 954.2,136.4  size 64.4x43.2  rot +10.30deg  depth 163.4  src 640x429
  dx 0.000  dy 0.000  dw 0.000  dh 0.000  drot -0.0000deg     OK
depth order: tavern 163.4 < held 223.9                        OK
bribe: prop-sign-moes -> prop-sign-courjahan                  SWAPPED
bribe moved: NOTHING — position, size, rotation and depth all unchanged
```

Identical at every ratio, which is also the check that this is not a sixth
pointer-space bug: a space error changes with the device ratio.

The bribe is driven through the real path — a click on the board, then a click
on PAY UP in the dialog — not by calling `pay()`. `both.sh` reports screen space
identical at dpr 1 and 3. 573 tests pass; `tsdiff` against `ff8df92` introduces
nothing.

Reproduce:

```sh
sh tools/harness/build.sh
DPR=3 sh tools/harness/run.sh lettering 45 844x390
DPR=1 sh tools/harness/run.sh lettering 45 568x320
```

## Two probe bugs, found and fixed before they were believed

Reported because a probe that lies is worse than no probe.

1. **The art-budget line triple-counted the device ratio.** It multiplied
   `displayHeight * zoom * devicePixelRatio`, but GameScene already multiplies
   every zoom in `display.json` by `deviceScale()` before handing it to the rig,
   so `zoom` is device pixels per world unit. The first run reported the held
   sign at 0.95x — i.e. slightly *under*-provisioned — when it is 2.07x over.
2. **The confirm click missed.** It guessed at `dialog.confirmButton`, which
   does not exist, so the first run reported `NOT SWAPPED` — a product failure
   that was entirely the probe's. The dialog is drawn by the UI camera, so its
   objects carry design-box coordinates and the UI camera's transform is the one
   that applies. Aiming the world transform at them would have been the
   pointer-space mistake again.

## Flagged, not fixed: the held overlay is about 2x oversized

CLAUDE.md rule 7 wants `source height >= world height x maxZoom x dpr`, aimed at
rather than exceeded. Measured:

| | world height | wanted at max zoom (dpr 3) | source | over | worst minification (zoom floor) |
|---|---:|---:|---:|---:|---:|
| held | 30.9 | 220 px | 456 | **2.07x** | 6.33x |
| tavern | 43.2 | 307 px | 429 | **1.40x** | 4.27x |

The tavern is very nearly right. The held pair is about double what the rule
asks, and at the floor of the zoom band that is 6.33x minification with no
mipmaps to soften it. It is lettering with thick strokes rather than a 4px
outline, so it should survive better than the cast did — but it is the direction
the rule warns about, and a 228px re-export would hit the formula. Art is being
handled separately, so this is a note, not a change.

## Weight

`sign_tavern.png` 326 KB, and the two held signs grew from 149/151 KB to
337/380 KB. Assets total 29.7 MB against the 40 MB budget, largest single image
well under the 3 MB cap. No re-encode needed.

## Not checked

- **Whether the innkeeper's board should sort in front of his hand.** It sorts
  behind him by foot Y, which is what the painting shows, but no enemy or hero
  path was driven past either board to test occlusion — neither sits on the lane.
- **The tavern board at min zoom on a real phone.** The minification figures
  above are computed from the zoom band, not read off a device.
- **The 94% inset against every future label.** At today's lettering the words
  clear the frame on all three; the Moe's underline comes closest, and a longer
  future label could touch. `inset` is in the data for that reason.
