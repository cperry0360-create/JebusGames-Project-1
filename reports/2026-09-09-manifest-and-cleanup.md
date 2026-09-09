# The manifest, two UI faults, and a harness that could not fail

**The Mind Laser merge went in cleanly with both decisions applied. A landscape
manifest enforces nothing on iOS — Safari honours no `orientation` member in a
home screen app or a tab, so the rotate gate stays. Item 5 got all of (a) and
part of (b): three gates, all proven able to fire, and one of six scenarios
repaired.**

Five jobs, in order. Two ended in a decision rather than a change, and one of
those decisions is that the thing the brief asked me to check is not what it
looks like.

| commit | what | CI |
|---|---|---|
| `9e21dfa` | Merge the two-step Mind Laser activation, and settle both conflicts | covered by run 252 |
| `2b0be8d` | Measure the armed phase against a dwell, not against harness latency | covered by run 252 |
| `d7cb6ff` | The web app manifest, its icons, and the iOS tags | covered by run 252 |
| `173aa43` | Keep the title's audio controls and the hero cards off the hardware | covered by run 252 |
| `326700c` | Stop republishing the game for a commit that only changes the writing | **green** — `changes`, `test`, `typecheck`, `deploy / build`, `deploy / deploy` all success ([run 252](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34337954788)) |
| `c35bb99` | Make a harness scenario that checks nothing fail instead of exiting 0 | **green** — all five jobs success ([run 253](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34339935193)) |

CI runs per push, not per commit: run 252 covers the first five, run 253 the
last. Both are green on all five jobs, `deploy / build` and `deploy / deploy`
included, and both ran the new `the web app manifest and its icons survive the
build` step green. This file is the tail of the usual regress — the commit that
adds run 253's row is markdown only, so it is also the first commit the new
deploy filter should SKIP, and that is reported in the reply that carried it.

**A concurrent session** is working the iPhone crash and pushing to main.
`origin/main` was re-checked before every push in this pass; it had moved once,
to `d70bc9f`, before the first commit here and not since. Nothing collided.

---

## 1. The Mind Laser merge — both conflicts settled as directed

`claude/mind-laser-activation-b7lzrh` at `eea1e5a`, 5 ahead and 32 behind by the
time it was reached. Both conflicts reproduced exactly as recorded on
2026-09-08, and both were resolved in favour of the activation branch.

**Conflict A, `src/scenes/GameScene.ts` — the status line is deleted.** The
Glacier merge added `` `${a.name}: drag onto the board to fire.` ``; the
activation branch removes it. Taken as directed, and the reasoning holds: the
whole point of arm-then-hold is that the gesture no longer needs a caption.

**Conflict B, `tools/harness/index.html` — the activation branch's block wins,
and it did NOT already cover everything 6b and 6c asserted.** This is the part
the brief asked to be checked rather than assumed, and checking it changed the
answer:

- **6b, "a tap on the medallion spends nothing" — already covered.** Step 5a of
  the new block checks that the tap arms without lighting a beam and without
  spending the cooldown, and 5b and 5d cover the two ways of backing out. The
  old 6b's other assertions — that an *unaimed beam* drained no budget and
  counted as no fire — describe a state that no longer exists, because arming
  lights no beam at all. Keeping them would have asserted the behaviour of a
  control that had just been removed.
- **6c, "a beam that reached the board spends only its board time" — NOT
  covered, and now added.** The new block computed `spent` and printed it
  without ever checking it. Two assertions were added inside the block, as
  instructed:
  1. the beam is born with its budget whole, so the armed phase was not charged;
  2. the budget actually falls while the beam is held.

### The first version of assertion 1 was wrong, and it reported a fault

It asserted `left === holdSeconds` at the first read after the board press and
reported *"the beam started with 9.79s of 10s — the armed phase spent budget"*.

That is the harness measuring its own latency. The beam is created already
`onBoard`, so it is charged from the instant it exists, and `press` moves the
pointer and waits before the button goes down — so ~0.2s of real board time has
always passed by the time that line runs. `updateHeldBeam` returns before
touching `left` unless `onBoard` is set, so the armed phase provably cannot
charge anything.

It now holds the ability armed for a measured 1000ms before pressing and
asserts that less than that was spent. A charged armed phase costs the dwell
plus the latency; an uncharged one costs the latency alone. **Measured 0.21s
against a 1s threshold.**

