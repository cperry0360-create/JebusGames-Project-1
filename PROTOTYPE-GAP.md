# PROTOTYPE-GAP.md

A comparison of `reference/courjahan-defense.html` against the current build.

**Method.** The prototype is 12,101 lines, of which 7,338 are base64 image data.
The remaining ~4,760 lines of code were read in full: core, data, simulation,
progress, render, screens, and boot. Line numbers below refer to the prototype
file. The current build was read from `src/` and `src/data/`. Balance figures
were computed from both data sets, not estimated.

**No code was changed in this pass.** Every item ends in a verdict: **adopt**
(take it as it is), **adapt** (take the idea, not the implementation), or
**ignore** (our architecture is genuinely better here).

---

## The short version

You said the current build is further along technically but worse in ways you
keep noticing and can't name. Having read both, here is the name:

**The prototype is a finished game with a small amount of content. The current
build is a large amount of content with no game around it.**

That splits into three specific things:

1. **A run has no frame.** The prototype has a splash, a menu, a world map,
   five levels, a star rating, a save, and a "continue". A session had a
   destination and left a record. Ours starts a run, ends on a banner with one
   button, and throws everything away. Nothing you do is ever *scored*.

2. **The board has one verb.** In the prototype, the Barracks puts soldiers on
   the road and you drag a rally flag to decide *where the road is held*. That
   is the second decision in the game, and it makes every wave a positioning
   problem rather than a purchasing problem. We have no blocker tower. The
   player builds, then watches.

3. **Nothing on screen is ever quiet.** The prototype's message bar is empty
   about 95% of the time, so the 5% reads as news. Our message line is *never*
   empty — `idleHint()` fills it whenever nothing else does. A line that always
   has words in it is wallpaper, not information. This is, I think, the direct
   cause of the "excessive and unhelpful flavour text" complaint, and it is not
   really about the flavour.

Everything below is detail underneath those three.

---

## 1. Features

### 1.1 Barracks, soldiers and rally flags — MISSING

`TOWERS.barracks` (8698), `updateSoldier` (9414), `findBlockTarget` (9390),
`setRally` (9578), `defaultRally` (9507).

The prototype's second tower does not shoot. It spawns three soldiers who walk
to a rally flag and physically stop enemies from advancing. The rules around it
are small and very well judged:

- One soldier *holds* one enemy; others are free to pile onto something already
  held, so a single tough enemy can't beat a whole squad by fighting them one
  at a time (comment at 9387 says exactly this).
- The rally flag defaults to the nearest point on the road (9507), so a
  barracks works correctly the moment it is built and *then* rewards fiddling.
- Soldiers respawn on a timer (9 seconds at tier 1, 7 at tier 3), so a bad
  engagement costs you time on that stretch of road.
- Its two tier-3 branches change behaviour, not numbers: Templars stun on hit,
  Grove Wardens add a fourth soldier and slow everything they block.

We have the *parts* of this — `Fighter.ts` exists, the hero has `blockRange`
and `blockCapacity: 3` — but no tower produces blockers and there is no rally
point for anything. The hero is a single blocker you reposition; the prototype
gives you three to nine, on flags you place.

This is the biggest single gameplay gap in the document. **Verdict: adapt.** A
"Compliance Desk" that posts interns on the road fits our fiction exactly. Note
the phase question: `DESIGN.md` allots Phase 1 six towers, and this would be one
of them, so it isn't scope creep — but it *is* a system, and it's your call
whether it lands before or after you're happy with the loop.

### 1.2 Enemy answers — HALF-BUILT

Prototype: 9 enemy types across two independent defence axes (`armor` reduces
physical, `resist` reduces magic — 8633) plus a flying flag, a splitter, and a
boss that summons.

| | prototype | current |
|---|---|---|
| enemy types | 9 | 4 |
| defence axes | armour **and** magic resist | armour only |
| air units | 2 (wisp, drake), with their own derived flight path | none |
| splitter | Blight Spore → 2 runts on death | none |
| boss behaviour | summons 2 brutes at 75%/50%/25% health | taxes peanuts on a timer |

