# The ring, the blind spot, and a corner that does not exist

**2026-09-02 · `3f7bb9a` → `faa1f0b` · CI green**

Five items, in the order I proposed them, plus your two decisions.

| | commit | |
|---|---|---|
| 1 | `0d900af` | `worldToScreen`, and the harness blind spot closed |
| 2–5 | `043923e` | Tight arc, panel moves not the ring, proximity, locked icons |
| 5 (yours) | `faa1f0b` | The hero bar, measured, and given a plate |

---

## 1. One world-to-screen, and the blind spot behind it

`worldToScreen` lives in `Resolution.ts` now, beside `viewW` and `viewH` and
returning what they return. The two call sites that wrote the four-term
camera arithmetic by hand go through it, and a test fails on any that comes
back.

```
dpr 3, 844x390, the same pad
  before   anchor 1264,584   buttons pinned to the edge, 401px from the pad
  after    anchor  421,195   buttons at 421,133 and 421,257, worst 62px
```

**You are right that the blind spot is the thing to fix, and I have done both
of the options you offered rather than picking one.**

`run.sh` **defaults to DPR=3** now — the ratio a phone actually reports, rather
than the one where canvas pixels and CSS pixels happen to be the same number.
`DPR=1` goes back.

And every run now ends by printing a **device-ratio fingerprint**: five fixed
world points projected into screen space, the UI camera's view, and every HUD
rectangle, all in CSS pixels. `tools/harness/both.sh <scenario>` runs the
scenario at 1 and at 3 and **fails if they disagree**. The property is exactly
the one both bugs violated: *screen space must not depend on the device ratio.*

It parks the camera on a fixed point at a fixed zoom before measuring, because
the game is not deterministic across two runs at different rasterising speeds —
but this mapping is a function of the viewport and the ratio alone.

Verified by putting the bug back. With the divide removed from `worldToScreen`:

```
-FP world 640,360 = 421.40,194.36
+FP world 640,360 = 1264.20,583.08
RESULT *** SCREEN SPACE DEPENDS ON THE DEVICE RATIO ***
```

`1264,583` is the anchor from the original diagnosis, caught by a scenario that
knows nothing about rings.

```sh
sh tools/harness/both.sh proximity 130 844x390
  dpr 1: 15 fingerprint line(s)
  dpr 3: 15 fingerprint line(s)
  RESULT screen space is identical at dpr 1 and dpr 3
```

`tests/scrim.test.ts` is `tests/screenspace.test.ts`: it was named for the
first of the three bugs and now guards the class.

## 2. Proximity, and why it could not be a flat number

A ring pinned to the screen edge is on screen, tidy, overlapping nothing, and
passes every other question the placement test asks. Containment cannot see
the failure. Distance can — but not unconditionally, and the reason is worth
stating because it changed the assertion:

**a six-option ring is 324px wide, so a pad in the corner of the usable area
cannot have one centred on it.** The clamp correctly moves it, and the far
button ends up 336px away. A flat bound either fails that legitimate case or is
too loose to catch a 401px one.

So it is conditioned on what actually separates them: **where the ring fits
centred on its anchor, it must be centred on it** — shift zero, every button
within one radius. False for a ring clamped 401px away, true for every correct
placement. The absolute worst across the walk is 164px; the printed bound is
200.

`TowerRing` also stops absorbing this quietly. An anchor outside the usable
area is always a caller bug, and it says so now instead of producing a tidy
on-screen ring nowhere near its pad — which is exactly what it did for anyone
on a retina phone until a video caught it.

## 3. The panel moves, not the ring

You were right and I had it backwards. A side that would cover the anchor is
disqualified outright now, even one with room to spare, and overlapping the
ring's own buttons is accepted rather than fixed by shoving the ring aside.

Measured across all 7,560 placements: **the panel covers the pad in zero of
them**, so the last-resort ring move never fires.

**One thing I want to be honest about rather than bury.** Sides are also ranked
by how many button plates they would hide, and that helps less than I first
wrote in the comment — it moves 42 placements out of "three plates hidden" and
leaves the worst case at four. On a notched iPhone SE a six-option ring is
324×214 and the strip it shares with a 226px panel is 472×171; no arrangement
fixes that. A hidden plate costs a tap (cancel, then press). A **narrower panel
on a small screen** would fix it properly, and that is a change to what the
panel says rather than where it goes — say the word and I will do it.

## 4. Two options are an arc, not a line

```
before   ring bounds  50x194   two buttons 124px apart, vertically
after    ring bounds 144x70    worst button 49px from the pad
```

