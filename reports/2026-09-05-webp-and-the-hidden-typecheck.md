# The deploy, unblocked: WebP art and a typecheck that can no longer be hidden

The site had not published since **11:06 UTC**. `tests/content.test.ts:1186`
caps `public/assets/` at 40MB and the tree was **58.0MB**, so `checks` was red,
`deploy` was gated on `checks`, and 28 commits of work sat unpublished.

`public/assets/` is **23.8MB** now. Nothing was raised, relaxed or skipped.

## Commits

| commit | what | CI |
|---|---|---|
| [`32da169`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/32da169) | Re-encode to WebP, split the checks job — **landed only half of itself** | `test` FAILED, `typecheck` never ran, deploy skipped ([run 33991423268](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33991423268)) |
| [`140fd0b`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/140fd0b) | The other half: the 111 PNG deletions, the manifest, the tests, the workflow, the docs | `test` ✅, `typecheck` ❌ (one real error), deploy skipped ([run 33991511551](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33991511551)) |
| [`1fb01b4`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/1fb01b4) | Fix that error — `Hero.ts` tween annotation | `test` ✅, `typecheck` ✅, **deploy ✅** ([run 33991606431](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33991606431)) |
| [`6c68665`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/6c68665) | This report | `test` ✅, `typecheck` ✅, deploy ✅ ([run 33991814335](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33991814335)), Pages deployment `6285767126` at 21:02:42Z |

**`32da169` is a mistake worth naming.** A `git stash` / `git stash pop` run
between `git add -A` and `git commit` put the changes back in the working tree
but not in the index, so the commit carried the new `.webp` files and the
`art-source/` moves and dropped everything else. For one run `public/assets/`
held **both** containers and main was heavier than before. The working tree was
correct throughout and `140fd0b` is exactly the missing half; nothing was
re-derived. The lesson is narrow and cheap: do not stash between staging and
committing, and read `git show --stat` before pushing rather than after.

The row for `6c68665` is filled in by the commit after it, which is the only
way a report can carry its own CI result. That commit changes this table and
nothing else.

**Deployment confirmed** through the GitHub API, not by eye — see *What was not
checked*. Pages deployment `6285726862`, sha `1fb01b4`, state `success` at
20:58:31Z. The one before it was `0c3abc1` at **11:06:27Z**, which is the gap
this closes exactly.

## 1. The art: 111 PNGs to WebP q95

33.1MB of PNG became 9.4MB of WebP: **71.6% off**, against the ~73% the brief
predicted. Dimensions are byte-identical on every file.

**Alpha survived bit-exact on all 111.** Not "close enough" — zero pixels
differ, on every file, verified by decoding each result and comparing. libwebp
compresses the alpha plane losslessly by default, which is the whole reason q95
WebP was the right call and a quantized PNG was not: quantizing bands the glow
effects and chews the alpha edges, and this cast is mostly glow and soft edges.

| directory | before | after |
|---|---|---|
| enemies | 11.17MB | 2.23MB |
| towers | 5.59MB | 1.36MB |
| maps | 5.68MB | 3.45MB |
| ui | 4.32MB | 1.72MB |
| effects | 4.13MB | 1.38MB |
| heroes | 4.11MB | 1.07MB |
| hero | 3.41MB | 0.89MB |
| nodes | 4.49MB | — *(moved out)* |
| audio | 8.20MB | 8.20MB *(untouched)* |
| **total** | **58.01MB** | **23.82MB** |

The heaviest ten, with error measured on **premultiplied** channels:

| file | PNG | WebP | saved | PSNR | alpha |
|---|---|---|---|---|---|
| `effects/boss_projectile.webp` | 2.14MB | 0.61MB | 72% | 39.8 dB | exact |
| `effects/fx_stunned.webp` | 1.99MB | 0.78MB | 61% | 36.7 dB | exact |
| `enemies/enemy_zamboni.webp` | 1.64MB | 0.41MB | 75% | 38.9 dB | exact |
| `enemies/enemy_catcher.webp` | 1.39MB | 0.34MB | 76% | 38.2 dB | exact |
| `enemies/boss_unicorn.webp` | 1.24MB | 0.38MB | 69% | 33.2 dB | exact |
| `enemies/enemy_longsnap.webp` | 1.20MB | 0.34MB | 72% | 38.1 dB | exact |
| `enemies/enemy_pompom.webp` | 0.97MB | 0.28MB | 71% | 36.7 dB | exact |
| `towers/tower_dummy_3.webp` | 0.83MB | 0.19MB | 78% | 33.1 dB | exact |
| `towers/tower_dummy_2.webp` | 0.82MB | 0.17MB | 79% | 34.9 dB | exact |
| `branding/logo_studio_card.webp` | 0.80MB | 0.20MB | 75% | 32.5 dB | exact |

