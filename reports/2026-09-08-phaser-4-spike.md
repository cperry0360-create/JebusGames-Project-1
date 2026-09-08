# The Phaser 4 migration spike

**The game runs on Phaser 4.** It builds, it typechecks against the real v4
typings, it boots through the normal path, and it plays a level to completion.
The whole migration is four changed lines of game source.

**And the reason the spike was commissioned does not survive contact with the
evidence.** Phaser 3.90 already has full WebGL context restoration — it was
added in 3.85.0 — and a forced context loss is survivable on **both** engines.
The premise "Phaser 3 has no context restoration" is true of Phaser 3 before
3.85 and false of the version this repository is pinned to.

Against that, Phaser 4.0.0 introduces a texture leak that costs this game
**56.6 MB per world-map visit, unbounded**, and silently stops two clipping
masks from working in WebGL.

**Not recommended for merge.** Branch `claude/phaser-4-migration-spike-hage91`.

| commit | what | CI |
|---|---|---|
| `5bc8b39` | Ask whether the game SURVIVES a context loss, not just whether it notices | no own run — pushed together with `d30e218`, which CI ran on as the tip |
| `d30e218` | Run the game on Phaser 4.0.0 | test **green**, typecheck **RED** — one error, fixed by `d439f2b` |
| `d439f2b` | Build the scratch-card foil without `make.image`'s config | **green** — test and typecheck both pass; this is the branch head |

`main` is `8385d8e` and this branch is three commits ahead of it, fast-forwardable.

---

## What was measured, and how to reproduce it

Both engines are vendored on this branch, so every number below is the *same
source* on two engines rather than two builds of two trees:

```bash
PHASER_DIST=$PWD/vendor/phaser.min.js  sh tools/harness/build.sh   # Phaser 3.90.0
PHASER_DIST=$PWD/vendor/phaser4.min.js sh tools/harness/build.sh   # Phaser 4.0.0
```

Engine identity was checked by md5 of the staged dist on every run, after one
run silently used the wrong one (see *What went wrong in this session*).

---

## Step 1 and 3 — baseline and post-migration, side by side

### Tests

| | Phaser 3.90.0 | Phaser 4.0.0 |
|---|---|---|
| `node --test tests/*.test.ts` | **993 pass, 0 fail** | **993 pass, 0 fail** |
| CI `npm test` | green | green |
| CI `npx tsc --noEmit` (real typings) | green | **1 error**, then green |

**Zero tests broke, and that number is worth nothing.** The only mention of
`phaser` anywhere in `tests/` is `diagnostics.test.ts:125`, which asserts that
certain files do *not* import it. The suite imports pure-logic modules and no
engine. **It cannot detect a Phaser regression of any kind**, and it did not
detect either of the two real ones found below. Do not read "993/993" as
evidence that this migration is safe.

The one real type error, which only CI could find:

```
src/ui/ScratchCard.ts(214,9): error TS2353: Object literal may only specify
known properties, and 'key' does not exist in type 'GameObjectConfig'.
```

Classified as **changed behaviour, and specifically a typings gap rather than a
runtime change** — v4's image creator still does
`GetAdvancedValue(config, 'key', null)` at runtime. Fixed by constructing the
Image directly. `tools/tsdiff.sh` structurally cannot find errors of this
class: with no `node_modules`, `Phaser` is `any` locally, so every member
access typechecks whatever it says. That blind spot is documented in
`tsdiff.sh` itself and it is exactly what bit here.

### Harness layout audit — identical on both

Run at four viewports, `844x390` with `INSETS=0,47,21,47`.

| viewport | Phaser 3.90.0 | Phaser 4.0.0 |
|---|---|---|
| 375x667 (portrait) | gated by the rotate overlay | gated, identical |
| 390x844 (portrait) | gated by the rotate overlay | gated, identical |
| 844x390 + insets | **1 fault** | **1 fault — the same one** |
| 1400x900 desktop | no faults | no faults |

The single fault is pre-existing and benign on both engines, and is the one
earlier reports already name:

```
SMALL Title [title:version-stamp (hidden dev door, not a tap target)]
Rectangle @ 671,341 79x28
```

**No layout regression.** Nothing moved, nothing was cut off, nothing entered a
safe-area inset, no control shrank below 44pt that was not already below it.

### Screenshot diffs — layout unchanged, pixels not

22 screenshots per engine, compared per pixel (a pixel counts as differing when
any channel moves by more than 8, so encoder noise does not register).

**The control first.** Two *Phaser 3* runs against each other:

