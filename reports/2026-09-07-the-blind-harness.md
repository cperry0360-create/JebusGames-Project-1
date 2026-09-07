# Level 2's Devil, and eleven harness scenarios that were reporting success while running nothing

Two commits on `main`.

| commit | what it is | CI |
|---|---|---|
| `862ecf7` | Level 2's Devil comes down to 5200 | **green**, covered by run 159 (pushed with `39cca69`) |
| `39cca69` | Eleven blind harness scenarios, and the guard that let them stay blind | **green** — [run 159](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34114997057) |
| `REPORT_SHA` | This report | **CI_REP** |

Tests **947 → 951**, all passing. `sh tools/tsdiff.sh 9172418`: 206 against a 205
baseline, the one difference being the known `Cannot find module 'phaser'` for
`src/ui/CakeRow.ts`.

---

## COMMIT 1 — level 2's Devil, 6200 → 5200

Approved from the sensitivity table in
`reports/2026-09-07-balance-verification-and-level-2.md`. One number in
`src/data/enemies.json`.

### Level 2, 480 seeds, normal

**192/480 — 40%**, against 106/480 — 22% at 6200. The middle of the 35–45% band,
and exactly the figure the recommendation was made on.

### Levels 1, 3 and 4, 120 seeds, same seeds

| level | expected | measured | |
|---|---|---|---|
| level 1 | 95/120 | **95/120 (79%)** | unchanged |
| level 3 | 90/120 | **90/120 (75%)** | unchanged |
| level 4 | *63/120* | **54/120 (45%)** | **the brief's expectation is stale, see below** |

Levels 1 and 3 are untouched to the run, which is a property of the change rather
than luck: `theDevil` is named in exactly two places in the repository and both are
in `waves.level2.json`.

**Level 4 reads 45%, not 63/120, and that is correct.** 63 was its win rate with the
Lich King at 1200. He went to 1500 (with the finale to 2250) in `7ae13d4`, which is
already on `main` and which measured 54/120 at 120 seeds and 44% at 480 in the
report that landed it. **A 63 here would have meant that change had been lost.**

### Where level 2 is decided, before and after

| | losses | on wave 13 | share | elsewhere |
|---|---|---|---|---|
| 6200 (before), 480 seeds | 374 | 367 | 98.1% | w5×1 w6×4 w7×1 w9×1 |
| **5200 (now), 480 seeds** | **288** | **281** | **97.5%** | w5×1 w6×4 w7×1 w9×1 |

**The failure has not moved anywhere more interesting, and the brief asked, so here
it is plainly.** The seven pre-boss losses are the same seven. Every win is still a
flawless 20 of 20 lives — minimum and maximum both 20, exactly as before. Eighty-six
runs changed hands and every one of them changed hands at the Devil.

Level 2 is still twelve free waves and one boss check. It is now a check that 40% of
boards pass instead of 22%. **Giving level 2 an actual difficulty curve is a
wave-table job, not a boss-health one**, and nothing in this commit attempts it.

### Two tests had to be argued with

Which is exactly what they are for, so both are recorded rather than quietly
re-synced.

- `tests/demons.test.ts` repeats the three demons' handover spec so a stray edit
  cannot pass silently. It now carries 5200 and a note saying which number moved,
  why, and that everything else about him is untouched.
- `tests/levels.test.ts` pins the demons' health so the level 1 → level 2 step is
  reached through wave **counts** rather than by buffing an enemy. The Devil moved
  for the opposite reason — he was carrying the level alone — and the 15–20% step
  assertion still passes on its own terms at **15.4%**.

---

## COMMIT 2 — the blind harness

### The real count is eleven, and the list was wrong

The brief asked for the count to be established first. **Eleven**, not the seven or
eight it was filed as, and the list itself was wrong in both directions.

| named in the status file | actually blind? |
|---|---|
| `ui` | **yes** — threw |
| `rockets` | **yes** — threw |
| `regressions` | **yes** — threw |
| `poor` | **yes** — threw |
| `typegame` | **yes** — threw |
| `buildall` | **yes**, but differently — see below |
| `muzzle` | no — genuinely working, left alone |
| `retreat` | no — genuinely working, left alone |

| not on the list, blind anyway |
|---|
| `fx`, `icons`, `phone`, `stun` — all threw on a `g.menu` / `g.panel` line |
| `full13` — threw on `g.layout.heroRow`, **the only scenario that plays a run end to end** |

Established by **running** each one and reading its exit code, its log, and how many
lines it managed before dying — not by grepping for a dead symbol. A static sweep
was used to find candidates and it was wrong on its own: it flagged `towerring` for
`sellTowerForProbe`, which sits inside a `? 0 : 0` no-op and cannot throw.

**`towerring` first looked broken and is not.** It timed out at 120s, produced no
report, and still exited 0. Its own header says the 48 ring states "take a couple of
minutes"; at 300s it completes and reports. That is the second time this session a
first red result was the measurement rather than the thing measured, and it is why
CLAUDE.md says not to trust one.

### How they were proved to be theatre

The proof is the same shape for all of them, and this is `poor` before the repair:

```
$ sh tools/harness/run.sh poor 90 844x390 ; echo $?
0
```

with, in the report it posted:

```
DIRECTOR ERROR: Cannot read properties of undefined (reading 'hitAreas')
scenario_lines=0   lines_after_throw=0   RESULT=NO
```

Zero lines of its own before the throw, zero after, no RESULT, exit **0**.

`buildall` is the interesting variant. It never threw — `g.menu?.isOpen` is
optional-chained — so it ran to the end, printed `MENU DID NOT OPEN` fifteen times,
concluded `total 0 of 15 pads built`, and exited 0. **Its own output said everything
had failed and nothing was reading it.**

### The cause was one line

```js
try { await run() } catch (e) { note('DIRECTOR ERROR: ' + e.message + ' | ' + …) }
```

The throw became a log entry, `/done` was posted as though the run had finished, and
`run.sh` ended on an unconditional `exit 0`. Three links, all now closed:

| link | before | now |
|---|---|---|
| `index.html` | catches, notes, discards | records `directorError` on the report |
| `server.py` | prints TIMEOUT, exits 0 | **1** throw · **2** timeout · **3** unreadable report · **4** boot failed |
| `run.sh` | `exit 0` | `STATUS=$?` … `exit $STATUS` |

Proved both ways at the time it was added:

```
poor  (known broken) -> exit 1
title (known good)   -> exit 0
```

**And a second guard**, because the first only catches a scenario that never ran. A
scenario that *did* run and did not like what it saw was also exiting 0. The fault
convention was already in the scenarios and was only ever printed — a fault is a line
beginning `*** ` and a bad run ends on `RESULT *** n faults ***` — so `server.py`
reads it and exits **5**. A distinct code on purpose: **1 means "this check is
broken", 5 means "this check works and the product failed it".**

`tests/harness.test.ts` (new, 4 tests) asserts all three links of the throw guard,
the fault guard, that no scenario drives `g.menu` or `g.panel` again, and that the two
deleted scenarios stay deleted with their reasons intact.

### What was done to each

| scenario | outcome | what changed |
|---|---|---|
| `ui` | repaired | builds through the ring; `heroIsSelected` for the private `heroSelected`; `alert` for the renamed `message`; closes the tower ring before the hero half; asserts four claims instead of printing six |
| `buildall` | repaired | drives `build()`; asserts **all** pads take a tower, which is the only useful answer to the question it asks |
| `stun` | repaired | builds through the ring, and `applyStun` **gained a third argument while this was blind** — diminishing returns arrived after it stopped running, so the scenario now exercises them |
| `rockets` | repaired | builds through the ring; projectile art check restored |
| `fx` | repaired | builds through the ring; effect-sheet check restored |
| `phone` | repaired | reads the ring's `hitBoxes` instead of the menu's |
| `typegame` | repaired | `openSettings()` / `settings` for the deleted `openPause()` / `resumeGame()` |
| `regressions` | repaired | `scene('Hud').layout.heroChip` for `g.layout.heroRow`; its stale scrim section removed (below) |
| `full13` | repaired | `L.heroChip` for `L.heroRow` |
| `poor` | **deleted** | no coverage lost |
| `icons` | **deleted** | coverage lost, named below |

**`poor` — no coverage lost.** It had rotted three ways: it set `g.status.gold`,
which is not the currency and never has been in this repository; it read
`g.status.message`, which is `alert`; and it drove `g.menu`. `afford` is its
successor and is strictly better — it opens the real ring at 0 peanuts, asserts
nothing is affordable, funds the player **with the panel still open**, and asserts it
re-prices in both directions. Verified passing.

**`icons` — coverage lost, stated so it can be decided on.** Its subject was the
**tower panel**, the control `g.panel` pointed at, and that control no longer exists.
`towerring` is the successor and covers the ring's geometry far better — every tower,
every tier, both branches, and the claim that no SELL rectangle ever lands where an
UPGRADE one has been, plus the identity and shape of the sell icon. It does **not**
cover these three, which `icons` did:

1. the minimum drawn size of an icon on the control;
2. "no button carries a word";
3. "the price sits **below** the plate, not on it".

Whether those still matter on a radial control is a design question, which is why
they are written down rather than guessed at. **They are unguarded today.**

**One section of `regressions` was deleted rather than repaired.** Its modal-scrim
check measured raw corner luminance and called a spread over 25 a failure. That could
never have held: `scrim` reports the bare map's own corners at 63/59/39/65 — a spread
of 26 with no scrim in the picture at all. It was reporting
`*** THE SCRIM DOES NOT REACH THEM ALL ***` against a scrim that reaches all of them,
and had been from the day it was written. `scrim` asks it properly — the **ratio**
each corner keeps against its own bare-map baseline, 0.539/0.540/0.538/0.543 for a
dialog, a spread of 0.005 — and is the one `tests/scrim.test.ts` cites.

### Then they were run. Two findings.

**Listed, not fixed, per the brief.**

#### 1. On a phone, one of level 1's seven build pads will not open its ring

