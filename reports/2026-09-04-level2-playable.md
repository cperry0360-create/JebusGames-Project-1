# Level 2: loadable, reachable, and not yet winnable

Level 2 now loads, runs, and can be chosen from the title screen once a run has
been cleared. Level 1 is unchanged, and that is measured rather than asserted.

One thing the task did not ask about turned up and matters more than anything
it did ask about: **level 2 cannot currently be won.** Details below; nothing
was retuned, because the fix is a design call.

## Commits covered

| commit | what | CI |
| --- | --- | --- |
| `278152f` | merge of PR #2 — the level 2 map, checker and tests | checks/build/deploy success, run [33928334166](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33928334166) |
| `76041d1` | measure level 2's lane; pin both lanes with a test | covered by the run below |
| `68a3fdb` | the level-aware refactor | covered by the run below |
| `aad8518` | unlock gating and the level select | checks/build/deploy success, run [33929450637](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33929450637) |

The three commits were pushed together, so GitHub built the head. `76041d1`
and `68a3fdb` were not built individually; both were run locally under
`npm test` and `tools/tsdiff.sh` at the moment they were made, and the head
that contains them is green including `npx tsc --noEmit` against the real
Phaser typings.

Final state: **655 tests pass, 0 fail.** No new type errors. Deployed.

## 1. The plate is registered

Already done inside PR #2, which is why there is no commit for it here:
`art.json` carries `map.level2 → map-level2` and `files.map-level2 →
maps/map_level2.webp`, in level 1's two-part shape. `ArtLoader.queueArt` loads
every key in `files`, so the plate was already being preloaded and no boot
change was needed.

## 2. The lane is 1955.3, not 1916.7

Summing segment lengths over the waypoints:

| level | waypoints | measured | previously recorded |
| --- | --- | --- | --- |
| 1 | 43 | 1976.8812 → **1976.9** | 1976.9 ✓ |
| 2 | 49 | 1955.2514 → **1955.3** | 1916.7 ✗ |

The method reproduces level 1's recorded figure to the decimal, which is what
makes the level 2 number trustworthy rather than merely different. The given
1916.7 was short by 38.6 px (2.0%).

**No wave spacing changed.** The correction moves the gap between the two lanes
from 3.0% to **1.1%**, so it cuts *toward* the conclusion `levels.json` already
drew — the levels walk close enough that level 2 keeping level 1's intervals is
honest. The drift test that guards that conclusion passes with more room than
before, not less. Only the constant and the `_lane` note changed.

The real defect was that nothing compared the constant to the geometry, which
is how a wrong number sat there unnoticed. `tests/levels.test.ts` now
recomputes both lanes from their own map files. Reverting `levels.json` to
1916.7 fails it with `level2 records laneLengthPx 1916.7 but its waypoints walk
1955.3` — verified, not assumed.

## 3. The refactor

`src/systems/Levels.ts` is new: a level id in, that level's map and wave table
out. Every level's JSON is imported statically so Vite bundles it and a missing
file is a build error rather than a 404 mid-run; the module is Phaser-free so
tests read it directly. `GameScene` holds one `this.level`, set on the first
line of `create()`.

### Level 1 is unchanged, measured

The soak simulator was run at `278152f` (pre-refactor) and at `aad8518`, same
120 seeds, comparing outcome, waves reached, lives, kills, peanuts earned and
Banner points:

```
IDENTICAL: all 120 level-1 runs match the pre-refactor build exactly
```

Level 1 declares an entrance, an exit, signs and Bailey spots, so it takes the
same branch everywhere and the gateway distances come out of the same fields as
before. The identity above is the evidence.

### Optional scenery

`signs`, `baileySpots`, `entrance` and `exit` are optional on `MapDef` now.
Level 2 has none of them by design — its lane runs off both edges. Defaults:

- **no entrance** → mouth at distance 0, zero-length fade, `startScale` 1. An
  enemy is at full opacity and full size from its first frame instead of
  invisible forever waiting for a mouth it never reaches.
- **no exit** → gate and vanish points both at the lane's end, so `applyVanish`
  returns early and never fades anything, and the enemy leaks where it walks
  off the plate.
- **no signs / no baileySpots** → not built. The tap path and the per-frame
  update tolerate their absence.

A test asserts level 1 still has all four and level 2 has none, so a level 1
map that silently loses one is caught rather than quietly skipped.

Also fixed a latent bug the single-level assumption hid: `createArchOccluders`
read `ART.map.level1` **by name**, which on any other level would have cropped
a piece of the village out of the wrong board.

## 4. Unlock gating and the level select

`runsClearedToUnlock` recorded an intention and gated nothing, because there
was no way to choose a level at all.

The title screen draws a level row when there is more than one level. Locked
levels are drawn, disabled, with what they cost written under the row. The
buttons below shift down 30px when the row is shown and not at all when it is
not, so a single-level build's layout is untouched.

