# The settle burst: what the gate's streak counter is actually counting

**The gate raised in 1.0 ms. Three rendered frames at 60fps would be 33.3 ms.**
The finding is confirmed, measured rather than inferred, and the 21 ms
raise-and-lower in the crash report is now ordinary rather than impossible.

`settle()`'s three timers **are** wrapped, with an origin stack naming `settle`
itself, and a throw in one is described in full rather than reaching a report as
a bare `Script error.`

The rotation scenario reproduces the **mechanism** and does not reproduce a
crash. Hammering the burst cycle twelve times over throws nothing at all. And
the reported state — landscape layout in a portrait window with the overlay
hidden — turns out to need something the stale predicate alone does not supply.

| commit | what | CI |
|---|---|---|
| `850fc24` | Trace which clock calls the orientation sync, and measure the burst | **green** — all five jobs success ([run 256](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34344578061)) |
| `c5e185c` | Hammer the burst cycle and watch, and stop asserting a held gate is a lock | **green** — all five jobs success ([run 257](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34345164319)) |
| `2e6ecc2` | This report | **green** — checks ran, `deploy` **skipped** (markdown only) ([run 258](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34345555523)) |
| `2a1624a` | Name the stale-canvas suspect, and stop ENTER_FRAMES claiming frames | **green** — all five jobs success (run 259) |

Run 258 is the deploy filter working as designed: a markdown-only commit ran
`test`, `typecheck` and `changes`, and the `deploy` job's conclusion is
`skipped`. Run 259 deployed, correctly — the filter is path-based, so a
comment-only change to a `.ts` file is still a code change and still publishes.
The commit adding run 259's row is markdown and stops the regress there.

Nothing here is a fix. No hysteresis was added, nothing is swallowed, and no
decision reads the new instrument. Item 4 of the brief, kept.

---

## 1. What the streak counter counts

`ENTER_FRAMES` is 3 and its comment reasons in frames — *"three frames is under
50ms at 60fps"*. The counter has never known what a frame is. It increments once
per `sync()` **call**, and `sync()` runs from two clocks.

Every call now carries a timestamp and the name of the clock that made it
(`src/systems/OrientationTrace.ts`). `run.sh rotationburst` reads it back.

### The measurement

Three events dispatched in one tick, with the portrait predicate forced:

```
+0.0ms resize:now            portrait=true streak=1 up=false 1400x628
+0.5ms orientationchange:now portrait=true streak=2 up=false 1400x628
+1.0ms visualViewport:now    portrait=true streak=3 up=true  RAISED 1400x628
```

**1.00 ms**, and repeated at 1.10 ms on a second run. Each event's `:now` leg
runs synchronously inside the dispatch, so three calls land before the tick
ends and the streak is satisfied by a guard documented as taking three frames.

### The whole burst, from one rotation's worth of events

Three events, 746 ms of observation:

| | |
|---|---|
| `sync()` calls | **26** |
| of which came from `settle`, not from a frame | **15** |
| bursts of 2+ calls inside 8 ms | **5** |

```
burst of 3: resize:now, orientationchange:now, visualViewport:now   spanning 1.20ms
burst of 3: resize:raf, orientationchange:raf, visualViewport:raf   spanning 0.30ms
burst of 3: resize:60,  orientationchange:60,  visualViewport:60    spanning 8.40ms
burst of 3: resize:180, orientationchange:180, visualViewport:180   spanning 11.40ms
```

Three calls spanning **0.30 ms**. At 60fps two frames cannot land inside 16.7 ms,
so every one of those groups is the streak counting something that is not a
frame. Fifteen of the twenty-six calls in a rotation are settle legs.

**This is why `CrashContext` carries a raise and a lower 21 ms apart.** It is not
a fast phone or a mis-stamped log; it is three settle legs and then a landscape
reading, and the counter cannot tell that from four frames.

`tests/orientationtrace.test.ts` pins this as a property of the counter rather
than as a story about one run — including the case that makes it plain: three
`sync` calls with **no time passing at all** raise the gate.

## 2. `settle()`'s own timers are wrapped

Asked because a guard that reports itself installed and catches nothing is worse
than none — and answered by reading the guard's own record during a real resize
rather than by reasoning about `window` versus `globalThis`.

Immediately after a dispatched `resize`:

```
timersArmed: 4   timersPending: 3   pendingDuringAnEvent: 3
timeout(60ms)  armed during "resize on window" from at settle (Orientation.js:291:20)
timeout(180ms) armed during "resize on window" from at settle (Orientation.js:291:20)
timeout(400ms) armed during "resize on window" from at settle (Orientation.js:291:20)
```

All three legs are there, all three are recorded as armed **during a DOM event**,
and the origin stack names `settle` and the listener that called it. That is
better than the question asked for: a throw in one of those callbacks would
arrive naming not just the callback but the event that armed it.

