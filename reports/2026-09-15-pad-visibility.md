# Build pads popping under a pan: the third attempt, and the last one

| commit | what | CI |
|---|---|---|
| [`d7036cc`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/d7036cc) | `padShowing` reads world state only; `hudStandsOn` and `syncPadVisibility` deleted; the replaced test; the `padpan` harness scenario | [run 394](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34959835000) — all five jobs **success**, and `deploy / deploy` **RAN** |
| [`dc7cc8e`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/dc7cc8e) | This report, and `claude/context.md` | [run 395](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34961832007) — `changes`, `typecheck`, `test` **success**; `deploy` **skipped**, correctly: a markdown-only push does not republish |
| *this commit* | Closing this table on runs 394 and 395 | it edits this table and nothing else |

Read the job list, not the run's conclusion. `d7036cc` touched `src/`, so its run
**deployed** and the live site carries the fix; this report does not, so its run
skips `deploy`, which is the `changes` job working as designed.

**Answers first.**

1. **YES, `padShowing` was over-firing, and well beyond the HUD.** Between 29%
   and 35% of everything it hid had **no HUD element over the drawn disc at
   all**. Two compounding causes, both measured. And it was **not** stale and
   **not** the wrong rectangle: it ran every frame off the live camera against
   the live HUD layout. The rule was correct by its own definition. Its
   definition was the bug.
2. **Route (c), and neither (a) nor (b).** A build pad is a world object; its
   drawn state is now a function of world state alone. The HUD is not consulted,
   the camera is not consulted, and nothing is hidden. Route (a) was costed
   properly and rejected: it takes **40% of a 390-tall landscape phone** and
   ends the full-bleed map.
3. **THE BLACK BAND DID NOT COME BACK.** Proved in the same run, at the same
   camera positions, with a magenta-backed world camera: **0.000% void and
   0.0 px past the plate** on all ten levels, and the same after a hard fling in
   each of the four directions. The camera was not touched at all — no slack,
   no margin, no band, no viewport change.

---

# Step 1 — the confirmation, before anything was changed

## It is `padShowing`, and the mechanism is not in doubt

`GameScene.update` called `syncPadVisibility()` **every frame**. That walked
every build spot, called `padShowing`, and `padShowing` called `hudStandsOn`:

```ts
const c = worldToScreen(this, spot.x, spot.y)
const half = Math.max(22, this.level.map.spotRadius * this.cameras.main.zoom / deviceScale())
const pad = { x: c.x - half, y: c.y - half, width: half * 2, height: half * 2 }
for (const r of [L.counters, L.startButton, L.messageRow, L.heroChip,
  L.abilities, L.settings, L.cancel]) { /* rectangle overlap */ }
```

## Is it evaluated in screen space against a live camera, or a stale rect?

**Screen space, live camera, correct rectangles. Nothing is stale.**

- `worldToScreen` reads `this.cameras.main` on the frame it runs.
- `this.layout` is a getter that returns **HudScene's own** layout, not a local
  copy — that was itself a previous fix, because a local copy computed with
  `countersWidth: 0` produced a zero-width rectangle and a drag on the peanut
  counter panned the map.
- It ran in `update`, so it was re-answered 60 times a second.

So there is no second bug of the "wrong rect / stale value" kind. **A
screen-space predicate on a moving camera is a moving predicate**, and that is
the whole of it. No tuning of a rule that reads the screen can satisfy "must
never change as the camera moves".

## Is the cull culling ONLY pads genuinely behind a HUD element?

**No. It over-fires, for two reasons that compound, and a third that makes one
class of cull actively harmful.**

### 1. It tested the TAP CIRCLE's bounding SQUARE, not the drawn art

| | world px |
|---|---|
| the drawn pad (`quietScreenWidth / defaultZoom`, flagstone ink aspect) | **52.3 × 40.0** |
| the tap circle (`spotRadius` × 2) | **68 across** |
| what `hudStandsOn` tested | the **68 × 68 square** around that circle |

