# The soak's player learns that towers have roles

| commit | what | CI |
|---|---|---|
| `26fc837` | `tools/soak/builder.json`, the zero-damage cap and the first-gun rule in `Sim.ts`, `tests/soakbuilder.test.ts` | [run 432](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/35112317667) green |
| `98d9cc5` | The peanut-sink measurement — reporting only, moved no win rate | run 432 green |
| `f6a0560` | This report, `SOAK-REPORT.md`, `CLAUDE.md`, `claude/context.md` | run 432 green |
| `f6c27c3` | Merge `main`: the HUD cleanup and its re-soak | run 432 green |
| `68958bf` | `buildall` corrected to 7 of 7 across the report and `context.md` | run 432 green |
| *this commit* | Closing this table on run 432 | it edits this table and nothing else |

All five were pushed together, so only the head got a run of its own; **run 432
checked the tree containing all five.** Green on `changes`, `typecheck`, `test`,
`deploy / build` and `deploy / deploy` — five jobs. Read the job list, not the
run's conclusion.

**`main`'s tree was read back afterwards** and carries `tools/soak/builder.json`
with `{padShare: 0.2, min: 1}`, the cap and first-gun rules in
`tools/soak/Sim.ts`, `tests/soakbuilder.test.ts`, this report, and the warning at
the top of `SOAK-REPORT.md`. **`git diff origin/main HEAD -- src/` is empty**, so
the game on `main` is the game that was there before this session.

**Answers first.**

- **Column B reproduces the old baseline's shape, and that is the honest test
  passing.** Aggregate **+3.5 points** (2768/4800 against 2601/4800), mean
  **+16.7 runs a level**, biggest move **+44 on level 5**, only one level down at
  all (**−6 on level 6**). And crucially **the same five levels are in band —
  6, 7, 8, 9 and 10 — exactly as under the old builder before the guarantee.**
  The lift is in the direction the brief predicted: `shelter` has had this flaw
  at weight 3 for as long as it has existed, and removing it makes every board
  slightly stronger rather than making any one board different.
- **Under column C, no level is in the 35–45% band.** L6 −14.4, L7 −6.9, L8
  −2.9, L9 −4.6, L10 −7.5 below it; L2 sits 0.4 above the top edge and the rest
  are well above. The cap recovered **+23 runs, +0.5 points** of the −287 that
  the guarantee cost against the baseline.
- **The cap is `max(1, floor(pads × 0.2))`** — a fifth of the board, floor of
  one. The ten boards carry 7, 15, 15, 14, 14, 18, 22, 19, 15 and 12 pads, so
  the caps are **1, 3, 3, 2, 2, 3, 4, 3, 3 and 2**.
- **And the cap alone was not enough, which is measured rather than guessed.**
  It halves the zero-damage *pads* and the board still sends **29.5% of its
  tower peanuts** into towers that never fire, because the upgrade loop tiers
  every tower it owns. The remaining artefact is a peanut sink, not a pad-share
  problem. Reported, not fixed.

---

## ⚠ EVERY WIN RATE PUBLISHED BEFORE THIS COMMIT WAS PRODUCED BY A DIFFERENT PLAYER

**They are not comparable to anything measured after it, and they are not
comparable to each other across this line.** This change alters the measuring
instrument, not the game: no file under `src/` is touched.

That includes every figure in `SOAK-REPORT.md`'s earlier sections, every
per-level rate in `claude/context.md`, the ten numbers quoted in `CLAUDE.md`,
and every boss health derived from a win rate — **Vlaude's 26,000 and level 9's
PERPLEXED at 7650 among them**. A number from before this commit and a number
from after it differ by an unknown mixture of the game and the builder, and
there is no way to separate them retrospectively. Re-measure rather than
compare.

`SOAK-REPORT.md`'s new section opens with the same warning, which is the point
of putting it there rather than only here.

## What was wrong

`tools/soak/Sim.ts`, in `spend`:

```ts
const id = rng.pick(affordable)
```

A uniform pick over every tower the simulated player could afford and whose
range reached the road. It had **no concept of what a tower is for**.

