# /src/data

Every number that might need tuning lives here as JSON, never in a `.ts` file.

Code reads these files; code does not restate them. Import them directly —
`resolveJsonModule` is on:

```ts
import towers from './data/towers.json'
```

`src/types.ts` describes the shape of each file. Add a field there when you add
one here.

| File | Contents |
|---|---|
| `display.json` | Canvas size, grid tile size, background colour |
| `map.json` | Grid dimensions, grid origin, lane waypoints, hero start tile |
| `rules.json` | Starting gold and lives, wave payout, time between waves |
| `towers.json` | Cost, range, damage, fire rate, projectile speed, splash, build time |
| `enemies.json` | Health, speed, gold and lives value, melee damage, engage range |
| `heroes.json` | Hero stats and the whole Last Stand block |
| `waves.json` | Wave composition and spawn pacing |
| `art.json` | Sprite keys, Kenney pack toggle, placeholder colours |

## Notes on specific numbers

- **`heroes.cory.lastStand.healthThreshold` is `0.25`.** DESIGN.md fixes the
  Last Stand trigger at 25% for every hero. `tests/rules.test.ts` asserts it.
- **`towers.*.buildTime` is `0`.** Tier 1 places instantly by design. The field
  exists so tiers 2 and 3 have somewhere to live when upgrades arrive.
- **`map.json.path` waypoints may sit outside the grid.** The first and last
  are off-grid on purpose so enemies walk on and off screen. Segments must stay
  axis-aligned — the grid is flat and square, never isometric.
