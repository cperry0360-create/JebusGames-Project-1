"""Generate src/data/map_level7.json from tools/level7_geometry.json.

    python3 tools/build_level7_map.py

GENERATED, NOT HAND-EDITED, for the same reason tools/build_level8_map.py
exists: the map file is the only copy of the geometry the engine ever reads,
and a coordinate typed twice is a coordinate that can disagree with itself.
Re-derive with `python3 tools/trace_level7.py --overlay tools/L7_pads_overlay.png`
and then re-run this; `python3 tools/check_level7.py` reads the plate again and
checks the geometry file, and tests/level7.test.ts checks that this file still
matches it.

THE ONE THING THIS ADDS to the traced coordinates is the six off-plate
gateways. Every other level does the same: an enemy that appears exactly on the
frame edge pops into being in full view, so the lane starts a little way off the
plate and walks on. Levels 4, 6 and 8 use -60 and 1340 and so does this one.

There is no heading to compute here, which is the one way level 7 is simpler
than every level before it. All three highways are dead straight and level --
two vertices each, both at the same y, traced that way off the painting -- so a
gateway is the lane's own y at an x outside the frame, and `extend_x`'s
baseline-heading machinery would only be an elaborate way of returning it.
"""

import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOMETRY = os.path.join(ROOT, 'tools', 'level7_geometry.json')
OUT = os.path.join(ROOT, 'src', 'data', 'map_level7.json')

ENTRY_X, EXIT_X = -60.0, 1340.0

NOTE = (
    "THE HIGHWAY: three straight desert highways running west to east, one "
    "above another, that never touch. Each has its own west entrance and its "
    "own east exit and ALL THREE COST LIVES. Every coordinate comes from "
    "tools/level7_geometry.json, which tools/trace_level7.py derived from the "
    "painted plate and tools/check_level7.py checks independently; this file is "
    "GENERATED from it by tools/build_level7_map.py and is not hand-edited."
)

MAIN_ID_NOTE = (
    "THE NORTH HIGHWAY IS `north`, not `main`, which is level 6's rename and is "
    "here for the same reason: waves.level7.json spawns on all three lanes BY "
    "NAME, and `LaneNetwork.lane()` resolves an unknown id to main -- so a table "
    "spawning on `north` against a lane called `main` would walk the right road "
    "by accident and the wrong one the day the lanes are reordered. One of the "
    "three has to be the map's own `waypoints`, because LaneNetwork is built as "
    "[waypoints, ...lanes] and GameScene measures the board bounds against the "
    "first; naming it is how that lane can be `north` to the waves AND the map's "
    "waypoints to the engine."
)

ROAD_WIDTH_NOTE = (
    "71, the geometry file's `roadWidth`, which is the median of the three "
    "highways measured by casting normals through each band. THEY ARE NOT EQUAL: "
    "north is 67, middle 75, south 71, a 12% spread that is in the painting. "
    "MapDef.roadWidth is one number because tower bases are sized against it and "
    "a tower does not know which lane it is nearest to; the middle highway is "
    "therefore drawn 4 px wider than the bases sitting beside it and the north "
    "one 4 px narrower. Measured rather than averaged: the per-lane figures are "
    "in tools/level7_geometry.json's `roadWidthPerLane` and check_level7.py "
    "re-derives all three."
)

LANES_NOTE = (
    "THREE INDEPENDENT LANES, ONE MORE THAN ANY MAP BEFORE THIS. Level 6 is the "
    "two-lane level and this is the three-lane one; the shape is exactly level "
    "6's, repeated. None of the three declares a `merge` -- each runs to its own "
    "exit and nothing continues from it -- and the two that are not the map's "
    "own waypoints declare `entrance: true`, which is what tells `validateLanes` "
    "that a lane nothing merges into is an arrival rather than a forgotten "
    "`merge`. NOTHING ABOUT LEAKING IS PER-EXIT: `GameScene.leak` charges the "
    "enemy's own `livesCost` wherever it got out, so all three cost lives "
    "without a field saying so."
)

SPOT_RADIUS_NOTE = (
    "34, every other level's. World 1280 renders to 844 CSS px, so 34 world px "
    "is a 44.8 px tap diameter and anything under 44 pt is smaller than a thumb. "
    "Two pads need 2 x spotRadius between centres before their tap targets "
    "overlap; tools/check_level7.py measures the closest pair and reports 76.0."
)