That was survivable while the pool was almost all damage. It stopped being
survivable on 2026-09-16, when the Ima Dummy Tower became a guaranteed opener
on every level: the simulated player then put a zero-damage blocking tower on
roughly one pad in three, on every board, from wave 1. Seven of ten levels
"got harder" and the 35–45% band emptied.
`reports/2026-09-16-dummy-tower-guaranteed.md` proved the cause with a control
run — the tower merely being in the pool was worth +43 runs over 4800 and left
five levels in band, while the *guarantee* was worth −330.

**`shelter` has had the same flaw for as long as it has existed**, at weight 3
rather than guaranteed. Smaller, and never separated from the tuning it
distorted. Column B below is the first measurement of it.

### Measured, not asserted

Mean zero-damage towers standing at the end of a run, 120 seeds a level,
`normal` mode:

| builder | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|---|---|---|---|---|---|---|---|---|
| pads on the board | 7 | 15 | 15 | 14 | 14 | 18 | 22 | 19 | 15 | 12 |
| **old, guarantee on** | 1.71 | 4.17 | 3.78 | 3.10 | 3.77 | **5.87** | **5.78** | 4.91 | 4.01 | 3.49 |
| **new, guarantee on** | 0.76 | 2.66 | 2.56 | 1.34 | 1.79 | 2.94 | 3.57 | 2.23 | 2.42 | 1.78 |
| new, guarantee off | 0.53 | 2.06 | 2.27 | 1.23 | 1.41 | 2.41 | 2.78 | 1.74 | 1.86 | 1.17 |
| **the cap** | 1 | 3 | 3 | 2 | 2 | 3 | 4 | 3 | 3 | 2 |

Level 6 spent **a third of an eighteen-pad board** on towers that do not shoot.
It now spends a sixth.

## What was built

Two rules, and deliberately only two.

### 1. A cap on zero-damage towers, derived from pad count

```
cap = max(min, floor(pads × padShare))      padShare 0.2, min 1
```

**Zero-damage is read off `damage` in `towers.json`** rather than a new field,
exactly as the brief asked — so a tower retuned to zero falls under the cap
without anybody remembering to flag it. Today that is the Beacon and the Ima
Dummy Tower. A garrison's lads and a Beacon's aura are real contributions;
what the cap asks is whether the **pad** shoots.

**Derived rather than fixed, because the ten boards run from 7 pads to 22** and
one number on both would be two different rules. `min` is what stops a
hypothetical tiny board banning the role outright: a blocker at a chokepoint is
a legitimate opening and the cap must never read zero.

**Capped, with no gun affordable for the pad in hand, the pad is SKIPPED and the
peanuts kept.** A player who cannot afford the tower they want waits; building
another blocker is the behaviour being fixed. It skips the pad rather than
breaking the loop because reach is per-pad — a later pad may accept a cheaper
long-range gun.

### 2. The board gets a gun before it gets anything else

While nothing on the board deals damage the pick is restricted to towers that
do, so a run cannot open with a Beacon buffing nothing. If no damage tower is
affordable for the pad in hand the restriction lifts rather than stalling: an
empty board is worse than a Beacon.

### And past those two, the pick is unchanged

The same uniform `rng.pick`. **That is the point rather than a shortcut.** A
builder that placed towers *well* would flatter whatever tuning it happened to
suit and stop being a neutral instrument; these two rules only remove behaviour
no player would exhibit. `tests/soakbuilder.test.ts` fails if the opening
collapses to one tower — it asserts at least three distinct first builds across
every level and seed, and measures four.

### `supportonly` is exempt, and has to be

Its whole pool is the Beacon, which deals no damage — so a cap applied there
would turn the deliberately-broken player into `nobuild` and **silently delete
the mode whose job is to show where a board cannot kill anything**. A test fails
if the cap is ever applied to it: it asserts that `supportonly` exceeds its cap
on at least one board, and measures ten of ten.

### Where the knobs live, and why not `src/data/`

`tools/soak/builder.json`. **A number that changes what the soak MEASURES is not
a balance number.** Hard rule 1 puts balance numbers under `src/data/`, and a
future session finding a `padShare` there would reasonably read it as a game
rule and tune against it — which is the exact class of mistake this whole report
is about. Nothing under `src/` reads it, and the file carries its own argument
so the reasoning travels with the number.

