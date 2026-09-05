# Four playtest bugs: the escape that did nothing, the drawer that panned the map, the hero row, and the crash on coming back

Four briefs, worked in the order they arrived. Two of them turned out to be the
same shape of mistake — a question that had to be answered in more than one
place, and the copies drifting — and two were platform behaviour nobody had
looked for.

**Everything is on `claude/targeting-drawer-input-bugs-lb5184`, not on `main`.**
All four briefs said "work directly on main"; this session is bound to that
branch by its own configuration and cannot push anywhere else. The branch is
four commits ahead of `main` and CI is green on it, so a fast-forward merge is
all that stands between this and `main`. Nothing here depends on being on a
branch and nothing needs rebasing.

## Commits

| commit | what | CI |
|---|---|---|
| [`b2c9e05`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/b2c9e05) | Targeting is escapable; chrome no longer pans the map | not run alone — see below |
| [`9bbe0a7`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/9bbe0a7) | The loadout hero row, and the hero names | not run alone — see below |
| [`463e494`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/463e494) | Hero facing, the slot 1 audit, the five hero powers | not run alone — see below |
| [`cff2285`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/cff2285) | Surviving a lost graphics context; the latched device ratio | `test` ✅, `typecheck` ✅, `deploy` skipped ([run 33995885148](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33995885148)) |

**Only the tip has a CI run**, because all four commits were pushed together and
`checks.yml` runs per push rather than per commit. `deploy` is correctly skipped:
it is gated on `main`. Locally every commit was left green — `npm test` and
`sh tools/tsdiff.sh 46f1f72` were run before each one — but the honest statement
is that CI has verified the *tree*, not each step of it. **810 tests pass**,
against 762 before this work.

`tsdiff` against `46f1f72` reports **two** new type errors, both `TS2307
Cannot find module 'phaser'`, one each for the two new files that import the
engine (`HeroFx.ts`, `TextGuard.ts`). That is the unavoidable artifact of having
no `node_modules`; CI, which has the real typings, is green on both.

---

## 1. Targeting mode had no working escape

### What it actually was

Not the handler, not z-order, not a flag left set. The scene wanted CANCEL
without its painted plate — it is drawn on an edge-docked slab — and hid
`PlateButton.parts`. **`parts` includes the button's hit rectangle.** Phaser's
`InputManager.inputCandidate` runs `willRender(camera)` on every candidate, and
an invisible object never renders, so it is never hit-tested.

So all three of the suspected causes were innocent at once: the handler *was*
wired, the rectangle *was* in the input list, and `setCancelVisible` *was*
setting `input.enabled` correctly. The button could not be hit because it was
invisible, and it was invisible because a loop meant to hide two painted images
was iterating over a list that also contained the target.

`hudTakesPress` already claimed the CANCEL rectangle for the HUD, so the tap did
not fall through to the board either — which is why the report is "tapping it
does nothing" rather than "tapping it casts the ability at the corner".

`PlateButton` now exposes `plates` (the two painted states and nothing else), and
`setCancelVisible` shows and hides the hit rectangle explicitly, so a hidden
CANCEL has two independent reasons it cannot be pressed rather than one flag
that has to be right.

### The mode, rebuilt

Targeting was two fields on GameScene written by five methods and read by seven.
It is `systems/TargetingMode.ts` now — Phaser-free, with an explicit set of
exits, exactly one of which spends anything:

| exit | reached by |
|---|---|
| `button` | the CANCEL control |
| `toggle` | pressing the same ability button again |
| `key` | Escape |
| `outside` | a tap on the board outside the legal area |
| `replaced` | another request armed on top, a modal opening, the run ending |
| `commit` | **the only one that starts a cooldown** |

An illegal tap used to refuse and stay armed. That is right about the ability
and wrong about the mode: it meant the only thing any tap could do was keep the
player where they were, which is the soft-lock as felt. It leaves the mode now,
and the ability is still ready on the bar.

`status.mode` and `status.pendingAbility` are still there — the HUD and the save
format read them — but they are mirrors written in `syncTargeting` and nowhere
else. A test asserts `status.mode` has exactly one writer.

### CANCEL, where a thumb is

