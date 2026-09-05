# Deployment status: everything after 11:06 UTC is built, tested and unpublished

*2026-09-05 · Courjahan Defense · main*

| commit | what | CI |
| --- | --- | --- |
| `af29583` | Record why nothing has deployed since 11:06 | ❌ asset budget only — inherited from `main` |

`af29583` is a documentation-only commit on
`claude/deployment-status-review-a661d6`. It is red for the same single reason
every commit since `c9ea190a` is red, and its run
([33988899244](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33988899244))
is the cleanest evidence in this report: `npm test` **failure**, `npx tsc
--noEmit` **skipped**, `deploy` **skipped**.

This is a read-only review of today's pushes. Nothing in the game changed.

## The headline

**The live site is 28 commits behind `main`.** The last thing published to
GitHub Pages was `0c3abc1f` at 11:06 UTC. Everything since — level 3, branching
lanes, air cover, summons, cutscenes, the Ima Dummy Tower, the hero roster,
transformations and the two-button hero bar — exists on `main`, passes 761 of
762 tests, and is on nobody's screen.

The cause is a single failing test and it is not a bug in any of that work.

## What is red, and why

`tests/content.test.ts:1186` — *"the deploy stays small enough to open on a
phone"*. It caps everything under `public/assets/` at 40MB. The tree is at
**58.0MB**.

`deploy` is gated on `checks` (`.github/workflows/checks.yml`), so a red test
does not publish. That gate is working exactly as designed — it is the reason a
12.6MB map plate never reached a phone. It is not the thing to change.

The line was crossed by an art upload, and the growth is entirely art:

| commit | time (UTC) | assets | state |
| --- | --- | ---: | --- |
| `0c3abc1f` | 11:05 | 38.0 MB | ✅ **last green — this is what is live** |
| `c9ea190a` | 11:32 | 43.3 MB | ❌ first red: `enemy_pompom`, `enemy_zamboni` +2 |
| `a6eeacf7` | 11:33 | 45.4 MB | ❌ `boss_projectile.png` (2.14MB) |
| `62200811` | 12:01 | 47.4 MB | ❌ `fx_stunned.png` (1.99MB) |
| `6507abd6` | 13:01 | 48.6 MB | ❌ `boss_unicorn.png` (1.24MB) |
| `d3598ce4` | 13:38 | 50.4 MB | ❌ level 2 cutscene webps |
| `7e0bd71e` | 14:09 | 53.9 MB | ❌ `tower_dummy_1..3.png` (2.4MB) |
| `860e6048` | 14:27 | 58.0 MB | ❌ four heroes, base + power |
| `5e968365` | 19:48 | 58.0 MB | ❌ HEAD |

Every red run since `c9ea190a` fails on this one assertion and nothing else.
761/762 pass on HEAD.

### The second-order problem

`npm test` runs **before** `npx tsc --noEmit` in the checks job, and a failing
test exits the job. So **the typechecker has not run in CI since `0c3abc1f`**.
This is not inference: in run 33988899244 the `npx tsc --noEmit` step is
recorded with conclusion `skipped`.
Thirteen new source files have landed since — `Lanes.ts`, `AirCover.ts`,
`Rally.ts`, `TowerDisable.ts`, `Heroes.ts`, `Transform.ts`, `HeroSkills.ts`,
`Cutscenes.ts`, `Soldier.ts`, `CutsceneScene.ts` and three data files — and none
of them has been typechecked by anything with `phaser` installed.

`sh tools/tsdiff.sh 0c3abc1` reports 15 new local errors. All 15 are the known
`node_modules`-less cascade, and I checked the two that look real:

- `GameScene.ts` — `applySlow`/`applyStun` do not exist on `Targetable`.
- `Tower.ts` — TS2740, `Targetable` missing 67 properties of `Enemy`.

Both are artifacts. `withinRadius` is generic (`<T extends Targetable>`,
`src/systems/Targeting.ts:79`), and `Enemy extends Phaser.GameObjects.Container`
— so without Phaser, `Enemy` loses `x`/`y`, fails the `Targetable` constraint,
and TS falls back to inferring `T = Targetable`. With `phaser` present the
inference is `Enemy` and both messages go away.

That is a reasoned expectation, not a verified result. **The first green run
after the budget is fixed is the first real typecheck of a day's work.** Treat a
`tsc` failure there as expected-and-fixable rather than as a surprise.

## What is actually live right now

`https://cperry0360-create.github.io/JebusGames-Project-1/` serves `0c3abc1f`
(deploy job `101296521438`, succeeded 11:06:42 UTC). That build has:

- levels 1 and 2, the composed world map replacing the level-select row,
- a resumed run getting its HUD back,
- the Bailey easter egg removed, level 2 wave health at +18.5% over level 1.

I could not fetch the page to confirm — the agent proxy returns 403 on
`github.io`. The deploy-job record is the evidence.

## What is pushed but not live

28 commits, 129 files, +11,303/−1,010.

| feature | commits |
| --- | --- |
| Branching lanes, unshootable layers, enemy summons | `d2825b8`, `7545559`, `885168c` |
| Level 3 (the fork), its cast and waves | `23fc731`, `45ab91a`, `56bd234`, `c685efb` |
| Cutscenes before a level | `9ba4e94` |
| Ima Dummy Tower + tier-4 branch | `f7d4f2c`, `46443af` |
| Hero roster and transformation | `0195b93` |
| Two buttons per hero, centre start | `b92bcc8` |

Plus 13 art uploads. Nothing is branched, nothing is in flight, no PRs are open,
and the working tree was clean when this started.

## Getting back to green

The tree needs to shed 18.1MB. Three options, cheapest first. **All of them
touch your art, so none was done.**

### 1. Delete what is shipped and never loaded — 10.8MB, zero visual change