## Column B is the honest test, and the builder passes it

Against the pre-guarantee baseline — the numbers the old builder produced before
the Ima Dummy Tower was guaranteed:

| level | baseline (old builder) | **B (new builder, guarantee off)** | Δ | band under B |
|---|---|---|---|---|
| 1 | 428 (89.2%) | **440 (91.7%)** | +12 | above |
| 2 | 255 (53.1%) | **266 (55.4%)** | +11 | above |
| 3 | 422 (87.9%) | **436 (90.8%)** | +14 | above |
| 4 | 299 (62.3%) | **327 (68.1%)** | +28 | above |
| 5 | 218 (45.4%) | **262 (54.6%)** | **+44** | above |
| 6 | 210 (43.8%) | **204 (42.5%)** | **−6** | **IN BAND** |
| 7 | 198 (41.2%) | **204 (42.5%)** | +6 | **IN BAND** |
| 8 | 184 (38.3%) | **207 (43.1%)** | +23 | **IN BAND** |
| 9 | 192 (40.0%) | **208 (43.3%)** | +16 | **IN BAND** |
| 10 | 195 (40.6%) | **214 (44.6%)** | +19 | **IN BAND** |
| **all** | 2601 (54.2%) | **2768 (57.7%)** | **+167** | |

**The same five levels are in band, and the band membership is what matters.**
Every level moves the same way and by a similar amount — mean +16.7 runs, ten of
ten inside ±44, nine of ten up — which is what removing a uniform, pre-existing
waste looks like. A builder that had started flattering or punishing something
would show one level moving a long way while others sat still; nothing here
does that.

**Level 5's +44 is the largest and it is the expected one.** It is the vampire
level, where blocking holds the lane and the counterplay loop is chip damage
keeping lifesteal off — so it is the board the old builder's Beacon habit cost
most, and `reports/2026-09-16-dummy-tower-guaranteed.md` already measured it as
the board a blocker helps most.

**Level 10 at 44.6% is 0.4 points from the top edge.** It is in band and it is
close to leaving it, which is worth knowing before anybody moves anything else.

## Column C is what the game actually is

| level | A: guarantee on, old builder | **C: guarantee on, new builder** | Δ C−A | band under C |
|---|---|---|---|---|
| 1 | 405 (84.4%) | **434 (90.4%)** | +29 | +45.4 above |
| 2 | 218 (45.4%) | **218 (45.4%)** | +0 | **+0.4 above** |
| 3 | 422 (87.9%) | **431 (89.8%)** | +9 | +44.8 above |
| 4 | 328 (68.3%) | **314 (65.4%)** | −14 | +20.4 above |
| 5 | 343 (71.5%) | **274 (57.1%)** | −69 | +12.1 above |
| 6 | 83 (17.3%) | **99 (20.6%)** | +16 | **−14.4 below** |
| 7 | 133 (27.7%) | **135 (28.1%)** | +2 | **−6.9 below** |
| 8 | 146 (30.4%) | **154 (32.1%)** | +8 | **−2.9 below** |
| 9 | 119 (24.8%) | **146 (30.4%)** | +27 | **−4.6 below** |
| 10 | 117 (24.4%) | **132 (27.5%)** | +15 | **−7.5 below** |
| **all** | 2314 (48.2%) | **2337 (48.7%)** | **+23** | |

**No level is in the band.** Five are below it and five above, and level 2 sits
0.4 points over the top edge.

Column A reproduces `main`'s published figures integer for integer, which is
what makes A, B and C comparable to each other. (`tools/soak/Sim.ts`,
`towers.json` and `draft.json` were unchanged on `main` between that
measurement and this one; verified with `git diff`.)

**Level 5's −69 is the one level the new builder makes harder, and it is the
mirror of its +44 in column B.** Level 5 is where a blocker pays, so the
guarantee helps it more than the cap costs it — under the old builder it read a
badly inflated 71.5%, and 57.1% is a truer number for the same board.

## Why the cap alone was not enough, measured

The cap halves the zero-damage **pads**. It closed only a quarter of the
**board-DPS** gap. Median board DPS at the top of the final wave, 120 seeds:

| | level 6 | level 10 |
|---|---|---|
| A — old builder, guarantee on | 356 | 519 |
| **C — new builder, guarantee on** | **382** | **542** |
| B — new builder, guarantee off | 447 | 625 |

0.53 of a pad separates C from B on level 6 and 17% of board DPS separates
them. A pad count could not explain that, so the peanuts were counted instead.
`SimTower.value` is cost plus every tier and specialisation bought, and **the
upgrade loop below `spend` walks EVERY tower and tiers it — a zero-damage tower
included.** Median share of tower peanuts sunk into towers that will never fire:

| | level 6 | level 7 | level 10 |
|---|---|---|---|
| **C — guarantee on** | **29.5%** | **28.2%** | **21.2%** |
| B — guarantee off | 17.7% | 16.5% | 15.9% |

So the board caps the pads at a fifth and still sends **three peanuts in ten**
through a tower that cannot shoot. **The remaining artefact is a peanut sink in
the upgrade loop, not a pad-share problem.**

**Reported, not fixed.** The brief scoped this change to the pick and said not
to add a third rule without a measurement that the second was not enough. This
is that measurement — and acting on it in the same session would change the
instrument again and invalidate the three columns the session was asked to
produce. `SoakResult.builder.zeroDamageSpend` and `.towerSpend` are now in the
output so the next session starts from a number rather than from this paragraph.

**What that means for reading column C: an unknown but substantial part of the
C−B gap is still instrument.** Do not retune a level to chase it.

## The game's build system is untouched

- **Not one file under `src/` changed.** `git diff --stat origin/main -- src/
  public/ vendor/ tools/harness/` is **empty**. That is stronger than "no
  behaviour changed": there is nothing to have changed behaviour.
- **And the harness stages only what that diff covers** (`src/`,
  `public/assets`, `vendor/phaser.min.js`, `tools/harness/index.html`), so a
  harness run on this tree *is* a harness run on `main`.
- **From a rendered frame:** `sh tools/harness/run.sh afford 200 844x390` on
  level 1 — the build ring opens on a pad, prices Slingshot at 80 and Mortar at
  125, reports `affordable: ["withholding=false","rounding=false"]` at 0 peanuts
  and `["withholding=true","rounding=true"]` at 500, and paints a live
  **Build 80p** confirm. `RESULT the open panel re-prices in both directions`.
  The frame is `afford-2-rich-844x390.png`.

### One pre-existing red result, diagnosed — and closed by `main` on the way past

**On `c3ff5aa`**, `sh tools/harness/run.sh buildall 200 844x390` reported **6 of 7
pads built**, failing on pad 3 with `ringOnTap=false`. It had reported 7 of 7 on
2026-09-14 (`reports/2026-09-14-merge-level-10.md`).

**It was not this change**, and that was established rather than assumed: the
identical run in a worktree of `origin/main` reported the identical failure, same
pad, same coordinates — and at **1400x900 it reported 7 of 7**.

**The diagnosis was the ability bar.** Pad 3 lands at screen `381,318` at
844x390, and the HUD's ability bar then occupied `261,316` to `583,380` — the pad
was under it. That is the price `claude/context.md`'s HUD-versus-pads section
states explicitly: "a pad under one of the five pressable HUD controls is visible
and not tappable there", bounded by a reachability test proving every pad has a
zoom and camera position where a 44pt circle lands on it clear of the HUD.

**And the diagnosis is confirmed by the fix arriving from somewhere else.**
`main` moved to `11884fb` while this was being measured, carrying the 2026-09-17
HUD pass, which narrowed the ability bar to `298,328,248x52` — twelve pixels
lower and seventy-four narrower. On the merged tree `buildall` reports
**7 of 7 at 844x390 and 7 of 7 at 1400x900**. Pad 3 at `381,318` is now clear of
a bar that starts at y 328.

So there is **no open item here**: the red result was real, was `main`'s, was the
stated price of `d7036cc`, and stopped being reachable when the bar shrank. Worth
recording because the next session to see `buildall` go red should suspect a HUD
rectangle before it suspects the build system.

## Verification

