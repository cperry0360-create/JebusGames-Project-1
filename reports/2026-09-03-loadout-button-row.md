# Loadout button row — off centre by 35 design px

2026-09-03. Fixes the two buttons at the bottom of the loadout screen sitting
left of the card column, and gives them a common width.

## The diagnostic first: not a pointer-space error

This was the fifth issue traceable to layout arithmetic, and the instruction
was to check whether the start-x was being computed in the wrong space before
touching a constant. It was not.

The signature that separates the two: **a space error changes with the device
ratio; an arithmetic error does not.** Measured before changing anything, on
the `loadout` harness scenario at 844x390:

| dpr | offset (design px) | offset (CSS px) | offset (device px) |
|----:|-------------------:|----------------:|-------------------:|
|   1 |             -35.00 |          -18.96 |             -18.96 |
|   3 |             -35.00 |          -18.96 |             -56.88 |

Identical in design and CSS units at both ratios — only the device figure
scales, which is what a correct conversion looks like. So the row really was
35 design px left of the column, at every ratio, and the cause was in the
numbers, not the units.

(The user measured 65 device px on a 2868px-wide capture. Same defect; the
figure differs because that capture is a wider viewport than the harness's
844x390, and the design→device factor differs with it.)

## What the cause actually was

```ts
plateButton(this, W / 2 - 190, by, 240, ...)  // REROLL
plateButton(this, W / 2 +  90, by, 300, ...)  // BEGIN THE RUN
```

Two hardcoded centre offsets with two hardcoded, unequal widths. The pair
spans `W/2 - 310 .. W/2 + 240`, whose centre is `W/2 - 35`. That is the whole
of it.

**Two corrections to the stated cause.** `barPlate` honours the `w` it is
given exactly and does *not* grow to fit its label, so the buttons were not
"each sized to its own label" — the widths were literal constants that happened
to be roughly label-sized. And `presentation.json` already carried
`loadout.buttonGap: 26`, but nothing read it; the real gap between the two
plates was 10. Same visible defect, different fix: the row had to be laid out
as a group rather than have its offsets nudged.

## The fix

New Phaser-free module `src/systems/ButtonRow.ts`:

```
buttonRow({ centreX, labelWidths, padX, gap, minWidth, maxTotal }) -> Row
```

It takes the widest label, adds `padX` on both sides, applies `minWidth` as a
floor, gives **both** buttons that one width, and positions the group so its
centre lands on `centreX`. If the total would exceed `maxTotal` it shrinks both
buttons equally and reports `squeezed`, so the pair can never diverge again —
the "shrink together rather than let them diverge" requirement is a property of
the module, not of the caller.

`LoadoutScene` measures each label with a throwaway `Phaser.Text` probe at the
real font and `uiSize`, then reads back `row.width` and `row.centres[i]`. The
new `contentCentre` getter returns the same centre the hero and specials cards
are laid out against, not the viewport's, so if the column is ever inset the
buttons inset with it. New data: `buttonPadX: 34`, `buttonMinWidth: 200`; the
existing `buttonGap: 26` is now actually read.

## After: measured at both ratios and both viewports

| viewport | dpr | content width | row span | row centre | column centre | offset |
|---|---:|---:|---|---:|---:|---:|
| 844x390 | 1 | 720 | 357.0..923.0 | 640.0 | 640.0 | **0.00** |
| 844x390 | 3 | 626 | 357.0..923.0 | 640.0 | 640.0 | **0.00** |
| 568x320 | 1 | 627 | 357.0..923.0 | 640.0 | 640.0 | **0.00** |
| 568x320 | 3 | 626 | 357.0..923.0 | 640.0 | 640.0 | **0.00** |

Exact, not within-one-pixel, at all four. Both buttons are 270 wide (were 240
and 300); the row totals 566 including the 26 gap, which is inside the
narrowest observed column width (626), so the squeeze path does not fire at
either viewport. It is covered by test instead.

The 568x320 screenshot confirms REROLL (1 left) and BEGIN THE RUN render
equal-width and symmetric under the card column — the primary action is no
longer the visually smaller of the two.

## Reproduce

```sh
sh tools/harness/build.sh
DPR=1 sh tools/harness/run.sh loadout 6 844x390
DPR=3 sh tools/harness/run.sh loadout 6 844x390
DPR=1 sh tools/harness/run.sh loadout 6 568x320
DPR=3 sh tools/harness/run.sh loadout 6 568x320
```

The scenario prints each button's design-space bounds, the row centre against
`sc.contentCentre`, the offset in design/CSS/device px, and a width-equality
check.

## Tests

`tests/buttonrow.test.ts`, 6 cases: centring across several centres and label
pairs; both buttons taking the wider label's width; short labels still getting
`minWidth`; an over-wide pair shrinking *both* and staying centred; the real
measured 270-wide pair fitting the minimum observed content width; and a source
assertion that the scene passes `contentCentre`/`contentWidth` and has no
`W / 2 ± digit` offsets left in it.

564 tests pass. `tsdiff` clean against the last green commit apart from the
documented `phaser`-cannot-resolve cascade.

## Not checked

- Nothing above the button row moved. The hero and specials cards were already
  centred on the column and were not touched.
- The squeeze path is proven by unit test, not by a viewport that triggers it —
  no viewport in the harness set is narrow enough with these labels. If a
  future label pair or a narrower device does trigger it, the buttons shrink
  and stay symmetric, but the *legibility* of the shrunken label is untested.
