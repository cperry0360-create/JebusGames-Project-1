# Branching lanes, air/ground targeting, and summons

Three engine features, built in that order, all on `main`. Every one of them is
groundwork for levels 3 and 4 rather than a change to a level that ships today:
levels 1 and 2 were not edited and play identically.

## Commits

| Commit | What | CI |
| --- | --- | --- |
| `d2825b8` | Give the engine branching lanes | ❌ red — asset budget only, see below |
| `7545559` | Give towers something they cannot shoot | (no run of its own; pushed with the next) |
| `885168c` | Let enemies call in help | ❌ red — asset budget only, see below |
| `dbda346` | This report | ❌ red — asset budget only |
| `02f2005` | Prove the fork tower actually damages both branches | ❌ red — asset budget only, run #69 |

All of it is pushed. `origin/main` is `02f2005` and the working tree is clean.

**CI is red on every one of those runs, and it is not these commits.** The only failing test
is `the deploy stays small enough to open on a phone`, and it has been failing
since `c9ea190` — three "Add files via upload" commits that are not mine. The
full accounting is in *Where this leaves the repository* at the bottom, because
it has a consequence: **nothing since `0c3abc1f` has deployed.**

---

## 1. Branching lanes — `d2825b8`

Levels 3 and 4 both need two spawn gates whose lanes merge into one before the
exit. A map was one waypoint list, one `Path`, one route; it is now a lane
network.

### The shape

```
types.ts       LaneDef, MapDef.lanes?, WaveSpawnDef.lane?
Lanes.ts       new — LaneNetwork, followMerges, advance, validateLanes
Path.ts        distanceAtIndex, because a merge names a waypoint INDEX
Enemy.ts       laneDistance for position, distance for progress
WaveSpawner.ts emits { enemy, lane } rather than a bare id
```

A map with no `lanes` resolves to exactly one lane called `main`, built from its
own `waypoints`. **The trunk is not duplicated in `lanes`** — a route's geometry
has one home, so two copies cannot drift. A branch's waypoints END at the join,
and it names the lane and waypoint index to carry on from, so the join is stated
in the target's own terms and moving the branch cannot silently detach it.

### Two distances, and that is the heart of it

`distance` is the total walked and only ever has a step added to it.
`laneDistance` is where the enemy is on the lane it is on *now*, and a merge
rewrites it. Targeting sorts on `distance`, so a transfer cannot make a tower
drop the enemy it was shooting — the merge is not a step and does not touch
progress. On a single-lane map the two are equal at every instant, which is
exactly why level 1 did not move.

Two details that are silent bugs if you get them wrong:

- **Overshoot is carried across a join**, not dropped. A frame long enough to
  cross a whole branch would otherwise lose the distance walked past the join,
  and a low frame rate would hold enemies at merges forever.
- **Only a lane that reaches the exit can leak.** A branch ENDS at its join;
  without the guard an enemy would count as escaped on arriving there, most of
  the way through the level.

Tower range needed **no change at all**. `Targeting` is geometry plus progress,
so a tower sitting in a fork already covers both branches once the enemies on
both are in its candidate list. `tests/lanes.test.ts` pins that rather than
leaving it to be inferred.

### What is tested

`tests/lanes.test.ts`, 13 tests: an enemy from each branch reaching the exit
having walked its own route; route length per branch (deliberately unequal, and
a late merge counting only what is LEFT of the target); progress monotonic
across a transfer at four step sizes including one that crosses a whole branch;
a tower in the fork seeing both lanes and picking the furthest along across
them. Plus the validator — a merge into a lane that does not exist, into itself,
at a waypoint that lane has not got, a duplicate id, two routes to the exit, and
a cycle.

`tools/check_level2.py` gained the same structural validation. It cannot DERIVE
lanes — it finds one cyan stroke and could not say which branch it was — so it
checks the structure and prints the lane table. Level 2 still passes and now
reports `one, main, 49 waypoints (no branches)`.

---

## 2. Air and ground — `7545559`

```
enemies.json   layer?: "ground" | "air"    (absent = ground)
towers.json    targets?: string[]          (absent = ground only)
```

**The two defaults are not symmetrical and that is deliberate.** An enemy that
says nothing is on the ground; a tower that says nothing shoots ground only.
That is the safe direction for each to fail in — a new enemy cannot accidentally
become unhittable, and a new tower cannot accidentally gain air.

There is a third case that matters more than either: `targets === undefined` at
the *call site* means **no filter at all**. That is what the hero, both fighters
and every ability pass, so they hit whatever is in reach exactly as they did
before layers existed. Only towers pass a list.

