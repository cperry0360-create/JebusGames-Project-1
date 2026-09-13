# Eli's fire, Star Rain over the whole map, and the exclamation mark

| commit | what it is | CI |
|---|---|---|
| `569ec71` | The hero chip stops carrying a texture key across a level change | **green** — [run 317](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34759967740) |
| `75e5bbc` | Star Rain falls on the whole map, and Eli gets Russinga is Fire | **green** — run 317 |
| `4511950` | Harness: an ability-bar sweep, Eli's three, and both held beams | **green** — run 317 |
| `7924e0a` | This report and its SOAK-REPORT entry | **green** — [run 318](https://github.com/cperry0360-create/JebusGames-Project-1/actions/runs/34760292998) |

Run 317 is one run over the first three commits, pushed together: `test`
**success**, `typecheck` **success**, `changes` **success**, `deploy`
**skipped** (this is a branch, not `main`). Run 318 is the same four jobs on
the report commit. Tests **1069 → 1072**.

One commit is not in the table and cannot be: the one that fills the table in.
It is the branch's last, it is markdown only, and its run is named at the end
of this file.

---

## The short version

**The exclamation mark is the missing-icon stand-in, and the HERO CHIP is what
draws it — not any ability slot, and nothing is failing to load.** Every key in
the manifest resolves and every slot wears its own art. `chipPortrait` is
constructed wearing the 256px stand-in and is given its real texture, and its
fit, only `if (key !== this.chipKey)` — and `chipKey` is a plain field on a
scene instance Phaser constructs **once** and re-`create()`s on every restart.
A player takes the same hero from level to level, so from the second board
onward the comparison matched, the branch was skipped, and a brand-new image
sat unfitted at 256×256 across the leftmost ability cards. Level 1 was never
affected, which is exactly why it took an iPad at level 6 to see it.

**Star Rain is now the whole board, and it is worth between +2.7 and +11.5
points of win rate on the published rotation, +22.3 to +73.1 on Eli's own
seeds.** Nothing was re-tuned. The Cory-pinned control reproduced all eight
published win rates to the run.

**Russinga is Fire is data only** — no new code path — and it moves no soak
number at all, because the simulator models slot 1 and nothing else. That is
measured below, not assumed.

---

## 1. What was drawing the exclamation mark

### It is the fallback, and the fallback is an exclamation mark

`Presentation.ensureIconFallbackTexture` draws the stand-in with
`g.fillRoundedRect(n*0.44, n*0.30, n*0.12, n*0.30)` and
`g.fillCircle(n*0.5, n*0.70, n*0.075)` — a stem and a dot below it. Its own
docstring calls that a question mark; it is an **exclamation mark**, drawn
rather than typed so it needs no font. `presentation.json`'s `iconFallback`
block was the right place to look.

### But no icon was missing

Checked, not assumed. All 18 `ability_*.webp` are on disk at 256×256, every
`ability-*` key resolves through both hops, and the ability-bar sweep below
reports zero stand-ins on 12 different boards. **So the brief's "if an asset is
failing to load, the fix is the asset" does not apply here — this is a code
fault, and the fix is the code.**

### The measurement that named it

`tools/harness/run.sh elibar 260 1024x768` walks all five heroes and all eight
levels with the whole draftable hand on the bar, and for each slot prints the
texture the sprite is **actually wearing** and the size it is **actually drawn
at** — then intersects every other visible HUD leaf with each slot's rectangle.
On the tree before the fix:

```
eli/level1          8 slots  stand-ins=none  oversize=none  foreign=none
eli/level2          8 slots  stand-ins=none  oversize=none  foreign=2
   *** eli/level2  Image generated-icon-missing @27,600 256x256 over molotov(ability-molotov)
   *** eli/level2  Image generated-icon-missing @27,600 256x256 over gnomes(ability-gnomes)
   ... identical on level3, level4, level5, level6, level7, level8
cory/level6         8 slots  stand-ins=none  oversize=none  foreign=none
courtland/level6    9 slots  ... none
han/level6          8 slots  ... none
bailey/level6       8 slots  ... none
RESULT *** 14 fault(s) on the ability bar ***
```

Read the shape of that, because it is the whole diagnosis:

- **Level 1 is clean and every level after it is not.** Level 1 is the first
  board of the session, so the cache has no previous run to carry.
- **Every hero change is clean.** `cory`, `courtland`, `han` and `bailey` each
  followed a different hero, so the portrait key differed from the stale
  `chipKey`, the branch ran, and the sprite was fitted. Only Eli→Eli→Eli→…
  reproduced it — which is a player walking the world map with one hero.
- **The object is at 27,600 and is 256×256.** That is the hero chip's box, and
  256 is `iconFallback.size`. No slot ever wore a stand-in: `stand-ins=none` on
  every row.

After the fix, the same sweep:

```
RESULT no stand-in, no oversized icon and nothing foreign on the ability bar,
       across 12 boards
```

### The fix

One line in `buildHeroChip`: `this.chipKey = ''` beside the `add.image` that
creates the sprite. The cache describes the sprite, so it is cleared where the
sprite is made; `''` is not a texture key, so the first `drawHeroChip` always
sets and fits.

This is the third sighting of this stand-in at the wrong size, and the second
time the cause was "the fit was skipped" rather than "the art is missing" — see
`reports/2026-09-07-the-oversized-placeholder.md`, which fixed the same class
of bug inside `drawSlots`. `tests/assetpaths.test.ts` grew a check for it, and
**the check was proved able to fail**: removing the line turns it red, putting
it back turns it green.

---

## 2. Star Rain over the whole playfield

### Why it is not simply a bigger radius

A strike damages what is within `presentation.json`'s `heroFx.strikeLength` —
**26 world pixels**, an area of 2,124 px² — and the board is 1280×720 =
921,600 px². Scattering fourteen strikes uniformly over the playfield catches a
given enemy `14 × 2124 / 921600 = 0.032` times, for **0.6 damage**. Matching the
old per-enemy figure (`14 × (26/62)² = 2.46` strikes, about 49 damage) that way
needs **about 1,070 strikes**. A uniform map-wide scatter is not a strong
ability or a weak one; it is not an ability.

So `coversMap` spreads the volley over the **enemies** rather than over the
empty board. Each star picks a live enemy at random, anywhere on the map, and
falls within `radius` of it. `radius` is now the jitter round the chosen target
rather than the area, and it is **22** — inside the 26 a strike damages, so a
star that picks an enemy always hits it, and a star landing on one of a clump
still catches its neighbours. `tests/content.test.ts` enforces
`radius <= strikeLength` for any `coversMap` ability.

Everything that made it a scatter survives: which enemy gets how many stars is
the roll, the volley is worth `hits × damage = 280` spread over whoever is out
there rather than all of it landing on one target, and with nothing on the
board the stars fall over the whole playfield so a cast on a clear lane still
looks like the ability. **What changed is only the reach.**

A rain that is not map-wide draws exactly the two random numbers per strike it
always did, so nothing else in the game moves — which the Cory control below
confirms to the run.

### The soak: levels 1 to 8, 480 seeds, the same seeds

`tools/soak/eli.ts` is new and runs the same seeds three ways, because the two
existing drivers answer different questions and neither answers this one:
`level.ts` pins Cory, so a change to Eli cannot move a number it prints;
`run.ts` rotates and dilutes by about 7×; `heroes.ts` does both but stops at
level 5 and reports Courtland.

```bash
node --experimental-strip-types tools/soak/eli.ts 480 out.json
```

**Rotation used:** `["cory","cory","cory","courtland","han","eli","bailey"]`,
copied from `tools/soak/run.ts`. Eli plays seeds where `seed % 7 === 5`, which
is **68 of 480** on every level.

| level | cory-pinned (control) | rotated (published shape) | eli-pinned (undiluted) |
|---|---|---|---|
| level1 | 89.2% → 89.2% **+0.0** | 73.1% → 79.6% **+6.5** | 56.2% → 95.2% **+39.0** |
| level2 | 53.1% → 53.1% **+0.0** | 40.4% → 48.5% **+8.1** | 18.3% → 79.2% **+60.8** |
| level3 | 87.9% → 87.9% **+0.0** | 66.2% → 77.7% **+11.5** | 26.9% → 100.0% **+73.1** |
| level4 | 62.3% → 62.3% **+0.0** | 61.7% → 68.3% **+6.7** | 45.6% → 93.8% **+48.1** |
| level5 | 45.4% → 45.4% **+0.0** | 37.7% → 41.0% **+3.3** | 33.8% → 56.0% **+22.3** |
| level6 | 43.8% → 43.8% **+0.0** | 27.1% → 29.8% **+2.7** | 9.8% → 38.1% **+28.3** |
| level7 | 41.2% → 41.2% **+0.0** | 38.8% → 45.0% **+6.2** | 37.9% → 73.3% **+35.4** |
| level8 | 40.6% → 40.6% **+0.0** | 38.5% → 46.9% **+8.3** | 33.8% → 89.6% **+55.8** |

**Every level moved. None was re-tuned.**

Eli's own seeds inside the rotation, won of played — this is where the rotated
column's whole movement comes from:

```
level1  34/68 -> 65/68     level5  24/68 -> 40/68
level2  14/68 -> 53/68     level6   7/68 -> 20/68
level3  13/68 -> 68/68     level7  21/68 -> 51/68
level4  32/68 -> 64/68     level8  22/68 -> 62/68
```

**THE CONTROL IS THE PART TO TRUST.** The Cory-pinned column is byte-identical
across all eight levels — 2,225 wins of 3,840 before and after — and it
reproduces the win rates `SOAK-REPORT.md` already publishes, to the run:
level4 299/480, level5 218/480, level6 210/480, level7 198/480, level8 195/480.
So this is the same instrument reading the same game, and the only thing that
moved is the hero whose ability changed.

**Read the columns for what they are.** The published band in `SOAK-REPORT.md`
is a statement about the **Cory-pinned** numbers, and those did not move at
all: no level is outside the 35–45% band that was not outside it yesterday.
The rotated column is what an aggregate `run.ts` soak would now report, and it
is genuinely higher on every level. The eli-pinned column is what a player who
picks Eli now experiences, and **level 3 is a 100% win rate on 480 seeds**.

Level 3 at 100% and level 8 at 89.6% on Eli's seeds are the numbers worth a
decision. **Cory decides; nothing here was tuned to compensate.**

---

## 3. Russinga is Fire

### It is data only

No new code path. Courtland's generalisation from "slot 2 is the powered one"
to per-ability `activation` and `poweredOnly` is what makes a second held beam
a JSON entry — the two-step arm-then-hold gesture, the `onBoard` gate, the
cooldown that starts in `endHeldAbility` and only when the beam fired, and the
three-clip strip are all already general. The diff for the ability itself is
one object in `heroes.json`, two keys in `art.json`, and two files.

### The numbers, against the Mind Laser

| | Mind Laser | Russinga is Fire |
|---|---|---|
| damage per tick | 42 | **34** |
| tick | 0.15s | 0.15s |
| hold budget | 10s | **8s** |
| damage per second | 280 | **227** |
| whole budget | 2,772 | **1,802** (65%) |
| cooldown | 14s | **16s** |
| reach | 520px | **420px** |
| corridor | 56px | **72px** |
| ignores armour | yes | yes |
| powered only | yes | yes |

`heroes.json`'s own note calls the Mind Laser the roster's declared overpowered
outlier and says to compare it against the other four heroes before taking it
as a baseline. So this sits clearly under it on every axis except the corridor,
which is wider because fire spreads — and a wider corridor is also what brings
the anisotropy down.

Armour is ignored, and that is deliberate rather than copied: at 0.15s ticks,
subtractive armour is charged 53 times over a full hold, so an armour-respecting
beam at 34 a tick would be nearly useless against the heavy roster. The balance
is taken out of damage, hold, cooldown and reach instead.

### The art, and the anisotropy

`fx_eli_fire.png` is registered as **one row of twelve 381×330 cells** and is
not re-sliced or re-gridded; `art.json`'s `_note` on the key says why, because
the drift is invisible until somebody tries to "fix" the layout.

**Anchors verified against `tools/measure_art.py`, not pasted:**

- `anchorY`: the brief proposed 0.5909. The beam-strip section measures the
  core's centre line over the sustain frames and reads **0.5955** — 1.5px
  higher, inside the tool's own 0.02 drift threshold, and the measurement is
  what is recorded.
- `anchorX`: the brief proposed 0.0814, which is x31.0 of 381. The tool has no
  anchorX measurement for beams, so it was checked against the per-frame ink:
  x31 sits inside the ink of **all twelve** frames and 13–21px in from each
  one's left edge. That is the same shape `fx-mind-laser` has, where the muzzle
  glow reaches the cell's left edge exactly. **0.0814 stands.**
- `beamCoreHeight`: measure_art says **108px** of the 330px cell. The entry was
  drafted at 120 and the tool flagged it: `<-- beamCoreHeight should be 108`.

**`contentWidth` is NOT the cell, and this is where the Mind Laser got lucky.**
`GameScene.aimHeld` scales by `range / contentWidth` with the sprite's origin at
the muzzle, so `contentWidth` has to be the distance from the muzzle to the
painted tip if the fire is to end where the damage corridor ends. The union ink
runs x10–370, so that is **370 − 31 = 339**. `fx-mind-laser` records 225, its
whole cell, and is right only because its muzzle is at x0 and its ink reaches
x224 — the two coincide there and do not here.

**The anisotropy, read off the live sprite in the harness rather than off the
manifest:**

```
drawn 472x220  scale 1.239 x 0.667  ANISOTROPY 1.86:1
  (contentWidth 339, beamCoreHeight 108 of a 330px cell)
the same sum against contentHeight would be 5.28:1, which is the mistake
fx-mind-laser shipped
```

| | anisotropy |
|---|---|
| `fx-mind-laser` as it shipped (beamWidth ÷ contentHeight) | 8.25:1 |
| `fx-mind-laser` today (beamWidth ÷ beamCoreHeight) | 3.14:1 |
| **`fx-eli-fire`** | **1.86:1** |

**And it reads as painted art in a rendered frame**, which is the check the
number cannot make: distinct flame tongues, dark-red outlined embers and a
white-hot core with separate licks, not a smooth gradient. Reproduce with

```bash
sh tools/harness/run.sh elifire 340 1024x768
python3 tools/harness/shrink.py tools/harness/shots/elifire-4-firing-1024x768.png 900 --crop=340,270,200,90
```

### The animation manager trap

The brief's warning is real and this effect goes through the same path.
`Effects.forgetEffectAnims` asks the **texture** which animations belong to it
(`getAnimsFromTexture`) rather than matching clip names, so a second strip cut
into `-charge`, `-sustain` and `-fade` is covered by construction — and "by
construction" is a claim, so `nullframe` now takes the hero as an argument and
measures it on both beams:

```
$ sh tools/harness/run.sh nullframe 220 1024x768 eli
level 1 clips: fx-eli-fire-charge=4f  fx-eli-fire-sustain=5f  fx-eli-fire-fade=3f
level 3 clips BEFORE any press: charge=absent  sustain=absent  fade=absent
level 3 press: lit=true  threw=no
animations registered: 13  holding destroyed frames: none
RESULT the held beam survives a level change: clips are re-cut, the press
       lights it, and gameout stops it
```

`fx-eli-fire` is in `art.json`'s `levelArt.shared`, so it arrives with a level
and is freed with it, and its three clips are forgotten alongside the texture.

### Its soak movement: none, and that is measured

**The simulator models slot 1 and nothing else.** `Sim.ts` registers
`heroSlotId(0)`, reads `hero.abilities[0]`, and has no code for a powered-form
or held ability — so Ice Beam and the Mind Laser have never been in a soak
number either.

Proved rather than asserted: a worktree at the same commit with the third
ability deleted from `heroes.json`, soaked at 120 seeds × 8 levels × 3
rotations against the unmodified tree.

```bash
node --experimental-strip-types tools/soak/eli.ts 120 out.json   # both trees
diff <(jq .rows a.json) <(jq .rows b.json)   # no output
```

**All 24 numbers identical.** Russinga is Fire contributes nothing to any
published win rate, and will not until the simulator learns the powered form.

---

## What came from rendered frames

**From rendered frames**, all at 1024×768 (an iPad's CSS viewport) at
device ratio 3 unless stated:

- **No stray glyph over the Scratch Ticket.** `elibar` at 1024×768, and the
  cropped ability bar from `elibar-eli-level6-1024x768.png`. The hero chip is
  fitted inside its own box and the six cards beside it are untouched.
- **Eli shows three ability medallions, and no other hero changed.**
  `elifire-1-bar-eli-1024x768.png` shows Star Rain in colour and the two
  powered-only abilities greyed; the roster counts read off the live bar are
  cory 2, courtland 3, han 2, eli 3, bailey 2. The loadout card carries all
  three chips at 667×375, 844×390 and 1400×900 — `screens-3-loadout-eli-*.png`.
- **Russinga is Fire arms on a medallion tap and draws painted fire.**
  `elifire-3-armed-*.png` (the armed disc, nothing lit) and
  `elifire-4-firing-*.png` (the beam, cropped above).
- **Star Rain covers the whole playfield.** Two frames, because one cannot do
  it: `elifire-2-starrain-*.png` shows the strikes landing on enemies strung
  along the lane, and `elifire-2b-starrain-empty-3-*.png` shows an empty-board
  volley falling over open ground. **No single frame can hold the whole
  volley** — the fourteen strikes land 0.09s apart and each sprite lives about
  a third of the volley's length, so at most five are on the glass at once.
  The extent is therefore a measurement across the volley, not a photograph:
  **1151×655 of a 1280×720 board, 90% × 91% of the playfield.**
- **Layout, at all three viewports.** `screens` reports **one** fault at
  667×375 and 844×390 — `SMALL Title [title:version-stamp (hidden dev door, not
  a tap target)]` — and **zero** at 1400×900. That fault is **pre-existing**:
  the same `screens` run on a worktree at `569ec71` reports it identically.
  Portrait at 375×667 is correctly gated. `contain` at 844×390 reports nothing
  escaping its viewport or its panel.

**NOT from rendered frames.** The soak numbers, the anisotropy arithmetic, the
per-frame ink measurements and the ability-count assertions are computed. The
`onBoard` gate's "spends nothing" half is driven through the branch rather than
through a gesture — a real mousedown/mouseup pair cannot be guaranteed to fall
inside one frame — but the gate itself was also observed live: the budget held
at 7.58s across 900ms with the aim off the board.

---

## Verification, end to end

```bash
node --test 'tests/*.test.ts'                          # 1072 pass, 0 fail
sh tools/tsdiff.sh a27d571                             # 212 -> 212, none introduced
sh tools/harness/build.sh
sh tools/harness/run.sh elibar 260 1024x768            # exit 0
sh tools/harness/run.sh elifire 340 1024x768           # exit 0
sh tools/harness/run.sh nullframe 220 1024x768         # exit 0  (Courtland)
sh tools/harness/run.sh nullframe 220 1024x768 eli     # exit 0  (Eli)
sh tools/harness/run.sh screens 200 667x375            # 1 pre-existing fault
sh tools/harness/run.sh screens 200 844x390            # 1 pre-existing fault
sh tools/harness/run.sh screens 200 375x667            # portrait gated
sh tools/harness/run.sh screens 200 1400x900           # 0 faults
sh tools/harness/run.sh contain 200 844x390            # exit 0
sh tools/harness/run.sh realboot 120                   # see below
```

**`tsdiff` has a blind spot that applies here and it is worth naming.** No new
`.ts` file was added under `src/`, so the "new file reports only TS2307" trap
does not bite — but `tsdiff` compares error counts and cannot see an access
rule on a Phaser member. Nothing in this change touches a Phaser member that
was not already being touched the same way. CI's `typecheck` is the complete
answer and it is green.

---

## Where this leaves the repository

**Closed.**

- The exclamation mark on the ability bar, with the mechanism named, a
  regression test that was proved able to fail, and a harness sweep that would
  catch the next one on any hero, any level, any hand.
- Star Rain over the whole playfield, soaked at 480 seeds across all eight
  levels three ways, with a control that reproduces the published numbers
  exactly.
- Russinga is Fire, registered, balanced against the Mind Laser, verified on a
  rendered frame, and proved to go through `forgetEffectAnims`.

**Waiting on a decision — Cory's, not this session's.**

- **The eight rotated win rates are all up**, by +2.7 to +11.5 points. Nothing
  was re-tuned to compensate, as instructed.
- **Eli-pinned, level 3 is 100% on 480 seeds** and level 8 is 89.6%. If Eli is
  meant to be a playable choice rather than a cheat code, Star Rain's `hits`,
  `damage` or `cooldown` is the lever — all three are in `heroes.json` and none
  of them was touched.
- The published band in `SOAK-REPORT.md` is unaffected either way: it is a
  statement about Cory, and Cory's numbers are identical.

**Open, and not started here.**

- **The simulator cannot see a powered-form ability.** `Sim.ts` models
  `abilities[0]` only, so Ice Beam, Mind Control, both held beams and every
  future slot 2 or 3 are worth exactly zero in every soak the project has ever
  run. That is a real hole in how this game is balanced and it is now measured
  (§3). Teaching the sim the powered form would change every hero's numbers,
  which is why it is a decision rather than a fix.
- **`realboot` exits 5 on a healthy build, and has been doing so.** Its check
  is `drawn > 20` and level 1 draws exactly 20 visible objects, so the
  documented pre-push gate reports `RESULT *** Title=built Loadout=built
  Game=built Hud=built drew=20 ***` while reporting every scene built, the
  plate present and no art absent. **Verified pre-existing**: a worktree at
  `569ec71` gives the identical result. Left alone deliberately — changing a
  pre-push threshold inside a commit about hero powers is somebody else's
  decision, and a permanently red gate is worse than a wrong one only once
  somebody notices. Somebody has now noticed.
- **The loadout's hero block changes mode at phone widths.** "Russinga is Fire"
  is the longest ability label in the game, so `widestAbilityLabel(roster)`
  grew and the block drops the blurb under the portrait row at 844×390 where it
  used to sit beside it. Zero faults from both `screens` and `contain`, and the
  specials that fall below the fold are scrollable and were already scrollable
  — but it is a real layout consequence of the name, and capping the chip
  column is the lever if Cory dislikes it.
- **`heroes.json`'s Eli note was stale before this change** and claimed neither
  of his icons existed on disk. Both do, and have since 7 September. Rewritten.

**Carried forward from earlier reports, untouched:** the `SMALL` version-stamp
fault on the title screen at phone widths; the nine harness scenarios that
still do not assert (`ui`, `muzzle`, `buildall`, `rockets`, `retreat`,
`regressions`, `poor`, `typegame`, `meteor`); every `GL=1` screenshot being
black without `preserveDrawingBuffer` (`renderer.snapshot` is the route, and
the pending-snapshot timeout is armed).

**Related documents:** `SOAK-REPORT.md` has a new entry for this run;
`reports/2026-09-07-the-oversized-placeholder.md` is the first two sightings of
the same stand-in; `reports/2026-09-10-the-null-frame.md` is why
`forgetEffectAnims` asks the texture rather than the clip name.