**And a throw is genuinely described.** Driven, not asserted — a real throw
through `window.setTimeout(…, 60)`, the same path settle's legs use:

```
counts: {"a timeout callback (60ms)": 1}
logged: caught in a timeout callback (60ms): TypeError: deliberate: a throw
        from settle's own scheduling path
```

So if the crash is in a settle leg, the next report says so by name. It will not
come back as `Script error.`

## 3. What the predicate governs, and what it does not

This is the part that changed the shape of the question.

The obvious reading of the video — landscape layout, portrait window, overlay
hidden — is "the predicate went stale and everything followed it". **Half of
that is wrong.**

Forcing the script's predicate to landscape inside a real 390x844 window:

| | |
|---|---|
| `isPortrait()` | `false` — the forced value |
| gate holding | `[]` — **it released every scene it was holding** |
| canvas | `1170x2532` |
| camera | `1170x2532`, zoom 3.517 — **still the shape of the real window** |

**The gate follows the predicate. The layout does not.** `applyResolution`
measures the parent element, so the canvas and the camera stay the shape of the
window whatever the predicate says.

So a stale predicate on its own produces a **running game in a portrait window** —
not a landscape layout squeezed into one. **The sideways render in the video
needs a stale CANVAS as well**, which is a different measurement in a different
function, and that is where the next look should go.

### Chromium cannot reproduce the reported state, and the reason is a finding

`overlayVisible()` reads `getComputedStyle`, so the overlay is driven by the
stylesheet's own `@media (orientation: portrait)` — evaluated by the engine, and
unreachable from JavaScript. Overriding `window.matchMedia` moves the **script**
and leaves the **stylesheet** where it was: in the run above, `isPortrait()` went
`false` while `overlayVisible()` stayed `true`.

On iOS both derive from one stale viewport and go wrong **together**, which is
exactly why the crash report carries `portrait=false` *and* `rotateOverlay=hidden`.
Here they cannot be desynchronised from userland at all.

This is the cost of the earlier fix that pointed both at one predicate. It
removed the disagreement that used to make this detectable — and it also removed
the only way to model the failure outside iOS.

## 4. The overlay and the gate are not the same question

Measured directly, and it matters for reading any crash report:

```
portrait frame 1   overlay=VISIBLE  gateUp=false
portrait frame 2   overlay=VISIBLE  gateUp=false
portrait frame 3   overlay=VISIBLE  gateUp=true   raised
landscape frame 1  overlay=hidden   gateUp=false  lowered
```

The overlay is pure CSS and has **no hysteresis**; the gate has three readings of
it. For the first two portrait readings of every rotation the overlay is up and
the game is still running behind it. `rotateOverlay` and the gate's own state are
two different facts, and a report carrying one says nothing about the other.

## 5. So what does the burst actually do? Nothing that throws

The question is what throws, so the cycle was driven hard rather than reasoned
about. Twelve alternating rotations back to back, no pause between them — each
raising and lowering the gate, pausing and resuming every scene, pausing and
resuming all audio, and resizing the canvas on each of the fifteen calls:

| | |
|---|---|
| `sync()` calls | 120 |
| raises / lowers | 2 / 2 |
| new guard trips | **none** |
| page errors | **none** |
| scenes still held at the end | **none** |

**Nothing threw.** That is a negative result and it is worth having: rapid
raise/lower cycling is not the crash, at least not in Chromium. The burst
explains the 21 ms raise-and-lower; it does not yet explain the failure.

## 6. The stale-canvas lead: `applyResolution`, and where to break on it

**The function is `applyResolution(game)` in `src/systems/Resolution.ts`.** It is
the only thing in the game that sizes the canvas, and it is the other half the
sideways render needs. This section names it precisely and stops there — it is
a lead, not a diagnosis, and confirming or killing it needs a device.

### What it measures

```ts
const parent = game.scale.parent as HTMLElement | null   // config.ts: parent: 'game'
const box    = parent?.getBoundingClientRect?.()
const cssW   = Math.max(1, Math.round(box?.width  || g.innerWidth  || 1))
const cssH   = Math.max(1, Math.round(box?.height || g.innerHeight || 1))
if (game.scale.zoom !== 1 / dpr) game.scale.setZoom(1 / dpr)
game.scale.resize(cssW * dpr, cssH * dpr)
```

It measures **`#game`'s bounding box**, not the window. `#game` is styled
`width: 100vw; height: 100vh; height: 100dvh`, so its box is resolved from the
**layout viewport**. The canvas is then set to that box times the latched device
ratio, with the scale manager's zoom at `1/dpr`.

### When it runs

**From exactly one call site**: `measure()`, inside `settle()` in
`Orientation.ts`. Nowhere else — `git grep applyResolution` finds the import,
the comment and that one call.

