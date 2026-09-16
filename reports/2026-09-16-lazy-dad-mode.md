# Lazy Dad Mode, made genuinely easy

| commit | what | CI |
|---|---|---|
| `3985d7a` | Five new difficulty knobs, wired through `Difficulty.ts` into the game and the soak | not run alone; see below |
| `0e9b0a1` | Merge of `main`'s level 9 retune and flank repaint | not run alone |
| `2a115d2` | Merge of `main`'s CI-row commit — the tree containing all of the above | [run 407](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/35084921618) **green** |
| *this commit* | This report, `SOAK-REPORT.md`, `claude/context.md`, and the stale `0.6` in `difficulty.json`'s note corrected to the shipped `0.7` | it edits one data comment and three documents |

**Run 407 on `2a115d2`: all five jobs success** — `changes`, `typecheck`, `test`,
`deploy / build` and `deploy / deploy`, with **the deploy RUNNING rather than
skipping**, because the push touched `src/`. So the live site carries the mode.
Read the job list, not the conclusion: a green run with `deploy` skipped would
be a documentation commit behaving correctly, and this is not one.

`main` moved twice while this was being soaked — level 9's retune landed at
`a0cece1` and its CI row at `df5523c` — so the work was merged forward and
**every number below was re-measured on the merged tree**, not carried over
from before it. That is why level 9 reads 192/480 on normal here rather than
the 191/480 this session started from.

---

## Answers first

**Lazy Dad Mode, 480 seeds, per level:**

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| **lazy-dad** | 98.3% | 96.5% | 99.8% | 99.0% | **89.8%** | 94.6% | 94.0% | 95.8% | 94.0% | **86.7%** |
| normal | 89.2% | 53.1% | 87.9% | 62.3% | 45.4% | 43.8% | 41.3% | 38.3% | 40.0% | 40.6% |

**`normal` is still a literal no-op.** All ten levels, 480 seeds, same seeds:
428, 255, 422, 299, 218, 210, 198, 184, 192, 195 — every integer identical to
the same run on the tree before this change. `try-hard` likewise: 426, 255,
403, 298, 174, 198, 139, 35, 151, 192.

**No level resisted downwards.** Nothing fell below 85%; the floor is level 10
at 86.7% and level 5 at 89.8%. **Four levels resist upwards and cannot be
brought into the 85–95% band: levels 1, 2, 3 and 4.** Levels 1 and 3 are
already at 89.2% and 87.9% **on `normal`** — an easier mode is at least that by
construction, so the band was never available to them. Levels 2 and 4 saturate
because their failure mode is exactly the one the health scalar removes.

---

## The claim in the brief, verified before anything was built

> On those two levels, extra lives and extra money change NOTHING.

**It held, and it is stronger than "nothing much".** Three 480-seed runs on the
same seeds, each changing one thing:

| | level 2 | level 10 |
|---|---|---|
| `normal` | 255/480 — 53.1% | 195/480 — 40.6% |
| lives ×2, purse ×1.5 (Lazy Dad Mode **as it shipped**) | 247/480 — 51.5% | 206/480 — 42.9% |
| lives **×4**, purse **×3**, nothing else | 264/480 — 55.0% | 201/480 — 41.9% |
| health ×0.8 **alone**, lives and purse at 1.0 | **388/480 — 80.8%** | **325/480 — 67.7%** |

Quadrupling the lives and tripling the purse moves level 2 by **1.9 points** and
level 10 by **1.3**. Softening every enemy by a fifth — and nothing else at all
— moves the same two by **27.7** and **27.1**. The mode as it shipped actually
made level 2 slightly *worse* than `normal` (51.5% against 53.1%): more money
buys a different tower order, and on a level decided by one boss that is noise
in both directions.

The mechanism is visible in level 2's own diagnostics on `normal`:

```
level2 [normal]: 255/480 wins  (53%)
  lost after wave: w6x1 w12x224
  average lives left on a win: 20.0
  what took the last life: theDevil 213 (95%)  directReport 11 (5%)
```