- **`npm test`** — **1192 tests, all pass**, five of them new in
  `tests/soakbuilder.test.ts`: the cap derives from pad count and is not one
  number in disguise; **the player never fills more than the cap** (the
  assertion the file exists for); `supportonly` is exempt or the mode would be
  `nobuild`; the board gets a gun first; and the pick is still uniform past the
  two rules. It runs real simulations — four seeds a level — which makes it the
  slowest test here at about 6 seconds, and unavoidably so: the invariant is a
  property of a run. A twelve-seed sweep found the same answers.
- **`sh tools/tsdiff.sh c3ff5aa`** — `215 distinct errors` in both baseline and
  working tree, **nothing introduced**, no new-file warning. No Phaser member is
  touched, which is the blind spot that script cannot see.
- **`sh tools/harness/build.sh`** — 132 modules staged.
- **`sh tools/harness/run.sh afford 200 844x390`** — green, frame read.
- **`sh tools/harness/run.sh buildall`** — **7 of 7 at 844x390 and 7 of 7 at
  1400x900** on the merged tree. It was 6 of 7 at 844x390 before merging `main`,
  identically on `origin/main`; see above for why, and for why that is not an
  open item.
- **The reporting-only commit moved nothing**: levels 1 and 6 re-soaked at 480
  seeds after it and returned 434 and 99, the figures already in column C.
- `ASSERTS_NOTHING` is unchanged at five — muzzle, rockets, retreat,
  regressions, meteor. No harness scenario was added or changed.

### Reproducing the three columns

```bash
# A — current main, guarantee on, old builder
git worktree add -f --detach /tmp/colA <the commit before 26fc837>
# B — guarantee off, new builder: set draft.json guaranteedTowers to []
# C — this tree as it stands
for i in $(seq 1 10); do
  node --experimental-strip-types tools/soak/level.ts 480 "level$i" | head -1
done
```

Same 480 seeds throughout, difficulty `normal` throughout. Tuning is done
against normal and only normal.

---

## Where this leaves the repository

**In flight.** Nothing. The change is committed and this report is written
against a finished tree.

**Waiting on a decision — the balance, and it is the whole of what is left.** No
level is in the 35–45% band under column C. **Do not retune off column C yet**,
for a reason this report measured: an unknown but substantial part of the C−B
gap is still the instrument, because the board still sends three peanuts in ten
through towers that cannot shoot. The honest order of operations is to decide
the upgrade-loop question first, re-measure C, and only then look at levels.

**Waiting on a decision — the upgrade loop.** `spend`'s second half tiers every
tower the board owns, zero-damage ones included, and
`SoakResult.builder.zeroDamageSpend` / `.towerSpend` now measure it. A third
role rule would be the obvious answer and the brief's instruction was to prove
the second was not enough before adding one; that proof is in this report.

**Already stale, flagged as the brief asked.** **Level 9's PERPLEXED was
retuned from 8100 to 7650 four commits ago** (`e505a4d`) to put the level back in
band at 192/480. That was derived against a **two-tower opening and the old
builder**, so both halves of its derivation are gone: the level reads 208 under
B and 146 under C. It may need re-deriving once the upgrade-loop question is
settled. **Not in this session.**

**Also derived against the old builder, and therefore also stale:** Vlaude's
26,000 hp and the 24,265 median damage in
`reports/2026-09-15-blockers.md`; every per-level figure in
`SOAK-REPORT.md`'s earlier sections; the ten numbers in `CLAUDE.md`.

**Carried forward from `reports/2026-09-16-dummy-tower-guaranteed.md`.** The
loadout screen's third card costs 72–93 units of overflow at every viewport, so
a desktop loadout scrolls by 76 where it scrolled by 4. Unchanged by this
session.

**Carried forward from `reports/2026-09-16-lazy-dad-mode.md`.** The five Lazy
Dad knobs are unmeasured against a guaranteed blocker *and* now against a new
builder. Only `normal` was soaked here.

**Closed on the way past, not carried forward: `buildall` at phone width.** It
was red on `c3ff5aa` because pad 3 sat under the ability bar, and the
2026-09-17 HUD pass narrowed the bar out of the way. 7 of 7 at both viewports
on the merged tree. Recorded because the shape is worth remembering: when that
scenario goes red, suspect a HUD rectangle before the build system.
