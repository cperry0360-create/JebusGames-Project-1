# Level 9 and 10 art: manifest, facing, and the mechanics that do not exist

**2026-09-12.** An audit of the art uploaded for levels 9 and 10, and the
handover document for whoever writes the level 9 and level 10 build prompts.

Nothing here changes the game. No file was converted into `public/assets/`, no
row was added to `art.json`, `enemies.json`, `cutscenes.json` or any other data
file, and no stat, display size or level datum was invented. Levels 9 and 10
have no roster and this report does not guess one.

| commit | what | CI |
|---|---|---|
| `a614f58` | Sort the level 9 and 10 art into `art-source/level9` and `level10` | [run 288](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34724533814) green |
| *this commit* | This report | filled in by the commit below |

Branch `claude/level-9-10-art-audit-izulqc`. The session could not push to
`main`; the merge command is at the bottom of this file and was the first line
of the session's reply.

---

## The headline

**52 of the 53 expected files arrived. `titlecard_level10.png` did not.**

**36 of them landed at the repository root, not in `art-source/`.** Three of the
five upload commits — `f9e906b`, `9f0b068`, `cfadf5e` — wrote their files
directly beside `package.json`. Nothing was lost and nothing read them from
there, but that is not where anybody would look for them. They are now sorted.

**Every one of the 52 is a clean, uncorrupt, 8-bit PNG.** No baked transparency
checkerboards, no bad CRCs, no truncation, no trailing garbage. The external
clean-up did its job.

**Six character sprites face the opposite way from what the brief expected**,
and two more that the brief did not cover carry text or a glyph that cannot be
mirrored at all. That section is the one a build prompt must read before it
writes an `artFacing` value.

---

## Step 1 — the upload

53 files were expected. 52 were found and every one of them is readable.

### Missing

| file | status |
|---|---|
| `titlecard_level10.png` | **NOT PRESENT** anywhere in the repository, in any commit. Not misplaced — never uploaded. |

Level 9 has no title card in the expected list either, so this is not one of a
pair: only level 10's is specified and only level 10's is missing.

### Where they landed

| upload commit | files | landed in |
|---|---|---|
| `f9e906b` | 9 | repository root |
| `9f0b068` | 12 | repository root |
| `cfadf5e` | 15 | repository root |
| `ffbd9cc` | 12 | `art-source/` |
| `2cc0129` | 4 | `art-source/` |

### Integrity

Every file was parsed chunk by chunk against the PNG spec: signature, IHDR,
per-chunk CRC32, IEND present, no bytes after IEND.

- 52/52 valid signature, valid IHDR, **every chunk CRC correct**, IEND present,
  **zero trailing bytes**.
- 52/52 bit depth 8, non-interlaced.
- 47 are RGBA (colour type 6). **5 are RGB with no alpha channel at all**: the
  two map plates and the three cutscene panels. That is correct for all five —
  they are full-frame paintings.
- No file carries an ancillary chunk beyond the required ones. No embedded
  colour profile, no text chunks, no gamma. They are as plain as a PNG gets.

---

## Step 2 — what moved where

`art-source/` sits outside `public/` and is not copied into the build.

**Nothing in the repository references any of the 52 filenames.** Verified by
grepping every stem against the whole tree outside `art-source/`: no hit in
`src/`, `src/data/`, `tests/`, `tools/`, or any markdown. The paths were free to
move.

The `art-source/` paths that *are* referenced all belong to earlier levels and
were left exactly where they were:

| referenced path | by |
|---|---|
| `art-source/l5_board.png` | `tools/trace_level5.py` |
| `art-source/map_level6.png` | `tools/trace_level6.py`, `tools/check_level6.py`, `tools/level6_geometry.json`, `src/data/level6.json` |
| `art-source/Courjahan_Defense_Level8_4K.png` | `tools/trace_level8.py`, `tools/check_level8.py` |
| `art-source/nodes/node_rest.png` | `tests/manifest.test.ts` |
| `art-source/props/prop_bailey_peek.png` | `tests/manifest.test.ts`, `src/data/README.md` |
| `art-source/` (directory walk) | `tools/img.py` — walks for `.webp` only, unaffected by a PNG moving into a subdirectory |

Levels 5 through 8 remain flat at the top of `art-source/`, as the brief asked.

### The split

