#!/usr/bin/env python3
"""Check every build plot on every level against the road, the plate and its
neighbours, reading the SHIPPED map files rather than tools/plots.json.

    python3 tools/check_plots.py

A plot draws as an ellipse: `spotRadius` wide and `spotRadius * PAD_SQUASH`
tall, which is 68 by 42 at today's numbers. The road is every lane centreline
dilated by `roadWidth / 2`. Four things are checked and all four are about the
player rather than about the pass that placed the pads:

  ROAD       the pad's ellipse must not touch painted road. Reported two ways.
             `edge` is the true shortest distance from the ellipse OUTLINE to
             the paint. `radial` is the distance along the line joining the
             centres minus the ellipse's radius in that direction, which is
             what tools/plots.json's own `minRoadGap` reports -- it is the
             looser of the two and the summary block is reproduced by it.
  PLATE      the ellipse must sit inside the 1280x720 world.
  SPACING    two pads need 2 x spotRadius between centres or their tap targets
             overlap and the nearer one eats both taps.
  REACH      the near EDGE of the road -- centreline distance less roadWidth/2
             -- against the tower pool's ranges. REPORTED, NOT FAILED, and the
             reason is level 6: its pad 2 at (1167, 53) is 228.8 px from any
             road and its own map file says so in as many words -- "PAD 2 IS
             DEAD ... It is painted on; it stays". The pads on that board are
             found by colour on the painting rather than placed, so a dead one
             is a fact about the art. A count of pads no tower can reach is
             worth printing on every run; failing on it would only mean the
             check is red on main for something nobody intends to change.

WHAT IS DELIBERATELY NOT CHECKED. The 90-114 px standoff band the old scoring
sweep enforced. The plots are hand-placed now and run from 54 to 159 px off the
centreline on purpose; see tools/apply_plots.py.

`waypoints` IS A LANE -- the main one -- and it is never repeated inside
`lanes`. A check that reads only `lanes` measures a board with one road
missing, which is how the first run of this script reported level 6's own pads
as 530 px from anything.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAD_SQUASH = 0.62          # src/scenes/GameScene.ts
WORLD = (1280.0, 720.0)    # src/data/display.json

MAPS = {1: 'map', 2: 'map_level2', 3: 'map_level3', 4: 'map_level4', 5: 'map_level5',
        6: 'map_level6', 7: 'map_level7', 8: 'map_level8', 9: 'map_level9',
        10: 'map_level10'}


def read(name):
    return json.load(open(os.path.join(ROOT, 'src/data', name + '.json')))


def polylines(m):
    out = [[tuple(p) for p in m['waypoints']]]
    for lane in (m.get('lanes') or []):
        out.append([tuple(p) for p in lane['waypoints']])
    return out


def sample(lines, step=1.0):
    pts = []
    for line in lines:
        for i in range(len(line) - 1):
            (ax, ay), (bx, by) = line[i], line[i + 1]
            d = math.hypot(bx - ax, by - ay)
            n = max(1, int(d / step))
            for k in range(n + 1):
                t = k / n
                pts.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return pts


def edge_distance(dx, dy, rx, ry):
    """Shortest distance from a point to an ellipse outline, negative inside.

    Bisected on the parametric angle. The ellipse is convex, so for a point
    outside it the closest outline point is unique and the derivative of the
    squared distance changes sign exactly once.
    """
    ax, ay = abs(dx), abs(dy)
    lo, hi = 0.0, math.pi / 2
    for _ in range(80):
        t = (lo + hi) / 2
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        if (ex - ax) * (-rx * math.sin(t)) + (ey - ay) * (ry * math.cos(t)) > 0:
            hi = t
        else:
            lo = t
    t = (lo + hi) / 2
    d = math.hypot(rx * math.cos(t) - ax, ry * math.sin(t) - ay)
    return -d if (ax / rx) ** 2 + (ay / ry) ** 2 <= 1.0 else d


def radial_distance(dx, dy, rx, ry):
    d = math.hypot(dx, dy)
    if d == 0:
        return -min(rx, ry)
    return d - 1.0 / math.sqrt((dx / d / rx) ** 2 + (dy / d / ry) ** 2)


def ranges():
    t = json.load(open(os.path.join(ROOT, 'src/data/towers.json')))
    return sorted(v['range'] for v in t.values()
                  if isinstance(v, dict) and isinstance(v.get('range'), (int, float))
                  and v['range'] > 0)


def main():
    reach = ranges()
    faults = 0
    print(f'tower ranges {reach}\n')
    print(f'{"lvl":>3} {"pads":>4} {"road edge":>9} {"road radial":>11} '
          f'{"plate":>5} {"closest pair":>12} {"reach":>5}')
    for lv in range(1, 11):
        m = read(MAPS[lv])
        pads = [(float(x), float(y)) for x, y in m['buildSpots']]
        rx = float(m['spotRadius'])
        ry = rx * PAD_SQUASH
        half = float(m['roadWidth']) / 2.0
        road = sample(polylines(m))
        bad, dead = [], []

        worst_edge = worst_radial = 1e9
        for i, (px, py) in enumerate(pads):
            e = min(edge_distance(qx - px, qy - py, rx, ry) for qx, qy in road) - half
            r = min(radial_distance(qx - px, qy - py, rx, ry) for qx, qy in road) - half
            worst_edge = min(worst_edge, e)
            worst_radial = min(worst_radial, r)
            if e < 0:
                bad.append(f'pad {i + 1} at ({px:g},{py:g}) overlaps the road by {-e:.2f}')
            if px - rx < 0 or px + rx > WORLD[0] or py - ry < 0 or py + ry > WORLD[1]:
                bad.append(f'pad {i + 1} at ({px:g},{py:g}) hangs off the plate')
            near = min(math.hypot(qx - px, qy - py) for qx, qy in road) - half
            if near > reach[-1]:
                dead.append(f'pad {i + 1} at ({px:g},{py:g}) is {near:.1f} px from the nearest '
                            f'road edge and the longest tower reaches {reach[-1]}')

        pair = min(math.dist(pads[i], pads[j])
                   for i in range(len(pads)) for j in range(i + 1, len(pads)))
        if pair < 2 * rx:
            bad.append(f'the closest pair of pads is {pair:.1f} px apart, inside 2 x {rx:g}')
        shortest = sum(1 for px, py in pads
                       if min(math.hypot(qx - px, qy - py) for qx, qy in road) - half <= reach[0])
        print(f'{lv:>3} {len(pads):>4} {worst_edge:>9.2f} {worst_radial:>11.2f} '
              f'{"ok":>5} {pair:>12.1f} {shortest:>3}/{len(pads)}'
              f'{"" if not bad else "   FAIL"}')
        for b in bad:
            print(f'      {b}')
        for d in dead:
            print(f'      dead: {d}')
        faults += len(bad)
    print(f'\n{faults} faults. `reach` counts pads with road inside the SHORTEST '
          f'tower range ({reach[0]}); a `dead` line is a pad NO tower reaches.')
    sys.exit(1 if faults else 0)


if __name__ == '__main__':
    main()
