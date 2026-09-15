# Courjahan Defense — working context

Background for any Claude session in this project. Chats aren't readable across
sessions, so this doc is the shared memory. Update it when something durable changes.

## Links

- Repo: https://github.com/cperry0360-create/JebusGames-Project-1
- Live (GitHub Pages): https://cperry0360-create.github.io/JebusGames-Project-1/

## What this is

Courjahan Defense: a Kingdom Rush-style tower defense game under the JebusGames
studio name, built for Cory's family. "Courjahan" = Courtland + Elijah + Han (keep
this spelling; the fitness project spells it "Courjiahan").

Distinct from **Tempered**, the health/fitness tracker RPG (repo:
https://github.com/cperry0360-create/tempered). Different project, different repo.

**Architecture:** Vite + TypeScript + Phaser. The original brief called for one
self-contained HTML file; that was a proof of concept only, and moving off it was a
deliberate decision. Do not flag it as drift, and do not try to restore it.

## Working with Cory

New to game development and dev tooling; has asked to be told when his approach is
inefficient. Explain tooling concepts plainly. He is a tax partner by day, fast on
substance and precision, not on dev vocabulary. He works through the Claude desktop
app and the GitHub web interface, does not use a terminal, and does not type shell
commands himself. **A report that hands him git commands has not finished the job:
turn it into a Claude Code prompt.**

**Deviating from a brief is welcome when the brief is wrong**, as long as the session
says so plainly, measures both options, and names the revert. The level 4 boss change
is the model.

## The three-tool workflow

1. **ChatGPT** — generates art
2. **Claude (this app, chat)** — cleans up art, writes the Claude Code prompts, acts
   as design/thinking partner. Does not touch the repo.
3. **Claude Code** — all coding, asset uploads, commits

**Chat can check the live site** two ways: the browser pane when the desktop link is
up, or WebFetch against asset URLs when it is not. A URL that returns "Image content
is not supported" EXISTS; a 404 is missing.

**WebFetch caches per URL for 15 minutes, and that cache WILL lie to you after a
deploy.** Probing the same bare URL before and after a merge returns the pre-merge
404 and looks exactly like a failed deploy. Always append the new commit's version
string (`?v=<sha>`) so the URL is fresh. This nearly produced a false alarm about a
deploy that had worked perfectly.

**The Claude Code sandbox cannot reach github.io at all** — the egress proxy answers
403 to CONNECT, a policy denial that no retry fixes. So a Claude Code session can
prove an asset is in the deployed commit, that nothing filters it out, and that the
Pages artifact grew by the right number of bytes, but it can never return a 200. The
final 200 has to come from chat.

**Prompts written in one chat and run a day later carry stale assumptions.** A level 5
prompt drafted 2026-09-06 and reviewed 2026-09-07 had picked up three: it preserved
the abandoned single-HTML-file shape, wired the points skill tree into a story level
after points moved to run mode, and used the retired `runsClearedToUnlock` field. Run
any sitting prompt back through a session that has this doc loaded before sending it.

## Repo conventions (from CLAUDE.md — read it, don't guess)

- **Balance numbers live exclusively in JSON under `/src/data/`.** Never hardcode a
  tunable.
- **Branching:** Cory wants work committed straight to `main`, no branches or PRs.
  Sessions that cannot push to main must open their final message with the branch name
  and the exact merge command, and must say plainly when a branch and main are already
  the same commit rather than inventing a merge step.
- **The deploy workflow is triggered by Checks on `main`, not by a push.** Green CI on
  a branch does not deploy anything. A branch can be green for hours while the live
  site sits on an older commit. This has already cost half a day once. **And a
  markdown-only push to `main` does not deploy either**, which is newer than this
  note: `deploy.yml` is now a reusable workflow called by a `deploy` job inside
  `checks.yml`, gated on `needs: [test, typecheck, changes]`, and the `changes` job
  answers false when every changed file is a `.md` or under `reports/`. So a green
  run on `main` with `deploy` **skipped** is correct behaviour on a docs commit, not
  a failed deploy. Read the JOB list, not the run's overall conclusion.
- **Build/test:** `npm install` and `tsc` are the unreliable pair — the registry
  answers 403, so there is no `node_modules` and `tsc` cannot resolve `phaser`.
  **`npm test` is fine and runs the whole suite** without one. For typechecking use
  `sh tools/tsdiff.sh <known-green-commit>`, and know its blind spot: without the
  real typings every Phaser member is `any`, so an access rule on one cannot fire
  locally and CI is the first thing that can tell you. UI verification uses
  `sh tools/harness/build.sh` then `sh tools/harness/run.sh`, checked at 375×667,
  390×844, and desktop, in both orientations. Portrait is *gated* by the rotate
  overlay rather than audited, and that is the correct answer for portrait.
- **Asset pipeline:** after re-exporting art run `python3 tools/measure_art.py` and set
  `contentWidth`/`contentHeight` from its INK output, never the canvas. Source height
  is a formula, not a constant — `world height x maxZoom x devicePixelRatio`, per
  CLAUDE.md rule 7. It works out at about 7x today because maxZoom is 2.37 and
  `Resolution.ts` caps dpr at 3; recompute it rather than memorising the 7, because
  the zoom band moves.
- **Reporting:** dated reports in `/reports/` as `YYYY-MM-DD-topic.md`, with commit
  hashes, CI status, and a "where this leaves the repository" section.

## THE TEST SUITE LIES — read this before trusting a green run

Three separate confirmed cases of tests that pass while asserting nothing:

1. Three ability art files were named in `art.json`, requested on every boot, absent
   from the repo, and green on all four CI jobs. Fixed: `tests/assets.test.ts` now asks
   the blunt question with no exemption list.
2. `run.sh towerpanel` had been throwing on its first line since the build menu was
   deleted, exiting 0, and reporting success while running none of its assertions.
   Fixed.
3. **Closed, 2026-09-07 (`39cca69`).** This said seven scenarios still drove the
   deleted build menu and then named eight. Running each one put the real count at
   **eleven**, and the list was wrong in both directions: `muzzle` and `retreat` were
   working, and `fx`, `icons`, `phone`, `stun` and `full13` were blind and unlisted.
   Nine were repaired, `poor` and `icons` deleted. The hole itself is closed in three
   places — `index.html` records a director error instead of swallowing it, `run.sh`
   returns the server's exit code instead of `exit 0`, and `server.py` exits 1 on a
   throw, 2 on a timeout, 3 on an unreadable report, 4 on a boot failure and 5 on a
   reported fault. `tests/harness.test.ts` holds all three links.

Today's register is a **declared** one, not a hidden one: `ASSERTS_NOTHING` in
`tools/harness/index.html` names five scenarios that drive the game and check nothing
— `muzzle`, `rockets`, `retreat`, `regressions`, `meteor` — and `server.py` **exits 7**
on any of them, so their numbers can no longer be mistaken for a passing check.
`USES_EXPECT` names the five held to "you must have reached at least one check", and
exits 8 if none was evaluated. `tests/harness-scenarios.test.ts` re-derives both lists
from the source so neither can rot the way the old one did.

**Five is the number, re-derived by running them rather than by reading any document,
2026-09-13.** A brief circulating that day named nine. Every candidate, at 844x390:

| scenario | exit | what that means |
|---|---|---|
| `muzzle` `rockets` `retreat` `regressions` `meteor` | **7** | declared, asserts nothing |
| `ui` | **0** | asserts and passes — **was 5/RED, fixed since; see below** |
| `buildall` | **0** | asserts and passes — **was 5/RED, fixed since; see below** |
| `typegame` | **0** | asserts and passes |
| `poor` | **6** | deleted; the scenario does not exist |

**`ui` and `buildall` are GREEN as of 2026-09-14 and this table used to say they were
red.** Both were re-run at 844x390 on `main` at `6100c78` rather than taken from a
report: `ui` exits 0 with `RESULT the pad beats the ground, and the hero moves only
when he has been picked up`, `buildall` exits 0 with `RESULT every one of the 7 pads
took a tower at 844x390`, and both report `assertFails: 0`. The two failures this
paragraph used to describe — `A TAP ON THE HERO DOES NOT SELECT HIM`, and `only 6 of 7
pads could be built on` with pad 3 at world 578,612 reporting `ringOnTap=false` — do
not reproduce. That closes the open item
`reports/2026-09-14-merge-level-9.md` left carrying them as red and undiagnosed.

**Their exit 0 is worth exactly one caveat**: both report `assertionsExpected: false`,
meaning neither is in `USES_EXPECT`, so nothing forces them to have reached a check.
Their green rests on the `RESULT` line and the `assertFails` counter, which is weaker
than `typegame`'s guarantee (`assertionsExpected: true`) and stronger than a bare
exit 0. Promoting them into `USES_EXPECT` is not done and is not asked for.

**And there is a sixth that asserts nothing and is NOT declared: `abilitybar`.** It
contains no `expect()`, no fault counter and no `RESULT` line, so it exits 0 whatever
it sees, which is the exact hole `ASSERTS_NOTHING` exists to close. Its `DEAD` output
has now been read as a product bug twice. It is not one — see the note under the open
items.

**A green run still is not evidence about anything rendered**, for a different and
larger reason that survives all of the above: **no test in `tests/` imports Phaser.**
About 25 mention it, and every mention reads a source file as text and matches a
regex. So "1122 passing" says nothing about a sprite's size, a camera transform, a
texture that failed to load or a shader — the harness is the only thing that looks at
a frame. See CLAUDE.md, "The test suite cannot see Phaser at all".

Related lesson: when a visual bug cannot be found in the code, check whether it is
baked into the art. The HUD double peanut was painted into `hud_peanuts.webp`.

## Design direction

- Art: animated, Simpsons-inspired cartoon look. Avoid "AI slop" appearance.
- Heavy tax theme dropped; towers and enemies being renamed with the kids.
- Kids design the enemies. Elijah designed the level 1 boss and the level 5 concept.
- Credits: every role listed as "Cory", except Elijah as Voice Actor. 60-second
  credits roll, JebusGames splash.
- No fabricated logos or marks. Explicitly not a Kingdom Rush clone.
- Heroes: Cory, Courtland, Han, Eli, Bailey. All five are single static images facing
  right; flip is a runtime decision from travel direction. `artFacing` in
  `enemies.json` is a real field and a wrong value there made level 3's unicorn boss
  walk the whole level backwards.

## Modes: story first, roguelite later (decided 2026-09-06)

**Scope is 10 polished story-mode levels.** The earlier 20-level target is deferred.
Both modes share ONE set of authored content, but progression is deliberately split:

| | Story mode | Run mode (roguelite) |
|---|---|---|
| Progression | **3 cakes per level** | **Points skill tree** |
| Order | fixed, clearing a level unlocks the next | branching node map, random draw |
| Tuning | soak-tuned win rate per level, 35-45% band | coarse tier per map |

Points and the skill tree are removed from story mode but kept whole for run mode,
with a test that fails if anyone tidies the unreferenced module away. Cakes gate
nothing.

Run mode decisions for whenever it is picked back up: hand-authored maps, not
procedural terrain; run-mode maps are a cheaper artifact than story levels (no bespoke
boss, scripted moment or voice lines); spec maps by path topology first and art
second; build six before twenty; 60-seed sanity soak per map rather than 120-seed
tuning. Considered but not decided: locking run mode behind story completion (ship a
debug unlock if it goes in). Unanswered: does a failed run wipe progress?

## Difficulty modes

**Lazy Dad Mode** (casual), **Yeah, I Game** (normal), **Try Hard** (hardcore). They
change starting lives and starting peanuts and nothing else. `normal` is a literal
no-op, proven twice: a test against `rules.json` and a 120-seed soak reproducing every
published win rate seed for seed.

**Known limit:** neither lever touches a level whose failure mode is a boss DPS check.
Level 2 was exactly that. If later levels share that shape, a casual-only enemy-HP
scalar may need revisiting.

## THE BOARD-SIZE PROBLEM (found 2026-09-07, convention settled since)

**Build pads per level: 7, 15, 15, 14, 14, 18, 22, 19, 15, 12** for levels 1 to 10. No
documented convention when this was written. Boss HP only means something relative to
how much DPS a board can hold, so **level 1's and level 2's boss numbers were never on
the same scale**, and cross-level difficulty reasoning done before this was found is
suspect.

This does NOT invalidate a number measured on a level's own real board.

**What was settled is a placement rule, deliberately not a pad count.** Levels 5 to 8
were all placed by a `tools/trace_levelN.py` and verified by a `tools/check_levelN.py`
against the four properties levels 3 and 4 established: each pad's 24 px core on
classified buildable ground, 90–114 world px from the nearest lane centreline, at
least 74 px from another pad (`2 x spotRadius` is 68, plus margin), and at least 34 px
from a frame edge so its tap target is on the board. The count is whatever those rules
allow, and each `_buildSpots` note says so. The corollary is the important half and it
is now written into the data: **boss health is soaked against its own board and
transfers to no other level.** Level 7 spells out why — 20 of its 22 pads reach two
highways at once, so it holds far more effective DPS than 22 pads suggests.

Level 5's draft prompt said "8-10 slots", written without knowing the built levels ran
14-15. It shipped with **14**, matching levels 2, 3 and 4, so the second level 1 was
never minted.

## Level 2: diagnosed, fix measured, APPLIED 2026-09-07

Level 2 soaked at 21% against level 1's 79%, level 3's 75% and level 4's 53%.

- Every single win finishes 20 of 20 lives. Lose one life anywhere and the level is
  lost. There is no middle outcome.
- 367 of 374 losses land on wave 13, the Devil.
- Not economic (every run reaches him with all 15 pads filled and money spare), not
  pacing, not a damage-type wall (removing his armour entirely is worth one point).
- It is raw damage. Level 2's median loser brings 264 board DPS, exactly level 1's
  median winner. The Devil is 6200 HP in the second level of the game.
- With all pads filled and money spare in every run, the only variable left is the
  random tower draw. Level 2 is not testing play, it is testing whether the draw
  produced enough DPS to clear a fixed check. 21% means only the top fifth of draws
  can.

**The fix landed in `862ecf7`:** `theDevil.maxHealth` is **5200** in `enemies.json`
today, down from 6200. It measured 40% at 480 seeds on the day, and it provably could
not touch another level — `theDevil` is named in exactly two places and both are in
`waves.level2.json`. Full sensitivity table and four rejected candidates in
`reports/2026-09-07-balance-verification-and-level-2.md`; the change itself is written
up in `reports/2026-09-07-the-blind-harness.md`.

**The failure did not move anywhere more interesting.** At 5200 the level is still
twelve free waves and one boss check: 281 of 288 losses still land on wave 13, and
every win is still a flawless 20 of 20 lives. Giving level 2 a difficulty curve is a
wave-table job, not a boss-health one, and nothing has attempted it.

**All the win rates in this section are the 2026-09-07 instrument and none of them
reproduce today.** The soak has been reworked several times since. The current
published Cory-pinned figures at 480 seeds on normal are **level 1 89%, level 2 53%,
level 3 88%, level 4 62%, level 5 45%, level 6 44%, level 7 41%, level 8 38%,
level 9 40%, level 10 41%**. `SOAK-REPORT.md` is the living record; read it rather
than any number in this file.

**Two of those moved on 2026-09-15 and both are recorded in
`reports/2026-09-15-blockers.md`:**

- **Level 8 is 38% (184/480), and it was 42% (200/480).** Its east arm climbed 76 px
  to the fork and `south` sent every east entrant straight back down — a 135-degree
  hairpin that live play reported as the enemy reversing. Removing the detour took
  183 px of walking under a 19-pad board's guns out of the east route. In band; not
  retuned.
- **Level 10's 41% is NOT "a different kind of number" any more**, and this paragraph
  used to say it was. The caveat it rested on — the soak cannot express build lock,
  generate wall or generate weapon, so it measures an easier fight — does not hold
  for a board with every pad built on, which is what the soak's own median board IS
  at the final wave. A locked pad still fires, a countermeasure needs a pad that is
  neither occupied nor locked so the cast is skipped, and a wall's only damage source
  is the hero. All three are asserted in `tests/level10.test.ts`.

## Level 4 boss: settled

1500 HP with the finale at 2250, 44% at 480 seeds, 75% of losses on the wave 7 fight.
(The 1500/2250 pair is still what `enemies.json` carries. The 44% is the 2026-09-07
instrument; the same board reads 62% on today's soak — see the note under level 2.)
The brief said 1500 and nothing else, which turns `tests/level4.test.ts` red: the
return form is pinned at **1.5x the first form** by a documented design rule with a
test on it. Both measured: 1500/2250 is 44% (in band), 1500/1800 is 47% (out). **The
1.5x ratio is a real invariant. Move the pair.** Cory confirmed keeping 2250.

## Level 5 (designed with Elijah) — BUILT 2026-09-07

Day-to-night crossroads level. Starts in daylight, flips to night mid-waves and
ordinary enemies become vampires. Roster: gliding cape vampires that float rather than
fly, fast baby Frankensteins, a big vampire elite, a vampire lord that splits on death.
"Vampirson" = lifesteal on attack; bleed disables lifesteal, which is the level's
counterplay loop. Boss is "Batula", a half-bat half-vampire humiliation character who
stops every few steps and leaves an acid puddle that kills player ground units but not
his own team, gaining speed and damage with each one he drops.

**All of it shipped.** `levels.json` calls it `level5` / "The Crossroads",
`map_level5.json` carries 14 pads, and every mechanic in the paragraph above has its
own module: `DayNight.ts`, `NightRules.ts`, `Vampirism.ts`, `AcidPuddle.ts`, with the
numbers in `level5.json` under `phases`, `conversions`, `lifesteal`, `bleed`,
`gliding`, `acid` and `humiliation`. **Batula is 4500 HP** and the level soaks at
**218/480 (45%)**, in band.

**The highest-risk unknown cost about 200 lines and was not the hard part.** Multiple
*spawns* were already supported — levels 3 and 4 have two gates each. Multiple *exits*
and a lane split were genuinely new, across `Lanes.ts`, `Gateway.ts` and `types.ts`.
The leak system needed nothing at all (`GameScene.leak()` was already lane-agnostic)
and neither did the soak's pathing model. The plate turning out to be a different
shape from the brief was the bigger problem. See `reports/2026-09-07-level-5.md`.

## Level 6 — BUILT 2026-09-11

A "super long" level. Art was the sticking point. Cory renders level segments as
multi-panel contact sheets rather than one image per segment, and
`claude/level-art-segment-rules.md` is the rule set that came out of that.

**It shipped as "Two Roads":** two lanes, 18 painted pads, slot 6 on the world map
behind four levels cleared, and a Rooster boss at **7,500 HP** soaking at **210/480
(44%)**. Two things were found by looking rather than asked for — the flame was never
wired into the game at all, and it crosses lanes. Pad 2 is dead by construction: it is
248.8 px from any lane against a 112 range, it is painted on the plate, and it stays.
Levels **7 ("The Highway", 22 pads, 41%)**, **8 ("The Optimization", 19 pads, CEO
boss, 42% after the 13 September re-topology — it published at 41% before it)**,
**9 ("AI Override: Part 1", 15 pads, four mini bosses rather than one, 40%)** and
**10 ("AI Override: Part 2", 12 pads, Vlaude at 26,000 hp, 41% — re-derived on
2026-09-14 once the fight was built; see the caveat in the status section)** followed
on 12–14 September. See `reports/2026-09-11-level-6.md`,
`2026-09-12-level-6-fixes.md`, `2026-09-13-level-7.md`, `2026-09-12-level-8.md`,
`2026-09-13-level-8-retopology.md` and `2026-09-13-level-9.md`; `SOAK-REPORT.md` is
the figure of record for all of them.

## Chapter 2 / Other Game (designed, nothing built)

A hero survivors-like that drops tower placement entirely: drag to move, heroes locked in
ultimate form auto-attacking, swarms on an open bounded arena. Hidden until story level 10
is cleared, then it appears as its own entry point, which is the joke. **That unlock
condition became reachable on 2026-09-14** — level 10 exists and is winnable — so this
is no longer gated behind content that does not exist. Nothing of Chapter 2 is built,
and the 45fps-with-200-enemies proof below is still the thing to do first. A comic library over
the comic art already in the game unlocks alongside it. Full design in
`claude/chapter-2-design.md`, art render rules in `claude/chapter-2-art-rules.md`. Highest
risk unknown: holding 45fps with 200 concurrent enemies on a phone. Prove that before
building anything on top of it.

## Status as of 2026-09-14 evening

**The last commit that changed the GAME is `afaee71`**, the Vlaude fight's re-soak,
and that is the durable number — `main`'s tip moves with every documentation commit.
Do not trust a tip hash written in this file; check it. Read Checks at JOB level, not
merely at run level: a markdown-only push to `main` is green with `deploy` **skipped**,
which is the `changes` job working as designed and not a failed deploy. The fight merge
is the other case: it touched `src/`, so on run 382 `deploy / build` and
`deploy / deploy` both **ran** and Pages reported success.

**All ten levels are built and playable**: `level1` Courjahan Village, `level2` Head
Office, `level3` Sports Complex at Dusk, `level4` The Conundrum, `level5` The
Crossroads, `level6` Two Roads, `level7` The Highway, `level8` The Optimization,
`level9` AI Override: Part 1, `level10` AI Override: Part 2. Each has its own map,
wave table and soaked boss. `plannedLevels` is **10**, so the road shows ten built
rows and **no COMING SOON** — the first time that has been true.

**Level 10 is complete as of 2026-09-14, fight included.** The board, the twelve
pads, the cast, the waves and the stake shipped with the level; the scene side of the
fight — the berth at the crystal core, the form swap, the float, the schedule, all six
manipulations, the recall portal, the defeat, the white wash, the outro comics, the
credits and the title card — landed the same day on
`claude/vlaude-fight-scene-jrb368`, **merged to `main` 2026-09-14 by fast-forward**.
**Vlaude is 26,000 hp**, re-derived by soak once
the powers actually fired; the old 36,000 was measured with none of them firing and is
not comparable. `reports/2026-09-14-level-10-the-fight.md` is the write-up, and
`tools/harness/run.sh vlaude` is the only thing in the repository that can see any of
it — no test in `tests/` imports Phaser.

So **story mode is content-complete in rows and not in content**, and the next brief
should say which of those two it means.

Health: **1136 tests passing, 0 failing** (`npm test`, in this sandbox, no
`node_modules` needed), and CI's real `npx tsc --noEmit` is green on `main` at
`3f1a805`. Working tree clean.

**`sh tools/tsdiff.sh 0496f2d` now reports one INTRODUCED error, and it is a false
positive** — 213 on the baseline against 214 on the tree,
`src/scenes/CutsceneScene.ts: TS2339: Property 'time' does not exist on type
'CutsceneScene'`. `this.time` is new in that file (`git show
0496f2d:src/scenes/CutsceneScene.ts` has no hit) and `time` is a public
`Phaser.Time.Clock` on `Phaser.Scene`, so with `node_modules` present it resolves — CI
typechecked the same commit green. **`CLAUDE.md` documents tsdiff's blindness in one
direction only** (it cannot see an error that needs real Phaser types). This is the
other direction: **a first use of an inherited Phaser member in a file that did not
use one before shows up as an introduced error that does not exist.** Check whether a
new red line is a `Phaser.Scene` member before treating it as a regression; do not
change code to silence it.

**Four of the six branches this section used to list are gone**, deleted since. Of the
six remote branches other than `main`:

| branch | state |
|---|---|
| `claude/level-8-soft-lock-9bmho0` | **fully contained in `main`** (merged as PR #8); safe to delete |
| `claude/level-9-geometry-uac8ax` | **merged to `main` 2026-09-14, fast-forward; fully contained in `main`, safe to delete** |
| `claude/level-10-assets-2kqch4` | **merged to `main` 2026-09-14, fast-forward; fully contained in `main`, safe to delete** |
| `claude/vlaude-fight-scene-jrb368` | **merged to `main` 2026-09-14, fast-forward; `main` IS its head (`0 ahead, 0 behind`), safe to delete** |
| `claude/deployment-status-review-a661d6` | **326 ahead, 120 behind**; still unmerged and still uninspected, from 05 September |
| `claude/github-pages-deploy-trigger-x8b598` | **294 ahead, 120 behind**; same |
| `claude/phaser-4-migration-spike-hage91` | **471 ahead, 120 behind**; salvaged onto `main`, and GitHub answered 403 twice to deleting the ref |

`level2-volcanic-map-recreation`, `main-branch-ci-checks`, `scatter-props-tree-line`
and `soak/overnight` no longer exist. (The old entry said "five" and then listed six.)

**The three ahead/behind figures above were re-measured on 2026-09-14 and two of them
had been wrong for some time** — `a661d6` was recorded as 7 ahead and is 326;
`hage91` was recorded as 144 and is 471. The inflation is not work: these branches
carry `main` history that the current `main` no longer descends from, which is also
why none of them is fast-forwardable. Re-measure rather than quoting this table, with
`git rev-list --count main..origin/claude/<branch>` and the reverse.

**The behind-counts moved DOWN when `main` moved forward, which is a sign the earlier
figure did not come from that command.** These read 120 on `main` at `3f1a805`; run
the same command with `main` at `6100c78`, the tip they were recorded against, and it
answers **110**, not the 128 on file. A behind-count cannot fall as `main` gains
commits, so 128 was measured some other way. The ahead-counts reproduce exactly. This
is a second reason to re-measure rather than quote.

**The asset-sweep hazard is now discharged for every level.** It was live for level 9
until `uac8ax` landed and live for level 10 until `2kqch4` landed; `main` references
both levels' art itself now, and none of the six remaining branches is holding art
that `main` cannot see. The standing fact does not retire — it applies to the next
upload — but there is no currently-loaded gun.

**Two files are unreferenced ON PURPOSE**, and a sweep should leave them alone rather
than treat them as the hazard's next instance: `art-source/level10/prop_route_gate_open.png`
and `prop_route_gate_closed.png`. Route switching was cut from the design. They were
never converted and never registered, and `reports/2026-09-14-level-10-assets.md`
names them as deliberately unused.

## Open items

**These are renumbered, twice now.** Seven of the original ten closed between 07 and
13 September; what is left keeps its wording and gets a new number, so a citation of
"open item 4" written before 2026-09-13 does not mean item 4 here.
`claude/chapter-2-design.md` used to carry two such citations and now describes the
items instead. **Renumber again if you close one, and do not cite these by number
from another document.**

**THE LEVEL 10 VLAUDE FIGHT IS BUILT AND ITS HEALTH IS SETTLED. This item is
closed, including the half that was left.** All eight pieces of
`reports/2026-09-14-level-10.md`'s build order landed on 2026-09-14 and every one of
them is verified from a rendered frame by `tools/harness/run.sh vlaude` (**90**
assertions since 2026-09-15) and `run.sh titlecard` (20). Vlaude is **26,000** and
stays there: 195/480 = 40.6%, mid-band, with the in-band window at the published
method running about 25,000 to 28,000.

**The soak's half is closed too, by reading the rules rather than by teaching the
simulator.** It still fires three of the six powers and still cannot express build
lock, generate wall or generate weapon — but against a board with every pad built on
all three are inert or nearly so, so 40.6% is not measured against an easier fight.
See `reports/2026-09-15-blockers.md`, and `tests/level10.test.ts`, which asserts each
of the three.

**What is genuinely left**, and it is narrower: the soak understates the fight for an
**incomplete** board, where a countermeasure takes a spare pad from wave 11 and holds
it until one hero chews through 1,400 hp at armour 8. Teaching it that is a change to
`Sim.ts` and is not asked for.

**And the board is measured now.** `Sim.ts` carries a read-only `FinaleBoard`: board
DPS against the final boss's armour, damage deliverable over his walk, and a ledger
of what he actually took. 480 seeds: median winner 723 DPS delivering 25,125 over
Vlaude's 172-second walk, median loser 546 delivering 14,708, median run 24,265 into
26,000 — 93% — and he dies in 195 of the 453 runs that reach him. It is the
instrument `reports/2026-09-07-balance-verification-and-level-2.md` did by hand and
could not leave behind.

**THE ABILITY MEDALLIONS ARE NOT BROKEN. Do not re-open this.** It was item 1 here
and it is deleted, on Cory's word that the medallions and the Nuke button work in
play, and on a diagnosis of what the harness was actually measuring.

`abilitybar` probes the slots in bar order, and `serverNuke` is the slot immediately
before the two hero slots. Tapping it calls `armAbility`, which for the nuke opens the
launch confirmation — `NukeLaunchOverlay`, whose `blocker` is a full-screen
`1266 x 585` rectangle at 72% dim, `setInteractive()`, with `pointerdown` bound to a
deliberate no-op so a stray tap cannot throw away a once-per-run ability. **The probe
never closes it.** Its cleanup resets `pendingAbility` and `mode` and nothing else, so
the next two taps land on the scrim, `armAbility` and `castHeroSlot` are never called,
and the probe prints `DEAD`. The four-slot pass has no nuke slot, no overlay, and all
four read `REACHED` — which is the whole of the "evidence" that something breaks after
the drop.

Proved rather than argued: the blocker rectangle and `ui-nuke-up` are both still in
the run's own final scene dump, and `rebuilds over 1s after the drop: 0` retires the
every-frame-rebuild theory the scenario was written around. **`DEAD` means "a modal
this probe opened is covering the bar", not "the button is dead"** — which is CLAUDE.md's
own warning about first red results, in the exact form it names: a modal left open.

**Real player impact:**
1. **Twenty canvas-vs-ink content boxes**, up from nine. All nine originals are
   untouched — `icon-firerate` 34.8% small, `icon-locked` 29.3%, `icon-upgrade` 22.7%,
   `icon-armor` 21.9%, `icon-cancel` 19.5%, `icon-range` 18.4%, `ui-nuke-down` 13.5%,
   `icon-damage` 7.4%, `icon-target` 3.9% — and eleven enemy entries have joined them,
   worst `enemy-cargo-yellow` at 11.1%. `python3 tools/measure_art.py` prints the whole
   list and ends `148 entries checked, 20 disagree with their own pixels`. Same bug as
   the peanut, twenty times. Fixing the eight tower-menu glyphs makes every one of them
   visibly larger, which is a UI change that wants a look at the ring first.

**Polish and decisions:**
2. Cake tiers are probably too generous: level 4 averages 18.8 lives left on a win, so
   most wins likely pay three cakes. Three numbers in `cakes.json`; wants a soak that
   records cakes rather than wins. Nothing under `tools/soak/` records a cake yet.
3. The verdict line and the 2-cake tier still disagree at exactly half, and both halves
   are confirmed in code: `Cakes.cakesFor` awards on `share >= t.livesFraction` with
   the 2-cake tier at `0.5`, while `Banner.verdictFor` uses
   `livesRemaining > maxLives * cleanLivesFraction` with `cleanLivesFraction` also
   `0.5`. So a run finishing on exactly 10 of 20 gets two cakes under the words "Barely
   standing."

**Closed, so nobody re-opens them.** The Devil at 5200 (applied, `862ecf7`); the fake
harness scenarios (`39cca69`); Courtland's ability names (`heroes.json` now reads
Seismic / Mind Control / Mind Laser, matching the icons); `fx_mind_control`'s missing
mechanic (Courtland's Mind Control sets `Enemy.controlled` and `GameScene.powerControl`
fires it); dialog buttons at 24 CSS px (`Plate.plateButton` runs every button's width
and height through `tapFloor`, and `Dialog` reserves the grown height so it cannot eat
the card's text); world-map node cakes at 24 CSS px (`presentation.cakes.nodeSize` is
57 design units, measured at 32.0 CSS px at 844x390, and the row is now allowed to be
wider than its 160-unit card); the world map's 20 slots (`plannedLevels` is 10,
`171f02d`); the build-pad convention (settled before level 5 — see THE BOARD-SIZE
PROBLEM); and the dead ability medallions, which were never dead. Written up in
`reports/2026-09-13-context-reconciliation.md`.

**Brief-vs-test conflicts: not a bug.** Three tests enforce real invariants and the
invariant should win. Update the brief, not the code: Overpacker height 90→85 px,
Overpacker cadence 1.4→1.6 s, Tour Guide cadence 1.0→1.1 s.
