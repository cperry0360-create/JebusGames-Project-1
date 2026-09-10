# The null frame: an animation that outlived its texture

The first crash in this project to arrive with a real message and a full stack.
It was fixed in one afternoon, and the whole reason is the stack.

**The cause in one sentence:** Phaser's animation manager is global and outlives
a scene, so the Mind Laser's three clips survived the level change that freed
the texture they were cut from, and the next press played frames whose
`Frame.destroy()` had set `data` to null. **Yes, the memory work introduced it**
— nothing in `src/` called `TextureManager.remove` before that, so no animation
could ever have outlived its texture.

## Commits

| commit | what | CI |
|---|---|---|
| [`0c7aa7f`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/0c7aa7f) | first attempt at the same fix | run 265 — **typecheck FAILED**, `TS2445: Property 'anims' is protected`. Superseded, see §5 |
| [`9e389b8`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/9e389b8) | the fix, the `nullframe` scenario, the regression tests | run 266 — **changes, test, typecheck, deploy/build, deploy/deploy all green**, deployed |
| [`bb49e15`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/bb49e15) | this report, and the `tsdiff` limitation written into `CLAUDE.md` | run 267 — **changes, test, typecheck green**; deploy correctly **skipped** by the new markdown paths filter |

`main` moved 19 commits under this work — including the Mind Laser activation
rework — between the first push attempt and the rebase. Everything in §7 was
re-run after it, and the reproduction was re-driven through the **new** two-step
gesture.

---

## 1. The report, and what it already told us

```
TypeError: null is not an object (evaluating 'this.data.sourceSize')

get                 (Frame.data.sourceSize)
setSizeToFrame
setCurrentFrame
handleStart
startAnimation
endHeldAbility
releaseHeldAbility
onGameOut
setCanvasOut
onTouchMove
```

Build ec91739, standalone app, in-game on level 3, wave 6/13, Courtland powered,
`webglContextLost=false`.

Three lines of that stack are the whole diagnosis, and they can be read straight
out of the vendored engine:

```js
// Phaser 3.90, vendor/phaser.min.js
realWidth:  { get: function () { return this.data.sourceSize.w } }
setSizeToFrame: function (t) { t || (t = this.frame), this.width = t.realWidth, ... }
destroy:    function () { this.texture = null, this.source = null,
                          this.customData = null, this.data = null }
```

`Frame.realWidth` reads `data.sourceSize.w`. `Frame.destroy()` sets `data` to
null. So `setSizeToFrame` was handed a **destroyed** frame — and a frame is
destroyed when its texture is.

## 2. Step 1's hypothesis was right

The brief's leading hypothesis was the memory work. It is correct, and the
mechanism is exact.

**Which animation, and which sprite.** `endHeldAbility` plays
`` `${h.def.fx}-fade` `` on the beam sprite — `fx-mind-laser-fade`.
`beginHeldAbility` plays `-charge`, and its `ANIMATION_COMPLETE` handler plays
`-sustain`. All three are built by `GameScene.ensureLaserAnims`.

**Global or per-scene.** Global. `scene.anims` is the game-level
`AnimationManager`; an animation registered in one scene is registered for the
life of the game.

**Do the textures get freed and reloaded between levels.** Yes.
`fx-mind-laser` is in `art.json`'s `levelArt.shared`, so `levelArtKeys` returns
it for every level, `GameScene`'s `shutdown` hands it to
`TextureManager.remove`, and the next level's `preload` fetches it again.

**Do the old Frame objects survive.** Yes, and this is the fault. There *was* a
guard — `Effects.forgetEffectAnims`, written for exactly this trap, with a
comment that describes it correctly:

> AN ANIMATION OUTLIVES ITS TEXTURE, and that is the trap in freeing effect
> art. `anims.create` stores frame objects belonging to the texture they were
> cut from; removing the texture leaves those frames dangling…

Its body was:

```ts
for (const key of keys) {
  if (renderFor(key).sheet && scene.anims.exists(key)) scene.anims.remove(key)
}
```

**It removed the animation whose KEY equalled the TEXTURE key.** That is true of
every clip `registerEffectAnims` builds and of nothing else in the game. The
laser's clips are named `fx-mind-laser-charge`, `-sustain` and `-fade`. None of
them matched. All three survived every level change.

And then `ensureLaserAnims` refused to rebuild them:

```ts
if (this.anims.exists(`${key}-charge`)) return
```

`exists` said yes — the dangling clip was still registered — so the new level's
freshly loaded texture was never cut, and the first press played frames from the
texture the previous level had given back.

The guard was right about the trap, right about the timing, right about the call
site, and wrong about one word: it asked the **name** instead of the **texture**.

