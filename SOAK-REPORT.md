# Soak report

Newest first.

---

## 2026-09-17 (later) — The soak's player stops tiering the wall

### ⚠ THE SAME WARNING AGAIN, ONE COMMIT LATER

**Every figure in every section below this one — the one directly beneath it
included — was produced by a different player.** The builder gained a **third**
role rule: while any tower that shoots is below its top tier, nothing that does
not shoot is upgraded. **The GAME did not change: no file under `src/` is
touched.** Re-measure rather than compare. `reports/2026-09-17-soak-builder-spend.md`.

### Why there is a third rule

The section below measured it: the cap bounds the **pads**, not the **peanuts**,
and the upgrade loop tiered every tower the board owned, a blocker included.
Level 6 capped its pads at a fifth and still sent **29.5%** of its tower peanuts
through towers that can never fire. A human buys a wall and leaves it.

### Four columns, 480 seeds (1–480), same seeds throughout, `normal`

| level | B guar-off / old | C guar-on / old | **D guar-off / NEW** | **E guar-on / NEW** |
|---|---|---|---|---|
| 1 | 440 | 434 | 450 | **456 (95.0%)** |
| 2 | 266 | 218 | 292 | **277 (57.7%)** |
| 3 | 436 | 431 | 440 | **447 (93.1%)** |
| 4 | 327 | 314 | 346 | **335 (69.8%)** |
| 5 | 262 | 274 | 263 | **279 (58.1%)** |
| 6 | 204 | 99 | 241 | **196 (40.8%) IN BAND** |
| 7 | 204 | 135 | 247 | **236 (49.2%)** |
| 8 | 207 | 154 | 238 | **218 (45.4%)** |
| 9 | 208 | 146 | 195 | **153 (31.9%)** |
| 10 | 214 | 132 | 216 | **135 (28.1%)** |
| **all** | 2768 | 2337 | 2928 | **2732** |

**91.6% of the C−B gap closed** (E−C is +395 of 431). Read the other way, the
guarantee still costs **196 runs** under the new builder against 431 under the
old, so **54.5% of its measured cost was the peanut sink** and the rest is the
pad it occupies.

**D does not reproduce B — it is +160, and +175 on a second seed block.** A
guarantee-off board is not a blocker-free board: the Beacon drafts at weight 3
regardless, so B's boards sank 11–19% of their peanuts into towers that never
fire and the rule closes that too. Every level's D−B delta reproduces within ±5
runs across two independent blocks, so it is the rule and not the sample.

**Peanut share under E, against the 17.1% guarantee-off reference:** 4.1, 9.8,
12.5, 12.3, 5.9, **5.1**, 7.0, 6.9, 8.6, **22.1**. Nine of ten below it. Level
10 alone is above, and it is not a leak — its blocker upgrades are all bought
**after** every gun on the board is maxed, which is what a person does. The
simple rule was sufficient; **no hard spend share was added to `builder.json`.**

### ⚠ AND 480 SEEDS IS WORTH ±11 RUNS

Same code, same config, level 6 across four 480-seed blocks: **196, 211, 226,
208** under E and **99, 119, 129, 110** under C. Sample sd 11.3 and 11.1, a
binomial σ of 10.9 and 9.4, and a strided sample lands mid-pack — ordinary
sampling noise, larger than these tables look. **1σ ≈ 2.3 points against a
ten-point band.** Aggregates are worse, not better, because the ten levels share
the seeds: column B's total moved +107 between blocks under identical code.
**Compare columns on the same seeds; never compare a column to a number from a
different seed set.**

---

## 2026-09-17 — The soak's player learns that towers have roles

### ⚠ EVERY FIGURE IN EVERY SECTION BELOW THIS ONE WAS PRODUCED BY A DIFFERENT PLAYER

**They are not comparable to anything measured from this commit on.** The
simulated player chose what to build with `rng.pick(affordable)` — a uniform
pick over everything it could afford, with no concept of what a tower is for.
It now has two role rules. **The GAME did not change: no file under `src/` is
touched.** The instrument did.

So a number from an earlier section and a number from this one differ by an
unknown mixture of the game and the builder, and there is no way to separate
them retrospectively. **Re-measure rather than compare.** That applies to every
per-level rate below, to `claude/context.md`, to the ten numbers in `CLAUDE.md`,
and to every boss health derived from a win rate — **Vlaude's 26,000 and level
9's PERPLEXED at 7650 included**.

See `reports/2026-09-17-soak-builder.md`.

### Why the builder had to change

It was survivable while the pool was almost all damage. It stopped being
survivable when the Ima Dummy Tower became a guaranteed opener (one section
down): the player then put a zero-damage blocking tower on roughly one pad in
three, on every board, from wave 1. **`shelter` — the Beacon, +30% and zero
damage — has had the same flaw at weight 3 for as long as it has existed**,
smaller and never separated from the tuning it distorted.

Mean zero-damage towers standing at the end of a run, 120 seeds a level:

| | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|---|---|---|---|---|---|---|---|---|
| pads on the board | 7 | 15 | 15 | 14 | 14 | 18 | 22 | 19 | 15 | 12 |
| old builder | 1.71 | 4.17 | 3.78 | 3.10 | 3.77 | **5.87** | **5.78** | 4.91 | 4.01 | 3.49 |
| **new builder** | 0.76 | 2.66 | 2.56 | 1.34 | 1.79 | 2.94 | 3.57 | 2.23 | 2.42 | 1.78 |
| **the cap** | 1 | 3 | 3 | 2 | 2 | 3 | 4 | 3 | 3 | 2 |

Level 6 spent a third of an eighteen-pad board on towers that do not shoot. It
now spends a sixth.

### The rules, and the cap

Two rules and deliberately only two; past them the pick is the same uniform
`rng.pick` it always was, because a builder that placed towers *well* would
flatter whatever tuning it suited and stop being a neutral instrument.

1. **`cap = max(min, floor(pads × padShare))`**, padShare 0.2 and min 1 —
   **derived from pad count, not fixed**, because the boards run from 7 pads to
   22 and one number on both would be two different rules. Capped with no gun
   affordable for the pad in hand, the pad is skipped and the peanuts kept.
2. **The board gets a gun before anything else.** While nothing on it deals
   damage the pick is restricted to towers that do.

Zero-damage is read off `damage` in `towers.json`, not a new field, so a tower
retuned to zero falls under the cap on its own. `supportonly` is **exempt** and
has to be — its whole pool is the Beacon, so a cap there would turn the
deliberately-broken player into `nobuild`. The knobs live in
**`tools/soak/builder.json`, not `src/data/`**: a number that changes what the
soak measures is not a balance number, and one found under `src/data/` would
reasonably be read as a game rule and tuned against.

### Three columns, 480 seeds, same seeds throughout, `normal`

`A` is the state of `main` before this change (guarantee on, old builder) and
reproduces its published figures integer for integer. `B` sets
`guaranteedTowers: []` and is the honest test of the new builder against the
**pre-guarantee** baseline. `C` is what the game now is.

| level | pre-guarantee baseline | A guar-on / old | **B guar-off / new** | **C guar-on / new** |
|---|---|---|---|---|
| 1 | 428 (89.2%) | 405 (84.4%) | **440 (91.7%)** | **434 (90.4%)** |
| 2 | 255 (53.1%) | 218 (45.4%) | **266 (55.4%)** | **218 (45.4%)** |
| 3 | 422 (87.9%) | 422 (87.9%) | **436 (90.8%)** | **431 (89.8%)** |
| 4 | 299 (62.3%) | 328 (68.3%) | **327 (68.1%)** | **314 (65.4%)** |
| 5 | 218 (45.4%) | 343 (71.5%) | **262 (54.6%)** | **274 (57.1%)** |
| 6 | 210 (43.8%) | 83 (17.3%) | **204 (42.5%)** | **99 (20.6%)** |
| 7 | 198 (41.2%) | 133 (27.7%) | **204 (42.5%)** | **135 (28.1%)** |
| 8 | 184 (38.3%) | 146 (30.4%) | **207 (43.1%)** | **154 (32.1%)** |
| 9 | 192 (40.0%) | 119 (24.8%) | **208 (43.3%)** | **146 (30.4%)** |
| 10 | 195 (40.6%) | 117 (24.4%) | **214 (44.6%)** | **132 (27.5%)** |
| **all** | 2601 (54.2%) | 2314 (48.2%) | **2768 (57.7%)** | **2337 (48.7%)** |

**B passes the honest test.** Aggregate +3.5 points, mean +16.7 runs a level,
nine of ten up, largest move +44 (level 5), only one level down (−6, level 6) —
and **the same five levels in band as the baseline: 6, 7, 8, 9 and 10.** That
is what removing a uniform, pre-existing waste looks like; a builder that had
started flattering something would move one level a long way and leave the rest.
Level 5's +44 is the expected one: it is the board a blocker helps most. **Level
10 at 44.6% is 0.4 points from leaving the band**, which is worth knowing before
anything else moves.

**Under C, no level is in the band.** L6 −14.4, L7 −6.9, L8 −2.9, L9 −4.6 and
L10 −7.5 below it; L2 is 0.4 above the top edge and the rest are well above. The
cap recovered **+23 runs, +0.5 points** of the −287 the guarantee cost.

**Level 5's −69 from A to C is the mirror of its +44 in B**: the old builder
read a badly inflated 71.5% there and 57.1% is a truer number for the same board.

### The cap was not enough, and the reason is measured

It halves the zero-damage **pads** and closed only a quarter of the
**board-DPS** gap. Median board DPS at the top of the final wave, 120 seeds:
level 6 reads 356 (A), 382 (C), 447 (B); level 10 reads 519, 542, 625.

0.53 of a pad separates C from B on level 6 and 17% of board DPS separates them,
so the peanuts were counted instead. **The upgrade loop tiers EVERY tower the
board owns, zero-damage ones included.** Median share of tower peanuts sunk into
towers that will never fire:

| | L6 | L7 | L10 |
|---|---|---|---|
| **C guarantee on** | **29.5%** | **28.2%** | **21.2%** |
| B guarantee off | 17.7% | 16.5% | 15.9% |

The board caps the pads at a fifth and still sends three peanuts in ten through
a tower that cannot shoot. **The remaining artefact is a peanut sink in the
upgrade loop, not a pad-share problem** — reported rather than fixed, and
`SoakResult.builder.zeroDamageSpend` / `.towerSpend` now measure it.

**So an unknown but substantial part of the C−B gap is still instrument. Do not
retune a level to chase column C.**

### Stale, flagged

**Level 9's PERPLEXED went 8100 → 7650** four commits ago to put the level back
in band at 192/480. Both halves of that derivation are gone — a two-tower
opening and the old builder — and the level reads 208 under B and 146 under C.

## 2026-09-17 — The HUD cleanup moved nothing

**All ten levels, 480 seeds, normal, identical integers.** The four HUD changes
of 2026-09-17 — the floating damage numbers and ordinary hit sparks removed, the
hero chip's contents made to track their box, the bottom row narrowed, the wave
counter moved to the top-left stack — touch presentation, layout and a damage
helper's ARITY, and none of them touch simulation. Re-soaked to prove it:

**Run TWICE, against two baselines**, because `main` shipped the guaranteed Ima
Dummy Tower while this branch was being verified and every level's integer moved
with it. Against `f3d597d`, which the branch was cut from:

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| `f3d597d` | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | 192 | 195 |
| measured | **428** | **255** | **422** | **299** | **218** | **210** | **198** | **184** | **192** | **195** |

and again on the merged tree, against what `main` carries today:

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| `b0150d5` | 405 | 218 | 422 | 328 | 343 | 83 | 133 | 146 | 119 | 117 |
| measured | **405** | **218** | **422** | **328** | **343** | **83** | **133** | **146** | **119** | **117** |

The one change that COULD have leaked is `damageEnemy`'s fifth parameter and
`Enemy.hurt`'s third — `showNumber` — being removed, which moved `pierce` up a
position at fifteen call sites. Twenty identical integers is what says it did
not.

`reports/2026-09-17-hud-cleanup.md`.
---

## 2026-09-16 — Every run opens with the Ima Dummy Tower, and the band empties

### The headline

**The brief's premise was that every level would get easier. Seven of ten got
harder, and no level is inside the 35–45% band any more where five were.** The
aggregate goes 2601/4800 → 2314/4800, 54.2% → 48.2%.

The Ima Dummy Tower used to be draftable on level 1 alone. It is in the shared
pool and in `draft.json`'s `guaranteedTowers` now, so every run on every level
opens with it in a third slot on top of the two drawn cards. See
`reports/2026-09-16-dummy-tower-guaranteed.md`.

**And it is the GUARANTEE rather than the pool entry that does it**, which is why
there are three rows below. Putting the tower in the shared pool — draftable
everywhere, guaranteed nowhere — is worth **+43 runs over 4800** and leaves **the
same five levels in band**. Guaranteeing it in the opening hand is worth
**−330** and empties the band.

**Every column here was measured on the merged tree**, after `main`'s level 9
retune and the Lazy Dad knobs. An earlier pass measured against `fe6ec82` and its
level 9 figures are superseded; nothing else moved.

### The before and after, 480 seeds, `tools/soak/level.ts <n> <level>`

