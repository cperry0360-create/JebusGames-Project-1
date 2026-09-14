# Level 10's art, converted, measured and registered — and nothing else

**2026-09-14.** Thirty files out of `art-source/level10/` and
`art-source/titlecard_level10.png`, re-encoded at the house quality into
`public/assets/`, measured off their own pixels, and named in `art.json`.

**Nothing in the game changed.** `levels.json`, `enemies.json`, `towers.json`,
`cutscenes.json`'s two panel maps and every file under `src/scenes/` are
untouched. Level 10 is as unbuilt tonight as it was this morning, and every
number the build will need is now on disk instead of in a painter's export.

| commit | what | CI |
|---|---|---|
| `b9214cc` | the thirty files, the twenty-six manifest keys, the three test lists, `measure_art.py`'s new rows | [run 367](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34887454564) **green** — `changes`, `typecheck`, `test` all success; `deploy` skipped because this is a branch, not because the `changes` gate said documentation |
| *this commit* | this report | markdown only; it edits nothing the build reads |

Branch `claude/level-10-assets-2kqch4`. **This session could not push to `main`**
— the merge command is the first line of its reply. At the time of writing the
branch is one commit ahead of `main` and zero behind, so the merge is a
fast-forward.

---

## What landed, and what each file is

Twenty-nine roles. Two files were deliberately left alone; they are at the
bottom of this section.

### The boss, in three forms

| file | shipped as | manifest key | role |
|---|---|---|---|
| `lvl10-boss-vlaude.png` | `enemies/boss_vlaude.webp` | `enemy-vlaude` | Vlaude whole: a floating monolith with a face on it, hanging off a bundle of cables |
| `lvl10-boss-vlaude-code.png` | `enemies/boss_vlaude_code.webp` | `enemy-vlaude-code` | the same monolith showing code, with a projected blade out to its right |
| `lvl10-boss-vlaude-damaged.png` | `enemies/boss_vlaude_damaged.webp` | `enemy-vlaude-damaged` | cracked, arcing, shedding fragments |

### Four callbacks and four mash-ups

| file | shipped as | manifest key | role |
|---|---|---|---|
| `lvl10-callback-devil.png` | `enemies/enemy_callback_devil.webp` | `enemy-callback-devil` | the Devil in a suit, walking |
| `lvl10-callback-lich.png` | `enemies/enemy_callback_lich.webp` | `enemy-callback-lich` | the Glitch Lich, crowned, sword low and to the right |
| `lvl10-callback-politician.png` | `enemies/enemy_callback_politician.webp` | `enemy-callback-politician` | the Politician, waving, one greaved leg |
| `lvl10-callback-unicorn.png` | `enemies/enemy_callback_unicorn.webp` | `enemy-callback-unicorn` | the zombie unicorn, rainbow tail, gun rack on its back |
| `lvl10-mash-bull-tourist.png` | `enemies/enemy_mash_bull_tourist.webp` | `enemy-mash-bull-tourist` | a minotaur in a Hawaiian shirt with a camera |
| `lvl10-mash-drone-cameraman.png` | `enemies/enemy_mash_drone_cameraman.webp` | `enemy-mash-drone-cameraman` | a quadcopter wearing a lanyard and a tie |
| `lvl10-mash-rooster-phoenix.png` | `enemies/enemy_mash_rooster_phoenix.webp` | `enemy-mash-rooster-phoenix` | the Rooster half-turned to phoenix, one wing still white |
| `lvl10-mash-unicorn-car.png` | `enemies/enemy_mash_unicorn_car.webp` | `enemy-mash-unicorn-car` | a red car with eyestalks and a rainbow mane |

### The board, the tower, the wall

| file | shipped as | manifest key | role |
|---|---|---|---|
| `map_level10.png` | `maps/map_level10.webp` | `map-level10` | the level 10 plate, 4K, registered in `art.map` as `level10` |
| `tower_vlaude_countermeasure.png` | `towers/tower_vlaude_countermeasure.webp` | `turret-vlaude-countermeasure` | a purple-and-black turret with a cyan barrel |
| `prop_wall_intact.png` | `props/prop_wall_intact.webp` | `prop-wall-intact` | a wall section, whole |
| `prop_wall_cracked.png` | `props/prop_wall_cracked.webp` | `prop-wall-cracked` | the same section, cracked |
| `prop_wall_rubble_a.png` | `props/prop_wall_rubble_a.webp` | `prop-wall-rubble-a` | what is left of it, piece A |
| `prop_wall_rubble_b.png` | `props/prop_wall_rubble_b.webp` | `prop-wall-rubble-b` | piece B |

### Five effect sheets, eight frames each

