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

**Lazy Dad Mode** (casual), **Yeah, I Game** (normal), **Try Hard** (hardcore).

**SEVEN KNOBS SINCE 2026-09-16, NOT TWO.** Starting lives and starting peanuts, plus
kill income, wave interval, hero respawn, ability cooldown and a **uniform enemy
health scalar that includes bosses**. All five of the new ones are **1.0 on `normal`
AND on `try-hard`** -- try-hard's published behaviour is lives and purse only and it
was never re-soaked for anything else. `Difficulty.ts` returns its input by an early
return when a multiplier is exactly 1, so the no-op is exact rather than a rounding
that lands on the same integer today.

`normal` is a literal no-op, now proven three ways: a test against `rules.json`, a
**480-seed re-soak of all ten levels reproducing every published integer**, and the
`lazydad` harness scenario reading the six numbers off a live run.

**Lazy Dad at 480 seeds:** 98.3, 96.5, 99.8, 99.0, 89.8, 94.6, 94.0, 95.8, 94.0,
86.7 per cent for levels 1 to 10. Multipliers: lives 3.0, purse 1.5, kill income 1.1,
wave interval 1.5, hero respawn 0.7, ability cooldown 0.85, enemy health 0.7.

**THE KNOWN LIMIT IS RESOLVED, AND IT WAS BIGGER THAN IT LOOKED.** This section used
to say neither lever touches a level whose failure mode is a boss DPS check. Measured
on 480 seeds: **lives x4 and purse x3 with nothing else moves level 2 by 1.9 points
and level 10 by 1.3.** Enemy health x0.8 alone moves the same two by 27.7 and 27.1.
The health scalar is the only lever that touches that shape at all.

**STILL NO ARMOUR, ENEMY DAMAGE OR ENEMY SPEED SCALAR, and there must not be.** Those
three are what the original objection is actually about -- they change which TOWERS
are viable rather than how hard a level is. `tests/difficulty.test.ts` asserts it
against the data keys.

**Levels 1, 2, 3 and 4 sit ABOVE the 85-95% target band on Lazy Dad Mode** and no
global multiplier brings them in: levels 1 and 3 are 89.2% and 87.9% on `normal`, so
an easier mode is at least that by construction. Not a defect; do not retune for it.

See `reports/2026-09-16-lazy-dad-mode.md`.

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
level 9 24%, level 10 41%**. `SOAK-REPORT.md` is the living record; read it rather
than any number in this file.

**LEVEL 9 MOVED TWICE AND IS BACK IN BAND.** The flank lane landed on 2026-09-16 —
a third road round the bottom right that the plate had always painted and nothing
walked — and took the level from 191/480 (40%) to 113/480 (23.5%). It was retuned
on 2026-09-17 and reads **192/480 (40.0%)**, the middle of the band, on two levers:
`flankShare` 0.25 -> **0.10** in `waves.level9.json` (161/480 on its own) and
PERPLEXED's health 8100 -> **7650** in `enemies.json` (the rest). Wave composition
was not touched and no armour moved. The other nine levels are identical integers
on the same 480 seeds through both passes. See
`reports/2026-09-16-level-9-flank-route.md` and
`reports/2026-09-17-level-9-retune.md`.

**AND THE FLANK IS PAINTED ROAD NOW.** `tools/paint_level9_flank.py` painted the
corridor between the trunk and the spur's old cap into
`art-source/level9/map_level9.png`, the plate was re-encoded at q95, and the whole
level 9 pipeline was re-derived from it — so the flank's waypoints come off the
paint like every other metre of the level and `tools/build_level9_map.py` is back
to ONE authored coordinate, the gateway point every level has. The flank is 0.20%
off-paint against 12.63% before, the best of the five lanes.
`python3 tools/orphan_roads.py --lanes` is the measurement.

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

## Status as of 2026-09-15

**The last commit that changed the GAME is `d7036cc`**, the build-pad visibility fix,
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

Health: **1157 tests passing, 0 failing** (`npm test`, in this sandbox, no
`node_modules` needed), and CI's real `npx tsc --noEmit` is green on `main` at
`d7036cc` (run 394, all five jobs, with `deploy / deploy` RUNNING rather than
skipped). Working tree clean.

