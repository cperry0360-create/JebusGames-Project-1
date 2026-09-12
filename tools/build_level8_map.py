#!/usr/bin/env python3
"""Build src/data/map_level8.json out of tools/level8_geometry.json.

EVERY COORDINATE HERE IS TRACED except the three gateway points -- one at the
spawn and one at each exit -- which are the same computed extension levels 2,
3, 4 and 6 use. Nothing is authored, nothing is fabricated, and nothing is
typed: this is tools/build_level6_map.py's method applied to a map with one
entrance and two exits instead of two entrances and one.

Run:  python3 tools/build_level8_map.py

WHY THE FILE IS GENERATED RATHER THAN WRITTEN. The geometry pass is the source
of truth for level 8's road, and a map.json edited by hand is a second copy of
it that drifts -- level 2 shipped a laneLengthPx that came with the plate and
was 38.6 px out for as long as nothing compared the two. Re-run this after any
re-trace and the map follows the geometry by construction.

THE SOUTH EXIT LEAVES THROUGH THE BOTTOM EDGE, which is the one thing here that
levels 2 to 6 did not have to deal with, and it is the one gateway that is NOT
a computed heading. See `straight_down`: that branch's last traced stub runs
flat along the bottom row because the mouth is 152 px wide, so a heading
measured across it leaves the map sideways. Level 6's flank is the same case at
the same edge and prepends a fixed point for the same reason.

NO `entrance` AND NO `exit` BLOCK IS WRITTEN, and that is deliberate. Those two
are read off the painted plate as map X positions and converted per lane by
`Gateway.laneGates`; level 8's roads run off the frame at three different edges,
so there is no single x that means "the gate" on all three lanes. Omitting both
is what levels 2 to 5 do: `laneGates` then falls back to each lane's own full
length, so every enemy walks to the end of the road it is actually on and leaks
there. That fallback IS the two-exit support written for level 5 -- see the
block comment on `laneGates` -- and it is the reason this level needs no new
leak handling.
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, 'tools', 'level8_geometry.json')
OUT = os.path.join(ROOT, 'src', 'data', 'map_level8.json')

# The off-plate gateway coordinates, matching level 4's -60 / 1340 and level
# 6's 779 below the bottom edge.
ENTRY_X, EXIT_X, EXIT_Y = -60.0, 1340.0, 779.0

# How far back along the road the gateway's heading is measured. ONE ROAD WIDTH,
# and level 4's and level 6's notes both record why it cannot be the final
# segment: a 2 px closing stub at 45 degrees, extended 60 px off the plate,
# becomes a road that dives off the map.
GATEWAY_BASELINE = 40.0


def extend_x(pts, to_x):
    """A gateway point out at `to_x`, on the heading the road ALREADY has.

    `pts` runs from the lane's terminal inwards, so pts[0] is the end. The
    heading comes from the last traced point at least GATEWAY_BASELINE away,
    never from the final stub. Never a traced coordinate.
    """
    end = pts[0]
    anchor = next((p for p in pts[1:] if math.dist(p, end) >= GATEWAY_BASELINE), pts[-1])
    (ax, ay), (bx, by) = anchor, end
    if abs(bx - ax) < 1e-9:
        return [round(to_x, 2), round(by, 2)]
    t = (to_x - ax) / (bx - ax)
    return [round(to_x, 2), round(ay + (by - ay) * t, 2)]


def straight_down(pts, to_y):
    """A gateway point straight below a lane that ends ON the bottom edge.

    NOT A COMPUTED HEADING, and that is the finding rather than a shortcut. The
    south branch's last traced stub runs (1047,719)->(1076,719): flat, EASTWARD,
    along the bottom row of the mask. It is not a direction of travel -- the
    bottom mouth is 152 px wide because the art spreads where it meets the frame,
    and the geodesic walked along the edge to the middle of it. A heading measured
    over any baseline that crosses that stub comes out 25 degrees off vertical and
    puts the gateway at x=1203, 127 px to the right of a mouth centred on 1076,
    so the road appears to leave sideways through the floor.

    Level 6's flank reached the same conclusion at the same edge and prepended a
    fixed point rather than computing one; its note says so. A road that leaves
    through a horizontal frame edge leaves DOWNWARD, and the terminal's own x is
    the honest answer.
    """
    return [round(pts[0][0], 2), round(to_y, 2)]


def polyline_length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def main():
    g = json.load(open(GEO))
    shared = [list(p) for p in g['shared']]
    east = [list(p) for p in g['branches']['east']]
    south = [list(p) for p in g['branches']['south']]

    # THE FORK IS EACH BRANCH'S WAYPOINT 0, which is what makes `atIndex: 0`
    # honest: the trunk hands its walkers over at its own last point and they
    # arrive at the branch's first, and the two are the same coordinate. The
    # tracer wrote them that way -- it cut both walks at the fork pixel -- and
    # this asserts it rather than assuming it, because a merge point that is
    # not shared is a sideways step at the junction.
    assert shared[-1] == east[0] == south[0], (shared[-1], east[0], south[0])

    # `extend_x` wants the lane's TERMINAL first. For the entry that is the
    # trunk's own waypoint 0, so the list is passed as it stands; for the east
    # exit it is the last point, so that one is reversed. Getting this backwards
    # extended the entry gateway on the heading of the FORK and put it at
    # (-60, 10204) -- a spawn point five screens below the map.
    entry = extend_x(shared, ENTRY_X)
    east_gate = extend_x(east[::-1], EXIT_X)
    south_gate = straight_down(south[::-1], EXIT_Y)

    trunk = [entry] + shared
    east_lane = east + [east_gate]
    south_lane = south + [south_gate]

    out = {
        'plate': 'level8',
        '_plate': 'Courjahan_Defense_Level8_4K.png at 3840x2160, encoded to '
                  'public/assets/maps/map_level8.webp at q95 and registered in art.json '
                  'as `map-level8`, with `map.level8` pointing at it.',
        'roadWidth': g['roadWidth'],
        '_roadWidth': f"{g['roadWidth']}, MEASURED ON THE SHARED SPINE ONLY by "
                      'tools/trace_level8.py. The bottom exit is about 2.8 road widths '
                      'across where it meets the frame because the art spreads there, and a '
                      'median taken through it comes out a third too high; the centre of '
                      'that mouth is the terminal and its width is not meaningful. Tower '
                      'bases are sized against this number.',
        'note': 'THE OPTIMIZATION: an abandoned corporate office floor, one entrance on '
                'the west edge and TWO exits -- east through the wall at 75% of the '
                'height, and south through the bottom edge at 84% of the width. Both cost '
                'lives. Every coordinate comes from tools/level8_geometry.json, which '
                'tools/trace_level8.py derived from the painted plate and '
                'tools/check_level8.py checks independently; this file is GENERATED from '
                'it by tools/build_level8_map.py and is not hand-edited. Re-derive with '
                '`python3 tools/trace_level8.py --overlay tools/L8_pads_overlay.png` and '
                'rebuild with `python3 tools/build_level8_map.py`.',
        'spotRadius': g['padFootprintRadius'],
        '_spotRadius': f"{g['padFootprintRadius']}, every other level's. World 1280 renders "
                       'to 844 CSS px, so 34 world px is a 44.8 px tap diameter and '
                       'anything under 44 pt is smaller than a thumb. Two pads need 2 x '
                       'spotRadius between centres before their tap targets overlap; '
                       'tools/check_level8.py measures the closest pair.',
        'mainId': 'shared',
        '_mainId': 'THE TRUNK IS CALLED `shared`, not `main`, for the reason level 6 '
                   "renamed its own: the wave table names the lane it spawns on, and "
                   '`LaneNetwork.lane()` resolves an unknown id to main -- so a table '
                   'spawning on `shared` against a lane called `main` would walk the right '
                   'road by accident and the wrong one the day a second spawn lane '
                   'arrives. It is the geometry file\'s name for the same run of road.',
        'waypoints': trunk,
        '_waypoints': 'THE TRUNK, from the west opening to the fork at '
                      f"({g['fork'][0]}, {g['fork'][1]}). {len(shared)} traced points plus ONE "
                      f'computed gateway at x={ENTRY_X}, put on the heading of the first '
                      'traced segment measured over 40 px rather than on the first stub -- '
                      'the same extension levels 2, 3, 4 and 6 use, and the only '
                      'non-traced coordinate on this lane.',
        'mainMerge': [
            {'into': 'east', 'atIndex': 0, 'weight': 1},
            {'into': 'south', 'atIndex': 0, 'weight': 1},
        ],
        '_mainMerge': 'A SPLIT, NOT A MERGE, and level 8 is the first map to use the shape: '
                      'the trunk ends at the fork and each walker takes ONE arm, chosen '
                      'once from its own `routePick` so nothing flickers at the junction. '
                      'The weights are EVEN and they are the fallback rather than the '
                      'design -- waves.level8.json routes most of its groups explicitly '
                      'with `exit`, and an even split is what an unrouted group gets. '
                      'Summoned children inherit their parent\'s pick, so the CEO\'s '
                      'drones follow him down his own arm.',
        'lanes': [
            {
                'id': 'east',
                'waypoints': east_lane,
                '_waypoints': f'{len(east)} traced points from the fork to the east opening, '
                              f'plus one computed gateway at x={EXIT_X}. Waypoint 0 IS the '
                              'fork, to 0.00 px, which is what `atIndex: 0` on the trunk\'s '
                              'continuation means.',
            },
            {
                'id': 'south',
                'waypoints': south_lane,
                '_waypoints': f'{len(south)} traced points from the fork to the bottom '
                              f'opening, plus one computed gateway at y={EXIT_Y} -- computed '
                              'in Y because this road leaves through a horizontal edge and '
                              'extending it to an X would put the gateway sideways. '
                              'Waypoint 0 IS the fork.',
            },
        ],
        '_lanes': 'ONE ENTRANCE, TWO EXITS, AND BOTH COST LIVES. Neither branch declares '
                  '`entrance`: both are fed by the trunk\'s split, so `validateLanes` sees '
                  'two terminals that something merges into and is satisfied -- the rule '
                  'that used to demand exactly one terminal was replaced when level 5 '
                  'shipped two exits. Nothing about leaking is per-exit: `GameScene.leak` '
                  'charges the enemy\'s own `livesCost` wherever it got out.',
        'buildSpots': [list(p) for p in g['buildSpots']],
        '_buildSpots': f"{len(g['buildSpots'])} PADS, MORE THAN ANY OTHER LEVEL IN THE GAME "
                       '(levels 2 to 6 carry 15, 15, 14, 14 and 18). Placed by '
                       'tools/trace_level8.py on levels 3 and 4\'s four properties and '
                       'verified by tools/check_level8.py: each pad\'s 24 px core sits '
                       'entirely on classified carpet, 90-114 px from the nearest lane '
                       'centreline, at least 74 px from another pad, and at least 34 px '
                       'from a frame edge so its tap target is on the board. The count is '
                       'what those rules allow and is not a target -- the placement stops '
                       'when the best remaining pad adds no uncovered lane. BOSS HEALTH IS '
                       'MEASURED AGAINST THIS BOARD and against no other: 19 pads hold '
                       'more DPS than 14, so the CEO\'s number does not transfer to or '
                       'from another level.',
        '_coverage': 'HOW MUCH OF EACH LANE THE PADS CAN REACH, from the geometry file: '
                     f"shared {g['coverage']['shared']:.0%}, south "
                     f"{g['coverage']['south']:.0%}, east {g['coverage']['east']:.0%}. THE "
                     'EAST BRANCH IS THE CHEAP EXIT and the wave table is built knowing '
                     'it: a third of that arm is inside somebody\'s range and two thirds '
                     'of it is not, so an enemy routed east walks past far fewer guns than '
                     'one routed south. It is the shortest arm as well -- '
                     f"{g['routes']['east']:.0f} px against the south's "
                     f"{g['routes']['south']:.0f}.",
    }

    json.dump(out, open(OUT, 'w'), indent=2)
    print(f'wrote {os.path.relpath(OUT, ROOT)}')
    print(f'  trunk  {len(trunk):3d} points, {polyline_length(trunk):8.2f} px '
          f'(traced {polyline_length(shared):.2f})')
    print(f'  east   {len(east_lane):3d} points, {polyline_length(east_lane):8.2f} px '
          f'(traced {polyline_length(east):.2f})')
    print(f'  south  {len(south_lane):3d} points, {polyline_length(south_lane):8.2f} px '
          f'(traced {polyline_length(south):.2f})')
    print(f'  route to the east exit  {polyline_length(trunk) + polyline_length(east_lane):8.2f} px')
    print(f'  route to the south exit {polyline_length(trunk) + polyline_length(south_lane):8.2f} px')
    print(f'  gateways: entry {entry}, east {east_gate}, south {south_gate}')
    print(f'  {len(out["buildSpots"])} build spots, road width {out["roadWidth"]}')


if __name__ == '__main__':
    main()
