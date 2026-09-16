# Four HUD changes from live play: the numbers, the chip, the row and the wave

| commit | what | CI |
|---|---|---|
| `b105805` | the four changes, their tests, and the two harness instruments | *pending* |
| `f315335` | merge `main`: the cutscene reorganisation and the guaranteed Ima Dummy Tower | *pending* |
| *this commit* | the re-soak against `main`'s NEW integers, and this table | *pending* |

**`main` moved under this branch while it was being verified**, and it moved
the thing the brief asked to hold still. `b0150d5` guarantees the Ima Dummy
Tower in every opening hand, which took the ten levels from
428/255/422/299/218/210/198/184/192/195 to
405/218/422/328/343/83/133/146/119/117 — see
`reports/2026-09-16-dummy-tower-guaranteed.md`. The brief's ten integers are a
fact about `f3d597d`, which is what this branch was cut from and what the first
soak below was measured against; the second soak is against the merged tree and
`main`'s current numbers. **Both are ten out of ten identical.**

**Answers first.**

1. **The hero chip bug is five objects in absolute coordinates where two were
   re-read every frame and three were baked at build time.** There is no
   container. `drawHeroChip` redrew the plate and the health bar from
   `this.layout.heroChip` on every frame; the portrait, the respawn label and
   the tap rectangle were positioned ONCE in `buildHeroChip` from the rectangle
   that was current at scene creation. The Server Nuke **adds** a medallion, so
   the row is re-measured a drafted pitch wider, and a CENTRED row that grows
   pushes its own left edge left — taking `heroChip.x` with it, because the chip
   is reserved against that edge. Measured on a rendered frame: the box moves
   **28 px left** at 844x390 and the hero used to stay put.
2. **The dead medallions do NOT share that cause — and they are now REPRODUCED
   rather than only reasoned about.** `run.sh abilitybar` taps every slot
   through the real input system and reports whether the press reached a
   handler. Before the drop: four slots, all `REACHED`. After it: `molotov`,
   `glacier` and `serverNuke` all `REACHED`, `heroSlot1` **DEAD**, `heroSlot2`
   **DEAD**. That is the bug, on a frame, at 844x390.
   It shares nothing with the chip's cause, and the two candidates a reader
   would reach for first are both ruled out by the same run: **0 rebuilds over
   a second after the drop**, so it is not the every-frame rebuild churn that
   froze this row once before; and all five hit rectangles are registered,
   `interactive=true`, on screen and **0 px** of drift from their own icons.
   The geometry is healthy and the tap still does not arrive. Not fixed here,
   as asked.
3. **The narrower row recovers 0 pads from being hidden, because nothing is
   hidden any more** — the drawing rule the brief describes was removed on
   2026-09-15 and `padShowing` is now `this.build.isFree(spot.index)` alone.
   What the 33 in the brief actually measures is pad/HUD **overlaps at rest**
   across all ten levels at 844x390, and that went **33 → 31**. The figure that
   moved is the one that affects reachability: pads no panning alone can free
   went **24 → 17**.

---

## 1 — The floating damage numbers and the hit sparks

### Every `ART.fx.spark` call site, and what happened to each

Nine, found by `grep -rn "ART.fx.spark" src/`. Four of them went through one
private helper.

| # | where | what it marked | verdict |
|---|---|---|---|
| 1 | `GameScene.fire`, in the projectile's impact callback | every tower shot landing | **removed** |
| 2 | `GameScene.chainFrom` | each extra target a chain tower hits | **removed** |
| 3 | `GameScene.tickVlaudeWalls` | the hero's melee against a Vlaude wall | **removed** |
| 4 | `GameScene.tickCountermeasures` | the hero's melee against a countermeasure | **removed** |
| 5 | `GameScene.countermeasureShot` | where Vlaude's generate-weapon bolt LANDS | **kept** |
| 6 | `GameScene.skillPunch` (Haymaker) | the target of the punch | **kept** |
| 7 | `GameScene.skillDouble` (Quick Cut) | the target of each cut | **kept** |
| 8 | `AbilityRunner.chain` | each jump of the Chain ability | **removed** |
| 9 | `ui/SignBribe` | a ring of sparks round the board on a bribe | **kept** |

1 to 4 are the helper `GameScene.impactSpark`, which now has one caller (5).

**Why 5, 6, 7 and 9 stayed.** The line in the brief is the test: an effect that
says WHAT SOMETHING DID stays, an effect that only says A NUMBER HAPPENED goes.

