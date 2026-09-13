# Fourteen tower assets restored, the skins branch merged, and the trap that ate them

**All fourteen are back under `public/assets/towers/` and byte-identical to
`bda5eaf`.** Verified by blob hash, one by one, not by filename or size.

**The merge did NOT try to re-delete them, because the restore landed first.**
That order is the whole fix. Reproduced the other order too: merging the branch
onto `a27d571` directly leaves `public/assets/towers/*machine*` empty while
`art.json` names all fourteen, and git reports no conflict on a single asset.

**`eda11dc` removed nothing else. The fourteen tower files ARE the whole
3.75 MB.** The brief expected more; there is no more. It was also a MOVE rather
than a delete — fourteen `R100` renames into `art-source/` — so the recovery
was a `git mv` back and nothing was ever at risk.

**Levels 1 through 8 are unaffected, checked three ways including a rendered
frame.** No registered level wears a machine skin, and none can: the skin's
`levels` list is empty.

**One judgement call, flagged for reversal: the deploy cap went from 40 MB to
41.** Restoring the art puts the deploy at 40.02 MB. See **5**, which also
gives the smaller fix that would let it go back to 40.

## Commits

| commit | what | CI |
|---|---|---|
| `c2d0f86` | the fourteen files moved back from `art-source/` to `public/assets/towers/` | run 314 — **green** (`test`, `typecheck`, `changes`); `deploy` skipped, branch not `main` |
| `7ce9868` | merge of `claude/machine-tower-skins-6looer`, two conflicts resolved | run 314 — same run |
| `4458584` | deploy cap 40 → 41, with the reasoning in the test | run 314 — same run |
| `8d50981` | the sweep rule in `CLAUDE.md`, and the `towertiers` pad fix | run 314 — same run |
| `<this line>` | this report | markdown only; the table stops here, as every commit touching a file the checks read is already listed |

## 1. What happened, corrected

The brief's account is right about the shape and wrong about two details, both
of which make the situation better than described.

**It was a move, not a delete.** `eda11dc` ran `git mv` into `art-source/`,
which is where this repository already keeps art that has not shipped. Git
recorded all fourteen as `R100` — 100% similarity — so no re-encode ever
touched them and "restore byte-identically" was a rename back rather than an
extraction from history.

**Nothing else went with them.** `git show --name-status --no-renames eda11dc`
lists exactly fourteen deletions under `public/` and fourteen additions under
`art-source/`, plus one edit to `reports/2026-09-13-level-7.md`. The fourteen
tower WebPs are the entire 3.75 MB.

And `eda11dc` was not careless. Its commit message states the reasoning, does
the arithmetic, and names the way back:

> One `git mv` puts them back the day levels 9 and 10 have rows and manifest
> entries, at which point they stop being orphans — and the cap then goes up as
> a decision rather than as a side effect.

It had every piece of evidence on its side. The half it could not see was on an
unmerged branch.

## 2. The trap, reproduced before it was fixed

Merging `claude/machine-tower-skins-6looer` onto `a27d571` in a scratch
worktree:

```
$ git merge --no-ff origin/claude/machine-tower-skins-6looer
CONFLICT (content): Merge conflict in src/data/art.json
CONFLICT (content): Merge conflict in tests/levelart.test.ts

$ ls public/assets/towers/ | grep -c machine
0
$ grep -c machine src/data/art.json
47
$ ls -la src/systems/TowerSkins.ts
-rw-r--r-- 1 root root 7646 ... src/systems/TowerSkins.ts
```

The two conflicts are in unrelated code. **Not one of the fourteen assets
conflicted.** The merge base is `bda5eaf`, where the files sat under
`public/assets/towers/`; `main` moved them, the branch never touched them, and
git resolves "changed on one side, untouched on the other" in favour of the
change. Silently, and correctly by its own rules.

### tests/assets.test.ts does catch it

The brief asked for confirmation, and said a failure to catch would be a second
finding. **There is no second finding — the net holds.** On the skins branch
tip with the fourteen files deleted:

```
not ok 1 - every asset the manifest names is in the built output
    + 'turret-ledger-machine -> assets/towers/tower_withholding_t1_machine.webp'
    + 'turret-ledger-t2-machine -> ...'
    ... all 14 named
```

With the files present, the same file is 5 passing tests. The test earns its
"deliberately blunt and has NO exemption list" comment.

## 3. The restore

`git mv` back, then every file checked against its blob at `bda5eaf`:

```
OK   soldier_dummy_1_machine.webp       ebcfc8193781
OK   soldier_dummy_2_machine.webp       00944a586ce6
OK   soldier_dummy_3_machine.webp       cbfa9c129aec
OK   tower_dummy_1_machine.webp         68ae7860fec7
OK   tower_dummy_2_machine.webp         ecc6cd0c42af
OK   tower_dummy_3_machine.webp         85396a9114cf
OK   tower_escalation_machine.webp      13e26b786a28
OK   tower_filing_machine.webp          4e6fba446484
OK   tower_rounding_machine.webp        d0a0830be404
OK   tower_tax_machine.webp             fca60e7d6dd8
OK   tower_withholding_t1_machine.webp  7c018a88d95c
OK   tower_withholding_t2_machine.webp  a925ad597be1
OK   tower_withholding_t3_machine.webp  3712b47065ce
OK   tower_writeoff_machine.webp        22f6ea6bbd52
--- identical: 14   differing: 0 ---
```

Reproduce with `git rev-parse bda5eaf:<path>` against `git hash-object <path>`.

`art-source/` has no `*machine*` left — they moved, they did not copy, so the
3.75 MB is not in the repository twice.

## 4. The merge

`git merge --no-ff`, one merge commit, no rebase, no squash, no force. Parents
are `c2d0f86` and `1e434ca`.

**Nothing had to be restored a second time.** All fourteen files survive,
because the restore put both sides of the merge back in agreement about where
they live.

Two content conflicts, both resolved by keeping both sides:

**`src/data/art.json`** — `main`'s nine road enemies and the branch's fourteen
machine keys append at the same point in `files`, and again in `render`. Kept
both. Every original key is untouched and **no original is replaced**: the file
now has 14 machine keys alongside 14 original tower keys, with 14 matching
`render` entries each side.

**`tests/levelart.test.ts`** — a real semantic conflict rather than a textual
one, and the interesting one. The branch expected `map-level7`, `map-level8`
and level 8's whole cast to be orphaned level art. **`main` has since given
levels 7 and 8 rows**, so those keys now have a level that loads them and are
not orphans. The merged expectation is `main`'s empty list plus the fourteen
machine keys, which stay orphaned because the skin is parked. Taking either
side wholesale would have been wrong: the branch's list would have failed, and
`main`'s empty list would have silently stopped asserting that the skin art is
unreferenced.

### Confirmed by looking, not by exit code

```
$ ls public/assets/towers/*machine* | wc -l
14
$ ls -la src/systems/TowerSkins.ts
-rw-r--r-- 1 root root 7646 ... src/systems/TowerSkins.ts
$ python3 -c "...art.json..."
machine file keys: 14      machine render keys: 14
enemy file keys: 43        towerSkins.machine.levels: []
```

## 5. The deploy cap, and the one decision taken here

Restoring 3.75 MB puts `public/assets` at **40.02 MB** against
`content.test.ts`'s `assert.ok(total < 40)`. This is the exact number `eda11dc`
recorded, and the only test that failed after the merge — 1079 of 1080 passed.

**The cap is now 41,** in its own commit so it reads as a decision. 41 rather
than 42 keeps 0.98 MB of headroom, which is the tightness the cap had before
(38.94 against 40).

The comment added to the test records what the cap cannot currently
distinguish. There are three kinds of asset, not two:

| | downloaded | cost |
|---|---|---|
| **BOOT** | before the player sees anything | the wait the cap is named after |
| **LEVEL** | when a level asks for it | paid by whoever opens that level |
| **ORPHAN** | never, by anybody | pure waste — what `eda11dc` found |

The fourteen are **LEVEL** art, and `levelart.test.ts` and `towerskins.test.ts`
assert exactly that: `LevelArt.ts` classifies every skinned key as level art so
boot loads none of them, and no level wears the skin so no level loads them
either. They are on no player's download path today. They are still counted,
because an asset nobody downloads is cheap rather than free, and the day level 9
gets a row it becomes a real download.

### The honest fix is smaller than the raise, and was NOT taken

All fourteen are **pixel-for-pixel the same dimensions** as the originals they
repaint, and between **1.8x and 3.6x the bytes**:

| file | original | machine | ratio |
|---|---|---|---|
| `tower_dummy_1` | 157 KB | 569 KB | **x3.6** |
| `tower_dummy_2` | 175 KB | 577 KB | **x3.3** |
| `tower_dummy_3` | 186 KB | 575 KB | **x3.1** |
| `tower_filing` | 70 KB | 202 KB | **x2.9** |
| `tower_tax` | 71 KB | 198 KB | **x2.8** |
| `soldier_dummy_3` | 79 KB | 217 KB | **x2.7** |
| `soldier_dummy_1` | 84 KB | 224 KB | **x2.7** |
| `soldier_dummy_2` | 92 KB | 238 KB | **x2.6** |
| `tower_writeoff` | 102 KB | 264 KB | **x2.6** |
| `tower_withholding_t3` | 71 KB | 157 KB | **x2.2** |
| `tower_rounding` | 58 KB | 124 KB | **x2.1** |
| `tower_withholding_t1` | 41 KB | 84 KB | **x2.0** |
| `tower_escalation` | 122 KB | 239 KB | **x2.0** |
| `tower_withholding_t2` | 49 KB | 87 KB | **x1.8** |
| **total (14)** | **1.36 MB** | **3.75 MB** | **x2.8** |

Dimensions verified pair by pair from the WebP headers — `tower_dummy_1` is
647x900 in both, `tower_withholding_t2` is 215x371 in both, and so on for all
fourteen.

Same dimensions, 2-3.6x the bytes, means **the 3.75 MB is an encoder setting,
not content.** The originals carry the same fourteen silhouettes in 1.36 MB.
Re-encoding the repaints at that quality would land near 1.3 MB and put the
deploy back under 38 with the cap left at 40.

That changes how the art looks, so it is left for a human rather than taken
quietly by the session that needed the number to move. **If you would rather
have the 40 MB cap back, this is the lever.**

## 6. Levels 1 through 8 are unaffected

Checked three ways, weakest to strongest.

**Structurally.** `art.json`'s `towerSkins.machine.levels` is `[]`. A skin
applies only to level ids in that list, and `skinnedSprite` is the identity
function for everything else.

**Exhaustively, per level and per key.** Every registered level against every
skinnable key:

```
level1   Courjahan Village        skin=null   0/14 repainted   ORIGINAL ART
level2   Head Office              skin=null   0/14 repainted   ORIGINAL ART
level3   Sports Complex at Dusk   skin=null   0/14 repainted   ORIGINAL ART
level4   The Conundrum            skin=null   0/14 repainted   ORIGINAL ART
level5   The Crossroads           skin=null   0/14 repainted   ORIGINAL ART
level6   Two Roads                skin=null   0/14 repainted   ORIGINAL ART
level7   The Highway              skin=null   0/14 repainted   ORIGINAL ART
level8   The Optimization         skin=null   0/14 repainted   ORIGINAL ART
```

`tests/towerskins.test.ts:156` already asserts this and now runs over all eight
rows. Levels 9 and 10 are checked too, at `towerskins.test.ts:172`: an
unregistered id must NOT turn the skin on, because `levelArtKeys` resolves an
unknown id to the default level and the board would draw a texture nothing
fetched.

