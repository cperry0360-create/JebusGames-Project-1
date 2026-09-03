# Four fixes: the notch, the opening frame, the node ring, and Bailey

2026-09-03. Four separate briefs, worked in order, each committed on its own.
Every number below was measured by driving the game, not read off the source.

| | commit | CI |
|---|---|---|
| Safe-area inset resolved onto one edge | `b9c58a0` | green |
| Run opens on the whole board | `4c76f48` | green |
| Node ring visible and centred | `acb8f2e` | green |
| Bailey behind the trees | `2fe7c86` | green |

All four are on `main` and deployed. 606 tests pass; `tsdiff` introduces
nothing beyond the documented `phaser`-cannot-resolve line for the one new
Phaser file, which the harness run covers by execution instead.

---

## 1. The 64px inset on an edge with no notch

**The stated hypothesis was that a consumer used one value for both edges, or
took `max(left, right)`. It does not.** Every consumer already applies each
edge's own value to that edge — `HudLayout` uses `insets.left` and
`insets.right` separately, `RingLayout` the same, and the drawer's dock is
`viewW - safeAreaInsets().right`. There is no `max()` and no shared constant
anywhere downstream, and a test now pins that.

The symmetry is in what the platform hands us. A notched phone in landscape
reports the housing inset on **both** horizontal edges — the rounded display
corners are on both, but 64px is the housing, not a corner radius.

Injected into the real scene at 844x390:

| raw report | handle | HUD |
|---|---|---|
| left 64, right 0 | flush at 844 | 74 left / 10 right |
| left 64, right 64 | **64px short** | **74 at both ends** |

The second is the recording exactly. So the fix is at the read: a symmetric
horizontal pair means one edge is the housing and the other is not, and
`screen.orientation.angle` says which. An asymmetric pair is trusted whole; an
unknown angle keeps both, which is what shipped before.

**Why the old assertion passed while the handle floated.** It chose its own
`dockRight` — the viewport width — and asserted the panel reached it. That
proves `drawerLayout` and says nothing about the value GameScene passes it. The
inset never entered the test. It does now, through the real formula, at every
viewport and for both landscape orientations.

**The harness had the same hole and worse:** its page carried no `#safe-area`
probe at all, so `safeAreaInsets()` returned zeros in every run ever made
there. A notch cannot be found by a rig that has no notch. It has the probe
now, plus levers to inject an inset pair (`INSETS=`) and a screen angle
(`ANGLE=`), and a `notch` scenario that measures every edge-anchored rectangle
against the **screen** rather than against the inset box.

Verified at 844x390 and 568x320, dpr 1 and 3, angle 90 and 270 — eight
combinations, all correct. Housing left leaves the handle flush at the viewport
width; housing right holds it off by 64, because that is where the hardware is.

**One value I could not verify here:** which side angle 90 puts the housing on.
It is derived from the orientation conventions — 90 is landscape-primary, which
is iOS `landscapeLeft`, home indicator right, device top edge left — not
measured on a phone. It sits in `presentation.json` as a single string with
both branches tested. If the inset ever appears on the wrong edge, flip
`safeArea.housingAtAngle90` and change nothing else.

```sh
INSETS=0,64,0,64 ANGLE=90  HOUSING=left  DPR=3 sh tools/harness/run.sh notch 30 844x390
INSETS=0,64,0,64 ANGLE=270 HOUSING=right DPR=3 sh tools/harness/run.sh notch 30 568x320
```

---

## 2. The run opened too close

The first frame framed about a third of the lane. `boardBounds()` now takes the
lane padded by half a road and every pad padded by its tap radius, clips it to
the plate, and `openingView()` returns the widest zoom that frames it plus that
box's centre — derived from the map data, so re-tracing the plate moves it.

**Floored at cover, not at the pinch floor.** `minZoom` exists to stop a gesture
parking the whole map at a scale where a tower is a smudge, and on this map it
sits *above* the zoom that frames the board: clamping the opening into the band
would have left a fifth of the lane off screen. The brief said this changes the
initial value and not the limits, so the band and the pinch controls are
untouched and only the opening is exempt. **The cost, stated rather than
hidden:** a player who pinches from wider than `minZoom` sees the view step in
once. If that grates, the fix is `display.json`'s `camera.minZoom` — 0.659 at
844x390 and 0.445 at 568x320 would put the band's floor where the opening is.

Measured on the first frame:

| viewport | dpr | opening zoom | visible world rect |
|---|---:|---:|---|
| 844x390 | 1 | 0.6594 | x 0.0..1280.0, y 94.0..685.0 |
| 844x390 | 3 | 1.9781 | x 0.0..1280.0, y 94.0..685.0 |
| 568x320 | 1 | 0.4444 | x 1.0..1279.0, y 0.0..720.0 |
| 568x320 | 3 | 1.3333 | x 1.0..1279.0, y 0.0..720.0 |

All 41 on-plate waypoints, all 7 build pads, the entry arch at x=60 and the gate
at x=1205 are in frame at every one. The design default it replaces was 1.72 —
2.6x closer. The same CSS viewport shows the identical world rectangle at dpr 1
and dpr 3, which is the check that catches a zoom computed in the wrong space.

**On the space, since that was the fifth-issue question:** the rig's zooms are
device pixels per world unit — GameScene multiplies the band by the device ratio
before handing it over — and `cam.width` is device pixels, so the opening is
computed on the same scale as the ceiling. The 4.825 in the old crash log was
2.37 x 2 (a dpr-2 device); no ceiling was breached then either.

**The camera does not follow the hero, and never did.** Every write to the rig's
target centre is a gesture, a clamp, or the constructor; there is no follow
target. The wave screenshots of empty grass are this same fault seen later — the
camera sat where the hero *started*, at the close default zoom, while the hero
walked off. So there was nothing to defer. Asserted both ways: a source check
that the rig has no follow, and a driven check that ordering the hero to the far
end of the map moves the view **0.00px**.

---

## 3. The node highlight

### It was invisible

Measured at 8–12 channel levels above the grass, needing about 5x amplification
to be seen in analysis at all. That was an overcorrection from the flat yellow
decal before it: 0.55 alpha at 2px is the other ditch from a full-strength 3px
rim.

It is **two strokes** now, dark under bright, the way a painted line on dirt has
a shadow in the groove it sits in — the dark pass is what holds it together on
light dirt and where the ring crosses the road, which one bright stroke did not.
Everything beats with the radius: both alphas and both widths.

Measured the way the brief asked — the stroke against the pixels immediately
either side, target 35–50, at 844x390 dpr 3:

| node | surface | local | vs ring-off |
|---:|---|---:|---:|
| 0 | grass | 141 | 230 |
| 1 | dirt | 40 | 80 |
| 2 | grass | 41 | 79 |
| 3 | grass | 37 | 93 |
| 4 | grass | 47 | 106 |
| 5 | dirt | 48 | 98 |
| 6 | grass | 50 | 120 |

Six of seven land in the band. **Node 0 reads 141 because the horizontal cut
through its centre crosses the traffic cone painted on that pad**, so "the
pixels either side" are cone rather than clean map — the ring drawn there is
identical to the other six. The pulse swings the peak delta by about 200 levels
over a cycle, against a swing that used to be inside the noise.

### The one miscentred node

**It is not that node's coordinates and it was not carried over from the old
plate** — both were checked; the ring is drawn at `spot.x, spot.y` by the same
loop for every node.

`prop-pad` is a dirt oval with a sign planted in it, and it was anchored at
`1.0` like a standing prop, so the whole oval drew above the spot while the
ring, at the spot, circled the grass underneath. Every other pad is a flat slab
anchored on its middle — which is exactly why one node out of seven looked
wrong.

The oval's ground band is centred at **0.719** of the canvas, measured, and that
is the anchor now. It is recorded as `groundY` beside it so the two cannot
drift, and the flagstone's 0.518 is recorded the same way. The existing
assertion said 1.0 was correct "or the dirt would float" — it had the sign of
the error backwards, and is corrected in place.

Asserted for **every** node: all seven now draw their painted ground 0.00px from
their own spot.

### Should it highlight at all?

**Yes.** DO NOT BUILD HERE is a joke printed on an ordinary pad. Nothing
excludes it from building, it is free, and the ring means "this will take the
tower you picked", which is true. A test now fails if eligibility ever starts
special-casing it — at that point the joke has become a rule and the art should
say so.

---

## 4. Bailey

Built whole, with one thing missing: **`prop_bailey_peek.png` is not in the
repository.** It is not on `origin/main` and not in `public/assets/props/`. Her
art is registered as an **optional** manifest hook, so the code is complete and
she simply never appears until the file lands — no placeholder, no error, and
no change needed when it arrives.

The rules, all of them enforced:

- **At most once a minute, never on a schedule.** The gap is re-rolled in
  60000–150000ms after every appearance.
- **Build phase only.** `status.phase === 'ready'` and no modal open. A wave
  starting mid-peek sends her down rather than deleting her — vanishing in one
  frame reads as a glitch.
