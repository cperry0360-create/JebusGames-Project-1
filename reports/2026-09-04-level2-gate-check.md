# Level 2 gate check: the map is not on main

**Status: blocked before step 1. No code was changed.**

The level 2 playable-ness task was gated on `src/data/map_level2.json` being on
`main`. It is not. PR #2 has not merged, so the task stopped at the gate as
instructed and nothing in this report changed a line of game code.

## Commits covered

| commit | what | CI |
| --- | --- | --- |
| _this report only_ | `reports/2026-09-04-level2-gate-check.md` | see below |

No source, data or asset file was touched.

## The gate

`src/data/map_level2.json` is absent from `origin/main` (HEAD `84909c5`).

```
$ git ls-tree --name-only origin/main src/data/
... abilities.json art.json ... levels.json map.json ... waves.level2.json ...
# no map_level2.json
```

It is not merely missing from `main` — it has never existed on any ref in this
clone. `tools/check_level2.py` likewise:

```
$ git log --all --oneline -- src/data/map_level2.json   # empty
$ git log --all --oneline -- tools/check_level2.py      # empty
```

`main`'s own HEAD commit `84909c5` ("Correct what \"level 2 is set up\" actually
means") says the same thing in prose: *"There is no map geometry for level 2 at
all... It is the real blocker, not the scene refactor."*

## Why: PR #2 is open

| field | value |
| --- | --- |
| PR | #2 — "Level 2: trace the volcanic plate off its painted overlay" |
| state | **open**, not merged, not draft |
| head | `d72a435` on `claude/level2-volcanic-map-recreation-3szo07` |
| base | `main` at `c64737a` |
| CI | **green** — both `checks` runs succeeded 2026-09-04T11:19Z |
| size | 8 files, +1346 / -1 |

So the work exists and passes CI. It simply has not been merged.

### It still merges cleanly

`main` has advanced 5 commits past PR #2's base (`c64737a` → `84909c5`),
touching `src/data/art.json` and adding `tools/level2_path_overlay*.png` — both
of which PR #2 also touches, so a conflict was plausible. There is none:

```
$ git merge-tree --write-tree origin/main origin/claude/level2-volcanic-map-recreation-3szo07
4e69c6ecfe1c4e981ab8402a0015f827428a2de8   # exit 0, no conflict
```

Merging is a clean fast path, not a rebase exercise.

## The map file is what you described

Read out of PR #2's head, every value in the task description checks out:

| claim | in PR #2 | ✓ |
| --- | --- | --- |
| 49 waypoints | 49 | ✓ |
| 15 build pads | 15 | ✓ |
| `heroStart` [611.0, 633.3] | `[611.0, 633.3]` | ✓ |
| `roadWidth` 65.8 | `65.8` | ✓ |
| no entrance / exit / signs | no such keys present | ✓ |

The last row confirms the design note in the task: level 2's lane runs off both
edges, so the optional-features refactor is genuinely needed rather than
hypothetical.

## Two things found early, for when the gate opens

**Step 1 is already done inside PR #2.** The merged tree's `art.json` reads:

```json
"map": { "level1": "map-level1", "level2": "map-level2" }
"files": { "map-level1": "...", "map-level2": "maps/map_level2.webp" }
```

That is exactly the registration step 1 asked for, in level 1's two-part
manifest shape. It should not be done twice.

**Step 2's suspicion is correct — 1916.7 is wrong.** Summing segment lengths
over the waypoints, the same method that reproduces level 1's recorded figure
exactly:

| level | waypoints | measured | recorded in `levels.json` |
| --- | --- | --- | --- |
| 1 | 43 | **1976.9** | 1976.9 ✓ |
| 2 | 49 | **1955.3** | 1916.7 ✗ |

The method is validated by level 1 landing on its recorded value to the decimal.
Level 2's real lane is **1955.3**, not 1916.7 — the given figure is short by
38.6 px (2.0%).

The consequence is the opposite of what `levels.json` currently records. Its
`_lane` note says the two levels "differ by 3.0%, which is not enough to
retune". The true gap is **1.1%** (1976.9 → 1955.3), so the conclusion holds
and in fact holds more comfortably — but the number justifying it is wrong and
should be corrected to 1955.3 regardless. On this evidence step 2 likely needs
no spacing change to `waves.level2.json`, only the corrected constant. That is
a preliminary read, not a decision: it was measured from an unmerged branch.

## One blocker PR #2 raises against itself

PR #2's own description flags an unresolved defect and says it "has to be
resolved before anyone plays this map": the overlay's rings were spaced by the
~15 world px circle drawn on the plate, not the 34 px tap radius the game gives
a node. Pads 2–5 (59.0 px apart) and 5–7 (59.6 px) are inside two tap radii, so
their tap targets **overlap**. Level 1's closest pair is 186.3 px.

The PR states this is fixed by moving a ring in the overlay — an art change —
not by editing the JSON. So merging PR #2 unblocks the refactor, but level 2
would still have two unpickable-by-touch pad pairs. Worth deciding whether that
lands before or after the scene work; it does not block the refactor itself.

## What was NOT checked

- Nothing was run against level 2 in the app — there is no scene that loads it.
- `tools/check_level2.py` was not executed; it lives only on the PR branch, and
  its overlay decode needs the 1.9 MB PNG.
- The 1955.3 figure was measured from PR #2's head, not from `main`. It must be
  re-measured after merge before anything is written to `levels.json`.
- No test suite was run; no working-tree change was made to run one against.
- The pad-overlap geometry was taken from PR #2's description, not
  independently re-derived from the overlay.

## Where this leaves the repository

- **`main` is untouched by this session** apart from this report. Working tree
  clean, no source or data edits.
- **Blocked, waiting on you — merge PR #2.** It is open, green, and merges
  cleanly into current `main`. Everything in the four-step task depends on it;
  none of it can start until it lands.
- **Waiting on a decision — the pad tap overlap.** PR #2 calls it must-fix
  before play and locates the fix in the overlay art, not the JSON. It does not
  block the scene refactor, so it can be sequenced either side of it.
- **Carried forward, correct on merge — `levels.json` `laneLengthPx` for level
  2 is 1916.7 and the lane measures 1955.3.** The `_lane` note's "3.0%" is
  likewise wrong; the real gap is 1.1%. Neither changes the "not enough to
  retune" conclusion.
- **Carried forward from `2026-09-04-demons-level2-and-run-save.md`,
  still open:** the Devil's height (37.0 vs 70.0); the corporate-hell wave
  names against level 1's fantasy; the Underling and Devil carrying 2.3x and
  2.6x source art. Untouched here.
- **Still true from that report's items 1 and 4:** nothing in `src/` reads
  `levels.json` or `waves.level2.json`, and `runsClearedToUnlock` enforces
  nothing. Those are steps 3 and 4 of this task and remain not started.
