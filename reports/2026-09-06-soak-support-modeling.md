# The Beacon's aura: the half of the fix that was missing, and what it is worth

Three tasks in order, on `main`. No level was retuned. Every number below is
measured, and every measurement says how it was taken.

## The commits

| commit | what | CI |
|---|---|---|
| `be8e2f9` | the relight fix, `systems/Support.ts`, the soak's aura, the harness scenario, 8 tests | green on `main` (run 135), Pages deployed |
| *this commit* | this report and the `SOAK-REPORT.md` section | pending at the time of writing; see the note under the table |

`main` was already at `19de88e` when this session started, so the whole level 4
branch had landed. This work is on top of it, pushed straight to `main` as
asked. Run 135 ran typecheck, `npm test` and the gated Pages deploy, and all
four jobs are green.

> The report rule says the file is written last and updated until the work is
> finished. The row above is filled in from the run for this commit's own
> pre-amend hash; if you are reading it as `pending`, the amend that filled it
> in did not happen and the run should be checked by hand.

---

## Task 1 — the disabled Beacon

**The half the brief names was already fixed.** `refreshSupport` gained
`|| s.disabledFor > 0` in `0f35bcd`, on the level 4 branch, which is now on
`main`. A disabled Beacon has not been buffing since that commit, and the
regression test asked for is added below.

**The half that was still broken is the way back.** The aura came back late,
every time, and the reason is a units mismatch nobody had cause to look at:

- `Tower.tick` counts `disabledFor` down on the **scaled** clock. Everything
  the simulation does runs at `rules.json pacing.gameSpeed`, which is 1.4.
- `landDisable` schedules its recompute with `this.time.delayedCall(seconds *
  1000, ...)`, which is the **wall** clock and knows nothing about 1.4.

So the tower woke up at `seconds / 1.4` and the thing that put its aura back
fired at `seconds`. Measured live, on a real board, with a 1.5-second disable:

```
sh tools/harness/run.sh beacon 60 844x390
  lit:  bonus=0.30  damage=14.3 against 11.0 bare
  dark: bonus=0.00  damage=11.0
  relit after 1546ms real, against 1071ms expected     <- before
  relit after 1112ms real, against 1071ms expected     <- after
```

**475ms of a 1071ms disable, which is 44% — and 44% is `gameSpeed`.** Every
gun a Beacon covered spent an extra 40% of every disable at its own numbers.

There is a worse version of the same fault latent in it. `dt` is zeroed during
a hit pause, so the tower's countdown stretches while the wall clock does not;
enough hit pauses inside one disable and the timer fires **before** the tower
recovers, leaving the aura dark until something else happens to change the
board. It takes about 1.0 real second of pause inside a 3.5 game-second window
— eleven Haymakers at 90ms, or five Last Stands at 220ms — so it is not
reachable in play today. It is reachable by anyone who lengthens a hit pause.

**The fix is to stop asking a timer.** The run loop compares the number of dark
Beacons against the number at the last recompute, one frame after the towers
tick, and recomputes when it changes. A state that a timer opens and a
different clock closes can only fail; a state read off the towers themselves
cannot drift from them.

### The regression tests

`tests/support.test.ts`, 8 tests, and they test the rule rather than the text
of the scene — which is possible because the rule moved out of the scene (Task
2). The dark case:

```
a Beacon that is switched off lifts nothing
  auraAt(10, 0, [dark])                    -> { damage: 0, range: 0, pierce: 0 }
  auraAt(10, 0, [dark, lit])               -> exactly one Beacon's share
  and the same for a Signal Fire's range and a Bonfire's pierce
```

Plus the boundary (inclusive at exactly the radius, real distance rather than
per-axis), stacking, the tier-2 bonus against `boostedDamage`, and four
assertions that both call sites read the shared rule and pass `disabledFor`
into it.

**And a live check that can fail.** `tools/harness/index.html` gains a `beacon`
scenario: it builds a gun and a Beacon 186px apart on the real board, reads the
bonus, switches the Beacon off through `landDisable` itself, and watches for
the bonus coming back. Both faults were injected and both were caught —

| injected | scenario reported |
|---|---|
| the `dark` check removed from `auraAt` | `*** a switched-off Beacon went on buffing ***` |
| the run loop's dark-count watch removed | `*** the aura came back 470ms late, which is a timer relighting it rather than the tower ***` |

Both injections were reverted. CLAUDE.md's rule about not trusting a first red
result cuts both ways: a green check that cannot go red is worth nothing, and
this one was made to go red twice before it was believed.

---

## Task 2 — teaching the soak about support

