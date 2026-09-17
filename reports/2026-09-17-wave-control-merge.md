# The wave count, merged into one control

**2026-09-17.** The HUD was drawing the wave count twice. It is drawn once now,
on a control at the bottom of the top-left stack, and the top-right corner is
the settings gear and nothing else.

| commit | what | CI |
|---|---|---|
| `8737d1c` | Merge the wave count into one control in the top-left stack | _pending_ |
| `c0d8bbc` | Merge main: the build-plot pass and the soak spend work | _pending_ |
| _this file_ | the report, context.md | _pending_ |

---

## What was on screen, and why it was two correct changes

Top left, a stack of three readouts at `readoutHeight` 16: peanuts, lives, and
a wave count `2/13`. Top right, a start button reading `▶ 2/13 +20`, 132x44.

Neither half was a mistake on its own. The readout belongs with peanuts and
lives, in the corner a player already reads the run's state out of; a button
that starts wave 2 has to name the wave it starts. They were made separately,
and nobody joined them up — so the count appeared in both corners, and a 132x44
plate sat on the board for a number that was already on screen.

**The join keeps the control, and it is not a preference.** A readout may shrink
to 16px because nothing taps it; that carve-out has never applied to anything a
finger lands on, so the 44px control could never have been the copy that went.

## The change

- **`HudLayout.startButton` is `waveControl`**, at the readouts' own `x`,
  directly under them, `waveControlGap` 4 below the lives plate. The top-right
  corner holds the gear alone.
- **`readoutCount` 3 → 2.** `HudScene.READOUTS` is `['peanuts', 'lives']`.
- **It wears the same painted plate as every other button in the game**
  (`plateButton`), which is the affordance: the plate's hover tint, its click
  sound and its separate disabled plate all come with it. A counter pill would
  have made it a 44px-tall readout, which is the one thing this corner must not
  look like now the readouts above it are 16px.
- **The second row sits BESIDE the control, not under it.** See "the four
  pixels" below.
- `art.json`'s `ui.counters.wave` plate is unused again and kept, exactly as it
  was kept through the last period it was not drawn.

### Every dimension is in `presentation.json`'s `hud.layout`

New keys, added rather than overloading `readoutHeight`:

| key | value | what it is |
|---|---|---|
| `waveControlWidth` | 148 | the control's box, widest |
| `waveControlMinWidth` | 132 | its floor; never reached on any viewport the game runs at |
| `waveControlHeight` | 44 | the tap floor, and about 3x a readout |
| `waveControlGap` | 4 | between the lives readout and the control |
| `waveLabelSize` | 14 | was `startLabelSize`; the number did not change, only the name |

**Retired, and what read them:** `startWidth` (132), `startMinWidth` (104) and
`startLabelSize` (14). `grep` over `src/`, `tests/`, `tools/` finds **nothing
outside `HudLayout.ts` and `HudScene.ts` reading any of the three** — the two
widths were consumed by `hudLayout`'s own arithmetic and `startLabelSize` by the
one `plateButton` call. `tests/hudpads.test.ts` now asserts all three are
`undefined`, so a later pass cannot tune a key nothing reads.

### `waveControlWidth` is 148, not the 132 the old button carried

Measured, not chosen, and it surfaced a fault that was already shipping.
`plateButton` fits a label into `w - 62` — the plate less its two painted end
caps — and floors the shrink at 0.72. The widest label the control can ever
carry is `▶ 18/18 +30`: the last wave of the longest table, called at the top of
its 15-second countdown at two peanuts a second.

    at 132   "▶ 18/18 +30"  97.0px of text, scale 0.72 (the floor), drawn at 10.8px
    at 148   "▶ 18/18 +30"  97.0px of text, scale 0.89,             drawn at 13.3px

11px is the harness's legibility floor for a readout. **This was equally true in
the top-right corner and nothing had measured it**, because the `counters`
scenario set `readyCountdown` to 0 and so never asked the plate for a bonus
label. It asks now, and for both end-of-run labels as well.

## Every state the wave control can be in

Measured from a rendered frame by `sh tools/harness/run.sh counters 120 844x390`,
at `waveCount` 18 to exercise the widest strings the game can reach:

