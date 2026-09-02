# The ledger card

2026-09-02. Commit `7174f50`. Chrome and content only — no balance number,
cost or mechanic changed, and a test asserts it.

**The trait phrases are the item awaiting your approval.** They are pure data,
in `src/data/towers.json` under `trait` on each tower and each specialization;
changing any of them is a one-line edit and no code moves. The full derivation
is below.

---

## The eighteen trait phrases

Every one is derived from a field in `towers.json` that the tower's code
actually reads. Where two fields could have supported a phrase, the table says
which was chosen and why.

| tower / branch | phrase | len | derived from |
|---|---|---:|---|
| **Slingshot** | Pierces armour | 14 | `armorPierce: 5` — the highest base pierce of any tower (Bramble 3, everything else 0) |
| — Hailstorm | Ignores armour | 14 | `ignoresArmor: true` |
| — Repeater | Chains to 1 more | 16 | `chainTargets: 1` |
| **Grinder** | Ignores armour | 14 | `ignoresArmor: true` |
| — Bonesaw | Executes under 18% | 18 | `executeBelowPercent: 0.18` |
| — Rasp | Ramps up to +110% | 17 | `rampMax: 1.1` (a cap on the ADDED fraction: `1 + min(stacks × per, rampMax)`) |
| **Mortar** | Splash damage | 13 | `splashRadius: 64` |
| — Thunderhead | Splash also slows | 17 | `splashSlowSeconds: 0.7` |
| — Siege | Extra vs armour | 15 | `bonusVsArmored: 1.9` |
| **Longshot** | Long-range splash | 17 | `range: 215` and `splashRadius: 88` — see the flag below |
| — Marksman | Ramps up to +160% | 17 | `rampMax: 1.6` |
| — Deadeye | Chains to 2 more | 16 | `chainTargets: 2` |
| **Bramble** | Slows by 45% | 12 | `slowFactor: 0.45` |
| — Thicket | Chains the slow | 15 | `chainTargets: 1` with `chainFalloff: 1.0` — no falloff, so the slow spreads at full strength |
| — Deadfall | Stuns on hit | 12 | `stunSeconds: 0.6` |
| **Beacon** | Buffs nearby guns | 17 | `supportDamageBonus: 0.3` |
| — Signal Fire | Grants +20% range | 17 | `supportRangeBonus: 0.2` |
| — Bonfire | Grants +5 pierce | 16 | `grantsPierce: 5` |

### Four things to flag

**1. No base-tower phrase carries a number that tier 2 changes.** A phrase is
per tower and per branch, not per tier, so anything tier 2 multiplies had to
stay out of it. Slingshot's pierce goes 5 → 8 and Beacon's bonus 0.30 → 0.47,
which is why neither phrase names its figure. `slowFactor` is the exception
that could have: no tier and no branch multiplies it, so "Slows by 45%" is true
everywhere Bramble exists.

**2. Grinder and Hailstorm share a phrase, honestly.** Both set
`ignoresArmor: true` and both do exactly that. I would rather two towers agree
than invent a difference the data does not have.

**3. Longshot is the one I softened.** "Widest splash" was the obvious phrase
and it is false: measured across every tier and branch, Mortar taking the
Thunderhead branch reaches 115 against Longshot's 99.

```
Mortar    t1=64  t2=72   Thunderhead=115  Siege=61
Longshot  t1=88  t2=99   Marksman=99      Deadeye=153
```

"Long-range splash" draws on two fields — `range: 215`, the highest at tier 1
and tier 2, and `splashRadius: 88` — and is true at every tier and branch. It
is the only phrase in the table that is not a single field.

**4. Slingshot is the closest to a role phrase.** Its only non-baseline
mechanical field is `armorPierce: 5`, and armour is subtracted per shot
(`max(1, damage − max(0, armor − pierce))`), so against the Buckethead's 7
armour that pierce is most of what the tower does. It is a real mechanic rather
than an invented role, but it is the thinnest derivation of the eighteen.

---

## The card

```
┌──────────────────────────────────┐
│  [icon 30]  Slingshot            │   header, 30px
│                                  │
│    17    │    150    │   1.5     │   three numbers, 40px
│    dps   │   range   │   rate    │   hairlines between
│                                  │
│  Pierces armour                  │   trait, 22px
│  ──────────────────────────────  │   hairline
│  ┌────────────────────┐ ┌─────┐  │
│  │     Build 80p      │ │  ✕  │  │   actions, 36px
│  └────────────────────┘ └─────┘  │
└──────────────────────────────────┘
```

**179px tall, every tower, every tier, every branch.** That is the point of the
redesign, and it is arithmetic:

```
pad 12 + header 30 + gap 9 + stats 40 + gap 9 + trait 22 + gap 9 + button 36 + pad 12
```

### What the prose cost, and what went with it

The old panel carried a paragraph, and four levers existed to make it fit:
shrink the body font to a floor, then the row height to a floor, then the title
to a floor, then give up and drop the prose. Each lever recomposed the entire
card at a smaller size and measured it again.

All four are deleted, along with `bodyMinSize`, `rowMinHeight` and
`titleMinSize` in `presentation.json`. A test asserts each by name, because the
temptation when a string does not fit is to add the ladder back rather than
shorten the string.

