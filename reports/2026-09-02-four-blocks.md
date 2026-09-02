# Four blocks: the wave-5 crash, the recording, the eight, and the second half

2026-09-02. Diagnosis only — nothing in this report has been changed.

Repository at `49d1af7` plus one uncommitted harness scenario (`crashw5`).

---

## Block A — the crash

### It is reproduced

`tools/harness/index.html` gained a `crashw5` scenario: build the wave-5 board,
let Cory commit a swing, damage him, then let a column of enemies leak
together. At DPR=3, 844x390:

```
1. hero committed a swing: pendingHit set = true
   victim Scrapper status=walking alive=true scene=set
2. hero down=false   pendingHit still set = true  *** THE SWING SURVIVED HIS DEATH ***
3. after the escapes: victim status=walking alive=true active=false scene=GONE
   escapedThisWave=9 lives=11
   a destroyed enemy still reports alive: YES — this is the hole
PAGE ERROR Uncaught TypeError: Cannot read properties of undefined (reading 'add') @126
4. revived: down=false   errors since: 1
RESULT REPRODUCED — Uncaught TypeError: Cannot read properties of undefined (reading 'add')
```

`escapedThisWave=9 lives=11` is the same pair your crash report carried.

**Honest caveat.** At step 2 the probe reads `down=false` — `damageHero` did not
actually put him down in that run. So the reproduction demonstrates the
destroyed-but-alive hole and the crash itself, but not yet the exact
down/revive timing your log shows. The hole does not need him to be down; his
being down only widens the window (see Q3).

### Q1 — what is `G`, and what creates it?

`G` is the **`scene` parameter of `floatingDamage`**, called from
`Enemy.hurt`:

```
Enemy.hurt()  ->  floatingDamage(this.scene, ...)  ->  scene.add.text(...)
```

`this.scene` is the property Phaser sets on a `GameObject` at construction and
**nulls on `destroy()`**. So `G.add` is `undefined.add` on an enemy that has
already been destroyed. Nothing "creates" a broken object — the object is
correct, it is just gone, and three guards in a row failed to notice.

### Q2 — why is `hurt` reached from `applyPose` via `tick`?

By design, and the design is sound. `Hero.tick` picks the swing's victims on
the frame the player sees him commit, stores them in a closure, and hands the
closure to the animation:

- `Hero.ts:282` — `this.pendingHit = () => { for (const v of victims) if (v.alive) onHit(v, damage) }`
- `Hero.ts:387` / `:394` — `if (st.impact && this.pendingHit) { this.pendingHit(); this.pendingHit = null }`

`applyPose` is where the impact frame is known, so that is where damage lands.
Without it the axe deals its damage before it has moved. The path is not the
bug. What the closure is allowed to hold on to is.

### Q3 — is an object destroyed on hero death still being ticked?

**No — the reverse. Nothing is ticked after he dies; a closure created BEFORE
he died fires AFTER, holding references to enemies destroyed in between.**

The hero teardown path, checked specifically:

| `Hero.goDown()` (`Hero.ts:493-505`) | clears |
|---|---|
| `down`, `reviveIn`, `lastStandActive`, `invulnerableFor`, `blocking`, bar, shadow, alpha | yes |
| **`pendingHit`** | **NO** |
| **`this.frames` (the `HeroFrames` clip state)** | **NO** |

`Hero.revive()` (`:520-558`) resets fourteen fields and also touches neither.

So the sequence is:

1. He commits a swing. `pendingHit` is set, capturing `victims`.
2. He goes down. `tick()` early-returns while `down`, so the impact frame never
   arrives and `pendingHit` is never fired **and never cleared**.
3. Enemies in `victims` escape and are destroyed.
4. He revives. `this.frames` still holds the swing mid-clip, so the next
   `applyPose` delivers `st.impact` and fires the stale closure.

### Q4 — is anything in the escape path destroying an object another system holds?

Yes. `GameScene.tickEnemies` (`:2425`) calls `leak(e)` -> `enemy.destroy()`.
A **leaked** enemy's `status` stays `'walking'` — it is destroyed without ever
being dead. And every guard on the damage path asks "is it dead?", never "does
it still exist?":

| guard | test |
|---|---|
| `pendingHit` closure | `if (v.alive)` |
| `GameScene.damageEnemy` | `if (!enemy.alive) return` |
| `Enemy.hurt` | `if (this.status === 'dead') return false` |

