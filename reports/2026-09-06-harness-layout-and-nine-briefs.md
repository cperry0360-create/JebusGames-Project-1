# The session that could finally see the screen

Nine briefs, plus a tenth that arrived mid-session. The one that mattered was
the first: `tools/harness/` needed a Phaser dist and had never had one, so five
consecutive sessions fixed rendering bugs against computed layout values and
never saw a frame. It runs now, and **five of the eight faults below were found
by looking at a picture, not by reading the source.**

## Commits

| # | commit | what | CI |
|---|---|---|---|
| 1 | [`fd60c86`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/fd60c86) | Stop at Step 0: the previous branch had not merged | ✅ ✅ ([run 33997375057](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33997375057)) |
| 2 | [`7c51076`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/7c51076) | Close that report's CI table | ✅ ✅ ([run 33997761416](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33997761416)) |
| 3 | [`5060ea8`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/5060ea8) | Vendor Phaser; `shrink.py` | covered by run 110 |
| 4 | [`d53bff4`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/d53bff4) | Cutscenes every time; the layout authority | covered by run 110 |
| 5 | [`3c9aedf`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/3c9aedf) | HUD clutter, wave banner, peanut icon | covered by run 110 |
| 6 | [`7b94d86`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/7b94d86) | Per-enemy art facing | covered by run 110 |
| 7 | [`9df2e50`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/9df2e50) | Live affordability | covered by run 110 |
| 8 | [`f51769a`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/f51769a) | The counters panned the map | covered by run 110 |
| 9 | [`fd3b076`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/fd3b076) | The Rainbow Reaper retuned | covered by run 110 |
| 10 | [`c8f4b72`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/c8f4b72) | Menus inside the safe area; CLAUDE.md rules | ✅ ✅ ([run 34002023291](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34002023291)) |
| 11 | [`b24a175`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/b24a175) | This report | ✅ ✅ ([run 34002101271](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34002101271)) |
| 12 | [`0c6d4ee`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/0c6d4ee) | The Reaper retuned from 4200; reward 900; the boss test | ✅ ✅ ([run 34002399553](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34002399553)) |
| 13 | [`e0edc98`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/e0edc98) | Close that table | covered by run 114 |
| 14 | [`391e578`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/391e578) | Wave 1 waits for the player | ✅ ✅ ([run 34032008391](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34032008391)) |
| 15 | [`c1ebd82`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/c1ebd82) | Close that table | covered by run 118 |
| 16 | [`3ef5466`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/3ef5466) | The loadout stack; the letterbox | ✅ ✅ ([run 34033965367](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34033965367)) |
| 17 | the commit closing this table | — | not recorded: a report cannot carry its own run |

Two columns of ✅ are `test` and `typecheck`; `deploy` is skipped on every run,
correctly — it is gated on `main`.

Commits 3–9 were pushed together with 10, and `checks.yml` runs per push, so
CI has verified the TREE rather than each step of it. Every one was left green
locally — `npm test` and `sh tools/tsdiff.sh d1ac5f0` before each commit.

## Root causes, before the changes

Every brief named a symptom. Six of the nine had a cause that was not the one
the brief assumed, and two of those assumptions were factually wrong.

**1. The harness could not run.** The note carried forward said "npm returns
403 for phaser". npm returns 403 for **every** package — `npm view typescript`
fails identically, and a direct GET of `registry.npmjs.org/typescript` is 403.
jsdelivr, unpkg and cdnjs are blocked at the proxy, and github.com answers 403
for any repository outside this session's scope. The one route that works is
the session's git proxy, which serves anonymous reads of public GitHub repos —
and phaser ships its dist in-tree, so a sparse blobless clone of tag `v3.90.0`
fetches 1.2MB and no history.

**2. The loadout's hero cards sat on the title.** `card()` returns a face
container with a MIXED ANCHOR — centred horizontally, top-aligned vertically —
and `heroSection` alone offset its row by `-height / 2 + padT`, right for a
centred anchor and half a block too high for this one. Five hero cards were
drawn over the title, the subtitle and the HERO heading at every viewport. It
survived two sessions because the row's own geometry was correct; only the
anchor it was measured from was wrong.

**3. Every menu button was under 44pt on every phone.** The design box is
fitted into the viewport, so an 844×390 screen renders it at 54% and a
48-unit button is 26 CSS pixels tall. In design space it is a comfortable 48,
which is why no test could see it.