**From a rendered frame.** `sh tools/harness/run.sh towertiers 200 844x390`:

```
tier 1   turret-ledger      213x300 source   61.8x87.1 world   base y=324
tier 2   turret-ledger-t2   215x371 source   62.4x107.7 world  base y=324  drift 0px
tier 3   turret-ledger-t3   239x472 source   69.4x137.0 world  base y=324  drift 0px
Grinder  turret-writeoff -> turret-writeoff (unchanged=true)
```

Every texture is an original key. **The skins branch's 0 px base drift claim
reproduces** — at both upgrades, though see **7** for what it took to run it.

`buildall` is corroborating evidence from a second angle: six towers built
across six pads, and all six report texture key `turret-ledger`, not
`turret-ledger-machine`.

### Layout, at the three required viewports

`sh tools/harness/run.sh screens 140 <vp>`:

| viewport | faults | game screen |
|---|---|---|
| 1280x720 desktop | **none** | 39 drawn, 8 live, 0 faults |
| 844x390 | 1 | 39 drawn, 8 live, 0 faults |
| 667x375 | 1 | 39 drawn, 8 live, 0 faults |
| 844x390, `INSETS=0,47,21,47` | 1 | 39 drawn, 8 live, 0 faults |

The one fault is the same one every time and is not a layout problem:

```
SMALL Title [title:version-stamp (hidden dev door, not a tap target)] Rectangle 83x29
```

The harness's own annotation says it is a deliberate non-target. It is on the
Title screen, absent at desktop size, and **the game screen is clean at every
viewport**. No `OFF`, no `NOTCH`, no `OVER` anywhere.

The level 1 frame was read as a picture as well as a number and draws
correctly — plate, path, HUD, Bailey, ability row.

Portrait is gated by the rotate overlay, which is the correct answer rather
than a skipped check.

`sh tools/tsdiff.sh a27d571`: **212 baseline, 212 working tree, zero
introduced.**

## 7. Second finding: `towertiers` has been throwing, not measuring

The brief asked for the `towertiers` scenario to be re-run. It could not be,
and the reason predates all of this.

The scenario built on **pad 3**, and pad 3 is the one pad of level 1's seven
whose build ring will not open. `buildall` says so directly:

```
build@3: the ring did not open
total 6 of 7 pads built
RESULT *** only 6 of 7 pads could be built on ***
```

`build()` returned `false`, `g.towers[0]` was `undefined`, and the next line
threw a `TypeError` before one measurement was taken.

**It fails identically on `a27d571`**, so this is not the merge and not the
skins branch. It went unnoticed because a throwing scenario reads as a harness
crash rather than as a product fault — which is the exact failure mode
`CLAUDE.md` warns about under "Do not trust a first red result", and which
`build()`'s own comment records having happened once before with `g.menu`.

So **the skins branch's report rests on a run that cannot be reproduced as
written.** Its numbers appear to be correct — they reproduce exactly once the
scenario can run — but the scenario in the repository could not have produced
them on any commit reachable today.

Fixed here by moving to pad 2 and guarding both the build and the tower, so a
future dead pad reports `nothing measured` rather than a stack trace. **Pad 3
itself is not fixed** — that is its own pass, and it is a real product question:
one of seven build pads on the first level of the game does not open its ring.

### Two harness claims in the brief that did not reproduce

Both were checked rather than assumed.

**"Every GL=1 screenshot is black for want of `preserveDrawingBuffer`."**
`GL=1 sh tools/harness/run.sh title 100 844x390` produced a fully rendered
title screen — castles, sky, all three buttons, the version stamp. Not black.
Checked on one scenario, not all, so this is "not reproducible on `title`"
rather than "never happens".

**A stale-harness trap worth knowing about.** `server.py` serves from
`tools/harness/stage/`, not from the source tree, so **editing
`tools/harness/index.html` and re-running changes nothing until
`sh tools/harness/build.sh` restages it.** This cost a round here: the first
run after the `towertiers` fix reported a `TypeError` at the old line number.
`run.sh` already deletes the Chromium profile every run to defeat the HTTP
cache — this is a second, separate staleness path and it is not commented.

