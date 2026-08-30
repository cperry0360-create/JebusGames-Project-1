# Courjahan Defense

A roguelite tower defense game. JebusGames. Browser-based, single player.

Design lives in [`DESIGN.md`](DESIGN.md). Working rules for contributors (human
or otherwise) live in [`CLAUDE.md`](CLAUDE.md).

**Play the current build:** https://cperry0360-create.github.io/JebusGames-Project-1/

## Stack

Phaser 3 · Vite · TypeScript · GitHub Pages

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm test         # logic and balance tests, no browser needed
npm run build    # typecheck, then build to dist/
npm run preview  # serve the built dist/ locally
```

## Playing it

A run goes: **studio splash → title and hero pick → ability draft → tower draft →
the map.** The splash runs about two seconds and any click or key skips it.

| Input | Does |
|---|---|
| Click a building pad | Open the build menu for that pad |
| Hover a menu option | Preview that tower's range |
| Click a built tower | Select it and show its range |
| Click Cory, then a spot | Send him there; he walks, holds, and fights what comes |
| `Q` / `W` or the HUD slots | Cast a drafted ability (click to place it) |
| `E` | Haymaker — huge single-target hit with knockback |
| `R` | Restructure — move a built tower for free |
| `Space` or the HUD button | Start the next wave |
| Right click or `Esc` | Cancel |
| `R` (after the run ends) | Back to the title screen |
| CREDITS on the title | Studio marks and attribution; `Esc` or BACK returns |

Twelve named waves of Late Filers, Shredders and Final Notices walk one winding
lane. Leaks cost lives. Waves start when you say so, so build first.

**Every run is a different hand.** Two of six active abilities are drawn at the
start, and two of six towers; a third tower arrives after wave 4 and a fourth
after wave 8. The tower draw is weighted and guaranteed to open with at least
one damage option and one AOE or control option.

Cory holds up to three enemies at a time and fights them; at 25% health he goes
into **DAD MODE**, and if he drops he stays down for the rest of the encounter,
returning at full health for the next one.

Six towers, each with its own job: a cheap single-target starter, an
armour-piercing sniper, two splash options at different ranges, a slow, and a
support tower that buffs everything near it. Armour makes the wrong tower
almost useless against Final Notices, which is the point.

## Layout

```
.github/workflows/deploy.yml  Build, test and publish to GitHub Pages
public/assets/kenney/         Kenney tower defense pack, CC0
public/assets/branding/       Studio marks
public/assets/fonts/          Kenney font package, CC0
public/assets/audio/          Sound cues, synthesised by tools/mksfx.py
src/main.ts                   Entry point; waits for fonts before booting
src/config.ts                 Phaser game config
src/types.ts                  Shapes of everything in src/data
src/scenes/                   Boot, Splash, Title, Credits, Draft, Game, Hud
src/systems/                  One file per system
src/entities/                 Tower, Enemy, Hero, Fighter, Projectile
src/ui/                       Theme, build menu
src/data/                     All tuneable numbers, as JSON
tests/                        Logic, balance, draft and content tests
tools/mksfx.py                Regenerates the sound cues
tools/trace_map.py            Re-derives the lane and build pads from the map art
tools/measure_art.py          Re-derives the art manifest's anchors and sizes
tools/harness/                Plays the game in headless Chromium and screenshots it
```

There is no npm registry in the build environment, so there is no local
`vite dev`. `tools/harness/` compiles the shipping source and runs it in
headless Chromium instead, driving it with real input events — see its README.
Looking at a frame is the only way some of these bugs are visible at all.

The map is a **single painted plate** scaled to fill the canvas, so canvas
pixels are the map's own coordinate space. Sprites on top are sorted by Y
position, so things lower on the screen draw in front. There is no isometric
coordinate math anywhere, and none should be added — see the orientation
section of DESIGN.md.

## The map

`public/assets/maps/map_level1.png` is one hand-painted 1672x941 image. There
is no tile grid: the lane and the buildable spots were traced out of the
artwork itself by `tools/trace_map.py`, which classifies every pixel as road,
grass or blocked, walks the road from the arch on the left edge to the gate on
the right, and picks open grass beside it for towers.

```bash
python3 tools/trace_map.py --overlay /tmp/overlay.png
```

It prints the `waypoints` and `buildSpots` that live in `src/data/map.json`
and, given `--overlay`, draws them over the real plate — the only honest way to
check that a traced route follows a painted road. Re-run it when the art
changes. The painted spur to the tavern door is decoration and is not part of
the route; the route search ignores it because a detour into a dead end costs
distance and buys nothing.

There are **seven building pads**, hand-sized ellipses rather than tiles, and
they are drawn on the map at all times: a player cannot choose where to build
if finding a pad means tapping the grass at random. They brighten while a build
menu is open and brighter still under the cursor. Seven is deliberate — with
this much map, two dozen pads meant almost every choice covered the same
ground, and each pad is now further apart than a tower's own range, so it owns
its stretch of the walk.

Pads sit low enough that a tower standing on one clears the HUD bar; the
tracer enforces that, using `display.hudHeight`.

## Cory

He is not a cursor. Click him to select — a ring appears at his feet and his
reach is shown — then click where he should hold. He walks there at his own
speed, stops, and fights whatever comes into range; a flag marks the standing
order. He does not move again until told to.

Bare ground does nothing unless he is selected, which is what stops a misjudged
tap walking him off his post mid-wave. Building pads take a tap before the
ground does, and before the hero.

## Audio

The audio hosts are unreachable from the build environment, so the four cues
are **synthesised** rather than downloaded. `tools/mksfx.py` writes them with
the Python standard library alone; re-run it to change them:

```bash
python3 tools/mksfx.py public/assets/audio
```

## Art

The map plate, the six towers and the three enemies are painted art, in
`public/assets/maps/`, `towers/` and `enemies/`. What is left of Kenney's
**Tower Defense (Top-Down)** pack is the projectiles, the effects, the scenery
on the title and credits backdrops, and Cory himself; the **Kenney font
package** supplies the type. Both are CC0. All 299 sprites live in
`public/assets/kenney/` with the pack's own `License.txt`; the game loads the
twenty it still uses.

Everything that stands on the ground — towers, enemies — is anchored on its
base and sorted by Y, so a unit lower on the screen draws in front. The
enemies are 3/4 characters drawn facing right and mirrored when the lane turns
back to the left. `src/data/README.md` covers how the anchors and shadow widths
were measured, and why an enemy's is not measured the same way as a tower's.

**`src/data/art.json` is the only place a sprite is named.** It holds the
key-to-filename map plus every *role* the game draws — map plates, UI chrome,
effects and scenery:

```json
"assetRoot": "assets/",
"files":     { "turret-ledger": "kenney/towerDefense_tile203.png" },
"render":    { "turret-ledger": { "anchorY": 1, "displayHeight": 92 } },
"map":       { "level1": "map-level1" },
"fx":        { "blast": "fx-flame", "spark": "fx-spark", ... }
```

`files` paths are relative to `assetRoot`, so art from a second directory drops
in as a different prefix. `render` carries anchor, on-screen height and shadow
width, so source art of any size lands correctly — see **Swapping art** in
[`src/data/README.md`](src/data/README.md).

Code asks `src/systems/Art.ts` for a role and never mentions a key or a
filename. `tests/manifest.test.ts` fails the build if any `.ts` file does,
naming the offender — so dropping in a new art pack stays a config change.

## Deployment

Pushing to `main` runs the tests, builds, and publishes `dist/` to GitHub
Pages. The repository needs **Settings → Pages → Source → GitHub Actions**
selected once; after that every push deploys.

The Vite `base` is `./`, so the build works from the project subpath without
hardcoding the repository name.

No `package-lock.json` is committed yet, so CI runs `npm install`. Once you
have run `npm install` locally, commit the lockfile and switch the workflow to
`npm ci` with setup-node's npm cache enabled.

## Scope

Phase 1 only: one map, one lane, one enemy type, two towers, Cory. No
abilities, Holdings, boons, Banner tree, siege enemies or upgrades. See the
phase list in DESIGN.md before adding anything.
