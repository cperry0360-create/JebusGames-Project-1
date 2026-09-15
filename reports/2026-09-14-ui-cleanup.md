# Seven UI and presentation defects from live play

Reported from a screen recording at 1320x608. Each was confirmed from a rendered
frame before it was touched, and each fix was verified the same way. Six needed
code; the seventh is an art job and nothing was changed for it.

| commit | what | CI |
|---|---|---|
| [`66a0ab3`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/66a0ab3) | the six fixes, their tests, and the five harness scenarios that see them | [run 387](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34924028663) — `changes`, `typecheck`, `test`, `deploy / build`, `deploy / deploy` all **success** |
| [`c1682ab`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/c1682ab) | a frame per peanut value in the `counters` scenario | [run 388](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34926262299) — all five jobs **success** |
| [`195ad71`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/195ad71) | this report, and `claude/context.md` reconciled | [run 389](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34926593896) — `changes`, `typecheck`, `test` **success**; `deploy` **skipped**, correctly: a markdown-only push does not republish |

The table closes there. A CI row for the commit that writes the CI row needs a
further commit, forever, so the last one is stated rather than regressed.

`main`'s tree on origin contains all of it. Verified by reading the remote ref
rather than the local one: `git ls-tree origin/main` lists `tests/costs.test.ts`
and `tests/readouts.test.ts`, and `origin/main` is at `c1682ab`.

## The three answers the brief asked for up front

**1. The pad-overlap test existed and was passing while the overlap was
visible — and it was not the test the brief described.** `tests/hudpads.test.ts`
was green throughout. Its one relevant test is
`every build pad on every level can be brought out from under the HUD`, and it
asserts **reachability**: for each pad there is some camera position and zoom
at which a 44pt clear circle lands on it. It does not assert that no HUD
rectangle ever covers a pad, and its own header says so — the map is full-bleed
by design, the HUD floats over it, and at-rest coverage is a consequence of
that, not a bug in the layout. So the green was honest about the property it
measured and silent about the one live play saw. That is still a bug in the
test suite as a whole: the brief's property was never asserted anywhere. It is
now — `no HUD element overlaps a VISIBLE build pad, on any level`, added to the
same file, and it failed before the fix.

**2. The zero-cost upgrade came from `GameScene.towerRingOptions`, not from a
data file and not from a fallback.** The upgrade slot is emitted
**unconditionally** so that SELL can never inherit ring position 0. When there
is nothing to buy — mid-upgrade, or fully built out — that slot used to carry
`price: 0`. `buttonLabel` already special-cased 0 and printed the bare verb, so
the confirm button read "Upgrade"; but the price **badge** under the ring icon
printed `String(0)`, which is indistinguishable from a free upgrade. It now
carries `price: null` and draws no badge. `RingOption.price` is
`number | null`, and `buttonLabel` takes `number | null`.

The 201 in the recording identifies the panel exactly: `shelter` (the Beacon)
invested through tier 2 is 140 + 196 = 336, and `sellValue` is
`floor(336 x 0.6)` = **201**. So it was a Beacon mid-upgrade to tier 2, with
`reason: 'Already building. Wait for it to finish.'`, and SELL offering its
refund beside a price of nothing.

**3. The marker inset is 6.0 badge widths** — 140 world px at the shipped badge
size. The measurement is in the table below; 5.871 is the smallest value that
works and 6.0 is the first clean number above it.

---

## 1 — The peanut counter clipped at four digits

**Confirmed, and worse than reported.** `tools/harness/run.sh counters` reads
the live `HudScene` plates and text objects in a real run:

| value | plate | field | text | before |
|---|---|---|---|---|
| 100 | 48.3x20.0, 1 piece | 30.0 | 26.0 | **5.0px past the field**, 2.1px past the plate |
| 800 | 48.3x20.0 | 30.0 | 26.0 | **5.0px past the field** |
| 1012 | 48.3x20.0 | 30.0 | 34.0 | **13.0px past the field**, 10.1px past the plate |
| 10000 | 48.3x20.0 | 30.0 | 42.0 | **21.0px past the field**, 18.1px past the plate |