and `Enemy.alive` is `this.status !== 'dead'`. A destroyed leaker passes all
three. `Enemy` already exposes `active`, which Phaser sets false on destroy —
the probe reads `alive=true active=false scene=GONE` on the same object.

**One shared cause for Q3 and Q4**: liveness is defined as "not dead" when it
needs to be "not dead AND still on the board". The hero's un-cleared swing is
what makes the window wide enough to hit in practice.

Update order is also part of it — `GameScene.ts:2425` `tickEnemies`, `:2431`
`hero.tick` — so within one frame an enemy is destroyed and then swung at.

### Q5 — where did zoom 4.825 come from?

**A units problem in the crash report, not a bug in the camera.** Two facts:

1. `GameScene.ts:496` prints the **raw** camera zoom, with no device ratio
   beside it: `zoom: Number(this.cameras.main.zoom.toFixed(3))`.
2. `GameScene.ts:449` builds the rig with `maxZoom: displayData.camera.maxZoom
   * deviceScale()`. The 2.37 in `display.json` is **CSS pixels per world
   unit**; the camera's own `zoom` is **device pixels per world unit**.

So the ceiling on a dpr-3 device is 7.11, not 2.37, and a raw 4.825 is a design
zoom of **1.608** — *below* the 1.72 default, i.e. zoomed slightly out. The
harness's own fingerprint already does this multiplication explicitly
(`cam.setZoom(1.72 * R.deviceScale())`), which is why it never noticed.

The one genuine oddity worth stating: `clampZoom` raises the ceiling to the
floor —

```ts
const floor = Math.max(cover, minZoom)
return Math.min(Math.max(requested, floor), Math.max(floor, maxZoom))
```

— so on a viewport whose cover zoom exceeds `maxZoom`, `maxZoom` stops being a
ceiling at all. That is deliberate (cover is what stops dead space showing past
the map edge) and documented in the file. For 4.825 to be *cover* the canvas
would have to be 6176 px wide or 3474 px tall, which is a very large desktop.

**Unrelated to the crash.** The fix is one report line printing the device
ratio and the design-space zoom alongside the raw number.

---

## Block B — the recording

### 1. Moe's sign renders over the innkeeper

The origin math is **correct**. `SignBribe.place()` sets the origin to the
middle of the painted board (`boardTop 0.0725`, `boardBottom 0.63` ->
originY 0.35125) and scales so the board is `boardWidth` across. Both sign
textures are exactly their `contentWidth`/`contentHeight`, so nothing is stale.

The problem is that **the sprite carries a post the painted scene has no room
for**. Alpha-profiling `sign_moes.png` (300x400):

| source rows | frac | content |
|---|---|---|
| 0..28 | 0..0.07 | hanging nub, ~9 px wide |
| 29..252 | 0.07..0.63 | the board, full width |
| 253..399 | 0.63..1.00 | **the post, ~44 px wide** |

At `boardWidth 36` the scale is 0.12, so:

| | world y |
|---|---|
| sprite top | 166.1 |
| board top | 169.6 |
| anchor (`map.json` sign.y) | 183.0 |
| board bottom | 196.4 |
| **sprite bottom (post)** | **214.1** |

The painted board on the plate is y **163..203**. So 11 world px of post hangs
below the painted board, straight onto the innkeeper — and the sprite draws
above the map plate, so the post covers his hand and arm rather than the other
way round.

Second, smaller mismatch: the painted board is 36x40 (aspect 0.90); the
sprite's board is 300x223 (aspect 1.35). Scaled to width 36 it renders **26.8
tall inside a 40-tall slot**, so 6.6 px of blank painted board shows above and
below. Both cannot be satisfied by a scale factor.

Also noted while measuring: `SignBribe.depthY` returns `sprite.y +
displayHeight/2` = 207, but the sprite's actual bottom is 214.1 — the origin is
not 0.5, so the halving is wrong by 7.1 px. Small, but it is the same class of
mistake as the one above.

### 2. Arch entry double-clips

Two separate clips, and only one of them is intended.

The occluders (`map.json entrance.occluders`) are two rectangles cropped from
the plate:

| | x span | y span | depth |
|---|---|---|---|
| left pier | 26..52 | 286..398 | 398 |
| right pier | 98..118 | 286..398 | 398 |

Enemy depth is its lane `y` (`ySort`). Interpolating the waypoints:

