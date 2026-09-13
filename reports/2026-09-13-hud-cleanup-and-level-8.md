# HUD cleanup, and the level 8 topology measured

| commit | what | CI |
|---|---|---|
| `e361efe` | PART A: both edges, the difficulty label, the guard test | *pending — see below* |
| *this commit* | This report | it adds files and edits nothing the checks read |

**PART B STEP 1 is reported here and NO LEVEL 8 DATA HAS BEEN CHANGED**, which
is what the brief asked for. STEPS 2, 3 and 4 are not done; the last section says
so plainly and says what the measurement means for them.

---

# PART A

## What the earlier HUD session actually changed

The brief asks me to read its report and say. **That session was this one** —
`reports/2026-09-13-hud-shrink-and-pad-overlap.md`, commit `e361efe`, written a
few hours earlier in the same sitting — so rather than paraphrase a stranger,
here is the diff, and then the two things this brief says its brief was missing.

It changed:

- **The top-left group** from three 44px plates in a row (~333 CSS px wide) to
  two stacked 20px readouts (48 CSS px wide). The wave counter left the group
  entirely.
- **The wave control** from 168px wide to 132, by dropping the word START rather
  than the number.
- **The message row** from full-width to 300px centred — it holds only the boss
  bar, for one wave in thirteen.
- **The camera**, which is the part that mattered: `centerRange` pinned the view
  to the world's centre whenever the view covered the world on an axis, and
  `boundsMarginPx` was 0, so at cover zoom the camera could not move and a pad
  at a plate edge was **unreachable** rather than awkward.
- **It removed the difficulty label** — which is A2 below, and it was in scope
  for that pass because the two arrived together.

**It did NOT fix only the top edge.** This brief's A1 anticipates that, and it is
worth being precise about why it did not happen: the fix is a **camera bounds
margin**, and a bounds margin is symmetric by construction. `hudBandHeight`
returns `max(topEdge, viewHeight - bottomEdge)` — the **taller** of the two bands
— so the slack covers whichever edge is in the way.

## A1 — the bottom edge

**Confirmed present before the fix, and confirmed fixed, from rendered frames.**
`tools/harness/run.sh padhud` reports per element, and the bottom-edge elements
are named in the "before" column on every level that had them:

| viewport | bottom-edge collisions before | after the shrink | pads that cannot be freed, after |
|---|---|---|---|
| 667x375 | `abilities` × 8, `heroChip` × 2, `cancel` × 1 | 7 | **0** |
| 844x390 | `abilities` × 9, `heroChip` × 2 | 8 | **0** |
| 1280x720 | `abilities` × 3, `heroChip` × 2 | 3 | **0** |

The brief's description matches what the frames show: pad discs visible behind
the ability medallions, at the bottom, on most levels.

**Which cause it was — the same one as the top, and the brief's four candidates
resolve like this:**

1. *the map viewport is not inset above and below the HUD* — true, and
   deliberate;
2. *the HUD scene draws over the full canvas with no reserved band* — true, same
   decision, and the header of `HudLayout.ts` records that reserved bands were
   **tried and reverted** because "on a 390px-tall phone the two strips ate a
   third of the screen";
3. *pads sit near the plate edges* — true on most levels;
4. **the camera zoom floor lets the plate fill the entire screen** — **this is
   the one.**

The mechanism, exactly: the run opens at **cover** zoom, which on a 16:9 plate in
a 16:9 window covers the world on both axes, so
`centerRange`'s `if (half * 2 >= worldSize)` branch returned a zero-width range
and the camera was **pinned**. Combined with `boundsMarginPx: 0` there was no
slack at either edge. It is one cause with two symptoms, not two special cases,
and the fix is one number handed to the rig.

**What remains: at-rest overlap, which is irreducible.** The board exactly fills
the screen at cover zoom and the two bands come to ~100 CSS px of a 390px phone.
Zero at rest needs either a letterboxed map (tried, reverted) or a map that does
not fill the screen. Every affected pad can now be panned clear, which is the
property that decides buildability.