- **`art-source/level9/` — 22 files**: the plate, the four chip nodes, three
  enemies, six minibosses, seven fx sheets, and `prop_vlaude_screen.png`.
- **`art-source/level10/` — 30 files**: the plate, three Vlaude states, four
  callbacks, four mashups, the countermeasure tower, two gate props, four wall
  props, four Vlaude fx sheets, four icons, three cutscene panels.

22 + 30 = 52.

**`prop_vlaude_screen.png` is the one judgement call.** Its name says Vlaude,
who is level 10's boss, and every other `*vlaude*` file went to `level10/`. It
went to `level9/` instead because it sits inside the level 9 block of the
brief's own listing, and because level 9's plate is the circuit board Vlaude
lives on — a screen showing his face is level 9 set dressing that foreshadows
the level 10 boss. If that reading is wrong it is one command:

```
git mv art-source/level9/prop_vlaude_screen.png art-source/level10/
```

---

## Step 3 — the manifest

### Method

Measured with the repository's own pure-Python PNG reader (`tools/png.py`);
there is no PIL, no numpy and no ImageMagick in this environment and the
registry answers 403, so nothing else was available. Ink bounding boxes use
alpha > 16, the same threshold `tools/measure_art.py` uses, so the numbers are
comparable with the ones already in `art.json`.

**`max safe displayHeight`** is the column a build prompt actually needs. CLAUDE.md
rule 7 says source height must be at least `world height × maxZoom × devicePixelRatio`.
`src/data/display.json` has `maxZoom: 2.37` and `MAX_SCALE = 3` in
`src/systems/Resolution.ts`, so the multiplier today is **7.11**. The column is
`ink height ÷ 7.11`: the largest `displayHeight` that sprite can be given before
the GPU starts magnifying it on a retina phone at full zoom. It is a ceiling, not
a recommendation — **it is not a display size and must not be pasted into
`art.json` as one.** The roster decides the size; this says what the art can bear.

Recompute the 7.11 rather than memorising it. The zoom band moves.

For the eleven animation sheets, the ink bbox in this table spans **all eight
frames** — so its width is the whole strip and only its height is per-frame. The
per-cell boxes are in the frame-grid section below.

### On the checkerboard check, and a false positive worth recording

The first detector flagged three files — `lvl9-miniboss-crab`,
`lvl10-mash-bull-tourist`, `prop_route_gate_closed`. All three were **wrong**,
and they are worth writing down because the failure looked exactly like the
thing being hunted.

That detector asked whether scattered near-neutral opaque pixels correlated
with a grid parity. Painted grey shading answers yes by accident. The tell was
in its own output: those three files carry 59, 82 and 127 *distinct* grey
levels among the pixels it sampled. A baked Photoshop checkerboard is **two**
colours.

The detector was replaced with one that demands the actual signature — a large
opaque field whose top two exact colours cover ≥30% of it, both light
near-neutrals, alternating on a power-of-two grid — and it was given a
**positive control**: a synthetic 256×256 8-pixel checkerboard, which it scores
at grid agreement **1.000, period 8, verdict CHECKERBOARD**. The instrument
demonstrably moves.

Against that detector, **all 52 files are clean**, and none even reaches the
two-colour precondition: the largest top-two share in the whole set is 31.5%
(`fx_vlaude_recall_portal`, and its two colours are black, not light neutrals).
The transparent regions really are transparent — 98–100% of the pixels in every
character sprite are non-opaque.

This is the third time in this repository that a first red result has been the
harness rather than the product. Do not trust one.

### One thing the numbers show about the clean-up

The transparent padding is uniform and deliberate, which is what a batch
clean-up looks like: **10 px** on all four sides of every chip node, **8 px** on
every icon, **12 px** on every wall and gate prop, **13–16 px** on every
character. Nothing is cropped flush and nothing is drifting.

`fx_vlaude_duplication.png` is the one oddity: of its 2.1 million pixels only
**791 are fully opaque**. The whole sheet is a semi-transparent ghost/glow. That
is not a fault, but it means the blend mode matters more than usual for that
one.

### `art-source/level9/` — 22 files

