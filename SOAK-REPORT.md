# Soak report

Newest first.

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