The square is 1.3× the art's width and 1.7× its height, and its corners are
outside the circle the square was standing in for. A pad whose disc was nowhere
near the HUD was hidden because a corner of a notional square touched a
rectangle.

### 2. Two of the seven rectangles do not take a press at all

`hudTakesPress` covers `abilities`, `startButton`, `settings`, `cancel` and
`heroChip`. **`counters` and `messageRow` are readouts and are deliberately not
in it** — a press over them falls through to the board. But `hudStandsOn`
tested all seven. So a pad under the wave message was **hidden and still
pressable**: the player taps bare grass and a build ring opens.

### The numbers

599,319 pad/camera samples — all ten levels, the whole zoom band, a 21 × 21 grid
of camera centres inside the reachable box:

| at 844×390 | share of samples |
|---|---|
| hidden by the rule as shipped | **16.0%** |
| drawn art actually under **any** HUD rect | 11.0% |
| drawn art under a rect that **takes a press** | 7.6% |

So **31% of the culls at 844×390 were over-fires** — 29% at 667×375, 35% at
1400×900. Attributed:

| rectangle | share of samples culled | |
|---|---|---|
| `abilities` | 5.6% | takes the press |
| `messageRow` | 4.2% | **readout — press falls through** |
| `startButton` | 2.1% | takes the press |
| `heroChip` | 1.9% | takes the press |
| `cancel` | 1.8% | takes the press |
| `counters` | 1.2% | **readout — press falls through** |
| `settings` | 1.0% | takes the press |

**34% of the culls came from the two readouts**, which is the invisible-but-
pressable class.

### And the popping itself, measured

**Every pad on every level flips**, at every landscape viewport:

| viewport | pads that flip | worst simultaneously hidden |
|---|---|---|
| 844×390 | **151 / 151** | 5 of level 1's 7, at zoom 0.98 |
| 667×375 | **151 / 151** | 6 of level 1's 7, at zoom 0.98 |
| 1400×900 | 149 / 151 | 3 of level 1's 7, at zoom 1.81 |

"Most of the board padless at mid-pan" in the recording is **5 of 7 on level 1**
— the report was accurate.

### FRAME — and the same thing off the live scene

`sh tools/harness/run.sh padpan 700 844x390`, on the unmodified tree, reading
each sprite's own `visible` every frame of a pan across all ten levels:

```
TOTAL: 3510 samples, 151 pads over 10 levels; 151 flipped
  level1   7 pads:  *** 7 FLIPPED: 0,1,2,3,4,5,6   void 0.000%   view past the plate 0.0px
  level7  22 pads:  *** 22 FLIPPED: 0,...,21       void 0.000%   view past the plate 0.0px
```

**Both bugs need fixing and only one fix was needed**, because removing the
screen-space rule removes the over-firing with it. There is no rule left to
over-fire.

---

# Step 2 — the third route

## The property, and what it forces

> A pad must never appear or disappear as a result of the camera moving.

A pad's drawn state must therefore not be a function of **anything the camera
moves**. That rules out every screen-space formulation, however carefully
scoped, and it is why "keep attempt 2 and tune it" cannot work: the scope was
never the problem, the coordinate space was.

That leaves the question of what to do about the HUD sitting over a pad, which
is what the three candidate routes are about.

## The three routes, costed

### (a) Reserve a HUD band outside the map viewport

This is a genuinely different mechanism from attempt 1 and the brief is right
about that. Attempt 1 never inset anything: it passed the band to `centerRange`
as a margin on the camera **centre**, which moves the wall outward and shows the
void. A real `setViewport` inset cannot produce void, because `centerRange` is
computed from `cam.width/cam.height` — shrink those and the clamp stays exact.

**What it costs, measured, at 844×390:**

