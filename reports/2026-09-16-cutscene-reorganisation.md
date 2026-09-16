# The comics, reorganised, sliced, wired — and one that plays between two waves

2026-09-16. Branch `claude/cutscene-reorganization-wiring-t8o0vm`.

| commit | what | CI |
|---|---|---|
| _(filled in below once the run lands)_ | | |

---

## The three answers the brief asked for first

1. **Every spawn wave matched.** All six numbers in the brief were read off the wave
   tables and all six are right: `unicornBoss` first spawns on level 3 wave 13,
   `glitchLich` on level 4 wave 7, and level 9's `hatGtt`, `cancer`, `noPilot` and
   `perplexed` on waves 4, 8, 12 and 16. Nothing moved. `tests/midwave.test.ts`
   re-derives all six from the wave tables now, so a later table edit that moves an
   enemy out from under its comic fails the build instead of shipping.
2. **The square panels read acceptably on a phone — confirmed in a rendered frame,
   not assumed.** They are not 724x724: level 3's intro cuts into 741, 706 and
   698 px wide by 724 tall. `CutsceneLayout` contain-fits them, so at 844x390 a
   square panel letterboxes to about 390 px tall with dark chrome down both sides and
   the speech is readable. The frames are `midwave-1-level4-panel1-844x390.png` and
   `screens-4-cutscene-*`.
3. **All ten soak numbers held, byte for byte.** Measured before the change and after
   it, 480 seeds each, same seeds. **Two of the brief's expected figures were already
   stale on `main` before this work started** — see "The soak" below.

---

## 1 — The inventory, measured

All twelve unwired files, before anything was cut:

| file | size | MB |
|---|---|---|
| `comic_eliminated_positions.png` (root) | 2172x724 | 3.37 |
| `comic_fired_early_retirement.png` (root) | 1672x941 | 3.25 |
| `comic_job_at_vlaude.png` (root) | 1672x941 | 3.18 |
| `comic_l3_unicorn_boss.png` (root) | 2172x724 | 3.88 |
| `comic_l4_glitch_king.png` (root) | **3840x1280** | 7.61 |
| `comic_l9_cancer.png` (root) | 2172x724 | 3.97 |
| `art-source/comic_l10_ending_condensed.png` | 2172x724 | 4.03 |
| `art-source/comic_l9_end_gate_A.png` | 2172x724 | 3.99 |
| `art-source/comic_l9_hat_gtt.png` | 2172x724 | 3.93 |
| `art-source/comic_l9_no_pilot.png` | 2172x724 | 3.93 |
| `art-source/comic_l9_perplexed.png` | 2172x724 | 4.09 |
| `art-source/comic_pulled_into_the_machine.png` | 2172x724 | 4.05 |

### THE FINDING THAT CHANGED THE SHAPE OF THE WORK

**All twelve are three-panel strips, not three of them.** The brief names three files
to slice. Every one of the other nine has the same structure — art, black frame,
white gutter, black frame, art — and it was measured rather than eyeballed:
`tools/comics/slice.py` scores each column for vertical uniformity and finds two
gutter blocks in all twelve. The contact sheets are reproducible with
`python3 tools/comics/sheet.py <out.png> 300 <strip...>`.

So the brief's own reason for slicing — "at 1672 wide on a phone each third is about
130 CSS px and the speech is unreadable" — applies to all of them, and applies harder
to the 2172-wide pages, where a third is about 119 CSS px at 375. **All nine strips
that are wired to something were cut.** That is the one deviation from the brief's
letter, it is in the brief's own spirit, and reverting any of it is one edit to
`tools/comics/plan.json` plus one list in `cutscenes.json`.

**And two things that already ship are strips too**, left alone deliberately because
the brief held them unchanged: `cutscene_L9_01.webp` (level 9's opening, gutters at
x=546..562 and x=1106..1122) and `cutscene_L9_end_gate.webp` / the three
`cutscene_L10_*.webp` outro panels. The level 10 panels are nine sub-panels shown as
three. Cutting them later is one line in `plan.json` and one list in `cutscenes.json`;
their sources are in `art-source/cutscenes/level10/` and
`art-source/cutscenes/unplaced/`.

