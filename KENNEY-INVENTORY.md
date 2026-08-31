# Kenney inventory

Everything still coming from Kenney's free CC0 packs rather than from painted
art, where it appears, how big it renders and how often anyone sees it.

**Status: acted on.** The dead keys, the unused pack files, the two unused
fonts and the reference sheets under `public/` are gone; the explosion, hit
spark and death puff have been replaced with painted animations; and both
rockets are painted. What is left of Kenney in the game is **three 28px
projectile dots, one muzzle-flash tile, six title-screen shapes at 12%
opacity, one font and the audio** — ten sprites, of which four are visible
during play.

The recommendations below are kept as written so the reasoning survives; the
sections they refer to are marked where they no longer describe the build.

**Written at:** commit `9b8279b`, after the gnome swap. **Acted on at:** the
effects and cleanup commit that follows it.

---

## How the sizes were worked out

Every "on screen" figure is the sprite's **opaque content**, not its canvas.
All seventeen pack tiles are 64×64 PNGs and most of that is transparent
padding — `shot-small` is a 16px blob in a 64px frame — so quoting the canvas
would overstate every one of them by three or four times.

World pixels are multiplied by the camera's **default zoom of 1.72**
(`display.json`). The player can pinch between 0.66 (the whole map) and 2.75,
so treat every number as the middle of a range roughly 0.4× to 1.6× as large.
Where the game applies its own scale factor or tweens one, the factor is named.

For reference at the same zoom: **a tower renders 150px tall, a Late Filer
75px, Cory 104px, a gnome 67px.**

---

## Summary

| Category | Kenney assets, then | Now | Verdict |
|---|---|---|---|
| Projectiles | 5 (a sixth was dead) | **3** | ~~replace~~ the two rockets are painted; three 28px dots left |
| Particles and effects | 3 tiles doing 8 jobs | **1 tile, 1 job** (the muzzle flash) | ~~replace second~~ **done** |
| Terrain and scenery | 6 | **6** | not worth replacing |
| UI elements | none left | none | — |
| Fonts | 1 in use, 2 dead | **1** | keep |
| Audio | 32 of 38 cues | 32 of 38 | keep |

Seventeen pack sprites are named in the manifest. Two of those are wired to
nothing, and one more is wired to a tower that never fires — so **fourteen
Kenney sprites actually reach the screen**, and they are all projectiles,
effects or title-screen scenery.

Kenney art is entirely gone from the towers, the enemies, the hero, the boss,
the map, the ability icons, the HUD plates, the buttons, the dialog frame, the
build pads, the signs and now the summoned gnomes.

---

## 1. Projectiles

Sprites, all `.png`, all 64×64 canvases. Drawn by `Projectile.ts` at **1:1 in
world space** — they are the only art in the game with no `render` entry in
`art.json`, so no anchor and no `displayHeight` is applied. `Projectile.tick`
rotates each one to face its target and adds a quarter turn, because the pack's
rockets point north.

Ordered by how often one is in the air, which follows the tower's fire interval
and how likely the player is to have built it.

| Key | File | Fired by | Content | On screen | Seen |
|---|---|---|---|---|---|
| `shot-small` | `kenney/towerDefense_tile272.png` | Withholding Tower — the cheapest tower at 80 peanuts and the fastest firing, every **0.65s** | 16×16 | **28×28** | **Constantly**, whenever it is drafted. The most frequently drawn Kenney asset in the game by shot count. |
| `shot-ring` | `kenney/towerDefense_tile273.png` | Filing Extension — the control tower, slows what it hits, every 0.9s | 16×16 | **28×28** | Constantly, once drafted |
| `shot-rocket` | `kenney/towerDefense_tile251.png` | Rounding Error — splash, every 1.1s | 13×35 | **22×60** | Often. Tall: nearly as tall as the enemy it is flying at |
| `shot-heavy` | `kenney/towerDefense_tile274.png` | Write-Off — the heavy single-target, every 1.7s | 16×16 | **28×28** | Often |
| `shot-rocket-big` | `kenney/towerDefense_tile252.png` | Escalation Clause — big splash, every 2.4s | 19×40 | **33×69** | Occasionally. The largest projectile, and slow enough to read in flight |
| `shot-pale` | `kenney/towerDefense_tile275.png` | Tax Shelter — **never**. See below | 16×16 | never drawn | **Never** |