| file | shipped as | manifest key | grid | role |
|---|---|---|---|---|
| `fx_vlaude_path_change.png` | `effects/fx_vlaude_path_change.webp` | `fx-vlaude-path-change` | 8 x 512 | the route being rewritten |
| `fx_vlaude_duplication.png` | `effects/fx_vlaude_duplication.webp` | `fx-vlaude-duplication` | 8 x 512 | Vlaude copying himself |
| `fx_vlaude_generation.png` | `effects/fx_vlaude_generation.webp` | `fx-vlaude-generation` | 8 x 512 | something generated onto the board |
| `fx_vlaude_recall_portal.png` | `effects/fx_vlaude_recall_portal.webp` | `fx-vlaude-recall-portal` | 8 x 512 | the portal he recalls through |
| `fx_vlaude_defeat.png` | `effects/fx_vlaude_defeat.webp` | `fx-vlaude-defeat` | 8 x 320 | Vlaude coming apart |

### Four UI icons

| file | shipped as | manifest key | role |
|---|---|---|---|
| `icon_build_locked.png` | `ui/icon_build_locked.webp` | `icon-build-locked` | a padlock over a build pad |
| `icon_haste.png` | `ui/icon_haste.webp` | `icon-haste` | a speed glyph |
| `icon_route_locked.png` | `ui/icon_route_locked.webp` | `icon-route-locked` | a padlock over a route |
| `icon_tower_boost.png` | `ui/icon_tower_boost.webp` | `icon-tower-boost` | a tower with an up arrow |

### Four comic files, converted and NOT in `art.json`

| file | shipped as | why it is not in the manifest |
|---|---|---|
| `cutscene_L10_01.png` | `cutscenes/cutscene_L10_01.webp` | see **The panels cannot be registered** below |
| `cutscene_L10_02.png` | `cutscenes/cutscene_L10_02.webp` | " |
| `cutscene_L10_03.png` | `cutscenes/cutscene_L10_03.webp` | " |
| `titlecard_level10.png` | `cutscenes/titlecard_level10.webp` | " |

### Two files deliberately NOT converted and NOT registered

**`art-source/level10/prop_route_gate_open.png` and
`prop_route_gate_closed.png`** are still PNGs in `art-source/` and always
should be. **Route switching was cut from the design**, so a gate that opens
and closes a route has nothing to open. Both are 501x257 with 477x233 of ink.

**This is the exact shape of the failure CLAUDE.md records under *an
unreferenced-asset sweep*** — nothing on `main` references them, so by the only
automated test available they are dead weight, and `eda11dc` deleted fourteen
files on precisely that evidence. They are named here, and in `art.json`'s
`_level10`, so the next sweep has somewhere to read that this is deliberate.

`icon_route_locked.png` **was** converted, and that looks inconsistent with the
paragraph above. It is not: the brief named two files to leave alone and that
was not one of them, and a padlock is a padlock whatever it is drawn over. If
route switching is never coming back, that icon is the one to reconsider — it
is 13 KB and it is flagged here rather than decided.

---

## INK against canvas, for every file

`contentWidth` and `contentHeight` in `art.json` are the **ink** extents from
`tools/measure_art.py` (`ink_box`, alpha > 16), never the canvas. `fitInBox`
divides by them, so an entry carrying the canvas draws its art small by exactly
the width of its transparent margin, silently, forever — which is what
`hud-peanut` did at 512x512 against a 498x400 painting.