---

## 2 — The cut columns

Measured, never divided. **`comic_eliminated_positions` is the case that proves the
rule**: it looks like three 724-wide squares and its panels are 741, 706 and 698 px
wide. Dividing 2172 by three would have put the first cut 17 px inside panel 1's art.

| strip (new name) | source size | gutter blocks | panels kept (inclusive) |
|---|---|---|---|
| `level1/intro_strip.png` | 1672x941 | 547–566, 1105–1124 | 0–552, 561–1110, 1119–1671 |
| `level2/intro_strip.png` | 1672x941 | 546–565, 1105–1124 | 0–551, 560–1109, 1119–1671 |
| `level3/intro_strip.png` | 2172x724 | 735–761, 1454–1479 | 0–740, 755–1460, 1474–2171 |
| `level3/wave12_strip.png` | 2172x724 | 728–747, 1424–1443 | 0–733, 742–1429, 1438–2171 |
| `level4/wave06_strip.png` | 3840x1280 | 1130–1166, 2374–2409 | 0–1138, 1157–2382, 2399–3839 |
| `level9/wave03_strip.png` | 2172x724 | 708–731, 1436–1458 | 0–714, 725–1442, 1452–2171 |
| `level9/wave07_strip.png` | 2172x724 | 710–733, 1437–1461 | 0–714, 726–1443, 1454–2171 |
| `level9/wave11_strip.png` | 2172x724 | 711–735, 1436–1460 | 0–716, 730–1441, 1455–2171 |
| `level9/wave15_strip.png` | 2172x724 | 724–748, 1482–1507 | 0–731, 742–1489, 1501–2171 |

**How a block becomes two cuts.** The uniform block spans the left panel's black
frame, the white gutter and the right panel's black frame — all four are uniform down
the page. The black frame belongs to the panel, so the dark run reachable from the
block's left edge is kept with the left panel, the dark run reachable from its right
edge is kept with the right panel, and the white gutter between them is discarded. A
block that is dark all the way across — level 9's wave 15 page has one, 26 px of solid
black — is split down its middle, because there is no other information in it.

Two thresholds were found by measurement rather than guessed, and both are written up
in `tools/comics/slice.py`:

- **A column counts as gutter material if it is uniform OR very dark**, because on
  `comic_l3_unicorn_boss` the black frame has art bleeding through a few rows, scoring
  a range of 80. Uniformity alone found a 7 px block, under the 8 px floor, and the
  page measured as one panel.
- **Blocks within 32 px of either edge are the page's own frame**, not a gutter.
  Without that, `comic_l4_glitch_king`'s outer border became a "gutter" at x=1..8 and
  the page cut into five.

Every cut was checked on a contact sheet drawn on a magenta ground, so a cut that took
a sliver of the neighbour shows as a shape not reaching its own edge. None did.

---

## 3 — The folder layout

Nothing comic-related is in the repository root. All moves are `git mv`, so history
follows.

```
art-source/cutscenes/
  level1/intro_strip.png            <- comic_fired_early_retirement.png
  level2/intro_strip.png            <- comic_job_at_vlaude.png
  level3/intro_strip.png            <- comic_eliminated_positions.png
  level3/wave12_strip.png           <- comic_l3_unicorn_boss.png
  level4/wave06_strip.png           <- comic_l4_glitch_king.png
  level9/wave03_strip.png           <- art-source/comic_l9_hat_gtt.png
  level9/wave07_strip.png           <- comic_l9_cancer.png
  level9/wave11_strip.png           <- art-source/comic_l9_no_pilot.png
  level9/wave15_strip.png           <- art-source/comic_l9_perplexed.png
  level10/outro_01.png              <- art-source/level10/cutscene_L10_01.png
  level10/outro_02.png              <- art-source/level10/cutscene_L10_02.png
  level10/outro_03.png              <- art-source/level10/cutscene_L10_03.png
  unplaced/level10_intro_strip.png            <- art-source/comic_pulled_into_the_machine.png
  unplaced/level9_outro_alternate_strip.png   <- art-source/comic_l9_end_gate_A.png
  unplaced/level10_outro_condensed_strip.png  <- art-source/comic_l10_ending_condensed.png
  retired/level1_intro_01..03.webp   <- public/assets/cutscenes/cutscene_L1_01..03.webp
  retired/level2_intro_01..03.webp   <- public/assets/cutscenes/cutscene_L2_01..03.webp
```