All five shooting towers got `["ground", "air"]`. `shelter` stays ground-only
because it never fires — it is a support radius, not a weapon.

**No target means no shot and no cooldown.** `Tower.tick` returns *before* it
assigns the cooldown, so a tower that spent a wave looking at a flyer it cannot
touch is ready the instant something walkable arrives, rather than caught
reloading. The test asserts the ordering in the source, not just the behaviour,
because the behaviour is easy to reintroduce backwards.

### The checker rule — `src/systems/AirCover.ts`

The brief asked for a rule that fails a level whose waves contain an air enemy
while no air-capable tower unlocks before that wave. **The draft is what makes
this non-obvious.** Towers are drawn at random from a pool, so "this level
unlocks an air-capable tower" is not a fact about the level, it is a
probability. A rule that passed because a lucky hand *could* include one would
be no rule at all.

So the property checked is the guaranteed one: by the wave an air enemy first
arrives, it must be IMPOSSIBLE to be holding an all-ground hand. With `G`
ground-only towers in the pool and `N` towers in hand, a player can hold nothing
but ground exactly when `G >= N` — so cover is guaranteed when `G < N`.

Both shipped levels pass trivially (they send nothing airborne). The tests build
the failing cases: no air cover in the pool at all, and the subtler one where
cover exists but the draft can still deal a hand without it.

### What did not change

Every existing enemy is on the ground — a test walks all of them — so levels 1
through 3 play identically.

---

## 3. Summons — `885168c`

```
enemies.json   summons?: { enemy, count, interval, cap? }
theDevil       { enemy: "directReport", count: 1, interval: 5, cap: 6 }
```

Data, reusable by any enemy, rather than a mechanic written into one boss.

**A child appears at its parent's own place on its parent's own lane**, with its
parent's progress, and carries on from there. Starting one at the gate would
hand the player a free walk back down the whole board; on a branching map,
putting it on `main` rather than the parent's branch would send it a different
way to the exit than the boss that called it.

**The cap is counted by the scene, not the entity**, because only the scene
knows what is still on the field. It counts children still pointing at THIS
summoner, so two bosses do not share an allowance and a dead one's brood is not
charged against a live one. The first burst waits a full interval, so a boss
does not arrive with a crowd already around it.

**A wave ends when what it SENT is dead.** `checkWaveOver` ignores summons — a
summoner that kept bursting would otherwise hold its wave open for as long as it
could summon. Children outlive their parent and stay attributed to it. Bounty is
untouched: a child is an ordinary enemy of its def in every respect but wave
accounting, so it pays the normal reward.

`dueSummons` asks the game's own `alive` rather than Phaser's `active`. The
typecheck caught the difference, and `alive` turns out to be the right one for a
documented reason — a corpse mid death-animation is still on the display list,
and it must not keep calling in help.

The soak models all of it. That was not optional: the level 2 number below is
the point of the exercise, and a sim that spawned no children would have
reported a fiction.

`tests/summons.test.ts`, 10 tests, covering the four asked for plus the cap
refilling only as children die, two summoners not sharing an allowance, the
first burst waiting, a child inheriting a branch, and the scene and the sim
being held to the same rule by source assertion.

---

## Verification

### Tests

```
npm test        679 tests, 678 pass, 1 fail
```

The one failure is `the deploy stays small enough to open on a phone`
(`tests/content.test.ts:1059`), `assets total 48.6MB, which is a long wait on a
phone`. Verified pre-existing by stashing all of this work and running the suite
again — same failure, same number.

### Typecheck

```
sh tools/tsdiff.sh d2825b8
```

No new type errors. The single line it prints is the pre-existing `TS2740` at
`Tower.ts(378,7)`, whose message changed only because the property list it names
grew (`laneDistance`, then `summonedBy`). Confirmed by stashing and diffing the
message rather than the count.

**A known blind spot, restated:** `tsdiff` only reports `TS2307` for files that
are NEW since the baseline commit, so `Lanes.ts` and `AirCover.ts` had their
Phaser-facing members unchecked. Both are deliberately Phaser-free, which is
what makes that acceptable here.

### Level 1 is unchanged

120 seeded soak runs, byte-identical to the build before each feature — outcome,
waves, lives, kills, peanuts and Banner points. Run across all three commits,
not just the last.

### The soak grid, 60 seeds per cell, all in `normal` mode

Reproduce with:

```js
import { simulate } from './tools/soak/Sim.ts'
for (const level of ['level1', 'level2']) {
  let won = 0
  const lossWave = {}
  for (let seed = 1; seed <= 60; seed++) {
    const r = simulate(seed, 'normal', level)
    if (r.outcome === 'won') won++
    else lossWave[r.waves] = (lossWave[r.waves] ?? 0) + 1
  }
  console.log(level, won, lossWave)
}
```

