# The Mind Laser that spent itself on a tap, and the Glacier that did nothing

2026-09-07. Two fixes, independent of each other, on
`claude/mind-laser-glacier-fixes-ne2f14`.

| Commit | What | CI |
| --- | --- | --- |
| `9847c84` | Both fixes, their tests, and two harness repairs | **green** — run 207, `test` success, `typecheck` success, `deploy` skipped (branch) |
| `<this commit>` | This report | inherits `9847c84`; docs only |

Baseline for every comparison in this document is `12258d7`, which is `main`
and which CI accepted (run 206, `success`).

---

## 1. The Mind Laser spent itself on a tap

### What was wrong

`endHeldAbility` starts the cooldown only when `h.fired` is true, and that is
correct. What was wrong is *when* `fired` became true.

The beam exists from the instant of the press. That is deliberate — it is aimed
along the hero's facing until a board aim arrives, because a held button that
draws nothing reads as a button that did not work, and `beginHeldAbility`'s
comment makes exactly that argument. But `updateHeldBeam` did not distinguish
the two: the facing beam damaged, drained `left`, and set `fired`.

So pressing the medallion and letting go fired a short burst at nothing and
put a 20-second ability away. The only way to actually use it was to press and
then drag off the button, which no player would guess.

### The fix

`onBoard` was already in the `HeldBeam` struct and is precisely the line
between the two: it records that the finger has reached a point the *board*
owns, so there is an aim the player chose rather than one the hero's facing
supplied. `updateHeldBeam` now returns before any of the three things a press
must not cost:

```ts
const aim = h.onBoard ? { x: h.aimX, y: h.aimY } : this.facingAim(h.def)
this.aimHeld(aim.x, aim.y)          // still drawn, always
if (!h.onBoard) return              // nothing below this line is free
h.left -= dt
...
h.fired = true
```

`aimHeld` is still called every frame before the gate, so the picture is
unchanged during the pre-aim phase. Nothing else moved: the cooldown still
hangs off `fired` and nothing else, and release still ends the beam.

One string changed with it. `"Mind Laser: drag to aim, let go to stop."` was
true and not enough — it did not say that dragging onto the *board* is what
starts the beam, which is the one thing the player has to do and the one thing
nothing on screen said. It now reads `"Mind Laser: drag onto the board to
fire."`

### Measured, in a browser

`sh tools/harness/run.sh courtland 180 844x390`, sections 6b and 6c, which are
new. Against the fixed tree:

```
held on the medallion for 0.5s: onBoard=false  budget 10.00 -> 10.00  fired=false  beam still drawing=true
   let go without ever leaving the button: cooldown ready=true
0.4s on the button then 0.5s on the board: budget 10.00 -> 9.29 (spent 0.71s of game time for 0.5s real)
RESULT Courtland's three behave as specified
```

0.71 game seconds for 0.5 real seconds is `pacing.gameSpeed` 1.4, so the beam
spent exactly its board time and nothing else.

**The same two sections, run against the baseline code** (the new `index.html`
copied into a worktree at `12258d7`, so the scenario is new and the game is
old):

```
held on the medallion for 0.5s: onBoard=false  budget 10.00 -> 9.30  fired=true  beam still drawing=true
   let go without ever leaving the button: cooldown ready=false
   *** an unaimed beam drained its own budget
   *** an unaimed beam counts as having fired
   *** a tap on the medallion spent the cooldown
   *** the pre-aim phase spent budget
RESULT *** 4 fault(s) in Courtland's abilities ***
```

That is the point of running it both ways: the measurement can move, so a green
result on the fixed tree means something. `courtland` was otherwise green at
the baseline (`RESULT Courtland's three behave as specified`), so the one fault
the first fixed-tree run reported was mine and is explained below.

### One existing harness assertion had to change

Section 6's "the budget runs out on its own" step wound `held.left` down to
0.05s on an *unaimed* beam and waited for it to end. Under the fix an unaimed
beam does not spend its budget at all, so that step now measures nothing; it
sets `onBoard` alongside `left`. It passed throughout the bug for the wrong
reason, which is worth saying rather than quietly editing.