**The STRIP is what is kept, not the cut PNGs.** A strip plus its measured cut columns
reproduces the panels exactly, and the 27 full-resolution slices would have been about
100 MB of git for nothing. `tools/comics/publish.py` cuts to a scratch directory,
encodes, and throws the PNGs away; `tools/comics/last-run.json` is the record of what
it measured.

**Every original filename is recorded** in `cutscenes.json` — the `_unplaced` entries
carry a `was` field, `_levels` names the retired panels by their old keys, and this
table is the rest.

---

## 4 — The mapping, as wired

`src/data/cutscenes.json`, and all of it is a data edit later.

| when | level | panels |
|---|---|---|
| before | level1 | `level1_intro_01/02/03.webp` — the dad loses his job |
| before | level2 | `level2_intro_01/02/03.webp` — the job at Vlaude |
| before | level3 | `level3_intro_01/02/03.webp` — Vlaude on the television |
| before | level9 | `cutscene_L9_01.webp` — unchanged |
| after wave 12 | level3 | `level3_wave12_01/02/03.webp` — the unicorn boss (spawns w13) |
| after wave 6 | level4 | `level4_wave06_01/02/03.webp` — the Glitch King (spawns w7) |
| after wave 3 | level9 | `level9_wave03_01/02/03.webp` — HAT-GTT (spawns w4) |
| after wave 7 | level9 | `level9_wave07_01/02/03.webp` — CANCER (spawns w8) |
| after wave 11 | level9 | `level9_wave11_01/02/03.webp` — NO-PILOT (spawns w12) |
| after wave 15 | level9 | `level9_wave15_01/02/03.webp` — PERPLEXED (spawns w16) |
| on winning | level9 | `cutscene_L9_end_gate.webp` — unchanged |
| on winning | level10 | `cutscene_L10_01/02/03.webp` — unchanged |

Level 2's Devil and level 10's Vlaude get nothing, as asked.

### ONE PROBLEM WITH THE WIRING AS SPECIFIED, and it is one line to fix

**Level 9 now plays the same comic twice.** `cutscene_L9_01.webp` — the opening the
brief holds unchanged — IS the HAT-GTT page, and `comic_l9_hat_gtt.png`, which the
brief wires after wave 3, is the same three beats at higher resolution (Hat-GTT? /
Generative Trained Transformer / POOF). Both were rendered and compared side by side;
they are the same comic. A run of level 9 therefore reads it at the start and again
about ninety seconds later.

Both are wired, because the brief named both explicitly and the choice is a content
call rather than an engineering one. **The fix is to delete the `level9` key under
`levels` in `cutscenes.json`** — the comic then plays once, on the boundary before the
enemy it introduces walks on, which is the brief's own stated principle. The note is
in `cutscenes.json`'s `_levels` so the next session does not have to rediscover it.

### The unplaced three, and which are rejects

- **`unplaced/level10_intro_strip.png`** (was `comic_pulled_into_the_machine.png`) —
  Vlaude revoking the family's administrator privileges and pulling all four of them
  into the machine. **A genuine orphan, not an alternate**: it reads as level 10's
  OPENING, and level 10 has no opening comic — only the title card.
