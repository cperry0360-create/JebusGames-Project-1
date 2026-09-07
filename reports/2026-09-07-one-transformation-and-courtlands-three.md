# One transformation at half health, and Courtland's three abilities

Four commits on `claude/transformation-courtland-rework-89vg83`. **Not merged.**
The merge command is at the bottom.

| commit | what it is | CI |
|---|---|---|
| `0c4c274` | One transformation at half health, and Courtland's three abilities | covered by run 169 |
| `4643bde` | Guard the held beam's art, and bring the docs and four scenarios up to date | covered by run 169 |
| `c7e9d50` | The hero card's third chip was drawn on the panel's own frame | **green** — [run 169](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34130314964) |
| — | This report | filled in by the commit after it |

The first three went up in one push, so one run, and it covers the branch head.
`typecheck` and `test` both green; `deploy` skipped, which is what it does off
`main`. **A report cannot carry its own run**, so this table's last row is
filled in by a following commit — the same shape the last few reports here
used.

Tests **962 → 964**, all passing. `sh tools/tsdiff.sh d9dd7cf`: 206 against a
206 baseline, the one difference being `Property 'anims' does not exist on type
'GameScene'` — the known cascade from having no `node_modules`, and CI's `tsc`
with the real Phaser typings accepted it.

---

# PART 1 — the diagnosis

## There were two transformation systems, and the player saw both

The brief's two symptoms — a tick at a quarter on the hero's health bar, and a
mode name on the board for every hero — are one cause, and it is not the one the
brief guessed. **Nothing was firing late.** The 40% damage reduction and the
invulnerability were already arriving at half health, exactly as specified.

What was arriving at a quarter was a **second, separate transformation**.

| | `Transform.ts` (the powered form) | `LastStand.ts` (deleted) |
|---|---|---|
| threshold | `rules.json heroTransform.belowHealth` = **0.5** | each hero's `lastStand.healthThreshold` = **0.25**, all five |
| how often | once per **life** — cleared on revive | once per **encounter** — deliberately NOT cleared on revive |
| art | `poweredSprite` via the art.json roster | `ultimateSprite`, a second field naming the same file in all five heroes |
| incoming damage | ×0.6 | ×1.5 |
| grace | `heroTransform.invulnerableSeconds` = 1.5 | each hero's own `invulnerableSeconds` = 1.2 |
| staging | a ring and a white flash | shake, flash, a half-second pause, a sprite swap, a camera shake |
| announcement | none | `announce(lastStand.name)` across the board, a toast, and `dadmode-voice` |

So a player took a hero to half health, saw a ring and a sprite change; took the
same hero to a quarter, and saw the whole ceremony again with a word across the
map.

## On "every hero displays DAD MODE"

Reported precisely, because it is not literally what the code did and the
difference matters for anyone reading this later.

`GameScene.announceLastStand` printed `this.hero.def.lastStand.name`, which is
per hero: **DAD MODE** for Cory, and FULL SEND, FLASHOVER, IMMOVABLE and OFF
LEASH for the other four. What was Cory's for all five was the **voice line**:
`play(this, 'dadmode-voice')` was a literal in the code, so Courtland, Han, Eli
and **Bailey the dog** all said Cory's line out loud on transforming.

The label was Cory-derived either way — the concept, the timing and the sound
all came from one hero — and the brief's instruction is to delete the concept,
which is what happened. `powered.name` survives as a **log label only**, and
`interaction.test.ts` fails if the HUD source ever mentions it again.

## Where the 25% tick came from

`GameScene` line 738 read:

```ts
this.status.heroMarks = [heroDef.lastStand.healthThreshold, TRANSFORM_BELOW]
```

**Both marks were drawn**, at 0.25 and 0.5, one pixel each, on a bar about 50
design pixels wide — and the hero's own floating bar in `Hero.drawBar` drew the
same pair from the same two sources. Why the brief describes only the one at a
quarter is not something this session measured; what is certain from the code is
that there were two, and that only one of them belonged to a rule that still
had a moment to announce.

---

# PART 1 — what was done

**They are one event.** `src/systems/LastStand.ts` is deleted and `Transform.ts`
is the whole of it — when it fires, what it changes about how a hero fights, and
what it changes about what a hero takes.

