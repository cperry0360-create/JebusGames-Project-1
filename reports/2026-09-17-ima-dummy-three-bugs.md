# The Ima Dummy Tower's three bugs

**2026-09-17.** A boss walked through the lads untouched, the lads could not be
moved by any sequence of taps, and selling the tower left them standing in the
road for the rest of the run. All three are fixed, and the fixes are checked on
a rendered frame rather than reasoned about.

| commit | what | CI |
|---|---|---|
| `3d96326` | Fix three Ima Dummy Tower bugs: bosses, moving the lads, and selling | covered by run 458 |
| `4ec8404` | Merge main: the wave-control HUD and the run 451 CI table | **run 458: all five jobs green** |
| `cc8645e` | Report the three Ima Dummy Tower fixes — `main`'s head | docs only; deploy skips |

**Run 458 on `4ec8404`:** `changes`, `typecheck`, `test`, `deploy / build`,
`deploy / deploy` — all five green, and **the deploy RAN rather than skipping**,
which is correct: this touches `src/`, not only markdown.
`deploy / deploy` completed at 11:32:58Z via `actions/deploy-pages@v4`. Read off
the job list rather than off the run's conclusion, per CLAUDE.md.

The report commit that follows is markdown only, so run 459 will show `deploy`
SKIPPED. **That is a documentation commit behaving correctly, not a failed
deploy.**

---

## 1. The lads did not damage bosses

`tickGarrisons` handed each soldier `held.get(s) ?? null` — the enemy the one
engagement pass had given him — and nothing else. A boss is `blockable: false`,
which means it is never given to anybody, so the map from soldier to enemy was
empty for it and `Soldier.tick` took the `else` branch: walk back to your post.
Every boss in the game, on every level, crossed a line of lads without taking a
scratch. Flyers, which are unblockable for a different reason, did the same.

A lad who is holding nothing now swings at the nearest enemy inside his
`soldierBlockRange` that he may hit but may **not** hold. The rule is
`swingTarget` in the new `src/systems/Garrison.ts`:

- **`held` wins.** A lad already in a fight does not wander off to hit
  something else.
- The enemy's `blocker` is **not** set. It is not held, it does not stop, it
  stays as unblockable as it was, and it keeps its full speed.
- Same damage, same interval, same Rage multipliers. They are computed above the
  call and passed unchanged, so a free swing cannot drift from a held one.
- **Nearest**, not furthest along the lane: `soldierBlockRange` is 46px, and
  "furthest along" over an arm's length is a coin toss that reads as the lad
  ignoring the thing on top of him.
- Mind-controlled enemies are skipped, for the reason the tower and hero
  targeting skips them — they are fighting for the player.

**It is a chip, not a wall, and the number is small on purpose.** Two tier-1
lads deal 8 each on a 1s interval, and a boss crosses the 92px they can reach in
about three seconds. Measured on level 3 in the harness, against The Rainbow
Reaper (2,100 hp, armour 6, speed 30): **2,100 → 2,084**, eight swings landing
2 each after armour, while it walked from lane distance 15 to 186 without ever
stopping. That is the shape the fix should have — a tower with no gun should
scratch a boss, not threaten it.

## 2. The lads could not be moved

`selectTower` armed the rally mode **and** opened the tower's ring, and
`onClick` dismisses an open ring before it looks at anything else:

```
if (this.ring?.active) { this.clearSelection(); return }   // ran first
...
if (this.selected?.isDeployer) { this.orderRally(...) }    // never reached
```

So the tower announced "tap the highlighted road to move the lads", and the tap
on the road closed the menu and deselected the tower. Every time, on every
board. The mode had a CANCEL button, an ESC key and a lane wash, and no reachable
way to spend a tap.

It is a **button** now, which is what makes the tap unambiguous:

- **MOVE on the tower's ring**, slot 3, with a flag on it. Deploying towers
  only; a tower with no lads has nothing to move.
- Pressing it closes the ring, arms the rally request, lights CANCEL, washes the
  legal road and says **"Tap the road to move the lads, or CANCEL"**.
- `onClick` reads an armed rally order **before** the ring dismissal, and still
  after the pad, tower and hero checks — building on the next pad, selecting the
  next tower and picking the hero up all still work while the lads wait.
- The branch is gated on the **mode**, not the selection: a selected Ima Dummy
  Tower that has not been told to move is an ordinary selected tower.
- Pressing MOVE again on a tower already waiting backs out, which is the same
  second-press escape every other armed request has.
- **A flag stands on the rally point whenever the tower is selected**, not only
  while the mode is armed: where the lads are posted is what a player reads
  before deciding to move them.