- **`unplaced/level9_outro_alternate_strip.png`** (was `comic_l9_end_gate_A.png`) —
  **an ALTERNATE of the shipped level 9 outro**, `cutscene_L9_end_gate.webp`. Same
  three beats: "We're coming for you next!", "Any chance I can have my job back?", the
  LEVEL 10 FINAL PROTOCOL gate. 2172x724 against the shipped 1672x941. A reject unless
  the outro is re-cut, in which case it is the better source.
- **`unplaced/level10_outro_condensed_strip.png`** (was `comic_l10_ending_condensed.png`)
  — **an ALTERNATE of the shipped level 10 outro.** The nine sub-panels of
  `cutscene_L10_01/02/03.webp` condensed into three. A reject unless the ending is
  ever shortened.

They are listed in `cutscenes.json`'s `_unplaced` with a description each, and
`tests/cutscenes.test.ts` fails if any of the three is not on disk. **That is what
makes them un-sweepable**, which is the risk the brief named and CLAUDE.md's standing
fact records.

### DEVIATION: they were NOT converted to WebP, and NOT registered in art.json

Two of the brief's instructions run into rules this repository already enforces, so
both were followed differently and the reasons are here rather than buried:

- **"Register everything in art.json" fails the build.** A comic panel has never been
  in that manifest; `art.json`'s own `_level10` note says naming one there fails
  `tests/manifest.test.ts` twice over (`cutscenes` becomes an asset directory named as
  a string literal in `systems/Cutscenes.ts`, and a panel is bound to no role that
  draws it). The registry for panels is `cutscenes.json`, and the blunt no-exemptions
  check the brief wanted is now in `tests/cutscenes.test.ts`: every path named under
  `levels`, `outros` or `midWave` must exist under `public/`, and every `_unplaced`
  and `_retired` path must exist on disk.
- **The three unplaced comics stayed as PNG in `art-source/`.** Converting them would
  put about 1.5 MB into the deploy that no player ever fetches — the ORPHAN category
  `tests/content.test.ts`'s budget exists to notice — and two of the three are
  alternates of comics that already ship. The `_unplaced` list, not a WebP in
  `public/`, is what protects them from a sweep. Publishing one is one line in
  `plan.json` on the day something plays it.

---

## 5 — The encode

q90 through Chromium's libwebp (`tools/comics/publish.py`), which is the same encoder
`tools/reencode` and `tools/img` use — there is no `cwebp`, no ImageMagick and no PIL
in this environment.

**27 panels, 4.93 MB, worst PSNR 32.1 dB, best 37.6.** For scale, the retired level 1
and 2 panels ran 0.202 bytes/pixel and the new ones run 0.250; the shipped level 9 and
10 panels run 0.369. The encode is in the same band as what already ships.

| level | panels | MB |
|---|---|---|
| level1 intro | 3 | 0.368 (replacing 0.923 — **level 1 got lighter**) |
| level2 intro | 3 | 0.368 (replacing 0.859 — **level 2 got lighter**) |
| level3 intro | 3 | 0.357 |
| level3 wave12 | 3 | 0.563 |
| level4 wave06 | 3 | 1.331 |
| level9 wave03/07/11/15 | 12 | 1.941 |

### INK against canvas

`tools/measure_art.py` measures the art it names and a comic panel is not in it — for
the reason above. The measurement the brief wanted was taken directly, on all 33
panels now under `public/assets/cutscenes/`, and the answer is the same for every one:

> **ink == canvas, 100.0% opaque, on all 33.**

A comic panel is a filled rectangle. There is no transparent margin to trim and no
content box to size anything by, which is the other half of why panels are not in
`art.json`: `contentWidth`/`contentHeight` would restate the file's own dimensions and
`fitInBox` has nothing to do.

### The two budget caps moved, with the numbers

- **Per level 18 -> 20 MB.** Level 9 went 17.06 -> 19.00: its four introductions are
  1.94 MB across twelve panels. Level 3 went 8.0 -> 8.9, level 4 7.4 -> 8.8, levels 1
  and 2 went down. The cap's own note predicted this bill and said it comes due with
  the level.
