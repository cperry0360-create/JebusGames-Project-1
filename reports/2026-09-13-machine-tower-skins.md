# The machine-world tower skins, integrated

**`tower_withholding_t2_machine.webp` will NOT sit too high on its pad, and needs
no offset.** Its ink is flush with the bottom of the canvas — the last opaque row
is y=370 of 371, exactly as the original's is — and `anchorY` is 1.0 for both, so
the base lands on the pad at the same y. What it does instead is render **short**:
88.3 world px of tower where the original puts 107.7, which is **1.2 px taller
than the machine tier 1**. The upgrade from tier 1 to tier 2 has no visual growth.
That is a fact about the art and the fix is a re-export; the smallest metadata fix
trades it for a base 20% wider than the pad. Reported, not applied.

**Levels 1 through 6 are unaffected, and levels 7 and 8 will be too.** No level
that exists wears a skin. Measured three ways: a test asserts every registered
level resolves to no skin and that every skinnable key comes back unchanged for
it; the harness reports levels 1–5 asking for exactly the same 50/50/51/52/52
keys and the same megabytes as a control run at `bda5eaf`; and the `towertiers`
scenario draws a level 1 board through all three Withholding tiers on
`turret-ledger`, `turret-ledger-t2`, `turret-ledger-t3` with 0 px of base drift,
byte-identical to the control.

**Boot and the world map did not move at all.** 111 textures / 79.5 MB and 151 /
88.0 MB, before and after, to the decimal.

## Commits

| commit | what | CI |
|---|---|---|
| `68cbede` | the manifest keys, `towerSkins`, `TowerSkins.ts`, the two draw sites, the tests | run 300 — **`test`, `typecheck` and `changes` green**; `deploy` skipped, because this is a branch |
| `<this line>` | this report | markdown only; CI cell above was filled in after run 300 finished |

`origin/main` is at `bda5eaf` and the branch is that plus these commits,
fast-forward. **Not merged** — see the bottom of this file.

---

## 1. Two premises in the brief were wrong, and one of them mattered a lot

The brief was explicit that **"art.json's `render` block is null for every tower
key. Towers are drawn from `files` alone, with no contentWidth or contentHeight.
So do not go looking for metadata to copy."**

It is not null. All 14 tower keys carry a full render entry:

```
turret-ledger      {anchorX 0.5,    anchorY 1.0,    displayHeight 87.1,  shadowWidth 56.6, content 213x300}
turret-ledger-t2   {anchorX 0.5,    anchorY 1.0,    displayHeight 107.7, shadowWidth 61.0, content 215x371}
turret-writeoff    {anchorX 0.5008, anchorY 0.9902, displayHeight 87.1,  shadowWidth 79.0, content 464x506}
...
```

This is not a documentation nit, because of what `applyRender` does:

```ts
const cfg = renderFor(key)                    // DEFAULT_RENDER when the key has no entry
sprite.setOrigin(cfg.anchorX, cfg.anchorY)    // -> 0.5, 0.5
if (cfg.displayHeight !== undefined) { ... }  // -> no scale applied at all
```

A machine key added to `files` and left out of `render` gets
`{anchorX: 0.5, anchorY: 0.5}` and **no scale**. The tier-2 Withholding tower
would draw at its source size — 371 world px against a board where every tower
is 87 — centred on its own middle, so buried to the waist in its pad. Nothing
throws, no test outside the one added here looks, and the harness screenshot
would be a wall of stone. Following the brief on this point would have shipped
that.

So every skinned key has its own render entry. `anchorX`, `anchorY`,
`displayHeight` and `shadowWidth` are **copied from the original**, which is
exactly right and only because the canvases are identical: `applyRender` divides
by `sprite.height`, the canvas and not the ink, so an equal canvas makes an equal
number an equal on-screen size. `tests/towerskins.test.ts` asserts the canvases
match *and* that the four fields are copied, so the copy cannot outlive its own
justification. `contentWidth`/`contentHeight` are the machine file's own measured
ink, per CLAUDE.md rule 7, because `fitInBox` divides by those.

The second wrong premise is smaller. The brief said the machine t2's ink "covers
58% of the canvas against the original's 73%". Measured at alpha > 16 the figures
are **81.9% and 100%**. The part that mattered — ink starting at y=67 rather than
y=0 — is exactly right.

## 2. The withholding-t2 finding, in full

Measured from the source pixels (`tools/img.py`, alpha > 16), both files on the
same 215x371 canvas:

| | ink x | ink y | content | ink bottom above canvas bottom | base width |
|---|---|---|---|---|---|
| `tower_withholding_t2.webp` | 0–214 | **0–370** | 215x371 | 0 px | 215 |
| `tower_withholding_t2_machine.webp` | 2–212 | **67–370** | 211x304 | 0 px | 211 |

**Will it sit too high on its pad? No.** The ink bottom is the canvas bottom in
both, `measure_art.py` derives `anchorY` as `(bot+1)/h` which is 1.0 for both, and
the base ellipse differs by 4 source px — 1.2 world px once scaled. The tower is
planted correctly. **No offset is needed, and none was added.**

**Will it render at the wrong height? Yes.** Same canvas and the copied
`displayHeight` of 107.7 means the same scale, so the ink's share of the frame is
what reaches the glass:

```
original t2: 371/371 x 107.7 = 107.7 world px
machine  t2: 304/371 x 107.7 =  88.3 world px
```

Put beside the rest of the tier ladder, on screen at the default zoom
(`camera.test.ts` prints this on every run now):

```
turret-ledger:            150px -> 185px -> 236px   (growth 24%, 27%)
turret-ledger (machine):  150px -> 152px -> 232px   (growth  1%, 53%)
turret-dummy:             150px -> 174px -> 201px   (growth 16%, 16%)
turret-dummy (machine):   149px -> 173px -> 200px   (growth 16%, 16%)
```