| Cell | Wins of 60 | Losses by wave reached |
| --- | --- | --- |
| level 1 | **47** | w6 ×1, w7 ×2, w12 ×10 |
| level 2 | **7** | w6 ×1, w8 ×1, w12 ×51 |

Note the mode matters and is easy to get wrong: `tools/soak/run.ts` rotates
through seven modes, three of which are deliberate handicaps (`nobuild`,
`supportonly`, `noabilities`). The same grid under that rotation reads 29/60 and
6/60. **The cell figures above are all-`normal`, which is the basis every
previous report used.**

### Level 2, reported and not acted on, as asked

**Level 2 wins 7 of 60**, against 20 of 60 before summons, and a target band of
35–45. It is outside the band and I have adjusted nothing.

Worth saying plainly: **it was already outside it.** 20/60 is where it has sat
since the wave health went back to +18.5% on `725b71d`. Summoning did not move
it out of range; it moved it further down.

The loss distribution is unchanged in shape and is the whole story: **51 of the
53 losses are wave 12**, the boss wave, and the boss now arrives with up to six
underlings behind him. Two losses in the entire set happen anywhere else.

Two things that follow, for whoever tunes this next:

1. **Wave health is not the knob.** 20/60 at +18.5% against 21/60 at +8% is one
   run on sixty seeds. Adding 2650 health across twelve waves bought two early
   losses and nothing else. The soak is insensitive to it.
2. **The raw-`maxHealth` metric the repo uses is armour-blind.** theDevil has
   armor 4 where the politician has 0, so +8% on paper is +40–55% in the damage
   the board actually has to output. Any future "wave health is +N%" figure for
   level 2 should be read with that in mind.


---

## Re-verification pass, and the one gap it found

The branching-lane brief was put to me a second time. Rather than rebuild it I
walked the shipped code against each line of the spec. Everything matched
except one clause, and that one was a real gap.

| Spec clause | Where it lives | |
| --- | --- | --- |
| Multiple named lanes, each with its own waypoints | `LaneDef` in `types.ts:34`, `MapDef.lanes?` at `:72` | ✅ |
| A lane merges into another at a waypoint index of the target | `LaneDef.merge { into, atIndex }` | ✅ |
| Single-lane `MapDef` unchanged; levels 1 and 2 need no edits | `LaneNetwork` prepends `main` from `waypoints`; no level data touched since `8ec7086` | ✅ |
| Waves specify a lane, defaulting to the first | `WaveSpawnDef.lane?`, `net.lane(undefined) === main` | ✅ |
| Each enemy tracks and follows its lane | `Enemy.laneId` / `laneDistance` | ✅ |
| Transfer at the merge, continuing from the merge index | `followMerges`, `transferFrom` | ✅ |
| Progress monotonic across a transfer, never regressing | `distance` takes the step and nothing else writes it | ✅ |
| Tower range evaluates enemies on every lane | `Targeting` never reads `laneDistance` | ✅ |
| Checker validates every lane | `validateLanes` + `check_level2.py` | ✅ |
| Test: an enemy from each branch reaches the exit | `lanes.test.ts:140` | ✅ |
| Test: each branch reports its own path length | `:65`, `:83` | ✅ |
| Test: merge preserves progress, does not regress | `:97`, `:119` | ✅ |
| Test: a single-lane map still passes unchanged | `:40`, and both real maps through `validateLanes` | ✅ |
| **Test: a tower between the branches DAMAGES enemies on both lanes** | — | ❌ **gap** |

The existing tower test proved the tower **selected** across both branches:
`withinRadius` returning two enemies, `pickFirst` preferring the one furthest
along by progress across lanes. It never proved the damage landed. Those are
separate failures — a tower can pick a target on another lane and have nothing
happen to it, and every selection assertion would still pass.

`02f2005` closes it. Both enemies walk their own branch with the real
`advance`, the tower fires on a cooldown, and both die **on the branch they
started on** — asserted, so the test cannot quietly end up measuring the shared
lane after a merge instead of the fork.

Checked load-bearing by mutation, in both directions:

| Mutation | Fails with |
| --- | --- |
| Range 130 → 95, so the tower reaches neither branch | `never damaged the enemy on the west branch` |
| Candidate list filtered to the west lane | `never damaged the enemy on the east branch` |

`npm test`: 680 tests, 679 pass. `tsdiff` against `885168c`: 179 baseline, 179
working tree, none introduced. Soak unmoved at 47/60 and 7/60. CI run #69 is
red on the asset budget alone — `npm test` is the only failing step, and it is
the same single assertion.