BUILD_SPOTS_NOTE = (
    "TWENTY-TWO PADS, AND TWENTY OF THEM REACH TWO HIGHWAYS AT ONCE. That is the "
    "defining fact about this board and it is what boss health has to be "
    "measured against. The medians are about 111 px of scrub between two "
    "highways whose centrelines are 183-184 px apart, and tower range is 112 -- "
    "so a pad standing in a median at the house standoff of 90-114 px from one "
    "centreline is inside 112 px of the other as well, by construction rather "
    "than by luck. Ten pads sit in each median and they are all doubles; the "
    "remaining two, above the north highway and below the south one, cover one "
    "lane each. A tower here does roughly double the work of one on any earlier "
    "level, so THIS BOARD HOLDS FAR MORE EFFECTIVE DPS THAN 22 PADS SUGGESTS and "
    "neither boss's health transfers to or from another level. Placed by "
    "tools/trace_level7.py on levels 3, 4 and 8's four properties and verified by "
    "tools/check_level7.py: each pad's 24 px core sits entirely on classified "
    "scrub, 90-114 px from the nearest lane centreline, at least 74 px from "
    "another pad, and at least 34 px from a frame edge so its tap target is on "
    "the board."
)

COVERAGE_NOTE = (
    "HOW MUCH OF EACH HIGHWAY THE PADS CAN REACH, from the geometry file: north "
    "90.2%, middle 94.1%, south 83.1%. The uncovered spans are at the lane ENDS "
    "rather than in the middle, because a pad must stand 34 px clear of the frame "
    "and its range then stops short of the edge. THE SOUTH HIGHWAY'S EAST END IS "
    "THE BIG ONE: 189 px from x=1090 to the exit with no tower able to reach it, "
    "against 51 px on the north and 54 on the middle. The rusted pickup wreck in "
    "the lower median is why -- its bodywork classifies as road, so no pad core "
    "fits beside it. Anything that survives to x=1090 in the south lane is out, "
    "and the finale is deliberately routed through it."
)


def main() -> None:
    g = json.load(open(GEOMETRY))
    lanes_are = g['lanesAre']
    assert lanes_are == ['north', 'middle', 'south'], lanes_are

    def walk(name):
        """The traced lane with a gateway welded on each end."""
        pts = [list(map(float, p)) for p in g['lanes'][name]]
        assert len(pts) == 2, f'{name} is not a straight two-vertex lane any more'
        y0, y1 = pts[0][1], pts[-1][1]
        assert y0 == y1, f'{name} is no longer level; the gateway shortcut is wrong'
        return ([[ENTRY_X, y0]]
                + [[int(x), int(y)] for x, y in pts]
                + [[EXIT_X, y1]])

    main_id = lanes_are[0]
    doc = {
        'plate': 'level7',
        '_plate': (
            'art-source/map_level7.png at 1672x941, encoded to '
            'public/assets/maps/map_level7.webp at q95 and registered in art.json '
            'as `map-level7`, with `map.level7` pointing at it.'
        ),
        'roadWidth': int(g['roadWidth']),
        '_roadWidth': ROAD_WIDTH_NOTE,
        'note': NOTE,
        'spotRadius': int(g['padFootprintRadius']),
        '_spotRadius': SPOT_RADIUS_NOTE,
        'mainId': main_id,
        '_mainId': MAIN_ID_NOTE,
        'waypoints': walk(main_id),
        '_waypoints': (
            f'THE {main_id.upper()} HIGHWAY, y={int(g["lanes"][main_id][0][1])}, '
            'and it is the map\'s own `waypoints` because the engine requires one '
            'lane to be. Two traced vertices plus one gateway at each end; there '
            'is no third traced point because the road really is straight -- '
            'check_level7.py re-traces it off the shipped plate and gets two '
            'vertices, 0 of them off the paint.'
        ),
        'lanes': [
            {
                'id': name,
                'waypoints': walk(name),
                'entrance': True,
                '_waypoints': (
                    f'THE {name.upper()} HIGHWAY, y={int(g["lanes"][name][0][1])}, '
                    f'road width {g["roadWidthPerLane"][name]}. Its own entrance '
                    'and its own exit; no `merge`.'
                ),
            }
            for name in lanes_are[1:]
        ],
        '_lanes': LANES_NOTE,
        'buildSpots': [[int(x), int(y)] for x, y in g['pads']],
        '_buildSpots': BUILD_SPOTS_NOTE,
        '_coverage': COVERAGE_NOTE,
    }
    with open(OUT, 'w') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')
    total = sum(
        abs(doc['waypoints'][-1][0] - doc['waypoints'][0][0]) if n == main_id
        else abs(walk(n)[-1][0] - walk(n)[0][0])
        for n in lanes_are
    )
    print(f'{OUT}: {len(lanes_are)} lanes, {len(doc["buildSpots"])} pads')
    for n in lanes_are:
        w = walk(n)
        print(f'  {n:7s} y={w[0][1]:6.1f}  x {w[0][0]} -> {w[-1][0]}  '
              f'walked {abs(w[-1][0] - w[0][0]):.1f} px (painted {g["lengths"][n]})')
    print(f'  gateway-to-gateway total {total:.1f} px')


if __name__ == '__main__':
    main()
