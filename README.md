# Courjahan Defense

A roguelite tower defense game. JebusGames. Browser-based, single player.

Design lives in [`DESIGN.md`](DESIGN.md). Working rules for contributors (human
or otherwise) live in [`CLAUDE.md`](CLAUDE.md).

## Stack

Phaser 3 · Vite · TypeScript · GitHub Pages

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build    # typecheck, then build to dist/
npm run preview  # serve the built dist/ locally
npm run typecheck
```

## Layout

```
.github/workflows/deploy.yml  Build and publish to GitHub Pages on push to main
public/assets/                Static art and audio, copied verbatim into the build
src/main.ts                   Entry point
src/config.ts                 Phaser game config
src/scenes/                   Phaser scenes
src/systems/                  Gameplay systems, one file each
src/entities/                 Towers, enemies, heroes
src/data/                     All tuneable numbers, as JSON
```

## Deployment

Pushing to `main` builds the project and publishes `dist/` to GitHub Pages. The
repository needs **Settings → Pages → Source → GitHub Actions** selected once;
after that every push deploys.

The Vite `base` is `./`, so the build works from the project subpath
(`https://<user>.github.io/<repo>/`) without hardcoding the repository name.

No `package-lock.json` is committed yet, so CI runs `npm install`. Once you have
run `npm install` locally, commit the lockfile and switch the workflow to
`npm ci` with setup-node's npm cache enabled — builds get faster and repeatable.

## Current state

Phase 1 scaffold. A blank Phaser canvas with a coloured background and a title —
no gameplay yet.
