# Level 8: two entrances, one exit, and a gate that finally does something

| commit | what | CI |
|---|---|---|
| `49e3b7a` | The re-topology, the gate measurement, the re-soak, the harness scenario | [run 347](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34782565856) — **green** (`changes`, `typecheck`, `test`; `deploy` skipped on a branch) |
| `9f7497f` | Closes the row above; merges main (two files under `claude/`, no conflicts) | [run 349](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34782741665) — **green** |
| `c07d16a` | Open item 6: what merging this makes stale in `claude/context.md` | [run 351](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34782780336) — **green** |
| `3402f49` | Closes the two rows above | reports only |
| `b05564f` | Merges main a second time (the context.md reconciliation report) | [run 354](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34782849837) — **green** on the final head |
| `0c12c57` | Fills in the row above | reports only |
| `a merge` + `1cc926a` | Merges main a third time (the CLAUDE.md reconciliation) and corrects its level count | [run 358](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34807753154) — **green** |
| *this commit* | Fills in the row above | reports only |

---

## The headline

**The gate now buffs 96.9% of the eligible enemies that reach it, against 2.6%
of all enemies before.** Level 8 soaks at **42% over 480 seeds**, inside the
35-45% band. **Levels 1 to 7 and 9 are byte-identical** on the same seeds. The
CEO is **8,100**, re-derived; its old 8,500 was measured on a board whose
signature mechanic touched one enemy in forty.

---

## First: what the 2.6% was a share of

**It is a share of ENEMIES.** `reviewed / (kills + leaks)` — enemies buffed, over
enemies that resolved in a run.

**It is not, and could not be, a share of lane covered by the trigger volume,
because there is no volume.** The trigger is a single distance along the lane
polyline. Its keys are `["lane","distance","at"]`; there is no width field and
nothing reads one.

That distinction decides the fix, which is why the correction was worth making:
a coverage figure would point at the trigger's size, and an enemy-share figure
points at how many enemies go past it.

**`tools/soak/level.ts` now prints the pair and cannot print the numerator
alone:**

```
performance reviews: 81.9 a run of the 84.3 eligible enemies that reached the beam (97.2%)
```

`6.5 a run` was true of this level for its whole life and meant nothing. 6.5 out
of 239 is a mechanic touching one enemy in forty; 6.5 out of 7 would be a
mechanic working perfectly on a board where nothing survives. Only the pair is
information.

---

## Why coverage was that low: the three hypotheses, tested separately

### H1 — the trigger volume is too small, or sits off the lane polyline

**No, and it cannot be either.** It is not a volume. The point it declares,
(954.74, 422.78), sits on the `south` polyline at distance 142.68 to within
**0.0113 px** — measured by walking the shipped lane rather than by reading the
file.

### H2 — a point-in-volume test once per tick, so a fast enemy steps over a thin band

**No. `crossedGate` is already a segment-intersection test against the enemy's
movement segment for that tick** — `from < d <= to`, where `from` and `to` are
the distances before and after the step. The fix the brief describes is the
implementation that is already there. Driven directly:

| step along the lane | fires? |
|---|---|
| 0 → 1, short of it | no |
| 142 → 143, across it | **yes** |
| **0 → 5000, one step faster than anything in the game** | **yes** |
| 200 → 4000, starting past it | no |
| 143 → 142, walking backwards | no |

The merge case is handled too: an enemy that crosses the junction mid-step has
its `from` re-measured at the distance it joined the new lane, in both the scene
and the soak, from the same pure functions that moved it.

### H3 — it fires only for a subset of enemy types

**Yes, partially — and both parts are existing, documented, deliberate rules.**
Measured after the re-topology, per run over 40 seeds:

| type | reached the beam | reviewed |
|---|---|---|
| intern | 61.55 | **61.55** |
| consultant | 7.72 | **7.72** |
| manager | 6.90 | **6.90** |
| hr | 4.15 | **4.15** |
| officeDrone | 3.10 | 0.50 |
| ceo | 0.50 | 0.00 |

Every ordinary type is **exact**. Two are not:

- **The CEO is boss-immune**, by `reviewable()` — `role: 'boss'` or
  `tier: 'boss'`, the same pair every other importance rule in the game uses.
- **66% of office drones are summoned past the line.** The CEO spawns them at his
  own position on crossing 70% and 40% health, and by then he is usually beyond
  the beam: median join distance **299** against a beam at 142.68, maximum
  **1,476**. Every other type joins the lane at distance 0-4.

`level8.json`'s `_once` note already describes a summoned child spawning past the
line as taking the same path as any other un-crossed enemy. Together these two
are the entire 3.1% shortfall, and changing either is a design decision rather
than a bug fix.

### And the cause was none of the three

**It was placement.** Before the re-topology, **only 10.6 of 239 enemies a run
ever set foot on the gate's lane.** The beam stood on one of two *exits*,
downstream of 1,342 px of shared road and most of a 19-pad board's killing power.
Half of everything was routed the other way and nearly all of the rest was
already dead.

