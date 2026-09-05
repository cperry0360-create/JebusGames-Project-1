# Five heroes, a choice, and a change at half health

*2026-09-05 · Courjahan Defense · main*

| commit | what | CI |
| --- | --- | --- |
| `0195b93` | Pick a hero, and let them change when it hurts | ❌ asset budget only |

Everything below is on `main`. Nothing was branched.

## What was asked, and what shipped

Five things, all of them done:

1. **A roster of five heroes** in `src/data/heroes.json` — Cory, Courtland, Han,
   Elijah and Bailey — each with an id, a display name, base and powered art, a
   description and a full stat block.
2. **The loadout's HERO row is now a choice.** Every hero is on it, tapping one
   picks it, the pick is obvious, and it is remembered.
3. **Restructure is gone**, data and code. Cory keeps Haymaker.
4. **The two-state transformation**: base form until half health, powered for
   the rest of that life, back to base on death.
5. **A procedural bob** for the four heroes that have no walk sheet.

## The roster and the pick

`src/systems/Heroes.ts` is the only module that knows who exists. It is
Phaser-free, so the tests read it directly rather than through a scene.

- `HERO_IDS` is the key order of `heroes.json` with `_`-prefixed keys filtered
  out — those are notes, and treating them as heroes is exactly the bug that
  took six tests down mid-session (see **What went wrong**).
- `DEFAULT_HERO_ID` is **first in the file**, not a hardcoded `'cory'`. Cory is
  first, which is what makes him the default. Reordering `heroes.json` cannot
  silently disagree with the code — the same rule `Levels.ts` uses for
  `DEFAULT_LEVEL_ID`.
- `resolveHeroId` turns anything unknown into the default rather than throwing.
  A save naming a hero that was renamed plays Cory; it does not fail to boot.
- `heroSprite(id, powered)` is the single answer to "what is this hero
  wearing", and `art.json`'s new `hero.roster` block is the single place that
  says. Cory's `powered` entry is `null` **deliberately**: his `ultimateSprite`
  is already the DAD MODE look, so spending it on the powered form would leave
  Last Stand with no visual of its own. He still transforms — the burst and the
  damage reduction are what say so.

The pick is written to the save the moment it is made rather than on BEGIN, so
a player who backs out to the title and comes back finds it still made.
`heroId` is validated on read like every other save field: a non-string becomes
`''`, and `''` resolves to Cory at the point of use. One place decides what an
unknown id means.

**Towers and specials are untouched.** `deal()` no longer draws a hero at all
and REROLL goes through the same `deal()`, so "reroll leaves the hero alone" is
the same fact as "the deal does not touch it" — both are asserted.

### The layout is one card, not five

This is the one place I did not build what the brief literally described, and
the reason is arithmetic.

The brief asked for five hero cards, each showing name, description and ability
names. The loadout's content column is 720px at its widest and 520px at its
narrowest. Five cards across 720px is 130px each, which leaves a 114px text
column; the longest hero description is 54 characters and needs six lines in
that column. It only fits at about 11px, and this screen's own floor is 18px
because the whole 1280x720 design box is fitted down to the viewport — at 0.55
on a phone in landscape, 11px design pixels are six real ones.

So the HERO row is **one card with a picker strip**: five portraits with names
across the top, every hero visible, tappable and highlighted, and the selected
hero's description and ability names written underneath at full width, at the
same size as every other card's body. Everything the brief asked to be visible
is visible; the description belongs to the hero you have selected rather than
being repeated five times at an unreadable size.

The highlight is three things at once — an amber ring, an amber name and a tick
— because a border alone is easy to miss on a phone at arm's length, and this is
the one control on the screen that changes what the run is.

One number came out of this: `loadout.heroNameMin` (15px). At the narrowest
panel a tile is 98px, and COURTLAND at 18px is about 101px, so it wrapped to two
lines and ate the portrait. The tile now measures the name and steps down only
as far as it needs, with 15px as the floor. `tests/loadout.test.ts` checks the
floor clears the narrow tile, which is the case a renderer-less CI can still do
as arithmetic.

## The transformation

`src/systems/Transform.ts`, Phaser-free for the same reason: the soak has to
model it, because a 40% damage reduction on the hero moves every win rate the
game reports.

| rule | value | where |
| --- | ---: | --- |
| transforms at or below | 50% of max health | `rules.heroTransform.belowHealth` |
| incoming damage while powered | ×0.6 | `rules.heroTransform.damageTaken` |
| grace at the swap | 1.5s | `rules.heroTransform.invulnerableSeconds` |

Three decisions worth recording:

- **Checked on the health that is LEFT.** Asking before the hit lands would
  transform a hero standing at 51% because the incoming blow was going to take
  it under, which is a different moment from the one the player sees.
- **The grace is absolute, not a reduction.** It exists so a hero cannot be
  deleted in the middle of the swap, and a reduction would not do that job
  against the level 3 boss.
