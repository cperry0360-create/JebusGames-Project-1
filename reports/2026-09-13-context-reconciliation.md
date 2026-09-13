# context.md, reconciled against main

2026-09-13

`claude/context.md` was written on 2026-09-07 and hand-uploaded to the repository a
week later (`5084b89`) without a line changed. Every claim in it has now been checked
against the tree at `d9686c8`. **Six of the ten open items were already fixed, and one
had doubled in size.** Structure, voice and section order are untouched; only wrong
statements were changed.

## Commits

| commit | what | CI |
| --- | --- | --- |
| `b23e311` | Reconcile context.md against main, and de-number the two citations of it | [run 348](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34782604672): **green at job level** — `changes` success, `test` success, `typecheck` success, `deploy` **skipped** (markdown-only push, which is the `changes` job working as designed) |
| `e43165b` | This file | [run 350](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34782770292): **green at job level** — `changes` success, `test` success, `typecheck` success, `deploy` skipped, same reason |
| `<the commit adding this row>` | Fills in the row above | documentation only; touches no file the build reads, and its result is in the reply that carried this file |

Both pushes are markdown only, so neither republishes Pages and neither should. The
live site stays on `eb2bf4d`, the level 8 soft-lock merge.

---

## Why the last report was not enough to go on

`reports/2026-09-13-chapter-2-design-docs.md`, written earlier today, carries a
section headed **"Carried forward, unaddressed (from `claude/context.md` open items,
still open and untouched by this session)"** and lists all ten. That session was
verifying design documents and copied the list across without re-reading the code, so
the list looked freshly confirmed and was not. Three of the ten it names as open had
been fixed days earlier — including item 3, which it went out of its way to say "now
matters more than it did".

**This is the thing to take away from this pass, more than any individual item.** A
carried-forward list is a claim about the code and decays like one. Items 3, 4 and 9
were all closed by commits that are in `main`'s history and all three were still being
reported as open a week later.

---

## The ten open items, one at a time

Each row says what the doc claimed, what the repository actually shows, and how it was
established. Ordered as the doc had them.

### 1. The hero's two ability medallions go dead after the Server Nuke drops — STILL OPEN

> **SUPERSEDED — see the addendum at the foot of this file.** This conclusion is
> wrong. The medallions work in play; `abilitybar`'s own probe opens the Server Nuke
> launch modal one tap earlier and then taps through its scrim. The measurement below
> is real, the inference from it is not. Left in place rather than rewritten, because
> how it was got wrong is the useful part.

**Doc:** "Pre-existing and confirmed. A hero losing half their kit mid-run deserves its
own session."

**Repo:** exactly that, still, on `d9686c8`. Reproduced rather than assumed:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh abilitybar 180 844x390
```

```
four slots, before the drop (4 slots)
    tap molotov: REACHED
    tap glacier: REACHED
    tap heroSlot1: REACHED
    tap heroSlot2: REACHED
five slots, after the Server Nuke drops (5 slots)
    tap molotov: REACHED
    tap glacier: REACHED
    tap serverNuke: REACHED
    tap heroSlot1: DEAD
    tap heroSlot2: DEAD
```

The hit rectangles are correct in both blocks — `heroSlot1` reads
`region x467-543 | hit 467-543 | icon centre 505,348 | dx=0` in the five-slot case, so
this is not a layout drift. The tap reaches the right rectangle and nothing happens.
**Not diagnosed here**, only re-measured; the doc's judgement that it wants its own
session stands. Kept as item 1, with the reproduction added.

### 2. Nine canvas-vs-ink content boxes — STILL OPEN, AND IT IS NOW TWENTY

**Doc:** "Nine canvas-vs-ink content boxes, eight of them tower-menu glyphs up to 35%
small."

**Repo:** `python3 tools/measure_art.py` ends its content-box audit with
`148 entries checked, 20 disagree with their own pixels`. All nine originals are
present and unchanged:

| key | says | ink is | drawn |
| --- | --- | --- | --- |
| `icon-firerate` | 256x256 | 167x245 | 34.8% small |
| `icon-locked` | 256x256 | 181x240 | 29.3% small |
| `icon-upgrade` | 256x256 | 198x215 | 22.7% small |
| `icon-armor` | 256x256 | 200x235 | 21.9% small |
| `icon-cancel` | 256x256 | 206x218 | 19.5% small |
| `icon-range` | 256x256 | 209x215 | 18.4% small |
| `ui-nuke-down` | 600x495 | 569x428 | 13.5% small |
| `icon-damage` | 256x256 | 256x237 | 7.4% small |
| `icon-target` | 256x256 | 246x253 | 3.9% small |

Eleven enemy entries have joined them since — `enemy-cargo-yellow` 11.1%,
`enemy-cargo-red` 9.4%, `enemy-musclecar` 6.1%, `enemy-hatchback` 5.9%,
`enemy-ceo` 4.1%, `enemy-transporter` 3.8%, `enemy-van` 3.7%, `enemy-cargo-green` 3.6%,
`enemy-bladerig` 3.0%, `enemy-cargo-blue` 3.0%, `enemy-office-drone` 1.4%. The audit
was added precisely so the number could not quietly grow, and it did not: it grew
loudly and nobody read it. Item rewritten with the new count.

### 3. Courtland's ability names disagree with his icons — CLOSED

**Doc:** "art says *Seismic* and *Mind Control*, `heroes.json` says *Shockwave* and
*Seismic*."

**Repo:** `heroes.json` says **Seismic**, **Mind Control** and **Mind Laser**, each
bound to the icon it was drawn for:

```
== courtland Courtland
   name=Seismic        icon=ability-courtland-1  fx=fx-seismic       effect=burst
   name=Mind Control   icon=ability-courtland-2  fx=fx-mind-control  effect=control
   name=Mind Laser     icon=ability-courtland-3  fx=fx-mind-laser    effect=laser