**The gate is not the greyed button.** `START RUN` re-checks the chosen level
against the cleared-run count and falls back to the default if it does not
hold, because a disabled plate is a drawing and a stale selection would walk
straight past it.

The save writes `this.level.id` rather than the literal `'level1'`, and resume
reads it back. An id no longer in `levels.json` resolves to the default rather
than failing the resume — a save can name a level that was renamed or removed,
and resuming onto the wrong map is recoverable where throwing on the first
frame is not.

## The finding: level 2 cannot be won

Soaking both levels, 60 seeds each, with a scripted player that only builds
towers whose range reaches the road:

| | level 1 waves | level 2 waves |
| --- | --- | --- |
| **level 1 map** | **47/60 won** | 15/60 |
| **level 2 map** | 20/60 | **0/60 won** |

Both factors are independently harder and together they are fatal. Two causes,
both measured:

**The pads are too far from the road.** Distance from each build pad to the
nearest point on the lane:

| level | pads | range |
| --- | --- | --- |
| 1 | 7 | 87–119 |
| 2 | 15 | 117–185 |

Every tower out-ranges every level 1 pad — 35 of 35 combinations reach. On
level 2:

| tower | range | pads it can reach the road from |
| --- | --- | --- |
| escalation | 215 | 15/15 |
| writeoff | 180 | 12/15 |
| withholding | 150 | 8/15 |
| extension | 142 | 6/15 |
| rounding | 132 | 6/15 |

Nine of fifteen pads are unusable by the two shortest-ranged towers. A tower
built there never fires.

**The waves carry more health.** 29,945 against level 1's 25,274 — 18.5% more,
with the boss wave at 7,012 against 5,316 (+32%).

So level 2 asks for 18.5% more damage on a board where most towers reach less.

This was not retuned. Pad positions are traced from the painted overlay, so
moving them is an art change and `tools/check_level2.py` would then disagree
with the plate; and whether level 2 *should* be this much harder is a design
decision, not a bug to be quietly patched. **It needs a decision.** The
plausible levers, cheapest first: cut level 2's wave health toward level 1's;
move the far rings inward in the overlay and re-derive; or raise tower ranges,
which changes level 1 too.

One thing that came free: the soak's scripted player used to pick a random
affordable tower per pad, which on level 1 never mattered because everything
reaches. It now refuses a tower that cannot reach the road, which is what a
player does. Level 1's win rate is 47/60 before and after that change.

## What was NOT checked

- **Nothing was seen.** `tools/harness` needs a Phaser dist and the npm
  registry 403s here, so `realboot` — the "RUN THIS BEFORE ANY PUSH" scenario —
  did not run. Level 2 has not been rendered once. Everything above about it is
  simulation and arithmetic. The plate could be misaligned, the hero could be
  standing somewhere absurd, and none of these tests would know.
- The soak covers the **rule layer only**. Enemy, Tower, Hero and Projectile
  extend Phaser objects and are not in it, so the emergence and vanish
  defaults for a level with no arch were reasoned from `Gateway.ts` and
  `Enemy.ts` and are **not** exercised by any test.
- The level select was not rendered. Its layout — the 30px shift, the row at
  y=300, the hint at y+46 — is arithmetic against the 1280x720 design box, not
  a screenshot.
- No mobile or narrow-viewport check of the new title row.
- The pad-to-lane distances are point-to-segment against the waypoint
  polyline, not against the painted road's actual edge.

## Where this leaves the repository

- **`main` is green and deployed** at `aad8518`; working tree clean.
- **Blocked on a decision — level 2 is unwinnable (0/60).** The evidence is
  above. Nothing was retuned, and level 2 is now reachable by any player who
  clears a run, so this is live-facing: someone who clears level 1 can select
  Head Office and cannot beat it. If that is not acceptable as-is, the fastest
  mitigation is to raise `runsClearedToUnlock` or drop level 2 from
  `levels.json` until it is tuned.
- **Waiting on a look — nothing about level 2 has been seen.** A Phaser dist in
  the environment would let `tools/harness/run.sh realboot` confirm it renders.
  Until then "level 2 loads and runs" means the rule layer runs it.
- **Carried forward from `2026-09-04-level2-gate-check.md`:** the pad tap-target
  overlap is **resolved** — the merged overlay has 15 rings and
  `check_level2.py` reports the closest pair at 72.1 canvas px, clear of the
  68 px two-tap-radius bound, with no warnings.
- **Carried forward from `2026-09-04-demons-level2-and-run-save.md`, still
  open:** the Devil's height (37.0 literal vs 70.0); level 2's corporate-hell
  wave names against level 1's fantasy; the Underling and the Devil carrying
  2.3x and 2.6x their source art.