- **One threshold, in one place.** `rules.json heroTransform.belowHealth`.
  `healthThreshold` is gone from every hero, and `rules.test.ts` fails if the
  string reappears in `heroes.json`.
- **Once per life.** `Hero.revive()` clears `powered`; there is no second flag.
  The once-per-encounter rule is what left a hero who went down at wave four
  with the climax spent for the rest of the level.
- **One flag.** `lastStandActive` and `powered` said the same thing about the
  same hero from two thresholds, and everything the powered form changes —
  damage, attack interval, reach, hold, speed, hitting everything in range, the
  ramming, the incoming reduction — was split across the pair. `powered` is the
  only one now, and `status.lastStand` is gone in favour of `status.heroPowered`,
  which already existed.
- **One multiplier on incoming damage, and it is a reduction.** Last Stand's
  ×1.5 lived at a different threshold; composed onto this one it makes the 40%
  cut a 10% cut. `damageTakenMultiplier` is deleted from all five heroes and the
  reduction the design and the soak are built on is what is left. *This is a
  deliberate balance change* — see "what this changes about the game" below.
- **One grace, one sprite field.** The per-hero `invulnerableSeconds` and
  `ultimateSprite` are deleted; the transformation asks the art.json roster for
  the picture, exactly as every other form swap does.
- **No text.** `announceTransform` keeps the flash, the shake and the held beat,
  and prints nothing. The banner and the toast are gone.
- **The voice line is per hero.** `powered.voice` is `"dadmode-voice"` for Cory
  and `null` for the other four, so Cory keeps his recording and nobody else
  borrows it. The 260ms lead-in alignment onto `transformPauseMs` is unchanged.
- **One mark on the bar**, at the threshold, on both the HUD chip and the hero's
  own floating bar. `status.heroMarks` is still a list, so the HUD draws what it
  is given without knowing what any of it means.

### Other pre-roster assumptions found in the transformation path

- `Hero.inVehicle` → **`Hero.charging`.** One hero's picture as the name of a
  rule all five obey; every hero's `powered` block carries `rammingDamage`.
- Comments through `Hero.ts`, `Heroes.ts` and `GameScene.ts` describing "the
  SUV", "DAD MODE has its own sprite" and "Cory has no powered art" — the last
  of which stopped being true when the Rivian landed.
- `Heroes.heroSprite`'s docstring still explained why Cory's powered form was
  null.
- **Not changed, flagged instead:** the ramming itself. Every hero's powered
  form drives over the lane and shoves things down it, which is Cory's Rivian
  as a mechanic given to a firefighter and a dog. It is tuned data, not a
  pre-roster bug, and changing it is a balance decision nobody asked for.

---

# PART 2 — Courtland

## More than two ability slots, generically

`slot1` and `slot2` were two named fields with two different types, and the
powered-form gate was **the slot's index** — slot 2 was powered-only because it
was slot 2. That cannot survive a hero with three abilities of which two are
gated.

- `heroes.<id>.abilities` is an **ordered list of any length**. Every ability
  declares every field, zeros included.
- `poweredOnly` carries the gate. `activation` carries how the ability is asked
  for: `instant`, `targeted` (the existing tap-a-point mode with its same four
  ways out) or `held` (new).
- `HeroSkillDef` and `HeroPowerDef` are one `HeroAbilityDef`. `SLOT1`/`SLOT2`
  constants are gone; ids are generated by `heroSlotId(i)` and resolved by
  `heroSlotIndex`.
- The bar (`heroSlotDefs`), the cooldown register, the `'powered'` handler that
  resets gated cooldowns, the HUD's press handler, the HUD's grey-out gate, the
  loadout card, the keyboard binding and the soak all walk the list.
- **`content.test.ts` asserts the counts are `{cory: 2, courtland: 3, han: 2,
  eli: 2, bailey: 2}`**, so applying this shape to another hero later is a
  deliberate edit to that line rather than a silent drift.

## The three abilities

All three numbers are **deliberately overpowered and deliberately untuned**, and
`heroes.json courtland._abilities` says so at length.

