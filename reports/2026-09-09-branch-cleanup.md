# Branch cleanup: two merged, one salvaged, one that would not delete

**`main` went `8385d8e` → `dc86e0f`, 20 commits, and deployed green.** Two of
the three branches merged. The third — the two-step Mind Laser activation —
**conflicts and was not merged**, per the brief's own instruction to stop rather
than resolve by guess. The Phaser 4 spike was salvaged onto `main` but **could
not be deleted**: GitHub answers 403 to a ref deletion from this session, twice,
deterministically. One command is left for Cory at the bottom.

The merges also produced a semantic conflict that git resolved cleanly in text
and the test suite caught: `fx-glacier` was still loading at boot. One line.

| commit | what | CI |
|---|---|---|
| `053ece8` | Merge the Mind Laser onBoard gate and the Glacier rework | covered by run 244 |
| `d8c9aac` | Merge the world-map TileSprite fix and the level-only art split | covered by run 244 |
| `648ce68` | `ctxsurvive`, cherry-picked from the spike (`5bc8b39`) | covered by run 244 |
| `fefcbed` | The GL=1 black-screenshot trap, and the two standing facts | covered by run 244 |
| `0a30eb6` | List `fx-glacier` as level art, which the merge left out | covered by run 244 |
| `03b9c38` | GL=1 does not boot; `ctxsurvive`'s loop check is one frame wide | **green** — `test`, `typecheck`, `deploy / build`, `deploy / deploy` all success ([run 244](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34296457539)) |
| `2b2b8a3` `7ad85ba` | The Phaser 4 spike report, salvaged so it outlives its branch | covered by run 245 |
| `dc86e0f` | Head that report with the branch's fate and what was salvaged | **green** — all four jobs success ([run 245](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34296515541)) |

CI runs per push, not per commit: run 244 covers the first six commits, run 245
the last three. This file is the usual tail of the regress — a commit cannot
record its own result — and its run is reported in the reply that carried it.

---

## 1. Merged: `claude/mind-laser-glacier-fixes-ne2f14` → `053ece8`

Verified before acting, exactly as the brief asked: **4 ahead, 18 behind**,
`git merge-base --is-ancestor origin/main origin/<branch>` false in both
directions, so diverged and a merge commit rather than a fast-forward. The
read-only `git merge-tree --write-tree` came back with a bare tree OID and no
conflict block, so the content was clean before anything was written.

Merged first, as instructed, because branch 2 overlaps it.

Brings the Mind Laser `onBoard` gate and the Glacier rework: the `fx_glacier`
sheet, the anchor at the painted ground disc, and the slow-stacking fix.

## 2. NOT merged: `claude/mind-laser-activation-b7lzrh` — conflicts

Ancestry re-checked **after** merge 1 landed, as instructed. Against the new
`main` it is 5 ahead and 11 behind (it was 5/6 against `8385d8e`; merge 1 moved
the base). Still diverged.

`git merge-tree` against the new `main` reports **two conflicts**:

```
CONFLICT (content): Merge conflict in src/scenes/GameScene.ts
CONFLICT (content): Merge conflict in tools/harness/index.html
```

One region each. **Both are competing intent, not textual noise**, which is why
this stops here rather than picking a side:

- **`GameScene.ts`** — merge 1 added a status line,
  `` `${a.name}: drag onto the board to fire.` ``, because "drag to aim" did not
  say that the board is what starts the beam. Branch 2 **deletes that line on
  purpose**: its commit is *"Say nothing when the beam is armed, and let the
  picture say it."* Two sessions reached opposite conclusions about whether the
  armed beam should speak. That is a design call.
- **`tools/harness/index.html`** — merge 1 added steps 6b and 6c asserting the
  new gate (a tap on the medallion spends nothing; a beam that reached the board
  spends only its board time). Branch 2 replaces that whole region with its own
  `--- 5, 6 and 7: the Mind Laser ---` block. Resolving means deciding which
  test of the same gesture survives.

The branch is a substantial rework of the same held-ability code — it adds
`pressFiredBeam`, routes `claims` through `armedHold` so the aiming drag cannot
also pan the map, and gives the press that lit a beam ownership of its own
release. It is not a stale branch and it should not be discarded; it needs
someone to decide the two questions above. **Left untouched at `eea1e5a`.**