| file | pixels | mode | alpha | ink bbox (l,t,r,b) | ink w×h | margins l/t/r/b | checkerboard | max safe `displayHeight` |
|---|---|---|---|---|---|---|---|---|
| `fx_crab_claw_impact.png` | 4096×512 | RGBA | real, 100.00% non-opaque | 34,9,4057,511 | 4024×503 | 34/9/38/0 | clean | 71 world px |
| `fx_electrical_arc.png` | 4096×512 | RGBA | real, 99.97% non-opaque | 28,87,4067,427 | 4040×341 | 28/87/28/84 | clean | 48 world px |
| `fx_hat_regenerate.png` | 4096×512 | RGBA | real, 100.00% non-opaque | 99,40,3990,458 | 3892×419 | 99/40/105/53 | clean | 59 world px |
| `fx_nopilot_crash.png` | 4096×512 | RGBA | real, 100.00% non-opaque | 153,44,3938,462 | 3786×419 | 153/44/157/49 | clean | 59 world px |
| `fx_perplexed_query.png` | 2240×322 | RGBA | real, 99.97% non-opaque | 19,10,2221,311 | 2203×302 | 19/10/18/10 | clean | 42 world px |
| `fx_tile_shatter.png` | 2172×724 | RGBA | real, 99.96% non-opaque | 16,191,2156,515 | 2141×325 | 16/191/15/208 | clean | 46 world px |
| `fx_wall_of_text.png` | 4096×512 | RGBA | real, 100.00% non-opaque | 184,63,3937,445 | 3754×383 | 184/63/158/66 | clean | 54 world px |
| `lvl9-enemy-bug.png` | 652×635 | RGBA | real, 99.61% non-opaque | 14,14,637,620 | 624×607 | 14/14/14/14 | clean | 85 world px |
| `lvl9-enemy-corrupt.png` | 503×565 | RGBA | real, 99.65% non-opaque | 14,14,488,550 | 475×537 | 14/14/14/14 | clean | 76 world px |
| `lvl9-enemy-packet.png` | 405×432 | RGBA | real, 99.61% non-opaque | 13,14,390,417 | 378×404 | 13/14/14/14 | clean | 57 world px |
| `lvl9-miniboss-crab.png` | 905×746 | RGBA | real, 99.46% non-opaque | 14,14,890,731 | 877×718 | 14/14/14/14 | clean | 101 world px |
| `lvl9-miniboss-hat-a.png` | 1985×1857 | RGBA | real, 49.25% non-opaque | 16,16,1968,1840 | 1953×1825 | 16/16/16/16 | clean | 257 world px |
| `lvl9-miniboss-hat-b.png` | 1944×1851 | RGBA | real, 45.14% non-opaque | 16,16,1927,1834 | 1912×1819 | 16/16/16/16 | clean | 256 world px |
| `lvl9-miniboss-nopilot.png` | 2497×1627 | RGBA | real, 36.54% non-opaque | 12,12,2484,1614 | 2473×1603 | 12/12/12/12 | clean | 225 world px |
| `lvl9-miniboss-perplexed.png` | 780×1009 | RGBA | real, 56.04% non-opaque | 14,14,765,994 | 752×981 | 14/14/14/14 | clean | 138 world px |
| `lvl9-miniboss-server.png` | 943×725 | RGBA | real, 99.73% non-opaque | 14,14,928,710 | 915×697 | 14/14/14/14 | clean | 98 world px |
| `map_level9.png` | 3840×2160 | RGB | none (RGB) | 0,0,3839,2159 | 3840×2160 | 0/0/0/0 | clean | — (plate) |
| `node_chip_cabled.png` | 1005×746 | RGBA | real, 99.78% non-opaque | 10,10,994,735 | 985×726 | 10/10/10/10 | clean | 102 world px |
| `node_chip_fan.png` | 1004×979 | RGBA | real, 99.87% non-opaque | 10,10,993,968 | 984×959 | 10/10/10/10 | clean | 135 world px |
| `node_chip_ram.png` | 998×893 | RGBA | real, 99.85% non-opaque | 10,10,987,882 | 978×873 | 10/10/10/10 | clean | 123 world px |
| `node_chip_square.png` | 932×860 | RGBA | real, 99.80% non-opaque | 10,10,921,849 | 912×840 | 10/10/10/10 | clean | 118 world px |
| `prop_vlaude_screen.png` | 894×954 | RGBA | real, 32.90% non-opaque | 14,14,879,939 | 866×926 | 14/14/14/14 | clean | 130 world px |

