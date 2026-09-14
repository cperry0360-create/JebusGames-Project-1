# Merging the Vlaude fight to main, and a tsdiff false positive

The ask was one line: `git checkout main && git merge --ff-only
claude/vlaude-fight-scene-jrb368 && git push origin main`. It fast-forwarded, **all
five CI jobs are green on `main`, and the deploy ran rather than skipping** — so the
level 10 boss fight is live, not merely merged. Story mode now has a last level with
an ending on it.

**This is the first merge in this sequence where the branch had already reconciled
`CLAUDE.md` and `claude/context.md` itself.** The level 9 and level 10 merges both
landed a repository whose two auto-loading documents described a state that no longer
existed, and both merge reports spent most of their length fixing that. Commit
`fe9736a` did it on the branch this time. What was left here was three lines that only
the merge could know, plus two measurements that contradicted the file.

## Commits

| commit | what | CI |
|---|---|---|
| `3f1a805` | the branch head, fast-forwarded onto `main` (no merge commit) | **run 382 green — `changes`, `typecheck`, `test`, `deploy / build`, `deploy / deploy` all success. Pages artifact 58,430,175 bytes, uploaded 23:27:28Z; `actions/deploy-pages@v4` success** |
| `232d59d` | `claude/context.md`'s three merge-only lines, the two re-measurements below, and this report | **run 383 green — `changes`, `typecheck`, `test` all success; `deploy` SKIPPED**, which is the markdown gate working as designed: every changed path is a `.md` or under `reports/`. Predicted in this row before the push and confirmed after it. |
| _this commit_ | run 383's row, `232d59d`'s real hash, and the API-lag note below | not recorded, and it cannot be: a row for the commit that writes the row needs a commit after it. |

The table closes here on purpose, the same way the last three reports' did. A report
written before its own commit exists cannot know that commit's SHA, and guessing one
produces a table that looks authoritative and points at nothing. **The row above
carried a placeholder until this commit**; the convention is write the row, then fill
it in from the next commit.

Both deploy cases are now in one table, which is what `CLAUDE.md` asks for when it
says to read the job list rather than the run's conclusion: run 382 touched `src/` and
**ran** the deploy, run 383 touched only markdown and **skipped** it. Two green runs,
two different job lists, and only one of them republished the site.

### The Actions API lag, in a sharper form

`reports/2026-09-14-merge-level-10.md` records a seven-minute lag in which completed
jobs read as frozen mid-step. That did not reproduce here — jobs and steps were
accurate within seconds both times. **What did happen is narrower and easier to
misread:** `list_workflow_runs` filtered to `branch: main` did not return run 383 at
all while the unfiltered listing already had it, queued, with the right head SHA.

So the two views of the same endpoint disagreed, and the filtered one was the stale
half. **If a run you just pushed is missing from a branch-filtered listing, drop the
filter before concluding the push did not trigger anything.**

## The merge

`git merge-base main origin/claude/vlaude-fight-scene-jrb368` returned `692a1fc` — the
local clone's stale `main`, 42 commits behind `origin/main`. That is worth saying
plainly because it is the third session in a row to hit it and it looks alarming for a
moment: **the local `main` is routinely dozens of commits stale in a fresh container,
so the first `--ff-only` prints a 145-file diffstat that is the clone catching up, not
the merge dragging in extra work.** `main` was fast-forwarded to `origin/main` first,
and only then to the branch.

Against `origin/main` at `ffea4aa` the branch was **8 ahead, 0 behind**, so `--ff-only`
was the right verb rather than a hopeful one. Both of its own CI runs on the head were
green before the push: run 381 on `3f1a805`, and runs 378–380 on the three commits
before it.

### What landed

Eighteen files, 3,463 insertions. Four of the eight commits touched `src/` or
`public/`; the other four are tests, harness scenarios, the soak and the report.

- **`src/scenes/GameScene.ts` +1,225 lines** — the whole scene side of the fight: the
  berth at the crystal core, the form swap, the float, the telegraph and schedule, all
  six manipulations, the recall portal and the defeat.
- **The ending** — the white wash, the outro comics, the credits roll and the title
  card, across `CreditsScene.ts`, `CutsceneScene.ts` and `LoadoutScene.ts`.
- **`src/data/enemies.json`** — Vlaude at **26,000 hp**, re-derived once the powers
  actually fired. The old 36,000 was measured with none of them firing; at 36,000 with
  the powers live the same pass reads 12.5%.
