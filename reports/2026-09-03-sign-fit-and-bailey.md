# Sign placement fixed; Bailey does not appear to a player

2026-09-03.

| | commit | CI |
|---|---|---|
| Sign overlays fitted to the measured wood panel | `e169dea` | green |
| Bailey re-sited onto two real clumps | `46d2b1f` | green |
| This report's completion | — | documentation only; the loop closes here |

---

# 1. The signs

## The cause, and it is one thing

**The quads supplied for both boards were described as the inner writable panel
and are, measured, close to the OUTER board.** For the innkeeper's: supplied
138.6 plate px against a wood field of 119.2. Drawing at 94% of an outer board
puts the words at ~94% of the board — on the rails — which is what "the
lettering is at 100% of the board's outer width" was.

I recorded this at the time and did not act on it: the last report says the
supplied width "is larger than both because it spans the painted frame rather
than the wood inside it". That was the fault, written down and shipped anyway.

**On the anchor** (hypothesis 1): it was already correct. `scene.add.image`
takes the default origin of 0.5/0.5 and the quad expresses a centre, so those
agree. Measured, the rendered centre is **0.000, 0.000 world px** from the
board's centre — see below. The centre offset in the capture is almost
certainly the board bbox including the villager's hand and post, which drags it
down and right; my own first flood-fill of that board made exactly that mistake
and put the "board centre" 26px right and 17px low of the wood's.

## What replaced it

Both boards re-measured off the plate by **projecting the wood mask onto each
board's own rotated axes** — not edge fitting, which this art has now defeated
five times. Verified by drawing back onto the plate.

|  | inner wood panel | outer board | rails |
|---|---|---|---|
| held | 119.2 x 96.8 plate px @ (0.69812, 0.28116) | 143.2 x 120.8 | ~12 px |
| tavern | 191.7 x 116.1 plate px @ (0.74479, 0.19287) | 229.7 x 154.1 | ~19 px |

The rails were measured by scanning outward from the wood to grass, on the
sides nothing touches — the innkeeper's hand meets the bottom of his board and
the tavern's beam and wall meet two sides of its, so those are mirrored rather
than scanned.

**A second fault fell out of it.** The wood panel is 1.23 wide-to-tall and the
lettering is authored at 1.40, so scaling the canvas to the panel would squash
the words 14%. The art is right; only the placement was wrong. `fitAspect` now
letterboxes the overlay inside the panel, so the words keep the shape they were
drawn in and simply leave more bare wood above and below.

## Asserted, not nudged

Measured off the sprite's real transform, in world units:

```
tavern            board 76.6 x 51.4   lettering 54.3 x 36.4   rot +10.30
                  OFFSET 0.000, 0.000 world px      WIDTH 70.9% of the board
held (Moe)        board 47.7 x 40.3   lettering 37.3 x 26.6   rot  -6.65
                  OFFSET 0.000, 0.000 world px      WIDTH 78.2% of the board
held (Courjahan)  identical to Moe, as it must be — one rectangle, one swap
                  OFFSET 0.000, 0.000 world px      WIDTH 78.2% of the board
```

All three undistorted: drawn aspect equals source aspect to 3 decimal places.

The innkeeper's lands in the 78–84% asked for. **The tavern's is 70.9% and that
is not a fault:** its wood panel is 1.65 wide-to-tall against 1.49 of art, so
the fit is limited by the panel's *height* and the width falls short of the
rails rather than reaching them. Stretching it to 78% would distort the words,
which is the thing this change undoes. Both are pinned to ±2% in test.

```sh
DPR=3 sh tools/harness/run.sh signfit 45 844x390
```

## Three probe bugs, in one measurement

Reported because each produced a confident wrong number.

1. **Differencing the whole frame** caught the pad pulse, the node rings, the
   wave timer and the tavern's window flicker: it reported the lettering as
   844x390 with 394,000 pixels changed.
2. **Windowing on the board and forcing a camera zoom** measured the lettering
   at one scale and the board at another — the rig owns the zoom and eases back
   to its own target every frame, so the scale was still moving between the
   captures and the measurement. It reported the lettering at 136% of a board
   it was 84% of.