`pool` is `imaDummy` in the shared `towerWeights` with `guaranteedTowers: []`.
`guaranteed` is what shipped. Difficulty normal, seeds 1..480 throughout.

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| before (`f3d597d`) | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | 192 | 195 |
| pool only | 428 | 253 | 429 | 335 | 268 | 177 | 205 | 189 | 170 | 190 |
| **guaranteed** | **405** | **218** | **422** | **328** | **343** | **83** | **133** | **146** | **119** | **117** |
| % before | 89 | 53 | 88 | 62 | 45 | 44 | 41 | 38 | 40 | 41 |
| **% after** | **84** | **45** | **88** | **68** | **72** | **17** | **28** | **30** | **25** | **24** |

The `before` row reproduces every figure published in this file, level 9's new
192/480 from the retune one section down included, which is what makes the rows
comparable. (The brief's baseline list gave 200 and 191 for levels 8 and 9; both
predate the flank lane.)

### Which levels left the 35–45% band, and by how much

| | before | after |
|---|---|---|
| **inside the band** | **6** (43.8%), **7** (41.2%), **8** (38.3%), **9** (40.0%), **10** (40.6%) | **none** |
| at the top edge | 5, +0.4 | **2, +0.4** |
| above | 1 +44.2, 2 +8.1, 3 +42.9, 4 +17.3 | 1 **+39.4**, 3 **+42.9**, 4 **+23.3**, 5 **+26.5** |
| below | none | 6 **−17.7**, 7 **−7.3**, 8 **−4.6**, 9 **−10.2**, 10 **−10.6** |

Level 5 climbed 26.1 points out of the band; level 2 came 7.7 points down into
touching distance of it. **Nothing was retuned** — this section is the damage
report, and which lever fixes an out-of-band level is a separate decision.

**Level 9 is the sharpest case.** The section below retuned it back into band at
192/480 three commits ago, derived against a two-tower opening. This change takes
it to 119/480, within 6 runs of where the flank left it before that retune. The
two sections do not disagree; they measure two different opening hands.

### Level 2: it went the other way, and the Devil is untouched

`255/480 (53.1%) → 218/480 (45.4%)`, 0.4 points above the top edge and the closest
any level now comes to the band. It was **above** the band before, not below.

| | losses | on the Devil, wave 13 | on a Direct Report |
|---|---|---|---|
| before | 225 | 213 (95%) | 11 (5%) |
| after | 262 | 245 (94%) | 17 (6%) |

The extra tower did not make the Devil harder. It made the board that has to reach
him thinner. What DID change is what stopped getting out: Middle Managers fell
from 43 to 2 and Late Filers from 40 to 7 — the garrison is doing its job on the
small bodies, and the Devil does not care.

**The "21%" figure for level 2 is a stale 120-seed number** from the 2026-09-13
sections below, and it keeps being quoted. The published 480-seed figure has been
53% for weeks.

### Why the soak reacts this hard, and why it is an upper bound

`Sim.ts`'s scripted player chooses what to build with
`const id = rng.pick(affordable)` — **uniformly at random** from the unlocked types
it can afford whose range reaches the road. A guaranteed third opener that deals
**zero** tower damage therefore takes about **one pad in three from wave 1 on every
level**, where before it took none outside level 1.

That is a property of the soak's player rather than of a human's choice: a person
builds a garrison where blocking pays. So **−330 is a ceiling on what a player
will feel**, and the two levels that rose in spite of it are the more interesting
signal:

- **Level 5, +125 (45.4% → 71.5%).** The vampire level. Blockers hold the lane and
  its counterplay loop is chip damage holding lifesteal off; both halves of the
  change help it (+50 from the pool entry, +75 more from the guarantee).
- **Level 4, +29**, almost all of it the pool entry.

The heaviest falls are the DPS-starved boards — **6 (−127)**, **10 (−78)**,
**9 (−73)**, **7 (−65)** — which is the same story read the other way.

### Three things this did not measure

- **The soak's unlock schedule is not the game's**, and neither was touched.
  `Sim.ts` unlocks with `min(reserve.length, floor((waveIndex + 1) / 3))`, which on
  a 13-to-16-wave level reaches the whole reserve, while the game stops at
  `unlockedTypeCap`. Pre-existing, and it means the soak says nothing about whether
  the 5th type now arriving at wave 8 is worth what it costs.
- **`openingPurse` can now be smaller.** It floors at `min(drawnCosts) × margin`,
  and the dummy's 130 joins the set — so a Longshot and Grinder hand floors at
  130 × margin where it floored at 150 × margin. Still a correct floor, and a real
  tightening on expensive hands. It is inside the −330.
- **Only `normal` was soaked**, per this file's own rule. The five Lazy Dad knobs
  one section down are unmeasured against a guaranteed blocker.

Also worth recording because a wave-table note asserted the opposite: level 9's
`_lane` note argued that No-Pilot's blades measure zero because "the garrison tower
is drafted on level 1 alone, so no soaked board on this level has a soldier
standing anywhere". **That half is false from this commit on** — every soaked board
on every level now has a garrison in the opening hand, and the note says so. Its
conclusion (bosses come down the long arm) rests on the runway argument and is
unaffected.

---

## 2026-09-17 — Level 9 back into band, on one boss's health

### The headline

**Level 9 soaks at 192/480 on normal — 40.0% — against 113/480 when the flank
went live.** The middle of the 35-45% band. Levels 1-8 and 10 are **identical
integers on the same 480 seeds**, all nine of them.

**The flank is NOT reverted.** It is painted road now for its whole length —
0.20% of the lane is off-paint against 12.63% before — and it still carries a
share of every wave. See `reports/2026-09-17-level-9-retune.md`.

### Two levers, and the second did most of it

| step | level 9 | rate |
|---|---|---|
| the flank at `flankShare` 0.25 | 113/480 | 23.5% |
| `flankShare` 0.10 | 161/480 | 33.5% |
| PERPLEXED 8100 -> 7650 | **192/480** | **40.0%** |

**The share is the smaller lever and always was**: at 0.05 the level already
read 33%, because the road EXISTING costs most of it. Level 9's board is thin —
three of its fifteen pads cannot reach the trunk at all — and a second road
spreads it.

### The mini-boss sensitivity table

120 seeds each, one row at a time, `tools/soak/tune9.ts`. Scaling all four
together is useless for tuning: **x0.99 reads 34% and x0.90 reads 55%**.

| | | | | | |
|---|---|---|---|---|---|
| **hatGtt** health | 500 | 575 | **650** | 725 | 800 |
| win rate | 39% | 39% | **34%** | 34% | 35% |
| **cancer** health | 2500 | 2800 | **3100** | 3400 | 3700 |
| win rate | 38% | 36% | **34%** | 38% | 33% |
| **noPilot** health | 2800 | 3100 | **3400** | 3700 | 4000 |
| win rate | 36% | 35% | **34%** | 33% | 32% |
| **perplexed** health | 6800 | 7400 | **8100** | 8700 | 9300 |
| win rate | 52% | 49% | **34%** | 26% | 18% |

HAT-GTT and CANCER are flat and CANCER is not even monotone — both are inside
the +/-4.5 point noise of 120 seeds. NO-PILOT is mild and moves wave 12 only.
**PERPLEXED is the lever**: steep, monotone, and it moves wave 16's loss count
(7, 10, 28, 38, 47) while every other wave's stays identical.

**Armour was not touched on any of the four**, which is `difficulty.json`'s own
reasoning: armour changes which towers are viable rather than how hard the
level is.

### Choosing 7650 at 480 rather than at 120

| PERPLEXED | 7500 | 7600 | **7650** | 7700 | 7800 | 7850 | 7900 | 8100 |
|---|---|---|---|---|---|---|---|---|
| 480 seeds | 206 | 200 | **192** | 187 | 183 | 177 | 170 | 161 |
| rate | 42.9% | 41.7% | **40.0%** | 39.0% | 38.1% | 36.9% | 35.4% | 33.5% |

7650 reads 40% over 120 AND 40.0% over 480. **7800 reads 42% over 120 and 38.1%
over 480**, which is the trap `tune10.ts`'s header warns about and the reason
nothing here is published off a 120-seed pass.

### The full board

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | **9** | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| before | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | **113** | 195 |
| after | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | **192** | 195 |
| % | 89 | 53 | 88 | 62 | 45 | 44 | 41 | 38 | **40** | 41 |

**Wave composition was not touched** — the only edit to `waves.level9.json` is
the sixteen `flankShare` values.

**The repaint itself is worth about two points** of the move: PERPLEXED at 8100
with share 0.10 read 152/480 before the plate changed and 161/480 after, because
the corridor is a slightly straighter line than the authored join was and the
flank junction moved 5 px.

---

## 2026-09-16 — Lazy Dad Mode made genuinely easy, and normal held byte for byte

`src/data/difficulty.json` carries seven knobs instead of two. The five new ones
— kill income, wave interval, hero respawn, ability cooldown and a **uniform
enemy health scalar including bosses** — are **1.0 on `normal` and on
`try-hard`**, and `Difficulty.ts` returns its input by an early return when a
multiplier is exactly 1, so the no-op is exact rather than a rounding that lands
on the same integer today.

**Lazy Dad Mode, 480 seeds, `tools/soak/level.ts 480 level<n> lazy-dad`:**

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| lazy-dad | 98.3% | 96.5% | 99.8% | 99.0% | 89.8% | 94.6% | 94.0% | 95.8% | 94.0% | 86.7% |
| normal | 89.2% | 53.1% | 87.9% | 62.3% | 45.4% | 43.8% | 41.3% | 38.3% | 40.0% | 40.6% |

Shipped multipliers: lives 3.0, purse 1.5, kill income 1.1, wave interval 1.5,
hero respawn 0.7, ability cooldown 0.85, enemy health 0.7.

**`normal` re-soaked at 480 on all ten and unchanged, every integer:** 428, 255,
422, 299, 218, 210, 198, 184, 192, 195. **`try-hard` likewise:** 426, 255, 403,
298, 174, 198, 139, 35, 151, 192.

**WHY A HEALTH SCALAR EXISTS AT ALL**, against this file's own long-standing
objection. Two levels fail on a boss DPS check, and on those the two old knobs
do nothing — measured on the same 480 seeds:

| | level 2 | level 10 |
|---|---|---|
| normal | 255/480 — 53.1% | 195/480 — 40.6% |
| lives **×4**, purse **×3**, nothing else | 264/480 — 55.0% | 201/480 — 41.9% |
| enemy health **×0.8 alone** | 388/480 — 80.8% | 325/480 — 67.7% |

Quadrupled lives and a tripled purse move level 2 by 1.9 points. A fifth off
every enemy's health moves it by 27.7. There is still **no armour, enemy damage
or enemy speed scalar** — that is what the original objection is actually about
and it stands.

**Levels 1, 2, 3 and 4 sit ABOVE the 85-95% target band on Lazy Dad Mode and no
global multiplier brings them in.** Levels 1 and 3 are 89.2% and 87.9% on
`normal`, so an easier mode is at least that by construction.

**The simulator cannot see `waveIntervalMultiplier`** — it has no ready phase —
so every Lazy Dad figure above is measured without the knob that most helps a
young player. `tools/harness/run.sh lazydad` is what measures all five, off a
live run.

See `reports/2026-09-16-lazy-dad-mode.md`.

---

## 2026-09-16 — Level 9 grows a third lane, and it costs sixteen points

### The headline

**Level 9 soaks at 113/480 on normal — 23.5% — against 191/480 before the flank.**
Every other level is **identical on the same 480 seeds**, all nine of them, integer
for integer. The flank is the only thing that moved and level 9 is the only level
that moved.

**23.5% is BELOW the 35-45% band and is published as a measurement, not as a
setting anybody is happy with.** The share that produced it is
`flankShare: 0.25` on all sixteen waves of `waves.level9.json`, which is the value
the brief asked to start at. It is one edit away from any other value, which is
why it lives in the wave table.

### The before and after, 480 seeds, `tools/soak/level.ts <n> <level>`

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | **9** | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| before | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | **191** | 195 |
| after | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | **113** | 195 |
| % after | 89 | 53 | 88 | 62 | 45 | 44 | 41 | 38 | **24** | 41 |

The baseline column reproduces every published figure in this file, level 9's
**191/480 included**, which is what makes the two columns comparable.

### The share, swept

120 seeds to find the shape, 480 to publish. Same seeds throughout.

| share | 0.05 | 0.10 | 0.15 | 0.19 | **0.20** | 0.25 | 0.35 |
|---|---|---|---|---|---|---|---|
| 120 seeds | 33% | 32% | 31% | 29% | 23% | 23% | 21% |
| 480 seeds | — | **32% (152/480)** | 31% (149/480) | — | — | **23.5% (113/480)** | — |

**THE CLIFF AT 0.20 IS THE SOAK'S OWN THRESHOLD, NOT THE GAME'S.**
`Sim.ts`'s `MINOR_LANE_SHARE` is 0.2: a lane carrying less than a fifth of the
level's bodies is kept out of the scripted player's pad-ranking, so a share of
0.19 leaves the board it always built and a share of 0.20 makes it cover the
flank first. A human player has no such step. Read the two sides of the cliff as
two different boards rather than the level changing between 0.19 and 0.20.