| state | reads | pressable | drawn at |
|---|---|---|---|
| ready, clock running | `▶ 2/13 +20` (widest `▶ 18/18 +30`) | yes, pays the bonus | 13.3px at the widest |
| ready, no clock (wave 1, and a resumed wave 1) | `▶ 1/13` | yes, pays nothing | 15.0px |
| wave running | `2/13 · 18` — the wave, and how many are still coming | no: the disabled plate | 15.0px |
| run won | `CLEARED` | no | 15.0px |
| run lost | `OVERRUN` | no | 15.0px |

- **No bonus is not an empty plate and not `+0`.** Wave 1 carries no countdown,
  so there is nothing to beat and nothing to promise; the plate reads `▶ 1/13`,
  which is the count the player needs there anyway.
- **The play glyph is on the two pressable states only.** A greyed plate with a
  play glyph on it is a button saying press me and refusing.
- **Mid-wave changed, and it had to.** It read `18 LEFT`, which was right for
  the one day the stack above it was also printing `2/13`. With the readout gone
  that would have taken the wave number off the screen for the whole of every
  wave — the same fault as drawing it twice, arrived at from the other side.
- **`CLEARED` and `OVERRUN` are all but unreachable, and that is pre-existing.**
  `endRun` opens the results dialog on the same frame it sets the phase, and a
  world modal stands the whole HUD down (`HudScene.update`'s `if (!live)
  return`). Both labels were measured by calling `drawWaveControl` with a
  synthetic status, which the report of them says out loud.

## CANCEL is untouched — confirmed, not assumed

`HudLayout` gives CANCEL its own rectangle in the bottom-right corner, computed
from `cancelWidth`/`cancelHeight` and the display's right edge, and nothing in
this change touches that arithmetic. Two measurements rather than the argument:

- The layout at 844x390 puts it at `728,332 116x48` **before and after**,
  byte-identical (see the rect table below).
- `sh tools/harness/run.sh gnomes` arms an ability, reports CANCEL "is in the
  bottom-right HUD corner", presses it, and reports it "disarms the ability and
  takes the cursor with it".

The settings gear is likewise unmoved at `794,12 40x40`, which taps at 44 with
`cornerButtonTapPad`.

## The four pixels, and the twenty-eight that were not spent

The second row (the boss bar's rectangle) used to clear whichever top-corner
group was taller, and `panelArea` — where the build drawer lives — starts under
it. The left column is 84px tall now (16 + 4 + 16 + 4 + 44), so that rule would
have pushed the row and the drawer down 28px. At 568x320 the drawer's grid would
have come out at **44px for a 62px tile**: a drawer that cannot show a tower.

So the row clears the readouts and the gear, which are the two things in the top
band proper, and stays clear of the column below-left by **giving way in width**
— the same trade the boss bar already makes on a narrow phone. `panelArea` still
clears the whole column, because `GameScene.placeVlaudeHud` hangs level 10's
icon off its top-left corner, 20px in.

That costs four pixels, and four was itself bought:

| | 844x390 | 568x320 |
|---|---|---|
| grid before | 118 | 72 |
| grid at `panelTop + 8` under the column | 110 | 64 |
| **grid shipped** (`+8` under the row, `+4` under the plate) | **114** | **68** |

At 110 the grid was **one pixel** short of letting a single full-height drag
reach the last tower: a drag moves `grid - 24` and `maxScroll` is 84, so the
seventh tower would have needed a second drag. `tests/drawer.test.ts` pins
`grid - 24 >= maxScroll` now rather than leaving it to the scenario, and
`run.sh drawer` performs the drag: `scroll 0 -> 84 of 84`.

68 still clears the 62px tile at 568x320, by six pixels. **That is the line to
watch**: the next thing that wants a few pixels out of the top-left corner is
taking them off the narrow screen's only whole tile.

## The board the top right gave back, at 844x390

Every rectangle, before (`ccf7f78`) and after, in CSS pixels. `hudLayout`
evaluated with the same inputs on both trees — `countersWidth` 60.04, which is
what the peanut plate measures at five digits, and `abilitiesWidth` 322, which
is a full six-slot hand. A live run with four slots draws a narrower ability
row; the point of the table is the four rectangles that moved.

| rect | before | after |
|---|---|---|
| `counters` | 10,10 60.04x56 | 10,10 60.04x**36** |
| `startButton` | **652,10 132x44** | — gone — |
| `waveControl` | — | **10,50 148x44** |
| `messageRow` | 272,**70** 300x16 | 272,**56** 300x16 |
| `settings` | 794,12 40x40 | 794,12 40x40 |
| `heroChip` | 181,320 60x60 | 181,320 60x60 |
| `abilities` | 261,328 322x52 | 261,328 322x52 |
| `cancel` | 728,332 116x48 | 728,332 116x48 |
| `panelArea` | 6,94 832x218 | 6,98 832x214 |

- **The top-right corner gives back 5,808 px²** — the whole 132x44 plate, at
  x 652–784, y 10–54. That is **1.76% of the 844x390 viewport** and it is now
  map, with only the 40x40 gear outboard of it.
- **Net across the HUD it is 497 px² less chrome**, because the control moved
  rather than vanished: the corner rectangles go 9,170 px² to 8,673. The column
  takes 5,311 of the 5,808 back (the control is 16px wider than the old plate
  for the legibility above, and the readouts gave up 20px of height).
- The number that matters more than either is **where** it moved: one block in
  one corner instead of two blocks in two, with the second row 14px higher.

### Build plots

`sh tools/harness/run.sh padhud 420 844x390`, run on this tree and on a worktree
at `ccf7f78` so the two are the same boards — the build-plot pass landed the
same day and moved every level's pads, so a figure from before it is not
comparable.

| | pads | overlaps at rest | by element | not freed by panning alone |
|---|---|---|---|---|
| `ccf7f78` | 157 | 36 | messageRow 15, abilities 12, heroChip 6, startButton 2, counters 1 | **22** |
| this tree | 157 | **32** | messageRow **11**, abilities 12, heroChip 6, **waveControl 2**, counters 1 | **18** |

**The brief's "24 to 17" is this last column**, and the new boards had already
moved it to 22 (`reports/2026-09-17-build-plots.md`). It is **18** now.

**Both plots that were under the old top-right button are clear:**

| level | under the HUD before | after |
|---|---|---|
| 1 | 1,4 | 1,4 |
| 2 | 3 | 3 |
| 3 | 6,7,9 | 1,6,9 |
| 4 | 4,5,8 | 4,5,8 |
| 5 | 3,4,7,9,10,12,14 | 3,4,7,8,9,12,14 |
| 6 | **1**,3,5,14,17 | 3,5,14,17 |
| 7 | 9,10 | 9,10 |
| 8 | 5,11,13 | 5,11,13 |
| 9 | 3,**4**,7,14 | 3,7 |
| 10 | 1,4,9,11,12,14 | 1,4,9,12 |

Level 6's pad 1 and level 9's pad 4 were the two the `startButton` stood on, and
neither is under any HUD rectangle now. Level 9 also loses pad 14 and level 10
loses 11 and 14 to the second row's 14px lift; level 3's pad 1 and one of level
10's are what the wave control picked up in the other corner, and level 5 trades
pad 10 for pad 8.

Per level, pads panning alone cannot free: `1,0,0,1,2,3,2,5,3,5` → `0,0,0,1,2,1,2,5,3,4`.

## Verification

Everything below is from a rendered frame unless it says otherwise.

**From rendered frames:**

- **The top right holds only the settings gear** — `screens-5-game-844x390.png`
  and `screens-5-game-667x375.png`. Also from the layout dump above: nothing but
  `settings` has any area right of x=652 in the top band.
- **The wave control sits under lives, is 148x44, and reads as a button** — same
  frames: the painted blue plate with the play glyph, against the two small
  counter pills above it.
- **Tapping it starts a wave** — `run.sh wave1` clicks `layout.waveControl`'s
  centre through the real pointer path: "pressing the banner starts wave 1", at
  **844x390, 667x375 and 1280x720**.
- **The early-call bonus shows and pays** — `wave1` puts ten seconds on a
  resumed wave 1's clock, reads `▶ 1/13 +18` off the plate, presses it, and the
  purse goes 300 → 318. At all three viewports. (The offer is 18 rather than 20
  because the countdown runs at `pacing.gameSpeed` 1.4 while the label is being
  read; the check allows two seconds of that drift and reports both numbers.)
- **Peanuts and lives are unchanged** — `run.sh counters` on this tree and on a
  worktree at `7eb04a5` returns *identical* rows for every value tested: plate
  43.9x16.0 and text 26.0 at `100`, 51.9/34.0 at `1012`, 59.9/42.0 at `10000`
  and `99999`, lives 38.2/17.0 at `20` and `40`, 44.0/26.0 at `999`, all at
  scale 1.00 and all inside their fields. Same `x`, same `y`, same art.
- **The whole stack is legible at 375x667** — which is a landscape-only game, so
  that phone is 667x375 and the frame is `screens-5-game-667x375.png`. Portrait
  at 375x667 and 390x844 is **gated**, and `screens` reports it as gated rather
  than audited, which is the correct answer for portrait rather than a skipped
  check.
- **CANCEL still appears bottom right and still cancels** — `run.sh gnomes`,
  above.
- **Nothing runs under a notch.** `run.sh notch` prints every HUD rectangle's
  gap to each edge and reports "no problems found", with `hud.waveControl` at
  `x 10.0..158.0` among them; `screens` at 844x390 with
  `INSETS=0,47,21,47` gives GAME 0 faults.

**From the numbers rather than the picture:** the rect tables (pure layout
arithmetic, no browser), the retired-key search, and the drawer grid figures.

**`screens`**, at every viewport the brief asks for:

| viewport | result |
|---|---|
| 375x667 | portrait is gated |
| 390x844 | portrait is gated |
| 667x375 | 1 fault: `SMALL Title [title:version-stamp]`; **GAME 0 faults** |
| 844x390 | 1 fault: `SMALL Title [title:version-stamp]`; **GAME 0 faults** |
| 844x390, `INSETS=0,47,21,47` | 1 fault: the same; **GAME 0 faults** |
| 1280x720 | no faults at all |

The Title version stamp is **pre-existing** — confirmed on a worktree at
`7eb04a5`, where `screens 844x390` reports the identical single fault, and the
harness's own label for it says "hidden dev door, not a tap target".

**Tests:** `npm test` — 1199 passing, 0 failing.

**Typecheck:** `sh tools/tsdiff.sh 7eb04a5` — baseline 214 distinct errors,
working tree 214, none introduced. The usual caveat applies: without
`node_modules` every Phaser type is `any`, so an access rule on a Phaser member
cannot fire here. This change adds no new Phaser API call — `plateButton` was
already the HUD's own helper and is called exactly as the old button called it.

**`run.sh difficulty` is no redder.** It reports 2 faults on this tree — "the
HUD does not show the difficulty" and "a mid-run change to the save reached the
run" — and the *same two* on a worktree at `7eb04a5`. Pre-existing, not touched
here.

**`run.sh drawer` is no redder either.** 2 problems on this tree, the same 2 at
`ccf7f78`: the drawer shows 6 of 7 towers, and re-tapping the selected tile does
not cancel. The third fault an intermediate version of this change introduced —
"the last tile is still not in view after dragging" — is the four pixels above,
and it is gone.

**No soak was run, and that is checked rather than assumed.** `tools/soak/`
reads `presentation.json` in exactly one place, `Sim.ts:2199`, for
`heroFx.strikeLength`. It never imports `HudLayout`, `HudScene` or any part of
`hud.layout`; `grep -rn "presentationData\." tools/soak/*.ts` returns that one
line. The simulator cannot see this change.

### The new test

`tests/wavecount.test.ts` — four tests, and **all four were mutation-checked**
by breaking the thing each one guards and watching it fail:

1. *the HUD draws the wave count in exactly one place* — every `waveCount` in
   `HudScene.ts` is inside `drawWaveControl`. Mutation: a second one in the
   lives readout. Fails.
2. *the wave is not a readout in the top-left stack* — `READOUTS` is exactly
   `['peanuts', 'lives']` and no `wavePill` exists. Mutation: the wave back in
   the list. Fails.
3. *GameScene carries the count only where it is not on the glass* — five
   allow-listed lines, each named: the status field, its zeroing, the level
   setting it, the crash reporter's state block (never drawn) and the
   end-of-run banner (a dialog over a finished run). Mutation: a sixth use.
   Fails.
4. *every state of the wave control names the wave* — the other half of "one
   place": one place is only enough if that place always says it. Mutation:
   mid-wave back to `18 LEFT`. Fails.

### Harness scenarios that needed updating

`wave1` is the only one that **tapped** the button by position, and it is the
one that would have gone quietly wrong: `click(btn.x + btn.width/2, ...)` on the
old rectangle is a tap on the map. `chromepan` **probed** the same centre twice
with its chrome-versus-board gate. The rest read the rectangle by name out of
the layout and would have thrown, or silently measured `undefined`.

| scenario | what it did with it |
|---|---|
| `wave1` | tapped it; also asserted the label matched `/^START WAVE/`, which had been stale since the plate was narrowed. Now taps `layout.waveControl`, asserts `▶ 1/13`, and **presses the control for the early-call bonus** (new). |
| `chromepan` | two positional probes (`start button`, `wave banner`) → `waveControl` |
| `counters` | `hud.startBtn` / `L.startButton.width` → `hud.waveBtn` / `L.waveControl.width`; **plus the widest-ready and two end-of-run labels, which it never measured** |
| `herochip` | overlap map key |
| `full13` | live HUD overlap box list |
| `notch` | inset report map |
| `drawer` | the `want` list of layout keys (it pushes "this list is stale", so it would have reported rather than thrown) |
| `padhud` | the `named` list of pressable/readable rectangles |
| `full` | the fingerprint dump's key list |

Also `tools/hud_exposure.py`, a one-off analysis tool from 2026-09-02: its
rectangle list still named `startButton`, `mute` and `pause`. The last two went
when the two bottom-corner buttons became one gear, so it has been raising
`KeyError` rather than measuring anything for a while. Its list is current now;
the tool has not been re-run.

### What was NOT checked

- **Portrait at 375x667 and 390x844 beyond the gate.** The game is
  landscape-only and portrait gets the rotate overlay.
- **A real device.** Everything here is headless Chromium at `dpr 3`.
- **`GL=1`.** Nothing in this change touches the renderer, so the Canvas2D
  harness is the right instrument; no snapshot was taken under a real WebGL
  context.
- **The `won`/`OVERRUN` labels in live play**, for the reason given above: the
  results dialog stands the HUD down on the frame the phase flips. They were
  measured through `drawWaveControl` directly.
- **Every level's frame.** `padhud` walks all ten and reports the rectangles
  against the pads; the screenshots read closely are level 1's.
- **No soak.** See above — it is checked, not assumed.

## Where this leaves the repository

- **Done and on `main`:** the merge, the retired keys, the new test, the harness
  updates, `claude/context.md`.
- **In flight:** nothing.
- **Blocked:** nothing.
- **Waiting on a decision:** nothing from this pass.

Carried forward from the reports this one follows:

- **`run.sh drawer`'s two pre-existing problems still want a decision** — the
  drawer shows 6 of 7 towers (the seventh is one drag away, which is now pinned
  by a test), and re-tapping the selected tile does not cancel, where the
  scenario's own tile enumeration reports duplicate centres and may be the thing
  that is wrong.
- **`cancel`'s reserved rectangle still takes presses while it is invisible** —
  116x48 in the bottom-right corner, `hudTakesPress` includes it
  unconditionally. Untouched here, deliberately.
- **Level 7's spawn and exit badges are still invisible on the Highway** — an
  art job, ~9 luma of contrast.
- **Level 9 still declares 4 scenery items and builds 8.**
- **Every win rate and every boss health figure is stale** against the new
  boards and the new builder — `CLAUDE.md` and
  `reports/2026-09-17-build-plots.md` say so at length. Nothing in this pass
  changes a number the soak can see, so nothing here makes that worse.
- **The next few pixels out of the top-left corner come off the 568x320
  drawer's only whole tile.** 68 against a 62px tile.
