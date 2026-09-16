"""Painted road that no lane walks, on every level, as a number.

    python3 tools/orphan_roads.py                 # measure and print
    python3 tools/orphan_roads.py --write         # ... and rewrite the fixture

THIS EXISTS BECAUSE THREE ORPHAN ROADS WERE FOUND BY EYE. Level 8's dead gate
segment, level 6's unused bottom opening, and level 9's dead-end spur -- all
three painted, all three walked by nothing, and all three noticed by somebody
looking at a picture rather than by anything in the repository. A fourth would
have been found the same way.

WHAT IS MEASURED. Every level's plate is classified into a ROAD mask with that
level's own rule -- the rules are its tracer's or its checker's, copied here
with the level they came from, not re-derived -- and then two filters run:

  CONNECTED TO A LANE. The mask is split into connected components and only the
  ones a lane centreline actually touches are kept. This is what tells an
  orphan ROAD apart from a false positive: level 9's classifier also matches
  the cooling tower's vent slots and the fan housing, which are cyan and are
  not road, and they are not connected to the trace. Level 9's dead-end spur
  IS connected to the trace -- it hangs off the door junction -- so it stays,
  which is the whole point.

  FURTHER THAN 60 FROM EVERY LANE. 60 world px is wider than every road on
  every level (the widest is level 1's 80... see ROAD_WIDTH_NOTE below), so a
  pixel past it is not the far kerb of a road somebody walks.

The fixture tests/fixtures/road-masks.json carries the KEPT mask at half
resolution, run-length encoded, so tests/orphanroads.test.ts can recompute the
fraction against the live map JSON without a WebP decoder -- node has none, and
`npm install` answers 403 here. Re-run this with --write after any change to a
plate; the test compares the fixture against the LANES, so lane drift fails
without a regenerate and art drift needs one.
"""
import argparse
import json
import math
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import img                                                          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CANVAS_W, CANVAS_H = 1280, 720
FIXTURE = os.path.join(ROOT, 'tests/fixtures/road-masks.json')

# HOW FAR OFF A LANE A PAINTED PIXEL HAS TO BE TO COUNT AS ORPHANED.
#
# The widest road in the game is level 1's 80 px, so its far kerb is 40 from
# the centreline; every other level is 71 or under. 60 clears every kerb and is
# still well inside a road width of daylight from the next road along.
ORPHAN_RADIUS = 60.0

# The mask is stored and measured at every SCALE-th pixel. 2 keeps the fixture
# small and costs nothing against a 60 px radius.
SCALE = 2

# A component smaller than this is texture or a highlight, not a road, and it
# is dropped before the lane-touch filter rather than after -- otherwise a
# lane that clips one speckle drags it in.
MIN_COMPONENT = 400


def road_of_level1(r, g, b):
    """trace_map.py: warm sand dirt over dark grass."""
    return r - g >= 40 and b >= 28 and (r + g + b) // 3 > 100


def road_of_level2(r, g, b):
    """check_level2.py: the cyan lane glow, plus the pale warm grey road.

    Both count. The plate paints a lit lane down the middle of a stone road and
    the checker classifies them separately; either is ground a walker is on.
    """
    if r < 110 and g > 170 and b > 170:
        return True
    return (r + g + b) // 3 > 92 and 8 <= r - g <= 48 and b >= 62


def road_of_level3(r, g, b):
    """check_level3.py: warm and desaturated, red leading, blue trailing."""
    if b > r and b > g:
        return False
    return r > 85 and r >= g >= b and 18 <= r - b <= 95 and g - b >= 4


def road_of_level4(r, g, b):
    """check_level4.py: warm sand against snow and grass."""
    return r > 150 and r > g > b and 55 <= r - b <= 130 and g - b >= 20


def road_of_level5(r, g, b):
    """trace_level5.py."""
    return r > g > b and r - g >= 45 and (r + g + b) // 3 > 90


def road_of_level6(r, g, b):
    """trace_level6.py: warm tan with real blue in it."""
    return r > g > b and r - g >= 40 and b >= 40 and (r + g + b) // 3 > 110