The arithmetic is `src/systems/Support.ts`: `auraAt(x, y, sources)` over an
`AuraSource` per Beacon, carrying radius, the three bonuses and `dark`. The
scene builds its sources from `Tower`'s getters; the simulator builds its own
from `statAt`, with the two spec grants read off the specialization directly
because they are flat fields rather than multipliers and `statAt` would
multiply a base that does not exist and hand back 0. That is the same trap
`Tower.supportRangeBonus` avoids the same way.

All three parts reach the shot, exactly as `Tower`'s three getters apply them:

```ts
const gain  = lift(t)                                    // sources within radius, lit only
const range = statOf(t, 'range') * (1 + gain.range)
const dmg   = boostedDamage(statOf(t, 'damage'), gain.damage)
const pierce = statOf(t, 'armorPierce') + gain.pierce
```

The aura is read at the moment of the shot rather than cached on the tower, so
a Beacon switched off between two shots is felt on the second one — which is
the disable case from Task 1, in the simulator, out of the same file.

What is deliberately NOT modelled, because the game does not do it either: the
lads in an Ima Dummy Tower get no share of the aura (`Tower.damage` is the only
getter that calls `boostedDamage`), and the build-order filter still asks a
gun's own range to reach the road rather than its buffed range.

---

## Task 3 — all four levels, re-soaked

    node --experimental-strip-types tools/soak/level.ts 120 <level>

Same seeds, same mode, one thing changed.

| level | old win rate | new win rate | change |
|---|---|---|---|
| level 1 | 90/120 — **75%** | 95/120 — **79%** | +5 runs |
| level 2 | 20/120 — **17%** | 25/120 — **21%** | +5 runs |
| level 3 | 80/120 — **67%** | 90/120 — **75%** | +10 runs |
| level 4 | 46/120 — **38%** | 63/120 — **53%** | +17 runs |

Per seed: 39 runs flipped to a win, 2 to a loss (level 4 seeds 16 and 80 —
a stronger board changes what the run does, not only how it ends). At 480
seeds level 3 goes 66% → 71% and level 4 40% → 53%, so the 120-seed numbers
are not a small-sample artefact.

**Where the losses land now**, against where they landed before:

| level | before | after |
|---|---|---|
| level 1 | w8x2 w9x1 w12x27 | w8x2 w9x1 w12x22 |
| level 2 | w6x2 w7x1 w12x97 | w6x2 w7x1 w12x92 |
| level 3 | w9x4 w10x6 w11x13 w12x17 | w9x4 w10x4 w11x4 w12x18 |
| level 4 | w6x36 w8x1 w11x2 w12x35 | w6x35 w8x1 w11x1 w12x20 |

**The Beacon buys the late game and does nothing for the wave 7 boss.** Level
4's losses at the boss are 36 → 35; its losses at the finale are 35 → 20. That
is the same finding the level 4 tuning pass made from the other direction: the
boss fight is decided by what the board can deliver to one target, and a 30%
damage aura on two or three guns does not change that. What it changes is the
thirteenth wave, where there are many targets and every gun is firing.

Why the levels move by different amounts is how often a Beacon is drawn and
built at all — measured with a probe copy of the simulator, since the run
result does not record the board:

| level | runs with a Beacon | Beacons built | the boss's attention |
|---|---|---|---|
| level 1 | 29/120 | 49 | no caster on this level |
| level 2 | 58/120 | 146 | no caster on this level |
| level 3 | 72/120 | 140 | 60 disable casts landed on one, over 25 runs |
| level 4 | 68/120 | 161 | 43 eaten outright by the Glitch Bug |

### The disable case, isolated

The corrected simulator against a probe copy with the dark check removed —
that is, the aura modelled but the Task 1 bug left in:

| level | correct | with the bug |
|---|---|---|
| level 1 | 95/120 | 95/120 |
| level 2 | 25/120 | 25/120 |
| level 3 | 90/120 (343/480) | 90/120 (343/480) |
| level 4 | 63/120 (255/480) | 63/120 (255/480) |

**Not one outcome differs.** On level 3, where 60 casts land on a Beacon, 12
of 120 runs differ in kills, seconds or lives and the total lives across all
runs is identical. The rule is in because the game does it, not because it
moved a number — and that is worth knowing before anyone spends a tuning pass
on the Reaper's duration expecting it to matter.

---

## The level 4 question

**Level 4 is 53% with the 1200 HP boss.** The band the other levels are judged
against is 35–45%, so on the corrected simulator level 4 is now above it, not
below.

Since the sensitivity table in the last report was measured on the simulator
that scored Beacons as dead towers, its boss rows are re-measured here. 120
seeds each, `glitchLich` and `glitchLichReturn` moved together at the level's
own 1.5x, everything else untouched, `src/data/enemies.json` reverted after:

| boss / finale | win rate |
|---|---|
| **1200 / 1800 (shipped)** | **63/120 — 53%** |
| 1400 / 2100 | 54/120 — 45% |
| 1500 / 2250 | 54/120 — 45% |
| 1600 / 2400 | 48/120 — 40% |
| 1800 / 2700 | 36/120 — 30% |
| 2400 / 3600 | 17/120 — 14% |
| 3600 / 5400 | 2/120 — 2% |

**1400 to 1600 is the band.** The curve is steep — 400 HP is 15 points of win
rate — and it does not reach the brief's 5200 anywhere: 3600 already soaks at
2%. The last report's finding stands with the aura modelled, which is worth
saying plainly, because the Beacon was the obvious candidate for the thing the
board was missing and it is not.

**Nothing here has been changed.** The brief said not to retune, and this is a
measurement, not a patch. If the boss is to stay at 1200 the level plays looser
than its siblings by design; if it should sit in the band, `glitchLich` at
1400–1600 with the finale at 1.5x is one line of JSON and the table above is
the argument for it.

---

## Verification

- **885 tests pass** (877 before, 8 added). `npm test`.
- **`sh tools/tsdiff.sh 19de88e`**: 201 errors either side, nothing introduced.
  CI's real typecheck, with the Phaser typings installed, is green on `main`.
- **`sh tools/harness/run.sh screens 140 844x390`**: five screens, one fault —
  the version stamp's hidden five-tap dev door, deliberately under 44pt and
  self-labelled, known and recorded in three prior reports. No new fault.
- **`sh tools/harness/run.sh beacon 60 844x390`**: the aura lifts, goes dark
  with the tower and comes back with it, on a real board, with both failure
  modes proven detectable.

**Not verified.** The aura has not been watched in a real run with a boss
actually casting the disable — the harness scenario calls `landDisable`
directly, which is the same method the cast lands through but skips the
windup and the target picker. Those are covered by `towerdisable.test.ts` and
were not touched here. No screenshots were read for this change beyond the
`screens` set, because nothing about it is drawn: the Beacon has no aura
marker on the board, which is open item 5 below.

---

## Where this leaves the repository

**In flight:** nothing. `main` is `be8e2f9` plus this report, green, deployed.

**Waiting on a decision**

1. **Level 4's boss.** 53% at 1200 HP on the corrected simulator, against a
   35–45 band. 1400–1600 puts it in the band. Measured above; not changed.
2. **Level 2 at 21% and level 1 at 79%**, both still outside the band and both
   moved a little by this pass. Level 2's 92 remaining losses are all The Devil
   on wave 13 — the same shape of problem level 4's boss had, and the boss
   sensitivity method above is the tool for it.
3. **Three of the level 4 brief's numbers were overruled by existing tests**
   (the table in the previous report). Each is one line.
4. **A 2.25x finale instead of 1.5x** on level 4, from the previous report.

**Open**

5. **The Beacon's art is a gun**, and there is no aura marker on the board.
   Nothing on screen says "support" once it is placed. Wants art.
6. **Both of Eli's ability icons are the missing-art stand-in**, and
   `ability-bailey-1` still is too.
7. **Loadout card text overflows its card** — `stackSections` may squeeze a
   card row below its measured content height; `cardFace`'s `maxLines` clips
   SCRATCH TICKET and CHAIN. Diagnosed in `2026-09-06-the-soft-lock.md`.
8. **667x375 Loadout overflow**, 87 design units with every section at its
   floor.
9. **The soak's win rates are floors.** Waves 2 onward auto-start in the game
   and pay an early-start bonus of 2 peanuts a second that the simulator never
   banks — about 360 peanuts over a run. Closing that would move every number
   in this report again, upward.
10. **The soak still cannot reach the entity layer.** `SOAK-REPORT.md` lists
    what separating it would take; steps 1 and 2 are a large refactor and want
    a sign-off.
11. Older: no `package-lock.json`; `tools/trace_map.py` broken; the eight
    ability icons that grew as WebP; lossless for the twelve low-PSNR small
    sprites; `art-source/` has no README; the desktop render-scale floor
    (`RENDER-QUALITY.md` §6); `DESIGN.md` still calls Eli "The Charmer" with an
    active named *Fetch*, two names out of date.

**Closed by this session:** the disabled Beacon (both halves — it stopped
buffing when dark in `0f35bcd`, and it comes back on time now), and the soak's
support gap, which was item 4 of the previous report and item 5 of the
2026-09-01 soak report.