It was in the HUD band, top-right, under the settings gear, in a grey "wash"
plate. That is the opposite corner from the thumb that armed the ability, and
grey reads as disabled. It is **bottom-right now, on the ability row's own
baseline**, docked flush to the display's right edge, in a warm red slab with an
X glyph beside the word. 116×48 against the old 100×40.

The layout comments record this as CANCEL's third move and explain why the
second one — into the HUD band, on the reasoning that chrome does not belong on
the board — was wrong. The price is paid honestly: on a narrow screen the
ability row **gives way symmetrically** rather than running under the button, so
a notched phone in landscape draws smaller icons than it did. Measured at
568×320 with a notch: the hand shrinks from 370px to 316px, icons from 64 to
55. At 844×390 and above nothing shrinks at all.

`panelArea` gains 18px at the top (CANCEL is out of the second row) and loses
some at the bottom on a narrow screen. Net for the drawer, measured: the 844×390
grid goes from 76px to **94px**, and 568×320 from 36px to **55px** — the narrow
case moves from 58% of a tile to 89%, which the drawer's own test had flagged as
an eight-pixel margin.

### Saying it is waiting

The mode drew nothing until the pointer moved. On a phone there is no pointer
until the finger lands, so a mode that takes over the next tap announced itself
with one line of small text and a grey button that did not work. "Easy to miss"
was not about contrast.

The legal area is painted from the moment the mode is entered, in world space,
and breathes: the road for a path-restricted summon, the whole board's edge for
an unrestricted ability, the lane inside the tower's ring for a rally order, the
disc around the hero for a hero power. Geometry is drawn on the transition;
only the alpha moves per frame.

### The Ima Dummy rally point

**It was a different mechanism** — a selected tower plus a tap on bare ground,
with no `mode`, no CANCEL, no key and nothing to press twice. It is the same
targeting mode now, so it inherits all four escapes and the highlight.

One deliberate difference, and it is a judgement rather than an oversight: an
**out-of-range** rally tap still refuses and keeps the tower selected, with the
ring flashed, because the ring is small and the lane wanders in and out of it —
making the retry one tap instead of three. A **no-lane** tap (a tap at nothing)
exits the mode, like an illegal tap for an ability. The player was never stuck
here either way; both refusals are said out loud.

---

## 2. The drawer still panned the map

### Why the earlier fix did not hold

`systems/Layers.ts` records the scratch card leaking drags to the camera and the
fix that was made: gate the rig centrally on `cameraAcceptsGestures(worldModalOpen)`.
That question is **"is a modal up?"**. The scratch card is a modal. The drawer is
not. Neither is the ability bar, the settings gear, a tower ring, or a counter
plate.

So it was never a general answer; it was the answer for the thing in front of
it, and it held for exactly one overlay.

### The actual path a tap takes to the camera

Two, and they are different:

1. **`CameraRig` listens at the scene level.** `scene.input.on('pointerdown')`
   fires whatever is under the finger — that is what makes a pan possible at all,
   since a pan has no game object to hang a handler on. An interactive object on
   top of the board does not stop it.
2. **The HUD is a different scene.** Its objects are never in GameScene's hit
   list, so no amount of hit-testing in GameScene can see the ability bar. Only
   its geometry can.

The drawer's own `hit` rectangle correctly swallowed the *object-level* event the
whole time. That is the path the earlier fix would have been reasoning about, and
it was never the leaking one.

### The fix, once, centrally

One predicate, `GameScene.chromeUnderPointer(pointer, over)`, asked by the board
to decide whether a tap is its to act on and by the rig to decide whether a drag
is its to pan with. Three sources cover everything drawn:

- **`screenSpace`** — every object this scene draws as chrome. Registration is
  `asScreenSpace`, which an overlay must already call or it would pan and zoom
  with the map, so a new overlay is gesture-safe the day it is written and there
  is no second list to remember.
- **The drawer**, which resolves against its own laid-out rectangles.
- **`hudBlocksGesture`**, for HudScene's geometry, plus its modals.