**4. The counters panned the map — and the gate was innocent.** The previous
session's predicate is present and works. `hudBlocksGesture` has always
included `layout.counters`. But GameScene built its own copy of the HUD layout
with `countersWidth: 0`, because the widths are measured from the plates and
only HudScene has them — and a zero width makes a zero-width rectangle. The
gate was asking "is this press inside the counters?" of a rectangle nothing can
be inside. **The previous session unified the predicate and not the geometry it
consults**, which is exactly why the fix held for the drawer and nothing else.

**5. Affordability was a snapshot, not a wrong check.** Every option's
`affordable` was computed once, in the array handed to the ring's constructor.
Nine places wrote `status.peanuts` directly, so there was nowhere to hang a
re-price off.

**6. Level 3's enemies — the brief's premise was wrong.** It said the four
mascots and the boss "were authored facing right". Decoded and looked at:
Pom-Pom, the Catcher, the Long Snapper, the Zamboni and the Rainbow Reaper are
all drawn facing **left**, and the seven enemies of levels 1 and 2 are all
drawn facing right. So it IS an engine flip, for the reason predicted:
`Enemy.ts` carried a bare `setFlipX(left)`, which is the statement "every enemy
is drawn facing right" — true of all seven that existed when it was written.

**7. The health tick was not the transformation.** The tick at 25% marks LAST
STAND, from each hero's own `lastStand.healthThreshold`, and Last Stand is
still live. The TRANSFORMATION is a separate rule at 0.5 in rules.json and had
**no mark at all** — so of the two thresholds, the more consequential one was
the invisible one. Both are marked now. The brief assumed one threshold; there
are two.

**8. The peanut art was never missing.** `public/assets/ui_icons/
hud_peanut_icon.webp` is a 512×512 painted peanut, exactly where it always was;
the WebP pass converted it in place. art.json simply never named it.

**9. The menus never heard about the hardware.** `fitCameraToDesign` fitted the
design box to the whole canvas. On a notched phone in landscape the title's
volume controls, the level select's BACK button and the loadout's REROLL and
BEGIN THE RUN all sat in the home-indicator band.

## What changed

**The harness.** `vendor/phaser.min.js` (3.90.0, sha256 in `vendor/README.md`,
outside `public/` so the asset budget is untouched). `shrink.py` makes a 17MB
shot readable. Three new scenarios: `screens` (walks every screen and reports
OFF / NOTCH / SMALL / OVER), `chromepan` (taps, drags and pinches every chrome
surface and reads the camera), `afford` and `enemyfacing`.

**One layout authority**, `src/systems/Layout.ts`: the design box, the fit, the
insets and `tapFloor`. It is deliberately **not** a merge of `HeroRow`,
`CutsceneLayout`, `DrawerLayout`, `RingLayout` and `ButtonRow` — those were read
for exactly that and they solve five different problems. What they each
re-derived locally is the three facts above, and that is where the bugs were.
`plateButton` applies the tap floor once, so every fitted menu gets it at once
and a desktop window keeps the sizes it was authored at.

**The HUD**: instruction bar gone (`status.message` retired; its 42 non-
instructional writes became toasts), hero name and "DAD MODE" gone, both health
thresholds marked, block pips legible, banner `WAVE 2 · +4` at 168×116 where it
was 240×150, wave names gone everywhere, real peanut art wired and
`PeanutIcon.ts` deleted.

**Cutscenes play every time.** `shouldPlay` is now the same question as "does
this level have a comic". The save field, the replay badge and the developer
reset control are gone; old saves carrying `seenCutscenes` load unchanged.

**The boss**: 9800 → 2100 health, slow-immune, reward 1800 → 900. Started from
4200 on Cory's reasoning and swept down; see below.

## Wave 1 waits for the player

A countdown creates pressure to hurry, and the one moment that should be
unhurried is a level nobody has seen before. Wave 1 has no clock now; waves 2
onward are untouched.

**One line decides it**, and the rest falls out of the zero: the tick already
returned early on a zero clock so nothing auto-starts, the bonus is already
`floor(readyCountdown) × earlyStartPeanutsPerSecond` so a zero clock pays zero,
the banner already shows the bonus so it falls through to `START WAVE 1`, and
`create` already restores the saved wave before arming, so a resume gets the
same answer. No second rule had to be written for any of them.

`firstReadySeconds` (30, twice the later gap) is retired. It was an
acknowledgement that the first wave needs longer, made in the currency of a
countdown; it needs longer than any number. `_firstWave` in rules.json says so
where the number used to be.

**Measured on a live run** — `run.sh wave1 250 844x390` sits on the opening
board for 35 seconds, longer than the clock wave 1 used to carry:

| | |
|---|---|
| on arrival | `phase=ready wave=1 countdown=0.00 banner="START WAVE 1"` |
| after 35s | `phase=ready wave=1 enemies=0` — purse unmoved |
| the press | `phase=wave`, peanuts 104 → 104, no bonus |
| wave 2 | `countdown=14.69 banner="WAVE 2 · +28"`, arrived unpressed |
| resumed at wave 0 | `countdown=0.00`, still waiting 10s later, nothing spawned |

**The soak did not move, and the reason is structural rather than lucky.**
`Sim.ts` does not model the ready phase at all — no countdown, no auto-start,
no early bonus, and zero references to `readySeconds` or
`earlyStartPeanutsPerSecond`. A simulator with no ready phase is already doing
what the game now does on wave 1, and unlimited build time buys nothing extra
because the opening purse covers one tower and no time passes there. Level 3
is 80/120 either side, level 1 45/60, level 2 10/60.

That gap cuts the other way for waves 2 onward, and it is now written into
`Sim.ts` and printed on every soak run: a player who starts each later wave
immediately banks 15 × 2 = 30 peanuts a wave, roughly 360 over a run, that the
simulated player never sees. **Every win rate this tool has ever reported is a
floor rather than an estimate.** Closing that would move every number in every
previous report, so it is recorded rather than done quietly.

## The loadout, converted; and the letterbox

**Three of the four collisions reported against this screen are `main`, not
this branch.** Rendered main's Loadout through the same harness to be certain:
the hero row over the title, the empty description panel cutting the name
labels, and the tight TOWERS label are all present at `d1ac5f0` and all fixed
here since `d53bff4`. The branch is unmerged; that is the whole difference.

**The fourth was real, and the screen had NOT been converted.** It used
`tapFloor` and `visibleDesignBox` and nothing else — the section stack was
still shares of a budget: at most 62% to the hero block, then 53/47 to the
towers and the specials. A section whose content needed more than its share did
not push the next one down, because nothing downstream was listening. It drew
past its own edge.

`stackSections` replaces that. Sections declare what they **need** and the
least they can be squeezed to; the stack reconciles them against the room and
squeezes in proportion to the slack each offered. **The headings are sections
too** — that is what stops a label being overlapped from either side.

Four measurements had to become honest before the stack could work, and three
of them were mistakes I made on the first pass:

1. `cardGeometry` is now shared by the face that *draws* a card and the
   measurer that says how tall the row must be. Two copies is how a row gets
   sized against one layout and filled with another.
2. A card's height comes from its **text**. The icon is a square of its column,
   and the column is a share of the card's width — so a 338-unit card demanded
   a 118-unit icon and therefore a 181-unit card, for eleven words.
3. Floors come from the bottom of the type ladder, and the hero block's from
   solving it at a ceiling of zero. My first pass used 86 and 150, numbers I
   picked, which squeezed cards below their own content — the exact fault
   being fixed.
4. The hero block is solved at the height it was *granted*. Measuring the floor
   at one ceiling and drawing at another split the row and blurb differently
   and cut the last line off with the panel's own edge.

A stack that still does not fit **scrolls**, with a fade so a clipped card
reads as more content. The first attempt masked the whole layer and took the
title, subtitle and both buttons off the screen — worse than the bug it fixed;
the content is its own container now.

### The green bar was mine

The Phaser clear colour was `#2f7d3f`, grass green, left from when the map was
tiles. Nothing has depended on it since the map became a painted plate — but
every pixel a camera does not paint is that colour, and the safe-area **camera
viewport** I added in `c8f4b72` exposed it. It is `#10161d` now, matching
`html`/`body` and a new `theme-color` meta tag.

The viewport inset is gone with it. It kept controls off the notch and also
stopped backdrops reaching the screen edges. The camera covers the whole canvas
again; the insets shrink **the box the design is fitted into**, centred on the
safe area. Content clears the hardware, backgrounds bleed.

### Letterbox, measured off the bar's own pixels

Sampling the whole frame does not answer this — the loadout's `#121820` panels
are indistinguishable from the `#10161d` ground at any usable tolerance. So the
probe samples only the strip outside the fitted design box.

| viewport | aspect | bar | painted |
|---|---|---|---|
| 1440x900 | 1.600:1 | **10.0%**, top and bottom | 100% |
| 844x390 | 2.164:1 | **17.9%**, down the sides | 100% |
| 1280x720 | 1.778:1 | none | — |
| 667x375 | 1.779:1 | none (same aspect) | — |

Design box is 1280x720, **1.778:1**. 100% painted on Title, WorldMap, Loadout
and Game at every size. The Cutscene is 1–5% and stays that way deliberately: a
comic panel is contain-fitted because a speech bubble in the corner of a panel
*is* the panel.

