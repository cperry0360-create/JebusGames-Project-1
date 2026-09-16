# The Ima Dummy Tower is guaranteed in every opening hand

| commit | what | CI |
|---|---|---|
| `9a9702c` | `guaranteedTowers` in draft.json, `draftOpeningTowers`, the cap arithmetic, the two GameScene call sites, the loadout screen's per-row card widths, the deployer's card text, the soak's uniform-hand path, 7 new tests, the `guaranteed` harness scenario | [run 415](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/35091621374) green |
| `05cb66e` | The first re-soak and its report — **measured against `fe6ec82` and replaced**; see the merge | run 415 green |
| `cb9fadf` | Merge `main`: level 9's retune, the flank repaint and Lazy Dad Mode | run 415 green |
| `cd095ca` | The re-soak on the merged tree, this report, `SOAK-REPORT.md`, `CLAUDE.md`, `claude/context.md` | run 415 green |
| *this commit* | Closing this table on run 415 | it edits this table and nothing else |

All four were pushed together, so only the head got a run of its own; **run 415
checked the tree containing all four.** Green on `changes`, `typecheck`, `test`,
`deploy / build` and `deploy / deploy` — **five jobs, and the deploy RAN rather
than skipping**, because the push touched `src/`. So the live site carries the
guarantee. Read the job list, not the run's conclusion.

[Run 417](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/35091887587)
on the docs commit above it is green on `changes`, `typecheck` and `test` with
**`deploy` SKIPPED**, which is the `changes` gate working as designed on a commit
that touches only `reports/` — a documentation commit behaving correctly, not a
failed deploy.

