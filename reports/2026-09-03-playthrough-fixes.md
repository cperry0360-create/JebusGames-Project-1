# Seven fixes from the drawer playthrough — measured

2026-09-03. Every number below comes from `tools/harness`, driven end to end.
Reproduce with:

    cd tools/harness && sh build.sh
    DPR=3 sh run.sh arch 200 844x390        # the archway, pixel diff
    DPR=1 sh run.sh towerring 260 844x390   # 48 ring states, SELL vs UPGRADE
    DPR=3 sh run.sh drawer 130 568x320      # the open-select-close cycle
    DPR=1 sh run.sh restructure 120 844x390 # the cooldown readout
    sh both.sh <scenario> <secs> <WxH>      # the same at dpr 1 and 3, diffed

---

## 1. The arch — one pillar was being cut in half, not left uncovered

**The report** was that an enemy walking out draws on top of the right-hand
pillar's stones. **The cause was the opposite of a missing occluder.**

I measured the plate with the lane drawn on it at 4x and 14x
(`sh run.sh archplate 40 844x390`, and `... near` / `... left` for the pillars).
The road runs left to right and *descends*, so the gateway's two piers are not
side by side across it:

| | painted base | road at that x (far / centre / near) | side |
|---|---|---|---|
| left pier, x 15–50 | y ≈ 410 | 357 / 377 / 396 | **near** — below the road |
| right pier, x 88–118 | y ≈ 388 | 375 / 393 / 411 | **far** — above the road |

So the far pier and the span are behind everything on the road and need no
occluder at all; the map plate already draws them at the bottom of the depth
order.

They had one: a **20×112 rectangle at x 98–118**. The painted column is x
88–118, so the rectangle cut it in half down its length — stones left of the
cut stayed at plate depth, stones right of it jumped to depth 398. An enemy
walking out drew over one half of the pier and under the other. That is the
split in the recording.

**Note the labels are the other way round from the brief.** The pillar being
drawn over is the *far* one, and drawing over it is correct. What was wrong was
that half of it had been lifted into the foreground.

**The fix.** Only the near pier is lifted, and it is clipped to a **traced
outline** in `map.json` rather than a box — a box around it contains road, and
this piece is drawn in *front* of units, so a box would paint a copy of the
road over anyone standing on it.

**The verification is a pixel diff, not a look.** Freeze the camera, photograph
the stone with nothing behind it, walk a wave through, photograph it again, and
count the pixels *inside the traced silhouette* that changed colour. The far
pier is measured too, as the probe's own control: it is *expected* to change,
and a run where neither changes would prove only that no enemy was there.

| | near pier (must not change) | far pier (control, must change) |
|---|---|---|
| 844×390 dpr 1 | **0 of 5,650** (0.00%) | 2,674 of 6,660 (40.2%) |
| 844×390 dpr 3 | **0 of 50,857** (0.00%) | 23,805 of 59,362 (40.1%) |
| 568×320 dpr 1 | **0 of 5,650** (0.00%) | 2,802 of 6,615 (42.4%) |
| 568×320 dpr 3 | **7 of 50,843** (0.01%) | 1,295 of 59,496 (2.2%) |

Before the fix the far pier's rectangle changed by **25%** as an enemy passed.

## 2. Move is off the tower panel

Deleted from the ring, and `beginMove` with it — with the ring option gone it
had no caller but the harness, and a method that exists for a probe is a method
whose behaviour nobody checks.

**The DAD MODE gate is back on `armRestructure`.** It was removed once, on the
reasoning that Last Stand fires at 25% health so a player who never dropped
that low never learned towers could move — a real problem, answered at the time
by a free MOVE button on every tower, always available. That answer made the
reward worthless: Last Stand handed the player something already in their
pocket. Measured: `armRestructure outside DAD MODE: mode=normal ... refused`.

The discoverability problem it was solving is real and is still unsolved. It
needs its own answer, not a permanent giveaway.

## 3 & 4. Nothing pulses behind a shut drawer, and CANCEL is off the board

Closing the drawer now cancels the pick. **A pick no longer collapses the
panel** — a collapse *is* a close, and a close that keeps the selection is
exactly the orphaned state being fixed. The panel stays out while a tile is
picked; it holds the right-hand 118–152px and the board pans under it.

CANCEL moved from the bottom-right corner (which is the board) to the
right-hand end of the second HUD row, directly under the gear. Its visibility is
now **computed** from what there is to cancel — an armed ability, a
Restructure, or a drawer pick — rather than set by hand at each entry and exit,
which is the pattern that once left it on the glass for a whole encounter.

Driven at all four combinations, identical at dpr 1 and dpr 3:

```
picked withholding   drawer still open = true   CANCEL on glass = true
with the drawer open: 7 nodes pulsing, ring layer drawn = true
after closing the drawer: open = false   selected = null   scene pick = null
                          nodes pulsing = 0   CANCEL on glass = false
```

**Layout cost, stated plainly.** CANCEL is 40 tall and the row it joined is 22,
so `panelArea` starts 18px lower on every screen. The drawer's grid at 844×390
goes 202 → 184 against 198 of content, so the wide viewport now scrolls by
**14px** where it used to fit exactly. The drag and the scroll indicator both
exist and every tile is still reachable, but that is a real regression and the
levers are `drawer.pad`, `drawer.tileGap`, `drawer.widths`. I have not spent
one, because 62px tiles have not been judged on a thumb yet.