**Premultiplied is not a hedge, it is the only honest ruler here.** Straight RGB
divides colour by alpha on the way out, so one unit of rounding in a pixel at
alpha 1 reads as a 255-unit error that nobody can see and that swamps the
average. Measured that way the same files score 18–21 dB, which is a number
about the metric and not about the picture. The existing `tools/reencode/`
reports straight RGB and its "worst channel error 255" lines are this artifact.

### The encoder is Chromium, and why

No `cwebp`, no ImageMagick, no PIL, no `libwebp` of any kind, and **every**
package source answers 403 — npm, PyPI, apt, and all three CDNs. Chromium's
libwebp is the only WebP encoder in this environment, and it is the same library
`cwebp` calls. `tools/reencode/` already established this route for the map
plates; `tools/towebp/` is the batch version of it.

**The one real deviation from the brief:** the browser does not expose libwebp's
`method` knob, so this is not `-m 6`. Method is an effort setting, so a `-m 6`
pass would be a few percent smaller **at the same quality** — never a different
picture. Everything else in the brief is met exactly: q95, alpha preserved,
dimensions preserved.

Reproduce:

```bash
sh tools/towebp/run.sh 1800 $(find public/assets -name '*.png')
# per-file numbers land in tools/towebp/report.json
```

The tool refuses to write a file whose dimensions changed, and records
dimensions, byte counts, premultiplied PSNR and an exact alpha comparison for
every file.

### Two findings the brief did not predict

**Eight small ability icons came out LARGER as WebP** — 90KB more across all
eight (`ability_cory_1` 16.4KB → 29.6KB is the worst). Flat, few-colour 256px
badges are exactly what PNG is good at. They were converted anyway, so that
"no PNG under `public/assets/`" is a rule with no exceptions to remember;
90KB against 16.2MB of headroom is not worth an exception list. Reverting those
eight is a one-line change if that judgement is wrong.

**The smallest sprites took the largest quality hit.** Twelve files land under
27 dB, the worst being `tower_withholding_t1` at 22.7 dB — all of them small
sprites where edge pixels are a large fraction of the image and WebP's chroma
subsampling has less to work with. They are also heavily minified on screen
(`tower_withholding_t1` is 213×300 source drawn at ~51 world px), which is where
compression noise goes to die, so this is a flag rather than a defect.

If it should be removed entirely: **encoding those twelve losslessly costs
0.55MB** (358KB → 912KB) and makes them mathematically exact. Measured, not
estimated. That is 3% of the remaining headroom and it is Cory's call, so
nothing was changed.

## 2. What left the deploy

| file | where it went | why |
|---|---|---|
| `enemies/unicorn_trimmed.png` | **deleted** | superseded by `boss_unicorn`, and faces the wrong way — a wrong-facing sprite left lying about is one that gets wired up by mistake |
| `maps/L3_trace.png` | `tools/L3_trace.png` | an input to the level 3 checker, not game art |
| `props/prop_bailey_peek.png` | `art-source/props/` | kept for Bailey's return — see `src/data/README.md` |
| `nodes/*` (6 sprites + `map_world.webp`) | `art-source/nodes/` | 4.49MB nothing references |
| `enemies/enemy_boss_beetle.png` | `art-source/enemies/` | unreferenced |
| `enemies/scale_check.png` | `art-source/enemies/` | the artist's scale reference sheet — `KENNEY-INVENTORY.md` had already flagged that it should not be under `public/` |

`art-source/` is new, at the repository root: **kept in git, out of the build**,
which is what `public/` could never offer. Everything under `public/` ships
whether or not anything references it, which is the point the size-cap test
makes in its own comment.

### Left alone, as instructed

Three unreferenced sprites stay exactly where they are, converted with the rest.
They total **78KB** and they look like art someone is about to bind:

- `ui/icon_confirm.webp` (13.9KB)
- `ui/icon_sell.webp` (18.6KB)
- `ui_icons/hud_peanut_icon.webp` (45.6KB)

Also left: `fonts/License.txt` and `kenney/License.txt`, which are attribution
and must ship.

Nothing else under `public/assets/` is unreferenced. The earlier figure of
"10.8MB of images under public/assets that no file in src/ or index.html names"
— commit `af29583`, on the unmerged `claude/deployment-status-review-a661d6`
branch — counted files a literal path grep could not see. Sound and sprite keys
alike are built from filename **stems**, so grepping for full paths misses them;
matching on stems as well brings the true unreferenced set down to the five
files above. Most of that 10.8MB was real, though, and it is gone: it is the
`nodes/` directory and the four other files in the table above.