| slot | name | activation | gate | numbers |
|---|---|---|---|---|
| 1 | **Seismic** | instant, at Courtland | both forms | 140 damage in a 150px ring, 1.2s stun, 40px knockback, **4s cooldown** |
| 2 | **Mind Control** | targeted, 320px cast radius | powered only | **2** enemies within 150px of the tap, **12s**, they hit for 60 at 72px reach, 10s cooldown |
| 3 | **Mind Laser** | held, aimed by dragging | powered only | 520px beam, 56px thick, 42 per 0.15s tick (**280/s**), through armour, **10s** of held time, 14s cooldown |

For scale: Cory's Haymaker is 130 on a 12s cooldown. Seismic is more, for a
third of the wait, and the laser's full budget is 2,800.

### Seismic

Replaces Shockwave, which was the same `burst` under a different name.
`fx-seismic` is flattened on the vertical axis so it lies on the ground — that
was already the rule in `powerBurst`, read off the art's anchor rather than off
the effect name, and it is what the brief asks for.

### Mind Control — the naming mismatch, resolved

The previous session's report flagged that `ability-courtland-2` is a picture of
Courtland gripping an enemy's mind while its slot's data said Seismic, and
`art.json`'s own note said `fx_mind_control` "is bound so its art ships and is
named" with **nothing in the game setting `Enemy.controlled`**. Both are wired to
the power they were drawn for. `Enemy.controlled` had been declared and
`GameScene.syncStatusMarkers` had been drawing it for weeks, waiting for a
caller.

- **They walk back.** `Enemy.tick`'s walking branch subtracts the step from
  `laneDistance` and `distance` instead of adding it, on its own lane only:
  merges are one-way and there is no rule for which branch to come back out of.
  Floored at 0 rather than despawning — the control expires long before.
- **They do not block and are not blocked.** `Enemy.blockable` is
  `def.blockable && !controlled`, so the hero does not grab the thing fighting
  for him and stop it dead in front of him.
- **They fight.** `GameScene.tickControlled` swings on each enemy's own
  `attackInterval` at the nearest live uncontrolled enemy within the ability's
  `range`.
- **They die on expiry**, through `damageEnemy` rather than `die()`, so the kill
  pays out and counts exactly as any other death does.
- **The player's side does not shoot them.** Towers, gnomes and the hero are
  handed `this.enemies.filter((e) => !e.controlled)` — computed once so the
  three cannot disagree. Without it a powered hero, who hits everything in
  range, would kill both on the frame they turned.
- **Bosses are immune.** `Enemy.takeControl` refuses anything `blockable:
  false`, and the cast pass filters on the same flag before it ever calls it.
- The marker is not created by the ability. `syncStatusMarkers` sweeps
  `controlled` every frame, which is the shape that cannot leak a sprite when a
  controlled enemy is killed early.

### Mind Laser — the game's first held ability

The only thing in the game that is live between two input events, so the whole
of its correctness is that every way it can end goes through one function.

- **Input.** The HUD wires `pointermove`, `pointerup`, `pointerupoutside` and
  `gameout` on the **scene's** input plugin rather than on the button's hit
  rectangle: the finger leaves that rectangle on the first frame of the gesture,
  so a handler on it would stop aiming exactly when aiming became interesting
  and would never see the release at all.
- **The beam is `range` long wherever the finger is**, not a line that stops at
  it. The finger chooses the direction. That is what keeps it visible with a
  thumb over the board, and it also stops the ability being a different ability
  at every drag length.
- **It follows the hero**, who keeps walking under his rally order while it
  fires.
- **Phases.** `fx_mind_laser` is sliced 4 / 5 / 3 — charge, sustain, fade — from
  `presentation.json heroFx.laser`, because which frames are which is a fact
  about the picture rather than about lasers. Charge plays once on the press and
  hands off to the looping sustain; fade plays once on release.
- **Budget, not duration.** `holdSeconds` counts held time; the cooldown starts
  when it stops.
- **A press taken back is free.** Released before a single damage tick — inside
  the charge-up — nothing is spent and the button is handed back ready. That is
  the same promise the targeting mode already makes about a placed ability.
- **Re-checked every frame**, not trusted to the release: the hero going down, a
  modal opening, or the run ending all end it, and none of those dispatches a
  pointer event.