| | panel | grid | maxScroll (was) |
|---|---|---|---|
| 844×390 | 152×200 | 136×184 | **14** (0) |
| 568×320 | 118×130 | 102×114 | **84** (66) |

The ability row gets back the 224px it used to reserve for CANCEL on both ends.

## 5. Sell

**A fixed slot.** "SELL goes last" was not enough and could not be: the ring's
geometry is a function of how many buttons are on it, so the arc of two at tier
1 sits at a different radius from the arc of three at the branch — and the
position a thumb learned as UPGRADE is one SELL can arrive at. The tower panel
reserves **three slots** now and each option names its index: 0 is always
upgrade or the first branch, 1 is the second branch and is empty the rest of
the time, 2 is always SELL.

Driven over all 48 states — six towers × {tier 1, tier 2, branch, each
specialization} — at 844×390 with the camera on the tower:

```
states read: 48   SELL rects 48   UPGRADE rects 24   branches reached 12
SELL/UPGRADE rectangle clashes across all states: 0
closest a SELL ever gets to an UPGRADE: 55.6px
```

UPGRADE at 287,155 and SELL at 392,155 in **every one of the 48**.

**A worded confirmation, on SELL only.**

```
["Sell Slingshot for 48 peanuts?",
 "The pad goes back to empty. This cannot be undone.",
 "Sell", "Cancel"]
after the upgrade confirm: dialog up = false  tower upgrading = true
```

**The peanut, and a finding.** There is no peanut icon in the pack.
`hud-peanuts` is not an icon — it is the whole 233×96 counter *plate*, a black
field with a bevelled border and a peanut painted into its left end. Pointing
the button at it drew that plate squashed into a 40px square: a dark blob.

So the peanut is cut out of the plate at boot (`src/systems/PeanutIcon.ts`).
The background is **flood-filled from the border**, not colour-keyed: the
peanut's own outline is as dark as the plate behind it, and a colour key eats
it. Measured: a 54×72 cut-out, **41.3% opaque** — a shape in a box rather than
a filled rectangle.

**A purpose-drawn peanut icon would be better art than this.** That file should
be deleted the day one arrives.

## 6. The instruction line is given back

"Grinder restructured. Back in 16s." held the row for the whole cooldown with a
number that was wrong after the first second. The line is now a confirmation
and the cooldown is a status where it can tick — the Restructure slot stays on
the glass while it recharges, even once DAD MODE has ended.

```
after a completed move: spot 3 -> 0
  the instruction line says: "Slingshot moved."
  the cooldown has 21.6s left
  with DAD MODE over and 20.9s left: slot icon visible = true  timer reads "21"
  two seconds later the timer reads "18"
```

## 7. The node highlight rings

Were `0xffd23f` — flat saturated yellow — at up to 0.20 fill and a
**full-strength 3px rim**, drawn at `GROUND_DEPTH + 6`, which is *above* the pad
art at +5. A colour the painted grass does not contain, laid over the map.

Now warm ochre from the data, at a fraction of the contrast, drawn at
`GROUND_DEPTH + 2` — under the pad art, on the ground:

| | was | now |
|---|---|---|
| fill | 0xffd23f, 0.10–0.20 | 0xd9a441, 0.06–0.14 |
| rim | 0xffd23f, 3px, 0.65–1.00 | 0xc4863a, 2px, 0.28–0.55 |
| depth | GROUND_DEPTH + 6 (over the pad) | GROUND_DEPTH + 2 (under it) |

The squash already matched the ground plane and still does. If they still read
as decals the lever is those four numbers in `presentation.json`, not the shape.

---

## Verification summary

- 554 unit tests pass; `tsdiff` clean of everything but the known
  no-`node_modules` cascade on the one new file.
- `both.sh` reports **screen space identical at dpr 1 and dpr 3** for `drawer`
  at both viewports, `arch`, and `towerring`.
- Regression probes green: `settings`, `ring`, `gateway`.

## One thing that will invalidate the arch fix

`public/assets/map/map_level1_v2.png` was pushed to main while this work was in
flight (d7b42bb) and **nothing references it** — `art.json` still resolves
`map.level1` to `maps/map_level1.webp`, so everything measured above is against
the plate the game actually loads.

The near pier's outline is a trace of *that* plate. Swapping to v2 moves the
stone and invalidates every coordinate in `map.json`'s `entrance.arch`. To
re-measure:

    sh run.sh archplate 40 844x390 left   # the plate at 14x, 5px grid, outline drawn
    sh run.sh archplate 40 844x390 near   # the far pier, same
    sh run.sh archplate 40 844x390        # the whole arch at 4x with the lane on it
    sh run.sh arch 200 844x390            # the pixel diff, after re-tracing

`entrance.emergeFromX`, `clearOfArchX` and `arch.near.depth` are measured off
the same plate and move with it.

## What was NOT checked

- Only 844×390 and 568×320 were driven. 1280×720 and 390×844 are covered by the
  layout unit tests' rectangles but were not played.
- Real touch. Every press here is a synthetic mouse event.
- The arch diff is taken at one camera framing per viewport. A different zoom
  changes which pixels the silhouette covers, not which side of the road the
  piers are on, but it is one framing.
- Whether the drawer staying open while a pick is live is the right call on a
  phone. It is what "no pulsing ring behind a shut drawer" forces, and it means
  a node under the drawer needs a pan to reach.
