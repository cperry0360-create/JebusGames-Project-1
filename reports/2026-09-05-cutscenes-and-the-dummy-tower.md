# Cutscenes, the Ima Dummy Tower, and what tuning level 1 taught

Four features, and two of them turned out to be mostly already built.

## Commits

| Commit | What | CI |
| --- | --- | --- |
| `9ba4e94` | Play a comic before a level | ❌ asset budget only |
| `f7d4f2c` | Add the Ima Dummy Tower, its lads, and their tier-4 branch | ❌ asset budget only |
| `46443af` | Bring level 1 back inside its band | ❌ asset budget only |

`npm test`: **747 tests, 746 pass**. The single failure is
`the deploy stays small enough to open on a phone`, red since `c9ea190`.
`tsdiff` clean at every commit — the only lines it prints are the documented
new-file blind spot, where a file importing Phaser loses its base class without
`node_modules`. Every CI run failed on `npm test` and nothing else, which is
that one assertion; CI's `npx tsc --noEmit` step is skipped when tests fail, so
the typecheck evidence here is local `tsdiff`.

---

## The cutscene system

`cutscenes.json` maps a level id to an ordered list of panel paths. Level 1 and
level 2 get three each; **a level with no entry simply starts**, which is the
default rather than an omission, and level 3 is held to it by a test.

**Fit, never fill.** The panels are 16:9 and a phone in portrait is nothing like
it, so a cover-fit would take a third off each side — and a speech bubble in the
corner of a panel *is* the panel. `Math.min` of the two ratios puts the whole
thing on screen: in portrait that means full width, centred vertically, with the
game's dark chrome above and below. Checked at four viewport shapes; none crop.

**Tap anywhere, not a button.** A comic is read by tapping the page, and hunting
a small "next" target on a phone is worse than the panel it advances. The tap
zone is the whole screen rather than the image, so a tap landing in the
letterbox still turns the page. SKIP sits in a corner and stops its own event so
it cannot also count as an advance.

**The next panel is fetched while the current one is up.** Panels are about
300KB each; without the look-ahead every tap is a network round trip on a phone,
and the comic stutters exactly where it should flow.

**The seen flag is written in one place**, at the single exit both endings go
through, so "read to the end" and "skipped" cannot drift apart. A skip counts —
the player has decided about this comic, and asking again next run is not
respecting the answer. Closing the tab on panel two does not count: the flag
records that the comic *reached its end*, however it got there. A level with no
panels is never marked, so it cannot hide a comic added later.

The comic plays in front of a run **beginning**, not a resume — both resume
paths hand straight to `Game`, and an opening in front of a run already under
way would show it twice.

Replay is a badge on the level-select card, offered only for a comic already
watched (before that it would offer to spoil an intro the player is about to
get), and it returns to the map rather than starting the level. **REPLAY
INTROS** on the diagnostics screen forgets every flag — a testing need rather
than a feature, which is why it lives there.

`cutsceneProblems()` fails an id that is not a level, an empty panel list, a
path outside the cutscenes folder, and a repeated panel. The python map checkers
cannot do this one — they read a painted plate, and this is data about data — so
it is a system module with a test that fails the build on it.

---

## The Ima Dummy Tower

A tower that deals nothing and puts two men in the road instead. Level 1's only,
for now, through a new `extraTowerWeights` on the level — additive, so levels 2
and 3 keep drawing exactly what they were tuned against.

### Two things the brief expected to need building were already there

**Blocking exists.** The hero and the summoned gnomes have held enemies up since
before this: `Enemy.blocker`, the `Blocker` interface, the fighting/walking
status, the attack timer that deliberately survives a lost grip, and one
engagement pass that hands out grips and keeps them while they are possible. A
`Soldier` satisfies `Blocker` structurally, so it joins that pass in four lines
and there is no second blocking system. What was missing was something
*permanent* in it — a gnome expires on a timer and has no post to return to.