```

His `_abilities` note records the reasoning: *"SEISMIC IS SLOT 1 … It replaces
Shockwave, which was the same burst under a different name, and it takes
`ability-courtland-1` with it — the ground-shatter icon, which is what that picture
always was."* And *"MIND CONTROL fixes a naming mismatch rather than creating one.
`ability-courtland-2` is a picture of Courtland gripping an enemy's mind and it was
bound to a slot whose data said Seismic."*

**Verified by:** dumping every hero's `abilities` array with a script rather than
reading prose, then `grep -rn "Shockwave" src/ tests/` — it survives in exactly three
places, a comment on `GameScene.powerBurst`, a comment in `heroes.json` explaining the
rename, and a sentence of test prose in `heropowers.test.ts`. No data, no UI string.
`git log -S'"Mind Control"' -- src/data/heroes.json` puts the change in `dc0cdb5`.
Removed.

### 4. `fx_mind_control` has art and no mechanic — CLOSED

**Doc:** four words, and they were true when written.

**Repo:** the mechanic exists end to end.

- `heroes.json` gives Courtland's second ability `"effect": "control"`.
- `GameScene.ts:3658` — `case 'control': this.powerControl(p, x, y); break`.
- `Enemy.ts:463` declares `controlled = false`, and its own header says so in as many
  words: *"DECLARED BEFORE ANYTHING SET IT, and something does now."* `Enemy.ts:480-481`
  is the setter, gated on `this.def.blockable` so every boss is immune.
- `GameScene.ts:4747` — `syncStatusMarkers` picks `'control'` for a controlled enemy,
  and `4761` draws `ART.fx.mindControl` over it.
- `art.json`'s `_fx` note: *"`mindControl` is live now: Courtland's Mind Control sets
  `Enemy.controlled` and `enemyMarker` in GameScene draws this over every enemy it
  turns, which is what keeps two enemies fighting each other from reading as a bug."*

**Verified by:** `grep -rn "mind_control\|mindControl"` across `src/`, then reading each
hit rather than counting them. Removed.

### 5. Cake tiers probably too generous — STILL OPEN

**Doc:** "level 4 averages 18.8 lives left on a win, so most wins likely pay three
cakes … wants a soak that records cakes rather than wins."

**Repo:** `cakes.json` still has the three tiers at fractions 0, 0.5 and 1, and nothing
under `tools/soak/` records a cake — `Rng.ts`, `Sim.ts`, `audit.ts`, `eli.ts`,
`heroes.ts`, `level.ts`, `run.ts`, `tune5.ts`, `tune7.ts`, `tune8.ts`, none of them
mentions one. The soak the item asks for has not been written. Kept, renumbered to 3,
with that last fact added so the next session does not go looking for it.

### 6. Verdict line and 2-cake tier disagree at exactly half — STILL OPEN

**Doc:** "`>` against `>=`, so a run finishing on exactly 10 of 20 gets two cakes under
the words 'Barely standing.'"

**Repo:** both halves confirmed, in two files.

```ts
// src/systems/Cakes.ts:52
for (const t of CAKE_TIERS) if (share >= t.livesFraction) earned = t.cakes
```

```ts
// src/systems/Banner.ts:46
if (o.livesRemaining > o.maxLives * cfg.cleanLivesFraction) return cfg.verdicts.clean
return cfg.verdicts.narrow
```

`cakes.json`'s 2-cake tier is `livesFraction: 0.5`; `rules.json`'s
`banner.cleanLivesFraction` is `0.5`; `banner.verdicts.narrow` is `"Barely standing."`
At `share == 0.5` the cake loop takes the tier and the verdict does not. Exactly as
described. Kept, renumbered to 4, with the two lines quoted so it does not have to be
re-derived a third time.

### 7. Dialog buttons fall to about 24 CSS px — CLOSED

**Doc:** "Pre-existing in kind; the four-button run-end panel made it worse. The proper
fix is a shorter panel rather than a scaled one."

**Repo:** fixed, though **not the way the doc proposed** — what landed is a tap floor,
not a shorter panel. `src/ui/Plate.ts:257-258`, inside `plateButton`, which every
dialog button in the game goes through:

```ts
h = tapFloor(scene, h)
w = tapFloor(scene, w)
```

with a header naming this exact bug: *"on an iPhone in landscape the whole box comes
down to about 54% and a 48-unit button is 26 CSS pixels tall — under the 44pt minimum,
on every button of every menu, on every phone."* `tapFloor` is
`Math.max(wanted, minDesign(scene, css))` with `MIN_TAP = 44`, so at 844x390 (fit
390/720 = 0.5417) a 44-unit button becomes 81.2 design units, which is 44.0 CSS px, and
on a desktop window the fit is near 1 and nothing moves. `src/ui/Dialog.ts:326` then
reserves `tapFloor(scene, CHOICE_BTN_H)` for the card height, because the grown button
was eating the last line of the card's flavour text.

**Verified by:** `sh tools/harness/run.sh screens 200 844x390`, which reports a SMALL
fault for any control under 44pt. One fault at that viewport, and it is
`SMALL Title [title:version-stamp (hidden dev door, not a tap target)]` — not a dialog
button.

**What is NOT verified, and is flagged rather than claimed:** no harness scenario
measures the run-end panel's own four buttons in CSS pixels. `results` walks the dialog
and checks every button is present and on screen, but prints only labels and row
positions, not sizes. The mechanism is systemic and the arithmetic is exact, which is
why this is removed from the list; if it is ever re-opened, that missing measurement is
where to start. Removed.

### 8. World map node cakes render 24-25 CSS px, not 32 — CLOSED

**Doc:** "32 CSS px is 59 design units and three do not fit on a 160-unit node. **The 32
meant CSS pixels, what the eye actually sees.** Widen the node or change the
presentation; do not shrink the cakes."

**Repo:** `presentation.json`'s `cakes.nodeSize` is **57**, and its `_nodeSize` note is
the doc's own reasoning carried through to a decision:

> a design unit is not a pixel … 44 units is 46 CSS pixels on a desktop window and 24
> on a phone in landscape at 844x390 … The brief asked for 32 CSS pixels AT THAT
> VIEWPORT, and 32 / (390/720) is 59 units. **57 rather than 59** because a cake is
> fitted into a box and drawn 4% wider than it: a rendered frame reports 33.3 CSS px at
> 59 and **32.0 at 57**.

And the presentation changed rather than the cake, which is the branch the doc asked
for: *"THREE AT 57 DO NOT FIT ON A 160-WIDE CARD: the row is 192 units and its plate
202. The card cannot be widened … so what changed is the presentation. The row is
allowed to be wider than the card it belongs to."* `WorldMapScene.ts:486-499` draws it.

**One caveat the note itself carries and this doc should not lose:** no design-unit
figure is 32 CSS px everywhere. At 956x305 — what Safari leaves with its Share sheet
open — the fit is 0.42 and these are 25 CSS px. `sh tools/harness/run.sh roadfit`
reports the size it actually comes out at. Removed.

### 9. World map shows 20 slots while scope is 10 story levels — CLOSED

**Doc:** "Ten permanently dark padlocks in front of the kids. Changing it later means
redoing `WorldRoad.ts` layout math and the tests that measure it."

**Repo:** `levels.json`'s `plannedLevels` is **10**, and its `_plannedLevels` note is
unusually blunt about it: *"TEN IS THE SCOPE AND IT IS FINAL. It was 20, and raising it
did NOT cost nothing."* The doc's warning was right about the cost — the change did
mean redoing the layout, and `reports/2026-09-13-level-select-redesign.md` is the
write-up. Halving the road alone did not fix it (`maxScroll` was still 930, four nodes
still off screen); the fix was two rows of five, which fit the 1280 design box with no
scrollbar. Two `worldmap.test.ts` assertions had hardcoded the twenty and were updated.
`git log -S'"plannedLevels": 10'` puts it in `171f02d`. Removed.

### 10. Establish the build pad convention before level 5 — CLOSED

**Doc:** "Settle an explicit per-level pad count with a stated rationale before level 5,
whose draft prompt says '8-10 slots' — written without knowing the built levels run
14-15, and which would mint a second level 1."

**Repo:** settled, and settled as something better than a count. Levels 5 to 8 were each
placed by a `tools/trace_levelN.py` and verified by a `tools/check_levelN.py` against
four properties inherited from levels 3 and 4: the pad's 24 px core entirely on
classified buildable ground, 90–114 world px from the nearest lane centreline, at least
74 px from another pad, and at least 34 px from a frame edge so the tap target is on the
board. Each map's `_buildSpots` note states the rule and its measurements.

**A fixed count was rejected on purpose**, and `map_level8.json` says why: *"The count
is what those rules allow and is not a target — the placement stops when the best
remaining pad adds no uncovered lane."* The corollary the original board-size finding
demanded is now written into the data instead: *"BOSS HEALTH IS MEASURED AGAINST THIS
BOARD and against no other."* Level 7 states the sharpest version — 20 of its 22 pads
reach two highways at once, so it holds far more effective DPS than 22 pads suggests.

And the specific worry did not happen: level 5 shipped with **14** pads, matching levels
2, 3 and 4, not the draft's 8-10. Removed, and the BOARD-SIZE PROBLEM section rewritten
to record the resolution rather than the open question.

### Counts, level by level

| level | build pads |
| --- | --- |
| 1 | 7 |
| 2 | 15 |
| 3 | 15 |
| 4 | 14 |
| 5 | 14 |
| 6 | 18 |
| 7 | 22 |
| 8 | 19 |

Read straight out of each map's `buildSpots` array.

---

## "Awaiting Cory's word: the Devil at 5200" — the decision was made six days ago

The doc's level 2 section is headed *"diagnosed, fix measured, awaiting Cory"* and says
the fix is *"measured, not yet applied"*.

`src/data/enemies.json` has `theDevil.maxHealth` at **5200**. It was applied in
`862ecf7` on 2026-09-07 and written up in `reports/2026-09-07-the-blind-harness.md`,
which records 192/480 (40%) at the new number against 106/480 (22%) at the old, and
confirms levels 1 and 3 were untouched to the run because `theDevil` is named in exactly
two places and both are in `waves.level2.json`.

Two things from that write-up are now in `context.md` because they qualify the fix and
were only in a report: the failure did not move anywhere more interesting (281 of 288
losses still on wave 13, every win still a flawless 20 of 20), and giving level 2 a
difficulty curve remains a wave-table job.

## Every win rate in the doc is from a retired instrument

The doc quotes level 1 at 79%, level 2 at 21%, level 3 at 75%, level 4 at 53%, and level
4's boss "44% at 480 seeds". None of those reproduce. The soak has been reworked
repeatedly since — a third spawn on level 6, a scripted player that could not see level
7's board, a purse-bound level 8 — and `SOAK-REPORT.md` is the living record. The
current published Cory-pinned figures at 480 seeds on normal:

| level | | level | |
| --- | --- | --- | --- |
| 1 | 89% | 5 | 45% (218/480) |
| 2 | 53% | 6 | 44% (210/480) |
| 3 | 88% | 7 | 41% (198/480) |
| 4 | 62% (299/480) | 8 | 41% (195/480) |

The 1500/2250 pair for level 4's boss is still what `enemies.json` carries; only the
measured rate moved. `context.md` now points at `SOAK-REPORT.md` rather than restating
numbers that will move again.

**One number in `SOAK-REPORT.md` is itself flagged as not reproducing** and is left
alone here: the 2026-09-12 entry publishes level 6 at 181/480 (38%) and the same command
at the same commit prints 210/480 (44%). That is recorded in the soak report as an open
question and is not mine to resolve.

---

## "THE TEST SUITE LIES" — the count was never seven

**Doc:** *"Still open, and the highest-value item in the repo: seven more harness
scenarios still drive the deleted build menu and do the same thing — `ui`, `muzzle`,
`buildall`, `rockets`, `retreat`, `regressions`, `poor`, `typegame`."* Seven, over a
list of eight.

**Repo:** closed on 2026-09-07 in `39cca69`, and the list was wrong in both directions
before it was closed. `reports/2026-09-07-the-blind-harness.md` established the real
count by **running** each scenario and reading its exit code:

- `muzzle` and `retreat` were on the list and were working.
- `fx`, `icons`, `phone`, `stun` and `full13` were blind and not on the list — `full13`
  being the only scenario that plays a run end to end.
- Real count: **eleven**. Nine repaired, `poor` and `icons` deleted with their reasons
  recorded in the source and pinned by `tests/harness.test.ts`.

The hole itself is closed in three links: `index.html` records a `directorError` instead
of swallowing the throw into a log line, `run.sh` ends `STATUS=$?` … `exit $STATUS`
instead of an unconditional `exit 0`, and `server.py` exits 1 on a throw, 2 on a
timeout, 3 on an unreadable report, 4 on a boot failure and 5 on a reported fault.

### What the seven have become

There is still a set of scenarios that check nothing, and this is the part worth
carrying forward. It is now **declared** rather than discovered, and it is **five**:

```js
const ASSERTS_NOTHING = new Set([
  'muzzle', 'rockets', 'retreat', 'regressions', 'meteor',
])
```

`server.py` **exits 7** on any of them — *"Its numbers and screenshots are real; its
exit code was a lie."* A second list, `USES_EXPECT` (`typegame`, `rotationburst`,
`level7`, `level8`, `boardinput`), is held to having evaluated at least one check, and
exits 8 if it reached none. `tests/harness-scenarios.test.ts` re-derives both lists from
the source so neither can rot the way the original did.

**Proved rather than read**, because a guard that is not armed looks exactly like a
guard that passed:

```
$ sh tools/harness/run.sh muzzle 60 844x390 ; echo $?
7
$ sh tools/harness/run.sh title 60 844x390 ; echo $?
0
```

137 scenarios are dispatched in total.

### And one thing the doc's section did not say at all

CLAUDE.md carries a standing fact that is larger than everything above and was missing
here: **no test in `tests/` imports Phaser.** About 25 mention it, and every mention
reads a source file as text and matches a regex. So 1088 passing says nothing about a
sprite's size, a camera transform, a texture that failed to load or a shader. One
sentence added, pointing at CLAUDE.md rather than restating it.

---

## Status section, replaced

The doc's "Status as of 2026-09-07 morning" was wrong on every load-bearing number.

| | doc said | repo shows |
| --- | --- | --- |
| tip of `main` | `622086d` | `b23e311` (was `d9686c8` when this pass started) |
| tests | 947 passing | **1088** passing, 0 failing |
| typecheck | "clean apart from the known phaser-resolve difference" | still true, and the number is **213** distinct errors on both sides of `sh tools/tsdiff.sh d9686c8`, nothing introduced |
| levels built | four, implicitly | **eight**, level 1 to level 8, each with its own map, wave table and soaked boss |
| unmerged branches | six named, called "five" | four of the six no longer exist |

### Levels built

`level1` Courjahan Village · `level2` Head Office · `level3` Sports Complex at Dusk ·
`level4` The Conundrum · `level5` The Crossroads · `level6` Two Roads · `level7` The
Highway · `level8` The Optimization. `plannedLevels` is 10, so the road shows eight
built rows and two COMING SOON. Level 9 and 10 art is uploaded to `art-source/`;
neither level is wired up.

### Branches, as they actually stand

| branch | head | ahead | behind | in `main`? |
| --- | --- | --- | --- | --- |
| `claude/level-8-soft-lock-9bmho0` | `42668486` | 0 | 8 | **fully contained** (merged as PR #8) |
| `claude/level-9-geometry-uac8ax` | `1c14b818` | **15** | 0 | no — live work |
| `claude/deployment-status-review-a661d6` | `57bac8b3` | 7 | 102 | no |
| `claude/github-pages-deploy-trigger-x8b598` | `5882fd0b` | 294 | 102 | no |
| `claude/phaser-4-migration-spike-hage91` | `ad62fab0` | 144 | 102 | no — salvaged onto `main`; GitHub answered 403 twice to deleting the ref |

`level2-volcanic-map-recreation`, `main-branch-ci-checks`, `scatter-props-tree-line` and
`soak/overnight` are gone. Established with `mcp__github__list_branches`, then
`git fetch` on each and `git merge-base --is-ancestor` against `origin/main` — not from
the 2026-09-09 branch-cleanup table, which is four days stale.

**`claude/level-9-geometry-uac8ax` is the one that matters**, and CLAUDE.md's
unreferenced-asset standing fact points straight at it: it is 15 commits of level 9 work
that is not on `main`, at a moment when level 9 and 10 art is sitting in `art-source/`
referenced by nothing. Check that branch's `art.json` before sweeping any of it.

### Levels 5 and 6, which the doc described as unbuilt

**Level 5** shipped on 2026-09-07 with every mechanic named in the doc's own paragraph:
`DayNight.ts`, `NightRules.ts`, `Vampirism.ts` and `AcidPuddle.ts`, with the numbers in
`level5.json` under `phases`, `conversions`, `lifesteal`, `bleed`, `gliding`, `acid` and
`humiliation`. Batula is 4500 HP; the level soaks at 218/480 (45%).

The doc called two spawns and two exits "the highest-risk unknown". It was not the hard
part. Multiple spawns were **already supported** — levels 3 and 4 have two gates each.
Multiple exits and a lane split were genuinely new and cost about 200 lines across
`Lanes.ts`, `Gateway.ts` and `types.ts`. The leak system needed nothing (`GameScene.leak()`
was already lane-agnostic) and neither did the soak's pathing model. The plate turning
out to be a different shape from the brief was the bigger problem.

**Level 6** shipped on 2026-09-11 as "Two Roads": two lanes, 18 painted pads, a Rooster
at 7,500 HP soaking at 210/480 (44%). The doc's note that art was the sticking point is
kept — `claude/level-art-segment-rules.md` is what came out of it. Levels 7 and 8
followed on 12–13 September.

---

## Repo conventions, against CLAUDE.md and the workflow files

Three of the six bullets are now contradicted by what is in the repository.

**The deploy bullet was right and is now incomplete.** "Green CI on a branch does not
deploy anything" still holds. What is new is that a **markdown-only push to `main` does
not deploy either**. `.github/workflows/deploy.yml` is now a reusable workflow called by
a `deploy` job inside `checks.yml`, gated on `needs: [test, typecheck, changes]` plus
`github.ref == 'refs/heads/main'` plus `needs.changes.outputs.code == 'true'`, where the
`changes` job diffs the push and answers false when every changed file matches
`(\.md$|^reports/)`. Its comment explains the choice of a job over `paths-ignore`: the
latter would skip the whole workflow and leave the commit carrying no checks at all. It
fails safe toward deploying — a missing before-SHA republishes.

The practical consequence, added to the doc: **a green run on `main` with `deploy`
skipped is correct on a docs commit.** Read the job list, not the run's conclusion.
Confirmed on this pass — `deploy.yml` last ran as a standalone workflow on 2026-09-04;
everything since is the `deploy` job inside a Checks run.

**"`npm install` and `tsc` are unreliable" undersold one and oversold the other.**
`npm install` genuinely fails (registry 403, no `node_modules`) and `tsc` genuinely
cannot resolve `phaser` because of it. But **`npm test` runs the entire suite in this
sandbox without `node_modules`** — 1088 tests in 6.7 seconds, `node --test` on
`.test.ts` files directly. A session that reads that bullet and does not run the tests
has been misled. Corrected, and CLAUDE.md's `tsdiff` blind spot added: without the real
typings every Phaser member is `any`, so an access rule on one cannot fire locally and
CI is the first thing that can tell you.

**"Source height ≥ roughly 7x world pixel size" is now a formula, not a constant.**
CLAUDE.md rule 7 was rewritten: `source height >= world height x maxZoom x
devicePixelRatio`, and it says in terms *"Recompute rather than memorise 7: the zoom
band moves."* It works out at about 7x today because maxZoom is 2.37 and `Resolution.ts`
caps dpr at 3. The rule also now warns in both directions — too large minifies, and a
4px outline sampled down past about 2x becomes a grey smear, with no mipmaps to soften
it. Corrected.

The UI-verification bullet gained "in both orientations" and the note that portrait is
*gated* by the rotate overlay rather than audited, which is CLAUDE.md's wording and is
the correct answer for portrait rather than a skipped check.

The balance-numbers, branching and reporting bullets all match CLAUDE.md and were left
alone.

### Not changed, but worth flagging

**CLAUDE.md's own "Current phase" section is stale**, more so than anything corrected
here. It reads: *"Phase 1 — prove the loop is fun. Placeholder art from Kenney's free
CC0 tower defense pack. One map, one path, Cory only. No Banner tree, no boons, no
Holdings, no siege enemies until Phase 1 is playable and confirmed fun."* The repository
has eight levels, five heroes with bespoke art, three difficulty modes and a cake
economy. That is a CLAUDE.md edit and outside this brief, so it was not made — but
whoever picks it up should know the file's last section describes a game from several
weeks ago.

A smaller one: the `results` scenario in `tools/harness/index.html` carries the comment
*"six levels are built and the road has ten slots"*. Eight are. The scenario itself asks
`nextLevelId(LV) === null` rather than hardcoding a level, so the comment is stale and
the code is not.

---

## The two citations in `chapter-2-design.md`

Both cited `context.md` open items **by number**, and both of those items are now gone,
so the numbers would have pointed at whatever landed in those slots.

**Line 34, item 9.** Said the world map "shows 20 slots against a scope of 10 story
levels" and that Other Game levels "are a candidate for the back half". Both halves are
now wrong: the map shows 10, and there is no back half to be a candidate for. Rewritten
to describe the settled state, including the cost of raising the count again (eleven
slots is a third row, and two rows already spend 498 of the band's 522 units) — which
strengthens the section's own argument that Other Game needs its own entry point rather
than weakening it.

**Line 109, item 4.** Said Courtland's Seismic and Mind Control as Other Game's two
buttons "finally gives `fx_mind_control` a mechanic". Story mode gave it one first.
Rewritten to say those are his real names and his real powers already, so the Chapter 2
design does not have to invent them.

Neither rewrite changes what the design document proposes. `claude/chapter-2-art-rules.md`
was checked for the same pattern and cites `level-art-segment-rules.md` by name, not by
number, so it needed nothing.

---

## What was checked and could not be settled

- **Item 7's residue.** The tap-floor mechanism is provably in place and the arithmetic
  at 844x390 is exact, but **no scenario measures the run-end panel's four buttons in
  CSS pixels.** `results` checks they exist and are on screen; `screens` audits the four
  menu screens, not the dialog. The item was removed on mechanism plus the absence of a
  SMALL fault, not on a direct measurement of the panel the item named.
- **Item 1 is re-measured, not diagnosed.** The harness says the taps are dead. Nothing
  here says why.
- **The live site.** This sandbox cannot reach github.io — the egress proxy answers 403
  by policy — so nothing here is a check of the deployed game, and none is claimed. Both
  commits in this pass are markdown and neither should have deployed.
- **The level 6 soak discrepancy** in `SOAK-REPORT.md` (181/480 published against
  210/480 reproduced) is left exactly as that document records it.
- Nothing in "Working with Cory" or "The three-tool workflow" is checkable from the
  repository. Left untouched.

---

## Where this leaves the repository

**In flight**

- `claude/level-9-geometry-uac8ax`, 15 commits ahead of `main` and 0 behind. Unmerged,
  uninspected by this pass, and the reason to check before any level 9/10 asset sweep.

**Open, and now correctly stated in `context.md`**

1. ~~The hero's two ability medallions go dead after the Server Nuke drops.~~
   **Withdrawn — see the addendum. Not a product bug.**
2. Twenty canvas-vs-ink content boxes, up from nine. Fixing the eight tower-menu glyphs
   is a visible UI change and wants a look at the ring first.
3. Cake tiers probably too generous, and the soak that would settle it does not exist
   yet.
4. The verdict line and the 2-cake tier disagree at exactly half.

Plus the unchanged brief-vs-test conflicts: Overpacker height 90→85 px, Overpacker
cadence 1.4→1.6 s, Tour Guide cadence 1.0→1.1 s. Three tests enforce real invariants;
update the brief, not the code.

**Blocked or waiting on a decision**

Nothing. The one item that was waiting — the Devil at 5200 — was decided and applied on
2026-09-07, and the doc had been carrying the question for six days.

**Worth someone's attention, outside this brief**

- CLAUDE.md's "Current phase" section describes a much earlier game.
- Three branches (`deployment-status-review`, `github-pages-deploy-trigger`,
  `phaser-4-migration-spike`) are 102 behind and have been uninspected for over a week.
  `level-8-soft-lock` is fully contained and safe to delete. All four are Cory's call.
- `reports/2026-09-13-chapter-2-design-docs.md` carries the ten-item list as though it
  were current. It is now superseded by this file.

---

# Addendum, same day: the harness count, the medallions, and CLAUDE.md

A second pass, after the above was filed. Three things came out of it, and the
middle one reverses a finding in the report you have just read.

## Commits

| commit | what | CI |
| --- | --- | --- |
| `<pending>` | Correct the harness count, retire the medallion item, reconcile CLAUDE.md | filled in below |

Documentation only again — `CLAUDE.md`, `claude/context.md`,
`claude/chapter-2-design.md`. No code, JSON, test or asset touched, so `deploy`
skips for the third time and Pages still serves `eb2bf4d`.

---

## 1. What `chapter-2-design.md` actually said

The brief asked for both passages quoted as they stand, on the grounds that the
previous session edited the file and its own description of it should not be
trusted. Correct instinct, and it caught something.

**"Towers as a crossover", before this pass:**

> Do not rebuild the pad system for this. The build menu is already deleted and
> seven harness scenarios still drive its ghost.

**"Heroes", before this pass:**

> Courtland as the worked example: Mind Laser is the auto weapon, held on the
> nearest target. Seismic and Mind Control are the two buttons. **These are his
> real names and his real powers now** — `heroes.json` gives him Seismic, Mind
> Control and Mind Laser, each bound to the icon it was drawn for, and Mind
> Control sets `Enemy.controlled` so `fx_mind_control` has a mechanic in story
> mode. The context doc used to carry both of those as open items; both closed
> on 2026-09-13. Nothing here has to invent them.

**So half the instruction was already satisfied and needed nothing.** The brief
said to delete the `fx_mind_control` claim *if it still asserts the mechanic
does not exist*. It does not — it asserts the opposite, correctly, and names the
`Enemy.controlled` path. It was rewritten in the first pass. **No change made.**
The surrounding design point about base-form powers becoming the auto weapon is
untouched either way.

The harness sentence was wrong and is corrected below.

## 2. The non-asserting scenarios: five, and it is not the five anyone expected

Three documents disagreed. Re-derived from `tools/harness/server.py` and by
running every candidate at 844x390, rather than from any of them.

The mechanism first, because the exit codes are the whole answer.
`server.py` reports a report's `assertsNothing` flag as **exit 7**, and that flag
is set from `ASSERTS_NOTHING` in `tools/harness/index.html`. Unknown scenarios
exit 6, a scenario that reported a fault exits 5, a clean asserting run exits 0.

| scenario | exit | what it means |
|---|---|---|
| `muzzle` | **7** | declared, asserts nothing |
| `rockets` | **7** | declared, asserts nothing |
| `retreat` | **7** | declared, asserts nothing |
| `regressions` | **7** | declared, asserts nothing |
| `meteor` | **7** | declared, asserts nothing |
| `ui` | **5** | asserts, and is RED |
| `buildall` | **5** | asserts, and is RED |
| `typegame` | **0** | asserts and passes |
| `poor` | **6** | deleted; not dispatched at all |

**The count is five.** The nine-name list in the brief is the pre-`39cca69`
list, which was wrong when it was written and has been wrong since: `ui`,
`buildall` and `typegame` were repaired, `poor` was deleted, and `meteor` — which
is genuinely non-asserting — was not on it.

### Two of them are red right now, which a "does not assert" label would hide

This is the part worth carrying forward. Calling `ui` and `buildall`
non-asserting would have filed two live failures as "nothing to see".

- **`ui`** — `RESULT *** 1 faults ***`, on
  `A TAP ON THE HERO DOES NOT SELECT HIM`. Its own note is careful about what it
  has ruled out: `selectHero()` works when called directly, `hero.hits()` is true
  at the tapped point, no ring is open and no pad is under him, so **the pointer
  route is broken, not the selection**. Self-documented as reported and not
  fixed.
- **`buildall`** — `RESULT *** only 6 of 7 pads could be built on ***`. Pad 3, at
  world `578,612` / screen `381,318`, reports `ringOnTap=false` while the other
  six report `ringOnTap=true bought=true`.

Both are pre-existing, both are about a tap not routing, and **neither is
diagnosed here.** They are recorded so the next session does not have to
rediscover that they are red.

### And the build menu's ghost is gone entirely

`chapter-2-design.md` said seven scenarios still drive it. Applying
`tests/harness.test.ts`'s own comment-stripping and word-boundary regex to
`tools/harness/index.html`: **`g.menu` 0 real references, `g.panel` 0.** The 19
raw grep hits are comments explaining the removal plus `g.ring.panelBounds`,
which is why the test matches on code only. The test passes.

Corrected in the design doc to say nothing drives the ghost any more, that
eleven were found and not seven, and that a test now fails the build if one
comes back — which is a better argument against rebuilding the pad system than
the stale number was.

## 3. The ability medallions are not broken, and the earlier report was wrong to imply they were

**Cory confirms the medallions and the Nuke button work in play.** The report
above says item 1 "still reproduces on `d9686c8`" and quotes `heroSlot1: DEAD`.
The observation was real; the conclusion drawn from it was not.

### What `abilitybar` is actually measuring

`tapReaches(i)` monkeypatches `g.armAbility` and `g.castHeroSlot` to count calls,
clicks the slot's hit rectangle, and prints `REACHED` if either fired and `DEAD`
if neither did. Both are dispatched late through `this.world.…` in
`HudScene`'s `pointerdown` handler, so the patch is visible and the probe is
sound in principle.

**The probe taps the slots in bar order, and `serverNuke` is the slot
immediately before the two hero slots.** Tapping it calls `armAbility`, which for
the nuke does this (`GameScene.ts:3210`):

```ts
if (id === RULES.serverNuke.abilityId) {
  if (this.status.rareAbility !== id) return
  // Never fired straight off the icon. It is once per run and a misfire
  // is unrecoverable, so the tap opens a confirmation ...
  this.openNukeLaunch()
  return
}
```

`openNukeLaunch()` constructs `NukeLaunchOverlay`, whose first act is
(`src/ui/NukeOverlays.ts:284`):

```ts
this.blocker = scene.add
  .rectangle(W / 2, H / 2, W * 1.5, H * 1.5, 0x000000, LAUNCH.dim)
  .setDepth(LAYER.modalDim)
  .setInteractive()
