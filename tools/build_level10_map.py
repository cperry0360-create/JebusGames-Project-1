"""Build src/data/map_level10.json from tools/level10_geometry.json.

    python3 tools/build_level10_map.py

EVERY COORDINATE HERE IS TRACED except two: the gateway point off the west edge
and the vanish point off the east one, both extended from the heading the lane
ALREADY has at its terminal so enemies walk in and out along the paint rather
than turning at the frame. tools/build_level9_map.py's `extend_x`, unchanged.

THE MAP IS GENERATED AND NOT HAND-EDITED. Re-run this after any retrace; a
coordinate typed into the JSON is a coordinate that disagrees with the plate the
next time the art moves.

WHAT THIS LEVEL DOES NOT HAVE, stated because every level since 5 has had some
of it: no `lanes`, no `mainMerge`, no `exit` block. One lane, one entrance on
the west frame edge, one exit through the east frame edge -- the shape levels 1
to 4 use. `exit` exists for an INTERIOR terminal (level 9's door) and this lane
runs off the plate, so the default stop distance is the end of the lane and is
right.
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import padcounts  # noqa: E402  -- the per-level pad counts, read rather than typed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOM = os.path.join(ROOT, 'tools/level10_geometry.json')
OUT = os.path.join(ROOT, 'src/data/map_level10.json')

ENTRY_X = -60.0
VANISH_X = 1340.0
GATEWAY_BASELINE = 40.0

# HOW MANY WALL POSITIONS VLAUDE CAN GENERATE, and where on the road they are.
# Spread over the middle of the route rather than the whole of it: a wall at 2%
# is on top of the spawn and a wall at 98% is past every tower on the board, and
# neither is a decision the player can play around. The fractions are of WALKED
# ROUTE DISTANCE, so they stay where they are if the plate is retraced at a
# different resolution.
WALL_FRACTIONS = (0.18, 0.32, 0.46, 0.60, 0.74)


def extend_x(pts, to_x):
    """A gateway point out at `to_x`, on the heading the road ALREADY has.

    `pts` runs from the lane's terminal inwards, so pts[0] is the end.
    tools/build_level9_map.py's, and its note applies: the heading comes from
    the last traced point at least GATEWAY_BASELINE away, never from the final
    stub, because a stub one pixel long has no heading worth reading.
    """
    end = pts[0]
    anchor = next((p for p in pts[1:] if math.dist(p, end) >= GATEWAY_BASELINE), pts[-1])
    (ax, ay), (bx, by) = anchor, end
    if abs(bx - ax) < 1e-9:
        return [round(to_x, 2), round(by, 2)]
    t = (to_x - ax) / (bx - ax)
    return [round(to_x, 2), round(ay + (by - ay) * t, 2)]


def polyline_length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def at_fraction(pts, f):
    """The point f of the way along a polyline, by walked distance."""
    total = polyline_length(pts)
    want = total * f
    run = 0.0
    for i in range(len(pts) - 1):
        seg = math.dist(pts[i], pts[i + 1])
        if run + seg >= want:
            t = 0.0 if seg == 0 else (want - run) / seg
            return [round(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, 1),
                    round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, 1)]
        run += seg
    return [round(pts[-1][0], 1), round(pts[-1][1], 1)]


def main():
    g = json.load(open(GEOM))
    line = [tuple(p) for p in g['centreline']]

    entry = extend_x(line[:], ENTRY_X)
    vanish = extend_x(line[::-1], VANISH_X)
    waypoints = [entry] + [[round(x, 1), round(y, 1)] for x, y in line] + [vanish]

    walked = polyline_length([tuple(p) for p in waypoints])
    painted = polyline_length(line)
    walls = [{'x': p[0], 'y': p[1], 'atFraction': f}
             for f, p in ((f, at_fraction(line, f)) for f in WALL_FRACTIONS)]

    doc = {
        'plate': 'level10',
        '_plate': 'art-source/level10/map_level10.png at 3840x2160, encoded to '
                  'public/assets/maps/map_level10.webp at q95 and registered in art.json '
                  'as `map-level10`, with `map.level10` pointing at it.',
        'roadWidth': g['laneWidth'],
        '_roadWidth': f'{g["laneWidth"]}, the median lane width measured by '
                      f'tools/trace_level10.py by casting normals along the centreline, '
                      f'and re-measured independently by tools/check_level10.py. The band '
                      f'is {g["laneWidth"]} px over most of its length and widens at the '
                      f'hairpins, which is the paint rather than the measurement -- the '
                      f'sampled range is 35.5 to 58.0.',
        'note': 'AI OVERRIDE PART 2: the machine\'s core chamber. ONE continuous lane, in '
                'through the west housing at 47.2% of the height and out through the east '
                'housing at 47.8%, over a field of hex floor plating, with the cracked '
                'purple crystal core in the upper right. NO FORKS AND NO ALTERNATE ROUTES '
                '-- the painted band encloses no region at all, which is the check that '
                'found level 9\'s fork, run here and come back empty. Route switching was '
                'cut from the design and there is nothing in this plate to switch between.',
        'spotRadius': g['spotRadius'],
        '_spotRadius': '34, every other level\'s. World 1280 renders to 844 CSS px, so 34 '
                       'world px is a 44.8 px tap diameter and anything under 44 pt is '
                       'smaller than a thumb.',
        'waypoints': waypoints,
        '_waypoints': f'ONE LANE, {len(line)} traced points plus TWO computed ones: a '
                      f'gateway at x={ENTRY_X} and a vanish point at x={VANISH_X}, each '
                      f'extended along the heading the lane already has at its terminal so '
                      f'enemies walk in and out along the paint. THE PAINTED LANE DOES NOT '
                      f'REACH EITHER FRAME EDGE: a piece of machine housing is drawn over '
                      f'it at each end and the cyan re-emerges as a stub at the frame, so '
                      f'tools/trace_level10.py bridges the two housings before it walks the '
                      f'geodesic. Painted length {painted:.1f} px; walked with the two '
                      f'computed points {walked:.1f}.',
        'buildSpots': [[float(x), float(y)] for x, y in g['pads']],
        '_buildSpots': f'{len(g["pads"])} PADS, HAND-PLACED. They come from tools/plots.json '
                       f'by way of tools/apply_plots.py and they replace the 12 the scoring '
                       f'pass chose -- levels 3, 4 and 8\'s sweep, run here with its '
                       f'constants unchanged: a radius-24 core on painted plating, 90-114 px '
                       f'from the centreline, 74 px apart, best-first by uncovered lane. '
                       f'THAT BAND IS NOT A CONSTRAINT ON THIS SET and the numbers say so: '
                       f'standoff {min(g["padStandoff"])}-{max(g["padStandoff"])}. '
                       f'NOT LEVEL 9\'s ONE-PAD-PER-PAINTED-CHIP either, and the reason is '
                       f'in the art: level 9 painted fifteen chips of 81x75 median, so its '
                       f'buildable ground WAS those chips; level 10 paints eleven open '
                       f'panels up to 223x150, and one pad on one of those wastes it. '
                       f'They reach {100 * g["laneCoverage"]:.1f}% of the lane at range '
                       f'{g["towerRange"]} -- which is where the twelve were, because the '
                       f'sweep optimised for exactly this and a hand cannot beat it at its '
                       f'own game. WHAT THE NINE EXTRA PADS BUY IS DEPTH, not reach: more '
                       f'guns on the same road. The count per '
                       f'level is {padcounts.phrase()}, read out of each board\'s own '
                       f'source by tools/padcounts.py rather than typed: this is the '
                       f'BIGGEST board in the game now and it was the second-smallest, and '
                       f'Vlaude\'s health was soaked against the small one.',
        'hazardSpots': walls,
        '_hazardSpots': 'WHERE VLAUDE CAN GENERATE A WALL. Points ON the lane, at fixed '
                        'fractions of walked route distance, so they survive a retrace at a '
                        'different resolution. They are in the MAP rather than in '
                        'level10.json because they are geometry -- level5.json\'s acid is '
                        'in the rules because the boss drops it wherever it is standing, '
                        'and these are authored positions on this road. The rules file says '
                        'how many may stand at once and what a wall does; this says where.',
        'vlaudeBerth': {'x': g['vlaudeBerth'][0], 'y': g['vlaudeBerth'][1]},
        '_vlaudeBerth': 'WHERE VLAUDE IS PARKED FOR PHASES 1 AND 2, off the lane at the '
                        'crystal core. Derived by tools/trace_level10.py rather than placed: '
                        'the purple mask is dilated by 5 so the CRACKED crystal\'s facets '
                        'merge, and the berth is the bounding box of every purple mass in '
                        'the upper-right quadrant -- centre x, bottom y, so he stands in '
                        'front of the core instead of inside it. '
                        f'{g["vlaudeBerthToLane"]:.1f} px from the lane centreline, which is '
                        'further than any tower\'s range reaches, and he is untargetable in '
                        'those phases regardless.',
    }
    json.dump(doc, open(OUT, 'w'), indent=1)
    print(f'wrote {os.path.relpath(OUT, ROOT)}')
    print(f'  {len(waypoints)} waypoints, walked {walked:.1f} px '
          f'(painted {painted:.1f})')
    print(f'  roadWidth {g["laneWidth"]}, {len(g["pads"])} build spots')
    print(f'  gateway {entry}, vanish {vanish}')
    print(f'  {len(walls)} hazard spots: ' + ', '.join(f'({w["x"]},{w["y"]})' for w in walls))
    print(f'  Vlaude berth {g["vlaudeBerth"]}')
    print(f'\n  laneLengthPx for levels.json: {walked:.1f}')


if __name__ == '__main__':
    main()
