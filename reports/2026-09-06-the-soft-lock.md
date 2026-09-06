# The soft lock on level 1

A player froze mid-run: no tower selection, no ability use, no placement, and a
screenshot showing enemies stopped and bunched mid-lane with full health bars.
No crash, no error, no report.

## Commits

| commit | what | CI |
|---|---|---|
| 5d30310 | Stop a stale viewport frame from freezing a run, and net the class | green (`test`, `typecheck`; `deploy` skipped, gated on `main`) — [run 34039366717](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34039366717) |
| 4c1a1ec | this report | n/a |

Branch `claude/phaser-vendor-layout-authority-74uaif`, a clean fast-forward to
`main`.

## The cause

**The rotate gate paused the game on a stale viewport reading and had no path
that could ever un-pause it.**

`Orientation.ts` ran two code paths on two different clocks:

```js
// every frame
game.events.on(Phaser.Core.Events.POST_STEP, () => {
  if (isPortrait()) pauseRunning()          // <- can only PAUSE
})

// only on resize / orientationchange / visualViewport
const sync = () => {
  if (isPortrait()) pauseRunning()
  else { /* resume what we paused */ }      // <- the only RESUME
}
```

The per-frame hook could pause and could not resume. The resume lived behind an
event. The file's own comments record that "iOS reports the old viewport for a
frame or two either side of a rotation", and `settle()` re-measures at 0, one
animation frame, 60ms, 180ms and 400ms to cope with it — so a stale frame that
lands *after* the last of those has nothing scheduled to undo it. The run is
paused for the rest of its life.

A state with a per-frame way in and an event-driven way out can only fail
closed. The shape of the design was the bug.

### Why it was silent as well as permanent

Three things had to line up, and they did.

1. **The overlay and the pause asked different questions.** The overlay's
   visibility is `@media (orientation: portrait)`. The script asked
   `window.innerHeight > window.innerWidth`. Those agree almost always and
   disagree exactly during the stale window — so the script paused the game
   while the CSS hid the overlay that would have explained why. A frozen board
   and no message.
2. **Both scenes go.** `pauseRunning()` walks `getScenes(true)`, which is Game
   *and* Hud. The HUD is deliberately built to keep working while GameScene is
   paused, and that safety net does not apply when the HUD is paused too.
3. **The freeze watchdog was disarmed by the thing that stopped the loop.**
   `GameScene.create` does
   `this.events.on(Phaser.Scenes.Events.PAUSE, () => setRunActive(false))`.
   The reasoning is sound for a legitimate pause and fatal for a stray one: the
   only detector that notices a stopped loop is told to stand down by the pause
   that stopped it. A pause carries no exception, so nothing else fired either.

### Ruling out the other candidates

All four candidates from the brief were answered from the frozen state itself
rather than by argument, by dumping them at the moment of the lock:

```
after: Game PAUSED | Hud PAUSED | overlay none | isPortrait() false
after gates: mode normal | pendingAbility null | hud.paused false
             | hud.panel false | hud.settings false
enemies moved after the stale frame: 0 of 3
INPUT settings gear: panel before false after false
```

- **Targeting entered and never exited** — no. `mode` is `normal` and
  `pendingAbility` is `null`. `TargetingMode` is also sound on inspection:
  every exit funnels through `clearSelection`, and `resolveTap` leaves the mode
  whether the tap was legal or not.
- **A modal or input-gate predicate latched on** — no. `hud.paused`,
  `hud.panel` and `hud.settings` are all false.
- **The update loop halted** — yes, and this is the whole of it. Enemies moved
  2 of 2 in the control sample and 0 of 3 after.
- **An exception thrown mid-frame** — no. Nothing threw. That is precisely why
  there was no report.

## The two peanut counters

**Not related to the lock.** Different bug, and the reasoning that they must
share a cause does not hold.

`GameScene.refreshAffordability` rebuilds the drawer only when an affordability
flag *flips*:

```ts
const moved = next.length !== this.drawerAfford.length
  || next.some((t, i) => this.drawerAfford[i] !== t.affordable)
if (moved) { ...; this.drawer.refresh() }
```

The drawer's wallet was drawn inside `refresh()`, so it only ever re-read the
balance when some tower crossed a price threshold. 408 against 404 is a
four-peanut gap — far too small to flip anything — so the HUD stayed live and
the drawer held the number it had when the last flip happened. The optimisation
was correct for the tint it was written for and wrong for the readout that had
been added beside it.