Both new assertions were verified able to fail rather than assumed: with the
thresholds inverted the run reports *"the armed phase spent budget: 0.14s gone
after 1s armed"* and *"the beam spent nothing while held on the board"*, 2
faults; restored, it reports clean.

### Arming, disarming, firing and the cooldown all behave as both branches intended

`run.sh courtland 300 1400x820` — **`RESULT Courtland's three behave as
specified`**, zero faults:

| | reading |
|---|---|
| tap the medallion | `armed=true pendingAbility=heroSlot3 mode=targeting beam lit=false cooldown ready=true` |
| the armed board | `targetArea draw commands=27` — the disc is painted |
| tap again | `armed=false beam lit=false cooldown ready=true` |
| press the board unarmed | `beam lit=false` — inert, as the gesture requires |
| tap off the board | `armed=false beam lit=false cooldown ready=true` |
| arm, then press the board | `beam lit=true onBoard=true armed still=false mode=normal`, aim off by **0.15°** |
| the armed phase | 1000ms armed, **0.21s** of budget gone — not charged |
| held on the board | **0.77s** of budget spent, enemy 66 → −18 |
| release | `beam lit=false cooldown ready=false` — the cooldown starts here |
| a press that fired nothing | `cooldown ready=true` — spends nothing |
| budget wound to 0.05s | `beam lit=false` — it ends itself |

## 2. The manifest — and what it does not do

**This is a product change and not a fix for the iPhone crash.** That is the
concurrent session's job. Nothing here is claimed to address it, and 2d below
is written as a finding rather than a change.

### (a) There was no manifest. There is now

`public/manifest.webmanifest`, linked from `index.html`. `name`, `short_name`,
`description`, `display: "fullscreen"` with a `display_override` falling back to
`standalone`, `orientation: "landscape"`, and `background_color` and
`theme_color` both `#10161d`.

`start_url` and `scope` are **`"./"`, not `"/"`**, because `vite.config.ts` sets
`base: './'` so the build works at the Pages project path. A `"/"` would launch
the home screen app at the domain root, which on `<user>.github.io` is somebody
else's page.

**The icons are rasterised by Chromium**, in `tools/make_icons.sh`. There is no
PIL, no ImageMagick and no `cwebp` here and npm answers 403, so the browser
already present for the harness does the decoding: the JebusGames logo centred
on the game's own ground colour, screenshotted at each size. Four files —
`icon-192`, `icon-512`, `icon-maskable-512` and `apple-touch-icon` at 180. The
maskable variant draws the logo at 56% rather than 78% so it sits inside the
80% safe zone and a circular launcher crop keeps it whole.

`apple-touch-icon` is **not** redundant with the manifest icons: iOS takes the
home screen icon from the link tag and ignores `icons` entirely.

**Four places now share the ground colour, not three** — `display.json`'s
`backgroundColor`, `html`/`body`, the `theme-color` meta tag, and the manifest's
two colour fields. A mismatch between any two shows as a band down the edge of
the screen on iOS, so `tests/manifest-webapp.test.ts` pins all four together.

**It survives the Vite build, and that is checked where Vite actually runs.**
`npm install` answers 403 here, so "the manifest is in `public/`" is only ever a
claim about the source — `public/` is copied by a mechanism that works right up
until someone sets `publicDir: false`. `deploy.yml` now asserts on the real
`dist/`, in the same style as the existing crossorigin check: the manifest is
emitted with the right `display`, `orientation` and colours, it lists icons,
`dist/index.html` carries both the manifest link and the apple-touch-icon link,
and all four icon files exist and are non-empty. **The step passed on run 252**
— it exits 1 on any one of those, so a pass is the whole set.

### (b) What a landscape manifest actually enforces on iOS

**Reported rather than guessed, and the answer is mostly "nothing".**

| context | `display` honoured? | `orientation: landscape` honoured? |
|---|---|---|
| iOS home screen web app | **Yes**, Safari 16.4+ reads the manifest; older iOS needs `apple-mobile-web-app-capable`, which is why both are present | **No** |
| iOS Safari browser tab | n/a — a tab is a tab | **No**, and a tab cannot be orientation-locked by any means |
| Capacitor / WKWebView | n/a — the native shell decides | **Not by the manifest.** Orientation there is `UISupportedInterfaceOrientations` in the native `Info.plist`; the web manifest is not consulted |

