# Three demons, a second level, and a run that survives the app closing

2026-09-04.

| | commit | CI |
|---|---|---|
| CI change merged to main (from `claude/main-branch-ci-checks-svdxut`) | `9206b4b` | checks:success build:success **deploy:success** |
| The three demons, and level 2's own waves | `36f0e1d` | covered by the run below |
| A run in progress, kept across closing the app | `4acbeb9` | checks:success build:success **deploy:success** |

All work is on `main`, as asked. Run
[33873389865](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33873389865)
is the one that matters: `checks` (639 tests, `tsc --noEmit`), then `deploy /
build` (`npm run build`, so a real `tsc` against real Phaser types), then
`deploy / deploy` (`actions/deploy-pages`). Green all the way through, and the
site published. `36f0e1d` and `4acbeb9` went up in one push, so GitHub ran the
head commit; `36f0e1d` has no run of its own.

---

## 0. The CI gate is now proven, not just written

The previous report left one thing open: no Pages deploy had ever run through
the new called-workflow path. It has now, twice — `9206b4b` and `4acbeb9`. The
chain `checks` → `deploy / build` → `deploy / deploy` works, and
`actions/deploy-pages` is content to run inside a workflow called by another.
See `reports/2026-09-04-checks-on-main.md`.

I could not fetch the live page to confirm what it is serving: this container's
egress proxy refuses `cperry0360-create.github.io`. The deploy job's success is
the evidence, and it is good evidence — `deploy-pages` reports success only
once Pages has accepted the artifact.

---

## 1. The demons

### The files were not called what the brief called them

There is no `demon_direct_report.png` in the repository, and there was not one
when the brief was written. The three uploads were `IMG_1618.png`,
`IMG_1619.png` and `IMG_1620.png`. Their heights — 550, 698 and 697 — match the
brief's "550, 698 and 697" exactly and in order, and the widths confirm it: 734
for the manager (the widest by far) and 434 for the devil (much the slimmest).
So the mapping is not a guess, and they are renamed to the names the brief
uses:

| was | is | source |
|---|---|---|
| `IMG_1618.png` | `demon_direct_report.png` | 509x550 |
| `IMG_1619.png` | `demon_middle_manager.png` | 734x698 |
| `IMG_1620.png` | `demon_the_devil.png` | 434x697 |

Nothing referenced the old names.

### Sizing: one scale per sprite, and why the old rule had to give

The existing four enemies sit at ONE scale factor from their own source art —
0.2913, 0.2933, 0.2920, 0.2926 — because the Kenney pack was drawn that way.
`tests/content.test.ts` enforced that across every enemy in the game, and
`tools/measure_art.py` computes it as a single `escale`.

That rule cannot survive contact with commissioned art. These three were drawn
on 550-698px canvases against the pack's 120-282, so a shared factor sizes them
by whatever canvas the artist chose: at 0.292 the Underling would stand 161
world px tall, two and a half times Buckethead. What the brief asks for instead
is each one placed by the height it should READ at, which is what the numbers
below are.

| enemy | source | displayHeight | on-screen w | shadow | health bar |
|---|---|---|---|---|---|
| Scrapper | 119x120 | 35.2 | 34.9 | 19.5 (56%) | 29.7 |
| **Underling** | 509x550 | **33.4** | 30.9 | 23.5 (76%) | 26.3 |
| **The Devil** | 434x697 | **37.0** | 23.0 | 17.7 (77%) | 19.6 → 22.0 (floor) |
| Bruiser | 162x150 | 43.7 | 47.2 | 25.0 (53%) | 40.1 |
| Buckethead | 189x226 | 66.0 | 55.2 | 43.3 (78%) | 46.9 |
| **Middle Manager** | 734x698 | **66.0** | 69.4 | 41.6 (60%) | 59.0 → 54.0 (ceiling) |
| The Politician | 282x282 | 82.5 | 82.5 | 62.1 (75%) | 70.1 → 54.0 (ceiling) |

- **Underling 33.4** — 5% shorter than the Scrapper it stands in for.
- **Middle Manager 66.0** — Buckethead's height exactly. The "noticeably wider"
  is not a second setting: at that height his own aspect makes him 69.4 world
  px across against Buckethead's 55.2, so he is 26% wider for free.
- **The Devil 37.0** — see below.

Anchors and shadow widths are measured, not chosen. `tools/measure_art.py` grew
a `demons` section that reads the ground silhouette of each file, finds the foot
groups at a 0.90 band, and prints exactly what went into `art.json`. Re-run it
after any re-export. It also stopped dying on `enemy_boss_beetle.png`, which is
in the folder and in no manifest — the script had been raising a `KeyError`
there before reaching the hero or HUD sections, so anyone following CLAUDE.md's
instruction to run it got a stack trace.