A third, unrelated: two harness runs at once collide on port 8899 and the
second dies with `Address already in use`, which — filtered through a `grep` —
looks exactly like a scenario that ran and found nothing.

## 8. What else `eda11dc` removed, and what other branches need

**Nothing else.** Answered definitively in **1**.

The more useful version of the question — does any open branch reference an
asset that would be missing after merging — was checked across **all 26 open
branches**, comparing each branch's `art.json` and `audio.json` against the
union of its own `public/` tree and this branch's:

| branch | dangling after merge |
|---|---|
| 25 of 26 | **none** |
| `claude/deployment-status-review-a661d6` | 2 — `abilities/ability_eli_1.png`, `abilities/ability_bailey_1.png` |

And those two are **not** sweep casualties:

```
$ git log --all --diff-filter=A -- public/assets/abilities/ability_eli_1.png
(no output — never added, on any branch, ever)
```

They are the historical 404 bug that `assets.test.ts`'s own header documents,
on a branch 103 commits behind `main`. Nothing to do with `eda11dc`, and
nothing to restore — there is no version of those files to restore from.

A first pass that compared branches against **`main` only** flagged eleven
branches and looked alarming. It was measuring the wrong thing: those are stale
branches naming PNG-era paths from before the WebP conversion, and a merge
brings `main`'s current tree with it. The union comparison is the right
question and gives the table above.

## 9. The rule, recorded

In `CLAUDE.md` under **Standing facts**, as
"An unreferenced-asset sweep is only safe once every branch that needs those
assets has landed". It carries the rule the brief asked for, plus the part that
is not obvious and is the reason this cost a session:

> **And the merge would NOT have put them back.** The branch forked from the
> commit where the files were still under `public/`, and never touched those
> paths again; git sees one side that moved them and one side that did nothing,
> resolves in favour of the move, and reports no conflict.

And the recovery order, which is the actual fix: **restore the files in their
own commit BEFORE merging the branch that needs them.**

## Where this leaves the repository

**Ready to merge, nothing in flight.** Branch
`claude/restore-tower-assets-merge-my7ll3`, four commits, fast-forwardable onto
`main` at `a27d571`. 1080 of 1080 tests pass. This session cannot push to
`main`; the command is in the covering message.

**Waiting on a decision — the deploy cap.** It is at 41 MB. Re-encoding the
fourteen at the originals' quality would take the deploy from 40.02 MB to
around 37.6 MB and let the cap go back to 40. Same dimensions, 1.8-3.6x the
bytes; see **5**. This is an art decision and is deliberately not taken here.

**Open, and a real product bug — pad 3 on level 1 does not open its build
ring.** Six of seven pads work. Found while fixing `towertiers`; not
investigated. Worth a pass of its own, because it is on the first board of the
game.

**Open — the skin is parked and should stay parked.** `towerSkins.machine
.levels` is `[]`. Turning it on is adding `level9` to that list **on the day
level 9 gets a row in `levels.json`**, and not before: an unregistered id makes
`levelArtKeys` fall back to the default level, so the board would draw a
texture nothing loaded. `towerskins.test.ts:172` asserts this.

**Open — nine harness scenarios still do not assert**: `ui`, `muzzle`,
`buildall`, `rockets`, `retreat`, `regressions`, `poor`, `typegame`, `meteor`.
Untouched here; `towertiers` was fixed only because this brief depended on its
output. `buildall` does report a `RESULT` line, so it is closer than the others.

**Open — the `stage/` staleness path is uncommented.** See **7**. A note in
`build.sh` or `run.sh` would save the next session the round it cost this one.

**Carried forward from `reports/2026-09-13-level-7.md`:** levels 9 and 10 still
have no rows in `levels.json`, and the 36 level 9/10 PNGs plus these fourteen
WebPs remain art without a level.