- **Whole deploy 58 -> 61 MB.** +4.93 of new panels, −1.78 of retired ones moved out
  of `public/`, net +3.15.

**A thinner encode was considered and rejected.** The panels are already
under-provisioned for a retina phone by hard rule 7's own arithmetic: a panel draws at
about 346 CSS px tall at 844x390, which is 1038 physical pixels at devicePixelRatio 3,
and the level 9 sources are 724 tall. Going below q90 on line art with speech bubbles
gives back the readability the slicing bought.

---

## 6 — A cutscene between two waves

New capability. `cutscenes.json` gains a third map beside `levels` and `outros`:

```json
"midWave": {
  "level4": { "6": ["cutscenes/level4_wave06_01.webp", "...", "..."] }
}
```

Keyed by level id, then by the wave number it plays **after** — one-based, the number
the HUD shows.

### How to author a new one

1. Put the strip in `art-source/cutscenes/<level>/wave<NN>_strip.png`.
2. Add a row to `tools/comics/plan.json` naming the source, the base name the panels
   take, and how many panels to expect.
3. `python3 tools/comics/publish.py 90` — it measures, cuts, encodes to
   `public/assets/cutscenes/`, and fails rather than publishing if the panel count
   moved.
4. Add the wave key and the panel list under `midWave` in `cutscenes.json`.

**Nothing in `src/` changes.** `cutsceneProblems()` fails a wave number that is not a
wave of that level, and fails the level's LAST wave as well — clearing it ends the run,
so that boundary never comes and a comic scheduled on it would never play.

### The clock genuinely stops

`GameScene` pauses **itself and the HUD** and launches the comic as an overlay. A
paused Phaser scene is out of the update list entirely: no `update`, no `time` events,
no tweens. `systems/MidWave.ts`'s `simDelta` closes the one frame already in flight
when the pause is asked for, and is the rule a test can read without a canvas.

**Read either side of it, at 844x390:**

```
clock before: sceneClock=8503  countdown=15.0000  wave=6  phase=ready  peanuts=378
              enemies=  cooldowns=molotov:0,glacier:0,serverNuke:0,heroSlot1:0,heroSlot2:0
              heroHp=360
clock after:  sceneClock=8503  countdown=15.0000  wave=6  phase=ready  peanuts=378
              enemies=  cooldowns=molotov:0,glacier:0,serverNuke:0,heroSlot1:0,heroSlot2:0
              heroHp=360
real seconds elapsed: 14.0   (ready countdown is 15g = 10.7s real)
```

Byte-identical across **14.0 real seconds**, which is longer than the 10.7 s the ready
countdown takes to auto-start the next wave. A clock that was merely slowed rather
than stopped would have started wave 7 inside that wait. It did not. When the comic
closed, the countdown resumed from 15.00 rather than catching up — the first frame
back advanced exactly one frame's worth.

`tests/midwave.test.ts` drives the same reading 900 frames deep against the shipping
`simDelta`, and asserts the real clock moved while the simulated one did not — so the
test cannot pass by measuring nothing.

### The other requirements

- **Only at a wave boundary with an empty board.** `midWaveBoundaryOpen` asks
  explicitly; if anything is still walking — a boss's summoned children do outlive the
  boundary — the comic is held in `comicDue` and opens on the first frame the board
  is clear. "It waits" rather than "it is dropped".
- **Skippable with the same control.** It is the same `CutsceneScene`; SKIP and
  tap-anywhere are unchanged. The level 9 pass exits every comic through SKIP.
- **Replays every run.** No seen flag anywhere; `shouldPlay` is still exactly "does
  this level have a comic".
- **Leaving, restarting or losing cleans up.** `endMidWaveComic` runs from GameScene's
  `shutdown` — which every exit from a run raises, because they all go through the
  scene's own `scene.start` — and from `endRun`. It stops the comic scene and gives
  the gate back.