iOS honours no `orientation` member anywhere, and Safari does not implement the
Screen Orientation API's `lock()` either — so there is no JavaScript fallback to
reach for. The member is still correct and still worth having: **Android and
desktop PWAs do obey it**, and it costs nothing on the platform that does not.

**Cory has to confirm the display half on his phone.** The sandbox cannot reach
github.io — the egress proxy answers 403 by policy — so nothing here is a live
check of the deployed site and none is claimed. If the status bar or the safe
area misbehaves under `fullscreen`, the fallback is one word: change
`"display": "fullscreen"` to `"standalone"` in `public/manifest.webmanifest`.
The `display_override` already lists `standalone` second, so a browser that
refuses fullscreen falls back on its own.

### (c) The rotate gate is untouched

It has to be. iOS honours no orientation member, so on the platform the crash
came from the gate is the only thing standing between a rotation and a
landscape layout drawn into a portrait viewport. The manifest reduces how often
the gate is needed on other platforms; it does not replace it anywhere.
`tests/manifest-webapp.test.ts` asserts `Orientation.ts` is still in the source,
with that reason written next to it, so a future pass cannot delete the gate on
the grounds that "the manifest handles it now".

### (d) Why a landscape layout rendered into a portrait viewport — the finding

**Not fixed, as instructed. Described so the crash session can use it.**

The reported state is `portrait=false`, `rotateOverlay=hidden`, and a world map
laid out for landscape in a portrait-shaped window.

**The first thing this rules out is the bug that was already fixed.** The old
fault was the script and the stylesheet disagreeing — `isPortrait()` used
`innerHeight > innerWidth` while the overlay used
`@media (orientation: portrait)`, and iOS makes those disagree for a frame
either side of a rotation. That was fixed by pointing both at the same
`matchMedia('(orientation: portrait)')`. In this report **they agree**: both say
landscape. So this is a different fault, and the earlier fix has a cost — with
one shared predicate, when it is wrong everything is wrong together and nothing
in the system notices.

**What the numbers say about the gate's own behaviour**, measured by driving
`OrientationGate` directly:

```
ENTER_FRAMES = 3
portrait frame 1   overlay=VISIBLE  gateUp=false
portrait frame 2   overlay=VISIBLE  gateUp=false
portrait frame 3   overlay=VISIBLE  gateUp=true   raised
landscape frame 1  overlay=hidden   gateUp=false  lowered
```

Two things follow, and both matter to whoever picks this up:

1. **The overlay has no hysteresis and the gate has three frames of it.** The
   CSS shows the overlay on the first portrait frame; the gate pauses on the
   third. For two frames of every rotation the overlay is up and the game is
   still running behind it. That is harmless on its own — the overlay covers
   the screen — but it means overlay state and gate state are not the same
   question, and a report carrying one does not tell you the other.
2. **The gate cannot raise and lower "within a frame", so the log line in
   `CrashContext.ts` is not describing what it looks like.** The sample there
   reads `4796 gate raised; holding nothing` / `4817 gate lowered; resumed
   nothing` — 21ms apart, which is less than three frames at 60fps. The streak
   counter is incremented per **`sync()` call**, not per rendered frame, and
   `sync()` is called from two clocks: `POST_STEP` once a frame, **and
   `settle()` five times per event** (immediately, on rAF, and at 60/180/400ms).
   A rotation fires `resize`, `orientationchange` and a `visualViewport resize`,
   so up to fifteen extra `sync()` calls land in a few milliseconds. Three of
   them reading the same stale value raise the gate in far less time than
   `ENTER_FRAMES`'s own comment claims. **The hysteresis is weakest exactly
   during a rotation, which is the only time it is needed.**

`holding nothing` on the raise is a third detail worth keeping: the gate paused
zero scenes because none were running at that instant. That is recovered on
later portrait frames — `hold()` re-runs every frame — but a gate that raises
and lowers inside one burst never gets those frames.

**The cheapest next step, and the crash report already carries what it needs.**
`CrashContext.ts` records `viewportCss` (`innerWidth x innerHeight`) *and*
`portrait` (the media query) *and* `screenAngle`. Comparing the first two in the
existing reports answers the question outright:

- `viewportCss` portrait-shaped while `portrait=false` → the media query was
  stale and the gate never had a chance; the fault is the shared predicate.