### Why it is harder at all

Level 9's own map note has said for weeks that the board "holds LESS effective
DPS than fifteen pads suggests": three of its fifteen pads could not reach the
route at the shortest tower range, and only three cover two passes of it. The
flank spreads that thin board over a second road. Five chips can cover the flank
— 8, 9, 12, 13 and 15 — and **pad 15 could cover nothing at all before**, but
covering the flank is peanuts not spent on the trunk.

The flank is also a **shortcut**: 494.1 px against the 528.1 px of trunk it
replaces, 6.4% shorter. Small — the south arm saves 54.6% over the north and IS
the cheap road — but it is shorter rather than longer, so it does not pay for
itself in walking time either.

### THE BALANCING RECOMMENDATION

**Drop the share to 0.10 and level 9 reads 152/480 = 32%**, three points under
the band instead of twelve. That is the number to take if level 9 is meant to
stay where it was tuned. Bringing it the rest of the way needs a mini-boss health
pass, which is a separate job and was not attempted here.

### One thing in the simulator changed, and it had to

`laneTraffic` in `Sim.ts` walked `transferFrom`, which is documented as returning
**the first arm at a split**. On a plain merge that is the only arm; on a split it
handed the first arm 100% of the level's bodies and every other arm **zero**. So
level 9's flank measured 0% traffic with a quarter of every wave on it. It now
follows every arm by its share, taking the share from the wave's own `flankShare`
where the map names an optional branch and from the map's split weights
otherwise.

**It moves no level but 9.** Level 5 is the only other splitting map and its
crossroads arms already carry direct spawns well over the threshold, so the
correction changes nothing there — checked, not assumed: level 5 is 218/480 in
both columns above.

---

## 2026-09-14 — Vlaude's powers fire, and his health comes down by ten thousand

### The headline

**Level 10 soaks at 40.6% over 480 seeds on normal — 195/480 — inside the 35-45%
band, with Vlaude at 26,000.** He was 36,000. Levels 1 to 9 are **identical on
the same 480 seeds**, every one of them.

**The 36,000 was not wrong; it was measured on a different level.** It was taken
with Vlaude walking the lane from the gate and NOT ONE MANIPULATION FIRING,
because `systems/Vlaude.ts` was the rules and `GameScene` did not play them. The
scene plays them now, and the soak fires the three of the six it can express. At
36,000 with those three live, the same 120-seed pass reads **12.5%**.

The board did not change. The boss did not change. What changed is that the
level does what its own data always said it did.

**METHOD: 480 seeds, every seed in normal mode, Cory on every seed** —
`node --experimental-strip-types tools/soak/tune10.ts 480 level10 normal cory`.
That is what every published per-level figure in this file is, and it is
measured rather than assumed: the same driver returns level 8's published
200/480 and level 9's 191/480 as the same integers. No hero's values were
touched.

### The sensitivity table

480 seeds each, same method.

| Vlaude health | 20,000 | 22,000 | 24,000 | **26,000** | 28,000 |
|---|---|---|---|---|---|
| win rate (480, normal, Cory) | 66.0% | 56.9% | 48.3% | **40.6%** | 35.6% |

The coarse 120-seed pass that found the knee: 10,000 → 91.7%, 14,000 → 88.3%,
20,000 → 60.8%, 22,000 → 50.0%, 23,000 → 45.8%, 24,000 → 40.8%, 25,000 → 34.2%,
26,000 → 32.5%, 36,000 → 12.5%.

**120 AND 480 DISAGREE BY EIGHT POINTS ON THE CHOSEN VALUE** — 26,000 reads
32.5% over 120 and 40.6% over 480 — which is why iterating is done at 120 and
publishing never is. `tune10.ts`'s own header warned about a 6.4-point swing;
this is a bigger one.

### THE CAVEAT, AND IT IS THE WHOLE OF IT: THREE POWERS OF SIX

The runner fires three and **cannot express the other three at all**. This is
read out of the source rather than asserted, and it is unchanged from the
previous report except that three have moved from the first list to the second.

| power | in the sim | why |
|---|---|---|
| `speedAlter` | **yes** | a third multiplier slot on the sim's enemy, beside `speedScale` and `reviewSpeed`, through `hasteMultiplier` / `HASTE_OFF` / `hasteSeconds` |
| `duplicateEnemy` | **yes** | through `copyTargets` and `copyCount`, with the copy carrying depth 1, so a duplicate cannot duplicate in either |
| `createEnemies` | **yes** | real rows from the pool, at the gate, staggered by `intervalSeconds` and under `maxAliveFromThisPower` |
| `buildLock` | **no** | `BuildSystem` models `occupied` and nothing else. There is no lock state for `isFree` to read; the nearest thing it has is a Glitch Bug DESTROYING a tower, which frees a pad and can never forbid one |
| `generateWall` | **no** | the sim's hero is a fixed point at `totalLength * 0.5` and never moves, so ground denied to the hero and to a garrison is invisible to it |
| `generateWeapon` | **no** | there is no tower health, so a turret that suppresses a tower over time is a third thing this file cannot say |

Teaching it those three is a change to the SIMULATOR rather than to the level,
and it was decided against deliberately.

**THE CONCLUSION THIS PARAGRAPH USED TO DRAW IS WITHDRAWN, 2026-09-15.** It said
"26,000 is tuned against a board that is EASIER than the one the player gets, and
the real fight is harder than 40.6%", and asked to be quoted with that sentence
attached. It does not follow from the rules, and the rules were checked rather
than reasoned about — see `reports/2026-09-15-blockers.md`. Against a board with
every pad built on, which is what the soak's own median board IS at the final
wave (12 of 12, `freePads: 0` on every seed measured):

| power | what it costs a FULL board | where that is written |
|---|---|---|
| `buildLock` | **nothing.** `lockedPadStillFires()` returns true, always. It locks pads, and a full board has nothing left to build | `systems/Vlaude.ts` |
| `generateWeapon` | **nothing. The cast is skipped.** `weaponPad` needs a pad that is neither occupied nor locked, and returns null when there is none | `systems/Vlaude.ts`, `GameScene.castWeapon` |
| `generateWall` | **no tower fire at all.** `tickVlaudeWalls` has exactly ONE damage source and it is the hero. A wall denies ground to the hero and to a garrison's rally, which is real and is not board DPS | `GameScene.tickVlaudeWalls` |

`tests/level10.test.ts` asserts all three, including the one-damage-source count
on the wall, so a change that makes a tower able to shoot a wall fails and brings
somebody back here.

**What the soak DOES understate is the fight for an INCOMPLETE board**, and that
is a narrower claim than the one withdrawn: a countermeasure takes a free pad
from wave 11 and holds it until one hero chews through 1,400 hp at armour 8, and
it puts a tower out for 8 seconds at a time while it stands. A board with a spare
pad is measurably worse off than the soak says. A board with none is not.

The three that DO run go through the same `systems/Vlaude.ts` functions
`GameScene` calls — `armedAt`, `tickSchedule`, `copyTargets`, `copyCount`,
`hasteMultiplier`, `hasteSeconds` — so the pacing, the global cooldown, the
combination rows on waves 14 and 16 and the no-duplicate-of-a-duplicate rule are
one implementation and not two.

### Levels 1 to 9, same seeds, nothing moved

`tools/soak/Sim.ts` grew three fields on its enemy struct and one tick
function. `vlaudeRules` answers null on every level but the tenth, so
`tickVlaude` returns on its first line there — and that is measured rather than
argued:

| level | published | this pass | |
|---|---|---|---|
| level1 | 428/480 (89.2%) | 428/480 (89.2%) | identical |
| level2 | 255/480 (53.1%) | 255/480 (53.1%) | identical |
| level3 | 422/480 (87.9%) | 422/480 (87.9%) | identical |
| level4 | 299/480 (62.3%) | 299/480 (62.3%) | identical |
| level5 | 218/480 (45.4%) | 218/480 (45.4%) | identical |
| level6 | 210/480 (43.8%) | 210/480 (43.8%) | identical |
| level7 | 198/480 (41.3%) | 198/480 (41.3%) | identical |
| level8 | 200/480 (41.7%) | 200/480 (41.7%) | identical |
| level9 | 191/480 (39.8%) | 191/480 (39.8%) | identical |

**Levels 1 and 3 are still outside the band at 89% and 88%.** Pre-existing,
carried forward again, and not touched by this pass.

> **LEVEL 8 IS 184/480 (38.3%) SINCE 2026-09-15, not 200/480.** Its east arm
> climbed 76 px to the fork and was sent straight back down — a 135-degree
> hairpin that live play saw as the enemy reversing — and removing the detour
> took 183 px of walking under a 19-pad board's guns out of the east route.
> 38.3% is in band and nothing was retuned. The 200 above is the figure this
> pass measured and is correct for the map as it stood; it does not carry.
> See `reports/2026-09-15-blockers.md`.

### What the leaks say

At 26,000, over 480 seeds: `vlaude` 258, `packet` 247, `dataBug` 219,
`serverWalker` 189, `corrupt` 137, `mashDroneCameraman` 25. Median waves
reached 17, min 4, max 18.

**The rank order changed, and that is the powers showing up in the numbers.**
Before, the escort barely leaked at all — `vlaude` 281, `packet` 164, `corrupt`
107, `dataBug` 92 — because nothing was hastening it, doubling it or adding to
it. Level 9's units now get through in numbers that put them within thirty of
the boss himself.

Full write-up: `reports/2026-09-14-level-10-the-fight.md`.

---

## 2026-09-13 — Level 8 re-topologised, and the gate measured with a denominator

### The headline

**Level 8 soaks at 42% over 480 seeds on normal — 200/480 — inside the 35-45%
band.** Levels 1 to 7 and 9 are **byte-identical** on the same 480 seeds; level 8
is the only line that moved, 195/480 to 200/480.

**Its published win rate before this was measured on a board whose signature
mechanic touched one enemy in forty**, so the number was not wrong so much as
about a different game. The CEO's health is re-derived: 8,500 → **8,100**.

**HERO: CORY, every seed.** `tools/soak/level.ts` passes no hero and `simulate`
resolves that to `DEFAULT_HERO_ID`, the first row in heroes.json. It does not
rotate; `run.ts` and `eli.ts` do. No hero's values were touched.

### What changed on the board

One entrance (west) and two exits (east, south) became **two entrances (west,
east) and one exit (south)**. The three traced arms are the same three arms: the
east branch is the tracer's own polyline walked the other way. Route lengths:
west 3,646 px (unchanged), east 2,741 px.

**The Performance Review beam did not move.** It is at `south` distance 142.68,
where it always was. What moved is the road around it: the arms now feed the
south arm instead of diverging from it, so the beam stands on the only way out.

### The gate, with its denominator

**The 2.6% figure in the previous report is a share of ENEMIES, not of lane.**
It was `reviewed / (kills + leaks)` — enemies buffed, over enemies that resolved
in a run. The trigger has no length to be a share of: it is a single distance
along the lane polyline, and its keys are `["lane","distance","at"]`.

| per run, 40 seeds | before | after |
|---|---|---|
| resolved (killed or leaked) | 239.0 | 160.1 |
| ever on the gate lane | **10.6** | **86.6** |
| reached the gate distance | 9.2 | 83.9 |
| …and eligible (non-boss) | 8.3 | 83.4 |
| **actually reviewed** | **6.1** | **80.8** |
| reviewed / resolved | **2.6%** | **50.5%** |
| reviewed / eligible-at-the-beam | 73.5% | **96.9%** |

**100% of enemies is not reachable and it is worth saying why.** An enemy killed
before the beam never crosses it, and 97.6% of everything spawned dies somewhere;
that is what the towers are for. The achievable target is *every eligible enemy
that reaches the beam crosses it*, and that is at **96.9%**. The residual 3.1% is
named below.

`tools/soak/level.ts` now prints the pair rather than the numerator:

```
performance reviews: 81.9 a run of the 84.3 eligible enemies that reached the beam (97.2%)
```

### Which of the three hypotheses it was: none of them

**H1 — the trigger volume is too small or off the lane polyline. NO.** It is not
a volume. It is a distance, and the point it declares sits on the polyline at
that distance to within **0.0113 px**.

**H2 — a point-in-volume test evaluated once per tick, so a fast enemy steps over
it between frames. NO, and the proposed fix is the existing implementation.**
`crossedGate` is already a segment test against the tick's movement segment
(`from < d <= to`). Driven directly:

| step | fires? |
|---|---|
| 0 → 1 (short of it) | no |
| 142 → 143 (across it) | **yes** |
| 0 → 5000, a single step faster than anything in the game | **yes** |
| 200 → 4000 (starts past it) | no |
| 143 → 142 (walking backwards) | no |

**H3 — it fires only for a subset of enemy types. YES, partially, and both parts
are by design.** After the re-topology:

| type | reached the beam | reviewed |
|---|---|---|
| intern | 61.55 | **61.55** |
| consultant | 7.72 | **7.72** |
| manager | 6.90 | **6.90** |
| hr | 4.15 | **4.15** |
| officeDrone | 3.10 | 0.50 |
| ceo | 0.50 | 0.00 |

