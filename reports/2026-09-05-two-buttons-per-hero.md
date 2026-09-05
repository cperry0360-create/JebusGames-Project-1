# Two buttons per hero, and a hero start that needs no measuring

*2026-09-05 · Courjahan Defense · main*

| commit | what | CI |
| --- | --- | --- |
| `b92bcc8` | Give every hero two buttons, and start them all in the middle | ❌ asset budget only |

Everything is on `main`. Nothing was branched.

This brief re-sent the roster and transformation work from
`2026-09-05-heroes-and-the-transformation.md` — already shipped in `0195b93` —
with three genuinely new parts, which are what this covers: **a slot-1 ability
per hero**, **a reserved slot-2 hero power**, and **the hero start moving to the
centre of the board**.

## Slot 1: five different buttons

Until this commit every hero carried a verbatim copy of Haymaker — same name,
same 130 damage, same 12-second cooldown — so the roster's one real choice was
between five identical punches. Now:

| hero | slot 1 | effect | cooldown | reach | on-hit | slot 2 |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Cory | Haymaker | punch | 12s | 120 | 130 + 150px knockback | Loophole |
| Courtland | Shockwave | burst | 8s | 100 radius | 62 + 0.9s stun | Overclock |
| Han | Ember | burn | 9s | 150 | 30, then 20/s for 4s | Firestorm |
| Elijah | Quick Cut | double | 8s | 92 | 2 × 52, armour ignored | Bedrock |
| Bailey | Bark | howl | 6s | 125 radius | nothing, 55% slow for 3.5s | Fetch |

**Cory's is untouched, to the number.** It is what the rest of the game was
tuned against.

The shape is one block of fields for all five, with `effect` choosing which of
them are read, and one entry point in the scene that switches on it. A sixth
hero is a JSON entry rather than a method. Every skill declares **every** field,
zeros included, so `damage: 0` on Bark is a statement rather than an omission
and nothing downstream reads `undefined` as zero by accident.

Three things are enforced by tests rather than by care:

- reach lives in exactly one of `range`/`radius` — an area skill lands where the
  hero stands and cannot miss; a targeted one needs somebody;
- every `sound` and `voice` names a cue that exists in `audio.json`, because a
  cue that does not exist warns at play time and a warning is a soak failure;
- the two cues fire **after** the cooldown starts, and every refusal returns
  above it — so a press refused for cooldown, for the hero being down, or for
  nothing in reach makes no sound at all.

## Slot 2: reserved, gated, not built

The second hero slot has been in the bar's layout since the Server Nuke work; it
held Restructure until that was cut. It now holds the hero power.

- The button is wired and drawn. `effect: null` in the data is what says it is
  not implemented, and the test asserts that so the day it gains an effect,
  something asks whether everything else about it was finished too.
- **Greyed, not hidden.** A player should be able to see that the power exists
  and read its icon while it is out of reach — the difference between a locked
  door and a wall. `slotUsable` false already swaps the icon for its greyscale
  copy and takes the tap rectangle with it, so it cannot be pressed by accident.
- The gate is `powered && !down`, asked of a status flag rather than of the hero
  — the HUD is a separate scene and cannot reach into him.
- Pressing it while powered starts no cooldown and spends nothing. It says it is
  not wired up yet, which is honest; an in-world excuse would be a lie the
  player would eventually catch.

The names (Loophole, Overclock, Firestorm, Bedrock, Fetch) are placeholders
chosen to fit each hero, and the data says so. Rename them freely.

## The hero starts at the centre of the board

`heroStart` is gone from `MapDef`, from all three map files, from the harness
and from every reader. The hero starts at half the world's width and half its
height on every level.

The old scheme owed every new painting a measurement, and level 2 shipped one
that put his head above the top of the screen — 129px of his footprint in a lava
field — which is exactly the failure a rule that is the same on every map cannot
have. Three per-level tests, each checking a different measured value against a
different set of clearances, collapse into one shared test.

What the centre costs is roadside clearance. Measured:

| level | centre to lane centreline | road half-width | **clear of the road's edge** | nearest pad |
| --- | ---: | ---: | ---: | ---: |
| level 1 | 146.5 | 40.0 | **106.5** | 84.1 |
| level 2 | 131.2 | 32.9 | **98.3** | 40.8 |
| level 3 | 48.2 | 27.3 | **20.9** | 93.7 |

Levels 1 and 2 are comfortably clear — better than the measured values they
replace, in fact. **Level 3 is not**: the hero's footprint is about 55px wide, so
at 20.9px from the road's edge it overlaps the track. He stands at the roadside
rather than back from it.

That is a consequence of the rule, not a bug, and on a fork it is arguably where
a hero is worth most — he covers whatever comes down either branch. But it is a
visible change on that level and you should know about it before you see it. Two
other things worth flagging:

- **Level 2's centre is 40.8px from a build pad**, whose tap radius is 34. The
  hero stands essentially on top of it, so tapping that pad and tapping the hero
  compete for the same thumb. Tap precedence between them is unchanged and
  untested here — the browser harness cannot run in this environment.
