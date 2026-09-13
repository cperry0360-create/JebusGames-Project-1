# Level 8's soft lock: a pause the HUD never let go of

2026-09-13

**The cause is not in level 8.** `HudScene.paused` is a field on a scene Phaser
REUSES, and only one of the three ways out of the settings panel ever reset it.
A run left through RESTART or HOME — or through any viewport change, which
restarts that scene — handed the NEXT run a HUD that still claimed a modal was
up, and `GameScene` asks exactly that before acting on any press. Every tap on
the board was answered as a tap on chrome. **Every level is affected, levels 9
and 10 included when they are built.** Level 8 is where it was found because it
is the level a player restarts.

## Commits

| commit | what | CI |
| --- | --- | --- |
| `18d6b4e` | The HUD stops carrying a pause across a run, and the board answers again | run 323: **green** (`npm test` pass, `npx tsc --noEmit` pass, deploy skipped: not `main`) |
| `REPORT`  | This report | run 324: filled in below |

Branch: `claude/level-8-soft-lock-9bmho0`. Base: `67acfc1`, which is
`origin/main` and the commit the fault was reported at.

---

## 1. The symptom, and what it has to be

The report: level 8 loads and runs, waves spawn, enemies walk, the HUD updates,
and no board input works — no tower can be placed, no special cast, the hero
cannot be moved. Levels 1 to 7 unaffected.

Towers, specials and hero orders all resolve through **one** handler,
`GameScene`'s scene-level `pointerup`, so the three cannot fail separately.
That handler has exactly four ways to do nothing:

```ts
if (this.pressFiredBeam) return
if (this.pressTakenByUi) return
if (this.rig.consumedGesture) return
this.onClick(p)            // which itself returns on phase 'won' | 'lost'
```

**An exception during setup was ruled out first, by driving one.** Patching the
staged build to throw immediately before `setupInput()` on level 8 and running
the harness gives a scene that never reaches `RUNNING`: Phaser's `SceneManager`
sets that status *after* `create()` returns, so a scene that threw gets no
`update` at all. No waves, no walking enemies, no HUD. The reported symptom has
all three, so `create()` completed and the handlers were attached. (The page
error is visible, too — the guards catch and name it — which is the other half
of the answer to "was anything thrown".)

That leaves a condition, and `pressTakenByUi` is the one that was set.

## 2. What reproduced it

`pressTakenByUi` is written at every press from `chromeUnderPointer`, whose
first line is:

```ts
if (this.modalOpen || this.hudModalOpen) return true
```

`hudModalOpen` reads `HudScene.modalOpen`, which is `this.paused || this.panel
!== undefined`. `paused` is set by `openSettings()` and cleared by exactly one
path — CONTINUE, through `resumeGame()`. The other two buttons on that panel do
not:

```ts
private restartRun(): void {
  this.scene.resume('Game'); this.scene.stop(); this.scene.get('Game').scene.restart()
}
private quitToTitle(): void {
  this.scene.resume('Game'); this.scene.stop('Game'); this.scene.start('Title')
}
```

Both stop HudScene with `paused` still true. Phaser builds one instance of each
scene at boot and re-runs `create()` on it for every run; `create()` reset
`slots`, `slotKeys` and the counters, and not this. So the next run started with
`modalOpen` true, invisibly — the panel had gone with the scene that drew it.

**Driven, not argued.** `tools/harness/run.sh boardinput … afterpause:level8` is
new: it starts a run, taps the gear for real, taps the panel's own named button
for real, and then plays the level under test. At `67acfc1`:

```
settings open: Hud.paused=true Game paused=true
left through RESTART: Hud.paused=true
left through HOME:    Hud.paused=true
level8: pads=19 modal=false hudModal=true drawer=false phase=ready
   *** the build ring did not open on pad 0: takenByUi=true ... modal=false phase=ready
   *** nothing cast:                         takenByUi=true ... modal=false phase=ready
   *** the hero did not move:                takenByUi=true ... modal=false phase=ready
   wave running: enemies=2 phase=wave
   *** the build ring did not open on pad 1: takenByUi=true ... modal=false phase=wave
   *** nothing cast:                         takenByUi=true ... modal=false phase=wave
   *** the hero did not move:                takenByUi=true ... modal=false phase=wave
RESULT *** 8 of 12 checks failed ***
```

Every reported detail is there: the waves spawn (`enemies=2 phase=wave`), the
counters tick, `Q` still arms the molotov because the HUD and the keyboard are
not the board — and the three board actions are dead together.

**And the same run on levels 1 and 7 fails identically**, `hudModal=true` and
`takenByUi=true` on every press. This was never a level 8 fault.

### Why the board and not the rest

`cameraAcceptsGestures` and `hudInteractive` are both asked about
**GameScene's** `modalOpen`, which was false. So the camera still panned, the
HUD stayed live and drawn, START WAVE still worked, and waves start themselves
on a countdown anyway. The only thing that reads `hudModalOpen` is
`chromeUnderPointer` — which is to say, the board and nothing else.