### `art-source/level10/` — 30 files

| file | pixels | mode | alpha | ink bbox (l,t,r,b) | ink w×h | margins l/t/r/b | checkerboard | max safe `displayHeight` |
|---|---|---|---|---|---|---|---|---|
| `cutscene_L10_01.png` | 1672×941 | RGB | none (RGB) | 0,0,1671,940 | 1672×941 | 0/0/0/0 | clean | — (plate) |
| `cutscene_L10_02.png` | 1672×941 | RGB | none (RGB) | 0,0,1671,940 | 1672×941 | 0/0/0/0 | clean | — (plate) |
| `cutscene_L10_03.png` | 1672×941 | RGB | none (RGB) | 0,0,1671,940 | 1672×941 | 0/0/0/0 | clean | — (plate) |
| `fx_vlaude_duplication.png` | 4096×512 | RGBA | real, 100.00% non-opaque | 60,76,4003,466 | 3944×391 | 60/76/92/45 | clean | 55 world px |
| `fx_vlaude_generation.png` | 4096×512 | RGBA | real, 99.99% non-opaque | 140,67,3881,465 | 3742×399 | 140/67/214/46 | clean | 56 world px |
| `fx_vlaude_path_change.png` | 4096×512 | RGBA | real, 99.98% non-opaque | 137,142,3963,463 | 3827×322 | 137/142/132/48 | clean | 45 world px |
| `fx_vlaude_recall_portal.png` | 4096×512 | RGBA | real, 100.00% non-opaque | 200,30,3994,479 | 3795×450 | 200/30/101/32 | clean | 63 world px |
| `icon_build_locked.png` | 226×238 | RGBA | real, 98.16% non-opaque | 8,8,217,229 | 210×222 | 8/8/8/8 | clean | 31 world px |
| `icon_haste.png` | 238×164 | RGBA | real, 98.03% non-opaque | 8,8,229,155 | 222×148 | 8/8/8/8 | clean | 21 world px |
| `icon_route_locked.png` | 223×238 | RGBA | real, 98.91% non-opaque | 8,8,214,229 | 207×222 | 8/8/8/8 | clean | 31 world px |
| `icon_tower_boost.png` | 237×238 | RGBA | real, 98.95% non-opaque | 8,8,228,229 | 221×222 | 8/8/8/8 | clean | 31 world px |
| `lvl10-boss-vlaude-code.png` | 929×1494 | RGBA | real, 48.36% non-opaque | 14,14,915,1479 | 902×1466 | 14/14/13/14 | clean | 206 world px |
| `lvl10-boss-vlaude-damaged.png` | 851×1489 | RGBA | real, 48.22% non-opaque | 14,14,836,1474 | 823×1461 | 14/14/14/14 | clean | 205 world px |
| `lvl10-boss-vlaude.png` | 2096×3706 | RGBA | real, 46.57% non-opaque | 15,15,2079,3689 | 2065×3675 | 15/15/16/16 | clean | 517 world px |
| `lvl10-callback-devil.png` | 464×727 | RGBA | real, 99.61% non-opaque | 14,13,449,712 | 436×700 | 14/13/14/14 | clean | 98 world px |
| `lvl10-callback-lich.png` | 797×728 | RGBA | real, 50.75% non-opaque | 14,14,782,713 | 769×700 | 14/14/14/14 | clean | 98 world px |
| `lvl10-callback-politician.png` | 512×728 | RGBA | real, 48.03% non-opaque | 14,14,497,713 | 484×700 | 14/14/14/14 | clean | 98 world px |
| `lvl10-callback-unicorn.png` | 790×728 | RGBA | real, 62.66% non-opaque | 14,14,775,713 | 762×700 | 14/14/14/14 | clean | 98 world px |
| `lvl10-mash-bull-tourist.png` | 562×728 | RGBA | real, 99.49% non-opaque | 14,14,547,713 | 534×700 | 14/14/14/14 | clean | 98 world px |
| `lvl10-mash-drone-cameraman.png` | 908×721 | RGBA | real, 99.42% non-opaque | 14,14,893,706 | 880×693 | 14/14/14/14 | clean | 97 world px |
| `lvl10-mash-rooster-phoenix.png` | 685×728 | RGBA | real, 99.57% non-opaque | 14,14,670,713 | 657×700 | 14/14/14/14 | clean | 98 world px |
| `lvl10-mash-unicorn-car.png` | 908×728 | RGBA | real, 99.90% non-opaque | 14,14,893,713 | 880×700 | 14/14/14/14 | clean | 98 world px |
| `map_level10.png` | 3840×2160 | RGB | none (RGB) | 0,0,3839,2159 | 3840×2160 | 0/0/0/0 | clean | — (plate) |
| `prop_route_gate_closed.png` | 501×257 | RGBA | real, 99.27% non-opaque | 12,12,488,244 | 477×233 | 12/12/12/12 | clean | 33 world px |
| `prop_route_gate_open.png` | 501×257 | RGBA | real, 99.29% non-opaque | 12,12,488,244 | 477×233 | 12/12/12/12 | clean | 33 world px |
| `prop_wall_cracked.png` | 504×202 | RGBA | real, 99.27% non-opaque | 12,12,491,190 | 480×179 | 12/12/12/11 | clean | 25 world px |
| `prop_wall_intact.png` | 506×202 | RGBA | real, 99.18% non-opaque | 12,12,493,189 | 482×178 | 12/12/12/12 | clean | 25 world px |
| `prop_wall_rubble_a.png` | 196×202 | RGBA | real, 99.32% non-opaque | 12,12,183,189 | 172×178 | 12/12/12/12 | clean | 25 world px |
| `prop_wall_rubble_b.png` | 196×202 | RGBA | real, 99.31% non-opaque | 12,11,183,189 | 172×179 | 12/11/12/12 | clean | 25 world px |
| `tower_vlaude_countermeasure.png` | 817×750 | RGBA | real, 99.76% non-opaque | 14,14,802,735 | 789×722 | 14/14/14/14 | clean | 102 world px |

