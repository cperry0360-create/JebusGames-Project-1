# Level 4, the Glitch Bug, Eli's two buttons, and four bugs

Five tasks in order, on `claude/level4-assets-webp-locfhx`. Everything below is
measured; where a figure came from a rendered frame rather than a number, it
says so.

## The commits

| commit | what | CI |
|---|---|---|
| `9d7d612` | the level 4 plate, six enemies, the geometry file | green (run 124) |
| `3698fe6` | level 4: map, cast, waves, checker, tests | green (run 125) |
| `8036058` | the Glitch Bug's telegraphed tower kill | green (run 126) |
| `4de02c6` | the tuning pass: 0% → 38%, and why | green (run 127) |
| `5b01912` | Star Rain to slot 1, Ice Beam in slot 2 | green (run 128) |
| `0f35bcd` | bugs 1, 2 and 3 | green (run 129) |
| `268497f` | merge of `claude/phaser-vendor-layout-authority-74uaif` (bug 4) | green (run 130) |
| *this commit* | this report | green on `4f9a05f`, its pre-amend hash (run 131); the amend changed only this table row |

Deploy is skipped on all eight: it is gated on `main`.

877 tests pass. `sh tools/tsdiff.sh 9d7d612` reports two lines, both accounted
for: `StuckWatch.ts` TS2307 (a file new since the baseline that imports Phaser
— tsdiff's documented blind spot) and a `LoadoutScene.input` cascade from the
merged branch. CI typechecked both against the real Phaser typings and passed.

---

## Task 1 — level 4, The Conundrum

`map_level4.json` is `tools/level4_geometry.json` with three edits, none of
them a coordinate change, each documented in the file: a gateway point at each
end so enemies walk on and off the plate, and both branches snapped onto the
declared merge, which they missed by 1.07 px (upper) and 5.60 px (lower).

**The gateway distance is the one thing chosen rather than computed.** The
lower gateway sits at x=-60, level 3's figure; the upper one is pulled 3.55 px
further out, which makes both routes walk **1479.0 px** gate to exit. Level 3
got equal routes by luck of the trace and its wave table leans on them; level
4's does too, so here they are arranged rather than lucky.

Fourteen pads, straight from the geometry file. **Three reach the shared tail
and between them cover 45.3% of it** — the property the level is built on, held
by a test so nobody fixes it later by adding pads to the snow.

### What the checker measures

`python3 tools/check_level4.py --overlay` re-derives everything off the
painting:

```
upper  route  traced 1359.8  geometry 1344.6   1.13%
lower  route  traced 1372.7  geometry 1344.3   2.11%
pooled over 665 normals 48.5  geometry 50.0    3.00%  (gate 8%)
14 pads: 90.9 to 111.0 from the nearest lane, closest pair 74.11, largest
         object inside any 24px core 20px (under the 30px blob floor)
```

**Road width gets an 8% gate rather than the brief's 3%, and that is a
statement about the measurement rather than about the road.** Five defensible
estimators were tried on this plate — per-lane medians, the pooled median,
twice the larger half-width, the same with the painted outline counted in, and
only the samples whose normals end on grass at both ends. They read 45.5, 48.5,
52.0, 54.2 and 58.0. The geometry's 50 sits in the middle of that family; a 3%
gate on any one of them would be testing which estimator was picked. The branch
lengths keep 3% and pass.

**The classifier knows two grounds, and tells snow from ice by GREEN.** A
drift's shaded side is as blue as a pond; the ponds are painted cyan, 60–100
levels greener than red, and snow stays within 40. Four probes run on every
invocation — two ice ponds at 0% and 2% buildable, the waterfall at 7%, the
snow field east of the merge at 93% — and the run **stops before reporting on
the pads** if those stop separating. A checker that cannot fail is not a check.

### Three numbers are not the brief's

Each is one line to put back, and each exists because a rule already in the
test suite said no.

| the brief | shipped | why |
|---|---|---|
| Overpacker at 90 world px | **85** | every tower in the game is 87.1 px and `content.test.ts` holds the rank and file under that. At 90 he would be the only unit on the board taller than every building. 85 is what level 3's two heaviest elites already are. |
| Overpacker 1.4 s, Tour Guide 1.0 s | **1.6 s, 1.1 s** | damage untouched. At the brief's cadence, three of either kill Cory in 8.8 s against `armor.test.ts`'s ten-second floor. |
| `runsClearedToUnlock: 1` | **3** | the brief also asks that level 4 be locked until level 3 is cleared once. At 1 it is not: clearing level 1 opens every level and START RUN skips two of them. This is the same disagreement level 3's brief carried, resolved the same way. |

### The curve had to learn about a boss in the middle

No level before this one has one. Measured on raw wave health, the Lich King's
arrival is a 267% cliff and the wave after him a 66% collapse — two failures
from `content.test.ts` on a level that plays as neither, because what actually
happens is that one large enemy walks on and then walks off. The cliff test now
excludes a boss's own pool and carries the comparison across the boss wave to
the last ordinary one. **Levels 1 to 3 read exactly as they did.**

---

## Task 2 — the Glitch Bug's tower kill

`systems/TowerDisable.ts` gains one field, `destroys`. The cooldown, the choice
of target, the windup that makes the choice visible, the rule that a caster
killed mid-cast lands nothing, and the rule that a second cast cannot start
inside a first are all the same code the Rainbow Reaper uses. The scene and the
sim each branch on `destroys` exactly once.

One place the two casters want different things from the picker: the Reaper
skips a tower that is already dark, because re-disabling it is a wasted cast.
Taking one away is not wasted and cannot loop, so the destroying cast passes
`skipDisabled` off.

The pad goes free and there is no refund. `destroyTower` is `sellTower`'s steps
minus that one.

**Measured in the simulator**, over twelve level 4 seeds before the reporting
was trimmed to one line per run: eight towers destroyed, the first at wave 9 —
the bug's first real appearance. The soak models the destroy, because level 4
is tuned against that number.

---

## Task 3 — the tuning pass

Level 4 soaked at **0/60**. The answer was not the wave curve. Every row below
is 60 or 120 seeds of `tools/soak/level.ts`, changing one thing:

| change | win rate |
|---|---|
| wave counts scaled 0.7 / 0.85 / 1.0 / 1.2 | 0–2% at every scale |
| boss 5200, tower-kill removed | 0% |
| boss 5200, livesCost 14 → 6 → 4 → 2 | 0% at all four |
| boss 5200, armour 8 → 4 → 0 | 0% at all three |
| boss 5200, made blockable and slowable | 0% |
| boss 5200 moved to wave 10 | 0% |
| boss 5200 → 2400 → 1200 → 600 → 400 | 0, 0, 2, 30, 42% |
| boss 100, keeping its 1500 peanuts | 47% |
| boss 100, paying nothing | 7% |
| four extra pads bolted onto the tail, boss 400 / 2400 | 60% / 0% |
| boss 2400 at speed 12 instead of 32 | 25% |

**Two findings.** The level runs on the boss's purse: a trivial boss that pays
1500 gives 47% and one that pays nothing gives 7%, so wave 7 is where the board
for waves 8–13 is bought. And **the board could not deliver 5200 damage to one
target** — not at any wave, not with the armour off, not with him held and
slowed, and not with four extra pads on the tail.

The lever that works is **time under fire**. He walks at 14 now and carries
1200, returning at 1800. He is three and a half times the toughest elite and
takes a hundred seconds to cross, so the fight lasts long enough to be one.

Also moved: **the Overpacker does not arrive until wave 8.** His armour 10 is
above the per-shot damage of three of the six towers, so a wave-5 board that
drew the wrong pair could not scratch him. That single move is most of the
distance from 0% to 38%.

```
level 4 before   0/60   (0%)
level 4 after   46/120 (38%)   losses 36 at the wave 7 boss, 35 at the finale
```

### All four levels, re-soaked at 120 seeds

| level | win rate | where the losses land |
|---|---|---|
| level 1 | 90/120 (75%) | 27 of 30 on the last wave |
| level 2 | 20/120 (17%) | 97 of 100 on the last wave |
| level 3 | 80/120 (67%) | spread over waves 10–13 |
| level 4 | 46/120 (38%) | split between wave 7 and wave 13 |

**Level 2 is the outlier and was before this brief.** 97 of its 100 losses are
The Devil on wave 13 — a boss-health problem of exactly the kind this pass
diagnosed on level 4. Level 1 at 75% is loose the other way. Neither was in
scope.

---

## Task 4 — Eli

**Star Rain** is slot 1 and Quick Cut is gone from the game. Fourteen stars
over a 62 px disc centred on Eli, on Quick Cut's 8 second cooldown. Each star
only hurts what is within 26 px of where it lands, so one enemy in the disc
takes about 2.5 stars for around 50, and a crowd of four takes most of the 280
the volley is worth. It scattered the same fourteen over 140 px as a slot 2,
where a lone enemy caught half a star.

**Ice Beam** is slot 2: a 96 px area at the point tapped, 110 damage, and a
slow to 0.18 of speed for 2.5 seconds. The line drawn from Eli is drawn and
nothing else — an enemy standing in the beam is untouched, and a test says so.
Against Bramble's 0.45 that is a fifth of speed rather than half, and 2.5
seconds against a tower slow that refreshes forever is a window rather than a
condition. A boss that resists crowd control takes the 110 and keeps walking:
`powerBeam` never mentions `slowable`, because `Enemy.applySlow` already
refuses on it.

Every number is in `heroes.json`. The soak learned the scatter — its slot 1
handler applied damage once to everything in the radius, which was right for a
burst and wrong for a rain by a factor of five in either direction.

**Both of Eli's icons are now the neutral stand-in, and one was deleted to get
there.** `ability_eli_2.webp` existed: a hatched placeholder reading STAR /
LOCKED, drawn for Star Rain when Star Rain was the locked slot 2. It named the
wrong ability and called it locked, so it went.

---

## Task 5 — the four bugs

### 1. The duplicate peanut counter — fixed

The drawer takes its tiles as a function, so `refresh()` re-reads everything.
The only thing that calls it is `refreshAffordability`, **and that fires only
when a tile's affordable flag flips.** Earning four peanuts flips nothing, so
the drawer's number sat at whatever the last rebuild read while the HUD counter
beside it ticked. That is why the playtest screenshot showed 404 against 408,
and why the drawer was always behind and never ahead.

The panel is three sections rather than four and the grid gets the height back:
94 → 118 at 844x390, 55 → 73 at 568x320. The narrow screen crosses a line the
tests record — **568x320 can show a whole tile for the first time**, against a
62 px tile.

### 2. The tower that does not fire — identified, and it is not a bug

**It is the Beacon.** `shelter` in `towers.json`: damage 0, fireInterval 0,
supportRadius 215, archetype `support`, trait "Buffs nearby guns", blurb "Fires
at nothing." **The same on levels 1 and 2** — the fault is not level 3's and
not the branching lanes'.

All three candidates are ruled out rather than argued away:

- **Targeting layers**: with damage 0 it never asks for a target at all.
- **Range**: `range` is 0 and irrelevant; the sim's build filter already exempts
  support towers from the reach check.
- **Both lanes**: `pickFirst` runs over one flat enemy list, so a tower on
  level 3 or 4 sees both branches.

**What is actually wrong is the art.** `tower_tax.webp` is a gunner behind a
riot shield with a minigun on a wheeled mount, and it is the only thing on
screen during a wave. Every word of data says support; once it is placed,
nothing on the board does. That needs art and is recorded, not fixed.

Two real defects found while looking:

- **A disabled Beacon went on buffing.** `landDisable` has called
  `refreshSupport` since the Rainbow Reaper shipped, with a comment saying the
  aura goes dark with the tower, and `refreshSupport` never checked
  `disabledFor`. The comment described the intent and the code did the other
  thing for as long as both existed. **Fixed.**
- **The soak does not model support at all** — no aura, no bonus — so a board
  that draws a Beacon is measured as a board with a dead tower on it. Left
  alone deliberately: fixing it moves every win rate on every level. Open item
  below.

### 3. The unlabelled blue segmented bar — labelled

It is the hero's health (`HudScene.drawHeroBar`), current rather than stale.
The segments are the two thresholds in `status.heroMarks` — transform at half,
Last Stand at a quarter. It read "Cory · DAD MODE"; the mode half was wrong for
four heroes out of five, because `lastStand.name` is that literal string in all
five entries of `heroes.json`, and both halves came off together.

**The name is back and the mode is not.** The previous report recommended a
portrait icon at the bar's left cap instead; the bar is 20 px tall and a
portrait at that size is a smudge, so the name won. A test holds both halves —
`heroLabel` must be present and `DAD MODE` must not.

### 4. The soft lock — merged, not rewritten

**Already diagnosed and fixed on `claude/phaser-vendor-layout-authority-74uaif`,
which had never been merged.** The cause was verified independently on this
branch before merging anything:

- `Orientation.ts` pauses every scene from a **per-frame** `POST_STEP` hook and
  resumes only from `sync()`, which runs on resize/orientationchange. **A state
  with a per-frame way in and an event-driven way out can only fail closed.**
  One stale iOS viewport frame landing after the last `settle()` latches a
  pause no event will undo.
- `isPortrait()` asked `innerHeight > innerWidth` while the stylesheet asked
  `@media (orientation: portrait)` — two predicates that agree almost always
  and disagree exactly when it matters, so the game paused while the CSS hid
  the overlay that would have explained why.
- `GameScene` disarms the freeze watchdog on Phaser's `PAUSE` event, so the one
  detector that notices a stopped loop was told to stand down by the thing that
  stopped it.

The merge brings `OrientationGate.ts`, `InputGates.ts`, `StuckGuard.ts`,
`StuckWatch.ts` and `reportQuietly`. Reproduced on this tree after merging:

```
sh tools/harness/run.sh softlock 240 844x390
  stale frame delivered; window is back to 844x198
  enemies moved after the stale frame: 4 of 4
  VERDICT NO LOCK: the gate handed the run back
```

Two conflicts, both in comments describing the same change from two sessions;
resolved by keeping the playtest evidence and folding in the affordability-flip
cause the brief asked to be reported.

---

## Verification

**From rendered frames** (`tools/harness/run.sh screens`, five screens each):

| viewport | result |
|---|---|
| 667x375 | 1 fault — the version stamp's hidden five-tap dev door, deliberately under 44pt and self-labelled. Known, recorded in two prior reports. |
| 844x390 | the same single known exception |
| 1440x900 | no layout faults |
| 375x667 | portrait is gated; rotate overlay showing, `media(portrait)=true` |
| 390x844 | portrait is gated |
| 900x1440 | portrait is gated |

Portrait is *gated*, not audited: the game is landscape-only and a portrait
viewport gets the rotate overlay. That is the correct answer for portrait.

Also read as pictures, not just numbers: the world map with four cards (which
is how level 4's first position was caught colliding), the game screen with the
labelled hero bar, the level 4 plate with its traced lanes and pad cores
(`tools/decode/out/level4_pads.png`), and the region card crop.

**Not from rendered frames:** the Loadout card for Eli specifically — the
harness shows the default hero. The card reads `slot.name` straight from
`heroes.json` and `loadout.test.ts` measures every card body against the
longest that fits, so "Star Rain" and "Ice Beam" are checked by arithmetic
rather than by eye. Ice Beam and Star Rain have not been watched being cast on
a real board; their rules are covered by tests and by the soak.

---

## Where this leaves the repository

**In flight:** `claude/level4-assets-webp-locfhx`, 14 commits, **a clean
fast-forward to `main`** (ahead 14, behind 0). All eight CI runs green. Merging
it also lands `claude/phaser-vendor-layout-authority-74uaif`, which has been
sitting unmerged and carries the soft-lock fix and the loadout stack work.

**Waiting on a decision**

1. **Level 4's boss is 1200/1800 at speed 14, not 5200/7800 at speed 32.** The
   sensitivity table above is the argument; the brief's numbers give 0/60 and
   nothing rescues them. If a bigger boss is wanted, the map needs pads east of
   the merge — which is the one thing the brief says not to do.
2. **Three of the brief's numbers were overruled by existing tests** (the table
   in Task 1). Each is one line.
3. **A 2.25× finale instead of 1.5×.** Boss 400 with a 900 finale soaks at 37%
   against 42% for the briefed 1.5× — available if the last wave should hit
   harder than the first fight.

**New, and open**

4. **The soak does not model support towers.** No aura, no damage bonus. Every
   win rate in this report understates a board that drew a Beacon. Fixing it is
   a re-baseline of all four levels, not a bug fix.
5. **The Beacon's art is a gun.** Nothing on the board says "support" once it
   is placed. Wants art, or a persistent aura marker.
6. **Both of Eli's ability icons are the missing-art stand-in**, and
   `ability-bailey-1` still is too.

**Carried forward, still open**

7. **Loadout card text overflows its card** — `stackSections` may squeeze a card
   row below its measured content height, and `cardFace` has a `maxLines` clip
   that truncates SCRATCH TICKET and CHAIN. Diagnosed in
   `2026-09-06-the-soft-lock.md`, not fixed.
8. **667x375 Loadout overflow**, 87 design units with every section at its floor.
9. **Level 2 at 17%** and **level 1 at 75%**, both outside the 35–45 band.
10. Older: no `package-lock.json`; `tools/trace_map.py` broken; the eight
    ability icons that grew as WebP; lossless for the twelve low-PSNR small
    sprites; `art-source/` has no README; the desktop render-scale floor
    (`RENDER-QUALITY.md` §6); `DESIGN.md` still calls Eli "The Charmer" with an
    active named *Fetch* — **and that is now two names out of date**, since
    Quick Cut is gone as well.

**Closed by this session:** the non-firing level 3 tower (item 2 of the
soft-lock report) and the unlabelled hero bar (item 3) are both answered above.