**`shot-pale` is dead.** `towers.json` gives the Tax Shelter `"shot":
"shot-pale"`, but the Shelter is a support tower: `Tower.tick` returns at
`if (this.isSupport) return` before it can fire, and its `fireInterval`,
`damage` and `range` are all 0. The key is referenced by data, so no test
catches it, and no player has ever seen it.

**Where they appear:** `GameScene.fire()` → `new Projectile(...)`, on any
board, during any wave, from the moment the first tower is built. Nowhere else
— no menu, no icon, no preview uses them.

---

## 2. Particles and effects

Three sprites doing eight jobs between them, bound through four roles in
`art.json` (`fx.spark`, `fx.blast`, `fx.ember`, `fx.muzzle` — `ember` and
`muzzle` are the same file). Every one is tinted, scaled and tweened at the
call site, so the same tile is a hit spark, a death puff, a muzzle flash and a
lightning arc.

### `fx-spark` — `kenney/towerDefense_tile022.png` (sprite, content 32×32)

The busiest art asset in the game. Five call sites:

| Used as | Where | Condition | On screen | Seen |
|---|---|---|---|---|
| Impact spark | `GameScene.impactSpark()` | **every projectile that lands** — scale 0.5 growing to 0.95 over 200ms | **28 → 52px** | **Constantly** |
| Death puff | `Presentation.deathPuff()` | every enemy, gnome and hero death — three per death, scale 0.35, tinted, thrown 20px outward | **19px each** | **Constantly** |
| Chain arc | `AbilityRunner.chain()` | one per link of the Chain Audit ability, scale 0.7 | **38px** | Occasionally |
| Punch | `GameScene.castHaymaker()` | Cory's Haymaker connects, scale 1.2 spinning to 0.2 | **66px** | Occasionally |
| Sparkle | `SignBribe.ts` | the sign-bribe easter egg, scale 0.5 | **28px** | **Rarely** |

### `fx-flame` — `kenney/towerDefense_tile296.png` (sprite, content 23×34)

Bound to `fx.blast`. Every explosion in the game is this one tile scaled to the
radius of whatever went off, so the same 34px sprite is asked to be anything
from 82px to 146px tall:

| Used as | Where | Scale rule | On screen (peak) | Seen |
|---|---|---|---|---|
| Splash impact | `GameScene.blast()` | `radius/40`, from half to full over 280ms — Rounding Error (r64) and Escalation Clause (r88) | **94px** / **129px** | **Constantly**, once a splash tower is built |
| Ability blast | `AbilityRunner.boom()` | `radius/90` growing to `radius/44` over 320ms — Molotov once at r110; Meteor six times at r62 over three seconds, tinted orange | **146px** / **82px ×6** | Occasionally — on a Molotov or a Meteor |

At 146px the Molotov's flame is **as tall as a tower**. It is the largest
Kenney asset the game ever puts on screen, and it is a 23×34 tile blown up
four and a half times. Glacier and Chain Audit do not use it — Glacier draws
its field with a `Graphics` ring and Chain draws lightning with lines — so the
blast belongs to Molotov, Meteor and the two splash towers.

### `fx-flame-small` — `kenney/towerDefense_tile295.png` (sprite, content 17×28)

One file, two roles:

| Used as | Where | Condition | On screen | Seen |
|---|---|---|---|---|
| Muzzle flash | `Presentation.muzzleFlash()` | **every shot any tower fires**, scale 0.5 → 0.75 over 110ms, rotated to the firing angle | **24 → 36px** | **Constantly** |
| Ember | `AbilityRunner.boom()` | six thrown outward from every ability blast, scale 0.7 → 0.2 | **34px** | Occasionally |