- His head is at y=240 on every level, well inside the board, and his feet at
  y=360. The sprite renders fully on-board everywhere, which is asserted.

## Icons

The ten uploaded `ability_<hero>_<slot>.png` files replace the single shared
`ability_haymaker.png`. **Cory's Haymaker moved onto the new scheme with
everyone else** rather than keeping its own finished art: one hero's real icon
beside four marked placeholders would have read as four bugs, and the brief says
the placeholders are to be replaced by files with the same names. The old file
is still in the repo and unbound; re-binding it is one line in each of two data
files, and `art.json` carries a note saying so.

**Two files were not in the upload**: `ability_bailey_1.png` and
`ability_eli_1.png`. Every other one is present. Those two keys are marked
optional, so the loader skips them with a warning rather than failing at boot,
and `GameScene.abilityIcon` now checks the texture before handing it to the bar
— a manifest key with no file behind it draws Phaser's missing-texture green in
the middle of the ability row, which reads as a rendering fault. They fall back
to the generated stand-in instead, and dropping the real files in later needs no
code change at all.

## Soak

Level grid, all-normal, 60 seeds, default hero — the number every previous
report tracks:

| level | before | after |
| --- | ---: | ---: |
| level 1 | 45/60 | **45/60** |
| level 2 | 10/60 | **10/60** |
| level 3 | 0/60 | **0/60** |

Unchanged, as it should be: Cory's kit did not move.

### The soak was not playing the roster

`coverage.heroes` printed `ALL_HEROES` — the roster — while every single run
used the default. It reported five heroes as covered when one was, in the
section whose only job is to say what was exercised. **The previous report
repeated that claim, and it was wrong**: the 300-run driver in
`2026-09-05-heroes-and-the-transformation.md` played Cory 300 times.

The driver now rotates the hero, weighted towards the default (3 of 7 runs),
and reports the set that actually took the field. That re-baselines its
aggregate from 133/300 won to **118/300** — a change in the measurement, not in
the game. The per-level grid above is all Cory and is unaffected.

At 300 runs with the rotation: 0 crashes, 0 console hits, 0 findings, 0 stuck
runs, all five heroes played, and `heroSlot1` in `abilitiesSeen` — so all five
effects run clean through the rule layer.

### The heroes are not equally strong

Per hero, 40 seeds each:

| | cory | courtland | han | eli | bailey |
| --- | ---: | ---: | ---: | ---: | ---: |
| level 1, before | 31/40 | 27/40 | 31/40 | 29/40 | 25/40 |
| **level 1, after** | **31/40** | **21/40** | **23/40** | **19/40** | **21/40** |
| level 2, after | 8/40 | 0/40 | 0/40 | 0/40 | 0/40 |

The "before" row is the four of them carrying a free copy of Haymaker, which was
strictly the strongest ability in the game. Losing it costs 6–10 wins in 40.

I tuned the four new skills up once from their first draft — Shockwave 46→62 and
its stun 0.7→0.9s, Ember 22+14/s→30+20/s, Quick Cut 38→52 and armour-ignoring,
Bark's slow 0.55→0.45 for 3.5s instead of 2.5 — which recovered 2–3 wins each
and no more. I stopped there, because the numbers say the ability is not the
lever:

- **Knockback is not it.** Giving Shockwave 90px of knockback changed 21/40 to
  21/40.
- **Damage is not it.** Quick Cut is 104 armour-ignoring damage per 8s — a
  higher rate than Haymaker's 130 per 12s — and Elijah is the worst of the five
  at 19/40.
- **The passives are.** Cory's Depreciation shreds 1.6 armour/s to a maximum of
  7. The others: Han 1.3/6, Elijah 1.1/5, Courtland 0.9/4, Bailey 0.7/3. That is
  a straight power ladder with Cory at the top, and it was my own choice during
  the roster work, not yours. The heroes were meant to trade — Elijah holds four
  where Bailey holds two, Han reaches 122 where Bailey reaches 70 — and armour
  shred is not a trade, it is just more.

**This is a decision for you, not a fix I should make unasked.** Level 1's
35–45 band was measured with Cory, and Cory still sits at 31/40 (46.5/60,
top of the band) while the others sit at 28–34/60, below it. Flattening the
passive ladder to something near Cory's would close most of the gap and is a
five-number change in `heroes.json` — but it moves five tuned numbers, and the
last two briefs were explicit about not touching tuned values without being
asked. Say the word and it is ten minutes.

## Tests

**762 tests, 761 pass.** The one failure is the asset budget, pre-existing and
not mine.

New, covering the brief's named cases:

| case | how |
| --- | --- |
| each slot 1 ability fires | driven through the soak per hero; a skill that could never fire shows up as an absence in `firedAbilities` |
| …and respects its cooldown | against the real `Cooldowns`, per hero, at each declared length: ready, spent, still spent just before, back on time |
| slot 2 unusable in base form, enabled in powered | the rule alone, then across a simulated life (base → powered at half → base after a death), then that the HUD asks that rule and greys rather than hides |
| the hero starts at the centre, on every level | one shared test: `heroStart` gone from all three maps, head and feet on the board, not standing in the road, and nothing reading a per-map value |
| every hero declares a whole slot 1 | the field list, the effect, the reach in the right field, cues that exist, `slot2.effect === null`, and ten distinct button names |

Eleven invariants were updated rather than worked around, each because it
encoded the old content:

- the audio ordering test named `castHaymaker` and two literal cues; there is
  one entry point and five data-named cues now, so it checks the ordering once
  against that and the cue names against Cory's data
- `SlotKind`'s `'haymaker'` became `'heroSlot'` — naming the kind after one
  hero's punch made the bar read as though Bark were a Haymaker
- the ability-bar fixture faked a second hero slot with Restructure; there is a
  real one now
- "a hidden ability keeps its slot" — nothing hides today, slot 2 greys, and the
  fixed-id layout stays for the reason it always had
- three per-level hero-start tests, replaced by one shared rule
- "the camera is centred on the board, **not on the hero**" — those two points
  now coincide by construction, so the assertion would be checking the opposite
  of what it meant; what it was really guarding (nothing follows the hero) is
  the test below it
- the icon tests: one shared Haymaker icon became ten per-hero medallions
- `_`-prefixed keys in `art.json` are notes, not sections ART must re-export

`sh tools/tsdiff.sh c0148d2`: baseline 195 distinct errors, working tree 194,
**two introduced** — both `Property 'applySlow'/'applyStun' does not exist on
type 'Targetable'`, in the two new area-skill loops. These are the documented
`tsdiff` blind spot rather than real errors: without `node_modules` the `Enemy`
class loses its Phaser base and `withinRadius` infers `Targetable` instead of
`Enemy`. `AbilityRunner.ts:78` is the identical call on the identical types, has
carried the identical local error for months, and has passed CI's real `tsc`
every time it ran. Giving the call an explicit `<Enemy>` swaps the artifact for
a different one (`Type 'Enemy' does not satisfy the constraint`), so it is left
reading like every other call site in the file.

## CI

Run 85 of **Checks** ([`33988105538`](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/33988105538))
finished red with **exactly one failing test**:

```
✖ the deploy stays small enough to open on a phone
  AssertionError: assets total 58.0MB, which is a long wait on a phone
```

The 761 other tests passed on the runner as they do locally. `main` has been red
on this same test since `c9ea190`, and `npx tsc --noEmit` is skipped when tests
fail — it was skipped again here — so **local `tsdiff` remains the only
typecheck evidence for everything since then**. `deploy` was skipped, as it has
been for every commit since `0c3abc1f`.

## Where this leaves the repository

### In flight

Nothing. Everything is pushed and the working tree is clean.

### Waiting on a word

- **The hero balance spread**, above. Five heroes, 19–31 wins in 40 on level 1.
  The diagnosis is the passive ladder; the fix is five numbers; it is your call.
- **`ability_bailey_1.png` and `ability_eli_1.png`** are still missing. Both are
  marked optional and fall back cleanly, so this is not blocking anything.
- **Slot 2's five powers are unwritten**, by design — this brief reserved them.
  The names are placeholders.
- **Level 3's hero start is 21px off the road's edge**, so his footprint is over
  the track. Deliberate, per the brief, and easy to revisit: the centre is one
  constant.
- **The asset budget: 58.0MB against a 40MB cap.** `deploy` is gated on
  `checks`, so nothing has published since `0c3abc1f` and none of the last five
  features are on the live site. Remedies unchanged from
  `2026-09-05-cutscenes-and-the-dummy-tower.md`: move `L3_trace.png` (2.1MB) to
  `tools/`, and re-encode the uploaded PNGs to WebP via `tools/reencode`. Either
  needs your say-so because it is your art.

### Carried forward

- **Level 3 is 0/60** against a 35–45 target; the gap is the boss, not the
  waves. See `2026-09-05-level-3-sports-complex.md`.
- **Level 2 is 10/60** against the same band.
- **Level 1 sits at 45**, the top of its band, with Cory.
- **`Levels.isLevelCleared` is derived, not recorded.** The save counts runs
  cleared, not which levels they were on.
- **`tsdiff`'s blind spot.** `HeroSkills.ts` joins `Heroes.ts`, `Transform.ts`,
  `Lanes.ts` and `TowerDisable.ts` on the safe side — Phaser-free, so its
  members really are checked locally. `Soldier.ts` and `CutsceneScene.ts` remain
  on the unsafe side, and the two `Targetable` messages above are the same
  blind spot showing up in a checked file.
- **Art sizing against rule 7.** The four new heroes are 700px sources rendering
  at 78 world px — 9.0× against the ~7× the formula asks for. Over rather than
  under, so the risk is minification. Unchanged from the last report.
