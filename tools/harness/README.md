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
tools/harness/run.sh realboot 90   # RUN THIS BEFORE ANY PUSH
```

`realboot` walks Boot -> Splash -> Title -> Loadout -> Game -> Hud with
**nothing forced**, and fails if any scene does not build. Every other
scenario stops Boot and starts the scenes it needs by hand, so a game that
cannot boot at all still produces a full set of screenshots — which is exactly
how a green screen shipped to live. `toTitle()` printed `splash -> title:
false` in three separate runs and every one of them carried on regardless.

```
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
| `ui` | pads, build menu, tower selection, hero select-then-order, tap precedence, the two hero slots, ability targeting |
| `combat` | four towers through a whole wave |
| `poor` | picking a tower you cannot afford |
| `skilled` | all seven pads, hero posted on the lane, abilities spent, twelve waves |
| `full` | a deliberately careless player, for the loss path |
| `lost` | no towers at all |
| `spec` | the tier-3 fork, measured: panel bounds against the viewport, and every text run against every other |
| `diag` | five taps on the version stamp, a thrown error, and a stalled loop |
| `stuckcast` | a run abandoned mid-wind-up, and whether abilities work in the next one |
| `bossability` | every ability plus the nuke, cast at the Politician, with the damage each one did |
| `fx` | the explosion, hit spark and death puff sheets, each held on its peak frame, and a leak check |
| `rockets` | the painted rockets in flight and side by side, with their sizes and origins |
| `towerpanel` | the tower panel anchored beside its tower, both range rings, panning, and a tap off it |
| `retreat` | ordering the hero out of a fight, the cost, and re-engaging without another tap |
| `herohp` | what actually lands on Cory in a wave, against what the data says should |
| `stun` | the tier-3 stop, measured as how far the target still moves |
| `meteor` | where a barrage lands relative to the tap, and the telegraph |
| `background` | leaving the tab and coming back, with the audio device refused on the way in |
| `revive` | the hero going down, the countdown marker, and coming back on |
| `gnomes` | the summon refused off the lane and allowed on it, both gnome sprites, their size beside a soldier, and how long they actually survive |
| `softlock` | one frame of a stale portrait viewport mid-run, and whether the rotate gate hands the game back or latches a pause behind a hidden overlay |
| `stuckguard` | a run paused by nothing at all, and whether the guard recovers and reports it — then a settings panel, which it must leave alone |
| `worldmap` | the level-select road: how many screens long it is, that a drag actually moves it, that a short drag ending on a level does NOT start that level, and that a tap does |
| `difficulty` | the setting end to end: the chip on the level select, the panel it opens, choosing Try Hard, and then the HUD readout — including a mid-run change to the SAVE that must not reach a run already going |

## Notes

- **`build()` presses and holds, and returns whether a tower actually
  appeared.** The build menu previews on press and buys on release, and a
  90ms down-up does not survive the preview work in between on a small
  viewport: it places a tower at 1400x708 and not at 844x390. A whole 13-wave
  `skilled` run was once scored with zero towers on the board because the
  helper reported success on a press that bought nothing. It checks the tower
  count now rather than trusting the click.

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
