# Balance verification, the level 4 boss, and why level 2 is the hardest level

Three jobs: prove the last two batches moved no balance, make the one authorized
change, and diagnose level 2. Balance was frozen for everything except job 2, and
**nothing in job 3 was applied** — every row of the sensitivity table was measured
and reverted.

| commit | what it is | CI |
|---|---|---|
| `7ae13d4` | Level 4's Lich King goes to 1500, and his return follows at 2250 | **green** — [run](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34076760639) |
| `REPORT_SHA` | This report | **CI_REPORT** |

Branch `claude/hero-art-hud-rework-tqd10v`; this session cannot push to `main`.
Tests 947 passing, 0 failing. `sh tools/tsdiff.sh 9172418` reports 206 against a
205 baseline, the one difference being `Cannot find module 'phaser'` for
`src/ui/CakeRow.ts` — the known condition of this environment, where `npm install`
403s and `tsc` cannot resolve Phaser locally.

---

## JOB 1 — the last two batches moved nothing

Run before the boss change, so it measures the old value. Same simulator, same
seeds 1..120, `normal`, `node --experimental-strip-types tools/soak/level.ts 120 <level> normal`.

| level | expected | measured | |
|---|---|---|---|
| level 1 | 95/120 (79%) | **95/120 (79%)** | exact |
| level 2 | 25/120 (21%) | **25/120 (21%)** | exact |
| level 3 | 90/120 (75%) | **90/120 (75%)** | exact |
| level 4 | 63/120 (53%) | **63/120 (53%)** | exact |

**All four exact. No bisect needed.** The art/HUD batch and the progression batch
changed no behaviour they did not declare, and the progression batch's claim that
`normal` difficulty is a literal no-op holds against previously shipped values —
by measurement as well as by the test that asserts it against `rules.json`.

The loss distributions are also unchanged, which is a stronger statement than the
win rate alone: a change that moved two runs in opposite directions would keep the
total and move these.

| level | lost after wave | avg lives left on a win |
|---|---|---|
| level 1 | w8×2 w9×1 w12×22 | 19.8 |
| level 2 | w6×2 w7×1 **w12×92** | **20.0** |
| level 3 | w9×4 w10×4 w11×4 w12×18 | 18.0 |
| level 4 | w6×35 w8×1 w11×1 w12×20 | 18.5 |

---

## JOB 2 — the level 4 boss

### What was changed, and the one place I did not follow the brief

`glitchLich.maxHealth` 1200 → **1500**, as asked. **`glitchLichReturn.maxHealth`
1800 → 2250, which the brief said not to touch.** Flagging that plainly rather
than burying it.