## A2 — the stale difficulty label

**Removed from the game screen entirely.** It printed the mode name —
`YEAH, I GAME` — in dim 15px text at the left end of the second row, over the
map, for the whole run. `HudScene.drawDifficulty`, its `difficultyLabel` field
and the `difficultyName` import are all gone.

It is still shown in the two places it belongs: the **level select screen**,
where it is chosen (`presentation.difficultyChip`), and the **results dialog**,
where the run is being scored.

`tests/difficulty.test.ts` asserted the opposite — `assert.match(hud,
/difficultyName\(s\.difficultyId\)/, 'the HUD does not show the difficulty')` —
and now asserts its absence, keeping the half of that pair that would be a real
bug: whatever does show it must read the **run**, never the save.

### Other stale HUD text of the same kind

**There is none left.** Every remaining `this.add.text` in `HudScene` was
checked:

| what | verdict |
|---|---|
| `bossLabel` | the boss's name, during a boss wave only — transient |
| the readout numbers | live values |
| ability cooldown timers | live values |
| `toast` | a refusal, 1.5s then gone |
| `floatUp` | a `+N` peanut float, 700ms |
| `chipLabel` | the hero's revive countdown, only while he is down |

The two earlier removals this is the third of — the hero's name and the DAD MODE
badge — left nothing else of that shape behind.

## A3 — the guard

`tests/hudpads.test.ts` is new. It did not exist before this pass, so there was
nothing to check for vacuity — but **the one I wrote was vacuous twice**, and
both reasons are now comments in it:

1. **`buildSpots` are `[x, y]` pairs, not `{x, y}`.** Reading `.y` off one gives
   `undefined`, which compares false against every bound and passes. Caught by
   mutating `hudBandHeight` to `return 0` and watching the test stay green.
2. **The band is screen pixels where `centerRange` wants world units** — 82
   screen px is 157 world units at 667x375.

It covers **both edges** (the HUD rect list includes `abilities`, `heroChip` and
`cancel`), six viewports, with and without a notch, on every registered level.
Four mutations produce the failure they should.

---

# PART B — STEP 1, measured. No data changed.

## Does `tools/level8_geometry.json` exist?

**Yes.** It is in the repository, alongside `tools/trace_level8.py`,
`tools/check_level8.py`, `tools/find_level8_gate.py` and
`tools/build_level8_map.py`. The brief's contingency does not apply.

## The three openings, against the plate

`python3 tools/check_level8.py` re-measures `map_level8.webp` at 1280x720,
area-averaged:

```
3 opening(s): east 517-571, south 995-1152, west 91-140
west   centre y= 115.5 = 16.0% of the frame
east   centre y= 544.0 = 75.6% of the frame
south  centre x=1073.5 = 83.9% of the frame
```

**Three openings confirmed — and the brief's percentages are off, predictably.**

| | the brief (off a 2576x1186 gameplay screenshot) | the plate |
|---|---|---|
| LEFT | 4–13% of height | **12.6–19.4%**, centre 16.0% |
| RIGHT | 76–86% of height | **71.8–79.3%**, centre 75.6% |
| BOTTOM | 71–78% of width | **77.7–90.0%**, centre 83.9% |

A 2576x1186 viewport is 2.17:1 against the plate's 1.78:1, so the visible world
is cropped vertically and percentages do not transfer between the two. The
checker's own reference column — taken from the level 8 brief that built it —
reads 16%, 75%, 85%, which is the plate. **The openings are where they always
were; the screenshot's percentages are the thing that moved.**

## The beam

`level8.json`'s gate line runs **(943.41, 391.85) → (965.09, 451.06)**, which is
x 73.7–75.4% and y 54.4–62.6% of the frame. The brief says 73–76% of width and
51–67% of height. **That one matches.**

## What the waypoint data actually describes

| lane | length | from | to | |
|---|---|---|---|---|
| `shared` | 1342 px | **(-60, 116)** — the WEST opening | (1072, 356) | splits |
| `east` | 437 px | (1072, 356) | **(1340, 550)** — the EAST opening | EXIT |
| `south` | 2304 px | (1072, 356) | **(1076, 779)** — the BOTTOM opening | EXIT |