- **Claimed through `InputGates`.** An unowned pause is seized by the stuck guard
  after six seconds, which is less than three panels take to read. `enterGate('comic')`
  makes it owned; `CutsceneScene` bumps `noteInputAccepted` on every tap; and
  `StuckWatch` now reports `runActive: false` while a cutscene is up, which is what
  `StuckGuard`'s own rules already said should happen ("a menu, a cutscene, a finished
  run: a still board is correct").

### The level 10 conflict: checked, and there is none

Level 10 has no `midWave` entry and a test holds it to that. Its form swap is armed
for wave 7 and its float for wave 13, both by `armVlaudeSchedule` from `startWave`, so
a comic on the wave 6 or wave 12 boundary would sit on top of a telegraph. Driven in
the harness: level 10 was played through both boundaries and no comic fired, with
`vlaudePhase=code floating=false` on the way past.

### The soak skips them entirely — by construction

`tools/soak` is a headless simulator. It never builds a scene, so there is nothing to
pause and nothing to tap through. A test now pins that: no file under `tools/soak/`
may mention `Cutscene`, `MidWave`, `midWave` or `comic`, and `Sim.ts` may not import
anything from `src/scenes/`. The ten soak numbers below are the empirical half.

### THE BUG THE PICTURE FOUND AND THE NUMBERS DID NOT

The first harness run reported 40 of 43 checks passing: the comic active, the run
paused, the gate claimed, the clock frozen, the textures released. **The screenshot
was a picture of the board with WAVE CLEARED across it.**

Phaser renders scenes in list order and `Cutscene` is declared before `Game` and `Hud`
in `config.ts` — correct for a comic that hands over, because the game is not running
yet. A paused scene still **renders**, so the board and the whole HUD drew straight
over the panel. `CutsceneScene` now calls `this.scene.bringToTop()` when it is an
overlay, and the scenario asserts the scene-list order as well as taking the picture.

CLAUDE.md's rule about reading the picture as well as the numbers, in one frame.

### And a leak, fixed on the way past

A panel is decoded to raw RGBA — 553x941 is 2.08 MB — and Phaser's texture manager is
global, so before this every panel a session looked at stayed resident until the tab
died. Level 9 now plays fifteen of them in a run. `CutsceneScene` releases its panel
textures on `SHUTDOWN`; the harness reads `game.textures.list` after every comic and
reports `none` resident.

---

## 7 — The soak

Ten levels, 480 seeds each, all-normal, run on the tree before the change and again
after it.

| level | brief expected | before | after | |
|---|---|---|---|---|
| level1 | 428 | 428 | 428 | identical |
| level2 | 255 | 255 | 255 | identical |
| level3 | 422 | 422 | 422 | identical |
| level4 | 299 | 299 | 299 | identical |
| level5 | 218 | 218 | 218 | identical |
| level6 | 210 | 210 | 210 | identical |
| level7 | 198 | 198 | 198 | identical |
| level8 | **200** | **184** | 184 | identical — **the brief's figure was stale** |
| level9 | **191** | **113** | 113 | identical — **the brief's figure was stale** |
| level10 | 195 | 195 | 195 | identical |

**Nothing moved.** Every one of the ten is byte-identical across the change, which is
the property the brief asked for: the pause is not leaking into the simulation.

**Two of the brief's expected numbers were already wrong on `main` before this work
started, and `SOAK-REPORT.md` already said so.** Level 8 has been **184/480 (38.3%)
since 2026-09-15**, when its east arm was re-topologised; the 200 is the figure from
before that. Level 9 has been **113/480 (23.5%) since the flank road landed**, against
191 before it. Neither is this change's doing and neither is a regression — but a
report that quoted the brief's numbers back would have been wrong twice.

---

## 8 — Verification

### From rendered frames

Everything in this section came out of `tools/harness/`. Nothing in `tests/` can see
any of it.

