"""Check src/data/map_level3.json and the level 3 geometry against the painted plate.

    python3 tools/check_level3.py
    python3 tools/check_level3.py --overlay      # also write the pad overlay PNG

Level 3 arrived differently again. Level 1 was traced out of the painting by a
classifier; level 2 came with its route stroked onto an overlay; this one came
with tools/level3_geometry.json -- two branch centrelines, a shared tail, a
merge point, a road width and fifteen pads, as numbers. So there is nothing to
trace and nothing to agree with a drawing about. What is left, and what this
does, is ask the PLATE whether those numbers describe it.

WHAT IS RE-DERIVED, AND HOW.

  road width      Normals cast off each lane's centreline through the painted
                  track, and the median taken per lane. The NARROWEST lane's
                  median is the answer, because the road has to fit its
                  tightest stretch -- the same rule level 2 states. Measured
                  lane by lane the shared tail reads about 65 against the upper
                  branch's 55: the track there runs beside painted field
                  markings and a pale apron that no colour test separates from
                  the track. That is a limit of the measurement, not a wider
                  road, and taking the minimum is what makes the number honest
                  rather than what makes it pass.

  branch lengths  A geodesic through the painted track from each gate to the
                  merge, and from the merge to the exit, weighted to run down
                  the middle of the band rather than clip its corners. Branch
                  plus tail is the route, and that is what is compared.

THE GEOMETRY FILE'S DECLARED LENGTHS WERE WRONG AND HAVE BEEN CORRECTED. It
shipped `lengths` of 1366.5 (upper) and 1395.5 (lower). Its own waypoints walk
1347.3 and 1333.6; this script's trace of the painted plate says 1351.6 and
1347.9. Two independent measurements agreeing to about a percent, and both
disagreeing with the declared pair -- which also claims the two routes differ
by 29 px when every measurement says they are equal to a fraction of one. The
originals are recorded in the file's own `_lengths` note. THE COORDINATES WERE
NOT TOUCHED: a derived figure was brought into line with the geometry it is
derived from, which is exactly what happened to level 2's 1916.7.

THE PLATE IS .webp AND tools/png.py READS PNG. So the plate is decoded to a
scratch PNG through Chromium first -- `sh tools/decode/run.sh` -- cached under
tools/decode/out, which is gitignored. It is decoded AT CANVAS RESOLUTION,
1280x720, because the map's coordinate space is the canvas and the plate ships
at 3x it.

Nothing at runtime depends on any of this. It is the record of where
map_level3.json came from and how to redo it when the art changes.
"""

import argparse
import heapq
import json
import math
import os
import subprocess
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOMETRY = os.path.join(ROOT, 'tools/level3_geometry.json')
MAP = os.path.join(ROOT, 'src/data/map_level3.json')
PLATE_WEBP = os.path.join(ROOT, 'public/assets/maps/map_level3.webp')
PLATE_PNG = os.path.join(ROOT, 'tools/decode/out/plate3_canvas.png')
OVERLAY_OUT = os.path.join(ROOT, 'tools/decode/out/level3_pads.png')

# The plate fills a 1280x720 canvas whatever it was exported at, so canvas
# pixels are the map's coordinate space.
CANVAS_W, CANVAS_H = 1280, 720

# How far a derived figure may sit from the geometry file's before it is a
# disagreement rather than measurement noise.
TOLERANCE = 0.03

# A pad has to reach the road it covers and not stand in it. The shortest
# SHOOTING tower reaches 132, so 114 leaves 18 px of margin; under 90 and the
# pad is close enough to the road to look like it is on it.
PAD_MIN_FROM_LANE, PAD_MAX_FROM_LANE = 90.0, 114.0

# Two pads need 2 x spotRadius between centres before their tap targets stop
# overlapping. spotRadius is 34, so 68 is the floor; 74 is what the geometry
# was authored to and what is held here.
PAD_MIN_SPACING = 74.0

# The pad's core -- the part a tower's base actually stands on.
PAD_CORE_RADIUS = 24

# Scattered single pixels of grass detail are not an obstruction. A bench or a
# traffic cone is. Anything smaller than this inside a core is texture.
MIN_OBSTRUCTION_BLOB = 30


# ------------------------------------------------------------------- the plate

