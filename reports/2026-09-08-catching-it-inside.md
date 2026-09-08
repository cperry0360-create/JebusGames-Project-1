# Catching the exception inside the code

**956x305 does not reproduce it.** The guards are in and proven to catch a real
throw with a real stack, but nothing in this pass made the crash happen in
Chromium. That is the fifth proposed cause not to survive contact with the
harness, and it is worth saying before anything else.

| commit | what | CI |
|---|---|---|
| `5bf3429` | Catch the exception inside the code, since the browser will not describe it | **green** — test, typecheck, `deploy / build`, `deploy / deploy` all success |
| this report | markdown only; its own row is filled by the commit after it |  |

## What was wrapped

Every wrapper reports the caught error with its real name, message and stack,
then **rethrows**. Nothing is swallowed. No layout maths was clamped or guarded.

| site | label in the report |
|---|---|
| the Phaser loop — every scene update and the whole render pass | `the game loop` |
| every scene resize handler, wrapped at `onSceneEvent` | `a scene "resize" handler (Title)` etc. |
| the per-frame orientation sync | `the orientation sync (per frame)` |
| each viewport settle (`applyResolution` + sync) | `a viewport settle (resize/rotate)` |
| `window` resize | `the window resize listener` |
| `orientationchange` | `the orientationchange listener` |
| `visualViewport` resize | `the visualViewport resize listener` |
| `screen.orientation` change | `the screen.orientation change listener` |
| safe-area resolution | `safeAreaInsets` |

The four DOM listeners all call the same `settle`, and are still named
separately: a crash on `visualViewport resize` and one on `orientationchange`
point at different things, and the Share sheet fires the former without the
latter.

Scene resize handlers are wrapped at `onSceneEvent`, which is the one choke
point all six of them go through, so coverage cannot drift as scenes are added.
`SceneEvents.ts` keeps its documented no-runtime-Phaser property — `Guard.ts`
imports Phaser as a type only, and `Diagnostics.ts` and `Save.ts` import nothing
— so its Node test still runs. Checked: 12/12.

`window.onunhandledrejection` was already there and already labelled
`unhandled rejection` rather than `uncaught exception`; the previous session
also taught it to describe a `DOMException` instead of stringifying it to `{}`.
Nothing needed adding.

### The mistake worth recording

**Wrapping `Game.step` does nothing, and the harness caught me doing it.**

`TimeStep` captures `game.step.bind(game)` once when the game starts and calls
that reference every frame, so assigning to `game.step` afterwards shadows a
method nothing reads. The first version of `guardGameLoop` did exactly that,
reported `__loopGuarded = true`, and caught nothing: a deliberate throw from
inside a scene update walked straight past it to `window.onerror`, with the
**original** minified `Game.step` visible in the stack.

It wraps `loop.callback` now — that captured reference — immediately if it
exists and on `ready` otherwise.

A second thing the harness corrected: reassigning `scene.update` to force a
throw also does nothing, because Phaser caches it as `sys.sceneUpdate` when the
scene starts. The test throws from the scene's `update` **event** instead, which
`Systems.step` emits from inside the loop callback.

## Proof that the guard catches something

`sh tools/harness/run.sh loopthrow 140 844x390`, two parts.

**A guarded call, read back off the guard's own report:**

```
cause  caught inside a probe site
error  TypeError: deliberate: undefined is not an object
STACK
  TypeError: deliberate: undefined is not an object
  at .../index.html:728:48
  at Module.guarded (.../js/systems/Guard.js:95:16)
  at run (.../index.html:728:10)
```

A real name, a real message, a real stack. And it rethrew — the scenario fails
if it does not.

**A real throw from inside the loop:**

```
guard counts after the loop throw: {"the game loop":1}
the guard logged: caught in the game loop: Error: deliberate throw from inside the scene update step
page errors raised by the rethrow: 1  (1 is correct -- nothing is swallowed)
```

The loop guard fired, recorded the real message, and let the error go.

## 956x305 — does it reproduce?

**No.** Driven at exactly the state the crash report describes:

```
viewport 956x305   dpr 3   canvas 2868x915
insets raw {"top":0,"right":62,"bottom":20,"left":62}
     resolved {"top":0,"right":0,"bottom":20,"left":62}
angle 90   Title up
```

Canvas and resolved insets match the phone's report exactly. Then the
transition, because the resting size and the transition are different questions
and Safari's Share sheet animates through a range of heights:

| step | errors | guards tripped |
|---|---|---|
| at rest on Title | 0 | none |
| 390 → 360 → 330 → 305 → 290 | 0 | none |
| 290 → 305 → 330 → 360 → 390 → 305 | 0 | none |
| after the sweep | 0 | none |

Ten resize events, each with a real `resize` dispatch and three frames to
settle. Zero page errors, zero rejections, zero guard trips, no crash report
recorded, the Title scene alive throughout.