Every ordinary type is exact. The CEO is boss-immune by `reviewable()`. The
drones are **summoned by the CEO at his own position**, and 66% of them appear
already past the line — median join distance 299 against a beam at 142.68, max
1,476. `level8.json`'s `_once` note describes that case as intended. Together
they are the whole 3.1% shortfall.

**THE DOMINANT CAUSE WAS PLACEMENT, which is not on the list.** Before the
re-topology only 10.6 of 239 enemies a run ever set foot on the gate's lane: the
beam was on one of two arms, downstream of 1,342 px of shared road and most of a
19-pad board's killing power.

### Sensitivity, 120 seeds, one variable at a time

Every row restores both JSON files from a pristine copy, changes one field,
soaks, and restores again. All rows taken at the shipped CEO health of 8,100.

**The buff does something now.** `speedMultiplier` at 1.0 is the buff switched
off:

| `performanceReview.speedMultiplier` | 1.0 | 1.1 | **1.2** | 1.4 | 1.7 | 2.2 |
|---|---|---|---|---|---|---|
| win rate | 50% | 43% | **40%** | 33% | 20% | 13% |
| buffed / eligible at the beam | 94/97 | 89/92 | 83/85 | 65/67 | 52/53 | 42/43 |

**The buff is worth ten points of win rate.** Before the re-topology this table
would have been flat, and a flat table would have said nothing about the buff —
only that nothing was walking through it.

**The control, and it is exactly flat, which is the right answer.**
`sizeMultiplier` is documented as render-only:

| `performanceReview.sizeMultiplier` | 1.0 | **1.1** | 1.5 |
|---|---|---|---|
| win rate | 40% | **40%** | 40% |

Three identical numbers on a field that is supposed to change nothing is what
makes the gradient in the table above trustworthy.

| `ceo.maxHealth` | 6500 | 7500 | 7900 | **8100** | 8300 | 8500 | 9500 | 10500 |
|---|---|---|---|---|---|---|---|---|
| win rate | 50% | 47% | 43% | **40%** | 37% | 36% | 26% | 18% |

| `intern.maxHealth` | 90 | 110 | 130 | 150 |
|---|---|---|---|---|
| win rate | 16% | 6% | 1% | **0%** |

**The level is intern-bound**, and steeply: 186 of its 261 enemies are interns,
and twenty extra health on each of them is the difference between a level and a
wall. The shipped 75 is untouched.

### Loss distribution, 480 seeds

| died in wave | count | share of losses |
|---|---|---|
| 4 | 95 | 34% |
| 5 | 85 | 30% |
| 6 | 21 | 8% |
| 7 | 23 | 8% |
| 8 | 10 | 4% |
| 14 (the CEO) | 46 | 16% |

**By the mouth the killing enemies came in through:**

| | lives lost | runs ended |
|---|---|---|
| **east** | 7,494 (**88%**) | 220 (**79%**) |
| west | 988 (12%) | 60 (21%) |

**The east mouth is far the cheaper way in, and this is the finding to carry
forward.** It is 2,741 px against the west's 3,646, and the east arm is only 36%
covered by pads against the south's 77% — so an enemy entering there walks a
shorter road past fewer guns. The wave table was NOT rebalanced for it: the brief
asked for counts and composition to be held so the re-soak measured the topology
and nothing else, and 88/12 is what that measures.

---

## 2026-09-13 — Level 9, and four mini bosses measured one at a time

### The headline

**Level 9 soaks at 40% over 480 seeds on normal — 191/480 — inside the 35-45%
band.** Levels 1 to 8 are **byte-identical** to `main` on the same 480 seeds.

```
level9 [normal]: 191/480 wins  (40%)
  lost after wave: w3x22 w4x60 w5x24 w6x7 w7x47 w11x42 w15x87
  what took the last life: perplexed 87 (30%)  corrupt 60 (21%)  cancer 43 (15%)
                           noPilot 42 (15%)  packet 24 (8%)  hatGtt 22 (8%)
                           dataBug 7 (2%)  serverWalker 4 (1%)
  regeneration put back 247520 health across the run set (516 a run)
  the flame did 52828 damage to the player's own units (110 a run)
  towers were switched off for 36264 tower-seconds (75.5 a run)
  the blades did 39744 damage to the player's own units (83 a run)
```

**HERO: CORY, every seed.** `tools/soak/level.ts` passes no hero, and
`simulate` resolves that to `DEFAULT_HERO_ID`, which is `heroes.json`'s first
row. It does not rotate; `run.ts` and `eli.ts` do. No hero's values were
touched by this work.

`lost after wave: wN` is `wavesReached`, which on a loss is the 0-based index of
the wave the run died in — so `w3` is a death **in wave 4**, which is HAT-GTT's.
The four gauntlet waves are 4, 8, 12 and 16.

### The bug that made the first three soaks worthless

**HAT-GTT's repair had never once run, and the soak reported a clean 38%.**

`tools/soak/Sim.ts`'s enemy state carries `health` and reads its maximum off
`e.def.maxHealth`; `tickRegens` passed `e.maxHealth`, which does not exist.
`health >= undefined` is false, `health / undefined` is `NaN`,
`NaN >= belowHealth` is false and `Math.min(heal, NaN)` is `NaN`, so the guard
declined to heal and nothing threw. A level was balanced against a boss whose
whole mechanic was inert — which is the third time this repository has recorded
that shape (level 4's Beacon aura, level 8's HR armour aura).

**FOUR COUNTERS NOW PRINT EVEN AT ZERO**, and which ones print is asked of the
LEVEL rather than of the number, because `> 0` cannot tell a mechanic that is
worth nothing from a mechanic that never ran:

| counter | printed when | level 9, per run |
|---|---|---|
| `regeneration put back` | the roster carries `regen` | 516 health |
| `the flame did` | the rules carry `flame` and the roster carries it | 110 damage |
| `towers were switched off for` | the roster carries `towerDisable` | 75.5 tower-seconds |
| `the blades did` | the rules carry `blades` and the roster carries `bladed` | 83 damage |

### And the blades were doing nothing, on level 9 AND on level 7

The blade counter read **exactly 0** the first time it was printed — and it read
0 on **level 7**, which was tuned against it.

The reason is structural rather than a typo. The blades are contact damage on
the player's own units, and on levels 2 to 9 there is only one such unit the sim
puts on the board: the hero. The garrison tower is drafted on **level 1 alone**,
via `extraTowerWeights`, so no soaked board on any other level has a soldier
standing anywhere — measured, `soldiers 0` across 60 seeds on both levels. And
the sim parks the hero at the midpoint of the MAIN lane. On level 9 the
No-Pilot spawned on `south`; the hero never came within **359 px** of it.

Level 9's half is fixed by moving No-Pilot to the long arm, which it wanted for
its own reasons (see below), and the blades now register 83 damage a run.
**Level 7's is not fixed and is not mine to fix here**: the hero's single
station is a documented approximation that every published win rate rests on,
and moving it would move all eight.

### Sensitivity, 120 seeds, one variable at a time

Every row restores both JSON files from a pristine copy, changes one field,
soaks, and restores again, so a row cannot carry the previous row's change.
`<-` marks the shipped value.

**HAT-GTT** — the repair is the fight; the armour is noise.

| `maxHealth` | 450 | 550 | 650 `<-` | 850 | 1050 |
|---|---|---|---|---|---|
| win rate | 45% | 43% | **40%** | 38% | 35% |

| `regen.heal` | 0 | 65 | 130 `<-` | 260 | 390 |
|---|---|---|---|---|---|
| win rate | 49% | 50% | **40%** | 35% | 35% |
| healed/run | 0 | 216 | 507 | 928 | 1012 |

| `armor` | 0 | 2 | 4 `<-` | 8 | 12 |
|---|---|---|---|---|---|
| win rate | 42% | 41% | **40%** | 43% | 41% |

| `flame.damagePerSecond` | 0 | 50 | 105 `<-` | 160 | 220 |
|---|---|---|---|---|---|
| win rate | 43% | 41% | **40%** | 32% | 33% |
| healed/run | 342 | 415 | 507 | 672 | 700 |

**CANCER** — the claw is the fight; the armour is noise.

| `maxHealth` | 2300 | 2700 | 3100 `<-` | 3500 | 3900 |
|---|---|---|---|---|---|
| win rate | 48% | 44% | **40%** | 38% | 36% |

| `armor` | 6 | 10 | 14 `<-` | 18 | 22 |
|---|---|---|---|---|---|
| win rate | 43% | 44% | **40%** | 42% | 40% |

| `towerDisable.duration` | 1.0 | 3.0 | 6.0 `<-` | 9.0 | 12.0 |
|---|---|---|---|---|---|
| win rate | 44% | 46% | **40%** | 43% | 37% |

| `towerDisable.cooldown` | 3.5 | 5.5 | 7.5 `<-` | 11.0 | 20.0 |
|---|---|---|---|---|---|
| win rate | 36% | 40% | **40%** | 46% | 44% |

**NO-PILOT** — speed is the fight; the blades barely register.

| `maxHealth` | 2600 | 3000 | 3400 `<-` | 3800 | 4200 |
|---|---|---|---|---|---|
| win rate | 42% | 42% | **40%** | 38% | 33% |

| `speed` | 34 | 46 | 58 `<-` | 70 | 82 |
|---|---|---|---|---|---|
| win rate | 43% | 42% | **40%** | 35% | 28% |

| `blades.damagePerSecond` | 35 | 70 `<-` | 140 | 210 |
|---|---|---|---|---|
| win rate | 38% | **40%** | 40% | 41% |
| blade damage/run | 52 | 90 | 126 | 126 |

| `blades.radius` | 20 | 45 | 74 `<-` | 110 | 150 |
|---|---|---|---|---|---|
| win rate | 38% | 38% | **40%** | 40% | 38% |

`blades.damagePerSecond = 0` is not in the table because `bladesFrom` throws on
it — a `blades` block with no damage is a mechanic declared and not configured,
and that assertion is correct. The 35 row is the low end instead.

**PERPLEXED** — every dial on this one moves the whole level.

| `maxHealth` | 7300 | 7700 | 8100 `<-` | 8500 | 8900 |
|---|---|---|---|---|---|
| win rate | 52% | 48% | **40%** | 33% | 29% |

| `armor` | 4 | 8 | 12 `<-` | 16 | 20 |
|---|---|---|---|---|---|
| win rate | 48% | 45% | **40%** | 37% | 34% |

| `towerDisable.duration` | 0.5 | 1.0 | 1.8 `<-` | 3.0 | 5.0 |
|---|---|---|---|---|---|
| win rate | 55% | 55% | **40%** | 28% | **4%** |

| `towerDisable.cooldown` | 1.2 | 2.0 | 2.6 `<-` | 4.0 | 8.0 |
|---|---|---|---|---|---|
| win rate | 24% | 35% | **40%** | 54% | 56% |

### The two flat tables, and what is behind them

HAT-GTT's and CANCER's armour rows are flat, and the brief this work was done
under says to find what controls the fight before picking a number. The armour
is **not** doing nothing — the escapes climb monotonically with it:

| | armour low | shipped | armour high |
|---|---|---|---|
| HAT-GTT escapes, /120 | 38 (armour 0) | 41 (4) | 47 (12) |
| CANCER escapes, /120 | 21 (armour 6) | 28 (14) | 40 (22) |
| deaths in wave 16 | 21-22 | 21 | 16-18 |

**What is flat is the win rate, and the reason is that this level is decided at
wave 16.** More armour on an early mini boss means more runs die early, which
means fewer runs reach PERPLEXED, which means fewer deaths there — the losses
move rather than multiply. So the earlier mini bosses' armour is chosen on FEEL
(what it does to the cheap early towers, which `Math.max(1, damage - armor)`
floors hard) and the win rate is set by PERPLEXED's three dials.

### Loss distribution, 480 seeds

| died in wave | count | share of losses | what it is |
|---|---|---|---|
| 4 | 22 | 8% | HAT-GTT |
| 5 | 60 | 21% | the wave after HAT-GTT, paying for its six-life leak |
| 6 | 24 | 8% | |
| 7 | 7 | 2% | |
| 8 | 47 | 16% | CANCER |
| 12 | 42 | 15% | NO-PILOT |
| 16 | 87 | 30% | PERPLEXED |

**PERPLEXED kills the player most often** — 87 of 289 losses take their last
life from it, and 87 more runs die in its wave. HAT-GTT takes the last life in
only 8% of losses but its leak is what wave 5 finishes: those 60 are its bill,
arriving one wave late.

### One wave change, for two reasons

**NO-PILOT moved from the south arm to the north.** South is 1,672 px against
north's 2,586, and No-Pilot is the fastest thing in the game at 58 px/s, so on
the short arm it reached the door in 29 seconds past a third of the guns and
walked out of 16 of 40 runs. It was also the lane on which its blades could
never touch anything (above). Every boss comes down the long arm now and the
escorts alternate, which is the more readable board as well.

### What Sim.ts models, and what it does not