3. **Taking the largest connected blob** of changed pixels grabbed one word:
   lettering is not one blob. Moe came out at 61.9% and Courjahan at 73.7% —
   two answers for one rectangle.

The measurement is off `img.x`, `img.y` and `img.displayWidth` now: what
actually got drawn, after every transform, in the same world units the board is
recorded in. No camera, no threshold, no connectivity assumption.

## The soft lettering — filtering is not the cause

`config.ts` sets `pixelArt: false, antialias: true` **globally**, so the plate
and the overlays are already drawn with identical LINEAR filtering. There is no
mismatch to correct, so matching them is not available as a fix.

It is the downscale. Measured in world units:

| | source | drawn | minification |
|---|---|---|---|
| held | 640 px wide | 37.3 world px | **17.1x** |
| tavern | 640 px wide | 54.3 world px | **11.8x** |

Against the screen: at the opening zoom (1.978 device px per world unit at
844x390 dpr 3) the innkeeper's lettering is 74 device px wide from a 640px
source — **8.7x minification**, with no mipmaps. CLAUDE.md rule 7 calls ~2.7x
the worst case worth tolerating.

**So: re-cut it.** A source about **270 px wide** hits rule 7 at max zoom
(37.3 world px x 2.37 maxZoom x 3 dpr = 265). Harder edges would help on top of
that, but the size is the larger part of it — a soft brush render minified 8.7x
is soft whatever its edges do.

---

# 2. Bailey: she does not appear

**Plainly: at the opening zoom a player cannot see her.** She loads, she is
armed, the mask works and she is drawn correctly — and she is behind the HUD.

```
art prop-bailey-peek -> props/prop_bailey_peek.png   texture present: true
bailey armed: true      source 643x872, aspect 0.737
camera at the OPENING zoom 1.9781 device px per world unit (0.6594 css)
world view x 0..1280  y 94..685
```

| spot | world | on screen at peak (CSS px) | visible |
|---|---|---|---|
| 0 | 34, 190 | **22, 19..63** | 44.2 CSS px |
| 1 | 68, 180 | **45, 13..57** | 44.2 CSS px |
| 2 | 100, 186 | **66, 16..61** | 44.2 CSS px |
| 3 | 130, 178 | **86, 11..55** | 44.2 CSS px |

The HUD's peanut counter occupies screen y 10..54 from x 10, and the hero row
y 60..82. **Every one of her four spots is underneath them**, and spot 0 is
also clipped by the left edge of the screen. The attached capture shows the
sliver of ear that survives.

The cause is the camera change, not her: at the opening zoom the visible world
starts at y 94 and the HUD band covers world y 94..218, while the only conifer
forest on this plate is at world y 0..200. The whole tree line is inside the
HUD band. I checked the bottom-left for an alternative — it is waterfall and
rock, with no canopy to hide behind.

**She is correct when you can see her.** Framed at max zoom on the top-left
forest, her head and ears clear the canopy and nothing below the line renders;
that capture is in the previous report.

### What I did not do

I did not re-site her. There is no tree line on this map that is both visible
at the opening zoom and clear of the HUD, so every option is a decision that is
yours:

1. **Leave her.** She is findable by pinching into the top-left forest, and
   "if a player never notices her, that is fine" was the brief. This costs
   nothing and is what ships today.
2. **Bias the opening camera down** by ~60 world px so the forest clears the
   HUD. That breaks the "whole board in the first frame" guarantee at the top.
3. **Move the HUD counters.** Not for a dog.
4. **Paint trees somewhere in the clear band** — world y 218..573 — and re-site
   her there. Art.

### The 44px is ambiguous, and the two readings now conflict

The first brief said "render her at about 44px tall at 844x390"; this one says
"the visible height... the target was about 44px visible". They were compatible
when the game opened at the design zoom of 1.72 and are not now that it opens
at 0.659.