**Caveat that matters:** the harness is headless Chromium, and Cory reports this
does not crash in Chrome on the same phone either. A Chromium harness cannot
reach a Safari-only fault, so this is evidence that the sequence is survivable
*in Chromium* and evidence of nothing at all about Safari. What it does prove is
that the new guards survive the sequence rather than firing spuriously.

### What 956x305 did surface: 35 layout faults

Not throws. But nothing in this repository has ever been run 85px shorter than
its shortest tested viewport, and it shows. Against 844x390's one known
pre-existing fault:

| screen | faults at 956x305 |
|---|---|
| Title | 5 — the version stamp (pre-existing), **three audio buttons inside the notch inset**, and two overlapping controls |
| Loadout | 5, on every hero — **five chips at 48x42 against the 44pt floor** |
| WorldMap, Cutscene, Game | 0 |

`NOTCH Title [audio:mute|down|up] Rectangle @ 251,246 44x44` — three 44x44
controls sitting under the left inset. `SMALL Loadout Rectangle @ 350,61 48x42`
— 42px tall where 44 is the floor.

**Reported, not fixed.** They are not the crash, and this pass does not guess.

## The inset asymmetry — deliberate

`insetsRaw` left 62 / right 62 becoming `insetsResolved` left 62 / right 0 is
**by design**, and `SafeArea.ts` documents it at length:

> The sensor housing is on ONE side in landscape, and the browser reports it on
> BOTH. Measured: with a probe reporting left 64 / right 64, the drawer handle
> stopped 64px short of an edge with nothing behind it and the HUD sat inset
> 74px at both ends.

`resolveInsets` only touches a **symmetric** horizontal pair — `left > 0 &&
left === right` — because a symmetric report means "one of these is the housing
and the other is not". `housingSide(90, 'left')` returns `left` from
`presentation.json`'s `housingAtAngle90`, so the left is kept whole and the
right is freed. An angle that is absent or not 90/270 returns `null` and both
insets are kept, which is over-cautious rather than wrong.

The phone's numbers walk through that exactly: `62 > 0 && 62 === 62` → symmetric;
angle 90 → housing on the left; right zeroed. **Not a bug, and nothing was
changed.**

## Verification

- **993/993 tests pass.** `sceneevents.test.ts` 12/12 in Node, which is the one
  that would have caught the new import breaking that module's Phaser-free
  property.
- **`sh tools/tsdiff.sh b99e413`** — baseline 211, working tree 212. The one
  introduced is `TS2307: Cannot find module 'phaser'` on `Guard.ts`, the
  documented cascade for a new file. Its only Phaser use is a type-only
  `Phaser.Game`, immediately narrowed to a structural cast, so there is no
  Phaser member access in the file to be unverified.
- **Harness** — `screens` at 667x375, 844x390 and 1400x820 all match the
  established baseline with only the pre-existing version-stamp fault;
  `realboot`, `standalone`, `sharesheet` and `crashreport` all clean. The guards
  changed no behaviour anywhere they did not fire.
- **Not used as evidence:** none of the nine scenarios known not to assert
  (`ui`, `muzzle`, `buildall`, `rockets`, `retreat`, `regressions`, `poor`,
  `typegame`, `meteor`).
- **No live check.** The sandbox cannot reach github.io and none was attempted.

## What the next crash report will contain that this one did not

If the throw happens anywhere that is now wrapped, the report carries a line the
last four could not produce:

```
cause  caught inside a viewport settle (resize/rotate)
error  TypeError: null is not an object (evaluating 'this.cameras.main.width')
STACK
  at applyBands (.../assets/index-XXXX.js:1:123456)
  at .../assets/index-XXXX.js:1:98765
  ...
```

— a real name, a real message and a real stack, from an Error object the game is
holding, regardless of what `window.onerror` is willing to say. The `guard` event
lines in the log also name which site threw and how many times.

**If the next report still says only `Script error.` with no `caught inside …`
entry**, that is itself the finding: the throw is somewhere none of these
wrappers cover, and the list above becomes the list of places it is *not*. The
strongest remaining candidates would then be inside Phaser's own DOM listeners
or its input plugin, neither of which routes through anything wrapped here.

## Where this leaves the repository

`main` at `5bf3429`, working tree clean, deployed.

**Waiting on the phone.** Tap Share in Safari, in a tab, and send the report.

**Open, unchanged.**

1. The 35 layout faults at 956x305 above — three Title controls under the notch,
   five loadout chips under the tap floor. Real, reproducible, and not the crash.
2. `claude/mind-laser-glacier-fixes-ne2f14`, still unmerged: 4 ahead, 10 behind,
   conflict-free. See `reports/2026-09-08-merge-and-branch-audit.md`.
3. Carried forward from earlier reports: the 56.6 MB world-map TileSprite,
   `map_level5.webp` at half resolution, 124.7 MB of level-only art at boot, and
   the absent web app manifest.