The four tower families map cleanly onto those axes: archers are fast and bad
against armour, mages ignore armour but are slow, bombards splash but can't hit
air, barracks don't shoot at all. That grid *is* the game — "what beats what" is
the only question a tower defense actually asks, and the prototype asks it four
different ways.

We ask it about once. With one defence axis and four enemy types, most of our
towers are "more damage" rather than "the answer to something".

Two cheap pieces are worth taking now even inside Phase 1: **the splitter**
(one flag, `onDeath: { type, count }`, 9250) and **a second defence axis**, so
that some towers are the answer to some enemies. **Verdict: adapt.** Air units
are a bigger job (they need a second path set, 9028) — **defer**.

### 1.3 Game speed toggle — MISSING

`RUN.speed` (9087), toggled at 11705, applied at 11850 by running the sim step
twice per frame. There is a 2X badge in the HUD (10738).

We have a fixed `gameSpeed: 1.4`. That is a compromise between two different
players and satisfies neither: it's too fast to plan in and too slow to grind
through. A toggle is roughly twenty lines and is the single cheapest
improvement in this entire document. **Verdict: adopt.**

### 1.4 Results screen — HALF-BUILT — **BUILT, with Banner Points instead of stars**

`drawResult` (10762), `starsFor` (9808).

The prototype ends a level on a panel: THE LINE HELD / THE LINE BROKE, three
stars filled by how many lives survived, lives remaining, kills, and a one-line
verdict — *NOT ONE OF THEM GOT THROUGH* / *A FEW SLIPPED PAST* / *BARELY* — and
two buttons (NEXT LEVEL / WORLD MAP, or TRY AGAIN / WORLD MAP).

The old run-end screen drew one word and one button. No score, no stats, no
retry: you could not lose *well*, and you could not try again without walking
back through the title and the loadout.

**Do not take the stars.** `DESIGN.md` replaces the three-star rating with the
Banner, deliberately: stars grade a *level*, and this game has runs. Adopting
them would be a regression dressed as a feature.

**Built instead** — the panel now shows:

- THE LINE HELD / THE LINE BROKE, and the verdict line under it
- **BANNER POINTS EARNED** as the headline number
- Waves survived, lives remaining, kills, peanuts earned
- Banner Points across all runs, banked in the save
- TRY AGAIN and QUIT TO TITLE

Points are awarded on **depth reached**, so a failed run still pays: four per
wave cleared, thirty for finishing, one per life left. The lives term needs no
special case — a run is lost at zero lives, so it is already zero on a defeat.
The Banner tree itself is Phase 2 and is not built; the points accrue now so
that the total means something on the day there is a tree to spend it on.

**Verdict: done, minus the stars.**

### 1.5 Progression: map, levels, save, continue — MISSING BY DESIGN

`MAP_NODES` (9046), `drawMap` (11206), `PROGRESS` (9928), `recordResult` (10000).

Five levels on a parchment world map with a trail that draws itself as you
unlock nodes, stars per level, a total-star counter, and a save that survives a
broken `localStorage` without complaining (it puts *PROGRESS CANNOT BE SAVED
HERE* on the menu instead — 11154).

We have one map and a save that stores volume, mute, and `runsCleared`.

**Verdict: ignore, for now.** `DESIGN.md` replaces this with a branching
roguelite node map in Phase 2, which is a better structure than a linear
five-level campaign. Don't build the prototype's version. But three details
inside it are worth stealing early:

- **The storage-broken notice.** Ours fails silently.
- **The trail reveal animation** (1.4 nodes/sec, 11846) — when the node map
  arrives, this is the moment that makes progress feel earned.
- **`recordResult` returning whether something was unlocked** (9999), so the
  game can *tell* you.

### 1.6 Radial build menu — DIFFERENT

Prototype: tap a pad and four circular buttons fan out around it at 56px
radius, each with the tower's short name, its cost underneath, greyed if
unaffordable, and an X in the middle to close (10200–10216). The range circle
for the pad draws at the same time (10348).