**LEVEL 9'S BUILD PADS DRAW AT ONE SIZE as of 2026-09-15**, direct to `main` as
`c9ea4f6`. `map_level9.json` was the only map in the game with a `padArt` block, and
every entry carried the painted chip's own width, so its fifteen pads drew at
**thirteen different sizes between 63 and 150 world px** while `spotAt` answered the
same 34 px circle on all of them — the art disagreed with the tap target on every pad,
in one direction or the other. The size is gone from the data (not repeated fifteen
times) and the node is fitted to `quietWorldWidth` — `presentation.json`'s
`buildPad.quietScreenWidth` over `display.json`'s `camera.defaultZoom`,
**90 / 1.72 = 52.33 world px** — which is the one derivation that sizes every pad in
the game. **`spotRadius` is NOT that derivation and never was**: it governs the tap
target only, and a brief that conflates the two sends the next session editing the
wrong number. **Uniform by WIDTH, not by footprint**, decided from rendered frames:
equalising area leaves no two of the four chip styles the same width, and width is the
dimension a row of pads is read across. **The four chip styles stay.**
`tests/buildpad.test.ts` now fails if any map file grows a per-pad art size, so this
cannot come back on level 10 or anywhere else. No pad moved, so **level 9 still soaks
191/480**. `reports/2026-09-15-level-9-pad-sizes.md` is the write-up, and
`tools/harness/run.sh level9` is the only thing that can see any of it — it measures
all fifteen pads off the live scene, sampling over two full pulse periods, because the
breathing tween reads as fourteen different sizes if you sample a single frame.

**Seven UI and presentation defects from live play were fixed on 2026-09-15**, direct
to `main` as `66a0ab3` and `c1682ab`, both green on all five jobs including
`deploy / deploy`. `reports/2026-09-14-ui-cleanup.md` is the write-up. In one line
each: the peanut pill is a **three-slice** that grows with its content (it was
clipping at THREE digits, not four — 800 was already 5px outside the painted field);
`hud.numberMargin` is retired for `hud.layout.readoutFieldPad`, a fraction of the
plate height; ten loadout strings overflowed at phone widths and the fix is
`loadout.cardIconColumnCapShare` plus a both-axes size ladder with
`loadout.cardTextMinScale`; **a build pad the HUD stands on is no longer DRAWN**
(`GameScene.padShowing`), which is the same complaint the camera-slack fix answered
and must NOT be answered that way again; the build drawer collapses on all five
gestures that close every other panel; the tower ring's nothing-to-buy slot carries
`price: null` instead of `0`; and the spawn/exit badges are at **alpha 0.7** and inset
**6.0 badge widths** along their own lanes.

**Five harness scenarios were fixed or added in that pass, and three of them had been
reporting nothing.** `drawer` threw on a stale `heroRow` key (renamed `heroChip` in
the HUD pass) before any of its checks ran; `everyloadout` had no `expect()` at all,
discarded the scene's own `getData('overlaps')`, and walked `_`-prefixed JSON notes as
heroes — it reported 56 false overflows, then 12, then 10 real; `skins` and `counters`
are new. `padhud` gained a "still DRAWN" column and its "UNREACHABLE" column is now
labelled "not freed BY PANNING ALONE", which is what it measures now the camera slack
is gone.

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

## Cutscenes — reorganised, sliced and wired 2026-09-16

**EVERY COMIC IN THIS REPOSITORY IS A THREE-PANEL STRIP IN ONE IMAGE.** Measured
across all twelve unwired files and the shipped ones, not eyeballed:
`tools/comics/slice.py` scores each column for vertical uniformity and finds two
gutters in every one. The brief named three files to slice; all nine that are wired
to something were cut, because the brief's own reason — a third of a 1672-wide page
is 130 CSS px on a phone and the speech is unreadable — applies harder to the
2172-wide pages, where a third is 119 px.

**And the cut columns are MEASURED, never divided.** `comic_eliminated_positions`
looks like three 724-wide squares and its panels are 741, 706 and 698. Dividing by
three would have put a cut 17 px inside panel 1's art.

**Where everything lives now.** `art-source/cutscenes/level1..level10/`, plus
`unplaced/` and `retired/`, all `git mv` so history follows. **Nothing comic-related
is in the repository root** and a test fails if a `comic*` or `cutscene*` file
reappears there. The STRIP is what is kept, not the 27 cut PNGs — a strip plus its
recorded cut columns reproduces the panels exactly, and the slices would have been
100 MB of git for nothing. `python3 tools/comics/publish.py 90` is the whole pipeline
and `tools/comics/last-run.json` is the record.