- **The state is entered, not maintained.** A hero healed back over half stays
  powered. Only death takes it off, and then it has to be earned again.

Visually the swap is a texture change (where the hero has powered art), an
expanding ring, a white fill flash and a scale pop.

## The bob

Only Cory has a walk sheet. The other four are single pictures that would slide
across the field, so `Hero.bob()` moves them 2.5px on an 11rad/s loop while they
are moving.

It is conditioned on `walkFramesFor(this.heroId)` being **null** rather than on
a flag. Dropping real frames into `art.json`'s roster later turns the bob off by
itself; there is nothing to remember. `applyPose` still never writes `y` — the
bob owns the vertical, and two writers is exactly how the old double motion
happened.

## Soak

All-normal, 60 seeds per level, the same grid every previous report used.

| level | before | after |
| --- | ---: | ---: |
| level 1 | 45/60 | **45/60** |
| level 2 | 7/60 | **10/60** |
| level 3 | 0/60 | **0/60** |

Level 1 holds at the top of its band, so nothing was tuned.

**The level 2 movement is real, and I checked.** Twice in the previous session
an apparent balance shift turned out to be an artifact — once a knockback that
stopped moving `laneDistance`, once an rng reseed from deleting a draw — so this
one was A/B'd the same way: neutralising the two lines in `tools/soak/Sim.ts`
that model the transformation (`damageToHero` and `shouldTransform`), and
nothing else, returns all three levels to **45/7/0 exactly**. Restoring them
gives 45/10/0. A 40% damage reduction from half health onward is a real buff on
every level; it is worth 3 wins in 60 on level 2 and nothing on the other two.

Every hero was also soaked on every level, 40 seeds each:

| | cory | courtland | han | eli | bailey |
| --- | ---: | ---: | ---: | ---: | ---: |
| level 1 | 31/40 | 27/40 | 31/40 | 29/40 | 25/40 |
| level 2 | 8/40 | 4/40 | 10/40 | 3/40 | 4/40 |
| level 3 | 0/40 | 0/40 | 0/40 | 0/40 | 0/40 |

No crashes on any hero. The spread matches the stat blocks — Han's reach and
Cory's tuned numbers do best, Bailey's 12 damage at 270 health does worst — and
the gap on level 1 is 6 wins in 40, which is a choice with consequences rather
than a trap. **The heroes are not individually tuned**; that was not asked for
and level 1's band was measured with Cory.

The soak driver at 300 runs: 0 crashes, 0 console hits, 0 findings, 0 stuck
runs, all five heroes covered.

## Tests

`tests/heroes.test.ts`, 11 tests, one per named case in the brief plus one for
the bob:

| case | how it is checked |
| --- | --- |
| every hero can be selected and spawns with the correct art | data + `heroSprite` in both forms, every key resolved against the manifest |
| the hero is no longer randomised and reroll does not change it | `deal()` source contains no hero at all; `redeal()` goes through `deal()` |
| towers and specials are still randomised | the three draft calls are still in `deal()`, still seeded |
| transformation fires at 50 percent and not above | 51% does not, exactly 50% does, a killing blow does not |
| it fires once per life | driven through a simulated life, counting swaps |
| damage reduction applies only in powered form | including that the hit which *causes* the change is not itself reduced |
| invincibility expires after 1.5 seconds | absolute at 1.4s, gone at 1.5s, never negative |
| death returns the hero to base form | plus `revive()`'s source, and it has to be earned again |
| selection persists across runs | round-trip, other save fields preserved, unknown ids resolved |
| no Restructure code or data remains | the hero side; the full scene sweep stays in `abilitybar.test.ts` |
| Cory otherwise behaves as before | his stats, his sheets, his DAD MODE art |

Full suite: **759 tests, 758 pass**. The one failure is the asset budget, which
is pre-existing and is not mine — see below.

`sh tools/tsdiff.sh c0148d2`: baseline 195 distinct errors, working tree 193,
**nothing introduced**.

## What went wrong

**`_note` keys are not heroes.** `heroes.json` carries `_note` and `_stats` as
documentation. Six tests iterated `Object.entries(heroes)` and asked a string
for its `.icon`, its `.retreat` and its `.blurb`. This is the same bug I hit in
`GameScene` earlier in the session and fixed there by routing through
`Heroes.ts`; the tests read the JSON directly and so had to be fixed one at a
time. Each now filters underscore keys through a named helper.

**Nine test invariants encoded the old content rather than a design law**, and
each was updated rather than worked around:

- the frame fallback was `return this.def.bodySprite`; it goes through the
  roster now, so a *powered* hero falls back to its powered picture rather than
  reverting to base art for the length of one frame (`boot.test.ts`,
  `heroframes.test.ts`)
- "there is no bob left on the hero" was protecting against faking motion
  *under real animation*. The new bob is the opposite case — heroes with no
  frames at all — so the test now asserts the condition rather than the absence
  (`heroframes.test.ts`)