So the shipped topology is **ONE entrance and TWO exits**: in at the west, split
at (1072, 356), out at either the east edge or the bottom. `mainMerge` gives both
arms weight 1, so the split is even.

**Does the polyline intersect the gate's trigger volume?** **Yes — on one arm.**
`performanceReview.crossings` is a single entry: lane `south`, distance 142.68,
at (954.74, 422.78). The `east` arm never goes near it.

## Was the hypothesis right?

**No. The dead-segment hypothesis is REFUTED — but there is a real defect next to
it, and it is worse than it looks.**

The hypothesis was "the active lane runs LEFT to RIGHT and never crosses the
gate, so the gate sits on road no enemy walks". The topological half of the
brief's observation is **correct**: the left opening and the right opening are on
the same side of the beam, and the bottom opening is on the far side of it. But
the conclusion does not follow, because **the bottom arm is walked** — about half
of everything spawned is routed down it.

Measured rather than reasoned, over 120 seeds on normal:

```
performance reviews: 779 enemies buffed (6.5 a run)
```

and over 40 seeds, against the total:

```
per run: kills 233.4  leaks 5.7  total enemies ~239.0  reviewed 6.1  = 2.6%
```

**The gate fires. It fires for 2.6% of the enemies in a run.** Two things make
that number, and neither is "no enemy walks there":

1. **Half of them never go that way at all.** The split is even and the gate is
   on one arm, so the ceiling is 50% before anything else happens.
2. **Almost none of the other half live to reach it.** The crossing is 1,485 px
   into a 3,646 px route, past most of a 19-pad board, and 97.6% of everything
   spawned dies somewhere.

So the level ships a mechanic that touches one enemy in forty. The brief's
instinct — that the Performance Review is not doing its job — is **right**; its
stated reason is not.

---

## Where this leaves the repository

**DONE:** PART A, whole. Both edges, at one root cause; the difficulty label gone
and nothing else of its kind left; a guard test that covers both edges, six
viewports, notched and not, on every level, and that has been shown to fail.

**DONE:** PART B **STEP 1**, whole, with no data changed — which is what it asked
for.

**NOT DONE, and not started: PART B STEPS 2, 3 and 4.** I am saying so plainly
rather than half-doing them. What that work is, and what STEP 1 means for it:

1. **STEP 2, the re-topology, is feasible and STEP 2's own escape hatch does not
   trigger.** Making the east opening an entrance and the bottom the sole exit
   routes those enemies through (1072, 356) and down the south arm, which is
   where the crossing already is — so the right-edge lane's route to the exit
   *does* naturally cross the gate, and the brief's "report that instead and
   stop" condition is not met. It needs the tracer re-run rather than hand-edited
   coordinates, the 19 pads re-checked against the new road, and the 14 waves
   split across two entrances.
2. **STEP 3(a) already has its answer's shape.** Even after the re-topology,
   "all of them" will only hold if the gate ends up on shared road rather than
   on one of two arms — with two entrances converging before the beam, it will.
   The number to re-measure is the same one above: `reviewed` against
   `kills + leaks`.
3. **STEP 3(b), the buff sensitivity table, is untouched.** The brief is right to
   insist on it: the HR armour aura on this same level measured as doing nothing,
   and at 2.6% coverage this buff cannot currently be moving anything either —
   a flat table today would prove nothing about the buff, only about the routing.
   **Run it after STEP 2, not before.**
4. **STEP 4's re-soak is void until STEP 2 lands.** Level 8's published 40% at
   120 seeds is measured above and is still the shipped number; it stops being
   true the moment the topology changes.
5. **The two unwired assets** — the 2176x610 scan sheet (8 frames of 272x610) and
   the 703x1172 **portrait** buff marker — are still unwired. The portrait one is
   the trap the brief names, and `measure_art.py`'s INK output is what should set
   its content box.

**Nothing in this report changed a byte of level 8.**
