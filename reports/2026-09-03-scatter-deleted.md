# The scatter props on the tree line — the system is deleted

2026-09-03.

| | commit | CI |
|---|---|---|
| Delete the generated scatter | `4d2387c` | green — Checks and deploy both success |
| This report | — | documentation only |

**Rebased twice and amended twice**, because the other session landed on `main`
while this sat on its branch: first onto `c4ff6b0` ("Raise Bailey so both eyes
clear the foliage"), then onto `1bfff9c` (its report). Neither conflicts.
`c4ff6b0` touches `presentation.json` as this does and they do not overlap — it
changes `bailey.peakVisible` and `bailey.worldHeight`, this removes the
`scatter` block — and `1bfff9c` is a report file only. Two amends, both
corrections to my own numbers rather than to the change: an estimated boulder
width replaced by a measured one, and a tally of six props on painted art
corrected to nine. Checks passed on `f680c31`, `b8149f1`, `1f1c0c1`, `41e491a`
and `4d2387c`; every one of those carries the same code. `4d2387c` then went to
`main` by fast-forward and its deploy run is green too.

**Which system it was:** `src/systems/Scatter.ts`, driven by the `scatter`
block in `presentation.json` and placed by `GameScene.createScatter()`.

**How many props:** **13** dealt on level one — 9 tall grass tufts, 3 medium
rocks, 1 small rock. **Nine of the 13 were on painted art:** six on trees and
bushes, two on painted furniture, one on painted flowers. Four were on clean
grass. The other eleven kinds in the `kinds` table were already parked behind
`enabled: false` and never dealt at all.

**The decision:** deleted, not constrained. It was decorative, and the plate
carries its own rocks, boulders, pebbles, flowers and grass tufts in quantity.

---

## Reproduce

The scatter is gone, so reproducing it means reading it out of history:

    git show 4d2387c^:src/systems/Scatter.ts
    git show 4d2387c^:src/data/presentation.json    # the "scatter" block
    git show 712ab1c^:public/assets/map/map_level1_v2.png > /tmp/plate.png

The 13 placements below were computed by re-implementing `scatter()` exactly —
the same xorshift, the same rejection order — and each one was then checked by
cropping `/tmp/plate.png` at that position with the sprite's own rectangle
drawn onto it — origin 0.5/0.9, `nativeScale` 0.5, so the render box is the
source size halved and hung above the anchor point. The three dealt props, in
source px and the world px they drew at:

    rock_small   60 x 45   ->  30.0 x 22.5
    rock_medium  95 x 60   ->  47.5 x 30.0
    grass_tall   98 x 68   ->  49.0 x 34.0

That is a stronger check than a screenshot for this question: it isolates where
the prop lands from everything else on the board.

**The harness was NOT run.** It needs a `phaser.min.js` and there is none in
this environment (`npm install` returns 403), so `tools/harness/run.sh` cannot
build. Nothing here is asserted from a rendered frame.

## The 13 props, and what was under each one

Seed 20260901, 600 attempts, 13 landed. World coordinates.

| prop | x | y | what the plate has there | verdict |
|---|---|---|---|---|
| `scatter-grass-tall` | 1135 | 28 | a conifer canopy above the tavern roof | **tree line** |
| `scatter-rock-small` | 258 | 50 | conifer foliage, the box sitting on the leaves | **tree line** |
| `scatter-grass-tall` | 30 | 55 | inside the top-left wood, mid-canopy | **tree line** |
| `scatter-rock-medium` | 592 | 68 | clean grass | ok |
| `scatter-grass-tall` | 843 | 71 | over a tree trunk, boulders to its left | **tree line** |
| `scatter-grass-tall` | 71 | 283 | floating over the arch keystone | **furniture** |
| `scatter-grass-tall` | 1104 | 295 | across the bench by the tavern door | **furniture** |
| `scatter-rock-medium` | 630 | 402 | clean grass | ok |
| `scatter-grass-tall` | 960 | 485 | clean grass | ok |
| `scatter-grass-tall` | 111 | 537 | the bush clump above the waterfall — Bailey's spot 0 | **tree line** |
| `scatter-grass-tall` | 401 | 601 | painted yellow flowers at the pond rim | **detail** |
| `scatter-grass-tall` | 1238 | 664 | the lower-right conifers | **tree line** |
| `scatter-rock-medium` | 829 | 689 | clean grass, touching a painted bush | ok |

**Nine of the thirteen were on painted art**, which breaks down as six on
trees and bushes, two on painted furniture, and one on painted flowers. Four
were on genuinely clean grass, and those four are the whole case for the
system.

Four of the six tree-line ones are in the first 72 world px of the board, which
is exactly what the rules below predict and exactly where the two reported
examples are. `scatter-rock-small` at 258,50 is the pale rock resting on
foliage; the tuft at 843,71 is the one over a trunk.

**I first counted six and it is nine.** The two I missed were the bench at
1104,295 and the bush clump at 111,537 — both real, both visible in the crops,
and both missed by reading the list too fast rather than by any ambiguity about
what is underneath them. The nine is the number.

## The cause is placement, and it was not fixable with another rule

**The depth was never wrong.** The props drew at `GROUND_DEPTH + 1`, one above
the plate, which is correct for something meant to lie on the ground.

**The plate is one image.** It is a single `add.image` at `GROUND_DEPTH`, so
every painted foliage pixel on the map is below every prop on the map *by
construction*. A prop can draw over a tree. It can never draw behind one. There
is no depth value that fixes this, because there is nothing to sort against —
the tree is not an object.

So placement was the only lever, and it had two guards, neither of which knew
what a tree is:

- **`edgeInsetPx: 24`.** The single defence against the tree line, and the
  painted wood is far deeper than 24px in every corner. The prop at y=28 was
  4px inside the inset.
- **`scatterExclude`, 25 rects.** The tavern, the pond, the arch, the gate and
  the sign — the furniture somebody sat down and listed. **Not one tree.** The
  arch rects run y 288–384 and the tuft that landed on its keystone is at
  y=283: five pixels above a hand-written box.

Constraining it properly would have meant a foliage mask over the whole plate,
re-derived on every re-export, to decide where generated rocks may go on a map
that is already painted full of rocks. That is the shape of the trade, and it
is why the system is gone rather than fenced.

## What was deleted

- `src/systems/Scatter.ts`
- `GameScene.createScatter()`, its call in `drawPlate()`, and `scatterCount`
- the `scatter` block in `presentation.json` (seed, rules, 15 kinds)
- the `scatter` section in `art.json` and its **14** `files` entries
- `ART.scatter` in `src/systems/Art.ts`
- `map.scatterExclude` (25 rects) and its type in `src/types.ts`
- **14 prop PNGs**, 180K of deploy: `rock_{small,medium,large}`, `grass_tall`,
  `pebbles`, `stump`, `mushrooms`, `branch_{small,large}`,
  `flowers_{white,yellow}`, `dirt_cracked`, `puddle`, `tire_ruts`
- the scatter tests in `board.test.ts` and `boot.test.ts`, the two scatter
  branches in `manifest.test.ts`, and three scatter probes in the harness

All of it is one `git show 4d2387c^:<path>` away if any of it is wanted back.

`board.test.ts` now opens with a test that keeps it deleted — file gone, scene
clean, all three data files clean, no `scatter-*` manifest key, no scatter PNG
under `public/assets/props`. That is the same shape as the existing "the tavern
is painted, not lit at runtime" test, which keeps the deleted ambient system
deleted.

## The one assertion that could not be re-pointed

The build-pad test used to require the pad be **1.5x wider than the widest
scatter prop**, so it could not be mistaken for scenery. That comparison died
with the props, and it is **not** re-aimed at the plate, for two reasons.

CI cannot measure the plate — it ships as a WebP and nothing in the test suite
decodes one; every plate measurement in this report went through the source PNG
in git history.

And the answer would be no. Measured off that PNG, by masking warm-neutral
stone in four boxes and taking connected components:

| where | widest painted stone, world px |
|---|---|
| left of the arch | 67 x 110 (and the arch pier itself at 153 x 88) |
| left of the tuft at 843,71 | 55 x 51, 54 x 34 |
| above the waterfall | 70 x 21, 56 x 40, 50 x 52 |
| lower-right corner | 47 x 47, 46 x 31 |

**46 to 70 world px.** The pad is **52** — `quietScreenWidth` 90 over the
DESIGN zoom of 1.72, which is how the pad test has always derived it, and not
the 0.659 the board actually opens at. So it sits *inside* the range of the
things it must not be mistaken for, not above it, and at the opening zoom both
it and the boulders are 2.6x smaller than these figures. My first pass at this said "the boulders run past 60" off a visual
estimate; the measured spread is the better statement and it is the one in the
test.

So the assertion is removed with that written down beside it. Whether the pad
still reads as a buildable slot next to a painted boulder is a question for the
harness's board screenshot, and it is open.

## Nothing else on the map is placed procedurally

Checked every world-space object GameScene adds:

| what | placed by | near the tree line? |
|---|---|---|
| the plate | `0,0`, filling the board | it *is* the tree line |
| arch occluder | fitted to the painted stone outline, depth `448.1` | deliberate, and in front on purpose |
| sign overlays | measured plate fractions, depth = own foot | no |
| build pads (7) | `map.buildSpots`, nearest edge 232px | no |
| tower ghost | on a build spot | no |
| towers, enemies, hero, projectiles | y-sorted on the lane | no |
| lane wash, node rings, hero markers | graphics on the lane | no |

The scatter was the only thing on this map at a computed position. Everything
else is hand-placed against measured plate coordinates, which is why nothing
else has this fault.

## Bailey: same constraint, different bug — do not merge them

She is drawn at `GROUND_DEPTH + 1`, the *same layer the scatter used*, and she
is subject to the same fact: she cannot go behind painted foliage.

But she is not an instance of this bug. Her positions are two hand-picked spots
found by masking the painted conifer and bush mass, and each carries a
`canopyY` — the world y of the **top edge** of foliage at that x — with a mask
that cuts her on it. She has the remedy the scatter never had. Her fault, as
reported, is in how that mask reads, not in whether the placement knows there
is a tree there.

**One thing does connect them, and it is worth having.** The tuft at 111,537
was inside her **spot 0** — the bush clump above the waterfall at 125,526 — and
both draw at `GROUND_DEPTH + 1`. Her sprite occupies roughly x 100-150, y
486-526 there; the tuft occupied x 87-136, y 506-540. They overlapped by about
36 x 20 world px. She drew in front of it, because `drawPlate()` runs before
`buildSign()` and equal depths fall back to creation order, so it was not
cutting into her — but a generated grass tuft was sitting in the clump chosen
specifically for being dense enough to hide a dog. Deleting the scatter takes
it out of there.

**Otherwise: not a shared cause, and nothing here touches her.** `map.baileySpots`,
`presentation.bailey` and `src/systems/Bailey.ts` are all untouched by
`4d2387c`. If the other session concludes the fix is to stop relying on a mask
at all, that *would* meet this report at the same wall — the plate is one image
— and at that point the two are worth reading together.

## Checked

- **605 tests pass**, against 616 on `1bfff9c` — both counts run, not
  estimated. `board.test.ts` goes 13 tests to 3 and `boot.test.ts` 6 to 5: 12
  scatter tests removed, 1 added, net -11.
- `sh tools/tsdiff.sh 1bfff9c`: 176 distinct errors on the baseline, 176 on the
  working tree, **none introduced**. All 176 are the `phaser` cascade CLAUDE.md
  describes, which is why `tsc` output on its own says nothing here.
- Every JSON file re-parsed after editing.
- **Not checked:** the board in a real frame. See the harness note above.

## Where this leaves the repository

- **Landed.** `4d2387c` is on `main`, fast-forwarded after Checks went green on
  the branch. Nothing from this work is in flight.
- **Open, from this work:** whether the build pad still reads as a buildable
  slot beside a painted boulder, now that nothing in CI measures it. The pad is
  52 world px and the painted stones are 46-70, so it is inside their range.
  Needs a look at a real frame, not another number.
- **Open, from this work:** the map has no generated decoration at all now. If
  a corner ever looks bare, the answer is paint on the plate, not a system —
  and the four props that were on clean grass are the only evidence that any
  corner did.
- **Noted, not acted on:** `CHANGELOG.md` claims to be the deploy history and
  has not been updated since `043923e`; roughly twenty deployed commits are
  missing from it. Not fixed here — that is either a habit to restart or a file
  to retire, and it is your call which.
Carried forward from `reports/2026-09-03-sign-fit-and-bailey.md`, which the
other session updated at `1bfff9c` while this was on its branch — its list is
newer than the one I started from, so these are its items, not restatements:

- **Waiting on you:** re-cut the sign art at ~270px wide. Filtering is not the
  cause; it is 17.1x minification in world units.
- **Closed there this round:** Bailey's placement, mask and amount. My earlier
  draft of this section carried her "14.6 CSS px" forward — that number is
  superseded; `peakVisible` is 0.6 and `worldHeight` 67 now.
- **Still open:** the 568x320 drawer grid lever; whether the drawer's tab bar
  should have words, which needs `minUiSize` lowered from 15; and the sign
  *text* alignment item from the withdrawn message.
- **Longer-standing, unchanged:** 18 trait phrases await approval; towers 0.91x
  the lane against a ~1.2x intent; balance not re-tuned for the v2 lane;
  `icon_confirm.png` and `assets/nodes` unreferenced; `checks` not a required
  status on PRs; `hud_peanut_icon.png` unwired, which would let
  `PeanutIcon.ts` be deleted.
