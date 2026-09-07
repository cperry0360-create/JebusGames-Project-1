# Progression rework: victory flow, difficulty modes, and cakes

Three commits, in order. Every one on branch `claude/hero-art-hud-rework-tqd10v`
— this session cannot push to `main`, so the merge command is at the top of the
reply that carried this report and is repeated at the bottom of this file.

| commit | what it is | CI |
|---|---|---|
| `71d6199` | Levels name the level that opens them, and a win offers somewhere to go | **green**, covered by run 149 (pushed with `020b66e`) |
| `020b66e` | Three difficulty modes, and they move lives and money only | **green** — [run 149](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34074241917) |
| `3e9a32b` | Story mode pays in cakes, and banks no points at all | **green** — [run 150](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34075482965) |

Tests went 932 → 947, all passing. `sh tools/tsdiff.sh 9172418` reports 206
against a 205 baseline; the single difference is `Cannot find module 'phaser'`
for the one new file that imports it (`src/ui/CakeRow.ts`), which is the known
condition of this environment — `npm install` 403s, so `tsc` cannot resolve
Phaser locally and every file that imports it contributes exactly this error.
Only CI verifies those.

---

## Commit 1 — the unlock model, and where a finished level sends you

### `runsClearedToUnlock` is gone; levels name their prerequisite

The old model counted runs. `levels.json` carried thresholds 0, 1, 2, 3 and
`isLevelCleared` **derived** an answer from the count — level *i* was beaten
once enough runs had been cleared to open level *i+1*. Three consequences, all
of them live before this commit:

- Clearing level 1 three times marked levels 1, 2 and 3 beaten and opened
  level 4.
- START RUN goes to the furthest unlocked level, so those three replays put a
  player straight into THE CONUNDRUM.
- The captions could only say "Clear a run to unlock" / "Clear 2 runs" /
  "Clear 3 runs", which names no level at all.

`levels.json` carried two notes about raising a threshold as a workaround and
admitted the gate could not be made specific. The fix those notes said it would
take is the one that landed: an `unlockedBy` field naming a level id (level 1
is `null`), and a `clearedLevels: string[]` in the save.

`Levels.isLevelUnlocked`, `unlockedLevels`, `furthestUnlocked` and
`isLevelCleared` are lookups now rather than derivations, and
`Levels.nextLevelId(id)` is the reverse lookup — deliberately NOT a `next`
field, because a `next` and an `unlockedBy` that disagreed would be two answers
to one question.

**An unknown prerequisite leaves a level LOCKED.** A typo therefore costs a
level rather than opening the campaign, and `tests/levels.test.ts` catches it.

**The migration.** A save with no list gets `MIGRATION_ORDER.slice(0, runsCleared)`
— the first N levels — because that is exactly what the old derivation
believed. It is not a perfect reconstruction and cannot be; the information was
never recorded, which is the whole reason for the field. Somebody who cleared
level 1 three times is credited with levels 2 and 3 they never played, which is
what the old model already believed and already unlocked. `MIGRATION_ORDER` is a
literal, not `LEVELS.map(l => l.id)`: a migration describes the past and must
keep meaning the same thing after a level is inserted or renamed.

`runsCleared` **stays.** It is what unlocks the Server Nuke, "you have finished
a run" is a different question from "you have beaten this level", and it is a
lifetime counter a per-level list cannot reproduce.

### The end-of-level screens

| | buttons, in order |
|---|---|
| win, with a level after it | **NEXT LEVEL**, REPLAY, LEVEL SELECT, MAIN MENU |
| win, with none | **LEVEL SELECT**, REPLAY, MAIN MENU + "More levels coming soon." |
| defeat | **RETRY**, LEVEL SELECT, MAIN MENU |

NEXT LEVEL goes straight to the next level's Loadout, not back through the
world map. Both screens name the difficulty the run was played on.

Two decisions worth stating:

- **NEXT LEVEL is REPLACED past level 4, not disabled.** A greyed-out control
  that cannot say why poses the question instead of answering it.
- **The buttons wrap at two per row and the plate grows for it.** Four 122px
  buttons in one row are legible on a desktop and not on a 375px-wide phone
  once the panel scales itself to fit — which it does. `DialogOptions.actions`
  replaces confirm/extra/cancel outright rather than growing a `third?:` and
  then a `fourth?:`.

### Verified from rendered frames

`sh tools/harness/run.sh results <wait> <vp> <level>`, which enumerates the
dialog's buttons off the live objects rather than off the source — a label that
is drawn is a label a player can press; a label in a string literal is not.