## 3. Merged: `claude/memory-tilesprite-level-art-6460up` → `d8c9aac`

**No longer a fast-forward by the time it was reached**, exactly as the brief
predicted: 7 ahead and 0 behind against `8385d8e`, but 7 ahead and 5 behind once
merge 1 had moved `main`. `merge-tree` clean, so a merge commit.

### The report was read first, and it contains both required things

**The four-point texture table — before and after.** From
`reports/2026-09-08-the-memory-numbers.md`, `run.sh texmem` at 1400x820, cost
model `width x height x 4` on the measured backing canvas:

| point | before the plate fix | this pass's baseline | after this pass |
|---|---|---|---|
| 1. after boot, title live | 304.3 MB, 184 tex | 169.8 MB, 179 tex | **79.0 MB, 109 tex** |
| 2. on the world map | 365.5 MB, 223 tex | 231.0 MB, 218 tex | **87.2 MB, 148 tex** |
| 3. during a level | 308.1 MB, 188 tex | 205.3 MB, 184 tex | **155.6 MB, 160 tex** |
| 4. back on the world map after a finished level | 365.6 MB, 224 tex | 231.0 MB, 218 tex | **87.2 MB, 148 tex** |

The TileSprite alone: 6870x2160 and **56.6 MB** → 1282x752 and **3.7 MB**. The
peak moves off the world map and onto level 3 at 170.4 MB.

**Whether the world map is visually unchanged at the three sizes — yes, within
the harness's own noise, and the report is honest that it is not bit-identical.**
It diffs 667x375, 844x390 and 1400x820 (the landscape orientations of 375x667
and 390x844, which is what the game runs in — portrait is gated by the rotate
overlay):

| viewport | pixels differing | max channel difference | two control runs differ by |
|---|---|---|---|
| 667x375 | 50.4% | **6** of 255 | max 6 |
| 844x390 | 50.9% | **7** of 255 | max 6 |
| 1400x820 | 50.8% | **6** of 255 (27 on one run) | max 15 |

Every other screen is **bit-identical**, 0 pixels different at every size. The
world map's remainder is explained rather than waved at: `roundPixels: true`
rounds a sprite's draw position to a whole device pixel and the sprite now sits
somewhere else, so the ground is sampled up to half a pixel across. The
pattern's phase is preserved via `tilePosition`, and the signed mean difference
is 0.003 of 255 per channel — no tint shift in either direction. An exact match
is unreachable because it would need `left * zoom` to land on the same
fractional part, and `zoom` differs per device.

So: **the report contains both, and the merge went ahead.**

## 4. The merge defect the tests caught: `fx-glacier` — `0a30eb6`

Merging 1 and 3 together produced a conflict git could not see. The two sides
never touched the same line, so the text merged clean and the meaning did not:

- Branch 1 added `fx-glacier` to the manifest while every `fx` sheet still
  loaded at boot.
- Branch 3 then made **every `fx-` key level art** and added
  `tests/levelart.test.ts` to hold that rule.

Result: the one sheet that predates the rule was still loading at boot.

```
not ok 561 - every effect named in the manifest fx section is level art
  a shared effect is loaded at boot
  + [ 'fx-glacier' ]
```

Fixed by adding `fx-glacier` to `levelArt.shared` in `art.json` — one line, in
the list that decides it. `registerEffectAnims` already walks every manifest key
with a sheet rather than a list, so the animation is cut when the level loads
the texture and `forgetEffectAnims` drops it with the rest. Confirmed live by
`run.sh levelart`: **8** animated sheets now (was 7), **76** level-art keys (was
75), 0 resident after boot, 0 still resident back on the world map.

**This is the one thing in this pass that was not on the brief.** It is not a
new feature and not scope creep — it is a defect created by the merges the brief
ordered, and the repo rule is that the game stays playable at every commit.

### It costs about 8 MB per level, and the brief's table should be read with that

`fx_glacier` is a 512x512 sheet of 8 frames = 8.4 MB decompressed, and it is
shared level art, so it lands on **every** level. Measured by `run.sh levelart`
after the merge, against the same figures in branch 3's report:

| level | branch 3's report | on `main` after both merges | delta |
|---|---|---|---|
| level 1 | 151.6 MB | **159.6 MB** | +8.0 |
| level 2 | 155.1 MB | **163.1 MB** | +8.0 |
| **level 3** | **170.4 MB** | **178.4 MB** | +8.0 |
| level 4 | 160.2 MB | **168.2 MB** | +8.0 |
| level 5 | 132.9 MB | **140.9 MB** | +8.0 |