The older "pressed and let go instantly" step also passed throughout the bug,
because it releases synchronously in the same JS turn and `updateHeldBeam`
never runs once. 6b holds the press across half a second of real frames, which
is what tells the two apart.

---

## 2. The Glacier was invisible and did nothing

### (a) Art

`art-source/fx_glacier.png`, 4096x512, eight 512x512 cells, converted with
`sh tools/towebp/run.sh 900 public/assets/effects/fx_glacier.png`:

```
public/assets/effects/fx_glacier.webp   1.09 -> 0.48 MB  (56% off)  PSNR 39.2 dB  alpha off by <=0 on 0px
```

The alpha is bit-exact through the encode, so every measurement below is the
same whether taken off the PNG or the WebP. The PNG was removed after the
check; the source stays in `art-source/`.

**The frames.** Measured with `tools/png.py` at alpha > 16:

| frame | ink x | ink y | w x h | widest opaque row |
| --- | --- | --- | --- | --- |
| 0 telegraph ring | 130–381 | 237–439 | 252x203 | y343 |
| 1 | 127–384 | 197–439 | 258x243 | y291 |
| 2 | 129–381 | 119–439 | 253x321 | y284 |
| 3 peak | 126–384 | 62–439 | 259x378 | y275 |
| 4 | 126–384 | 75–439 | 259x365 | y315 |
| 5 | 126–384 | 92–439 | 259x348 | y295 |
| 6 | 125–386 | 168–439 | 262x272 | y306 |
| 7 settled frost | 132–379 | 268–439 | 248x172 | y350 |

Union ink is 262x378. That is `contentWidth`/`contentHeight`. The settled
frame's own ink, 248x172, is recorded separately as `restWidth`/`restHeight` —
a new pair of fields on `SpriteRender`, in the same spirit as `beamCoreHeight`:
a strip's content box is the union across frames, and the union is the wrong
divisor when what has to measure the ability is one particular frame.

**The anchor, and where I departed from the brief.** The brief says the frames
are bottom-aligned with the ground line at roughly 86% of cell height, and to
set `anchorY` near 0.86. The alpha does bottom out at y439 in all eight frames
(439/512 = 0.858), but that is the bottom of the shard spray, not the ground
line. The painted **ground disc** — the telegraph ring in frame 0 and the frost
patch in frame 7 — is centred much higher: the widest opaque row is y343 in
frame 0 and y350 in frame 7, and for an ellipse the widest row *is* the centre
row. Every frame's widest solid row falls between y316 and y353.