So it was not clipping at four digits, it was clipping at **three** — 800 was
already 5px outside the painted field, it just had not yet reached the pill's
dark border. At 1012 it crossed the border, which is the frame the recording
caught.

Two causes, both fixed:

- **The pill was one image.** It now loads as a **three-slice**: `Texture.add`
  cuts `pill-l`, `pill-m`, `pill-r` out of the same source at load, and the
  middle piece stretches. `hud.layout.readoutDigits` (5) says how wide a field
  to reserve, measured as `'8'.repeat(n)` through the real `Text` object rather
  than assumed from a glyph width.
- **`hud.numberMargin` was a flat 9 CSS px** authored for the 44px-tall plates
  this corner used to carry. The readouts were shrunk to `readoutHeight: 20`
  in an earlier pass and the 9 was never rescaled, so it was insetting a
  30px field by 9px and leaving 21px for a 26px number. Retired, with its
  `_numberMargin` note left in place recording why. Replaced by
  `hud.layout.readoutFieldPad: 0.1`, a fraction of the plate's height, which
  cannot come loose from it again.

**After, from rendered frames** (`counters-peanuts-<value>-667x375.png`, one
per value, and the same at 844x390 and 1280x720):

| value | plate | field | text | |
|---|---|---|---|---|
| 100 | 48.3x20.0, **3 pieces** | 30.0 | 26.0 @scale 1.00 | inside |
| 800 | 48.3x20.0 | 30.0 | 26.0 @scale 1.00 | inside |
| 1012 | **56.3**x20.0 | 38.0 | 34.0 @scale 1.00 | inside |
| 10000 | **64.3**x20.0 | 46.0 | 42.0 @scale 1.00 | inside |
| 99999 | 64.3x20.0 | 46.0 | 42.0 @scale 1.00 | inside |

**The font did not shrink.** Every row is `@scale 1.00`, and `rowFor` asserts
a hard floor of 11px rendered — the brief ruled out solving this by shrinking
the number and the scenario enforces it rather than trusting it.

**Lives and wave, at their own maximums, as asked.** Lives was not clipping,
but it was failing the other way: at 999 it was being auto-shrunk to
`@scale 0.60`, which is **9.0px of type** — under the legibility floor. The
same three-slice fixes it: 999 now draws at scale 1.00 in a grown 48.5px pill.
Lives peaks at 40 in Lazy Dad; 999 is checked anyway because nothing stops a
level table asking for it. The wave readout is the wave control's label, not a
pill, and it was already inside at every value: `▶ WAVE 18` is 94.0 in 112.0
(12.4px), mid-wave `18/18 · 48` is 81.0 in 112.0 (13.0px).

`tests/readouts.test.ts` (4 tests) guards the three-slice, the retired key, and
the reserved corner width.

## 2 — Text overflow on the loadout screen

**Confirmed. Ten strings overflowed, all at phone widths, and all on the same
card.** `tools/harness/run.sh everyloadout` walks 19 hero/tower/ability
combinations at four viewports and measures each `Text` object's real bounds
against the **painted** frame inset.

**The first red result was wrong and the harness was the bug — three times.**
This is worth recording because all three looked exactly like the product
defect:

1. `LoadoutScene` writes `setData('overlaps', true)` and the scenario never
   read it, so the scene's own answer was discarded.
2. The scenario walked `Object.keys(heroes.json)` as a hero list, which
   includes `_artFacing`, `_note` and `_stats`.
3. It had no `expect()` and no RESULT line, so it exited 0 regardless of what
   it printed.

That reported **56** overflows. With those three fixed: **12**. Then a fourth:
the safe box was computed as `frameInsetFor(cw, pb.height + 10)` with default
chrome, while the scene pins to `LO.cardProbeHeight` with `cardChrome(cw)` — a
difference of up to 22.0px at 667x375. With the painted inset: **10 real**.