---

## 3. Terrain and scenery

Six sprites, one call site, **title screen only**.

`TitleScene.decorateBackdrop()` scatters 26 of them behind the title with a
fixed seed, at random rotations, random scale 0.6–1.5, and **alpha 0.12**. The
title is composed against the 1280×720 design box and fitted to the viewport
(≈0.66 on a phone in landscape), so a 64px tile lands at roughly 25–100 screen
pixels depending on its roll.

| Key | File | Content | On screen | Seen |
|---|---|---|---|---|
| `decor-bush` | `kenney/towerDefense_tile130.png` | 64×64 | ~25–100px, 12% opacity | Title screen only |
| `decor-plant` | `kenney/towerDefense_tile134.png` | 62×62 | ~25–100px, 12% opacity | Title screen only |
| `decor-rock2` | `kenney/towerDefense_tile136.png` | 56×48 | ~22–83px, 12% opacity | Title screen only |
| `decor-rock3` | `kenney/towerDefense_tile137.png` | 42×42 | ~17–65px, 12% opacity | Title screen only |
| `decor-rock` | `kenney/towerDefense_tile135.png` | 36×34 | ~14–56px, 12% opacity | Title screen only |
| `decor-shrub` | `kenney/towerDefense_tile131.png` | 32×32 | ~13–50px, 12% opacity | Title screen only |

Two notes. First, at 12% opacity over a painted backdrop these are texture, not
objects — they read as noise and nobody can tell what any of them is. Second,
`README.md` says the scenery is on "the title and credits backdrops"; that is
now stale. `CreditsScene.decorateBackdrop()` draws 22 translucent circles with
a `Graphics` object and touches no art at all.

**Nothing Kenney appears on the playfield as terrain.** The map is one painted
plate, `maps/map_level1.png`.

---

## 4. UI elements

**None.** Every piece of interface chrome is painted art:

- the three counter plates, `ui/hud_peanuts.png`, `hud_lives.png`, `hud_wave.png`
- the button plates, `ui/btn_primary.png`, `btn_secondary.png`, `btn_disabled.png`, `btn_icon.png`, `btn_icon_active.png`
- the dialog frame, `ui/panel_dialog.png`
- the title illustration, `ui/title_bg.png`
- the nine ability icons under `abilities/`
- the build pad and both signs under `props/`

The ground shadow every character stands on (`gen-ground-shadow`) is generated
at runtime by `Presentation.ts`, not loaded from anywhere.

---

## 5. Fonts

| File | Family | Where | Size | Seen |
|---|---|---|---|---|
| `fonts/KenneyFuture.ttf` | `KenneyFuture`, exported as `FONT_DISPLAY` | Title (82px), credits division headers (92px) and card names, boss name card (56px), Dialog headline number (58px), ScratchCard payout (58px), Loadout heading (44px), and **floating damage numbers** at 15px / 21px on a crit | ≥44px everywhere except the damage numbers | **Constantly** — the damage numbers alone, then every headline |
| `fonts/KenneyFutureNarrow.ttf` | `KenneyFutureNarrow` | **nowhere** | — | Never |
| `fonts/KenneyMiniSquare.ttf` | `KenneyMiniSquare` | **nowhere** | — | Never |

`KenneyFuture` is deliberately fenced to 44px and up by `Theme.faceFor()`,
because below that its `K`, `X` and `R` stop resolving — that is AUDIT #5, and
it is fixed. The floating damage numbers at 15px are the one place that still
sets the face directly, and they get away with it because they are pure
numerals.

The other two faces are declared with `@font-face` in `index.html` and
preloaded by `main.ts` before the game is allowed to boot, so the player waits
on 59 KB of fonts that no style ever asks for.

---

## 6. Audio

**32 of the game's 38 cues** come from Kenney's CC0 audio packs — Impact
Sounds, Interface Sounds, UI Audio and RPG Audio — fetched by
`tools/getsfx.py`, which records exactly which pack file became which cue.
`public/assets/audio/CREDITS.md` has the mapping.

