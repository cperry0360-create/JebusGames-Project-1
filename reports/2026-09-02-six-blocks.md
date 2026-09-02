# Six blocks: the crash closed, the map cleared, and five sizes fixed

2026-09-02. Everything below is done and on `main`.

| commit | block |
|---|---|
| `f586135` | 1 — the wave-5 crash |
| `3ef7a29` | 2–6 — placement, sizing, intent, and the pointer helper |
| `cafdb4b` | the browser probes for 2 and 4 |

487 tests before, 497 after. `sh tools/tsdiff.sh b31fdc8` clean of anything
but the known permanent cascade.

---

## Block 1 — the crash

### 1a. Liveness

`onBoard()` in the new `src/systems/Liveness.ts` is the one predicate, and it
requires **not dead AND still on the board**:

```ts
export function onBoard(o: BoardObject | null | undefined): boolean {
  if (!o) return false
  if (o.active === false) return false
  if ('scene' in o && (o.scene === null || o.scene === undefined)) return false
  return o.status !== 'dead'
}
```

`Enemy.alive` **is** that predicate now, so all three guards route through one
definition rather than three copies of half of it:

| guard | before | after |
|---|---|---|
| the committed-swing closure | `if (v.alive)` — `status !== 'dead'` | same call, real answer |
| `GameScene.damageEnemy` | `if (!enemy.alive) return` | same |
| `Enemy.hurt` | `if (this.status === 'dead')` | `if (!this.alive)` |
| `Enemy.tick` | `if (this.status === 'dead')` | `if (!this.alive)` |
| `Enemy.die` | `if (this.status === 'dead')` | `if (!this.alive)` |

Three call sites had been patching the definition where they used it —
`!x.active || !x.alive` in `tickEnemies`, `Hero.ram` and `Projectile.tick` —
and those fold back in. `Fighter.alive` goes through it too, passing its two
fields explicitly because a Fighter has no `status`: it expires, it does not
die.

Deliberately `active === false` and not `active !== true`, so a plain object
that never had the field — a pure-arithmetic target in `Targeting.ts`, a test
double — is not silently read as destroyed. What is being detected is a
positive mark of destruction, not the absence of a mark.

### 1b. The hero's teardown

`goDown()` now clears `pendingHit` and calls `frames.reset()`; `revive()` does
both again. Deliberately in both places: `goDown` is where the references stop
being safe to hold, `revive` is where the impact frame could be produced, and a
future change to either must not reopen the window on its own.

`HeroFrames.reset()` is the single deliberate exception to "a swing is never
interrupted", and says so where it is defined.

### 1c. `crashw5`, extended

The old probe read `hero down = false` and I flagged that as a gap. The cause
turned out to be worth having found: **one huge hit does not put Cory down.**
It drops him through the 25% threshold, which fires Last Stand and makes him
invulnerable for the transformation. The probe now chips him down at 70 damage
every 90ms, through the transformation and out the far side.

```
A. leaked Scrapper: status=walking (was walking)  active=false  scene=GONE
   old rule (status !== dead) says alive: true  *** which is the hole ***
   Enemy.alive now says: false  — closed
   damaging the destroyed enemy raised 0 error(s)
B1. hero committed a swing: pendingHit set = true
B2. hero down = true   (took 1500ms, through the transformation)
    pendingHit after goDown: null — cleared
B3. escapedThisWave=10 lives=10   victim scene=GONE alive=false
B4. revived: down=false   errors since: 0
RESULT CLOSED
```

Part A computes the OLD rule inline and prints that it still says "alive", so
the probe is not vacuously green. `tests/liveness.test.ts` carries the same
control: one test asserts an untouched swing lands exactly once, so the test
that asserts a reset swing lands zero times can fail.

### 1d. The zoom line

The crash report prints `dpr`, `zoomDesign` (raw ÷ device ratio) and
`zoomCeilingDesign` beside the raw camera zoom. Confirmed in the browser: the
gnome probe reads `zoom 5.16` at dpr 3, which is a design zoom of 1.72 — the
default, exactly.

---

## Block 2 — gnome placement

**2a.** `drawPathBand` is deleted and so is its `presentation.json` block. Not
narrowed, not faded: the method and the mechanism are gone, and a test asserts
nothing in `GameScene` calls `strokePoints` any more. The covered-lane wash for
a *selected tower* is a different feature and survives; its Graphics is renamed
`laneWash` for what it now does.

**2b.** `src/ui/CastCursor.ts`. One texture key per state
(`cursor-place-ok`, `cursor-place-no`), a tinted rectangle standing in until
each arrives, and `stubbed: {valid, invalid}` exposed so a probe can tell a stub
from finished work. Measured:

```
cursor art: valid=STUB  invalid=STUB
armed: mode=targeting msg="Gnomes: drop it on the road. The cursor says where."
cursor before the pointer moves: hidden
on the road (lane distance 0): cursor=valid
off the road (lane distance 71): cursor=invalid
CURSOR follows the pointer and reports both states
```