The rig asks it **once per pointer, at the press**, and a claimed pointer is
never tracked. That covers drag, pinch and release in one stroke rather than
suppressing single taps: a claimed finger cannot pan, cannot become half of a
pinch, and its release cannot disturb a finger that is legitimately dragging.
Asking again on every move would kill a real pan the moment the finger crossed a
piece of chrome on its way past. The wheel is gated too.

### The audit

| overlay | before | now |
|---|---|---|
| control drawer | leaked drags and pinches | claimed by its own rectangles |
| ability bar / START WAVE / settings gear / CANCEL | leaked — different scene | claimed by `hudTakesPress` |
| counter plates, hero health bar | leaked — not controls, so not in the press list | claimed by `hudBlocksGesture` |
| tower ring, scratch card, dialogs, nuke overlays | modal gate only | claimed via `screenSpace` |
| wave banner | leaked | **left alone, deliberately** |

**The wave banner is the one exception and it is on purpose.** It is a centred
`Text` with no plate and no hit area, up for about a second, drawn over the
middle of the board. Claiming it would block build taps during a banner sweep,
which is a regression for a real player and a fix for nobody: there is no
"through" for a tap to fall through, because nothing is there. A test asserts it
stays non-interactive.

Two questions are kept separate on purpose, and the distinction is new:
`hudTakesPress` decides which **taps** a control takes (narrow — the counters
sit over the lane and must not eat a build tap), and `hudBlocksGesture` decides
which **drags** belong to chrome (wider — an opaque plate the map slides under
reads as a hole).

---

## 3. The loadout hero row

### One number produced all four faults

The picker's strip was sized by subtraction: the description took 42% of the
card and the portraits took whatever was left, with a 24px floor so a portrait
was never zero. When the text did not fit its 42%, the leftover went small and
then **negative** — and the floor kept a portrait alive inside a strip with
negative height. From that one value:

- the strip's top was below its own centre, so portraits drew **above the card**,
  over the HERO heading and the subtitle;
- the 24px floor made the character unidentifiable;
- the name sat at `h / 2` of a negative `h`, on top of the portrait;
- the selection ring stroked a rectangle of negative height, which is why it read
  as framing only the portrait.

Reproduced from the old arithmetic at a 1.35 font lead: card 153px, **portrait
24px**, strip 57px, and every one of the five portraits overlapping its name.

### Rebuilt as arithmetic that cannot go negative

`systems/HeroRow.ts` solves the row instead of accumulating it: one decision (how
wide a card is), and every extent added up from it. Same numbers now: card 237px,
**portrait 89px**, no faults. `minPortrait` (66) is a hard floor with a
consequence — below it the row wraps to two lines rather than shrinking further,
because five 24px smudges are not a picker. It never fires at the widths this
game uses, which is what makes the floor safe to enforce.

- Each hero has a real card with a plate, its portrait, and its name below with
  `nameGap` of clear air between them.
- The selection ring, the hit area and the card are **one rectangle**.
- The section is sized to its content under `heroSectionMaxShare` (0.62) rather
  than handed a fixed 40% share; what it does not use goes to the two dealt rows.
- The description uses its space: the blurb on the left, both ability chips with
  their icons on the right, the block as tall as the taller side.

The order inside is the guarantee: the part that cannot shrink (two chips, or the
blurb at the bottom of the type ladder) is measured first and taken off the
ceiling, and `fitHeroRow` returns the largest row that fits what is left.

### Content

- **ELIJAH → Eli.** The roster called him ELIJAH on the picker and Eli
  everywhere else. `CLAUDE.md` now records the distinction: Eli is the hero,
  Elijah is the person credited in `ATTRIBUTIONS.md` and in `audio.json`'s notes
  for three recorded lines. Those are untouched.
- **The second buttons.** Three of five carried names from an older design.
  Cory's read "Loophole", which is a *tower branch* in `NAMING.md`; Bailey's read
  "Fetch", which was Eli's old active in `DESIGN.md`. The set is now
  Haymaker/Spike Strip, Shockwave/Seismic, Ember/Fireball, Quick Cut/Star Rain,
  Bark/Zoomies, and a test asserts no retired name survives anywhere the player
  or the log can see it.