- **5** is not a hit marker. A countermeasure's bolt is *drawn* rather than
  simulated — a line that fades in 180 ms from a turret to somewhere on the
  board — and the spark is the end of it. It says WHICH TOWER was shot, which
  is the one thing a player has to read off one of Vlaude's six powers firing,
  and those are on the must-survive list.
- **6** is the only mark Haymaker makes on the thing it hits. Its burst art is
  drawn AT THE HERO — it is a punch he throws, not something that lands over
  there — so removing the spark would leave the biggest hit in the game with
  nothing on its target at all.
- **7** is worse: Quick Cut has no burst. The spark at 0.7 × Haymaker's is its
  ONLY effect art of any kind, and `tests/heropowers.test.ts` holds the rule
  that every hero button lands something the player can see.
- **9** is not a hit. It is a flourish round the whole board when a sign is
  bribed, and it reuses the spark sheet because it is a sheet, not because a
  hit happened.

### The four things that carry Haymaker's impact

`GameScene.skillPunch`'s header names them: the held frame, the spark, the
shake, and the number. **Three of the four are kept and the number is the one
that went.** A punch that stops the board for 90 ms, marks what it connected
with, and shakes the camera harder and longer than a tower does not also need
to print `130` — and the print was the member of that list that live play
reported as a glitch. `effects.haymakerNumberScale` (1.9) is retired with it.

### Every `floatingDamage` call site

Twenty-three, across five files. `floatingDamage` no longer exists;
`tests/heropowers.test.ts` asserts the name cannot come back.

- **Twenty are simply gone**: the two hero-power area casts, the strike
  scatter, the beam corridor, the dash, the held beam, Mind Control's swing,
  the spike-strip tick, Haymaker, Quick Cut, Ember's hit and its burn tick,
  Shockwave, the Politician's tax, Vampirism's heal pip, a leaked enemy's lives
  cost, the hero against a wall, the hero against a countermeasure, a tower
  under countermeasure fire, and `Enemy.hurt`, `Fighter.hurt` and
  `Soldier.hurt`, which between them covered every ordinary hit in the game.
- **One survives as a WORD**: Bark's `SLOW`. It deals no damage by design, so
  without a mark on the enemies it caught, a slow that landed is
  indistinguishable from one that missed. It goes through `floatingLabel`,
  which no longer takes an amount at all — so it cannot quietly become a number
  again — and `presentation.floatingLabel` has no `critFontSize` and no scale
  multiplier, which were the two keys that made the old helper a readout.

`presentation.damageNumbers` (risePixels 34, durationMs 620, fontSize 15,
critFontSize 21) and `effects.chainSparkSize` are deleted, each with a
retirement note in place so the next pass cannot re-add them by accident.

`Enemy.hurt`'s third parameter `showNumber` and `GameScene.damageEnemy`'s fifth
are gone too: fifteen call sites were threading `0, false` through the damage
path to switch off something that no longer exists.

### From a rendered frame

`sh tools/harness/run.sh combat 200 844x390`, which now takes a **census** of
the board rather than only screenshotting it. A number lives 620 ms and a spark
200 ms, so one screenshot can miss them by landing between two; the display
list is sampled every 120 ms for the whole wave instead, and the screenshots
stay because the numbers cannot see a sprite drawn behind another one.

Same instrument, same wave, two trees:

| | `main` at `f3d597d` | this tree |
|---|---|---|
| samples, all with enemies on the board | 218 | 216 |
| samples where damage was landing | 199 | 199 |
| world-space **numbers** | **80** (`"11"`, `"11"`, …) | **0** |
| hit sparks (`fx-hit-spark`) | **35** | **0** |
| enemy health bars seen | 767 | **762** |
| lives at the end / final phase | 16 / ready | 16 / ready |

The middle two rows are the point and the last three are what makes them worth
anything: the wave really ran, damage really landed, and the bars really
survived. The scenario fails if any of those three liveness checks comes back
empty, because three zeros from a sampler that was not watching look exactly
like three zeros from a board with nothing on it.

---

## 2 — The hero chip bug

### Which of the two it was

Neither exactly, and the difference matters. **There is no container.** The
chip is five separate objects in absolute screen coordinates:

| object | drawn where | positioned when |
|---|---|---|
| `chipPlate` (the black box) | `drawHeroChip` | **every frame, from `this.layout.heroChip`** |
| `chipBar` (health) | `drawHeroChip` | **every frame, from `this.layout.heroChip`** |
| `chipPortrait` | `buildHeroChip` | once, at scene creation |
| `chipLabel` (respawn countdown) | `buildHeroChip` | once, at scene creation |
| `chipHit` (the tap rectangle) | `buildHeroChip` | once, at scene creation |

So it is a **partial** recompute: two of the five track the live rectangle and
three are baked. That is why it looks like a container problem — the box moves
and its "contents" do not — and why it is not one: the box is not a parent, it
is the only thing being asked where it belongs.

### Why the Nuke is what triggers it — it ADDS a medallion

Confirmed in `systems/AbilityBar.ts`: `slotDefs` appends the rare ability to
the end of the DRAFTED group, before the hero's own two. So the hand goes from
four slots to five, `barWidth` grows by exactly one `draftedPitch`, and
HudScene's signature check fires `relayoutAbilities()`.

The row is **centred**, so a row that grows pushes its own left edge left by
half the growth. `HudLayout.ts:398`'s `chipBlock = heroChip + heroChipGap` is
reserved from that left edge —
`heroChip.x = Math.max(lo, abilities.x - chipBlock)` — so the chip's box slides
left with it. Measured on a rendered frame at 844x390:
**the box moves 28 px left** (a `draftedPitch` of 56, halved). Before this
change the pitch was 72 and the slide was **36 px**, against a chip half-width
of 30 — which is how the hero ended up drawn fully outside his own box in live
play rather than merely off-centre.

### The fix

`HudLayout.heroChipContent(box, edgeWidth)` is the one piece of arithmetic —
centre, and the square the portrait is fitted into — and both `buildHeroChip`
and `drawHeroChip` place from it. `drawHeroChip` now re-places the portrait,
the label and the tap rectangle from the **live** box on every frame, which is
three `setPosition` calls on objects already being redrawn.

Two smaller things went with it, because they are the same class of fault:

- the portrait's fit was cached on the texture key alone, so a layout that
  changed the chip's SIZE would have left it fitted for the old square. It is
  cached on the key **and** the box now.
- `chipHit.setSize` moves the drawn rectangle but not the one `setInteractive`
  built for hit-testing, so the two are re-armed together — guarded, since
  nothing resizes the chip today.

### The test

`tests/hudlayout.test.ts`, "the hero sprite stays in its box when the ability
row changes width". It builds the layout for a four-slot hand and a five-slot
one at every shipped viewport and asserts a centre taken from the live box is
inside it and exactly centred, then asserts the scene re-derives that centre
every frame. **Proved it can fail**: with the three `setPosition` calls removed
it reports `chipPortrait is not re-placed every frame, so it will be left
behind by a reflow`; with them restored, green.

It also carries a note about its own ruler. Against the SHIPPED numbers the
box now slides 28 px and the chip is 60 wide, so a stale centre is (just)
inside — the assertion is made against the **portrait's** fitted square
instead, which 28 px does clear. Asserting against the box would have gone
quietly inert the moment the row was tightened, which is the failure mode
CLAUDE.md warns about.

### From a rendered frame

`sh tools/harness/run.sh herochip 180 844x390` now drops the Server Nuke and
measures all three baked objects against the live rectangle afterwards:

```
the chip box moved 28px left, to 190,320
portrait  centre 220,350   box centre 220,350   off by 0px
label     centre 220,350   box centre 220,350   off by 0px
hit       centre 220,350   box centre 220,350   off by 0px
the portrait moved with it: 28px left, against the box's 28
```

with `chip-6-after-nuke-844x390.png` as the picture. Exit 0.

### The dead medallions: NOT the same cause

The same run records the row one tick after the drop, deliberately as a
measurement rather than a fix:

```
molotov     kind=ability  pitch=56 boxH=52  icon 48x48 at 298,354  hit at 298,354  interactive=true  drift 0px
glacier     kind=ability  pitch=56 boxH=52  icon 48x48 at 354,354  hit at 354,354  interactive=true  drift 0px
serverNuke  kind=ability  pitch=56 boxH=52  icon 48x48 at 410,354  hit at 410,354  interactive=true  drift 0px
heroSlot1   kind=heroSlot pitch=60 boxH=52  icon 48x48 at 484,354  hit at 484,354  interactive=true  drift 0px
heroSlot2   kind=heroSlot pitch=60 boxH=52  icon 48x48 at 544,354  hit at 544,354  interactive=true  drift 0px
```

