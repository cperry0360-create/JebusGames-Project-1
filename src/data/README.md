# /src/data

Every number that might need tuning lives here as JSON, never in a `.ts` file.

That means tower stats, enemy stats, wave composition, ability values, hero
stats, Last Stand thresholds, Holdings costs and node costs. Code reads these
files; code does not restate them.

Import them directly — `resolveJsonModule` is on:

```ts
import display from './data/display.json'
```

## Current files

| File | Contents |
|---|---|
| `display.json` | Canvas dimensions, grid tile size, background colour |
