# Courtland's aim, his beam's art, and the loadout blurb

Four fixes from two screen recordings taken against `3d30139`. Three commits of
code and tools on `claude/courtland-aim-loadout-blurb-45ufwl`, plus this report
and the commit that fills in its CI row. **Not merged.** The merge command is at
the bottom, and the branch is fast-forwardable.

| commit | what it is | CI |
|---|---|---|
| `a3b1477` | Aim the Mind Laser at the board, and let its own art be seen | covered by run 178 |
| `fdd7b80` | Ask the loadout's frame how thick it is at the height it is drawn | covered by run 178 |
| `4ceddce` | Let the harness ask the beam and the blurb what they actually are | **green** — [run 178](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34147266536) |
| `09c2563` | This report | **green** — [run 179](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34147686463) |

The first three went up in one push, so one run, and it covers the branch head.
`test` and `typecheck` both green; `deploy` skipped, which is what it does off
`main`. A report cannot carry its own run, so the last row was filled in by the
commit after it — the same shape the last few reports here used.

Tests **968 → 970**, all passing. `sh tools/tsdiff.sh 3d30139`: 206 against a
206 baseline — no new errors, and CI's `tsc` with the real Phaser typings agrees.

---

# PART 1 — the four faults

## 1. The Mind Laser fired at the button instead of the board

**What it was.** The Mind Laser is the game's only `held` ability, so the finger
is on the ability medallion at the bottom of the screen for the whole first part
of the gesture. `HudScene.wireHeldAbility` forwards every `pointermove` while
the button is down, and `aimHeldAbility` converted every one of them to the
world and used it as the aim point. So the beam left Courtland, crossed the
board downwards, and terminated on the third HUD button — for its full ten
seconds, while the wave walked the far end of the lane and took nothing.

`beginHeldAbility` already had a comment claiming it "opens aimed at the nearest
enemy … so the beam does not point down into the HUD until the player moves."
It did open that way. The first `pointermove` — which on a touch device arrives
as jitter under a stationary thumb — threw it away.

**What it is now.** Two halves.

A sample that lands on chrome is **refused outright**, against
`hudBlocksGesture` — the same predicate `chromeUnderPointer` already asks on
behalf of the board and the camera rig, so a control added tomorrow is covered
the day it is laid out rather than the day somebody remembers this function.
Refused rather than clamped, and the `return` sits before the world conversion
so it cannot quietly become a clamp later: the nearest board point to a button
at the bottom of the screen is the strip of board just above it, which is a
different wrong answer with the same cause.

Until a real board point arrives the beam **fires along the hero's facing** and
keeps drawing. `held.onBoard` records whether the finger has ever reached the
board; while it is false `updateHeldBeam` re-derives the facing aim every frame,
so a hero who turns under the thumb turns the beam with him. The alternative —
suppress the beam until there is a valid point — was rejected because a held
button that draws nothing reads as a button that did not work.