Ours: a rectangular panel appears elsewhere on the screen with icons in a grid.

The radial is better on a phone for two reasons: your thumb is already at the
pad, and the choice is visually attached to the place it will happen.

**Verdict: adapt**, with a caveat — our panel is tested and works, so this is a
polish item, not a correctness one.

### 1.7 On-screen error panel — MISSING

Lines 83–116, before the game script, deliberately: *"so that a failure while
the game script is being parsed or run still produces something readable
instead of a black rectangle."*

On a phone, a JS error in our build is a black screen with no way to report
what happened. The prototype shows the message and the stack in a red strip.

**Verdict: adopt.** Twenty lines, and it converts "it didn't work" into a bug
report.

### 1.8 Things we have that it doesn't

Covered properly in section 6, but for the feature ledger: audio (the prototype
has *none* — the credits joke "PERSON WHO NOTICED THERE IS NO AUDIO" is
literal), pannable/zoomable camera, tower build times, the draft, Last Stand,
the Politician's tax mechanic, and confirm dialogs on spends.

---

## 2. Feel and presentation

This is where the gap is widest and the fixes are cheapest.

### 2.1 Every event has a mark

| event | prototype | current |
|---|---|---|
| enemy killed | `+6` floats up **from the corpse** (9248) + 10-particle burst with gravity | HUD number bumps; a float near the counter |
| boss killed | 26 particles instead of 10 (9249) | camera shake |
| enemy leaks | **BREACH** in red at the breach point (9333, 10683) | lives counter bumps |
| tower upgraded | expanding brass ring (9528) | — |
| tower specialised | expanding white ring (9540) | — |
| tower sold | expanding dim-brass ring (9554) | — |
| hero falls | 16 gold particles + toast | fade out |
| hero returns | ring at the respawn point + toast | — |
| soldier hits | spark at the point of contact (9456) | — |

The pattern: **every state change in the prototype produces something at the
place it happened.** Ours produces things in the HUD, which is a different
place from where the player is looking.

The kill bounty is the important one. In the prototype, killing something pays
you *visibly, at the thing you killed*, ten times a wave. That single 0.9-second
text is most of what makes the economy feel like a reward loop rather than a
number that changes.

**Verdict: adopt all of it.** These are 20-line effects and they are the
difference the user is feeling.

### 2.2 Status effects are visible on the enemy

`drawEnemy` (10559): stunned enemies get three brass stars orbiting the head;
slowed enemies get a blue wash at their radius; enemies bleeding or burning get
a red wash. Burning ground draws as an orange disc that fades with its own
timer (10303).

We apply slows and stuns but the enemy looks identical either way. The player
cannot tell whether an ability worked.

**Verdict: adopt.**

### 2.3 Build pads read as interactive

10310: empty pads pulse — a brass ring at `0.5 + 0.5·sin(t·2.4 + i)`, phase
offset per pad so they don't blink in unison, with a hammer glyph in the middle.

Ours draws a static cross. The pulse is what says "you may press this", and the
per-pad phase offset is what stops it looking like a warning light.

**Verdict: adopt** (we're most of the way there — it needs the pulse and the
glyph).

### 2.4 The splash is four seconds of real craft

`drawSplash` (10872) and its helpers. In order: embers drifting up the whole
time so the frame is never still; the mark falls in *accelerating*
(`-300·(1-fall²)`, with a comment noting it is deliberately not eased out);
motion ghosts behind it while falling; impact at t=0.72 with squash-and-stretch
on a damped cosine (11007); a 13px camera shake decaying quadratically; two
shockwave ellipses; 74 sparks thrown outward with gravity; a white flash for
0.1s; a slow 12-blade light wheel behind the mark; a shine sweep across the
logo; then a brass rule that opens outward with PRESENTS settling onto it.

Ours: fade in, hold 1.1s, fade out.

That sequence is why the prototype feels like a product in its first four
seconds. It is also entirely free — no art, no audio, just timing.

**Verdict: adapt.** We have better art than the prototype did; the same
choreography with our logo would carry more. Budget it as a day.