| lane x | lane y | vs occluder depth 398 |
|---|---|---|
| 26 | 371 | behind |
| 50 | 382 | behind |
| 98 | 394.3 | **behind** |
| 112 | 398 | crossover |
| 118 | 399.6 | in front |

So the enemy is hidden by the left pier (correct — it is inside the arch),
becomes visible in the open passage, and is then **hidden again by the right
pier from x 98 to x 112** before popping out. That second disappearance is the
double-clip.

Both occluder rectangles also contain painted **road** in their lower portion
(the road at those columns runs y ~365..400 against an occluder bottom of 398),
so an enemy in those spans is covered by a picture of the ground it is standing
on — the exact failure the code comment says the design avoids.

Straight vertical inner edges against a curved arch opening are real too, but
they are the smaller half: enemies are ~40 world px tall standing at y ~382, so
their tops reach y ~342, well below the springing of the arc.

### 3. Music still too loud

`music.json busGain 0.282` (-11 dB) puts music at a measured **-26.4 dBFS**
against voice at **-15.7 dBFS** — nominally 10.7 dB under. Re-measurement is
pending (see "Still to measure"). The number that matters is not the bus but
the two `gain` values under it: `battle` 0.5, `airportAttack` **1.53**. Airport
Attack is the level-1 track and is the loudest thing in the mix by design (it
is a quiet MIDI render being pushed up 3.7 dB). Any further cut should come off
`busGain`, which is one number applied under the player's slider.

### 4. Two banner messages on top of each other

`GameScene.announce()` (`:2311`) creates a **new text at the same fixed
position every time** — `viewW/2, viewH*0.3` — with no queue, no slot and no
knowledge of any other banner. Each lives 2.24 s.

`endWave` calls, in this order:

- `:2210` `grantTowerUnlocks()` -> `announce('NEW TOWER: ...')`
- `:2220` `announce('WAVE CLEARED')`

Zero milliseconds apart, same pixel. That is your "NEW TO WAVE CLEARED ENSION":
"NEW TOWER: EXTENSION" and "WAVE CLEARED" drawn over each other. (Your
recording predates the renaming pass — that tower is now **Bramble**.)

There are five call sites: wave cleared, N got through, new tower, rare drop,
and Last Stand. Three of them can collide on a wave boundary.

### 5. Zoom 4.825

Answered under Block A Q5. Not a device-ratio bug in a new place — it is the
crash report printing device-space zoom against a design-space ceiling.

### 6. Enemies bunch into a single column and walk through each other

`Enemy.tick` does `const p = this.lane.pointAt(this.distance); this.setPosition(p.x, p.y)`.
**There is no lateral offset anywhere** — every enemy sits exactly on the
centreline. `map.json roadWidth: 38` is used only to draw the path band; no
gameplay code reads it for placement. Enemies of different speeds pass straight
through one another because there is nothing to separate them.

### 7. Nine escapes in 3.7 s while the hero was down

`GameScene.tickEngagement` (`:2545`) begins:

```ts
if (this.hero.alive) holders.push({ who: this.hero, range: ..., capacity: ... })
```

and `Hero.alive` is `!this.down`. When he is down he is not a holder, so on the
next frame every enemy he was gripping fails the `live.get(e.blocker)` lookup,
`e.blocker = null`, and they all resume walking **on the same frame**.

With Cory's `blockCapacity: 3` and no summoned fighters, the board goes from
three enemies held to **zero held**. Nothing else in the game stops an enemy —
towers only damage. So the answer to "what does the hero being down change
about enemy progress" is: it removes the only thing that stops them, instantly,
for 25 game-seconds.

Nine escapes in 3.7 s is then the bunching (item 6) cashing out: a single-file
column released at once arrives as a single-file column.

### Shared causes in Block B

- **6 and 7 share a cause**: enemies are a single column on the centreline with
  one release point, so releasing the hero's grip releases them as a block.
- **1 and 2 share a cause**: rectangular geometry (a sprite's bounding box, an
  occluder rect) laid over painted art that is not rectangular.
- **4** is alone: one shared slot with no queue.
- **5** is alone, and is a reporting-units problem rather than a defect.
- **3** is alone.

---

## Block C — the eight

### 1. The settings menu

**Correction, stated plainly:** this was specified earlier in this
conversation and built — commit `9b9f477`, *"One gear instead of four controls,
and a settings dialog behind it"*. What exists today already does most of what
you have now asked for: the mute toggle, the stepped volume readout and the
pause button are gone, replaced by **one gear** that pauses the game and opens
a dialog with three sliders (MUSIC / SOUND EFFECTS / VOICE) and three buttons
(HOME / RESTART / CONTINUE), and `tests/settings.test.ts` covers it.