## 3. The checks job was hiding the typechecker

`npm test` ran before `npx tsc --noEmit` **in one job**, and a failing step ends
a job. So for a full day, twice, the typechecker never ran at all and looked
green because nobody had asked it anything.

Reordering only swaps which one hides the other, so they are **two jobs** now,
`test` and `typecheck`, with `deploy` on `needs: [test, typecheck]`. Both always
run and a red build says everything that is wrong with it in one go. That is not
theoretical — run 33991511551 is the proof: `test` green, `typecheck` red, both
reported from the same push.

Cost: a second `npm install` per run, about 7 seconds.

## 4. The first real typecheck in 28 commits

It found **exactly one** error, and it was not either of the two predicted:

```
src/entities/Hero.ts(453,7): error TS2322:
  Type '(tw: Phaser.Tweens.TweenChain) => void' is not assignable to
  type 'TweenOnUpdateCallback'.
```

`tweens.addCounter` passes a `Tween`, not a `TweenChain`. The cast in the body —
`(tw as unknown as { getValue(): number })` — is what let it stand: it routed
around the wrong type instead of surfacing it. Both are gone. `GameScene:2459`
and `AbilityRunner:108` write the same tween with `tw` left to contextual typing
and `tw.getValue()` called straight, and they have been green all along.

### The two predicted errors are artifacts — verified, not assumed

The brief asked for these to be checked in CI rather than reasoned about. They
were checked, and the evidence is stronger than CI: **commit `0c3abc1f`, which
CI accepted green, reports the identical errors locally.**

```bash
git worktree add -q --detach /tmp/base 0c3abc1f
cd /tmp/base && npx tsc --noEmit 2>&1 | grep -i targetable
```

```
src/systems/AbilityRunner.ts(78,11): error TS2339:
  Property 'applySlow' does not exist on type 'Targetable'.
src/entities/Tower.ts(378,7): error TS2740:
  Type 'Targetable' is missing the following properties from type 'Enemy': ...
```

Both are the same cascade: `Targeting.ts` is generic (`<T extends Targetable>`),
and without `node_modules` the `Enemy` class loses its Phaser base and therefore
`x` and `y`, so inference cannot satisfy the constraint and falls back to
`Targetable`. With real typings `T` infers as `Enemy` and both vanish. CI's
green typecheck on `1fb01b4` confirms it.

`tsdiff.sh` called them "introduced" only because it keeps the file name and
message text after stripping line numbers: the baseline's `applySlow` line names
`AbilityRunner.ts` and the new one names `GameScene.ts`, and the TS2740 message
text moved from "status, and 52 more" to "laneDistance, and 63 more" because
`Enemy` gained fields. Same error, different spelling. **Worth knowing before
trusting the tool's output next time.**

### One real error tsdiff could not have found

`Soldier.ts` — new since the baseline, so `tsdiff.sh`'s own documented blind
spot — declared:

```ts
declare setDepth: (value: number) => unknown
```

That is **narrower** than `Container`'s `setDepth(value: number): this`, and
TypeScript rejects a derived member not assignable to its base one. All three
`declare` lines existed only to quiet the local typecheck; `Enemy` and `Fighter`
extend the same class and satisfy the same two interfaces with none. Removed.

This was found by reading, not by a tool, and it is the pattern the tsdiff
warning exists to prompt: when a new file that imports `phaser` appears, treat
every Phaser member it touches as unverified. `CutsceneScene.ts`, the other new
Phaser file, was audited the same way and was clean — CI agrees.

## 5. Rule 7: nothing moved

`tools/measure_art.py` reads pixels through `tools/png.py`, which reads PNG and
only PNG. It would have gone **blind** the moment the art was re-encoded — and
CLAUDE.md rule 7 says to run it after every re-export, so a blind measuring tool
is a rule nobody can follow.

`tools/img.py` is the fix: it decodes WebP through Chromium's **WebCodecs
`ImageDecoder`**, not through a canvas. That distinction matters. A canvas
stores premultiplied alpha, and un-premultiplying on the way out moves the
colour of every semi-transparent pixel — and these numbers are measured off
exactly those pixels. `ImageDecoder.copyTo({format:'RGBA'})` hands back
unpremultiplied bytes straight from libwebp. Decodes are cached under
`tools/.imgcache/` (gitignored) and the whole tree is decoded in one browser
launch.