### 2.5 The hero is animated from one frame

`drawHero` (10512). There is one hero image. The prototype splits it at 56%
height, slides the legs ±1px on a 4-phase cycle, bobs the body 1px against
them, and stretches the body by the bob so no seam opens. Plus: a brass ellipse
under her, a health bar, her name, and a pulsing green cross when she is
regenerating (10551).

Ours has real art and no walk cycle at all.

**Verdict: adapt.** Two pixels of counter-motion is the whole trick.

### 2.6 The hero's death has a place on the board

10377: while she is down, a pulsing ellipse marks *where she will come back*
with the countdown printed above it.

You asked for the downed hero to be shown on the HUD portrait only, and that
was the right call for the half-rendered sprite bug. But the prototype's ground
marker is doing a different job: it tells you where the gap in your line is and
when it closes. **Verdict: adapt** — a marker, not a sprite.

### 2.7 Pacing numbers

| | prototype | current |
|---|---|---|
| first prep | 16s | 30s |
| between waves | 12s | 15s |
| early-call bonus | 2 gold/sec | 2 peanuts/sec |
| speed toggle | 1x / 2x | fixed 1.4x |
| toast duration | 2.2s, fixed place | varies |

Our prep windows are roughly 30% longer than the prototype's on top of not
having a 2x. Combined, a wave-to-wave cycle in our build takes noticeably
longer than the thing you remember enjoying. **Verdict: adopt** the shorter
windows once the speed toggle exists.

---

## 3. UI and layout — why it reads more professional

Six concrete reasons, in order of how much they matter.

### 3.1 One list drives both drawing and hit-testing

The header comment at 10022 states the rule: *"Every interactive region is
produced by one of the `*Buttons()` functions below. Drawing and hit testing
both read that same list, so a control can never be visible in one and absent
in the other."*

`levelButtons()` (10158) returns every region for the current game state.
`drawLevel` draws that list; `hitButton` (10274) tests it, back-to-front so
that what draws on top is hit first (10275).

That single decision eliminates an entire class of bug: the dead button, the
invisible hit area, the control that survives a state change it shouldn't. We
have hit rectangles created next to each object across seven scenes, and we have
already been bitten by exactly this — `topOnly`, a tap reaching a scene handler
after the dialog it closed was gone, `hitAreas` outliving a closed menu.

**Verdict: adapt the principle, not the code.** Phaser's model is different and
rewriting to a region list would be a large refactor for a working game. But the
rule — *no control is drawn except from the same description that carries its
hit area* — is worth enforcing where we add UI from here.

### 3.2 The board is fitted below the HUD, not behind it

`BOARD_TOP = 78` (9003) with the comment: *"The status bar is opaque, so the
board lives underneath it rather than behind it. Every level's geometry is
squeezed into the strip below the bar once, here... Nothing on a level plate is
ever hidden by the HUD."* Every path point, build spot, water rect and ridge in
every level is transformed once at load (9007–9026).

Ours draws a full-bleed map with a floating HUD over it. That is a legitimate
modern look, but it has cost us: the boss bar running through the wave counter,
the wave message running through a dialog title, the Kenney credit line landing
under the ability bar. Each of those was fixed individually. The prototype made
them impossible.

**Verdict: adapt.** Not necessarily a full strip — but a reserved HUD band that
the world camera's bounds respect would close the whole category.

### 3.3 The tower panel is anchored, non-modal, and never off screen

10219–10258. The panel is 250×96 and appears **below the selected tower**,
flipping above it if it would collide with the bottom controls, clamped into
the board (10222–10225). It does not dim the world. The tower's range circle
stays drawn the entire time it is open.

Ours is a centred modal dialog at 22% dim. The range ring — the single most
important input to "should I upgrade this?" — is hidden behind the thing asking
the question.

**Verdict: adopt.** This is the clearest UX regression against the prototype.

### 3.4 The wave tracker shows the shape of the level

