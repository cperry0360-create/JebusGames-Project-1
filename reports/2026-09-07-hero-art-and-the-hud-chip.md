# The hero art batch, the ten power effects, and the HUD chip

Twenty-two new files placed and wired, ten hero powers given real art, one
backwards boss fixed, and the hero's health moved off the top of the screen
onto a portrait chip beside his own buttons. Plus the asset gap that made all
of it worth checking: three icons that 404'd on every boot while CI was green.

| commit | what | CI |
| --- | --- | --- |
| [`2f8145f`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/2f8145f) | PARTS 0–4: the asset-gap test, the harness fix, the art, Cory's swap, the icons, the power effects | **green** — test ✅ typecheck ✅ ([run 145](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34068603598)) |
| [`82783b3`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/82783b3) | PARTS 5–6: facing at rest, the unicorn, the hero HUD chip | **green** — test ✅ typecheck ✅ ([run 146](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34070674243)) |
| [`c68d898`](https://github.com/cperry0360-create/JebusGames-Project-1/commit/c68d898) | this report | **green** — test ✅ typecheck ✅ |

`deploy` is `skipped` on both, which is correct: that job only runs on `main`.

908 tests pass, up from 886. `sh tools/tsdiff.sh 9172418` reports zero errors
introduced against the baseline.

**This work is on `claude/hero-art-hud-rework-tqd10v`, not on `main`.** The
session was configured to a branch; see the merge command at the top of the
reply this report accompanies.

---

## PART 0 — the asset gap

### The three 404s, and why nothing caught them

`assets/abilities/ability_eli_1.webp`, `ability_eli_2.webp` and
`ability_bailey_1.webp` were named in `art.json`, requested by the loader on
every boot, absent from the repository, and green on all four CI jobs.

The hole was `optional`. `manifest.test.ts` checks that every manifest path
exists and **skips any key on that list**, on the reasoning that an optional
key is a hook: the path is agreed first and the file lands later. That
reasoning is right about the **loader** and wrong about the **deploy**.
`queueArt` iterates `ART.files` and queues every one of them — it has no idea
which are optional and could not have, because the only way to find out a file
is missing is to ask the server for it. So an optional key is not a file the
build does not request. It is a file the build requests and is told does not
exist, on every boot, for every player.

`tests/assets.test.ts` asks the blunt question with **no exemption list**.
Confirmed red at `9172418` before anything was fixed, naming exactly the three
reported files:

```
not ok 1 - every asset the manifest names is in the built output
  + [
  +   'ability-eli-1 -> assets/abilities/ability_eli_1.webp',
  +   'ability-eli-2 -> assets/abilities/ability_eli_2.webp',
  +   'ability-bailey-1 -> assets/abilities/ability_bailey_1.webp'
  + ]
```

Reproduce: `git stash && node --test tests/assets.test.ts`.

It carries four more checks, and two of them found something on the first run:
an optional key must still have its file; every file in `heroes/`, `abilities/`
and `effects/` must be bound to a manifest key (this caught
`ability_haymaker.webp`, retired and still shipping); and no `.png` may ship
beside the `.webp` that replaced it.

"The built output" is `public/`, verbatim — Vite copies that directory into
`dist/` unchanged and unhashed, which is why `stamped()` exists. Checking
`dist/` would mean running a build, and `npm install` answers 403 here.

### `tools/harness/run.sh towerpanel`

**Broken, pre-existing, and identical on `db84211`** — `git show
db84211:tools/harness/index.html | grep -c "g.menu.hitAreas"` returns 8.

It drove `g.menu.hitAreas` and `g.panel.layer`. `BuildMenu` and `TowerPanel`
were both **deleted** when the radial ring landed (`TOWER-MENU.md`,
`reports/2026-09-02-the-ring.md`), so the first line that touched either threw
a `TypeError`, the director caught it, and **every check after that point never
ran while the run still exited 0 and wrote a plausible report**. That is the
failure mode worth naming: not a red result, a silent green one.

Fixed by re-aiming it at the component that exists, keeping the question
neither `ring` nor `towerring` asks — PROTOTYPE-GAP 11, *does the menu cover
the thing it is about*. It now reports:

```
button upgrade covers the tower base at 276,445: false (must be false)
range ring: 0 of 36 points on it are behind the menu
previewing the upgrade: true  description panel: open
the board panned: true (297 -> 344)
menu followed the pan: true (517 -> 406)
RESULT the tower menu stayed off its tower and off its range ring, at both ends of the board
```

Three faults it reported on the way there were **my own harness code**, and
each is written into the scenario as a comment so it is not repeated:

1. A hand-rolled world→screen conversion, off by the device ratio (3), so every
   click landed three times too far out. `toScreen()` already does this.
2. Coverage measured against `g.ring.bounds` — but a ring is a ring, and the
   tower sits in the hole in the middle of it by design. Coverage must be asked
   of `hitBoxes` and `panelBounds`.
3. "The ring did not follow the pan", measured at the default zoom where the
   whole 1280×720 board fits a 1400px viewport and the camera is clamped —
   the drag moved nothing. It zooms in first now and asserts the board moved
   before drawing any conclusion about the menu.

**Seven other scenarios still drive the deleted API** and are silently
measuring nothing: `ui` (1544, 1580), `muzzle` (1794), `buildall` (2066, 2069),
`rockets` (2106), `retreat` (2493), `regressions` (5956–5976), `poor` (9129),
`typegame` (9219). Not fixed here — out of scope for this brief — but they are
the same rot and are listed so the next session does not have to find them.

---

## PART 1 — the twenty-two files

All converted through `tools/towebp` at **quality 0.95**, PNGs deleted. PSNR
26–38 dB on premultiplied channels, alpha exact on all 22 (`alpha off by <=0 on
0px`).

**`public/assets`: 26.42 MB → 26.71 MB** (+0.29 MB, +1.1%). The new art costs
1.34 MB; deleting Cory's walk sheet, attack sheet, idle, SUV and the retired
Haymaker icon gives back 1.05 MB.

| directory | after |
| --- | --- |
| `heroes/` | 1.43 MB (10 files) |
| `abilities/` | 0.54 MB (17 files) |
| `effects/` | 2.05 MB (12 files) |
| `hero/` | **deleted** |

The asset budget test still passes: no image over 3 MB, total under 40 MB.

### `measure_art.py` grew four sections

Nothing in it could measure a hero other than Cory, an ability icon, or an
effect. It now has a hero-roster section (all ten pictures), an icon section,
an effects section, and a **content-box audit** that checks every recorded
`contentWidth`/`contentHeight` in `art.json` against the file's own ink.

Cory's foot band is `0.85`, and that is not a rounding choice: he stands in a
wide lunge with his trailing shoe raised, so at `0.90` the cut finds only the
leading shoe and the anchor lands at **0.848** — 35% of his width off centre,
which would walk him with the lane under his elbow. At 0.85 both shoes are
found (x69–170 and x361–489) and the anchor is 0.557.

The Rivian uses the `body` rule the retired SUV used, for the reason that
entry already gave: it is drawn in 3/4 receding, only the near front wheel
reaches the ground line at all (the rear wheel bottoms 100 px higher up the
canvas), so anchoring on the contact patch would hang the truck off its front
axle. Anchor 0.4995, shadow the full width.

### The canvas-vs-ink audit — what it found

Five of the ten **new** icons carried their 256×256 canvas where 248–253 px of
ink belonged. Fixed in this batch.

**Nine pre-existing entries have the same fault and were NOT changed:**

| key | says | ink is | drawn |
| --- | --- | --- | --- |
| `icon-firerate` | 256×256 | 167×245 | **34.8% small** |
| `icon-locked` | 256×256 | 181×240 | **29.3% small** |
| `icon-upgrade` | 256×256 | 198×215 | **22.7% small** |
| `icon-armor` | 256×256 | 200×235 | **21.9% small** |
| `icon-cancel` | 256×256 | 206×218 | **19.5% small** |
| `icon-range` | 256×256 | 209×215 | **18.4% small** |
| `ui-nuke-down` | 600×495 | 569×428 | **13.5% small** |
| `icon-damage` | 256×256 | 256×237 | 7.4% small |
| `icon-target` | 256×256 | 246×253 | 3.9% small |

Eight of the nine are tower-menu glyphs. Correcting them makes every one of
those icons visibly larger — up to a third — which is a UI change this brief
did not ask for and which wants a look at the ring before it lands. **Reported,
not changed.** The audit runs on every `measure_art.py` invocation now, so the
number cannot quietly grow.

There is a caveat on that script's hero output worth carrying: the four heroes
added before this batch disagree with their own silhouettes on `anchorX` —
Courtland reads 0.75 against a shipped 0.4961, Bailey 0.81 against 0.542.
Bailey is a dog and the "both feet" band logic is wrong for four legs, so the
measurement is not obviously better than what shipped. The script **prints the
difference and applies nothing**; the shipped values are untouched.

---

## PART 2 — Cory

- `bodySprite` → `heroes/hero_cory_base.webp`, `poweredSprite` →
  `heroes/hero_cory_power.webp`.
- The walk sheet and the attack sheet are **deleted**, along with the old idle
  and the old SUV. The whole `public/assets/hero/` directory is gone.
- The bob's `if (walkFramesFor(this.heroId))` branch is gone with them: the
  condition was the sheet's presence rather than a flag, precisely so drawing
  four more sheets would turn the bob off by itself. It went the other way, so
  there is no hero left for the exemption to apply to.
- `artFacing` is `'right'` for all five. That is the last per-hero flip
  correction; the field stays because the *enemies* still disagree with each
  other and read the same `mirroredFor`.
- **`ultimateSprite` and `poweredSprite` are one key for every hero now.** This
  was a judgment call: Cory's `poweredSprite` was `null` on purpose so the
  powered form would not spend DAD MODE's only visual, and he had a separate
  SUV for Last Stand. The Rivian *is* that vehicle, upgraded, and the brief
  designates it his powered form — so he matches the other four, and Last Stand
  keeps the shake, the flash, the half-second pause and every stat multiplier.
- **The Rivian's height lives in `heroes.json`**, per the brief:
  `cory.poweredHeight: 95`. It is 1.51:1, so at 120 px it would be 181 across —
  wider than the road and half again the widest hero. 95 makes it 144.
  `art.json` deliberately carries **no** `displayHeight` for that key, so there
  is exactly one copy of the number; `heroes.test.ts` fails if a powered form
  has a height from neither source.
- The loadout hero card needed no change. It reads `portraitSprite`, which is
  the same key — which is also what makes the PART 6 portrait requirement true
  by construction rather than by discipline.

Measured in the harness: `on foot: h=78 w=56` / `in SUV: h=95 w=144`.

---

## PART 3 — the ability icons

The placeholders had **TEMP** and **LOCKED** painted into the image, which is
why an available slot 2 still looked locked. Two things were wrong:

1. The art asserted state. Gone with the placeholders.
2. **`greyable` never listed the ten hero icons**, so `greyKey()` named a
   texture that had never been built, `this.textures.exists(wantKey)` was
   false, the swap was skipped every time, and the only thing on screen saying
   "locked" was the word painted into the picture. They are listed now.

Three states, three treatments: unavailable is a real desaturation (Phaser's
tint *multiplies*, so a tinted icon reads as "in shadow" rather than "switched
off"); cooling is the colour icon dimmed under the sweep; ready is undimmed.
Unavailable is no longer *also* dimmed — that made the thing you cannot use at
all look further away than the thing that is nearly back.

Confirmed on rendered frames: base form draws Spike Strip greyscale, powered
form draws it in full colour (`slot 2 icon=ability-cory-2`, not
`ability-cory-2-grey`).

---

## PART 4 — the ten power effects

`HeroFx.ts` draws pictures instead of an expanding ring, a two-line stab, a
swept band and a toothed rectangle. **The sizing rule survived**, which is the
half of the placeholder that mattered: nothing invents a size, every effect is
scaled to the radius, reach or corridor its power actually uses, so tuning a
radius still moves its picture. Every damage number, radius, duration and
cooldown is untouched.

- **Ice Beam** and **Zoomies** stretch along the line from the hero's end.
  Both are authored travelling right, so both carry `anchorX: 0` and a new
  `stretch: "line"` marker in `art.json` — and `manifest.test.ts` exempts a
  `stretch: "line"` entry from its "an anchor at the frame edge means the
  measurement latched onto a prop" rule *on the strength of that field*, so the
  exemption is declared by the art rather than by a list of names in a test.
- **Seismic** and the **Spike Strip** are flattened vertically (0.62 / 0.70) so
  they lie on a board seen from three quarters above rather than standing up
  out of it. **Fireball is deliberately not flattened** — it is a column of
  flame that is supposed to stand up, and the decision is read off the art's
  own anchor rather than off the effect name, because Seismic and Fireball
  share one method.
- **The Spike Strip turns to the lane's own heading** (`Path.headingNear`). It
  was axis-aligned first; this road doubles back twice, so a strip that read
  correctly on one leg lay sideways across the next.
- **Star Rain** draws fourteen small falling-star images, one per strike, each
  sized to `strikeLength` — the radius that strike really damages. The ring
  over the whole disc is gone: the placeholder needed one because a scatter of
  stabs could not say how far the volley reached, and a circle drawn round real
  falling stars would say a blast landed inside it.
- **One procedural shape survives and is named**: `areaRing`, for Ice Beam
  alone. The beam is scenery and touches nothing it crosses (a test says so),
  and a picture stretched along a line has one thickness for its whole length —
  drawing it 192 px thick to describe the frozen area would claim the whole
  corridor was caught, which is the exact misreading the test exists to
  prevent.

Verified by a new `powerart` scenario, which restarts the run for each hero,
casts both slots through the real path, and **counts what actually reached the
display**:

```
RESULT all ten powers drew their own art
```

### Two things I could not resolve, reported rather than papered over

**`fx_mind_control` has no mechanic to attach to.** The brief describes it as
"a marker drawn above a controlled enemy", and **nothing in the game controls
an enemy**. Implementing one would be inventing a mechanic, and PART 4 says
visual only. So: the art ships, the key is bound as an `art.fx` status-marker
role, `Enemy.controlled` is declared, and the scene's marker sweep draws it the
moment anything sets that true. It is one line of gameplay away rather than one
art pipeline away — but **today it is never drawn in play**, and that is the
one item of PART 4 not fully delivered.

**Courtland's icon names and his data disagree.** The brief lists
`ability_courtland_1` as *Seismic* and `ability_courtland_2` as *Mind Control*.
`heroes.json` says slot 1 is *Shockwave* and slot 2 is *Seismic*. Renaming an
ability is not a visual change, so the data is untouched and both slots draw
`fx-seismic` (they are both ground bursts, so the icons still read). **This
wants a decision**: either the icons were drawn against an intended rename, or
the data is right and the icon list was written from memory.

`fx_burn` did get a mechanic-side addition, and it is visual: `Enemy.burning`
is a seconds counter that Ember's existing timer sets. It carries **no
damage** — the burn's damage is still the scene's timer, tick for tick — it
exists so a flame can follow the enemy, survive knockback, and go when the
enemy does. The markers are a per-frame **sweep** rather than bookkeeping,
because a marker created when a status starts and destroyed when it ends leaks:
an enemy that dies mid-burn never reaches the "status ended" branch.

---

## PART 5 — facing

### At rest

`src/systems/HeroFacing.ts`, Phaser-free. Moving: direction of travel
(unchanged). Idle: the nearest live enemy **at any distance** — not just inside
`attackRange`, which is 70–122 world px on a 1280 px board, so a hero could
watch a wave cross the map with his back to it and be "correct". Board empty:
the gate enemies arrive through.

That direction is **computed, never the word "left"**:

- Gates are the first waypoint of every lane **the wave table actually spawns
  on**, not every lane the map declares. Level 3 declares three lanes and
  `main` is *not* a gate — it is the trunk `upper` and `lower` merge into, and
  its first waypoint is at (733, 378), in the middle of the road. A hero would
  have spent that level staring at a point nothing comes out of.
- A test asserts every resolved gate is **off the 1280×720 plate**, which is
  what a gate is.
- Levels 3 and 4 return two gates each, levels 1 and 2 one.

Harness, level 1:

```
gates: [[-60,402]]
  idle, empty board                 facing LEFT   correct   gate is left of him
  idle, empty board, moved          facing LEFT   correct
  idle after walking right          facing LEFT   correct   faces the gate, not the last heading
RESULT he faces where he is going, what he is hitting, and the gate when the board is empty
```

### The backwards boss

**`unicornBoss.artFacing` said `'left'`. The Rainbow Reaper is drawn facing
RIGHT** — horn-cannon, muzzle flash and head all to the right, tail and rainbow
to the left. `mirroredFor` flips exactly when the heading disagrees with the
declaration, so a wrong declaration inverts that character: she walked the
whole of level 3 back to front. **One data value.**

She arrived in the same upload as Pom-Pom, the Long Snapper, the Catcher and
the Zamboni Wraith, and **all four of those really are drawn facing left**.
Hers was filled in with theirs.

Two corrections to the report as filed:

- **She is level 3's boss, not level 1's.** Level 1's boss is the Politician,
  who is drawn facing right, declared right, and was always correct.
- **The per-hero flip removed in PART 2 was neither cause nor mask.** Heroes
  and enemies read one `mirroredFor` and each carries its own declaration, so a
  wrong value inverts that character and nothing else.

**All eighteen enemy sprites were decoded and looked at**, not just the one
reported. Five looked wrong at thumbnail size — the three demons, the Glitch
Bug, the Glitch Lich — and **all five were right at full size**, which is why
they were checked at full size. The other seventeen agree with their
declarations. `logic.test.ts` pins the left-drawn set at four.

`enemyfacing` now judges every enemy on every level against its measured travel
direction, boss included:

```
level1  4 types  all facing their travel direction   (boss The Politician, flipX=false)
level2  3 types  all facing their travel direction   (boss The Devil, flipX=false)
level3  5 types  all facing their travel direction   (boss The Rainbow Reaper, drawn=right flipX=false)
level4  7 types  all facing their travel direction   (boss The Glitch Lich King, flipX=false)
```

**That check is blind to the bug it just caught, and this matters.** It derives
"which way is the sprite showing" from the same `artFacing` the renderer uses,
so the two cancel out: a wrong declaration passes. It catches a *renderer*
regression, not a *data* one. **The only check for a data one is looking at the
pixels**, which is what was done — plus a rendered frame of the Reaper on level
3, unflipped, walking right with the pack.

---

## PART 6 — the hero HUD

The wide bar under the counters is **gone**. It drew the hero's health in a
second place (the sprite already had a bar over its head) and parked a solid
plate across the top of a map that is full-bleed by design.

**One 60×60 portrait chip at the bottom**, beside the ability buttons, health
drawn **on** the portrait rather than next to it.

- **Same art as the loadout card, referenced not copied**: both read
  `heroDef().portraitSprite`. No second key, no second file.
- **Shows the current form**, off the same `s.heroPowered` that ungreys slot 2
  — not a flag of its own, which is how a portrait and a button come to
  disagree about which hero is on the board.
- **The respawn state is defined**: portrait drained to `#5a5a5a` at 0.55 alpha,
  **no bar** (an empty bar and a full one are the same picture at nine pixels
  tall), and the countdown in its place. There are two countdowns on screen now
  and that was previously called a bug — but **the bug was never the count, it
  was the units**. `reviveIn` is in *game* seconds and the clock runs at 1.4×,
  so both run it through `realSeconds` and read the same number. Measured:
  `reviveIn=24.5 game seconds → chip reads "18"`.
- **The floating bar over the sprite stays, only while damaged**: faded in over
  120 ms on a hit, out over 420 ms at full health, tweened rather than toggled
  because an element blinking over a moving sprite reads as a rendering fault.
  `killTweensOf` first, so a hit during a fade-out catches the bar on its way
  down.
- **Tapping the chip selects the hero; the next tap on the map moves him** —
  the same two-step, through the same now-public `selectHero`, as tapping his
  sprite. It carries **the world map's drag rule and the same `TAP_SLOP`**: the
  board pans under that finger, so a press that travelled is a scroll. A test
  asserts the two constants are equal, because two different slops would mean a
  gesture that scrolls one screen selects on the other.

### The layout decision worth recording

Carrying the chip inside a centred `[chip][gap][icons]` group is tidier to
write and **pushes the hand 41 px right of centre on every screen**. That row's
position is tuned and long-standing, and a new readout does not get to move it.
So the chip is reserved from the row's half-width exactly as CANCEL already is
on the other side: the icons give way symmetrically and stay centred, and the
chip takes the freed space. **The chip does not shrink with the icons** —
`abilityScale` exists because a small icon is survivable, and a sub-44pt target
that *moves the hero* is not.

---

## Verification — what came from rendered frames and what did not

**From rendered frames** (`tools/harness/`, screenshots read as pictures, not
just numbers):

| check | how |
| --- | --- |
| Cory's new base art on the board, facing right | `sprites`, `screens` |
| The Rivian at 95×144 on the board | `herofx`, `ultimate` |
| All five hero cards + Cory's two real ability icons | `loadout` |
| Slot 2 greyscale in base form, full colour when powered | `screens`, `herochip` |
| All ten powers drawing their own art | `powerart` (counts sprites reaching the display) |
| The Spike Strip lying along the road, 2.5 s into its 8 s | `powerart` |
| Cory walking forwards both ways, facing his target | `facing` |
| Hero facing the gate on an empty board, from both sides of it | `facing` |
| The Rainbow Reaper unflipped, walking right | `enemyfacing` level3 |
| Chip in base, powered and respawning states | `herochip` × 3 viewports |
| Chip 60×60, 22 px to the nearest ability hit rectangle | `herochip` |
| Drag-ends-on-chip refused, tap accepted, second tap moves | `herochip` |
| No layout faults on any screen | `screens` at 667×375, 844×390, 1400×708, and notched |

Viewports: **667×375, 844×390, 1400×708**, and 844×390 with
`INSETS=0,47,21,47`. **390×844 and 375×667 are portrait** and report as *gated*
— the game is landscape-only and a portrait viewport gets the rotate overlay,
which CLAUDE.md names as the correct answer rather than a skipped check. The
narrow *landscape* case 667×375 was audited in their place.

`screens` finds exactly one fault at every viewport, on **Title**: the version
stamp, an 80×28 hidden dev door annotated in the harness as *not a tap target*.
Pre-existing and untouched.

**NOT from rendered frames:**

- The **enemy facing declarations** were verified by decoding the sprites and
  looking at them, not from in-game frames — see above for why the in-game
  check cannot settle it.
- **`fx_mind_control` was never seen in play**, because nothing controls an
  enemy. Its size and anchor are from the manifest and the file, not from a
  frame.
- **Levels 2 and 4 have no rendered frame of the new hero art or the chip.**
  Every hero/HUD frame here is level 1 or level 3. Nothing is level-specific
  about either, but it was not looked at.
- **No frame of a hero other than Cory in his powered form on the board.**
  `powerart` restarts the run per hero and forces `powered = true`, so the four
  others' powered art was exercised through the slot-2 gate but their sprites
  were not inspected.
- **No soak run.** Nothing here changes a damage number, but the burn marker
  and the status sweep add per-frame work that a long run would measure.
- **CI is green; nobody has played it.**

### Harness scenarios corrected rather than worked around

Four "faults" this session were the harness, and every one is written into the
scenario as a comment:

1. `facing` hardcoded *"the art is drawn facing LEFT, so `flipX` true means
   facing RIGHT"* — from a walk sheet that no longer exists. It reads
   `artFacing` now and is correct for art drawn either way.
2. `facing` required an idle hero to keep his last heading. That was the honest
   rule when there was nothing better to face; PART 5 replaces it.
3. `enemyfacing` gathered every fact it needed and computed a `wrong` counter
   **it never incremented**, so it always ended "n enemy types seen" whatever
   it saw — including a boss walking backwards. It also only ever saw two of
   level 3's five types, because `startWave` returns unless the phase is
   `ready` and the loop only set `status.wave`.
4. `herochip` reported the respawn state broken three times over because its
   killing blow landed inside a transformation's invulnerability window —
   `applyHit` also refuses to carry a hero *through* the Last Stand band, so a
   single blow cannot fell him from full health.

---

## Where this leaves the repository

**In flight — nothing.** Both commits are pushed and green.
`claude/hero-art-hud-rework-tqd10v` is two commits ahead of `main` and
fast-forwardable.

**Waiting on a decision:**

1. **Courtland's ability names.** The icon batch names his slots *Seismic* and
   *Mind Control*; `heroes.json` says *Shockwave* and *Seismic*. Left alone
   because renaming an ability is not a visual change. Someone has to say which
   is right.
2. **`fx_mind_control` has no mechanic.** The art ships and is bound; the
   marker draws the moment anything sets `Enemy.controlled`. Whether that
   becomes Courtland's slot 2 is the same decision as (1).
3. **The nine canvas-vs-ink content boxes.** Fixing them enlarges eight
   tower-menu glyphs by up to a third. Wants a look at the ring first.

**Blocked or dormant:**

4. **Seven harness scenarios still drive the deleted `g.menu` / `g.panel`** and
   are silently measuring nothing: `ui`, `muzzle`, `buildall`, `rockets`,
   `retreat`, `regressions`, `poor`, `typegame`. The `towerpanel` rewrite is
   the pattern to follow. **This is the highest-value item on the list** — each
   one is a check that reports success while running none of its assertions.
5. **The hero's two ability medallions go dead after the Server Nuke drops.**
   `abilitybar` reports `tap heroSlot1: DEAD` / `tap heroSlot2: DEAD` in the
   five-slot block while the three drafted icons stay `REACHED`. **Confirmed
   pre-existing** — reproduces identically on `9172418` with the working tree
   stashed. Not investigated; out of scope here. That bar has died twice
   before for related reasons (see the header of `src/systems/AbilityBar.ts`),
   and a hero losing half their kit mid-run is worth a session of its own.

**Carried forward from `2026-09-06-peanut-chip-and-the-level-road.md`:** that
report's open items were not re-checked here and should be assumed still open.

**Files worth knowing about after this change:**

- `src/systems/HeroFacing.ts` — new. Where a hero looks when it is not moving.
- `src/systems/HeroFx.ts` — same file, entirely different contents: art, not
  procedural shapes. Its header explains what survived and why.
- `tools/measure_art.py` — Cory's bespoke section is gone (it read deleted
  files, which would have taken every section below it down); the roster, the
  icons, the effects and the content-box audit are new.
- `tools/harness/index.html` — two new scenarios, `powerart` and `herochip`;
  `towerpanel`, `facing` and `enemyfacing` rewritten.
- `tests/assets.test.ts`, `tests/herofacing.test.ts` — new.