- **A reserved slot** now renders dimmed with "(soon)" appended, so an
  unimplemented power reads as coming rather than as broken. As of §4 none of
  them is reserved any more, but the path is tested and kept.
- **Each card draws its own hero.** Verified two ways: `portraitSprite` keys and
  the files they resolve to are all distinct (asserted), and the five images were
  rendered and looked at. **Bailey's card is the dog.**

### `DESIGN.md` was not changed

It still describes "Elijah — The Charmer" with an active called *Fetch*. That is
a design document describing an earlier plan, and the four briefs gave an
explicit intended set that supersedes it. Reconciling the two is a decision about
the design rather than about the code, so it is flagged here and left.

---

## 4. Hero facing, slot 1, and the five hero powers

### Heroes walked backwards

Not Bailey's asset. `Hero.ts` carried *"both hero sprites are drawn facing
LEFT"* as a blanket rule, with the shared facing test asked about the **reversed
heading** to match. That is true of Cory — every frame of him, walk, attack and
the SUV — and he was the only hero when it was written. The four added afterwards
are all drawn facing right, so all four walked backwards everywhere they went.

Confirmed by rendering the art rather than by reading the code: Cory's static,
all four walk frames, the attack frames and the SUV all face left; Courtland,
Han, Eli and Bailey face right in both base and powered form.

Which way the art points is `artFacing` in `heroes.json` now, and
`mirroredFor(headingLeft, artFacing)` resolves it. The flip and the horizontal
ground-anchor correction move together in one `applyFacing`, because the five
call sites that did it by hand were five chances to update one and forget the
other. A test drives east, west and both diagonals through the real heading rule
for all five heroes.

### Slot 1: all five fire, and the problem was visibility

Every one of the five was wired, applied its effect and respected its cooldown.
What Bark lacked was any output at all: it deals **zero damage by design**, so
unlike the other four it printed no number, threw no spark and played no blast —
its entire feedback was a 3px cream ring at 0.8 alpha over a painted map, gone in
420ms.

- **Bark** gets the shared placeholder ring at its real radius, tinted to Bailey,
  and a `SLOW` mark on each enemy it caught. A slow nothing acknowledges is
  indistinguishable from a slow that missed.
- **Shockwave** dealt damage and printed no number — the only slot 1 that did.
- **Ember's burn**, which is most of its damage, ticked silently.
- **Haymaker** and **Quick Cut** were already legible and are unchanged.

### Slot 2: five powers, one mechanic

Powered form only, 12.5s, and **the cooldown resets on transformation** — a
button that has just become usable and is not usable yet reads as the gate being
broken rather than as a cooldown, so changing *is* the recharge.

All five are placed by tapping the medallion and then tapping the map inside
`castRadius` of the hero, **through the targeting mode built in §1**. That is the
payoff for doing §1 first: the powers inherit all four escapes, and arming spends
nothing, because the cooldown starts in `firePower`, which is reached only from a
tap that resolved to `commit`.

| hero | power | effect |
|---|---|---|
| Cory | Spike Strip | a band on the lane for 8s, charging every 0.6s, damaging and slowing what crosses it. The only persistent one. |
| Courtland | Seismic | a burst at the point, with a short stun |
| Han | Fireball | one heavy hit in a small radius |
| Eli | Star Rain | 14 small strikes scattered over the area, 0.12s apart |
| Bailey | Zoomies | she runs the line to the point, hurting and throwing back what she passes through |

The rules are in `systems/HeroPowers.ts`, Phaser-free and driven directly by the
tests: the gate (which *calls* the `slot2Usable` the HUD greys the button with,
rather than restating it), the cast radius, the dash corridor, the even-by-area
scatter, and the hazard's tick accounting — a long frame charges twice rather
than dropping one, because a hazard whose damage depends on the frame rate
cannot be balanced.

Two design notes worth keeping:

- **Zoomies damages the corridor, not the destination.** A blast at the far end
  would be Seismic with a walk animation. She is moved by her rally point rather
  than by writing her position, so she arrives under her own rules.
- **Star Rain resolves each strike where and when it lands.** Resolving them up
  front would make the spread cosmetic — a strike three quarters of a second in
  should miss what has walked out of the patch.

