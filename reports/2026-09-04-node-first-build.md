# The drawer answers a node, and the hero stops "moving up"

2026-09-04.

| | commit | CI |
|---|---|---|
| Node-first build flow, and the move line | `e3fdba5` | green |

---

## 1. Tapping an empty node did nothing

With the drawer on and nothing picked, an empty node was a no-op. The comment
said why: "a node that opened a second menu would be two ways to do one thing."

**That was wrong about which menu.** Opening the drawer is not a second menu —
it is the same one, brought out to answer the node just tapped. A tap that does
nothing at all is the thing that reads as broken.

The flow runs both ways now. A tower then a node, or a node then a tower.

| tap | drawer closed | drawer open |
|---|---|---|
| empty node, nothing picked | opens on TOWERS, holds the node, rings it, shows the instruction | switches to TOWERS, moves the selection, **stays open** |
| empty node, tower picked | builds there | builds there |
| occupied node | selects the tower — unchanged | unchanged |
| tower card, node held | builds into the held node | builds into the held node |

`setOpen(true)`, never `toggle()`. A second node tapped while the panel is out
has to move the selection rather than shut the panel, and `setOpen(true)` on an
open drawer is a no-op — that is the point of it.

### The ring, and the state that must not exist

`drawEligibleNodes` now has two reasons to draw: a tower is picked, so every
node that would take it pulses; or a node is picked and waiting, so that one
node pulses alone.

There is still no state with a ring and a shut drawer. Closing the drawer or
clearing its selection drops the held node with it, CANCEL clears it, and
CANCEL lights for it — all four are asserted.

### Driven, not asserted

A source check can say the branch exists; it cannot say the tap reaches it, and
the whole fault was a tap that did not. New `nodefirst` scenario, at both
viewports at dpr 3 — identical results:

```
before: drawer open false, tab 0, pendingSpot none
after tapping empty node 0:  drawer open true  tab 0 (TOWERS)  pendingSpot 0
    message "Node selected — pick a tower to build here."
after tapping a second node while open: drawer open true  pendingSpot 1
after picking the first tower card: node 1 built true  peanuts 400 -> 320  pendingSpot none
tapping the now-occupied node: selected Slingshot  pendingSpot none
```

```sh
DPR=3 sh tools/harness/run.sh nodefirst 40 844x390
DPR=3 sh tools/harness/run.sh nodefirst 40 568x320
```

Four unit tests cover what CI can prove without a browser: the drawer branch
never falls through to the build ring, `chooseSpotFirst` opens rather than
toggles and sets tab 0, TOWERS is still index 0 with a real rectangle at both
viewports, and every cancel path drops a held node.

### A stale test, corrected rather than worked around

`the drawer path never opens the build ring on an empty node` matched
`openPadRing` within 600 characters of the branch — it was measuring a
comment's length rather than the code's shape, and broke the moment the comment
grew. It reads the branch body now.

## 2. "Cory is moving up"

The direction word was a **constant**. It said "up" whichever way he went, so it
was wrong more often than right, and "up" is the one direction that means two
things on a 3/4 map. Dropped rather than derived: "Cory is moving."

Deriving it was the other option offered and is worse here — a rally point
resolves to a path, so the first leg's direction and the destination's bearing
can disagree, and a word that is right about one and wrong about the other is
the same class of bug in a smaller font.

## Appendix: the hero walk frames, measured

Not part of this change. A brief arrived asking for the walk sheet to be
redrawn for two defects — a head facing the wrong way and a see-through shirt —
with two images that did not arrive, and it is the same shape as the
image-generation prompt withdrawn on 2026-09-03. Nothing was started from it.
Recorded here because the measurements are worth having whoever does redraw it.

**The game wants four separate PNGs, not one horizontal sheet.** `art.json`
names `hero/hero_cory_walk_1.png` through `_4.png` individually; a four-frame
strip would need slicing or a `sheet` entry like the effects use.

**Neither defect is present in what ships.**

| file | canvas | ink bottom | near-white px: opaque / semi |
|---|---|---:|---|
| `hero_cory.png` (idle) | 386x470 | 469 | 11675 / 0 |
| `hero_cory_walk_1.png` | 557x704 | 693 | 9003 / 244 (2.6%) |
| `hero_cory_walk_2.png` | 557x704 | 693 | 6633 / 313 (4.5%) |
| `hero_cory_walk_3.png` | 557x704 | 693 | 8535 / 225 (2.6%) |
| `hero_cory_walk_4.png` | 557x704 | 692 | 7369 / 179 (2.4%) |

2.4-4.5% semi-transparent white is edge antialiasing, not a translucent shirt:
a see-through garment puts the semi-transparency through the INTERIOR and there
would be far more of it. Baselines agree within one pixel across all four, so
there is no vertical drift either.

**If it is regenerated:** ~560px tall per frame hits rule 7 at `displayHeight`
78.8 (78.8 x 2.37 maxZoom x 3 dpr); the current 704 is slightly over. Re-run
`tools/measure_art.py` afterwards — `anchorX`, `anchorY`, `contentWidth` and
`contentHeight` are source extents and go stale silently.

Head direction cannot be measured, only looked at. The other two can: shirt
opacity from the alpha channel, drift from the ink bottom per frame.

## Where this leaves the repository

- **Waiting on you:** re-cut the sign art at ~270px wide; the 568x320 drawer
  grid lever (my recommendation is letting the drawer run below `panelArea`'s
  bottom at that width); whether the drawer's tab bar should have words, which
  needs `minUiSize` lowered from 15.
- **Closed:** Bailey's placement, mask and amount; the sign overlay placement.
- **Still open:** the sign *text* alignment item from the withdrawn message.
- **Not a task unless you say so:** the hero walk-sheet redraw — see the
  appendix. No images arrived and the shipped frames show neither defect.
- Longer-standing, unchanged: 18 trait phrases await approval; towers 0.91x the
  lane; balance not re-tuned for the v2 lane; `icon_confirm.png` and
  `assets/nodes` unreferenced; `checks` not a required status on PRs;
  `hud_peanut_icon.png` unwired.

## Not checked

- **The build ring scheme.** The drawer is opt-in; the ring path is untouched
  and was not re-driven.
- **A node tapped while an ability is armed.** Targeting mode takes the tap
  before the node branch is reached, which is existing behaviour and unchanged.
