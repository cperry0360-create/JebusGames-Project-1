# Outside the guards

**A `webglcontextlost` handler already existed.** It has been in
`Lifecycle.installContextLossGuard` since before any of this work, it calls
`e.preventDefault()` so the loss is recoverable, and it logs `webgl context
lost`. So the brief's premise is half right: the handler was there — but
**no report has ever carried its line**, and nothing has ever asked the context
directly. That is what changed.

| commit | what | CI |
|---|---|---|
| `d52beb4` | Wrap every listener in the page, Phaser's included (previous pass) | green |
| `a72dacb` | Ask the WebGL context directly whether it is gone | **green** — test, typecheck, `deploy / build`, `deploy / deploy` all success |
| this report | markdown only; its row is filled by the commit after it | |

---

## Step 3 first, because it is the lead

### Did a context-loss handler exist?

Yes, and it is not naive:

```ts
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault()                      // without this the loss is permanent
  logEvent('lifecycle', 'webgl context lost')
  handlers.onLost()
})
canvas.addEventListener('webglcontextrestored', () => { ... })
```

`onLost` also puts the render loop to sleep, with a comment noting that pausing
a scene does not stop Phaser drawing its display list — a draw into a lost
context being the exception it was written to prevent. Somebody had thought
about this before.

**What is genuinely missing is evidence, not a handler.** Six reports, none
carrying `webgl context lost`. That is suggestive and it is not proof: a context
that dies with the page may never dispatch the event at all, and the event log
is a 500-entry ring buffer.

### So ask the context instead of the event

`GraphicsWatch.ts` puts five things in the crash report that have never been in
one:

| field | what it answers |
|---|---|
| `webglContextLost` | `gl.isContextLost()`, live, at the moment the report is written |
| `drawingBuffer` | the allocation the phone may refuse to keep — `0x0` on a dead context |
| `contextLostEvents` / `contextRestoredEvents` | how many times it dropped and came back |
| `lastContextLost` | how long before the crash |
| `contextLossGuard` | `attached` / `NOT ATTACHED (no canvas)` / `never ran` |

That last one closes a silent gap I found while reading:
`installContextLossGuard` returned early and **quietly** when there was no
canvas, so a session where the listeners never went on looked identical to one
where they did and nothing dropped. It records either way now.

### Driven for real, not asserted

Every previous harness report said `renderer = canvas`, because `run.sh` passes
`--disable-gpu` and Phaser falls back to Canvas2D. **You cannot lose a context
that was never created**, so `run.sh` gains `GL=1`, which swaps that for
SwiftShader and gives a real WebGL context.

`GL=1 sh tools/harness/run.sh webglwatch 190 844x390`:

```
renderer: webgl
before loseContext   webglContextLost=false  drawingBuffer=2532x1170  lost=1
AFTER  loseContext   webglContextLost=true   drawingBuffer=0x0        lost=2
crash report says    webglContextLost = true | contextLostEvents = 2 | drawingBuffer = 0x0
after restoreContext webglContextLost=false  drawingBuffer=2532x1170  restored=1
```

A real driver-level context loss is observed, recorded, and **reaches the crash
report**. That is the deliverable.

### Does the fit still hold?

Every fact in six reports, against this candidate:

| fact | context loss explains it? |
|---|---|
| `Script error.` with no stack from a same-origin bundle | yes — nothing in the JavaScript threw |
| dies on Splash in one report, Title in another | yes — scene-independent |
| Safari-only; Chrome on the same phone is fine | yes — WebKit drops contexts far more readily |
| iPad is fine | yes — more headroom for a large buffer |
| fires when the Share sheet composites over the page | yes — that is exactly when a context is reclaimed |
| gate held 26ms in one report and 1858ms in another | yes — unrelated to the gate |
| 2868x915 drawing buffer at dpr 3 | a large allocation to ask a phone to keep |

It remains the leading candidate and it is now falsifiable in one tap.

### Does the game register anything that is not part of the bundle?

Yes — **`index.html`'s inline script block**, and it is worth being precise
because it is registered *before* the module loads and therefore before the
`addEventListener` patch, so it is the one thing in the page **not wrapped**:

| registered in the inline block | wrapped? |
|---|---|
| `window.addEventListener('error', …)` — the pre-boot error queue | no |
| `window.addEventListener('unhandledrejection', …)` | no |
| `setTimeout(…, 2500)` inside `note()` — draws the pre-boot panel | no |
| `fetch('./version.json').then(…).catch(…)` — the stale-build reload check | no |

None of them is a plausible source of this crash: they are eight lines of
`try`/`catch`-wrapped DOM writes, the `fetch` chain has its own `.catch`, and a
throw in any of them would be attributed to `index.html`, which is same-origin
and would **not** be muted. But the brief asked what is outside the bundle, and
that is the complete list. Nothing else in the page registers a listener from a
string, and there is no `eval`, no injected script and no worker.