The peak of a session is now **level 3 at 178.4 MB**, not 170.4. Still far below
the 231.0 MB the world map used to cost, and boot is untouched at 79.0 MB —
`fx-glacier` is level art, so it never reaches the title screen. Recorded
because branch 3's numbers are quoted everywhere and they are now 8 MB stale.

## 5. Salvaged, then the branch would not delete

`claude/phaser-4-migration-spike-hage91` verified at **5 ahead, 0 behind** —
clean fast-forward, and correctly not merged. Its footprint was checked against
`main` and **`main` never had any of it**: no `vendor/phaser4.min.js`, no
`build.sh` default change, no `package.json` bump. `git grep -i phaser4` on
`main` returns nothing. There was nothing to remove; deleting the branch is the
whole of removing the footprint.

**(a) The `ctxsurvive` scenario — `648ce68`.** Cherry-picked `5bc8b39` with
`-x`. That commit touches **only** `tools/harness/index.html`, 159 insertions
and no deletions, so no Phaser 4 came with it. Run on `main` under `GL=1`:

```
phaser 3.90.0  renderer=webgl
before loss:   frame=91 ink=96.3% contextLost=false
during loss:   frame=93 ink=-1%   renderer.contextLost=true  gl.isContextLost=true
after restore: frame=97->98 ink=96.4% renderer.contextLost=false
run still live: true  hero=Cory wave=0 lives=20
RESULT SURVIVED a real WEBGL_lose_context: loop still stepping, canvas still drawing, run intact
```

**(b) The GL=1 black-screenshot finding — `fefcbed`,** written into
`tools/harness/README.md` under its own heading, which is where a session
running the harness will meet it. There is no `preserveDrawingBuffer`, so
`canvas.toDataURL()` reads an already-presented buffer and every `GL=1`
screenshot this harness has ever taken is black — and the number lies in the
worst way, reading the same 81702 bytes before a loss, after it, and on two
different renderers. The fix is recorded with it: go through
`renderer.snapshot`, and **disarm a pending snapshot on timeout**, because one
requested while the context is lost is never taken and fires on restore at the
frame it was made, freezing the loop in a way that reads exactly like an engine
that did not survive.

**(c) The report itself — `2b2b8a3`, `7ad85ba`, `dc86e0f`. Beyond the brief's
"two things", deliberately.** `reports/2026-09-08-phaser-4-spike.md` existed
only on the branch, and deleting the branch would have destroyed the only record
of why an engine migration was rejected — the exact failure the repo's Reports
rule exists to prevent, and the brief itself cites that file as its authority.
Both commits touch **only** the markdown; the Phaser 4 code lives in `d30e218`
and `d439f2b`, which were not taken. The report now carries a header naming the
deleted head SHA, the restore command, and what did and did not reach `main`.

### Two more GL=1 findings, from confirming the salvage — `03b9c38`

Neither is a regression from these merges, and both are recorded next to the
finding above because they are the same shape: a `GL=1` run is not measuring
what it looks like it is measuring.

- **The game does not finish booting under `GL=1`.** `realboot` reports
  `splash -> title: false / THE GAME DID NOT BOOT` on SwiftShader, so every
  `GL=1` scenario forces its scenes by hand and proves nothing about boot.
  **Controlled against a worktree at `8385d8e`, which fails identically** —
  pre-existing. The same run under the default Canvas2D passes with
  `Title=built Loadout=built Game=built Hud=built`.
- **`ctxsurvive`'s loop-step check is one frame wide.** Two consecutive runs
  gave `97 -> 97` (reported *did NOT survive*) and `97 -> 98` (*SURVIVED*), with
  identical healthy ink and renderer readings. The first red was the sampling
  window, not the engine. This is the CLAUDE.md rule about first red results
  earning its keep for the fourth time.

### The deletion failed, and this is the one thing left to do

```
$ git push origin --delete claude/phaser-4-migration-spike-hage91
error: RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
fatal: the remote end hung up unexpectedly
```