**The flag is generated, not drawn from a file.** `art.json` names nine UI icons
and none of them is a flag. `flagInto` draws a pole and a pennant into any
Graphics, and it is used twice — once at boot into a 256px texture for the
button's glyph, once straight onto the board at 30 world px for the rally mark —
so the button's picture and the thing that then moves are literally the same
shape. Its numbers are in `presentation.json` under `rallyFlag`.
`TowerRing.makeGlyph` falls back to the named icon if the texture is somehow
absent, so the button cannot end up blank.

### What this costs, and the decision it leaves open

**The deploying tower's ring is now an ellipse of four where every other
tower's is an arc of three,** because `presentation.json`'s `arcMaxOptions` is 3.
Measured at 844x390 across all 52 ring states (`run.sh towerring`):

| | UPGRADE | SELL | MOVE |
|---|---|---|---|
| every other tower, every state | 28,133 | 133,133 | — |
| Ima Dummy, all four of its states | 140,56 | 140,180 | 4,118 |

Within one tower's own ring the invariant the reserved slots exist for still
holds exactly: each of the deploying tower's three buttons is in **one** place
across every state it can be in, and no two of them overlap. Across towers it
does not: **its UPGRADE sits 136px from every other tower's.**

That is the price of a fourth button on one tower. The alternative is to reserve
a **fourth slot on every tower's ring**, which restores one geometry for all
seven at the cost of moving UPGRADE and SELL for towers nobody asked to change.
That is a change to every tower's menu rather than to this one, so it was not
made here — **it is a decision for Cory**, and the numbers above are what it
would be decided on.

## 3. Selling left the lads

`sellTower` and `destroyTower` released the pad, spliced the tower out of
`this.towers` and destroyed it — and neither said anything about
`this.garrisons`. The garrison entry survived, `tickGarrisons` went on ticking
it, `soldiers.length !== tower.soldierCount` went on reading a tier off the
destroyed tower object, and `manGarrison` went on replacing every lad that fell.
The lads outlived the tower by the whole rest of the run, holding the road for a
pad the player had just cashed in.

`disbandGarrison(tower)`, called from both:

1. releases any enemy whose blocker is one of that garrison's soldiers —
   **before** they are destroyed, because `Soldier.alive` reads `this.scene` and
   a destroyed Container no longer has one;
2. destroys each soldier;
3. takes the garrison out of `this.garrisons` (`removeGarrison`, in
   `systems/Garrison.ts`);
4. clears the rally flag if that tower was the selected one.

## How this is checked

**`tests/garrison.test.ts`, 13 tests.** The two rules that are not scene-shaped
are in `src/systems/Garrison.ts` and are driven for real: an unblockable enemy
walked past two lads frame by frame with the scene's own engagement rule around
it (takes damage, never held, never stopped, and no more swings than two men can
land in the window), a blockable one still held and still hit, and a garrison
removed from a list that is then ticked for twice `soldierRespawn` with nothing
coming back. The rest is read out of `GameScene.ts` as text, the way
`tests/blocking.test.ts` and `tests/boardinput.test.ts` already do — including
the branch **ordering** inside `onClick`, which is the whole of bug 2.

**`tools/harness/run.sh lads`, 35 checks, and it is the half that presses the
buttons.** Level 3, a pad that reaches the trunk lane:

```
built on pad 8 at 758,279  range 150  rally {"x":704,"y":344}  lads 2
ring options: [upgrade, move, sell]
after MOVE: mode=targeting  toast="Tap the road to move the lads, or CANCEL"
rally {"x":704,"y":344} -> {"x":858,"y":379}          # tapped the road
with the ring open: {"x":858,"y":379} -> {"x":810,"y":381}
boss: hp 2100 -> 2084  lane 15 -> 186  (lads at 64)  blockable=false
before the sale: 1 garrison(s), 2 lads drawn
after the respawn window: 0 garrison(s), 0 lads drawn
RESULT no faults; 35 checks
```

Green at **844x390 and 667x375**. The third case is staged deliberately: the
mode stays armed after an accepted order, so the ring is reopened **behind** it
and the road is tapped with both live — which is the exact collision bug 2 was.
The aim point is chosen clear of the ring's own hit boxes and the HUD chrome,
because a press that lands on either is consumed before `onClick` runs and
proves nothing either way.

**Two harness reads that were wrong before they were useful.** `status.alert` is
consumed by the HUD the frame it is shown (`this.toast(s.alert); s.alert = ''`),
so a scenario reading it back always reads `""` — the toast on the glass is
what a player gets and what is asserted now. And `tests/garrison.test.ts`'s
first `methodBody` helper found the first CALL of a method rather than its
declaration, and sliced four lines out of the middle of an unrelated one; the
assertion that caught it read exactly like a missing feature.