def plate():
    """The level 3 plate at canvas resolution, decoding it first if needed."""
    fresh = (os.path.exists(PLATE_PNG)
             and os.path.getmtime(PLATE_PNG) >= os.path.getmtime(PLATE_WEBP))
    if not fresh:
        print(f'decoding {os.path.relpath(PLATE_WEBP, ROOT)} at {CANVAS_W}x{CANVAS_H} ...')
        subprocess.run(['sh', os.path.join(ROOT, 'tools/decode/run.sh'),
                        'public/assets/maps/map_level3.webp', 'plate3_canvas.png',
                        f'w={CANVAS_W}&h={CANVAS_H}', '180'],
                       cwd=ROOT, check=True,
                       env={**os.environ, 'DECODE_OUT': os.path.dirname(PLATE_PNG)})
    if not os.path.exists(PLATE_PNG):
        raise SystemExit(f'could not decode the plate to {PLATE_PNG}')
    w, h, px = png.read(PLATE_PNG)
    if (w, h) != (CANVAS_W, CANVAS_H):
        raise SystemExit(f'the decoded plate is {w}x{h}, not {CANVAS_W}x{CANVAS_H}')
    return w, h, px


def classify(w, h, px):
    """Road, turf and sky masks.

    Hue does the work, not brightness. The dusk vignette darkens the track at
    both gates and at the exit without changing what it is, and a brightness
    floor loses those ends -- which is exactly where the branch lengths are
    measured from.

      road   warm and desaturated: red leads, blue trails, narrow gap
      turf   green-dominant with the blue channel well below it, which holds
             from sunlit grass down into deep shadow. Shadowed grass is still
             buildable ground.
      sky    blue or violet dominant: the dusk above the field.
    """
    road = bytearray(w * h)
    turf = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        if b > r and b > g:
            continue
        if r > 85 and r >= g >= b and 18 <= r - b <= 95 and g - b >= 4:
            road[i] = 1
        elif g >= r and b < g * 0.8:
            turf[i] = 1
    return road, turf