MODELLED, sharing the scene's own modules rather than re-implementing them:
two entrance lanes merging into one tail, the interior exit and its per-enemy
life cost, HAT-GTT's repair (`systems/Regen.ts`), HAT-GTT's wall of text
(`systems/Flame.ts`, the same module level 6's Rooster uses), CANCER's and
PERPLEXED's tower disable (`systems/TowerDisable.ts`, including the destroy
case), NO-PILOT's blades (`systems/Blades.ts`).

NOT MODELLED: the hero moves (it is parked at the main lane's midpoint, which
is why the blades under-read), summoned fighters, any art, any animation, the
sprite swap during a repair, the electrical arcs, and the ending. The waves 2+
auto-start bonus is unmodelled, so every published rate here is a FLOOR.

---

## 2026-09-13 — Star Rain over the whole map, measured three ways

### The headline

**Star Rain is map-wide, and it is worth +2.7 to +11.5 points of win rate on
the hero-rotated shape and +22.3 to +73.1 on Eli's own seeds.** Nothing was
re-tuned. **The published Cory-pinned rates did not move at all** — they are
byte-identical before and after, on all eight levels.

**Hero rotation: all three, on the same seeds.** This is the first entry here
that is not Cory-only, because the change is to a hero the Cory-pinned driver
never fields.

```bash
node --experimental-strip-types tools/soak/eli.ts 480 out.json
```

`tools/soak/eli.ts` is new. `level.ts` pins `DEFAULT_HERO_ID`, so a change to
Eli cannot move a number it prints; `run.ts` rotates and dilutes by about 7×;
`heroes.ts` does both but stops at level 5 and reports Courtland. This runs the
same seeds three ways on every built level:

- **cory** — `DEFAULT_HERO_ID` on every seed. A CONTROL: Eli never takes the
  field, so a number that moves here is collateral.
- **rotated** — `run.ts`'s own rotation,
  `["cory","cory","cory","courtland","han","eli","bailey"]`. Eli plays
  `seed % 7 === 5`, which is **68 of 480**. This is the shape the aggregate is
  in.
- **eli** — Eli on every seed: the effect undiluted.

### The numbers

| level | cory-pinned (control) | rotated | eli-pinned |
|---|---|---|---|
| level1 | 89.2% → 89.2% **+0.0** | 73.1% → 79.6% **+6.5** | 56.2% → 95.2% **+39.0** |
| level2 | 53.1% → 53.1% **+0.0** | 40.4% → 48.5% **+8.1** | 18.3% → 79.2% **+60.8** |
| level3 | 87.9% → 87.9% **+0.0** | 66.2% → 77.7% **+11.5** | 26.9% → 100.0% **+73.1** |
| level4 | 62.3% → 62.3% **+0.0** | 61.7% → 68.3% **+6.7** | 45.6% → 93.8% **+48.1** |
| level5 | 45.4% → 45.4% **+0.0** | 37.7% → 41.0% **+3.3** | 33.8% → 56.0% **+22.3** |
| level6 | 43.8% → 43.8% **+0.0** | 27.1% → 29.8% **+2.7** | 9.8% → 38.1% **+28.3** |
| level7 | 41.2% → 41.2% **+0.0** | 38.8% → 45.0% **+6.2** | 37.9% → 73.3% **+35.4** |
| level8 | 40.6% → 40.6% **+0.0** | 38.5% → 46.9% **+8.3** | 33.8% → 89.6% **+55.8** |

**The control cross-checks against this document.** The cory column reproduces
the win rates published in the entries below, to the run: level4 299/480,
level5 218/480, level6 210/480, level7 198/480, level8 195/480. Same instrument,
same game; only Eli moved.

**The 35-45% band is a statement about the cory column, and it is unchanged.**
No level is outside it that was not outside it before.

### What moved, and what to do about it

Nothing was tuned to compensate, as the brief instructed. The two numbers worth
a decision are **level 3 at 100% and level 8 at 89.6% on Eli's own seeds**. The
levers are `hits`, `damage` and `cooldown` on Star Rain in `heroes.json`; none
was touched.

### AND THE SIMULATOR STILL CANNOT SEE A POWERED-FORM ABILITY

`Sim.ts` registers `heroSlotId(0)` and reads `hero.abilities[0]`. It has no
code for a powered-form or held ability, so Ice Beam, Mind Control, the Mind
Laser and Eli's new Russinga is Fire are worth **exactly zero** in every soak
this project has run.

Measured, not assumed: the same tree with Eli's third ability deleted from
`heroes.json`, soaked at 120 seeds × 8 levels × 3 rotations, gives **all 24
numbers identical**. Anything below this line that compares heroes is comparing
their slot 1s.

See `reports/2026-09-13-eli-fire-and-star-rain.md`.

---

## 2026-09-13 — level 7 soaked, and a board the scripted player could not see

### The headline

**The Transporter is 3,000 health, the Blade Rig is 600, and level 7 soaks at
51/120 (43%) on normal and 198/480 (41%).** Inside the 35-45% band.

**Level 8 moved and had to be re-derived: the CEO is 8,500, not 9,000.**
Registering level 7 gave level 8 a row, the row put its wave table under
`tests/content.test.ts`'s no-cliff rule for the first time, the rule found five
faults, and flattening them took six counts out of a level that is purse-bound.

```bash
node --experimental-strip-types tools/soak/level.ts 120 level7
node --experimental-strip-types tools/soak/level.ts 480 level7
node --experimental-strip-types tools/soak/level.ts 480 level8
```

**Hero rotation: none.** `level.ts` passes no hero, so every one of these runs
is CORY. `run.ts` is the driver that rotates heroes by seed; nothing below does.
No hero's values were touched.

**Nothing is parked any more.** `PARKED` in `tools/soak/level.ts` is empty:
level 8 was its one entry and both rows landed together.

### THE SCRIPTED PLAYER COULD NOT SEE THIS BOARD

Level 7 opened at **0/30 and would not move**. Not at 40% of the brief's
rank-and-file health, not at 240 peanuts a kill, not with the boss healths at
400 and 600. A level that does not respond to its own levers is not badly tuned,
it is broken somewhere else, and here is where.