### The worst version of it

`relayout()` restarts HudScene on any viewport change — a rotate, or iOS
Safari's URL bar collapsing. A settings panel open across one of those left
`paused` true with `settings` pointing at a destroyed panel, and
`openSettings()` guards on `this.paused && this.settings`: **the gear that is
the only way back was dead as well as the board.** On an iPad that is a
one-rotation soft lock with no recovery. The `afterpause` scenario drives this
case too, through the ScaleManager, because there is no gesture it can come
from.

## 3. What it was not

Recorded because the brief names them as starting points and each cost time:

- **Level 8's lane shape is sound.** `validateLanes` accepts one entrance and
  two exits: `laneDefs` synthesises the trunk with `entrance: true` from
  `mainId`, both arms are fed by `mainMerge`, and the terminal rule is
  satisfied. Nothing downstream reads `LaneDef.entrance` at all — the only
  readers in `src/` are `Lanes.ts` itself and the type.
- **`map.entrance` being absent is normal.** Levels 2 to 8 all lack it; the
  gateway defaults cover it, and `createPads`'s `map.waypoints[0]` is the
  computed gateway at `(-60, 116)`, which is a fine thing to measure a distance
  from.
- **19 pads is not the most.** Level 7 carries 22. The note in
  `map_level8.json` predates level 7.
- **The level's own mechanics are not involved.** A `deep:` pass drives all
  thirteen further waves with a hero order tapped between each: the gate, the
  aura, the death blast and the CEO's summons all fire and the board keeps
  answering. One such pass went red at wave 13 and did not reproduce on a
  second run — that is the Server Nuke's 2% drop putting its announcement
  overlay up for two seconds, which is a modal doing its job, not a lock.

## 4. The fix

`releaseHudModals()` drops the panel, the dialog and the flag, and hands
GameScene back the pause the HUD took on its behalf:

```ts
private releaseHudModals(): void {
  this.settings?.close();  this.settings = undefined
  this.panel?.close();     this.panel = undefined
  if (!this.paused) return
  this.paused = false
  leaveGate('settings')
  if (this.scene.isPaused('Game')) this.scene.resume('Game')
}
```

`isPaused` is asked rather than assumed: this runs on shutdown as well, and
QUIT has already stopped GameScene by then.

It is called from `restartRun`, from `quitToTitle`, and from `shutdown` —
the exit that cannot be forgotten, and the one that covers `relayout`. `create()`
drops the three references as well, for a run that starts after one that never
shut down cleanly.

**GameScene's own modal references are cleared in `create()` too**, beside the
`ticket` that was already there. `modalOpen` there is an OR over `dialog`,
`ticket`, `nukeEarned` and `nukeLaunch`, on a scene object that is equally
reused; the results dialog's buttons happen to close themselves after their
`onPick`, so no route through them is known to leak today. These are the same
fault's other doors, closed before one of them is used.

**A behaviour change worth naming:** a viewport change while the settings panel
is open now returns the player to the running game rather than to a frozen one.
The panel is gone either way — it was destroyed with the scene — so nothing is
left holding the pause.

## 5. Levels 9 and 10

They will share it, and not for any reason to do with their maps. It lives in
`HudScene`, which is one scene for the whole game; level 9's two entrances and
interior exit and level 10's one of each change nothing about it. What those
shapes do have to satisfy is `validateLanes`: every lane either merges
somewhere, is merged into, or is flagged `entrance: true`. Level 8's
one-entrance/two-exit shape passes today and is the template for both.

## 6. Verification

Everything below is from a rendered frame in `tools/harness/`, Chromium at
`DPR=3`, with the real shipping source compiled by `build.sh`.

| check | 1400x900 | 844x390 | 667x375 |
| --- | --- | --- | --- |
| `boardinput` levels 1–4 — tower on pad 0, special, hero order, before the wave and mid-wave | 37/37 | 37/37 | 37/37 |
| `boardinput` levels 5–8 — the same | 37/37 | 37/37 | 37/37 |
| `boardinput afterpause:` — CONTINUE, RESTART, a resize while paused, HOME, then the level | 19/19 | 19/19 | 19/19 |
| `screens` | no faults | 1 known fault | 1 known fault |

The one `screens` fault at both phone widths is the title screen's version
stamp reading as a SMALL control — the hidden five-tap dev door, unchanged and
reported in five previous reports.

390x844 (portrait) reports `portrait is gated`, which is the correct answer for
portrait rather than a skipped check.