- **Never twice in the same spot.** `pickSpot` picks from the others directly
  rather than re-rolling until the index differs, which would loop forever on a
  one-spot list and be biased on a two-spot one.
- **Rise 400ms, hold 1200ms, drop 400ms**, eased at both ends.
- **Behind the trees.** The trees are painted into the plate, so there is no
  sprite to sort behind — anything drawn at all is drawn over them. She is
  **masked** instead: nothing of her renders below her spot's canopy line, so
  what clears it is the top of her head and her ears, and what is under it is
  simply not there. Rising is that line staying put while she moves up through
  it.
- **44px tall at 844x390**, stored as 67 world px (44 / 0.6594, the opening zoom
  at that viewport) so it scales to every other viewport for free and does not
  change when the player pinches.
- **She does nothing.** Not tappable, no sound, no message, no reward. A test
  fails if `setInteractive`, an audio call, a listener or a status message ever
  appears in her file.
- **Not on the boot path.** She loads with the level's other props.

Driven with a stand-in texture of the right aspect, at all four spots:

```
spot 0 at 34,190   visible true   clearing the canopy by 33.5 world px (50% of her)
spot 1 at 68,180   visible true   clearing the canopy by 33.5 world px (50% of her)
spot 2 at 100,186  visible true   clearing the canopy by 33.5 world px (50% of her)
spot 3 at 130,178  visible true   clearing the canopy by 33.5 world px (50% of her)
with the phase set to "wave", visible: false
```

That run also closes the `tsdiff` blind spot for `Bailey.ts` — it exercises the
real Phaser build, so the mask, the crop-free rise and the depth are verified by
execution rather than by a typechecker that cannot see Phaser's members.

```sh
DPR=3 sh tools/harness/run.sh bailey 40 844x390 stub
```

---

## Probe bugs found and fixed before any number here was believed

Reported as loudly as the product bugs, because a probe that lies is worse than
no probe.

1. **The art-budget line triple-counted the device ratio** — `zoom` is already
   device-scaled, so multiplying by `devicePixelRatio` again tripled it.
2. **The ring centring check read the middle of the canvas**, not the painted
   ground band, and reported a correctly anchored pad as 16.5px out.
3. **The surface classifier sampled the middle of each pad** and so called every
   node "dirt" — the middle of a pad is the pad's own dirt whatever it stands
   on.
4. **The `bailey` scenario's stub branch never ran** on the first attempt: the
   argument went into `run.sh`'s fifth slot, which it ignores. The run reported
   "nothing further to measure" and looked like a correct skip.

## Not checked

- **Bailey's canopy lines against the real sprite.** The four `canopyY` values
  are the front edge of the painted foliage per column, read off the plate.
  Without the art there is nothing to check them against, and they will want one
  pass once it lands.
- **A real notched phone.** The whole safe-area chain is verified by injection.
  The one derived constant is called out above.
- **The pinch step-in after the wider opening.** It is a consequence I reasoned
  about and stated, not one I measured against a person's hand.
- **Whether the ring reads on a phone in daylight.** The 35–50 target came from
  the brief; what is measured here is the channel delta that target names.

---

## Where this leaves the repository

Nothing is in flight. Two things are open and both are decisions rather than
work:

1. **`prop_bailey_peek.png` is not in the repository.** Not on `origin/main`,
   not in `public/assets/props/`. The code is finished and the manifest hook is
   optional, so she stays behind the trees until the file lands and nothing
   needs changing when it does. The four `canopyY` values will want one pass
   against the real sprite.
2. **The sign text alignment.** It was the one item in the withdrawn message
   that none of the four briefs covered, and it touches the lettering overlays
   shipped in `20fcda7` earlier the same day. Not investigated, because the
   message was withdrawn; nothing was started from it, so there was nothing to
   revert.

## Longer-standing, carried from earlier reports

- The 18 trait phrases still await approval before they ship.
- The towers are 0.91x the lane where the design intent is about 1.2x — an art
  decision, flagged three times now.
- Balance has not been re-tuned for the longer, wider v2 lane.
- `public/assets/ui/icon_confirm.png` is unreferenced; `assets/nodes` is 4MB
  unused.
- `checks` is still not a required status on pull requests.
- `public/assets/ui_icons/hud_peanut_icon.png` arrived as an upload and is
  unwired; it is the purpose-drawn icon that would let `PeanutIcon.ts` — which
  crops and flood-fills the counter plate — be deleted.
- The held sign overlay is 2.07x the size CLAUDE.md rule 7 asks for.
