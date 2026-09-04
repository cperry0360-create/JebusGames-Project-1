# Session handoff: level 2 made playable, and one decision left open

Written for whoever picks this up next. It is a status report on a single
session, not a new piece of work: no code changed while writing it.

## Commits covered

| commit | what | CI |
| --- | --- | --- |
| `278152f` | merge of PR #2 — level 2's map, checker and tests | checks/build/deploy success, run [33928334166](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33928334166) |
| `76041d1` | lane measured: 1955.3, not 1916.7 | covered by run 33929450637 |
| `68a3fdb` | the level-aware refactor | covered by run 33929450637 |
| `aad8518` | unlock gating and the level select | checks/build/deploy success, run [33929450637](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33929450637) |
| `6a99048` | the level 2 report | checks/build/deploy success, run [33929598742](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33929598742) |
| `f7fc205` | closed that report's CI table | checks/build/deploy success, run [33929688002](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33929688002) |
| `b02ed07` `b6c5749` | the earlier gate-check report | green; see `2026-09-04-level2-gate-check.md` |
| `5f886c1` | this handoff | checks/build/deploy success, run [33930057705](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33930057705) |
| `9617846` | closed this handoff's CI table | checks/build/deploy success, run [33930166599](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33930166599) |

`76041d1` and `68a3fdb` were pushed together with `aad8518`, so GitHub built
the head rather than each one. Both were run locally under `npm test` and
`tools/tsdiff.sh` when made, and the head containing them is green including
`npx tsc --noEmit` against the real Phaser typings.

`main` is at `9617846`, green, deployed, working tree clean. Every commit in
the table above is green on all three jobs.

## What was asked, and what happened

The task was gated: confirm `src/data/map_level2.json` is on `main`, then do
four things. **The gate failed** — PR #2 was still open and the file had never
existed on any ref. That was reported (`2026-09-04-level2-gate-check.md`) and
the session stopped. On "Go", PR #2 was merged and the four steps ran.