What remains is `shrinkToFit`, which scales ONE text once against a known
width. It is not a ladder: it never recomposes the card, and it cannot change
the height, because a card whose height moves is the thing being removed.

### Five rows to three numbers

| was | is |
|---|---|
| Damage 11.0 → 19.8 | **dps** — `damage × shots per second`, rounded |
| Rate 1.54/s → 1.71/s | **rate** — kept, third |
| Range 150 → 162 | **range** |
| Splash 64 → 72 | the trait phrase |
| Cuts armour 5 → 8 | the trait phrase |
| Cost 112p | on the button |

`dps` is a display derivation. `towers.json` keeps `damage` and `fireInterval`
untouched, and `tests/towercard.test.ts` asserts Slingshot is still 11/0.65 and
Grinder still 44/1.7 — so a balance change cannot be made under cover of a
presentation change.

`rate` survives as the third number because armour is subtracted **per shot**,
so two towers with the same dps do very different things to a Buckethead. It is
therefore also the right number to drop first: the other two can be reasoned
from, and it cannot.

### The three numbers, measured

| tower | tier 1 | tier 2 | branch A | branch B |
|---|---|---|---|---|
| Slingshot | 17 / 150 / 1.5 | 34 / 162 / 1.7 | **Hailstorm** 64 / 162 / 1.7 | **Repeater** 71 / 162 / 3.1 |
| Grinder | 26 / 180 / 0.6 | 52 / 194 / 0.7 | **Bonesaw** 99 / 194 / 0.6 | **Rasp** 86 / 233 / 1.1 |
| Mortar | 8 / 132 / 0.9 | 16 / 143 / 1 | **Thunderhead** 22 / 143 / 1 | **Siege** 38 / 143 / 1 |
| Longshot | 11 / 215 / 0.4 | 22 / 232 / 0.5 | **Marksman** 52 / 232 / 0.5 | **Deadeye** 22 / 279 / 0.5 |
| Bramble | 9 / 142 / 1.1 | 18 / 153 / 1.2 | **Thicket** 18 / 176 / 1.2 | **Deadfall** 46 / 153 / 1.2 |
| Beacon | +30% / 215 | +46% / 237 | **Signal Fire** +46% / 355 | **Bonfire** +88% / 213 |

(dps / range / rate; Beacon is boost / range.)

### Beacon is the one exception, and it has to be

Its `damage`, `range` and `fireInterval` are **all literally 0** in the data, so
the gun's three slots would read `0 · 0 · 0`. It reports what it actually does —
the damage bonus it grants and the radius it grants it over — and drops the
third slot exactly as the narrow case does. `withChanges` matches by LABEL
rather than by index, so a support tower's two slots can never be compared
against a gun's three by position.

This is a deviation from "dps, range, rate" and it is the only one.

### The price is on the button

"Build 80p", "Upgrade 320p", "Sell +45p". The separate cost row is gone.

The refund is **signed**, because `45p` and `+45p` mean opposite things to a
peanut count and the button is the last thing read before it happens. A free
action carries no number at all rather than a bare `0`.

This also finishes the older SELL/UPGRADE confusion: every option's confirm used
to be the same tick glyph. `icon-confirm` is retired from `art.json` rather than
left declared and undrawn — that is how an unused asset survives a swap — so
`public/assets/ui/icon_confirm.png` is now unreferenced and can be deleted the
next time assets are touched. I have not deleted it, per the instruction.

### The upgrade state

Each number a pending purchase would change shows the current value in muted
grey and the new one in the accent green; each number it would not change
renders plain. It is one comparison of two stat sets, not a per-field
projection, so a branch that changes nothing shows nothing.

### Chrome

| | |
|---|---|
| slab | `#0d1016` at 92%, radius 9 |
| hairline | white at 14%, drawn INSIDE the edge |
| shadow | three rounded rects at falling alpha, 5px spread, 2px drop |
| name | `#f2d06b` warm pale gold |
| values | `#f6ecd9` off-white |
| labels | `#a4b0bd` muted grey |
| trait | `#8fd07a` soft green |
| primary | `#4f8f3f` with a `#35652a` bottom band, no highlight |
| cancel | white at 10% with a hairline |

The hairline is inside the edge rather than centred on it, because a 1px stroke
centred on the boundary is half outside the slab and reads as a light halo
against the map. Contrast came out of the card, never out of the map: the slab
is 92% rather than opaque and the shadow does the separating.

---

## The character limits, in CI

`name 12 · trait 18 · stat label 6 · button verb 8`, in
`tests/towercard.test.ts`. Each test fails on the **first** string over its
limit and names it, rather than reporting a count.

The button verbs are read out of `GameScene.ts` by regex rather than listed in
the test, so a seventh verb cannot be added without being measured. Longest
today: trait `Executes under 18%` at 18/18, name `Thunderhead` at 11/12, verb
`Upgrade` at 7/8.

A schema limit is necessary and not sufficient — an 18-character phrase can
still be too wide for its column — so the browser pass below measures the drawn
width of every string against the card it is on.

---

## Measurement

PENDING — the four-way ledger pass and the dpr suite addendum land here.

---

## Not touched

The ability icons at the bottom of the screen, as instructed.