---

## The animation sheets

All eleven sheets are 8 frames. Ten of the eleven match the expected size and
cell exactly. Two deviations:

| sheet | expected | measured | cell | frames | every frame inside its cell? | tightest margin |
|---|---|---|---|---|---|---|
| `fx_wall_of_text.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 63 px |
| `fx_crab_claw_impact.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | **no — frames [4, 5, 6] touch the cell edge** | 0 px |
| `fx_hat_regenerate.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 40 px |
| `fx_electrical_arc.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 25 px |
| `fx_nopilot_crash.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 44 px |
| `fx_tile_shatter.png` | 2172×724, 8×271 | 2172×724 | **271.5** | 8 | yes | 11 px |
| `fx_perplexed_query.png` | 2240×322, 8×280 | 2240×322 | 280 | 8 | yes | 9 px |
| `fx_vlaude_generation.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 46 px |
| `fx_vlaude_path_change.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 48 px |
| `fx_vlaude_duplication.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 33 px |
| `fx_vlaude_recall_portal.png` | 4096×512, 8×512 | 4096×512 | 512 | 8 | yes | 30 px |

### `fx_tile_shatter` — 2172 is not divisible by 8

The expected cell was 271, but 8 × 271 = 2168 and the sheet is **2172** wide.
`2172 / 8 = 271.5`. There is no integer cell that spans the sheet.

**This does not need a re-export.** Measured against the empty gutters rather
than an assumed grid, the eight frames of ink occupy columns 16–256, 287–528,
558–798, 829–1070, 1097–1341, 1371–1615, 1642–1887 and 1914–2156. A
`frameWidth` of **271** puts every one of the eight comfortably inside its own
cell — tightest margin 9 px — and leaves columns 2168–2171 dead at the right,
which Phaser's spritesheet loader ignores because `floor(2172 / 271) = 8`.

Use `frameWidth: 271, frameHeight: 724`. Verified frame by frame.

### `fx_crab_claw_impact` — three frames touch the bottom edge

The only sheet where any frame's ink reaches its cell boundary. Frames 4, 5 and
6 have ink on row 511, the last row of the sheet.

The magnitude is small and worth stating so nobody over-reacts: **5, 10 and 6
pixels** respectively, at alpha 136, 160 and 101. It is the tail of the ground
debris spray, clipped rather than faded out. It will read as a faint hard edge
along the bottom of the impact plume at those three frames, and only at those
three. Every other sheet in the set clears its cell by 25 px or more.

Cosmetic, not structural. Worth a re-export if the artist is touching the file
anyway; not worth one on its own.