The placement rule is untouched — `validCastPoint`, `pathOnlyWithin: 56`. Only
where it is reported changed. The cursor divides its scale by the camera zoom,
so it is the same size on the glass at every camera position.

**2c.** CANCEL moved to the bottom-right HUD corner and the layout **reserves
that rectangle whether or not the button is showing**. Asserted by position, in
the browser:

```
CANCEL at 784,360 of 844x390  (layout says 784,360)
CANCEL is in the bottom-right HUD corner
```

The settings gear took the right-hand end of the top row (Block 5c), which is
what freed the corner. The ability row gives up CANCEL's width at **both** ends
so it stays centred — taking it off the right only fixed the overlap and moved
the thumb row 56px off centre.

**2d.** The wave message gets a plate, sized to the words rather than to the
row it is allowed to use. Drawn before the text, because Phaser orders by
creation; hidden with the text when the boss bar takes the row.

**2e.** No band. Default honoured.

### Layout, at three viewports

| viewport | gear | START WAVE | CANCEL | abilities |
|---|---|---|---|---|
| 844×390 | 794,12 | x 544 w 240 | 734,340 | x 261 w 322 (scale 1.00) |
| 568×320 | 518,12 | x 353 w 155 | 458,270 | x 123 w 322 (scale 1.00) |
| 1280×720 | 1230,12 | x 980 w 240 | 1170,670 | x 479 w 322 (scale 1.00) |

At 568 the start button gives way from 240 to 155, which is what it is for. No
rectangle overlaps another at any tested viewport, notched or not.

---

## Block 3 — sizing from the container

**3a.** `drawBossBar` took `messageRow.width` outright — **563px on an 844px
screen, 67% of the width, for one wave in thirteen** — while `bossBarWidth: 560`
sat in the data unread. It is wired at **300**, `bossBarHeight` at 14, and the
region is a *bound* rather than a size: on a narrow phone the bar shrinks
instead of pushing into the counters. `bossBarTop` is **deleted** — the layout
places the row, so a second opinion about its y could only disagree with it.

**3b.** The boss card was `platePanel(this, 0, mid - 78, W, 156)`: exactly full
width, and 156px is 40% of a 390px phone. It is measured from its own two texts
now and capped at 82% of the screen. The name/tagline ratio comes down from
**56:17 (3.3:1) to 44:21 (2.1:1)**.

**3c.** `Hero.pickRadius` was a hardcoded `30` in a `.ts` file — a hard-rule
violation on its own — and a circle around his **feet**. He is base-anchored at
75.8 world px tall and 62.3 wide, so it covered 40% of his height, all below the
waist, and 30px of grass he is not standing on. It is now `pickBox`, derived
from the sprite he is currently wearing:

```
width  = body.displayWidth  × (1 + 2 × marginFraction)
height = body.displayHeight × (1 + 2 × marginFraction)
```

with `heroPick.marginFraction: 0.18` and 44px floors in data. At 0.18 that is
~14 world px of forgiveness on every side — and because it reads the live
sprite, the SUV gets a box that matches the SUV.

---

## Block 4 — silently cancelled intent

**4a + 4b.** He revives **where he fell**. `homeX/homeY` are gone; `fellX/fellY`
are recorded in `goDown` and used by both `revive()` and `returnPoint`, so the
ground marker follows. And `revive()` no longer resets `rallyX/rallyY` — that
line discarded a standing order the player had not withdrawn, on top of undoing
a walk they had already paid for.

**4c.** The DAD MODE gate on `armRestructure` is removed. The reasoning behind
it was sound for the ability and produced a game with **no way to move a
tower**: Dad Mode fires once per encounter at 25% health, so the only route to
picking a tower up was to nearly die first. The cost is the 22-game-second
cooldown, which is real. `beginMove(tower)` is the ring's entry point — it skips
"which tower?", because the ring is already open on one.

**4d.** SELL had no fixed position. It was pushed **last onto whatever was
already there**, so:

| tower state | old option list | SELL was |
|---|---|---|
| upgrade available | `[upgrade, sell]` | 2 of 2 |
| spec branch | `[spec, spec, sell]` | 3 of 3 |
| **max tier** | `[sell]` | **1 of 1 — the UPGRADE slot** |

The upgrade slot is now always emitted, disabled with a reason when there is
nothing to buy ("Fully upgraded. There is nothing further to buy."), and the
ring's own contract already says a disabled option opens and explains itself.
Measured in the browser, walking one tower up every tier:

```
tier 1:      [upgrade, move, sell]                  confirms [UPGRADE, MOVE, SELL]
tier 2:      [spec:garnishment, spec:payroll, move, sell]  [BUILD, BUILD, MOVE, SELL]
spec branch: [spec:garnishment, spec:payroll, move, sell]  [BUILD, BUILD, MOVE, SELL]
maxed:       [upgrade, move, sell]                  confirms [UPGRADE, MOVE, SELL]

tiers where SELL was the FIRST option: 0 — none
SELL is last at every tier: true
MOVE offered at every tier: true
hero lastStandActive: false (the old gate)
spot 0 -> 1  (wanted 1)
RESULT SELL never takes the first slot, MOVE is offered ungated, and it moves the tower
```