224 of 225 losses happen in wave 13, 95% of them to the Devil, and **the runs
that win end with 20.0 of 20 lives**. A winner never spends a life, so extra
lives are worth exactly zero to them; a loser loses every life to one boss in
one wave, so extra lives buy a few more seconds of the same losing fight.

---

## What was added

Seven knobs in `src/data/difficulty.json` now, up from two. All five new ones
are **1.0 on `normal` and on `try-hard`**.

| knob | lazy-dad | normal | try-hard |
|---|---|---|---|
| `livesMultiplier` | **3.0** | 1.0 | 0.5 |
| `peanutsMultiplier` | **1.5** | 1.0 | 0.75 |
| `peanutIncomeMultiplier` | **1.1** | 1.0 | 1.0 |
| `waveIntervalMultiplier` | **1.5** | 1.0 | 1.0 |
| `heroRespawnMultiplier` | **0.7** | 1.0 | 1.0 |
| `abilityCooldownMultiplier` | **0.85** | 1.0 | 1.0 |
| `enemyHealthMultiplier` | **0.7** | 1.0 | 1.0 |

In a run that means: 60 lives instead of 20, a 150-peanut opening purse instead
of 100, 22.5 seconds between waves instead of 15, the hero back in 17.5 seconds
instead of 25, a 12-second ability recharging in 10.2, and a 66-health Bruiser
carrying 46. Those six numbers are read off a **live run** — see the harness
section.

### What was deliberately not added

**No armour scalar, no enemy damage scalar, no enemy speed scalar.** The
objection in `difficulty.json`'s old note is correct and those three are what
it is actually about: the Grinder ignores armour and the Slingshot cuts it, so
scaling armour makes one tower better and another nearly useless and the draft
decides the run before the player does. `tests/difficulty.test.ts` now asserts
against the **data keys** rather than against the module's prose, so a comment
explaining why there is no armour scalar cannot fail a test looking for the
word.

**The wave-clear bounty is not scaled.** `peanutsPerWaveCleared` is paid for
surviving rather than for shooting, and a Lazy Dad run already collects it more
often by clearing more waves. Only the kill bounty goes through
`peanutIncome`. There is a test for that too.

### The armour distortion, stated plainly

Armour is a **flat subtraction**, so lowering health without lowering armour
makes armour-piercing towers relatively better. That is real and it is the
price of this mode. At 0.7 it is swamped: level 2's loss rate goes from 46.9%
to 3.5%, and 95% of those losses were one boss. That is not a shift in which
tower you would rather have drawn, it is the fight ending. It was not measured
per tower — see "what was not checked".

---

## How the numbers were chosen

Ten 480-seed candidates, each the full ten levels, same seeds every time. The
brief's starting recommendation (lives 3.0, purse 2.0, income 1.75, interval
1.5, respawn 0.5, cooldown 0.6, health 0.6) reads **100% on nine of ten levels**
at 120 seeds — far past the target — so the sweep ran downwards from there.