`glitchLichReturn` is not a separate enemy being tuned; it is the same fight half
again as big, and the 1.5× is a documented design rule with a test on it
(`tests/level4.test.ts`, *"the Lich King retreats at wave 7 and comes back bigger
at wave 13"*, asserting `back.maxHealth === first.maxHealth * 1.5`). Setting the
boss to 1500 and leaving the return at 1800 turns that test red. The choice was
therefore between two changes, not between a change and no change:

- leave the return at 1800 → **delete a design invariant and its test** to satisfy
  a literal reading of "nothing else";
- move the return to 2250 → **keep the invariant**, and touch a number the brief
  did not name.

The second is the smaller change, and it is also what the brief's own evidence
assumes: the sensitivity table it quotes (1400 → 45%, 1600 → 40%) comes from
`reports/2026-09-06-soak-support-modeling.md`, where every row moved the pair
together at 1.5×. Both were measured, and both are below. **If the intent really
was 1500/1800, the revert is one number plus deleting three lines of
`tests/level4.test.ts`, and this report is the argument against doing that.**

### The result, 480 seeds, normal

| boss / finale | win rate | in the 35–45% band |
|---|---|---|
| 1200 / 1800 (shipped) | 255/480 — 53% † | no, above |
| **1500 / 2250 (this commit)** | **212/480 — 44%** | **yes** |
| 1500 / 1800 (finale left alone) | 225/480 — 47% | no, above |

† carried from `SOAK-REPORT.md`, not re-measured at 480 this session. Its 120-seed
figure was re-run in job 1 and reproduced exactly at 63/120.

**1500 lands at 44%, inside the band**, against the brief's prediction of "near
42%". The prediction was made from the paired table, which is why the paired
change matches it and the boss-only one does not: leaving the finale at 1800 is
worth about 3 points of win rate.

### Where the losses fall

At 1500/2250, over 480 seeds — 268 losses:

| where | losses | share of all losses |
|---|---|---|
| **wave 7, the Glitch Lich King** | **202** | **75%** |
| wave 13, the Recompiled finale | 59 | 22% |
| anywhere else (w8×2, w10×1, w11×4) | 7 | 3% |

**The wave 7 fight decides this level three times over.** That is not new — the
shipped 1200 build lost 35 of 57 at wave 7 in job 1's run — but it is worth
stating: level 4's difficulty is almost entirely one mid-level boss, and the
finale, which is 50% bigger, kills a third as many people. By then the board is
fully built.

Average lives left on a win: 18.8 of 20.

---

## JOB 3 — why level 2 is the hardest level in the game

**Nothing here was applied.** Every row edited a data file, soaked 120 seeds (480
where marked), and reverted with `git checkout --` before the next.

### The shape of the failure

Level 2's numbers do not look like a level that is too hard. They look like a
level that is not a level:

- **106 of 480 runs win, and every single one of them wins at 20 of 20 lives.**
  Minimum lives on a win: 20. Maximum: 20. Not "usually flawless" — *always*.
- **`first life lost: never in 106/480 runs`** — exactly the number of wins. If a
  run loses one life at any point on level 2, it loses the level.
- **367 of 374 losses are on wave 13.** The other seven are scattered across waves
  5–9 and are the simulator's usual handful of catastrophically bad boards.

Compare that to level 3, which loses lives across waves 9–12 and whose winners
average 18.1 lives. Level 3 has a difficulty curve. **Level 2 has twelve free
waves and then a coin flip.**

### It is not economic

The board at the top of wave 13, 240 seeds, split by what the run went on to do:

| | runs that WON | runs that LOST |
|---|---|---|
| lives | 20 / 20 / 20 (min/median/max) | 7 / **20** / 20 |
| peanuts in hand | median 36 | median **51** |
| towers built | **15** (min = max) | **15** (min = max) |
| free pads | **0** | **0** |
| board DPS vs armour 4 | **median 368** | **median 264** |

Every run — winner and loser alike — arrives at the Devil with **all fifteen pads
filled, fifteen towers built, and money left over**. Losers arrive with *more*
spare cash than winners, because there is nowhere left to put it. There is no
economic failure here; there is nothing left to buy.

### It is not pacing

Losers arrive at wave 13 on a median of **20 of 20 lives**. Nothing before the
Devil leaks. Two further rows settle it directly:

| change | win rate |
|---|---|
| `theDevil.maxHealth` 6200 → 100 | **117/120 — 98%** |
| wave 13's escorts removed, Devil untouched | 27/120 — 23% |

Make the boss trivial and the level is a **98%** walkover — all twelve waves and
wave 13's own escorts, free. Remove the escorts and leave the boss, and the level
moves by two points. **Level 2 is one enemy.**

### It is not a damage-type wall

This was the leading hypothesis and it is wrong.

| change | win rate |
|---|---|
| `theDevil.armor` 4 → 2 | 25/120 — 21% |
| `theDevil.armor` 4 → 0 | 26/120 — 22% |

**Removing the Devil's armour entirely is worth one point.** Nor is anything
locked out of level 2: `draft.json`'s `towerWeights` is the shared pool for every
level, and `extraTowerWeights` is used exactly once in the game — `imaDummy` on
level 1, which cannot help against either level 1's or level 2's boss because both
are `blockable: false`. Level 2 has no flying enemies and every damage tower
targets ground anyway. Nothing about level 2's *composition* is unusual.

### It is a raw damage check, and the boss is an outlier

| level | boss | HP | armour | speed | median board DPS of a winner | boss HP ÷ that DPS |
|---|---|---|---|---|---|---|
| level 1 | politician | 4600 | 0 | 22 | 264 (7 towers) | 17.4 |
| **level 2** | **theDevil** | **6200** | **4** | **26** | **368 (15 towers)** | **16.8** |
| level 3 | unicornBoss | 2100 | 6 | 30 | 180 (15 towers) | 11.7 |
| level 4 | glitchLich | 1500 | 8 | 14 | — | — |

The second level in the game has **the largest boss in the game by a wide margin**
— 35% more health than level 1's, three times level 3's, and four times level 4's
finale. And the DPS a run brings to it is decided almost entirely by which towers
the draft handed out.

The clearest single number in this whole report: **level 2's median LOSER brings
264 DPS, which is exactly level 1's median WINNER.** A board that comfortably
clears level 1 loses level 2.

### The sensitivity table

120 seeds, seeds 1..120, `normal`, one variable at a time, reverted after each.
Baseline **25/120 — 21%** (480 seeds: 106/480 — 22%). Target band 35–45%.

| candidate | win rate | in band |
|---|---|---|
| `maxHealth` 6200 → 5400 | 36/120 — 30% | no |
| **`maxHealth` 6200 → 5200** | 42/120 — 35% | **yes** |
| `maxHealth` 6200 → 5000 | 47/120 — 39% | yes |
| `maxHealth` 6200 → 4800 | 55/120 — 46% | no, above |
| `maxHealth` 6200 → 4600 | 61/120 — 51% | no |
| `maxHealth` 6200 → 4000 | 82/120 — 68% | no |
| `maxHealth` 6200 → 3600 | 92/120 — 77% | no |
| `maxHealth` 6200 → 100 (control) | 117/120 — 98% | — |
| `armor` 4 → 2 | 25/120 — 21% | no |
| `armor` 4 → 0 | 26/120 — 22% | no |
| `livesCost` 12 → 6 | 25/120 — 21% | no |
| `speed` 26 → 20 | 73/120 — 61% | no |
| `speed` 26 → 16 | 92/120 — 77% | no |
| `summons.cap` 6 → 4 | 25/120 — 21% | no |
| `summons.cap` 6 → 3 | 25/120 — 21% | no |
| `summons.cap` 6 → 2 | 25/120 — 21% | no |
| `summons.cap` 6 → 0 | 52/120 — 43% | yes |
| `summons.interval` 5 → 8 | 26/120 — 22% | no |
| `summons.interval` 5 → 10 | 31/120 — 26% | no |
| wave 13 escorts removed | 27/120 — 23% | no |
| level 2 `extraTowerWeights: {escalation: 5}` | 30/120 — 25% | no |
| level 2 `extraTowerWeights: {escalation: 8}` | 36/120 — 30% | no |
| level 2 `extraTowerWeights: {writeoff: 6}` | 25/120 — 21% | no |
| level 2 `extraTowerWeights: {escalation: 5, writeoff: 6}` | 28/120 — 23% | no |

Four things in that table are worth reading twice.

1. **`livesCost` does nothing at all.** Halving what the Devil costs on a leak
   moves zero runs. Once the board cannot kill him, his six summons and wave 13's
   fourteen escorts walk through behind him — 26 lives' worth against 20 — so the
   run is lost whatever the boss himself charges.
2. **The summon cap is a cliff, not a curve.** 6, 4, 3 and 2 are all 21%; 0 is
   43%. `cap` is a *concurrent* limit and the interval is 5s against a ~75s walk,
   so a cap of 2 is still a steady stream — what matters is whether there is a
   stream at all. That makes the cap unusable as a tuning knob: the only value
   that moves anything deletes the mechanic.
3. **Speed is a huge lever and a dangerous one.** 26 → 20 nearly triples the win
   rate, because slower is simply more seconds inside every tower's range. It is
   the same lever as HP wearing a different hat, and it also changes how the fight
   *feels*.
4. **The draft is not the lever.** Quadrupling `escalation`'s weight for level 2
   alone — from 2 to 8 out of a pool of ~27 — reaches 30%. Even a hand stacked
   with the level's best tower cannot reliably clear 6200 HP.

### Recommendation

**Set `theDevil.maxHealth` from 6200 to 5200 in `src/data/enemies.json`. One
number, one enemy, one level.**

Confirmed at 480 seeds, because the 120-seed figures move by up to five points:

| HP | 120 seeds | 480 seeds |
|---|---|---|
| 6200 (shipped) | 21% | 22% |
| 5400 | 30% | 36% |
| **5200** | 35% | **40%** |
| 5000 | 39% | 44% |

**5200 lands at 40% — the middle of the band**, with 5400 (36%) and 5000 (44%)
bracketing it inside the band as well, so the choice is not balanced on a knife
edge.

Why this one and not the others:

- **It cannot touch another level.** `theDevil` is named in exactly two places in
  the repository, both in `waves.level2.json`. Verified by re-soaking with 5200
  applied: level 1 **95/120 (79%)** and level 3 **90/120 (75%)**, both unchanged
  to the run. (Level 4 read 45% in that same pass, which is job 2's committed
  change, not an effect of the Devil.)
- **It is the only continuous lever.** Armour and lives cost do nothing at all;
  the summon cap is binary; speed works but is a bigger design change and moves
  the level much further than needed.
- **It leaves the boss's identity alone.** He keeps his armour, his summons, his
  speed and his escorts. He stops being the biggest enemy in a game whose later
  bosses are a third his size.

**Second choice, if the fight should stay big:** `summons.cap` 6 → 0 lands at 43%,
and it is arguably the more honest fix — the summoned Underlings soak fire that
would otherwise go into the Devil, so removing them makes the fight *about* the
Devil. But it removes a boss mechanic outright, and there is no middle setting.

**Not recommended:** anything touching `draft.json`, which is shared by all four
levels; anything touching the escorts, which are worth two points; and any change
to `armor` or `livesCost`, which measurably do nothing.

A note on scale for whoever picks: even at 5200, level 2's boss is still the
largest in the game — bigger than level 1's 4600, and 2.3× level 4's finale. The
band does not require the Devil to stop being the Devil.

---

## What was NOT checked

- **No harness frames.** This session made one data change and drew nothing; there
  was no UI to verify.
- **No non-normal difficulty soak of the new level 4 boss.** Job 2's 44% is a
  `normal` figure. Difficulty scales lives and peanuts only, so the ordering
  should hold, but Lazy Dad and Try Hard were not re-measured at 1500/2250 and
  `SOAK-REPORT.md`'s difficulty section still quotes 53% for level 4.
- **Level 2's diagnosis is entirely from the simulator.** It does not model
  waves 2+ auto-starting, so every win rate in it is a floor; a real player who
  banks early-start bonuses has more money than any row here. That cuts the same
  way for all four levels, which is why they are comparable, but it means the
  absolute 21% is pessimistic.
- **No per-seed diff between the shipped and 5200 builds.** The recommendation
  rests on aggregate win rates at two seed counts, not on which individual runs
  flipped.
- **`SOAK-REPORT.md` was not updated.** Its level 4 row now understates the boss;
  it should be revised when the level 2 decision is made, so the two land in one
  edit rather than two.

---

## Where this leaves the repository

**Waiting on a decision:**

1. **Level 2's fix.** `theDevil.maxHealth` 6200 → 5200 is the recommendation.
   Nothing is applied.
2. **Whether `glitchLichReturn` should have moved to 2250.** If not, the revert is
   one number plus three lines of `tests/level4.test.ts`, and level 4 goes to 47%.

**Open, carried from `2026-09-07-progression-rework.md` and not re-checked here:**

3. **The cake tiers are probably too generous** — level 4 averaged 18.5 lives left
   on a win before this change and 18.8 after, so most wins still pay three cakes.
   Unchanged by anything in this session.
4. **The verdict line and the 2-cake tier disagree at exactly half** (`>` against
   `>=`).
5. **Dialog buttons fall to about 24 CSS pixels when a panel scales to fit a
   phone.**
6. **The 32px-on-a-phone question** for world map node cakes.

**Open, carried from `2026-09-07-hero-art-and-the-hud-chip.md`:**

7. **Courtland's ability names disagree with his icons.**
8. **`fx_mind_control` has art and no mechanic.**
9. **Nine canvas-vs-ink content boxes**, eight of them tower-menu glyphs up to 35%
   small.
10. **Seven harness scenarios still drive the deleted `g.menu` / `g.panel`** —
    `ui`, `muzzle`, `buildall`, `rockets`, `retreat`, `regressions`, `poor`,
    `typegame`. Each reports success while running none of its assertions. **Still
    the highest-value item on the list.**
11. **The hero's two ability medallions go dead after the Server Nuke drops.**

**Also worth knowing, found while diagnosing level 2 and not a bug:**

12. **Level 1 has seven build pads; levels 2, 3 and 4 have fifteen, fifteen and
    fourteen.** That is a much larger difference than anything in the wave tables
    and it is not recorded anywhere. It is why level 1's winning boards run at 264
    DPS and level 2's at 368, and it means the two levels' boss health figures
    were never on the same scale to begin with.

---

## Merging

```
git fetch origin
git checkout main
git merge --ff-only origin/claude/hero-art-hud-rework-tqd10v
git push origin main
```

`origin/main` is at `9172418`; the branch is a fast-forward from it.