- 844x390, 667x375, 1400x708: the win panel in a 2×2 grid with NEXT LEVEL
  cyan-primary, every button on screen.
- Level 4: LEVEL SELECT / REPLAY / MAIN MENU and "More levels coming soon."
- Defeat: RETRY / LEVEL SELECT / MAIN MENU.
- World map captions read "Clear COURJAHAN VILLAGE to unlock", "Clear HEAD
  OFFICE to unlock", "Clear SPORTS COMPLEX AT DUSK to unlock".

---

## Commit 2 — three difficulty modes

| id | name | lives | starting peanuts |
|---|---|---|---|
| `lazy-dad` | Lazy Dad Mode | ×2.0 | ×1.5 |
| `normal` | Yeah, I Game | ×1.0 | ×1.0 |
| `try-hard` | Try Hard | ×0.5 | ×0.75 |

Global, chosen on the level select screen, remembered in the save, fixed for
the length of a level once it has started. Everything is in
`src/data/difficulty.json`.

### `normal` is a literal no-op, twice over

`tests/difficulty.test.ts` asserts the identity **against `rules.json`
directly** rather than against a copy of its values, so a change to either file
breaks it. And the 120-seed soak reproduces every published win rate seed for
seed: 95, 25, 90, 63 — the same four numbers as the 2026-09-06 baseline.

### What they change, and why that is the whole list

Starting lives and starting peanuts. Scaling enemy HP, damage, armour or wave
timing would change **which towers are viable** rather than how hard a level is
— the Grinder ignores armour and the Slingshot cuts it, so a 30% armour bump
makes one tower better and another nearly useless and the draft decides the run
before the player does. It would also mean soaking and tuning every level three
times instead of once. `tests/difficulty.test.ts` asserts each mode's key set is
exactly `id, name, blurb, livesMultiplier, peanutsMultiplier`, so a third knob
fails the build before it reaches a level's tuning.

### "Cannot be changed once a level has started"

Made true by **when the value is captured**, not by a flag anybody has to
check. `GameScene.create` reads the save once and stores `status.difficultyId`;
the HUD and both end screens read the RUN. A test asserts exactly one
`savedDifficulty()` call in GameScene and that HudScene never reads the save at
all, and the harness changes the save under a live run and fails if the readout
moves. It does not.

`status.startingLives` is new for the same reason: `RULES.startingLives` stopped
being the answer the moment a difficulty could scale it, and the results screen
would have told a Lazy Dad player they had 17 of 20 when they had 17 of 40.

### The soak sanity pass

`tools/soak/level.ts` takes a difficulty as a fourth argument and `Sim.ts`
imports the game's own `Difficulty.ts` rather than carrying a copy. Full
numbers, method and the loss distributions are in **`SOAK-REPORT.md`** under
*2026-09-07 — the three difficulty modes, sanity-checked*. The short version:

| level | lazy-dad | normal | try-hard |
|---|---|---|---|
| level 1 | 72% | 79% | 78% |
| level 2 | 22% | 21% | 21% |
| level 3 | 73% | 75% | 70% |
| level 4 | 53% | 53% | 53% |

**The win rate is nearly flat and that is the finding, not a bug.** The
simulator's losses are decided by whether the drafted set holds wave 6 and wave
12, not by the buffer in front of it. Where the modes separate is in how far a
losing run gets and how much slack a winning one had, and there they separate
exactly as much as the multipliers say — level 4's average lives left on a win
is 38.9 / 18.5 / 8.5, and lazy-dad loses no run before wave 8 where normal
loses 35 before wave 7. **Nothing was retuned.**

### Verified from rendered frames

New `difficulty` scenario, run at 667x375, 844x390 and 1400x708. It does not
only photograph the setting, it drives it: chip → panel → choose Try Hard →
start a level → change the save mid-run → end the run.

- The chip and its DIFFICULTY caption sit top-right on the title's line, clear
  of the title, on screen at all three sizes.
- The panel offers all three modes with one CURRENT and two CHOOSE, every word
  on screen, centred on the viewport centre to the pixel at all three.
- Choosing Try Hard is saved and the chip redraws.
- The run takes it: `startingLives` 10 against normal's 20.
- The HUD reads TRY HARD, on screen, overlapping nothing.
- Setting the save to `lazy-dad` mid-run leaves the HUD on TRY HARD.
- The victory panel names it.

### Two faults the frames found

Both were real, both are fixed in this commit, and neither was visible from the
numbers alone.