- Arming a targeted ability and then holding the beam used to place the armed
  one wherever the finger came off. The held branch drops it first, unspent.

## The HUD

The bar holds **five controls** for Courtland — two drafted plates and three
hero medallions — and four for everybody else. **Nothing had to be reworked and
nothing shrank:** `abilityScale` is 1.000 at every viewport tested, including a
notch, and every control is 76×64 against a 44pt floor.

| viewport | bar | chip | CANCEL | scale |
|---|---|---|---|---|
| 844×390 | 223,316 398×64 | 141,320 60×60 | 728,332 116×48 | 1.000 |
| 667×375 | 135,301 398×64 | 53,305 60×60 | 551,317 116×48 | 1.000 |
| 1400×708 | 501,634 398×64 | 419,638 60×60 | 1284,650 116×48 | 1.000 |
| 844×390, notch 0/47/21/47 | 223,295 398×64 | 141,299 60×60 | 681,311 116×48 | 1.000 |

Slots 2 and 3 draw their greyscale copies in base form and their colour icons
when powered; `ability-courtland-3` was added to `art.json greyable`, without
which the lock would have read as a dim tint rather than as switched off.

## Art

Both files converted with `tools/towebp` at q95, the same encoder and the same
verification the rest of `public/assets` went through.

| file | source | result | PSNR | alpha |
|---|---|---|---|---|
| `abilities/ability_courtland_3.webp` | 256×256 | 0.15 → 0.04 MB (74% off) | 26.5 dB | exact |
| `effects/fx_mind_laser.webp` | 2700×200, 12 × 225×200 | 0.56 → 0.27 MB (52% off) | 31.6 dB | exact |

The strip arrived **2702** wide against the 12 × 225 = 2700 the brief states. It
was cropped two pixels on the right before encoding rather than left as-is:
Phaser slices a sheet on integer frame widths and 2702/12 is not one. Manifest
entry: `anchorX 0` (the muzzle end), `anchorY 0.5`, content 225×200, `stretch:
"line"`, `sheet: {225, 200, 12}`. Ink measured per frame — every frame's ink
spans essentially the full 225 and the beam core sits on the vertical centre.

---

## What this changes about the game

Two deliberate balance changes, both consequences of the merge rather than
tuning decisions:

1. **The powered form's fighting stats now arrive at half health instead of a
   quarter.** Double damage, 0.8× attack interval, 1.9× reach, 2.2× block range,
   1.35× speed, hits-all-in-range and the ramming all move up one band. Heroes
   are stronger for longer.
2. **The powered form now takes 40% less instead of 50% more.** Under the old
   pair a hero below a quarter was at ×1.5 with no reduction; now everything
   below half is ×0.6.

Both push the same way. **The soak was not re-run**, and it should be before
this is taken as tuned — `tools/soak` models the transformation precisely
because a reduction on the hero moves every win rate the game reports, and
`Sim.ts` was updated to the merged rule in this branch. See "not checked".

Courtland's three are knowingly outside any balance envelope and are marked as
such in the data.

---

## What came from rendered frames

Everything below is `tools/harness`, run on the branch tip. Screenshots are
reproducible with the commands given and are not committed —
`tools/harness/shots/` is gitignored.

**`transform` (new), 844×390.** All five heroes, driven through the game's own
`hero.hurt`:

```
rules.json heroTransform: below 0.5, takes 0.6x, 1.5s of grace
cory:      at 181/360 a 1-point hit returned "transform"  powered=true
courtland: at 151/300 …  han: at 166/330 …  eli: at 216/430 …  bailey: at 136/270 …
  sprite hero-<id> -> hero-<id>-power (want hero-<id>-power)   [all five]
  new text on the glass: none                                  [all five]
  health-bar marks: [0.5]                                      [all five]
  after a death and a revive: powered=false health=max sprite=hero-<id>  [all five]
RESULT all 5 heroes transform at half health, once per life, silently
```

A one-point hit one point above the threshold is the test that separates the two
rules: at a quarter it would have done nothing. A second crossing in the same
life does nothing; a hit during the grace lands for zero; a death and a revive
re-arm it.

