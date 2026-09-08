# Making the crash message readable

Not a diagnosis. This ships (a) through (d) and nothing else.

| commit | what | CI |
|---|---|---|
| `f1af27d` | Capture where the error happened, and prove the handler still fires | **green** — test + typecheck pass |

Earlier commits on this branch are covered by `2026-09-07-the-crash.md` and
`2026-09-08-the-crash.md`.

**`main` is still `12258d7`.** That is the build all three reports came from, and
it is why they are identical: none of the diagnostics work from the last two
sessions is live. The merge command is at the bottom.

## What changed

**a) `crossorigin="anonymous"`** on the module script. It was added in the
previous session and is still there; this session added the two checks that
stop it being lost silently — see the CORS section below.

**b) STATE.** It was empty because `state` came only from `GameScene`'s
provider, and none of the three crashes had a GameScene. `Diagnostics` now takes
context providers that live for the page rather than for a run. Measured in the
harness, a report carries **42 fields**, including every one asked for:

| asked for | field |
|---|---|
| active scene | `scene`, `scenesRunning`, `scenesPaused` |
| viewport width and height | `viewportCss`, and `canvas` for the device-pixel backing store |
| device pixel ratio | `dpr` (latched) and `rawDpr` (what the browser said) |
| safe-area insets | `insetsRaw` and `insetsResolved` |
| standalone or tab | `display` |
| document visibility | `visibility` |
| last few log lines | the `EVENTS` section, which all three reports already carried |

Plus `screenAngle`, `portrait`, `rotateOverlay`, `gates`, `openGates`,
`gateHolding`, `renderer`, and the run fields GameScene already provided.

**c) The rejection handler** already existed and already labelled its reports
`unhandled rejection` rather than `uncaught exception`. Two real gaps around it
did not:

- The pre-boot queue in `index.html` relabelled **every** early record as
  `uncaught exception (before boot)`, rejections included — so the distinction
  was undone at exactly the point that is hardest to reproduce. It carries the
  kind now.
- A rejection reason is not necessarily an `Error`. The old code checked
  `instanceof Error` and put everything else through `safeString`, which turns a
  **DOMException into `{}`** because its fields are not enumerable. DOMException
  is what iOS rejects audio and canvas work with, so that was the case most
  likely to matter here. It now reads
  `NotAllowedError: the operation is not allowed`.

**d) `error.stack`** was already captured. What was *not* captured, at all, was
**`ErrorEvent.filename`, `lineno` and `colno`** — the handler read `e.message`
and `e.error.stack` and dropped the rest on the floor. Those are withheld for a
muted script the same way a stack is, but *independently* of it, so on any build
where the muting is not in play they name the file and the line for free. The
report has an `at` row now:

```
error  deliberate harness explosion
at     http://127.0.0.1:8899/js/scenes/GameScene.js:4242:17
```

It prints even when empty — `at (withheld — the script is being treated as
cross-origin)` — because that emptiness is itself the finding.

## Does crossorigin survive the Vite build?

**I could not check it here, and I am not going to claim otherwise.**
`npm install` answers 403 in this environment, so Vite never runs, and Vite
rewrites that exact tag on its way to `dist/index.html` — replacing
`src="/src/main.ts"` with the hashed bundle. Whether it preserves other
attributes while doing so is the part most likely to be silently dropped, and
asserting it from memory is how this file would become wrong.

So it is checked in the two places that can check it:

1. **`.github/workflows/deploy.yml`** greps the emitted `dist/index.html` for a
   module script tag carrying `crossorigin` and **fails the deploy** if it is
   missing. That runs on the machine that actually runs Vite. Verified both ways
   against a tag with and without the attribute.
2. **The page reports its own attribute at runtime.** `scriptCrossOrigin` comes
   off the DOM at the moment of the throw, so the next crash report says whether
   the shipped page had it.

A third check, `tests/boot.test.ts`, holds the source. It fails with the
attribute removed, checked by removing it.

## What Access-Control-Allow-Origin does Pages serve?

**Unverified. The sandbox cannot reach github.io — the egress proxy answers 403
by policy — and I did not fetch the header.**

What I can say from the code rather than from documentation: **the bundle is
served from the same origin as the page.** `vite.config.ts` sets `base: './'`,
so the emitted script is a relative path under the same Pages URL. A same-origin
module script is not CORS-cross-origin and its errors should never be muted at
all — which means `crossorigin` should have been unnecessary, and three reports
say the errors were muted anyway. Those two facts do not fit together, and I
cannot resolve them from here.