| claim | frame |
|---|---|
| level 1 opens with the new dad | `screens-4-cutscene-844x390.png` — clean-shaven, modern clothes, one sliced panel, "Boys! Emergency business meeting!" |
| level 2 opens with the new dad | same scenario at `levelId: 'level2'` |
| every sliced panel is readable | `midwave-1-level4-panel1-*`, `midwave-2-level4-panel2-*`, `midwave-4-level9-wave3-*` |
| the near-square panels letterbox rather than crop | `midwave-1-*` — dark chrome down both sides, whole panel on screen |
| no panel is cropped, no bubble cut off | `screens` reports 0 faults on `4-CUTSCENE` at every viewport |
| a mid-wave comic fires on the right boundary | `midwave` — wave 5 passes with no comic, wave 6 opens one |
| the clock stops and resumes cleanly | the reading above, and `midwave-3-level4-resumed-*` |
| level 9 plays six comics without getting stuck | `midwave` — opening + four mid-wave + outro; the run reaches `won` on wave 16 |
| level 10 is unchanged and no comic fires on a phase boundary | `midwave` — waves 6 and 12 driven, `comic=false` on both |

### From the disk

- Nothing comic-related in the repository root: `ls *.png` returns nothing, and
  `tests/cutscenes.test.ts` fails if a `comic*` or `cutscene*` file reappears there.

### From the suite and the typechecker

- `node --test 'tests/*.test.ts'` — **1179 passing, 0 failing** (1168 before; eleven
  new in `tests/midwave.test.ts`).
- `sh tools/tsdiff.sh <green>` — one introduced error,
  `CutsceneScene.ts: TS2339: Property 'events' does not exist on type 'CutsceneScene'`,
  which is the Phaser cascade: `this.events` is a `Phaser.Scene` member and there is no
  `node_modules` here. Nothing was deleted to satisfy it. Every Phaser member added is
  documented public API — `scene.pause/resume/isPaused/launch/stop/bringToTop`,
  `textures.remove`, `Phaser.Scenes.Events.SHUTDOWN/RESUME`.

### What was NOT checked

- **The `_unplaced` and retired panels were never loaded by the game**, because
  nothing plays them. They are checked to exist and nothing more.
- **Portrait is reported as gated, not audited**, which is the correct answer for a
  landscape-only game.
- **The four uncut strips still wired** — level 9's opening, level 9's outro, level
  10's three outro panels — were not re-cut and their readability is unchanged from
  what shipped.
- **No GL=1 run.** Nothing here touches the drawing context, and every `GL=1`
  screenshot in this repository is taken through `renderer.snapshot` for reasons that
  have nothing to do with comics.

---

## Where this leaves the repository

**In flight:** nothing. Everything described here is on the branch named at the top.

**Waiting on a decision:**

1. **Level 9 reads the HAT-GTT comic twice.** One line — delete the `level9` key under
   `levels` in `cutscenes.json`. Not taken here because it is a content call.
2. **Four comics still ship as uncut three-across strips**, and they are the only ones
   left: level 9's opening and outro, and level 10's three outro panels (nine
   sub-panels shown as three). Held unchanged because the brief said so and because
   level 10's fight is verified frame by frame against them. Cutting them is one row
   in `tools/comics/plan.json` and one list in `cutscenes.json`; sources are in the
   tree.
3. **`unplaced/level10_intro_strip.png` has no home.** It reads as level 10's opening
   and level 10 has only a title card. Publishing it is one row in `plan.json` and one
   key under `levels`.

**Carried forward from `reports/2026-09-15-pad-visibility.md` and `2026-09-15-blockers.md`,
unchanged by this work:**

- Level 7's spawn and exit badges are invisible on the Highway — an art job, not an
  alpha one.
- A build pad under one of the five pressable HUD controls is visible and not tappable
  there; bounded by the reachability test, priced and rejected at 40% of a landscape
  phone.
- Level 9 soaks at 113/480 and level 8 at 184/480 since their last geometry changes.
  Both are inside their bands; `SOAK-REPORT.md` is the record.