## 3. Reproduced, before anything was changed

New harness scenario, `sh tools/harness/run.sh nullframe`. It plays level 1,
fires the beam, changes to level 3, and fires it again — the second level of a
session, after a `Game → shutdown → Game` transition, which is what the report
described.

**Against the unfixed tree** (a control run at `9e389b8`'s parent, with only
`Effects.ts` and `GameScene.ts` reverted):

```
level 1 clips:  fx-mind-laser-charge=4f  fx-mind-laser-sustain=5f  fx-mind-laser-fade=3f
level 3 clips BEFORE any press:
      fx-mind-laser-charge=4f DEAD:4 FOREIGN:4
      fx-mind-laser-sustain=5f DEAD:5 FOREIGN:5
      fx-mind-laser-fade=3f DEAD:3 FOREIGN:3
*** reading the beam sprite throws: Cannot read properties of null (reading 'sourceSize')
guard counts: {"a \"mousedown\" listener on canvas":1, "the game loop":1,
               "a requestAnimationFrame callback":1, "a \"mouseout\" listener on canvas":1}
*** these animations hold destroyed frames after a level change:
      fx-mind-laser-charge(4/4), fx-mind-laser-sustain(5/5), fx-mind-laser-fade(3/3)
RESULT *** 4 fault(s) ***
```

Every one of the twelve frames of all three clips is DEAD (`frame.data === null`)
and FOREIGN (pointing at a texture object that is not the one loaded now).