10703–10732: one pip per wave across the top, filled for done, outlined for
current, dim for future, with a red tick under any wave that carries a boss.
Plus the level's name above it and NEXT IN 8S beside it.

Ours prints `7/13`. The player cannot see how much is left, or that wave 13 is
different, until it arrives.

**Verdict: adopt.** Cheap, and it is most of what makes an encounter feel
authored.

### 3.5 Type is one font on a scale ladder

The bitmap font (186) is uppercase-only by design, 5×7, drawn as rects, with a
shadowed variant (297). Everything is `scale: 1` body, `2` sub, `3` heading,
`5` PAUSED, `8` title. There is one text function in the whole program, so the
hierarchy is enforced by there being nowhere else to go.

We have two font families, `uiSize`/`menuSize` floors, and per-call sizes
ranging 15–92px chosen individually at each site. It is more flexible and less
consistent — and consistency is most of what "professional" means visually.

**Verdict: adapt.** Not the bitmap font. But a named ladder in `Theme.ts`
(`SIZE.body`, `SIZE.sub`, `SIZE.heading`, `SIZE.display`) that call sites pick
from, rather than typing a number.

### 3.6 The safe-area box, not the window — WE HAVE AN ACTUAL BUG HERE

CSS at 26–34 insets `#wrap` by `env(safe-area-inset-*)`, and `fitCanvas`
(11625) measures *that box*, with the comment: *"measure the safe-area box, not
the raw window, so a notch or a home indicator never sits on top of the
on-screen controls."*

Our `index.html` sets `viewport-fit=cover` but applies `env(safe-area-inset-*)`
nowhere. Our HUD margins are `marginX: 12`, the mute button sits at x=36, the
pause button at width−34. On a notched iPhone held in landscape, the inset is
~44pt — so the peanut counter and the mute button are underneath the notch, and
the pause button is in the home-indicator strip.

**Verdict: adopt, and treat as a bug rather than a polish item.** This is
probably visible on your own phone right now.

---

## 4. Tone and writing

You said our flavour text is excessive and unhelpful. Here is exactly what the
prototype does differently.

### 4.1 The message bar is usually empty

`toast()` (9158) sets a string and a 2.2-second timer. It is called from **ten
places in the whole game** and produces **eight distinct messages**: not enough
gold (×3), the early-call bonus, the warlord approaching, the warlord summoning,
the hero falling, the hero returning, and the two sign-bribe lines. The rest of
the time that strip is not drawn at all (10402).

Our `status.message` is *always* populated. `idleHint()` (GameScene:961) writes
a full sentence of advice whenever nothing else has anything to say — and the
same line also carries confirmations, refusals, boss narration and tutorial
prompts. One line doing four jobs, never blank.

A message that is always there stops being read. That is the whole complaint,
and it is a structural problem rather than a writing one: **the fix is to let
the line be empty**, and to only ever put a *fact* in it.

### 4.2 Flavour lives where the player is not deciding

Inventory of every joke in the prototype:

- **The credits roll.** ~130 lines. The entire joke budget, in one place, at
  the end, skippable.
- **The result lines.** THE LINE HELD / THE LINE BROKE, and NOT ONE OF THEM GOT
  THROUGH / A FEW SLIPPED PAST / BARELY.
- **The sign bribe.** "50 PEANUTS. THE SIGN TURNS AROUND."
- **The rotate card.** "Turn your phone sideways to hold the road."
- **BREACH**, in red, when something gets past you.

That is the complete list. And critically: **nowhere the player is making a
decision has any flavour on it at all.** The tower blurbs are pure mechanics:

> *Fast arrows. Hits air. Poor against armour.*
> *Sends soldiers to block the road. Does not shoot.*
> *Magic damage ignores armour. Hits air.*
> *Slow splash damage. Cannot hit air.*

The specialisation blurbs are the same:

> *Executes any non-boss below 15% health.*
> *Arrows bleed for 6 damage a second over 4 seconds.*
> *Each bolt arcs to two more targets for 60% damage.*