- `viewportCss` landscape-shaped while the recording shows a portrait window →
  `innerWidth`/`innerHeight` are stale too, the whole DOM was reporting the
  pre-rotation viewport, and the fault is below the game.

`settle()` re-measures at 0, rAF, 60, 180 and 400ms and then stops. The reports
show gate holds of 3162ms, so iOS can take far longer to settle than the ladder
covers — but whether that is the same event is exactly what the comparison above
decides, and this pass did not have a report in hand to run it against.

## 3. The two UI faults, fixed

Both reproduced first at 956x305 with `INSETS=0,47,21,47` — Safari with its
Share sheet open — then fixed, then re-verified from rendered frames.

**(a) Three title audio buttons under the home indicator.** `tapFloor` grows the
touch rectangle to the 44pt floor **around the same centre**, and `tap` is more
than twice `size` once the fit is small. A control authored to sit `size / 2`
above the bottom of its box therefore ends up with `tap / 2` below that centre —
12 design units past the bottom of the design box, which is fitted onto the safe
area. The whole control is lifted rather than just the rectangles; clamping the
hit boxes alone would have left the speaker painted under the hardware with its
tap target somewhere else.

That took two passes. Clamping the bottom edge to exactly the limit still
reported all three: these are floats off a camera transform, the audit's test is
`y + h > viewport - inset`, and 284.4 against a limit of 284 is a fault. It now
reserves the same 6 units the readout already did.

**(b) Five loadout hero cards at 48x42 CSS.** The row fits five across, so a
short viewport makes a short card, and 42 is under the floor. The invisible hit
rectangle is grown **on height only** — the cards are a horizontal row 51 CSS
apart, so a wider box would overlap its neighbour and a tap on Eli would select
Han. The painted card keeps its authored size, which is the trade `AudioToggle`
already makes.

### Verified from rendered frames

Every row below is a `screens` run that wrote a PNG, and the two 956x305 frames
were opened and looked at, not just counted.

| viewport | before | after |
|---|---|---|
| 956x305, `INSETS=0,47,21,47` | 10 faults | **2** |
| 844x390, `INSETS=0,47,21,47` | 1 fault | **1**, and no NOTCH |
| 375x667 | — | correctly gated by the rotate overlay |
| 390x844 | — | correctly gated by the rotate overlay |

**From the pictures**: `screens-1-title-956x305.png` shows the title with the
audio control clear of the bottom edge; `screens-3-loadout-956x305.png` shows
all five hero cards in a row with the selection ring on Cory, nothing
overlapping, and the roster correctly reading **ELI**.

**The two left at 956x305 are pre-existing and neither is in this brief.**
`SMALL Title [title:version-stamp]` is annotated in the harness as a deliberate
hidden dev door. `OVER Title Rectangle @415,142 126x44 <> Rectangle @427,175
103x44` is two title buttons overlapping at that viewport — present before this
change, unchanged by it, and reported rather than fixed.

## 4. The deploy filter

Every push to main republished Pages, including markdown-only commits.

**Not `paths-ignore` on the trigger, which is the obvious way and the wrong
one.** That skips the whole workflow, so `test` and `typecheck` would not run at
all on a docs commit and the commit would carry no checks — a worse thing to
explain to a branch protection rule than a wasted deploy. The checks still run
on everything; only the publish is gated.

A `changes` job diffs the push and answers one question: is there a changed file
that is not markdown and not under `reports/`. `deploy` takes that as a third
`needs`.

**Nothing the build reads is markdown** — every `.md` and `reports/` mention in
`src/` is inside a comment or a JSON `_note`, checked before writing it.

**Fail-safe is to deploy.** A missing or unreachable before-SHA — first push,
force-push, manual dispatch — answers `true`. The checkout is full-depth for the
same reason: the before-SHA of a multi-commit push is not reachable from a
shallow clone, and an unreachable SHA would silently read as "docs only".

Classified against real history rather than assumed:

| commit | files | verdict |
|---|---|---|
| `173aa43` | `src/ui`, `src/scenes` | DEPLOY |
| `d7cb6ff` | manifest, icons, workflow, test | DEPLOY |
| `d70bc9f` | one report row | SKIP |
| `446ea24` | a report and a harness README | SKIP |

**And it still deploys on a real code change**: run 252 carried
`.github/workflows/checks.yml` and `src/`, the `changes` job passed, and
`deploy / build` and `deploy / deploy` both ran and succeeded. The Pages
artifact went 32,189,159 → **32,474,773 bytes**, +285,614 for the four icons.
The proof that it *skips* is the push carrying this file, which is markdown
only.