Note the direction: the drawer was *behind*, never ahead. A stalled event bus
would not care which way the error went.

Removed, per the brief: the HUD counter is the single source of truth. The
drawer's whole header row went with it, and the grid got the height back —
which means 568x320 can show a whole tile for the first time (grid 55px -> 73px
against a 62px tile).

## Changes

| file | what |
|---|---|
| `src/systems/OrientationGate.ts` | new. The pause/resume decision, Phaser-free. One call both raises and lowers the gate. |
| `src/systems/Orientation.ts` | `isPortrait()` now asks `matchMedia('(orientation: portrait)')`; POST_STEP runs the whole decision; exposes `gateHolding`, `releaseGate`, `overlayVisible`. |
| `src/systems/InputGates.ts` | new. Every input-gating mode announces entry and exit, and says whether anything owns the current state. |
| `src/systems/StuckGuard.ts` | new. Pure rules for "held, not moving, no accepted input". |
| `src/systems/StuckWatch.ts` | new. Those rules wired to a live game, plus the recovery. |
| `src/systems/ErrorPanel.ts` | `reportQuietly()` — a full report with no wall of red text over the game. |
| `src/scenes/GameScene.ts` | targeting gate announced from `syncTargeting`, the one writer; accepted input timestamped in `onClick`. |
| `src/scenes/HudScene.ts` | settings and dialog gates announced; accepted input timestamped. |
| `src/systems/Lifecycle.ts` | background gate announced. |
| `src/ui/ControlDrawer.ts`, `src/systems/DrawerLayout.ts`, `src/data/presentation.json` | the drawer's peanut counter and its header row removed. |

### The gate, fixed

Entering portrait now takes three consecutive readings; leaving takes one. The
asymmetry points the safe way — slow to take control, instant to give it back —
which is the exact opposite of what it did. And because the same call both
raises and lowers the gate, no frame can do something the next frame cannot
undo.

`isPortrait()` asking `matchMedia` matters as much as the debounce: the pause
and the overlay are now literally the same predicate, so a paused game can no
longer hide the sign explaining itself.

### The safety net

A run counts as stuck when it is held by a gating state, nothing is moving, and
no input has been accepted, for six seconds. Then:

- it is logged with the full gate state,
- a crash report is recorded (quietly — it is recovered from),
- and if **nothing owns** the state, the gate is force-released, Game and Hud
  are resumed, and any armed ability is dropped unspent.

If something *does* own it — a settings panel, a dialog, the rotate overlay, a
backgrounded tab — it is reported and **left alone**. Seizing a settings panel
from a child reading it would be a worse bug than the one being guarded
against.

The guard runs on `setInterval`, not in the game loop, for the same reason the
freeze watchdog does: a loop that has stopped cannot notice that it has
stopped.

### Why the tests did not catch this

Every assertion in `tests/orientation.test.ts` was a regular expression over
the source. They passed throughout the bug's life, including:

```ts
const resume = gate.slice(gate.indexOf('for (const key of gatePaused)'))
assert.match(resume, /game\.scene\.resume\(key\)/, 'nothing is ever resumed')
```

Something *was* resumed, in a branch a stale reading could not reach. Matching
source text cannot tell you which lines run. Replaced with tests that drive the
state machine against a fake scene manager — which is why `OrientationGate` is
its own Phaser-free file, following `TargetingMode`, `Liveness` and `Layout`.

## Verification

**Everything below came from rendered frames in a real headless Chromium
running the shipping source, except where marked computed.**

Two new harness scenarios:

- `sh tools/harness/run.sh softlock 60 <vp>` — shadows `innerWidth`/
  `innerHeight` for exactly one animation frame, touching neither the DOM nor
  the CSS, which is what the device does. Includes a control sample first,
  because three of the four faults the input harness originally found were bugs
  in the harness.
- `sh tools/harness/run.sh stuckguard 120 <vp>` — pauses Game and Hud by hand
  with nothing claiming them, then checks recovery; then opens settings and
  checks the guard leaves it alone.

### Before the fix (844x390)

```
before: Game running | Hud running | overlay none | isPortrait() false
CONTROL enemies moved while running: 2 of 2
stale frame delivered; window is back to 844x198
after: Game PAUSED | Hud PAUSED | overlay none | isPortrait() false
enemies moved after the stale frame: 0 of 3
VERDICT SOFT LOCK
```

### After the fix