Every one of those sentences is a decision input. There is not one adjective in
any of them that isn't load-bearing. And the panel enforces the budget in code:
`blurb.slice(0, 44)` (10759) — 44 characters, truncated, no exceptions.

**The rule to extract: flavour where you are not deciding; numbers where you
are.** That single rule would resolve the complaint without removing a single
joke from the game — the jokes just move to the credits, the results screen and
the boss announcement, and the build menu gets its 44 characters of mechanics.

### 4.3 We tell the player less about towers than the prototype does

`BuildMenu` (src/ui/BuildMenu.ts:99) draws an icon, the first word of the
tower's name, and its cost. `towers.json` has no description field at all.

The only mechanical information at the point of purchase is the range ring,
which is shown on `pointerover` — **and there is no hover on a phone.** So on
the actual target device, our build menu tells the player a picture and a price.

The prototype gives you one 44-character sentence that names the trade-off.

**Verdict: adopt.** A `blurb` field in `towers.json` and one line in the build
cell. This is probably the highest clarity-per-hour item in the document.

---

## 5. Balance and economy

All figures computed from the two data sets.

### 5.1 Income

Prototype, level 1 (10 waves, 8 pads, start 300):

| wave | kills | wave income | cumulative |
|---:|---:|---:|---:|
| 1 | 5 | 61 | 361 |
| 5 | 14 | 141 | 817 |
| 10 | 22 | 312 | 1868 |

Current build (13 waves, 7 pads, start 100):

| wave | kills | wave income | cumulative |
|---:|---:|---:|---:|
| 1 | 4 | 63 | 163 |
| 5 | 19 | 156 | 590 |
| 9 | 43 | 398 | 1749 |
| 13 | 15 | 1025 | 4307 |

Two structural differences fall out of that.

**The wave-clear reward stops mattering.** The prototype's clear bonus scales
with the wave: 31 → 84 on level 1, 42 → 210 on level 5. It is 51% of wave-1
income and still 27% of wave-10 income — always a felt reward for surviving.
Ours is flat at 35: 56% of wave 1 and **3% of wave 13**. By the back half of
the run, clearing a wave pays nothing. **Verdict: adopt the scaling.**

**The boss is a windfall with nothing to spend it on.** The Politician pays 900
peanuts — 21% of the entire run's income, arriving at the very end. That is
exactly the "dead surplus" `DESIGN.md` forbids in its own economy rules. It is
also the best HP-per-peanut rate in the game (6.9), better than the trash. In
the prototype the curve runs the other way: tough enemies pay *less* per point
of HP (runt 6.7, brute 10.0, hulk 12.6, warlord 13.0), so income per unit of
effort declines as a level goes on and you never get rich late.
**Verdict: adopt the declining curve; cut the boss payout hard.**

### 5.2 The swing between too rich and too hard — here is the cause

Cost to take one tower to tier 3:

| current | | prototype | |
|---|---:|---|---:|
| withholding | 512 | archer | 610 |
| extension | 640 | barracks | 650 |
| rounding | 800 | mage | 735 |
| shelter | 896 | bombard | 830 |
| writeoff | 960 | | |
| escalation | **1408** | | |
| **spread** | **2.75×** | **spread** | **1.36×** |

The prototype's four towers cost within 36% of each other end to end, and *all
four are always available*. The player's total board cost is therefore
effectively fixed, and the income curve can be tuned against it once.

Ours vary by **2.75×**, and the draft hands you two of six at random. A
withholding/extension draw needs 3,600–4,500 peanuts to max seven pads against
4,307 of income — you finish the board early and sit on a surplus with nothing
to buy. An escalation/writeoff draw needs 8,300–9,900 against the same 4,307 —
you finish at roughly tier 2 and it reads as punishing.

**That is the swing, and it is not a tuning problem — it is a variance
problem.** No single set of numbers can be right for both draws.

Two fixes, either of which works:

1. **Flat specialisation cost**, as the prototype has (`SPEC_COST = 240` for
   every tower in the game, 8782). Ours range 320–880 and are the largest
   component of the spread.