---

## Level 3's geometry has arrived, and the model fits it

`6507abd` uploaded `tools/level3 geometry.json` while this was in flight. It is
the two-gate merging map this engine was built for:

```
upper   30 waypoints, (23.06, 124.37) -> (731.45, 375.24)
lower   30 waypoints, (23.0,  578.43) -> (736.96, 385.57)
shared  26 waypoints, (733.23, 377.97) -> (1272.46, 366.01)
merge   (733.23, 377.97)          roadWidth 54.6   towerRange 112
```

The obvious translation — `shared` as the map's own `waypoints`, `upper` and
`lower` as branches merging into `main` at `atIndex: 0` — **validates clean**
through `validateLanes`, and both branches resolve to `main` as their terminal.
So no engine change is needed to author level 3. Two things to settle when
somebody does, neither of which is a bug in the engine:

1. **The branch endpoints do not sit on the merge point.** `upper` ends 3.26px
   short of it and `lower` 8.47px. The model expects a branch's last waypoint to
   BE the join, so as authored an enemy would jump those few pixels sideways on
   transferring. Snapping both branch endpoints to `shared[0]` fixes it and
   costs nothing.
2. **The declared route lengths do not match the waypoints.** The file says
   `upper 1366.5, lower 1395.5`; summing the waypoint geometry gives 1347.3 and
   1333.6 — 19px and 62px short. The gaps are unequal, so this is not a constant
   offset; the declared figures look traced along the painted road rather than
   summed from the decimated waypoint list. **Level 2 had exactly this problem**
   (a supplied 1916.7 against an actual 1955.3), and the resolution then was to
   trust the waypoints. Worth deciding deliberately rather than inheriting.

Reproduce both with the snippet in `tools/`-style scratch form: build the map
above, call `validateLanes`, then `net.routeLength('upper')`.

---

## Where this leaves the repository

### Blocked, and waiting on a decision — the asset budget

`main` has been red since `c9ea190`, and because `deploy` is gated on `checks`
in `.github/workflows/checks.yml`, **the deploy job has been skipped on every
commit since.** The last successful deploy on `main` was run #60, `0c3abc1f`.
None of the three features in this report are on the live site.

Three "Add files via upload" commits took the asset total past the 40MB cap:

| Commit | Added | Total after |
| --- | --- | --- |
| `8ec7086` | (last green baseline) | 34.5MB |
| `0c3abc1f` | | 38.0MB ✅ |
| `c9ea190` | enemy_catcher 1.39, enemy_longsnap 1.20, enemy_pompom 0.97, enemy_zamboni 1.64 | 43.3MB ❌ |
| `a6eeacf` | boss_projectile 2.14 | 45.4MB ❌ |
| `6220081` | fx_stunned 1.99 | 47.4MB ❌ |
| `dc98cca`, `6507abd` | boss_unicorn 1.24 (plus L3 tracing art in `tools/`, which does not count) | 48.6MB ❌ |

This is somebody else's art and I have not touched it. Two remedies, either of
which clears the cap, and I need a word before doing either:

1. **Move `public/assets/maps/L3_trace.png` (2.12MB) to `tools/`.** It is a
   tracing overlay, not a shipped asset, and the `map_level2.json` note already
   sets that precedent. On its own this is not enough.
2. **Re-encode the seven new PNGs to WebP**, the same treatment the map plates
   got, via `tools/reencode`. On past ratios that is roughly 10.6MB down to
   1–2MB, which clears the cap comfortably with or without (1).

Until one of them happens, the live site stays four features behind: the world
map screen, branching lanes, air/ground targeting and summons are all on `main`
and none of them is deployed.

### In flight

Nothing. Everything is pushed and the working tree is clean.

### Carried forward from earlier reports

- **Level 2 is at 7/60 against a 35–45 target.** Not adjusted, as instructed.
  The boss wave is the whole of it; see the two notes above before reaching for
  wave health again.
- **`Levels.isLevelCleared` is derived, not recorded.** The save counts runs
  cleared, not which levels they were on, so clearing level 1 twice marks level
  2 cleared. Fixing it needs a new save field and a migration. Unchanged from
  `2026-09-04-level2-playable.md`.
- **Level 3 is unblocked on the engine but not on its data.** The geometry
  validates clean, but its branch endpoints want snapping to the merge point
  and its declared route lengths disagree with its own waypoints. See the
  section above; both are decisions for whoever authors the level, not
  engine work.
- **`tsdiff`'s blind spot for new files** is now load-bearing on two modules
  (`Lanes.ts`, `AirCover.ts`). Both are Phaser-free by design, so it holds — but
  it holds by convention rather than by a check.