| | px | share of a 390-tall screen |
|---|---|---|
| top band (to `messageRow`'s bottom edge) | 82 | 21% |
| bottom band (from `abilities`' top edge) | 74 | 19% |
| **total reserved** | **156** | **40%** |
| reserving only for the five rects that take a press | 128 | 33% |
| the same at 1400×900 | 156 | 17% |

The board viewport becomes 844 × 234. At the default zoom you would see
**491 × 136 world px of a 720-tall board — 19% of it**, against 491 × 227 today.
And `openingView` frames the whole board on the first frame, so it would have to
zoom out further to do it, which is the thing `CameraRig`'s narrow zoom band
exists to prevent: *"the player may adjust the framing, never zoom out far
enough to take in the whole map, which is what made everything read small."*

It also ends the full-bleed map, which is a decision the repository has made and
written down in at least three places, and it is a large refactor — CLAUDE.md
hard rule 6 says propose and wait.

**Rejected on cost, not on difficulty.** It is the only route that makes "the
HUD is never over a pad" literally true, and if that is worth 40% of a phone
screen it is available — the arithmetic above is the price.

### (b) Shrink or restructure the HUD so it does not reach the board

**Not reachable.** The map is full-bleed, so *any* HUD over it reaches the
board; "does not reach" and "full-bleed" are the same statement negated. The HUD
is also already at its corners — `e361efe` did that — and what is left is a
48 × 44 readout stack, a 132 × 44 wave control, a 40 × 40 gear, a 300 × 22
message row, a 60 × 60 hero chip, a 322 × 64 ability row and a 116 × 48 CANCEL.
There is no fat. (b) collapses into (a) as soon as you ask it to be a property
rather than a tuning.

### (c) The HUD does not hide the pad — CHOSEN

**Pads are always drawn. Nothing about a pad reads the screen.** `padShowing` is
now one line:

```ts
private padShowing(spot: BuildSpot): boolean {
  return this.build.isFree(spot.index)
}
```

`hudStandsOn` and `syncPadVisibility` are gone, and the per-frame call in
`update` with them. `drawSpots` — on the **board** clock — is the only caller,
which is correct because the board clock is now the only clock the answer moves
on. Every `build.occupy`/`build.release` in the scene is followed by a
`drawSpots`; the one that is not (restoring a saved run) runs *before*
`createPads`, which ends by drawing them, and says so in its own comment. The
padlock icon is kept in step in `drawSpots` instead of in the deleted pass.

**Why this is not just "delete the fix".** The premise of attempt 2 was that a
pad under a medallion "reads as a rendering fault". A build pad is a world
object exactly like a tower, an enemy, the hero, the road and the plate, **none
of which has ever been hidden for being under the HUD**, and singling out the
pads is what created a defect the other five do not have.

### What it costs, stated plainly

**A pad under one of the five pressable controls is visible and not tappable at
that camera position.** That is the honest gap against the brief's property as
literally written, and it is the price of not paying route (a)'s 40%. It is
bounded, and the bound is already asserted: `tests/hudpads.test.ts`'s
reachability test proves that all 151 pads on all ten levels have a zoom and a
camera position inside the plate where a 44 pt clear circle lands on the pad
free of every HUD rectangle, at six viewports with and without a notch.

Two things got **better** rather than worse:

- Under the two **readouts** a pad is now visible *and* tappable. Before, it was
  hidden and tappable — the player pressed bare grass and a ring opened.
- 29–35% of the hiding was never justified by anything the player could see.

### FRAME — does a pad under a medallion read as a fault?

No. `sh tools/harness/run.sh padhud 400 844x390` screenshots each level at the
opening camera, and level 1 has pads 3 and 5 under the HUD there:

```bash
python3 tools/harness/shrink.py tools/harness/shots/padhud-level1-844x390.png 1100 --crop=140,290,620,100
```

The crop is the bottom band. A flagstone pad sits on the grass beside the coin
medallion, partly behind it — and it reads exactly like the rocks, the water,
the bushes and the road in the same strip, all of which are also partly behind
those icons. The medallions are opaque painted art with their own hard
outlines; a pad behind one reads as *behind a button*, which is what it is.

**Not the camera, not the HUD's geometry: the pad.** Nothing in `CameraRig`,
`CameraMath` or `display.json` was touched, and `tests/hudpads.test.ts`'s
`the camera is NOT given the HUD band as slack` still guards the first attempt.

---

# Step 3 — the test that did not catch this

## What was there, and why it passed

`no HUD element overlaps a VISIBLE build pad, on any level` asserted that
`padShowing` **exists**, that `drawSpots` **calls** it, and that
`syncPadVisibility` **re-answers it every frame**. Every one of those was true
while the bug was live — it pinned the implementation and never asked what the
implementation does when the camera moves. It is **replaced**, not extended:

- `the HUD does stand on pads at rest, and that number is recorded` keeps the
  measurement (it is a true fact about a full-bleed map) and drops the assertion
  that was pinning attempt 2.
- `no build pad changes visibility as the camera moves` is the property.

## The new test

Two parts, and the first is what keeps the second honest.

**Part 1 — the pan, as evidence.** It walks the reachable camera box on every
level at every zoom in the band, at all four landscape viewports, and counts the
pads a screen-space HUD rule would flip. It asserts `flipped.length > 0` and
`sampled > 100000`: if the HUD ever stops reaching the board, or the sample
stops moving the camera, the test says so instead of passing vacuously.

**Part 2 — the property.** Nothing in `tests/` imports Phaser, so no arithmetic
here can see what `GameScene` actually does. What can be checked is that the
decision **reads no term the camera moves** — a rule that is a function of world
state satisfies the property by construction. The regex refuses
`worldToScreen`, `cameras.main`, `this.layout`, `hudStandsOn` and `deviceScale`
inside `padShowing`, and separately refuses `hudStandsOn` and
`syncPadVisibility` anywhere in the file, so the rule cannot come back through a
side door.

**It fails before the fix and passes after**, and the failure carries the
evidence:

```
not ok 6 - no build pad changes visibility as the camera moves
  error: 'padShowing reads a screen-space term, so its answer moves with the
  camera. 604 pads flip under a pan when it does — for example
  667x375 level1 pad 0, 667x375 level1 pad 1, 667x375 level1 pad 2.'
```

604 is 151 pads × 4 landscape viewports.

`tests/buildpad.test.ts`'s `a pad disappears under the tower built on it` also
moved off the old two-branch body onto the property, and gained a guard that
`padShowing` has not grown a second condition.

## And the rendered-frame half: `run.sh padpan`

The tests/ suite cannot see a pixel. `padpan` drives the real scene: it starts
each of the ten levels, sets the world camera's background to **magenta**, and
for each of three zooms drives the rig to the nine corners, edges and centre of
the reachable box — **sampling every pad's `visible` every 30 ms through the
ease**, which is the pan itself rather than its endpoints.

It asserts, in one run:

1. no free pad's drawn state flips;
2. **0.000% magenta** anywhere in the frame at any of those positions;
3. the view never reaches past the plate;
4. the same two after a hard fling in each of the four directions;
5. a pad tapped **at its drawn position** still opens its build ring.

Items 2–4 are there because the last two passes each broke what the one before
fixed. Proving one property without the other is how this gets to a fourth
attempt.

The magenta is not decoration: `edges` learned the hard way that counting dark
pixels reports 43% void on level 9 with the camera provably inside the plate,
because that board is painted darker than the clear colour. A camera fills its
viewport with its background before anything draws, so magenta left in the frame
is a pixel the plate did not cover, and no artwork can imitate it.

---

# Verification

Everything marked **FRAME** came off a rendered frame from `tools/harness/`.

## FRAME — pan every level, before and after

`sh tools/harness/run.sh padpan 2400 <viewport>`, ten levels, three zooms, nine
camera targets, sampled every frame of the ease:

| viewport | pads | samples | flipped BEFORE | flipped AFTER | worst void | worst past the plate |
|---|---|---|---|---|---|---|
| 844×390 | 151 | 3510 | **151** | **0** | 0.000% | 0.0 px |
| 1400×900 | 151 | 3510 | *(not run)* | **0** | 0.000% | 0.0 px |
| 667×375 | 151 | 3510 | *(not run)* | **0** | 0.000% | 0.0 px |

All three exit 0, so every `expect()` in the scenario passed, not just the flip
count. The before/after **pair** was run at 844×390; the other two viewports were
run after the fix only, and their before-figures are the arithmetic sweep above
— 151/151 at 667×375, 149/151 at 1400×900. Portrait (375×667, 390×844) is gated
by the rotate overlay and is not a pad-visibility question at all.

## FRAME — the black band, in the same runs

| | 844×390 | 1400×900 | 667×375 |
|---|---|---|---|
| worst magenta anywhere, ten levels, 27 camera positions each | **0.000%** | **0.000%** | **0.000%** |
| worst view past the plate | **0.0 px** | **0.0 px** | **0.0 px** |
| after a hard fling left / right / up / down | 0.0 px, 0.000% | 0.0 px, 0.000% | 0.0 px, 0.000% |

The flings land the view flush against each wall of the 1280 × 720 plate and
never past it — at 844×390 `x 1..357`, `x 923..1279`, `y 1..166`, `y 555..720`;
at 1400×900 `x 182..773`, `x 689..1280`, `y 0..380`, `y 340..720`; at 667×375
`x 23..304`, `x 998..1279`, `y 1..159`, `y 562..720`. **It still clamps back
after an overscroll**, on every one.

## FRAME — no HUD element hides a pad, at any camera position

`run.sh padhud 400 844x390`, at each level's opening camera:

```
level1  pads 7   under the HUD at rest 2, of which still DRAWN 2   visible 7
level2  pads 15  under the HUD at rest 6, of which still DRAWN 6   visible 15
level3  pads 15  under the HUD at rest 2, of which still DRAWN 2   visible 15
level4  pads 14  under the HUD at rest 3, of which still DRAWN 3   visible 14
level5  pads 14  under the HUD at rest 3, of which still DRAWN 3   visible 14
level6  pads 18  under the HUD at rest 7, of which still DRAWN 7   visible 18
level7  pads 22  under the HUD at rest 0, of which still DRAWN 0   visible 22
level8  pads 19  under the HUD at rest 5, of which still DRAWN 5   visible 19
level9  pads 15  under the HUD at rest 3, of which still DRAWN 3   visible 15
```

`visible` equals the pad count on every level. **Every pad is drawn, everywhere.**
That scenario's RESULT line used to star this as a fault and now reports it as
the expected answer, with a pointer to `padpan` for the property.

## FRAME — every pad still buildable and tappable at its drawn position

`padpan` taps three pads at the position read off the **sprite**, not off the
map, so the tap is where the player sees the pad. All three opened their build
ring at all three viewports:

```
844×390    pad 0 (421, 194)  pad 1 (421, 194)  pad 2 (421, 194)   ring opened, 2 options each
1400×900   pad 0 (700, 270)  pad 1 (506, 359)  pad 2 (671, 435)   ring opened, 2 options each
667×375    pad 0 (332, 186)  pad 1 (332, 187)  pad 2 (334, 187)   ring opened, 2 options each
```

## FRAME — the layout audit, both orientations

`sh tools/harness/run.sh screens 300 <viewport>`, walking Title, WorldMap, all
five Loadout heroes, Cutscene and the Game board:

| viewport | result |
|---|---|
| 375×667 | **portrait, gated** — the rotate overlay, which is the correct answer for a landscape-only game, not a skipped check |
| 667×375 | 1 fault: `SMALL Title [title:version-stamp (hidden dev door, not a tap target)]`. **5-GAME: 0 faults** |
| 390×844 | **portrait, gated** |
| 844×390 | 1 fault: the same version stamp. **5-GAME: 0 faults** |
| 1400×900 | **no layout faults** |

The version-stamp fault is pre-existing and long documented — the hidden
five-tap dev door, deliberately under 44 pt and self-labelled, recorded in at
least six earlier reports going back to 2026-09-06. It is on the Title screen,
which has no build pads. **The Game screen is clean at every viewport.**

## Tests and typecheck

| | |
|---|---|
| `npm test` | **1157 passing, 0 failing** (1156 before; the replaced test became two) |
| `sh tools/tsdiff.sh c1682ab` | baseline 214 errors, working tree 214 — **nothing introduced** |
| CI `npx tsc --noEmit` on `d7036cc` | **success** (the only complete typecheck; there is no `node_modules` here) |

---

## What was NOT checked

- **Portrait is gated, not audited.** 375×667 and 390×844 get the full-screen
  rotate overlay with the scene paused behind it, so a pad-visibility pan in
  portrait measures nothing a player can reach. Their landscape forms
  (667×375, 844×390) are both covered.
- **No real device.** Headless Chromium at `dpr 3` on the Canvas2D path.
- **`padpan` does not build a tower on every pad on every level** — it opens
  three rings on one level per viewport. The full build path is covered by `ui`,
  `skilled` and `level9`.
- **The before/after padpan pair was only run at 844×390.** Running the old tree
  at the other two would have meant reverting and rebuilding twice more; the
  arithmetic sweep covers them and agrees with 844×390 where both were measured.
- **The `level9` scenario's three pre-existing faults are still there** —
  4 scenery items declared against 8 built (twice), and the harness's own save
  state making START RUN pick level 10. Reproduced on an unmodified tree on
  2026-09-15 and untouched by this work.

## A third defect, found and NOT fixed

**`cancel` is reserved in the layout always and takes the press always, but is
only DRAWN when there is something to cancel.** `hudTakesPress` includes
`layout.cancel` unconditionally, while `GameScene.setCancelVisible` hides the
slab and the glyph when `targeting.active`, `drawerPick` and `pendingSpot` are
all empty. So a 116 × 48 rectangle in the bottom-right corner swallows taps with
nothing visible there — and a pad drawn under it is visible and not tappable
**with no visible cause**, which is the one case that genuinely violates the
brief's property rather than trading against it. It accounts for 1.8% of the old
culls at 844×390.

It is left alone deliberately. It is a different defect in input plumbing with
its own long history (`chromeUnderPointer`'s "one question, two askers"), the
brief is about pads and the camera, and every previous pass here broke something
by reaching one step further than it was asked to. **It is written down as an
open item instead.**

---

## Where this leaves the repository

- **`main` is at the commit above** and its tree contains the files; read back
  from GitHub after the push.
- **Nothing is in flight and nothing is blocked.** No branch, no PR.
- **The camera, the scroll clamp and camera bounds were not touched**, and the
  guard against attempt 1 (`the camera is NOT given the HUD band as slack`) is
  still green.
- **This closes the HUD-versus-pads question**, and the shape of the answer is
  worth keeping: the two failed attempts both tried to make the *geometry* agree
  — one by moving the camera, one by moving the drawing — and the answer was
  that a world object's visibility is not a screen-space question at all.
- **Open, carried forward:**
  - **NEW:** `cancel`'s reserved rectangle takes presses while invisible (above).
  - Level 7's spawn and exit badges are invisible on the Highway; ~9 luma of
    contrast, an **art** job.
  - `run.sh drawer`'s two pre-existing findings — 6 of 7 towers visible, and
    re-tapping the selected tile not cancelling — both wanting a decision, and
    both wanting the harness's duplicate tile centres established first.
  - Level 9 declares 4 scenery items and builds 8; two of `run.sh level9`'s
    three faults.
  - The soak understates level 10 for an **incomplete** board.
  - **Route (a) remains available** if the full-bleed map is ever traded away:
    the price is in this report, and the way to do it is a real viewport inset,
    never a bounds margin.
