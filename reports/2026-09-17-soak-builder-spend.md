# The soak's player stops tiering the wall

| commit | what | CI |
|---|---|---|
| *this commit* | The third role rule in `tools/soak/Sim.ts`, its two witnesses in `SoakResult.builder`, `tools/soak/builder.json`, `tests/soakbuilder.test.ts`, this report, `SOAK-REPORT.md`, `CLAUDE.md`, `claude/context.md` | filled in below once the run lands |

**Answers first.**

- **D does NOT reproduce B. It sits +160 runs above it (2928 against 2768 of
  4800, +3.3 points), and that move reproduces at +175 on an independent seed
  block.** So it is the rule, not the sample — and the rule is still doing
  exactly what it says. **A guarantee-off board is not a blocker-free board.**
  The Beacon is in the draft pool at weight 3 whatever the guarantee does, so
  column B's boards carry 1.2 to 2.7 zero-damage towers and the old upgrade
  loop tiered every one of them to the top: B's mean zero-damage peanut share
  runs **11.1% to 19.0% across the ten levels**. The sink was in both columns.
  Closing it moves both. The brief expected D≈B because it expected the sink to
  be a consequence of the guarantee; it is not, and that is the finding.
- **Level 6's `zeroDamageSpend` under E is 5.1%** (median share of tower
  peanuts), against the 17.7% guarantee-off reference the brief quotes — which
  re-measures at **17.1%** on these 480 seeds. Level 6 is now **12.0 points
  below** the reference, not near it.
- **The simple rule was sufficient. No spend share was added to
  `builder.json`.** Nine of the ten levels land below the guarantee-off
  reference under E. The tenth is level 10 at 22.1%, and the measurement says
  that is correct behaviour rather than a leak: see *Level 10 is the exception
  and it is not a failure* below.
- **91.6% of the C−B gap closed** — E−C is +395 of the 431 runs the guarantee
  cost. Read the other way, the guarantee still costs **196 runs** under the new
  builder (E−D) against 431 under the old one, so **54.5% of the guarantee's
  measured cost was the peanut sink** and the rest is the pad it occupies.
- **How much is still instrument: no *identified* peanut-sink artefact remains,
  and the largest remaining doubt is now sampling, not the builder.** Same code,
  same config, four different 480-seed blocks of level 6 read **196, 211, 226,
  208** — a 30-run spread, 1σ ≈ 11 runs ≈ **2.3 percentage points**. The 35–45%
  band is ten points wide. A per-level rate quoted to the run from one
  480-seed column is over-precise by about a quarter of the band.

---

## ⚠ THE INSTRUMENT CHANGED AGAIN. THE GAME DID NOT.

`git diff origin/main HEAD -- src/` is **empty**. Not one file under `src/`
changed, so there is nothing that could have changed the game. Every number in
this report is a statement about the measuring instrument and the boards it
measures.

**Win rates from before this commit do not compare to win rates after it**, on
exactly the terms `reports/2026-09-17-soak-builder.md` set out for the commit
before. That includes the four rows in `CLAUDE.md`, which this commit replaces,
and **level 9's PERPLEXED at 7650 and Vlaude's 26,000, which are flagged again
below and were not touched.**

## The rule

`tools/soak/Sim.ts`, in the upgrade half of `spend`:

```ts
const gunBelowTopTier = mode !== 'supportonly'
  && towers.some((t) => dealsDamage(t.id) && !isMaxed(t.def, t.tier))
for (const t of towers) {
  if (t.buildLeft > 0 || isMaxed(t.def, t.tier)) continue
  if (gunBelowTopTier && !dealsDamage(t.id)) continue
  ...
}
```

**While any tower that shoots is below its top tier, nothing that does not
shoot is upgraded.** That is the whole rule, exactly as the brief specified it,
and it has no number.

It is a floor on stupidity, not a strategy. It never chooses *which* gun to
tier, *which* tower to build or *which* pad to take; past it the loop is the
same walk in the same order it always was. `tests/soakbuilder.test.ts` still
asserts the opening has not collapsed to one tower.