Tried twice, both syntaxes (`--delete` and `:refs/heads/...`), same result. **It
is not the egress proxy** — `curl "$HTTPS_PROXY/__agentproxy/status"` shows zero
github.com relay failures, and pushes of new commits to `main` from the same
session succeeded four times. GitHub is refusing the ref deletion for this
session's credentials specifically. Per the environment's own guidance a 403 is
reported, not routed around.

Everything else about the branch is done: both salvage items and the report are
on `main`, and `main` is verified free of Phaser 4.

## 6. Standing facts recorded — `fefcbed`

Both are now a **Standing facts** section in `CLAUDE.md`, placed after
*Typechecking* and before *Reports*, worded so a future session can re-verify
rather than take them on trust.

**(a) The test suite cannot see Phaser.** *The brief's wording for this one is
not quite right and the file says the accurate version.* The brief says the only
mention of `phaser` in `tests/` is `diagnostics.test.ts`. In fact **25 test files
mention Phaser** — which is exactly why the gap looks smaller than it is. What
is true, and what matters, is the substantive claim:

```bash
grep -rnE "^\s*import .*from 'phaser'|require\('phaser'\)" tests/   # no hits
```

**No test imports the engine.** Every one of those 25 mentions is either a
comment or an assertion that reads a source file *as text* and regex-matches it
— `screenspace.test.ts` checks `worldToScreen` still takes a `Phaser.Scene`,
`camera.test.ts` checks the config string says `Phaser.Scale.NONE`,
`diagnostics.test.ts` asserts the crash reporter does **not** import Phaser.
Those catch a rename or a deleted line. None constructs a scene, runs a frame,
or looks at a pixel. So a green suite — 1008 of them today — is not evidence
about anything rendered, and the harness is the only thing that looks at a frame.

**(b) WebGL context loss is not the iPhone crash.** The device's latest crash
report carries `webglContextLost=false`, `contextLostEvents=0`,
`contextRestoredEvents=0` with `contextLossGuard` reading `attached` — so the
instrument was armed and recorded nothing, which also closes "the guard was
never attached" as the explanation for the silence in the six reports before it.
Recorded as coming from the device report, because that is not something this
sandbox can measure. The other half **is** reproducible here and is written as
such: Phaser 3.90 survives a forced loss, `GL=1 run.sh ctxsurvive`. Seventh
hypothesis down.

## 7. Deploy — read off the job list, not inferred

The deploy is not a separate workflow run. `checks.yml` calls `deploy.yml` as a
reusable workflow behind `needs: [test, typecheck]`, so it appears as the jobs
`deploy / build` and `deploy / deploy` **inside** the Checks run. Listing the
`Deploy to GitHub Pages` workflow's own runs is misleading — its most recent is
run 226 from 2026-09-04, because everything since has come through Checks.

| run | head | `test` | `typecheck` | `deploy / build` | `deploy / deploy` |
|---|---|---|---|---|---|
| [244](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34296457539) | `03b9c38` | success | success | **success** | **success** |
| [245](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34296515541) | `dc86e0f` | success | success | **success** | **success** |

Both runs also passed the `the module script keeps its crossorigin attribute`
step inside `deploy / build`.

**Pages artifact size:**

| deploy | head | artifact | vs previous |
|---|---|---|---|
| previous ([run 234](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34225906608)) | `8385d8e` | 31,702,238 B (30.23 MiB) | — |
| run 244 | `03b9c38` | **32,189,455 B (30.70 MiB)** | **+487,217 B** |
| run 245 | `dc86e0f` | 32,187,872 B (30.70 MiB) | −1,583 B vs 244 |

The +487 KB is `public/assets/effects/fx_glacier.webp` at 476,598 bytes plus a
little source. **The memory work does not shrink the artifact and was never
going to** — it changes *when* art is loaded into GPU memory, not what ships.
The −1,583 B between 244 and 245 is zip nondeterminism on a markdown-only
commit: `reports/` is not in the Pages build at all.

### Redundant deploys, and the path filter

Markdown-only commits trigger a full build and deploy. This pass produced
**three deploys, two of them redundant**: run 244 carried the actual code, run
245 carried only the spike-report salvage, and the push carrying this file makes
a third. Each is roughly a two-minute build plus a 32 MB artifact upload
publishing a byte-identical game.

**A `paths-ignore` on `checks.yml` for `**.md` and `reports/**` would fix it.**
Flagged, not done — it is outside this brief, and it needs care: the `deploy`
job hangs off `needs: [test, typecheck]`, so skipping the workflow on a docs
commit must not leave the gate in a state where a later real commit finds no
green checks to build on.