## 5. The harness — all of (a), part of (b)

### The brief's list of nine was three different things

Re-auditing it was the first step rather than the last, and it changed what
needed doing:

| | |
|---|---|
| `ui`, `buildall` | **already repaired** by earlier sessions. `ui` has seven checks; `buildall` requires all 7 pads and reports `*** only n of 7 ***` otherwise. Verified: `buildall` exits 0 with `total 7 of 7 pads built` |
| `poor` | **does not exist.** There is no `poor` block in `index.html` and has not been for some time |
| `muzzle`, `rockets`, `retreat`, `regressions`, `meteor` | genuinely assertion-free, as described |
| `typegame` | assertion-free; **repaired here** |

### (a) Three holes, three gates, all proven able to fire

`server.py` already caught a throw, a timeout and a reported fault. These are
the three it could not see.

| hole | gate | proof |
|---|---|---|
| **An unknown name ran nothing and exited 0.** `run.sh poor` and `run.sh totally-made-up-name` both exited 0 — the director fell off the end of the dispatch chain and posted a clean report about nothing | `KNOWN_SCENARIOS`, derived from the 127 names actually dispatched → **exit 6** | both now exit 6 |
| **A scenario that cannot fail reported success.** Five drive the game, print numbers, save screenshots and have no way to say anything is wrong | `ASSERTS_NOTHING` → **exit 7** with what to do about it | `muzzle`, `rockets`, `retreat`, `regressions`, `meteor` all exit 7 |
| **A scenario whose checks never ran looked identical to one that passed.** Counting only failures cannot tell "threw past its assertions" from "asserted and was happy" — which is what `ui` did the day the build menu was deleted | `expect()` counts every check **evaluated**, pass or fail; `USES_EXPECT` scenarios reaching none → **exit 8** | `typegame` with its `expect()` calls stubbed out exits 8 |

`tests/harness-scenarios.test.ts` keeps the lists from rotting the way the nine
did: `SCENARIO_NAMES` must match what is dispatched, `ASSERTS_NOTHING` must name
only scenarios with no way to fail, `USES_EXPECT` must name only scenarios that
call `expect()`, and the two lists may not overlap.

### (b) One repaired, five left failing loudly

**`typegame` — repaired.** It took two screenshots and asserted nothing, so the
run that proved the old `openPause()` had been throwing for weeks looked
identical to the run that proved the fix. It now makes six checks: the settings
panel raises, it closes, the run comes back **unpaused**, the run ends in
`lost`, and the results panel appears. `RESULT both panels raised, dismissed and
reported`, exit 0.

**Both of its first two red results were the instrument, not the game** — which
is three of three faults this file has found in itself rather than in the
product, and is why the rule about first red results exists:

1. It called `hud.settings.close()`, which closes the panel object and leaves
   the HUD's bookkeeping alone: `hud.settings` stays set and `hud.paused` stays
   true, because what clears both is `closeSettings()` plus `resumeGame()`,
   hanging off the panel's CONTINUE button. It was pressing something no player
   can press. It now clicks CONTINUE.
2. The button walk started from `hud.list`. `hud` is a Scene and a Scene has no
   `.list` — so it walked `undefined`, found nothing, and reported *"the
   settings panel has no CONTINUE button"*. It now starts from `children.list`.

**The remaining five are left in `ASSERTS_NOTHING` on purpose.** Running one
fails with the reason and the remedy. Their measurements and screenshots are
still real and still printed; it is the exit code that was a lie, and that is
now fixed. Repairing them is one scenario at a time and is the obvious next
piece of work.

### A separate finding: `realboot` has been failing on success

**`realboot` — the one the harness README says to run before any push — exits 5,
and did so before any change in this pass** (confirmed against a stash of the
working tree). Its verdict is `steps.every(built) && drawn > 20`, and a clean
run gives `Title=built Loadout=built Game=built Hud=built drew=20` — every scene
built, and `drawn` exactly on the boundary of a strictly-greater-than test.

**Not touched here, deliberately.** Either the threshold is off by one or the
board genuinely draws one object fewer than it used to, and the level-art split
that moved enemy and effect art to per-level loading is a plausible cause worth
checking before anyone edits the number. Tuning a check until it passes is the
one repair that must not be guessed at.