1. **A `Dialog` opened on a fitted-camera scene was composed in CSS pixels.**
   The level select screen is the first menu of that kind to open one. Its
   camera is fitted to the 1280x720 design box, so its units are design units —
   and `viewW`/`viewH` handed the dialog 844x390, centring the panel on (422,
   195) of the box with its scrim short of two edges. `DialogOptions.space` now
   names the box a panel is centred in and scaled to fit; it defaults to the
   live viewport, which is right for the HUD and for GameScene's own panels.
2. **A choice card reserved 44 units for a button that draws at 81.**
   `plateButton` puts every control through `tapFloor`, which on a fitted scene
   grows a 44-unit button so it lands at 44 CSS pixels on a phone. The card
   reserved the authored height, the plate drew the grown one, and its top ate
   the last line of the card's flavour text — "any softer." disappeared under
   CHOOSE at 844x390. The card asks `tapFloor` the same question now.

---

## Commit 3 — cakes replace points in story mode

### The award

0 to 3 cakes on completion, from lives remaining as a **fraction of that run's
own starting lives**. Thresholds are in `src/data/cakes.json`:

| cakes | needs | why |
|---|---|---|
| 1 | cleared the level at all | — |
| 2 | ≥ 50% of starting lives | — |
| 3 | 100% | nothing reached the gate |

Percentage and not a count, because difficulty scales starting lives: an
absolute "10 lives left" would pay **three** cakes for an untouched Try Hard run
and **two** for exactly the same performance on normal. `tests/cakes.test.ts`
checks the same performance pays the same on all three modes, on the real
numbers each mode produces.

A loss pays nothing. There is no tier below "cleared the level at all", which is
a deliberate difference from Banner Points — those paid on a loss on purpose,
because depth is progress; a participation cake on every node would say nothing
about any of them.

### The record

`save.cakes` is `{ [levelId]: { count, difficultyId } }`. Better overwrites,
worse does not, **and equal does not either** — re-recording an equal count
would rewrite the difficulty id and quietly demote a Try Hard three to whatever
was last played on. Cakes earned on any difficulty count: `recordCakes` compares
counts and never mentions a mode, and a test asserts it never learns to.

**There is no migration and there cannot be.** An older save knows which levels
were beaten and nothing whatever about how many lives were left when they were,
so any reconstruction would put a number on a node the player never earned. An
older save arrives with empty slots and one replay fills them in.

**Cakes gate nothing.** Level 4 opens because level 3 was beaten, at one cake or
at three. A test asserts `Levels.ts` has never heard of a cake.

### Points, removed from story mode and kept whole

Gone from `endRun`: the `+N BANNER POINTS EARNED` headline, `bannerPointsFor`,
`addBannerPoints`, and the "Banner Points, all runs" row. What replaced the last
of those is "Best on this level", shown **only when the level has done better
before** — saying "best 3" under a run that just scored 3 is the screen
congratulating itself.

`Banner.ts`, `rules.banner` and `save.bannerPoints` are **untouched**, and
`tests/banner.test.ts` gained a test that fails if a later pass tidies away the
now-unreferenced module. Its other twenty tests still drive the scoring.
`verdictFor` is the one thing story mode still imports from it, and it is not
points — it is the flavour line under the title and it reads lives remaining.

`DESIGN.md` carried "Replaces the 3-star system entirely" as a claim about the
whole game. It now records the split: run mode keeps points and the tree, story
mode pays cakes, and the two do not mix. The change is stated there rather than
left as an undocumented contradiction, and the test that used to enforce the old
rule says in its own comment why it now says the opposite.

### The asset

`public/assets/ui/ui_cake.webp` — 1024x1024, WebP q95, **124,824 bytes**.
PSNR 43.9 dB against the source PNG, alpha off by 0 on 0 pixels. The PNG is
deleted, which is the convention in `public/assets/ui/`.

**Asset budget impact: 26.71 MB → 26.83 MB of a 40 MB cap, and 0.125 MB against
a 3 MB per-image cap.** `tests/content.test.ts` passes with room. The brief said
to downscale to 512 only if the budget test actually failed; it did not, so
1024 stands.

`python3 tools/measure_art.py` (UI icons section, which the cake was added to):

```
ui-cake: canvas 1024x1024, ink x49-974 y21-1002 -> {'contentWidth': 926, 'contentHeight': 982}  (0.943:1)
```

Those are the numbers in `art.json`. The canvas is not, because `fitInBox`
divides by them and a canvas figure would draw every cake 6% small and fit a
0.943:1 shape as a square.

**ONE asset.** There is no empty-cake file. The unearned state is a second
greyscale recipe in `Desaturate.ts`:

```
grey = 150 + (lum - 128) * 0.30,  then alpha *= 0.60
```

