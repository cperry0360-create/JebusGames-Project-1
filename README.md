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

| Input | Does |
|---|---|
| Click an empty plot | Open the build menu for that tile |
| Hover a menu option | Preview that tower's range |
| Click a built tower | Select it and show its range |
| Click the road or scenery | Set Cory's rally point |
| `Space` or the HUD button | Start the next wave |
| Right click or `Esc` | Cancel |
| `R` | Restart, once the run is over |

Eight named waves of Late Filers, Shredders and Final Notices walk one winding
lane. Leaks cost lives. Waves start when you say so, so build first.

Cory holds up to three enemies at a time and fights them; at 25% health he goes
into **DAD MODE**, and if he drops he stays down for the rest of the encounter.

Six towers, each with its own job: a cheap single-target starter, an
armour-piercing sniper, two splash options at different ranges, a slow, and a
support tower that buffs everything near it. Armour makes the wrong tower
almost useless against Final Notices, which is the point.

## Layout

```
.github/workflows/deploy.yml  Build, test and publish to GitHub Pages
public/assets/                Static art, copied verbatim into the build
src/main.ts                   Entry point
src/config.ts                 Phaser game config
src/types.ts                  Shapes of everything in src/data
src/scenes/                   Boot, Game, Hud
src/systems/                  One file per system
src/entities/                 Tower, Enemy, Hero, Projectile
src/data/                     All tuneable numbers, as JSON
tests/                        Logic and balance tests
```

Rendering is a **flat square grid** with sprites sorted by Y position, so
things lower on the screen draw in front. There is no isometric coordinate
math anywhere, and none should be added — see the orientation section of
DESIGN.md.

## Art

Kenney's **Tower Defense (Top-Down)** pack, CC0. All 299 sprites live in
`public/assets/kenney/` with the pack's own `License.txt`; the game loads the
~49 it uses.

Gameplay code never names a file. `src/data/art.json` maps a logical key to the
real filename, so a sprite swap is a one-line data change:

```json
"turret-ledger": "towerDefense_tile203.png"
```

The road is drawn by an autotiler (`src/systems/Autotile.ts`) that picks the
right edge, outer-corner or inner-corner sprite for each road tile. That is why
the lane is two tiles wide: the pack ships grass-over-dirt transitions rather
than a one-tile road, so a narrower lane would need a tile the pack does not
have. A test enforces it.

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
