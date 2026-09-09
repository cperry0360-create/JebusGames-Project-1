# What the page schedules, and what it was still holding when it threw

The eighth pass at the iPhone Safari crash. The seventh report closed WebGL
context loss and closed "it is one of the listeners". This one follows the only
lead that survived: **the last listener finished 1754 ms before the throw**.

## Commits

| commit | what | CI |
|---|---|---|
| [`dc0cdb5`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/dc0cdb5) | ScheduleGuard, timestamped listener breadcrumbs, `scheduleguard` scenario, `renderer.snapshot` in `shot()`, the dead-context snapshot proof in `webglwatch` | run 247 — **test, typecheck, deploy/build, deploy/deploy all green**, deployed |
| [`446ea24`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/446ea24) | this report, the `tools/harness/README.md` update, and the five diagnostic scenarios added to its scenario table | run 250 — **all four jobs green**, deployed |

`main` was at `8385d8e` when this work started and had moved four times before
this landed — another session was pushing report commits concurrently. `dc0cdb5`
is a rebase onto `f925718`, no conflicts; `446ea24` is a rebase onto `7e1b9c0`
with one conflict in `tools/harness/README.md`, where both sessions had written
up the same GL=1 finding. Resolved by keeping the fuller text — the measured
byte table and the `webglwatch` proof — since the two said the same thing.
Everything in §8 was re-run **after** the first rebase; the commits rebased over
were report files only, except that README section.

---

## 1. The lead

From the seventh crash report, off the phone:

```
lastEvent     = resize on VisualViewport (finished, 1754ms ago)
cause         = uncaught exception          <- not "caught inside ..."
scenesRunning = Splash
webglContextLost = false
contextLostEvents = 0
contextLossGuard  = attached
```

Three facts and one conclusion.

- The last DOM listener **finished**. A listener that has returned cannot be
  the frame that threw.
- All 41 listeners are wrapped and **not one caught it** — the throw reached
  `window.onerror` uncaught.
- 1754 ms is not a rounding error. Something ran a second and three quarters
  after the viewport settled.

So the throw is on a callback path `addEventListener` wrapping cannot reach: a
timer, an interval, a microtask, a rAF callback, or a promise continuation,
armed by the viewport change and running later.

## 2. What was already covered, and what was not

Before adding anything, each of the six paths the brief named was checked
against the code rather than assumed.

| path | status before this pass |
|---|---|
| `requestAnimationFrame` | **covered.** ListenerGuard wraps it. |
| Phaser tween `onComplete` / `onUpdate` / `onYoyo` | **covered, and ruled out.** Tweens are stepped from inside `Game.step`, which is `loop.callback`, which `guardGameLoop` wraps. A throw there is labelled *the game loop*. The report says the loop guard did not fire. |
| Scene time events (`this.time.delayedCall`, `addEvent`) | **covered, and ruled out**, for the same reason — same call stack. |
| Promise continuations | **partly.** `window.onunhandledrejection` existed and is distinctly labelled (§5). |
| `setTimeout` / `setInterval` | **NOT covered.** This is the gap. |
| `queueMicrotask` | **NOT covered.** |

`Orientation.settle` — the code the Share sheet actually runs — arms three
`window.setTimeout(measure, ms)` calls at 60, 180 and 400 ms. Those particular
callbacks are individually `guarded`. **Anything else armed from inside a
viewport event was not.**

## 3. ScheduleGuard

`src/systems/ScheduleGuard.ts`. Patches `setTimeout`, `setInterval`,
`clearTimeout`, `clearInterval` and `queueMicrotask` on `globalThis`, installed
in `main.ts` immediately after `installListenerGuard()` and **before**
`new Phaser.Game()` — same ordering rule as the listener patch, because only
callbacks armed after the patch are wrapped.

`window.setTimeout` and `globalThis.setTimeout` are the same property in a
browser, so `Orientation.settle`'s form is covered by the same patch.

**Nothing is swallowed.** Every wrapper logs through `noteCaught` and rethrows.
Behaviour is unchanged; the only difference is that the report can name the
callback.

### The half that matters more: who armed it

Catching the throw names the callback, and in a minified bundle that is
`anonymous function`. So the guard also records, for every armed timer:

- kind and requested delay
- how long ago it was armed
- **the DOM event in flight when it was armed**, via a new
  `eventInFlight()` on ListenerGuard
- **four frames of the scheduling stack**

The stack is captured only when a DOM event is in flight or the delay is
≥ 500 ms — `new Error()` is a stack walk and a game loop arms timers
constantly, so paying for it unconditionally would be a real tax for a
diagnostic that matters in one situation.

The frames are **filtered by name, not sliced by index**. V8 writes an
`Error: message` header line and JavaScriptCore does not, so a fixed `slice(2)`
keeps a wrapper frame on Chrome and drops a real caller's frame on Safari — and
Safari is the only browser this crash happens in.

The whole set is registered as a `schedule` crash-report context, so the report
now answers *what was scheduled and still pending when it threw* directly:

```
timersArmed, timersFired, timersPending, pendingDuringAnEvent, pendingDetail
```

`pendingDetail` prefers the entries armed during a DOM event, because those are
the lead; the game's own housekeeping timers are shown only if there are none.

There is a `MAX_PENDING` of 400. A page that arms timers faster than they fire
must not turn this diagnostic into the leak.

## 4. Proving it catches, rather than declaring it installed

The brief's constraint, verbatim: *"DO NOT wrap things speculatively and declare
victory. Prove each new wrapper catches by throwing through it."* A guard that
reported itself installed and caught nothing has already happened once in this
investigation — the `game.step` wrapper.

New scenario, `sh tools/harness/run.sh scheduleguard`, **exit 0**. Six claims,
each proven by throwing through the path:

```
after a throwing setTimeout:   {"a timeout callback (20ms)":1}
after a throwing setInterval:  {"a interval callback (30ms) interval(30ms) armed 137ms ago":1}  ticks=3
after a throwing microtask:    {"a queueMicrotask callback":1}
rejection report:              unhandled rejection | AbortError: deliberate: a rejected promise
```

The origin capture, armed from inside a real dispatched event:

```
pendingDetail = timeout(5000ms) armed 186ms ago during "harness-arm on window"
                from at armer (index.html:985:27)
                  <- at callListener (ListenerGuard.js:79:18)
                  <- at wrapped (ListenerGuard.js:95:13)
                  <- at run (index.html:987:12)
```

That is exactly the shape of the answer wanted from the phone, with
`harness-arm` replaced by `resize on VisualViewport` and the frames replaced by
whatever armed it.

And on a real boot, before any probe fires, the guard already reads the game
honestly:

```
schedule stats at start: timersArmed=46 timersFired=54 timersPending=1
  pendingDetail = interval(500ms) armed 4694ms ago
                  from at installStuckGuard (StuckGuard.js:98:19)
                    <- at installGameStuckGuard (StuckWatch.js:20:12)
```

One pending timer at rest, and it names itself. Note that the harness echoes
`pendingDetail` through a `.slice(0, 200)` for readability — **the crash report
itself is not truncated**; `formatReport` prints the whole string.

## 5. Promise continuations

Confirmed present, distinctly labelled, and would fire: the `unhandledrejection`
handler produces `cause = unhandled rejection` rather than
`uncaught exception`, and carries the rejection's own name and message
(`AbortError: deliberate: a rejected promise` above). So if the phone's next
report still says `uncaught exception`, a rejected promise is ruled out by that
line alone.

## 6. The timeline

ListenerGuard's breadcrumbs now carry a timestamp against each event, on the
same clock as the event log:

```
recentEvents: error@window@5469ms error@window@5815ms error@window@6032ms
              unhandledrejection@window@6426ms harness-arm@window@6886ms
              resize@window@7074ms resize@window@7075ms
```

The seven-event Share sequence and the quiet gap after it can now be **read**
rather than inferred from a single `lastEvent` figure — and every pending timer
carries its own `armed Nms ago`, on the same clock, so a timer armed during the
gap lines up against the events either side of it.

## 7. Every GL=1 screenshot this harness has ever taken was black

Propagated from `reports/2026-09-08-phaser-4-spike.md`, and now **fixed rather
than only recorded**.

`canvas.toDataURL()` reads the drawing buffer; WebGL clears that buffer at end
of frame unless the context was created with `preserveDrawingBuffer`, and
nothing sets it. So under `GL=1` the read landed after the clear.

Measured, `screens 140 844x390` under `GL=1`, one run each way:

| | title screen | game screen |
|---|---|---|
| `toDataURL` (old) | 61,259 bytes | 61,259 bytes |
| `renderer.snapshot` (now) | 3,384,528 bytes | 6,576,444 bytes |

Byte-identical PNGs for two completely different screens is the signature. The
default runs pass `--disable-gpu` and fall back to Canvas2D, where the direct
read is correct — which is why this survived so long.

`shot()` now calls `frame()`: `renderer.snapshot` on WebGL, straight through to
`toDataURL` on Canvas2D.

**And a pending snapshot is disarmed on a 2 s timeout.** A snapshot asked for on
a lost context is never taken, so the request stays armed and the `await` never
returns — it would hang the run silently, in exactly the scenarios written to
create a dead context. Proven in `webglwatch`, which now loses the context for
real and then asks:

```
frame() on a dead context returned after 2063ms, 235282 chars,
  snapshot still armed: false
```

Returns, falls back to the honest black `toDataURL`, and leaves
`renderer.snapshotState.callback` null so nothing fires against the restored
context later.

## 8. Verification

Everything below re-run **after** the rebase onto `f925718`.

