# Wrapping every listener in the page

**Approach used: step 2, the global `addEventListener` patch.** Not step 1.
Rather than chase Phaser's ScaleManager, InputManager and InputPlugin one at a
time through a minified bundle — and get it wrong the way `game.step` was got
wrong last pass — this patches `EventTarget.prototype` before the game is
constructed, so every listener anyone registers is wrapped by construction.

| commit | what | CI |
|---|---|---|
| `d52beb4` | Wrap every listener in the page, Phaser's included, and record what was in flight | **green** — test, typecheck, `deploy / build`, `deploy / deploy` all success |
| this report | markdown only; its row is filled by the commit after it | |

## What is wrapped now

`window`, `document`, the canvas, `visualViewport` and `screen.orientation` all
inherit from `EventTarget.prototype`, so one patch covers every target rather
than a list somebody remembered. `requestAnimationFrame` is wrapped separately —
it is the one entry point that is not an event, and it sits outside the
`loop.callback` wrapper from last pass.

Measured in the harness: **36 listeners wrapped before the game is built, 47
after.** The eleven added during construction are Phaser's.

Every wrapper reports name, message and stack, then **rethrows**. Nothing
swallowed, nothing clamped.

### Why the global patch rather than named Phaser internals

The brief offered both and I took the coarse one deliberately. The record for
hand-picking a wrap site in this codebase is poor: last pass I wrapped
`Game.step`, it reported itself installed, and it caught nothing, because
`TimeStep` captures `game.step.bind(game)` once at start. The same trap caught
the test — reassigning `scene.update` does nothing either, because Phaser caches
it as `sys.sceneUpdate`. A patch on `addEventListener` has no equivalent hiding
place: if a listener is registered after boot, it is wrapped, and there is
nothing to be wrong about.

## The beacon, which may matter more than the wrapping

Even if the throw is not inside any listener, the report now carries which event
was being dispatched when the page died:

```
lastEvent      resize on visualViewport (STILL RUNNING, 3ms ago)
recentEvents   pointerdown@canvas resize@window resize@visualViewport
wrappedListeners  47
```

`STILL RUNNING` versus `finished` is the distinction that matters: the first
says the page died *during* that event, the second says it was merely the last
one to complete. Five reports have had no stack at all; a line naming a
still-running `resize` on `visualViewport` identifies the trigger without one.

## Verifying each wrapper actually intercepts

The brief's rule — *a guard that reports itself installed and catches nothing is
worse than none* — is the right one, so nothing below is asserted from reading
the code. `sh tools/harness/run.sh listenerguard 170 844x390`:

| claim | how it was driven | result |
|---|---|---|
| a window listener is wrapped | threw a `TypeError` through one | counted, and logged as `TypeError: deliberate: from inside a window listener` |
| a rAF callback is wrapped | threw a `RangeError` from inside one | counted, and logged with its real name and message |
| **Phaser's own listeners are wrapped** | dispatched `mousedown` at the canvas | ran through the wrapper — nothing in `src/` registers a canvas mouse listener, so that is Phaser's input handler |
| the beacon records real events | dispatched a real `resize` | `lastEvent: resize on window` |
| nothing is swallowed | checked the rethrow | `dispatchEvent` does not rethrow to its caller; the browser reports and continues, which is correct |

### Removal, which is the part that breaks things

Registration now installs a *wrapper*, so `removeEventListener` has to find that
wrapper. Get it wrong and every listener in the game leaks — which is exactly
the bug `SceneEvents.ts` exists to prevent. Keyed by listener, type and capture
flag, and checked four ways:

```
add/remove round trip: listener fired once and stopped. calls=1
capture and bubble tracked separately: cap=1 bub=2
{ once: true } still fires exactly once
handleEvent objects work and remove cleanly
```

### Two bugs the harness caught in my own work

Both from the same habit — believing an install without driving it.

1. **The beacon restored the wrong frame.** On exit it restored the previous
   event unconditionally, so at the top level it reverted to the *first* event
   of the session: after a real `resize` it still reported a stale `ping on div`
   from 2.6 seconds earlier. It now restores only a frame that is still running,
   which is the genuinely-nested case it was written for.
2. **The first version of the test read `lastReport`.** `dispatchEvent` does not
   rethrow to its caller — the browser reports the throwing listener to
   `window.onerror` and carries on — so the global handler always writes a
   report *after* the wrapper's and `lastReport` is its, not ours. The test
   checks `guardCounts` and the wrapper's own log line instead. `loopthrow`
   still proves report *content* off a `guarded()` call that nothing overwrites.

## Step 3 — the `Script error.` anomaly

**The brief is truncated mid-sentence** ("an inline handler, a listener
registered from a string, a browser-internal callback, or a WebGL dri…"), so
I have answered the part that is legible and flagged the rest rather than
guessing at it.

What is established: the bundle is same-origin (`bundleSameOrigin = true`,
both origins `https://cperry0360-create.github.io`), carries
`crossorigin="anonymous"`, and the attribute survives Vite — the deploy asserts
it and prints the emitted tag. A muted error from that configuration is not
supposed to happen, and I cannot determine why from a sandbox that cannot reach
the site.

What this pass does about it is make the next report *discriminate* rather than
speculate:

- **If the throw is in any listener or frame callback**, the report says
  `caught inside a "<type>" listener on <target>` with a real message and stack.
  That closes it.
- **If it is not**, `lastEvent` still names what was in flight, and the
  candidate set narrows to things that are not JS listeners at all: a
  browser-internal callback, or the renderer. Those look different in the report
  — no `caught inside` line, but a `lastEvent` that is `STILL RUNNING`.
- **If `lastEvent` says `none dispatched yet` or `finished`** while the page
  dies, then nothing JavaScript-visible was in flight, and the remaining
  explanation is outside script entirely.

I have not chased the WebGL branch of that list, because the sentence naming it
is cut off and I would be inventing the requirement. `webglcontextlost` and
`webglcontextrestored` are registered on the canvas via `addEventListener`, so
they are wrapped like everything else; what is *not* covered is a driver-level
failure that raises no JS exception, and no amount of wrapping would catch that.

## Verification

- **993/993 tests pass**, including `sceneevents.test.ts` in Node.
- **`sh tools/tsdiff.sh 32af1d6`** — baseline 212, working tree 212, **zero
  introduced**. `ListenerGuard.ts` imports no Phaser at all, so it does not even
  raise the usual new-file cascade.
- **Harness** — `screens` at 667x375, 844x390 and 1400x820 match the established
  baseline with only the pre-existing version-stamp fault; `realboot`,
  `loopthrow`, `standalone`, `sharesheet`, `crashreport` and `shortviewport` all
  clean with the patch in place. A broken `removeEventListener` would have shown
  up here as leaks or stale-scene throws, and did not.
- **Not used as evidence:** none of the nine scenarios known not to assert.
- **No live check.** The sandbox cannot reach github.io; none was attempted.

## Where this leaves the repository

`main` at `d52beb4`, working tree clean, deployed.

**Waiting on the phone.** Tap Share in Safari, in a tab. The report will now
either name the listener or narrow the field to things that are not listeners.

**Open, unchanged.**

1. The 35 layout faults at 956x305 from the previous pass — three Title controls
   under the notch inset, five loadout chips at 42px against a 44pt floor.
2. `claude/mind-laser-glacier-fixes-ne2f14`, unmerged: 4 ahead, 10 behind,
   conflict-free.
3. Carried forward: the 56.6 MB world-map TileSprite, `map_level5.webp` at half
   resolution, 124.7 MB of level-only art at boot, the absent web app manifest.