**All five slots are rebuilt by the reflow**, every hit rectangle is registered
and enabled, and the drift between each icon's centre and its own hit
rectangle's is 0 px on all five — including the two hero medallions. The chip's
fault is objects the reflow left BEHIND; the medallions are objects the reflow
REBUILDS. They cannot share a cause.

### And the bug itself, reproduced

`main` already carries the right instrument and nobody had pointed it at this:
`run.sh abilitybar` overrides `armAbility` and `castHeroSlot`, taps each slot
at its own hit rectangle's centre through the real input system, and reports
whether the press reached a handler.

| slot | before the drop | after the drop |
|---|---|---|
| `molotov` | REACHED | REACHED |
| `glacier` | REACHED | REACHED |
| `serverNuke` | — | REACHED |
| `heroSlot1` | REACHED | **DEAD** |
| `heroSlot2` | REACHED | **DEAD** |

and `rebuilds over 1s after the drop: 0`.

**AND IT IS PRE-EXISTING, run as a control.** The identical scenario on a
worktree at `b0150d5` — unmodified `main`, its own 72 px pitches, built and run
alone — reports the same five lines: `molotov`, `glacier` and `serverNuke`
REACHED, both hero slots DEAD, 0 rebuilds. So narrowing the ability row neither
caused this nor fixed it, which is the question that had to be answered before
shipping a pass that moves those two medallions 28 px.

**That last line kills the obvious suspect.** This row has frozen once before,
and the cause was `slotSignature` disagreeing with itself so the bar was
destroyed and rebuilt every single frame — a hit rectangle that does not
survive a frame can never complete a tap. It is not that: the hand is stable
and the bar is rebuilt zero times a second.

So: the two medallions are drawn where they should be, their hit rectangles are
where the icons are, the rectangles are registered and enabled, the bar is not
churning — **and a tap on them still does not arrive**. Whatever eats the press
is not on the HUD's own display list, and the next session should start by
asking what else is hit-tested at the right-hand end of the ability row after
the row has grown 56 px wider. `run.sh abilitybar 220 844x390` is the
reproduction, and it takes about four minutes.

Left open, as asked.

---

## 3 — The bottom row, pulled in

### The key that governs the gap between medallions

There isn't one, and there must not be: **`abilityBar.heroPitch` minus
`abilityBar.heroIcon`** is the gap between two adjacent medallions, expressed
once. The separate gap that DOES exist is **`abilityBar.groupGap`** — the seam
between the drafted group and the hero's own two. A pitch and a gap that both
claim to place the same icon is the exact drift `systems/AbilityBar.ts` was
written to end, so the pitch was tightened rather than a gap added.

### What moved, and what was not allowed to

| key | was | now | why |
|---|---|---|---|
| `abilityBar.draftedPitch` | 72 | **56** | tap width; 12 px clear of the 44 floor |
| `abilityBar.draftedIcon` | 64 | **48** | the picture inside that column |
| `abilityBar.heroPitch` | 76 | **60** | a round medallion needs its corners |
| `abilityBar.heroIcon` | 64 | **48** | 12 px between two medallions |
| `abilityBar.groupGap` | 26 | **16** | the seam between the two groups |
| `hud.layout.iconHeight` | 64 | **52** | row height AND tap height; 8 px clear of 44 |
| `hud.layout.heroChipGap` | 22 | **20** | *the one that barely moved — see below* |
| `hud.layout.heroChip` | 60 | **60** | **unchanged** |

**The chip did not shrink and its gap barely did.** Everything else in the row
is a control whose mis-tap wastes a cooldown; the chip is the control whose
mis-tap walks the hero into a fireball, and 44 is a floor rather than a target.
Its gap is held at 20 by two independent checks — `tests/hudlayout.test.ts`
asserts the arithmetic, and `run.sh herochip` measures it against the REAL hit
rectangles on a rendered frame and fails under 20. It measured **exactly 20 px**
on this tree. The row was narrowed by the pitches either side of it instead.

### Width before and after

Measured at 844x390 from `heroChip.x` to `abilities.x + abilities.width`, with
a full hand — three drafted cards including the Server Nuke, the seam, two hero
medallions, the seam to the chip, and the chip:

| viewport | before | after | |
|---|---|---|---|
| 844x390 | **476 px** (56% of the width) | **384 px** (45%) | −19.3% |
| 667x375 | 476 px (71%) | 384 px (58%) | |
| 1280x720 | 476 px (37%) | 384 px (30%) | |
| 568x320 | 398 px, icons shrunk to `abilityScale` 0.80 | 384 px at **scale 1.00** | |

The last row is the one worth reading twice. At 568x320 the old row did not
fit, so `abilityScale` cut every icon to 80% and every tap target with them —
a drafted slot taped out at 57.7 px. The new row fits whole, so the smallest
supported landscape screen now draws the bar at **full size** with a 56 px
slot. Narrower is also bigger, there.

### And an `iconHeight` that three files disagreed about

`hud.layout.iconHeight` was 64 in the data, `const ICON_H = 64` in HudScene and
a bare `iconH: 64` in GameScene's `abilitySlotFor`. Both `.ts` copies now read
the data. Nothing was broken by it — they agreed — but the row was about to be
tightened and only one of the three would have known.

`drawSlots` also sized every icon to `r.boxH` — the row's HEIGHT — rather than
to `iconBox(r, bar, k)`, so `draftedIcon` and `heroIcon` could not tune
anything. It went unseen at a 64 box in a 72 pitch, where 8 px of accidental
slack looks like a designed gap. At a 56 pitch it would have been none.

### Hidden pads: 0 recovered, because the rule is gone

**The premise in the brief is out of date.** `GameScene.padShowing` is now

```ts
private padShowing(spot: BuildSpot): boolean {
  return this.build.isFree(spot.index)
}
```

The rule that hid a pad standing under the HUD was removed on 2026-09-15 —
`reports/2026-09-15-pad-visibility.md` — because it read the SCREEN against a
live camera, so pads popped in and out under a pan; 151 of 151 flipped
somewhere inside the reachable camera box. So **no pad is hidden by the HUD at
all, and a narrower row recovers none of them.**

What the 33 in the brief actually measures is `padhud`'s **pad/HUD overlaps at
rest** over all ten levels at 844x390. `padhud` now prints that total and a
per-element split, which is the column that makes the answer legible. Same
instrument on both trees:

| element | `main` at `f3d597d` | this tree | |
|---|---|---|---|
| `abilities` | 18 | **16** | −2 |
| `messageRow` | 10 | **9** | −1 |
| `heroChip` | 3 | **4** | +1 |
| `startButton` | 2 | 2 | — |
| `counters` | 0 | **0** | — |
| **total** | **33** | **31** | **−2** |
| worst level | 7 | **5** | |
| pads panning alone cannot free | 24 | **17** | **−7** |

**Only two, and the reason is honest**: the row got 92 px narrower AND 12 px
shorter, which is where the −2 on `abilities` and the −1 on `messageRow` come
from — but it also moved, because a centred row that shrinks slides its left
end toward the middle, and the chip went with it onto different ground. That is
the +1. The figure that actually bears on reachability is the last row: pads no
amount of panning can free went **24 → 17**.

**The taller top-left corner cost nothing.** `counters` is 0 on both trees: the
readout stack is in a corner where no level puts a pad.

---

## 4 — The wave counter

### Which layout shipped: the STACKED one

Built first and looked at, as the brief asked. It is the right answer and the
rotated variant was not built. Three small plates in the top-left corner read
as one group at a glance, they need no new layout mode, and the corner already
had the two the player watches — putting the run's third number anywhere else
was the thing that made it a duplicate in the first place.

`art.json`'s `ui.counters.wave` plate had been kept through the whole period it
was not drawn, so the change is one entry in `HudScene.READOUTS`.

### What each corner says now

| | before | after |
|---|---|---|
| top LEFT | peanuts, lives | peanuts, lives, **`1/13`** |
| top RIGHT, between waves | `▶ WAVE 2 +4` | unchanged |
| top RIGHT, mid-wave | `10/13 · 18`, in a 44 px plate | **`18 LEFT`** |

The wave number and the total move to the corner where they are a readout and
may shrink; what stays on the control is the only half that CHANGES while a
wave runs and the only half a player acts on — how many are still coming. Two
corners, one fact each, neither repeating the other.

**Nothing else depended on the wave plate's position**, checked three ways:
`hud.startButton` is read by `hudTakesPress`, `hudBlocksGesture`,
`hudBandHeight` and `collisions` — all of which take the rectangle, which has
not moved or changed size — and the only thing that read the plate's TEXT was
`drawStartButton` itself. The top right still holds the gear and the start
control and nothing else; `hudLayout` places exactly those two there.