**Branching upgrades exist, and are generic.** `maxTier` is one above the linear
steps and `atSpecChoice` fires at the top of them, so a tower with **two** linear
tiers gets its mutually exclusive choice at tier 4 with no engine change at all.
The Ima Dummy Tower is simply the first to have two. Several tests had hardcoded
3 — a fact about the six towers that existed, not about the mechanism — and now
derive it.

### The design

| | |
| --- | --- |
| cost ladder | 130, then 182 and 255, branching at 520 — the base×1.4 and base×4 every other tower uses |
| soldiers | ordinary stats, so the tier multipliers carry them like damage everywhere else |
| tier 1 / 2 / 3 | 90 hp, 8 dmg, 1.0s → 170/15/0.9 → 300/26/0.8, exactly the brief's numbers |
| respawn | 10s, per soldier, mid-wave |
| tier 4 | **Rage** (under 35% health: +60% damage, 25% faster, for the rest of that life) or **Need a Pal?** (a third lad on the same rally point) |

**The range is a leash, not a weapon**, and that broke three invariants that had
quietly meant "has a range" by "shoots": the air-cover rule, the fire-sound rule
and the shoots-or-supports rule. All three now ask about the gun.

**The tap is snapped to a lane first and the range checked against the snapped
point.** A soldier standing in a field blocks nothing, so an order does not place
a lad where the finger landed — it picks the nearest point on a lane. Checking
the raw tap instead would post lads outside the ring for a tap just inside it,
and refuse a tap just outside it that pointed at lane well within. On a fork the
nearest lane is a real decision, which is the point. A refusal is said out loud
with a red pulse of the ring: a control used with a thumb on a moving board that
silently does nothing is indistinguishable from one that is broken.

`unicornBoss` is now `blockable: false`, like `theDevil`, so two lads cannot pin
the level 3 boss forever.

### The soak found a real bug in itself

Every third seed takes a uniform random hand, and it drew from **every tower in
`towers.json`** rather than from the level's pool. That was the same thing right
up until a tower existed that only one level can draw — and then every third
seed on levels 2 and 3 was being handed an Ima Dummy Tower the player could
never have had. It moved level 2 from 7/60 to 6/60 before it was noticed. Fixed;
levels 2 and 3 are back to 7/60 and 0/60 with identical loss distributions.

---

## Tuning level 1, and the thing worth knowing

| | wins of 60 |
| --- | ---: |
| before the tower | 47 |
| with the tower, untuned | **46** |
| after | **45** |

**What changed, in full:** wave 12 "Last Light" loses three Scrappers and one
Bruiser — `shredder` 21 → 18, `lateFiler` 19 → 18. Nothing else in level 1's
wave data is touched. Total enemy health 25274 → 25088, which is **0.7%**.

### Cutting waves makes level 1 harder, not easier

Peanuts come from kills, so fewer enemies is a poorer board, and a poorer board
loses to the Politician:

| scale on every wave | health | wins of 60 |
| --- | ---: | ---: |
| ×0.60 | 17068 | 36 |
| ×0.70 | 19180 | 39 |
| ×0.85 | 22034 | 40 |
| ×1.00 | 25274 | 46 |
| ×1.10 | 27246 | 49 |

Wave health and difficulty run in **opposite directions** here. It is the same
effect that caps level 3's rank health, and it is worth knowing before anyone
reaches for this knob again.

### Why the change is 0.7% and not 15%

A big cut does reach the middle of the band, and costs two invariants that only
appeared once it was tried:

- **`level 2 is a step up of 15 to 20 percent`** — at −14.8% on level 1, level 2
  became a **39% spike** over it. Level 2 was not this task's to adjust, so the
  relationship would simply have been broken.
- **`a Scratch Ticket is a gamble rather than an income stream`** — its
  100-peanut expected value went to **35% of a wave's income**, past the
  overtune `DESIGN.md` already records.

A 0.7% trim lands at 45 with neither disturbed: level 2 stays a +19.4% step and
the ticket stays a gamble.