**The new spec differs in one place**: the gear is currently **bottom-right**
(`HudLayout.settings` = `{ x: right - 40, y: bottom - 40, 40, 40 }`), and you
want it **at the top of the HUD**. That is the change to make.

The other clauses are already claimed but not all verified to your standard:
"map ignores taps while open" and "CONTINUE actually resumes" both need a
position-asserting probe, not just a handler test. Listed under "Still to
measure".

### 2. START WAVE far too large

Measured, at 844x390 (`presentation.json hud.layout`):

| | value | share of screen |
|---|---|---|
| `startWidth` | 240 | 28% of width |
| `plateHeight` | 44 | 11% of height |
| floor `startMinWidth` | 150 | 18% |

Confirmed by the fingerprint: `FP hud startButton = 594.00,10.00,240.00,44.00`.

### 3. Hero hit area too small

`Hero.pickRadius` returns a **hardcoded 30** (`Hero.ts:182`) — a gameplay
number in a `.ts` file, which is a hard-rule violation on its own — and
`hits()` is a circle around his **feet**:

```ts
hits(x, y) { return Math.hypot(this.x - x, this.y - y) <= 30 }
```

Cory is base-anchored (`art.json hero-cory anchorY 1.0`), `displayHeight 75.8`,
so his body occupies **y - 75.8 .. y** and is 62.3 world px wide. The pick
circle covers **y - 30 .. y + 30**:

- it reaches only **40%** of his height, all of it below the waist;
- his head, chest and face — the top 46 px, **60% of him** — are not tappable;
- it extends 30 px of grass *below* his feet, where he is not.

### 4. SELL confusable with UPGRADE

Three things stack:

1. **SELL's position moves.** `GameScene.ts:1570` pushes it **last**, so with
   an upgrade available it is option 2 of 2; at the specialisation branch it is
   3 of 3; at max tier it is **1 of 1 — sitting exactly where UPGRADE was**.
2. **The confirm button is an icon with no words** (`TowerRing.ts:472`,
   `mk(..., 'confirm', ...)` draws a tick glyph). The confirm for SELL and the
   confirm for UPGRADE are pixel-identical.
3. Explicit confirmation *does* already exist and *does* already name the tower
   and the refund — the panel title is `Sell ${def.name}` and the accent row
   reads `Returns  <n>p`. The failure is that neither reaches the button.

Whether a ring plate can cover the tower itself is not yet measured; the panel
is disqualified from covering the anchor, the plates are not.

### 5. Respawn circle is wrong

It **is** labelled: `drawHeroMarkers` (`:942`) draws a pulsing salmon ellipse
at `hero.returnPoint` with `BACK IN <n>s` above it. So the complaint is about
*where*, not *whether*:

`Hero.homeX`/`homeY` are **`readonly`, set once at construction** from
`map.json heroStart` = `(521.7, 524.2)`. He always returns there, never to
where he fell.

Second consequence, not in your list but the same line of code: `revive()` also
does `this.rallyX = this.homeX; this.rallyY = this.homeY`, so **the revive
silently cancels whatever standing order the player had given him**.

### 6. Music does not loop

Airport Attack is configured `loop: true` with `loopGapMs: 900`, which puts it
on the JS restart path rather than the element's native loop:

```ts
const gapped = def.loop && (def.loopGapMs ?? 0) > 0
el.loop = def.loop && !gapped
```

The restart hangs off an `ended` listener that seeks to 0, replays, and ramps
`loopFade` back up. The `looptrack` harness scenario exercises exactly that
seam **in isolation, by calling `playTrack` directly** — it does not go through
a real run. What a real run adds is `pauseMusic`/`resumeMusic` and the settings
pause. `resumeMusic` skips any deck whose `mix.decks[i].level <= 0`.

This one is **not diagnosed**. It needs a probe that plays the seam inside a
live GameScene, not reasoning. Listed under "Still to measure".

### 7. Tower move not discoverable

It is worse than undiscoverable: **there is no move option in the tower ring at
all.** The only way to move a tower is the hero ability **Restructure**, and
`armRestructure` (`:2056`) refuses it outright unless DAD MODE is active:

```
refuse(`${restructure.name} needs ${lastStand.name}.`)
```

DAD MODE triggers at 25% health, **once per encounter**. So moving a tower
requires nearly dying, and then it is a two-tap mode (tap a tower, tap a free
spot) with a 22 s cooldown. The cause is the gate, not the affordance.

### 8. Summon circle

Noted, left alone as you asked.

### Shared causes in Block C

- **2, 3 and 4 share a cause**: hit and chrome sizes are chosen as constants
  rather than derived from what they represent — 240 px because 240 looked
  right, 30 px around a 75.8 px hero, an icon-only confirm for two opposite
  actions. Nothing measures the thing it is standing in for.
- **5 and 7 share a cause**: a rule that made sense in isolation (revive at a
  fixed home; gate the move behind the transformation) with no surface telling
  the player it exists.
- **1** is a spec delta, **6** is undiagnosed, **8** is deferred.

---

## Block D — the second half

### 1. Peanut economy runs away

Income, from `waves.json` and `enemies.json` (`peanutsPerWaveCleared` 35,
`startingPeanuts` 100):

| wave | bounty | + clear | wave income | cumulative |
|---|---|---|---|---|
| 1 | 32 | 35 | 67 | 167 |
| 2 | 48 | 35 | 83 | 250 |
| 3 | 61 | 35 | 96 | 346 |
| 4 | 82 | 35 | 117 | 463 |
| 5 | 140 | 35 | 175 | 638 |
| 6 | 160 | 35 | 195 | 833 |
| 7 | 220 | 35 | 255 | 1088 |
| 8 | 284 | 35 | 319 | 1407 |
| 9 | 353 | 35 | 388 | 1795 |
| 10 | 401 | 35 | 436 | 2231 |
| 11 | 435 | 35 | 470 | 2701 |
| 12 | 515 | 35 | 550 | 3251 |
| 13 | 1004 | 35 | **1039** | 4290 |

Cost, per tower, all the way up:

| tower | build | tier 2 | specialisation | total |
|---|---|---|---|---|
| Slingshot | 80 | 112 | 320 | 512 |
| Bramble | 100 | 140 | 400 | 640 |
| Mortar | 125 | 175 | 500 | 800 |
| Beacon | 140 | 196 | 560 | 896 |
| Grinder | 150 | 210 | 600 | 960 |
| Longshot | 220 | 308 | 880 | 1408 |