## 8. Final branch audit — report only

Every remaining remote branch, against `origin/main` at `dc86e0f`. **Nothing
here was merged, deleted, or judged**; several are far behind simply because
`main` has moved a great deal this week, and that is not evidence about them.

| branch | head | `origin/main` an ancestor? | ahead | behind | in main? |
|---|---|---|---|---|---|
| `claude/beacon-disable-soak-support-5iig18` | `be8e2f93` | no | 48 | 87 | no |
| `claude/courjahan-defense-level-5-pto190` | `7e912393` | no | 0 | 40 | **fully contained** |
| `claude/courtland-aim-loadout-blurb-45ufwl` | `7f37ab42` | no | 0 | 66 | **fully contained** |
| `claude/deployment-status-review-a661d6` | `57bac8b3` | no | 7 | 87 | no |
| `claude/github-pages-deploy-trigger-x8b598` | `5882fd0b` | no | 294 | 87 | no |
| `claude/hero-art-hud-rework-tqd10v` | `622086d0` | no | 66 | 87 | no |
| `claude/ios-safari-crash-diagnosis-hwyevk` | `c580e7f4` | no | 0 | 28 | **fully contained** |
| `claude/level-select-peanut-fixes-8b05ve` | `91724186` | no | 53 | 87 | no |
| `claude/level2-volcanic-map-recreation-3szo07` | `d72a4356` | no | 257 | 87 | no |
| `claude/level4-assets-webp-locfhx` | `19de88e4` | no | 47 | 87 | no |
| `claude/main-branch-ci-checks-svdxut` | `9206b4b0` | no | 257 | 87 | no |
| `claude/memory-tilesprite-level-art-6460up` | `a3588cd2` | no | 0 | 13 | **fully contained — merged this pass** |
| `claude/mind-laser-activation-b7lzrh` | `eea1e5a4` | no | 5 | 26 | no — **conflicts, see §2** |
| `claude/mind-laser-glacier-fixes-ne2f14` | `7ba34baf` | no | 0 | 34 | **fully contained — merged this pass** |
| `claude/phaser-4-migration-spike-hage91` | `ad62fab0` | no | 5 | 20 | no — **delete refused, see §5** |
| `claude/phaser-vendor-layout-authority-74uaif` | `480c8db6` | no | 39 | 87 | no |
| `claude/scatter-props-tree-line-g0im1u` | `29dac889` | no | 253 | 87 | no |
| `claude/targeting-drawer-input-bugs-lb5184` | `c2172f33` | no | 10 | 87 | no |
| `claude/transformation-courtland-rework-89vg83` | `3d301398` | no | 0 | 71 | **fully contained** |
| `soak/overnight` | `b4debf0d` | no | 118 | 87 | no |

**Six branches are now fully contained in `main`** and carry nothing that is not
already there: `courjahan-defense-level-5`, `courtland-aim-loadout-blurb`,
`ios-safari-crash-diagnosis`, `memory-tilesprite-level-art`,
`mind-laser-glacier-fixes` and `transformation-courtland-rework`. The last two
became contained this pass. Deleting a fully-contained branch loses nothing, but
that is Cory's call and none were touched.

`origin/main` is an ancestor of nothing, because the two merge commits mean
`main` now has history no branch shares.

---

## Verification

Everything below is headless Chromium in this sandbox. **The sandbox cannot
reach github.io — the egress proxy answers 403 by policy — so nothing here is a
live check of the deployed site, and none is claimed.**

- **Tests** — `node --test 'tests/*.test.ts'`: **1008 pass, 0 fail.** The first
  run after the merges was 1007/1 and that failure was real; see §4. Green in CI
  too, with `node_modules` present.
- **Typecheck** — `sh tools/tsdiff.sh 8385d8e`: baseline **212** distinct
  errors, working tree **212**, **zero introduced**. CI's own `npx tsc --noEmit`
  passed on both pushes, which is the check that counts.
- **Harness `screens`** — 375x667, 390x844 and 1400x820 (in the landscape
  orientation the game runs in). Object counts match branch 3's control run
  exactly at every size: 1-TITLE 30, 2-WORLDMAP 56/53, 3-LOADOUT 104/77 and all
  five hero states, 4-CUTSCENE 5, 5-GAME 39. **The only fault at any size is
  `SMALL Title [title:version-stamp]`, annotated in the harness as a deliberate
  hidden dev door, and it is pre-existing.** Desktop reports no faults at all.