**`main`'s tree was read back afterwards** and carries `guaranteedTowers:
["imaDummy"]` in `src/data/draft.json`, `guaranteedOpeners` and
`openingTowerCount` in `src/systems/Draft.ts`, the `guaranteed` scenario in
`tools/harness/index.html`, and this report — with **zero** occurrences of
`"imaDummy": 4` left in `src/data/levels.json`.

**`main` moved while this was being measured** — `fe6ec82` → `f3d597d`, which
retuned level 9's boss, repainted its flank and added five Lazy Dad knobs, and
changed `tools/soak/Sim.ts`. Every figure in this report was therefore
re-measured on the merged tree. The first re-soak's numbers are in `05cb66e`'s
history and should not be quoted; the only one that moved is level 9's.

**Answers first.**

- **Which levels left the 35–45% band, and by how much.** **Five levels were
  inside it and none is now.** All five fell below: **6 by 17.7 points, 7 by 7.3,
  8 by 4.6, 9 by 10.2 and 10 by 10.6.** The other five were already above it and
  four moved further out — **1 is +39.4 above, 3 +42.9, 4 +23.3 and 5 +26.5**,
  level 5 having climbed 26.1 points from the top edge to 71.5%.
- **What happened to level 2.** It went the *other* way and is now the closest
  level in the game to the band: **255/480 → 218/480, 53.1% → 45.4%**, 0.4 points
  above the top edge. The brief's premise that it "currently soaks at 21%, well
  below band" is a **stale 120-seed figure** from an earlier era of
  `SOAK-REPORT.md`; the published and re-measured figure is 53%, which is *above*
  the band. The Devil at wave 13 is still what kills it — **245 of 262 losses,
  94%**, against 213 of 225 before — so the extra tower cost the Devil nothing and
  cost the board that has to reach him.
- **Can the hand come out with no AOE.** Yes, at exactly the rate it always could:
  **1197 of 3000 seeds, unchanged**, because the repair rule ignores the
  guaranteed tower. Had it counted the dummy as the hand's answer — the dummy is
  archetype `control`, which *is* an answer archetype — that would have been
  **1872 of 3000**, and **1127 of 3000** hands would have kept a drawn pair with
  neither AOE nor control.
- **The premise "every level gets easier" is wrong, measured.** Seven of ten got
  *harder*, and **it is the guarantee rather than the pool entry that does it**:
  putting the tower in the shared pool without guaranteeing it leaves the same
  five levels in band and is worth +43 runs over 4800.

---

## What was actually wrong

Confirmed against the tree before anything changed.

`src/data/draft.json`'s shared `towerWeights` held six towers and **`imaDummy`
was not one of them**. Its only appearance anywhere was `level1`'s
`extraTowerWeights: { imaDummy: 4 }` in `levels.json`. `towerWeightsFor(id,
shared)` spreads a level's extras over the shared pool, and both
`LoadoutScene.deal` and `tools/soak/Sim.ts` build the draft pool by filtering
`TOWERS` to ids that have a weight — so on levels 2 through 10 the tower was
**not in the pool at all**. Not rare: absent. No reroll could produce it.

The fence's reason is in the comments it left behind, in three places
(`LoadoutScene.deal`, `Sim.ts`, `levels.json._towers`): levels 2 and 3 were to
draw exactly what they had been tuned against. That was right when 2 and 3 were
the frontier. There are ten levels now.

Even on level 1 it was close to a coin flip: weight 4 of 25, two cards drawn.

## Which implementation, and why

**A third opening slot, expressed as `guaranteedTowers` in `draft.json` and
honoured inside `draftOpeningTowers`.** Not `towersAtStart: 3`.

The two are the same outcome for the *count* and not for the *draft*. With
`towersAtStart: 3` and the dummy guaranteed as one of the three, every run opens
with the dummy plus **exactly one other tower of six** — the draft stops being a
draft, which is the thing the brief named and it is right. As a separate slot the
drawn pair is untouched, and that is testable rather than asserted:

> `the guarantee is an extra slot: the drawn pair is what it always was` —
> over 2000 seeds the two drawn cards are identical, card for card and in the
> same order, to what the six-tower draft dealt on the same seed.

The guarantee is cut out of the pool *before* the draw (`drawable = pool.filter(w
=> !guaranteed.includes(w))`), which is what makes that property hold: the
weighted draw sees the same six towers and the same rng it always did.

It sits in the same function as the two repair rules, as the brief asked. It is
the same shape of rule — a statement about what a hand must contain — and putting
it in the caller is exactly what would have let the reroll path lose it. There is
a test for that path specifically, and the harness presses the button.

**No system module names the id.** `guaranteedOpeners(pool, rules)` resolves the
data against whatever pool it is handed, so a second guaranteed tower is one line
in `draft.json`. A guaranteed id a pool does not hold is skipped rather than
invented, and a test holds that every id in the list is in the shared pool, so
the skip is a net rather than the normal path.

## The answer-archetype finding

**It happens, and it is the largest single consequence in this change.**

`imaDummy`'s archetype is `control`. `draft.json`'s `answerArchetypes` is
`["aoe", "control"]`. So a repair rule that looks at the whole hand finds an
answer on **every hand ever dealt**, the `!hand.some(isAnswer)` branch never fires
again, and two single-target towers go through with nothing behind them.

Measured over 3000 seeds, three ways:

| rule | hands with no AOE | drawn pairs with neither AOE nor control |
|---|---|---|
| judged on the whole hand (naive) | 1872 / 3000 | 1127 / 3000 |
| judged on the drawn pair (shipped) | 1197 / 3000 | 0 / 3000 |
| the old six-tower, two-card draft | 1197 / 3000 | 0 / 3000 |

So the coverage rule judges the **drawn pair alone**, and the shipped rate is the
rate the game always had. Note the third column's last two rows against the
first: without this, a third of all hands would have been let through with the
draft's own guarantee unmet.

A hand can still come out with no AOE, because the guarantee has always been
"AOE **or** control" and the Bramble is control. That is unchanged, and it is not
a regression — the rate is identical to `main`'s.

`tests/draft.test.ts` holds both halves: `the DRAWN half of the hand covers
damage and an answer by itself`, and the unchanged
`the opening hand always covers a damage option and an answer`.

## `unlockedTypeCap`, and the unlock it would have eaten

**It would have cost the player the wave-8 unlock, silently, so the cap now
governs the drawn types and guaranteed slots sit outside it.**

`unlockedTypeCap` is 4 and `unlockAfterWave` is `[4, 8]`. Counting the guaranteed
tower against the cap:

```
wave 0:  min(2 + 0, 4) = 2 ... plus the dummy = 3
wave 4:  min(2 + 1, 4) = 3 ... plus the dummy = 4   <- hits the cap here
wave 8:  min(2 + 2, 4) = 4 ... clamped to 4         <- the 5th never arrives
```

A change whose whole purpose is to hand the player a tower would have taken one
away eight waves later. `unlockedTowerCount` adds the guaranteed count *after*
the clamp instead, so the drawn schedule is bit-for-bit what it was (2 → 3 → 4
drawn types) and a run ends with 5 types of 7 rather than 4.

`tests/draft.test.ts`'s `the guaranteed tower does not cost the player a later
unlock` asserts that against a `guaranteedTowers: []` control at every unlock
wave, so it is a statement about the *drawn* schedule rather than about two
numbers that happen to match today.

## The other consequences, each checked

- **`extraTowerWeights` removed from level 1.** Left in place it would
  double-count: `towerWeightsFor` spreads the level's extras *over* the shared
  pool, so the level's 4 would have silently overridden the shared 4 — the same
  number today and a trap the moment either moves. Nothing else reads the field:
  `Levels.ts` declares it, `towerWeightsFor` is its only consumer, and
  `tests/draft.test.ts` still walks every level's extras so the mechanism stays
  covered for a future level-scoped tower. `tests/blocking.test.ts` asserted the
  old value and now asserts that **no** level carries an `imaDummy` weight of its
  own. The `_towers` note in `levels.json` was rewritten; it described the fence
  as correct.
- **`reserveTowers` never offers it again.** It already filtered the opening hand
  out of the pool, so this needed no change — but nothing tested it, and now
  `the guaranteed tower is never offered again as a mid-run unlock` does, over
  1000 seeds.
- **Two `GameScene` call sites were slicing to `towersAtStart`.**
  `status.unlockedTowers = run.openingTowers.slice(0, DRAFT.towersAtStart)` would
  have dealt the dummy on the loadout screen and thrown it away on the way into
  the run. And `grantTowerUnlocks` indexed the reserve at
  `unlockedTowers.length - DRAFT.towersAtStart`, which would have re-granted a
  tower the run already had and never reached the reserve's last entry. Both are
  measured off `run.openingTowers.length` now, which is pool-independent.
- **The soak drafts through the same function**, `draftOpeningTowers`, and picks
  the guarantee up from it. Its **uniform-hand path** (`seed % 3 === 0`, which
  drops the weights so rarely-drafted towers get soaked at all) is its own path
  and did need editing: a guarantee is a slot rather than a weight, and a soak in
  which a third of the seeds open without the tower every real run opens with is
  measuring a game nobody plays. It calls `guaranteedOpeners` rather than naming
  an id, and it still shuffles the whole pool before filtering, so it consumes
  **exactly the rng it always did**.

## A defect this change exposed, and fixed

The Ima Dummy card read, on a real frame:

> **IMA DUMMY** — `0 damage · Short reach · Infinity/sec`
> `Picks off one target at a time.`

`towerStats` computes `1 / def.fireInterval` and the tower's `fireInterval` is
**0**, so it printed `Infinity`. And `towerLine`'s fallback — reached because
every trait it tests for is false of a tower that does not shoot — claimed the
exact opposite of what the tower does. Both were true before today; the tower was
draftable on level 1 alone, which is why nobody had seen it. This change puts
that card in front of every player on every level, so it is the first thing that
had to be true.

Both branches derive from `soldierCount`, like the `supportRadius` branch beside
them, so a second deployer needs no copy written for it:

> **IMA DUMMY** — `2 lads · 90 hp · Short reach`
> `Blocks the road. Cannot attack.`

`tests/loadout.test.ts` gained `a tower that deploys men describes itself as one`,
and the existing "no player-facing card text quotes an engine unit" test now also
rejects `Infinity`, `NaN` and `undefined` in any card string.

## The loadout screen with a third card

The two dealt rows no longer hold the same number of cards — three towers against
two specials — and a single `cardWidthFor(2)` served both. It measured the tower
cards **a third too wide**, which is a stats line wrapping into a card that was
never given the height for it. Each row divides its band by its own count now.

On the forced two-tower hand that `screens` has always used, the numbers are
**identical to `main`**, integer for integer, at all three viewports — so the
refactor is neutral and what follows is the third card and nothing else:

| viewport | overflow, same hand without the dummy | overflow with it | the third card costs |
|---|---|---|---|
| 844x390 | 0 | 89 | **89** |
| 667x375 | 170 | 263 | **93** |
| 1400x900 | 4 | 76 | **72** |

**The screen already scrolled at phone width** — `main` overflows by 170 units at
667x375 with two cards — so "it overflows" is not a finding about the third card.
What the card costs is the difference above, and the cause is not width but
wrapping: three cards of 225 units need 299 units of height where two cards of
349 need 187.

**And what overflows scrolls, established by moving it.** The scenario drives 12
wheel events and reports the stack travelling the full extent — `0 → -90 of -89`,
`0 → -264 of -263`, `0 → -76 of -76` — and the scrolled frame at 667x375 shows
all three tower cards and both specials complete. Nothing overlaps, nothing sits
under a notch, and no control is under 44pt: `screens` reports the same **single**
fault at every viewport that `main` reports, the Title screen's version stamp,
which is labelled in the harness as a hidden dev door rather than a tap target.

**This is the one open item on the screen.** A desktop loadout now scrolls by 76
units where it scrolled by 4, and at 667x375 the tower row itself is partly below
the fold where before only the specials were. The two-column reflow is *correctly*
refused — three cards across a 300-unit half-band is 85 units each, far under
`minDealtCard`'s 160 — and stacking the tower row two-deep measures *taller*
(2 × 187 against 299). So every arrangement the screen already knows about is
worse, and the fix is a design decision about the screen rather than a bug, which
per hard rule 6 is not something to do unasked. Reported, not fixed.

---

## The re-soak: 480 seeds, all ten levels

`node --experimental-strip-types tools/soak/level.ts 480 <level>`, difficulty
normal, seeds 1..480 throughout, every column measured on **this** tree.

**The baseline was re-measured rather than quoted, twice.** The brief's list —
`428, 255, 422, 299, 218, 210, 198, 200, 191` — was already stale in its last two
entries, and `main` then retuned level 9 mid-session. The baseline column below
is `origin/main` at `f3d597d` and reproduces every figure published in
`SOAK-REPORT.md`, level 9's new **192/480** included.

**A third column, because the brief's premise turned out to be wrong.** "Every
level gets easier" is false — seven of ten got harder — so the change was split in
two and each half measured. `pool` is `imaDummy` in the shared `towerWeights`
with `guaranteedTowers: []`: draftable everywhere, guaranteed nowhere.
`guaranteed` is what shipped.

| level | before (`main` `f3d597d`) | pool only | **guaranteed (shipped)** | Δ pool | Δ guarantee | band after |
|---|---|---|---|---|---|---|
| 1 | 428 (89.2%) | 428 (89.2%) | **405 (84.4%)** | +0 | −23 | +39.4 above |
| 2 | 255 (53.1%) | 253 (52.7%) | **218 (45.4%)** | −2 | −35 | +0.4 above |
| 3 | 422 (87.9%) | 429 (89.4%) | **422 (87.9%)** | +7 | −7 | +42.9 above |
| 4 | 299 (62.3%) | 335 (69.8%) | **328 (68.3%)** | +36 | −7 | +23.3 above |
| 5 | 218 (45.4%) | 268 (55.8%) | **343 (71.5%)** | +50 | +75 | +26.5 above |
| 6 | 210 (43.8%) *in band* | 177 (36.9%) *in band* | **83 (17.3%)** | −33 | −94 | **−17.7 below** |
| 7 | 198 (41.2%) *in band* | 205 (42.7%) *in band* | **133 (27.7%)** | +7 | −72 | **−7.3 below** |
| 8 | 184 (38.3%) *in band* | 189 (39.4%) *in band* | **146 (30.4%)** | +5 | −43 | **−4.6 below** |
| 9 | 192 (40.0%) *in band* | 170 (35.4%) *in band* | **119 (24.8%)** | −22 | −51 | **−10.2 below** |
| 10 | 195 (40.6%) *in band* | 190 (39.6%) *in band* | **117 (24.4%)** | −5 | −73 | **−10.6 below** |
| **all** | 2601 (54.2%) | 2644 (55.1%) | **2314 (48.2%)** | **+43** | **−330** | |

### Where the band went

Before: **five levels inside** the 35–45% band — 6, 7, 8, 9 and 10 — with 1, 2, 3
and 4 above it and 5 sitting 0.4 points above the top edge.

After: **none inside**. All five that were in it are below it. Level 2 now holds
the 0.4-points-above spot that level 5 held, and is the closest any level comes.

**Level 9 is the sharpest single case.** `main` retuned it back into band on
`e505a4d` — 113 → 192, 23.5% → 40.0%, the middle of the band — and this change
takes it to 119 (24.8%), which is within 6 runs of where the flank left it before
that retune. Whoever picks up the balance should know that the retune it just
received was derived against a two-tower opening.

### It is the guarantee, not the pool entry

The `pool` column is nearly a no-op: **+43 runs over 4800**, and **the same five
levels are still in band**. Level 1's figure is *identical*, because level 1
already had the tower at weight 4. The guarantee is worth **−330**.

Both are real and they are different effects, which is why the control was worth
the ten minutes.

**The mechanism is in `Sim.ts` and it matters before anybody retunes anything.**
The soak's scripted player chooses what to build with
`const id = rng.pick(affordable)` — **uniformly at random** from the unlocked
types it can afford whose range reaches the road. A guaranteed third opener that
deals **zero** tower damage therefore takes roughly **one pad in three from wave 1
on every level**, where before it took none outside level 1. That is a property of
the soak's player, not of a human's choice: a person builds a garrison where
blocking pays and the soak builds one wherever the dice say.

So the guarantee's soak cost is an **upper bound** on what a player will feel, and
the two levels that went *up* are the more interesting signal, because they went
up in spite of it:

- **Level 5 (+125 runs, 45.4% → 71.5%)** — the vampire level. Blockers hold the
  lane, and the level's counterplay loop is chip damage holding lifesteal off.
  Both halves help it: +50 from the pool entry and +75 more from the guarantee.
- **Level 4 (+29)** — almost all of it the pool entry (+36); the guarantee costs
  it 7 back.

The heaviest falls are the DPS-starved boards, which is the same story read the
other way: **level 6 (−127)**, **level 10 (−78)**, **level 7 (−65)**, **level 9
(−73)**. Level 9's own map note has said for weeks that its board "holds LESS
effective DPS than fifteen pads suggests".

### Level 2 specifically

`255/480 (53.1%) → 218/480 (45.4%)`. It moved **toward** the band and stopped 0.4
points outside it, which makes it the best-placed level in the game.

The brief's "21%, well below band, 367 of 374 losses on the Devil at wave 13" is a
**120-seed figure from an earlier era of `SOAK-REPORT.md`**. The current published
figure, and the one this session re-measured on `main` twice, is 255/480 = 53% —
*above* the band.

The Devil is untouched as the cause of death:

| | losses | on the Devil, wave 13 | on a Direct Report |
|---|---|---|---|
| before | 225 | 213 (95%) | 11 (5%) |
| after | 262 | 245 (94%) | 17 (6%) |

Every loss still ends at the main exit and every one still lands at wave 13. So
the extra tower did not make the Devil harder; it made the board that has to reach
him thinner, by one pad in three. Note also what stopped getting out: Middle
Managers fell from 43 to 2 and Late Filers from 40 to 7 — the garrison *is* doing
its job on the small bodies, and the Devil does not care.

### Three things NOT checked, and they matter

- **The soak's unlock schedule is not the game's, and this change did not touch
  either.** `Sim.ts` unlocks with `want = min(reserve.length, floor((waveIndex +
  1) / 3))`, which on a 13-to-16-wave level reaches the **whole reserve** — every
  tower type — while the game stops at `unlockedTypeCap`. That divergence is
  pre-existing and is a separate finding; it means the soak says nothing about
  whether the 5th type now arriving at wave 8 is worth what it costs.
- **`openingPurse` can now be smaller.** It is `max(base, ceil(min(drawnCosts) ×
  margin))`, and the dummy's 130 joins the set — so a hand of Longshot (220) and
  Grinder (150) used to floor the purse at 150 × margin and now floors it at
  130 × margin. It is a floor guarantee ("you can afford at least one thing") and
  it is still correct, but it is a real and unintended tightening on expensive
  hands, and it is inside the −330.
- **Only `normal` was soaked.** Tuning is done against normal and only normal, per
  `tools/soak/level.ts`'s own note, and `main` has just added five Lazy Dad knobs
  whose interaction with a guaranteed blocker is unmeasured.
- **No retuning was done, as instructed.** Nothing in `enemies.json`, any
  `waves.*.json`, `difficulty.json`, `rules.json` or any boss's health was touched.

---

## Verification

- **`npm test`** — 1176 tests, all pass. Seven are new: the guaranteed tower in
  the opening hand on **every level id** (built through `towerWeightsFor`, so a
  level cannot quietly opt out), a reroll that still produces it, never twice, the
  drawn pair unchanged from the six-tower draft, the drawn pair covering damage
  and an answer by itself, the reserve never offering it again, and the cap not
  eating a later unlock — plus the deployer card-text test. The reroll test also
  pins `LoadoutScene`'s reroll stride, so a change to it fails rather than
  silently testing the wrong seeds.
- **`sh tools/tsdiff.sh f3d597d`** — `baseline f3d597d: 214 distinct errors;
  working tree: 214`, **nothing introduced**, and no new-file warning. No new
  Phaser member is touched by this change, which is the blind spot that script
  cannot see.
- **`sh tools/harness/run.sh guaranteed 240 <vp>`** at **844x390, 667x375 and
  1400x900** — **27 checks, no faults at each**, on the merged tree. Portrait
  (375x667, 390x844) is gated, which is the correct answer for a landscape-only
  game.
- **`sh tools/harness/run.sh screens 140 <vp>`** at the same three, plus the two
  portrait viewports — one fault at 844x390 and 667x375, none at 1400x900, and
  `main` reports **the same single fault at the same coordinates**: the Title
  screen's version stamp, labelled in the harness as a hidden dev door rather than
  a tap target.

### From rendered frames

Every claim below came off a screenshot or off objects read out of a live scene,
not from a test. Reproduce with `sh tools/harness/build.sh` then the commands
given; the shots are gitignored on purpose.

- **Three opening towers including the dummy, on level 1 and on level 10.** The
  hand is *dealt*, not set — every other loadout scenario in the harness forces a
  fixed pair, which proves nothing about the draft, so the run state is cleared
  and `LoadoutScene.create` draws its own. `level1: dealt [writeoff, rounding,
  imaDummy]`, `cards on the screen: [GRINDER, MORTAR, IMA DUMMY]`; level 10
  identical. The card names are read off the scene's own text objects, so what is
  checked is what the player sees.
- **A reroll still deals it.** The REROLL button is pressed through the input
  system at its real screen position: `[writeoff, rounding, imaDummy] →
  [writeoff, extension, imaDummy]`, cards `[GRINDER, BRAMBLE, IMA DUMMY]`. The
  drawn pair changed and the guaranteed card did not.
- **It builds and its lads deploy on level 3** — a level that could not draw this
  tower at all before today. `level3: unlocked [withholding, rounding, imaDummy]`,
  then `garrison: 2 lad(s), rally 572,486` with both at full health, visible, and
  within 200px of the rally point. The frame
  (`guaranteed-level3-garrison-844x390.png`) shows the tower on its pad and two
  lads standing in the road below it.
- **The screen lays out at phone width with a third card, and what does not fit
  scrolls to the whole of itself.** Numbers and the scroll travel are in the
  loadout section above.

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh guaranteed 240 844x390
sh tools/harness/run.sh guaranteed 240 667x375
sh tools/harness/run.sh guaranteed 240 1400x900
sh tools/harness/run.sh screens 140 844x390
python3 tools/harness/shrink.py tools/harness/shots/guaranteed-level1-844x390.png 900
```