**So the report resolves them on the device.** It now carries `pageOrigin`,
`bundleUrl`, `bundleOrigin`, `bundleSameOrigin` and `scriptCrossOrigin`. If the
next report says same-origin, attribute present, and *still* `Script error.`,
then CORS is not the mechanism and that line of enquiry is closed on evidence.

**If it turns out Pages does not serve a permissive header** — which would only
matter if the bundle is somehow not same-origin — the attribute alone will not
help, and the thing that will is catching the error where the real `Error`
object is still in hand rather than relying on `window.onerror`: a `try`/`catch`
around the resize and lifecycle entry points, which is where a Share-button
crash would have to originate. That is a change to game code and the brief said
not to make it, so it is written down rather than done.

## Verification

- **The handler still fires, with the new fields.** A `crashreport` scenario
  dispatches a real `ErrorEvent` and a real `PromiseRejectionEvent` and reads
  the reports back: cause, message, stack, `at` = `…GameScene.js:4242:17`, 42
  STATE fields checked by name, the event log, and the panel on screen. The
  rejection comes back labelled `unhandled rejection` with the DOMException
  described rather than stringified to `{}`.
- **993/993 tests pass.** The two new boot tests fail with the attribute removed
  and with the handler's location capture removed.
- **`sh tools/tsdiff.sh 12258d7`** — baseline 210, working tree 211. The one
  introduced is `TS2307: Cannot find module 'phaser'` on `CrashContext.ts`, the
  documented cascade for a new file. Its Phaser members are unverified locally;
  CI is green on them.
- **Harness** — `screens` at 667x375, 844x390 and 1400x820, and `realboot`, all
  matching the established baseline with only the pre-existing version-stamp
  fault.
- **Not used as evidence:** none of the nine scenarios known not to assert
  (`ui`, `muzzle`, `buildall`, `rockets`, `retreat`, `regressions`, `poor`,
  `typegame`, `meteor`).

### The Share-button reproduction, driven and not reproduced

A `sharesheet` scenario drives the sequence you described — the `#game` box
squeezed to a portrait aspect for a frame or two and back, three times, with a
`resize` event either side, **while a wave is running and scenes are live**. So
`settle`, `applyResolution`, the gate's per-frame sync and every scene's
`onSceneResize` relayout all run.

It does not reproduce a crash: no page errors, no crash report, the run alive
and unpaused, no gate left holding anything.

That is consistent rather than surprising — **the harness is Chromium, and you
report it does not crash in Chrome on the same phone.** Worth stating plainly so
the next session does not spend itself here: this harness cannot reach a
Safari-only bug, and a green result from it is not evidence that the sequence is
safe on Safari. It is only evidence that the new handler survives the sequence.

## What the next report will contain that the last three did not

```
error  <the real message>
at     <file>:<line>:<col>            <- new; empty means genuinely muted

STACK
  <frames>                            <- new when the browser yields it

STATE                                  <- was empty in all three
  display = standalone                 <- separates iPhone-standalone from tab and iPad
  viewportCss = 844x390   canvas = 2532x1170
  dpr = 3   rawDpr = 3   screenAngle = 90
  insetsRaw = {...}   insetsResolved = {...}
  portrait = false   rotateOverlay = hidden
  gates = none   openGates = none   gateHolding = nothing
  scenesRunning = Game,Hud   scenesPaused = none   scene = Game
  visibility = visible   renderer = webgl
  pageOrigin / bundleUrl / bundleOrigin / bundleSameOrigin / scriptCrossOrigin
  ... plus the run fields
```

and a rejected promise now arrives as `cause unhandled rejection` with the
reason described, instead of as an exception with `{}` for a message.

## Where this leaves the repository

Branch `claude/ios-safari-crash-diagnosis-hwyevk`, head `f1af27d` plus this
report, CI green. **Not merged**, and nothing in it is on the live site:

```
git checkout main && git merge --ff-only claude/ios-safari-crash-diagnosis-hwyevk && git push origin main
```

The next step is one tap: merge, let Pages deploy, tap Share, send the report.

Open items from the previous sessions are carried forward in
`reports/2026-09-08-the-crash.md` and are unchanged — the 56.6 MB world-map
TileSprite, `map_level5.webp` at half resolution, 124.7 MB of level-only art at
boot, and the missing web app manifest.