And the confirm button carries a **word**. It was the same tick glyph on every
option, so the one press that spends or destroys looked identical whether you
were buying an upgrade or selling the tower. The tick survives beside the word
where the panel is wide enough (`confirmGlyphMinWidth: 84`); below that the word
wins outright, because at the 150px minimum panel there are only 60px a side and
"UPGRADE" has to be readable or the change is undone.

---

## Block 5 — smaller, measured

**5a.** `announce()` has a queue and one slot. Five things announce themselves
and three can fire on a wave boundary — `endWave` calls `grantTowerUnlocks()`
and then `announce('WAVE CLEARED')` **zero milliseconds apart at the same
pixel**. Nothing is dropped; a 140ms gap between banners keeps two in a row from
reading as one flicker.

**5b.** Enemies take a lateral offset along the lane **normal**, chosen once at
spawn and kept — a per-frame wobble would be a swerve, not a lane. It is bounded
by `(roadWidth/2 − ownHalfWidth) × laneSpread.fraction` (0.72), so a Buckethead
gets less room to wander than a Scrapper and nobody walks the edge of the paint.
`map.json roadWidth: 38` had been read only by the band-drawing code.

It is in `rules.json` rather than `presentation.json` because it is not only a
look: a splash radius now covers a band rather than a line.

**5c.** The gear is at the right-hand end of the top row, measured out of that
row before anything else is fitted so it can never be what gives way.

**5d.** The title screen's stepper called `setVolume` with no channel, and that
default is `sfx` — so turning the volume down on a title screen that is playing
music left the music and the recorded lines exactly where they were.
`nudgeAllVolumes(delta)` moves all three; a delta rather than an absolute, so a
player who set their own balance in the settings dialog keeps it. The readout
shows the mean. All persistence goes through one `persistMix()` now, so a new
path cannot forget to save.

**5e.** `pipDropBelowBase: 9` becomes `pipBaselineOffset: 0` — the row straddles
the base line, half on the tower's foot and half on its shadow.

**Correction to the premise, measured before changing anything:** the drop was
**9 world pixels, not ~50**. Every tower's art fills its texture and `anchorY`
is 1.0, so the container origin *is* the visible base:

```
turret-ledger     tex 213x300  content rows 0..299  visible base 0.0 px above the origin
turret-rounding   tex 336x512  content rows 0..511  visible base 0.0 px above the origin
turret-escalation tex 462x512  content rows 1..510  visible base 0.2 px above the origin
```

The direction of the fix is the same either way, and the row was reading as
detached — 9px on the grass is enough for that at this scale.

**5f.** `src/systems/GameTime.ts`. `gameSpeed` is 1.4, so every duration in the
data is 1.4× what the player experiences and nothing said so. Anything the
player is shown converts through `realSeconds`; anything a report prints carries
both units via `bothUnits`. Converted: the revive countdown on the ground and on
the hero bar, the down message, both build times in the ring, the upgrade
message, the restructure cooldown, and the summon log line.

This is what made two earlier findings read as bugs: "the lockout is 25s against
13s waves" is really 17.9s against 31s, and "Haymaker was recharging during the
boss fight" is a 12-game-second cooldown in a 108-game-second wave.

---

## Block 6 — the device-ratio pass

### The missing helper

`pointerToScreen(scene, pointer, cam)` is the half of the pair `worldToScreen`
should always have had. The fourth bug of this class — the settings slider
pinned at 100% at dpr 3 — was in a file written *after* `worldToScreen` existed,
because that helper takes a point on the **map** and a pointer is not one.
Neither function accepts the other's argument, which is the point: reaching for
the wrong one now fails to compile instead of failing on somebody's phone.

### A fifth instance, found while adding it

```ts
|| hudTakesPress(this.layout, p.x, p.y)
```

`p.x`/`p.y` are canvas pixels; every HUD rectangle is in CSS pixels. At dpr 3 on
an 844px screen the pointer runs to **2532** while START WAVE spans **594..834**
— so a tap a third of the way across the **board** tested as a tap on the
button, and the map ignored it. Converted through the UI camera, which is the
camera those rectangles are drawn by. `layout.cancel` is added to what the HUD
claims, since a control the map does not know about is one the map takes taps
through.

### The suite

RUNNING — see the addendum below.

---

## Addendum: `both.sh` across every scenario at dpr 1 and dpr 3

PENDING.

---

## Not done, and why

- **`icon-confirm` nearly went dead.** The word on the confirm button
  superseded the tick. Rather than orphan the asset — assets are off limits this
  pass — the tick is drawn beside the word where the panel is wide enough, which
  is a defensible design and keeps the icon earning its place. If the narrow
  layout ends up being the common one, `icon-confirm.png` becomes a candidate
  for deletion next time assets are touched.
- **Airport Attack's loop** and the **music level re-measurement** are still
  undiagnosed from the previous report; neither was in this instruction set.
- **The peanut economy, the difficulty, and the arch double-clip** are diagnosed
  in `reports/2026-09-02-four-blocks.md` and were not asked for here.