### Paying for the third plate

The top-left stack sets where the second row goes, and the build drawer's panel
starts under the second row. A third 20 px plate would have made the corner 68
px against the 44 the control opposite gives it — **24 px off the drawer's grid
on every screen**, which is the opposite of what shrinking the HUD was for, and
is a mistake a previous pass made and caught with recorded numbers.

So it was paid for rather than absorbed:

| key | was | now |
|---|---|---|
| `hud.layout.readoutHeight` | 20 | **16** |
| `hud.layout.readoutCount` | *(a `2` written into HudLayout)* | **3** |
| `hud.layout.rowHeight` | 22 | **16** (the boss bar in it is 14) |
| `hud.layout.rowGap` | 6 | **4** |
| `hud.layout.readoutGap` | 4 | 4 |
| `hud.layout.readoutNumberSize` | 15 | **15 — the plate shrank, the glyph did not** |

16 × 3 + 4 × 2 = 56, twelve over the 44 it was; `rowHeight` and `rowGap` give
back exactly twelve. `tests/drawer.test.ts`'s recorded grid heights come out at
**118 at 844x390 — identical** — and **72 at 568x320 against 73**, one pixel,
because `panelArea` clamps its height there and the arithmetic does not come
out even. 72 still clears the 62 px tile, which is the line that actually
matters and which the narrow screen had only just crossed. `maxScroll` at
568x320 moved 125 → 126 with it. Both are re-recorded rather than the assertion
being loosened.

`readoutCount` is a key rather than a `2` in `HudLayout.ts` for hard rule 1's
reason: the corner's reserved height and HudScene's list of readouts were two
descriptions of the same thing, and adding a plate to the list laid it out in
space nothing had reserved — which is the same shape as the Server Nuke's fifth
ability icon. `tests/readouts.test.ts` now holds the list's length to the key.

---

## Verification

### What came from a RENDERED FRAME, and which scenario

Everything in this section is a harness run at 844x390 unless a size is named,
on the staged shipping source. The claims the brief asked for, with the run
that answers each:

| claim | run | answer |
|---|---|---|
| no floating numbers, no hit sparks during a wave | `combat` | 0 and 0 over 216 samples of a whole wave, against 80 and 35 for the same wave on `main` |
| health bars still present | `combat` | 762 enemy bars seen in the same sweep |
| the boss bar | `boss` | exit 0; `THE POLITICIAN`'s bar drawn in the second row in `b-02-bar.png` |
| ability effects | `glacier`, `herofx`, `bossability`, `courtland`, `vlaude` | all exit 0 — see below |
| the Performance Review scan and the haste arrows | `level8`, `vlaude` | scan plays, `marker: review` set, haste marker drawn |
| the hero stays inside his chip after the Nuke | `herochip` | box moved 28 px left, all three baked objects 0 px off the new centre |
| the bottom row is visibly narrower | `screens`, `herochip` | 476 → 384 px; the hit rectangles are in the report above |
| every control still 44x44 or more | `hudpads` + `herochip` | pitches 56 and 60, box height 52, chip 60, gap 20 |
| the wave counter top left and legible at 375x667 | `screens 667x375` | `1/13` under `20` under `104`, legible, in `screens-5-game-667x375.png` |
| the top right holds only the gear and the wave control | `screens`, `herofx` | `settings` 794,12 40x40 and `startButton` 652,10 132x44, and `hudLayout` places nothing else there |

**The ability and boss effects, one line each**, all at 844x390:

| run | exit | what it says |
|---|---|---|
| `glacier` | 0 | *the Glacier draws painted art, covers its own radius and slows for its whole duration* |
| `courtland` | 0 | the Mind Laser arms, fires `fx-mind-laser` at 520x147, aims within 0.03°, and releases |
| `herofx` | 0 | the passive, Haymaker's knockback, the transform flash and the powered sprite |
| `bossability` | 0 | Molotov 85 damage and Glacier 48 into the Politician — the damage path still works through the changed `damageEnemy` signature |
| `vlaude` | 0 | *the fight plays* — six powers, the build lock, the defeat frames, every hero's slot-2 damage |
| `boss` | 0 | the boss bar, the tax, the late phase and the kill |
| `bars` | 0 | *the ability bar is clean for all 5 heroes in both forms* |
| `fx` | 0 | the explosion, spark and puff sheets still load and play, no leak |
| `level8` | 5 | **3 of 31 checks fail, and they are PRE-EXISTING** |

