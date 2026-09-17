# The comics were in the wrong levels

The 2026-09-16 reorganisation (`160705d`) cut, published and wired every comic
in the repository, and it decided **where each one played by looking at the
picture**. Four of those decisions were wrong. This is the pass that put them in
the slots Cory named, wired the new level 1 and level 2 art, deleted the
storyline the old pass invented to justify itself, and wrote the rule that stops
it happening again.

| commit | what | CI |
|---|---|---|
| `13eeeac` | the moves, the publish, `cutscenes.json`, the tests, the harness, CLAUDE.md rule 8 | folded into run 445 |
| `ee0c5f2` | merge of `ccf7f78` — the hand-authored build plots and the run 442 table | **run 445 — all five jobs green, deploy RAN** |
| `cdcc6b6` | this report | **run 447 — `changes`, `typecheck`, `test` green, `deploy` SKIPPED** |
| `446b2ae` | the run 447 row above | folded into run 451 |
| `f2cea40` | merge of `ff787e6` — another session's wave-control HUD merge | **run 451 — three jobs green, `deploy` SKIPPED** |

**Run 445 on `ee0c5f2`:** `changes`, `typecheck`, `test`, `deploy / build` and
`deploy / deploy` all **success**. The `github-pages` deployment record for
`ee0c5f2` reports `success` at 11:08:37Z against
`https://cperry0360-create.github.io/JebusGames-Project-1/`. The deploy ran
rather than skipping, correctly — this push touches `public/` and `src/data/`,
not only markdown.

**Run 447 on `cdcc6b6`** ran three jobs and no `deploy`, which is the gate
working rather than a failed publish: the report is markdown, so `changes`
reported `code=false` and Pages kept serving what run 445 put there. Read the
job list, not the run's conclusion. (This sentence arrived in a later docs-only
commit, whose own run is one more of the same.)

**`main` MOVED UNDER THIS PASS, TWICE, and the deployed SHA is not one of mine.**
Another session landed a wave-control HUD merge on `main` while this report was
being written, and its own merge (`ff787e6`) took `cdcc6b6` with it. So:

- **The live site is `ff787e6`**, deployed at 11:13:27Z, and `13eeeac` and
  `cdcc6b6` are both ancestors of it — checked with `git merge-base
  --is-ancestor`, not assumed. Every comic in this pass is on the deployed site.
- Run 451 on `f2cea40` skipped `deploy` **correctly**: the only thing that
  commit adds over `ff787e6` is markdown, so `changes` reported `code=false` and
  Pages kept serving what it had. A green run with `deploy` skipped is the gate
  working. Read the job list, not the run's conclusion.
