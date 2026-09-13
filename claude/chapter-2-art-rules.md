# Chapter 2 art: tiled ground and scattered props

Companion to `level-art-segment-rules.md`. Those rules are for long level
plates with pinned roads. Chapter 2 needs a different artifact and none of them
apply.

## Why this is cheaper than Level 6

A level plate is one long image with a road that has to enter and exit at fixed
heights so segments chain. A ground tile is a single square that repeats in
both directions forever. One render per biome instead of six panels stitched,
and no lane convergence problem because there are no lanes.

## Ground tiles

AI renders do not tile on their own. Two ways to fix that, in order of
preference:

1. **Scatter prop sprites on top at random positions.** This defeats the eye's
   pattern detection better than any tiling trick, and it is free at runtime.
2. **2x2 mirror.** Acceptable for ground with no text and no directional
   features. It reads as a kaleidoscope at scale, so only ever with 1 on top
   of it.

The render itself must be featureless. Edge darkening is the single thing that
makes a tile grid visible, so the prompt has to kill it explicitly:

```
A flat top-down ground texture of dry cracked dirt, cartoon style,
Simpsons-inspired, even flat lighting across the entire image, completely
uniform from edge to edge. No objects, no props, no rocks, no plants, no
paths, no roads, no footprints. No vignette, no darkening or shading at any
edge or corner. No border, no frame, no text, no labels. Fill the whole square.
```

One tile per render, square, at the largest size the renderer gives. Swap the
surface for other biomes: grass, sand, cracked lava rock, snow.

## Props

Separate sprites with transparency, placed at runtime. Never painted into the
tile, or they repeat with it.

```
A single gnarled dead tree, cartoon style, Simpsons-inspired, viewed from a
high angle, centered, on a plain flat white background, no shadow, no ground,
no other objects, no text.
```

Then key out the white. About 12 props per biome is enough variety at the
densities this mode runs.

## Reuse before rendering

Check the repo first. Heroes, enemies, bosses, towers, FX and HUD all transfer
into Chapter 2 unchanged. The only genuinely new art is the ground tiles, the
props, and four UI pieces: XP gem, draft card frame, drag stick ring, arena
boundary.

## Sizing

Same asset rule as the rest of the repo. After export run
`python3 tools/measure_art.py` and set `contentWidth` and `contentHeight` from
its INK output, never from the canvas. Source height at least about 7x world
pixel size. Nine content boxes in the repo are already wrong from skipping
this step.