All ten were one card — Slingshot on the loadout picker at 667x375 and
844x390 — and one root cause in two halves:

- **`cardIconColumnMin` won on a narrow card, and won badly.** Five specials
  across an 844-wide screen is a 150-unit card: the share asks for 34 units of
  icon column, the minimum insists on 62, and the icon takes 41% of the card
  leaving the text a 75-unit column. New key
  `loadout.cardIconColumnCapShare: 0.28` caps the column at a share of the
  card; on that card it comes down to 42 and the text gets 83. On a wide card
  `cardIconColumnShare` is already above the cap and nothing moves.
- **The size ladder only checked height.** `if (total <= room) break` stepped
  the body size down until the block fit vertically and never asked whether the
  widest line fit the column. It now checks both axes, and when even the
  smallest size does not fit, scales the block with a floor of
  `loadout.cardTextMinScale: 0.66`.

**Why a scale floor is needed at all, and why 0.66.** `abilityLine` ends its
bodies `26s cooldown` with a **non-breaking space** — which is correct, a
number belongs with its unit — and Phaser's `wordWrap` cannot break a single
token. That is a 116-unit token no wrap width can split. The narrowest text
column the layouts produce is 79 units (desktop, specials beside the towers)
and 83 (844x390, five across), so the worst case needs 79/116 = 0.681. 0.66
leaves a little. Deliberately not `fitWithin`'s 0.7, which is a different
control with a different worst case.

**After, from rendered frames:** `RESULT 19 loadout combinations, nothing
outside its container` at 667x375, 844x390 and 1280x720, EXIT=0 at all three.
In portrait (375x667, 390x844, 720x1280) the game does not reach the loadout at
all — the rotate gate holds the title screen, which is the correct answer for
portrait — and the scenario forces the scene anyway and reads clean there too.

## 3 — The ability bar sat on build pads

**The 2026-09-13 claim was not wrong, the fix did not regress, and the ability
bar was not out of scope.** It is a different property, and the report said so
in its own words. Taking the three possibilities the brief offered in turn:

- *Was the claim wrong?* No. `reports/2026-09-13-hud-cleanup-and-level-8.md`
  claimed **reachability** at both edges, gave the per-element before/after
  table, and closed with a section headed "What remains: at-rest overlap, which
  is irreducible" — stating that the board exactly fills the screen at cover
  zoom, that zero-at-rest needs a letterboxed map (tried, reverted), and that
  "every affected pad can now be panned clear, which is the property that
  decides buildability". That was accurate and it is still accurate.
- *Did it regress?* No — but the route it took **is gone**, and had to go. That
  fix worked by handing the camera slack past the plate so an edge pad could be
  nudged out from under a band, and that slack was the black-beyond-the-map
  the next brief reported. It was reverted in `2026-09-15-blockers.md`. So the
  camera answer is closed and must stay closed.
- *Was the ability bar in scope?* Yes. It is named in that report's own
  before-column on every level that had it: `abilities` x 8 at 667x375,
  x 9 at 844x390, x 3 at 1280x720.

**So the fix is at the same root cause as the top edge, which is what the brief
asked for — but the cause is a drawing one, not a camera one.** A pad disc
peeking out from behind an ability medallion is not a reachability problem.
`GameScene.padShowing(spot)` now returns false when `hudStandsOn(spot)` does,
and `syncPadVisibility()` re-answers it for every pad **every frame**, because
the camera moves every frame and `drawSpots` runs only on a board change — the
wrong clock for a question whose answer is a screen position. The padlock art
goes with its pad, or a padlock would sit where the disc used to peek out. The
pad is still there, still tappable through `spotAt` when the HUD is not in the
way, and still reachable.