**The guard chain matches the device.** The report said it threw three times in
55 ms — once in a touchstart listener, once in a rAF callback, once in a
touchmove listener. Chromium drives mouse rather than touch, and the harness
produced the same four shapes: a **mousedown** listener (the press,
touchstart's counterpart), the **game loop**, a **requestAnimationFrame**
callback, and a **mouseout** listener — `mouseout` on the canvas being what
drives `setCanvasOut` → `onGameOut` for a mouse, exactly as `onTouchMove` does
for a finger.

**With the fix:**

```
level 3 clips BEFORE any press: charge=absent  sustain=absent  fade=absent
level 3 press: lit=true  threw=no
  beam frame=2  clip=fx-mind-laser-charge  playing=true  display=520x147
release route: mouseout on the canvas
after release: held=false  threw=no
guard counts across the press and release: {}
animations registered: 11  holding destroyed frames: none
RESULT the held beam survives a level change: clips are re-cut, the press
       lights it, and gameout stops it
```

**It reproduces on the second level and not the first**, which is exactly what
step 3 said would confirm step 1.

Two things worth recording about the reproduction itself.

- **The press throws too.** The device's report is a release, because that is
  when the player noticed, but `beginHeldAbility` plays `-charge` — so the
  ability was already broken from the first *press* on the second level. The
  three throws in 55 ms are the press, the loop trying to advance the dead clip,
  and the release.
- **The `gameout` route is incidental.** It is how the player got there and it
  is what the scenario drives, but any release would have done it. The bug is
  the animation, not the exit path.

## 4. The fix

`Effects.forgetEffectAnims` now asks the **texture** which animations are cut
from it:

```ts
export function forgetEffectAnims(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const key of keys) {
    if (!scene.textures.exists(key)) continue
    for (const anim of scene.anims.getAnimsFromTexture(key)) scene.anims.remove(anim)
  }
}
```

`AnimationManager.getAnimsFromTexture` is Phaser's own walk of every registered
animation matching `frame.textureKey` — the engine's answer, not a second copy
of the rule that could drift from what the frames actually say.

The `textures.exists` guard is not decoration: `getAnimsFromTexture` resolves
the key through the texture manager, which hands back the `__MISSING`
placeholder for a key it does not hold, so asking about a key this level never
loaded would take the placeholder's animations instead.

**And `freeLevelArt` now frees one list.** The arch crop was removed on a line
of its own *after* the loop, outside the list `forgetEffectAnims` was given —
the same bug waiting in a second place. It goes in the list.

**This is not a null check, and a null check would have been wrong.** A missing
frame here means a texture-lifetime fault upstream; guarding at the call site
would have left the beam invisible and the ability silently dead on every level
after the first, which is worse than a crash because nobody would report it.
Nothing anywhere was made defensive: the clips are simply gone when their
texture is, and `ensureLaserAnims` re-cuts them on the next press because
`anims.exists` now honestly says no.

## 5. The first attempt, and why it failed CI

Worth recording because it is the shape of mistake `CLAUDE.md` warns about.

The first version enumerated the manager directly:

```ts
for (const anim of scene.anims.anims.values()) { ... }
```

It ran correctly in the harness and `tsdiff` reported zero introduced errors —
and CI rejected it:

```
src/systems/Effects.ts(110,46): error TS2445: Property 'anims' is protected
  and only accessible within class 'AnimationManager' and its subclasses.
```

**`tsdiff` cannot see this.** It compares error counts, and `Effects.ts` already
imports Phaser, so the file is already inside the 165-error cascade that falls
out when `phaser` will not resolve. A protected-member violation on a type that
is `any` locally is not an error locally. There is no way to check it from the
sandbox: the registry answers 403 to `npm install` and the egress proxy answers
403 to fetching `phaser.d.ts` from a CDN.

The recovery cost one CI cycle and produced a better fix — the engine's own
public API rather than our own reimplementation of it. It also deleted a
`src/systems/AnimLifetime.ts` that existed only so the rule could be unit-tested;
a parallel copy of an engine API is exactly the thing that rots.

## 6. The sibling audit (step 5)

**The three laser clips were the only animations in the game whose key is not
their texture key.** Every other animation play site uses the bare key and was
covered by the old rule as well as the new one:

| site | clip key | at risk before the fix |
|---|---|---|
| `GameScene.beginHeldAbility` / `endHeldAbility` | `fx-mind-laser-charge` / `-sustain` / `-fade` | **yes — this crash** |
| `GameScene` boss bolt | `ART.fx.bossBolt` | no |
| `GameScene` stun overlay | `ART.fx.stunned` | no |
| `AbilityRunner` glacier | the sprite key | no |
| `Effects.playEffect` | the sprite key | no |

Three further classes were checked and are clean:

- **Sprites that outlive a level.** `HudScene` is stopped before every exit from
  `GameScene` (four call sites, all `this.scene.stop('Hud')` immediately before
  the `start`), so no HUD object holds level art across the change. The
  `levelart` scenario already asserts that zero of the 76 level-art keys are
  resident on the world map.
- **Module-level caches of a `Frame` or a `Texture`.** There are none in `src/`.
- **Textures freed outside the list.** There was one, the arch crop; §4.

**The audit is a question, not a list.** Keeping a table like the one above
correct by hand is the failure mode that caused this bug in the first place, so
`nullframe` asks the animation manager directly:

> after a level change, does **any** registered animation hold a destroyed
> frame?

Today: `animations registered: 11  holding destroyed frames: none`. A fourth
laser clip, or a new effect with a derived name, fails that line without anybody
remembering to add it anywhere.

## 7. Verification

Everything re-run after the rebase onto `ec91739`, and the reproduction
re-driven through the **new** two-step Mind Laser gesture (tap the medallion to
arm, press the board to fire) that landed on `main` while this was in progress.
The scenario's first draft called `castHeroSlot` and read `held`, which under
the new activation would have reported "the laser did not light" on a perfectly
healthy build.

| check | result |
|---|---|
| `node --test 'tests/*.test.ts'` | **1028 / 1028 pass** |
| `sh tools/tsdiff.sh ec91739` | baseline 212, working tree 212, **zero introduced** — and see §5 for what this cannot see |
| `nullframe` | exit 0 with the fix; **4 faults** against the unfixed control |
| `levelart` | exit 0 — level art complete on all five levels and back to the first |
| `courtland` | exit 0 — Courtland's three still behave as specified |
| `screens 140 667x375` | 1 fault — the version stamp (below) |
| `screens 140 844x390` | 1 fault — the same one |
| `screens 140 1400x820` | **no layout faults** |
| CI run 266 | changes, test, typecheck, deploy/build, deploy/deploy — **all green, deployed** |

Reproduce:

```sh
sh tools/harness/build.sh
sh tools/harness/run.sh nullframe
sh tools/harness/run.sh levelart
sh tools/harness/run.sh courtland
```

To see it fail, revert `src/systems/Effects.ts` and `src/scenes/GameScene.ts` to
`9e389b8^`, rebuild, and run `nullframe` again.

### The regression tests

`tests/animtexture.test.ts`, four tests. They are **source-text** tests, and
that limit is the point rather than an evasion: `Effects.ts` imports Phaser,
`npm install` returns 403 here, and no test in `tests/` can construct a scene —
`CLAUDE.md`'s own standing fact. So the behaviour is proven by `nullframe`, and
what the node suite holds is that the wiring cannot quietly go back to deciding
by name:

- `forgetEffectAnims` goes through `getAnimsFromTexture(key)` and no longer
  contains `anims.exists(key)`.
- the `textures.exists` guard against the `__MISSING` placeholder is present.
- `freeLevelArt` hands `ARCH_NEAR_KEY` to `forgetEffectAnims` in the same list
  it frees.
- `ensureLaserAnims` still builds clips under a derived key, so the reason the
  fix exists stays visible.
- `nullframe` exists, changes level between its two presses, releases through a
  real `mouseout`, and asks the manager for dangling frames.

`nullframe` is also registered in `SCENARIO_NAMES`, which `main` added while
this was in flight and which `tests/harness-scenarios.test.ts` polices.

### Two pre-existing results, controlled

Both were checked against a clean checkout and reproduce identically. Neither is
from this work.

1. **`SMALL Title [title:version-stamp (hidden dev door, not a tap target)]`** at
   667x375 and 844x390. Self-labelled as deliberate; the harness cannot know a
   hidden dev door is not a control.
2. **`realboot` reports `drew=20`** against a `drawn > 20` threshold, so its
   RESULT is starred though all four scenes built. Carried forward from three
   reports now.

### What was NOT checked

- **The fix has not been confirmed on the phone.** The harness is headless
  Chromium; it reproduces this bug faithfully because the bug is engine
  bookkeeping rather than anything Safari-specific, but only the device can
  confirm the crash is gone.
- **The live site was not fetched.** The sandbox cannot reach `github.io` — the
  egress proxy answers 403 by policy. The deploy is reported from CI's five
  green jobs, not from loading the page.
- **No other held ability exists to test.** The Mind Laser is the only one, so
  "every held ability survives a level change" is a claim about a set of one.
- **The beam was not measured for damage after a level change**, only that it
  lights, animates at 520x147 and stops. `courtland` covers the damage, on
  level 1.

## 8. The instrumentation earned its keep

Worth recording plainly, because it is the reason this took an afternoon rather
than another eight reports.

The guard chain built over the last two weeks — `ListenerGuard`, `guardGameLoop`,
`ScheduleGuard`, `CrashContext` — is what turned this from `Script error.` into
a stack that named the listener, the rAF callback, the touch event, the method
chain and the exact property. Every earlier report in this investigation had a
muted message and an empty state; this one arrived with a diagnosis in it.

It also survived contact: the harness's guard counts reproduced the device's
three-throw pattern shape for shape, which is how the reproduction was confirmed
to be the *same* bug rather than a similar one.

**Whatever else changes, that instrumentation stays.**

**And this is NOT the Safari Share crash or the rotation crash.** Those happen
on Splash or Title with no Game scene running, carry no message, and remain
open. Nothing here touches them.

---

## Where this leaves the repository

**`main` is at `9e389b8`, green on run 266, deployed. Working tree clean.**

**New, from this pass:**

1. **The level-3 Mind Laser crash is fixed and the class is closed.** Any
   animation cut from a freed texture now goes with it, asked of the engine
   rather than of a naming convention, and `nullframe` fails if one ever
   survives again.
2. **`tsdiff` cannot see protected- or private-member violations**, and this
   cost a red CI (§5). `tsdiff` compares error *counts*, so any error that does
   not exist locally — which includes every access rule on a Phaser type that is
   `any` without `node_modules` — is invisible to it. **Written into
   `CLAUDE.md`'s typechecking section** in this pass so it stays known.

**Waiting on the phone:**

3. **Confirm the Mind Laser works on level 2 and beyond**, on the device, in the
   standalone app. Arm it, fire it, let the finger leave the screen.
4. **The Safari Share crash and the rotation crash are still open** and still
   have no message. `reports/2026-09-09-the-settle-burst.md` §6 names the next
   measurement and says plainly it needs a Mac with Web Inspector attached.

**Carried forward, still open:**

5. **`claude/phaser-4-migration-spike-hage91` still has to be deleted from the
   GitHub web UI.** Three sessions have had 403 from the CLI. Everything worth
   keeping is on `main`.
6. **`realboot` exits 5 on success** — `drawn > 20` against a clean run's
   `drew=20`. Pre-existing across four reports now, and it is still the scenario
   the harness README tells you to run before a push. Somebody should decide
   whether 20 is the right floor.
7. **Five harness scenarios still assert nothing** — `muzzle`, `rockets`,
   `retreat`, `regressions`, `meteor`. They fail loudly rather than lying.
8. **`claude/mind-laser-activation-b7lzrh`** — resolved and merged while this
   pass was in flight (`9e21dfa`), which is why the reproduction had to be
   re-driven through the new gesture. Closing this item.
9. **`map_level5.webp` is still 1920x1080** against every other plate's 3840.
10. **The `transform` scenario reports 10 faults** — the hero comes back still
    powered after a revive. Confirmed pre-existing.
11. **A 3072x1728 plate** would save 11.39 MB per level and visibly soften the
    board on a retina phone. Recommendation was no; it is Cory's call.
12. **`OVER Title` at 956x305** — two title buttons overlapping at the Share
    sheet viewport. Pre-existing, reproducible, not in this brief.