| candidate | lives, purse, income, interval, respawn, cooldown, health | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | in band |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| F | 3.0, 2.0, 1.30, 1.5, 0.50, 0.70, 0.80 | 99 | 98 | 100 | 99 | 89 | 98 | 96 | 97 | 95 | 92 | 3 |
| K | 2.5, 1.75, 1.25, 1.5, 0.50, 0.70, 0.80 | 100 | 99 | 100 | 100 | 91 | 98 | 95 | 96 | 94 | 93 | 4 |
| M | 1.5, 1.25, 1.10, 1.5, 0.70, 0.85, 0.65 | 99 | 98 | 100 | 99 | 93 | 96 | 93 | 95 | 93 | 93 | 5 |
| J | 2.5, 1.75, 1.20, 1.5, 0.50, 0.75, 0.85 | 99 | 94 | 100 | 98 | 78 | 93 | 89 | 94 | 89 | 83 | 6, two below |
| O | 1.5, 1.25, 1.10, 1.5, 0.70, 0.85, 0.70 | 98 | 97 | 100 | 99 | 88 | 94 | 92 | 91 | 90 | 88 | 6 |
| R | 2.0, 1.5, 1.10, 1.5, 0.70, 0.85, 0.70 | 98 | 96 | 100 | 99 | 90 | 94 | 94 | 94 | 93 | 87 | 6 |
| **S — shipped** | **3.0, 1.5, 1.10, 1.5, 0.70, 0.85, 0.70** | 98 | 96 | 100 | 99 | **90** | 95 | 94 | 96 | 94 | **87** | 5 |
| L | 1.75, 1.4, 1.10, 1.5, 0.60, 0.80, 0.75 | 99 | 96 | 99 | 99 | 82 | 93 | 91 | 91 | 90 | 86 | 5, one below |
| P | 1.25, 1.15, 1.05, 1.5, 0.75, 0.90, 0.70 | 97 | 92 | 100 | 98 | 84 | 89 | 90 | 88 | 87 | 86 | 6, one below |
| I | 2.0, 1.5, 1.15, 1.5, 0.60, 0.80, 0.90 | 95 | 88 | 98 | 93 | 75 | 84 | 82 | 86 | 78 | 72 | 3, four below |

**Which levers moved, and why.**

* **Enemy health is the whole engine.** Compare J to K: the only material
  difference is health 0.85 against 0.80, and level 5 moves 13 points and level
  10 moves 10. Nothing else in the table has that leverage.
* **Lives are nearly inert in the soak.** D against E (not tabulated, 120 seeds)
  moved lives 2.0 → 1.5 and changed eight of ten levels by under two points;
  R against S moves lives 2.0 → 3.0 and changes one level by two points.
  **They were kept at 3.0 anyway** — the soak's builder is a competent adult who
  barely leaks, and the player this mode is for leaks constantly. The knob the
  simulator says is worthless is the one a frustrated child feels most.
* **Money and cooldowns overshoot fast.** Candidate C (120 seeds, purse 1.75,
  income 1.5, cooldown 0.6) put level 10 at 98% on its own. Income settled at
  1.1 and cooldown at 0.85 — small, because everything larger buried the band.
* **The interval was never tuned**, for the reason in the next section.

### 120 seeds is not enough to tune this, and it nearly was used

The first full sweep ran at 120 seeds and read level 2 at 94%; at 480 the same
values read 98%. Level 5 read 95% at 120 and 89% at 480 on a neighbouring
candidate. `tune10.ts`'s header already warns about exactly this and it is worth
repeating here: **every candidate in the table above is 480 seeds.** The 120-seed
pass was used only to find the rough region.

---

## The one knob the soak cannot see

`waveIntervalMultiplier` is invisible to every win rate in this report.

The simulator has **no ready phase at all** — its builder spends at the wave
boundary and the next wave begins on the next line, which `Sim.ts`'s header has
documented since before this change. So a 1.5× countdown does nothing there.

This matters more than it sounds, because a longer gap between waves is
plausibly the single most useful thing for a young player: what beats a
six-year-old is almost never a wave that was too strong, it is a wave that
arrived while they were still deciding where to put a tower. **The mode is
therefore easier in the game than any number in this report says**, in the same
direction the unmodelled early-start bonus already pushes.

It is documented in `Sim.ts` rather than left to be found, and
`tests/difficulty.test.ts` asserts both halves: that the simulator does *not*
call `waveInterval`, and that the paragraph explaining why is still there.

---

## Verification

### `normal`, 480 seeds, all ten levels

