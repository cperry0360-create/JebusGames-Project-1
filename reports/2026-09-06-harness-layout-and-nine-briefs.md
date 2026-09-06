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
| 11 | this report | — | not recorded: a report cannot carry its own run |

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

**The boss**: 9800 → 2000 health and slow-immune. Swept, not guessed.

## The numbers

| | before | after |
|---|---|---|
| layout faults at 844×390 | 23 | 0 (+1 named exception) |
| layout faults at 667×375 | 26 | 0 (+1) |
| layout faults at 1400×820 | — | 0 |
| with a notch (47/21/47) | 9 | 0 (+1) |
| level 3 win rate | **0/60** | **86/120 (72%)** |
| level 1 / level 2 | 45/60, 10/60 | unchanged |
| tests | 818 | **822** |

The named exception is the version stamp's hidden five-tap door, which is under
44pt deliberately and now says so in its own name.

Boss health sweep, 60 seeds each: 9800→0, 6000→0, 4500→0, 3500→1, 2500→23,
2200→34, **2000→42**, 1800→45. Between 2,500 and 1,800 — a 28% change in one
number — the level goes from 38% to 75%. That cliff is worth knowing about.
The ceiling is not 60: twelve runs in sixty were already lost before the boss
wave, so a free boss would still only be 48/60.

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

1. **`unicornBoss.peanutReward` is still 1800** against a boss that now has
   2000 health. It is the final wave and nothing is spent after it, so it
   measures as nothing — but it is a strange-looking number now.
2. **The Politician is deliberately still slowable.** He is unblockable for the
   same reason the Reaper is, so "bosses resist crowd control" generalises to
   him — but levels 1 and 2 are tuned around him as he is.
3. **Level 2 is 10/60**, well under the 35–45 band, and nothing in this session
   touched it.
4. **Vendoring `types/phaser.d.ts`** would give this environment a real
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