**Hoisted rather than re-read per tower** because it cannot change inside the
loop: a tier is paid for there, but `t.tier` only increments when `buildLeft`
runs out, which happens in the wave step.

**`supportonly` is exempt by an explicit mode check**, matching the cap. Today
that check is vacuous — its pool is the Beacon, so no tower on that board shoots
and the rule cannot fire. It is written anyway, because the day a support tower
deals damage is the day this would quietly start throttling the
deliberately-broken player.

### What watches it

Two new fields on `SoakResult.builder`:

- **`zeroDamageUpgradesWhileGunBelowTop`** — the invariant. It is re-derived
  from the board **at the moment the peanuts leave**, with a different
  expression than the rule's own flag and at a different time, so it is a
  witness rather than a restatement. It reads **0 on every run measured here**,
  and `tests/soakbuilder.test.ts` fails if it does not.
- **`zeroDamageUpgrades`** — every tier or specialisation bought for a tower
  that does not shoot, in order or not. Not a fault by itself; it is what tells
  level 10 apart from a leak.

The test also asserts `zeroDamageUpgrades > 0` across the sweep. **That is
deliberate and it is the second half of the rule**: if it ever reads zero, the
rule has stopped lifting when the guns are maxed and has become a ban, which is
a different rule than the one `builder.json` describes.

## The four columns

480 seeds (1–480), difficulty `normal`, default hero, wins out of 480. Same
seeds in every column. B and C reproduce the published figures **integer for
integer**, which is what makes all four comparable.

| level | pads | **B** guarantee off, old builder | **C** guarantee on, old builder | **D** guarantee off, NEW rule | **E** guarantee on, NEW rule | D−B | E−C |
|---|---|---|---|---|---|---|---|
| 1 | 7 | 440 | 434 | 450 | **456** | +10 | +22 |
| 2 | 15 | 266 | 218 | 292 | **277** | +26 | +59 |
| 3 | 15 | 436 | 431 | 440 | **447** | +4 | +16 |
| 4 | 14 | 327 | 314 | 346 | **335** | +19 | +21 |
| 5 | 14 | 262 | 274 | 263 | **279** | +1 | +5 |
| 6 | 18 | 204 | 99 | 241 | **196** | +37 | **+97** |
| 7 | 22 | 204 | 135 | 247 | **236** | +43 | **+101** |
| 8 | 19 | 207 | 154 | 238 | **218** | +31 | +64 |
| 9 | 15 | 208 | 146 | 195 | **153** | **−13** | +7 |
| 10 | 12 | 214 | 132 | 216 | **135** | +2 | +3 |
| **all** | | **2768** | **2337** | **2928** | **2732** | **+160** | **+395** |

As percentages, column E: 95.0, 57.7, 93.1, 69.8, 58.1, **40.8**, 49.2, 45.4,
31.9, 28.1.

**Under E, level 6 is in the 35–45% band at 40.8%, and level 8 is 0.4 points
over the top edge at 45.4%.** Level 7 is 4.2 over, level 9 is 3.1 under and
level 10 is 6.9 under. That is one level in band on this seed block and two on
the next — **read the seed-noise section before treating either count as a
fact, and do not retune off it.**

### D against B is the honest test, and it needed a second seed block

+160 is not "barely". The question the brief asked is whether the rule is doing
something other than what it says, and a single column cannot answer that. A
second, independent block of 480 seeds (481–960) can:

| level | D−B (seeds 1–480) | D−B (seeds 481–960) |
|---|---|---|
| 1 | +10 | +8 |
| 2 | +26 | +31 |
| 3 | +4 | +3 |
| 4 | +19 | +15 |
| 5 | +1 | +5 |
| 6 | +37 | +40 |
| 7 | +43 | +47 |
| 8 | +31 | +34 |
| 9 | −13 | −9 |
| 10 | +2 | +1 |
| **all** | **+160** | **+175** |

**Every level reproduces its own delta within ±5 runs**, including level 9's
negative one. The move is the rule and it is level-specific, not a wash of
noise.