---

## Step 4 — facing

Enemies are drawn facing one way and mirrored at runtime from travel direction.
`artFacing` is a real field, and a wrong value walked level 3's boss backwards
through an entire map.

Facing was read off the art itself — contact sheets rendered from the source
pixels and looked at. The renderer does no flipping, and that is not an
assumption: `lvl9-miniboss-nopilot` carries the words **NO PILOT** and they came
out reading forwards, which is the control.

**Both maps run left to right.** Level 9's trace enters at the left edge and
exits into a port on the right; level 10's enters left and exits right. So an
enemy in normal travel on either map is moving **right**.

### The table

| sprite | brief expected | measured | agrees? |
|---|---|---|---|
| `lvl9-enemy-packet` | LEFT | **RIGHT** | **no** |
| `lvl9-enemy-corrupt` | LEFT | **RIGHT** (near-frontal, weighted right) | **no** |
| `lvl9-enemy-bug` | LEFT | **RIGHT** | **no** |
| `lvl9-miniboss-server` | LEFT | **RIGHT** | **no** |
| `lvl9-miniboss-crab` | FORWARD | FORWARD | yes |
| `lvl9-miniboss-hat-a` | no facing | no facing, **but not mirror-safe** | yes, with a caveat |
| `lvl9-miniboss-hat-b` | no facing | no facing, **but not mirror-safe** | yes, with a caveat |
| `lvl9-miniboss-nopilot` | *not stated* | **RIGHT**, and **carries readable text** | gap in the brief |
| `lvl9-miniboss-perplexed` | *not stated* | FORWARD, and **is a `?` glyph** | gap in the brief |
| `lvl10-boss-vlaude` | symmetrical | symmetrical | yes |
| `lvl10-boss-vlaude-code` | symmetrical | **not symmetrical** — the hologram projects left | **no** |
| `lvl10-boss-vlaude-damaged` | symmetrical | body symmetrical, damage detail is not (non-directional) | yes, with a caveat |
| `lvl10-callback-devil` | LEFT | **RIGHT** | **no** |
| `lvl10-callback-unicorn` | RIGHT | RIGHT | yes |
| `lvl10-callback-lich` | RIGHT | RIGHT | yes |
| `lvl10-callback-politician` | LEFT | LEFT (head and torso; the stride is ambiguous) | yes |
| `lvl10-mash-drone-cameraman` | RIGHT | RIGHT | yes |
| `lvl10-mash-bull-tourist` | RIGHT | RIGHT | yes |
| `lvl10-mash-unicorn-car` | RIGHT | RIGHT | yes |
| `lvl10-mash-rooster-phoenix` | RIGHT | RIGHT | yes |
| `tower_vlaude_countermeasure` | *not stated* | barrel points RIGHT at rest (a tower, not an enemy) | gap in the brief |

Flagged, not corrected. Nothing was renamed, re-exported or mirrored.

### The six disagreements, with what was actually seen

- **`lvl9-enemy-packet`** — the screen-face with the angry cyan eyes is on the
  right of the body, it carries its glowing parcel out in front to the right,
  it strides right, and the cyan speed trail is behind it on the **left**. A
  motion trail on the left is a body moving right.
- **`lvl9-enemy-bug`** — head, red eye and cyan mandible on the right; the two
  large wings sweep back to the left; the legs point down-right.
- **`lvl9-enemy-corrupt`** — the weakest of the four calls, and it is stated as
  such. The face is close to frontal. What tips it right is that the purple
  glitch corruption trails off the **left** edge, reading as the wake behind a
  body moving right, and the stride follows.
- **`lvl9-miniboss-server`** — a quadruped whose head, cyan eyes and cyan mouth
  bar are all at the **right** end; the RAM-stick rack rises off its back at the
  left. Unambiguous.
- **`lvl10-callback-devil`** — pointed ear on the far left of the head, nose and
  goatee on the right, feet pointing right, tail sweeping back to the left.
  Unambiguous.
- **`lvl10-boss-vlaude-code`** — the monolith is symmetrical, but the large cyan
  holographic code panel it projects extends down and to the **left** and is
  roughly a third of the sprite's width. Mirroring this state flips the
  hologram to the other side. The other two Vlaude states are safe.