def road_of_level7(r, g, b):
    """trace_level7.py, ASPHALT ONLY.

    The full rule reconstructs the white edge lines and yellow centre dashes
    into the road by growing them out of asphalt they touch. That pass is about
    measuring the road's WIDTH correctly; it cannot add a component the asphalt
    does not already have, so it cannot change which components this finds.
    Asphalt alone is the seed and the seed is what matters here.
    """
    sat = max(r, g, b) - min(r, g, b)
    return sat <= 40 and (r + g + b) // 3 < 130


def road_of_level8(r, g, b):
    """trace_level8.py: warm tan with real blue in it, which is what keeps the
    conveyors' hazard striping out."""
    return r > g > b and r - g >= 40 and b >= 40 and (r + g + b) // 3 > 90


def road_of_cyan_trace(r, g, b):
    """trace_level9.py, and trace_level10.py says it uses the same test: the
    glowing cyan circuit trace. Green and blue both high, red far below."""
    return g >= 150 and b >= 170 and r < g - 60


LEVELS = [
    ('level1', 'map_level1_v2.webp', 'map.json', road_of_level1),
    ('level2', 'map_level2.webp', 'map_level2.json', road_of_level2),
    ('level3', 'map_level3.webp', 'map_level3.json', road_of_level3),
    ('level4', 'map_level4.webp', 'map_level4.json', road_of_level4),
    ('level5', 'map_level5.webp', 'map_level5.json', road_of_level5),
    ('level6', 'map_level6.webp', 'map_level6.json', road_of_level6),
    ('level7', 'map_level7.webp', 'map_level7.json', road_of_level7),
    ('level8', 'map_level8.webp', 'map_level8.json', road_of_level8),
    ('level9', 'map_level9.webp', 'map_level9.json', road_of_cyan_trace),
    ('level10', 'map_level10.webp', 'map_level10.json', road_of_cyan_trace),
]


def lane_polylines(mapfile):
    m = json.load(open(os.path.join(ROOT, 'src/data', mapfile)))
    out = [m['waypoints']]
    for lane in m.get('lanes', []):
        out.append(lane['waypoints'])
    return out, m


def segments(polys):
    return [(a[0], a[1], b[0], b[1]) for p in polys for a, b in zip(p, p[1:])]


def dist_to(px_, py_, segs, stop):
    """Distance from a point to the nearest segment, giving up once under
    `stop` -- every caller only wants to know which side of `stop` it is on."""
    best = float('inf')
    for x1, y1, x2, y2 in segs:
        dx, dy = x2 - x1, y2 - y1
        ll = dx * dx + dy * dy
        t = 0.0 if ll == 0 else max(0.0, min(1.0, ((px_ - x1) * dx + (py_ - y1) * dy) / ll))
        d = math.hypot(x1 + t * dx - px_, y1 + t * dy - py_)
        if d < best:
            best = d
            if best < stop:
                return best
    return best