**`bars` (new), four viewports.** The table above. Every run: five controls for
Courtland, four for the others, nothing under 44pt, no two slots overlapping, the
bar clear of CANCEL and of the chip and inside the screen, and the greyed set
matching each hero's `poweredOnly` flags exactly.

**`courtland` (new), 844×390.** The behavioural claims, none of which a
screenshot can show:

```
base form: Mind Control armed=false  Mind Laser firing=false
base-form Seismic took 66 health off the board
Mind Control turned 2 (data says 2)
  turned enemy moved -119.8 along the lane  at 343,166  blocker=none  blockable=false
  turned enemy moved -119.8 along the lane  at 276,215  blocker=none  blockable=false
after the duration: alive=0 of 2
an enemy flagged blockable=false refused control: true  (the roster's own is The Politician)
held: true  budget=10.00s (data says 10)
  after 0.7s of beam the target went 66 -> -18 (alive=false)
after release: held=false  cooldown ready=false
pressed and let go instantly: cooldown ready=true
with the budget wound to 0.05s: held=false  cooldown ready=false
RESULT Courtland's three behave as specified
```

**`powerart`, 844×390.** Every hero's whole ability list, cast through the real
path, with the drawn count off the scene graph: `RESULT every hero ability drew
its own art`. Courtland's row: Seismic 1 × `fx-seismic`, Mind Control 4 ×
`fx-mind-control` (two cast flashes and two markers) with `turned 2 of a
possible 2`, Mind Laser 1 × `fx-mind-laser`.

**`screens`, 844×390 / 667×375 / 1400×708 / 844×390 with a notch.** One fault at
every phone viewport and none on desktop, and the fault is the pre-existing
`SMALL Title [title:version-stamp (hidden dev door, not a tap target)]` the
harness annotates as not a tap target. Portrait stays gated.

**`realboot`, 1400×708.** `Title=built Loadout=built Game=built Hud=built
drew=20`.

