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
  site sits on an older commit. This has already cost half a day once.
- **Build/test:** `npm install` and `tsc` are unreliable. Use
  `sh tools/tsdiff.sh <known-green-commit>`. UI verification uses
  `sh tools/harness/build.sh` then `sh tools/harness/run.sh`, checked at 375×667,
  390×844, and desktop.
- **Asset pipeline:** after re-exporting art run `python3 tools/measure_art.py` and set
  `contentWidth`/`contentHeight` from its INK output, never the canvas. Source height
  ≥ roughly 7x world pixel size.
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
3. **Still open, and the highest-value item in the repo:** seven more harness scenarios
   still drive the deleted build menu and do the same thing — `ui`, `muzzle`,
   `buildall`, `rockets`, `retreat`, `regressions`, `poor`, `typegame`.

Until item 3 is cleared, "947 passing" does not mean what it says, and every soak and
tuning decision rides on a suite that is partly theatre. Treat a green run as evidence
only for the scenarios known to actually assert.

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

## THE BOARD-SIZE PROBLEM (found 2026-09-07)

**Build pads per level: level 1 has 7, level 2 has 15, level 3 has 15, level 4 has
14.** No documented convention, recorded nowhere until now. Boss HP only means
something relative to how much DPS a board can hold, so **level 1's and level 2's boss
numbers were never on the same scale**, and cross-level difficulty reasoning done
before this was found is suspect.

This does NOT invalidate a number measured on a level's own real board. It matters for
comparing levels and for authoring new ones. Settle an explicit per-level pad count
with a stated rationale before level 5, whose draft prompt says "8-10 slots" — written
without knowing the built levels run 14-15, and which would mint a second level 1.

## Level 2: diagnosed, fix measured, awaiting Cory

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

**Recommended fix, measured, not yet applied:** `theDevil.maxHealth` 6200 → 5200 in
`enemies.json`. 40% at 480 seeds, provably cannot touch another level. Full sensitivity
table and four rejected candidates in
`reports/2026-09-07-balance-verification-and-level-2.md`.

## Level 4 boss: settled

1500 HP with the finale at 2250, 44% at 480 seeds, 75% of losses on the wave 7 fight.
The brief said 1500 and nothing else, which turns `tests/level4.test.ts` red: the
return form is pinned at **1.5x the first form** by a documented design rule with a
test on it. Both measured: 1500/2250 is 44% (in band), 1500/1800 is 47% (out). **The
1.5x ratio is a real invariant. Move the pair.** Cory confirmed keeping 2250.

## Level 5 (designed with Elijah) — prompted, not built

Day-to-night crossroads level. Starts in daylight, flips to night mid-waves and
ordinary enemies become vampires. Roster: gliding cape vampires that float rather than
fly, fast baby Frankensteins, a big vampire elite, a vampire lord that splits on death.
"Vampirson" = lifesteal on attack; bleed disables lifesteal, which is the level's
counterplay loop. Boss is "Batula", a half-bat half-vampire humiliation character who
stops every few steps and leaves an acid puddle that kills player ground units but not
his own team, gaining speed and damage with each one he drops.

Art is rendered (8 PNGs). The build prompt is written and reviewed but not run. Two
spawns and two exits are new engine capability, not level data, and no existing level
has either: that is the highest-risk unknown. `Sim.ts` must model day/night, lifesteal,
bleed, puddles and the Humiliation meter before Batula's HP is derived from soak.

## Level 6

A "super long" level. Art has been the sticking point. Cory renders level segments as
multi-panel contact sheets rather than one image per segment.

## Chapter 2 / Other Game (designed, nothing built)

A hero survivors-like that drops tower placement entirely: drag to move, heroes locked in
ultimate form auto-attacking, swarms on an open bounded arena. Hidden until story level 10
is cleared, then it appears as its own entry point, which is the joke. A comic library over
the comic art already in the game unlocks alongside it. Full design in
`claude/chapter-2-design.md`, art render rules in `claude/chapter-2-art-rules.md`. Highest
risk unknown: holding 45fps with 200 concurrent enemies on a phone. Prove that before
building anything on top of it.