Kenney covers: tower fire (five distinct cues, one per firing tower), enemy hits and deaths, hero
hits, the wave bell, clicks, hovers, errors, confirmations, menu open and
close, scratching, building, and the two coin sounds.

The remaining six are the multi-second stings, synthesised for this project by
`tools/mksfx.py`: the Last Stand transformation, the boss entrance, the Server
Nuke, the last life, and the two run endings. No Kenney pack contains anything
of that shape.

---

## Dead weight — ~~safe to delete~~ **deleted**

### Referenced in the manifest, used by nothing

| Key | File | Why it is dead |
|---|---|---|
| `fx-flame-thin` | `kenney/towerDefense_tile297.png` | In `files`, bound to no role in `fx`, named by no code path. The manifest test only checks that roles resolve to files, never that a file has a role, so nothing catches it. |
| `fx-flame-wide` | `kenney/towerDefense_tile298.png` | Same. |
| `shot-pale` | `kenney/towerDefense_tile275.png` | Referenced by `towers.json` as the Tax Shelter's shot, but the Shelter is support-only and `Tower.tick` returns before firing. Delete the key **and** the `"shot"` line on the Shelter. |

### Loaded but never used

| File | Size | Why |
|---|---|---|
| `fonts/KenneyFutureNarrow.ttf` | 34 KB | `@font-face` in `index.html`, awaited in `main.ts`, referenced by no style |
| `fonts/KenneyMiniSquare.ttf` | 23 KB | Same |

### Shipped but never fetched

| Path | Size | Why |
|---|---|---|
| `public/assets/kenney/` — 282 of 298 PNGs | **622 KB** | The whole pack is committed and copied into the deploy; the manifest names 17 of them, of which 14 are ever drawn. The unused 282 are tower tiles, road tiles, enemy sprites and HUD numbers from the era before the painted art. Keep `License.txt` and the files the manifest names; the rest is deploy weight nobody downloads. |
| `public/assets/units/_gnome_scale.png` | 196 KB | The artist's scale reference sheet — the two gnomes beside the goblin, Cory and the brute. Genuinely useful to keep in the repo, but it should not be under `public/`, where it is copied into the build. |

**Done.** 286 pack PNGs (631 KB), two fonts (58 KB) and every `_`-prefixed art
reference sheet under `public/` (1128 KB — there were more than the gnome one)
are out of the deploy, and the three dead keys are out of the manifest. The
reference sheets moved to `reference/art/`, where they are still in the repo
and no longer shipped. `public/assets/` went from 15.9 MB to 14 MB.

A test now fails if a manifest key is bound to no role and named by no data
file, if a font ships without an `@font-face` or vice versa, if a pack file
under `public/` is not in the manifest, or if an underscore-prefixed reference
file appears under `public/` again.

---

## Recommended replacement order

The question is value per piece commissioned. Two things drive it: how many
times a frame the asset is drawn, and how big it is when it is. A 28px blob
seen four times a second is worth more than a 100px rock seen once a session.

### 1. ~~The explosion~~ — **done**

Replaced by `fx-explosion`, a painted six-frame sheet played at a display size
derived from the blast radius. The reasoning that made it first is below.

#### Why it was first

One tile, and it is every explosion in the game: both splash towers, the
Molotov and all six of the Meteor's impacts. It renders between **82px and
146px**, which makes it the largest Kenney asset on screen by a wide margin,
and at Molotov's scale a 23×34 tile is being blown up four and a half times —
it is visibly soft where nothing else is. It is also the payoff frame of the
ability the player spends a cooldown on. **One piece of art, and it is the
moment the game is loudest.**

Commission a proper blast: a few frames rather than one, or one high-resolution
sprite the game can scale up without going to mush. The call sites already pass
a radius, so nothing needs rewiring.

### 2. ~~The impact spark and the death puff~~ — **done**