**The test first, then the overlap, in that order.** The brief asked for that
and it is what happened: `no HUD element overlaps a VISIBLE build pad, on any
level` went into `tests/hudpads.test.ts` and failed, then `padShowing` made it
pass. `tools/harness/run.sh padhud` gained a "still DRAWN" column, and its
"UNREACHABLE" column was relabelled "not freed BY PANNING ALONE", which is
what it actually measures now that the camera slack is gone.

**Measured from rendered frames, at 844x390, pre-fix tree vs. main** (the
pre-fix run is a worktree at `f4021cf` with today's harness copied in, so the
only difference is the game):

| level | pads under the HUD at rest | **drawn** before | **drawn** after |
|---|---|---|---|
| 1 | 2 | 2 | 0 |
| 2 | 6 | 6 | 0 |
| 3 | 2 | 2 | 0 |
| 4 | 3 | 3 | 0 |
| 5 | 3 | 3 | 0 |
| 6 | 7 | 7 | 0 |
| 7 | 0 | 0 | 0 |
| 8 | 5 | 5 | 0 |
| 9 | 3 | 3 | 0 |
| 10 | 2 | 2 | 0 |

33 drawn before, 0 after. `EXIT=5` (reported fault) before, `EXIT=0` now, and
the same `EXIT=0` at 667x375 and 1280x720.

## 4 — The build drawer stayed open

**Not intended.** It stayed open for the final 23 seconds of the recording, and
`tools/harness/run.sh drawer` confirms it was open after every gesture that
closes every other panel. It now collapses on all five, at the five sites that
already clear the rest of the selection state:

| gesture | site | before | after |
|---|---|---|---|
| building | `placeFromDrawer` | open | closed |
| selling | `sellTower` | open | closed |
| cancelling | `clearSelection` | open | closed |
| tapping the board away from it | `onClick`, bare ground with a pick | open | closed |
| starting a wave | `clearSelection` | open | closed |

`drawer` went from 7 reported problems to 2, and the `drawer` scenario itself
had to be fixed first: it carried a stale layout key (`heroRow`, renamed to
`heroChip` in the HUD pass) and threw `Cannot read properties of undefined` on
its first `hits()` call, **before any drawer check ran at all**. It had been
reporting nothing for as long as that rename has been in.

**The two problems that remain are pre-existing**, confirmed by running the same
scenario against the `f4021cf` worktree, where both appear identically:

- `the drawer shows 6 of 7 towers` — the seventh is below the fold of a
  scrolling grid with `maxScroll 80`; whether that is a defect is a design
  question, not this brief's.
- `re-tapping the selected tile did not cancel` — tiles 2/4 and 3/5 report the
  same centre, so the scenario's own tile enumeration may be at fault here
  rather than the drawer. Not chased; recorded.

## 5 — An upgrade priced at zero

Origin and arithmetic are in answer 2 above. What is new here is the guard the
brief asked for.

`tests/costs.test.ts` walks **every** `.json` under `src/data/` (45 files),
recursing the whole tree, and fails if any `cost`, `price` or `*Cost` number
resolves to 0. It checks **30** of them today: 29 tower and specialization
costs plus `signBribe`. `livesCost` is deliberately excluded — that is what an
enemy takes off the player when it escapes, and a 0 there is a different bug in
a different direction. A second test resolves `nextStep`, `specById` and
`statAt` at every tier and every branch of every tower and asserts each
returns a real positive cost, so a *fallback* that quietly produced 0 would
fail too. A third pins `buttonLabel`'s behaviour for `null`.

**This guards the fault that was suspected rather than the one that happened,
which is the point of it.** Nothing in `src/data/` carries a zero cost today.
The badge read 0 because the scene passed 0, not because a number was missing.
But a genuine zero, or a fallback resolving to one, would look identical on the
glass and would actually give the upgrade away — so it is now impossible to
land one unnoticed.

From a rendered frame at the exact state live play reported (`t2.upgrading ===
true`, `towerring-nothing-to-buy-844x390.png`):

```
slot upgrade  price null badge ""  "Already building. Wait for it to finish."
slot sell     price 115 badge "115"
```