- **`tests/level10.test.ts` +310 lines** — 14 new tests, and the file says at the top
  of the block which are RULE EXECUTED and which are source-text assertions about
  `GameScene.ts`. A source-text assertion catches a deleted line and nothing else.
- **`tools/harness/index.html` +757 lines** — the `vlaude` and `titlecard` scenarios,
  which are the only things in this repository that can see any of the above.

`reports/2026-09-14-level-10-the-fight.md` is the branch's own write-up and is the
authority on all of it. Nothing about the fight was re-verified here.

## Verification

| check | result |
|---|---|
| `npm test` on merged `main` | **1136 passing, 0 failing** (1122 before) |
| `npm test` after the doc commit | **1136 passing, 0 failing** |
| run 382, `main` at `3f1a805` | green: all five jobs, **`deploy` ran** |
| run 383, `main` at `232d59d` | green: `changes`, `typecheck`, `test`; **`deploy` skipped** by the markdown gate |
| `changes` | success, and it let the deploy through — `src/` was touched |
| `typecheck` (`npx tsc --noEmit`, with real `node_modules`) | success, 23:26:33Z |
| `deploy / build` | success — build, both post-build assertions, artifact uploaded 23:27:28Z |
| `deploy / deploy` | success — `actions/deploy-pages@v4` |
| Pages artifact | **58,430,175 bytes**, up 32,668 from the previous `main` artifact at 58,397,507 |

The artifact grew by 32 KB and no more, which is the expected shape: this branch added
a great deal of code and **not one new file under `public/`**. The art for the fight
all shipped with the level on 2026-09-14.

`npm install` still 403s in the sandbox, so CI's `npx tsc --noEmit` is the typecheck of
record. The suite ran here without `node_modules` because no test imports Phaser —
which is the same fact that makes 1136 passing say nothing about a rendered frame.

## Two measurements that contradicted the file

### `tsdiff` reports an introduced error that does not exist

`sh tools/tsdiff.sh 0496f2d` on merged `main`:

```
baseline 0496f2d: 213 distinct errors; working tree: 214
--- introduced by the working tree ---
src/scenes/CutsceneScene.ts: error TS2339: Property 'time' does not exist on type 'CutsceneScene'.
```

**It is a false positive, and CI proves it:** `typecheck` on this exact commit is
green. The line is `CutsceneScene.ts:171`, `this.time.delayedCall(...)`, and `this.time`
is new in that file — `git show 0496f2d:src/scenes/CutsceneScene.ts | grep this\.time`
returns nothing. `time` is a public `Phaser.Time.Clock` on `Phaser.Scene`; with
`node_modules` present it resolves, and without them the base class is unresolved so
every inherited member is unknown.

**`CLAUDE.md` documents tsdiff's blindness in one direction only** — that it cannot
see an error which needs real Phaser types, the `TS2445: Property 'anims' is protected`
case from `reports/2026-09-10-the-null-frame.md`. This is the opposite direction and it
is not written down anywhere: **the first use of an inherited Phaser member in a file
that did not use one before adds a local-only error, and tsdiff reports it as
introduced.**

Both directions have the same root cause and the same remedy, so tsdiff is not broken
and does not need changing. What needs stating is the reading rule, which is now in
`claude/context.md`: **check whether a new red line names a `Phaser.Scene` member
before treating it as a regression, and never change code to silence one.** Doing so
here would have meant deleting a working `delayedCall` to satisfy a typechecker that
cannot see the class it inherits from.

The error count is unchanged in every other respect: 213 of the 214 are the known
`phaser` resolve cascade, on both sides.

### The recorded branch behind-counts could not have come from the documented command

`claude/context.md` carried **128 behind** for all three unmerged branches, re-measured
on 2026-09-14 and presented as the correction to an earlier wrong figure of 102. After
this merge the same command reads **120**:

| branch | ahead | behind |
|---|---|---|
| `claude/deployment-status-review-a661d6` | 326 | 120 |
| `claude/github-pages-deploy-trigger-x8b598` | 294 | 120 |
| `claude/phaser-4-migration-spike-hage91` | 471 | 120 |

**A behind-count cannot fall while `main` gains ten commits.** Run
`git rev-list --count origin/claude/deployment-status-review-a661d6..<tip>` at each tip
in turn and it answers 110 at `6100c78`, 112 at `ffea4aa`, 120 at `3f1a805` — monotone,
as it must be, and never 128. So whatever produced 128 was not
`git rev-list --count origin/claude/<branch>..main`, which is the command the file
names. The three ahead-counts reproduce exactly.