**`screens`:** one fault at 844x390, at 844x390 with a notch and at 667x375, and
it is the same pre-existing one in all three — `SMALL Title
[title:version-stamp (hidden dev door, not a tap target)]`. None at 1280x720.
Nothing on the Game screen changed.

**`towerring`:** green, and it now measures the fourth button (table above). Two
things in that scenario were repaired in passing: it asked every tower for a
MOVE option and reported six missing ones as faults (a leftover from the
Restructure era), and it cleared the pad by hand without disbanding the
garrison, so the Ima Dummy Tower's lads would have outlived all eight of its
states and the next tower would have been measured through a crowd. `ledger` had
the same MOVE expectation and is fixed the same way.

## Three existing tests were changed, and why

None of them was wrong about its own subject; all three encoded the old,
broken shape of this feature.

- **`tests/abilitybar.test.ts`** banned `id: 'move'` outright, as part of
  "Restructure is gone". Restructure moved the **tower**, and it is still gone —
  the ban now allows exactly one MOVE, requires it to be behind
  `if (tower.isDeployer)` and requires it to call `beginRally`. Nothing names a
  pad and no tower can be picked up.
- **`tests/interaction.test.ts`** asserted the tower panel reserves three slots.
  It reads three, or four on a deploying tower. Its slice of the source also
  ended at a string that had not existed since the ring options were extracted
  into their own method — `indexOf` returned -1, so every assertion in it was
  being made against most of GameScene. That is fixed too.
- **`tests/targeting.test.ts`** looked for the arming inside `selectTower`,
  which is precisely where it must not be. It looks in `beginRally`, and now
  also asserts that `selectTower` does **not** arm it.

## What was NOT checked

- **The live site.** The egress proxy in this container answers 403 to
  github.io, so nothing was fetched from the deployed URL. CI's job list is the
  evidence for the deploy.
- **The soak.** No run was made and no number in `SOAK-REPORT.md` or any
  per-level win rate was re-measured. See below — the sim does not model the
  first fix at all, so it could not have moved.
- **Tier 2 and tier 3 lads against a boss, and the Rage branch.** The harness
  run is tier 1. The damage and interval come from the same `statAt` path a held
  swing uses and `tests/garrison.test.ts` asserts they are the same variables,
  but the higher tiers were not driven on a frame.
- **Flyers.** The fix reaches them — a flyer is unblockable, so a lad standing
  under one will now swing at it. That follows the brief as written ("the
  nearest alive unblockable enemy"), and it was not measured on any level.
- **`tsc` locally.** As ever: three errors are introduced against the
  `tools/tsdiff.sh` baseline and all three are the documented Phaser cascade,
  which run 458's `typecheck` job then confirmed by passing —
  `Property 'destroy' does not exist on type 'Soldier'` is the same error the
  baseline already carries for `Tower` and `Enemy` on the same call, and the two
  `SwingCandidate` lines are the same "Enemy is missing x, y" shape the baseline
  carries for `Targetable`. CI's typecheck job is the first thing that can
  confirm it.

## Where this leaves the repository

- **`main` is `4ec8404`** and carries the fix. `claude/ima-dummy-tower-bugs-fvmimu`
  is pushed and identical to it.
- **The soak sim does not model the first fix.** `tools/soak/Sim.ts` swings only
  at `held`, exactly like the scene did:
  `if (!held) { sd.attackTimer -= dt; continue }`. So the simulated board
  understates a garrison against bosses and flyers by whatever those swings are
  worth — a few hundred damage across a boss's walk, at most. **It was left
  alone deliberately**: changing the builder or the rules changes the
  instrument, and every win rate in `CLAUDE.md` and `SOAK-REPORT.md` was measured
  with the current one. Whoever changes it should re-measure rather than
  compare, and say so in the same report.
- **The four-slot ring is the open decision** — see the table in section 2.
  Either the deploying tower keeps its own geometry, or every tower's ring
  reserves four slots. Nothing else in the repository depends on the answer.
- **Nothing was retuned.** No tower, enemy, wave or boss number changed. The
  only data edits are `art.json`'s `generated.rallyFlag` key and
  `presentation.json`'s `rallyFlag` block, both presentation.
- Still open from `reports/2026-09-17-build-plots.md` and carried forward:
  **level 7 reads 33/480 (6.9%) and has not been retuned**, and every boss
  health figure in the game is stale against the new boards.
