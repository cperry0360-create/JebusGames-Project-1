# Merging level 9 to main, and the three lines it made stale

The ask was one line: `git checkout main && git merge --ff-only
claude/level-9-geometry-uac8ax && git push origin main`. It fast-forwarded, CI
is green on `main`, **the deploy job ran and Pages republished** — so level 9 is
live rather than merely merged. The one piece of work beyond the command is
`claude/context.md`, which the branch deliberately left alone and addressed to
whoever merged it.

## Commits

| commit | what | CI |
|---|---|---|
| `6c309b4` | the branch head, fast-forwarded onto `main` (no merge commit) | **run 360 green — typecheck, test, changes, `deploy / build`, `deploy / deploy` all success** |
| `83efa67` | `claude/context.md` reconciled, and this report | **run 361 green — typecheck, test, changes; `deploy` skipped, which is the `changes` gate working on a markdown-only push, not a failed deploy** |
| _this commit_ | this table's own CI row | markdown only, so the same shape as run 361: three green jobs and `deploy` skipped |

## The merge

`git merge-base origin/main origin/claude/level-9-geometry-uac8ax` returned
`692a1fc`, which **was** `main`'s head — so the branch was 15 ahead and 0
behind, and `--ff-only` was the right verb rather than a hopeful one. `main`
moved `692a1fc..6c309b4` without a merge commit.

**93 files, +10,824 / -505.** What landed:

- **Level 9, "AI Override: Part 1"** — `level9.json`, `map_level9.json`,
  `waves.level9.json`, 15 build pads, four mini bosses rather than one (hatGtt,
  cancer, noPilot, perplexed), soaking **191/480 = 40%**, inside the 35-45% band.
- **Level 8 re-topologised** — two entrances and one exit, so the review gate
  measures 50.5% of enemies instead of 2.6%. Re-soaked to **200/480 = 42%**; it
  published at 41% before this.
- **`src/systems/Markers.ts` and `src/systems/Regen.ts`**, spawn/exit badges
  placed from lane geometry, the HUD shrunk to its corners, the camera unpinned.
- **`CLAUDE.md`** — the branch corrected "Eight built levels" to nine and cut
  level 9 out of the "live edge" paragraph, in the same commit that made the old
  text false. That is the right ordering and it is worth naming, because the
  paragraph it edited described level 9's art as unwired while the branch
  consuming that art was unmerged — the exact shape of the `eda11dc` sweep the
  asset standing fact records.

### The sweep hazard did not fire, and here is why it could not

The standing fact says to check every open branch's `art.json` before deleting
an unreferenced asset, and to restore swept files *before* merging the branch
that needs them. Neither applied here: the merge-base was `main`'s own head, so
the branch already contained every sweep `main` had done, and `tests/assets.test.ts`
— the net that names missing keys — was green on the branch head before the
merge and green on `main` after it. There was nothing to restore.

## Verification

| check | result |
|---|---|
| `npm test` locally on merged `main` | **1099 passing, 0 failing** |
| run 359, branch head `6c309b4` | green: typecheck, test, changes; deploy skipped (branch) |
| run 360, `main` at `6c309b4` | green: typecheck, test, changes, `deploy / build`, `deploy / deploy` |
| Pages | `actions/deploy-pages@v4` success at 12:36:56Z |

`npm install` still 403s in the sandbox, so there is no `node_modules` and no
local `tsc` — CI's `npx tsc --noEmit` at 12:35:50Z is the typecheck of record.
The suite ran without `node_modules` because no test imports Phaser, which is
the same fact that makes 1099 passing say nothing about a rendered frame.

**NOT checked: anything visual.** No harness run was made for this merge. Every
frame-level claim about level 9, the markers and the HUD rests on the harness
runs recorded in the branch's own reports (`2026-09-13-level-9.md`,
`2026-09-13-spawn-exit-markers.md`, `2026-09-13-hud-shrink-and-pad-overlap.md`,
`2026-09-13-level-8-retopology.md`), not on anything re-measured here. This
session merged and deployed; it did not re-audit.

## `claude/context.md`: open item 6, closed

`reports/2026-09-13-level-8-retopology.md` left an open item addressed to
whoever merged the branch: three places in `claude/context.md` that were true of
`main` and false the moment the branch landed. The branch did not edit them
because the file is a living record that describes `main`. It describes a
different `main` now, so:

| was | is | checked against |
|---|---|---|
| pads `7, 15, 15, 14, 14, 18, 22, 19` for levels 1-8 | `…, 15` for levels 1-9 | `len(buildSpots)` over all nine map JSONs |
| level 8 published at 41% | 42%, with the 41% named as pre-re-topology | `SOAK-REPORT.md` |
| "Eight levels are built and playable"; levels 9 and 10 both unwired; level 9's geometry "on a branch" | nine built, level 9 shipped 2026-09-14, level 10 alone unwired | `levels.json` — `level9` "AI Override: Part 1", `plannedLevels` 10 |
| `claude/level-9-geometry-uac8ax`: "15 ahead, 0 behind — live work, not yet merged" | merged, fully contained, safe to delete | `git log origin/claude/…..origin/main` empty both ways |
| "1088 tests passing" (twice) | 1099 | the run above |

The branch-table paragraph that singled out `uac8ax` as "the one that matters"
now says the asset hazard is **discharged for level 9 and still live for level
10** — level 10's art sits in `art-source/` with nothing on `main` referencing
it, which is precisely the state that invites the sweep.

## Where this leaves the repository

**DONE:** the merge, the deploy, and open item 6 of the level 8 re-topology
report.

**IN FLIGHT:** nothing. Working tree clean, `main` green and deployed.

**OPEN — carried forward from the branch's reports, none of them addressed here:**

1. **Level 8's east mouth is 88% of the lives lost.** Shorter road, thinner
   cover. The wave table was held constant so the re-topology measured one
   thing; rebalancing it is a wave-table pass, not a geometry one.
2. **Level 8's losses are front-loaded** — 64% in waves 4 and 5, same cause as 1.
3. **The CEO's drones skip the review beam**, 66% of them, being summoned past
   it. Whether a summoned child inherits its parent's review is a design
   question nobody has been asked.
4. **`officeDrone` is the only enemy whose reached/reviewed counts disagree**;
   the soak now prints the denominator that would surface it again.
5. **Pad counts spread 3x** — 7 at level 1, 22 at level 7, 15 at level 9. Boss
   health is measured per board, so the 14-15 habit is worth either adopting as
   a rule or abandoning out loud.

**OPEN — repository hygiene, unchanged by this merge:**

6. **Four unmerged remote branches remain**, and two of them are 102 behind:
   `deployment-status-review-a661d6` (7 ahead, uninspected since 05 September),
   `github-pages-deploy-trigger-x8b598` (294 ahead), `phaser-4-migration-spike-hage91`
   (144 ahead, already salvaged onto `main`, and GitHub answered 403 twice to
   deleting the ref). `level-8-soft-lock-9bmho0` and now
   `level-9-geometry-uac8ax` are both fully contained in `main` and safe to
   delete. **No branch was deleted here** — that was not asked for.
7. **Level 10 is the only live edge left.** Its art is uploaded and unreferenced,
   which is the sweep hazard's favourite condition. Check open branches'
   `art.json` before deleting any of it.
8. **`ui` and `buildall` harness scenarios are red and undiagnosed**, both
   pre-existing, both recorded in `2026-09-13`'s CLAUDE.md reconciliation.