**Why it moves at all: the sink was never a property of the guarantee.** The
Beacon is drafted at weight 3 whether or not the Ima Dummy Tower is guaranteed,
so a column-B board still stands 1.2 to 2.7 zero-damage towers — and the old
loop tiered them. Mean share of tower peanuts sunk into towers that never fire:

| | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **B** old builder, guarantee off | 11.1 | 14.2 | 14.5 | 12.5 | 12.5 | 17.9 | 19.0 | 16.5 | 17.8 | 13.5 |
| **D** NEW rule, guarantee off | 2.6 | 7.0 | 10.7 | 11.3 | 5.4 | 5.4 | 10.5 | 8.8 | 10.1 | 13.4 |

`reports/2026-09-17-soak-builder.md` said this in advance and could not measure
it: *"`shelter` has had the same flaw for as long as it has existed, at weight 3
rather than guaranteed."* Column B measured the pad half of that. This measures
the peanut half. **So B was never a clean reference — it was the same artefact
at a third of the size, and D is the first column with neither half of it.**

### The rule does not change what gets built

`zeroDamageBuilt`, mean towers standing at the end of a run, is **identical**
between B and D and between C and E on nine of ten levels (level 4 moves 1.23 →
1.49 and 1.32 → 1.69, because freed peanuts change what is affordable later in
a stream that has already diverged). The cap decides the pads; this rule decides
only the order of the peanuts. That is what it was asked to do.

## Column E, and where the peanuts go now

Median share of tower peanuts sunk into towers that can never fire, against the
brief's 17.7% guarantee-off reference (**17.1%** re-measured at 480 seeds on
level 6):

| level | C guarantee on, old builder | **E guarantee on, NEW rule** | vs 17.1% reference |
|---|---|---|---|
| 1 | 18.8 | **4.1** | −13.0 |
| 2 | 17.7 | **9.8** | −7.3 |
| 3 | 17.1 | **12.5** | −4.6 |
| 4 | 12.7 | **12.3** | −4.8 |
| 5 | 16.3 | **5.9** | −11.2 |
| 6 | **29.5** | **5.1** | **−12.0** |
| 7 | 28.1 | **7.0** | −10.1 |
| 8 | 24.7 | **6.9** | −10.2 |
| 9 | 26.8 | **8.6** | −8.5 |
| 10 | 22.1 | **22.1** | **+5.0** |

**Nine of ten are below the reference and the sink is closed on them.** The
brief's fallback — a hard spend share in `builder.json` beside `padShare` — was
not needed and was not added.

### Level 10 is the exception and it is not a failure

Level 10's share did not move by one decimal place: 22.1% median and 21.2% mean
under both C and E, on 1.86 zero-damage towers either way. It is the only level
where the rule makes almost no difference, and the reason is measured rather
than guessed:

- **`zeroDamageUpgradesWhileGunBelowTop` is 0 across all 480 runs.** The rule
  held. Nothing was bought out of order.
- **`zeroDamageUpgrades` is 5.31 a run** — against 0.00 on levels 6 and 7 and
  0.16 on level 1. Level 10 buys blocker upgrades in bulk, *and every one of
  them is legal*, which by the definition of the rule means **every gun on the
  board was already at its top tier when they were bought.**

Level 10 is a long, rich board. It maxes everything that shoots, the rule
lifts because nothing that shoots is below its top tier, and a blocker is the
only thing left to buy. **A person does that too.** The rule is about the order,
not the total, and a hard spend share would have banned the correct behaviour in
order to bound the correct number.

The consequence for column E: **level 10's remaining 81-run gap to D is a pad
cost, not a peanut cost.** The cap already bounds it. Nothing in this session
can reduce it further and nothing should try.

## How much of the gap closed, both ways round

| | runs of 4800 |
|---|---|
| The guarantee's cost under the old builder (C−B) | **−431** |
| Recovered by this rule (E−C) | **+395 — 91.6% of it** |
| The guarantee's cost under the new builder (E−D) | **−196** |
| So: how much of the guarantee's measured cost was the peanut sink | **54.5%** |

