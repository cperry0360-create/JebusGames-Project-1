# tools/harness — playing the game without a person

The build environment has no npm registry, so there is no `node_modules` and no
`vite dev`. This harness runs the **shipping source** in headless Chromium
anyway, drives it through real mouse and keyboard events, and uploads
screenshots. It is how the tower scale, the rotating towers and the button that
drew over its own label were found: all three look fine in the code and are
obvious the moment you look at a frame.

```bash
PHASER_DIST=/path/to/phaser.min.js tools/harness/build.sh
tools/harness/run.sh ui 180        # scenario, seconds to wait
```

Screenshots and a JSON report land in `tools/harness/shots/`.

## What it does

`build.sh` copies `src/` aside, rewrites the three things a browser cannot
resolve — the bare `phaser` specifier, `.ts` import paths, and JSON imports
without an import attribute — and compiles with `tsc` straight to ESM. Those
rewrites are the only edits; the game logic Chromium runs is the game logic
that ships.

`index.html` is the director. It boots the game, waits for the real loader,
then plays: clicking pads, picking towers from the menu, selecting the hero,
ordering him about, starting waves, casting abilities. It asserts nothing —
it reports what happened and what the scene graph looked like, and the
screenshots are the evidence.

## Scenarios

| name | what it exercises |
|---|---|
| `title`, `draft`, `credits` | the screens before the map |
| `creditsroll` | the roll parked at fractions of its own height, with where each department and each real credit landed |
| `game` | a fresh board |
| `ui` | pads, build menu, tower selection, hero select-then-order, tap precedence, restructure, ability targeting |
| `combat` | four towers through a whole wave |
| `poor` | picking a tower you cannot afford |
| `skilled` | all seven pads, hero posted on the lane, abilities spent, twelve waves |
| `full` | a deliberately careless player, for the loss path |
| `lost` | no towers at all |

## Notes

- **Phaser 3 listens for mouse events, not pointer events.** Dispatching
  `PointerEvent` silently does nothing, which cost an hour the first time.
- **Do not use `--virtual-time-budget`.** Chromium's virtual clock does not
  advance Phaser's `TimeStep`, so the splash never times out and nothing moves.
  The harness runs in real time and the page uploads its own frames instead.
- **`tsc` here cannot resolve `phaser`**, so every file importing it reports a
  cascade of errors and a real one hides among them. Filtering by error code
  helps, but CI is the only complete typecheck. The two classes that have
  actually reached CI are both worth grepping for after touching `types.ts`:

  ```bash
  # Data drifted from its declared type, or a default no longer satisfies it.
  npx tsc --noEmit 2>&1 | grep -E 'TS2352|TS2739|TS2740|TS2741' \
    | grep -v "Blocker\|Sortable\|Targetable"
  # A name used but never imported.
  npx tsc --noEmit 2>&1 | grep -E 'TS2304|TS2552'
  ```

  The `grep -v` drops the Phaser cascades: `Hero`, `Fighter` and the rest are
  missing `x`/`y` only because `Container` has no types here. Data that drifts from its declared type —
  a role removed from `art.json` but left in `ArtDef` — is covered by a test
  instead, because that is the drift that actually reached CI.
- The Phaser build must match `package.json`. A mismatched major version boots
  and renders, which makes it look like it is working while input behaves
  differently.