**The pattern is worth stating plainly: the four sprites the brief expected to
face left all face right, which means levels 9 and 10 are not the exception to
the game's convention — the whole cast faces right.** The external inspection
that produced the brief's values appears to have been mirrored.

### The mirror hazards

These are not `artFacing` values, they are reasons a mirror must never happen
at all:

- **`lvl9-miniboss-nopilot`** is a rainbow ribbon with **NO PILOT** lettered
  across it. Mirrored, it reads backwards. Whatever `artFacing` it is given, it
  must never be flipped in play.
- **`lvl9-miniboss-perplexed`** is a question mark. Mirrored, it is a backwards
  question mark. Same rule.
- **`lvl9-miniboss-hat-a` and `-hat-b`** are, as the brief says, a hat with an
  eye and have no travel facing. But their silhouettes are **not** symmetrical:
  the hat's tip flops to the left in both, and `-hat-b`'s brim is heavier on the
  right. A mirror would be visible. Pick one orientation and never flip.

---

## Step 5 — mechanics that do not exist in this codebase

Several pieces are specified against systems that are not in the game. Recorded
so nobody is surprised later. **No implementation is proposed here and none was
built.**

### `prop_route_gate_open` / `prop_route_gate_closed`

Needs branching paths that can be opened and closed at runtime.

Verified against the plates rather than assumed, and the answer is more useful
than expected:

- **Level 10's plate has exactly one entrance and one exit and no branches.** A
  single serpentine trace, left edge to right edge. Confirmed by eye at plate
  scale. The gates have nothing to gate there.
- **Level 9's plate does have a fork.** The trace enters at the left edge and
  splits into an upper and a lower branch, which run around the board and
  rejoin; there is at least one further loop on the right half. This is
  observed at plate scale and is **not** traced geometry — deriving the actual
  route graph is a separate job of the kind `tools/trace_level6.py` does.

So the geometry these props presuppose is painted on **level 9**, not level 10.
That is a fact about the art, not a recommendation about where they belong.

Either way, the engine has no concept of a route that can be opened or closed.
`Levels` builds routes at load and nothing changes them.

### `prop_wall_intact` / `_cracked` / `_rubble_a` / `_rubble_b`

Needs a destructible object with health that obstructs pathing. Nothing in the
game blocks a path or takes damage this way. Enemies take damage; towers do
not; the map is static. Four sprites describe a three-stage damage progression
plus two rubble variants, so the mechanic they imply is fairly specific: a wall
with at least two health thresholds and a randomised debris state.

### `icon_route_locked`, `icon_build_locked`, `icon_tower_boost`

- **`icon_route_locked`** needs route locking. Does not exist — see the gates.
- **`icon_build_locked`** needs a build pad that can be disabled. Pads exist and
  are occupied or empty; none can be *forbidden*.
- **`icon_tower_boost`** needs a buff targeted at a tower. Buffs in this game
  target enemies or the player.
- **`icon_haste`** is the only one of the four with an existing analogue.

### `tower_vlaude_countermeasure`

Implies the boss places towers against the player. Nothing in the game does
this: towers are placed by the player on pads, and enemies do not build. This
is the largest of the six gaps — it is a whole enemy behaviour, not a flag.

### `prop_vlaude_screen`

A decorative object at a world position. The game has no prop layer. Everything
drawn in the world is plate art, a tower, an enemy or an effect; scenery is
painted into the plate. A prop would need a new draw category that participates
in the Y-sort (CLAUDE.md rule 3) without being any of those four.

---

## Step 6 — the cutscene panels

**The expected mismatch is not there.** The brief said `cutscene_L10_01/02/03`
are 3840×2160 and that every shipped panel is 1672×941.

Measured: **all three are 1672×941.** They already match
`public/assets/cutscenes/` exactly, and they match the size `cutscenes.json`
documents in its `_panels` note. There is no dimension mismatch to record.

Two real differences remain:

1. **Format.** The three new panels are **PNG**. Every shipped panel is
   **WebP**. That is the conversion step, and it was not done here.
2. **When they play.** The panels are the ending. Read in order they run:
   *"Without me… who will finish the game?" / "We will." / "Do you know how?" /
   "Not even a little." / "But I can ask Vlaude." / "Ohhhh yeah." / "That's
   right."* — the family standing over a defeated Vlaude. This plays **after**
   level 10.

