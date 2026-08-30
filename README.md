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
| `1` / `2` or the HUD buttons | Pick a tower to build |
| Left click on grass | Place the selected tower |
| Left click with nothing selected | Set Cory's rally point |
| Right click or `Esc` | Cancel building |
| `R` | Restart, once the run is over |

Six waves of Late Filers walk one lane. Leaks cost lives. Cory holds up to
three enemies at a time and fights them; at 25% health he goes into **DAD
MODE**, and if he drops he stays down for the rest of the encounter.

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

Phase 1 art is meant to be Kenney's free CC0
[Tower Defense (Top-Down)](https://kenney.nl/assets/tower-defense-top-down)
pack. **Those files are not in this repo yet**, so the game generates its own
placeholder shapes at boot and runs fine without them.

To use the real pack:

1. Download it from kenney.nl and unzip it.
2. Copy eight sprites into `public/assets/kenney/`, renamed to these keys:

   `tile-grass.png`, `tile-grass-alt.png`, `tile-path.png`,
   `tower-withholding.png`, `tower-rounding.png`, `enemy-latefiler.png`,
   `hero-cory.png`, `projectile.png`

3. Set `"useKenneyPack": true` in `src/data/art.json`.

Any file that is missing or fails to load falls back to its placeholder, so a
partial copy still boots. The keys are listed in `art.json`.

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