Reproduce:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh boardinput 400 844x390 level5,level6,level7,level8
sh tools/harness/run.sh boardinput 300 844x390 afterpause:level8
sh tools/harness/run.sh screens 160 844x390
python3 tools/harness/shrink.py tools/harness/shots/boardinput-level8-wave.png 900
```

The level 8 mid-wave frame at 844x390 shows two towers standing on their pads,
a wave walking, the Performance Review gate lit, and `Cory is moving.` in the
message row — all three actions, from real pointer events, in one picture.

**What was NOT checked.** Nothing was run on a device: every frame here is
Chromium at a forced viewport, and the report that started this came from an
iPad. Nothing here drives a real TouchEvent — the harness dispatches
MouseEvents, so multi-finger behaviour (pinch, a second finger arriving during
a pan) is still unexercised by anything. The `deep:` pass kills each wave rather
than fighting it, so it is a walk through the wave table's spawns, not a played
run.

### Tests

- `tests/modalstate.test.ts` — 4 checks, and **all four fail on `67acfc1`**.
  It re-derives the field list from each scene's `modalOpen` getter rather than
  listing them, so a fifth overlay added next year is covered on the day it is
  written.
- `tests/boardinput.test.ts` — 2 checks: every registered level's first pad
  resolves through `BuildSystem.spotAt` and has its whole tap target on the
  plate, and the harness scenario still defaults to every row in `levels.json`
  and still checks all three actions.
- Full suite: 1088 passing, 0 failing.
- `sh tools/tsdiff.sh 67acfc1`: 212 errors at the baseline, 213 in the working
  tree. The one difference is `TS2339: Property 'events' does not exist on type
  'HudScene'` — cascade from the missing `phaser` package, and the same
  `this.events.once('shutdown', …)` idiom GameScene already ships. `isPaused`
  is `ScenePlugin.isPaused`, present in `vendor/phaser.min.js` and exercised by
  the `afterpause` run rather than only typechecked.

## 7. A separate finding, noted rather than fixed

**Three build pads cannot be tapped at phone widths, because the HUD owns those
presses and the camera cannot move them.**

| level | pad | world | screen, camera as close as it goes | what takes the press |
| --- | --- | --- | --- | --- |
| 6 | 1 | 1167, 53 | 770, 34 @ 844x390 · 608, 27 @ 667x375 | START WAVE |
| 6 | 2 | 288, 62 | 190, 40 @ 844x390 · 149, 32 @ 667x375 | the counters plate |
| 4 | 1 | 504, 92 | 303, 55 @ 667x375 | the counters plate |

`hudBlocksGesture` gives a press to the HUD wherever START WAVE, the gear,
CANCEL, the hero chip, the ability row or the counters plate is drawn, and that
is correct. What is wrong is a pad in a corner of the plate the camera is
already hard against: there is nowhere to pan it to, so at those viewports the
pad is furniture. Level 6's `(1167, 53)` is already carried forward from the
level 7 report for a different reason — it reaches no road — so it wants moving
anyway.

The `boardinput` scenario names each of these with its numbers and moves to the
next candidate, deliberately: a board-layout fault must never be reported as a
dead input path, which is the whole subject of this report. **Pad 0 is offered
alone**, so a level whose first pad is unreachable still fails.

---

## Where this leaves the repository

**On `claude/level-8-soft-lock-9bmho0` at `18d6b4e`, fast-forwardable onto
`main` at `67acfc1`.** The session cannot push to `main`; the merge command is
the first line of the closing message.

**Landed**

- The soft lock, fixed at its cause in `HudScene`, plus the same class of leak
  closed in `GameScene` before it is used.
- `tools/harness/run.sh boardinput`: the first harness coverage of tower
  placement, special casting and hero movement from real pointer events, across
  every registered level, with `real:`, `deep:` and `afterpause:` modes.
- Two node tests, four of whose six checks fail on the parent commit.

**Open, and this report's own**

1. **THE THREE UNREACHABLE PADS** in section 7. Moving them is a map edit on
   levels 4 and 6, and level 6's is already on the list for a second reason.
   **Waiting on a decision about whether the HUD should shrink its claim
   instead.**
2. **Nothing was verified on a device.** The report that started this came from
   an iPad and the fix is verified in Chromium. It should be confirmed on the
   iPad by doing what caused it: open the gear, press RESTART, and try to build.
3. **No harness scenario drives a real TouchEvent.** Every press in
   `tools/harness/` is a MouseEvent, so nothing in the repository exercises two
   fingers — which is what `CameraRig`'s pinch path is made of.

**Carried forward, unaddressed** (from `reports/2026-09-13-level-7.md`)

- HR's armour aura still does nothing on level 8.
- Level 8 is a boss cliff: 229 of its 285 losses are wave 13.
- Level 6's cone art, its flame crossing lanes, the flank's 4.0 s late arrival,
  `width: 64` against a 40 px road, and the painted pad squash.
- Levels 1 and 3 soak at 89% and 88%, outside the 35–45% band.
- Eight of nine level 7 sprites are short of rule 7.
- The nine non-asserting harness scenarios — `ui`, `muzzle`, `buildall`,
  `rockets`, `retreat`, `regressions`, `poor`, `typegame`, `meteor` — and black
  `GL=1` screenshots for want of `preserveDrawingBuffer`.
- The title screen's version stamp reads as a SMALL control at phone widths.