## 6 — Spawn and exit markers too loud and too close to the edge

### (a) Alpha 1.0 -> 0.7

Done, and it holds. Shipping at 1.0 was deliberate — the `_alpha` note said the
number existed so the badges could be turned down without a re-render once they
read as clutter, which is exactly what live play reported — and it has now been
judged.

**Measured at 844x390, badge luma against the plate immediately beside it, at
0.7:**

| plate | contrast | |
|---|---|---|
| level 8 | 94 | |
| level 9 | 84 | dark machine board, light badge |
| level 6 | 80 | |
| level 1 | 51 | the brightest plate; still reads as furniture on grass |
| level 10 | 49 | |
| level 4 | 8.5 on the upper spawn | |
| **level 7** | **~9 on all six badges** | **the worst plate** |

**The brief asked which plate 0.7 makes hard to find and what value was settled
on instead: level 7, and the answer is still 0.7, because alpha is not the
control that fixes it.** Alpha blends toward the plate, so contrast scales
linearly with it: 1.0 takes level 7 from 9.2 to 13.1, which is still nothing.
The Highway is dark asphalt and the badge art is dark, so the two are the same
luminance. Separating them needs a light halo or a darker outline **in the
picture**. Recorded as an art item below rather than papered over with a number
that cannot work.

### (b) The inset

New key `markers.insetBadgeWidths`, authored in **badge widths** as asked, for
the same reason `arrowOffset` is a fraction: the badge is specified by its
screen width and a pixel inset would silently stop being enough the moment
`badgeScreenWidth` moved.

`Markers.walkAlong(w, from, dist)` walks the lane's own polyline from its
terminal waypoint and returns a point and the tangent angle there, so the badge
slides **along its lane** rather than toward the middle of the map, and the
arrow still points along direction of travel. It applies only to a terminal
that is **off the plate**, which is every computed gateway point and is the
whole of the fault. Level 9's door at (1177, 329) is an exit *inside* the plate
and does not move: the badge there means "they get out HERE", and walking it
140px up the road would point it at a piece of lane that is not the exit.

**The measurement, over all 32 markers on all ten levels, badge and rotated
arrow bounding boxes against the 1280x720 plate:**

| inset (badge widths) | markers | outside the plate | worst overhang | rescued by `clampToPlate` |
|---|---|---|---|---|
| 0.00 | 32 | **15** | 10.6 px — level 6 exit lower | **27** |
| 1.00 | 32 | 15 | 10.6 | 27 |
| 2.00 | 32 | 15 | 10.6 | 27 |
| 3.00 | 32 | 15 | 10.5 | 27 |
| 3.50 | 32 | 13 | 6.9 | 3 |
| 4.00 | 32 | 3 | 7.2 | 2 |
| 4.50 | 32 | 3 | 6.8 | 1 |
| 5.00 | 32 | 2 | 5.6 | 1 |
| 5.50 | 32 | 1 | 1.2 | 0 |
| **6.00** | **32** | **0** | **0.0** | **0** |
| 7.00 | 32 | 0 | 0.0 | 0 |
| 8.00 | **33** | 0 | 0.0 | 0 |

- **smallest inset with nothing outside the plate: 5.871 badge widths**
- smallest inset that also needs no clamping at all: 5.873
- **chosen: 6.0** — 140 world px at the shipped badge size, the first clean
  value above the measurement

The "rescued by `clampToPlate`" column is the reason this needed fixing at all.
Pre-fix, **27 of 32** badges were being pulled back inside the frame by the
clamp and pinned at 12 world px from the edge (half a badge width) — flush to
the plate boundary, which is precisely "too close to the edge". At 6.0 the
clamp fires on **nothing**: the inset does the work and the clamp is a backstop
rather than the mechanism.

Marker positions at 844x390, before and after, from the `lanemarkers`
scenario's own read of the live scene:

```
before  level7  S:north@12,151   E:north@1268,151   ... alpha 1
after   level7  S:north@80,151   E:north@1200,151   ... alpha 0.7
before  level9  S:north+south@12,324   E:tail@1177,329
after   level9  S:north+south@80,321   E:tail@1177,329      <- the inside exit did not move
```

**Level 9 was checked, as asked, and the brief's worry is real but does not
bite at 6.0.** Its two entrance lanes share a painted mouth and are traced from
the same point, so insetting them walks them along two different arms and could
in principle pull them apart into two badges on top of one mouth. At 6.0 they
are still within one badge width of each other and `mergeWithin: 1.0` still
draws **one** badge — the count is 32, not 33. It stops being one at about
**8.0** badge widths, where the two arms have diverged far enough to read as
two, which is a second reason not to inset further than the measurement asks
for. `mergeWithin` is unchanged, `arrowOffset` is unchanged at 0.736.

`lanemarkers`: `RESULT 244 checks on the lane markers, all passing`, EXIT=0.
`tests/markers.test.ts` gained two tests; its alpha guard was pinned at exactly
1.0 and had to be replaced — it is now a band guard (>= 0.5, < 1) plus an
equality check on the shipped 0.7, so the next session that turns it down has
to mean it.

## 7 — The castle tower on wheels

**It is baked into the art, so nothing was changed. That is the brief's own
instruction for this case.**

There is no shared base sprite. `Tower.ts` constructs exactly three things per
tower — a shadow, one `scene.add.sprite(0, 0, opening)`, and a `Graphics` for
the tier pips — and its own comment records that the manifest used to point at
a Kenney placeholder tile for a base and that the painted towers made it
redundant. Skinning is a key-for-key texture swap in `art.json`'s `towerSkins`
(`turret-ledger` -> `turret-ledger-machine`, 14 keys across 11 towers and 3
blocker soldiers, on `level9` and `level10` only); every skinned tower is its
own complete WebP.

**The wheels are a stack of tyres painted into the Slingshot's tier-2 and
tier-3 art**, part of a garage/workshop scene at the foot of the castle turret
alongside a roll-up door, a ladder, a lit torch, a red toolbox and a blueprint
pinned to the wall. `tools/harness/run.sh skins` renders all 11 towers, plain
above and machine below, in one frame at full device resolution
(`skins-844x390.png`), and the tyres appear on `turret-ledger-t2` and
`turret-ledger-t3` and on **no other tower** — which is the proof that it is
per-tower art rather than a shared plinth. A shared base would put identical
wheels under all eleven.

So there is nothing to exempt and no code to write. `tests/towerskins.test.ts`
gained a test asserting `Tower.ts` adds no image under the turret, so if a
shared base is ever introduced the question becomes a code one again and this
answer stops being true silently.

---

## How this was verified

No browser and no `npm run dev`. `npm install` answers 403 in this
environment, so `tsc` cannot resolve `phaser` and its output is meaningless.

- `sh tools/tsdiff.sh f4021cf` — baseline **214** distinct errors, working tree
  **214**, **none introduced**.
- `npm test` — **1154 passing, 0 failing**.
- `sh tools/harness/build.sh` then `sh tools/harness/run.sh` at 667x375,
  844x390 and 1280x720, in both orientations, plus `INSETS=0,47,21,47`.

Scenarios used, with their exit codes on `main`:

| scenario | result |
|---|---|
| `counters` (new) | EXIT=0, every readout inside its field at every value, at all three viewports |
| `everyloadout` (fixed + gated) | EXIT=0, 19 combinations, nothing outside its container |
| `padhud` (extended) | EXIT=0, no pad drawn under the HUD, at all three viewports |
| `drawer` (fixed + extended) | EXIT=5, 2 problems, both pre-existing at `f4021cf` |
| `towerring` (extended) | EXIT=0, the nothing-to-buy slot is `null` and draws no badge |
| `lanemarkers` (extended) | EXIT=0, 244 checks |
| `skins` (new) | EXIT=0, 11 towers in one frame |
| `screens` | EXIT=5 at both phone widths, **1** fault, pre-existing |