### The Devil's height is the one thing to look at

**He is 37.0 because the brief says "a little taller than the junior", and that
is what it says.** I took it literally. Three things say it may not be what you
meant:

1. A 6200-health boss reads smaller than a 185-health elite (66.0) and less
   than half the Politician (82.5).
2. His health bar comes out 19.6px wide and is clamped up to the 22px floor —
   the same width the smallest enemies get.
3. The other clause in the same sentence compares him to the MANAGER ("much
   slimmer than the manager"), and the two were drawn on canvases one pixel
   apart in height, which is exactly the situation where "a little taller"
   reads as being about the manager.

Against that: you named "the junior" explicitly in a sentence that names the
manager immediately afterwards, which is not a slip anyone makes easily. So I
followed it.

**If he was meant to stand a little taller than the Middle Manager, it is one
number.** Set `enemy-devil.displayHeight` to `70.0` in `art.json` and
`DEMON_ON_SCREEN['demon_the_devil.png']` to `70.0` in `tools/measure_art.py`,
then re-run the script for the new `shadowWidth` (it scales to 33.5). One test
assertion in `tests/content.test.ts` — "a little taller, not a different size
class" — is written against the literal reading and would need its bound moved.
Nothing else in the game changes.

### Rule 7: two of the three are over-provisioned

CLAUDE.md's formula wants source height ≥ world height × maxZoom × dpr = 7.11x.

| | source | wants | over |
|---|---|---|---|
| Underling | 550 | 237 | **2.3x** |
| Middle Manager | 698 | 469 | 1.5x |
| The Devil | 697 | 263 | **2.6x** |

The rule warns in both directions, and these two are over on the "too large"
side — the side that produced the grey-smear cast the first time round, because
minification past about 2x has no mipmaps to soften it (WebGL1). The Middle
Manager is fine. The Underling and the Devil would be sharper re-exported at
roughly 250-280px tall. I have not touched the art: re-exporting is an art
decision and outside what was asked. Note that raising the Devil to 70.0 world
px fixes his side of this on its own — 697 against a wanted 498 is 1.4x.

---

## 2. Level 2

`src/data/waves.level2.json`, and `src/data/levels.json` to say which table
belongs to which level. **`levels.json` did not exist**; the brief asked me to
point it at the new file, so it is new here. It carries id, name, wave table,
lane length and an unlock count, and nothing reads it — GameScene still imports
`waves.json` directly, because making it level-aware is the refactor you have
not approved.

### The shape is level 1's, exactly

Thirteen waves, the same spawn groups in the same order, at the same intervals
and the same delays. Only the counts differ, and the enemies are substituted
tier for tier: Underling for Scrapper, Middle Manager for Buckethead, The Devil
for The Politician, Bruiser left exactly where he was. A test asserts all of
that group by group rather than describing it.

### The step is +18.5%

| wave | level 1 | level 2 | | wave | level 1 | level 2 |
|---|---|---|---|---|---|---|
| 1 Onboarding | 264 | 330 | | 8 The Reorg | 2096 | 2420 |
| 2 Probation | 396 | 462 | | 9 Quarterly Targets | 2578 | 2933 |
| 3 The Interns | 450 | 552 | | 10 The Offsite | 2876 | 3443 |
| 4 Performance Review | 668 | 713 | | 11 Synergy | 3202 | 3671 |
| 5 Open Plan | 942 | 1086 | | 12 Deadline | 3774 | 4196 |
| 6 Escalation Path | 1100 | 1260 | | 13 The Devil | 5316 | 7012 |
| 7 All Hands | 1612 | 1867 | | **total** | **25274** | **29945** |

Straight substitution came out at +21.4%, over the band. Getting inside it was
counts only — no stat was touched, and a test pins the three health values so a
later "tune" of the level cannot quietly become a tune of the enemy:

- **five Middle Managers removed**, one each from waves 6, 9 and 11, two from
  wave 12.
- **three Bruisers added**, one to each of the first three waves, so level 2
  opens a step above level 1 rather than identical to it — straight
  substitution leaves waves 1 and 2 byte-for-byte level 1's, since they are
  Bruisers only.

No cliff: every wave is heavier than the one before, the largest non-boss step
is +52% against the 55% cap, and the boss wave steps +67% against its 80%.
Economy is shared, untouched, and still solvent: level 2 pays 0.141 peanuts per
point of enemy health against level 1's 0.148, over the 0.13 floor.

### The lane: measured, and not worth retuning

Level 1's lane, summed over map.json's 43 waypoints, is **1976.9px**. Level 2's
is **1916.7px** — **3.0% shorter**, about a third of a second of walking at
Bruiser speed. **So I changed nothing about the spacing**, and that is a
decision rather than an omission: scaling every interval by 0.97 would be
arithmetic dressed up as tuning, and would move the pacing further from level
1's feel than leaving it alone does. The reasoning is in the file's `_spacing`
note, and a test fails if a future level's lane drifts more than 5% while still
copying the spacing.

Names are corporate-hell to match the cast — Onboarding, Probation, The Reorg,
Synergy, Deadline — against level 1's high-fantasy First Light / Last Light.
Say the word and they change; they are strings in one file.

---

## 3. The run in progress

`src/systems/RunSave.ts`, plus wiring in GameScene, TitleScene, RunState and
Tower.

### What is stored, and where

Its own localStorage key, `courjahan.run` — deliberately NOT a field of
`Save.ts`. `Save.ts` holds what must outlive every run (volume, `runsCleared`,
the Banner total); a run in progress is the volatile half, and a half-written
run record must not be able to cost anyone the Server Nuke unlock. A test
asserts the two keys stay apart.

The record: `level`, `wave`, `lives`, `peanuts`, and every tower as
`{id, spot, tier, spec}` — which is its position (the build-pad index) and its
upgrade level. Plus the loadout: `heroId`, `abilities`, `openingTowers`,
`reserveTowers`, `unlockedTowers`, `seed`. That last group is beyond the list
you gave, and it is not optional: a resumed run that re-drafts is a different
run, with towers the player did not draw and without the ones standing on the
board.

`level` is written as `'level1'` because that is the only thing GameScene can
currently be playing. **GameScene was not made level-aware.** The field is
there because adding it later would mean every run saved before the change
resumes onto the wrong map.

### The version field

`RUN_SAVE_VERSION = 1`, written **into the record**, not into the key.
`Save.ts` puts its version in the key (`courjahan.save.v1`), which means a
shape change orphans the old record and silently starts fresh — survivable for
a volume slider, not for a player mid-run when an update ships. With the field
inside, a v2 can migrate a v1. `loadRun` declines any version it does not know
rather than misreading it, and the comment marks where the migration goes.

### When it writes

Wave completion, and every discrete change to the board: a tower built, sold,
moved by Restructure, an upgrade bought, and again when a tier finishes. Never
from `update()` — a test greps the frame loop to keep it that way, because a
`JSON.stringify` plus a synchronous `localStorage` write sixty times a second
is the failure this rule exists to prevent.

An upgrade saves twice on purpose: once when the peanuts leave (the tier has
not arrived yet) and once when the tier lands. A run resumed in between keeps
the tower at the tier it had finished paying for, and the peanuts are gone —
the conservative side of the trade.

### Resuming

The title screen offers it: **RESUME · WAVE 7** above **NEW RUN**, with CREDITS
below. It is offered rather than taken — dropping a player straight onto a
half-finished board removes the choice to start again, and the run they walked
away from may be the one they were losing. NEW RUN clears the record.

GameScene never looks for a saved run itself; it would restore one the player
had just declined. The answer is handed over through `RunState.resumeFrom`,
consumed once so a scene restart is not a second resume, and the wave is
clamped to one that exists in the table.

**A resume always restarts the wave it was saved on.** The enemies on the
field, their health and their positions are not saved. Replaying one wave is a
small gift; restoring a wave that should have enemies in it and does not is a
bug the player cannot see. `endRun` clears the record on both endings, before
anything else, and `saveProgress` refuses to write a finished run back.

Towers come back through a new `Tower.restoreTier`, which sets the tier and
wears the art with no build time, no scaffold and no cost — the player paid for
that tier before the app closed, and replaying the build would charge them
twice and leave the board defenceless while it caught up.

### Reading is total, and whole

Every field is validated, the way `Save.ts` validates its own. Nothing is
patched with a default: a record that fails anywhere is discarded entirely and
treated as no saved run, because half a run — one game's towers and another's
peanuts — is worse to hand a player than a fresh start, and it is the kind of
state that produces bug reports nobody can reproduce. Two towers on one pad,
zero lives, 200 towers, a non-numeric wave, an unknown version, unparseable
JSON, and localStorage that is absent or throws are all covered by tests, and
none of them throws.

---

## Tests

**639 passing**, up from 608. New: `tests/demons.test.ts` (6),
`tests/levels.test.ts` (8), `tests/runsave.test.ts` (17, including a fake
localStorage so the module's real behaviour is exercised rather than its
source text).

**Six existing tests changed, and this is the part to review**, because four of
them are strictly weaker than they were. Each encoded "there is one wave table
and four enemies drawn by one artist":

1. `the enemies keep the sizes they were drawn at` → now
   `the Kenney cast keeps the sizes it was drawn at, relative to itself`. The
   shared-scale rule holds for the four named pack enemies; the demons are
   covered instead by a new test asserting the brief they were sized against.
   **Weaker**: a fifth pack enemy added tomorrow is not automatically covered.
2. `health bars are sized from the sprite` — it demanded all enemies come out at
   different widths, which held while none reached the clamp. Two do now
   (Middle Manager at the ceiling, Devil at the floor), and that is the clamp
   working. It now demands distinct widths for every enemy INSIDE the clamp,
   and that anything pinned to a stop is pinned by arithmetic that agrees.
   **Weaker at the edges, unchanged in the middle.**
3. `there are three fightable enemy types, plus the boss` → now per level: each
   wave table fields a basic, a fast, an armoured and exactly one boss. This is
   **stronger**: it now checks something about every level rather than about a
   global enemy count.
4. `every wave references a real enemy` — "every enemy type appears" now means
   across all levels rather than within one. **Weaker in the same way the game
   is bigger**; it still catches an enemy statted, drawn, shipped and spawned
   by nobody, and it names the offenders.
5. `only the boss taxes` → `nothing but a boss walks through the line, and
   nothing but a boss taxes`. The tax was required of every boss; The Devil is
   a plain boss by instruction. Bosses must still be unblockable and do no
   damage, only bosses may tax, and at least one still must — so the mechanic
   cannot be deleted by attrition. **Weaker, deliberately.**
6. `finishing a tier recomputes support` matched the literal handler
   `() => this.refreshSupport()`. The handler is `onBoardChanged` now; the test
   follows the chain and still insists support is recomputed.

---

## Not checked

- **The game was never run.** `npm install` fails in this environment (registry
  403), so there is no Phaser and no way to open the game. Everything about
  task 3's runtime behaviour — the RESUME button appearing, a board coming back
  with its towers on the right pads at the right tiers — is argued from the
  code and covered by unit and source-shape tests, not observed. CI's
  `npm run build` does compile it all against real Phaser types, which is the
  strongest check available here and it passes.
- **No screenshots.** Same reason: the harness needs a built game.
- **The demons have never been on screen.** The sizes are arithmetic off
  measured pixels. Whether a 33.4px Underling reads at a glance, and whether a
  37px Devil looks like a boss, are questions for the first playthrough.
- **Level 2 is unplayable and untested as an experience.** Nothing loads it.
  The +18.5% is a health total, not a difficulty measurement; whether it plays
  as "a modest step up" cannot be known until GameScene can load it.
- **The live page was not fetched** — egress to github.io is blocked from here.

---

## Where this leaves the repository

- **Waiting on you — The Devil's height.** 37.0 (literal) against 70.0 (taller
  than the manager). One number in `art.json`, one in `measure_art.py`, one
  test bound. Everything else about him is settled.