The board is two medians of ten pads, every one placed at exactly the house
standoff, so **twenty pads rank 91.0 px from the road**. `byReach` sorted by that
distance and fell back to the order the array happens to list them in — which is
the tracer's, north median first. So the sim bought eight towers in a row 276 px
from the south highway and never touched it:

    rank-and-file health   wins/40   lives lost by exit
    34 (40%)                0        south 71%  middle 25%  north 4%
    51 (60%)                0        south 65%  middle 27%  north 9%
    68 (80%)                0        south 55%  middle 40%  north 5%
    85 (the brief's)        0        south 55%  middle 42%  north 3%

**It is the level 6 flank failure in the other disguise.** There the ranking was
meaningful and the traffic was not; here the traffic is fine and the ranking has
no information in it. Both report a board nobody would play that way as
impossible. Ties are now dealt round-robin over the lane each pad is nearest to.
A tie group of one is every group on levels 1 to 6, so those are bit-identical —
see the table at the bottom.

### THE OPENING WAS TWICE THE WORST IN THE GAME

Wave 1 demand, measured as health per second of lane crossing times bodies:

    level 1   1.94 hp/s x 4   =  7.8
    level 2   1.96 hp/s x 5   =  9.8
    level 5   2.24 hp/s x 4   =  9.0
    level 3   6.10 hp/s x 2   = 12.2
    level 6   3.26 hp/s x 4   = 13.0
    level 8   2.58 hp/s x 7   = 18.1
    level 4   8.22 hp/s x 3   = 24.7   <- the previous worst
    level 7   7.59 hp/s x 6   = 45.5   <- the brief's

And a tower at this board's standoff covers about **238 px** of the lane beside
it, which is **1.9 seconds** of a 125 px/s Rust Bucket against level 1's 4.1 and
level 6's 2.9. At 85 health the FIRST tower a player builds cannot kill
anything at all. The opening is three cars on one road at 60 health now, on a
curve of 240 growing 36% a wave.

### AND THE BOARD NEVER CAME UP

Towers standing at the end of each wave, seed 1:

    wave       1   2   3   4   5   6   7   8   9  10  11  12  13
    level 6    1   3   5   7  11  15  18  18  18  18  18  18  18
    level 7    1   2   2   2   3   3   —   —   —   —   —   —   —   (lost at wave 6)

Three independent lanes need roughly three times the guns of one road and need
them early. The rank and file pays 26/55/90 now, against the brief's 10/18/32.
**90 is a ceiling rather than a choice:** `tests/rules.test.ts` asks every boss
to pay at least ten times the best ordinary kill and the smallest boss purse in
the game is the Politician's 900, so no rank-and-file enemy anywhere may pay
more than 90 without retuning level 1.

### THE FINALE WAS NOT ROUTED WHERE IT LOOKED BEST

One variable at a time, 40 seeds, reverting between rows.

**The Transporter down the SOUTH highway** — 11 of 22 pads bear on it and its
last 189 px are nobody's:

    transporter.maxHealth    600 -> 45%   1100 -> 23%   1600 -> 15%   2100 -> 5%

**The same boss down the MIDDLE** — 94.1% covered, both medians bearing:

    transporter.maxHealth    650 -> 68%   1500 -> 68%   2500 -> 57%   3500 -> 38%

Routed south the level lands in band at **650 health — less than the wave 8
mini boss's**, and the fight is a deadline against a stretch of road rather than
a contest with the board. It is routed down the middle at **3,000**.

**Its armour was swept too, and the table came back flat:**

    transporter.armor          0 -> 43%      6 -> 45%     12 -> 43%     18 -> 43%

So health is what controls this fight and armour is flavour. That is the
complement of level 8's HR aura rather than a repeat of it: there the flat table
meant the mechanic did nothing, here it means the other variable does everything.

**The Blade Rig**, at 40 seeds with the Transporter at 800:

    bladeRig.maxHealth       400 -> 40%    800 -> 35%   1200 -> 35%   1600 -> 28%

**600 as shipped.** Both numbers are small and both are about THIS board: at
45 px/s the Rig is inside one tower's reach for 5.3 seconds, and on its second
appearance it walks the south highway. **Do not compare either to another
level's boss.**

### THE LATE-KILL RISK, MEASURED RATHER THAN CLAMPED

The Transporter does not die, it unloads: four cars come off the trailer **at
the place it fell**. Eli raised that a kill next to the exit puts four cars next
to the exit — up to eight lives with no chance to respond — and Cory kept the
risk. There is no clamp, no minimum spawn distance and no grace period. Over
480 seeds:

| | |
|---|---|
| runs in which it was killed at all | 307 of 480 |
| mean road left at the kill | **473 px** of 1,400 |
| median | 464 px |
| best | 912 px |
| **worst** | **106 px** |
| killed inside the last 300 px | **31 of 307 (10%)** |
| losing runs ended by a car off the trailer | **109 of 282 (39%)** |

**The catastrophe Eli described is real but rare; the ordinary version of it is
the level's single biggest cause of loss.** One run in ten kills the boss inside
the last 300 px, and the worst case measured left 106 px — under a second for a
140 px/s car. But four cars at two lives each, arriving half a lane out against
a player who is already low, ended 39% of every losing run. **That is not a bug
and it is not the disaster that was feared; it is the finale doing exactly what
it was designed to do, and it is worth Cory knowing the size of it.**

### WHERE THE LIVES WENT, 480 seeds

    level 7  lost after wave: w4x6 w5x70 w6x62 w8x7 w9x13 w10x2 w11x7 w12x115
             lives lost by exit: south 4693 (69%)  middle 1933 (29%)  north 134 (2%)
             the exit that ended the run: south 49%  middle 44%  north 7%

Two clusters. **132 of the 282 losses are waves 5 and 6**, which is the board
still coming up; **115 are wave 12 and the finale**. The south highway takes 69%
of every life lost on 24% of the traffic, which is the map: 11 pads bear on it
against the middle's 20, and its last 189 px cannot be covered at all.

### LEVEL 8 HAD TO BE RE-DERIVED, AND REGISTERING LEVEL 7 IS WHY

`tests/content.test.ts`'s no-cliff rule runs over every table in `levels.json`.
Level 8 had no row, so **its curve had never once been measured**. Five of its
thirteen steps were faults — wave 2 was 100% heavier than wave 1, wave 8 was
56.8%, wave 13 was 90.7%, and waves 10 and 12 were *lighter* than the waves
before them. Six counts moved: wave 1 gained two Interns, waves 8 and 9 lost one
and two, wave 11 lost a Middle Management and an HR, and wave 13 lost three
Middle Managements off a 2,400-point spike.

Level 8 is purse-bound — fewer enemies is less income is harder, monotonically,
which is that level's own published finding — so taking seven bodies out of it
moved the number: **153/480 (32%)** at the CEO's 9,000, below the band. Swept at
120 seeds:

    ceo.maxHealth           6500 -> 74%   7500 -> 57%   8500 -> 40%   9000 -> 32%

**8,500 as shipped, confirmed at 480 seeds: 195/480 (41%)**, back inside the
band and four points off where it was before its curve was fixed.

    level8 [normal]: 195/480 wins  (41%)
      lost after wave: w4x5 w5x9 w6x9 w7x12 w8x6 w9x4 w10x8 w11x1 w12x2 w13x229
      lives lost by exit: south 4395 (68%)  east 2096 (32%)
      the exit that ended the run: south 84% of losses, east 16%

**HR's armour aura is still open and still does nothing.** 85 enemies a run
stand in one and the win rate does not notice — that finding is unchanged by
this pass and is carried forward.

### LEVELS 1 TO 6 DID NOT MOVE

480 seeds, the same seeds, all-Cory, normal. The left column is what
`SOAK-REPORT.md` published on 2026-09-12.

| level | published | this pass | |
|---|---|---|---|
| level1 | 428/480 (89%) | 428/480 (89%) | identical |
| level2 | 255/480 (53%) | 255/480 (53%) | identical |
| level3 | 422/480 (88%) | 422/480 (88%) | identical |
| level4 | 299/480 (62%) | 299/480 (62%) | identical |
| level5 | 218/480 (45%) | 218/480 (45%) | identical |
| level6 | 210/480 (44%) | 210/480 (44%) | identical |

The pad tie-break, the two new mechanics and the release queue are all
scoped: a tie group of more than one pad exists only on level 7, `bladesFrom`
returns null everywhere else, and `splitsOnDeath.holdsWave` and
`emergeSeconds` are absent from every other row in `enemies.json`.

**Levels 1 and 3 are still outside the band at 89% and 88%.** Pre-existing,
carried forward again, and not touched by this pass.

---

## 2026-09-12 — level 8 soaked, and a level that gets HARDER when you take enemies out of it

### The headline

**The CEO is 9,000 health, and level 8 soaks at 47/120 (39%) on normal and
207/480 (43%).** Both inside the 35-45% band.

> **SUPERSEDED 2026-09-13.** The CEO is **8,500** and the level soaks at
> **195/480 (41%)**. Registering level 7 put this wave table under the no-cliff
> rule for the first time, the rule found five faults in it, and flattening them
> moved a purse-bound level. The numbers below are the state before that; see
> the 2026-09-13 entry above.

```bash
node --experimental-strip-types tools/soak/level.ts 120 level8
node --experimental-strip-types tools/soak/level.ts 480 level8
```

Level 8 has no row in `levels.json` — it is unlocked by level 7 and level 7 has
no row either — so `tools/soak/level.ts` registers the row it will have, in a
`PARKED` table, and `Sim.ts` now reports a `wrong-level` finding if a soak is
ever pointed at an id that resolves to something else. Without that pair, a
soak of level 8 silently printed LEVEL 1's win rate under level 8's name.

**Hero rotation: none.** `level.ts` passes no hero, so every one of these runs
is CORY. `run.ts` is the driver that rotates heroes by seed; nothing below does.

### THE LEVEL IS PURSE-BOUND, AND THAT INVERTS THE OBVIOUS LEVER

One variable at a time, 120 seeds, reverting between rows
(`tools/soak/tune8.ts`, which takes the file as well as the path because two of
level 8's three mechanics live in its rules block rather than on an enemy row):

    every wave count, scaled      win rate
      x0.5                            2%
      x0.75                          15%
      x1.0  (as authored)            39%
      x1.3                           66%

**Taking enemies out makes this level harder, monotonically.** 19 pads is the
largest board in the game — levels 2 to 6 carry 15, 15, 14, 14 and 18 — and the
brief's provisional rewards were at the house median of about 0.12 peanuts per
point of enemy health, which funds about ten towers over thirteen waves and
leaves half the board empty. Enemies are net INCOME on this board, so the wave
table is the purse.

    the four rank-and-file rewards, as a multiple of the brief's
      x1.0   (8 / 20 / 26 / 38)        3%
      x1.3   (10 / 26 / 34 / 49)      14%
      x1.6   (13 / 32 / 42 / 60)      32%
      x1.63  (13 / 33 / 44 / 62)      39%   <- shipped
      x1.75  (14 / 35 / 46 / 66)      47%
      x1.9   (15 / 38 / 49 / 72)      60%

The shipped rewards are 0.125 to 0.2 peanuts per point of health, which sits
between levels 1-4 (0.08-0.13) and level 6 (0.27-0.44) rather than outside the
game.

### The CEO, derived

    ceo.maxHealth        win rate    losses in the boss wave
      5000                  84%         1 of 19
      7000                  73%        14 of 32
      9000                  39%        55 of 73   <- shipped
     11000                  13%        86 of 104
     13000                   1%       101 of 119

Not flat, and steep in the middle: 2,000 health is 26 points of win rate. The
number is measured on level 8's own board and means nothing against another
level's boss — 19 pads hold more DPS than 14.

### The three new mechanics are flavour, and that is measured rather than assumed

    level8.json armorAura.armorBonus      0 -> 40%   2 -> 40%   4 -> 39%   8 -> 40%
    level8.json performanceReview
                .speedMultiplier        1.0 -> 41% 1.2 -> 39% 1.5 -> 41%
    level8.json deathBlast.damage         0 -> 38%  30 -> 39%  80 -> 43%

**The HR aura fires and is worth nothing.** "Worth nothing" and "never ran"
produce the same flat table, so the simulator was instrumented to tell them
apart: **96.6 enemies a run stand inside an HR's aura**, counted, out of about
267 spawned. Four points of flat armour against a tower pool whose shots are 27
and 44 is a rounding error at the level of whole runs. If HR is meant to matter
it needs to do something armour cannot — see the open question in
reports/2026-09-12-level-8.md.

**The gate is worth nothing measurable either**, at 6.4 enemies buffed a run.
It only crosses the SOUTH arm, which is the 77%-covered one, so 20% more speed
over well-defended road changes little.

**The Consultant's explosion makes the level EASIER as it gets stronger**, which
is the joke working: at 80 damage it is worth +5 points of win rate, because it
kills its own side faster than it hurts the player's units. It does hurt them —
156 damage a run lands on the hero and the lads, counted.

### What the simulator learned, and one bug it was hiding

Taught: the two exits and which one each leak came out of, the one-time gate
buff with its non-stacking rule and its merge case, HR's aura, the Consultant's
blast on both sides, and the CEO's two summon phases with their cap.

**`onHealthThreshold` was gated on `night`.** The whole block sat behind
`night &&` because the only threshold in the game was Batula's, whose grant is
a Humiliation stack. The CEO's phases would have fired NOWHERE in this file and
his health would have been tuned against a boss that never summons — which is
level 4's Beacon all over again. Only the humiliation needs the night now.

Approximated, and stated: the gnomes are not modelled at all in this file, so
the FRIENDLY half of the Consultant's blast is measured light; the size half of
the gate's buff is not modelled, because nothing here draws anything.

### Levels 1 to 6, same seeds, before and after

Baseline is `dad36d2` in a worktree, which is this branch immediately before the
level 8 build. 480 seeds each, all-Cory, normal:

    level        before        after
    level1      428/480       428/480   (89%)
    level2      255/480       255/480   (53%)
    level3      422/480       422/480   (88%)
    level4      299/480       299/480   (62%)
    level5      218/480       218/480   (45%)
    level6      210/480       210/480   (44%)

**Bit-identical.** All three new mechanics resolve through `levelRules`, which
returns null for every level that names no rules file. Level 7 has no row, so
there was nothing to re-soak there.

### A published number that does not reproduce

The 2026-09-12 entry below this one publishes `level6 [normal]: 181/480 wins
(38%)` from `tools/soak/level.ts 480 level6`. Run at `924c8db`, the commit that
entry covers, in a clean worktree, that command prints **210/480 (44%)**. The
same 44% comes out of this branch before and after the level 8 work, so nothing
here moved it and nothing here explains it. Recorded rather than fixed: the
number in that entry should not be trusted as the level 6 baseline until
somebody works out how it was produced.

---

## 2026-09-12 — level 6 re-soaked against a third spawn, and a harness bug worth more than the change

### The headline

**The Rooster stays at 7,500.** Re-derived from scratch after level 6 grew a
third spawn: **181/480 (38%)** on normal, inside the band, 80% of losses on the
boss wave. `src/data/enemies.json` is byte-identical to `dbaf734`.

    level6 [normal]: 181/480 wins  (38%)
    lost after wave: w4x1 w5x18 w6x28 w7x10 w8x1 w9x1 w12x240
    average lives left on a win: 18.4

Hero was **Cory only** — `tools/soak/level.ts` passes `undefined` for the hero,
so `Sim.ts` resolves `DEFAULT_HERO_ID` for all 480 seeds. `run.ts`'s by-seed
rotation was not used and no hero's values were touched.

### THE SCRIPTED PLAYER DID NOT KNOW WHICH ROADS MATTER

Adding the flank lane to `map_level6.json` moved the measured win rate from
**38% to 13%** at a fixed 7,500 — **with the flank's spawn groups removed
entirely.** Nothing walked the new lane and the level got three times harder.

`Sim.ts` filled pads "nearest the road first", where the road is the nearest
point on ANY lane. Four of level 6's pads are closer to the flank than to
either front lane:

| pad | build-queue position, 2 lanes | 3 lanes |
|---|---|---|
| **12** | 16th of 18 | **1st** |
| 9 | 14th | 9th |
| 18 | 15th | 11th |
| 16 | 18th | 12th |

So the scripted player spent its opening purse covering a lane carrying 4.7% of
the level. A person would not. **The soak was describing a player, not a board.**

### The fix, and the one that was thrown away

Lane traffic is now computed from the wave table — what spawns on a lane plus
everything that merges into it, so a trunk carries the whole level:

| level | shares |
|---|---|
| 1, 2 | main 100% |
| 3 | main 100%, upper 54.7%, lower 45.3% |
| 4 | main 100%, upper 52.7%, lower 47.3% |
| 5 | main 100%, west 34.0%, north 33.5%, south 32.5% |
| **6** | upper 49.6%, lower 50.4%, **flank 4.7%** |

**Weighting distance by share was tried and is wrong.** `distance / share`
re-ranks levels 3, 4 and 5 too — their branches carry 32-55% against a trunk's
100% — and moved all three: **level 3 88% → 96%, level 4 62% → 72%, level 5
45% → 64%.** The regression run caught it; the comment claiming shares are all
1 on a trunk map was false.

**What shipped is an exclusion**: a lane under `MINOR_LANE_SHARE = 0.2` is left
out of the ranking. Every pad stays in the queue, it just stops jumping it for a
trickle. There is a factor of seven of clear air between 4.7% and 32.5%, so it
changes level 6 and nothing else.

### The Rooster, re-derived at 480 seeds after the fix

| rooster.maxHealth | wins/480 |
|---|---|
| 7,000 | 240 (50%) |
| **7,500** | **181 (38%)** |
| 8,000 | 132 (28%) |

The 120-seed sweep run BEFORE the fix is kept as a specimen: 4,500 → 72%,
5,500 → 55%, 6,300 → 36%, 7,000 → 26%, 7,500 → 15%, 9,000 → 3%. Perfectly
monotonic, and every number wrong, because the board it measured was one nobody
would build.

### What the third spawn is actually worth

| flank | 480 seeds |
|---|---|
| removed entirely | 182/480 (38%) |
| **as shipped, 11 bodies (4.7%)** | **181/480 (38%)** |
| doubled, 22 bodies | 202/480 (42%) |

**It makes the level very slightly easier.** A Sprinter is 50 health that pays
22 peanuts and walks 1425 px past four pads that covered nothing before. The
flank is not this level's difficulty; the Rooster is.

### Levels 1-5, same seeds, before and after

Against a clean `git worktree` at `dbaf734`:

| level | before | after | |
|---|---|---|---|
| level1 | 428/480 (89%) | 428/480 (89%) | identical |
| level2 | 255/480 (53%) | 255/480 (53%) | identical |
| level3 | 422/480 (88%) | 422/480 (88%) | identical |
| level4 | 299/480 (62%) | 299/480 (62%) | identical |
| level5 | 218/480 (45%) | 218/480 (45%) | identical |

Not one outcome differs. This is the run that rejected the weighted fix, so it
earned its keep twice.

Full write-up: `reports/2026-09-12-level-6-fixes.md`.

---

## 2026-09-11 — level 6 tuned, and levels 1-5 held

### The headline

**The Rooster is 7,500 health, and level 6 soaks at 203/480 (42%) on normal.**
Inside the 35-45% band, and 222 of its 277 losses (80%) happen on the boss wave
— the highest share in the game; level 5's is 65%.

    node --experimental-strip-types tools/soak/level.ts 480 level6 normal

    level6 [normal]: 203/480 wins  (42%)
    lost after wave: w4x1 w5x16 w6x27 w7x6 w8x3 w9x2 w12x222
    average lives left on a win: 17.6

**The hero is Cory and only Cory.** `tools/soak/level.ts` calls
`simulate(seed, 'normal', LEVEL, undefined, DIFFICULTY)` — the fourth argument
is the hero and it passes `undefined`, so `Sim.ts` resolves `DEFAULT_HERO_ID`
for all 480 seeds. The by-seed rotation is `run.ts`'s, the whole-game soak, and
none of these numbers used it. No hero's values were touched.

### HP alone could not reach the band, and the table is how that was found

The first sweep, against the wave table and roster as authored:

| rooster.maxHealth | wins/120 | lost after wave |
|---|---|---|
| 1,200 | 17 (14%) | w4x24 w5x36 w6x26 w7x13 w8x3 w9x1 |
| 2,600 | 16 (13%) | w4x24 w5x36 w6x26 w7x13 w8x3 w9x1 w12x1 |
| 4,500 | 8 (7%) | w4x24 w5x36 w6x26 w7x13 w8x3 w9x1 w12x9 |
| 7,000 | 0 (0%) | w4x24 w5x36 w6x26 w7x13 w8x3 w9x1 w12x17 |
| 10,000 | 0 (0%) | w4x24 w5x36 w6x26 w7x13 w8x3 w9x1 w12x17 |

The pre-boss buckets are **identical in every row** — 103 of 120 runs died
before wave 13 whatever the boss cost — so the ceiling was 14% at a boss worth
nothing. That is the flat table the brief says to look for, and what controlled
the fight was the board, not the boss.

**The cause: the wave table was sized for a lane that no longer exists.** Its
`_curve` note reasons about "roughly 50 seconds of walk … against 15 to 25 on
every level before it", which was true of the abandoned 2970x316 stitched
plate. The shipped plate walks 1711 px — 18.6 s at scrapper speed, squarely in
the family (levels 1-5 walk 15.6-21.5 s). The counts were built for a board
1.7x longer.

### What moved, and what did not

The authored wave table was **not** touched: same thirteen waves, same counts,
same upper/lower asymmetry, `git diff` on `waves.level6.json` is empty. What
moved is the level-6 roster, which is exclusive to level 6 — `scrapper`,
`sprinter`, `bruiser6` and `rooster` appear in no other wave table, so this
cannot reach another level by construction.

| | health | was | peanutReward | was |
|---|---|---|---|---|
| scrapper | 80 | 110 | 26 | 11 |
| sprinter | 50 | 70 | 22 | 9 |
| bruiser6 | 300 | 420 | 82 | 34 |
| rooster | **7,500** | null | 1,600 | 1,600 |

The purse is the bigger half of that change and it is the finding underneath
it: level 6 asks the player to cover **two roads**, and it was paying 0.155
peanuts per point of enemy health against level 5's 0.202.

### Sensitivity, one variable at a time, reverting between rows

All at 120 seeds with everything else at the shipped values.

| variable | value | wins/120 | |
|---|---|---|---|
| rooster.maxHealth | 4,000 | 101 (84%) | |
| | 6,000 | 81 (68%) | |
| | 7,000 | 58 (48%) | |
| | **7,500** | **47 (39%)** | shipped |
| | 8,000 | 37 (31%) | |
| | 9,000 | 21 (18%) | |
| | 12,000 | 0 (0%) | |
| scrapper.peanutReward | 14 | 23 (19%) | |
| | 20 | 33 (28%) | |
| | **26** | **47 (39%)** | shipped |
| | 32 | 63 (53%) | |
| bruiser6.armor | 6 / 9 / **12** / 15 | 46 / 49 / **47** / 47 | flat |
| bruiser6.maxHealth | 220 / 260 / **300** / 360 | 47 / 51 / **47** / 47 | flat |

**Two live levers and two dead ones.** Boss health and the purse move the win
rate monotonically across their whole range; the Bruiser's armour and health do
not move it at all. That follows from the board: 13 usable pads covering two
roads means the run is decided by how fast towers go up, not by how tough any
one rank-and-file enemy is.

### The flame is worth 12 points, in the direction nobody expects

Level 6 at 480 seeds with `level6.json`'s `flame` block removed, which is what
the scene actually ran until this pass wired it up:

    level6 [normal]: 142/480 wins  (30%)
    lost after wave: w4x1 w5x16 w6x27 w7x6 w8x3 w9x2 w12x283

**30% without it, 42% with it.** The flame is a net *help* to the player,
because `tickFlame` holds the boss still for a second of every six and a second
of a boss not walking is a second of every gun still having it in range. Its
damage only ever touches the player's own side and none of that decides a run.

Wiring it into `GameScene` is therefore not decoration: without it the level
plays at 30% and is out of band on the hard side.

### Levels 1-5, same seeds, before and after

Run against a clean `git worktree` at `149403c` and against this tree, 480
seeds each, normal:

| level | before | after | |
|---|---|---|---|
| level1 | 428/480 (89%) | 428/480 (89%) | identical |
| level2 | 255/480 (53%) | 255/480 (53%) | identical |
| level3 | 422/480 (88%) | 422/480 (88%) | identical |
| level4 | 299/480 (62%) | 299/480 (62%) | identical |
| level5 | 218/480 (45%) | 218/480 (45%) | identical |

Not one outcome differs. Expected — the roster is level-6-exclusive — but
measured rather than argued, because "it should not reach them" and "it did
not" are different claims.

Levels 1 and 3 sit well outside the 35-45% band at 89% and 88%. That is
pre-existing and untouched here.

---

## 2026-09-07 — the three difficulty modes, sanity-checked

### What changed

`simulate()` takes a difficulty id now — `simulate(seed, mode, levelId, heroFor,
difficultyId)`, defaulting to `normal` — and `tools/soak/level.ts` takes it as a
fourth argument:

```
node --experimental-strip-types tools/soak/level.ts 120 level2 try-hard
```

It imports `src/systems/Difficulty.ts`, the same module the game reads, rather
than carrying its own copy of the multipliers. A soak with its own copy is a
soak that can report on a game that does not exist.

### `normal` is a no-op, measured as well as asserted

Every number in the 2026-09-06 table below reproduced EXACTLY on `normal` after
the change — 95, 25, 90 and 63 wins out of 120, seed for seed:

| level | 2026-09-06 baseline | on `normal` after difficulty landed |
|---|---|---|
| level 1 | 95/120 (79%) | 95/120 (79%) |
| level 2 | 25/120 (21%) | 25/120 (21%) |
| level 3 | 90/120 (75%) | 90/120 (75%) |
| level 4 | 63/120 (53%) | 63/120 (53%) |

`tests/difficulty.test.ts` asserts the same identity against `rules.json`
directly, so a multiplier that stopped being exactly 1 would fail the build
rather than quietly invalidating this table.

### The sanity pass, 120 seeds per level per mode

**Nothing was retuned to hit a number on the non-normal modes.** The published
win rates and the 35–45% band are statements about `normal`; these two columns
exist to answer "is casual trivial" and "is hardcore impossible", and the
answer to both is no.

| level | lazy-dad | normal | try-hard |
|---|---|---|---|
| level 1 | 86/120 (72%) | 95/120 (79%) | 94/120 (78%) |
| level 2 | 26/120 (22%) | 25/120 (21%) | 25/120 (21%) |
| level 3 | 88/120 (73%) | 90/120 (75%) | 84/120 (70%) |
| level 4 | 63/120 (53%) | 63/120 (53%) | 63/120 (53%) |

### Reading that table honestly

**The win rate is very nearly flat across all three modes, and that is the
finding, not a bug.** Lives and starting money were chosen precisely because
they do not change which towers work — and the simulator's losses are decided
by whether the drafted set can hold wave 6 and wave 12, not by how much buffer
was in front of it. Where the modes separate is in how far a losing run gets
and how much slack a winning one had, and there they separate exactly as much
as the multipliers say. Level 4, same 120 seeds:

| mode | lost after wave | average lives left on a win |
|---|---|---|
| lazy-dad | w8×2 w9×7 w10×12 w11×7 w12×29 | 38.9 |
| normal | w6×35 w8×1 w11×1 w12×20 | 18.5 |
| try-hard | w6×38 w7×2 w11×3 w12×14 | 8.5 |

Lazy Dad Mode loses no run before wave 8 where normal loses 35 before wave 7,
and finishes with more than twice normal's cushion. Try Hard finishes with
under half of it. That is what the setting is for.

Two of these numbers are worth stating plainly rather than leaving to be
noticed:

- **Lazy Dad Mode is one run WORSE than normal on level 1** (86 vs 95). It has
  a fatter purse, which changes what the drafting player can afford on turn
  one, which changes every decision after it — so a lazy-dad run and a normal
  run on the same seed are different runs, not the same run with a bigger
  buffer. A per-seed comparison across modes is not meaningful and no
  conclusion here rests on one.
- **Level 4's 63 wins is identical in all three columns.** It is a coincidence
  of the aggregate and not a sign the difficulty is inert: the loss
  distributions above are from those same runs and are nothing alike.

### What the modes do NOT change

Starting lives and starting peanuts. That is the whole list, and
`tests/difficulty.test.ts` fails the build if a third knob appears in
`difficulty.json`. Enemy HP, damage, armour and wave timing are untouched on
purpose — scaling armour would make the Grinder better and the Slingshot nearly
useless rather than making the level harder, and it would mean re-soaking and
re-tuning every level three times instead of once. The reasoning is in
`src/data/difficulty.json` under `_whatTheyChange`.

One consequence worth knowing while reading Try Hard's column: its 0.75 purse
multiplier is **largely absorbed on wave 1**. `Economy.openingPurse` floors the
opening purse at whatever the cheapest drafted tower costs plus the margin, and
it is applied after the multiplier — so Try Hard's opening comes out at the
same 104 peanuts normal does on the levels measured here. The mode's teeth are
in its half-lives, and the loss distribution above is where to see them.

---

## 2026-09-06 — the support aura, modelled, and every level re-baselined

### What changed

**The soak did not model support towers at all.** No aura, no damage bonus, no
granted range, no granted pierce. A board that drafted and built a Beacon was
scored as a board that had spent 140 peanuts and a pad on a tower that did
nothing. That gap was item 5 of the 2026-09-01 report below and item 4 of
`reports/2026-09-06-level-4-and-elis-abilities.md`; it is closed.

The rule lived inside `GameScene.refreshSupport`, where a headless simulator
cannot reach it. It is `src/systems/Support.ts` now — Phaser-free, one
`auraAt(x, y, sources)` — and the scene and `tools/soak/Sim.ts` both read it,
so the two cannot drift apart again. Damage goes through the same
`boostedDamage` the tower does, range is the tower's own times `1 + granted`,
and pierce is flat on top.

### Every level, before and after, 120 seeds

`node --experimental-strip-types tools/soak/level.ts 120 <level>`, seeds 1..120,
`normal` mode, nothing else touched.

| level | before | after | change |
|---|---|---|---|
| level 1 | 90/120 (75%) | **95/120 (79%)** | +5 runs |
| level 2 | 20/120 (17%) | **25/120 (21%)** | +5 runs |
| level 3 | 80/120 (67%) | **90/120 (75%)** | +10 runs |
| level 4 | 46/120 (38%) | **63/120 (53%)** | +17 runs |

Per seed, the two simulators agree except where a Beacon was on the board:
39 runs flipped to a win and 2 to a loss (level 4 seeds 16 and 80, where a
stronger board changes the shape of the run rather than only its result).

At 480 seeds the two levels with the most Beacons hold: level 3 316/480 (66%)
→ 343/480 (71%), level 4 193/480 (40%) → 255/480 (53%).

### Why the levels move by different amounts

Because they draw Beacons at different rates. Measured over the same 120 seeds
with a probe copy of the simulator that notes every Beacon built:

| level | runs with a Beacon | Beacons built | what the boss does to one |
|---|---|---|---|
| level 1 | 29/120 | 49 | nothing; no caster on this level |
| level 2 | 58/120 | 146 | nothing; no caster on this level |
| level 3 | 72/120 | 140 | 60 disable casts landed on one, over 25 runs |
| level 4 | 68/120 | 161 | 43 eaten outright by the Glitch Bug |

### The disable case is modelled and, at this sample size, free

A Beacon switched off stops lifting, in the game and in the soak, out of the
same `dark` flag. Isolated by running the corrected simulator against a probe
copy with the dark check removed:

    level 1  95/120 both      level 3  90/120 both  (343/480 both)
    level 2  25/120 both      level 4  63/120 both  (255/480 both)

**Not one outcome differs**, on any level, at 120 or 480 seeds. On level 3, 12
of 120 runs differ in kills, seconds or lives without changing the result, and
the total lives across all runs is identical. The Rainbow Reaper's 3.5 seconds
on one Beacon are real and they are not decisive. The rule is right because
the game does it, not because it moved a number.

### What this does NOT change

- Every win rate is still a **floor**. Waves 2 onward auto-start in the game
  and pay an early-start bonus the simulator never banks; see the header of
  `Sim.ts`.
- `supportonly` mode still loses nearly every run, and still should: those
  boards buff a board with no guns on it.
- Nothing was retuned. These are the same levels, measured properly.

---

## 2026-09-01 — headless rule-layer soak, 2,100 runs

### The honest headline

**No crash or stuck-state bug was found, so none was fixed.** 2,100 seeded
runs produced zero crashes, zero unhandled rejections, zero console output and
zero unresolved runs. The one code change on this branch is a test that was
not checking what it claimed to.

That is a real result and not a shrug — the detectors were proven able to fire
before the run was trusted. See *Proving the soak can fail* below.

### What I could not do, and what it would take

**The simulation layer is not separable from the presentation layer today.**

`Enemy`, `Tower`, `Hero`, `Projectile` and `Fighter` all extend Phaser
`GameObject` subclasses, and `GameScene` owns the loop that drives them.
Constructing an `Enemy` needs a `Scene`, a loaded texture and a display list.
There is no seam to run them behind, with or without a stubbed renderer: the
stub would have to implement enough of Phaser's Container, Sprite, Tween and
Time APIs to be a second engine.

So `tools/soak/Sim.ts` is **not** the shipping simulation with rendering
removed. What it is: every Phaser-free rule module the game actually ships,
wired together over lightweight structs, reading the real JSON —

    Path            BuildSystem      WaveSpawner     Cooldowns
    Wave            Targeting        Combat          LastStand
    Upgrades        Scratch          Banner          Economy
    Draft

— which is the targeting, the armour and stun maths, the diminishing returns,
the upgrade stat table, the Last Stand rule, the scratch payout table, the
wave-clear rule, the draft and the Banner scoring. That is the code the game
runs, not a copy of it. What is stubbed is drawing, tweening and input.

**A failure here is therefore a real failure in a rule the game depends on. A
clean run here does not prove the entity layer is clean.**

To make the entity layer soakable would take, in rough order of cost:

1. **Split each entity in two.** A plain `EnemyState` holding health,
   distance, timers and status, with the rules as free functions over it; and a
   thin `EnemyView` that owns the Phaser sprite and reads the state each frame.
   `Hero` is the biggest of these — it currently mixes health, blocking,
   Last Stand, movement, the passive and four tweens in one class.
2. **Lift the loop out of `GameScene`.** `update()` currently interleaves
   simulation, camera, drawing and input. The simulation half wants to be a
   `Run` object with a `tick(dt)` that returns events, which the scene then
   draws.
3. **Route every random draw through an injected RNG.** `Math.random` is
   called directly in `AbilityRunner.scratchTicket` and in the Server Nuke
   drop; a soak cannot reproduce a failure it cannot re-seed.

Steps 1 and 2 are a large refactor and would want your sign-off. Step 3 is
small and self-contained, and would be worth doing on its own merits.

### What was run

    node --experimental-strip-types tools/soak/run.ts 2100

2,100 runs in 38 seconds. Every run is seeded and every finding carries the
seed that produced it. To reproduce one:

    node --experimental-strip-types -e \
      "import {simulate} from './tools/soak/Sim.ts'; console.log(simulate(204))" \
      --input-type=module

Coverage. **One hero and one level exist in the data** — `cory` and `level1` —
so "every hero, every level" is one of each. Every tower and every draftable
ability is exercised: the weighted draft favours the same few, so every third
seed ignores the weights and takes a uniform hand instead.

Four scripted player behaviours, because the stuck states hide where a board
cannot kill anything:

| behaviour | share | what it does |
|---|---|---|
| `normal` | 4/7 | builds when it can afford to, upgrades, casts off cooldown |
| `nobuild` | 1/7 | never builds a tower at all |
| `supportonly` | 1/7 | builds only the Tax Shelter, which cannot attack |
| `noabilities` | 1/7 | never casts anything, including Haymaker |

### Results

    outcomes    won 1028   lost 1072   stuck 0
    crashes     0
    rejections  0
    console     0 errors, 0 warnings
    means       10.3 waves, 10.9 lives, 2,889 peanuts, 224 kills

### Proving the soak can fail

A soak that reports nothing is worthless unless it can be shown to report
something. Three faults were injected into the real modules and the soak run
against them:

| injected into | fault | soak reported |
|---|---|---|
| `Combat.damageAfterArmor` | returns `NaN` above 6 armour | **1,560 `nan` findings** in 40 runs, first at seed 1 wave 4 |
| `Combat.slowedSpeed` + `damageAfterArmor` | both return 0, so nothing moves or dies | **3 of 3 runs `stuck`**, `stuck-wave` naming the wave, the survivors and the unspawned count |
| `Path.pointAt` | caps travel at half the lane | **nothing** — and correctly so: towers still killed everything, so no wave stalled. Recorded here because a detector that fires on a survivable injection would be worse than one that does not. |

All three injections were reverted.

### Findings, ranked, and what I did about them

**1. `ui/` was never checked for reference files. FIXED.**
`tests/content.test.ts` asserted that nothing under `public/assets` starts
with an underscore — over a hardcoded list of six directories, and `ui` was
not on it. Three reference sheets have shipped through that check unnoticed;
`_scratch_preview.png` (271 KB) was still in the deploy when the audit ran.
The check now walks the directories instead of naming them. The test fails
before the fix and passes after it. The file is moved to `reference/art/`.

**2. `idle-money`, 15 of 2,100 runs. NOT FIXED — it is my player, not the game.**
The detector fires when a run loses lives while holding enough peanuts for a
tower and a free pad. Every instance is at wave 7, in `normal` mode, and every
one is the scripted player's own doing: it spends only at the start of a wave,
so money earned from kills during a long wave sits idle until the wave ends.
A human spends mid-wave. Worth knowing about the harness; not a game bug.

**3. The Tax Shelter never fires. EXPECTED, NOT A BUG.**
It is a support tower with no `shot` and a `supportRadius`; `Tower.tick`
returns early on `isSupport`. The soak skips it the same way. Reported here
only because the request asked for anything that never fires, and this is the
answer for that one.

**4. The Server Nuke never fires. EXPECTED, NOT A BUG.**
It is `draftable: false`, gated on having cleared a run, and dropped at 2%
from elites and bosses mid-run. It is not in the draft pool, so a soak that
starts every run fresh cannot reach it. **This is a genuine coverage gap**: the
nuke's cast path is the one ability the soak never exercises. Closing it means
letting the soak force the drop, which needs the RNG injection in step 3
above.

**5. The soak does not model the Tax Shelter's buff. GAP — CLOSED 2026-09-06,
see the section at the top of this file.**
`supportDamageBonus` and `refreshSupport` are in `GameScene`, not in a rule
module, so the soak cannot use them. Support towers therefore contribute
nothing in `supportonly` mode, which is why that mode loses almost every run.
The mode is still worth running — it is the "board that cannot kill" case —
but its loss rate says nothing about the Shelter's real strength.

**6. TypeScript under strict: 513 errors, of which at least 454 are noise.**
`strict` is on. `npm install` cannot reach the registry in this environment,
so `tsc` cannot resolve `phaser`, and every file importing it loses its base
class. 454 errors say so directly ("Cannot find module 'phaser'", "Property
'add' does not exist on type 'GameScene'"); the remaining ~59 are the second
order of the same thing — `Enemy` no longer structurally satisfies `Targetable`
because it has lost `x` and `y`. **I cannot separate a real error from the
cascade locally.** CI installs the dependencies and its `tsc --noEmit` is
green, which is the only complete typecheck available. `tools/tsdiff.sh` exists
to make the difference visible between commits.

**7. Fourteen exported names nothing outside their own file uses. NOT FIXED.**
Candidates for deletion, not bugs, and several are deliberate:

    systems/Art.ts        contentWidthAt
    systems/ArtLoader.ts  ART_CREDIT
    systems/Audio.ts      CUE_KEYS, setMuted
    systems/Desaturate.ts GREY
    systems/Save.ts       DEFAULT_SAVE, MAX_REPORT_CHARS, bannerTotal
    systems/Upgrades.ts   investedIn
    systems/Watchdog.ts   stopWatchdog
    ui/FitCamera.ts       DESIGN_WIDTH, DESIGN_HEIGHT
    ui/Theme.ts           TYPE, menuSize

`stopWatchdog` and `setMuted` are teardown and control paths that a future
caller wants; `DESIGN_WIDTH`/`DESIGN_HEIGHT` are the documented shape of the
design box. I have not deleted any of them, because "nothing imports it" and
"nothing should" are different claims and this branch was not asked to make
that judgement.

**8. Manifest: clean.** 62 keys, 0 bound to nothing, 0 naming a missing file,
0 files on disk the manifest does not name (after finding 1 above).

### What is NOT covered

Stated plainly, because a soak report that implies more coverage than it has
is worse than none:

- Every Phaser entity: `Enemy`, `Tower`, `Hero`, `Projectile`, `Fighter`.
- Everything in `GameScene` — the run loop, the camera, input, the two-camera
  split, tower placement, Restructure, support recalculation.
- Every scene, every overlay, every dialog, the HUD.
- Rendering, tweens, audio, the asset loader.
- The Server Nuke's cast path, and the Tax Shelter's buff.

The Chromium harness under `tools/harness/` covers a lot of that, run by run
rather than at scale. The two are complements.

---

# Level 10 — AI Override: Part 2, and a number that does not mean what the others do

**2026-09-14.** Vlaude soaks at **40.0% over 480 seeds on normal — 192/480 —
inside the 35-45% band**, with Cory on every seed. Read the next section before
quoting it: **it is not a win rate comparable to levels 1 to 9.**

## The method, reproduced against two published figures

`node --experimental-strip-types tools/soak/tune10.ts 480 level10 normal cory`

The last two arguments are the whole of it and both are easy to get wrong.
`normal` runs every seed in normal mode; omitted, the seeds rotate through
`run.ts`'s seven modes, three of which are deliberately crippled. `cory` runs
one hero; omitted, the hero rotates by seed, Cory on three sevenths.

**The combination is checked rather than assumed.** With `480 <level> normal
cory` this driver returns **level 8's published 200/480 as the same integer**
and **level 9's published 40% as 191/480 (39.8%)**. Any other combination moves
both by several points — the mode rotation puts level 10 at 31.7% where
Cory-every-seed puts it at 45.0% **on the same health**, and it moves level 9
the other way, to 44.2%. A figure quoted without its method is not comparable
to anything.

## What the number measures, and what it does not

**The runner cannot respond to three of Vlaude's six powers, and cannot even
perceive two of them.** Checked in the source rather than assumed:

| power | can the runner answer it? | why |
|---|---|---|
| build lock | **no, and it cannot see one** | `systems/BuildSystem.ts` models `occupied` and nothing else. There is no lock state for `isFree` to read. The nearest thing it has is the Glitch Bug DESTROYING a tower, which calls `build.release` — it can free a pad, never forbid one. |
| generate wall | **no, and it cannot see one** | the sim's hero is a fixed point at `lane.path.totalLength * 0.5` and never moves. A wall that denies ground to the hero and to garrison units is invisible to something that never walks. |
| generate weapon | **no** | the sim models a tower being switched OFF (`disableSeconds`) and a tower being DESTROYED outright. It has no tower health, so a turret that damages towers over time is a third thing it cannot express. |
| speed alter | partly | the multiplier arithmetic is the sim's own and would apply; what it cannot do is change plan because of it. |
| duplicate enemy | partly | an inserted body is an inserted body. |
| create enemies | partly | as above. |

**So the 40.0% is a survivability check on the phase 3 walk**: can the board
the player has built by wave 18 kill a 36,000 hp hoverer before he crosses
3,440 px of road. It answers that, and it is the right question to have
answered, because it is the one question a fixed-strategy runner CAN answer
about this level.

**It is not a measure of the level's difficulty**, because the level's
difficulty is meant to come from adapting to rule changes, and no rule change
fires in it. `systems/Vlaude.ts` is the rules; the scene does not play them yet.
The number will need re-deriving the day it does.

## The sensitivity table

480 seeds each, normal, Cory. The shape of the level 4, 7, 8 and 9 tables.

| Vlaude health | 30,000 | 34,000 | **36,000** | 38,000 | 42,000 |
|---|---|---|---|---|---|
| win rate | 52.5% | 45.0% | **40.0%** | 36.3% | 30.6% |

A coarse 120-seed pass ran first and put the knee between 20,000 (85.5%) and
28,000 (52.2%). **The two resolutions disagree by more than the band is wide**:
31,000 reads 39.1% over 120 seeds and 45.5% over 480, a 6.4 point swing on the
same value. Iterate at 120, confirm at 480, and do not publish a 120.

**36,000 is four and a half times PERPLEXED's 8,100, and that is the board
rather than the boss.** Level 10 funnels every walker past every gun on one long
road; level 9 splits its traffic across two arms and three of its fifteen pads
cannot reach the road at all. Level 10 fields MORE total wave health than level
9 — 103,122 against 69,893 — and still won **98.6%** of normal runs at the 9,000
Vlaude's row was first drafted with.

**Vlaude leaks in 281 of the 480 runs**, and on this level a leak by him ends the
run outright rather than costing lives. He is the dominant loss cause, which is
what a final boss whose escape is the stake should be.

## Levels 1 to 9, re-soaked, and nothing moved

Two changes in this work touch shared code: `NightRules.from` now asks for the
day/night SHAPE rather than for the key, and `Enemy` gained a third speed
multiplier slot that defaults to 1. Both could in principle reach another level,
so both were measured rather than argued about — **the same seeds, the same
method, on the tree before the change and on the tree after it**:

| | level 5 | level 8 | level 9 |
|---|---|---|---|
| before | 218/480 | 200/480 | 191/480 |
| after | **218/480** | **200/480** | **191/480** |

Identical integers, not close ones. Level 5 is the one that matters for the
`NightRules` change — it is the only level with a sky — and level 8 is the one
whose published figure this method reproduces exactly.

The whole set at the published method, for the record: level 1 89.2%, level 2
53.1%, level 3 87.9%, level 4 62.3%, level 5 45.4%, level 6 43.8%, level 7
41.3%, level 8 41.7%, level 9 39.8%, **level 10 40.0%**.
