#!/usr/bin/env python3
"""Build src/data/map_level9.json out of tools/level9_geometry.json.

EVERY COORDINATE HERE IS TRACED except one: the gateway point off the west
edge, which is the same computed extension levels 2, 3, 4, 6 and 8 use. Nothing
is authored and nothing is typed.

Run:  python3 tools/build_level9_map.py

WHY THE FILE IS GENERATED RATHER THAN WRITTEN. tools/build_level8_map.py's note
says it: the geometry pass is the source of truth for the road, and a map.json
edited by hand is a second copy of it that drifts. Re-run this after any
re-trace and the map follows the geometry by construction.

THREE THINGS ABOUT THIS MAP THAT NO EARLIER LEVEL HAD.

  THE EXIT IS NOT ON A FRAME EDGE. Level 9's trace ends at a door in the
  machine housing at (1177, 329), 103 px short of the right edge. So unlike
  every other map the exit lane is NOT extended off-plate -- its last waypoint
  IS the door -- and an `exit` block IS written, which levels 2 to 8 omit. See
  `_exit` below: the leak itself needs nothing new, because `Enemy.leaked` has
  always been a lane distance rather than a frame test, but the FADE has to be
  told where the doorway is or an enemy pops out of existence at full opacity
  in the middle of the board.

  THE TRACE FORKS AND REJOINS, which `validateLanes` rejects as a circle -- see
  reports/2026-09-13-level-9-geometry.md. It is not modelled as a fork. The two
  arms are TWO ENTRANCE LANES that share the painted mouth and merge into the
  tail, which is levels 3 and 4's shape and needs nothing from the engine. What
  the player sees is what is painted: walkers come out of one mouth and take
  one of two roads round the board.

  THE PADS ARE PAINTED CHIPS, not open ground, and each carries one of FOUR
  build-node pictures instead of the one every other level uses. `padArt` pairs
  each pad with its variant and with the painted WIDTH of the chip it stands
  on, because the node art is about 500 px against chips averaging 81 px and
  has to be fitted to the chip rather than drawn at its own size.
"""
import json, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.path.join(ROOT, 'tools', 'level9_geometry.json')
OUT = os.path.join(ROOT, 'src', 'data', 'map_level9.json')

ENTRY_X = -60.0
GATEWAY_BASELINE = 40.0

# THE FADE'S TWO X POSITIONS, and the only numbers in this file chosen rather
# than measured. `Gateway.distanceAtX` converts an x to a lane distance by
# taking the FIRST crossing, so a gate x the route reaches twice fires in the
# wrong place -- and this route comes back east twice. Its highest x before the
# door approach is the right-hand hook; GATE_X sits above that and below the
# door, and the builder asserts the margin rather than trusting it.
GATE_X = 1145.0

# What the four node variants are called in art.json, keyed by the name the
# geometry file's own suggestion uses.
NODE_KEY = {
    'node_chip_square': 'node-chip-square',
    'node_chip_ram': 'node-chip-ram',
    'node_chip_fan': 'node-chip-fan',
    'node_chip_cabled': 'node-chip-cabled',
}

# SCENERY, AND IT IS THE ONE THING HERE THAT IS PLACED RATHER THAN DERIVED.
# Every position was scored against the traced centrelines and the fifteen pads
# before it was written down, and the figures are in `_scenery` below: nothing
# is within 74 px of the trace's centreline or 132 px of a pad, so none of it
# covers a road, sits on a build spot, or stands between a tower and anything
# it can shoot.
SCENERY = [
    {
        'key': 'prop-vlaude-screen', 'x': 1150.0, 'y': 630.0, 'height': 120.0,
        '_note': 'VLAUDE WATCHING, and he is scenery rather than a combatant: no health, '
                 'no targeting, no collision, no behaviour. Bottom-right, in the data '
                 'bloom beside the door he is behind. 130 px from the nearest centreline '
                 'and 203 px from the nearest pad.',
    },
    {
        'key': 'fx-electrical-arc', 'x': 112.0, 'y': 636.0, 'size': 105.0, 'loop': True,
        '_note': 'Over the cooling tower, bottom-left. 170 px from the nearest centreline.',
    },
    {
        'key': 'fx-electrical-arc', 'x': 975.0, 'y': 64.0, 'size': 105.0, 'loop': True,
        '_note': 'Across the fan, top-right of centre. 128 px from the nearest centreline.',
    },
    {
        'key': 'fx-electrical-arc', 'x': 1204.0, 'y': 96.0, 'size': 105.0, 'loop': True,
        '_note': 'On the machine housing above the door. 225 px from the nearest '
                 'centreline.',
    },
]