### The placeholder art

`systems/HeroFx.ts`, one file to delete when the real art lands: an expanding
ring for the area effects, a swept band for Zoomies, a toothed rectangle for
Spike Strip. Every shape is **tinted to the hero** (`colour`, which lives on the
hero rather than on the power) and **sized to the power's real radius**, so the
radii can be judged before the art exists and a tuning change moves the picture
with it. A test asserts nothing in that file invents a size.

Every damage number, radius, duration and cooldown is in `heroes.json`. A test
scans the power bodies for numeric literals and finds none (the seconds-to-
milliseconds conversion is allowed by name).

**Balance is a first pass and has not been played.** The numbers are the ones in
the table above; nothing has been tuned against a real wave.

---

## 5. The crash on coming back

### What it was

The stack — `Text.updateText → Frame.setSize → setCutPosition → updateUVs`,
reached from `LoadoutScene.drawPanel → updateCounter → setText` — is where it
surfaced. `setText` is an ordinary redraw of a scene that was already built.

The null is the **Text object's own 2D canvas context**. iOS discards the backing
stores of a backgrounded page's canvases when memory is tight, tells nobody, and
every Phaser `Text` is a canvas. Nothing fires, nothing is restorable through the
usual route, and the only sign is a null context at the moment of the next draw —
so the first thing that redrew after foregrounding is the thing that reported it.
There is nothing special about the Loadout screen except that it was the one on
screen.

### Two halves, two different problems

**The WebGL context**, which the browser does announce. `webglcontextlost` was
already handled with `preventDefault`, and that part held. What was missing:
pausing a scene does **not** stop rendering — Phaser draws a paused scene's
display list every frame — so the loop itself now sleeps on loss and wakes on
restore. And coming back **checks the renderer before resuming anything**, since
resuming is what causes the first draw and a first draw into a dead context is
the crash rather than a symptom of it. A context that does not return within four
seconds rebuilds the game cleanly (`main.ts` now has a re-runnable `boot()`)
rather than leaving the player on a rectangle that cannot draw.

**The per-text canvases**, which nothing announces. `Text.updateText` is wrapped
once, centrally. A prototype patch wants justifying: the alternative is a guard at
every call site that sets text, and there are dozens across nine scenes plus the
ones inside the engine that no call site can reach. The failure is not a property
of any call site — it is a property of every `Text` in the game after the platform
takes its memory back.

The policy is `systems/RenderHealth.ts`, Phaser-free and tested directly: check
first, rebuild the canvas, draw; on a throw, rebuild and retry **once**; then
**skip**. There is no third attempt on purpose. The engine-facing shim is
`systems/TextGuard.ts`, which also repoints the texture at the new canvas and
drops the GPU copy of the purged one — without that the label stays blank — and
walks every live scene's `Text` on restore, because nothing marks one dirty on its
own and a heading's string never changes.

`Resolution.ts` had to become a type-only Phaser import so the device-ratio latch
below is reachable from a test. It uses no Phaser values.

### Why dpr reported 1

`deviceScale()` re-read `devicePixelRatio` on **every call**, and iOS does not
report it reliably while a page is hidden or is being restored from the
back/forward cache — it can read 1 for a frame or two on the way back in.

That is not cosmetic. This number is the exchange rate between the two coordinate
spaces the whole game is written in — `viewW`, the UI camera's zoom, the camera
band, every `pointerToScreen` — so a transient reading puts two halves of one
calculation in different spaces within a frame, and through `applyResolution`
would size the canvas to a third of the device's pixels. It is **latched for the
session** now and re-read only deliberately, never while the page is hidden.

**On desktop, dpr 1 is real and the canvas is correct.** The plumbing is doing
exactly what it should. What is true is that rule 7 has no headroom there: Cory
draws at 180 physical pixels from a 470px source, which is 2.6× minification with
no mipmaps — right at the point `RENDER-QUALITY.md` §4 identifies as where a 4px
outline smears. A render-scale floor on low-dpr displays would fix it in one
line, at 4× the fill rate on the machine best able to afford it, and would change
what every sprite in the game is authored against. The numbers are written up in
**`RENDER-QUALITY.md` §6**; the decision is Cory's and is not made here.