## Status as of 2026-09-07 morning

**`main` is at `622086d` and deployed.** The twelve commits from
`claude/hero-art-hud-rework-tqd10v` were fast-forwarded onto main and the Pages
deployment went waiting → queued → in_progress → success in thirteen seconds. Artifact
size 29,093,519 bytes, up from 28.64 MB, consistent with the new art.

**Live assets verified from chat** at `622086d` (WebFetch with the version string, so
not cached): `hero_cory_base.webp`, `hero_cory_power.webp`, `ability_eli_1.webp`,
`ability_cory_1.webp` and `fx_haymaker.webp` all return real files. The three that
genuinely 404'd at `9172418` now resolve.

Now live: the hero art and HUD portrait chip (`2f8145f`, `82783b3`), the progression
rework (`71d6199`, `020b66e`, `3e9a32b`), and balance verification plus the level 2
diagnosis (`7ae13d4`). Level 4's boss is at 1500/2250. Reports:
`2026-09-07-hero-art-and-the-hud-chip.md`, `2026-09-07-progression-rework.md`,
`2026-09-07-balance-verification-and-level-2.md`, `2026-09-07-merge-and-deploy.md`.

Health: 947 tests passing, 0 failing; typecheck clean apart from the known
phaser-resolve difference; working tree clean.

Five older branches from 04-05 September are unmerged and uninspected:
`deployment-status-review`, `github-pages-deploy-trigger`,
`level2-volcanic-map-recreation`, `main-branch-ci-checks`, `scatter-props-tree-line`,
`soak/overnight`.

## Open items

**Highest value:** the seven fake harness scenarios (see THE TEST SUITE LIES above).

**Awaiting Cory's word:** the Devil at 5200.

**Real player impact:**
1. **The hero's two ability medallions go dead after the Server Nuke drops.**
   Pre-existing and confirmed. A hero losing half their kit mid-run deserves its own
   session.
2. **Nine canvas-vs-ink content boxes**, eight of them tower-menu glyphs up to 35%
   small. Same bug as the peanut, nine more times.
3. **Courtland's ability names disagree with his icons** — art says *Seismic* and
   *Mind Control*, `heroes.json` says *Shockwave* and *Seismic*.
4. **`fx_mind_control` has art and no mechanic.**

**Polish and decisions:**
5. Cake tiers are probably too generous: level 4 averages 18.8 lives left on a win, so
   most wins likely pay three cakes. Three numbers in `cakes.json`; wants a soak that
   records cakes rather than wins.
6. The verdict line and the 2-cake tier disagree at exactly half (`>` against `>=`), so
   a run finishing on exactly 10 of 20 gets two cakes under the words "Barely
   standing."
7. Dialog buttons fall to about 24 CSS px when a panel scales to fit a phone.
   Pre-existing in kind; the four-button run-end panel made it worse. The proper fix is
   a shorter panel rather than a scaled one.
8. World map node cakes render 24-25 CSS px, not the 32 the brief asked for: 32 CSS px
   is 59 design units and three do not fit on a 160-unit node. **The 32 meant CSS
   pixels, what the eye actually sees.** Widen the node or change the presentation;
   do not shrink the cakes.
9. The world map shows 20 slots while scope is 10 story levels. Ten permanently dark
   padlocks in front of the kids. Changing it later means redoing `WorldRoad.ts` layout
   math and the tests that measure it.
10. Establish the build pad convention before level 5.

**Brief-vs-test conflicts: not a bug.** Three tests enforce real invariants and the
invariant should win. Update the brief, not the code: Overpacker height 90→85 px,
Overpacker cadence 1.4→1.6 s, Tour Guide cadence 1.0→1.1 s.