**Regression:** `herochip`, `stuckcast`, `revive`, `herofx`, `bossability`.

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh transform 420 844x390
sh tools/harness/run.sh courtland 420 844x390
sh tools/harness/run.sh bars 300 844x390     # and 667x375, and with no viewport
INSETS=0,47,21,47 sh tools/harness/run.sh bars 300 844x390
sh tools/harness/run.sh powerart 700 844x390
sh tools/harness/run.sh screens 220 844x390
```

### A bug the numbers could not see

The `screens` audit reported **no fault** for the loadout at any viewport while
Courtland's third ability chip was drawn with the panel's painted green rail
running straight through it. Its four checks are OFF, NOTCH, SMALL and OVER, and
none of them is *"content sitting on a frame"*.

`frameInsetFor` is deliberately only a **fraction** of the painted frame — see
`LO.frameInsetShare` — so content is allowed partway into the rail. That is right
for the tower and special cards, whose last line is text on a dark backing and
stops well short of it, and wrong for a block whose last item is a 28px circular
badge. Measured off a rendered frame at 667×375 by scanning for the rail's green
pixels: the rail sits **21 design pixels** above the plate's outer edge, and
content bottom is exactly plate bottom minus `padB`. `padB` was **9**.

`presentation.json loadout.cardPadBottom` was already in the file, at 15, **and
nothing in the repository read it** — the dead-config failure this repo has on
record twice. `heroPlan` reads it now, at 27: the rail plus six pixels of air,
arrived at after 15 and 22 were both still short and both re-measured off the
frame.

The chip count is the roster's **longest** list rather than the selected hero's,
so the block is the same height whoever is highlighted and the row below does not
jump as the player moves along it.

### Four harness scenarios that were reporting nothing

Found while using them, and each one was a scenario that ran and looked fine:

- **`revive` had been dead on its fifth line.** It read `Hud.heroLabel`, which
  has not existed since the hero bar was replaced by the portrait chip —
  `interaction.test.ts` asserts its absence — so the whole revive check threw
  before it started. Its killing blow also landed inside the transformation's
  grace (900ms of real time against 1.5 game-seconds on a 1.4× clock), and its
  final assertion was Last Stand's once-per-encounter rule, which this branch
  deletes.
- **`herofx` step 4** set the hero's health and hit him for four times his total
  while he was already down, and reported `result=none down=true`. It now waits
  out the revive first, and reports `result=transform health=180/360 (threshold
  180)` and a further huge hit absorbed by 1.50s of grace.
- **`powerart`** walked `slot1` and `slot2`, which would have checked two of
  Courtland's three abilities and called the third fine. It walks the list now.
  Its first red result — Mind Control drawing nothing — was the harness aiming
  at empty road: the scenario posts the hero on the lane and waits for something
  to walk into **his** reach, so the crowd is around him and not at the far end
  of the cast radius. A `control` power is aimed at an enemy now.
- **`screens`** audited only the default hero's loadout card.

---

## What was NOT checked

- **The soak.** `tools/soak/Sim.ts` was updated to the merged rule and its
  models compile and run (the `heroes` test suite drives it for all five heroes),
  but **no win-rate pass was run**. The two balance changes above push the same
  way and the numbers in the last balance report are stale for this branch.
- **The live site.** Nothing was checked against GitHub Pages; the sandbox's
  egress proxy answers 403 for github.io by policy. And this is on a branch, so
  nothing is deployed.
- **A human playing it.** Courtland's three have never been played by a person.
  The point of the numbers being overpowered is that they will be judged by
  playing, and nobody has.
- **Levels 2, 3 and 4.** Every harness run above is level 1. The changes are all
  hero and HUD code and carry no level data, but that is an argument rather than
  a measurement.
- **Audio.** No cue was listened to. The DAD MODE line's timing is asserted from
  the data and the source, as it was before.
- **The `bars` scenario sets `hero.powered` directly** rather than earning it, so
  what it measures is the bar in the powered STATE, not the transition into it.
  `transform` covers the transition.

---

## Where this leaves the repository

**Closed:** both halves of the brief. One transformation at half health for
every hero, once per life, with no text and one mark on the bar; Courtland's
three abilities on a generic N-slot model; and the loadout frame bug the work
turned up.

**Open, and mine to name:**

- **The soak has not been re-run against the merged transformation.** This is
  the most consequential open item on the branch.
- **The hero blurb is clipped on its LEFT edge** by the same `frameInsetShare`
  fraction that clipped the chip on the bottom — visible as "ast, reckless" and
  "Holds the line" with the first letter cut, for every hero, at every viewport.
  It predates this branch (the same clipping is on Cory's card before any of
  this) and the lever is `LO.cardPad`, which is shared with the tower and special
  cards, so fixing it reflows the whole screen. Flagged, not touched.
- **The loadout stack overflows and scrolls** — `overflow=112` at 844×390,
  `79` on desktop — and the three chips added 36 of that. It was overflowing
  before this branch. The SPECIALS cards are clipped at the bottom of the band
  in every screenshot as a result.
- **`bossability` reports the Server Nuke doing 0 damage** to the Politician
  while Molotov and Glacier both land. The nuke path — `AbilityRunner.ts`,
  `NukeOverlays.ts`, `fireAbility` — is untouched by this branch, so it is not
  mine; it was not compared against a pre-change baseline and it may be a
  consequence of the known "pad 3 does not build at 844x390" item rather than a
  fault of its own.
- **`CHANGELOG.md` is stale**, last updated 2026-09-01. It is a deploy history of
  `main`, so the entry for these commits belongs to whoever merges them.
- **Naming.** `powered.name` — DAD MODE, FULL SEND and the rest — is now a log
  label with no player-facing use. It is real data with a real reader, but if
  those names are never going to be shown, they are a paragraph of JSON keeping
  a promise nobody is collecting.

**Carried forward, untouched:** the hero tap not selecting (`ui`, annotated in
the harness and in `reports/2026-09-07-the-blind-harness.md`), the title version
stamp reporting SMALL, pad 3 not building at 844×390, Bug C's black pill, Cory's
level-select crash, and the cake/dialog/typography items from earlier reports.

---

## Merging

```bash
git checkout main
git merge --ff-only claude/transformation-courtland-rework-89vg83
git push origin main
```

The branch is ahead of `main` at `d9dd7cf` and fast-forwardable.