**Level 1 and 2 were redrawn.** The panels that shipped drew the dad BEARDED AND IN
ARMOUR at Courjahan's Tavern; the current design is clean-shaven in modern clothes.
The six old panels are in `art-source/cutscenes/retired/`, out of the deploy and not
deleted. Both levels got LIGHTER: 0.37 MB against 0.92 and 0.86.

**Level 3 now has an opening** (Vlaude on the television) and there are **six
mid-wave comics**: level 3 after wave 12, level 4 after wave 6, level 9 after waves
3, 7, 11 and 15. **All six spawn waves were re-read off the wave tables and all six
matched**, and `tests/midwave.test.ts` re-derives them so a table edit that moves an
enemy out from under its comic fails the build.

**A CUTSCENE CAN NOW PLAY BETWEEN TWO WAVES.** `cutscenes.json` gains a third map,
`midWave`, keyed by level then by the wave it plays AFTER. GameScene pauses itself
and the HUD and launches the comic as an overlay; a paused Phaser scene runs no
update, no timer and no tween, so the clock genuinely stops — measured byte-identical
across 14.0 real seconds, which is longer than the 10.7 s the ready countdown takes
to auto-start the next wave. Authoring one is a data edit: a row in
`tools/comics/plan.json`, run `publish.py`, a key in `cutscenes.json`. Nothing in
`src/` changes.

**THE PICTURE FOUND A BUG THE NUMBERS PASSED.** The first harness run reported 40 of
43 checks green — comic active, run paused, gate claimed, clock frozen, textures
released — and the screenshot was a picture of the BOARD with WAVE CLEARED across it.
Phaser renders scenes in list order and `Cutscene` is declared before `Game` and
`Hud`; a paused scene still renders, so the board drew over the panel.
`CutsceneScene.create` calls `bringToTop()` when it is an overlay now.

**The soak is unmoved, all ten levels, 480 seeds, byte-identical before and after.**
Two of the numbers a brief is likely to quote are STALE and were already stale on
`main`: **level 8 is 184/480 since 2026-09-15**, not 200, and **level 9 is 113/480
since the flank landed**, not 191. `SOAK-REPORT.md` says so; a report that quoted
428/255/422/299/218/210/198/200/191 would be wrong twice.

