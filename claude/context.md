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

**A green run still is not evidence about anything rendered**, for a different and
larger reason that survives all of the above: **no test in `tests/` imports Phaser.**
About 25 mention it, and every mention reads a source file as text and matches a
regex. So "1088 passing" says nothing about a sprite's size, a camera transform, a
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

**Build pads per level: 7, 15, 15, 14, 14, 18, 22, 19** for levels 1 to 8. No
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
level 3 88%, level 4 62%, level 5 45%, level 6 44%, level 7 41%, level 8 41%**.
`SOAK-REPORT.md` is the living record; read it rather than any number in this file.

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
Levels **7 ("The Highway", 22 pads, 41%)** and **8 ("The Optimization", 19 pads, CEO
boss, 41%)** followed on 12–13 September. See `reports/2026-09-11-level-6.md`,
`2026-09-12-level-6-fixes.md`, `2026-09-13-level-7.md` and `2026-09-12-level-8.md`.

## Chapter 2 / Other Game (designed, nothing built)

A hero survivors-like that drops tower placement entirely: drag to move, heroes locked in
ultimate form auto-attacking, swarms on an open bounded arena. Hidden until story level 10
is cleared, then it appears as its own entry point, which is the joke. A comic library over
the comic art already in the game unlocks alongside it. Full design in
`claude/chapter-2-design.md`, art render rules in `claude/chapter-2-art-rules.md`. Highest
risk unknown: holding 45fps with 200 concurrent enemies on a phone. Prove that before
building anything on top of it.

## Status as of 2026-09-13 evening

**`main` is at `d9686c8`.** Checks run 342 is green at JOB level, not merely at run
level: `changes` success, `test` success, `typecheck` success, `deploy` **skipped** —
because that push was markdown only, which is the `changes` job working as designed.
The last commit that actually republished Pages is `eb2bf4d`, the level 8 soft-lock
merge, earlier the same day.

**Eight levels are built and playable**, not four: `level1` Courjahan Village,
`level2` Head Office, `level3` Sports Complex at Dusk, `level4` The Conundrum,
`level5` The Crossroads, `level6` Two Roads, `level7` The Highway, `level8` The
Optimization. Each has its own map, wave table and soaked boss. `plannedLevels` is
**10**, so the road shows eight built rows and two COMING SOON. Level 9 and 10 art is
uploaded to `art-source/` but neither level is wired up; the geometry work for level 9
is on a branch (below).

Health: **1088 tests passing, 0 failing** (`npm test`, in this sandbox, no
`node_modules` needed). `sh tools/tsdiff.sh d9686c8` reports **213 distinct errors on
both sides and nothing introduced** — all 213 are the known `phaser` resolve cascade,
and CI's real `npx tsc --noEmit` is green. Working tree clean.

**Four of the six branches this section used to list are gone**, deleted since. Of the
five remote branches other than `main`:

| branch | state |
|---|---|
| `claude/level-8-soft-lock-9bmho0` | **fully contained in `main`** (merged as PR #8); safe to delete |
| `claude/level-9-geometry-uac8ax` | **15 ahead, 0 behind — live work, not yet merged** |
| `claude/deployment-status-review-a661d6` | 7 ahead, 102 behind; still unmerged and still uninspected, from 05 September |
| `claude/github-pages-deploy-trigger-x8b598` | 294 ahead, 102 behind; same |
| `claude/phaser-4-migration-spike-hage91` | 144 ahead, 102 behind; salvaged onto `main`, and GitHub answered 403 twice to deleting the ref |

`level2-volcanic-map-recreation`, `main-branch-ci-checks`, `scatter-props-tree-line`
and `soak/overnight` no longer exist. (The old entry said "five" and then listed six.)

**`claude/level-9-geometry-uac8ax` is the one that matters**, and CLAUDE.md's
asset-sweep standing fact applies to it directly: check its `art.json` before deleting
any level 9 or 10 asset for being unreferenced.

## Open items

**These are renumbered.** Six of the original ten closed between 07 and 13 September;
what is left keeps its wording and gets a new number, so a citation of "open item 4"
written before 2026-09-13 does not mean item 4 here. `claude/chapter-2-design.md` used
to carry two such citations and now describes the items instead.

**Highest value:** nothing on this list. The old highest-value item — the fake harness
scenarios — is closed; see THE TEST SUITE LIES above.

**Real player impact:**
1. **The hero's two ability medallions go dead after the Server Nuke drops.**
   Pre-existing, and still reproduces on `d9686c8`:
   `sh tools/harness/run.sh abilitybar 180 844x390` reports `tap heroSlot1: DEAD` and
   `tap heroSlot2: DEAD` in the five-slot block, while `molotov`, `glacier` and
   `serverNuke` all read `REACHED`. Four slots, before the drop, are all four
   `REACHED`. A hero losing half their kit mid-run deserves its own session.
2. **Twenty canvas-vs-ink content boxes**, up from nine. All nine originals are
   untouched — `icon-firerate` 34.8% small, `icon-locked` 29.3%, `icon-upgrade` 22.7%,
   `icon-armor` 21.9%, `icon-cancel` 19.5%, `icon-range` 18.4%, `ui-nuke-down` 13.5%,
   `icon-damage` 7.4%, `icon-target` 3.9% — and eleven enemy entries have joined them,
   worst `enemy-cargo-yellow` at 11.1%. `python3 tools/measure_art.py` prints the whole
   list and ends `148 entries checked, 20 disagree with their own pixels`. Same bug as
   the peanut, twenty times. Fixing the eight tower-menu glyphs makes every one of them
   visibly larger, which is a UI change that wants a look at the ring first.

**Polish and decisions:**
3. Cake tiers are probably too generous: level 4 averages 18.8 lives left on a win, so
   most wins likely pay three cakes. Three numbers in `cakes.json`; wants a soak that
   records cakes rather than wins. Nothing under `tools/soak/` records a cake yet.
4. The verdict line and the 2-cake tier still disagree at exactly half, and both halves
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
`171f02d`); and the build-pad convention (settled before level 5 — see THE BOARD-SIZE
PROBLEM). Written up in `reports/2026-09-13-context-reconciliation.md`.

**Brief-vs-test conflicts: not a bug.** Three tests enforce real invariants and the
invariant should win. Update the brief, not the code: Overpacker height 90→85 px,
Overpacker cadence 1.4→1.6 s, Tour Guide cadence 1.0→1.1 s.