```
buildall @ 844x390:
  pad 3 world 578,612 inView=true screen 381,318 ringOnTap=false bought=false
  total 6 of 7 pads built
  RESULT *** only 6 of 7 pads could be built on ***

buildall @ 1400x708:
  pad 3 world 578,612 inView=true screen 632,590 ringOnTap=true  bought=true
  total 7 of 7 pads built
```

**Viewport dependent — it works on a desktop window and fails on a phone.** The pad is
reported in view, the tap lands at 381,318 inside an 844×390 canvas, and no ring
opens. No alert is raised, so the player gets silence.

Reproduced independently by `full13`, which is where the cost shows: the spend loop
stops at pad 3, the board is capped at **three towers from wave 4 onward**, and the
run is lost on wave 13 having never been able to build.

```
full13 @ 844x390:  build@3: the ring did not open   (x10)
  wave  4 .. 12   towers 3   lives 20
  wave 13         lives 10, phase=lost
```

`full13` still ends on `RESULT a full run, lost, with nothing out of place` — its
fault criteria are about positions and overlaps, not about whether the board could be
built. That is its remit and I have not widened it, but it is worth knowing that its
green is narrower than it sounds.

#### 2. A tap on the hero does not select him

```
before the tap: ringActive=false  heroHits=true  padUnderHero=none
                tapAt=422,193  phase=ready  heroDown=false
tap on the hero: selected=false  alert=""
  | selectHero() called directly: selected=true
```

Every reason the tap could legitimately be refused was read out first: no ring is
open, no pad is under him, `hero.hits()` is true at the tapped point, the phase is
`ready` and he is not down. **`selectHero()` works when called directly** — it selects
him, raises `Cory selected — click where to hold.`, and the following ground tap then
moves his rally from 640,360 to 579,398. So **the pointer route is what is broken,
not the selection.**

This one cost three rounds to state honestly, and all three are worth recording
because each looked exactly like the product bug being hunted:

- the camera was parked on pad 4 and the hero was off screen, so the tap left the
  canvas — the same trap `build()` documents for pads;
- with that fixed, the tower ring from the previous step was still open, and
  GameScene's handler begins `if (this.ring?.active) { clearSelection(); return }`,
  so the tap was correctly spent dismissing it;
- only with both ruled out does the finding stand.

### `N passing` means something different now

**Before this commit**, `sh tools/harness/run.sh <anything>` returned 0 whether the
scenario asserted its case, found a fault, threw on its first line, or never finished
at all. Eleven of them were in the last two states. A green harness was evidence that
Chromium had started.

**After it**, a run returns 0 only when the scenario reached its end without throwing
**and** wrote no fault line. `ui` and `buildall` now return 5 — they are the two that
found something real.

The test suite went **947 → 951**. The four new tests do not test the game; they test
that the harness can still fail. That is the smaller half of the change. The larger
half is not in the count at all: **nine scenarios that were running none of their
assertions are running all of them again**, and that does not move `npm test` by a
single number.

---

## What was NOT checked

- **The fault guard has not been run against the other ~90 scenarios.** It changes
  what every one of them returns, and only the thirteen touched here were run under
  it. Any scenario that has been printing a `*** ` line will now exit 5. **That blast
  radius is unmeasured** and a full sweep is the obvious next job.
- **The two findings were not diagnosed past the point of attribution.** Pad 3 was
  established as viewport-dependent at two viewports (844x390 fails, 1400x708 works);
  667x375 was not tried, and the cause in `BuildSpots`/`spotAt` was not looked for.
  The hero tap was narrowed to "the route, not the selection" and no further.
- **The repaired scenarios were run at 844x390 only**, except `buildall` which was
  also run at 1400x708. Several of them are layout-sensitive.
- **No frames were read as pictures**, only logs and numbers. Several of these
  scenarios take screenshots whose whole point is to be looked at.
- **`muzzle` and `retreat` were cleared by a single run each.** They do not throw and
  they emit their own notes; I did not audit whether every claim inside them still
  describes live behaviour.

---

## Where this leaves the repository

**New, from this session:**

1. **Pad 3 on level 1 will not build at 844x390.** Finding 1 above. On a phone this
   is a seventh of the board.
2. **A tap on the hero does not select him.** Finding 2 above.
3. **The fault guard's blast radius across the other ~90 scenarios is unknown.**
4. **`icons`' three claims are unguarded** — icon minimum size, no words on buttons,
   price below the plate.

**Carried forward, unchanged by this session:**

5. Cake tiers are probably too generous.
6. The verdict line and the 2-cake tier disagree at exactly half (`>` against `>=`).
7. Dialog buttons fall to about 24 CSS px when a panel scales to fit a phone.
8. World map node cakes are 24–25 CSS px on a phone, not 32.
9. Courtland's ability names disagree with his icons.
10. `fx_mind_control` has art and no mechanic.
11. Nine canvas-vs-ink content boxes.
12. The hero's two ability medallions go dead after the Server Nuke drops. **Item 2
    above may be related — both are the hero's own controls losing their input
    route — and if anyone looks at one it is worth looking at the other.**

**Closed by this session:** the item that had been top of that list since it was
written — "seven harness scenarios still drive the deleted build menu". It was
eleven, and they run again.