This is exactly why the correction to STEP 3(a) mattered: re-routing is not "the
gate fix" in the sense of repairing a broken trigger. The trigger was never
broken. The road was pointing the wrong way past it.

### Before and after

| per run, 40 seeds | before | after |
|---|---|---|
| resolved (killed or leaked) | 239.0 | 160.1 |
| ever on the gate lane | **10.6** | **86.6** |
| reached the gate distance | 9.2 | 83.9 |
| …and eligible | 8.3 | 83.4 |
| **reviewed** | **6.1** | **80.8** |
| **reviewed / resolved** | **2.6%** | **50.5%** |
| **reviewed / eligible at the beam** | 73.5% | **96.9%** |

**100% of all enemies is not reachable while towers work**, and saying so is part
of the answer rather than an excuse: an enemy killed before the beam never
crosses it, and 97.6% of everything spawned dies somewhere. The reachable target
is *every eligible enemy that gets there crosses it*, and that is 96.9%, with the
residual named above.

---

## STEP 2 — the re-topology

**Two entrances, one exit, and nothing was hand-edited.**

| lane | length | from | to | |
|---|---|---|---|---|
| `west` | 1,342 px | (-60, 116), the west opening | the fork (1072, 356) | merges into `south` |
| `east` | 437 px | (1340, 550), the east opening | the fork | merges into `south`, `entrance: true` |
| `south` | 2,304 px | the fork | (1076, 779), the bottom opening | **the only exit** |

Routes: **west 3,646 px** (unchanged), **east 2,741 px**.

**The east arm is the tracer's own polyline, reversed.** It ran fork → opening as
an exit; it runs opening → fork as an entrance. `tests/level8.test.ts` asserts
that the shipped waypoints are `[...GEOMETRY.branches.east].reverse()`, so it is
the traced coordinate list and not a re-typed one. `map_level8.json` stays
GENERATED by `tools/build_level8_map.py`; the re-topology is a change to that
generator.

**`validateLanes` is clean.** The east lane declares `entrance: true` for level
6's `lower`'s reason: nothing merges into it, and without the flag a lane that
reaches an exit with no feed reads as a route with no gate.

### Does the right-edge lane's route cross the gate?

**Yes, naturally — the brief's "report that instead and stop" condition is not
met.** Both mouths end on the fork, `south` starts there, and the beam is 142.68
px along `south`. Reaching the exit *is* crossing it.

### The pads

**None moved, and none had to.** The road is the same three traced polylines; only
the direction two of them are walked changed. `tools/check_level8.py` re-measures
every pad against the plate: all 19 report `0px / 0 blob` off-carpet, 90-101 px to
the nearest lane centreline, closest pair 75.5 px.

### The waves

**Counts and composition are unchanged, wave for wave and enemy for enemy** — 261
enemies, 186 interns, 20 HR, 30 consultants, 24 managers, 1 CEO — so the re-soak
measures the topology and nothing else.

The `exit` field is gone from every group, because there is one exit and it named
a choice that no longer exists. The mapping is one-to-one: a group routed to the
east *exit* now enters through the east *mouth* (22 groups); one routed south
keeps the long walk from the west (24 groups). The CEO comes in from the west,
which is the long way in now.

---

## The build pad count, explicitly

**Level 8 carries 19, and it is not the largest board — level 7 carries 22.**

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| pads | 7 | 15 | 15 | 14 | 14 | 18 | **22** | **19** | 15 |

**So the understood 14-15 convention is a habit that five levels happen to sit
at, not a rule — and three boards are well past it.** `map_level8.json` carried a
note claiming 19 was "MORE THAN ANY OTHER LEVEL IN THE GAME", written when level
7 did not exist; that claim was stale and is corrected, in the generator and in
`tests/level8.test.ts`.

**It matters for the reason the brief says it does.** 19 pads hold more DPS than
14, so a boss health figure measured on one board does not transfer to another.
The CEO's 8,100 is measured against this board and against no other, and the same
is true of every other per-level number in `SOAK-REPORT.md`.

---

## STEP 3 — the visuals

**Both assets were already wired, which the brief did not expect.** They were
wired when level 8 was built:

- `fx-performance-scan` is played by `GameScene.reviewCrossing` at the crossing
  point, as an 8-frame sheet of 272x610 cells.
- `fx-performance-buff` is hung over a reviewed enemy by `syncStatusMarkers` for
  the rest of its life, anchored at its base.

**The portrait trap was already avoided, by construction rather than by luck.**
`statusMarker` scales with `setScale(height / contentHeight)` — one uniform
factor — so the 703x1172 marker keeps its proportion at every size. Its content
box is the INK, 680x1148, measured by `measure_art.py`.

**One real fault, found in a frame: the scan was stretched 12%.** It was drawn at
`markerHeight * 3` by `markerHeight * 6` — 72 by 144 — out of a 272x610 cell,
which is 0.500:1 from a 0.446:1 source. Not a smear, but a proportion nobody
chose, and it is the same mistake that flattened the Mind Laser and turned the
Rooster's breath into a bar. The width is now `performanceReview.scanWidth` (72,
unchanged) and **the height is derived from the sheet's own cell aspect at the
call site**, so a second authored number cannot stretch it again. 144 → 161.