| shot | differing |
|---|---|
| every static screen (title, worldmap, loadout ×6, cutscene) | **0.000%** |
| `screens-5-game-1400x900` | 0.049% |
| `screens-5-game-844x390` | 0.005% |

The harness is pixel-deterministic on everything except the live game frame,
where enemies have moved. So the differences below are real.

| shot | v3 → v4 differing | mean delta on those pixels |
|---|---|---|
| `screens-3-loadout-844x390` (and all 5 hero variants) | **11.58%** | 36 / 255, worst 250 |
| `screens-1-title-844x390` | **7.98%** | 26 / 255, worst 219 |
| `screens-2-worldmap-844x390` | 5.95% | — |
| `screens-2-worldmap-1400x900` | 0.231% | 18.7 / 255, worst **30** |
| `screens-5-game-844x390` / `-1400x900` | 0.002% / 0.003% | within the control's noise |
| `screens-1-title-1400x900`, all `loadout-1400x900`, both `cutscene` | **0.000%** | identical |

**Named, as asked.** Read side by side, the 844x390 loadout screens are the
same screen: same layout, same text, same positions, nothing clipped or moved.
The difference is low-amplitude and spread over a tenth of the frame, with a
tail of ~0.6% of pixels moving by more than 160/255 — which is what a sub-pixel
shift in text rasterisation looks like along glyph edges, not what a layout bug
looks like. The desktop viewport is byte-identical on the same screens.

**I did not establish the cause.** The two candidates are the changed
`roundPixels` semantics (v4 rounds only when an object is axis-aligned *and
unscaled*, and these screens are drawn under a fitted, scaled camera) and text
rasterisation. Note also a confound I did not separate: 844x390 was run with
insets and 1400x900 without, so "small viewport differs, desktop does not" may
be about the inset path rather than the size. This needs a closer look before
anyone ships it; it is not a blocker on its own, and it is not nothing.

### Texture allocation — a real regression, and the largest finding after the context question

`texmem` at 844x390, the four points the brief asked for plus a restart.

| point | Phaser 3.90.0 | Phaser 4.0.0 | delta |
|---|---|---|---|
| 1 after boot | 179 tex, **169.8 MB** | 180 tex, **170.1 MB** | +0.3 MB |
| 2 on the world map | 218 tex, **231.0 MB** | 219 tex, **231.3 MB** | +0.3 MB |
| 3 during a level | 184 tex, **205.3 MB** | 186 tex, **262.2 MB** | **+56.9 MB** |
| 4 back on the world map | 218 tex, **231.0 MB** | 220 tex, **287.8 MB** | **+56.8 MB** |
| 5 after a restart | 184 tex, **205.3 MB** | 187 tex, **318.8 MB** | **+113.5 MB** |
| peak | **231.0 MB** | **287.8 MB** | +56.8 MB |
| growth, boot → after a level | **61.1 MB** | **117.7 MB** | +56.6 MB |

Phaser 3 returns to the same number every cycle. Phaser 4 does not: it climbs
by 56.6 MB every time the world map is built.

**The cause is upstream and it is not our code.** The world-map background is an
ordinary `this.add.tileSprite(...)`. TileSprite generates a canvas texture keyed
by a UUID and registers it with the TextureManager. At point 4 the dump shows
*two* of them:

```
229a768e-...  6870x2160 56.6MB     <- the previous world map's, never freed
69f4f4f6-...  6870x2160 56.6MB     <- the new one
```

Phaser 3's `TileSprite.preDestroy` ends with:

```js
var texture = this.texture;
if (texture) { texture.destroy(); }
```

Phaser 4's `TileSprite.preDestroy` sets `this.displayTexture = null` and
**never destroys the texture**. The key added at construction
(`scene.sys.textures.addCanvas(this._displayTextureKey, this.canvas)`) is never
removed — there is no `textures.remove` anywhere in the file.

**Still present in Phaser 4.2.1**, which was checked directly; this is not
something a version bump fixes today. A downstream workaround is possible
(destroy the generated texture by key on scene shutdown) but it is a patch over
an engine bug, and this repo already carries 231 MB of textures on a phone.

### Bundle size

`npm install` cannot run here, so `vite build` cannot run and **the real
tree-shaken bundle is unmeasured**. What can be measured is the dist Vite would
tree-shake from:

| dist | 3.90.0 | 4.0.0 | delta |
|---|---|---|---|
| `phaser.min.js` (UMD, what the harness loads) | 1,196,122 | 1,351,807 | **+155,685 (+13.0%)** |
| `phaser.esm.min.js` (what the bundler consumes) | 1,197,130 | 1,352,890 | **+155,760 (+13.0%)** |
| `phaser.js` (unminified) | 7,621,255 | 8,377,352 | +756,097 (+9.9%) |

Treat +13% as an upper bound on the shipped delta, not a measurement of it.

---

## Step 2 — what the migration actually cost

The audit against the official v4.0 migration guide's checklist came back
almost entirely empty. Not present anywhere in `src/`: custom WebGL pipelines,
`preFX`/`postFX`, `BitmapMask`, `ColorMatrix`, `setTintFill`, `Geom.Point`,
`Math.TAU`/`PI2`, `Struct.Set`/`Struct.Map`, `Shader` or GLSL, lighting or
`Light2D`, `Mesh`/`Plane`, Spine, `Create.GenerateTexture`, the `Grid` shape,
compressed textures, or any direct `Camera#matrix` access. The game uses a
small, mostly core slice of Phaser: `Scene`, `Image`, `Text`, `Graphics`,
`Container`, `Rectangle`, `Sprite`, `Math.Clamp`.

Three items landed, and only three:

1. **`RenderTexture` buffers its draw commands.** v3 executed `draw`/`erase`
   immediately; v4 queues them and `render()` runs them. `ScratchCard` needs a
   `render()` after each, or the foil is never laid down and the prize is
   visible from the start. Two call sites.
2. **`make.image({ key, add: false })` no longer typechecks.** The one CI error,
   above. One call site.
3. **`createGeometryMask()` no longer works in WebGL.** Below — the one that is
   not a small fix.

### The two things the brief flagged

**`roundPixels` now defaults to `false`. It does not bite this repo.**
`src/config.ts:31` sets `roundPixels: true` explicitly, with a comment
explaining why, and has done since the retina work — so the changed default
never applies. The *semantics* did change, and that is not free: v4 rounds only
when an object is axis-aligned and unscaled, and adds per-object
`vertexRoundMode`. That is a live candidate for the sub-pixel screenshot
differences above.

**Canvas is deprecated, and the game is NOT WebGL-only.** `src/config.ts:15` is
`type: Phaser.AUTO`, so Canvas remains a real fallback path, and the codebase
deliberately handles it — `RenderHealth.ts` has a `gameContext` branch for the
2D renderer and `CrashContext.ts` reports `canvas` vs `webgl`. Phaser 4 still
ships `CanvasRenderer`, so `AUTO` still works and nothing broke. Two things
follow, and the second is the dangerous one:

- The harness's default runs use `--disable-gpu`, under which Phaser falls back
  to Canvas. Every screenshot table above is **Canvas-rendered on both engines**
  (`Phaser v4.0.0 (Canvas | Web Audio)` in the run log).
- **So the harness's default mode renders on the one path where v4's masks
  still work, and players render on the path where they do not.**

### The mask regression, and why everything stayed green

Phaser 4's own source says it plainly:

> GeometryMask is only supported in the Canvas Renderer.

and `Components.Mask.setMask` now begins:

```js
if (this.scene.renderer.type === CONST.WEBGL) {
    console.warn('...setMask: This method is not supported in WebGL. Create a Mask filter instead.');
    return this;
}
```

