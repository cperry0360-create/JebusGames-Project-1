# Is everything pushed? — status at 2026-09-07 12:00 UTC

**Yes, with one exception, and it is a brief that was never started rather than
work sitting unpushed.**

| | |
|---|---|
| local `HEAD` | `6f38dec` |
| `origin/main` | `6f38dec` |
| unpushed commits | **0** |
| working tree | **clean** |
| CI on main today | **11 runs, 0 failures** |
| newest github-pages deployment | `6f38dec`, **success** — the same commit as HEAD |
| tests | **962 passing, 0 failing** |

Nothing is stranded on a branch: everything went straight to `main`, and the live
site is serving the current tip.

---

## The one thing outstanding

**The three ability fixes have not been started.** They arrived in the same message as
the four level-select bugs, I said so at the time, and they are still untouched:

1. **Star Rain should land where you tap** — Eli's slot 1 is still self-centred.
   Confirmed just now: `eli.slot1.targeted` is `false`.
2. **Courtland's effect art does not appear.** Confirmed: **both** of his slots point at
   the same `fx-seismic`, so `fx_mind_control` is referenced by nothing at all. That is
   almost certainly the whole of that item.
3. **The ability set did not fully land.** Confirmed — **Courtland is the only hero
   wrong**, and both his slots are:

| hero | slot 1 | slot 2 |
|---|---|---|
| Cory | Haymaker ✓ | Spike Strip ✓ |
| **Courtland** | **Shockwave** (want Seismic) | **Seismic** (want Mind Control) |
| Han | Ember ✓ | Fireball ✓ |
| Eli | Star Rain ✓ | Ice Beam ✓ |
| Bailey | Bark ✓ | Zoomies ✓ |

So Courtland's set is shifted by one: the intended slot 1 name is sitting in slot 2, and
slot 2's ability does not exist yet. It is not on an unmerged branch — nothing in the
repository has ever named Mind Control as an ability.

---

## Everything that went out today

Twenty-five commits, 00:03 to 11:57 UTC, every one on `main` and green.

| time | commit | what |
|---|---|---|
| 00:03 | `2f8145f` | Hero art batch: 22 files, ten power effects, the three 404s that CI never caught |
| 00:42 | `82783b3` | Hero facing, the backwards unicorn boss, and the HUD portrait chip |
| 01:18 | `71d6199` | Levels name their prerequisite; a win offers somewhere to go |
| 01:49 | `020b66e` | Three difficulty modes — lives and money only |
| 02:11 | `3e9a32b` | Story mode pays in cakes; points kept whole for run mode |
| 02:24 | `7ae13d4` | Level 4's Lich King to 1500 (finale 2250) |
| 09:55 | `622086d` | Status roll-up |
| 10:07 | — | **The merge to main and the first deploy of the day** |
| 10:24 | `862ecf7` | Level 2's Devil to 5200 |
| 11:07 | `39cca69` | Eleven blind harness scenarios, and the guard that let them stay blind |
| 11:21 | `3d4dea3` | BUG A and B — map falling through to a level; every cake reading unearned |
| 11:32 | `c03af43` | BUG D — difficulty readout into the chrome bar; BUG C not reproduced |
| 11:53 | `ee0ea6c` | The missing-icon stand-in is fitted to its slot |

Plus eight dated reports in `reports/`, each with its own CI row filled in after the
fact.

---

## Where the briefs landed

| brief | state |
|---|---|
| Hero art and the HUD chip | **done**, deployed |
| Progression rework — unlocks, difficulty, cakes | **done**, deployed |
| Balance verification + level 4 boss + level 2 diagnosis | **done** |
| Merge to main and confirm the deploy fired | **done** |
| Devil to 5200 + the fake harness scenarios | **done** |
| Four live bugs — A, B, D | **done**, deployed |
| Four live bugs — **C, the black pill** | **not reproduced**, detector left behind |
| The oversized placeholder in the ability bar | **done**, deployed |
| **The three ability fixes** | **not started** |

---

## Two things that are closed as far as I can take them, not fixed

- **BUG C, the black vertical pill.** Not reproduced at 2.25:1, 2.26:1 or 2.16:1 — 93
  objects on the map, none tall-and-narrow at either edge, 0.0% of the left 24 px below
  luma 40 against parchment at ~130, and all three DOM overlays ruled out. The `mapedge`
  scenario will answer it in one command given your exact viewport and device ratio. The
  quickest single clue: **does the pill fade after about five seconds?** The toast is the
  only dark rounded element in the game.
- **Your earlier hard crash on the level select screen.** The save-migration theory was
  tested against the reconstructed legacy shape and three partially-migrated shapes and
  does not hold — none of them crashes, and progress migrates intact. The save that
  crashed has been overwritten, so there is no evidence left to work from.

---

## Still open, carried from earlier reports

1. The fault guard's blast radius across the other ~90 harness scenarios is unmeasured.
2. Pad 3 on level 1 will not open its ring at 844x390 (works at 1400x708).
3. A tap on the hero does not select him — the pointer route, not the selection.
4. `icons`' three claims are unguarded after that scenario was deleted.
5. Cake tiers are probably too generous — most wins likely pay three.
6. The verdict line and the 2-cake tier disagree at exactly half (`>` against `>=`).
7. Dialog buttons fall to about 24 CSS px when a panel scales to fit a phone.
8. World map node cakes are 24–25 CSS px on a phone, not 32.
9. Nine canvas-vs-ink content boxes, eight of them tower-menu glyphs up to 35% small.
10. The hero's two ability medallions go dead after the Server Nuke drops — possibly
    related to (3), since both are the hero's own controls losing their input route.
