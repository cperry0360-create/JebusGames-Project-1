# The memory numbers: the world map's ground, and the art no menu draws

**The title screen went from 169.8 MB to 79.0 MB and the world map from
231.0 MB to 87.2 MB. The peak fell from 231.0 MB to 170.4 MB and moved: it is
the most expensive level now, rather than the screen the crash was reported
on.**

| commit | what | CI |
|---|---|---|
| `12ce6c7` | Size the world map's ground to the camera, not to the world | covered by run 235 on the branch head |
| `351177d` | Load a level's enemies and effects with the level, not at boot | covered by run 235 on the branch head |
| `9d91ffe` | Walk every level in the levelart scenario, and say what each one costs | **green** — `test` and `typecheck` both pass ([run 235](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34240908206)) |

CI runs per push rather than per commit, so run 235 is the head's result and the
three commits were pushed together. The typecheck job is `npx tsc --noEmit` with
`node_modules` present, which is the check `tools/tsdiff.sh` exists to
approximate and the one that has caught real errors here before.

Branch `claude/memory-tilesprite-level-art-6460up`. **Not merged.** The merge
command is at the end of this file and at the top of the reply that carried it.

---

## The four points

`tools/harness/run.sh texmem` at 1400x820, the same scenario and the same cost
model (`width x height x 4`, RGBA, the backing canvas measured rather than the
declared size) as `reports/2026-09-07-the-crash.md`, so the columns are
comparable across all three sessions.