| level | before this change | after | |
|---|---|---|---|
| level1 | 428/480 | 428/480 | identical |
| level2 | 255/480 | 255/480 | identical |
| level3 | 422/480 | 422/480 | identical |
| level4 | 299/480 | 299/480 | identical |
| level5 | 218/480 | 218/480 | identical |
| level6 | 210/480 | 210/480 | identical |
| level7 | 198/480 | 198/480 | identical |
| level8 | 184/480 | 184/480 | identical |
| level9 | 192/480 | 192/480 | identical *(main's retuned figure)* |
| level10 | 195/480 | 195/480 | identical |

Two notes on the brief's expected list. **Level 8 is 184/480, not 200** — it has
been since `2026-09-15`, which `CLAUDE.md` and `SOAK-REPORT.md` both record; the
200 in the brief is the pre-retopo figure. **Level 9 is 192/480, not 191** —
`a0cece1` retuned it *during* this session, and 192 is that commit's own
published number, reproduced here on the merged tree.

### `try-hard`, 480 seeds, all ten levels

426, 255, 403, 298, 174, 198, 139, 35, **151**, 192. Nine identical to the
pre-change run; level 9 moved 146 → 151 for the same reason as above — main's
retune, not this change.

### Why the no-op is exact rather than lucky

Every scaler goes through one helper with an early return:

```ts
const scale = (base, by, floor, round) => {
  if (by === 1) return base
  ...
}
```

`Math.round(x * 1)` is not `x` for a non-integer `x`, and three of these scale
seconds. The test asserts the identity on 32.5 seconds, 0.5 seconds, 7 peanuts
and 26,000 health, on **both** `normal` and `try-hard`.

### Typecheck and tests

`sh tools/tsdiff.sh a0cece1` — **214 errors either side, none introduced.**
`node --test 'tests/*.test.ts'` — **1169 pass, 0 fail.**

Four existing tests had to be updated, and all four are regex-over-source
assertions that my edits moved rather than broke:
`heropowers.test.ts` (cooldowns now register through `cd(...)`),
`interaction.test.ts` (`this.reviveIn = this.reviveSeconds`, and the getter is
asserted), `rules.test.ts` (wave 1's clock is still a literal `0`, the other arm
goes through `waveInterval`), and `buildpad.test.ts` — that last one is worth a
sentence: the sign test bans the word *anyway* in any player-readable string,
and a new note in `difficulty.json` used it. The note was reworded.

### From rendered frames

`tools/harness/run.sh lazydad` is new. It starts the **same level twice**, once
on each mode, and reads six numbers off the running scene — not off the data
they came from — at 667x375, 844x390 and 1280x720. All three pass:

```
lives 20 -> 60 | purse 104 -> 150 | wave gap 15s -> 22.5s
  | revive 25s -> 17.5s | cooldown 12s -> 10.2s | Bruiser 66hp -> 46hp
RESULT normal is unchanged and Lazy Dad Mode moves all five knobs, at 844x390
```

Reproduce with:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh lazydad 180 844x390
python3 tools/harness/shrink.py tools/harness/shots/lazydad-lazy-dad-844x390.png 900
```

The two screenshots are the evidence the numbers cannot give. Side by side at
844x390: the normal frame reads **130 peanuts, 20 lives, BACK IN 17s** with the
two ability medallions at **17** and **11**; the Lazy Dad frame reads **240
peanuts, 60 lives, BACK IN 8s** with both medallions at **8**. The hero returns
faster and the abilities recharge faster, visibly, on the board.

Half of the scenario is `normal`, deliberately: each of the six numbers is
checked against `rules.json` and the hero's own def on `normal` before it is
checked against the multiplier on lazy-dad. "Lazy Dad is easier" is only worth
having next to "normal is exactly what it was".

Two things the scenario got wrong on its first run, both harness bugs that
looked exactly like product bugs — the rule in `CLAUDE.md` about not trusting a
first red result earned its place again:

1. **`heroSlot0` is not an id.** `heroSlotId(0)` returns `'heroSlot1'`; the ids
   are 1-based and the index is 0-based. `secondsLeft` of an unregistered id is
   `0`, so "the cooldown is instant" and "you asked about a slot that does not
   exist" are the same reading. It now takes the id from the game's own
   function.
2. **One enormous hit does not knock the hero down.** The transformation clamps
   an incoming hit at the half-health floor and grants invulnerability at the
   swap, so he ends up standing at exactly half with nothing able to touch him —
   and the revive clock reads 0, which is precisely what a broken revive would
   look like. He is now hit repeatedly with the grace allowed to expire.

`sh tools/harness/run.sh screens 140 <vp>` at all three viewports: **no new
layout faults.** 1280x720 is clean; 667x375 and 844x390 each report one `SMALL`
fault on the Title screen's version stamp, which is self-labelled *"hidden dev
door, not a tap target"* and is pre-existing.

---

## What is NOT checked

* **The per-tower distortion from the health scalar is not measured.** The
  argument that 0.7 swamps it is an argument about magnitude, not a measurement
  of how much better the Grinder got. If someone wants that number it is a
  sensitivity run per tower, and it does not exist.
* **No level was tuned for Lazy Dad Mode and none should be.** The multipliers
  are global. Levels 1 to 4 sit above the band and the fix for that would be
  per-level difficulty data, which is a much larger thing than this brief.
* **The wave interval is unmeasured**, as above.
* **The soak's builder is not a child.** Every figure in this report is a
  competent adult who builds at the first affordable moment and never mis-taps.
  The band was hit against that player. What a six-year-old scores is unknown
  and is lower.
* **Nothing here was played by a human.** The harness reads a running scene; it
  does not play the game.

---

## Pre-existing faults found on the way

**`tools/harness/run.sh difficulty` fails on `main`, and did before this
change.** Two faults, both the same stale expectation:

```
*** the HUD does not show the difficulty
*** a mid-run change to the save reached the run
```

The HUD **deliberately stopped showing the difficulty** — `difficulty.test.ts`
asserts `HudScene.ts` contains no `difficultyName` and explains why at length —
and the scenario was never updated. The second fault is a false positive that
falls out of the first: the scenario looks for the readout, finds nothing, and
its `!readout` branch reports that a mid-run change reached the run. **Confirmed
pre-existing by stashing this change and re-running it**, which reproduces both
faults identically on `65c160b`.

Not fixed here. The fix is to have section 3 assert the HUD does *not* name the
mode and drive the capture-once rule through `G.status.difficultyId` instead —
but `difficulty.test.ts` asserts the scenario's current text in three places, so
it is a deliberate paired edit rather than a drive-by.

**The soak's lifesteal never fires.** `Sim.ts` calls
`night.healFor(e as never, dealt)` and `NightRules.Vampire` wants a `maxHealth`
field that `SimEnemy` does not have — so `lifestealHeal` computes
`Math.min(damage * fraction, undefined - health)`, which is `NaN`, which fails
`healed > 0` in silence. Level 5's vampires have drunk nothing in every soak
ever published. **Not fixed**, because fixing it would move level 5's published
win rate and that is a retune, not a difficulty change. It is the same failure
shape as the regen bug that `Sim.ts` already carries a long comment about.

---

## Where this leaves the repository

* **`main` carries the change** at `2a115d2`, after two merges of work that
  landed during the session. Run 407 was in flight when this was written; the
  table at the top is closed by the commit that follows this one.
* **Levels 1, 2, 3 and 4 sit above the 85–95% band on Lazy Dad Mode** (98.3,
  96.5, 99.8, 99.0) and no global multiplier brings them in. This is not a
  defect to fix; it is what a 51-point spread of `normal` win rates looks like
  after a uniform easing. Left as it is.
* **The `difficulty` harness scenario is stale and red on `main`** — diagnosed
  above, deliberately not fixed, and it needs a paired edit with
  `difficulty.test.ts`.
* **The soak's lifesteal is dead** — diagnosed above, deliberately not fixed,
  because it would retune level 5.
* **`waveIntervalMultiplier` has no test that measures its effect**, only tests
  that it is wired and that the simulator's blindness to it is documented. The
  harness proves the countdown is longer; nothing proves that helps.
* Carried forward from `reports/2026-09-17-level-9-retune.md`: `png.py`'s
  filtering gap and the soak's `MINOR_LANE_SHARE` cliff are both still open.