Two of the three failures the harness first reported were **my own assertions**,
not product faults, and both are written into the scenario:

- the buff marker "1% off its aspect" — I compared the drawn CANVAS aspect
  against the INK aspect. They differ by construction; that is what
  `contentWidth` exists for.
- "scenery doubled on the restart" — `sceneryArt` holds the lane markers added
  earlier this session as well as authored scenery, and level 8 authors none.

---

## STEP 4 — the re-soak

**42% over 480 seeds (200/480).** CEO 8,100, from the table. Hero: **Cory, every
seed** — `tools/soak/level.ts` pins `DEFAULT_HERO_ID` and does not rotate. No
hero's values were touched.

The sensitivity tables, the loss distribution by wave and by entrance, and the
before/after gate decomposition are in
[`SOAK-REPORT.md`](../SOAK-REPORT.md). The two that matter most here:

**The buff is worth ten points of win rate**, where before it could not have been
worth anything — `speedMultiplier` 1.0 → 50%, 1.2 → 40%, 2.2 → 13%. And the
control, `sizeMultiplier`, is **exactly flat** across 1.0/1.1/1.5, which is what
makes the first table trustworthy rather than noise.

**88% of the lives lost come from enemies that entered by the east mouth**, and
79% of losses are ended by one. It is 2,741 px against the west's 3,646 and its
arm is 36% pad-covered against the south's 77%. The wave table was deliberately
NOT rebalanced for that.

**Levels 1 to 7 and 9 are byte-identical** on the same 480 seeds. Only level 8
moved: 195/480 → 200/480.

---

## Verified from rendered frames

`tools/harness/run.sh level8retopo` — **23 checks, all passing at 667x375,
844x390 and 1280x720.** None of the nine scenarios that assert nothing was used.

| claim | evidence |
|---|---|
| both entrances spawn | `west spawn at (5, 116)   east spawn at (1275, 550)`, both alive, 900+ px apart |
| the level has one exit | `exits=["south"]`, and both mouths' continuations resolve to it |
| every enemy from both mouths crosses the beam | the beam is on `south`; both `west` and `east` run into `south`, asserted through the live network — and an enemy stepped over it is `reviewed` |
| the scan animates frame by frame | 3+ distinct frames observed of the 8, from the live sprite |
| the scan is not one stretched image | drawn aspect within 2% of the cell aspect |
| the buff marker rides above and is not stretched | drawn aspect within 1% of the canvas; marker `y` above its owner's |
| enemies leave at the bottom and cost a life | `a leak at the bottom door: lives 20 -> 19` |
| towers on every pad | `towers built: 19 of 19` |
| restart, defeat and leaving clean up | second build 19 pads, scenery count exact, `0` level-8 keys resident on the world map |

`npm run test`: 1099 passing. `sh tools/tsdiff.sh c6e75fb`: 213/213, zero
introduced.

---

## Where this leaves the repository

**DONE:** STEP 2 whole, the replacement STEP 3(a) whole, STEP 3(b) whole,
STEP 3's visuals, STEP 4 whole.

**OPEN:**

1. **The east mouth is 88% of the damage.** Shorter road, thinner cover. The wave
   table was held constant on purpose so this pass measured one thing; balancing
   it is the next pass, and it is a wave-table job rather than a geometry one.
2. **Losses are front-loaded**: 64% of them are in waves 4 and 5. The early waves
   now include groups that used to take the long western walk and now arrive by
   the short eastern one. Same cause as 1.
3. **The CEO's drones skip the beam**, 66% of them, because they are summoned past
   it. Documented behaviour; whether a summoned child should inherit its parent's
   review is a design question nobody has been asked.
4. **`officeDrone` is the only type whose reached/reviewed counts disagree**, and
   the soak now prints the denominator that would show it again.
5. **Level 7 carries 22 pads and level 1 carries 7.** The 14-15 habit is worth
   either adopting as a rule or abandoning explicitly, because boss health is
   measured per board and the spread is now 3x.
6. **`claude/context.md` goes stale the moment this branch merges**, in three
   named places, and it is another session's living record so this branch did
   not edit it: line 187 lists pads for levels 1-8 only (nine levels now, the
   ninth carrying 15); line 241 publishes level 8 at 41% (42% after the
   re-topology, though the line already defers to `SOAK-REPORT.md`, which this
   branch updated); and lines 315-316 say neither level 9 nor 10 is wired up and
   that the level 9 geometry "is on a branch" — level 9 ships here. Whoever
   merges should refresh those three lines; nothing else in that file is
   contradicted.

   **`CLAUDE.md` said the same two things and this branch DID edit it**, because
   it auto-loads into every session and the reconciliation that landed on main
   while this branch was in flight had just called that section the most
   misleading text in the repository. "Eight built levels" is nine, and the
   "Levels 9 and 10 are the live edge" paragraph is now level 10 alone. The
   asset-sweep hazard is worth seeing here: that paragraph named level 9's art
   as unwired while the branch consuming it was unmerged, which is the precise
   shape of the `eda11dc` incident the standing fact above records.