`settle()` runs it five times per event — immediately, on the next rAF, and at
60 ms, 180 ms and 400 ms — and is bound to `resize`, `orientationchange`,
`visualViewport resize` and `screen.orientation change`, plus once at install.
A rotation therefore re-measures the canvas about **fifteen times in 400 ms**
and then **stops**.

**`POST_STEP` does not call it.** The per-frame hook calls `sync()` only, so the
gate is re-evaluated every frame forever while the canvas is re-measured only
inside a 400 ms window after a DOM event. That asymmetry is the shape of the
bug: a gate that keeps thinking, over a canvas that stopped measuring.

### What would make it stale, ranked

1. **The layout viewport lags the rotation.** `100vw`/`100dvh` resolve against
   the layout viewport, which iOS updates asynchronously around a rotation. A
   `getBoundingClientRect()` taken inside that window returns the
   **pre-rotation, landscape-shaped** box, and `resize()` makes a landscape
   canvas inside a portrait window. That is the sideways render, and it is the
   first thing to look at.
2. **The ladder ends at 400 ms and nothing re-measures after it.** If iOS
   settles later than that, the last measurement stands until the next DOM
   event. The reports already show gate holds of **3162 ms**, so iOS is
   demonstrably capable of being slower than the ladder is long.
3. **The `||` fallbacks are per-axis and can mix two moments into one canvas.**
   `box?.width || g.innerWidth` and `box?.height || g.innerHeight` are
   independent expressions, and `||` (not `??`) means a legitimately-zero
   dimension falls through. A box that is momentarily 0-wide but has a height
   takes its width from `innerWidth` and its height from `box.height` — two
   different sources, possibly two different moments, in one `resize()` call.
4. **`dpr` can be latched wrong.** `refreshDeviceScale()` returns early without
   re-reading while `document.visibilityState === 'hidden'`, so a rotation
   performed while the app is backgrounding keeps the old ratio and the canvas
   is sized `css * dpr` against it. `Resolution.ts` already documents a crash
   report that recorded **`dpr = 1` on a phone whose ratio is 3**. This does not
   produce a sideways canvas, but it does produce a wrong one.

### Where to put the breakpoint

`src/systems/Resolution.ts`, in `applyResolution`, on:

```ts
const box = parent?.getBoundingClientRect?.()
```

Break there, rotate the phone, and step the five legs of each event. At each
one, read:

| read | why |
|---|---|
| `box.width`, `box.height` | what the canvas is about to be sized from |
| `window.innerWidth/innerHeight` | the fallback, and whether it agrees |
| `window.visualViewport.width/height` | the third viewport, which can differ from both |
| `screen.orientation.angle` | ground truth for which way the phone is |
| `matchMedia('(orientation: portrait)').matches` | what the gate and the overlay both believe |
| `game.scale.width/height` after the call | what actually landed |

**The signature of the fault is a leg where `box` is landscape-shaped while
`screen.orientation.angle` says the phone is portrait** — and, if the lead is
right, no further leg after 400 ms to correct it.

The coherent story to test: on iOS the media query, the box and `innerWidth`
all go stale **together** — which is exactly why the crash report carries
`portrait=false` *and* `rotateOverlay=hidden` — so inside that window the gate
stays down, the overlay stays hidden, and the canvas is sized landscape. If iOS
settles the layout viewport after the 400 ms ladder has finished, nothing
re-measures and the landscape canvas stays in the portrait window until the next
DOM event. That is the video.

**Not fixed, and deliberately not.** Every candidate above has an obvious
one-line repair and all of them are guesses until someone watches the numbers on
the device.

---

## Verification

Everything here is headless Chromium in this sandbox. **It cannot reach
github.io — the egress proxy answers 403 by policy — and it is not an iPhone.
No live or device verification is claimed.**

- **Tests** — `node --test 'tests/*.test.ts'`: **1024 pass, 0 fail** (1018
  before, plus six in `tests/orientationtrace.test.ts`).
- **Typecheck** — `sh tools/tsdiff.sh 9fb87c1`: baseline **212** distinct errors,
  working tree **212**, **zero introduced**. It caught one real error on the way
  in: a `CrashContext` fallback typed against the wrong union.
- **`rotationburst`** — clean at 1400x820 (exit 0). At 390x844 the scenario is
  clean and the run exits 4, which is `BOOT FAILED`: portrait is gated, so the
  game genuinely does not boot through splash to title there and every scene in
  that run was forced by hand. That is the harness reporting honestly, not a
  fault in the scenario.
- **No regression in the gate's own scenarios** — `softlock` exits 0 with
  `NO LOCK: the gate handed the run back`; `stuckguard` exits 0 with
  `RECOVERED and REPORTED`.