`cutscenes.json` is pre-level only: its `levels` map is keyed by the level id a
comic plays *before*, and `cutsceneProblems()` plus `tests/cutscenes.test.ts`
hold it to that. There is no key that means "after". **No entry was added**, and
adding one would be wrong — this is a design change to the cutscene mechanism,
not a data change.

Each panel is itself a multi-frame comic page (three sub-panels across),
consistent with the shipped L1 and L2 pages.

### While we are on plate sizes

The two new map plates are 3840×2160. That is not a mismatch either — it is
current practice:

| plate | size |
|---|---|
| `l5_board.png` | 1920×1080 |
| `map_level6.png` | 1672×941 |
| `map_level7.png` | 1672×941 |
| `Courjahan_Defense_Level8_4K.png` | 3840×2160 |
| **`map_level9.png`** | **3840×2160** |
| **`map_level10.png`** | **3840×2160** |

Level 8 already moved to 4K, and 9 and 10 follow it. This is the direction
`RENDER-QUALITY.md` and CLAUDE.md rule 7 point in: rule 7 names the 1672 px
plate as the thing that is *too small* for a 1280-world-px surface. Levels 9 and
10 do not have that problem.

---

## Verification

| check | result |
|---|---|
| `node --test 'tests/*.test.ts'` | **1035 pass, 0 fail** |
| `sh tools/tsdiff.sh 2cc0129` | baseline 212 errors, working tree 212, **0 introduced** |
| `sh tools/tsdiff.sh c277c3a` | 212 / 212, **0 introduced** |
| stray PNGs at repository root | **none** |
| `git status` after the move | 52 renames, nothing else |

`2cc0129` was CI run 287, green, and is the tree this branch started from.

### What was NOT checked

- **The harness was not run.** `tools/harness/` renders frames, and no frame
  changed: this branch touches no `.ts`, no `.json`, and nothing under
  `public/`. It is 52 renames inside a directory the build does not read. There
  is no UI change to verify against a rendered frame.
- **No sprite has been drawn by the game.** Nothing points at any of these
  files. The `max safe displayHeight` column is arithmetic against rule 7, not
  an observation of a rendered sprite.
- **Level 9's route graph was not traced.** The fork was seen at plate scale.
  Deriving the actual geometry is the job `tools/trace_level6.py` and
  `tools/trace_level8.py` do for their levels, and it has not been done for 9
  or 10.
- **The map plates were not measured for road width, pad positions or exits.**
  That is the map pass, not this one.
- **Colour profiles were not assessed.** None of the files carries one, so there
  is nothing to compare; whether the paintings agree with the shipped palette is
  a question this audit cannot answer from headers.

---

## Where this leaves the repository

**In flight**

- Branch `claude/level-9-10-art-audit-izulqc`, 52 renames and this report,
  fast-forwardable onto `main`.

**Blocked, waiting on the artist**

- **`titlecard_level10.png` was never uploaded.** Level 10 cannot have a title
  card until it arrives.
- `fx_crab_claw_impact` clips a few debris pixels on frames 4–6. Worth folding
  into a re-export if the file is touched anyway; not worth one alone.

**Waiting on a decision**

- **The facing values.** Six sprites contradict the brief and the pattern says
  the external inspection was mirrored. Somebody should confirm that reading
  before an `artFacing` column is written, because this is the field that walked
  level 3's boss backwards.
- **`prop_vlaude_screen.png` is in `level9/`** on a judgement call. One `git mv`
  either way.
- **The ending cutscene needs a mechanism.** `cutscenes.json` is pre-level only
  and the three L10 panels play after level 10. Design change, not a data row.
- **Six mechanics do not exist**: openable routes, destructible walls, route
  locking, pad disabling, tower-targeted buffs, enemy-placed towers, and a prop
  layer. The art for all of them is now in the repository. Whoever scopes levels
  9 and 10 decides which of those get built, which get cut, and which get
  repurposed — and CLAUDE.md rule 5 says the current phase is Phase 1, so the
  honest default for all of them is "not yet".

**Carried forward from `reports/2026-09-10-the-null-frame.md`**

- `tsdiff` still cannot see a Phaser member access rule, and CI is still the
  first thing that can. Not exercised here — this branch has no TypeScript.

---

## Merging

```
git checkout main && git merge --ff-only claude/level-9-10-art-audit-izulqc && git push origin main
```