| check | result |
|---|---|
| `node --test 'tests/*.test.ts'` | **1008 / 1008 pass** |
| `sh tools/tsdiff.sh dc86e0f` | baseline 212, working tree 212, **zero introduced** |
| `scheduleguard` | exit 0 — every scheduled path wrapped, rejections labelled, pending timers name what armed them |
| `listenerguard` | exit 0 |
| `loopthrow` | exit 0 |
| `crashreport` | exit 0 |
| `standalone` | exit 0 |
| `webglwatch` (`GL=1`) | exit 0, including the new dead-context snapshot check |
| `screens 140 667x375` | 1 fault — the version stamp (below) |
| `screens 140 844x390` | 1 fault — the same one |
| `screens 140 1400x820` | **no layout faults** |
| CI run 247 | test, typecheck, deploy/build, deploy/deploy — **all green, deployed** |

Reproduce:

```sh
sh tools/harness/build.sh
sh tools/harness/run.sh scheduleguard
GL=1 sh tools/harness/run.sh webglwatch
sh tools/harness/run.sh screens 140 844x390
```

### Two pre-existing results, controlled

Both looked like they might be mine. Both were checked against a clean
`git checkout tools/harness/index.html` and reproduce identically.

1. **`SMALL Title [title:version-stamp (hidden dev door, not a tap target)]`** at
   667x375 and 844x390. Self-labelled as deliberate: it is a hidden dev door,
   not a control, so the 44 pt floor does not apply to it. The harness has no
   way to know that.
2. **`realboot` reports `drew=20`** against a `drawn > 20` threshold, so its
   RESULT is starred even though all four scenes built and the map plate is
   present. An off-by-one in the assertion, not a product fault. Left alone —
   it is not this brief's scope, and changing a threshold to make a red go
   green is the wrong instinct to indulge mid-investigation.

### What was NOT checked

- **Nothing here reproduces the crash.** The harness is headless Chromium; the
  crash is Safari-only, on an iPhone, and does not happen in Chrome on the same
  phone. This pass proves the instrument catches; only the phone can say what
  it catches.
- **The live site was not fetched.** The sandbox cannot reach `github.io` — the
  egress proxy answers 403 by policy. The deploy is reported from the four
  green CI jobs, not from loading the page.
- **`GL=1` still does not boot the game** (`splash -> title: false`), so the
  `webglwatch` numbers come from scenes forced by hand. Pre-existing, recorded
  in `tools/harness/README.md`, and unchanged by this pass.
- Portrait is gated rather than audited, which is the correct answer for a
  landscape-only game.

## 9. What the next report will say

Tap Share in Safari, in a tab, and the report now comes back one of four ways.

1. **`cause = caught in a timeout callback (Nms) ... during "resize on
   VisualViewport" from <frames>`.** That is the answer. The file and line are
   in the frames.
2. **`cause = uncaught exception`, but `pendingDetail` names a timer armed
   during the viewport events and still pending.** Also an answer — it names
   the suspect even without a stack from the throw.
3. **`cause = unhandled rejection`.** A promise, with its own name and message.
4. **`cause = uncaught exception`, `timersPending = 0`, nothing armed during an
   event.** Then it is not a timer either, and the remaining candidates are
   native callbacks with no JavaScript scheduling site at all — a media element,
   a `ResizeObserver`, an `IntersectionObserver`, or something inside WebKit
   itself. That is a genuinely different investigation and worth saying so.

Whichever it is, `recentEvents` now carries a millisecond stamp on every
breadcrumb, so the 1.7 s gap can be read off the report directly.

---

## Where this leaves the repository

**`main` is at `dc0cdb5`, green on run 247, deployed. Working tree clean.**

**Waiting on the phone.** Tap Share in Safari, in a tab. §9 lists the four ways
the report can come back and what each one means.

**New, from this pass:**

1. **`realboot`'s `drew > 20` threshold is off by one** and stars a healthy run.
   Trivial, deliberately not touched here (§8).
2. **Every `GL=1` screenshot taken before `dc0cdb5` is still black.** The
   pictures already in past reports do not become meaningful retroactively;
   only new runs are fixed.

**Carried forward, still open:**

3. **The iPhone standalone crash is unexplained.** Eight hypotheses are down.
   The safe-area inset path remains the best-fitting suspect and still does not
   reproduce in the harness.
4. **`claude/mind-laser-activation-b7lzrh` needs a design call, not a merge.**
   Two competing-intent conflicts. See `reports/2026-09-09-branch-cleanup.md`.
5. **The Phaser 4 spike branch is still on the remote**, blocked on permissions
   — GitHub answers 403 to a ref deletion from these sessions. Everything worth
   keeping is on `main`.
6. **A `paths-ignore` on `checks.yml`** would stop markdown-only commits
   triggering full 32 MB deploys.
7. **`map_level5.webp` is still 1920x1080** against every other plate's 3840,
   and nobody has decided whether that is a bug or deliberate half-res.
8. **The `transform` scenario reports 10 faults** — the hero comes back still
   powered after a revive and the transformation does not re-arm. Confirmed
   pre-existing.
9. **A 3072x1728 plate would save 11.39 MB per level** and visibly soften the
   board on a retina phone. The recommendation was no; it is Cory's call.
10. **The 35 layout faults at 956x305** from the crash-viewport pass — three
    Title controls under the notch inset, five loadout chips at 42 px against a
    44 pt floor.