---

## Steps 1 and 2 — the approach used

**Step 2's global patch**, landed in `d52beb4` on the previous pass, and it is
what covers what Phaser owns. `EventTarget.prototype.addEventListener` is
patched before the game is constructed, so Phaser's ScaleManager, InputManager,
InputPlugin, visibility and context listeners are all wrapped **by
construction** rather than by hunting them through a minified bundle.

I chose that over step 1 deliberately. The record for hand-picking a wrap site
in this codebase is bad: `game.step` was wrapped, reported itself installed, and
caught nothing because `TimeStep` captures a bound reference; the same trap
caught the test, because Phaser also caches `scene.update` as `sys.sceneUpdate`.
A patch on `addEventListener` has no equivalent hiding place.

### The guard-count table

Each row is a **throwing probe at the target and type Phaser uses**, dispatched
and checked — not an assertion that the wrapping "should" cover it. Phaser
registered its own listeners after the patch, so a wrapper covering the pair
covers Phaser's registration of it.

```
CAUGHT resize                ScaleManager
CAUGHT orientationchange     ScaleManager
CAUGHT mousedown             InputManager (canvas)
CAUGHT touchstart            InputManager (canvas)
CAUGHT pointerdown           InputPlugin (canvas)
CAUGHT visibilitychange      visibility
CAUGHT blur                  focus/blur
CAUGHT webglcontextrestored  context
CAUGHT webglcontextlost      context
```

```
full guard counts: {"a \"resize\" listener on window":1,
  "a \"orientationchange\" listener on window":1,
  "a \"mousedown\" listener on canvas":1, "a \"touchstart\" listener on canvas":1,
  "a \"pointerdown\" listener on canvas":1,
  "a \"visibilitychange\" listener on #document":1,
  "a \"blur\" listener on window":1,
  "a \"webglcontextrestored\" listener on canvas":1}

listener stats: {"installed":true,"wrappedListeners":54, ...}
```

54 listeners wrapped. Independently, `listenerguard` shows the count going 36 →
47 across game construction — those eleven are Phaser's — and a `mousedown`
dispatched at the canvas running through the wrapper, which nothing in `src/`
could account for.

## Verification

**The harness is headless Chromium and this crash is Safari-only. It can prove a
wrapper catches; it can never reproduce the fault.** Nothing below implies
otherwise.

- **993/993 tests pass.**
- **`sh tools/tsdiff.sh 74b54f5`** — baseline 212, working tree 212, **zero
  introduced**.
- **`webglwatch`** (with `GL=1`) — a real context loss recorded and carried into
  the report; every listener category caught. Exit 0.
- **`listenerguard`, `loopthrow`, `crashreport`, `standalone`, `realboot`** — all
  clean.
- **`screens`** at 667x375, 844x390 and 1400x820 — matches the established
  baseline, only the pre-existing version-stamp fault.
- **Not used as evidence:** none of the nine scenarios known not to assert
  (`ui`, `muzzle`, `buildall`, `rockets`, `retreat`, `regressions`, `poor`,
  `typegame`, `meteor`).
- **No live check.** The sandbox cannot reach github.io; none was attempted.

## Where this leaves the repository

`main` at `a72dacb`, working tree clean, deployed.

**The next report decides it, in one tap.** Tap Share in Safari, in a tab:

- **`webglContextLost = true`** — that is the diagnosis. Six passes of guessing
  end. The fix is then a real design question about the drawing buffer and how
  the game survives a reclaim, not a guess.
- **`webglContextLost = false` and a `caught inside …` line** — the throw is in
  JavaScript after all and the line names it.
- **`webglContextLost = false`, no `caught inside …`, but `lastEvent` still
  running** — not a listener, not the context; the beacon names what was in
  flight and the field narrows again.
- **`contextLossGuard = NOT ATTACHED`** — the diagnostic itself was never armed
  on that device, which would explain the silence in all six reports.

**Open, unchanged.**

1. The 35 layout faults at 956x305 — three Title controls under the notch inset,
   five loadout chips at 42px against a 44pt floor.
2. `claude/mind-laser-glacier-fixes-ne2f14`, unmerged: 4 ahead, 10 behind,
   conflict-free.
3. Carried forward: the 56.6 MB world-map TileSprite, `map_level5.webp` at half
   resolution, 124.7 MB of level-only art at boot, the absent web app manifest.
4. **New, and only a note:** every harness run before this one used the Canvas2D
   renderer, so no rendering conclusion this repository has ever drawn was drawn
   on WebGL. `GL=1` now exists; nothing has been re-audited under it.