2. **Compress the build costs** so the maxed-tower spread is under ~1.5×, and
   express a tower's power through its *shape* — splash, pierce, control —
   rather than its price.

**Verdict: adopt both.** This is the highest-impact balance change available,
and it is a data edit.

### 5.3 Armour: flat subtraction vs multiplier

Prototype: `mult = 1 - armor` (9262), max 0.60 on the Iron Hulk, plus a
separate `resist` for magic.

Ours: `Math.max(1, damage - Math.max(0, armor - pierce))` — flat, with the
Final Notice at 7 armour. Against a Rounding Error's 9 damage that is a **78%
reduction**, harsher than anything in the prototype, and the comment in
`Combat.ts` says as much. Flat-plus-pierce is a defensible model and the
reasoning is documented, but the *magnitude* is out of band: it turns fast weak
towers from "a poor choice here" into "does literally nothing", with no signal
to the player that it happened.

**Verdict: adapt.** Keep flat + pierce; cap effective reduction at ~60% and
show the mitigation (a grey damage number reads instantly).

### 5.4 Opening purse

Prototype: 300 gold, cheapest tower 70 — **you open with four towers on the
board** before wave 1.

Ours: 100 peanuts against a cheapest drawn tower of 80–220 — **one, sometimes
zero**, with `openingPurse` guaranteeing you can afford exactly the cheapest
thing you drew.

`DESIGN.md` says this is deliberate: *"The opening buys exactly one tower...
Opening rich enough to fill the board meant every decision in the run was made
during wave 1."* That reasoning is sound. But the cost is that our wave 1 is a
spectator event with one turret, and the prototype's wave 1 is a small puzzle
you already have pieces for.

**Verdict: your call, flagged rather than recommended.** A middle position
exists: open with enough for two, and keep the sink in the upgrade tiers where
`DESIGN.md` already puts it.

### 5.5 Wave shape

Prototype waves are built from groups with `count`, `gap`, `delay` and a
**`pathId`** — so a wave can come down two roads at once, or send raiders up
one road four seconds after brutes start up the other (8843). Peak wave size on
level 1 is 22 enemies.

Ours has `count`, `interval`, `delay` and one path. Peak wave size is **66**.

We are producing difficulty by volume where the prototype produces it by
composition. Sixty-six enemies down one lane is not three times harder than
twenty-two, it is the same problem for three times as long. **Verdict: adapt** —
a second path is a map change, but interleaved group timing on one path is
free and gets most of the benefit.

---

## 6. Where the current build is genuinely better

Honestly, and it is a long list.

1. **Audio.** The prototype has none at all — not a stub, not a plan. We have a
   mixer, per-cue gain, a persisted volume, and a mute reachable mid-run.
2. **Art.** Painted assets at real resolution against a 5×7 bitmap font and
   procedural terrain. Not close.
3. **The map is bigger than the screen.** Two cameras, a world camera with
   proper pan/zoom and hard-clamped bounds, a fixed UI camera, and a gesture
   rig with pinch anchoring, damping and momentum. The prototype's board is
   fixed at 960×540 with no camera at all.
4. **Data-driven everything.** Every balance number lives in JSON, and a test
   enforces that no sprite key appears outside `art.json`. The prototype's
   numbers are literals scattered through 4,700 lines.
5. **235 tests**, including the pure-logic modules (`Combat`, `Economy`,
   `Upgrades`, `CameraMath`, `LastStand`) that can be reasoned about without a
   renderer. The prototype exports a `CJD` test surface but ships no tests.
6. **Build times on upgrades.** A tier-2 purchase takes 4 seconds at reduced
   fire rate, so upgrading mid-wave is a real risk. The prototype's upgrades
   are instant, which makes them strictly free if you have the gold.
7. **The upgrade panel projects.** We show `19.8 → 27.7` for every stat the
   purchase would change. The prototype shows only current values — you buy on
   faith.
8. **Confirm dialogs on spends.** A misjudged tap cannot empty your pockets.
   The prototype's radial build fires on the first tap.