---

## Verification

Everything below is headless Chromium in this sandbox. **The sandbox cannot
reach github.io — the egress proxy answers 403 by policy — so nothing here is a
live check of the deployed site and none is claimed.**

- **Tests** — `node --test 'tests/*.test.ts'`: **1018 pass, 0 fail** (1009 after
  the merge, plus five manifest tests and four harness-registry tests). Green in
  CI on run 252 with `node_modules` present.
- **Typecheck** — `sh tools/tsdiff.sh d70bc9f`: baseline **212** distinct
  errors, working tree **212**, **zero introduced**, at every commit in this
  pass. CI's own `npx tsc --noEmit` passed on run 252.
- **`courtland`** — the whole Mind Laser gesture, quoted in §1. Zero faults, and
  both new assertions verified able to fail.
- **`screens`** — 956x305 and 844x390 with `INSETS=0,47,21,47`, and 375x667 and
  390x844. Numbers and pictures both, per §3.
- **`realboot`** — `Title=built Loadout=built Game=built Hud=built drew=20`,
  `splash -> title: true`. See the finding above about its exit code.
- **`levelart`** — all five levels and back to the first, every key resident,
  zero foreign enemies, 8 effect animations against live textures, 0 of 76 keys
  held after leaving the board.
- **`typegame`, `buildall`** — both exit 0 with real verdicts.
- **The three new gates** — each driven to failure and back, per §5.
- **Reproduce:**
  ```bash
  sh tools/harness/build.sh
  sh tools/harness/run.sh courtland 300 1400x820
  INSETS=0,47,21,47 sh tools/harness/run.sh screens 140 956x305
  sh tools/harness/run.sh typegame 90 1400x820
  sh tools/make_icons.sh
  ```

**Not used as evidence:** the five scenarios still on `ASSERTS_NOTHING`. They
now fail rather than lie, but a failing run is not evidence about the game
either. The `drawer` scenario throws under `GL=1` on Phaser 3; pre-existing, not
this pass's. Every `GL=1` screenshot older than `dc0cdb5` is black — see
`tools/harness/README.md`.

**Not checked:** anything on a real device or on the live site.

---

## Where this leaves the repository

**`main` is at `c35bb99`, green: runs 252 and 253 both success on all five
jobs.** The commit carrying this file is markdown only and should be the first
the new filter skips.

**For Cory, and only Cory can do it:**

1. **`claude/phaser-4-migration-spike-hage91` has to be deleted from the GitHub
   web UI.** Two sessions have tried from the CLI and GitHub answered 403 to the
   ref deletion both times; it is not the egress proxy and it is not
   retryable from here. **Everything worth keeping from it is already on main** —
   the `ctxsurvive` scenario, the GL=1 black-screenshot finding, and the spike
   report itself. Deleting the branch loses nothing.
2. **Confirm the manifest on the phone**, in the home screen web app: does it
   launch fullscreen, and does the status bar and safe area behave. If not, one
   word in `public/manifest.webmanifest`: `"fullscreen"` → `"standalone"`.
   Whether it *locks orientation* is already answered — it does not, on iOS.

**Waiting on a decision:**

3. **`realboot`'s `drawn > 20` threshold.** It has been failing on success. Is
   20 the right floor, or does the board now draw one object fewer than it did
   before the level-art split? See §5.

**Open, and the obvious next work:**

4. **Five harness scenarios still assert nothing** — `muzzle`, `rockets`,
   `retreat`, `regressions`, `meteor`. They now fail loudly instead of lying.
   Repair or delete, one at a time.
5. **`OVER Title` at 956x305** — two title buttons overlapping at the Share
   sheet viewport. Pre-existing, reproducible, not in this brief.

**Carried forward, still open:**

6. **The iPhone standalone crash is unexplained.** The concurrent session owns
   it; §2d is written for them. Seven hypotheses are down. Nothing in this pass
   is a fix for it.
7. **`map_level5.webp` is still 1920x1080** against every other plate's 3840.
8. **The `transform` scenario reports 10 faults** — the hero comes back still
   powered after a revive. Confirmed pre-existing in an earlier pass.
9. **A 3072x1728 plate** would save 11.39 MB per level and visibly soften the
   board on a retina phone. Numbers in `reports/2026-09-08-the-memory-numbers.md`;
   the recommendation was no, and it is Cory's call.