| source file | shipped as | source canvas | source INK | INK vs canvas (w / h) | shipped canvas | shipped INK | KB |
|---|---|---|---|---|---|---|---|
| `lvl10-boss-vlaude.png` | `enemies/boss_vlaude.webp` | 2096x3706 | 2065x3675 | 1.5% / 0.8% | **836x1478** | 824x1466 | 208 |
| `lvl10-boss-vlaude-code.png` | `enemies/boss_vlaude_code.webp` | 929x1494 | 902x1466 | 2.9% / 1.9% | 929x1494 | 902x1466 | 274 |
| `lvl10-boss-vlaude-damaged.png` | `enemies/boss_vlaude_damaged.webp` | 851x1489 | 823x1461 | 3.3% / 1.9% | 851x1489 | 823x1461 | 265 |
| `lvl10-callback-devil.png` | `enemies/enemy_callback_devil.webp` | 464x727 | 436x700 | 6.0% / 3.7% | 464x727 | 436x700 | 91 |
| `lvl10-callback-lich.png` | `enemies/enemy_callback_lich.webp` | 797x728 | 769x700 | 3.5% / 3.8% | 797x728 | 769x700 | 219 |
| `lvl10-callback-politician.png` | `enemies/enemy_callback_politician.webp` | 512x728 | 484x700 | 5.5% / 3.8% | 512x728 | 484x700 | 107 |
| `lvl10-callback-unicorn.png` | `enemies/enemy_callback_unicorn.webp` | 790x728 | 762x700 | 3.5% / 3.8% | 790x728 | 762x700 | 187 |
| `lvl10-mash-bull-tourist.png` | `enemies/enemy_mash_bull_tourist.webp` | 562x728 | 534x700 | 5.0% / 3.8% | 562x728 | 534x700 | 95 |
| `lvl10-mash-drone-cameraman.png` | `enemies/enemy_mash_drone_cameraman.webp` | 908x721 | 880x693 | 3.1% / 3.9% | 908x721 | 880x693 | 126 |
| `lvl10-mash-rooster-phoenix.png` | `enemies/enemy_mash_rooster_phoenix.webp` | 685x728 | 657x700 | 4.1% / 3.8% | 685x728 | 657x700 | 170 |
| `lvl10-mash-unicorn-car.png` | `enemies/enemy_mash_unicorn_car.webp` | 908x728 | 880x700 | 3.1% / 3.8% | 908x728 | 880x700 | 211 |
| `fx_vlaude_path_change.png` | `effects/fx_vlaude_path_change.webp` | 4096x512 | 3827x322 | 6.6% / **37.1%** | 4096x512 | 3827x322 | 184 |
| `fx_vlaude_duplication.png` | `effects/fx_vlaude_duplication.webp` | 4096x512 | 3944x391 | 3.7% / **23.6%** | 4096x512 | 3944x391 | 644 |
| `fx_vlaude_generation.png` | `effects/fx_vlaude_generation.webp` | 4096x512 | 3742x399 | 8.6% / **22.1%** | 4096x512 | 3742x399 | 249 |
| `fx_vlaude_recall_portal.png` | `effects/fx_vlaude_recall_portal.webp` | 4096x512 | 3795x450 | 7.3% / **12.1%** | 4096x512 | 3795x450 | 377 |
| `fx_vlaude_defeat.png` | `effects/fx_vlaude_defeat.webp` | 2560x320 | 2436x292 | 4.8% / 8.8% | 2560x320 | 2436x292 | 366 |
| `tower_vlaude_countermeasure.png` | `towers/tower_vlaude_countermeasure.webp` | 817x750 | 789x722 | 3.4% / 3.7% | 817x750 | 789x722 | 114 |
| `prop_wall_intact.png` | `props/prop_wall_intact.webp` | 506x202 | 482x178 | 4.7% / **11.9%** | 506x202 | 482x178 | 20 |
| `prop_wall_cracked.png` | `props/prop_wall_cracked.webp` | 504x202 | 480x179 | 4.8% / **11.4%** | 504x202 | 480x179 | 24 |
| `prop_wall_rubble_a.png` | `props/prop_wall_rubble_a.webp` | 196x202 | 172x178 | **12.2%** / **11.9%** | 196x202 | 172x178 | 11 |
| `prop_wall_rubble_b.png` | `props/prop_wall_rubble_b.webp` | 196x202 | 172x179 | **12.2%** / **11.4%** | 196x202 | 172x179 | 11 |
| `icon_build_locked.png` | `ui/icon_build_locked.webp` | 226x238 | 210x222 | 7.1% / 6.7% | 226x238 | 210x222 | 18 |
| `icon_haste.png` | `ui/icon_haste.webp` | 238x164 | 222x148 | 6.7% / 9.8% | 238x164 | 222x148 | 13 |
| `icon_route_locked.png` | `ui/icon_route_locked.webp` | 223x238 | 207x222 | 7.2% / 6.7% | 223x238 | 207x222 | 13 |
| `icon_tower_boost.png` | `ui/icon_tower_boost.webp` | 237x238 | 221x222 | 6.8% / 6.7% | 237x238 | 221x222 | 15 |
| `map_level10.png` | `maps/map_level10.webp` | 3840x2160 | 3840x2160 | 0.0% / 0.0% | 3840x2160 | 3840x2160 | 1590 |
| `cutscene_L10_01.png` | `cutscenes/cutscene_L10_01.webp` | 1672x941 | 1672x941 | 0.0% / 0.0% | 1672x941 | 1672x941 | 609 |
| `cutscene_L10_02.png` | `cutscenes/cutscene_L10_02.webp` | 1672x941 | 1672x941 | 0.0% / 0.0% | 1672x941 | 1672x941 | 678 |
| `cutscene_L10_03.png` | `cutscenes/cutscene_L10_03.webp` | 1672x941 | 1672x941 | 0.0% / 0.0% | 1672x941 | 1672x941 | 643 |
| `titlecard_level10.png` | `cutscenes/titlecard_level10.webp` | 3840x2160 | 3840x2160 | 0.0% / 0.0% | **1672x941** | 1672x941 | 110 |
| *(not converted)* `prop_route_gate_open.png` | — | 501x257 | 477x233 | 4.8% / 9.3% | — | — | — |
| *(not converted)* `prop_route_gate_closed.png` | — | 501x257 | 477x233 | 4.8% / 9.3% | — | — | — |

### The eight files where INK and canvas differ by more than 10%

Asked for explicitly by the brief. **None of them is a mistake, and none of
them affects a `contentWidth` this manifest records.**