This is not worth chasing further; it is worth recording, because it is the second
independent reason that table says re-measure rather than quote. It is now the fourth
time a branch figure in `context.md` has been found wrong.

## What was NOT checked

**Nothing was re-verified about the fight itself.** No `vlaude`, `titlecard` or
`screens` run was made here. Every frame-level claim — that Vlaude berths and cannot be
targeted, that the float is invulnerable for every frame, that the defeat never paints
frame 7, that the white wash is really white, that the padlock is drawn — rests on the
88 + 20 assertions recorded in the branch's own report, not on anything measured in
this session.

**No soak was re-run.** 40.6% is the branch's figure and carries the branch's caveat.

**The live site was not fetched.** The sandbox gets 403 from the egress proxy to
github.io, so the final 200 has to come from a browser. What is proved here is that
`deploy / build` and `deploy / deploy` both ran and succeeded and that the artifact is
the expected size.

**No branch was deleted.** Four are now fully contained in `main` and that was not
asked for.

## Where this leaves the repository

**DONE:** the merge, the deploy, `claude/context.md`'s three merge-only lines, and the
two re-measurements above. `CLAUDE.md` needed nothing — the branch had already done it.

**IN FLIGHT:** nothing. Working tree clean, `main` green and deployed.

**CLOSED BY THIS MERGE:** the open item every report since 2026-09-14 has carried at
the top — *the Vlaude fight is rules without a scene*. All eight pieces of
`reports/2026-09-14-level-10.md`'s build order are on `main`.

**OPEN — the biggest one, and it is now about the simulator, not the level:**

1. **The soak fires three of the six powers and provably cannot express the other
   three.** Build lock (no lock state in `BuildSystem`, only `occupied`), generate wall
   (the sim's hero is a fixed point at `totalLength * 0.5` and never moves) and
   generate weapon (no tower health). So **40.6% is measured against a board easier
   than the one the player gets** and is still not a peer of levels 1–9's numbers.
   Teaching the runner those three powers is a change to `tools/soak/`, not to level
   10, and it is the only way the other three ever reach a win rate.
   `enemies.json`'s `_health` note and `SOAK-REPORT.md` both say so in those words.

**OPEN — carried forward from `reports/2026-09-14-merge-level-10.md`, none addressed
here:**

2. **Level 8's east mouth is 88% of the lives lost**, front-loaded — 64% in waves 4
   and 5, same cause. A wave-table pass, not a geometry one.
3. **The CEO's drones skip the review beam**, 66% of them, being summoned past it.
   Whether a summoned child inherits its parent's review is a design question nobody
   has been asked.
4. **`officeDrone` is the only enemy whose reached/reviewed counts disagree.**
5. **Pad counts spread 3.1x** — 7 at level 1, 22 at level 7, 12 at level 10. Boss
   health is measured per board so this is consistent rather than wrong, but the 14–15
   habit is clearly not a convention and is worth either adopting or abandoning out
   loud.
6. **Twenty canvas-vs-ink content boxes**, worst `icon-firerate` at 34.8% small. Note
   that `context.md` quotes `measure_art.py` ending `148 entries checked` while
   `CLAUDE.md` says `art.json` declares 186 image paths — those count different things
   (box-carrying entries against all paths) and neither is wrong, but a session
   comparing them will think one is. None of the twenty is level 10's.
7. **Cake tiers are probably too generous**, and the verdict line and the 2-cake tier
   disagree at exactly half: a run finishing 10 of 20 gets two cakes under the words
   "Barely standing."

**OPEN — repository hygiene:**

8. **Six unmerged remote branches remain, and four of them are dead weight.**
   `claude/vlaude-fight-scene-jrb368` joins `level-8-soft-lock-9bmho0`,
   `level-9-geometry-uac8ax` and `level-10-assets-2kqch4` as fully contained in `main`
   and safe to delete — `main` IS `jrb368`'s head, 0 ahead and 0 behind. The other
   three are the long-stale ones in the table above; none is fast-forwardable and none
   should be merged on those numbers alone. `hage91` has answered 403 twice to a ref
   delete.
9. **`SOAK-REPORT.md`'s Cory-pinned comparison table still stops at level 8.** Levels 9
   and 10 have published figures but no row in that particular table. Cosmetic, and
   named here so it is not re-derived as a finding — this is the second report to carry
   it.
10. **The asset-sweep standing fact is discharged for every level and stays that way**
    — no branch is holding art `main` cannot see, and the two route-gate props in
    `art-source/level10/` are deliberately unconverted. It does not retire; it applies
    to the next upload.
