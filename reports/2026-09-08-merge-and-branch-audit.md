# Merging two branches, and a branch audit

**One of the two branches merged. The second did not, and stopping was the
instruction rather than a failure.** `main` moved `12258d7` → `c580e7f`, the
deploy went out green, and `claude/mind-laser-glacier-fixes-ne2f14` is still
sitting on the shelf waiting for a decision that is not mine to make.

| commit | what | CI |
|---|---|---|
| `c580e7f` | `main` fast-forwarded to `claude/ios-safari-crash-diagnosis-hwyevk` (10 commits) | **green** — test, typecheck, `deploy / build`, `deploy / deploy` all success |
| `c1a2153` | this report, markdown only | **green** — test, typecheck, `deploy / build`, `deploy / deploy` all success (run 222) |

Pushing to `main` worked. That was not the obstacle.

---

## 1. Verification before merging

Ancestry checked with `git merge-base --is-ancestor origin/main origin/<branch>`
rather than taken on trust. Both were clean at the time of asking:

| branch | head | `origin/main` an ancestor? | ahead | behind |
|---|---|---|---|---|
| `claude/ios-safari-crash-diagnosis-hwyevk` | `c580e7f` | yes | 10 | 0 |
| `claude/mind-laser-glacier-fixes-ne2f14` | `7ba34ba` | yes | 4 | 0 |

## 2. The merges

**Merge 1 — done.**

```
main  12258d7  ->  c580e7f
```

Fast-forward only, pushed.

**Merge 2 — not done.**

Re-checked against the NEW `main`, as instructed, and it is no longer a
fast-forward:

```
claude/mind-laser-glacier-fixes-ne2f14   4 ahead, 10 behind
```

### Why ordering could not have helped

The brief's premise was that merging in this order "keeps it clean". It does
not, and no order does.

Both branches were cut from `12258d7`. Fast-forwarding `main` to the first moved
`main` **past that shared base**. The second branch does not contain those ten
commits, so `main` is no longer an ancestor of it — which is precisely the
definition of "not a fast-forward". Whichever branch goes first, the other stops
being fast-forwardable the moment the first lands. The only orderings that avoid
it are ones where the second branch already contains the first's commits, and
neither of these does.

### What actually diverged

**Nothing conflicts.** `git merge-tree --write-tree` (read-only; it writes
nothing and changes no ref) produced a merged tree with no conflict report:

```
72467eb9b4f6232be2757c48ba286f2937af0a37
exit=0
```

So the content merges cleanly. The obstruction is purely that `--ff-only`
cannot apply when the branch is behind.

The two sides touch mostly different files. The overlap is two files:

| | files touched |
|---|---|
| `main`'s 10 new commits | `src/main.ts`, `BootScene.ts`, **`GameScene.ts`**, `HudScene.ts`, `Art.ts`, `ArtLoader.ts`, `CrashContext.ts`, `Diagnostics.ts`, `ErrorPanel.ts`, `OrientationGate.ts`, `index.html`, `deploy.yml`, two tests, **`tools/harness/index.html`**, `run.sh` |
| branch 2's 4 commits | `fx_glacier.webp`, its report, `abilities.json`, `art.json`, `presentation.json`, **`GameScene.ts`**, `AbilityRunner.ts`, `types.ts`, three tests, **`tools/harness/index.html`** |

### The options, none of which I took

Per the instruction — no merge commit to force it, no rebase, no squash — I
stopped here. For whoever picks this up:

```bash
# (a) an ordinary merge commit. The content is conflict-free, verified above.
git checkout main
git merge --no-ff claude/mind-laser-glacier-fixes-ne2f14
git push origin main

# (b) replay its 4 commits onto the new main, after which it fast-forwards again
git checkout claude/mind-laser-glacier-fixes-ne2f14
git rebase origin/main
git push --force-with-lease origin claude/mind-laser-glacier-fixes-ne2f14
git checkout main
git merge --ff-only claude/mind-laser-glacier-fixes-ne2f14
git push origin main
```

(b) keeps history linear, which is what this repository has done so far, at the
cost of a force-push to a branch nobody else is working on. (a) is safer and
leaves a merge commit.

## 3. The deploy

Run 221 on `c580e7f`. Statuses read off the **job list**, not inferred from the
checks going green:

| job | conclusion |
|---|---|
| `typecheck` | success |
| `test` | success |
| **`deploy / build`** | **success** |
| **`deploy / deploy`** | **success** |

### Artifact size

| | bytes | |
|---|---|---|
| this deploy (`c580e7f`) | 31,690,160 | 30.22 MiB |
| previous deploy (`12258d7`) | 31,678,556 | 30.21 MiB |
| **delta** | **+11,604** | **+11.3 KiB, +0.04%** |

All of it source. No asset changed, which is the expected shape for a branch
that added diagnostics and a texture-lifetime fix and no art.

### The crossorigin question, now answered

The build step added in the previous session ran for the first time on a real
build and passed:

```
emitted module script tag: <script type="module" crossorigin src="./assets/index-C2tXx1zL.js">
OK: crossorigin survived the build
```

**Vite keeps the attribute.** That closes an open item that could not be checked
from the agent sandbox, because `npm install` answers 403 there and Vite never
runs. It is now asserted on every deploy, and a build that dropped it would fail
rather than ship silently.

**The served page is Cory's to confirm.** This sandbox cannot reach github.io —
the egress proxy answers 403 by policy — and no live fetch was attempted. What
is verified here is that the artifact was built and published, not that the page
loads.

## 4. State, and what the merged branch actually changed

`main` at **`c580e7f`**, local `main` matching `origin/main`, working tree
**clean**, **993 tests pass, 0 fail**.

### The crash work

Three sessions chased one crash and the first two diagnoses were wrong.

`reports/2026-09-08-the-crash.md` records that **texture memory is not the
cause**, and the crash report itself is what rules it out: a tab killed for
memory writes no report, and the iPhone's did. What is now on `main` is
diagnostics rather than a fix — the module script asks for real error detail,
the handler captures `file:line:column` (it had been discarding those outright),
rejected promises are labelled apart from thrown errors, a `DOMException` no
longer prints as `{}`, and the STATE section that was empty in all three reports
now carries 42 fields naming the scene, the viewport in both coordinate spaces,
the device pixel ratio, the safe-area insets, standalone-versus-tab and the
rotate gate.

**The Safari Share-button crash is not expected to be fixed. It is expected to
become diagnosable.** The share-sheet viewport transient was driven directly in
the harness and did not reproduce — consistent with it not crashing in Chrome on
the same phone, since the harness is Chromium and cannot reach a Safari-only
bug. `reports/2026-09-08-readable-crash-report.md` has the detail.

One real defect was found and fixed on the way, and it was not the crash: the
rotate gate announced *taking* hold of input but never announced *letting go*,
so a single portrait flicker left an invisible gate claiming to own the game
forever — and `shouldRecover` requires `owner === null`, so one flicker
permanently disarmed the stuck guard for the life of the page.

### "Load one map plate per level instead of holding all five"

**A fix for a real, measured problem, not a precaution.**

Measured in the harness at four points, and the numbers are the reason it
shipped:

| point | before | after |
|---|---|---|
| after boot | 304.3 MB, 5 plates resident | 169.8 MB, 0 plates |
| on the world map | **365.5 MB** | 231.0 MB |
| during a level | 308.1 MB, 5 plates | 205.3 MB, 1 plate |
| back on the world map | **365.6 MB** | 231.0 MB, 0 plates |

`BootScene` queued all 146 manifest entries including all five map plates before
the title screen drew a frame, and **nothing anywhere in `src/` ever called
`TextureManager.remove`** — so every texture a tab touched stayed resident until
the tab died. Four of the plates are 3840x2160, which is 31.6 MB each as an RGBA
texture. One plate now loads per level and is freed on exit: **peak 365.6 MB →
231.0 MB**, a 134.5 MB cut. It is worth having. It is simply not this crash.

### Mind Laser and Glacier (unmerged, branch 2)

`reports/2026-09-07-mind-laser-and-glacier.md`, which is on
`claude/mind-laser-glacier-fixes-ne2f14` and therefore not yet on `main`.

The **Mind Laser**'s beam existed from the instant of the press — deliberately,
so a held button draws something — but it also *damaged* from that instant, so
tapping the medallion fired a burst at nothing and put a 20-second ability on
cooldown. The only way to actually use it was to press and then drag off the
button, which no player would guess. It now costs nothing until the finger
reaches a point the board owns, and the prompt says so.