def component(w, h, mask, seed):
    """The one blob of `mask` reaching `seed`. The pale palette also matches
    concrete and bleacher fronts all over the plate; the track is the piece of
    it the lane runs down."""
    out = bytearray(w * h)
    sx, sy = seed
    if not mask[sy * w + sx]:
        for rad in range(1, 40):
            found = None
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    nx, ny = sx + dx, sy + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
                        found = (nx, ny)
                        break
                if found:
                    break
            if found:
                sx, sy = found
                break
        else:
            raise SystemExit(f'no road within 40px of {seed}')
    s = sy * w + sx
    out[s] = 1
    q = deque([s])
    while q:
        p = q.popleft()
        y, x = divmod(p, w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    n = ny * w + nx
                    if mask[n] and not out[n]:
                        out[n] = 1
                        q.append(n)
    return out, (sx, sy)


def depth(w, h, band):
    """Distance from the band's edge, for every pixel in it."""
    INF = 10 ** 9
    d = [INF] * (w * h)
    q = deque()
    for i in range(w * h):
        if not band[i]:
            continue
        y, x = divmod(i, w)
        if x == 0 or y == 0 or x == w - 1 or y == h - 1:
            d[i] = 0
            q.append(i)
            continue
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not band[(y + dy) * w + (x + dx)]:
                    d[i] = 0
                    q.append(i)
                    break
            if d[i] == 0:
                break
    while q:
        p = q.popleft()
        y, x = divmod(p, w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    n = ny * w + nx
                    if band[n] and d[n] > d[p] + 1:
                        d[n] = d[p] + 1
                        q.append(n)
    return d


def geodesic(w, h, band, deep, maxdeep, a, b):
    """The path down the middle of the band from `a` to `b`.

    Dijkstra with a Euclidean step cost and a penalty for running near the
    edge. Without the penalty the path clips every corner and the length comes
    out short; with it, it tracks the centreline the way a walker does.
    """
    INF = float('inf')
    src, dst = a[1] * w + a[0], b[1] * w + b[0]
    D = [INF] * (w * h)
    prev = {}
    D[src] = 0.0
    pq = [(0.0, src)]
    while pq:
        d, p = heapq.heappop(pq)
        if d > D[p]:
            continue
        if p == dst:
            break
        y, x = divmod(p, w)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                ny, nx = y + dy, x + dx
                if not (0 <= ny < h and 0 <= nx < w):
                    continue
                n = ny * w + nx
                if not band[n]:
                    continue
                pen = 1.0 + 2.2 * max(0.0, (maxdeep - deep[n]) / maxdeep) ** 3
                nd = d + math.hypot(dx, dy) * pen
                if nd < D[n]:
                    D[n] = nd
                    prev[n] = p
                    heapq.heappush(pq, (nd, n))
    if dst not in prev and dst != src:
        raise SystemExit('the painted track does not connect those two points')
    walk = []
    p = dst
    while p != src:
        walk.append((p % w, p // w))
        p = prev[p]
    walk.append(a)
    walk.reverse()
    # A box filter takes the stair-stepping out before anything is measured off
    # it; an unsmoothed 8-connected walk is about 3% long on the diagonals.
    k = 9
    return [(sum(q[0] for q in walk[max(0, i - k):i + k + 1]) / len(walk[max(0, i - k):i + k + 1]),
             sum(q[1] for q in walk[max(0, i - k):i + k + 1]) / len(walk[max(0, i - k):i + k + 1]))
            for i in range(len(walk))]


def polyline_length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def widths(w, h, band, line):
    """Road width sampled along a centreline, by casting normals both ways."""
    out = []
    for i in range(6, len(line) - 6, 3):
        (x0, y0), (x1, y1) = line[i - 1], line[i + 1]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L == 0:
            continue
        nx, ny = -dy / L, dx / L
        x, y = line[i]
        total = 0.0
        for s in (1, -1):
            d = 0.0
            while d < 70:
                d += 0.5
                X, Y = int(round(x + nx * s * d)), int(round(y + ny * s * d))
                if not (0 <= X < w and 0 <= Y < h) or not band[Y * w + X]:
                    break
            total += d - 0.5
        out.append(total)
    out.sort()
    return out


def median(xs):
    return xs[len(xs) // 2] if xs else 0.0


# --------------------------------------------------------------------- the pads

def point_to_polyline(p, poly):
    best = float('inf')
    for i in range(len(poly) - 1):
        ax, ay = poly[i]
        bx, by = poly[i + 1]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
        best = min(best, math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)))
    return best


def core_ground(w, h, turf, cx, cy):
    """(non-turf pixels, largest connected non-turf blob) inside a pad core."""
    inside = set()
    for dy in range(-PAD_CORE_RADIUS, PAD_CORE_RADIUS + 1):
        for dx in range(-PAD_CORE_RADIUS, PAD_CORE_RADIUS + 1):
            if dx * dx + dy * dy > PAD_CORE_RADIUS * PAD_CORE_RADIUS:
                continue
            X, Y = int(round(cx + dx)), int(round(cy + dy))
            if 0 <= X < w and 0 <= Y < h and not turf[Y * w + X]:
                inside.add((X, Y))
    biggest, seen = 0, set()
    for p in inside:
        if p in seen:
            continue
        comp, q = 0, deque([p])
        seen.add(p)
        while q:
            x, y = q.popleft()
            comp += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    n = (x + dx, y + dy)
                    if n in inside and n not in seen:
                        seen.add(n)
                        q.append(n)
        biggest = max(biggest, comp)
    return len(inside), biggest


def write_overlay(w, h, px, lanes, pads, path):
    """The plate with the traced lanes and the pad cores drawn on it, so the
    placement can be looked at rather than only totted up."""
    out = bytearray(px)

    def dot(x, y, rgb, r=1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x + dx)), int(round(y + dy))
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    out[i], out[i + 1], out[i + 2] = rgb

    colours = {'upper': (0, 255, 255), 'lower': (255, 140, 0), 'shared': (255, 60, 255)}
    for name, line in lanes.items():
        for x, y in line:
            dot(x, y, colours[name], 1)
    for n, (cx, cy) in enumerate(pads, 1):
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (60, 255, 60), 0)
        dot(cx, cy, (255, 255, 255), 2)
    png.write(path, w, h, out)


# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay', action='store_true', help='write the pad overlay PNG')
    args = ap.parse_args()

    g = json.load(open(GEOMETRY))
    m = json.load(open(MAP))
    problems = []

    w, h, px = plate()
    road, turf = classify(w, h, px)
    merge = (int(round(g['merge'][0])), int(round(g['merge'][1])))
    band, _ = component(w, h, road, merge)
    deep = depth(w, h, band)
    maxdeep = max(d for d in deep if d < 10 ** 9)

    def snap(pt):
        x, y = int(round(pt[0])), int(round(pt[1]))
        x, y = max(0, min(w - 1, x)), max(0, min(h - 1, y))
        if band[y * w + x]:
            return (x, y)
        for rad in range(1, 60):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and band[ny * w + nx]:
                        return (nx, ny)
        raise SystemExit(f'no painted track within 60px of {pt}')

    print('--- the lanes, traced off the plate ---')
    ends = {'upper': (g['upper'][0], g['merge']),
            'lower': (g['lower'][0], g['merge']),
            'shared': (g['merge'], g['shared'][-1])}
    lanes = {}
    for name, (a, b) in ends.items():
        lanes[name] = geodesic(w, h, band, deep, maxdeep, snap(a), snap(b))
    tail = polyline_length(lanes['shared'])
    for name in ('upper', 'lower'):
        traced = polyline_length(lanes[name]) + tail
        declared = g['lengths'][name]
        off = abs(traced - declared) / declared
        flag = '' if off <= TOLERANCE else f'   <-- more than {TOLERANCE:.0%}'
        print(f'  {name:7s} route  traced {traced:7.1f}  geometry {declared:7.1f}  '
              f'{off * 100:5.2f}%{flag}')
        if off > TOLERANCE:
            problems.append(f'the {name} route traces {traced:.1f} against the geometry file\'s '
                            f'{declared:.1f}, {off * 100:.2f}% out')
    print(f'  shared tail   traced {tail:7.1f}')

    print('\n--- road width ---')
    per_lane = {name: median(widths(w, h, band, line)) for name, line in lanes.items()}
    for name, v in per_lane.items():
        print(f'  {name:7s} median {v:5.1f}')
    derived = min(per_lane.values())
    declared = g['roadWidth']
    off = abs(derived - declared) / declared
    print(f'  narrowest lane {derived:.1f}  geometry {declared}  {off * 100:.2f}%')
    if off > TOLERANCE:
        problems.append(f'the narrowest lane measures {derived:.1f} against the geometry file\'s '
                        f'{declared}, {off * 100:.2f}% out')
    if m['roadWidth'] != declared:
        problems.append(f'map_level3.json records roadWidth {m["roadWidth"]}, the geometry file '
                        f'{declared}')

    print('\n--- the pads ---')
    pads = [tuple(p) for p in g['pads']]
    if [list(p) for p in pads] != [list(p) for p in m['buildSpots']]:
        problems.append('map_level3.json\'s buildSpots are not the geometry file\'s pads')
    routes = [[tuple(p) for p in g['upper']], [tuple(p) for p in g['lower']],
              [tuple(p) for p in g['shared']]]
    print(f'  {"pad":>3} {"x":>7} {"y":>6} {"to lane":>8} {"nearest pad":>12} '
          f'{"core off-turf":>14}')
    for n, (cx, cy) in enumerate(pads, 1):
        d = min(point_to_polyline((cx, cy), r) for r in routes)
        near = min(math.dist((cx, cy), q) for q in pads if q != (cx, cy))
        off_turf, blob = core_ground(w, h, turf, cx, cy)
        flags = []
        if not (PAD_MIN_FROM_LANE <= d <= PAD_MAX_FROM_LANE):
            flags.append(f'{d:.1f} outside {PAD_MIN_FROM_LANE:.0f}-{PAD_MAX_FROM_LANE:.0f}')
        if near < PAD_MIN_SPACING - 1e-6:
            flags.append(f'{near:.1f} from its neighbour, under {PAD_MIN_SPACING:.0f}')
        if blob >= MIN_OBSTRUCTION_BLOB:
            flags.append(f'a {blob}px object in its core')
        print(f'  {n:3d} {cx:7.1f} {cy:6.1f} {d:8.1f} {near:12.1f} '
              f'{off_turf:6d}px/{blob:3d} blob {"  <-- " + "; ".join(flags) if flags else ""}')
        for f in flags:
            problems.append(f'pad {n}: {f}')

    if len(pads) != 15:
        problems.append(f'{len(pads)} pads, not 15')

    if args.overlay:
        write_overlay(w, h, px, lanes, pads, OVERLAY_OUT)
        print(f'\noverlay written to {os.path.relpath(OVERLAY_OUT, ROOT)}')

    print()
    if problems:
        print(f'{len(problems)} DISAGREEMENT(S):')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)
    print('the plate, the geometry file and map_level3.json agree.')


if __name__ == '__main__':
    main()