1. **Register the plate** — already done inside PR #2 (`map.level2 →
   map-level2` plus the `files` entry). `ArtLoader.queueArt` loads every key in
   `files`, so the plate was already preloading. No commit.
2. **Re-measure the lane** — it is **1955.3**, not the 1916.7 that arrived with
   the plate. The method reproduces level 1's 1976.9 to the decimal, which is
   what makes the new figure trustworthy. **No wave spacing changed**: the gap
   between lanes goes 3.0% → 1.1%, cutting toward the "close enough to copy"
   conclusion `levels.json` already drew.
3. **The refactor** — `src/systems/Levels.ts` resolves a level id to its map
   and wave table; `GameScene` holds one `this.level` set on the first line of
   `create()`.
4. **Gating and select** — a level row on the title screen, with the real gate
   in `start()` rather than in the greyed button.

## Things worth knowing before touching this code

**`Levels.ts` is the only place a level's data is named.** Adding a level means
a row in `levels.json` AND a static import plus a table entry in `Levels.ts`.
A test asserts every registry row is buildable, so forgetting the second half
fails rather than 404s at runtime.

**Its JSON imports carry `with { type: 'json' }`.** That is not decoration —
node's test runner refuses a bare JSON import, and without the attribute no
test can import the module. `Music.ts` and `AbilityText.ts` carry them for the
same reason. Vite honours them.

**Four `MapDef` fields are optional now**: `signs`, `baileySpots`, `entrance`,
`exit`. Level 1 has all four, level 2 has none. The defaults for an absent
end of the lane are in `GameScene.create`:
- no `entrance` → mouth at distance 0, `fadeMs` 0, `startScale` 1, so an enemy
  is at full opacity from its first frame instead of invisible forever.
- no `exit` → gate and vanish both at the lane's end, so `applyVanish` returns
  early and the enemy leaks where it walks off the plate.

**`this.sign` and `this.bailey` can be undefined.** Guard them.

**`GameScene.create` reads `resumeFrom?.level ?? runState().levelId`.** A
resumed run uses the level in its save; a fresh one uses what the title screen
picked. An unknown id resolves to the default rather than throwing —
`Levels.resolveLevelId`.

## The environment, which is unusual

- **`npm install` 403s.** There is no `node_modules`. That is expected and
  documented in CLAUDE.md.
- **`npm test` works anyway** — `node --test` strips types natively and the
  tests do not need Phaser. 655 tests, ~3s. Use it constantly.
- **`tsc` does not work** — every file importing `phaser` loses its base class
  and ~176 cascade errors fall out. Use `sh tools/tsdiff.sh <green-commit>`,
  which diffs against a commit CI accepted. It caught one real error this
  session (an unused `MapDef` import).
- **`tools/tsdiff.sh` has a blind spot it names itself**: a file NEW since the
  baseline reports only TS2307, so its Phaser member access is unchecked
  locally. `Levels.ts` was new. CI's real `tsc` is what closed that.
- **The browser harness cannot run here.** `tools/harness` needs a Phaser dist
  and there is none on disk and no registry. `realboot` — the README's "RUN
  THIS BEFORE ANY PUSH" — did not run. **Nothing about level 2 has been seen.**
- **`tools/soak` DOES run** and is the best verification available:
  `node --experimental-strip-types -e "import {simulate} from './tools/soak/Sim.ts'; ..."`.
  `simulate(seed, mode, levelId)` takes a level id as of this session.

## The finding: level 2 cannot be won

60 seeds per cell, scripted player that only builds towers whose range reaches
the road:

| | level 1 waves | level 2 waves |
| --- | --- | --- |
| **level 1 map** | **47/60 won** | 15/60 |
| **level 2 map** | 20/60 | **0/60 won** |

Two independent causes:

**Pads too far from the road.** Level 1's pads sit 87–119 world px from the
lane; level 2's sit 117–185. Every tower reaches every level 1 pad (35 of 35
combinations). On level 2: `escalation` (215) reaches from 15/15, `writeoff`
(180) 12/15, `withholding` (150) 8/15, `extension` (142) 6/15, `rounding`
(132) 6/15. A tower on a pad it cannot shoot from never fires.

**More health.** 29,945 against level 1's 25,274 — 18.5% more, boss wave 7,012
against 5,316 (+32%).

**This was deliberately not fixed.** Pad positions are traced from the painted
overlay, so moving them is an art change that `tools/check_level2.py` would
then reject against the plate; and whether level 2 should be this much harder
is a design decision, not a bug. Levers, cheapest first: cut level 2's wave
health toward level 1's; move the far rings inward in the overlay and
re-derive with `python3 tools/check_level2.py --emit`; or raise tower ranges,
which changes level 1 too.

**It is live-facing.** Level 2 is now reachable by anyone who clears a run, and
they cannot beat it. `runsClearedToUnlock` in `levels.json` is a one-line
stopgap if it should be out of reach.

## Level 1 is unchanged, and that is measured

The soak was run at `278152f` (pre-refactor) and at `aad8518`, same 120 seeds,
comparing outcome, waves reached, lives, kills, peanuts earned and Banner
points:

```
IDENTICAL: all 120 level-1 runs match the pre-refactor build exactly
```

That is the evidence for "level 1 unchanged", not the test count.

## Heads-up: PR #3 now conflicts

PR #3 ("Remove the Bailey peeking easter egg") is open and **no longer merges
cleanly**. `git merge-tree origin/main origin/claude/scatter-props-tree-line-g0im1u`
conflicts in `src/scenes/GameScene.ts` and `src/types.ts` — the two files this
session edited in the Bailey region, to make her optional.

The resolution should be straightforward and in PR #3's favour: it deletes
Bailey outright, so take its deletions and also drop the `baileySpots?` field
added to `MapDef` and the `map.baileySpots` branch and `this.bailey?.update`
guard added to `GameScene`. Its base is still `c64737a`, many commits behind.

## What was NOT checked

- **Level 2 has never been rendered.** No harness, no screenshot, no Phaser.
  Everything asserted about it is simulation and arithmetic. The plate could be
  misaligned, the hero could be standing somewhere absurd, and nothing here
  would know.
- The soak covers the **rule layer only**. Enemy, Tower, Hero and Projectile
  extend Phaser objects and are not in it, so the emergence and vanish defaults
  for an archless level were reasoned from `Gateway.ts` and `Enemy.ts` and are
  **not exercised by any test**.
- The level select was never rendered. Its layout — the 30px shift, the row at
  y=300 — is arithmetic against the 1280x720 design box.
- No mobile or narrow-viewport check of the new title row.
- Pad-to-lane distances are point-to-segment against the waypoint polyline, not
  against the painted road's edge.

## Where this leaves the repository

- **`main` green and deployed** at `9617846`; tree clean; nothing in flight.
- **Blocked on a decision — level 2 is unwinnable.** Numbers above. Nothing was
  retuned on purpose.
- **Waiting on a look — nothing about level 2 has been seen.** A Phaser dist in
  the environment would let `tools/harness/run.sh realboot` confirm it renders.
- **PR #3 conflicts** in `GameScene.ts` and `types.ts`, caused by this
  session's Bailey change. Resolution sketched above.
- **Resolved this session:** the level 2 pad tap-target overlap flagged in
  `2026-09-04-level2-gate-check.md`. The merged overlay has 15 rings and
  `check_level2.py` reports the closest pair at 72.1 canvas px, clear of the
  68 px two-tap-radius floor, no warnings.
- **Carried forward from `2026-09-04-demons-level2-and-run-save.md`, still
  open:** the Devil's height (37.0 literal vs 70.0); level 2's corporate-hell
  wave names against level 1's fantasy; the Underling and the Devil carrying
  2.3x and 2.6x their source art.
