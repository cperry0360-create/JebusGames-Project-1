# Courjahan Defense — audit

**Date:** 2026-08-31 · **Build:** `main` @ `af0a159` · **Phase:** 1

Played through in the headless-Chromium harness (`tools/harness/`), which runs
the shipping source and drives it with real mouse and keyboard events. Fifteen
scenarios, ~60 screenshots: every screen, a full wave, a twelve-wave run, the
boss, the Last Stand, both endings, and each ability.

**No gameplay was changed.** Everything below is a finding, not a fix.

Every visual claim here was checked at 4–6× zoom on a real frame, or computed
from the manifest, before it was written down. Four things that looked wrong in
a downscaled screenshot turned out to be fine on inspection and are not listed
— including two I was about to report as bugs in my own work from today.

Ordered by how much it hurts a player.

---

## Summary

The loop works. You can start a run, draft, build, fight thirteen waves, watch
Cory get into an SUV, fight a boss, and win or lose — and every one of those
beats has art, sound and feedback behind it. That is the Phase 1 bar and it is
met.

What is weak is the **middle of a run**. From about wave 8, peanuts pile up with
nothing to buy and no decision left to make. That is finding #1, it has a single
cause, and it matters more than everything else here combined.

---

## Critical

### 1. The economy runs out of decisions around wave 8

Cumulative peanuts earned, against the cost of the most expensive board that can
exist:

| After wave | Peanuts earned | Cost to fill all 7 pads with the dearest tower |
|---:|---:|---:|
| 3 | 563 | 1365 |
| 5 | 861 | 1365 |
| 8 | 1563 | **1365** |
| 13 | 4384 | 1365 |

By wave 8 the player can afford the best possible board. There are seven pads,
six towers, and **no upgrade path at all**. `TowerDef.buildTime` exists in
`towers.json`, is `0` on all six towers, and is read by nothing. `DESIGN.md`
specifies "each tower has 2 peanut-purchased upgrade tiers plus a branching
tier-3 choice" and "build time scales with tier". None of it is built.

Consequence: waves 9–13 are watched, not played. Observed directly — at wave 13
the run is sitting on **663–810 peanuts with four of seven pads still empty**,
because there is no reason to keep spending.

This also **defuses The Politician**. His design is that he takes a percentage
of *current* holdings, so hoarding is punished and spending rewarded. With
nothing worth buying, hoarding is not a choice the player made — it is the only
available state, and the counterplay he exists to create never happens.

*The fix is Phase 2 work. The diagnosis matters now: adding waves or tuning
damage will not touch this.*

### 2. Two of the four HUD ability slots show the wrong art

Cory's own two actives point at sprites that were never meant for them:

| Slot | `icon` | Resolves to | What the player sees |
|---|---|---|---|
| **Haymaker** (E) | `turret-writeoff` | `towers/tower_writeoff.png` | a **tower** |
| **Restructure** (R) | `tower-base` | `kenney/towerDefense_tile181.png` | a **blank placeholder tile** |

They sit directly beside two purpose-made ability cards (Molotov, Glacier), so
the mismatch is unmissable — one slot is a building, the next is an empty
hexagon. `tower-base` is also the last Kenney placeholder still visible anywhere
in the game; `art.ui.towerBase` was already set to `null` when the towers gained
their own bases, but the file and this reference outlived it.

Two of Cory's four buttons look broken. This is the most visible defect in the
build and probably the cheapest to fix — it needs two icons.

### 3. Selecting a tower does nothing

Clicking a built tower prints its name and flavour to the message line and draws
its range ring. That is all — no upgrade, no sell, no stats, no action.

A player who clicks a tower is asking "what can I do with this?" and the answer
is a sentence. The `sell` sound cue sits in `audio.json` unplayed, which is the
same gap seen from the other side.

---

## Major

### 4. Full-width banners cover the lane mid-wave

The rare-drop banner and the boss name card both run the full canvas width
across the middle of the screen for ~2 seconds, hiding the lane and everything
walking down it.

Fine for the boss, who arrives at the start of his own wave. Not fine for the
Server Nuke, which fires **mid-wave** off a kill — the player loses sight of the
fight at the exact moment they are handed a decision.

### 5. `K` and `X` are unreadable in the UI font

`KenneyFutureNarrow` draws `K` and `X` with squared-off diagonals that read as
`H` at UI sizes, and an `R` that reads as `A`. Verified at 5× zoom on a real
frame — the credits dedication renders as:

> HEROES ARE NAMED AFTER THE FAMILY. CORY **WORHS** IN **TAH**.

`CLAUDE.md` says "Cory works in tax, not audit. This matters." **The word "tax"
cannot currently be read on screen.** The title blurb has it too: "MILD-MANNERED
**TAH** ADVISOR… NOT AN **AUDITOA**."

