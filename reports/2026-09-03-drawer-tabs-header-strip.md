# Control drawer: a tab bar, a currency readout, and a pinned detail strip

2026-09-03. Three structural additions to the drawer panel. Placement is
unchanged: it is still 152px at 844x390 and 118px at 568x320, still tap to
place, still no drag-to-build.

| | commit | CI |
|---|---|---|
| Tab bar, currency header, detail strip | `PENDING` | pending |

---

## The measurements asked for

Identical at dpr 1 and dpr 3 at both viewports, which is the check that none of
this is computed in the wrong pixel space.

### 844x390 — panel 152 x 200, inner 136 x 184

| | |
|---|---|
| tab bar | 20px tall, 3 tabs at **44.0px** each, 2px gaps |
| labels fit? | **No — glyphs.** See below |
| header | 20px tall, peanut icon + count |
| detail strip | 136 x **56**, icon 34, text column 87 |
| tile | **65.0 x 62** |
| grid remaining | **136 x 76** |
| content / maxScroll | 198 / **122** |
| whole tile visible? | yes (76 ≥ 62) |

### 568x320 — panel 118 x 130, inner 102 x 114

| | |
|---|---|
| tab bar | 16px tall, 3 tabs at **32.7px** each, 2px gaps |
| labels fit? | **No — glyphs**, as the brief anticipated for this size |
| header | 16px tall |
| detail strip | 102 x **40**, icon 26, text column 61 |
| tile | **48.0 x 62** |
| grid remaining | **102 x 36** |
| content / maxScroll | 198 / **162** |
| whole tile visible? | **no — 58% of one tile** |

```sh
sh tools/harness/build.sh
DPR=3 sh tools/harness/run.sh drawerchrome 35 844x390
DPR=1 sh tools/harness/run.sh drawerchrome 35 568x320
```

---

## Two places the brief could not be met, and why

### 1. The tab labels do not fit at EITHER size

The brief expected ~43px to be "enough for a short word at small caps". It is
not, and the reason is not the tab width:

**`uiSize` clamps every screen-space size up to `typography.minUiSize`, which
is 15.** A tab label therefore renders at 15px however small a number the data
asks for, and "TOWERS" at 15px bold is **71px** against a widest-case 44px tab.
ACTIVE is 61 and PASSIVE 72.

That floor is a project rule with its own test — `no UI text is set below the
legible minimum` — and it exists because a 13px label was seven real pixels on
a fitted screen. Going under it for three tabs is not a trade I should make
unilaterally, so **the glyph fallback the brief specified for the narrow screen
runs on both**: a turret, a bolt and a shield, drawn in the drawer's own
thick-outline vocabulary like the chevron and the padlock already are.

To get words instead, one of these has to give: lower `minUiSize` (affects
every small label in the game), widen the drawer (explicitly out of scope), or
use two tabs rather than three.

### 2. The stat captions cannot be drawn at all

Same cause. The brief asks for "three numbers with small labels: dps, range,
rate" — but at the 15px floor a caption is exactly as tall and nearly as wide
as the number it captions. Three captions need about 100px; the text column is
**87px** at 844x390 and **61px** at 568x320.

So the strip carries the name, the three numbers **in `statsFor`'s fixed order
— dps, range, rate** — and the trait where there is a third row for it. The
numbers come from `statsFor`, which is what the ledger card uses, so the strip
and the card cannot disagree about a tower's dps; it also carries the support
case, where Beacon returns a boost and a radius rather than three slots reading
zero.

At 568x320 the strip is 40px, which is two rows, so **the trait line is dropped
there**. The row count comes from the height rather than being assumed.

---

## The grid is what paid for all of it

This is the number the brief flagged, and it moved a long way.

```
                inner   chrome   grid   content   maxScroll
  844x390        184      108      76      198       122     (was 184 -> 184, 14)
  568x320        114       78      36      198       162     (was 114 -> 114, 84)
```

CANCEL cost 18px of `panelArea` and made the wide grid scroll by 14. Three
stacked sections cost 108px at 844x390 and 78 at 568x320, and every one of them
comes out of the grid.

**The narrow case is the one to look at.** A 62px tile does not fit a 36px grid
at all, so at 568x320 no tile can ever be shown whole — and 36px is 58% of a
tile against the 50% the pick path requires, so the margin is eight pixels.
Every tile is still reachable by scrolling and tappable at its best scroll, and
that is now asserted for every tile at every viewport; what is gone is the
stronger guarantee that a tile can be brought fully into view, which still
holds everywhere else.

The reachability test asserts the weaker true thing rather than the stronger
false one, and a second test records which viewports are in which case so that
a change moving one across the line fails loudly.

**Three ways out, none taken here:**

1. **Let the drawer run below `panelArea`'s bottom at 568x320.** The ability
   strip is centred and does not reach the drawer's x range at that width, so
   the collision the bound exists to prevent is not actually there. This is the
   one I would take.
2. A `tileHeight` per breakpoint — which undoes the 62px thumb target this grid
   was deliberately given.
3. Drop the strip's reserved height when nothing is selected — which re-flows
   the grid under the finger at the moment a tile has just been tapped.

The brief said placement does not change, and which of the three is right is a
judgement about a real thumb.

---

## What else changed

- **`widths` now carries the whole budget per breakpoint**, not just the panel
  width: header, tab bar, strip, icon and gaps. One set of heights left 18px of
  grid on the narrow screen, which is no tappable tile at all.
- **The tab bar and the strip consume their own presses.** A tap on PASSIVE
  must not fall through and begin a scroll, and a drag now only ever starts
  inside the grid.
- **The floating panel is not in the drawer's build flow, and never was.** With
  the drawer on, an empty node does nothing until a tile is picked — the pad
  ring and its positioned description panel belong to the build-ring scheme.
  So nothing had to be removed; what the strip does is make that absence
  correct rather than a gap, because until now the drawer scheme showed no
  tower information at all before you spent 80 peanuts. The panel for an
  already-placed tower is untouched.
- Tiles still carry artwork and a price and no name, asserted.
- The dead `tabFill` key — the handle's old orange plate — is deleted.

## The bug I introduced and caught

While measuring, the harness reported "TOWERS" as 71px in a 44px tab at dpr 1
and **23.7px** at dpr 3. Two ratios disagreeing is the signature of a
pixel-space error, so I divided the measured width by the device ratio.

**That was wrong and made it a real bug.** `uiSize` looks like the scaling
helper and is not — it clamps to the legibility floor and does nothing else, so
the probe text already measures in the same CSS pixels the rectangles use. The
division made the width three times too small on a retina screen. The
disagreement I was chasing was caused by the fix, not by the fault.

Reverted, and both ratios now report 71.0.

A related probe bug came first: the harness measured the labels itself, in
`KenneyFuture` — the **display** face, which is not what the drawer renders tab
labels in — and reported a width the drawer never saw. The probe now reads the
drawer's own decision through `tabLabelReport` rather than re-deriving it.

## Not checked

- **A real thumb on a 36px grid.** Every tile is reachable and tappable by
  measurement; whether one tile at a time is usable at 568x320 is the judgement
  the levers above are waiting on.
- **The glyphs against the words.** Nobody has seen the tab bar with labels,
  because at this type floor it cannot be drawn.
- **ACTIVE and PASSIVE with anything in them.** They are disabled tabs; the
  point of building the bar now is that filling them is data.
