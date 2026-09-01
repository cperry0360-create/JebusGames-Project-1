# Soak report

Newest first.

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

**5. The soak does not model the Tax Shelter's buff. GAP, NOT FIXED.**
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