At `anchorY` 0.86 and a 128 radius the ground disc would have been drawn about
100 world pixels above the cast point — three quarters of the field's radius.
So the anchor is **0.6836** (frame 7's widest row, 350/512), which is the
frost patch's own centre, and frame 0's ring lands within 7 source pixels of
it. `anchorX` is 0.5: both frames' ink centres are x255.5 of 512.

The brief's other warning is right and still holds — `anchorY` 0.5 would put
the ground disc *below* the cast point and float the eruption above it.

**art.json**

```json
"fx-glacier": {
  "anchorX": 0.5, "anchorY": 0.6836,
  "contentWidth": 262, "contentHeight": 378,
  "restWidth": 248, "restHeight": 172,
  "sheet": { "frameWidth": 512, "frameHeight": 512, "frames": 8 }
}
```

plus `files["fx-glacier"]` and a `glacier` entry in the `fx` role table, so
`AbilityRunner` names a role and never a path.

**How it is drawn.** `AbilityRunner.frostArt` replaces the `add.graphics()`
circle entirely. One sprite, two phases:

- **Eruption** — played once at `presentation.json effects.glacierMs` (640ms),
  scaled uniformly so the *ink* is `radius * 2` across, at depth `y + 5` so the
  shards are over the lane they came out of.
- **Settled** — on `ANIMATION_COMPLETE` the sprite holds frame 7 and is
  re-fitted so its ink is `radius * 2` wide by `radius * 2 * GROUND_SQUASH`
  tall, at depth `y - 1` so enemies walk over it. `GROUND_SQUASH` is 0.62, the
  same constant the meteor telegraph uses. The frost is painted at 0.694
  (248x172), so this squashes it by 11% — an anisotropy of 1.12:1, which is
  nothing next to the 8.25:1 that flattened the Mind Laser, and it buys a patch
  whose footprint is exactly the field in both axes.
- At the end of the field it tweens out over `glacierFadeMs` (400ms).

**One thing found along the way.** `play({ key, duration })` does **not**
override the frame rate the clip was registered with. Measured: the eruption
ran its eight frames in about 330ms when asked for 640, which is `blastMs`'s
25fps. `play({ key, frameRate })` does override it, and that is what
`frostArt` uses. `Effects.playEffect` passes `duration` the same way, so
`splashMs` and `deathPuffMs` may not be taking effect either — **not verified,
listed as open below.**

### (b) Numbers

| | before | after |
| --- | --- | --- |
| damage | 12 | **48** |
| slowFactor | 0.25 | **0.2** |
| duration | 5 | **7** (game seconds) |
| cooldown | 20 | 20 (unchanged) |
| radius | 128 | 128 (unchanged) |

Chain is the yardstick the brief names: 46 damage per jump, five jumps,
armour-ignoring, on an 18-second cooldown. The Glacier lands 48 on *everything*
in a 128 radius, which against a crowd is more total damage than Chain and less
than the Molotov's 85, on a longer cooldown than either. The difference is paid
for by the field. It does not ignore armour, and that has not changed.

`slowFactor` 0.2 means 20% of walking speed. The deepest slow in the game
before this was the Bramble's 0.45, from a tower that fires forever; a field on
a 20-second cooldown with 25% uptime inside one circle should be deeper than
that or there is no reason to draft it. A Shredder at 122 px/s crosses the
256px field in 2.1s normally and cannot cross it at all in 7 game seconds while
slowed, which is the intended feel.

**`duration` 5 → 7 is a unit fix, not a buff.** Every other duration in the
data is in *game* seconds — gnomes' `duration: 18` becomes a `Fighter.life`
spent in the scaled `dt` — but the Glacier's field ran on a real-time
`scene.time` event counting `elapsed += 0.25` against that number, so a "5
second" field lasted 5 real seconds, which is 7 game seconds. The loop now
counts `0.25 * GAME_SPEED` and the data says 7. **On a stopwatch the field is
exactly as long as it was.** This mattered more after the change than before it:
the slow handed to `applySlow` is spent in the scaled `dt`, so a field counting
one unit and a slow counting the other would have ended at different moments.

### (c) The diminishing returns — what `slowDiminish` does, and my recommendation

**What it does.** `rules.json combat.slowDiminish` is
`{ windowSeconds: 6.0, factor: 0.7, minSeconds: 0.4 }`. In `Enemy.applySlow`:

1. If the enemy has gone `windowSeconds` without any slow, the stack count
   resets to 0.
2. The *duration* of this application becomes `seconds * 0.7^stacks`, and is
   dropped entirely if that falls below `minSeconds`.
3. `slowStacks++` and `sinceSlow = 0` — **unconditionally, even when the
   application was refused.**
4. A stronger factor replaces a weaker one; `slowRemaining` takes the max.

It shortens repeated slows. It never weakens them.

**What that did to the field.** The old `glacier()` called `applySlow(factor,
0.6, ...)` on everything in the radius every 250ms:

| t | stacks | dealt |
| --- | --- | --- |
| 0.00 | 0 | 0.60s |
| 0.25 | 1 | 0.42s |
| 0.50 | 2 | 0.294s → **below minSeconds, nothing applied** |
| 0.75+ | 3, 4, 5… | nothing, forever |

The last real slow ended at t = 0.67s. A five-second ice field slowed for two
thirds of a second, and the longer an enemy stayed the less slowed it was.
Step 3 also means `sinceSlow` was reset on every one of the ~20 refused ticks,
so the six-second window never lapsed while an enemy stood in the field — it
walked out with twenty stacks and six seconds of immunity to *every other slow
in the game*. The ability was inoculating what it was meant to freeze.

**Should a field be exempt from `slowDiminish`?**

**Recommendation: no — and it does not need to be.** The diminishing returns
are a rule about *repeated applications*. The 250ms loop was never twenty
applications; it was **one slow, kept alive by a bookkeeping loop**, which the
rule then read as twenty. That is a category error in the caller, not a defect
in the rule.

So the field now grants each enemy **one slow when it enters**, lasting the
rest of the field's life, and takes its stack like anything else:

```ts
let inside = withinRadius(ctx.enemies(), x, y, def.radius)
for (const e of inside) { ctx.damage(...); e.applySlow(def.slowFactor, def.duration, ctx.slowDiminish) }
// every 250ms:
const here = withinRadius(ctx.enemies(), x, y, def.radius)
for (const e of here) { if (inside.includes(e)) continue; e.applySlow(def.slowFactor, left, ctx.slowDiminish) }
inside = here
```

Nothing the diminishing returns exist to prevent is reintroduced:

- A **second Glacier** on the same enemy inside the six-second window is still
  shortened to 0.7x, which is exactly the slow-stacking lock-out the rule was
  added for.
- A **slow tower** firing into the field still stacks against the field's slow
  and vice versa.
- An enemy that **walks out and back in** is not in the previous sweep's
  result, so re-entry is a fresh visit and takes a fresh stack.
- The stack inflation is gone: one visit is one stack, not twenty.

The alternatives I considered and did not take:

- **Exempt fields from `slowDiminish` outright** (a flag on the ability, or a
  `null` diminish). This is what the brief warned about, and rightly: it lets
  two Glaciers stack into a permanent lock-out on the same lane, and it makes
  the field's slow invisible to every other slow source, which is the exact
  shape of the bug the rule was written to kill.
- **Add a `refreshSlow` to `Enemy` that extends without stacking**, and keep
  the 250ms cadence. This is the most precise answer and it is what I would do
  if the tail below ever reads badly, but it is a new public API on `Enemy` for
  one caller and CLAUDE.md rule 6 says to ask first.

**The one cost of the chosen answer, stated plainly.** An enemy that leaves the
radius early keeps its slow for the rest of the field's duration rather than
thawing shortly after stepping out. In practice the field is 256px across and
enemies walk it at 40–122 px/s, so almost everything that enters leaves near
the end anyway; and "it is covered in frost" is not an unreasonable reading. If
it ever looks wrong, `refreshSlow` above is the fix.

### Measured, in a browser

New scenario: `sh tools/harness/run.sh glacier 200 <viewport>`. Identical
numbers at 844x390, 667x375 and desktop (1400x708):

```
glacier: radius=128 damage=48 slowFactor=0.2 duration=7g cooldown=20g
         art=fx-glacier 8x512px  ink 262x378  settled 248x172  anchor 0.5,0.6836
probes parked on the cast point: 4 at 452,437  (furthest from it: 0px of 128)
cast: sprite=fx-glacier  frame=0  clip=fx-glacier  playing=true  at 452,437  cast point 452,437
Graphics objects added by the cast: 0
eruption: display=500x500  ink on screen=256x369  field diameter=256  depth=442 (cast y=437)
eruption screenshot caught frame 5 of 8 (the clip is 640ms)
settled: frame=7  display=529x472  frost on screen=256x159  squash=0.620  depth=436 (cast y=437)
damage: 48,48,48,48 across 4 enemies (data says 48 before armour)
slowDiminish: window=6s factor=0.7 minSeconds=0.4
   t+0.83s real: slowed=true factor=0.20 remaining=5.99g stacks=1
   t+1.67s real: slowed=true factor=0.20 remaining=4.82g stacks=1
   t+2.50s real: slowed=true factor=0.20 remaining=3.62g stacks=1
   t+3.33s real: slowed=true factor=0.20 remaining=2.43g stacks=1
   t+4.17s real: slowed=true factor=0.20 remaining=1.25g stacks=1
   t+5.00s real: slowed=true factor=0.20 remaining=0.08g stacks=1
slowed for the whole field: true   stacks taken: 1 (one visit should be one stack)
after the duration: sprite=gone  enemy still slowed=false
RESULT the Glacier draws painted art, covers its own radius and slows for its whole duration
```

The frost is 256px across for a 256px field diameter, at 0.620:1 — the ground
squash — and at depth 436 against a cast point at y437, so enemies are drawn
over it. The eruption is at depth 442, over the lane. Zero `Graphics` objects
were added by the cast, so the old circle is gone rather than hiding behind the
art. One visit, one stack, slowed for the whole seven game seconds.

### Read from rendered frames

`tools/harness/shots/glacier-01-eruption.png` and `glacier-02-frost-patch.png`
at 844x390, dpr 3, cropped around the cast point:

- **The eruption is painted art.** Crisp shards with painted highlights and the
  game's own outline weight, standing well above the ground line. It is not a
  gradient and it is not a stand-in.
- **The frost patch sits on the ground.** A flat, squashed ellipse of ice lying
  across grass and road, with the enemy standing on top of it. Its centre is
  within about 7 world pixels of the enemy's feet, which is the cast point. It
  does not float.

Reproduce with:

```bash
sh tools/harness/build.sh
sh tools/harness/run.sh glacier 200 844x390
python3 tools/harness/shrink.py tools/harness/shots/glacier-01-eruption.png 950
```

---

## Two harness repairs

Both found while doing the above, both reported rather than hidden.

**`meteor` was dead.** `e.applyStun(60, 1)` — `applyStun` reads
`diminish.windowSeconds` unconditionally, so a two-argument call throws on the
first probe. The scenario died before a single meteor was fired. The exception
guard reports it as a `DIRECTOR ERROR` and `server.py` exits non-zero, so
nothing was *hidden*; nothing was measured either. Fixed by passing
`rules.combat.stunDiminish`. It now reports `18 of 6 meteors (4 targets stacked
there)` and `first impact landed on the tap`. **This is an eighth broken
scenario beyond the seven the brief names**, and it is broken differently: those
seven drive the deleted build menu, this one calls a method wrong.

**The `glacier` scenario's own first red result was the harness.** Parked
before `lookAt`, the probes spent up to 1.8 real seconds of camera pan walking
130–220px up the lane, so the radius was empty when the ability was cast. The
run reported `the eruption damaged nothing under it` and `the field stopped
slowing`, which are the two findings the scenario exists to make. Parking after
the pan, and stunning the probes so they hold still, is the fix. Straight out
of CLAUDE.md's "do not trust a first red result", and it looked exactly like
the product bug.

A third, smaller one: the first pair of screenshots this scenario produced were
two photographs of the settled patch, one of them labelled "eruption".
`shot()` sleeps 140ms and then POSTs a 6.5MB data URL, which takes most of a
second — longer than the 640ms clip. The eruption is captured inline now, timed
at the peak, with the frame number logged beside it so the report can say which
frame the picture shows.

---

## Verification

**From a browser, at real viewports** — all of these ran and are the evidence
for the claims above:

| Check | Result |
| --- | --- |
| `run.sh courtland 180 844x390` | green, 0 faults (4 faults at baseline with the new assertions) |
| `run.sh glacier 200 844x390` | green |
| `run.sh glacier 200 667x375` | green, identical numbers |
| `run.sh glacier 200` (desktop 1400x708) | green, identical numbers |
| `run.sh meteor 220 844x390` | now runs; was a `DIRECTOR ERROR` |
| `run.sh screens 200 844x390` | 1 fault — the title version stamp, **pre-existing** |
| `run.sh screens 200 667x375` | same 1 fault |
| `INSETS=0,47,21,47 run.sh screens 200 844x390` | same 1 fault, no NOTCH |
| `run.sh screens 200` (desktop) | **no layout faults** |
| `run.sh screens 200 375x667` | portrait gated, as designed |
| `run.sh screens 200 390x844` | portrait gated, as designed |

The version-stamp `SMALL` fault was confirmed pre-existing by running `screens`
at 844x390 in a worktree at `12258d7`: identical single fault, same coordinates.
It is a carried-forward item from earlier reports.

**Not from rendered frames:**

- Everything in the tables of measured ink above is read from the source
  pixels by `tools/png.py`, not from a frame.
- The claim that `Effects.playEffect`'s `durationMs` does not take effect for
  other effects is an inference from the Glacier's measurement. It was not
  tested for the blast, the splash or the death puff.
- The balance numbers are argued against the other abilities' data. **Nobody
  has played a run with them.** No soak was run.
- No portrait layout was audited, because portrait is gated.

**Typecheck:** `sh tools/tsdiff.sh 12258d7` — *"baseline 12258d7: 210 distinct
errors; working tree: 210"*, nothing introduced. `npm install` still answers
403 here, so this is a diff against a commit CI accepted, not a real
typecheck. One intermediate version of `glacier()` did trip it (`Set<Enemy>`
against `withinRadius`'s degraded return type) and was restructured rather than
cast away.

**Tests:** `npm test` — **994 pass, 0 fail** (989 at baseline; five new).

New tests:

- `manifest.test.ts` — *a declared sheet grid matches the strip it slices*.
  General, not Glacier-specific: `frameWidth * frames` must equal the file's
  width and `frameHeight` its height, for every sheet in the manifest. Nothing
  checked this, and Phaser does not complain — a wrong frame width slices on
  the wrong boundaries and animates happily.
- `heropowers.test.ts` — *a held beam that never reached the board spends
  nothing*. Asserts the gate exists and precedes all three of `h.left -= dt`,
  `h.fired = true` and `this.damageEnemy(`; that `aimHeld` still runs *before*
  it; and that the cooldown still hangs off `fired` alone.
- `content.test.ts` — three: the Glacier's art is registered as an 8-frame
  strip with an ink-sized content box and a ground-disc anchor, and the code
  draws no `Graphics`; its damage sits between Chain's and the Molotov's and it
  slows deeper than any tower; and the 250ms arithmetic, computed against the
  live `slowDiminish`, showing why the old cadence cannot work.

---

## Where this leaves the repository

**Closed:** both items in the brief. The Mind Laser gate, the Glacier's art,
its numbers, and a recommendation on the diminishing returns that was
implemented rather than only proposed.

**Open, and mine to name:**

- **`Effects.playEffect` may not be honouring `durationMs`.** The Glacier's
  clip demonstrably ignored `play({ key, duration })` and obeyed its registered
  frame rate. Every other effect is played the same way, so `splashMs` (280)
  and `deathPuffMs` (300) are probably decorative and everything is running at
  `blastMs`'s 25fps. Unverified for those, and a one-line fix if it holds.
- **The lingering-slow tail.** An enemy that leaves the field early keeps its
  slow until the field ends. Accepted, argued above; `Enemy.refreshSlow` is the
  fix if it ever reads wrong, and it needs a decision because it is a new API.
- **`abilities.json duration` is game seconds and now says so for the
  Glacier.** Meteor's `duration: 3` still drives a real-time `gap` in
  `AbilityRunner.meteor`, so the barrage takes 3 real seconds against a number
  the rest of the data reads as game seconds. Not touched; not this branch's.
- **The balance numbers are unplayed.** 48 damage and a 0.2 slow are argued
  from the other abilities' data. A soak or a real run is the only thing that
  settles whether the Glacier is now the obvious first pick.
- **`meteor` now runs but asserts nothing.** It reports numbers and has no
  `fail()` mechanism, so it cannot go red on a bad result. Worth giving it one.

**Carried forward, untouched, from the previous reports:** 667x375 scrolls
further on the loadout than it did and the SPECIALS row is below the fold; two
cards in one row can be drawn at different type sizes; the description block
reserves three chips for every hero; `fx-mind-laser`'s `anchorY` is the sustain
frames' answer, so the charge sits about 30 world pixels low for 0.22s; the
seven harness scenarios that drive the deleted build menu (`ui`, `muzzle`,
`buildall`, `rockets`, `retreat`, `regressions`, `poor`, `typegame`);
`CHANGELOG.md` is stale at 2026-09-01 and the entry for these commits belongs
to whoever merges them; the soak has not been re-run; `bossability` reports the
Server Nuke doing 0 damage to the Politician; the hero tap not selecting in
`ui`; the title version stamp reporting SMALL at every phone viewport; pad 3
not building at 844x390; Bug C's black pill; Cory's level-select crash; and the
cake, dialog and typography items from earlier reports.

---

## Merging

```bash
git checkout main
git merge --ff-only claude/mind-laser-glacier-fixes-ne2f14
git push origin main
```

The branch is ahead of `main` at `9847c84` and fast-forwardable.