- The suite was re-run after that merge: **1201 pass, 0 fail** (the four extra
  tests are the other session's `wavecount.test.ts`), and the comic map was
  re-read out of the merged tree rather than trusted.

**NOT CHECKED: the live site itself.** The egress proxy in this container
answers `CONNECT tunnel failed, response 403` for `github.io`, so no panel was
fetched from the deployed URL. The evidence that it published is GitHub's own
deployment status, not a byte off the site.

## What was wrong

Every one of these was a confident, well-argued reading of the art, and every
layout check passed on all four.

| art | 09-16 said | it actually is |
|---|---|---|
| "I'm retiring" | level 1 opening | **level 8 opening, first half** |
| "transition opportunity" | level 3 opening | **level 8 opening, second half** |
| "Junior Vibe Coder / GameEx" | level 2 opening | **the EPILOGUE**, after level 10 |
| "Shut yourself down" | `unplaced/level10_intro` | **level 8's OUTRO** |

**The invented storyline is the part that mattered more than the wiring.**
`cutscenes.json`'s `_levels` note was rewritten on 09-16 into a plot — the dad
loses his job, is hired at Vlaude Industries, watches Vlaude eliminate
everybody's positions — to explain the placements. That note auto-loads into
every session as established fact. A wrong panel is one line to fix; a wrong
story in a notes file gets built on. It is deleted rather than corrected, and
the replacement note describes only which panels play where.

`CLAUDE.md` **hard rule 8** is the standing version: never assign a comic to a
level, or write story notes for it, unless Cory has named the slot; unnamed art
goes to `unplaced/` and gets flagged, where "unplaced" means "not yet named"
rather than "not yet guessed".

## The final map

Openings (`levels` in `cutscenes.json`), in play order:

| level | panels |
|---|---|
| **level 1** | `level1_intro_panel1` → `level1_intro_panel2` → `level1_intro_panel3` |
| **level 2** | `level2_intro_panel1` → `level2_intro_panel2` |
| **level 8** | `level8_intro_a_01` → `_a_02` → `_a_03` → `level8_intro_b_01` → `_b_02` → `_b_03` |

Every other level has no opening, which is the default rather than an omission.
Level 3's entry and level 9's are gone.

Endings (`outros`), in play order:

| level | panels |
|---|---|
| **level 8** | `level8_outro_01` → `_02` → `_03` |
| level 9 | `cutscene_L9_end_gate` (unchanged) |
| **level 10** | `cutscene_L10_01` → `_02` → `_03` → `epilogue_01` → `_02` → `_03` → Credits |

`midWave` is untouched: level 3 after wave 12, level 4 after wave 6, level 9
after waves 3, 7, 11 and 15.

**The epilogue rides level 10's outro list rather than getting a map of its
own.** `GameScene.leaveWon` sends the last level's outro to the Credits
(`nextLevelId` is null exactly once), so that one list is precisely what sits
between the last boss and the roll. A fourth map would have needed a second
lookup in the scene to land in the same place, and `cutsceneProblems` validates
keys as level ids, so an `epilogue` key would have needed source changes to
pass. This stays a data-only change: nothing under `src/` was touched.

## The moves

All `git mv`, so history follows.

```
art-source/cutscenes/level1/intro_strip.png    -> level8/intro_a_strip.png
art-source/cutscenes/level3/intro_strip.png    -> level8/intro_b_strip.png
art-source/cutscenes/unplaced/level10_intro_strip.png -> level8/outro_strip.png
art-source/cutscenes/level2/intro_strip.png    -> epilogue/epilogue_strip.png
```

`level1/` and `level2/` now hold only the new art, as the brief specified.
`level3/` holds only `wave12_strip.png`. `unplaced/` is down to two entries and
both are alternates of comics that already ship — `level9_outro_alternate` and
`level10_outro_condensed` — so `_unplaced` in `cutscenes.json` and
`unplacedComics()` both read 2, and the test that pinned 3 was updated with the
reason.

## `pages`: a source that must not be sliced

The new level 1 and level 2 art is **five single finished 1672x941 drawings**,
not three-panel strips. `tools/comics/plan.json` therefore grew a second list:

- `strips` — a multi-panel page, cut on gutters measured by `slice.py`.
- `pages` — a source that is already one finished panel, encoded whole.

Running the old path over one of these would have cut a drawing into thirds down
the middle of its own art, and `slice.py` would have found gutters to do it
with. The two lists are kept apart in the plan rather than guessed at from the
image, which is the same lesson as the placements one directory up.

`publish.py` handles `pages` by pointing the encoder at the art-source PNG where
it lies — the server already serves the repository root, so no copy is needed —
and records `{size, panels: 1}` in `measured`.

## The publish

`python3 tools/comics/publish.py 90`, one Chromium launch, **35 panels, 7.08 MB,
worst PSNR 31.7 dB** on `level8_outro_03`. The new and re-cut ones:

| panel | size | MB | PSNR |
|---|---|---|---|
| `level1_intro_panel1/2/3` | 1672x941 | 0.349 / 0.335 / 0.354 | 37.7 / 37.3 / 38.0 |
| `level2_intro_panel1/2` | 1672x941 | 0.276 / 0.308 | 38.4 / 38.1 |
| `level8_intro_a_01/02/03` | ~552x941 | 0.130 / 0.113 / 0.125 | 37.0 / 37.6 / 37.5 |
| `level8_intro_b_01/02/03` | ~715x724 | 0.140 / 0.104 / 0.113 | 35.7 / 35.7 / 34.9 |
| `level8_outro_01/02/03` | ~719x724 | 0.160 / 0.145 / 0.225 | 33.4 / 33.7 / 31.7 |
| `epilogue_01/02/03` | ~552x941 | 0.129 / 0.112 / 0.127 | 36.5 / 37.0 / 36.8 |

The cut columns for all ten strips are in `tools/comics/last-run.json`. The nine
mid-wave panels were re-encoded identically as part of the same run; nothing
about them moved.

Deleted from `public/`: the nine stale `level1/2/3_intro_0N.webp` panels from the
09-16 run, and `cutscene_L9_01.webp`.

## `cutscene_L9_01.webp` — a judgment call, flagged

The brief said to remove **the level 9 opening entry**. It did not say to delete
the file, and I did. The reasoning, so it can be reversed if it is wrong:

`cutscene_L9_01.webp` is Hat-GTT's introduction as **one uncut 1672x941 strip**.
Level 9's own `midWave` entry for wave 3 plays the *same comic* from the *same
source* (`art-source/cutscenes/level9/wave03_strip.png`) sliced into three panels
at higher resolution — so a run of level 9 read it twice, about ninety seconds
apart. With the opening entry gone the file is referenced by nothing, and a
published WebP nothing fetches is the ORPHAN category `tests/content.test.ts`
exists to notice. Nothing is lost: the art survives as the strip in
`art-source/` and as the three panels that still ship.

`git revert` brings it back if Cory wants the file kept.

## Budgets

Measured through `tests/content.test.ts`'s own arithmetic:

```
boot=6.67 (cap 8)   music=6.41 (cap 10)   total=60.37 (cap 61)
level1:8.13  level2:7.88  level3:9.48  level4:9.80  level5:7.13
level6:7.01  level7:7.36  level8:11.10 level9:18.44 level10:18.08   (cap 20)
```

**The total is 0.63 MB from its cap, which is the tightest it has been, and the
cap is deliberately NOT being raised.** The next thing added to `public/` trips
it, on purpose — that number is a tripwire for an unwired upload, and it should
fire before somebody has to go looking. The arithmetic of the move: +1.62 MB for
the five whole pages against the 552x941 thirds they replace, +1.38 MB for level
8's nine panels and the epilogue's three, −1.12 MB for the ten deleted files.

The three caps a player actually experiences did not move. **Level 9 got
lighter** — 19.00 → 18.44 — because its duplicate opening went. Level 8 went
9.7 → 11.10. Level 10 reads 18.08 with the epilogue on its bill.

## Verification

**Tests: 1197 pass, 0 fail**, locally and in CI. `sh tools/tsdiff.sh ccf7f78`
reports 214 errors on both sides — nothing introduced. No file under `src/` was
touched, so `tsdiff`'s known blindness to Phaser member access is not in play
here.

**And the suite cannot see a rendered frame**, per CLAUDE.md's standing fact, so
every claim about what is on screen below came from `tools/harness/`:

- `sh tools/harness/run.sh midwave 600 844x390` — **60 checks, all passed**. It
  now walks three openings rather than two, with a panel count each
  (`{level1: 3, level2: 2, level8: 6}`), and asserts level 8's halves read
  `aaabbb` — interleaved they would read as nonsense and lay out perfectly.
  Confirmed in the log.
- `sh tools/harness/run.sh titlecard 400 844x390` — plays all **six** of level
  10's outro panels in order, `cutscene_L10_01/02/03` then
  `epilogue_01/02/03`, and hands over to `Credits` with the player's own button
  (`thenData {"then":"WorldMap"}`) carried through. A LOSS still plays neither.
- `sh tools/harness/run.sh screens 140 <vp>` at **844x390, 667x375 and
  1440x900**, plus `INSETS=0,47,21,47` at 844x390. The Cutscene screen reports
  **0 faults** at every one. 375x667 and 390x844 report *portrait is gated*,
  which is the correct answer for a landscape-only game rather than a skipped
  check.
- The only fault the sweep reports anywhere is pre-existing and not on a screen
  this pass touched: `SMALL Title [title:version-stamp (hidden dev door, not a
  tap target)]`.

**The pictures were read, not only the numbers.** Level 1's first panel draws
full-width with readable speech, SKIP off the art and the counter at `1 / 3`;
level 8's first panel letterboxes correctly as a tall 553x941 third at `1 / 6`;
the epilogue's first panel draws as `4 / 6` of level 10's ending. Reproduce with
the commands above, then
`python3 tools/harness/shrink.py tools/harness/shots/<name>.png 900`.

**One thing the harness reports that is not a pass or a fail.** Level 1 and
level 2's pages are 941px tall against **1086 physical pixels** on an 844x390
phone at devicePixelRatio 3 — **0.87x**, where hard rule 7 wants at least 1.0.
Not a regression: every comic panel in the game has been 941 or 724 tall since
the art arrived, and the same line was true of the thirds these replace. A
re-export is the only honest fix and nobody has asked for one.

## What was NOT done

- **The live site was not fetched.** See the top.
- **The three remaining uncut strips were left alone**: level 9's outro and
  level 10's three ending panels, each three sub-panels across inside one image.
  Cutting them is one row in `plan.json` and one list in `cutscenes.json`, and
  level 10's fight is verified frame by frame against them as they are.
- **Nothing was retuned and no soak was run.** This pass touches no balance
  number.
- **`art-source/cutscenes/retired/` is untouched**, as the brief said, and still
  holds six panels.

## Where this leaves the repository

- **`main` is at `f2cea40`, run 451 green, and the live site is `ff787e6`** —
  which carries every commit of this pass. `claude/comic-placement-fixes-5q6pyf`
  is pushed to the same tip and is fully merged; it can be deleted.
- **Open, carried forward from `2026-09-16-cutscene-reorganisation.md`:** three
  comics still ship as uncut three-across strips (level 9's outro, level 10's
  three). Down from four.
- **Open, new:** `cutscene_L9_01.webp` was deleted rather than moved to
  `art-source/`. Reversible with `git revert`; flagged above because the brief
  did not ask for it.
- **Open, new:** the deploy total is 0.63 MB under its 61 MB cap. The next
  asset added trips `tests/content.test.ts`. That is the tripwire working, but
  whoever hits it should read the note there before raising the number.
- **Open, new:** the level 1 and 2 pages are under-provisioned for a retina
  phone at 0.87x. Needs a re-export, not a code change.
- **Closed:** level 9 no longer reads the Hat-GTT comic twice.
  `unplaced/level10_intro_strip.png` is placed. `claude/context.md` has been
  reconciled against all of this, and its 09-16 section now carries a pointer to
  the correction ahead of it.
