# The v2 map plate, re-traced from scratch — and edge docking

2026-09-03. Two pieces of work in the order asked for: the map swap first,
then the arch occluder redone against the new painting, then the docking rule.

Reproduce:

    git show d7b42bb:public/assets/map/map_level1_v2.png > /tmp/v2.png
    python3 tools/trace_map.py --plate /tmp/v2.png --overlay /tmp/overlay.png
    cd tools/harness && sh build.sh
    DPR=3 sh run.sh lane 220 568x320    # a wave driven against the painted road
    DPR=3 sh run.sh arch 200 844x390    # the near pier, pixel-diffed
    DPR=3 sh run.sh drawer 140 844x390  # the docked handle

---

## First, three things about state

**The arch occluder was already done and shipped** in f77d27c, against the old
plate — that work is not stopped, it is redone here against the new one.

**The PNG was already converted and deleted** in 712ab1c. It had turned CI red
on its own commit (the 3MB deploy guard, 553 of 554), before any of this
landed. The source PNG lives in git history and the tracer reads it from there.

**Nothing was carried forward.** Every number in `map.json` is new.

## The plate: 1.30MB, and that is 0.1MB over your line

The previous plate shipped at **q90** — `map_level1.webp` was byte-identical to
this tool's `map_level1_q90.webp`, 1,842,204 bytes. So q90 is the like-for-like
setting, and the ladder for the new art is:

| | bytes | PSNR | worst pixel |
|---|---|---|---|
| webp q95 | 1.86MB | 44.1 dB | 22/255 |
| **webp q90 — shipped** | **1.30MB** | **41.8 dB** | 24/255 |
| webp q85 | 0.98MB | 40.1 dB | 29/255 |
| jpeg q95 | 2.40MB | 44.9 dB | 23/255 |

**Shipped: q90 at 1,302,944 bytes.** That is above the ~1.2MB you named, and
saying so is the point of this paragraph. It is 29% smaller than the plate it
replaces and it is the same quality setting, so the deploy went *down*. If 1.2
is a hard line, **q85 at 0.98MB** is the drop-in: 1.7 dB worse, and the plate is
magnified up to 2.37x so that is not free. One word in
`tools/reencode/out` and a copy.

The old `map_level1.webp` is deleted — everything under `public/` ships.

## The re-trace

The tracer needed two fixes before it could be believed, and both were faults
in the tool rather than in the art:

**Its distances were in the wrong unit.** The pad clearances were mask-pixel
constants with a note that one mask pixel was "about 3.06 canvas pixels" — true
of the first plate and of nothing else. This plate is 3840x2160 against
1672x941, so the same numbers would have meant a pad 20 canvas pixels off the
road instead of 46, which is a pad in the verge. They are canvas pixels now,
converted at the point of use.

**The painting has texture and the classifier saw it.** The road is scattered
with painted pebbles and the grass with tufts, both dark enough to fall outside
either colour band — so the first mask was a road full of holes and a field full
of dots. That is not cosmetic: the road's width is measured as the clearance
from the nearest *non*-road pixel, so a pebble in the middle of the road made
the road measure **32 canvas pixels wide when it is 80**, and a tuft in the
field made open grass look like a thicket — **655 candidate pad positions
before de-speckling, 23,347 after**, and 6 pads found instead of 7.

The colour bands were re-derived from a histogram of the new art. Two clusters
carry 64% of it: grass at r-g -40..-1 with b under 32, road at r-g 60..79 with
b 32..95. The old bands do not transfer — this road is much warmer (r-g ~65
against ~30) and this grass is far darker in shadow (luma 18 against a floor of
80), so the old grass rule would have called half the field blocked.

### What came out

| | old plate | new plate |
|---|---|---|
| roadWidth | 38 | **80** (median half-width doubled; widest point 120) |
| waypoints | 37 | 43 |
| build pads | 7 | 7 |
| heroStart | 521,524 | **642,244** |
| arch mouth / clear | 50 / 130 | **60 / 150** |
| gate fade | 1235→1250 (through a painted gap) | **1205→1235** (no gap; the gate is shut) |
| scatter minGap | 130 | **210** |

`roadWidth` is measured, not assumed: the *median* clearance along the traced
lane, doubled. The median rather than the maximum because the widest point is
one bend and the lane has to fit the narrowest stretch.

## The two blank sign quads

Both boards are unpainted and stay that way. Corners as fractions of the
3840x2160 art, clockwise from top-left, with the top edge's angle:

**Hanging tavern sign** — rotation **+5.02°**

```
TL 0.71617, 0.14931      TR 0.77578, 0.15861
BL 0.72008, 0.21639      BR 0.77211, 0.23264
```

**The board the innkeeper holds** — rotation **−8.00°**

```
TL 0.67923, 0.26250      TR 0.71224, 0.25426
BL 0.68372, 0.30778      BR 0.71673, 0.29953
```

The innkeeper himself is at canvas **947, 268** (his feet).