**The machine Ima Dummy is fine** — 16% and 16%, matching its original step for
step. The Withholding tower is the only pair that disagrees, and it disagrees
twice from one cause: tier 1 to tier 2 grows **1%** where the repo's own rule in
`camera.test.ts` demands more than 10% ("the silhouette is meant to be the primary
read on an upgrade"), and tier 2 to tier 3 then jumps **53%** where the same rule
caps a step at 45% ("that is a different building").

**Why no existing test caught it.** That rule is enforced on `displayHeight`,
which is a canvas figure. The machine t2's canvas grows the full 23.6% over tier
1; only the tower painted inside it does not. A `displayHeight` threshold cannot
see this, and that is the general lesson, not a fact about one file.

### The smallest fix, and why it was not applied

One number: `turret-ledger-t2-machine.displayHeight`, raised from 107.7 to
**131.4**, lands the ink at 107.7 and restores the 24% step.

It also scales the base by the same 1.22, taking the machine t2's footing from
61.2 to **74.7 world px** — about 20% wider than the original t2's and wider than
the 73 px the whole tower set is scaled against (`MEDIAN_BASE_ON_SCREEN` in
`measure_art.py`). The machine t2 is not a shrunk copy of the original: it is the
same width and shorter, genuinely squat inside the frame. So metadata can buy the
height or the footprint, not both.

**The real fix is an art fix** — re-export `tower_withholding_t2_machine.webp`
with its ink filling the frame the way the other thirteen do — and it is left as
a decision. Until then the number is printed by
`camera.test.ts`'s "tier growth is also measured on the ink" in every CI log, so
a re-export is visible rather than assumed. It is **reported, not asserted**: a
threshold there would fail the build on a fact about the art that no code change
can fix, and the precedent for reporting is `assets.test.ts`'s per-directory
weigh-in.

## 3. The key mapping

The filenames do not match the keys and two actively mislead. Read off `files`,
never off a filename:

| manifest key | original file | machine key | machine file |
|---|---|---|---|
| `turret-ledger` | `tower_withholding_t1.webp` | `turret-ledger-machine` | `tower_withholding_t1_machine.webp` |
| `turret-ledger-t2` | `tower_withholding_t2.webp` | `turret-ledger-t2-machine` | `tower_withholding_t2_machine.webp` |
| `turret-ledger-t3` | `tower_withholding_t3.webp` | `turret-ledger-t3-machine` | `tower_withholding_t3_machine.webp` |
| `turret-writeoff` | `tower_writeoff.webp` | `turret-writeoff-machine` | `tower_writeoff_machine.webp` |
| `turret-rounding` | `tower_rounding.webp` | `turret-rounding-machine` | `tower_rounding_machine.webp` |
| `turret-escalation` | `tower_escalation.webp` | `turret-escalation-machine` | `tower_escalation_machine.webp` |
| **`turret-extension`** | **`tower_filing.webp`** | `turret-extension-machine` | **`tower_filing_machine.webp`** |
| **`turret-shelter`** | **`tower_tax.webp`** | `turret-shelter-machine` | **`tower_tax_machine.webp`** |
| `turret-dummy` | `tower_dummy_1.webp` | `turret-dummy-machine` | `tower_dummy_1_machine.webp` |
| `turret-dummy-t2` | `tower_dummy_2.webp` | `turret-dummy-t2-machine` | `tower_dummy_2_machine.webp` |
| `turret-dummy-t3` | `tower_dummy_3.webp` | `turret-dummy-t3-machine` | `tower_dummy_3_machine.webp` |
| `unit-dummy-1` | `soldier_dummy_1.webp` | `unit-dummy-1-machine` | `soldier_dummy_1_machine.webp` |
| `unit-dummy-2` | `soldier_dummy_2.webp` | `unit-dummy-2-machine` | `soldier_dummy_2_machine.webp` |
| `unit-dummy-3` | `soldier_dummy_3.webp` | `unit-dummy-3-machine` | `soldier_dummy_3_machine.webp` |

Two tests defend the two bold rows: one derives the expected path
(`<original>_<skin>.webp`) for every pair, and one names those two literally,
because the derivation is the thing a session gets wrong. Crossing them fails
three tests, one of which is the canvas check — `tower_filing` is 389x512 and
`tower_tax` is 429x512, so a crossed pair is caught even without knowing which
is which.

## 4. How the skin is chosen

`art.json` gains a `towerSkins` section: one entry per skin, each with a `keys`
map and a `levels` list. **`levels` is the only switch.**

`src/systems/TowerSkins.ts` resolves it and imports no Phaser, for the reason
`LevelArt.ts` gives: `npm install` answers 403 here, so a module that reaches
Phaser cannot be executed by a test at all, only read as text — and the pairing
rule is not something a regex can check.

- `skinnedSprite(key, levelId)` — the level-aware helper the brief asked for.
  Identity for no level id, a level in no skin, an unmapped key, or a skinned
  key with no file. **A skin is decoration; no path through it returns a key the
  loader cannot ask for.**
- `skinnedKeyIn(skinName, key)` — the remap with no level involved. Split out so
  the positive branch is tested for real: `levels` is empty, so every
  level-aware call takes the "no skin" branch, and a test written only against
  `skinnedSprite` would pass just as well against an empty or crossed `keys`
  table.
- `Art.skinnedTexture(scene, key)` — adds the half only a scene can answer: did
  the texture actually load. Falls back to the original if not, because a board
  that has lost its reskin is better than a board with a magenta box on it.

Two draw sites, both resolving the skin **after** the tier, since a skin repaints
a tower rather than changing how many silhouettes it has:

- `Tower.wearTier` — `skinnedTexture(scene, tierSprite(def.sprite, tier))`
- `GameScene.manGarrison` — the same around `soldierSprite`

`GameScene` sets the board's level once, from the **resolved** `this.level.id`,
immediately after `loadLevel` and before `restoreTowers` builds a saved board;
it clears it on shutdown before `freeLevelArt`. Resolved and not
`runState().levelId`, because a resumed run plays the level in its save and
ignores that field — drawing from it would let a resumed run ask for textures
the level it actually loaded never fetched.

Everything else — the loadout screen, the tower drawer, the world map, every
menu — passes no level id and is untouched. `TowerRing` and `ControlDrawer` size
their art from `towers.json`'s `sprite`, which is an unskinned key, so the drawer
keeps the original art on a skinned board as the brief asked.

## 5. Levels 9 and 10, and why `levels` is empty

Empty, not `["level9", "level10"]`.

An unregistered id there would be worse than nothing rather than merely inert.
`levelArtKeys` calls `loadLevel`, which resolves an unknown id to the **default**
level — so a board launched as `level9` would load level 1's art while
`skinForLevel("level9")` said yes and the draw sites asked for machine textures
nobody fetched. A line that looks like it works and does not.

The mapping is the part worth landing ahead of the levels. Turning a skin on is
one id per level in `levels`, on the day that level gets its row in `levels.json`
— and `towerskins.test.ts` asserts the identity result for `level9` and `level10`
today, so the day that changes, the test says so.

Nothing was added to `levels.json`. Levels 9 and 10 were not created.

## 6. The memory numbers

Every skinned key is classified as **level art**, so boot never loads it and nor
does a level outside the skin. `tests/towerskins.test.ts` asserts that
classification, so dropping it would fail rather than quietly put 14 textures on
the title screen.

`sh tools/harness/run.sh texmem`, against a control run from a worktree at
`bda5eaf`:

| point | control (`bda5eaf`) | with the skins (`68cbede`) | delta |
|---|---|---|---|
| after boot, title live | 111 tex, **79.5 MB** | 111 tex, **79.5 MB** | **0** |
| on the world map | 151 tex, **88.0 MB** | 151 tex, **88.0 MB** | **0** |
| during a level | 165 tex, 172.3 MB | 165 tex, 172.3 MB | **0** |
| back on the world map after a finished level | 151 tex, 88.0 MB | 151 tex, 88.0 MB | **0** |
| after a restart | 165 tex, 172.3 MB | 165 tex, 172.3 MB | **0** |

The brief's figures of "around 79 MB" at boot and "around 87 MB" on the world map
are confirmed as 79.5 and 88.0, and **adding 14 tower textures changes neither**.

`sh tools/harness/run.sh levelart` says the same from the other side: the
level-art key count goes 87 → 101, **0 of 101 resident after boot**, and levels 1
to 5 ask for exactly the 50/50/51/52/52 keys and the 168.3/171.8/187.1/176.9/149.6
MB they asked for before.

**Deploy size is unchanged too.** The 3.75 MB of machine WebP was already in
`public/` as of `bda5eaf` and already shipping — everything under `public/` is
copied verbatim whether the manifest names it or not. This commit only names it.

**What it will cost when a skin is switched on** — a forward-looking number, not
a measured one:

| | decoded (w x h x 4) | on disk |
|---|---|---|
| the 14 machine textures | **15.3 MB** | 3.75 MB |
| the 14 originals | 15.3 MB | — |

A skinned board holds **both**, so it is +15.3 MB over an unskinned one, not a
swap. Seven of the originals (the base towers) are boot art and cannot be freed
while a menu might draw them; the other seven (the tier art and the lads) are in
`levelArt.shared` and are loaded on every level regardless. Whether a skinned
level should stop loading the originals it will never draw is a question for the
day one exists, and is noted below rather than answered.

### The animation-manager trap

The brief flagged it and the answer is that the skin cannot step in it, by
construction rather than by care. The skin's keys are added **inside**
`levelArtKeys`, which is the single list both `queueLevelArt` and
`freeLevelArt` are built from — and `freeLevelArt` hands that exact list to
`forgetEffectAnims` before removing anything. A skin texture therefore goes
through the same forget path as every other level texture. There is no side
channel that loads or frees a skin texture, and adding one would have to bypass
`levelArtKeys` to do it.

The `levelart` scenario confirms it live: "9 effect animations cut against live
textures" on every level and every restart, with no `boot loaded level art`
fault.

## 7. Verification

**`npm test`: 1065 passing, 0 failing** (baseline before this work: 1055; +9 in
`towerskins.test.ts`, +1 in `camera.test.ts`).

**`sh tools/tsdiff.sh bda5eaf`: 212 baseline, 212 working tree, 0 introduced.**
And CI's real `npx tsc --noEmit` passed on run 300, which is the check that
matters — `tsdiff` is blind to Phaser member rules. The only Phaser member this
change touches is `scene.textures.exists`, which `Art.icon` and
`Effects.forgetEffectAnims` already call.

### The tests were proved able to fail

Per CLAUDE.md on not trusting a first green result, each new guard was run against
a deliberately broken tree:

| mutation | result |
|---|---|
| swap the `turret-extension` / `turret-shelter` machine paths | **3 tests fail** (pairing by path, the two named keys, and the canvas check) |
| delete `turret-ledger-t2-machine`'s `render` entry | **1 fails** — "has no render entry; it would draw unscaled" |
| remove `turret-shelter` from the `keys` table | **1 fails** — the file is in `files` but not in `keys` |
| add `level1` to `levels` | **1 fails** — "level1 unexpectedly wears a skin" |

All four restored cleanly to 9 passing.

### What came from a rendered frame

Everything in this section did; the rest of this report is measurement of source
files and manifest data.

- **`towertiers`** — a level 1 board, built and upgraded through all three
  Withholding tiers, live texture keys and display sizes read off the scene that
  produced the frame, plus `towertiers-01/02/03.png`:

  ```
  tier 1: texture=turret-ledger    source 213x300 world 61.8x87.1  base y=612 origin 0.5,1
  tier 2: texture=turret-ledger-t2 source 215x371 world 62.4x107.7 base y=612 (drift 0px)
  tier 3: texture=turret-ledger-t3 source 239x472 world 69.4x137.0 base y=612 (drift 0px)
  a tower with no tier art: Grinder tier=2 turret-writeoff -> turret-writeoff (unchanged=true)
  ```

  **Original keys throughout, no machine key anywhere, and byte-identical to the
  control run at `bda5eaf`.** This is the path the change actually edits
  (`Tower.wearTier`), so it is the one that had to be looked at.
- **The picture was read as well as the numbers.** `towertiers-02.png` shows the
  painted stone tier-2 Withholding tower standing on its pad on the level 1 road
  — not a machine tower, not an unscaled one, not a half-buried one.
- **`buildall`** — 7 towers placed on a level 1 board, every drawn turret texture
  `turret-ledger`, zero keys containing `machine`.
- **`screens`** at 667x375, 844x390, 844x390 with `INSETS=0,47,21,47`, and
  1400x900: **1 fault at each phone size and 0 on desktop**, and the one fault is
  `SMALL Title [title:version-stamp (hidden dev door, not a tap target)]` —
  **reproduced identically by the control run at `bda5eaf`**, so it is
  pre-existing and not this change's. No `OFF`, `NOTCH` or `OVER` anywhere.
- **`screens` at 375x667 and 390x844** — "portrait is gated; the screens behind it
  are not a player-facing layout", with the rotate overlay covering the window.
  The correct answer for a landscape-only game, not a skipped check.
- **`levelart`** — levels 1 to 5 walked in one session plus a return to level 1,
  with screenshots per level.

### What was NOT checked

- **No skinned board has ever been rendered**, because none can be: `levels` is
  empty and adding an id would point at a level that does not exist. Everything
  about how a skin *looks* in play — the withholding-t2 height included — is
  computed from source pixels and manifest arithmetic, not seen. The first
  screenshot of a machine board is owed to the day level 9 gets a row.
- **No browser and no `npm run dev`**, per the brief. The harness is headless
  Chromium with `--disable-gpu`, so the memory figures are texture-manager bytes,
  not what iOS allocates.
- **Levels 6, 7 and 8 were not walked in the harness.** Levels 1–5 were. The
  claim for 6 is from the test that iterates every registered level; 7 and 8 have
  no row to walk.
- **The nine scenarios known not to assert** (`ui`, `muzzle`, `buildall`,
  `rockets`, `retreat`, `regressions`, `poor`, `typegame`, `meteor`) — `buildall`
  was run and its *output* read, above, but nothing here rests on it asserting.
- **The GL screenshot problem did not arise.** Screenshots came back correct
  without `GL=1`, so no `renderer.snapshot` work was needed; the black-frame
  issue the brief warns about is untouched and still open for whoever needs
  `GL=1`.
- **Nothing was rebalanced.** No stat, targeting, projectile, upgrade or
  placement code was touched, and no level was built.

---

## Where this leaves the repository

**In flight.** Branch `claude/machine-tower-skins-6looer`, one commit, head
`68cbede`, CI run 300 green on `test`, `typecheck` and `changes`. **Not merged.**
`origin/main` is at `bda5eaf` and the branch is that plus this commit, a clean
fast-forward:

```
git checkout main && git merge --ff-only claude/machine-tower-skins-6looer && git push origin main
```

**Waiting on a decision — `tower_withholding_t2_machine.webp`.** Its ink is 67 px
short at the top of the frame, so the machine tier-2 Withholding tower grows 1%
over tier 1 instead of 24%, then 53% into tier 3. It sits on its pad correctly and
the game is not wrong today, because no level wears the skin. Three ways out:

1. **Re-export the art** with the ink filling the frame like the other thirteen.
   The only fix that costs nothing else. Recommended.
2. **Raise `turret-ledger-t2-machine.displayHeight` to 131.4.** One number,
   restores the height, and widens the base to 74.7 px — past the pad and past
   the 73 px the tower set is scaled against.
3. **Ship it squat**, and accept that the machine Withholding tower's first
   upgrade does not read as growth.

Until it is decided, `camera.test.ts` prints the per-tier ink heights on every
CI run.

**Blocked — the skin cannot be switched on.** `towerSkins.machine.levels` is
empty and must stay empty until a level exists to wear it. Levels 9 and 10 have
no rows; nor do 7 and 8, which are built and parked ahead of them. The 14 keys sit
in `levelart.test.ts`'s orphan list alongside `map-level7`, `map-level8` and level
8's cast — that list is what is WAITING, and it now has three groups in it.

**Open, for the day a skinned level exists.** A skinned board would hold both the
skin and the originals: +15.3 MB decoded, because seven of the originals are boot
art a menu may draw and the other seven are in `levelArt.shared` and load on every
level. Whether a skinned level should be able to decline the originals it will
never draw is worth asking then, and is not worth building now.

**Carried forward from `2026-09-12-level-8.md`**, unchanged by this pass: level 8
is built, soaked and unreachable because level 7 has no row in `levels.json`, and
HR's armour aura is flagged OPEN — it fires on 97 enemies a run and moves the
soak by less than a point.