| point | before the plate fix | after the plate fix (this pass's baseline) | after this pass |
|---|---|---|---|
| 1. after boot, title live | 304.3 MB, 184 tex | 169.8 MB, 179 tex | **79.0 MB, 109 tex** |
| 2. on the world map | 365.5 MB, 223 tex | 231.0 MB, 218 tex | **87.2 MB, 148 tex** |
| 3. during a level | 308.1 MB, 188 tex | 205.3 MB, 184 tex | **155.6 MB, 160 tex** |
| 4. back on the world map after a finished level | 365.6 MB, 224 tex | 231.0 MB, 218 tex | **87.2 MB, 148 tex** |

Point 4 is the reported symptom exactly: the level is finished with
`endRun('won')`, the victory dialog appears, LEVEL SELECT is tapped.

The first column is the pre-crash-fix tree and is quoted from the earlier
report; the middle column is what this session measured on the branch before
touching anything, and it reproduced that report's figures to the decimal.

**Point 3 is level 1, and level 1 is not the peak.** The enemy rosters are
different sizes now that a level loads its own, so the dearest level is not the
one a player reaches first. `run.sh levelart` walks all five and reads the same
meter at each (it enters the board directly rather than through the world map,
so it does not carry the ~4 MB of menu `Text` canvases `texmem` does; the gap
between its 151.6 MB for level 1 and `texmem`'s 155.6 MB is that and nothing
else):

| level | total | of which its enemies | plate |
|---|---|---|---|
| level 1 | 151.6 MB | 0.6 MB | 31.6 MB |
| level 2 | 155.1 MB | 4.3 MB | 31.6 MB |
| **level 3** | **170.4 MB** | **19.6 MB** | 31.6 MB |
| level 4 | 160.2 MB | 9.4 MB | 31.6 MB |
| level 5 | 132.9 MB | 5.8 MB | 7.9 MB (the half-res one) |

So the true peak of a session is **level 3 at 170.4 MB** — a few MB more than
that reached the way a player reaches it, by the same menu-canvas gap as above,
which was not separately measured for level 3. Before this pass every level cost
205.3 MB and the world map cost more than any of them.

**Nothing accumulates across five levels.** Level 1 revisited after all four of
the others reads 151.6 MB again, to the decimal, with 47 of 47 of its keys
resident and none of the other levels' enemies still held. Off the board
entirely, 0 of the 75 level-art keys are resident.

---

## 1. The world map's TileSprite: 56.6 MB → 3.7 MB

`WorldMapScene.drawBackground()` made a `TileSprite` of `roadWidth() + WORLD_W *
2` by `WORLD_H * 3` — 6870 by 2160 world units.

`map-bg` is 1254x1254 and so non-power-of-two, which means Phaser cannot hand
the repeat to the sampler. It allocates a fill canvas at the sprite's **display**
size and paints the pattern into it (`vendor/phaser.min.js`, `TileSprite`
constructor: `this.canvas = CanvasPool.create(this, width, height)`, then
`addCanvas`). At 6870x2160 that canvas was **56.6 MB** of RGBA — the largest
single texture in the game once the plates went per-level, and 24.5% of what the
world map cost. `updateCanvas` resizes it to match `width`/`height` on the next
render, so `setSize` is all it takes to change.

The camera on this screen never moves: the road is a container whose `x` is
dragged (the scene's own header says so, and rule 4 in `CLAUDE.md` is why). So
the sprite is sized to the camera's view and stays there. Measured
**1282x752 = 3.7 MB**, and both of the existing comment's reasons survive — it is
still a TileSprite because the texture is seamless, and it is still wider than
the design box so a screen of a different aspect does not get dark bars down the
sides. The wash rectangle is sized in step with it.

| | before | after |
|---|---|---|
| the sprite | 6870x2160, 56.6 MB | 1282x752, 3.7 MB |
| world map total | 231.0 MB | 178.1 MB |
| the peak of the four points | 231.0 MB (the world map) | 205.3 MB (a level) |

That was the whole of commit `12ce6c7`; the level-art pass then took the world
map down again, to 87.2 MB.

### Is the picture the same? Nearly, and the remainder is explained

Screenshot-diffed against a control run of the unmodified tree at 844x390,
667x375 and 1400x820. Every screen but the world map is **bit-identical** —
title, all six loadout states, cutscene, game, 0 pixels different.

The world map is not, and the first version of the change was worse: sizing
straight off the camera put the sprite's left edge on world x = -140.5 at
844x390, which moved every texel half a pixel. Rounding the corners to whole
world units fixed that half. What is left:

| viewport | pixels differing | max channel difference | two control runs differ by |
|---|---|---|---|
| 667x375 | 50.4% | **6** of 255 | max 6 |
| 844x390 | 50.9% | **6** of 255 | max 6 |
| 1400x820 | 50.8% | **27** of 255 | max 15 |

At both phone sizes the difference is inside the harness's own run-to-run noise.
The mechanism is `roundPixels: true` in `src/config.ts`: Phaser rounds a
sprite's draw position to a whole device pixel, and this sprite now sits
somewhere else, so the ground is sampled up to half a pixel across from where it
was. The pattern's phase is preserved exactly — `tilePosition` is offset from
the corner the world-sized sprite had, so a seamless texture is not slid under
the road — and there is no tint shift in either direction (signed mean
difference 0.003 of 255 per channel). An exact match is not reachable: it would
need `left * zoom` to land on the same fractional part as the old sprite's, and
`zoom` is different on every device.

Amplified 40x, the difference is a faint noise field over the tiling ground
only. Everything drawn on top of it — cards, road, type, buttons — is black in
the diff. Reproduce with:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh screens 140 844x390
```

---

## 2. The level-only art: 90.8 MB off boot

The plate fix moved five keys. This moves seventy.

**What moved, and what it costs**

| group | keys | decompressed | how it is loaded |
|---|---|---|---|
| enemies | 28 | 50.33 MB | **per level**, computed |
| effects (`fx-*`) | 19 | 24.30 MB | with any level |
| props — the signs and both build pads | 5 | 4.00 MB | with any level |
| tower tier art (`*-t2`, `*-t3`) | 4 | 4.57 MB | with any level |
| the nuke button and the scratch card | 4 | 4.12 MB | with any level |
| soldiers and gnomes | 5 | 3.33 MB | with any level |
| projectiles and Kenney shots | 5 | 0.19 MB | with any level |
| **total** | **70** | **90.8 MB** | |

That total is the sum of the manifest's own file dimensions, and it agrees with
the meter: boot measured 169.8 MB before and 79.0 MB after, a difference of
90.8 MB. (The commit message on `351177d` says 79.4 MB in one line, which was an
early estimate taken before the tier art, the two in-play panels and the dummy
soldiers were added to the list. The four-point table in that same message is
correct; the source comments have been corrected to 90.8.)

Plus the five plates already moved: 75 keys, 225.3 MB, none of it at boot.
What remains at boot is 71 keys and 69.2 MB, plus 9.1 MB of greyscale copies and
the three generated textures — computed 78.3 MB against 79.0 MB measured over
109 textures, the difference being Phaser's own `__DEFAULT`/`__MISSING`/`__WHITE`
and the generated shadow, build glow and icon stand-in.

### Which enemies is computed, not listed

`enemies.json` already says what each enemy wears and the wave tables already say
who turns up, so a per-level list would be a third copy and the copy that drifts
is the one that puts a magenta box on the board in wave nine.
`systems/LevelArt.ts` reads both.

**The pass is transitive**, because not every enemy that walks the lane was
spawned by a wave: the Devil summons Direct Reports, Batula calls in six Baby
Franks below half health, the Vampire Lord splits into four Gliders, and level
5's dusk flip converts every Thrall into a Glider where it stands. The search is
for *any* enemy id appearing anywhere in a def rather than for a fixed list of
fields — `summons.enemy`, `splitsOnDeath.enemy`, `onHealthThreshold.summon.enemy`
and level 5's `conversions` are four places today and the fifth will not announce
itself. Keys beginning with an underscore are skipped, because a design note is
prose that can name an enemy without spawning one.

Measured live: level 1 fields 4 of the 28 pictures, level 3 fields 5, level 4
fields 6. On every level, zero of the other levels' enemies are resident.

### What did NOT move, and why

- **The decor.** `decor-bush` and its five siblings are Kenney tiles scattered on
  the board — and `TitleScene.decorateBackdrop` scatters twenty-six of them
  behind the title at alpha 0.12. Moving them would have put magenta squares on
  the first screen of the game. They are 24 KB between them.
- **The tower base sprites and the whole hero roster.** The loadout deals tower
  cards from `towers.json` and draws every hero on its picker, powered and not.
  Only the tier art is level-only.
- **The ability icons.** 256px badges on the loadout cards and the HUD rail. The
  *effect* each ability plays is what moved.
- **`map-bg`.** The world map's own ground.

The decor is the reason `tests/levelart.test.ts` reads the menu scenes rather
than trusting a list. That test was verified by making the mistake: with
`decor-bush` added to `levelArt.shared` it names `src/scenes/TitleScene.ts` and
the key.

### The trap: an animation outlives its texture

Every animated sheet in the manifest is an `fx-` key — `fx-explosion`,
`fx-hit-spark`, `fx-death-puff`, `fx-boss-bolt`, `fx-stunned`, `fx-mind-laser`,
`fx-rooster-flame` — so `registerEffectAnims` at boot now finds nothing to
register and `GameScene.create` cuts them after its own load instead.

That half is obvious. The other half is not: `anims.create` stores frame objects
belonging to the texture they were cut from, and `registerEffectAnims` skips a
key `anims.exists` already knows. So freeing a sheet on shutdown leaves a
registered animation holding dead frames, and the **next** level reuses it rather
than cutting fresh ones against the sheet it just loaded. Every effect in the
game plays nothing, on every level after the first, and nothing reports it —
the animation completes on schedule and the sprite destroys itself.

`Effects.forgetEffectAnims` drops the animations with the textures. This is not
a theoretical risk: commenting the call out and re-running `run.sh levelart`
reports all seven sheets on level 3 as *"frames point at a texture that is
gone"*.

### Two new checks

**`tests/levelart.test.ts`** — ten tests, and it imports the module for real
rather than reading source as text. That is why the classification lives in
`systems/LevelArt.ts` and not beside the rest of the manifest in `Art.ts`:
`npm install` does not work in this environment, so anything reaching `phaser`
cannot be executed by a test at all. `Art.ts` re-exports it, so callers still
have one front door.

It asserts the cheap direction where the data can answer for itself (every enemy
sprite and every ability `fx` is level art), the expensive one by reading the
menu scenes and charging each for the manifest paths it names, that the three
sets partition the manifest, and that each level's enemy set is closed under
summoning, splitting and conversion.

The tenth test records a finding rather than a rule: **the only level art no
shipped level loads is level 6's** — `enemy-scrapper`, `enemy-sprinter`,
`enemy-bruiser` and `enemy-rooster`, 15.1 MB. `waves.level6.json` and
`level6.json` are in the repository and level 6 is not on `levels.json`'s list,
so that art used to sit on the title screen for a level nobody can reach. The
test fails the day level 6 ships, which is the intent.

**`tools/harness/run.sh levelart`** — walks all five levels and back to the
first, and on each one checks that every key it asked for is resident, that no
other level's enemies are, that all seven effect animations have the right frame
count *and* point at the texture that is loaded now, and that a blast actually
plays a frame. Then it leaves the board and checks all 75 keys are given back.

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh levelart 400 1400x820
```

### One harness bug found on the way

`toTitle()` waited on `game.textures.exists('enemy-notice')` as its boot gate.
`enemy-notice` is one of the enemies that moved, so **every scenario in the file
hung for its full 60 s and reported TIMEOUT** — which looks exactly like a game
that does not boot. The comment above that line already described the same thing
happening once before, with `map-level1`, when the plates moved.

It does not name a key any more. It waits on `REQUIRED_SPRITE_KEYS`, which is
boot's own list, and prints what is missing if it does time out. This is the
third of the four faults in this session that turned out to be the harness
rather than the product, which is what rule *do not trust a first red result* is
for.

---

## 3. What a 3072x1728 plate would save, and what it would cost

**11.39 MB per level, 36% — and it would visibly soften the board on the device
the crash was reported on. Recommendation: not worth it now that only one plate
is resident.**

### First, a correction to the premise

The brief says the most a plate can ever show is about 3034 device pixels
across. **3034 is the dpr-1 figure.** `cam.zoom` in this game is already device
pixels per world unit — `GameScene` multiplies every zoom in `display.json` by
`deviceScale()` before handing it to the rig, and `RENDER-QUALITY.md` and the
harness both say so in as many words. So at max zoom the plate spans 1280 x 2.37
= 3034 **CSS** px, which is 3034 device px on a desktop and **9102 device px on a
dpr-3 phone**.

This matters because it flips the sign of the answer. Under 3034 device px a
3840px plate has pixels to spare and shrinking it is free. Under 9102 it does
not: the plate is *already* being magnified.

### The numbers

Zoom band from `display.json` and confirmed live by `run.sh padart`: pinch floor
0.776, cover 1.14 at 1400x820, default 1.72, max 2.37. Magnification is device
pixels needed over source pixels supplied; above 1.0 the GPU is blowing the
picture up.

| | pinch | cover | default | max |
|---|---|---|---|---|
| **3840x2160 today**, dpr 1 | 0.26x | 0.38x | 0.57x | 0.79x |
| **3840x2160 today**, dpr 3 | 0.78x | 1.14x | 1.72x | **2.37x** |
| **3072x1728**, dpr 1 | 0.32x | 0.47x | 0.72x | 0.99x |
| **3072x1728**, dpr 3 | 0.97x | 1.42x | **2.15x** | **2.96x** |

- **Saving:** 33,177,600 → 21,233,664 bytes, **31.64 MB → 20.25 MB, 11.39 MB per
  level**. One plate is resident, so that comes straight off the during-level
  peak: level 3's 170.4 MB would become 159.0 MB. On disk it would be smaller
  too, but by how much is **not measured** — WebP does not scale linearly with
  pixel count and this pass re-exported nothing.
- **Would anything visibly soften?** Yes, on a retina phone, and at the zoom the
  game is normally played at rather than only at the extreme: default zoom goes
  from 1.72x magnified to **2.15x**, and max zoom from 2.37x to **2.96x**. Rule 7
  in `CLAUDE.md` wants 720 x 2.37 x 3 = 5119 source px of height; 2160 supplies
  42% of that and 1728 supplies 34%.
- **Where it would help:** the wide end, on a dpr-1 desktop, where the plate is
  minified everywhere today — 3.9x down at the pinch floor. A 3072 plate is 3.1x
  down. Both are past the ~2x where `RENDER-QUALITY.md` says bilinear with no
  mipmaps starts to smear (WebGL1 forbids mipmaps on non-power-of-two textures,
  and neither 3840x2160 nor 3072x1728 is one), so it improves that end without
  fixing it.

The reason to say no is that the trade has changed since the plates were the
problem. 11.4 MB off one resident plate is worth less than the 52.9 MB the
TileSprite gave up for nothing, and it is spent on the sharpest and largest
continuous surface in the game. **Cory's call; the numbers are here rather than
an opinion.** If plate size is revisited, the interesting direction is up rather
than down — `map_level5.webp` is still 1920x1080 against everyone else's 3840,
which is the finding carried forward from the last report and still open.

---

## Verification

No browser on a phone, no `npm run dev`, no live check on github.io. **Whether
the crash is gone is still Cory's to confirm on his phone.**

- **Tests** — `node --test 'tests/*.test.ts'`: **1003 pass, 0 fail** (993 before,
  plus the ten new ones). Green in CI too, with `node_modules` present.
- **Typecheck** — `sh tools/tsdiff.sh 8385d8e`: baseline 212 distinct errors,
  working tree 212, **zero introduced**. It caught two real ones first — a
  `this.load` on a class whose Phaser base does not resolve, and `Level`
  imported from `types.ts` when it lives in `Levels.ts` — and both are fixed
  rather than tolerated. CI's own `npx tsc --noEmit` then passed, which is the
  check that matters.
- **Harness, `screens`** — 375x667, 390x844 and 1400x820, in both orientations,
  and 844x390 again with `INSETS=0,47,21,47`. Object counts match the control
  run exactly at every size: 1-TITLE 30, 2-WORLDMAP 56/53, 3-LOADOUT 104/77 and
  all five hero states, 4-CUTSCENE 5, 5-GAME 39. **The only fault at any size is
  `SMALL Title [title:version-stamp]`, which is pre-existing and annotated in
  the harness as a deliberate hidden dev door.** No NOTCH fault with the notch.
  The two portrait sizes are correctly gated by the rotate overlay.
- **Pictures read, not just numbers** — `screens-5-game-844x390.png` shows the
  board with its plate, both signs, the hero, the HUD and the ability rail;
  `screens-2-worldmap-*.png` at all three sizes shows all five level cards on
  the tiling ground with no seam and no bars.
- **`levelart`** — every level complete, every animation live, a blast playing
  real frames (3 or 4 of 6), zero foreign enemies, zero keys held after the run.
  Verified able to fail, by removing `forgetEffectAnims`.
- **Scenarios** — `texmem`, `levelart`, `maproute`, `worldmap`, `results`,
  `difficulty`, `bars`, `abilityicons`, `music`, `nightfall`, `realboot`,
  `padart`, `signs`, `nuke`, `ticket`, `gnomes`, `towertiers`, `stun`. All
  clean. `padart` reports `prop-pad-flagstone loaded=true` and the pad at the
  size it asks for at all three zooms; `towertiers` swaps `turret-ledger` →
  `-t2` → `-t3` and reads each source size back; `worldmap` reports the road
  still scrolling under the new background.
- **`transform` reports 10 faults, and they are not this pass's.** A control run
  from a worktree at `8385d8e` reports the same 10 — the hero comes back still
  powered after a revive, and the transformation does not re-arm. Pre-existing,
  carried forward below.

**What was NOT checked.** Nothing on real hardware or in real Safari; the
harness is headless Chromium with `--disable-gpu`, so these are texture-manager
bytes and not a measurement of what iOS allocates — Safari's own decoded-image
copies sit on top of this and are not counted. The cold-load cost of the larger
per-level fetch was not timed on a real network: entering a level now pulls
about 2.5 MB across ~47 files where it used to pull one plate of about 1 MB, and
on a first visit over a slow connection that is a longer dark frame than before.
Levels 2, 4 and 5 were never played through wave by wave — their art was checked
resident and their effects checked live, not their whole run. The nine scenarios
known not to assert (`ui`, `muzzle`, `buildall`, `rockets`, `retreat`,
`regressions`, `poor`, `typegame`, `meteor`) were not run and nothing here rests
on them.

---

## Where this leaves the repository

**In flight.** Branch `claude/memory-tilesprite-level-art-6460up`, three
commits, head `9d91ffe`, CI green on both jobs. **Not merged.** `origin/main` is
at `8385d8e` and the branch is that plus these three, fast-forward:

```
git checkout main && git merge --ff-only claude/memory-tilesprite-level-art-6460up && git push origin main
```

Merging deploys: `checks.yml` gates the Pages deploy on `test` and `typecheck`,
and both are green on the head.

**Waiting on a decision.**

1. **Plate resolution.** Down to 3072x1728 saves 11.4 MB per level and softens
   the board on a retina phone at the zoom it is normally played at — section 3.
   Recommended against.
2. **`map_level5.webp` at 1920x1080** against every other plate's 3840x2160.
   Carried forward from `reports/2026-09-07-the-crash.md`, unchanged, and the
   reason to fix it is still how it looks rather than what it costs. With one
   plate resident, bringing it up costs 23.7 MB at the moment it is played and
   nothing at any other time.
3. **The five powered hero pictures, 9.1 MB.** They are still boot art because
   the loadout picker might draw them and that was not worth guessing at inside
   this pass. If the picker only ever shows base art they are level art, and
   `levelArt.shared` is where they go. Measured, not assumed, is one harness run
   away.

**Open and small.**

- **A load screen.** Entering a level now fetches ~47 files instead of one, so
  the dark frame the last report called *the one thing worse than before* is
  longer. It still wants what that report described: a shared component that
  composes against the 1280x720 design box and tears its own listener down.
  Nothing here made it harder, and it is now worth more.
- **`transform`: 10 faults, pre-existing.** The hero comes back still powered
  after a revive and the transformation does not re-arm. Confirmed identical on
  `8385d8e`. Not touched here and not previously written down anywhere I could
  find — it belongs to whoever picks up heroes next.
- `art.json`'s `worldMap._note` still says the cards are "cropped from each
  level's own plate", describing a runtime crop that does not exist — they are
  baked by `tools/mapcards`. One line, carried since the last report.
- `RENDER-QUALITY.md` still describes the map plate as 1672px in its section 5
  worked example. It is 3840px, and section 3 of the same file says so. Stale in
  one place, correct in another. Section 3 of this report uses the current
  number.
- The `title:version-stamp` SMALL fault is pre-existing at both phone sizes and
  annotated as a deliberate hidden dev door. If that is right it should be
  exempted by name so the audit reads zero; if it is not, it needs 44pt. Carried
  in three reports now.