Verified end to end: `boss_unicorn` PNG → WebP q95 → decoded back is
**bit-identical in alpha**, 0 of 1,087,000 pixels differing.

**The measurement, before and after the re-encode, is identical.** Every
dimension, content box, anchor, shadow width, cut line and foot group is
unchanged — `contentWidth` and `contentHeight` in `art.json` are still correct,
which is what rule 7 asks to be confirmed.

```bash
git stash -u && python3 tools/measure_art.py > /tmp/before.txt
git stash pop && python3 tools/measure_art.py > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt
```

The diff is filename extensions and **four nine-slice cap insets that moved by
one pixel**:

| key | before | after |
|---|---|---|
| `ui-btn-primary` | T73 | T72 |
| `ui-btn-disabled` | R148 | R147 |
| `ui-btn-icon-active` | L73 T97 | L74 T98 |
| `ui-panel-dialog` | R143 | R144 |

Those come from `slice_insets`, which walks inward comparing RGB until pixels
stop matching — precisely the kind of threshold a lossy codec perturbs.
**`art.json` keeps its tuned values.** The drift is 0.7%, and the tool's own
docstring says that where the difference is under a percent, keep what is in
`art.json`: it is the size the game was tuned at.

## 6. Two image-size readers, one of them stale

`sign.test.ts` held its own PNG-only `pngSize` and failed on the first run the
same way `manifest.test.ts` had failed when the map plate went to WebP. There is
one reader now, `tests/imagesize.ts`, imported by both. It is not a `.test.ts`
file, so the runner does not try to execute it.

`manifest.test.ts`'s size-reader pinning test needed real PNGs and the deploy has
none; it reads them from `art-source/` now, so the PNG branch stays covered —
PNG is still the container art *arrives* in.

762/762 tests pass.

## What was NOT checked

- **The live page was never opened.** `cperry0360-create.github.io` is blocked
  by this environment's egress policy (403 on CONNECT). The deploy is confirmed
  through the GitHub API — deployment `6285726862`, state `success` — which
  proves Pages accepted and published the artifact, **not** that the game boots
  in a browser. Somebody should load it once.
- **No visual A/B of the re-encoded art.** The brief stated q95 had already been
  eyeballed on the heaviest files, so this run verified alpha exactly and error
  numerically and did not re-litigate that. The twelve low-PSNR small sprites
  above are the ones to look at if any are looked at.
- **`tools/measure_art.py`'s own decode path is Chromium's**, so a bug in
  libwebp's decoder would be invisible to it. The alpha comparison against the
  original PNG is what rules that out for alpha; RGB is trusted.
- **Local `tsc` is 6.0.2, CI's is 5.x.** `tsdiff.sh` output is therefore
  indicative, not authoritative. CI is the authority and CI is green.
- **`tools/trace_map.py` was left alone.** Its `PLATE` already pointed at a
  `map_level1_v2.png` that has not existed for some time, and it reads through
  `tools/png.py`. It was broken before this and is broken in the same way after;
  fixing it is a separate job and it would now use `tools/img.py`.

## Where this leaves the repository

**In flight:** nothing. main is green on every job, the game published at
20:58:31Z (`1fb01b4`) and this report at 21:02:42Z (`6c68665`), and
`public/assets/` is 23.8MB against a 40MB cap.

**Waiting on a decision (Cory's, not urgent):**

1. **The eight ability icons that grew.** 90KB, revertible in one line.
2. **Lossless for the twelve low-PSNR small sprites.** 0.55MB, measured. Removes
   the only quality question this change raises.
3. **`art-source/` has no README.** It is one sentence in `src/data/README.md`
   at the moment. If more art moves there it should say what it is for.

**Carried forward, still open, not touched here:**

- **There is no `package-lock.json`.** Both `checks` and `deploy` resolve
  dependencies fresh on every run, which is a supply-chain and reproducibility
  hole that a lockfile plus `npm ci` closes. `deploy.yml` already carries a note
  saying so.
- **`tools/trace_map.py` is broken**, as above.
- **The 3MB-per-image cap has one file near it:** `maps/map_level3.webp` at
  1.29MB is the largest single image now, so there is plenty of room — but the
  cap catches uploads, and uploads arrive as PNG. `tools/towebp/` is the thing
  to run on them.
- **`AUDIT.md` and `SOAK-REPORT.md` were not revised.** They are historical
  narrative and their `.png` references are accurate as history.
  `RENDER-QUALITY.md`, `NAMING.md`, `KENNEY-INVENTORY.md`, `README.md` and
  `src/data/README.md` are living records and were updated in place.