def extend_x(pts, to_x):
    """A gateway point out at `to_x`, on the heading the road ALREADY has.

    `pts` runs from the lane's terminal inwards, so pts[0] is the end. Level 8's
    function, and its note applies here too: the heading comes from the last
    traced point at least GATEWAY_BASELINE away, never from the final stub.
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


def snap(seg, node, which, width, label):
    """Replace a segment's end with the geometry file's own node coordinate.

    THE SEGMENTS DO NOT QUITE MEET AND THAT IS THE GEODESIC, NOT THE PAINT. Each
    centreline is box-filtered over nine samples before it is written down --
    without that an 8-connected walk measures about 3% long on the diagonals --
    and the filter pulls a walk's two ENDS inward by a few pixels, because
    there is only half a window there. So `stem` stops 4.8 px short of the fork
    and `north` starts 4.5 px past it: a 9 px step at a junction on a 47.5 px
    road, in a place where `atIndex: 0` needs the two lanes to share a point
    exactly.

    The node itself is not an estimate -- the tracer derived it as the deepest
    pixel of the junction, which is the middle of the paint -- so snapping both
    sides onto it closes the step and moves each line to a point that is
    further from the trace's edge than where it was. The assertion is what
    stops this being a licence: a snap of more than a quarter of a road width
    means the geometry moved and the map should be rebuilt rather than nudged.
    """
    at = 0 if which == 'start' else -1
    moved = math.dist(seg[at], node)
    assert moved <= width / 4, (
        f'{label} {which} is {moved:.1f} px from the node at {node}, more than a quarter '
        f'of the {width} px trace; re-derive the geometry rather than snapping this far')
    seg = [list(p) for p in seg]
    seg[at] = [float(node[0]), float(node[1])]
    return seg, moved


def main():
    g = json.load(open(GEO))
    c = g['centreline']
    width = g['traceWidth']
    fork, rejoin, junction = g['nodes']['fork'], g['nodes']['rejoin'], g['nodes']['doorJunction']
    door_terminal = g['exit']['terminal']

    snaps = []
    stem, m = snap(c['stem'], fork, 'end', width, 'stem'); snaps.append(('stem end', m))
    north, m = snap(c['north'], fork, 'start', width, 'north'); snaps.append(('north start', m))
    north, m = snap(north, rejoin, 'end', width, 'north'); snaps.append(('north end', m))
    south, m = snap(c['south'], fork, 'start', width, 'south'); snaps.append(('south start', m))
    south, m = snap(south, rejoin, 'end', width, 'south'); snaps.append(('south end', m))
    tail, m = snap(c['tail'], rejoin, 'start', width, 'tail'); snaps.append(('tail start', m))
    tail, m = snap(tail, junction, 'end', width, 'tail'); snaps.append(('tail end', m))
    door, m = snap(c['door'], junction, 'start', width, 'door'); snaps.append(('door start', m))
    door, m = snap(door, door_terminal, 'end', width, 'door'); snaps.append(('door end', m))

    entry = extend_x(stem, ENTRY_X)
    trunk_head = [entry] + stem            # gateway, the mouth, then the stem to the fork
    north_lane = trunk_head + north[1:]    # the fork is shared, so it is not repeated
    south_lane = trunk_head + south[1:]
    tail_lane = tail + door[1:]

    assert north_lane[len(trunk_head) - 1] == south_lane[len(trunk_head) - 1] == \
        [float(fork[0]), float(fork[1])]
    assert north_lane[-1] == south_lane[-1] == tail_lane[0] == [float(rejoin[0]), float(rejoin[1])]
    assert tail_lane[-1] == [float(door_terminal[0]), float(door_terminal[1])]

    # GATE_X HAS TO BE CROSSED ONCE, and once only, or the fade fires in the
    # middle of the board. Checked against the lane that actually reaches it.
    before_door = max(p[0] for p in tail_lane[:-2])
    assert before_door < GATE_X < door_terminal[0], (
        f'the tail reaches x={before_door:.1f} before the door approach and the door is at '
        f'x={door_terminal[0]}; GATE_X={GATE_X} is not between them')

    spots = [list(p) for p in g['pads']]
    chips = g['padChips']
    suggestion = g['suggestedNodeBalanced']
    pad_art = [{'key': NODE_KEY[suggestion[str(i + 1)]], 'width': float(chips[i]['w'])}
               for i in range(len(spots))]
    used = {}
    for a in pad_art:
        used[a['key']] = used.get(a['key'], 0) + 1

    out = {
        'plate': 'level9',
        '_plate': 'art-source/level9/map_level9.png at 3840x2160, encoded to '
                  'public/assets/maps/map_level9.webp at q95 and registered in art.json '
                  'as `map-level9`, with `map.level9` pointing at it.',
        'roadWidth': width,
        '_roadWidth': f'{width}, the median of the trace measured over the stem, both arms '
                      'and the tail by tools/trace_level9.py and re-measured to within 1% '
                      'by tools/check_level9.py. The paint flares to 60 px where it meets '
                      'the west frame and that mouth is left out of the median, the same '
                      "way level 8 leaves its bottom mouth out. Tower bases and the lane "
                      'spread are sized against this number.',
        'note': 'AI OVERRIDE PART 1: the inside of a computer, seen from directly above. A '
                'glowing cyan circuit trace over a dark blue substrate, fifteen flat grey '
                'chips as the only buildable ground, and AN EXIT THAT IS NOT A FRAME EDGE '
                '-- a door in the machine housing at (1177, 329). Every coordinate comes '
                'from tools/level9_geometry.json, which tools/trace_level9.py derived from '
                'the painted plate and tools/check_level9.py checks independently; this '
                'file is GENERATED from it by tools/build_level9_map.py and is not '
                'hand-edited. Re-derive with `python3 tools/trace_level9.py --overlay '
                'tools/L9_pads_overlay.png` and rebuild with `python3 '
                'tools/build_level9_map.py`.',
        'spotRadius': g['spotRadius'],
        '_spotRadius': f"{g['spotRadius']}, every other level's. World 1280 renders to 844 "
                       'CSS px, so 34 world px is a 44.8 px tap diameter and anything under '
                       '44 pt is smaller than a thumb. The closest pair of pads on this '
                       f"board is {g['closestPadPair']} px apart, well over the 2 x "
                       'spotRadius two tap targets need.',
        'mainId': 'north',
        '_mainId': 'THE TRUNK IS THE NORTH ARM, and the name matters for the same reason '
                   "level 6's and level 8's did: the wave table names the lane it spawns "
                   'on and `LaneNetwork.lane()` resolves an unknown id to main, so a table '
                   'spawning on `north` against a lane called `main` would walk the right '
                   'road by accident.',
        'waypoints': north_lane,
        '_waypoints': f'THE NORTH ARM, and it carries the shared head: the computed gateway '
                      f'at x={ENTRY_X}, the painted mouth at (0, 323), the stem to the fork '
                      f'at ({fork[0]}, {fork[1]}), then the long way round the board to the '
                      f'rejoin at ({rejoin[0]}, {rejoin[1]}). '
                      f'{polyline_length(north_lane):.0f} px.',
        'mainMerge': {'into': 'tail', 'atIndex': 0},
        'lanes': [
            {
                'id': 'south',
                'entrance': True,
                'waypoints': south_lane,
                'merge': {'into': 'tail', 'atIndex': 0},
                '_waypoints': 'THE SOUTH ARM, sharing the same head: the same gateway, the '
                              'same mouth, the same stem to the same fork, then the short '
                              'way round the bottom-left of the board to the same rejoin. '
                              f'{polyline_length(south_lane):.0f} px, against the north '
                              f"arm's {polyline_length(north_lane):.0f} -- this is the "
                              'cheap road and the wave table knows it.',
            },
            {
                'id': 'tail',
                'waypoints': tail_lane,
                '_waypoints': 'THE REJOIN TO THE DOOR. Waypoint 0 IS the rejoin, to 0.00 '
                              'px, which is what `atIndex: 0` on both arms means. Its LAST '
                              'waypoint is the door itself and is not extended off-plate, '
                              'because the door is not a frame edge -- see `_exit`.',
            },
        ],
        '_lanes': 'TWO ENTRANCES, ONE EXIT, AND NO FORK IN THE DATA. The plate paints a '
                  'trace that splits just inside the mouth and rejoins at the bottom of '
                  'the board, which is a diamond -- and `validateLanes` reports a diamond '
                  'as "merges in a circle", because its cycle check shares one visited set '
                  'across sibling branches instead of keeping one per path. The runtime '
                  'underneath is fine; the validator is not. So the two arms are modelled '
                  'as TWO ENTRANCE LANES that share the painted mouth and merge into the '
                  'tail, which is levels 3 and 4\'s shape, needs nothing from the engine, '
                  'and puts exactly the same walkers on exactly the same paint. `south` '
                  'declares `entrance` because nothing merges into it; see the note on '
                  'LaneDef. Both are fed by the wave table by name. See '
                  'reports/2026-09-13-level-9-geometry.md for the validator bug and its '
                  'one-line fix.',
        'exit': {
            'gateX': GATE_X,
            'vanishX': float(door_terminal[0]),
            '_note': 'AN INTERIOR EXIT, and the first in the game. The leak needed nothing '
                     'new -- `Enemy.leaked` is `laneDistance >= stopDistance` and has never '
                     'looked at the frame -- but without these two the enemy would wink out '
                     'at full opacity in the middle of the board, because the default '
                     'stopDistance is the end of a lane that used to run off the edge. The '
                     f'fade runs over the last {door_terminal[0] - GATE_X:.0f} px into the '
                     'doorway. `Gateway.distanceAtX` takes the FIRST crossing of an x, so '
                     f'gateX has to be above every earlier x on the route: the tail reaches '
                     f'x={before_door:.0f} at the top of the right-hand hook and the door is '
                     f'at x={door_terminal[0]}, so {GATE_X} sits between them with '
                     f'{GATE_X - before_door:.0f} px of margin. tools/build_level9_map.py '
                     'asserts that rather than trusting it.',
        },
        'buildSpots': spots,
        '_buildSpots': f'{len(spots)} PADS, ONE CENTRED ON EACH PAINTED GREY CHIP. Not '
                       'placed by a scoring pass the way levels 3 to 8 were: on this board '
                       'the buildable ground IS the fifteen chips the artist painted, and '
                       'the substrate between them is scenery. tools/check_level9.py '
                       "verifies every pad's 24 px core sits on chip rather than board. "
                       'THREE OF THE FIFTEEN CANNOT REACH THE ROUTE AT ALL at the shortest '
                       'attacking range in towers.json (pads 1, 7 and 15, at 156, 132 and '
                       '194 px from the nearest centreline), and only three of the fifteen '
                       'cover two separate passes of it. This board holds LESS effective '
                       'DPS than fifteen pads suggests, not more, and every mini-boss '
                       'health figure is soaked against it and against no other level.',
        'padArt': pad_art,
        '_padArt': 'FOUR BUILD-NODE PICTURES, which no other level has -- every other board '
                   'draws one pad art on every spot. The pairing is the geometry file\'s '
                   '`suggestedNodeBalanced`: the chips are ranked by aspect and dealt into '
                   'four runs in the variants\' own aspect order, so all four get used and '
                   'the most landscape chips get the most landscape node. `width` is the '
                   'PAINTED CHIP\'S width in world pixels, and it is what the node is drawn '
                   'at: the art is about 500 px against chips averaging 81, so a node drawn '
                   'at its own size would cover six chips. '
                   + ', '.join(f'{k} x{n}' for k, n in sorted(used.items())) + '.',
        'scenery': [{k: v for k, v in s.items() if not k.startswith('_')} for s in SCENERY],
        '_scenery': 'DECORATION DRAWN IN THE WORLD, and the general form of the one-off '
                    'that already placed level 1\'s tavern sign. Each entry is a manifest '
                    'key, a world position and a size; `loop` marks an animation that runs '
                    'continuously. Nothing here has health, takes damage, blocks a shot or '
                    'occupies a spot -- `GameScene.buildScenery` adds an image or a sprite, '
                    'y-sorts it and never looks at it again. THE ARCS ARE NOT A HAZARD: '
                    'they are an eight-frame loop between two fixed contact points, and '
                    'they are placed on the machinery in the corners where nothing is '
                    'fought. Every position was scored against the traced centrelines and '
                    'the fifteen pads first: the closest any of them comes to a centreline '
                    'is 128 px and to a pad 132 px, so none of them covers a road, sits on '
                    'a build spot or stands between a tower and a target. '
                    + ' '.join(s['_note'] for s in SCENERY),
    }

    json.dump(out, open(OUT, 'w'), indent=2)
    print(f'wrote {os.path.relpath(OUT, ROOT)}')
    print(f'  north {len(north_lane):3d} points, {polyline_length(north_lane):8.2f} px')
    print(f'  south {len(south_lane):3d} points, {polyline_length(south_lane):8.2f} px')
    print(f'  tail  {len(tail_lane):3d} points, {polyline_length(tail_lane):8.2f} px')
    print(f'  route via north {polyline_length(north_lane) + polyline_length(tail_lane):8.2f} px')
    print(f'  route via south {polyline_length(south_lane) + polyline_length(tail_lane):8.2f} px')
    print(f'  gateway {entry}, door {tail_lane[-1]}, gateX {GATE_X} '
          f'(highest earlier x {before_door:.1f})')
    print('  node snaps: ' + ', '.join(f'{n} {d:.1f}px' for n, d in snaps))
    print(f'  {len(spots)} build spots, {len(SCENERY)} scenery items, road width {width}')


if __name__ == '__main__':
    main()