`level8`'s three are about that level's lane topology — `expected two exits, got
["south"]` and a leak at the east exit costing 0 lives. The identical three
fail on a worktree at `f3d597d`, run alone, same instrument. Nothing to do with
this pass. Its Performance Review half is green on this tree: the scan plays,
`reviewed` latches, the size multiplier lands at x1.100, a second crossing
changes nothing, and `marker: review` is set — which is the buff marker the
brief's must-survive list names.

`screens` at 667x375, 844x390 and 1280x720, flat and with `INSETS=0,47,21,47`,
reports **one** layout fault at each of the two phone sizes and none at
1280x720. It is the Title screen's version stamp — `title:version-stamp (hidden
dev door, not a tap target)` — and it is **pre-existing**: the same run on a
worktree at `f3d597d` reports the identical fault at the identical coordinates.
Nothing in the HUD is flagged at any size. 390x844 reports `portrait is gated`,
which is the correct answer for portrait rather than a skipped check.

### The instruments, and proving they could fail

Two harness scenarios gained checks, because both of these changes are the kind
a green run is bad at seeing.

- **`combat` now takes a census** rather than only screenshotting. It is proved
  live three ways before its zeroes count for anything — enemies on the board,
  damage landing, bars up — and it was run against `main` with the same
  instrument, where it reports 80 numbers and 35 sparks and **fails**. A
  scenario that cannot fail looks exactly like one that passes.
- **`herochip` now drops the Server Nuke** and measures the portrait, the
  label and the tap rectangle against the live chip rectangle. It fails if the
  drop does not move the box at all, so it cannot go vacuous if a later pass
  changes the reflow.
- `tests/hudlayout.test.ts`'s new test was checked the same way: with the three
  `setPosition` calls removed it fails by name, and passes with them back.

### The suite, the typecheck, and the soak

- **`npm test`: 1171 passing, 0 failing** before the merge (1169 before; two
  tests added), and **1189 passing, 0 failing** after it.
  Seven existing tests were UPDATED rather than left to pass vacuously —
  `content`, `heropowers`, `assetpaths`, `sceneevents`, `hudpads`, `drawer`,
  and the two recorded drawer numbers.
- **`sh tools/tsdiff.sh`: no introduced errors, against both baselines** —
  214 → 213 against `f3d597d` before the merge, and 215 → 214 against
  `b0150d5` after it. Its blind spot applies as always: without `node_modules`
  every Phaser member is `any`, so an access rule on one cannot fire here and
  CI is the first thing that can tell you.
- **Soak, all ten levels, 480 seeds, normal**, `tools/soak/level.ts`, run
  **TWICE** because `main`'s own numbers moved underneath this branch:

  Against `f3d597d`, which this branch was cut from and which is where the
  brief's ten integers come from:

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| expected | 428 | 255 | 422 | 299 | 218 | 210 | 198 | 184 | 192 | 195 |
| measured | **428** | **255** | **422** | **299** | **218** | **210** | **198** | **184** | **192** | **195** |

  And again on the MERGED tree, against the integers `main` carries today after
  `b0150d5` guaranteed the Ima Dummy Tower in every opening hand:

| level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| `main` today | 405 | 218 | 422 | 328 | 343 | 83 | 133 | 146 | 119 | 117 |
| measured | **405** | **218** | **422** | **328** | **343** | **83** | **133** | **146** | **119** | **117** |

  **Ten out of ten identical, twice, against two different baselines.** Nothing
  in this pass touches simulation, and the soak agrees — including through the
  one change that could plausibly have leaked, `showNumber` leaving
  `damageEnemy` and `Enemy.hurt` and moving `pierce` up a position at fifteen
  call sites.

  **The 9,600 runs behind the second table say nothing about whether the game
  got easier or harder**; that is `main`'s change and
  `reports/2026-09-16-dummy-tower-guaranteed.md`'s argument, and this pass
  neither endorses nor touches it.

### How to reproduce any of it

Screenshots are deliberately not committed — `tools/harness/shots/` is
gitignored and every frame here is reproducible:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh combat 200 844x390      # the census: 0 numbers, 0 sparks
sh tools/harness/run.sh herochip 180 844x390    # the chip, and the Nuke reflow
sh tools/harness/run.sh padhud 480 844x390      # the pad/HUD totals and the split
sh tools/harness/run.sh screens 150 667x375     # the smallest landscape screen
INSETS=0,47,21,47 sh tools/harness/run.sh screens 150 844x390
python3 tools/harness/shrink.py tools/harness/shots/screens-5-game-667x375.png 900
node --experimental-strip-types tools/soak/level.ts 480 level1   # ... through level10
```