and it is a separate recipe rather than the existing one because the existing
one **darkens**: `SWITCHED_OFF` is `mid 129, contrast 0.7`, right for an icon on
a lit HUD plate and wrong for a dark-chocolate cake on a near-black panel, where
it would make an unearned cake invisible rather than faint. The two recipes have
separate texture keys so one cannot be handed back for the other.

Measured off the two textures by the `cakes` harness scenario — not off a
screenshot, because a cake that has vanished into a dark panel and a cake that
was never drawn look identical in a picture:

| | mean luma | mean alpha |
|---|---|---|
| earned | 87.2 | 253.2 |
| unearned | **137.7** | **152.1** |

Lighter, and faded. The scenario fails if that ever inverts.

### Where they are drawn

One helper, `src/ui/CakeRow.ts`, used by both screens — a second copy of "three
slots, earned in colour, the rest pale" is a second copy that drifts, and a
player only ever sees one of the two screens at a time so they could never
report the disagreement.

- **Victory and defeat panels**, where the Banner Points headline was, with the
  earned ones dropping in one at a time. The defeat panel shows three empty
  slots: on a loss that says "this level has three to give and you got none",
  which is information rather than a scolding, and the "Best on this level" row
  is right underneath it.
- **Every built node on the level select road**, unearned included. Three pale
  cakes on a level nobody has touched is the point — it says the level HAS three
  to give, which is what makes going back for them an idea a player can have.
  Not animated there: the scene is rebuilt on restart and a pop each time would
  read as the count changing.

### Verified from rendered frames

New `cakes` scenario at 667x375, 844x390 and 1400x708. It plays a real run, ends
it four times at four different life totals, checks the panel against
`cakesFor`, then goes to the map and checks the node against the save.

- 3, 2, 1 and 0 cakes each drew **three slots** with the right number lit.
- Every cake on screen; every earned one finished its tween before the shot.
- The banked record came back on level 1's node: 3 lit, matching the save.
- Sizes, measured through the right camera for each screen:

| | 667x375 | 844x390 | 1400x708 |
|---|---|---|---|
| victory panel | 58 px | 60 px | 100 px |
| level select node | 24 px | 25 px | 45 px |

`screens` finds no new fault at any of the three; the only one it reports is the
Title version stamp, a hidden dev door annotated as not a tap target, unchanged
from before this session. 375x667 and 390x844 are **gated** — the game is
landscape-only and a portrait viewport gets the rotate overlay, which
`CLAUDE.md` says is the correct answer for portrait rather than a skipped check.
Both confirmed showing the gate at full coverage.

### On the 32px floor — read this before assuming it was met

The brief said "minimum display size 32 px per cake; do not render world map
node cakes at 24 px". **The map node cakes are 44 DESIGN units, which lands at
24–25 CSS pixels on a phone and 45 on a desktop.** That is over the floor read
in design units and under it read in CSS pixels, and the difference is not
something a size can fix:

- The level select screen is composed against the 1280x720 design box and
  fitted. At 844x390 the whole screen is at 54%, which is also why the node's
  own NAME is 22 design units and 12 CSS pixels there — the repo's typography
  floor for this screen is 22 **design** units for exactly this reason.
- 32 CSS pixels on that phone is 59 design units. Three of those plus their gaps
  is 209 units, across a node picture that is **160 units wide**, on a road
  whose node pitch is 210. They would touch their neighbours' rows.

44 is as large as three will go without hanging off the level they belong to
(148 of 160). What the frames did show is that the first attempt at **34** units
was genuinely too small — 19 CSS pixels, unidentifiable — so the number moved
for the reason the brief gave, just not all the way to a figure the node cannot
hold. If 32 CSS pixels on a phone is the requirement rather than 32 units, the
answer is a bigger node or a second row, and that is a level-select layout
change rather than a cake size.

### One more thing the frames found

At 34 units on no backing, **level 1's three EARNED cakes vanished into its
picture.** Full-colour dark chocolate on a bright midday village; the pale
unearned ones on the darker cards read perfectly well, which is the opposite of
what anyone would predict. Nothing about the cakes could fix it — the row needed
something to sit on. There is a dark rounded plate under it now, and every node
reads at a glance whatever is painted on it.

---

## What was NOT checked

Stated plainly, because a report that implies more coverage than it has is worse
than none.

- **No soak on the cake thresholds.** The percentages were checked
  arithmetically and against four scripted end-of-run states in the harness, not
  against a distribution of real runs. Nobody knows yet what share of wins
  actually pays 3 — on the level-4 numbers above, `average lives left on a win`
  is 18.5 of 20 on normal, which suggests **most** wins pay 3 and the tiers may
  be too easy. That is a tuning question and `cakes.json` is where to answer it.