- **Reproduce:**
  ```bash
  sh tools/harness/build.sh
  sh tools/harness/run.sh rotationburst 200 1400x820   # sections 1, 2, 5, 6
  sh tools/harness/run.sh rotationburst 200 390x844    # section 3b
  ```

**What is real here and what is a model.** The events are real and `settle` is
the shipping function, so the burst and the call counting are measured. Chromium
cannot be made to rotate and does not go stale the way iOS does, so the stale
reading is **modelled** by overriding the predicate. That models the reported
state; it does not reproduce iOS.

**Three of the scenario's own red results were the instrument, not the game**,
and each is recorded in the source next to what it caught:

1. Section 2 first forced the predicate across **one** event for 60 ms and
   measured a 70.70 ms raise, which looked like the hysteresis working. Two of
   that event's legs read portrait and the third came after the window closed,
   so the raise came from ordinary frames and the burst was never tested.
2. Section 6 expected two raises where a portrait window starts with the gate
   already up and has one fewer to give.
3. Section 6 called a held gate *"the soft lock"* at 390x844, where the window
   really is portrait and holding is the gate working.

One existing test also needed relaxing: `orientation.test.ts` matched
`requestAnimationFrame(measure)` as source text and stopped matching when each
leg was given a name, with every re-measure still in place.

---

## Where this leaves the repository

**`main` is at `c5e185c`.**

**What is now known, and did not need to be guessed:**

1. **The streak counts calls, not frames.** A rotation's three events raise the
   gate in about a millisecond. The 21 ms raise-and-lower is explained.
2. **`settle`'s timers are wrapped**, and a throw in one arrives named, with the
   event that armed it.
3. **A stale predicate releases the gate but does not move the layout.**

**The next measurement, and it is a different function — see section 6:**

4. **The sideways render needs a stale CANVAS, not just a stale predicate.**
   The function is **`applyResolution` in `src/systems/Resolution.ts`**. It
   measures `#game`'s bounding box — `100vw`/`100dvh`, so the layout viewport —
   and sizes the canvas to it. It runs from one call site, `settle()`'s
   `measure()`, about fifteen times per rotation, and **stops 400 ms after the
   last event**; `POST_STEP` never re-runs it, so nothing corrects a stale
   canvas afterwards. Section 6 names the four things that could make it stale,
   the line to break on, and the six values to read at each leg. **This is
   Cory's to confirm with Safari Web Inspector; it cannot be settled here.**
5. **The existing crash reports can be read for this today.** `CrashContext`
   already carries `viewportCss` (`innerWidth x innerHeight`) *and* `portrait`
   (the predicate) *and* `screenAngle`. A report with a portrait-shaped
   `viewportCss` and `portrait=false` says the predicate was stale; one with a
   landscape-shaped `viewportCss` says the whole DOM was. New reports also carry
   `syncBurstsSeen`, `fastestRaiseMs` and a 24-line `syncTrace`, so the next one
   names the clock that raised the gate.

**Deliberately not done, per the brief:**

6. **No hysteresis was added and nothing is swallowed.** The obvious repair —
   count frames, or debounce the burst — is a behaviour change on a code path
   whose failure is not yet understood, and it would destroy the evidence the
   trace was added to collect. **`ENTER_FRAMES`'s comment now says what actually
   happens** rather than claiming three frames: that the streak counts `sync()`
   calls, that `settle()` contributes about fifteen per rotation, that the
   measured raise was 1.0 ms, and that the hysteresis is therefore weakest
   during the rotation it exists for. The behaviour is untouched.

**And this is where it parks.** The harness cannot reproduce the reported state
— `overlayVisible()` reads `getComputedStyle` and no JavaScript stub reaches the
stylesheet's media query, so script and stylesheet cannot be desynchronised from
userland the way iOS desynchronises them from itself. Further off-device work on
this crash is guessing. The next move is a Mac with Safari Web Inspector
attached to the phone, breaking where section 6 says.

**Carried forward, still open:**

7. **`realboot` exits 5 on success** — `drawn > 20` against a clean run's
   `drew=20`. Pre-existing, unchanged, and still the scenario the harness README
   tells you to run before a push. See
   `reports/2026-09-09-manifest-and-cleanup.md`.
8. **Five harness scenarios still assert nothing** — `muzzle`, `rockets`,
   `retreat`, `regressions`, `meteor`. They fail loudly now instead of lying.
9. **`claude/phaser-4-migration-spike-hage91` still has to be deleted from the
   GitHub web UI.** Two sessions have had 403 from the CLI. Everything worth
   keeping is already on `main`.
10. **iOS honours no orientation lock**, in a home screen app, a tab or a
    WKWebView, and Safari does not implement `screen.orientation.lock()`. The
    gate cannot be retired and has to actually work.