**45 is the top of the band rather than its middle, and that is the honest
ceiling here.** Every small variant tried lands at 45 or 46 — the win rate is not
a smooth function of wave size when the wave size is what pays for the board.
Reaching 40 costs the two invariants above.

Levels 2 and 3 are untouched at 7/60 and 0/60, identical loss distributions.

---

## Deviations from the brief

1. **"Need a Friend?" ships as "Need a Pal?"**, and the tower as "Ima Dummy".
   The tower card's name limit is 12 characters and those names are 14 and 15.
   The limit is a layout constant, not a preference.
2. **Blocking and branching upgrades were not built**, because both already
   existed. Reported above rather than duplicated.

### Tests changed, and why

Nine, each because it encoded a fact about the six towers that existed rather
than a design law, and each updated with its reasoning rather than relaxed:

- the tier ladder **derives** its top instead of asserting 3
- "six towers" is seven; the damage comparison skips the tower with no damage
- an **interval** is better when smaller, whether it is a gun's or a lad's
- "shoots" means a gun, not a range — three separate tests
- the ring-layout sweeps stop at `unlockedTypeCap`, because a seventh cell is a
  menu the game cannot produce
- the median-tower-base ratio moved for the **third time in three art changes**,
  this time because the dummy tower is a tall narrow mannequin; the standing
  finding that the towers want re-scaling to the road now has a third data point
- `loadout.test.ts` counted `scene.start(` as its proxy for "one way off the
  screen"; BEGIN is still one button and now chooses between two doors that both
  open into the run, so the test counts the exits instead

---

## Where this leaves the repository

### Blocked — the asset budget, and the deploy behind it

`main` has been red since `c9ea190`, and because `deploy` is gated on `checks`,
**the deploy job has been skipped on every commit since**. The last successful
deploy was `0c3abc1f`. Nothing in this report is on the live site, and neither
is anything from the level 3 work.

| | assets |
| --- | ---: |
| `8ec7086` last green baseline | 34.5MB |
| `0c3abc1f` last successful deploy | 38.0MB ✅ |
| `7e0bd71` | 53.9MB ❌ |
| `860e604` cutscene and tower art | 58.0MB ❌ |
| cap | 40MB |

It is still climbing — five upload commits during these two sessions have added
20MB. This work added 35KB of its own (a world-map card); the rest is uploaded
art. Two remedies, either on a word:

1. **Move `public/assets/maps/L3_trace.png` (2.12MB) to `tools/`** — a tracing
   overlay, not a shipped asset. Not enough alone.
2. **Re-encode the uploaded PNGs to WebP** via `tools/reencode`. The six dummy
   tower and soldier PNGs alone are 3.4MB; on past ratios the whole set of
   uploads is roughly 20MB down to 3–4MB, which clears the cap comfortably.

### Waiting on a decision

- **Level 3 is 0/60** against a 35–45 target, and the gap is the boss rather
  than the waves — see `2026-09-05-level-3-sports-complex.md`. Unchanged.
- **Level 2 is 7/60** against the same band, for the same reason. Unchanged.
- **Level 1 sits at 45**, the top of its band. Getting nearer the middle means
  accepting a broken level-1-to-level-2 step, which was out of scope here.

### Carried forward

- **`Levels.isLevelCleared` is derived, not recorded.** The save counts runs
  cleared, not which levels they were on.
- **`tsdiff`'s blind spot for new files** now covers `Soldier.ts` and
  `CutsceneScene.ts` as well. Both import Phaser, so unlike `Lanes.ts` and
  `TowerDisable.ts` their members really are unchecked locally — only CI sees
  them, and CI has not run a typecheck since `c9ea190` because the step is
  skipped when tests fail.
- **Art sizing against rule 7.** The soldier sprites are 600px sources rendering
  at 52px (11.5×) and the tower art 900px at 87–117px (7.7–10.3×). The boss
  and tower art are close to the formula; the soldiers and the level 3 mascots
  are well over it. Re-encoding smaller would serve rule 7 and the asset cap at
  once.