Title needed the same fix Loadout had — it covered the design box, so 62% of
its bar was bare. And `visibleDesignBox` now adds the inset span rather than
ignoring it: a backdrop sized to what the camera sees but drawn at the design
box's centre falls short on the inset side, measured at 10px of a 21px bottom
inset.

**HUD anchoring needed nothing.** HudScene is laid out 1:1 against the live
viewport through `safeAreaInsets()`, never against the letterboxed box.

## The numbers

| | before | after |
|---|---|---|
| layout faults at 844×390 | 23 | 0 (+1 named exception) |
| layout faults at 667×375 | 26 | 0 (+1) |
| layout faults at 1400×820 | — | 0 |
| with a notch (47/21/47) | 9 | 0 (+1) |
| level 3 win rate | **0/60** | **80/120 (67%)** |
| level 1 / level 2 | 45/60, 10/60 | unchanged |
| tests | 818 | **827** |

The named exception is the version stamp's hidden five-tap door, which is under
44pt deliberately and now says so in its own name.

### The boss, and why 4200 was not enough

Cory playtested it, barely dented the boss, and proposed 4200 as the starting
point — reasoning that level 2's Devil is 6,200hp on a 1,955px lane while
level 3's branches are much shorter, so a level 3 boss should sit BELOW the
level 2 boss rather than above it.

The reasoning is right and the number is not, and measuring the lane says why.
Level 3's full path is 888px of branch plus 672px of shared trunk = **1,560px**
against level 2's 1,955 — 20% shorter, not 30%. But **the boss also walks it
faster**, and that is the part the lane length alone misses:

| | The Devil (L2) | The Rainbow Reaper (L3) |
|---|---|---|
| health | 6,200 | 4,200 (the proposal) |
| path | 1,955px | 1,560px |
| speed | 26 | 30 |
| **time on the field** | **75.2s** | **52.0s — 31% less** |
| armour | 4 | 6 |
| slowable | yes | **no**, as of this session |
| tower disable | none | the best tower, 3.5s in every 8s |

Four things compound: less time, more armour, no way to buy time back with a
slow, and a rolling disable on the single most expensive tower on the board.

**At 4200 the level soaks 1/60**, with 47 of the 59 losses still on the boss
wave. That is the effect of that one change on its own, before anything else
moved: 0/60 → 1/60.

The sweep down from there, 60 seeds each, same seeds every time:

| health | 4200 | 3600 | 3000 | 2600 | 2400 | 2300 | 2200 | **2100** | 2000 |
|---|---|---|---|---|---|---|---|---|---|
| wins /60 | 1 | 1 | 7 | 18 | 27 | 32 | 34 | **38** | 42 |

**2,100 ships**, confirmed at 120 seeds: **80/120 (67%)**, which is 40/60 —
the centre of the 35–45 band. Levels 1 and 2 are unmoved at 45/60 and 10/60.

The losses spread rather than piling on the boss: w9×4, w10×6, w11×13,
w12×17. The boss wave is still the hardest single wave, which is what a boss
should be, but it is no longer a wall. The ceiling is not 120: twenty-three
runs were already lost before the boss wave, so a free boss would be 97/120.

### The reward

**1800 → 900**, and it is a cosmetic change, stated as one. Every boss is on
its level's LAST wave, so no boss payout is ever spent, and `bannerPointsFor`
takes waves reached, the clear bonus and lives remaining — never peanuts. The
number reaches the results screen and nothing else.

It still wanted fixing, because it had been left behind by the health change.
Reward per 1,000hp: the Politician 196, The Devil 194, and the Reaper **857**
— 4.4× the norm, entirely because 1800 was sized against 9,800 health. At 900
it is 429, which is as close to the norm as the payout convention allows: a
boss payout must clear ten times the best ordinary enemy (480) and three times
the dearest tower (660), and 2,100 × 0.194 is 407, below both floors. The
convention wins, because it is about a lump sum feeling like one.

That convention was also being checked on ONE boss. `Object.values(enemies)
.find(tier === 'boss')` returns whichever is first in the file — the
Politician — so two of the three were never examined, and its assertion that
"the boss has no armour by design" is false for both of them: The Devil has 4
and the Reaper has 6. The test walks all three now, and armour is asserted per
boss rather than as a rule.

## Three of the four faults the input harness first "found" were its own

Worth recording, because each looked exactly like the product bug being hunted:

* Tapping the settings gear opens a modal, and a modal correctly reports the
  whole screen as chrome — so every check after the gear passed trivially.
  Three of seven surfaces were being scored against a dialog.
* `openSettings` also calls `scene.pause('Game')`. Clearing the flag without
  resuming left GameScene receiving no pointer events at all, so the board
  control read as a swallowed gesture. `claims asked 0 time(s)` is what finally
  distinguished "the rig refused it" from "the rig never saw it".
* `chromium --screenshot` fires on the load event and paints a 17MB PNG
  progressively, so it captured the top 80% and left the rest black — which
  reads exactly like a screen cut off at the bottom, and was one edit away from
  being reported as one.

A run that trusted its first red result would have reported all three as
regressions. The rule is now in CLAUDE.md.

## What was NOT checked

* **Nothing was played by a person.** Every frame here is headless Chromium.
* **No real device.** The notch is a synthetic inset, the device ratio is
  `--force-device-scale-factor=3`, and nobody has held a phone against this.
* **Portrait at 375 wide is inferred, not reproduced.** Chromium will not open
  a window narrower than 500px in this build, so the gate was verified at a
  500×697 window with the same aspect. The gate is a CSS media query with no
  JavaScript, so the mechanism is the same — but the exact viewport was not.
* **The rotate gate has no screenshot.** It is a DOM overlay and `shot()`
  captures the canvas; it is verified by geometry and computed style.
* **The soak is a simulator, not the game.** `tools/soak/level.ts` drives
  `Sim.ts`. The slow-immunity flag is modelled in both, which is why the
  numbers mean anything, but a simulator is not a playthrough.
* **The simulator does not model the ready phase**, so every win rate it
  reports is a floor — roughly 360 peanuts a run of unbanked early-start bonus.
  Documented, not fixed; fixing it moves every historical number.
* **`run.ts` plays level 1 only.** The 350-run whole-game soak (140 won, 0
  stuck, 0 crashes, 0 console hits, 0 findings) says nothing about level 3.
* **Hero attack facing.** The pre-existing `facing` scenario reports 5 of 10
  swing frames facing away from the target — the attack pose, not the walk. Not
  this brief, not fixed, real.
* **`enemies/enemy_gnome.webp` does not decode** through `tools/img.py`, so the
  measuring tools are blind to it.

## Where this leaves the repository

**In flight:** branch `claude/phaser-vendor-layout-authority-74uaif`, 10
commits, **a clean fast-forward to `main`** (ahead 10, behind 0). This session
could not push to `main`; merging is the one remaining step.

**New, and worth a decision:**

1. **The Politician is deliberately still slowable.** He is unblockable for the
   same reason the Reaper is, so "bosses resist crowd control" generalises to
   him — but levels 1 and 2 are tuned around him as he is.
4. **The loadout is over-full on a short landscape phone.** At 667x375 the
   stack overflows by 87 design units even with every section at its floor, so
   the specials row scrolls. It is handled and it is signposted, but a menu
   that scrolls is a design smell. The levers are the three section headings
   (87 units between them), the hero blurb, and dropping the HERO label.
5. **Closing the soak's ready-phase gap** would make its win rates estimates
   rather than floors, at the cost of invalidating every number in every
   previous report. Worth doing once, deliberately, with a re-baseline.
6. **No boss payout is ever spendable**, because every boss is on its level's
   last wave. The "worth racing for" convention describes a race that cannot
   happen. Either the bosses want to arrive a wave early, or the convention is
   decoration; both are design calls.
2. **Level 2 is 10/60**, well under the 35–45 band, and nothing in this session
   touched it.
3. **Vendoring `types/phaser.d.ts`** would give this environment a real
   `tsc --noEmit` and retire `tools/tsdiff.sh` and its documented blind spots.
   Out of scope for the brief that added `vendor/`; cheap, and a real
   improvement.

**Carried forward from the previous session, still open:** the desktop
render-scale floor (`RENDER-QUALITY.md` §6); hero power balance, a first pass
and never played; `DESIGN.md` still calls Eli "The Charmer" with an active
named *Fetch*; the Ima Dummy's out-of-range tap keeps the tower selected.

**Older, still open:** no `package-lock.json`; `tools/trace_map.py` broken; the
eight ability icons that grew as WebP; lossless for the twelve low-PSNR small
sprites; `art-source/` has no README; `maps/map_level3.webp` at 1.29MB;
`AUDIT.md` and `SOAK-REPORT.md` unrevised and accurate as history.

**Closed since that report:** CANCEL's crowding at 568×320 and the cutscene's
69% width at 667×375 are both superseded — every screen is now audited at every
viewport and reports zero faults.