**Where they diverge — the ceiling is the pad count, not the price.** There are
**7 build spots**, and `draft.json` gives 2 tower types at start, a 3rd after
wave 4 and a 4th after wave 8. Seven towers is the most that can ever exist, so
the total sink for a run is 7 x (one tower's full path):

- cheapest realistic draft (Slingshot + Bramble): **~4,000**
- dearest (Longshot + Beacon): **~8,300**

Against 4,390 of lifetime income. So on paper it is tight — but income is
front-loaded relative to the sink in two ways:

1. **Nothing is gated.** Upgrades and specialisations have no wave requirement,
   so a player who builds efficiently is fully built out by roughly wave 8-9
   and every peanut after that has nowhere to go. Cumulative income through
   wave 8 is 1,407; through wave 12 it is 3,251.
2. **Wave 13 alone pays 1,039**, of which 900 is the Politician's bounty —
   arriving in the last wave, when there is nothing left to buy and no wave 14.

That matches your recording: 323 at wave 7 climbing to 967 at wave 11 is the
sink running out while income keeps accelerating. The divergence begins where
the pads fill, and the boss bounty is the largest single contribution to a
number that can no longer be spent.

### 2. Boss health bar takes the entire top of the screen

`HudScene.drawBossBar` uses `this.layout.messageRow` for x, y **and width** —
it does not read a width from data. At 844x390 the fingerprint gives
`FP hud messageRow = 271.00,60.00,563.00,22.00`, so the bar spans screen x
271..834 plus a 3 px halo: **67% of the screen width**, the full remaining
width of the row.

Worth noting separately: `presentation.json hud.bossBarWidth: 560` and
`bossBarTop: 10` are **dead data** — nothing reads them. Two tuning numbers
that cannot tune anything.

### 3. Boss intro card nearly full width, tagline too small

`GameScene.announceBoss` (`:2509`):

```ts
const card = platePanel(this, 0, mid - 78, W, 156)
```

Not "nearly" — **exactly** full width, x = 0, w = viewport width. Height 156,
which on a 390 px screen is **40% of the height**. The name is 56 px; the
tagline is **17 px**, a 3.3:1 ratio, wrapped to `W - 80`.

### 4. Hero death lockout, and whether it should scale

First, a correction to the premise: **waves are not 13 seconds.** Measured from
`waves.json`, `enemies.json` speeds and a lane of 1,927 world px, with
`rules.json pacing.gameSpeed 1.4`:

| wave | spawn span | slowest walker | wave length (game s) | (real s) |
|---|---|---|---|---|
| 1 | 4.5 | Bruiser | 37.7 | 26.9 |
| 5 | 10.2 | Bruiser | 43.4 | 31.0 |
| 8 | 15.8 | Buckethead | 64.0 | 45.7 |
| 12 | 20.8 | Buckethead | 68.9 | 49.2 |
| 13 | 20.0 | The Politician | 107.6 | 76.9 |

The 13 seconds is closest to the gap *between* waves: `readySeconds: 15` game
seconds = 10.7 real.

`reviveSeconds: 25` is in **game** seconds, decremented by the scaled delta, so
it is **17.9 real seconds** — which is exactly the 143548 -> 161398 = 17.85 s
in your log. The data and the recording agree.

As a fraction of the wave it lands in:

| wave | lockout / wave length |
|---|---|
| 1 | 66% |
| 5 | **58%** |
| 8 | 39% |
| 12 | 36% |
| 13 | 23% |

**So it should not scale up — it already scales down.** A fixed 25 s is
harshest at wave 5 and mildest at the boss, which is backwards from what a
scaling rule would normally be for. If anything it argues for the opposite:
scale the lockout *with* the wave so it stays a constant fraction, or leave it
fixed and accept that early deaths cost more.

The compounding factor is Block B item 7: for those 25 game-seconds the board
has **zero blockers**, not a weakened one.

### 5. Haymaker recharging during the boss fight

`heroes.json cory.haymaker.cooldown: 12` game seconds = 8.6 real. Wave 13 runs
107.6 game seconds, so Haymaker offers **about nine uses** across the boss
fight. There is no bug in the number; a 12 s cooldown is on cooldown for 12 s
of every 12 s if it is used the moment it comes up.

If the complaint is that it was greyed out when you wanted it, the cause is
that and not a defect. If it is that it *recharged* — became available again —
during a fight you expected to be a single climactic swing, that is a design
question about whether a boss fight should use a per-encounter ability rather
than a cooldown one. Restructure (22 s) has the same shape.

### 6. Level one is not losable

Recorded as measured, no fix proposed, as you asked. Two full 13-wave harness
runs at dpr 3 both finished **20 of 20 lives**; your hand-played run finished
19 of 20. The Politician has 4,600 health and speed 22 — 87.6 game seconds to
walk the lane — against a board that by wave 13 can be fully built out.

### Shared causes in Block D

- **2 and 3 share a cause**: both size themselves from the *container* rather
  than from the content — `messageRow.width` for the bar, `W` for the card. And
  both have data (`bossBarWidth`, `bossBarHeight`) that no longer reaches the
  code.
- **1 and 6 share a cause**: the run has no sink and no threat in its back
  half. Peanuts pile up for the same reason lives do not fall.
- **4 and 5** are the same measurement problem in opposite directions: two
  durations in game-seconds being compared against wall-clock impressions.
  `gameSpeed 1.4` makes every number in the data 1.4x larger than what the
  player experiences, and nothing in the UI says so.

---

## The full scenario suite at dpr 1 and dpr 3

Every scenario in `tools/harness/index.html` run through `both.sh` at 844x390.

RESULTS PENDING — see the addendum at the end of this file.

---

## Still to measure

These are the items I would not report on from reading alone:

1. **Music levels re-measured**, before and after any further cut (`levels`
   scenario decodes the real files in Chromium).
2. **Airport Attack's loop inside a live run**, not in isolation — the only
   honest way to tell whether `pauseMusic`/`resumeMusic` or the settings pause
   breaks the restart.
3. **The peanut balance across a real 13-wave run**, logged per wave, to put a
   measured curve beside the arithmetic above.
4. **A screenshot of the down state**, to see what the respawn circle actually
   looks like next to a build pad.
5. **The settings dialog's CONTINUE and the map's tap-blocking**, asserted by
   position rather than by handler.
6. **Whether a ring plate can cover the tower it belongs to**, at every pad and
   every zoom.