**How they were arrived at, because the two were not arrived at the same way.**
The held board was fitted automatically. The hanging one defeated three
automatic fits, each differently: a min-area *rectangle* tilted 18° to swallow a
shape that is sheared rather than rotated; a convex hull reduced to four
vertices put its corners on the *middles* of the chamfered edges; and a
parallelogram fitted from the dominant edge directions came out at 17° because
the mounting rings and corner ornaments contribute the longest diagonals on the
hull. Its four corners were read off a 6x gridded crop instead. Both quads were
then drawn back onto the art and checked — that overlay is what makes them
trustworthy, not the method.

## Driving it

A full wave at **dpr 1 and dpr 3, at 844x390 and 568x320**. The road mask is
rebuilt *in the browser from the texture the game loaded*, so this asks the
question of the plate actually in memory rather than of the tracer's own
numbers:

```
pads clear of the road: 7 of 7        pads reachable: 7 of 7
lane samples: ~1300   off the painted road: 0
```

Identical at all four. Every pad was panned to and pressed, and every one opened
its build ring.

## The arch, redone

Same method as before, new numbers: the near pier lifted out of the plate and
clipped to a traced outline, the far pier and span left in the plate. Verified
by the pixel diff over the traced silhouette, with the far pier as the control:

```
near pier: 0 of 10,943 stone pixels changed (0.00%)
far pier:  4,014 of 14,755 changed (27.2%)   <- the control: enemies were there
```

One thing changed in kind. The pier's depth used to be its painted base, which
worked only because the old road was 38px wide. At 80 the near half of the lane
reaches *below* the stone, so the depth is now the lane's lowest point across
the pier's span plus half the road's width — **448** against a painted base of
about 413.

## Docking

**The gap was not a pointer-space error, and that was worth establishing
first.** It measured **6px, identical at devicePixelRatio 1 and at 3**, at both
viewports. Every one of the six canvas-versus-CSS bugs in this codebase scaled
with the ratio; this one did not. It was arithmetic in the right space against
the wrong rectangle: `panelArea` insets six pixels on each side for chrome that
floats *inside* it, and the drawer's whole claim is to be attached to the edge.
(You measured 11; the layout gap is 6 and the 3px outline stroke straddling the
edge accounts for the rest of what is visible.)

Now, asserted exactly — not within a pixel, because a gap is either zero or
visible — at four viewports, open and closed:

```
tab 34x88 at 810,164 closed   ->   810 + 34 = 844 = viewport width
```

The rule is one module, `src/ui/EdgeDock.ts`: **nothing anchored to a screen
edge carries a gap, a rounded corner, or an outline along that edge.** The
outline is drawn as an open path along the three free sides, so there is no
stroke sitting half on and half off the display.

Applied to:

- **the handle** — docked, left corners rounded only, and wearing the drawer's
  own slab, outline weight and radius instead of its old orange plate. The
  chevron went light, because a near-black one is invisible on the dark slab.
- **the open panel** — its right side *is* the screen's right side.
- **CANCEL** — flush, and drawn on the same slab. The painted button plate has
  four rounded corners baked in and cannot be squared off, so CANCEL is a drawn
  slab now; the label and hit rectangle are unchanged. The gear above it keeps
  its margin: it is a floating control, not a docked one.

## What this cost elsewhere, and one thing worth a decision

Six tests failed on the swap. Five were consequences to fix and one is a
judgement:

- the hero started **standing in the road** — moved to open grass at 642,244
- the lane's steepest westward leg went from 0.20 to **0.28** of its length, so
  the facing dead zone went 0.26 → 0.34, or units flip round mid-hill
- the scatter put **20 props** on a board dressed for 10–14 — minGap 130 → 210
- the exit fade was 53.5px of lane against a test wanting 8–40; the gate is
  **shut** in this plate with no painted gap, so it is 33px ending where the
  road does
- a test named the old plate's filename

**And the towers are now the wrong size for the road.** The rule is that the
median tower base should be about 1.2x the lane it guards. It was 1.92x when
the road was 38 (flagged at the last swap, bound widened rather than shrinking
every tower inside a re-trace). The road is 80 now, so the same unchanged 73px
towers are **0.91x** — the error has swung the other way and the towers read
*small* beside this lane. Restoring 1.2x means growing every tower by about
30%. That is the same art decision seen from the other side and I have not made
it here; the bound is widened downwards and the ratio prints on every run.
**Two swings in two map changes is the finding: this ratio is not stable across
art, and the towers want re-scaling to whatever the road settles at.**

## What was NOT checked

- Only 844x390 and 568x320 were driven; 1280x720 and 390x844 are covered by the
  layout tests' rectangles only.
- Real touch — every press here is a synthetic mouse event.
- The sign quads are verified against the art, not against a text overlay,
  which does not exist yet.
- The gate reads oddly as a fragment with no wall. Traced as it stands, as you
  said.
- Balance. The lane is longer and wider; wave pacing and tower coverage were
  not re-tuned and almost certainly want it.