- **Waiting on you — level 2 needs a scene that can load it.** The data is
  complete and nothing reads it. That is the level-aware GameScene refactor,
  and it is explicitly not approved. Until it is, level 2 exists as JSON and
  the run save's `level` field always says `level1`.
- **Waiting on you — the wave names.** Corporate-hell against level 1's
  fantasy. Cheap to change.
- **New, small:** the Underling and the Devil carry 2.3x and 2.6x the source
  pixels rule 7 asks for; a re-export at ~250-280px tall would sharpen both.
  Raising the Devil to 70.0 resolves his.
- **New, small:** `map_level2.webp` and `level2_path_overlay.png` are in
  `public/assets/maps/` and in no manifest, so they ship without being drawn.
  `enemy_boss_beetle.png`, `unicorn_trimmed.png` and `scale_check.png` are the
  same in `enemies/`. Together that is several MB of deploy for art nothing
  references yet.
- **Carried forward, unchanged:** `checks` is still not a required status on
  pull requests. The two workflows still disagree on Node (checks 24, Pages
  build 22).
- **Carried forward from 2026-09-04-node-first-build:** re-cut the sign art at
  ~270px wide; the 568x320 drawer grid lever; whether the drawer tab bar should
  have words (needs `minUiSize` lowered from 15); the sign *text* alignment
  item; 18 trait phrases await approval; towers 0.91x the lane; balance not
  re-tuned for the v2 lane; `icon_confirm.png` and `assets/nodes` unreferenced;
  `hud_peanut_icon.png` unwired; the hero walk-sheet redraw is not a task
  unless you say so.