Replaced by `fx-hit-spark` and `fx-death-puff`, two four-frame sheets, split
exactly as recommended: one for a landed hit, one for a death. The death puff
is now a single animation rather than three tiles thrown outward.

#### Why it was second

The busiest asset in the game: it fires on every landed shot and three times on
every death, so on a full board it is on screen essentially always. It is small
(19–52px) and always in motion, which is exactly why it has survived — but it
is also the thing directly under the player's eye every time something happens.

Two sprites would cover it better than one: a **hit spark** and a **death
puff**, because they are doing different jobs and the pack tile is a compromise
between them. The Haymaker punch and the chain arc can keep reusing the hit
spark.

### 3. ~~The two rockets~~ — **done**

Replaced by `projectile-rocket` and `projectile-rocket-big`, painted and
trimmed. They were the only sprites in the game drawn 1:1 in world space with
no render entry, which is called out below; `Projectile` applies the manifest
now like everything else, so they are sized by data rather than by their
source resolution.

#### Why they were third

At **60px and 69px tall** these are the projectiles anyone can actually see;
the round shots are 28px and read as dots at any zoom. They also belong to the
two splash towers, whose painted bases are the most distinctive on the board,
so the mismatch between a painted cannon and a pack rocket is the most visible
one in flight.

Two sprites. Draw them pointing north to match the existing quarter-turn in
`Projectile.tick`, or drop the offset when you swap them in.

### 4. The muzzle flash — `fx-flame-small` as `fx.muzzle`

Drawn on **every shot from every tower** — the highest count of anything in
this list — but small (24–36px) and gone in 110ms. Cheap to improve and it sits
right on the painted towers, where a pack tile is most obviously not the same
hand. Worth one sprite, not two.

### 5. The three round shots — `shot-small`, `shot-ring`, `shot-heavy` — **next**

28×28 on screen, in flight for a fraction of a second, and mostly seen against
grass. `shot-small` is the most-drawn projectile in the game by count, which is
the only argument for doing them; against that, at this size they are coloured
dots and a painted dot looks much like a pack dot. **One sprite sheet of four
recoloured variants would do all of them**, and it is the last art job that
changes what the board looks like.

(Do not commission `shot-pale`. Delete it — see above.)

### 6. The ember — `fx-flame-small` as `fx.ember`

Six per ability blast, 34px, thrown outward and faded in 380ms. If the blast in
#1 is commissioned with its own debris, this disappears for free. On its own it
is not worth a commission.

---

## Not worth replacing

**Audio.** Thirty-two cues, CC0, and they are good. Impact and interface sounds
are the one category where a free pack genuinely competes with commissioned
work: they are short, abstract, and the game already mixes them per-cue with
its own gains and voice caps. The six places Kenney could not cover are already
synthesised. Spend nothing here. If the audio ever gets a pass, it should be
**music**, which the game has none of, not replacing these.

**Fonts.** `KenneyFuture` is a display face doing display-face work at 44px and
up, which is exactly what it is good at, and its one weakness — illegible `K`,
`X` and `R` below 40px — is already fenced off in `Theme.ts`. A commissioned
typeface is a five-figure job that would buy nothing here. Delete the two
unused faces and keep this one.

**Title scenery.** Six tiles, one screen, **12% opacity**, randomly rotated and
scaled. Nobody can identify a single one of them and nothing about the title
would change if they were replaced. If the title backdrop ever gets attention
it should be a single painted illustration replacing the whole scatter, not six
new bushes — which makes this a title-screen design decision, not an art
commission.

**UI.** Nothing left to replace.

---

## What this leaves

After the four commissions above — a blast, two sparks, two rockets and a
muzzle flash, call it **six pieces of art** — the only Kenney visuals left in
the game would be four 28px projectile dots and six title-screen shapes at 12%
opacity. That is the point at which the game stops looking like it has
placeholder art in it, and it is a smaller job than it sounds because every one
of these is an effect, not a character: they are small, they are in motion, and
none of them needs to hold up to being stared at.