- **No frame of the cakes or the difficulty chip at levels 2, 3 or 4.** Every
  screenshot in this report is level 1 or the level select road. Level 4 was
  driven for the *button* case in commit 1 only.
- **The panel cakes were not checked mid-animation.** The scenario waits 1.5s
  and asserts the earned ones are at full alpha; it does not photograph the
  drop-in, so "they land one at a time" is asserted from the tween's delays
  rather than from a frame.
- **No check that a save written by this build loads in an older one.** New
  fields are additive and the loader names every field it wants, so an older
  build ignores them — reasoned, not tested.
- **`normal` was verified as a no-op against the four levels' win rates, not
  against every derived number in SOAK-REPORT.md.** The per-seed loss
  distributions on normal were not diffed against the 2026-09-06 run.

---

## Where this leaves the repository

**Open, from this session:**

1. **The cake tiers are probably too generous.** See "What was NOT checked".
   One 120-seed pass that records cakes rather than wins would settle it, and
   the fix is three numbers in `cakes.json`.
2. **The verdict line and the 2-cake tier disagree at exactly half.**
   `verdictFor` uses `livesRemaining > maxLives * 0.5` and `cakesFor` uses `>=`,
   so a run finishing on exactly 10 of 20 is awarded two cakes under the words
   "Barely standing." Visible in
   `tools/harness/shots/cakes-won-2-844x390.png`. One character in `Banner.ts`,
   not changed here because `verdictFor` is shared with run mode.
3. **Dialog buttons fall under the 44pt floor when a panel scales to fit.**
   Measured at roughly 24 CSS pixels on the run-end panel at 844x390: the panel
   is taller than the viewport, `Dialog.fit` scales the whole layer, and the
   buttons go down with it — so `tapFloor`'s work inside `plateButton` is undone
   from outside. Commit 1's wrap to two rows made the panel taller and therefore
   made this worse. **Pre-existing in kind, not in degree.** The fix is to make
   the panel shorter rather than to scale it, which is a Dialog layout change
   and wants a decision first.
4. **The 32px-on-a-phone question above.** Needs someone to say whether the
   floor was meant in design units or CSS pixels.

**Carried forward from `2026-09-07-hero-art-and-the-hud-chip.md`, none of them
re-checked here and all to be assumed still open:**

5. **Courtland's ability names disagree with his icons** — the batch names his
   slots *Seismic* and *Mind Control*; `heroes.json` says *Shockwave* and
   *Seismic*. Someone has to say which is right.
6. **`fx_mind_control` has art and no mechanic.** Same decision as (5).
7. **Nine canvas-vs-ink content boxes**, eight of them tower-menu glyphs up to
   35% small. Fixing them enlarges those glyphs; wants a look at the ring first.
8. **Seven harness scenarios still drive the deleted `g.menu` / `g.panel`** —
   `ui`, `muzzle`, `buildall`, `rockets`, `retreat`, `regressions`, `poor`,
   `typegame`. Each reports success while running none of its assertions. **Still
   the highest-value item on the list.**
9. **The hero's two ability medallions go dead after the Server Nuke drops.**
   Confirmed pre-existing against `9172418`. A hero losing half their kit
   mid-run is worth a session of its own.

**Not in scope and deliberately not done:** run mode is not gated behind story
completion. START RUN is still reachable from the title screen and still takes
the furthest unlocked level.

**Files worth knowing about after this change:**

- `src/data/difficulty.json`, `src/systems/Difficulty.ts` — new. Phaser-free, so
  the soak imports the same module the game does.
- `src/data/cakes.json`, `src/systems/Cakes.ts`, `src/ui/CakeRow.ts` — new.
- `src/systems/Save.ts` — three new fields: `clearedLevels`, `difficultyId`,
  `cakes`. The first has a migration; the third deliberately does not.
- `src/ui/Dialog.ts` — `actions`, `space` and `cakes` options; the choice card
  reserves its button's real height.
- `src/systems/Desaturate.ts` — two named recipes instead of one hardcoded one.
- `tools/harness/index.html` — two new scenarios, `difficulty` and `cakes`;
  `results` rewritten to be level-parameterised.
- `tests/progression.test.ts`, `tests/difficulty.test.ts`, `tests/cakes.test.ts`
  — new.
- `SOAK-REPORT.md`, `DESIGN.md` — updated in place and linked from above.

---

## Merging

```
git fetch origin
git checkout main
git merge --ff-only origin/claude/hero-art-hud-rework-tqd10v
git push origin main
```

`origin/main` is at `9172418`; the branch is a fast-forward from it.