- As shipped: **67 world px full, 44.2 CSS px of dog, 22.1 CSS px visible.**
- To make the *visible* part 44 CSS px she must be 134 world px — and her
  visible head is then as tall as Cory is whole (75.8 world px). I tried it;
  it also pushes her four spots into each other, which the spacing test caught.

Left at the first reading. Say which you want and it is one number.

### How to see her without waiting

`forcePeek` already existed for the probe; there is a harness lever now:

```sh
BAILEY=2 DPR=3 sh tools/harness/run.sh bailey 45 844x390
```

`BAILEY=0..3` forces that spot immediately instead of waiting 60–150s. Omit it
and the scenario walks all four. **No spot is likelier than another** — the
interval is re-rolled every time and the spot is uniform among the three that
are not the previous one, so there is no bias to exploit and nothing to camp.

---

## Where this leaves the repository

- **Waiting on you:** whether to re-cut the sign art at ~270px; which of the
  four Bailey options; which reading of the 44px.
- **Still open:** the 568x320 drawer grid lever; whether the drawer's tab bar
  should have words; the sign *text* alignment item from the withdrawn message,
  which this may or may not have been.
- Longer-standing, unchanged: 18 trait phrases await approval; towers 0.91x the
  lane; balance not re-tuned for the v2 lane; `icon_confirm.png` and
  `assets/nodes` unreferenced; `checks` not required on PRs; `hud_peanut_icon.png`
  unwired.

---

# 3. Bailey, re-sited (second pass)

## The cut had nothing under it because the line was where foliage STOPS

The four `canopyY` values were the FRONT edge of the wood — the boundary where
the trees end and the grass begins. She rose over open grass, so the straight
cut across her face was the mask and only the mask. Correct diagnosis.

Found properly this time: mask the painted conifer and bush mass, then scan for
a position where that mass runs across her whole width for 26 world px BELOW
the line with an open top edge above it.

**The plate has exactly two such places outside the HUD band.** There is no
third, which is why there is no third spot — not a judgement call, a search
result. Two convincing ones, as offered.

| spot | world | plate | mass below the line | what hides her |
|---|---|---|---|---|
| 0 | 125, 526 | 375, 1578 | **72%** | the bush cluster above the waterfall |
| 1 | 1118, 630 | 3354, 1890 | **74%** | the conifer at the lower right |

Both are on screen at the opening zoom and clear of every piece of HUD: spot 0
at screen **82, 285**, spot 1 at **737, 353**.

## Less of her

`peakVisible` 0.5 to **0.33**. At a half you get ears, forehead and both eyes —
the worst case. At a third it is the ears and the top of the head with the eyes
at or just under the line. Visible height **22.1 world px = 14.6 CSS px** at
844x390.

## The 44px target is dropped, and here is why

It cannot coexist with the mask reading correctly. She has to be narrow enough
for a painted clump to cover, and the widest clump on this plate outside the
HUD band is about 50 world px. That caps her height at ~68 world px through her
0.737 aspect, and a third of that is 14.6 CSS px. Chasing 44 CSS px visible
would make her 3x wider than anything that can hide her, and the cut comes
straight back.

The 44 came from a brief written when the game opened at the design zoom of
1.72. It opens at 0.659 now. The two cannot both be satisfied on this plate.

## Looked at, not asserted

Both captures attached. Spot 1 is the stronger of the two: two ears and a
forehead over a conifer, the tree unmistakably in front. Spot 0 works but its
bush is smaller, so there is less margin — if one of the two ever needs to go,
it is that one.

## Where this leaves the repository

- **Waiting on you:** re-cut the sign art at ~270px wide; whether 14.6 CSS px of
  dog is enough or whether the plate should get a bigger clump painted for her.
- **Still open:** the 568x320 drawer grid lever; words on the drawer's tab bar;
  the sign *text* alignment item from the withdrawn message.
- Longer-standing, unchanged: 18 trait phrases await approval; towers 0.91x the
  lane; balance not re-tuned for the v2 lane; `icon_confirm.png` and
  `assets/nodes` unreferenced; `checks` not required on PRs; `hud_peanut_icon.png`
  unwired.