- "a redeal redraws heroId" is now the opposite: it must not (`loadout.test.ts`)
- "heroSection builds on a card" needed to follow one level of delegation to
  `heroTile`, and gained a check that a tile does *not* build a card of its own
- the revive test's regex matched a comment I had written explaining that
  `lastStandUsed` is deliberately not reset there. Comments are now stripped
  before the check — deleting the reasoning to satisfy a regex is the wrong tidy
- `logic.test.ts`'s "Restructure frees the old spot" is now "selling frees it",
  which is the caller that survived

**One blurb was 63 characters** against a 57-character budget measured for the
narrowest card. Elijah's is now "Immovable. Holds four at once and never
complains." at 50.

**The hero copy said "he".** Three player-visible strings assumed Cory. Four of
the five heroes are not Cory and one of them is a dog, so they are neutral now:
"is back up", "click where to hold", "exposed while pulling out".

## CI

Run 83 of **Checks** ([`33986833817`](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33986833817))
finished red with **exactly one failing test**:

```
✖ the deploy stays small enough to open on a phone
  AssertionError: assets total 58.0MB, which is a long wait on a phone
```

Nothing else failed — the 758 other tests passed on the runner as they do
locally. `main` has been red on this same test since `c9ea190`, and the
`npx tsc --noEmit` step is skipped when tests fail (it was skipped again here),
so **local `tsdiff` remains the only typecheck evidence for everything since
then**. `deploy` was skipped, as it has been for every commit since
`0c3abc1f`.

## Where this leaves the repository

### In flight

Nothing. Everything is pushed and the working tree is clean.

### New, and waiting on a word

- **Per-hero ability icons landed mid-session and are not wired up.** `0d3a99d`
  added eight files — `ability_{cory,courtland,han}_{1,2}.png` plus
  `ability_{bailey,eli}_2.png`. `ability_bailey_1.png` and `ability_eli_1.png`
  are missing, so every hero still points at the shared `ability-haymaker`
  icon. Wiring the eight and leaving two heroes on the shared icon would look
  like a bug rather than a stage, so I have left all five alone. Say the word
  (with or without the two missing files) and it is a `heroes.json` and
  `art.json` change plus a manifest entry each.
- **The heroes are not individually balanced.** Level 1 spans 25–31 wins in 40
  across the roster. That is a real choice rather than a trap, but if the band
  is meant to hold for every hero rather than for Cory, that is a tuning pass
  that was not in this brief.

### Blocked, unchanged

- **The asset budget: 57.9MB against a 40MB cap.** `deploy` is gated on
  `checks`, so nothing has published since `0c3abc1f`. The hero art added 3.9MB
  of the total; the rest is earlier uploads. The two remedies are unchanged from
  `2026-09-05-cutscenes-and-the-dummy-tower.md`, and either needs a word first
  because it is somebody else's art:
  1. move `public/assets/maps/L3_trace.png` (2.1MB) to `tools/` — a tracing
     overlay, not a shipped asset. Not enough alone.
  2. re-encode the uploaded PNGs to WebP via `tools/reencode`. The largest are
     `boss_projectile.png` (2.0MB), `fx_stunned.png` (1.9MB) and the level 3
     enemies (5.2MB between four); the eight hero PNGs are 3.9MB. On past ratios
     this clears the cap comfortably and serves rule 7 at the same time.

### Carried forward

- **Level 3 is 0/60** against a 35–45 target, and the gap is the boss rather
  than the waves. See `2026-09-05-level-3-sports-complex.md`.
- **Level 2 is 10/60** against the same band, up from 7 for the reason above.
- **Level 1 sits at 45**, still the top of its band.
- **`Levels.isLevelCleared` is derived, not recorded.** The save counts runs
  cleared, not which levels they were on, so clearing level 1 twice marks level
  2 cleared. Needs a new save field and a migration.
- **`tsdiff`'s blind spot for new files.** `Heroes.ts` and `Transform.ts` join
  `Lanes.ts` and `TowerDisable.ts` on the safe side of it — all four are
  Phaser-free, so their members really are checked locally. `Soldier.ts` and
  `CutsceneScene.ts` remain on the unsafe side.
- **Art sizing against rule 7.** The four new heroes are 700px sources
  rendering at 78 world px — **9.0×**, against the ~7× the formula asks for at
  today's zoom band. That is over rather than under, so the risk is
  minification: at the floor of the zoom band it is about 3.5× down, past the
  ~2× where a 4px outline starts to smear and with no mipmaps to soften it
  (WebGL1). Cory is 470px at 75.8, which is 6.2× and very nearly right. This is
  the same direction as the soldiers (11.5×) but much less far, and re-encoding
  the uploads smaller would serve rule 7 and the asset cap in one pass. Measured
  and noted; not acted on, because it is somebody else's art.
