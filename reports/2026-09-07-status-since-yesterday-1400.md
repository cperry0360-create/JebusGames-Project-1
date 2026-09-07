# Status: everything since 2026-09-06 14:00

Window: **2026-09-06 14:00 → 2026-09-07 02:40 UTC.** Twenty-nine commits, thirty-five
CI runs, seven reports. Nothing is failing and nothing is in flight.

---

## Waiting on you — three things

**1. A merge. This is the one that matters.**

Twelve commits sit on `claude/hero-art-hud-rework-tqd10v`, green, and **none of it is
on `main` or on the live site.** `main` has not moved since 21:41 yesterday, and
because the deploy workflow is called by Checks on `main` rather than by a push, the
published game is still `9172418` — it has none of the hero art, the HUD chip, the
new unlock model, difficulty modes, cakes, or the level 4 boss change.

```
git fetch origin
git checkout main
git merge --ff-only origin/claude/hero-art-hud-rework-tqd10v
git push origin main
```

A clean fast-forward from `9172418`.

**2. Level 2's fix — measured, recommended, deliberately not applied.**

`theDevil.maxHealth` 6200 → 5200 in `src/data/enemies.json`. One number, 40% win rate
at 480 seeds, and it provably cannot touch another level. The full sensitivity table
and the four rejected candidates are in
`reports/2026-09-07-balance-verification-and-level-2.md`. Say the word and it is a
one-line change.

**3. Whether I was right to move `glitchLichReturn` to 2250.**

The brief said "set the level 4 boss to 1500, nothing else". Doing exactly that turns
`tests/level4.test.ts` red — the return form is pinned at 1.5× the first form by a
documented design rule with a test on it. I kept the rule and moved the finale too,
which is a change you did not ask for. Measured both: **1500/2250 is 44%** (in the
35–45% band), 1500/1800 is 47% (out of it). If you want the literal version, the
revert is one number plus deleting three lines of that test.

Nothing else is blocked. Everything below is done.

---

## What I ran (2026-09-07 00:03 → 02:37, twelve commits, all green)

### Hero art and the HUD chip — `2f8145f`, `82783b3`

Twenty-two art files placed, converted to WebP q95, and measured into `art.json` by
their **ink** rather than their canvas. Cory became two single pictures like the other
four heroes; his walk and attack sheets are deleted, and the powered form is the
Rivian. Ten ability effects stopped being procedural rings and stabs and became real
art. Locked and cooling icon states now come off game state instead of being painted
into the picture.

Then the hero HUD: the wide bar across the top of the map is gone, replaced by a 60px
portrait chip at the bottom with the health drawn on the portrait. Tapping it selects
the hero.

**Three things that were quietly broken and are not any more:**

- Three ability art files were named in `art.json`, requested on every boot, **absent
  from the repository, and green on all four CI jobs.** `tests/assets.test.ts` now asks
  the blunt question with no exemption list.
- `run.sh towerpanel` had been throwing on its first line since the build menu was
  deleted, exiting 0, and reporting success while running none of its assertions.
- Level 3's unicorn boss walked the whole level backwards. One wrong value in
  `enemies.json` — `artFacing: 'left'` on art drawn facing right. It was reported as
  the level 1 boss; level 1's was always correct.

Report: `reports/2026-09-07-hero-art-and-the-hud-chip.md`.

### Progression rework — `71d6199`, `020b66e`, `3e9a32b`

**The unlock model.** `runsClearedToUnlock` is gone. Levels now name the level that
opens them, and the save records which levels have actually been beaten. Before this,
clearing level 1 three times marked levels 1, 2 and 3 beaten and opened level 4 — and
START RUN would drop you straight into it. Captions read "Clear HEAD OFFICE to unlock"
instead of "Clear 2 runs".

**End-of-level screens.** A win offers NEXT LEVEL / REPLAY / LEVEL SELECT / MAIN MENU;
past level 4 the dead button is replaced by LEVEL SELECT plus "More levels coming
soon." A loss offers RETRY first.

**Three difficulty modes** — Lazy Dad Mode, Yeah I Game, Try Hard. They change starting
lives and starting peanuts and **nothing else**, because scaling enemy stats would
change which towers are viable rather than how hard a level is, and would mean tuning
every level three times. `normal` is a literal no-op, proven twice: a test asserts it
against `rules.json` directly, and the 120-seed soak reproduced every published win
rate seed for seed.

**Cakes replace points in story mode.** 0–3 per level from lives remaining, as a
percentage of that run's own starting lives so difficulty cannot decide the score. Best
per level is saved with the difficulty it was earned on. Cakes gate nothing. Banner
Points and the skill tree are removed from story mode but kept whole for run mode, with
a test that fails if anyone tidies the unreferenced module away.

Report: `reports/2026-09-07-progression-rework.md`.

### Balance verification and the level 2 diagnosis — `7ae13d4`

**Verification passed exactly.** All four levels reproduced their expected win rates to
the run — 95, 25, 90, 63 — so neither of the two batches above moved balance they did
not declare.