The display face at large sizes is fine — the 46px `CREDITS` heading is clean.
It is the narrow UI face at 12–15px that fails. Changing it is a call about the
game's typographic identity, which is why it is here rather than fixed.

---

## Minor

### 6. A corner click mutes the game

The volume control's hit area is x 19–53, y 667–701. The harness's
careless-player scenario clicks (20, 700) — the bottom-left corner of the map —
and mutes the game. There is no confirmation and no undo prompt, and the setting
persists to the next run via save data.

The control works correctly; it is sitting in live map real estate.

### 7. The boss is shorter than a tower

Measured on-screen heights:

| | height |
|---|---:|
| Towers | 87.1px |
| **The Politician** | **82.5px** |
| Brute (`finalNotice`) | 66.0px |
| Cory | 60.6px |
| Shredder | 35.2px |

The relative scale between enemies is correct and deliberate — the boss art is
640px against the brute's 512, and 82.5/66.0 = 1.25 preserves that exactly, as
specified. Zoomed in he reads well: clearly the largest thing in his group, with
a distinct silhouette.

The only place it wobbles is against the towers, which are taller than he is. If
you want him to loom, that means breaking the preserved relative scaling — your
call, which is why it is a finding and not a change.

### 8. The in-game credit line understates itself

`HudScene.ts:94` draws `art and fonts: Kenney, CC0` bottom-right. Kenney now
also supplies 32 of the 38 sound cues. The credits *screen* is correct; this
line is stale.

### 9. `WAVE CLEARED` lands on the busiest corner of the map

The announcement is centred at y≈200 and falls across the tavern sign and the
villager. Readable, but it fights the most detailed part of the painted plate.

### 10. Dead data

- `enemies.*.engageRange` — on all four enemies, read by nothing.
- `towers.*.buildTime` — all `0`, read by nothing (see #1).
- `display.hudHeight` — the HUD bar it described is gone; only tests read it.
- `map.roadWidth` — used by tests and docs, not by runtime code.
- `audio.defaultVolume` — duplicates `DEFAULT_SAVE.volume` in `Save.ts`, which
  is the value that actually wins.
- Audio cues `sell`, `error` and `close` are loaded and never played.

Nothing here breaks. All of it is a trap for whoever next tunes a number that
turns out to do nothing.

---

## Specified in DESIGN.md, not built

### Correctly deferred (Phase 2+, and `CLAUDE.md` forbids building ahead)

Holdings · the Banner tree · in-run boons · branching map and nodes · Forge
swaps · acts 2 and 3 and their bosses · the other four heroes · siege enemies ·
flying enemies and anti-air · the 16-tower and 12-ability pools · save/load of
run progress.

### Missing from Phase 1 as `DESIGN.md` scopes it

- **Passive abilities.** `DESIGN.md` lists ten and says you draw one per run;
  Phase 1 asks for three. **Zero exist.** Cory's *Depreciation* is a hero
  passive hard-wired into `Hero.ts`, not a drafted one. The draft screen offers
  actives only, so half of the "one of each" the design describes is absent.
- **Tower upgrade tiers.** See #1. This is the big one.
- **Enemy roster.** Phase 1 asks for four types and four exist — but one is the
  boss, so waves 1–12 draw from three.

### Built beyond Phase 1

Not a problem, but worth knowing the scope has moved: six actives plus the
Server Nuke against Phase 1's four; painted map, towers, heroes and UI against
"placeholder Kenney art"; and a full audio pass that `DESIGN.md` schedules for
Phase 3.

---

## What is working well

Recorded so it does not get refactored away:

- **Tap precedence.** Pad → tower → hero → ground, with the hero only taking
  ground orders while selected. Verified: a tap on grass beside the sign is
  still a hero order, and a tap on the sign never costs a build.
- **The Last Stand.** Shake, flash, half-second pause, then the SUV. Reads
  exactly as intended, and the vehicle is convincingly wider than the road.
- **Boss presentation.** Name card, phase-marked health bar, floating
  `-N PEANUTS`, red flash, distinct sting. Only the sprite scale lets it down.
- **Enemy health bars.** 0.85× sprite width, 7px above the art, colour-stepped
  at 50% and 25%. Checked in a dense pack around the boss: legible.
- **The plate chrome.** Sliced by hand rather than via Phaser's WebGL-only
  `NineSlice`, so it survives a Canvas-renderer fallback — which is exactly what
  the harness runs under.
- **The sign easter egg.** Sits on the painted board exactly, swaps without
  jumping, and refuses politely when you are broke.

---

## Suggested order

1. **Ability icons (#2)** — two files. The build's most visible defect.
2. **Tower upgrades (#1)** — the run's real problem, and #3 largely solves
   itself once a selected tower has something to offer.
3. Banner width mid-wave (#4), credit line (#8), dead data (#10) — small.
4. **The font (#5)** and **boss scale (#7)** — both need your call, not mine.
