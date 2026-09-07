# Four live bugs on the level select screen

| commit | what it is | CI |
|---|---|---|
| `3d4dea3` | BUG A and B — logic | **green**, covered by run 162 (pushed with `c03af43`) |
| `c03af43` | BUG D — layout; BUG C — not reproduced | **green** — [run 162](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34117165358) |
| `REPORT_SHA` | This report | **CI_REP** |

**Deployed.** `deploy / build` and `deploy / deploy` both ran inside run 162 — read off
the run's job list, not inferred from the run being green, because `deploy.yml` is
`workflow_call` and has no run of its own. github-pages deployment `6307785958` for
`c03af43` reached **success** at 11:34:07 UTC.

Tests **955 → 957** (951 at the start of this work). Split logic from layout as asked,
so A/B and C/D bisect separately.

---

## BUG A — the world map routed straight into a loadout

### It was neither suspect

**Not a pending route** left by NEXT LEVEL — there is no such flag, and the NEXT LEVEL
path was driven end to end to confirm it. **Not the save migration** — the legacy shape
was reconstructed and none of it crashes.

**`plateButton` fires on POINTERDOWN.** The title screen therefore hands over on the
*press*. WorldMapScene builds its road under a finger that is still down, and the
*release* lands on whatever node the layout has just put beneath it. The node's
`pointerup` handler asks only `if (this.dragged <= TAP_SLOP)` — and a press this scene
never saw has travelled zero distance by definition, so it reads as a clean tap on a
level.

**"It worked once, then started doing this every time" is the scroll position, not a
flag.** The map opens scrolled to the furthest unlocked level. On a fresh save the road
is clamped at slot one and nothing sits under the button; the moment a level is beaten a
node is centred *exactly* where the finger already is.

Reproduced at 844x390, pressing the real button:

| save | result before the fix |
|---|---|
| fresh | WorldMap ✓ |
| one level cleared | WorldMap ✓ |
| **all four cleared** | **Loadout — fell straight through** |

### The fix, and the half that mattered

A `pressedHere` guard: a node may not act on a release this screen never saw the press
for. **That alone fixed only the first entry.** Phaser reuses the scene instance, so a
field initialiser runs once in the lifetime of the game — and BACK also hands over on
the press, so the scene shuts down with the flag still true and its delayed clear never
runs. The gesture state is reset in `create()` as well, which is what fixes the second
and every later visit. That second-entry failure is how the bug was described in the
first place.

### The migration was tested anyway, and is not broken

The legacy `SaveData` shape was reconstructed from `9172418` — nine fields, no
`clearedLevels`, no `difficultyId`, no `cakes` — written as raw JSON so nothing could
helpfully add the new fields, and loaded straight into the world map without ever
reaching a level. That is the kid-on-a-tablet path the brief named.

| save shape | loads as | map |
|---|---|---|
| legacy, `runsCleared: 1` | `["level1"]`, difficulty `""`, cakes `{}` | opens |
| legacy, `runsCleared: 4` | `["level1".."level4"]` | opens |
| beaten levels, no difficulty | `["level1","level2"]` | opens |
| difficulty set, no cakes | `["level1","level2"]`, `try-hard` | opens |
| junk (`clearedLevels` a string, `difficultyId` a number, `cakes` an array) | `["level1","level2"]` | opens |

**No crash on any of them, and progress is preserved** — four cleared runs still means
four beaten levels. **Cory's earlier crash is not explained by anything found here and
is not claimed to be fixed.** It remains open.

---

## BUG B — every cake rendered unearned

### It was neither candidate either

- **Not the shared texture.** `ui-cake` and `ui-cake-unearned` measure 87.2 and 137.7
  mean luma — different pictures. The dim is built into a second texture and applied
  per sprite.
- **Not an inverted test.** `i < opts.earned` is correct.

`cakesEarned()` returned **0** for every beaten level, because the save held no cake
records — and *every save written before cakes shipped is that save*. The loader
deliberately refused to migrate them. The dim was correct behaviour on data that said
zero; the data was what was wrong.

That refusal was half right, and I wrote it. Two and three genuinely cannot be
migrated: lives remaining was never recorded, and inventing it would put a number on a
node nobody earned. **One can**, because the bottom tier is literally "cleared the level
at all" and `clearedLevels` is exactly that claim. It is the tier the save already
proves, not a guess, and a real record always wins over it.

Verified from a rendered map:

| save | level 1 | level 2 | level 3 | level 4 (unbeaten) |
|---|---|---|---|---|
| three beaten, no records | **1 lit of 3** | **1 lit of 3** | **1 lit of 3** | 0 of 3 |
| a real 3-cake record on level 1 | **3 lit of 3** | 1 lit of 3 | 1 lit of 3 | 0 of 3 |

---

## BUG C — not reproduced, and here is exactly what was ruled out

**No fix is claimed.** The brief was right that "cannot reproduce" was the wrong answer
last time, so this leaves a detector behind instead of a shrug.

The new `mapedge` scenario opens the world map at a given viewport, lists **every drawn
object as a screen rectangle**, flags anything tall and narrow near either edge, and
samples the canvas down the left 24 px for near-black pixels.