def mask_of(plate, road):
    """The road mask, point-sampled to canvas resolution every SCALE px."""
    w, h, px = img.read(os.path.join(ROOT, 'public/assets/maps', plate))
    mw, mh = CANVAS_W // SCALE, CANVAS_H // SCALE
    mask = bytearray(mw * mh)
    for y in range(mh):
        sy = (y * SCALE * h) // CANVAS_H
        base = sy * w
        for x in range(mw):
            i = (base + (x * SCALE * w) // CANVAS_W) * 4
            if road(px[i], px[i + 1], px[i + 2]):
                mask[y * mw + x] = 1
    return mw, mh, mask


def components(mw, mh, mask):
    seen = bytearray(mw * mh)
    out = []
    for s in range(mw * mh):
        if not mask[s] or seen[s]:
            continue
        q = deque([s])
        seen[s] = 1
        pts = [s]
        while q:
            i = q.popleft()
            x, y = i % mw, i // mw
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < mw and 0 <= ny < mh:
                    j = ny * mw + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
                        pts.append(j)
        out.append(pts)
    return out


def rle(mw, mh, kept):
    """Each row as "x:len,x:len", blank where the row is empty."""
    rows = []
    for y in range(mh):
        runs, x = [], 0
        while x < mw:
            if kept[y * mw + x]:
                start = x
                while x < mw and kept[y * mw + x]:
                    x += 1
                runs.append(f'{start}:{x - start}')
            else:
                x += 1
        rows.append(','.join(runs))
    return rows


def measure(name, plate, mapfile, road, verbose):
    polys, m = lane_polylines(mapfile)
    segs = segments(polys)
    mw, mh, mask = mask_of(plate, road)
    raw = sum(mask)

    # KEEP ONLY WHAT A LANE TOUCHES. A component with no lane in it is not a
    # road the level forgot; it is the classifier matching something else.
    near = bytearray(mw * mh)
    half = max(m['roadWidth'] / 2.0, 12.0)
    for p in polys:
        for a, b in zip(p, p[1:]):
            steps = int(math.dist(a, b) / SCALE) + 1
            for k in range(steps + 1):
                t = k / steps
                x = int((a[0] + (b[0] - a[0]) * t) / SCALE)
                y = int((a[1] + (b[1] - a[1]) * t) / SCALE)
                for oy in range(-int(half / SCALE), int(half / SCALE) + 1):
                    for ox in range(-int(half / SCALE), int(half / SCALE) + 1):
                        nx, ny = x + ox, y + oy
                        if 0 <= nx < mw and 0 <= ny < mh:
                            near[ny * mw + nx] = 1

    kept = bytearray(mw * mh)
    dropped = 0
    for pts in components(mw, mh, mask):
        if len(pts) < MIN_COMPONENT or not any(near[i] for i in pts):
            dropped += len(pts)
            continue
        for i in pts:
            kept[i] = 1
    total = sum(kept)

    orphan = []
    for i in range(mw * mh):
        if not kept[i]:
            continue
        x, y = (i % mw) * SCALE, (i // mw) * SCALE
        if dist_to(x, y, segs, ORPHAN_RADIUS) >= ORPHAN_RADIUS:
            orphan.append(i)

    pct = 100.0 * len(orphan) / total if total else 0.0
    print(f'{name:>8}  road {total:7d}  orphan {len(orphan):6d}  {pct:6.2f}%   '
          f'(classifier matched {raw}, {dropped} dropped as not-a-road)')

    if verbose and orphan:
        oset = set(orphan)
        seen = set()
        blobs = []
        for s in orphan:
            if s in seen:
                continue
            q = deque([s])
            seen.add(s)
            c = [s]
            while q:
                i = q.popleft()
                x, y = i % mw, i // mw
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        j = (y + dy) * mw + (x + dx)
                        if 0 <= x + dx < mw and 0 <= y + dy < mh and j in oset and j not in seen:
                            seen.add(j)
                            q.append(j)
                            c.append(j)
            blobs.append(c)
        blobs.sort(key=len, reverse=True)
        for c in blobs[:3]:
            xs = [(i % mw) * SCALE for i in c]
            ys = [(i // mw) * SCALE for i in c]
            print(f'           {len(c) * SCALE * SCALE:6d} world px  '
                  f'x {min(xs):4d}-{max(xs):4d}  y {min(ys):4d}-{max(ys):4d}  '
                  f'({100.0 * len(c) / total:.2f}%)')

    return {
        'plate': plate,
        'map': mapfile,
        'scale': SCALE,
        'w': mw,
        'h': mh,
        'painted': total,
        'rows': rle(mw, mh, kept),
    }, pct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='rewrite the test fixture')
    ap.add_argument('--only', help='one level id')
    ap.add_argument('--quiet', action='store_true')
    args = ap.parse_args()

    print(f'orphan radius {ORPHAN_RADIUS:.0f} world px, mask every {SCALE} px\n')
    out, worst = {}, []
    for name, plate, mapfile, road in LEVELS:
        if args.only and name != args.only:
            continue
        rec, pct = measure(name, plate, mapfile, road, not args.quiet)
        out[name] = rec
        worst.append((pct, name))

    if args.write:
        os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
        payload = {
            '_note': 'GENERATED by tools/orphan_roads.py --write. Each level\'s painted road '
                     'mask, point-sampled to canvas resolution every `scale` px, run-length '
                     'encoded per row as "x:len". Only components a lane centreline touches '
                     'are here; see the tool for why. tests/orphanroads.test.ts measures how '
                     'much of this has no lane within 60 world px of it.',
            '_radius': ORPHAN_RADIUS,
            'levels': out,
        }
        json.dump(payload, open(FIXTURE, 'w'), indent=1)
        print(f'\nwrote {os.path.relpath(FIXTURE, ROOT)}')

    worst.sort(reverse=True)
    print('\nworst first: ' + ', '.join(f'{n} {p:.1f}%' for p, n in worst))


if __name__ == '__main__':
    main()