// Deliberately does nothing. Tapping outside the two controls must not
// launch and must not cancel: a modal that closes on a stray tap is how a
// once-per-run ability gets thrown away.
this.blocker.on('pointerdown', () => {})
```

A full-screen interactive scrim at `dim: 0.72` that swallows `pointerdown` on
purpose. **The probe never closes it** — its cleanup resets
`status.pendingAbility` and `status.mode` and nothing else, and `openNukeLaunch`
early-returns on `this.nukeLaunch?.active`, so it stays up for the rest of the
run. The next two taps land on the scrim, neither `armAbility` nor
`castHeroSlot` is called, and the probe prints `DEAD`.

The four-slot pass has no `serverNuke` slot, so no overlay, and all four slots
read `REACHED`. **That asymmetry was the entire evidence that something breaks
after the drop, and it is an artefact of probe ordering.**

### Proved, not reasoned

- The blocker is in the run's own final scene dump: a `1266 x 585` rectangle at
  `422,195`, which is `W*1.5 x H*1.5` centred on the 844x390 viewport.
- `ui-nuke-up`, the launch dome, is in the same dump. The overlay is still on
  screen when the run ends.
- `rebuilds over 1s after the drop: 0` — and `0` before it. **The theory the
  scenario was written around is dead.** Its header says "Count rebuilds. Every
  frame is the failure mode" and annotates the line "(every frame is the bug)";
  the bar rebuilt every frame once and does not now. The label survived the fix.

`DEAD` means "a modal this probe opened is covering the bar." It does not mean
the button is dead.

This is CLAUDE.md's own warning, in the exact form it names: *"a modal left open
makes every later check pass"* — same mechanism, opposite sign, and it fooled two
consecutive sessions including the one that wrote the report above.

### `abilitybar` is a sixth non-asserting scenario, and it is undeclared

The block contains **zero** `expect(` calls, zero `fail(`, no `faults` counter,
no `*** ` line and no `RESULT` line. It only `note()`s. It is on neither
`ASSERTS_NOTHING` nor `USES_EXPECT`, so `server.py` has nothing to gate on and it
**exits 0 whatever it observes** — which is precisely the hole those two lists
exist to close.

So it should be declared, and the honest answer to "does it belong on the list"
is **yes as it stands, and no if it is repaired instead.** Repairing it is the
better outcome and is a small job: dismiss the launch overlay inside
`tapReaches`'s cleanup, or probe the hero slots before the rare slot, then give
it `expect()` calls. **Not done here — the brief said report the cause and do not
fix it**, and it is a change to a harness scenario rather than to documentation.

## 4. CLAUDE.md, reconciled

It auto-loads into every session, so a wrong line in it costs more than a wrong
line in `context.md`. Four corrections, same method.

**The "Current phase" section was the worst text in the repository.** It read:

> **Phase 1 — prove the loop is fun.** Placeholder art from Kenney's free CC0
> tower defense pack. One map, one path, Cory only. No Banner tree, no boons, no
> Holdings, no siege enemies until Phase 1 is playable and confirmed fun.

Against `DESIGN.md`'s own four phases and the repository:

| | brief | repo |
|---|---|---|
| heroes | Cory only | **5**, all with Last Stand |
| maps | one map, one path | **8 maps**; levels 3-8 are multi-lane, level 5 has three |
| art | Kenney placeholder | Kenney is **3 projectile tiles and the title scenery**; `art.json` and `ATTRIBUTIONS.md` both say everything else is original |
| towers / abilities | 6 / 4 (Phase 1) | **7 / 7** — short of Phase 2's 16 / 12 |
| enemies | 4 types | **45** |
| save/load | Phase 2 | present, `src/systems/Save.ts` |
| Banner tree, Boons | Phase 2 | **not built.** `grep` finds no `boon` or `Holdings` in `src/` or `src/data/` at all; Banner points were deliberately removed from story mode, which pays in cakes |
| classes | Phase 4 | not started |

Rewritten to say Phase 1 is finished, Phase 2 is mostly done but short on
breadth, Phase 3 largely happened out of order, Phase 4 has not started — and,
more usefully, that **the phase gate is no longer the thing to check before
building.** What governs scope now is hard rule 5 and the ten-level story scope.
It also points at levels 9 and 10 as the live edge and at `context.md` for
working state.

**Hard rule 2 named a file that does not exist.** It said
`/reference/prototype.html`. There is no such path. The single-file prototype is
`/reference/courjahan-defense.html`, 959 KB, and it is the only HTML file in
`reference/`. The rule is right; only the filename was wrong. Corrected.

**The Stack section said "auto-deploy on push to `main`".** True when written and
not now — the same `changes`-job gate described earlier in this report. Corrected,
with the practical consequence spelled out where a session will actually hit it:
a skipped `deploy` on a docs commit is correct, read the job list.

**Hard rule 7's worked example had drifted.** It says Cory renders at 75.8 world
px and occupies 539 physical pixels at maxZoom 2.37 on a dpr-3 phone. His
`displayHeight` in `art.json` is **78.0**, which makes it 555, and the old-rule
figure 156 rather than 152. The rule and its formula are unaffected — 2.37 x 3 is
still about 7x, `display.json` still says `maxZoom: 2.37`, `Resolution.ts` still
caps at 3 — but the illustration was quoting a number the data no longer carries,
which is exactly what the rule's own last paragraph warns about. Corrected, with
a parenthesis recording the change so the next reader knows the numbers moved.

**Flagged, not changed: "67 of 109 textures are non-power-of-two."** `art.json`
declares **186 image paths** today, so the denominator is stale by a wide margin.
The numerator cannot be re-derived without decoding every image, and
`measure_art.py` does not report it. The conclusion — most textures are NPOT,
there are no mipmaps, so heavy minification has nothing to soften it — is not in
doubt. The line now says the ratio wants re-deriving before it is quoted again.

**Checked and correct, left alone:** the two-camera rule; the flat-grid rule; the
`screens` walk (`run.sh screens` really does report `1-TITLE`, `2-WORLDMAP`,
`3-LOADOUT`, `4-CUTSCENE`, `5-GAME`); the typechecking section; all three
standing facts, including the Phaser grep, which still returns **0 hits** in
`tests/`; the Heroes section; and the Merging section.

---

## Where this leaves the repository, revised

**Open items in `context.md`, now three.** The medallion item is gone. Renumbered
again — which is itself a warning: **do not cite these by number from another
document.** The renumbering note at the head of the list now says so.

1. Twenty canvas-vs-ink content boxes.
2. Cake tiers probably too generous, and the soak that would settle it does not
   exist.
3. The verdict line and the 2-cake tier disagree at exactly half.

**New, and not on that list because they are harness rather than product:**

- `ui` is red on a hero tap that does not route. Pre-existing, undiagnosed.
- `buildall` is red on pad 3 of level 1. Pre-existing, undiagnosed.
- `abilitybar` asserts nothing and is undeclared. Repair it or declare it; until
  then its output is not evidence in either direction.
- `screens` at 844x390 exits 5 on one SMALL fault, the Title version stamp, which
  the scenario itself annotates as a hidden dev door and not a tap target. Known
  and benign, recorded so it is not read as a regression.

**Still true from the first pass:** `claude/level-9-geometry-uac8ax` is 15 ahead
and unmerged, and it is the reason to check before any level 9/10 asset sweep.

**The methodological point, twice over.** The first pass caught a report that
carried an open-items list forward without re-reading the code. This pass caught
the first pass doing a subtler version of the same thing: it *did* run the
harness, and it believed the output without asking what the probe was doing. A
measurement is not evidence until you know what it measures — and CLAUDE.md
already said so, in the section about not trusting a first red result. Both
failures were on the same page of the same file.