At or below three options the buttons fan across a narrow arc against the
anchor, left to right, **above or below depending on the room there actually
is** — a fixed "always above" gets clamped back down onto the pad whenever the
pad is near the top of the area, and the ring covering the thing it is about is
the one failure the geometry exists to prevent.

The pad stays visible in the gap between the two buttons.

**A real bug fell out of it.** `platesClash` took `s - 0.5`, which calls two
50px plates 49.8px apart *separated* — they overlap by 0.2px. Invisible while
every ring was an ellipse, where neighbours are far apart on at least one axis;
840 of 7,560 placements the moment three buttons sat on nearly the same line.
It is a whole pixel outwards now, and measures the footprint rather than the
plate so a price badge cannot tuck under a neighbour's picture.

## 5. Locked options

```
peanuts 0, options withholding LOCKED, writeoff LOCKED
  withholding  glyph turret-ledger    alpha 0.50 tinted  badge at +20,+20
  writeoff     glyph turret-writeoff  alpha 0.50 tinted  badge at +20,+20
  distinct pictures across 2 locked options: 2
```

Thank you for the note about the original reasoning — I have written it into
the code that way rather than as a correction. A padlock instead of the picture
says "not yet" where a greyed-out picture just looks broken, and that holds for
**one** locked option. It fails at two, and two is the common case: a player
short of peanuts is short for several options at once, and two identical
padlocks say nothing about what they are saving up for.

```sh
DPR=3 sh tools/harness/run.sh locked 100 844x390
```

---

## Your item 5: the hero bar

You asked me to put it somewhere nothing painted can reach at any camera
position, and to verify that rather than assume a corner is safe.

**Verified, and no such position exists.**

```
844x390     0 of 20,467 screen cells are never reached by painted art
568x320     0 of 11,360
```

The map is full-bleed and the camera is free, so at maximum zoom it can put any
painted feature under any pixel. That is a fact about a full-bleed map with a
free camera, not about this bar — the same is true of the counters, the START
button and the ability bar.

`tools/hud_exposure.py` is how that was established, and it measures the
painting rather than a list I wrote down: it classifies every 8px cell of the
plate as grass, dirt road, or something a person painted, floods the rest into
blobs, and sweeps 768 camera positions across the whole zoom band against the
real HUD layout. (The plate is a WebP and nothing outside a browser here can
decode one, so a new `plate` scenario hands it back as a 1280×720 PNG in the
map's own coordinate space.)

**What the move to the left actually bought,** over those 768 positions at
844×390:

| position | on the painted signboard | on any painted art |
|---|---|---|
| was, top-right `587,60` | **110 / 768** (14%) | 395 / 768 (51%) |
| now, top-left `10,60` | **6 / 768** (0.8%) | 380 / 768 (49%) |
| best position clear of the rest of the HUD | 2 / 768 | 405 / 768 — *worse* |

Sixteen-fold better on the one piece of map art with **words** painted on it,
and within noise of the best position available anywhere on the screen. Moving
it again saves four camera positions on the signboard and is worse on
everything else, so it stays.

**So the remainder is not a placement problem,** and the fix is the one the
HUD's own rules already state — *elements sit over map art, which is fine, each
one carries its own plate*. The hero bar was a **55% black wash** and did not.
That is what the original report was actually about: the painted signboard
showed through the bar and the bar showed through the signboard. It is opaque
with a dark edge now, like every other piece of chrome in the game.

## Your item 4: Moe's sign

Already done, in the re-trace, and confirmed in the browser:

```
map.sign 925,183  boardWidth 36   (was 841.5,187.5 and boardWidth 64)
sign sprite bounds 907,166 36x48
the painted board  907,163 .. 943,203
```

The sprite is on the board the innkeeper is holding, and the tap target and the
bribe swap went with it.

---

## What was NOT checked

- **`both.sh` on every scenario.** It is run on `ui` and `proximity`. Running
  the whole suite twice is a long job, and I have not done it — the fingerprint
  is emitted by every scenario, so it is a matter of time rather than of work.
- **The hidden-plate cost in a real hand.** The four-plates-hidden case is
  arithmetic from the 7,560-placement walk. I have not driven a 568×320 phone
  with six build options open to see how it feels.
- **The landmark classifier against the artist's intent.** It finds nine blobs
  by colour, and I checked the big ones read as the tavern, the water, the tree
  line, the arch and the gate. It has not been checked blob by blob, and a
  painted feature in grass-green would be missed.
- **A full 13-wave run.** Still not played end to end since the re-trace.

## Still outstanding

1. Hero facing, DAD MODE audio sync, the music level.
2. The settings menu: a gear icon, three sliders, HOME / RESTART / CONTINUE.
3. The renaming pass.
4. A narrower description panel on small screens, if you want the hidden-plate
   case fixed properly.