---

## What was NOT checked

**No screenshots and no harness run.** `tools/harness/` needs a Phaser dist, and
there is none: `npm` answers 403 for `phaser`, and `cdnjs.cloudflare.com` is
blocked at the proxy. So nothing in this report was verified by playing the game,
and that is the largest gap in it. Specifically unverified by eye:

1. That CANCEL is now hittable in a real Phaser scene. The cause is understood
   and the mechanism is Phaser's documented `inputCandidate`/`willRender`
   behaviour, and the fix is asserted at the source level — but the proof is a
   tap on a device.
2. That the drawer, the HUD and the counters no longer pan the map under a real
   finger, and that a real two-finger pinch starting on the drawer does nothing.
3. That the hero row lays out as the geometry says. The before/after diagram sent
   in chat is computed from the real layout module at a modelled 1.35 font lead,
   **not** a game screenshot; text heights in Phaser are a font question this
   environment cannot ask.
4. That every hero now walks forwards. The art was inspected and the rule is
   tested end to end; the sprites were not seen moving.
5. That the five hero powers look right, and that their radii are sensible. They
   have never been played.
6. **The context-loss path itself.** Simulated loss and restore is tested as a
   policy, and the wiring is asserted at the source level. Nobody has backgrounded
   a real phone against this build.

**`TextGuard.ts` and `HeroFx.ts` carry `tsdiff`'s stated blind spot**: they are
new files importing `phaser`, so `Phaser` is `any` locally and every member they
touch is unchecked here. CI's real typings accept both. The Phaser members used
were checked against the documented API by hand: `TimeStep.sleep/wake`,
`Game.destroy`, `WebGLRenderer.contextLost`, `CanvasTexture.refresh`,
`Graphics.save/restore/translateCanvas/rotateCanvas`, `Text.updateText`.

**Not measured:** the cost of the `updateText` wrapper on a frame with many text
objects, and the fill cost of the placeholder effects during Star Rain's
fourteen strikes.

## Where this leaves the repository

**In flight:** the four commits above, on
`claude/targeting-drawer-input-bugs-lb5184`, CI green at the tip, `deploy`
correctly skipped because the branch is not `main`. **Merging to `main` is the
one remaining step** and it is a fast-forward.

**Waiting on a decision (Cory's):**

1. **The desktop render-scale floor.** `RENDER-QUALITY.md` §6, with the numbers.
   Changes what the art is authored against, so it is not a code decision.
2. **CANCEL's new home costs the ability icons on a narrow phone.** 64px → 55px
   at 568×320 with a notch, nothing at 844×390 and up. If that is the wrong
   trade, the lever is `cancelWidth` or moving CANCEL above the ability row.
3. **`DESIGN.md` still describes Eli as "The Charmer" with an active called
   Fetch.** The intended ability set supersedes it; reconciling the document is a
   design call.
4. **Hero power balance is a first pass**, entirely untuned.
5. **The Ima Dummy's out-of-range tap keeps the tower selected** rather than
   exiting the mode, while a no-lane tap exits. Defensible, and a deliberate
   divergence from "a tap outside the valid area is a way out".

**Carried forward from the last report, still open, not touched here:**

- **There is no `package-lock.json`.** Both `checks` and `deploy` resolve
  dependencies fresh on every run.
- **`tools/trace_map.py` is broken.**
- **The eight ability icons that grew as WebP** (90KB, revertible in one line),
  and **lossless for the twelve low-PSNR small sprites** (0.55MB, measured).
- **`art-source/` has no README.**
- **The 3MB-per-image cap**: `maps/map_level3.webp` at 1.29MB is still the
  largest single image.
- **`AUDIT.md` and `SOAK-REPORT.md` were not revised** and remain accurate as
  history.

**New, and worth someone's attention:**

- **`tools/harness/` cannot run in this environment at all**, and three of the
  four briefs asked for visual confirmation. Vendoring `phaser.min.js` into the
  repository (or into `tools/harness/`) would make every future session able to
  see what it is changing. It is ~1.2MB and it is the single highest-value
  unblock available.