**Run them ONE AT A TIME.** Two overlapping runs both bind 127.0.0.1:8899 and
the second dies with `Address already in use`, which the director reports as a
scenario throw — it cost one wasted `level8` comparison here and looks exactly
like a product failure.

### What was NOT checked

- **The dead-medallions bug is reproduced but NOT diagnosed.** Three causes are
  ruled out — the chip's stale-position fault, the every-frame rebuild churn,
  and drifted or disabled hit rectangles — and the run does not say what the
  cause IS.
- **`GL=1` was not used**, so nothing here says anything about the WebGL path.
  The default runs fall back to Canvas2D, which is correct for layout and
  wrong for questions about the drawing context — and there are none here.
- **`status.kills` is dead state**, found while writing the `combat` census: it
  is declared, zeroed on `startRun` and incremented nowhere, so it reads 0
  through a wave that visibly clears. The `lost` scenario prints it too. Noted
  and NOT fixed — it has nothing to do with this pass.
- **The 568x320 notched case** has a drawer grid of 49 px against a 62 px tile.
  It was 55 before and `drawer.test.ts` does not check the notched narrow case.
  Pre-existing, made 6 px worse by this pass, and not in scope; flagged here
  rather than fixed quietly.

---

## The data, in one place

Every number in this pass is in `src/data/presentation.json`. Nothing gameplay-
or layout-related was typed into a `.ts` file, and two numbers that already had
been are now read from the data.

**Removed**, each with a retirement note so the next pass cannot re-add it by
accident: `damageNumbers` (the whole block), `effects.chainSparkSize`,
`effects.haymakerNumberScale`.

**Added**: `floatingLabel` (risePixels, durationMs, fontSize — deliberately no
crit size and no scale, since it carries a word rather than a quantity),
`hud.layout.readoutCount`.

**Changed**: `abilityBar.draftedPitch` 72→56, `draftedIcon` 64→48,
`heroPitch` 76→60, `heroIcon` 64→48, `groupGap` 26→16;
`hud.layout.iconHeight` 64→52, `heroChipGap` 22→20, `readoutHeight` 20→16,
`rowHeight` 22→16, `rowGap` 6→4; `hud.heroChip.gap` 22→20 to match.

**Unchanged and deliberately so**: `hud.layout.heroChip` 60,
`hud.layout.plateHeight` 44, `readoutGap` 4, `readoutNumberSize` 15,
`readoutDigits` 5, `cancelWidth` 116, `cancelHeight` 48, `cornerButton` 40.

---

## Where this leaves the repository

**Done and on `main`:** all four changes, their tests, and two harness
instruments that did not exist before — `combat`'s board census and
`herochip`'s Server Nuke section.

**Still open, carried forward:**

1. **The two hero ability medallions go dead after the Server Nuke drops.**
   Not fixed here, as instructed — but **reproduced**, with `run.sh abilitybar`,
   which taps each slot through the real input system: after the drop
   `heroSlot1` and `heroSlot2` both report DEAD while the three drafted cards
   report REACHED. **Identical on unmodified `main` at `b0150d5`**, so it is
   pre-existing and the narrower row neither caused nor fixed it. Three causes
   are ruled out: the chip's stale-position fault, the every-frame rebuild
   churn that froze this row once before (0 rebuilds a second), and drifted or
   disabled hit rectangles (registered, enabled, 0 px drift). The next session
   should ask what ELSE is hit-tested at the right-hand end of the row once it
   has grown.
2. **`status.kills` is never incremented.** Dead state, read by two harness
   scenarios, worth either wiring or deleting.
3. **568x320 with a notch has a 49 px drawer grid against a 62 px tile.**
   Pre-existing (55 px before this pass), not covered by `drawer.test.ts`,
   which checks the flat narrow case only.
4. **The Title screen's version stamp reports as a SMALL fault** in `screens`
   at both phone sizes, on `main` as well as here. It is labelled in the source
   as a hidden dev door rather than a tap target, so it is the harness's
   exemption list that is missing an entry rather than the screen that is
   wrong.

**Nothing is waiting on a decision.**