Two call sites use it — `ControlDrawer.ts:215` (the tower drawer's scrolling
grid) and `LoadoutScene.ts:1189` (the loadout's scroll band). Running the
`loadout` scenario with `GL=1` on Phaser 4 produces exactly **two** of those
warnings. The clip is gone; content that should be cut at the band edge is not.

**And the scenario still exited 0.** So did all 993 tests, and so did the
layout audit. A visual regression on the path real players use was invisible to
every automated check this repo has. That is the concrete instance of the
warning in the brief about the nine non-asserting scenarios, and it is worse
than that warning assumed: the asserting checks missed it too.

The fix is not mechanical. The guide says to use
`gameObject.filters.internal.addMask(...)`, but **`Container` has no
`filters` in v4** — it mixes in `Components.Mask` and not `Components.Filters`;
only `Layer` and `CaptureFrame` have filters. Both of our masked objects are
Containers, and both are nested *inside* another Container, so they cannot
simply become Layers either (a Layer cannot be a child of a Container). Getting
clipping back means restructuring both widgets, or replacing clipping with
culling — which changes the look, and `LoadoutScene.ts` carries a comment
explaining that a hard-cut card reads as a broken screen, which is why the soft
fade band exists.

---

## Step 4 — the question that matters most

### What Phaser 4 does that Phaser 3 does not

Read from source, not from the announcement. Both engines have
`setContextHandlers`, `dispatchContextLost` and `dispatchContextRestored`, and
in Phaser 3 those carry `@since 3.85.0`. Both restore by walking their GL
object wrappers and calling `createResource()` on each:

| | Phaser 3.90.0 | Phaser 4.0.0 |
|---|---|---|
| `webglcontextlost` handler, `preventDefault()` | yes | yes |
| texture / buffer / framebuffer / program wrappers recreated | yes | yes |
| attrib + uniform location wrappers | yes | folded into the program wrappers |
| VAO wrappers | — | yes |
| GL state reset | by hand: `currentProgram = null`, `setBlendMode`, `gl.disable(BLEND)`, `gl.disable(DEPTH_TEST)`, `gl.enable(CULL_FACE)` | `glWrapper.update(getDefault(), true)` + `glTextureUnits.init()` |
| pipelines / render nodes restored | `pipelines.restoreContext()` | not needed — render nodes hold no GL state of their own |
| resize + extensions re-fetched | yes | yes |

So v4's version is **tidier**, not new. The managed-state design means there is
no hand-written list of GL flags to fall out of date, which is a genuine
robustness improvement — but it is a refactor of a mechanism Phaser 3.90
already has, not the arrival of one.

### Does the game survive a forced context loss?

`tools/harness/index.html` gained a `ctxsurvive` scenario that drives a real
`WEBGL_lose_context` under SwiftShader (`GL=1`) and asks four things: is the
loop still stepping, is the canvas still drawing, is the renderer out of its
lost state, is the run intact. It uses nothing version-specific.

```bash
GL=1 sh tools/harness/run.sh ctxsurvive 260 844x390
```

| | Phaser 3.90.0 | Phaser 4.0.0 |
|---|---|---|
| ink before loss | 94.8% | 94.8% |
| ink during loss | **-1%** (renderer drawing nothing) | **-1%** |
| ink after restore | **96.4%** | **96.4%** |
| `game.loop.frame` after restore | 133 → 136, still advancing | 143 → 149, still advancing |
| `renderer.contextLost` / `gl.isContextLost()` | false / false | false / false |
| run state | live — hero Cory, wave 0, lives 20 | live — hero Cory, wave 0, lives 20 |
| verdict | **SURVIVED** | **SURVIVED** |

**Forced context loss is survivable on Phaser 3 as well as on Phaser 4.** This
is the answer the brief called the highest-value thing in it, and it removes
the leading justification for migrating.

It does not by itself close the iPhone crash hunt — the harness is Chromium and
the crash is Safari-only, and `reports/2026-09-08-the-crash.md` already
establishes that the crash writes a report, so JavaScript threw rather than the
tab being killed. What it does close is the hypothesis that *Phaser 3 cannot
recover a lost context*. It can, here, on demand.

---

## What went wrong in this session, and what it cost

Three instrument faults, each of which produced a confident, wrong answer
before being caught. Recorded because the pattern is the point.

1. **A run labelled Phaser 3 was Phaser 4.** The queued rebuild picked up the
   `build.sh` default I had already flipped. Caught only because `ctxsurvive`
   prints `Phaser.VERSION`. Every subsequent run names its dist and md5-checks
   the staged file.
2. **The first "still drawing" check measured a constant.** It read
   `canvas.toDataURL().length` and reported the same 81702 bytes before the
   loss, after it, and on two different renderers. Under `GL=1` there is no
   `preserveDrawingBuffer`, so `toDataURL` returns a blank frame — the saved
   screenshot was solid black. **Every screenshot this harness takes under
   `GL=1` is black for this reason**; the default Canvas2D runs are unaffected,
   which is why it went unnoticed until now. The probe now goes through
   `renderer.snapshot`, which hooks the renderer's own post-render step.
3. **The fixed probe then broke what it was measuring.** A `snapshot` requested
   while the context is lost is never taken, so the request stayed armed, and
   on *both* engines that froze the game loop at the frame it was made. It read
   exactly like "the engine did not survive" — on Phaser 3 and Phaser 4 alike.
   The pending request is now disarmed on timeout.

Fault 3 is the one to keep. The instrument reported a dramatic negative result
on both engines simultaneously, which is precisely the shape of an instrument
bug rather than a finding — two independent engines rarely fail identically.
The during-loss sample is retained deliberately as the control: a probe that
reads the same number with the context dead is not measuring the canvas.

---

## Answers to the five questions

**Does the game run on Phaser 4 at all?** Yes, fully. It builds, typechecks
against real v4 typings, boots through the normal path (`splash -> title:
true`), reaches every screen, plays a level to completion and returns to the
world map. No page errors, no boot failure, no console errors from the game.

**How many tests broke, and how many were real regressions?** Zero of 993
broke, and that number is meaningless — the suite imports no engine and cannot
see Phaser. CI's `tsc` found exactly **one** error against the real typings; it
is changed behaviour (a v4 typings gap, not a runtime change) and was a
one-line fix. The two regressions that matter broke **no test at all**: the
TileSprite texture leak and the WebGL mask no-op.

**Is forced context loss survivable on 4 and not on 3?** It is survivable on
**both**. Phaser 3.90 has had full context restoration since 3.85.0, and the
game demonstrably recovers on it. The premise was wrong.

**Remaining work to make the branch shippable.** Roughly **3–5 days**, and it
is not the migration:

- Restructure the two clipped widgets so they clip again in WebGL, or replace
  clipping with culling and redesign the affordance. Neither is mechanical;
  Containers have no filters in v4. *~2 days, and it needs a look from Cory
  because it changes how the loadout reads.*
- Work around the TileSprite texture leak downstream, or wait for upstream.
  *~0.5 day for the workaround.*
- Explain and settle the 8–12% sub-pixel screenshot change at the phone
  viewport, and separate the inset confound. *~0.5–1 day.*
- Teach the harness to assert something about clipping and about texture growth,
  since nothing currently does. *~1 day, and this is worth doing whatever is
  decided about Phaser 4.*
- Re-audit at all four viewports under `GL=1` once the black-screenshot problem
  is dealt with.

**Would I recommend it? No — not now.** Not because the migration is hard: it
is genuinely small, and that is the pleasant surprise. It is because the
trade has gone negative. The headline reason for going was context restoration,
and Phaser 3.90 already has it and already survives. Of the other two, one —
`TilemapGPULayer` for the 31.6 MB plates — cannot even be evaluated from this
pass because the brief correctly forbade adopting it, and the other,
`SpriteGPULayer`, is for a survivors-like mode that does not exist yet. Against
those unrealised benefits sits a 56.6 MB-per-cycle texture leak that is
unfixed in the latest 4.x, two masks that stop working on the renderer players
actually use, an unexplained visual change at the phone viewport, and +13% of
engine.

Phase 1 is "prove the loop is fun". None of this makes the loop more fun.

**Revisit when** either the TileSprite leak is fixed upstream, or the
survivors-like mode is actually being built and `SpriteGPULayer` is worth real
money. At that point this branch is a good starting point rather than a cost:
the hard part — finding out what breaks — is done, and it is a short list.

---

## Where this leaves the repository

**In flight:** nothing. The branch is pushed, CI is green on the head
(`d439f2b`), and it is not merged. Nothing is waiting on a build.

**Waiting on a decision — Cory's:** whether to keep this branch at all. If the
answer is no, deleting `vendor/phaser4.min.js` and reverting the one-line
default in `tools/harness/build.sh` removes the whole thing;
`vendor/README.md` says so in place.

**Worth taking off this branch even if Phaser 4 is dropped:**

- The `ctxsurvive` scenario (`5bc8b39`) is engine-agnostic and it answers a
  question no other scenario answers. It also documents that **`GL=1`
  screenshots are black**, which invalidates the pictures from any earlier
  `GL=1` run and is worth knowing on `main`.
- The finding that the 993-test suite cannot see Phaser at all. That is not a
  Phaser 4 problem; it is true today on `main`, and it means any future
  rendering change ships unguarded.

**Carried forward from `reports/2026-09-08-outside-the-guards.md` and still
open:** the iPhone standalone crash is unexplained. Six hypotheses are down.
This spike removes a seventh — "Phaser 3 cannot recover a lost context" — by
demonstrating that it can. The safe-area inset path remains the best-fitting
suspect on the evidence and still does not reproduce in the harness.

**Not verified, and not claimed:** nothing was checked on a real device or on
the live site. The sandbox cannot reach github.io, and Safari was never
exercised. Every result here is headless Chromium, and the mask and
context-loss results specifically are SwiftShader under `GL=1`.

**Known-failing on both engines, so not a migration finding:** the `drawer`
scenario throws under `GL=1` (`Cannot read properties of undefined (reading
'x')`) on Phaser 3 as well as Phaser 4. Pre-existing; not investigated here.