- **Pictures read, not just numbers**, per the rule.
  `screens-2-worldmap-844x390.png` shows all five level cards on the tiling
  ground with no seam and no dark bars at the edges — the TileSprite fix doing
  its job. `screens-5-game-844x390.png` shows the plate, the path, both signs,
  the hero, the HUD and the full ability rail with no missing textures.
- **`realboot`** — `Title=built Loadout=built Game=built Hud=built drew=20`,
  `splash -> title: true`. This is the one the harness README requires before a
  push.
- **`levelart`** — all five levels plus a return to the first: every key asked
  for resident, zero foreign enemies on every level, 8 effect animations cut
  against live textures, 0 of 76 level-art keys held after leaving the board.
  This is what confirmed the `fx-glacier` fix end to end.
- **`ctxsurvive`** under `GL=1` — SURVIVED, quoted in §5. Run twice; see the
  one-frame sampling note.
- **Reproduce any of it:**
  ```bash
  sh tools/harness/build.sh
  sh tools/harness/run.sh screens 140 844x390
  sh tools/harness/run.sh levelart 400 1400x820
  GL=1 sh tools/harness/run.sh ctxsurvive 120 1400x820
  ```

**Not used as evidence:** none of the nine scenarios known not to assert — `ui`,
`muzzle`, `buildall`, `rockets`, `retreat`, `regressions`, `poor`, `typegame`,
`meteor`. The `drawer` scenario throws under `GL=1`; pre-existing on Phaser 3,
not investigated, not this pass's.

**Not checked:** anything on a real device or on the live site. Whether the
iPhone crash is gone is still Cory's to confirm on his phone.

---

## Where this leaves the repository

**`main` is at `dc86e0f`, green, deployed.**

**Waiting on a decision:**

1. **`claude/mind-laser-activation-b7lzrh` needs someone to resolve two design
   questions**, not a merge. Does the armed Mind Laser say *"drag onto the board
   to fire"* or say nothing and let the picture carry it? And which of the two
   harness tests of that gesture survives? Neither is a merge-tool problem. The
   branch is good work and should not be left to rot; it is 5 ahead and 26
   behind and drifting further with every push to `main`.

**Blocked on permissions:**

2. **The Phaser 4 spike branch is still on the remote.** Everything worth
   keeping is on `main` and the branch is safe to delete; this session cannot.
   One command, in §5 and repeated at the top of the reply.

**Flagged, not done:**

3. **A `paths-ignore` on `checks.yml`** would stop markdown-only commits
   triggering full 32 MB deploys. Two of this pass's three deploys were
   redundant. §7 has the caveat about the `needs:` gate.

**Carried forward, still open, from `reports/2026-09-08-the-memory-numbers.md`
and `reports/2026-09-08-outside-the-guards.md`:**

4. **The iPhone standalone crash is unexplained. Seven hypotheses are down**, the
   seventh being WebGL context loss, closed this week and now written into
   `CLAUDE.md` so it stays closed. The safe-area inset path remains the
   best-fitting suspect and still does not reproduce in the harness.
5. **`map_level5.webp` is still 1920x1080** against every other plate's 3840, and
   nobody has decided whether that is a bug or a deliberate half-res.
6. **The `transform` scenario reports 10 faults** — the hero comes back still
   powered after a revive and the transformation does not re-arm. Confirmed
   pre-existing against a control worktree in the previous pass and untouched
   here.
7. **A 3072x1728 plate would save 11.39 MB per level and visibly soften the
   board on a retina phone.** The numbers are in the memory report; the
   recommendation was no, and it is Cory's call.

**New, from this pass:**

8. **Branch 3's per-level memory figures are 8 MB stale** now that `fx-glacier`
   is shared level art. The corrected table is in §4. The peak of a session is
   level 3 at **178.4 MB**, not 170.4 MB.
9. **Every `GL=1` result in this repository's history should be re-read with
   suspicion.** Screenshots from those runs are black, and the game does not
   finish booting under SwiftShader, so any `GL=1` scenario was measuring
   hand-forced scenes. Both are now in `tools/harness/README.md`.