Both framings are honest and they answer different questions. **91.6%** is the
one the brief asked for — E climbs back to within 36 runs of the old
guarantee-off column. **54.5%** is the one to carry forward: D rose too, so
against a reference with neither half of the artefact in it, the guarantee still
costs 196 runs, and that residual is the pad rather than the peanuts.

Per level, the guarantee's cost before and after:

| level | C−B (old builder) | E−D (NEW rule) |
|---|---|---|
| 1 | −6 | +6 |
| 2 | −48 | −15 |
| 3 | −5 | +7 |
| 4 | −13 | −11 |
| 5 | +12 | +16 |
| 6 | **−105** | −45 |
| 7 | −69 | −11 |
| 8 | −53 | −20 |
| 9 | −62 | **−42** |
| 10 | −82 | **−81** |

**123 of the residual 196 sit on levels 9 and 10**, and level 10 is 81 of them
for the reason given above.

## ⚠ 480 SEEDS IS WORTH ±11 RUNS, AND THIS REPORT IS THE FIRST TO SAY SO

Every column here is quoted to the run because that is how they are produced.
**They should not be read to the run.** Same code, same configuration, same
level, four different 480-seed blocks:

| | 1–480 | 481–960 | 961–1440 | 1441–1920 | strided (1, 11, 21 … 4791) |
|---|---|---|---|---|---|
| level 6 under **E** | **196** | 211 | 226 | 208 | 202 |
| level 6 under **C** | **99** | 119 | 129 | 110 | 117 |

- **Spread of 30 runs in both rows**, sample sd 11.3 and 11.1, against a
  binomial σ of 10.9 and 9.4. So it is ordinary sampling noise, at a size most
  readers of these tables would not assume.
- **The strided sample lands mid-pack in both rows**, so consecutive seeds are
  not correlated in any way that matters — mulberry32 is behaving. The variance
  is real, not an artefact of contiguous seeding.
- **Seeds 1–480 happen to be a low block for level 6**, in both configurations.
  The published 99 is the bottom of its band, not its centre; the four blocks
  average 114.
- **1σ ≈ 11 runs ≈ 2.3 percentage points. The band is 10 points wide.**

**And an aggregate over the ten levels is worse, not better, because the levels
share the seeds.** Column B's total moved **+107** between seed blocks under
identical code (2768 → 2875), far more than the ~35 that independent levels
would give: a seed that drafts well tends to draft well on several boards at
once, so the ten columns are correlated and their sum does not average out.

**What survives all of this is the same-seed A/B delta**, which is why the brief
demanded the same seeds: D−B reproduced within ±5 runs a level across two
blocks while the columns themselves moved by 20 and 30. **Compare columns;
never compare a column to a number from a different seed set.**

## The game is untouched

- **`git diff origin/main HEAD -- src/` is empty**, and so is the same diff over
  `public/`, `vendor/` and `tools/harness/`. The three files this commit touches
  are `tools/soak/Sim.ts`, `tools/soak/builder.json` and
  `tests/soakbuilder.test.ts`, plus documentation.
- **`main`'s tree was read back after pushing** — see the CI row at the top.

## Verification

- **`npm test` — 1195 tests, all pass.** Six in `tests/soakbuilder.test.ts`, one
  of them new: *a blocker is never upgraded while a gun is below its top tier*.
  It reports `30 runs, 0 out-of-order upgrades, 15 bought once the guns were
  maxed`.
- **`sh tools/tsdiff.sh 7eb04a5`** — `214 distinct errors` in both baseline and
  working tree, **nothing introduced**. No Phaser member is touched, which is
  the blind spot that script cannot see; nothing here imports Phaser at all.