The **Glacier** had no art and effectively no effect. Damage 12 → **48**,
`slowFactor` 0.25 → **0.2** (deeper), duration 5 → **7** — that last one a unit
fix rather than a buff, since the field counted real seconds while every other
duration in the data counts game seconds, so on a stopwatch it is exactly as
long as it was. The real bug was diminishing returns: the field re-applied its
slow every 250 ms, and the stacking rule shortens each repeat, so the third
application fell below `minSeconds` and was refused outright. A five-second ice
field slowed for two thirds of a second, and the longer an enemy stood in it the
less slowed it was. New eight-frame art lands with it.

## 5. Branch audit — report only

Nothing deleted, nothing merged, no judgement offered about whether any of these
is stale.

| branch | head | contained in main? | ahead | behind |
|---|---|---|---|---|
| `claude/beacon-disable-soak-support-5iig18` | `be8e2f9` | no | 48 | 77 |
| **`claude/courjahan-defense-level-5-pto190`** | `7e91239` | **contained** | 0 | 12 |
| **`claude/courtland-aim-loadout-blurb-45ufwl`** | `7f37ab4` | **contained** | 0 | 38 |
| `claude/deployment-status-review-a661d6` | `57bac8b` | no | 7 | 77 |
| `claude/github-pages-deploy-trigger-x8b598` | `5882fd0` | no | 294 | 77 |
| **`claude/hero-art-hud-rework-tqd10v`** | `622086d` | **contained** | 0 | 65 |
| **`claude/ios-safari-crash-diagnosis-hwyevk`** | `c580e7f` | **contained** | 0 | 0 |
| `claude/level-select-peanut-fixes-8b05ve` | `9172418` | no | 53 | 77 |
| `claude/level2-volcanic-map-recreation-3szo07` | `d72a435` | no | 257 | 77 |
| `claude/level4-assets-webp-locfhx` | `19de88e` | no | 47 | 77 |
| `claude/main-branch-ci-checks-svdxut` | `9206b4b` | no | 257 | 77 |
| `claude/mind-laser-glacier-fixes-ne2f14` | `7ba34ba` | no | 4 | 10 |
| `claude/phaser-vendor-layout-authority-74uaif` | `480c8db` | no | 39 | 77 |
| `claude/scatter-props-tree-line-g0im1u` | `29dac88` | no | 253 | 77 |
| `claude/targeting-drawer-input-bugs-lb5184` | `c2172f3` | no | 10 | 77 |
| **`claude/transformation-courtland-rework-89vg83`** | `3d30139` | **contained** | 0 | 43 |
| `soak/overnight` | `b4debf0` | no | 118 | 77 |

**Fully contained in `main`** — every commit on them is already on `main`, so
deleting them would throw nothing away. Whether to delete them is still a
judgement call about whether the name is worth keeping:

- `claude/courjahan-defense-level-5-pto190`
- `claude/courtland-aim-loadout-blurb-45ufwl`
- `claude/hero-art-hud-rework-tqd10v`
- `claude/ios-safari-crash-diagnosis-hwyevk` *(identical to `main`, 0 ahead 0 behind)*
- `claude/transformation-courtland-rework-89vg83`

**Diverged, carrying commits not on `main`** — the other twelve. Deleting any of
these loses work. `claude/mind-laser-glacier-fixes-ne2f14` is on that list only
because of the merge performed here; before it, it was a clean fast-forward.

## Where this leaves the repository

**Done.** `main` is `c1a2153` (`c580e7f` plus this report), green, deployed. The crash diagnostics and the
map-plate memory fix are live for the first time — every previous crash report
came from `12258d7`, which had none of it.

**Waiting on a decision.**

1. **`claude/mind-laser-glacier-fixes-ne2f14` is unmerged**, 4 ahead and 10
   behind, conflict-free but no longer a fast-forward. Two commands above; pick
   one.
2. Five branches are fully contained in `main` and could be deleted.

**Carried forward, unchanged, from the previous reports** — see
`reports/2026-09-08-the-crash.md` for the full list: the 56.6 MB world-map
TileSprite, `map_level5.webp` at half the resolution of the other four, 124.7 MB
of level-only art still loaded at boot, and the absent web app manifest.

**The next crash report is the thing to wait for.** Tap Share on the iPhone now
that the diagnostics are actually deployed, and the report should carry a real
message, a `file:line:column`, a stack where the browser yields one, and 42
fields of state. The three before it could not say any of that.