**Two deviations from the brief, both because the repository already had a rule:**
comic panels are NOT registered in `art.json` (naming one there fails
`tests/manifest.test.ts` twice over — `art.json`'s own `_level10` note says why), and
the three unplaced comics stayed as PNG in `art-source/` rather than being converted
(about 1.5 MB of deploy nobody fetches, and two of the three are alternates of comics
that already ship). The blunt no-exemptions existence check the brief wanted is in
`tests/cutscenes.test.ts` instead, over `levels`, `outros`, `midWave`, `_unplaced`
and `_retired`.

See `reports/2026-09-16-cutscene-reorganisation.md`.

**IT IS ON `main`, and it took three merges rather than the fast-forward the brief
asked for.** `claude/cutscene-reorganization-wiring-t8o0vm` forked at `fe6ec82` and
`main` was eleven commits past that when the merge started and seventeen by the time
it finished — it moved twice more, mid-CI, under the guaranteed-dummy-tower session.
Four conflicts across the three merges, all of them two sides adding something in the
same place rather than disagreeing:

- `tools/harness/index.html`, the scenario blocks: `lazydad` (main) and `midwave`
  (branch) were inserted at the same point and **share the trailing `return`/`}` that
  sits below the conflict**, so taking both halves verbatim leaves the first block
  unclosed. Both kept, `lazydad` given its own tail.
- `tools/harness/index.html`, `USES_EXPECT`: union of `midwave` and `guaranteed`. A
  scenario missing from that set is not a no-op — it is judged by `RESULT *** n ***`
  instead of by the assertion counter.
- `src/scenes/GameScene.ts`: the branch's three comic methods went in directly above
  `grantTowerUnlocks` while main rewrote **that method's doc comment in place**. Kept
  the methods, took MAIN's comment; `grantTowerUnlocks` is byte-identical to main's.

**The soak is unmoved, measured rather than reasoned about:** 405 218 422 328 343 83
133 146 119 117 over 480 seeds, matching `cd095ca`'s published `guaranteed` column on
every level. `tools/soak/` is byte-identical to main's and `Sim.ts` imports nothing
from `src/scenes/`, so it could not have moved — but it was run anyway, because that
is the difference between knowing and expecting.

**And the first error the merge printed was a lie about the repository, not about the
branch.** The container's clone is shallow; see the new standing fact in `CLAUDE.md`.

See `reports/2026-09-16-landing-the-cutscene-branch.md`.

## Open items

**THE SOAK'S PLAYER BUILT BADLY AND NOW DOES NOT (2026-09-17). EVERY PUBLISHED WIN
RATE BEFORE THIS IS NOT COMPARABLE TO ANYTHING AFTER IT.** `tools/soak/Sim.ts` chose
with `rng.pick(affordable)` -- uniform over everything it could afford, with no concept
of what a tower is FOR. Survivable while the pool was almost all damage; not survivable
once the Ima Dummy Tower was a guaranteed opener, at which point it spent about one pad
in three on a zero-damage blocker on every board from wave 1. `shelter` (the Beacon,
+30%, zero damage) had the same flaw at weight 3 for as long as it has existed.

**THE GAME DID NOT CHANGE. No file under `src/` was touched** --
`git diff --stat origin/main -- src/ public/ vendor/ tools/harness/` is empty, which is
stronger than "no behaviour changed". Verified from a rendered frame too:
`run.sh afford 200 844x390` opens the build ring on level 1, prices both options and
paints a live confirm.

**Two rules, and deliberately only two.** A cap on zero-damage towers,
`max(min, floor(pads * padShare))` with padShare 0.2 and min 1 -- **derived from pad
count, not fixed**, because the boards run 7 to 22 pads: caps are 1, 3, 3, 2, 2, 3, 4,
3, 3, 2. And the board gets a gun before anything else. Past those the pick is the same
uniform `rng.pick`, because a builder that placed towers WELL would flatter whatever
tuning it suited and stop being a neutral instrument; a test fails if the opening
collapses to one tower. `supportonly` is **exempt** or it becomes `nobuild`. Knobs live
in **`tools/soak/builder.json`, NOT `src/data/`** -- a number that changes what the soak
measures is not a balance number, and one found under `src/data/` would be read as a
game rule and tuned against.

**Four rows, 480 seeds, `normal`, same seeds throughout:**

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| pre-guarantee, old builder | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | 192 | 195 |
| guarantee on, old builder | 405 | 218 | 422 | 328 | 343 | 83 | 133 | 146 | 119 | 117 |
| guarantee off, NEW builder | 440 | 266 | 436 | 327 | 262 | 204 | 204 | 207 | 208 | 214 |
| **guarantee ON, NEW builder** | **434** | **218** | **431** | **314** | **274** | **99** | **135** | **154** | **146** | **132** |

Row 3 is the honest test and it passes: +3.5 points aggregate, nine of ten up, largest
move +44 (level 5, the board a blocker helps most), and **the same five levels in band
as row 1** (6, 7, 8, 9, 10). Level 10 at 44.6% is 0.4 points from leaving it.

Row 4 is the game and **NO LEVEL IS IN THE 35-45% BAND**: 6, 7, 8, 9 and 10 are 14.4,
6.9, 2.9, 4.6 and 7.5 points below; level 2 is 0.4 above the top edge.

**DO NOT RETUNE OFF ROW 4 YET, and this is measured rather than cautious.** The cap
halves the zero-damage PADS (level 6: 5.87 of 18 -> 2.94) and closed only a quarter of
the board-DPS gap (level 6 median: 356 old, 382 new, 447 with the guarantee off). The
reason is that **the soak's upgrade loop tiers EVERY tower the board owns**, zero-damage
ones included, so the board still sends **29.5% of its tower peanuts on level 6** into
towers that cannot shoot, against 17.7% with the guarantee off.
`SoakResult.builder.zeroDamageSpend` / `.towerSpend` measure it. **A third role rule is
the obvious answer**; the brief said to prove the second was not enough first, and that
proof exists now. Settle it, re-measure row 4, then look at levels.

**Stale and flagged: level 9's PERPLEXED, 8100 -> 7650** (`e505a4d`), derived against a
two-tower opening AND the old builder. Both halves are gone; the level reads 208 under
row 3 and 146 under row 4. Also stale for the same reason: Vlaude's 26,000 and the
24,265 median in `reports/2026-09-15-blockers.md`.

**NEW OPEN ITEM: `buildall` is red on `main` at phone width and it is not a game bug.**
6 of 7 pads at 844x390, failing pad 3 with `ringOnTap=false`; **7 of 7 at 1400x900**;
and the identical failure reproduces in a worktree of `origin/main`, same pad, same
coordinates. Pad 3 sits at screen `381,318` and the ability bar occupies `261,316` to
`583,380` -- so this is exactly the price the HUD-versus-pads section below states, and
**`buildall`'s "it has to be all of them" assertion predates `d7036cc` and contradicts
that decision.** Either the assertion learns about the HUD rectangles or the scenario
runs where the question is meaningful. Not touched.

See `reports/2026-09-17-soak-builder.md`.

**THE IMA DUMMY TOWER IS GUARANTEED IN EVERY OPENING HAND (2026-09-16), AND IT TOOK
EVERY LEVEL OUT OF THE BAND.** It was draftable on level 1 alone -- no entry in
`draft.json`'s shared `towerWeights`, one entry in level 1's `extraTowerWeights` -- so
on nine levels of ten it was not in the pool and no reroll could produce it. It is now
a **third opening slot** driven by `draft.json`'s `guaranteedTowers`, honoured inside
`draftOpeningTowers`, with no id named in any system module.

**The re-soak, 480 seeds, measured on the tree AFTER level 9's retune and Lazy Dad
Mode. The brief's premise was wrong: seven of ten levels got HARDER.**

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| before | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | 192 | 195 |
| pool only | 428 | 253 | 429 | 335 | 268 | 177 | 205 | 189 | 170 | 190 |
| after | 405 | 218 | 422 | 328 | 343 | 83 | 133 | 146 | 119 | 117 |

**NO LEVEL IS INSIDE THE 35-45% BAND ANY MORE**, where five were -- 6, 7, 8, 9 and 10
all fell below it. Level 2 came 7.7 points DOWN to 45.4% and is now the closest to
band; level 5 climbed 26 points out. **Nothing was retuned** -- the brief asked for the
damage report and a stop, and several of these levels have boss numbers derived against
their own board.

**BEFORE ANYBODY RETUNES, three things.**

1. **Most of the swing is the SOAK'S BUILDER, not the game.** `Sim.ts` picks what to
   build with `rng.pick(affordable)` -- uniformly at random from the unlocked types --
   so a guaranteed opener that deals **zero** damage takes about one pad in three from
   wave 1 on every level. A person builds a garrison where blocking pays. The `pool
   only` row is the control: the tower draftable everywhere but guaranteed nowhere is
   worth **+43 runs over 4800** and leaves **the same five levels in band**. The
   guarantee is worth **-330**. So -330 is a ceiling on what a player feels.
2. **Level 9's retune is newer than its own report.** `e505a4d` put it back in band at
   192/480 three commits before this, derived against a two-tower opening; this reads
   119/480, within 6 runs of where the flank left it.
3. **Levels 4 and 5 went UP** (+29 and +125) and that is the interesting signal, because
   they went up in spite of the builder. Level 5 is the vampire level: blockers hold the
   lane and its loop is chip damage holding lifesteal off.

**The answer-archetype trap, because it is the kind of thing that ships silently.**
`imaDummy` is archetype `control`, which is one of `answerArchetypes`, so a repair rule
that counted the guaranteed card would find an answer on every hand ever dealt and
never fire again -- 1127 of 3000 seeds would keep a drawn pair with neither AOE nor
control, and hands with no AOE at all would go 1197 -> 1872 of 3000. The rule judges
the **drawn pair alone**, and the shipped no-AOE rate is 1197, exactly what the old
six-tower draft produced. A hand CAN still come out with no AOE; it always could,
because the guarantee has always been "AOE or control" and the Bramble is control.

**`unlockedTypeCap` now caps the DRAWN types.** Counted against it, three openers plus
the wave-4 unlock would hit the cap of 4 and the wave-8 unlock would never arrive.
Runs end with 5 types of 7 rather than 4.

**Open, and a decision rather than a bug: the loadout screen scrolls further.** The
third card costs 72-93 units of overflow at every viewport, so a DESKTOP loadout now
scrolls by 76 where it scrolled by 4. The screen already scrolled on phones (170 units
at 667x375 on `main`), what does not fit is verified to scroll to the whole of itself,
and every other arrangement the screen knows about measures taller -- the two-column
reflow is correctly refused because three cards across a half-band is 85 units each.
Fixing it properly is a design call on that screen. `tools/harness/run.sh guaranteed`
is the rendered-frame check: 27 assertions, three viewports.

**Also fixed on the way, because the card is now in front of every player:** the Ima
Dummy card read `0 damage - Short reach - Infinity/sec` (`1 / fireInterval` with
`fireInterval: 0`) and `Picks off one target at a time.` -- the opposite of what the
tower does. It reads `2 lads - 90 hp - Short reach` / `Blocks the road. Cannot attack.`
now, derived from `soldierCount`.
**`tools/harness/run.sh difficulty` IS RED ON `main` AND WAS BEFORE 2026-09-16.** Two
faults, both the same stale expectation: the scenario's section 3 looks for the
difficulty readout on the HUD, and the HUD **deliberately stopped showing it** --
`difficulty.test.ts` asserts `HudScene.ts` contains no `difficultyName` and says why.
The second fault (`a mid-run change to the save reached the run`) is a false positive
falling out of the first: no readout is found, so the `!readout` branch fires.
Confirmed pre-existing by stashing and re-running on `65c160b`. **The fix is a paired
edit** -- section 3 should assert the HUD does NOT name the mode and drive the
capture-once rule through `G.status.difficultyId` -- because `difficulty.test.ts`
asserts the scenario's current text in three places.

**THE SOAK'S LIFESTEAL HAS NEVER FIRED.** `Sim.ts` calls
`night.healFor(e as never, dealt)`; `NightRules.Vampire` wants a `maxHealth` field
that `SimEnemy` does not have, so `lifestealHeal` computes
`Math.min(damage * fraction, undefined - health)` -> `NaN`, and `healed > 0` rejects
it in silence. Level 5's vampires have drunk nothing in every published soak. **Same
failure shape as the regen bug `Sim.ts` already carries a long comment about.** NOT
fixed on 2026-09-16 because fixing it moves level 5's published win rate, which is a
retune rather than a difficulty change.


**THE HUD-VERSUS-PADS QUESTION IS CLOSED, on the third attempt, and this is the
paragraph to read before anyone opens a fourth.** Three passes at one problem -- the
HUD and the build pads wanting the same screen space -- and the first two each fixed
it by shipping a different visible bug:

1. **2026-09-13:** the camera was handed the HUD's band height as a bounds MARGIN so
   the map would inset below the HUD. A margin on the camera CENTRE does not make room
   inside the plate, it moves the wall outward. That was the black-screen-on-scroll
   bug. Reverted. **Never do this again**; `tests/hudpads.test.ts`'s
   `the camera is NOT given the HUD band as slack` is the guard.
2. **2026-09-14:** a pad the HUD was standing on stopped being DRAWN instead
   (`padShowing` -> `hudStandsOn`, re-answered every frame off the live camera by
   `syncPadVisibility`). It removed the artefact and created a worse one: **the pads
   popped in and out under a pan**, because a screen-space predicate on a moving
   camera is a moving predicate. 151 of 151 pads on the ten levels flipped somewhere
   in the reachable camera box; five of level 1's seven were gone at once at 844x390.
   It was also **over-firing** -- it tested the tap circle's bounding SQUARE against
   art 1.3x narrower and 1.7x shorter, so ~31% of its culls had no HUD over the drawn
   disc, and two of its seven rectangles (`counters`, `messageRow`) are READOUTS that
   do not take a press, so a pad they covered was hidden AND still pressable.
3. **2026-09-15, `d7036cc`, and this is the answer:** a build pad is a WORLD OBJECT,
   like a tower, an enemy, the hero and the road, none of which has ever been hidden
   for being under the HUD. `padShowing` is now `this.build.isFree(spot.index)` and
   nothing else; `hudStandsOn` and `syncPadVisibility` are deleted; `drawSpots`, on
   the board clock, is the only caller. **Nothing about a pad reads the screen**, so
   the property holds by construction.

**THE PRICE, stated rather than hidden:** a pad under one of the five pressable HUD
controls is visible and not tappable there. That is bounded by the reachability test,
which proves all 151 pads have a zoom and a camera position where a 44pt circle lands
on them clear of the HUD. **Route (a) -- reserving a HUD band outside the map
viewport, which is the 2026-09-13 idea done properly as a `setViewport` inset rather
than a bounds margin -- was costed and rejected: 156 of 390 px, 40% of a landscape
phone, and the end of the full-bleed map.** It stays available at that price; see
`reports/2026-09-15-pad-visibility.md`.

**And the test that let all this through is replaced.** `hudpads.test.ts` asserts
reachability, which is deliberately weaker than disjointness and says so; what was
ALSO there --`no HUD element overlaps a VISIBLE build pad` -- pinned attempt 2's
implementation and passed the whole time the pads were popping. It is now
`no build pad changes visibility as the camera moves`, which pans every level at every
zoom and fails if the decision reads a screen-space term. **`tools/harness/run.sh
padpan` is the rendered-frame half** and proves BOTH properties in one run -- every
pad drawn throughout a pan, and not one magenta pixel of void past the plate -- because
each of the first two passes broke what the one before it fixed.

**AND THE 2026-09-17 PASS NARROWED THE ROW RATHER THAN TOUCHING PAD VISIBILITY**,
which is the fourth pass at the same screen space and deliberately did not reopen
any of the three above. The bottom row came in from 476 CSS px to 384 at 844x390
(56% of the width to 45%) by shrinking pitches, and `padhud` now prints a per-element
split alongside its total: pad/HUD overlaps at rest over all ten levels went **33 to
31** (`abilities` 18->16, `messageRow` 10->9, `heroChip` 3->4, `startButton` 2, and
`counters` **0 on both**), and pads panning alone cannot free went **24 to 17**. No
pad is hidden and none was un-hidden: `padShowing` is still `isFree` alone, exactly as
the paragraph above settled it.

**Two NEW open items, both small, both from the 2026-09-15 UI pass:**

- **Level 7's spawn and exit badges are invisible on the Highway, and it is an ART
  job.** ~9 luma of contrast on all six badges, with level 4's upper spawn at 8.5.
  Alpha cannot fix it: alpha blends toward the plate, so contrast scales linearly and
  1.0 would take level 7 from 9.2 to 13.1, which is still nothing. The asphalt and the
  badge art are the same luminance. Wants a light halo or a darker outline in the
  picture. Everything else about the markers is finished.
- **`run.sh drawer` reports two problems that are PRE-EXISTING** (confirmed against a
  worktree at `f4021cf`) and both want a decision rather than a fix: the drawer shows
  6 of 7 towers, the seventh below the fold of a grid with `maxScroll 80`; and
  re-tapping the selected tile does not cancel — though the scenario's own tile
  enumeration reports duplicate centres for tiles 2/4 and 3/5, so establish whether
  the harness or the game is wrong before treating it as a defect.
- **`cancel`'s reserved rectangle takes presses while it is invisible.** `hudTakesPress`
  includes `layout.cancel` unconditionally and the layout reserves it ALWAYS, but
  `setCancelVisible` only draws the slab and glyph while there is something to cancel.
  So a 116x48 region in the bottom-right corner swallows taps with nothing visible
  there, and a build pad drawn under it is visible and not tappable **with no visible
  cause**. Found while measuring the 2026-09-15 pad-visibility pass (1.8% of the old
  culls at 844x390) and deliberately not fixed there: it is input plumbing with its
  own history, and every pass at this area that reached one step further than it was
  asked to broke something.
- **Level 9 declares 4 scenery items and builds 8**, and has been reporting it for a
  while: `run.sh level9` fails two of its 98 checks on it (`4 scenery items declared,
  8 built` and `the rebuilt board has 8 scenery items`), plus a third on `START RUN
  would begin level10`, which is the harness's own save state having every level
  cleared. All three were reproduced on an unmodified tree before the 2026-09-15 pad
  work and are **not** about pads. **Reproduced again on 2026-09-16**, on a worktree
  at `5418c5c` with none of the flank change in it, where the same scenario reads 3
  of 86: so they are not about lanes either. The three arcs and the Vlaude screen
  appear to be counted twice somewhere between the map and the scene graph. Nobody
  has looked.
- **`tools/png.py` writes Paeth-filtered PNGs at 8.6 MB where the art tool managed
  7.7 MB** on level 9's plate. It emitted no filtering at all until 2026-09-17,
  which made the same re-encode 14.9 MB. Adaptive per-row filter selection would
  close most of the remaining gap and costs four passes of pure Python; not worth
  it until something else needs to re-encode a plate.
- **The soak's `MINOR_LANE_SHARE` cliff at 0.20.** A lane carrying under a fifth
  of a level's bodies stays out of the scripted player's pad ranking, so
  `flankShare` 0.19 and 0.20 are two different BOARDS rather than two
  difficulties — 29% and 23% on the same tree. Level 9 ships at 0.10, well clear
  of it, but a later pass that walks the share upward will hit it.

- **The two hero ability medallions go dead after the Server Nuke drops, and it is
  REPRODUCIBLE IN ONE COMMAND.** `sh tools/harness/run.sh abilitybar 200 844x390`,
  which is already in the repository and which nobody had pointed at this: it taps
  each slot at its hit rectangle's centre through the real input system and prints
  REACHED or DEAD. Before the drop, four slots, all REACHED. After it, the three
  drafted cards REACHED and `heroSlot1` and `heroSlot2` both **DEAD**.
  **Pre-existing**: identical on a worktree at `b0150d5` with none of the 2026-09-17
  HUD pass in it, so narrowing the ability row neither caused nor fixed it.
  **THREE CAUSES ARE DOWN.** (1) Not the hero chip's fault beside it — that was
  objects the reflow left behind, and these are objects the reflow REBUILDS.
  (2) Not the every-frame rebuild churn that froze this row in an earlier pass: the
  same run reports **0 rebuilds over a second** after the drop. (3) Not geometry —
  `run.sh herochip` records all five hit rectangles registered, `interactive=true`,
  on screen, and **0 px** of drift from their own icons.
  So the press is being eaten by something that is not on the HUD's display list.
  Start by asking what ELSE is hit-tested at the right-hand end of the ability row
  once the row has grown. `reports/2026-09-17-hud-cleanup.md` has both recordings.
- **`status.kills` is never incremented.** Declared on the status object, zeroed by
  `startRun`, and written nowhere else, so it reads 0 through a wave that visibly
  clears. Two harness scenarios print it (`lost`, and `combat` until 2026-09-17 when
  the census stopped trusting it). Either wire it or delete it.
- **568x320 WITH A NOTCH has a 49px drawer grid against a 62px tile.** It was 55
  before the 2026-09-17 HUD pass, which cost it six. `drawer.test.ts` checks the FLAT
  narrow case only, where the grid is 72 and the rule holds. Nobody has decided
  whether the notched SE-class case is in scope at all.
- **Level 9 reads the HAT-GTT comic twice.** `cutscene_L9_01.webp`, the opening, IS
  the HAT-GTT page, and the same comic at higher resolution is wired after wave 3 —
  rendered and compared side by side, they are the same three beats. Both are wired
  because the 2026-09-16 brief named both explicitly and the choice is a content call.
  **The fix is one line: delete the `level9` key under `levels` in `cutscenes.json`**,
  which leaves it playing on the boundary before the enemy it introduces walks on.
- **Four comics still ship as uncut three-across strips**, and they are the only ones
  left: level 9's opening and outro, and level 10's three outro panels (nine
  sub-panels shown as three). Held unchanged on 2026-09-16 because the brief said so
  and because level 10's fight is verified frame by frame against them. Cutting them
  is one row in `tools/comics/plan.json` and one list in `cutscenes.json`; the sources
  are in `art-source/cutscenes/level10/` and `.../unplaced/`.
- **`unplaced/level10_intro_strip.png` has no home.** It is the family being pulled
  into the machine and it reads as level 10's OPENING; level 10 has only a title card.
  A genuine orphan rather than an alternate — the other two unplaced comics are
  alternates of the level 9 outro and the level 10 outro respectively. Publishing it
  is one row in `plan.json` and one key under `levels`.

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