Fifteen images under `public/assets/` are not named by any file in `src/`
(including every JSON in `src/data/`) or by `index.html`. Everything under
`public/` ships whether or not the manifest points at it, so each one costs a
phone its full weight for nothing.

| MB | file | what I think it is |
| ---: | --- | --- |
| 2.69 | `nodes/map_world.webp` | superseded by the composed world map in `8ec7086` |
| 2.23 | `maps/L3_trace.png` | the level 3 tracing plate — a tool input |
| 1.54 | `enemies/unicorn_trimmed.png` | superseded by `boss_unicorn.png` (`6507abd`)? |
| 1.50 | `enemies/enemy_boss_beetle.png` | never wired to an enemy def |
| 0.62 | `props/prop_bailey_peek.png` | the easter egg removed in `79bb450` |
| 1.81 | `nodes/node_*.png`, `prop_coming_soon.png` | Phase 3 roguelite map art |
| 0.19 | `ui_icons/hud_peanut_icon.png` | — |
| 0.14 | `enemies/scale_check.png` | a measuring reference |
| 0.12 | `ui/icon_sell.png`, `ui/icon_confirm.png` | — |

`prop_bailey_peek.png` and `L3_trace.png` are safe on their own reasoning —
one belongs to a removed feature, the other is a tool input that belongs in
`tools/` next to `L3_pads_overlay.png`, which you already put there. The
**`nodes/`** set and the **beetle** are Phase 3 and unbuilt art respectively:
still wanted, just not wanted *shipped* — moving them to `tools/` or an
`art-source/` directory keeps them in the repo and off the wire.
`unicorn_trimmed.png` is the one I would not touch without you looking at it.

This alone takes 58.0 → **47.2MB**. Still red.

### 2. Re-encode the PNGs to WebP — the rest of the gap

PNG is 40.9MB of the 58.0. WebP at q95 took `map_level1_v2` from 10.9MB to
1.86MB on 2026-09-03, and the same treatment is what `tools/reencode` exists
for. Even a conservative 60% on the top twenty PNGs clears the cap with room
for level 4.

The heaviest, all of them uploads from today or yesterday:

| MB | file |
| ---: | --- |
| 2.14 | `effects/boss_projectile.png` |
| 1.99 | `effects/fx_stunned.png` |
| 1.64 | `enemies/enemy_zamboni.png` |
| 1.43 | `enemies/enemy_boss_beetle.png` |
| 1.33 | `enemies/enemy_catcher.png` |
| 1.24 | `enemies/boss_unicorn.png` |
| 1.15 | `enemies/enemy_longsnap.png` |
| 0.97 | `enemies/enemy_pompom.png` |
| 2.36 | `towers/tower_dummy_1..3.png` |

Watch rule 7 in `CLAUDE.md` when re-exporting: `contentWidth`/`contentHeight` in
`art.json` are **source** extents and `fitInBox` divides by them, so anything
that changes pixel dimensions needs `python3 tools/measure_art.py` afterwards.
A pure PNG→WebP re-encode at the same dimensions leaves them alone.

`cwebp` and PIL are both absent from this container, so I could not measure the
real saving. That measurement is the first thing to do on a machine that has
them.

### 3. Raise the cap

Available, and I would not. The cap is 40MB because a phone on mobile data
waits for it, and it has caught two 10MB+ uploads that nobody else noticed. The
tree is at 58MB with three levels built and a Banner tree, Holdings and siege
enemies still to come. Raising it now means raising it again in a fortnight.

If it is raised anyway, raise it *deliberately* to a number with a reason
behind it and write the reason into the test — the existing comment block is the
model.

## Things worth knowing that are not the budget

- **`npm install` fails in this environment** (registry 403), so there is no
  `node_modules`, `tsc` output is 179 lines of noise, and `npm test` cannot run
  locally either. `tools/tsdiff.sh` is the only local signal and it has a
  documented blind spot for Phaser members. Everything above about test results
  comes from reading CI logs.
- **The `checks` job orders `npm test` before `npx tsc --noEmit`.** Worth
  swapping, or splitting into two jobs, so one failure stops masking the other.
  This is the second time the ordering has hidden the typecheck for a day.
- **Level 3 is 0/60 wins** against a 35–45 target; level 2 is 10/60. Both are
  carried from earlier reports and neither is affected by the deploy problem.
- **Slot-2 hero powers are `effect: null`** by design — reserved, greyed, not
  built.
- **`ability_bailey_1.png` and `ability_eli_1.png` are still missing**; both
  fall back cleanly.

## Where this leaves the repository

### In flight

This report, on `claude/deployment-status-review-a661d6`. `main` is untouched.

### Blocked

- **The live site, on the asset budget.** Nothing publishes until
  `public/assets/` is under 40MB. Five features and a day of art are waiting on
  it.
- **The typecheck, behind the same failure.** Thirteen new source files are
  unverified by anything that can resolve `phaser`.

### Waiting on a word

- **Which of the three remedies above**, and specifically whether the 10.8MB of
  unreferenced images may be deleted or moved out of `public/`. That is your
  art; nothing was removed.
- **The hero balance spread** — five heroes, 19–31 wins in 40 on level 1.
  Diagnosis and fix are in `2026-09-05-two-buttons-per-hero.md`.

### Carried forward

- Level 3 at 0/60 and level 2 at 10/60 against a 35–45 band.
- Level 1 sits at 45, the top of its band, with Cory.
- `Levels.isLevelCleared` is derived, not recorded.
- `tsdiff`'s Phaser blind spot now covers `Soldier.ts` and `CutsceneScene.ts`.
- The four new heroes are 700px sources at 78 world px — 9.0× against the ~7×
  rule 7 asks for. Over rather than under, so the risk is minification.