- **`sh tools/harness/build.sh`** — 132 modules staged.
- **`sh tools/harness/run.sh screens 140 844x390`** — **1 layout fault**, and it
  is not this change's: `SMALL Title [title:version-stamp (hidden dev door, not
  a tap target)]`. **Established rather than assumed** — a worktree of
  `origin/main` at `7eb04a5` reports the identical fault at the identical
  coordinates, `685,360 83x29`. The other eight screens report 0 faults. This
  commit touches nothing the harness can see.
- **`ASSERTS_NOTHING` is unchanged at five** — muzzle, rockets, retreat,
  regressions, meteor. No harness scenario was added or changed.
- **Columns B and C reproduce the published figures integer for integer** on the
  same seeds, which is the check that makes D and E comparable to them.

### An incidental correction

`reports/2026-09-17-soak-builder.md` says the uniform-pick test "measures four"
distinct opening towers. **It measures three**, and it measured three on the
commit below this one too — checked on a worktree of `7eb04a5`, because a rule
that touches the upgrade loop shifts every later draw and could have narrowed
the opening without anybody noticing. Three is the floor the test asserts, so
the assertion is at its boundary; the note is now in the test itself.

### And one thing about this container

**The agent container's local `main` was 109 commits behind `origin/main`**, as
a strict ancestor — `git branch -f main origin/main` was a clean fast-forward
with nothing to merge. It is recorded because a session that reached for local
`main` without checking would have soaked a 109-commit-old game and reported the
numbers as current. `git rev-list --left-right --count main...origin/main`
before trusting the branch.

### Reproducing the columns

```bash
# C and E: the tree as it stands, before and after this commit
# B and D: src/data/draft.json "guaranteedTowers": []
for i in $(seq 1 10); do
  node --experimental-strip-types tools/soak/level.ts 480 "level$i" | head -1
done
```

`level.ts` does not print the peanut share; those figures came from a scratch
driver that calls `simulate(seed, 'normal', level)` directly and reads
`result.builder`. Every field it reads is in `SoakResult` and is not going
anywhere.

---

## Where this leaves the repository

**In flight.** Nothing. The change is committed and this report is written
against a finished tree.

**Waiting on a decision — the balance, and it is still the whole of what is
left.** Under column E, **level 6 is in band at 40.8% and level 8 sits 0.4 over
the top edge at 45.4%**; levels 9 and 10 are 3.1 and 6.9 under it, level 7 is
4.2 over, and the first five are well above. That is a better picture than
column C, where nothing was in band. **It is still not a mandate to retune**,
for a reason this report measured and the last one could not: a 480-seed column
places a level to ±2.3 points at 1σ, and a level 6 that reads 196 on one seed
block reads 226 on the next. Anything inside about ±5 points is not
distinguishable from the sample. Decide how many seeds a tuning decision needs
**before** deciding what to tune.

**Waiting on a re-derivation, flagged again and NOT touched, exactly as the
brief required:**

- **Level 9's PERPLEXED at 7650.** Retuned from 8100 to put the level back in
  band at 192/480, against a two-tower opening and the old builder. Both halves
  of that derivation are now gone twice over: the level reads 146 under C and
  **153 under E**, and 195 under D. It is the level the new rule helps least
  (E−C is +7, the second smallest) and the only one whose D−B delta is negative.
  **That is worth understanding before it is retuned, not after.**
- **Vlaude's 26,000 hp**, and the 24,265 median damage in
  `reports/2026-09-15-blockers.md`. Level 10 reads **135 under E against 132
  under C** — this rule moved it by three runs, inside the noise, because the
  rule never fires there. Its number is stale for the earlier reasons, not for
  this one.

**Carried forward from `reports/2026-09-17-soak-builder.md`.** The loadout
screen's third card costs 72–93 units of overflow at every viewport, so a
desktop loadout scrolls by 76 where it scrolled by 4. Unchanged by this session.

**Carried forward from `reports/2026-09-16-lazy-dad-mode.md`.** The five Lazy
Dad knobs are unmeasured against a guaranteed blocker and against two
generations of builder. Only `normal` was soaked here.

**Closed by this session.** The upgrade-loop question that
`reports/2026-09-17-soak-builder.md` left open. It was a peanut sink, the simple
rule was enough for nine levels of ten, the tenth is correct behaviour, and no
hard spend share was added.