### What the `screens` audit still reports, and why it is not this brief's

- **667x375 and 844x390, no insets: 1 fault.** `SMALL Title
  [title:version-stamp (hidden dev door, not a tap target)]` — an 80x28
  rectangle. Carried in four earlier reports. It is a deliberate hidden dev
  door, not a control.
- **667x375 with a notch: 4 faults**, all on the **Title** screen — the same
  version stamp as NOTCH and SMALL, `NOTCH Title [audio:mute]`, and an
  `OVER` between two 44-tall Title rectangles. **Identical, to the pixel, on
  the `f4021cf` worktree**, so all four predate this session and none is on a
  screen it touched.
- **1280x720: no layout faults.**
- **Portrait (375x667, 390x844): `RESULT portrait is gated`.** The rotate
  overlay holds and the screens behind it are not a player-facing layout. That
  is the correct answer for portrait, not a skipped check.

### What was NOT checked

- **Nothing was measured on a real device.** Every frame here is Chromium at
  `devicePixelRatio` 3 in the harness.
- **The camera, the scroll clamp and camera bounds were not touched**, as
  instructed — a separate session owns them. `padShowing` is deliberately a
  drawing rule for exactly this reason, and `CameraMath` and `CameraRig` are
  unmodified in both commits.
- **`tsdiff` is blind to anything that is not an error locally.** Without
  `node_modules` every Phaser type is `any`, so an access rule cannot fire
  here. This diff touches `Texture.add` and `textures.get(...).has(...)` in
  `HudScene.buildCounters`, which is the exact shape of thing that has reached
  CI as a `TS2445` before. CI run 387's `typecheck` job is the first thing that
  could answer, and it passed.
- **The test suite still cannot see Phaser at all.** 1154 passing says nothing
  about a rendered pixel. Everything visual above came from the harness.
- **Level 7's badge contrast is not fixed** and cannot be fixed from JSON.
- The two pre-existing `drawer` findings were recorded, not chased.

---

## Where this leaves the repository

**Nothing is in flight.** Both commits are on `origin/main`; run 387 is green
on all five jobs including `deploy / deploy`, so the live site carries the six
fixes.

**Open, and carried forward:**

1. **Level 7's spawn/exit badges are invisible on the Highway** — ~9 luma of
   contrast on all six, and level 4's upper spawn at 8.5. **An art job**: the
   badge art and the asphalt are the same luminance, and no value of `alpha`
   changes that. Wants a light halo or a darker outline in the picture.
   Everything else about the markers is finished.
2. **`drawer` reports the build drawer shows 6 of 7 towers.** Pre-existing, and
   a design question (the seventh is below the fold of a grid with
   `maxScroll 80`) rather than a bug. Worth a decision.
3. **`drawer` reports re-tapping the selected tile does not cancel.**
   Pre-existing. The scenario's own tile enumeration reports duplicate centres
   for tiles 2/4 and 3/5, so the harness may be at fault rather than the game.
   Needs someone to establish which before it is treated as a defect.
4. **The Title screen's version stamp trips `SMALL`, and trips `NOTCH` on a
   notched 667x375**, along with a `NOTCH` on the mute button and an `OVER`
   between two Title rectangles. Four faults, all pre-existing, all on one
   screen, none touched here. This is the fifth report to carry the version
   stamp; the notched trio is newly pinned to a pre-fix tree so it can stop
   being re-diagnosed.
5. **At-rest pad coverage is still a fact**, and now deliberately so: 33 pads
   across the ten levels sit under a HUD rectangle at the opening camera at
   844x390, and the answer is that they are not drawn. `hudpads.test.ts`
   records the count rather than asserting it to zero, and asserts that the
   scene applies the rule. If a future pass wants zero coverage it needs a
   letterboxed map (tried, reverted) — **not** camera slack, which is the
   black-screen bug.

**Blocked:** nothing.

**Waiting on a decision:** items 1 and 2 above.