| file | w | h | why |
|---|---|---|---|
| `fx_vlaude_path_change.png` | 6.6% | **37.1%** | a sprite sheet: this is the union of all eight cells, and a path-change is a flat horizontal event that never fills a 512-tall cell |
| `fx_vlaude_duplication.png` | 3.7% | **23.6%** | as above |
| `fx_vlaude_generation.png` | 8.6% | **22.1%** | as above |
| `fx_vlaude_recall_portal.png` | 7.3% | **12.1%** | as above |
| `prop_wall_intact.png` | 4.7% | **11.9%** | a wall is a wide low object on a 202-tall canvas; the margin is above it |
| `prop_wall_cracked.png` | 4.8% | **11.4%** | as above |
| `prop_wall_rubble_a.png` | **12.2%** | **11.9%** | a 196x202 canvas with a uniform 12 px transparent border, which is 12% of something this small |
| `prop_wall_rubble_b.png` | **12.2%** | **11.4%** | as above |

**The four sheets record no content box at all**, which is why their 37% is
harmless: `measure_art.py`'s canvas-vs-ink audit skips any key with a `sheet`,
because the ink of an eight-frame strip is the union of eight frames and
describes none of them. Their manifest entry is the grid and nothing else.

**The four wall pieces record the ink**, so their margin is already divided
out.

**The audit agrees with every level 10 entry.** `python3 tools/measure_art.py`
ends with `186 entries checked, 20 disagree with their own pixels` — and all
twenty are pre-existing (the nine level 7 vehicles, the eight tower-panel
icons, the CEO, the Office Drone and `ui-nuke-down`, every one of them carrying
its canvas where its ink belongs). Not one level 10 key is among them.

---

## The four traps

### 1. The three Vlaude forms are pinned at `displayHeight` **200.0**

The brief is right that this is the trap. The three sources are **3706**,
**1494** and **1489** px tall; a form swap that scaled from source would drop
him to 40% of his height the moment he took damage.

**All three entries carry `displayHeight: 200.0`.** Where the number comes
from:

- Rule 7 at today's numbers is **7.11x** (maxZoom 2.37 from `display.json`, dpr
  capped at 3 by `Resolution.ts`). The binding constraint is the **shortest**
  source, because the other two must match it: 1489 / 7.11 = **209**.
- 200 is the largest round height under that, and it puts him above every boss
  in the game — the Transporter at 175 was the tallest thing on any board.
- At 200 the three sit at **1.04x, 1.05x and 1.05x** of what rule 7 asks, which
  is the same band level 9's cast landed in (1.00x to 1.22x) and nowhere near
  the heavy-minification end.

**And the full form was resampled to make the pin exact.** At 2096x3706 it was
17.8x its drawn height — the "too large" failure rule 7 also names, where a 4 px
outline sampled past about 2x becomes a grey smear. It is re-encoded at
**836x1478**, chosen so its INK height lands on **1466**, which is the code
form's ink height to the pixel.