| viewport | aspect | objects | tall-narrow near an edge | left strip below luma 40 |
|---|---|---|---|---|
| 1180x524 | 2.25:1 | 93 | **0** | **0.0%** |
| 1600x708 | 2.26:1 | 93 | **0** | **0.0%** |
| 844x390 | 2.16:1 | 93 | **0** | **0.0%** |

The parchment reads about luma 130, so a black pill would be unmissable in that last
column.

**And the things a canvas probe cannot see were checked separately.** The game creates
exactly three DOM overlays:

- `Toast` — centred (`left:50%` with a translate), fades after 5.2 s, then removes itself;
- the missing-art banner — full width, red, at the top;
- the rotate gate — full screen, portrait only.

Neither page can show a scrollbar: the shipped `index.html` and the harness page both
set `overflow: hidden` on `html, body`.

**What would settle it:** Cory's exact viewport in CSS pixels and his device pixel
ratio — `sh tools/harness/run.sh mapedge 120 <WxH>` then answers it directly — and
whether the pill **fades after about five seconds**. The toast is the only dark rounded
element in the whole game, and fading is the one behaviour that would identify it on
sight.

---

## BUG D — the difficulty readout moves into the chrome bar

**The occlusion was the defect.** It sat at (1120, 68), inside the band the road scrolls
through, so map nodes passed underneath it. It is now at the left end of the bottom
chrome bar — the one strip on this screen nothing scrolls through, and empty apart from
BACK.

The three presentation problems, all fixed with the move:

| before | now |
|---|---|
| DIFFICULTY stacked above the plate in a different size and colour, reading as two elements | label and value on **one baseline inside one chip**, label dim, value in ink |
| the same orange plate as BACK, the screen's primary action | a **flat dark chip with a thin edge** — quieter, and clearly not the primary |
| read as a button that does something | reads as a **value** that happens to be tappable |

Still a legal tap target — the hit rectangle goes through `tapFloor`. Every size is in
`presentation.json` under `difficultyChip`; nothing is hardcoded. A test asserts the
chip's box is below the road band and clear of the BACK/RESUME group.

---

## What came from rendered frames, and what did not

**From rendered frames:**

- Bug A reproduced and fixed — `maproute` presses the real WORLD MAP button across
  eight save shapes, twice in a row, and after NEXT LEVEL.
- Bug B diagnosed and fixed — `cakestate` reads the texture key off every drawn cake on
  a real map and samples both textures' pixels.
- Bug C's negative result — `mapedge` at three short-wide viewports.
- Bug D's new position — the world map at 1600x708, read as a picture as well as
  numbers.
- Layout audits: `screens` at 667x375, 844x390 and 1400x708 report **no new faults** —
  the only one is the pre-existing Title version stamp, annotated as a hidden dev door.
  375x667 and 390x844 report **gated**, which `CLAUDE.md` says is the correct answer for
  portrait rather than a skipped check.

**NOT from rendered frames:**

- The save-migration results are read out of `loadSave()` in the running game, not seen
  on screen. The map was confirmed to *open* on each shape; the beaten-level ticks were
  not counted from the picture (the probe looked for a texture key and the tick is drawn
  as graphics, so it reported 0 on every shape including working ones — a probe
  limitation, not a finding).
- Bug D was verified at 1600x708 as a picture and at the other viewports only through
  the `screens` fault numbers.
- **Nothing was checked against the live site.** The sandbox's egress proxy answers 403
  to CONNECT for github.io by policy, as the brief said it would.

---

## Where this leaves the repository

**Still open, and I could not close them:**

1. **Bug C — the black pill.** Not reproduced. Needs Cory's exact viewport and dpr, and
   whether it fades.
2. **Cory's earlier hard crash on the level select screen.** The migration theory was
   tested and does not hold. There is no evidence left to work from — the save that
   crashed has been overwritten — and nothing in this session explains it.

**Not started — the second brief in the same message:** Star Rain's targeting,
Courtland's missing effect art, and the hero ability set. That is a separate piece of
work and none of it is begun.

**Carried forward, untouched:**

3. The fault guard's blast radius across the other ~90 harness scenarios.
4. Pad 3 on level 1 will not build at 844x390.
5. A tap on the hero does not select him.
6. `icons`' three claims are unguarded.
7. Cake tiers are probably too generous.
8. The verdict line and the 2-cake tier disagree at exactly half.
9. Dialog buttons fall to about 24 CSS px when a panel scales to fit a phone.
10. World map node cakes are 24–25 CSS px on a phone.
11. Courtland's ability names disagree with his icons.
12. Nine canvas-vs-ink content boxes.
13. The hero's ability medallions go dead after the Server Nuke drops.

**On coverage.** All four bugs reached the live site through green CI, which the brief
rightly compared to the missing ability art and the towerpanel harness. The reason is
the same in every case: **the harness drove the scene, not the button.** The existing
`worldmap` scenario calls `scene.start('WorldMap')` by hand, so it could never have seen
a bug that only exists because of how the previous screen hands over. The three new
scenarios all press real controls, and `maproute` in particular would have caught Bug A
on the day it shipped.
