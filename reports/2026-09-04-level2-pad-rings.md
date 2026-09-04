# The pads moved onto the re-drawn rings, and the lane did not move at all

**2026-09-04 · branch `claude/level2-volcanic-map-recreation-3szo07` · PR #2**

| commit | CI |
|---|---|
| [`c588dfb`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/c588dfbc57154ef783d1c485280355a0c1f9bf13) Move the level 2 pads onto the re-drawn rings, and hold the 68px tap floor | **green** — [push run](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33867163623) and [PR run](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33867167548), 614/614 tests, `tsc --noEmit` clean |

## The short version

The fifteen pads sit on the re-drawn rings. The closest pair is **72.1** canvas
px against the **68** that two 34 px tap radii need — no pair is under it, where
the old set had two. `roadWidth`, the 49 waypoints and `heroStart` are
unchanged, and `check_level2.py` now reports **no disagreement at all**.

## Verify the overlay before deriving from it

Two overlay files were in circulation and they are not interchangeable. The
distinguishing count is pixels matching `R<60 G>200 B>200`:

| file | cyan px | md5 | verdict |
|---|---|---|---|
| `tools/level2_path_overlay.png` (main `bad65d9`) | **9641** | `3406a542e12d` | **correct** — used here |
| `tools/level2_path_overlay_v2.png` (main `1b4051b`) | 7623 | `524b85f1ebe4` | superseded, thin stroke |
| `tools/level2_path_overlay.png` (PR #2, replaced) | 9641 | `10d29e873455` | correct stroke, old rings |

**The thin-stroke file derives a different lane, and nothing in the output says
so.** Deriving from the 7623 file gives `roadWidth` 67.6 instead of 65.8 and 47
waypoints instead of 49, while the painted route has not moved — the two
polylines are within 0.9 canvas px of each other everywhere. The mechanism:
`roadWidth` is a median of integer 4-connected BFS distances sampled *along the
cyan stroke*, so a stroke one pixel thinner shifts the sample line and the
median steps 37 → 38 overlay px. Doubled and scaled by 0.8889, that is exactly
65.8 → 67.6. The 49 → 47 drop is Douglas-Peucker picking different vertices off
the sub-pixel-shifted centreline.

This is now recorded in two places so the next person cannot walk into it:
`map_level2.json.note` and the `check_level2.py` docstring both give the 9641
figure and the test that produces it.

The correct file was verified against the numbers before any derivation, per
instruction. Reproduce with a pixel count over the PNG under those thresholds.

## The lane did not move — measured, not assumed

`--emit` against the correct overlay, compared to what was already on the branch:

| | stored | emitted | |
|---|---|---|---|
| `roadWidth` | 65.8 | 65.8 | identical |
| waypoints | 49 | 49 | identical count |
| vertex positions | — | — | **max delta 0.0000 canvas px** — byte identical |
| `heroStart` | (611.0, 633.3) | not emitted | untouched |

The route deviation from the painted centreline came back to **1.0** overlay px
(it reads 1.5 off the thin-stroke file). Road half-width median is back to 32.9
canvas px and the lane component is 154,387 px, the same figure as the original
trace.

## The pads

Fifteen rings, fifteen pads, one to one. Previously seventeen rings fed fifteen
pads and the checker printed the two leftovers on every run.

| | old set | new set |
|---|---|---|
| closest pair | **59.0** (pads 2-5) | **72.1** (pads 4-6) |
| second | 59.6 (pads 5-7) | 73.1 (pads 10-11) |
| third | 69.4 (pads 5-6) | 74.8 (pads 0-1) |
| pairs under 68 | **2** | **0** |
| margin over 68 | −9.0 | +4.1 |

All fifteen coordinates changed. Every pad clears the lane comfortably —
nearest is pad 1 at 117.5 canvas px against a `roadWidth/2` of 32.9, and all
are within the 215 px longest tower range.

`heroStart` is untouched and still valid: 0 lava px under its 120×55 footprint,
109.3 px to the nearest lava, 94.2 px from the road edge. Its recorded distance
to the nearest pad moved 78.9 → 84.5 because the pads moved under it; the stale
figure in `_heroStart` was updated.

### spotRadius stays 34

Not lowered to 28 to accommodate tight pads. World 1280 renders to 844 CSS px,
so 34 world px is a **44.8** px tap diameter and 28 is **36.9**, under the 44 pt
minimum. The pads move, not the radius — and the test's failure message says so,
because the tempting fix when it goes red is the wrong one.

### Five pads on painted rock

Pads **2** (1050.7, 216.0), **7** (884.4, 451.6), **10** (944.9, 547.6),
**12** (772.4, 606.2) and **13** (510.2, 612.4) stand on rock rather than open
ground. Deliberate and accepted: the plate's right third has no clean flat
ground beside the lane, and leaving those stretches uncovered is worse.
Recorded in `map_level2.json._buildSpots`. **Not independently verified** — the
script has no rock-versus-ground classifier, so this is a recorded design
decision, not a measurement.

## The regression test

`tests/level2.test.ts` asserts every pair exceeds `2 * L2.spotRadius`, derived
from JSON rather than hardcoded at 68, per the balance-numbers rule.

Verified by negative control: moving pad 6 to 60.0 px from pad 4 fails with
`pads 4 and 6 are 60.0px apart; their 34px tap targets overlap, which needs
68px. Move a ring in the overlay and re-derive with tools/check_level2.py
--emit.` Restored, 6/6 pass. The old assertion was `d > spotRadius` (34), which
the 59.0 px overlap passed — it only caught one pad sitting *inside* another.

`check_level2.py` also drops the "carries no pad" warning. With fifteen rings
for fifteen pads there is nothing left to excuse, so an unmatched ring is now an
ordinary failure rather than a printed note.

## What was NOT checked

- **That the five rock pads are on rock.** Taken from your description.
- **Anything in a browser.** Level 2 is still data only; nothing loads
  `map_level2.json` and the run still plays level 1.
- **Whether the plate art under the annotations changed** between the exports.
  The lane and road figures come back identical, which is strong evidence it did
  not, but I did not diff the plate itself against the corrected file.

## Where this leaves the repository

**In flight**

- PR #2, now carrying `c588dfb`, CI green, not merged. No second PR was opened.

**Blocked — needs you**

- **`tools/level2_path_overlay_v2.png` is still on `main`** (commit `1b4051b`),
  2.0MB, superseded, and it is the file that produces the wrong lane. I did not
  remove it: deleting a file from `main` means a commit on `main`, and the same
  instruction said to put nothing there. Neither route is available to me
  without your word — either commit the deletion straight to `main`, or say so
  and I will fold the removal into PR #2 by merging `main` in first (that also
  needs resolving `public/assets/maps/level2_path_overlay.png`, which `main`
  still carries and this branch deleted).
- **A stray branch of mine, `claude/level2-pad-rings-dk4e37`**, is on the remote
  from the earlier attempt. It has no PR, but it carries pads derived from the
  superseded overlay and a report asserting `roadWidth` moved to 67.6 — wrong,
  and misleading if anyone reads it. It should be deleted; say the word.

**Carried forward** from `reports/2026-09-04-level-2-volcanic-map.md`, untouched
here: whether fifteen pads is the intended count for a second board when level 1
has seven with a four-tower cap; whether `heroStart` reads right on the actual
board, which is a look rather than a measurement. Level 2 remains data only.
Longer-standing: re-cut the sign art at ~270px wide; the 568x320 drawer grid
lever; whether the drawer's tab bar has words; the sign text alignment; the hero
walk-sheet redraw; 18 trait phrases awaiting approval; towers 0.91x the lane;
balance not re-tuned for the v2 lane; `icon_confirm.png` and `assets/nodes`
unreferenced; `checks` not a required status on PRs; `hud_peanut_icon.png`
unwired.

**Closed by this change:** the two overlapping tap-target pairs flagged in §8 of
`reports/2026-09-04-level-2-volcanic-map.md`. That report called it an art fix,
and it was fixed in the art.
