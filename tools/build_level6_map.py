#!/usr/bin/env python3
"""Build src/data/map_level6.json out of tools/level6_geometry.json.

EVERY COORDINATE HERE IS TRACED except the two gateway points at each lane's
ends (the same computed extension levels 2, 3 and 4 use) and ONE CONNECTOR
SEGMENT on the south lane, which is authored and is the only fabricated road
in the file. See the `_fabricated` note it writes into the output.

Run:  python3 tools/build_level6_map.py
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, 'tools', 'level6_geometry.json')
OUT = os.path.join(ROOT, 'src', 'data', 'map_level6.json')

# The off-plate gateway x's, matching level 4's -60 / 1340.
ENTRY_X, EXIT_X = -60.0, 1340.0
# And the flank's, matching level 5's south gate at y=779. It enters through the
# BOTTOM edge, so its gateway is below the plate rather than left of it -- and
# the band's own first traced point is already on the bottom row, so one point
# is prepended where the west lanes get a computed extension.
FLANK_ENTRY_Y = 779.0

# THE ONE AUTHORED JOIN. The painted south lane runs into the north lane; the
# painted band that reaches the east 82.8% exit is not connected to anything.
# These two indices are where the gap between them is narrowest.
SOUTH_CUT_INDEX = 21      # south lane point (591, 393)
ORPHAN_JOIN_INDEX = 23    # orphan upper-arm point (592, 475), 82.0 px away


# How far back along the road the gateway's heading is measured. ONE ROAD
# WIDTH, and it is not a free choice: the north lane's last traced segment is
# (1277,524)->(1279,526), a 2 px stub at 45 degrees, and a gateway point put on
# THAT line leaves the plate at y=587 instead of y=534 -- a road that dives off
# the map. Level 4's `_waypoints` note records the same trap in the same words:
# "dragging the final traced point out instead would swing the closing segment
# off the paint."
GATEWAY_BASELINE = 40.0


def extend(pts, to_x):
    """A gateway point out at `to_x`, on the heading the road ALREADY has.

    `pts` runs from the lane's end inwards, so pts[0] is the terminal. The
    heading is taken from the last traced point at least GATEWAY_BASELINE away,
    never from the final stub. Never a traced coordinate.
    """
    end = pts[0]
    anchor = next((p for p in pts[1:] if math.dist(p, end) >= GATEWAY_BASELINE), pts[-1])
    (ax, ay), (bx, by) = anchor, end
    if abs(bx - ax) < 1e-9:
        return [to_x, by]
    t = (to_x - ax) / (bx - ax)
    return [round(to_x, 2), round(ay + (by - ay) * t, 2)]


def polyline_length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def main():
    g = json.load(open(GEO))
    north = [list(p) for p in g['lanes']['north']]
    south = [list(p) for p in g['lanes']['south']]
    ob = [list(p) for p in g['orphanBand']['centreline']]

    # The shared tail is the run of identical trailing points. The north lane
    # keeps it; the south lane is cut before it and rerouted.
    k = 0
    while k < min(len(north), len(south)) and north[-1 - k] == south[-1 - k]:
        k += 1

    # The orphan band's upper arm, from its U-turn (its leftmost point) east.
    turn = min(range(len(ob)), key=lambda i: ob[i][0])
    upper = ob[turn:]

    cut, join = south[SOUTH_CUT_INDEX], upper[ORPHAN_JOIN_INDEX]
    fabricated = math.dist(cut, join)

    # LANE A -- entirely traced. Gateway points at both ends.
    a_core = north
    lane_a = [extend(a_core, ENTRY_X)] + a_core + [extend(a_core[::-1], EXIT_X)]

    # LANE B -- traced south lane, the authored connector, traced orphan arm.
    b_core = south[:SOUTH_CUT_INDEX + 1] + upper[ORPHAN_JOIN_INDEX:]
    lane_b = [extend(b_core, ENTRY_X)] + b_core + [extend(b_core[::-1], EXIT_X)]

    # THE FLANK. The mouth on the bottom edge feeds the band that reaches east83,
    # and the band runs from there round the U-turn and back east until it meets
    # the lower lane at exactly the point the connector joins it. So the flank is
    # band[0..join] and it is ALL PAINTED -- it adds no fabricated road at all,
    # and it puts four pads that reached nothing back in range.
    flank_core = ob[:ORPHAN_JOIN_INDEX + turn + 1]
    assert flank_core[-1] == join, (flank_core[-1], join)
    lane_f = [[flank_core[0][0], FLANK_ENTRY_Y]] + flank_core
    # It has to END at the join, which is what the lane engine expects of a
    # branch, and its last traced point IS that point to 0.00 px -- the same
    # coordinate the lower lane carries -- so nothing was snapped.
    merge_at = next(i for i, p in enumerate(lane_b) if p == join)

    pads = [list(p) for p in g['pads']]

    out = {
        'plate': 'level6',
        'mainId': 'upper',
        '_mainId': (
            "THE NORTH LANE IS CALLED `upper`, not `main`, because that is what waves.level6.json "
            'spawns on: 20 of its 38 spawn groups name `upper` and 18 name `lower`. One of the two '
            'lanes has to be the map\'s own `waypoints` -- LaneNetwork is built as '
            '[waypoints, ...lanes] -- and before `mainId` existed that lane was always called "main", '
            'so every `upper` spawn would have resolved through LaneNetwork.lane()\'s '
            'unknown-id fallback. It would have walked the correct road by accident and the wrong one '
            'the moment a third lane appeared. See the note on MapDef.mainId.'
        ),
        'roadWidth': g['roadWidth'],
        '_roadWidth': (
            f"{g['roadWidth']}, taken from tools/level6_geometry.json, which re-derives it off the "
            'painting by casting normals through the band. It is the NARROWEST road in the game -- '
            'level 4 is 50, level 3 is 54.6, level 1 is 61 -- and narrow enough that every enemy in '
            "this level's roster collapses to the centreline: Enemy.ts computes "
            'room = max(0, laneHalfWidth - displayWidth/2) * 0.72, and with laneHalfWidth 20 the '
            'smallest enemy here is 60.3 px wide, so room is 0 for all four. Splash covers a line on '
            'this board, not a band. The art was NOT rescaled; see reports/2026-09-11-level-6.md.'
        ),
        'note': (
            'THE TWO-LANE LEVEL. Two roads run west to east and never meet: the north lane enters at '
            'west 11.8% and leaves at east 73.1%, the south lane enters at west 20.8% and leaves at '
            'east 82.8%. Both exits cost lives. Every coordinate is traced from '
            'tools/level6_geometry.json EXCEPT the four gateway points and one connector segment on '
            'the south lane -- see `_fabricated`, which is the whole of what was authored. '
            'Re-check the traced half with `python3 tools/check_level6.py` and this file with '
            '`python3 tools/build_level6_map.py` (it rewrites it; the diff should be empty).'
        ),
        '_fabricated': (
            f'THE ONE PIECE OF ROAD THAT IS NOT PAINTED, and it is on the south lane. '
            f'The plate MERGES the two lanes -- the geometry file says so in its `_conflict` key -- '
            f'and it leaves the east 82.8% exit fed only by a band that enters at the bottom frame '
            f'edge and that no entrance reaches. Level 6 is designed as two independent lanes, so '
            f'the south lane is cut at its traced point {cut} (index {SOUTH_CUT_INDEX}, just before '
            f'it would run into the north lane) and joined to the unreachable band at its traced '
            f'point {join}, which is the narrowest gap between the two: {fabricated:.1f} px, of '
            f'which 39.0 px is over ground with no road painted on it. The connector crosses NO '
            f'prop and NO pad -- swept across the full 40 px road width it reads 13.1% solid '
            f'against a 12-14% baseline for the painted lanes themselves, which is their own kerb. '
            f'Cory chose this over re-painting the plate. IT WILL SHOW: an enemy walks about 39 px '
            f'over bare ground at ({cut[0]}, {(cut[1] + join[1]) // 2}). Repainting the plate so the '
            f'south road runs through is what removes it, and nothing in code can.'
        ),
        'spotRadius': g['padFootprintRadius'],
        '_spotRadius': (
            f"{g['padFootprintRadius']}, levels 1-4's, and the pads are PAINTED here rather than "
            'placed, so their spacing is the artist\'s answer rather than a gate. '
            'tools/check_level6.py reports the spacing; it does not fail on it.'
        ),
        'waypoints': lane_a,
        '_waypoints': (
            'THE NORTH LANE, west 11.8% to east 73.1%, and it is `main` because the engine requires '
            'one: LaneNetwork builds [main, ...lanes] and GameScene measures the board bounds and '
            'the gateway distances against it. Every point is traced. The two ends are not: a '
            'gateway point is computed on the line of the first and last traced segments and run out '
            f'to x={ENTRY_X} and x={EXIT_X}, so enemies walk in and out along the road they are '
            'already on rather than appearing at the plate edge. That is levels 2, 3 and 4\'s method.'
        ),
        'lanes': [
            {'id': 'lower', 'waypoints': lane_b, 'entrance': True},
            {'id': 'flank', 'waypoints': lane_f,
             'merge': {'into': 'lower', 'atIndex': merge_at}},
        ],
        '_lanes': (
            'THE SOUTH LANE, `lower`, west 20.8% to east 82.8%. It declares NO `merge` -- it runs to its own '
            'exit and nothing continues from it -- and it declares `entrance: true`, which is new. '
            'TWO INDEPENDENT LANES IS A SHAPE THE ENGINE DID NOT ACCEPT UNTIL THIS LEVEL: '
            '`validateLanes` reported the second terminal as "a route with no gate", a rule written '
            'to catch a forgotten `merge` back when every multi-lane map was a fork feeding one gate. '
            'The rule was right about the typo and wrong about this map, so a lane can now say it is '
            'an entrance and be counted as joined up. Everything else already worked, and was '
            'checked rather than assumed: transferFrom returns null per lane, Enemy.leaked reads the '
            'gate of the lane being walked, Gateway.laneGates builds mouth/gate/stop distances per '
            'lane through each lane\'s own distanceAtX, and terminals()/routeLengths() answer per '
            'starting lane.'
        ),
        'buildSpots': pads,
        '_flank': (
            'THE THIRD SPAWN, out of the bottom edge at 59-74% across, and it is ALL PAINTED '
            'ROAD -- it adds not one fabricated pixel. The band that reaches the east 82.8% '
            'exit has a mouth on the bottom edge; tools/level6_geometry.json used to call that '
            'an excluded touch ("a band running off the frame at a shallow angle") and now '
            'calls it the `flank` entrance. This lane walks it from the mouth, round the '
            'U-turn at (92,469), and back east to (592,475) -- which is exactly the point the '
            'lower lane\'s connector joins the band, so it merges into `lower` there rather '
            'than running a route of its own. It ENDS at the join to 0.00 px, so nothing was '
            'snapped.\n\n'
            'IT IS A FLANK BY DIRECTION, NOT BY SPEED, and that is worth knowing before '
            'anybody calls it a shortcut: 1425.7 px to the join against the lower lane\'s '
            '830.9, so a Sprinter arrives there 4.0s LATER than one that came in the front. '
            'What it buys is the approach -- it comes up through the bottom-left, which is the '
            'quarter of the board nothing walked before, and it puts pads 9, 12, 16 and 18 '
            'back in range of a road. Those four reached nothing at all until this lane '
            'existed; only pad 2 still does. Shortening it means fabricating a cut straight up '
            'from the mouth to the lower lane, about 175 px of unpainted ground, and that was '
            'not done.\n\n'
            'IT IS DELIBERATELY SMALL. Sprinters only, three of the thirteen waves, in the '
            'back half. See waves.level6.json `_flank`.'
        ),
        '_buildSpots': (
            'EIGHTEEN PAINTED PADS, copied from the geometry file untouched. They are found by colour '
            'on the plate rather than placed, so two things that are gates on levels 3 and 4 are only '
            'reported here. STANDOFF: 70.0-103.1 px to the nearest lane centreline, median 81.1, '
            'against levels 3 and 4\'s 90-114 measured the same way -- 20% closer, so one 112-range '
            'tower covers 154.5 px of lane here against 90.7 on level 3. That is 1.7x the work per '
            'gun and it is why the Rooster is soaked against THIS board and compared to no other '
            'level\'s boss. PAD 2 AT (1167, 53) IS DEAD: 248.8 px from any lane, and the shortest '
            'tower range is 112, so nothing built there can reach a road. It is painted on; it stays.'
        ),
    }

    json.dump(out, open(OUT, 'w'), indent=2)
    open(OUT, 'a').write('\n')

    print(f'wrote {os.path.relpath(OUT, ROOT)}')
    print(f'  north (main): {len(lane_a)} pts, traced length {polyline_length(north):.1f}')
    print(f'  south       : {len(lane_b)} pts, traced+authored length {polyline_length(b_core):.1f}')
    print(f'  connector   : {cut} -> {join}, {fabricated:.1f} px')
    print(f'  flank       : {len(lane_f)} pts, ALL PAINTED, {polyline_length(flank_core):.1f} px, '
          f'merging into lower at index {merge_at} {join}')
    print(f'  pads        : {len(pads)}')


if __name__ == '__main__':
    main()