9. **Richer hero design.** Armour-shred passive, Haymaker with knockback,
   Restructure (free tower relocation), and Last Stand at 25% health. The
   prototype's hero has an auto-attack and out-of-combat regen.
10. **A boss with an idea.** The Politician taxes your peanuts on a phase timer
    and forces you to spend under pressure. The prototype's boss is a large HP
    bar that summons.
11. **The tier read.** Pips *plus* per-tier scale and tint. The prototype has
    three 5×3px brass rectangles.
12. **Orientation handling.** Ours pauses, shows the gate, and resumes on
    rotate without a reload; the prototype's freezes the loop behind a CSS card.
    (One thing theirs does better: if the splash was never seen, it restarts it
    — 11837.)
13. **Deployment.** Content-hashed bundles and a `version.json` self-check, so a
    phone holding a stale `index.html` heals itself. The prototype is one file
    and doesn't have the problem, but also has no answer if it did.

The technical foundation here is better in every respect that will matter in
six months. What's missing is almost entirely *game*, not *engineering* — which
is the good version of this problem to have.

---

## Priority list

Ordered by player impact per hour of work.

| # | Gap | Section | Effort | Verdict |
|---|---|---|---|---|
| 1 | Kill bounty pops at the corpse; BREACH at the leak; rings on transactions | 2.1 | hours | **adopt** |
| 2 | Tower blurbs in the build menu (44 chars, mechanical) | 4.3 | hours | **adopt** |
| 3 | Let the message line be empty; one fact at a time | 4.1 | hours | **adopt** |
| 4 | Game speed toggle (1x / 2x) | 1.3 | hours | **adopt** |
| 5 | Safe-area insets — HUD is under the notch today | 3.6 | hours | **adopt (bug)** |
| 6 | Flat spec cost + compressed tower costs (fixes the rich/hard swing) | 5.2 | hours, data only | **adopt** |
| 7 | Scaling wave-clear reward; cut the boss windfall | 5.1 | hours, data only | **adopt** |
| 8 | ~~Results screen~~ — **built**: Banner Points, stats, TRY AGAIN | 1.4 | done | **shipped** |
| 9 | Wave pips with boss marks | 3.4 | a day | **adopt** |
| 10 | Status effects visible on the enemy | 2.2 | a day | **adopt** |
| 11 | Non-modal tower panel anchored to the tower, range ring visible | 3.3 | a day | **adopt** |
| 12 | Pulsing build pads with a glyph | 2.3 | hours | **adopt** |
| 13 | Cap effective armour reduction; show mitigated hits | 5.3 | hours | **adapt** |
| 14 | Splitter enemy + a second defence axis | 1.2 | a day | **adapt** |
| 15 | Splash choreography (fall, impact, shockwave, sparks, shine) | 2.4 | a day | **adapt** |
| 16 | Reserved HUD band the world camera respects | 3.2 | a day | **adapt** |
| 17 | Hero walk cycle + downed ground marker with countdown | 2.5, 2.6 | a day | **adapt** |
| 18 | On-screen error panel | 1.7 | hours | **adopt** |
| 19 | Type scale ladder in `Theme.ts` | 3.5 | a day | **adapt** |
| 20 | Interleaved group timing in waves; stop scaling by volume | 5.5 | a day | **adapt** |
| 21 | Radial build menu at the pad | 1.6 | a day | **adapt** |
| 22 | **Barracks / blockers / rally flags** | 1.1 | **a week** | **adapt** |
| 23 | Opening purse: one tower vs four | 5.4 | data | **your call** |
| 24 | Region-list UI (one source for draw + hit test) | 3.1 | large | **adapt the principle** |
| 25 | World map, five levels, stars, save, continue | 1.5 | large | **ignore** (Phase 2 supersedes) |
| 26 | Air units and a second path | 1.2 | large | **defer** |

Items 1–12 are, together, roughly a week, and they are where nearly all of the
"it felt better" lives. Item 22 is the one that changes what the game *is*, and
it is the only entry here worth arguing about.

---

*Diagnosis only. No game code was changed in this pass.*