**Level 4's boss** went 1200 → 1500 (with the finale following at 2250, see item 3
above). 44% at 480 seeds, inside the band. 75% of its losses are the wave 7 fight.

**Level 2 is not a hard level; it is one enemy.** Every single win is 20 of 20 lives —
minimum and maximum both 20. Lose one life anywhere and you lose the level. 367 of 374
losses are on wave 13. Drop the Devil to 100 HP and the whole level is a 98% walkover.

It is not economic (every run reaches him with all fifteen pads filled and money
spare), not pacing, and not a damage-type wall (removing his armour entirely is worth
one point). It is raw damage: **level 2's median loser brings 264 board DPS, which is
exactly level 1's median winner.** The Devil is 6200 HP in the second level — bigger
than level 1's boss, three times level 3's, four times level 4's finale.

Report: `reports/2026-09-07-balance-verification-and-level-2.md`.

---

## What ran before I started (2026-09-06 14:30 → 21:41, seventeen commits)

These were other sessions. I am reading their git log and their reports rather than
recounting my own work, so treat this as a summary of the record, not a first-hand
account. **All seventeen are already on `main`.**

| time | what landed |
|---|---|
| 14:30 | The soft lock fixed: a stale viewport frame could freeze a run, plus a safety net for the class |
| 17:05–17:55 | Level 4 built — The Conundrum: two gates, snow, a boss fought twice, and the Glitch Bug that destroys towers |
| 18:14 | Level 4 tuned to 38%, and why its boss could not be beaten |
| 18:26 | Eli's two abilities: Star Rain and Ice Beam |
| 18:57–19:33 | Three of four reported bugs — the duplicate wallet, the Beacon, the bar |
| 20:26–20:32 | A dark Beacon lifts nothing; the soak learned what a lit one is worth, which re-baselined every level |
| 21:36–21:41 | Two peanuts became one, and the level select became a scrolling road |

The Beacon fix at 20:26 is the reason the win rates everything since is measured against
are what they are — the simulator had been scoring support towers as dead weight.

---

## Health

| | |
|---|---|
| Tests | **947 passing, 0 failing** (up from 932 at the start of my session) |
| Typecheck | clean — `tsdiff` shows one difference from baseline, the known "cannot resolve phaser" for one new file |
| CI in the window | 35 runs, **0 failures**, 0 still running |
| Working tree | clean |
| `main` | green at `9172418`, last moved 2026-09-06 21:41 |
| Live site | `9172418` — **five hours behind the branch** |

Two CI runs in the window show `cancelled`, both on other sessions' branches
(`7a7b93e`, `725783d`). Both were superseded by a later push on the same branch that
went green, and both of those branches are now merged into `main`. Nothing failed.

---

## Open items I am not blocked on

Carried forward and not worked this session:

1. **Cake tiers are probably too generous** — level 4 averages 18.8 lives left on a win,
   so most wins likely pay three cakes. Three numbers in `cakes.json` if you want it
   tightened; wants a soak that records cakes rather than wins.
2. **The verdict line and the 2-cake tier disagree at exactly half** — `>` against `>=`,
   so a run finishing on exactly 10 of 20 is awarded two cakes under the words "Barely
   standing."
3. **Dialog buttons fall to about 24 CSS pixels** when a panel scales to fit a phone.
   Pre-existing in kind; the four-button run-end panel made it worse in degree. Fixing
   it properly means making the panel shorter rather than scaling it, which is a layout
   change I did not want to make unasked.
4. **World map node cakes are 24–25 CSS px on a phone**, not the 32 the brief asked for.
   32 CSS px there is 59 design units and three of those do not fit on a 160-unit node.
   Needs someone to say whether the floor meant design units or CSS pixels.
5. **Courtland's ability names disagree with his icons** — the art says *Seismic* and
   *Mind Control*, `heroes.json` says *Shockwave* and *Seismic*.
6. **`fx_mind_control` has art and no mechanic.**
7. **Nine canvas-vs-ink content boxes**, eight of them tower-menu glyphs up to 35% small.
8. **Seven harness scenarios still drive the deleted build menu** — `ui`, `muzzle`,
   `buildall`, `rockets`, `retreat`, `regressions`, `poor`, `typegame`. Each reports
   success while running none of its assertions. **Highest-value item on this list.**
9. **The hero's two ability medallions go dead after the Server Nuke drops.** Confirmed
   pre-existing. A hero losing half their kit mid-run is worth a session of its own.

And one thing found while diagnosing level 2 that is not a bug but is not written down
anywhere either: **level 1 has seven build pads; levels 2, 3 and 4 have fifteen, fifteen
and fourteen.** That is a larger difference than anything in the wave tables, and it
means level 1's and level 2's boss health figures were never on the same scale.

---

## Other branches

Five older branches are unmerged and all predate this window (04–05 September):
`deployment-status-review`, `github-pages-deploy-trigger`, `level2-volcanic-map-recreation`,
`main-branch-ci-checks`, `scatter-props-tree-line`, and `soak/overnight`. I have not
looked at what is in them and am not claiming they hold anything you still want — only
noting they exist so the list is complete.
