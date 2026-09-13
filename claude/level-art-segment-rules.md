# Level art: making long levels out of rendered segments

Findings from the Level 6 art pass (Courjahan Defense).

## Which sheets held what

| Sheet | Panels | Lanes | Usable |
|---|---|---|---|
| 6 stacked "PART" strips | 6 x 1672x157 | 1 | yes, single-lane only |
| "MAP 6-1..6-6" 3x2 grid | 6 x 831x312 | 2 | 6-1..6-4 only; 6-5, 6-6 are single-lane |
| "PANEL 1..6" 2x3 grid | 6 x 553x428 | 1 | single-lane |
| "6A..6F" 3x2 grid | 6 x 832x303 | 1 | single-lane |

## The three bugs in the current art pipeline

1. **Resolution.** Six panels inside one 1672x941 render gives each panel a
   sixth of the pixels. The PART strips came out 1672x157; a Kingdom Rush
   plate wants 800-1080px tall. One segment per render fixes this and costs
   the same number of renders.

2. **The road does not chain.** Across the six PART strips every road
   *entered* the left edge at 44-48% of panel height but *exited* anywhere
   from 38% to 77%. Only one strip exited where it entered. The prompt pinned
   where the road starts and said nothing about where it ends.

3. **Two-lane panels let the lanes converge.** Measured lane separation,
   entry to exit:

   | Panel | gap in | gap out | change |
   |---|---|---|---|
   | MAP 6-1 | 198px | 119px | **-79** |
   | MAP 6-2 | 171px | 135px | **-35** |
   | MAP 6-3 | 139px | 148px | +9 |
   | MAP 6-4 | 163px | 160px | -2 |

   6-3 and 6-4 are properly built segments. In 6-1 and 6-2 the upper lane
   descends 81px and 59px while the lower stays put, so chaining several of
   them walks the lanes into each other.

   Separately, the lower lane sits only 26-31px from the bottom frame in every
   panel, and in 6-1 and 6-2 it runs off the bottom edge entirely (97-98% of
   the bottom pixel row is road). There is no buildable ground below it.

## The render rule for new segments

One segment per image, and pin **both edges** and **both lanes**, with a
ground margin:

```
The dirt road enters the LEFT edge at exactly 32% of the image height and
exits the RIGHT edge at exactly 32%, both running horizontally. A second
dirt road enters the LEFT edge at exactly 72% and exits the RIGHT edge at
exactly 72%, also horizontal. Both roads keep the same width at both edges
and never touch each other. Leave at least 12% of the image height as open
ground below the lower road. Between the edges both roads may curve freely.
Do not draw any panel labels, borders, captions or text.
```

Pinning both edges makes segments chain in any order. Pinning both lanes
stops them converging. The ground margin gives tower slots and keeps the road
off the frame.

## Techniques that rescue art already rendered

**Cross-section matching.** Do not butt panel edges together. Scan every
column of the next segment for the one whose lane positions, spacing and
slopes best match the current segment's exit, and start the segment there. A
uniform vertical shift absorbs the rest. On the Level 6 panels this got every
join under 2.4px of unabsorbable residual with 4px of vertical excursion
across the whole plate.

**Mirror pairing** (single-lane only, and a last resort). Cut a segment where
the centreline is flat, then follow it with a horizontally flipped copy. The
seam matches to the pixel. Costs: visible bilateral symmetry, and any text in
the panel comes out backwards.

**Grow, do not crop.** When segments sit at different offsets, extend the
canvas and fill the exposed strips with a cleaned sky/sand row rather than
replicating whatever prop sat on the edge row.

## Tools

- `stitch_lanes.py` - current. One or two lanes, joint DP lane tracing with a
  minimum-separation constraint, spike removal, cross-section matched
  chaining, clean edge fills, waypoint export.
- `stitch_level.py` - superseded, single lane only.

```
python3 stitch_lanes.py --dir segments/ --lanes 2 --target 3300
```

## Path length

At ~60 px/sec enemy speed, plate width maps to walk time roughly as:
2,500px = 42s (standard level), 3,300px = 55s (long level), 6,600px = 110s
(endurance/boss). The first Level 6 stitch was 14,404px, about four minutes
per enemy, which is far too long.

## Level 6 as built

2,970 x 316, two parallel lanes running the full length, MAP 6-3 / 6-2 /
6-4 / 6-1-mirrored, each panel used once, no repeated props. Lane gap
71-198px. Still at contact-sheet resolution, so it is a working proof rather
than a shippable plate; re-render the four segments individually under the
rule above and re-run the stitcher.