What is left is a **1% difference in drawn ink** — 198.3 world px against 196.3
— and it is not fixable by resampling. It is the full form's tighter canvas
margin (0.8% of its height, against the other two's 1.9%), and that ratio is
invariant under a uniform scale. Closing it would mean re-padding a canvas,
which is a change to the art rather than to its encoding.

### 2. The portrait aspect is preserved, not squared

`lvl10-boss-vlaude.png` is 2096x3706 — **0.56557:1**, nearly 1:1.77. The resize
target 836x1478 is **0.56563:1**, six ten-thousandths out, which is one pixel
of rounding on the width. `tools/towebp` refuses a result whose dimensions are
not what was asked for, and the shipped file reads back as exactly 836x1478.

The two smaller forms were not resized at all.

### 3. Every sheet grid re-verified, and all five cells are square

Read out of each file's own IHDR rather than taken from the brief:

| sheet | canvas | frames | cell | square? |
|---|---|---|---|---|
| `fx_vlaude_path_change` | 4096x512 | 8 | 512x512 | yes |
| `fx_vlaude_duplication` | 4096x512 | 8 | 512x512 | yes |
| `fx_vlaude_generation` | 4096x512 | 8 | 512x512 | yes |
| `fx_vlaude_recall_portal` | 4096x512 | 8 | 512x512 | yes |
| `fx_vlaude_defeat` | 2560x320 | 8 | 320x320 | yes |

4096 / 8 = 512 and 2560 / 8 = 320, both exact, with no dead columns. **The
brief's numbers were correct** — which is worth recording because level 9's
were not: two of its seven sheets were a different grid from the one its
manifest claimed, and one shipped 4 px wider than eight cells.

Because every cell is square, none of the five carries the separate on-screen
height field. `EffectOptions.height` exists for the sheets that are *not*
square — the boss bolt at 482x412 and the stun overlay at 617x499, which a
square assumption squashes by 15% and 19%. `size` alone places a square cell.

### 4. The title card is downsampled, and the alpha question did not arise

`titlecard_level10.png` is **3840x2160** and ships as **1672x941**, which is the
size every shipped comic panel is (`cutscenes.json`'s `_panels`: "Every panel is
1672x941, which is 16:9").

**There was no alpha to flatten.** The title card and all three L10 panels are
PNG **colour type 2** — truecolour, no alpha channel at all. The shipped WebPs
have no alpha either: their VP8X flag byte reads `0x20`, which is exactly what
`cutscene_L9_01.webp`, `map_level9.webp` and `title_bg.webp` read. Checked
rather than assumed, on both sides of the encode.

`cutscene_L10_01/02/03.png` are already 1672x941 and were passed through
unresized, as the brief says.

---

## Registration, and the two places it could not go

Twenty-six keys are in `art.json`. **Four files are on disk and not in it.**
Both halves were forced by tests, and both were measured rather than guessed.

### What claims what

A key in `art.files` must be **claimed** by a role section or a data file —
`tests/manifest.test.ts`, *every file in the manifest is bound to something that
draws it*, written after three keys survived a swap by being in `files` and in
nothing else. So:

| keys | claimed by |
|---|---|
| `map-level10` | `art.map.level10` — a role, and the same route `map-level7` and `map-level8` took before their levels existed |
| the five `fx-vlaude-*` | `art.fx`, five new role names |
| the four `prop-wall-*` | `art.prop`, four new role names |
| the four `icon-*` | `art.optional`, beside the eight tower-panel glyphs already there; `tests/boot.test.ts` requires every optional key to belong to a family with a named fallback, and `/^icon-/` is one of the three |
| the eleven cast sprites and `turret-vlaude-countermeasure` | **nothing could claim them**, so `tests/manifest.test.ts` carries an explicit `AWAITING_LEVEL_10` list |

That last row is the one worth reading twice. **An enemy's picture is claimed by
`enemies.json` and a tower's by `towers.json`, and this session was told not to
touch either** — correctly, because a row in them is gameplay. The machine tower
skins escaped this test only because `towerSkins.keys` happens to name both
halves of a pairing; a plate escapes it because `map` is a role. An enemy has no
such section. The two remaining options were to invent gameplay data or to leave
twelve files on disk that `art.json` does not know about, and **an explicit
twelve-name list in the test is better than either**: it is a to-do, it asserts
each name really is in the manifest, and the level 10 build deletes it in one
stroke when `enemies.json` and `towers.json` claim all twelve.

### Twenty-one keys are level art, and that is what keeps boot honest

Everything except the four UI icons is filed under
`art.levelArt.byLevel.level10`. **`queueArt` fetches every key in `art.files`
that is not level art, on every boot, for every player** — so leaving these at
boot would have put about 5.4 MB of unusable textures on the loading bar.

`map-level10` is not in that row and does not need to be: it is in `art.map`,
which makes it a `PLATE_KEY`, which is already level art.

**`level10` is NOT added to `towerSkins.machine.levels`, and must not be.**
`levelArtKeys` resolves an unknown id to the **default** level, so naming
`level10` there today would switch the machine skin on for level 1 and ask it
for fourteen textures it never fetched. That list gains `level10` on the day
`levels.json` does, and `art.json`'s `_towerSkins` has said so since the skins
landed.

### The panels cannot be registered, and this was measured

Putting `cutscenes/cutscene_L10_01.webp` in `art.files` under a probe key fails
`tests/manifest.test.ts` **twice**, verified by actually doing it:

```
not ok 2 - no source file names an art file or directory directly
    '../src/systems/Cutscenes.ts names the "cutscenes/" asset directory'
not ok 15 - every file in the manifest is bound to something that draws it
```

The first is structural: that test derives its list of asset directories from
`art.files` itself, so naming any `cutscenes/…` path makes `cutscenes` an asset
directory — and `Cutscenes.ts` contains the literal `'cutscenes/'` in
`cutsceneProblems`, which is the function that validates panel paths. The second
is the claim rule above; no role draws a comic panel, because `CutsceneScene`
reads paths straight out of `cutscenes.json`.

**And `cutscenes.json` cannot name them either.** Both of its maps are keyed by
a level id, `cutsceneProblems` fails any key that is not a row in `levels.json`,
and `tests/cutscenes.test.ts` holds it to that. So the four files sit under
`public/assets/cutscenes/`, referenced by nothing, and the only thing standing
between them and the next sweep is a new `_level10` note in `cutscenes.json`
saying exactly that. Registering them is **four lines** on the day level 10 gets
its row: a `level10` entry under `levels` with the three panels in order, and a
decision about where the title card plays — which is a level 10 question, not an
art one.

This is the same state `comic_l9_end_gate_A.png` was in, described in that
file's `_level9` note, and it resolved the same way.

---

## The sizes, and which of them are decisions

`contentWidth`, `contentHeight`, `anchorX`, `anchorY` and `shadowWidth` are
**measured**. `displayHeight` is a **design number** — CLAUDE.md rule 7 calls it
that, and `measure_art.py` repeats it. Level 10 has no roster, so nothing has
tuned these; each is the house **size class** the picture belongs to, which is
defensible, rather than a guess.

| key | displayHeight | why that number | source h | rule 7 wants | ratio |
|---|---|---|---|---|---|
| `enemy-vlaude` | **200.0** | see trap 1 | 1478 | 1422 | 1.04x |
| `enemy-vlaude-code` | **200.0** | pinned to match | 1494 | 1422 | 1.05x |
| `enemy-vlaude-damaged` | **200.0** | pinned to match | 1489 | 1422 | 1.05x |
| `enemy-callback-devil` | 100.0 | `enemy-cancer`'s height: these are returning bosses | 727 | 711 | 1.02x |
| `enemy-callback-lich` | 100.0 | " | 728 | 711 | 1.02x |
| `enemy-callback-politician` | 100.0 | " | 728 | 711 | 1.02x |
| `enemy-callback-unicorn` | 100.0 | " | 728 | 711 | 1.02x |
| `enemy-mash-bull-tourist` | 85.0 | the heaviest-elite class on levels 3, 5 and 6, and **under the 87.1 px shortest tower** | 728 | 604 | 1.20x |
| `enemy-mash-drone-cameraman` | 85.0 | " | 721 | 604 | 1.19x |
| `enemy-mash-rooster-phoenix` | 85.0 | " | 728 | 604 | 1.20x |
| `enemy-mash-unicorn-car` | 85.0 | " | 728 | 604 | 1.20x |
| `turret-vlaude-countermeasure` | 87.1 | what **every** tier-1 tower in the game is | 750 | 619 | 1.21x |

**Every one of the twelve clears rule 7**, and none is over-provisioned enough
to minify badly. The wall pieces and the icons carry no `displayHeight`: a prop
is sized by the map data that places it, exactly as `prop-vlaude-screen` and the
four build-node chips are.

**The mash-ups at 85 rather than 100 is the one judgement worth challenging.**
`tests/content.test.ts` holds the rank and file under the shortest tower, and a
brief has asked for 92 three times and been told no three times; 85 is the
answer that has held. If level 10 makes a mash-up a boss, raising it is one
number in `art.json` and one in `measure_art.py`.

**And the art itself says nothing about relative size.** All eight callbacks and
mash-ups were exported to a normalised frame — every ink box is exactly **700 px
tall** (693 for the drone) inside a ~728 px canvas. That is why the classes above
are stated rather than read off the pictures: there is nothing in the pictures to
read.

### The countermeasure's base is the strongest corroboration here

At `displayHeight` 87.1 its widest row in the bottom third measures **73.5
on-screen pixels**. The median tower base in the game is **73.0**
(`MEDIAN_BASE_ON_SCREEN` in `measure_art.py`, set from the painted road). That
is 0.7% — the tower art was drawn to the same scale as the six that shipped, and
87.1 is simply correct for it.

### Five sprites are shadowed and anchored by their body, not their feet

| key | why |
|---|---|
| `enemy-vlaude`, `-code`, `-damaged` | a monolith hanging in the air off a bundle of cables. The deepest thing in the silhouette is a cable tip, so a footprint measured there would be a shadow one cable wide under a whole boss — the Hat's case exactly |
| `enemy-mash-drone-cameraman` | a quadcopter; the Office Drone again |
| `enemy-mash-unicorn-car` | a car; the level 7 vehicles again |

Added to `LEVEL10_FOOTLESS` in `tools/measure_art.py` and to `BODY_SHADOWED` in
`tests/manifest.test.ts`, with the reason written at both.

**The other seven really do stand on something**, and two of their foot bands
are worth keeping:

- **The Lich at 0.94.** His glitched sword runs down to the right and at 0.90 its
  tip reads as a third foot — a group at x657-782 of 797 — dragging the anchor to
  0.5665. At 0.94 the tip is above the cut and only his two boots are left. This
  is the Lich King's `ENEMY_FOOT_WINDOW` problem solved by the band instead of by
  a window.
- **The rooster-phoenix at 0.92.** Its tail plumes sweep down and at 0.90 the
  silhouette finds them at x68-139, anchoring it at 0.4460. At 0.92 exactly two
  groups survive, x190-335 and x409-543, which are its feet. `boss_rooster` had
  to be body-shadowed for this; this one did not.
- **The politician at 0.92 and not deeper.** At 0.94 his trailing shoe is gone
  and the anchor jumps 0.5742 → 0.7646, which would walk him with the lane under
  his elbow.

### One thing recorded rather than fixed

**The code form's shadow is 8% wider than the other two's** — 124.4 against
113.1 and 114.3 — because its projected blade extends its ink to the right and a
body shadow is the body's whole width. Its x anchor is unaffected: all three ink
centres land at **0.4994, 0.5000 and 0.4994**, so the swap does not shift him
sideways. If an oval that widens when he draws the blade reads wrong in play,
the fix is to pin `enemy-vlaude-code`'s `shadowWidth` to the other two's; it is
flagged, not decided.

---

## The budget

Measured on both sides of the change, with the same code the test uses.

| | before (271 files) | after (301 files) | cap |
|---|---|---|---|
| **boot path** | 6.57 MB | **6.63 MB** | 8 |
| **worst single level** | 17.06 (level 9) | **17.06 (level 9)** | 18 |
| **music (streams)** | 6.41 MB | 6.41 MB | 10 |
| **largest single image** | — | 1.59 MB (`map_level10.webp`) | 3 |
| **whole deploy** | 47.96 MB | **55.60 MB** | 50 → **58** |

**The boot path moved by 0.06 MB and that is the number a player waits on.** It
is the four UI icons; every other level 10 key is level art and `queueArt` skips
it. **The worst single level did not move at all**, because level 10 has no row
in `levels.json` and no level fetches its row.

**The total cap goes 50 → 58, and this is the raise the split was designed to
allow.** The three caps a player actually experiences are untouched and still
tight. What the total is now measuring is **7.64 MB of art no player can reach**
— which is the orphan case that cap's own note names, and it is orphaned
deliberately and with a register: every key appears in `orphanedLevelArt`'s list
in `tests/levelart.test.ts`, which empties itself when level 10 ships. If level
10 is ever cancelled, that 7.64 MB is what comes back out and the cap goes back
to 50.

**The per-level cap is still the one to watch.** Its note predicted level 10
would not fit in 18 MB and nothing here has tested that: the plate is 1.59 and
the cast 1.95, so on the day it gets a row it lands near level 9's 17.06 before
its comics are counted. That bill comes due with the level, not with its art.

### The deploy artifact — what to check on merge, and why not here

**`deploy` only runs on `refs/heads/main`** (`github.ref == 'refs/heads/main'`
in `checks.yml`). It is skipped on every branch push by that condition, not by
the `changes` gate. So the Pages artifact could not be built or weighed from
this branch, and **this is the one thing the brief asked for that is not
verified here.**

The baseline and the expectation, so it is one look after the merge:

- **Run 366 on `main` at `d9611e4` uploaded `github-pages` at 50,699,794 bytes**
  (50.70 MB). That is `dist/`, which is `public/` copied verbatim plus the
  bundle — 47.96 MB of assets plus 2.74 MB of everything else.
- The thirty new files are **7,641,900 bytes**. They are WebP, so the artifact's
  gzip gains nothing on them.
- **The next `main` artifact should be about 58.3 MB, up about 7.6.** Anything
  much smaller means files did not reach `dist/`; anything much larger means
  something else came with them.

Read it with the artifacts endpoint for the run that merges this:
`actions_list / list_workflow_run_artifacts`, field `size_in_bytes`.

---

## Verification

| what | result |
|---|---|
| `npm test` | **1099 pass, 0 fail** |
| `sh tools/tsdiff.sh 0496f2d` | baseline 213 distinct errors, working tree **213**, nothing introduced |
| `sh tools/harness/build.sh` | staged 130 modules |
| `python3 tools/measure_art.py` | runs clean; **186 content boxes checked, 20 disagree, none of them level 10's** |
| CI run 367 | green — `changes`, `typecheck`, `test`; `deploy` skipped (branch) |

### The conversion itself

All thirty through `tools/towebp` at quality 0.95, which decodes each result and
compares it to its source before keeping it. **All thirty written. Alpha differs
by 0 on 0 pixels in every file.** PSNR is measured on premultiplied channels
over the pixels a player can see.

| | file | dB |
|---|---|---|
| worst | `ui/icon_route_locked.webp` | 31.3 |
| | `ui/icon_build_locked.webp` | 31.5 |
| | `effects/fx_vlaude_generation.webp` | 32.0 |
| best | `effects/fx_vlaude_duplication.webp` | 44.7 |
| | `cutscenes/titlecard_level10.webp` | 44.5 |

The three worst are all flat-colour art, which is where a lossy codec always
scores lowest, and two of them are 13 and 18 KB icons. For comparison, the
fourteen machine tower skins were rejected for re-encoding at **28.5 to 36.4 dB**
with six under 32; nothing here is in that range.

### The harness

The brief says nine scenarios assert nothing. **That list is stale, and the
repository already knows the true one.** `tools/harness/server.py` gained
distinct exit codes for exactly this, and `index.html` carries the register:

| scenario | exit | what it means |
|---|---|---|
| `muzzle`, `rockets`, `retreat`, `regressions`, `meteor` | 7 | on `ASSERTS_NOTHING` — descriptive, by declaration. **Five, not nine.** |
| `poor` | 6 | **not a scenario at all.** `UNKNOWN SCENARIO: 'poor' matches nothing in index.html`. It is not a check that asserts nothing; it is a name that dispatches nothing. |
| `ui` | 0 | ran and passed: *the pad beats the ground, and the hero moves only when he has been picked up* |
| `buildall` | 0 | ran and passed: *every one of the 7 pads took a tower at 1400x708* |
| `typegame` | 0 | ran and passed, **6 assertions evaluated**: *both panels raised, dismissed and reported* |

**`ui` and `buildall` are green.** `reports/2026-09-14-merge-level-9.md` lists
them as "red and undiagnosed" in its open items; they are not red today. That
item can be closed.

Scenarios run for this change, all `assertFails: 0`:

| scenario | result |
|---|---|
| `boot` | `bootFailed: false`, `directorError: null`, no page errors, no early errors |
| `levelart` | clean; plates for levels 1-5 and 9 rendered |
| `texmem` | clean |
| `sprites` | clean |
| `screens` at 844x390 | one **SMALL** — `title:version-stamp`, annotated in the scenario itself as *hidden dev door, not a tap target*. Nothing OFF, nothing under a NOTCH, nothing OVER. |

**The pictures were read as well as the numbers**, per CLAUDE.md: the title
screen and the level 1 board both render whole, with no missing-texture
stand-ins anywhere.

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh screens 180 844x390
python3 tools/harness/shrink.py tools/harness/shots/screens-1-title-844x390.png 900
python3 tools/harness/shrink.py tools/harness/shots/screens-5-game-844x390.png 900
```

### What was NOT checked

- **The deploy artifact.** Cannot be built on a branch; see above.
- **Anything rendered about level 10.** No level 10 art is drawn by anything, so
  no frame in the harness contains any of it. The first time these sprites are
  seen on a board will be during the level 10 build, and that is when their
  `displayHeight`s get their real test.
- **The test suite says nothing about any of this.** No test in `tests/` imports
  Phaser; a green 1099 is not evidence about a sprite's size or a texture that
  loaded. The harness is the only thing that looks at a frame, and what it
  looked at here is that the existing game still boots.
- **`tools/.imgcache/` was not cleared before measuring.** It did not need to be
  — every file measured is new, so there was no stale decode to serve. Level 9's
  re-encode at a changed size is the case where it matters.

---

## Where this leaves the repository

**IN FLIGHT:** branch `claude/level-10-assets-2kqch4`, one commit, green on run
367, fast-forwardable onto `main`. The merge command is the first line of this
session's reply.

1. **The deploy artifact size is unconfirmed until this is on `main`.** Baseline
   50,699,794 bytes at `d9611e4`; expect about 58.3 MB. One API call after the
   merge run.
2. **Level 10's twelve cast keys are held in `art.json` by a list in a test.**
   `AWAITING_LEVEL_10` in `tests/manifest.test.ts`. The level 10 build deletes
   that block the moment `enemies.json` and `towers.json` name them, and a key
   still needing it after that is a key nothing draws.
3. **Twenty-two keys are in `orphanedLevelArt`'s waiting list** in
   `tests/levelart.test.ts`. It empties itself when `levels.json` gets a
   `level10` row, exactly as it did for level 6's five, level 7's and 8's eight,
   `map-level9`, and the fourteen machine tower skins.
4. **`level10` is not in `towerSkins.machine.levels` and must not be added
   before it is a level.** `levelArtKeys` resolves an unknown id to the default
   level, so adding it today switches the machine skin on for level 1.
5. **Four comic files are on disk and referenced by nothing.** Three panels and
   the title card, 2.04 MB. The only thing protecting them from a sweep is
   `cutscenes.json`'s new `_level10` note. Wiring them is four lines once level
   10 exists, plus a decision about where the title card plays.
6. **Two route-gate props are deliberately unconverted**, and `icon-route-locked`
   is converted, which is the loose end in that pairing. Route switching was cut;
   if it is not coming back, that icon is 13 KB to reconsider.
7. **The per-level cap will be the next thing to move**, not the total. Level 10
   fetching its own plate, cast, skin and comics lands near level 9's 17.06
   against a cap of 18. The note on that cap has predicted this twice.
8. **The deploy total cap is 58 with 2.4 MB of headroom**, and 7.64 MB of what it
   measures is art no player can reach. That is the right trade while level 10 is
   being built and the wrong one if it is abandoned.
9. **Eight pre-existing manifest entries carry their canvas where their ink
   belongs** — the nine level 7 vehicles, the eight tower-panel icons, the CEO,
   the Office Drone and `ui-nuke-down`, twenty in total. `measure_art.py` has
   reported them on every run since the audit was written and nothing has picked
   them up. Not this session's to fix; still true.
10. **Carried forward from `reports/2026-09-14-merge-level-9.md`:** its open item
    about `ui` and `buildall` being red is **closed** — both are green, measured
    above. Its other items are untouched by this session.