**Measured, through real mouse events on the real medallion** (`courtland`
scenario, 1400×708; identical at 844×390 and 667×375 bar the button's position):

```
pressed the medallion at 861,666: held=true
with the finger still on chrome: aim=-68,437  hero=452,437  facingLeft=true
    along facing=true  beam end lands on HUD=false  onBoard=false
after moving onto the board: aim=451,196  onBoard=true
dragged back over the button: aim held at 451,196 = true
after mouseup: held=false
```

Four claims, four lines: the beam's far end is not inside any HUD region; a cast
held on the button fires along the facing; moving onto the board retargets;
coming back over the button keeps the last board aim rather than replacing it;
release stops it. The same four are asserted against the source in
`tests/heropowers.test.ts`.

## 2. The beam was never drawing a placeholder

**Diagnose before fixing — and the answer is not the one the brief expected.**
`fx_mind_laser.webp` was not "placed but not wired" the way `fx_seismic` and
`fx_mind_control` were. It was loaded, sliced, and animating the whole time. The
harness now asks the live sprite directly:

```
beam sprite: texture=fx-mind-laser  frame=8  clip=fx-mind-laser-sustain  playing=true
```

What made it read as the procedural blue ice-beam it replaced was **the scale**.
`aimHeld` divided `beamWidth` (56) by `contentHeight` (200 — the whole cell)
while dividing `range` (520) by `contentWidth` (225):

```
before:  scale=2.311,0.280  display=520x56   anisotropy=8.25x  origin=0,0.5
```

No painted highlight survives 8.25:1. The strip's crackle, its muzzle glow and
its shard spray were all compressed into a smooth blue gradient — which is
exactly what a procedural beam looks like, so the drawing was mistaken for a
missing asset.

**A beam cell is mostly not beam.** Measured off `fx_mind_laser`'s sustain
frames, the core is **76 source pixels of a 200-pixel cell**; the rest is muzzle
glow at one end and a spray of shards at the other. `beamWidth` describes the
corridor that is *damaged*, so it is the CORE that has to measure `beamWidth` —
which is also the rule the ability already states in `heroes.json`: what is
drawn is what is hit. `art.json` carries `beamCoreHeight` now and `aimHeld`
divides by it.

`anchorY` had to move with it. The strip's registration drifts: the four charge
frames sit on the cell's centre line (core centre y≈106) and the five sustain
frames sit well above it (y≈65). At 0.28 vertical scale that error was ten world
pixels and invisible; at the correct scale it would have drawn the painted beam
thirty pixels clear of the line it was damaging. The anchor is measured off the
sustain frames — the ones a held beam spends its whole life on — and is 0.325.

```
after:   scale=2.311,0.737  display=520x147  anisotropy=3.14x  origin=0,0.325
```

**Both numbers are re-derivable.** `tools/measure_art.py` grew a beam-strip
section that re-measures the core and the anchor off the pixels and reports
drift, the way it already does for every content box — so CLAUDE.md's rule 7
("after any re-export, run `measure_art.py`") covers these two as well:

```
beam strips (recorded vs measured core)
  fx-mind-laser   frames 4-8  core 76px of 200  centre y65 -> anchorY 0.325  (says 76px / 0.325)
```

**And it leaves his hand.** Every character on the board is base-anchored, so an
effect drawn at the hero's position comes out of the grass under his boots —
which is where the beam came out while Courtland held it up in his palm. The
sprite is lifted by `heroFx.castHeight` (0.55 of his drawn height). The ANGLE is
still the ground angle the damage pass uses, so the picture is that corridor
lifted by the 3/4 view's own offset and not a second, differently-aimed beam.

**Not done, deliberately:** the beam still reaches `range` in the direction of
the aim point rather than stopping at it. The brief's "from the hero to the aim
point" is read as the direction, not the length. Making the drawn length the
drag length would break the rule above — `heldEnd`, which the damage pass uses,
is `range` long — and would make the ability a different reach at every gesture.
The existing comment in `aimHeld` argues the same case and the `courtland`
scenario tests it.

## 3. The blurb was not too long for its block. It was drawn on the frame.

**What it was.** `heroSection` re-solves the hero block at a ceiling of NOTHING
whenever the granted height is smaller than the block wants — which is every
viewport measured:

```ts
let plan = this.heroPlan(selectedId, height, mode)
if (plan.height > height) plan = this.heroPlan(selectedId, 0, mode)
```

and `heroPlan` was asking the painted frame for its inset **at that ceiling**.
`panelInset` scales the nine-slice's chrome by `min(width, height)`, so at a
height of zero it returns an inset of zero on all four sides. `padT` fell back
to `LO.cardPad`'s nine pixels — while `platePanel`, which is handed the card's
REAL height, went on painting a rail twenty-odd pixels thick straight over the
top of the block.

The harness says it plainly (844×390, before):

```
hero block: padT=9 padB=27 pad=9 padSideR=9 frameTop=0 frameBottom=0 …
```

`frameTop=0` on a panel whose painted top band is 37–42 design pixels. Eli's
"Immovable." lost its ascenders to it. Bailey's four-line blurb cleared it by
about a pixel — his blurb is shorter than the chip column, so `heroDescription`
centres it and pushes it down — which is what made the fault look like a length
problem rather than a clearance one.

**What it is now.** The frame is asked at the height the block ends up, and the
whole solve is repeated once at the height that comes out. One repeat is enough:
the inset moves by a fraction of a pixel per pixel of height, so the second
answer cannot move the first by anything that matters, and the `frameAt`
argument being passed in is what stops it recursing further.

```
hero block: padT=24 padB=27 pad=9 padSideR=9 frameTop=23.94 frameBottom=23.5 …
```

The `beside` arrangements keep `pad`/`padSideR` at `cardPad` on purpose, with
`railL`/`railR` carrying the clearance out of `columnGap` instead. That was
already the stated intent in the file; it only survived because the inset it was
competing with was zero. Taking the clearance from the padding instead narrows
the block enough to drop 844×390 back to `chips-beside` and costs the specials
another 26 units — measured, not guessed: the overflow went to 63 before this
was put back.

**Two more, both asked for in the brief.**

*The block is sized to the roster's longest blurb, measured.* `chipCount`
already takes the roster's maximum precisely so the block does not change height
as the player moves along the row, and the blurb was left free to change it
anyway — 143 units for Bailey and 160 for Eli at 844×390, so every card BELOW
the hero block was handed a different height depending on who was highlighted.
`blurbHeightAt` measures every hero now and takes the maximum. Each hero's own
blurb is centred inside that reserve rather than pinned to its top.

*The chips take the column they need, not the roster's.* The block still
RESERVES the widest label on the roster, so the portrait row does not move as
the player walks along it. But "Mind Control" is the widest label there is, and
spending its width on Eli left a column of empty panel to the right of "Star
Rain" while his blurb — pinned at `heroBlurbMinWidth` — took eight words onto
five lines. The chips sit flush with the block's right edge now and the blurb
keeps the difference.

At 844×390, blurb column by hero: **130 → 130 / 146 / 160 / 165 / 174**
(Courtland / Cory / Eli / Bailey / Han). Eli's five lines become three.

## 4. The card wrap width was a function of the card's height

**What it was.** `cardGeometry` asked the painted frame for its inset at the
card's real height, and `chromeFor` weights the frame by `min(width, height)`. A
tower or special card is always wider than it is tall, so the frame's thickness
— and therefore `tw`, the width every line of text on the card is wrapped to —
**followed the card's height**.

A card's height is not the card's business. It is whatever the content stack had
left over after the hero block took what it needed, and the hero block was a
line taller for a hero whose blurb wrapped to five. So picking a different hero
re-wrapped the specials, with no resize: "up to 900 peanuts · 25% pay nothing ·
34s cooldown" broke after "25%" in one frame and after "25% pay" in the next.

And because `cardNeeds` measured at a nominal `cardProbeHeight` of 140 while
`cardFace` drew at the real height, the measured column and the drawn column
disagreed by however far the granted height was from 140 — which is how a
wrapped line came to be a few pixels wider than the column reserved for it and
printed a word out through the card's right rail.

The two rows on one screen showed it without any hero being picked at all
(844×390, before): the tower cards wrapped at **250** and the specials at
**248** for their names and **246** for their bodies. Same screen, same card
width, two different text columns, because the two rows were granted different
heights.

**What it is now.** The frame weight is pinned to `cardProbeHeight` in BOTH the
padding (`cardGeometry`) and the paint (`cardRow` → `card` → `platePanel`), so
the rail the player sees and the padding the text is laid out against are still
one number — they are just no longer a number the stack can move. The text
column is a function of the card's width and nothing else, and the measurer and
the drawer are asking the same question again.

844×390, after: every card wraps at **250**, in every render, for every hero.
`cardProbeHeight`'s note in `presentation.json` has been rewritten to say what
it now is; it used to describe itself as a number only the measurer used, which
is exactly how the measurer and the drawer came to disagree.

---

# PART 2 — verification

Everything below was run at this branch's head. **Where a claim came from a
rendered frame it says so; where it came only from numbers it says that too.**

## From rendered frames

`sh tools/harness/build.sh` then `sh tools/harness/run.sh …`. Reproduce any of
these with the command given; screenshots are not in the repository on purpose
(`tools/harness/shots/` is gitignored).

| what | command | result |
|---|---|---|
| loadout, all five heroes, desktop | `sh tools/harness/run.sh screens 200` | **no layout faults at 1400×708** |
| loadout, all five heroes, 390×844 | `sh tools/harness/run.sh screens 200 844x390` | 1 fault: the known title version-stamp SMALL |
| loadout, all five heroes, 375×667 | `sh tools/harness/run.sh screens 200 667x375` | 1 fault: the same version stamp |
| the same with a notch | `INSETS=0,47,21,47 sh tools/harness/run.sh screens 200 844x390` | 1 fault: the same version stamp. **No NOTCH faults.** |
| portrait | `sh tools/harness/run.sh screens 140 375x667` | gate covers 500×697 of a 500×697 window — gated, which is the correct answer for portrait |
| the beam, Courtland powered, three medallions live | `sh tools/harness/run.sh courtland 300` (and ` … 844x390`, ` … 667x375`) | all three hero medallions lit in the frame; beam drawn from his hand |
| boot with nothing forced | `sh tools/harness/run.sh realboot 120` | Title / Loadout / Game / Hud all built; no missing art; no banner |

Read off the pictures specifically:

- **Eli's blurb, 844×390.** Before: "Immovable." cut through its ascenders by
  the panel's inner rail. After: three lines, complete, with clear air above the
  first — and the ability chips flush with the panel's right edge.
- **The beam.** Before: a smooth blue streak leaving Courtland's boots. After:
  a beam with a defined core, a visible shard spray at the impact end, and the
  muzzle glow starting in his raised palm.
- **The blurb's LEFT edge**, which the previous report left open as "clipped —
  'olds the line', 'ast, reckless' — for every hero at every viewport". Checked
  on the frame at 1400×708: `Holds the line in p…` with the H complete and clear
  space between it and the rail. Fixed as a consequence of asking the frame for
  a real inset; not separately worked on, and only spot-checked at one viewport.

## From numbers only, not from a frame

- **The wrap widths and the line breaks.** The harness prints every wrapped text
  on the loadout with the size, the width it was broken at, and the lines it
  broke into. That is what says all four cards now wrap at 250 in every render.
  No frame was compared pixel-for-pixel between two renders.
- **The aim behaviour.** Driven with real mouse events and read off the scene,
  as quoted above. No frame was captured mid-hold with the finger still on the
  button, so "the beam points along the facing" is a measurement and not a
  picture.
- **`beamCoreHeight` and `anchorY`.** Measured off the source pixels by
  `tools/measure_art.py`. The drawn result was looked at; the source measurement
  was not eyeballed frame by frame.
- **The overflow costs below.** Read off `stackPlan`.

## Not checked at all

- **No real device.** Everything is headless Chromium at `--force-device-scale-factor=3`.
- **No audio.** The beam's `cast-glacier` cue was not listened to.
- **No soak.** `tools/soak` was not run against these changes.
- **The `bossability`, `ui`, `combat` and `spec` scenarios were not re-run.**
  The loadout change touches a screen none of them measure; the GameScene change
  touches the held beam, which only `courtland` exercises. That is a judgement,
  not a guarantee.
- **The type ladder picking different sizes for two cards in one row** —
  MOLOTOV at 22px beside GLACIER at 18px — is unchanged and unexamined. See the
  open items.

## The honest cost

Correct clearance is taller. On the default hero:

| viewport | hero block floor | | stack overflow | |
|---|---|---|---|---|
| | before | after | before | after |
| 1400×708 | 167 | 186 | 11 | 30 |
| 844×390 | 143 | 158 | 20 | 35 |
| 667×375 | 247 | 290 | 153 | 196 |

All three already overflowed and scrolled before this branch; they scroll
further now. The gain on the other side is that the number no longer depends on
which hero is highlighted — 844×390 was 20 for Cory and 37 for Eli, and is 35
for everybody.

667×375 is the one that hurts: the SPECIALS row is entirely below the fold
there. It was below the fold before as well (an overflow of 153 is more than a
card row), and `installScroll`'s drag and its fade are the declared answer, but
this made it worse rather than better and that is worth saying out loud.

---

## Where this leaves the repository

**Closed:** all four items in the brief. The aim, the art, the blurb and the
wrap. The transformation was not touched, as instructed.

**Also closed, carried in from the previous report's open list:** the hero
blurb's LEFT-edge clipping. Same root cause as the top; spot-checked on one
frame at 1400×708 only.

**Open, and mine to name:**

- **667×375 scrolls further than it did** — overflow 153 → 196 — and the whole
  SPECIALS row is below the fold there. The lever is the hero block: at that
  viewport it is laid out `under` the portrait row and costs 290 of a 498-unit
  band. A `beside` arrangement that fits at 667 would buy most of it back.
- **Two cards in one row can be drawn at different type sizes.** MOLOTOV at
  22px next to GLACIER at 18px, because the ladder is solved per card. It reads
  as a mistake rather than as a fit. Not touched, not this branch's.
- **The description block reserves three chips for every hero**, so the four
  heroes with two leave an empty slot's worth of panel. Deliberate — it is what
  stops the block jumping as the player moves along the row — but at 667×375 it
  is the largest single piece of dead space on the screen.
- **`anchorY` for `fx-mind-laser` is the SUSTAIN frames' answer.** The strip's
  charge frames are registered about 40 source pixels lower, so for the 0.22s of
  charge the beam sits low by about 30 world pixels. Visible if you look for it.
  The fix is a re-export with consistent registration, not a code change.
- **`CHANGELOG.md` is stale**, last updated 2026-09-01. It is a deploy history
  of `main`, so the entry for these commits belongs to whoever merges them.

**Carried forward, untouched, from the previous reports:** the soak has not been
re-run against the merged transformation; `bossability` reports the Server Nuke
doing 0 damage to the Politician; the hero tap not selecting in `ui`; the title
version stamp reporting SMALL at every viewport; pad 3 not building at 844×390;
Bug C's black pill; Cory's level-select crash; and the cake, dialog and
typography items from earlier reports. `powered.name` — DAD MODE, FULL SEND —
is still a log label with no player-facing use.

---

## Merging

```bash
git checkout main
git merge --ff-only claude/courtland-aim-loadout-blurb-45ufwl
git push origin main
```

The branch is ahead of `main` at `3d30139` and fast-forwardable.