`ASSERTS_NOTHING` is unchanged at five — muzzle, rockets, retreat, regressions,
meteor. `guaranteed` joins `USES_EXPECT`, so it is held to having evaluated at
least one check, and `tests/harness-scenarios.test.ts` keeps `SCENARIO_NAMES`
honest.

---

## Where this leaves the repository

**In flight.** Nothing. The change is committed and this report is written against
a finished tree.

**Waiting on a decision — the balance, and it is the whole of what is left.** No
level is inside the 35–45% band. Five fell out of it and four of the five that
were already above it moved further out. Nothing was retuned, as instructed.
Before anybody picks a lever, three facts above are load-bearing:

1. Most of the −330 is the **soak's uniformly-random builder** spending one pad in
   three on a zero-damage tower from wave 1. That is an upper bound on what a
   human feels, not a measurement of it.
2. **Level 9's retune is three commits old** and was derived against a two-tower
   opening; this change puts it back to within 6 runs of where the flank left it.
3. Several of these levels have boss numbers derived against their own board,
   **Vlaude's 26,000 among them**. Retuning bosses against a soak whose *player*
   got worse at building is the wrong order of operations.

**Waiting on a decision — the loadout screen.** The third card costs 72 to 93
units of overflow at every viewport, so a desktop loadout scrolls by 76 where it
scrolled by 4. Every arrangement the screen already knows about is worse than the
one it picks. See the loadout section.

**Carried forward from `reports/2026-09-17-level-9-retune.md`.** Level 9 is back
in band there at 192/480 and is out of it here at 119/480. The two reports do not
disagree — they measure two different opening hands — but the newer number is the
one that describes the game.

**Carried forward from `reports/2026-09-16-lazy-dad-mode.md`.** The five Lazy Dad
knobs are unmeasured against a guaranteed blocker; only `normal` was soaked here.

**Discharged.** The `extraTowerWeights` mechanism is now unused by every level and
kept deliberately; `tests/draft.test.ts` still walks it so it stays covered for a
future level-scoped tower.