| viewport | `softlock` | `stuckguard` unowned | `stuckguard` owned |
|---|---|---|---|
| 667x375 | NO LOCK, enemies 4/4 moving | recovered + reported | left alone |
| 844x390 | NO LOCK, enemies 4/4 moving | recovered + reported | left alone |
| 1440x900 | NO LOCK, enemies 4/4 moving | recovered + reported | left alone |

The recovery, from the event log:

```
[12394ms] stuck: held by NOTHING in paused for 6.0s with no motion and no accepted input
[12395ms] stuck: recovering; rotate gate released nothing
[12395ms] stuck: resumed Game
[12395ms] stuck: resumed Hud
crash report: soft lock -- held by NOTHING in paused for 6.0s ... | gates: none
```

And the owned case, which must not be seized:

```
after 9s with settings open: Game still PAUSED (correct) | panel still open (correct)
  gate log: [14206ms] +settings wave=0 mode=normal
```

### Portrait still gates

```
portrait=true  rotate gate showing=true  window=500x890  media(portrait)=true
RESULT portrait is gated
```

### No layout regressions

`sh tools/harness/run.sh screens`: 667x375 and 844x390 each report the single
known exception (the version stamp's hidden five-tap dev door, deliberately
under 44pt and self-labelled); 1440x900 is clean.

The drawer, measured on a frame: `panel 152x218 grid 136x118 maxScroll 80`,
6 of 6 tiles reached and pressed.

### Tests and typecheck

- `npm test` — **849 pass, 0 fail** (was 833 before this work; 16 new).
- `sh tools/tsdiff.sh be0ff43` — only the two known local blind-spot errors
  (`LoadoutScene` `cameras`/`input`, and `StuckWatch.ts` TS2307 `phaser`).
  Both resolve in CI, which has real typings. Computed, not rendered.

## What was NOT checked

- **No physical iOS device.** The stale-viewport transient is reproduced by
  shadowing `window.inner*` for one frame, which matches the behaviour the
  gate's own comments describe, but it is a model of the device rather than the
  device. If Cory can rotate a real phone mid-run a few times and the run
  survives, that closes it properly.
- **The guard's six-second threshold has not been playtested.** It is long
  enough that no legitimate pause tripped it in any scenario run, but nobody
  has yet sat with a child to see whether six seconds feels like a long time to
  a frozen screen.
- **The non-firing level 3 tower and the unlabelled blue bar are not in this
  report.** They are open items from the previous brief, carried below.
- The `drawer` scenario flags `*** re-tapping the selected tile did not cancel`.
  Verified pre-existing by stashing this work and re-running: identical flag on
  unchanged code. It looks like a scenario sequencing artifact — the drawer is
  closed and the selection already null before the "re-tap" — but it has not
  been chased down.

## Where this leaves the repository

**In flight**

- Commit 5d30310 on `claude/phaser-vendor-layout-authority-74uaif`, a clean
  fast-forward to `main`. CI result recorded in the table above.

**Carried forward, still open**

1. **Card text still overflows its card on the Loadout** (from the previous
   brief, diagnosed but not fixed). Two defects: `stackSections` may squeeze a
   card row below its measured content height, which puts BRAMBLE's and
   GRINDER's last line outside the card; and `cardFace` contains a `maxLines`
   clip that truncates SCRATCH TICKET and CHAIN mid-sentence. Fix is to make
   card rows incompressible (`min = natural`), delete the clip, extend the same
   rule to the hero panel, and let the residual go to the existing scroll.
   Consequence worth knowing: this increases scrolling at 667x375, where the
   stack already overflows by 87 design units.
2. **The non-firing tower on level 3** — the wheeled turret with a gunner
   behind a shield. Not yet identified by name; the leading hypothesis is the
   new air/ground targeting layers leaving it with an empty target set, which
   would break it on levels 1 and 2 as well. Whether it fires on level 1 is the
   single observation that separates that from a branching-lane targeting bug.
3. **The unlabelled segmented blue bar** is the hero health bar
   (`HudScene.drawHeroBar`). It is current, not stale; it lost its identity
   when the hero name and DAD MODE label were deleted, and the segments are the
   two thresholds published in `status.heroMarks` (25% Last Stand, 50%
   transform). Recommendation: a hero portrait icon at the bar's left cap,
   rather than restoring text.
4. **667x375 Loadout overflow** — 87 design units with every section at its
   floor, so the specials row scrolls. Levers named in
   `2026-09-06-harness-layout-and-nine-briefs.md`.

**Waiting on a decision**

- Nothing new. Items 1 and 3 above have recommendations attached; item 3 in
  particular is a taste call about the HUD and is Cory's.
