# The ring is not near its pad, and why the test could not see it

**2026-09-02 · against `b84a68c`**

Diagnosis only. **Nothing has been changed.**

## The short version

Item 1 is a **device-pixel-ratio bug**, and it is the same confusion as the
modal scrim in the last report: a value in **canvas pixels** compared against a
box in **CSS pixels**. That is now three bugs from one cause, so the fix should
be structural rather than three point fixes.

**The two flows do not behave differently.** Their anchor arithmetic is
byte-identical and they measure identically — 0px apart. What varies is *where
on the screen* the thing you tapped is, which is explained below and is why one
of them can look correct.

Item 2 and item 3 are both confirmed and are straightforward.

---

## 1. The ring is nowhere near the pad

### Measured

The same pad, brought to the centre of the screen, at two device ratios:

| dpr | anchor as computed | the same point in CSS | buttons land at | worst distance |
|---|---|---|---|---|
| **1** | 421, 194 | 421, 194 | 421,132 · 421,256 | **62px** — near it |
| **3** | **1264, 581** | 421, 194 | **815,143 · 815,267** | **401px** |

At dpr 3 the buttons are pinned against the right edge of the usable area, 401
pixels from the pad, which is what the footage shows.

### The mechanism

`padAnchor` and `towerAnchor` both compute:

```ts
x: (spot.x - cam.worldView.x) * cam.zoom + cam.x
```

`cam` is the **world** camera, whose zoom carries the device ratio, so this
produces **canvas pixels**. The area the ring is clamped into is built from
`viewW()`/`viewH()`, which divide by the device ratio and are therefore **CSS
pixels**. The anchor is handed to `ringPlacement` three times too large on a
dpr-3 device, lands far outside the area, and gets clamped to the edge.

The error is exactly:

```
error = (dpr - 1) x the anchor's CSS distance from the top-left corner
```

At dpr 1 it is zero, which is why every check passed. At the screen centre on a
dpr-3 phone it is about 840px before clamping.

### Why one flow looked right

**It isn't the flow.** Measured at the same world point, build and upgrade
differ by **0px** — both wrong by the same amount. But the error grows with
distance from the top-left corner of the screen, so a tower in the upper-left
of the view has a small error and looks correctly placed, while a pad at the
centre has the largest. If the tower in the footage was up and to the left of
the pad, both observations are consistent with one bug.

### Why the 7,560-placement test could not catch it

Two separate reasons, and both are worth fixing:

1. **It asserts containment and non-overlap, never proximity.** A ring pinned
   to the right edge is on screen, tidy, and not overlapping anything. It
   passes every question the test asks. Your instruction to add proximity as an
   assertion is exactly right.
2. **It feeds synthetic anchors in area units.** The test never converts a
   world point to a screen point, so the unit mismatch is invisible to it — the
   bug lives in the two lines of GameScene that the geometry never sees.

And the browser run missed it because **the harness defaults to dpr 1**, where
the bug does not exist. That is the same blind spot that hid the scrim.

### On moving the ring rather than the panel

You are right and I had it backwards. `fitRingAndPanel` currently moves the
**ring** when the panel has nowhere to go, on the reasoning that a leader line
is cheap. That is wrong: the ring's position *is* information — it says which
pad this menu belongs to — and the panel's is not. The panel should move, and
the ring should only ever move as a last resort when it genuinely cannot fit.

Note this is a *second, independent* reason the build ring can drift, separate
from the dpr bug: with a 226px panel and a narrow strip, the push-aside logic
fires. Both need fixing.

---

## 2. Two options make a line, not a ring

Confirmed: `ring bounds 50x194` — 50 wide is one button, so the two sit
vertically above and below the anchor.

The angles are `-90 + i x 360/count`, so two options land at exactly top and
bottom and three at top, lower-right, lower-left. The ellipse-fitting then
grows the radius until the plates separate, which for two buttons pushes them
124px apart vertically — a tall thin column rather than anything around the
pad.

The loadout gives two towers, so **this is the normal case, not an edge case.**

---

## 3. Locked upgrades are indistinguishable

Confirmed in `makeGlyph`: the first branch discards the option's own icon
entirely.

```ts
if (!option.affordable) {
  const key = icon(this.scene, 'locked')     // the option's icon is never read
  ...
}
```

So every unaffordable option — a tower, an upgrade, either specialization —
renders as the same padlock. Your fix is right: the option's own icon, dimmed,
with a lock badge over it.

Worth noting this was a deliberate choice I made and got wrong, on the
reasoning that "a padlock says *not yet* where a greyed-out picture just looks
broken". That holds for **one** locked thing and fails for two, which is the
common case.

---

## 4 and 5 — still unfixed, as reported

Both were diagnosed in `reports/2026-09-02-map-swap-regressions.md` and neither
has been touched, because that report was gated on your go-ahead.

- **4. Moe's sign.** `map.json.sign` is at world (841.5, 187.5); the painted
  board the innkeeper holds is at world x ≈ 907–943, y ≈ 163–203. The sprite is
  ~65px left of the board, and `boardWidth` 64 against a painted board of ~36.
  The **sprite** is the gameplay object — it carries the tap target and the
  bribe swap — so it moves onto the board.
- **5. Cory's health bar.** The HUD hero row is fixed at 587,60 247×22; the
  painted tavern sign projects to 654,12 .. 786,88 when the camera looks at the
  tavern. Confirmed overlap. This one needs a decision from you, since both
  elements are where they are meant to be — move the hero bar, or accept it.

---

## The structural point

Three bugs now, all the same confusion:

| | |
|---|---|
| the modal scrim | covers the top-left quadrant only at dpr 3 |
| the ring anchor | 401px from its pad at dpr 3 |
| my own harness probe | reported a correctly-placed tower as off screen |

`Resolution.ts` was written to make this impossible and it half-succeeded: it
gives `viewW`/`viewH` for CSS pixels, but nothing converts a **world point to a
screen point**, so every call site does that arithmetic by hand and each one is
a chance to forget the ratio. A single `worldToScreen(scene, x, y)` returning
CSS pixels, with the raw form deleted from the call sites, closes all three and
prevents the fourth.

## Suggested order

1. `worldToScreen` in `Resolution.ts`; fix the ring anchor and both scrims
   through it.
2. Proximity as an assertion in the placement test — and run the harness at
   dpr 3, not only dpr 1.
3. Invert `fitRingAndPanel`: move the panel, not the ring.
4. The two- and three-option arc.
5. The dimmed icon with a lock badge.
