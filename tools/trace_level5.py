"""Derive level 5's lanes, road width and build pads from the painted plate.

    python3 tools/trace_level5.py                 # prints the geometry as JSON
    python3 tools/trace_level5.py --overlay tools/L5_pads_overlay.png

Levels 3 and 4 arrived as a geometry file alongside their plate and their
scripts only had to CHECK it. Level 5's plate arrived on its own, so this
traces it the way tools/trace_map.py traced level 1: classify every pixel,
find the painted road, walk it, and put the pads on ground that will take one.

WHAT THE PLATE ACTUALLY IS, because it is not what the brief describes. The
brief says two roads in from the left and two out to the right. The painting is
a FOUR-ARM CROSSROADS: one road in from the west, one down from the north, one
up from the south, and ONE out to the east through a gap in the castle wall.
The three western arms are all on the night side of the seam and the eastern
one runs into the daylit town. That is read off the road mask below -- each
edge is reported with the rows or columns the road touches it on -- rather than
argued about, and it is why map_level5.json has three gates and one exit.

THE MASK IS BUILT AT CANVAS RESOLUTION, 1280x720, because the map's coordinate
space is the canvas and the plate ships at 1.5x it. Every distance printed is
therefore already in the units map_level5.json wants.

THREE GROUNDS, not two. This plate is a night graveyard on the left and a
daylit meadow on the right, and a classifier tuned to one calls the other
blocked:

  road   warm sand: r > g > b, a wide red-green gap, and bright. The sunset
         sky at the top right is the one other thing in that band, so the road
         is taken as the largest connected component and the sky drops out.

  turf   buildable ground, and there are two kinds. DAY TURF is the yellow-
         green meadow: green the top channel, well above blue. NIGHT TURF is
         the indigo field: BLUE the top channel and red the bottom -- b > g > r
         -- which is the ordering that had to be measured rather than guessed.
         The first cut of this classifier asked for r >= g on the night side,
         which is what a purple field looks like if you have not sampled one,
         and it called the entire graveyard blocked: 25,182 night pixels
         against the 145,000 that are actually there, and all fourteen pads
         landed on the meadow. Both kinds take a tower.

  blocked  everything else -- crypts, tombstones, railings, dead trees, firs,
         rocks, bushes, pumpkins, the castle walls and their banners, the
         ground mist. A pad's core has to be clear of all of it.

Nothing at runtime depends on this. It is the record of where map_level5.json
came from and how to redo it when the art changes.
"""

import argparse
import heapq
import json
import math
import os
import struct
import sys
import zlib
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import img  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'art-source/l5_board.png')

# The plate fills a 1280x720 canvas whatever its own size, so canvas pixels are
# the map's coordinate space and the mask is built directly in them.
CANVAS_W, CANVAS_H = 1280, 720

ROAD, DAY, NIGHT, BLOCK = 1, 2, 3, 0
TURF = (DAY, NIGHT)

# What a pad needs, all in canvas pixels and all taken from level 4, which is
# the level this one is meant to be difficulty-comparable to.
PAD_CORE = 24          # the pad's own footprint, which must be clear ground
TOWER_RANGE = 112      # the shortest range in the tower pool
PAD_MIN_FROM_LANE = 46  # off the paint, with room for the base
PAD_MAX_FROM_LANE = TOWER_RANGE - 2
PAD_SPACING = 68       # 2 x spotRadius, so two tap targets never overlap
SPOT_RADIUS = 34


# --------------------------------------------------------------- classify

def classify(path):
    """Road, day turf, night turf or blocked, at canvas resolution."""
    w, h, px = img.read(path)
    kind = bytearray(CANVAS_W * CANVAS_H)
    for y in range(CANVAS_H):
        sy = min(h - 1, int(y * h / CANVAS_H))
        row = sy * w
        for x in range(CANVAS_W):
            sx = min(w - 1, int(x * w / CANVAS_W))
            i = (row + sx) * 4
            r, g, b = px[i], px[i + 1], px[i + 2]
            lum = (r + g + b) // 3
            if r > g > b and r - g >= 45 and lum > 90:
                k = ROAD
            elif g > r and g - b >= 30 and lum > 40:
                k = DAY
            elif b > g > r and b - g >= 40 and 20 < lum < 125:
                k = NIGHT
            else:
                k = BLOCK
            kind[y * CANVAS_W + x] = k
    return kind


def despeckle(kind, max_area):
    """Swallow small blobs into whatever surrounds them.

    The painting has texture and the classifier sees it: the road is scattered
    with pebbles, the meadow with heather, and the night field with mist. A raw
    mask is a road full of holes and two fields full of dots, and a hole in the
    road derails a geodesic that is trying to stay in the middle of it.
    """
    seen = bytearray(len(kind))
    for start in range(len(kind)):
        if seen[start]:
            continue
        k = kind[start]
        q = deque([start])
        seen[start] = 1
        blob = []
        edge = {}
        while q:
            i = q.popleft()
            blob.append(i)
            x, y = i % CANVAS_W, i // CANVAS_W
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < CANVAS_W and 0 <= ny < CANVAS_H):
                    continue
                j = ny * CANVAS_W + nx
                if kind[j] == k:
                    if not seen[j]:
                        seen[j] = 1
                        q.append(j)
                else:
                    edge[kind[j]] = edge.get(kind[j], 0) + 1
            if len(blob) > max_area:
                break
        if len(blob) <= max_area and edge:
            into = max(edge, key=lambda t: edge[t])
            for i in blob:
                kind[i] = into
    return kind


def largest(kind, want):
    """The biggest connected run of one kind, as a 0/1 mask.

    The sunset behind the castle sits in the road's colour band and nothing
    short of geometry separates them. It is not connected to the road, so this
    does.
    """
    seen = bytearray(len(kind))
    best = []
    for start in range(len(kind)):
        if kind[start] != want or seen[start]:
            continue
        q = deque([start])
        seen[start] = 1
        comp = []
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % CANVAS_W, i // CANVAS_W
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < CANVAS_W and 0 <= ny < CANVAS_H:
                    j = ny * CANVAS_W + nx
                    if kind[j] == want and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        if len(comp) > len(best):
            best = comp
    out = bytearray(len(kind))
    for i in best:
        out[i] = 1
    return out


# ---------------------------------------------------------------- distances

def distance_transform(mask, inside=1):
    """Chamfer distance from every `inside` pixel to the nearest that is not.

    Two passes rather than an exact Euclidean transform: the numbers are used
    to keep a path in the middle of the road and to hold a pad off the paint,
    and a percent of error in either is not visible on a 50 px road.
    """
    INF = 1 << 20
    d = [0 if mask[i] != inside else INF for i in range(len(mask))]
    for y in range(CANVAS_H):
        for x in range(CANVAS_W):
            i = y * CANVAS_W + x
            if d[i] == 0:
                continue
            best = d[i]
            if x: best = min(best, d[i - 1] + 5)
            if y: best = min(best, d[i - CANVAS_W] + 5)
            if x and y: best = min(best, d[i - CANVAS_W - 1] + 7)
            if x + 1 < CANVAS_W and y: best = min(best, d[i - CANVAS_W + 1] + 7)
            d[i] = best
    for y in range(CANVAS_H - 1, -1, -1):
        for x in range(CANVAS_W - 1, -1, -1):
            i = y * CANVAS_W + x
            if d[i] == 0:
                continue
            best = d[i]
            if x + 1 < CANVAS_W: best = min(best, d[i + 1] + 5)
            if y + 1 < CANVAS_H: best = min(best, d[i + CANVAS_W] + 5)
            if x + 1 < CANVAS_W and y + 1 < CANVAS_H: best = min(best, d[i + CANVAS_W + 1] + 7)
            if x and y + 1 < CANVAS_H: best = min(best, d[i + CANVAS_W - 1] + 7)
            d[i] = best
    return [v / 5.0 for v in d]


# ------------------------------------------------------------------ tracing

def edge_openings(road):
    """Where the road meets each edge of the plate, as runs of pixels."""
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                out.append((s, i - 1))
                s = None
        return out
    return {
        'west': runs(road[y * CANVAS_W] for y in range(CANVAS_H)),
        'east': runs(road[y * CANVAS_W + CANVAS_W - 1] for y in range(CANVAS_H)),
        'north': runs(road[x] for x in range(CANVAS_W)),
        'south': runs(road[(CANVAS_H - 1) * CANVAS_W + x] for x in range(CANVAS_W)),
    }


def widest_point(road, dist):
    """The middle of the crossroads: the road pixel furthest from any edge of it."""
    best, at = -1, 0
    for i in range(len(road)):
        if road[i] and dist[i] > best:
            best, at = dist[i], i
    return (at % CANVAS_W, at // CANVAS_W), best


def geodesic(road, dist, start, goal):
    """A path down the MIDDLE of the painted band, start to goal.

    Dijkstra with a cost that rises steeply as a pixel approaches the edge of
    the road, so the cheapest route is the centreline rather than the shortest
    chord. Without that a path around a bend cuts the corner and leaves the
    paint, which is exactly what a player would notice first.
    """
    INF = float('inf')
    best = [INF] * len(road)
    prev = [-1] * len(road)
    s = start[1] * CANVAS_W + start[0]
    g = goal[1] * CANVAS_W + goal[0]
    best[s] = 0.0
    q = [(0.0, s)]
    while q:
        c, i = heapq.heappop(q)
        if c > best[i]:
            continue
        if i == g:
            break
        x, y = i % CANVAS_W, i // CANVAS_W
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < CANVAS_W and 0 <= ny < CANVAS_H):
                continue
            j = ny * CANVAS_W + nx
            if not road[j]:
                continue
            step = math.hypot(dx, dy)
            # 1 in the middle of the road, rising sharply at its edge.
            hug = 1.0 + 24.0 / max(1.0, dist[j])
            nc = c + step * hug
            if nc < best[j]:
                best[j] = nc
                prev[j] = i
                heapq.heappush(q, (nc, j))
    if best[g] == INF:
        return None
    out, i = [], g
    while i != -1:
        out.append((i % CANVAS_W, i // CANVAS_W))
        i = prev[i]
    return out[::-1]


def simplify(pts, eps):
    """Douglas-Peucker, so a 700-pixel walk becomes a readable waypoint list."""
    if len(pts) < 3:
        return list(pts)
    a, b = pts[0], pts[-1]
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    worst, at = -1.0, 0
    for i in range(1, len(pts) - 1):
        px_, py_ = pts[i]
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / L))
        d = math.hypot(px_ - (ax + t * dx), py_ - (ay + t * dy))
        if d > worst:
            worst, at = d, i
    if worst <= eps:
        return [a, b]
    return simplify(pts[:at + 1], eps)[:-1] + simplify(pts[at:], eps)


def lane_width(road, line, skip=None, skip_r=0.0):
    """The painted road's width along a centreline: the median of its normals.

    Cast across the band at every sampled point and measure how far the paint
    runs each way. The median rather than the mean, so the junction -- which is
    four roads wide -- cannot drag a lane's figure up.
    """
    widths = []
    for k in range(1, len(line) - 1):
        # THE JUNCTION IS NOT A LANE and must not be measured as one: four
        # roads meeting is 150 px of paint across, and a handful of those
        # samples drags a short lane's median right up. The south arm read 85
        # against its true 62 before this line existed.
        if skip is not None and math.hypot(line[k][0] - skip[0], line[k][1] - skip[1]) < skip_r:
            continue
        (x0, y0), (x1, y1) = line[k - 1], line[k + 1]
        L = math.hypot(x1 - x0, y1 - y0)
        if L == 0:
            continue
        nx, ny = -(y1 - y0) / L, (x1 - x0) / L
        cx, cy = line[k]
        total = 0
        for sgn in (1, -1):
            for t in range(1, 200):
                px_, py_ = int(round(cx + nx * sgn * t)), int(round(cy + ny * sgn * t))
                if not (0 <= px_ < CANVAS_W and 0 <= py_ < CANVAS_H):
                    break
                if not road[py_ * CANVAS_W + px_]:
                    break
                total += 1
        widths.append(total + 1)
    widths.sort()
    return widths[len(widths) // 2] if widths else 0


def path_length(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
               for i in range(1, len(pts)))


# --------------------------------------------------------------------- pads

def dist_to_lines(lines):
    """Distance from every canvas pixel to the nearest lane centreline."""
    INF = float('inf')
    best = [INF] * (CANVAS_W * CANVAS_H)
    q = []
    for line in lines:
        for (x, y) in line:
            i = y * CANVAS_W + x
            if best[i] > 0:
                best[i] = 0.0
                q.append(i)
    # A simple multi-source chamfer, same two passes as the transform above.
    d = [0.0 if best[i] == 0 else 1e9 for i in range(len(best))]
    for y in range(CANVAS_H):
        for x in range(CANVAS_W):
            i = y * CANVAS_W + x
            v = d[i]
            if x: v = min(v, d[i - 1] + 1)
            if y: v = min(v, d[i - CANVAS_W] + 1)
            if x and y: v = min(v, d[i - CANVAS_W - 1] + 1.41421356)
            if x + 1 < CANVAS_W and y: v = min(v, d[i - CANVAS_W + 1] + 1.41421356)
            d[i] = v
    for y in range(CANVAS_H - 1, -1, -1):
        for x in range(CANVAS_W - 1, -1, -1):
            i = y * CANVAS_W + x
            v = d[i]
            if x + 1 < CANVAS_W: v = min(v, d[i + 1] + 1)
            if y + 1 < CANVAS_H: v = min(v, d[i + CANVAS_W] + 1)
            if x + 1 < CANVAS_W and y + 1 < CANVAS_H: v = min(v, d[i + CANVAS_W + 1] + 1.41421356)
            if x and y + 1 < CANVAS_H: v = min(v, d[i + CANVAS_W - 1] + 1.41421356)
            d[i] = v
    return d


def pick_pads(kind, clear, to_lane, junction, lines, want):
    """`want` pads on ground that takes one: the crossroads first, then reach.

    TWO PROPERTIES, IN ORDER, and the order is the design.

    FIRST, THE CROSSROADS IS CONTESTABLE FROM BOTH HALVES. `NEAR_FLOOR` pads
    per half are placed within `NEAR` of the junction before anything else
    competes for a slot, and the halves are the plate's own two grounds -- the
    graveyard's indigo and the meadow's green. A single greedy sweep ordered by
    distance to the junction does NOT give this: it takes whichever half has
    the more open ground beside it and leaves the other with nothing, and on
    this plate the meadow wins that outright.

    SECOND, THE ARMS ARE NOT LEFT BARE. The remaining slots go to whichever
    candidate adds the most UNCOVERED lane to the board -- a greedy set cover
    over the four centrelines at tower range. Without it all fourteen sit in a
    ring around the junction and a wave walks 660 px of the west arm without
    ever being in range of anything, which is not a defence, it is a bottleneck
    with a lot of scenery.
    """
    NEAR = 260
    NEAR_FLOOR = 4
    cand = []
    for y in range(PAD_CORE, CANVAS_H - PAD_CORE):
        for x in range(PAD_CORE, CANVAS_W - PAD_CORE):
            i = y * CANVAS_W + x
            if kind[i] not in TURF:
                continue
            if clear[i] < PAD_CORE / 2:
                continue
            d = to_lane[i]
            if not (PAD_MIN_FROM_LANE <= d <= PAD_MAX_FROM_LANE):
                continue
            jd = math.hypot(x - junction[0], y - junction[1])
            cand.append((jd - clear[i] * 2.0, x, y, kind[i]))
    cand.sort()

    taken = []

    def fits(x, y):
        return not any(math.hypot(x - px_, y - py_) < PAD_SPACING for px_, py_ in taken)

    for side in (NIGHT, DAY):
        n = 0
        for _score, x, y, k in cand:
            if n >= NEAR_FLOOR:
                break
            if k != side or _score > NEAR or not fits(x, y):
                continue
            taken.append((x, y))
            n += 1

    # Every centreline as a list of points, so "covered" is a length rather
    # than a count of waypoints -- the arms are sampled a pixel apart already.
    pts = [(px_, py_) for line in lines.values() for px_, py_ in line]
    covered = [False] * len(pts)
    for (x, y) in taken:
        for i, (px_, py_) in enumerate(pts):
            if not covered[i] and math.hypot(x - px_, y - py_) <= TOWER_RANGE:
                covered[i] = True
    while len(taken) < want:
        best, at = 0, None
        for _score, x, y, _k in cand:
            if not fits(x, y):
                continue
            gain = sum(1 for i, (px_, py_) in enumerate(pts)
                       if not covered[i] and math.hypot(x - px_, y - py_) <= TOWER_RANGE)
            if gain > best:
                best, at = gain, (x, y)
        if at is None:
            # Nothing adds reach: fall back to the next pad that simply fits,
            # so a full board is still a full board.
            for _score, x, y, _k in cand:
                if fits(x, y):
                    at = (x, y)
                    break
        if at is None:
            break
        taken.append(at)
        for i, (px_, py_) in enumerate(pts):
            if not covered[i] and math.hypot(at[0] - px_, at[1] - py_) <= TOWER_RANGE:
                covered[i] = True
    return taken[:want]


def coverage(pads, lines):
    """How much of each lane is inside some pad's tower range, as a fraction."""
    out = {}
    for name, line in lines.items():
        n = sum(1 for (px_, py_) in line
                if any(math.hypot(x - px_, y - py_) <= TOWER_RANGE for x, y in pads))
        out[name] = round(n / max(1, len(line)), 3)
    return out


# ------------------------------------------------------------------ overlay

def write_overlay(path, waypoints, pads):
    w, h, px = img.read(PLATE)
    buf = bytearray(px)

    def put(x, y, c):
        sx, sy = int(x * w / CANVAS_W), int(y * h / CANVAS_H)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                X, Y = sx + dx, sy + dy
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    buf[i], buf[i + 1], buf[i + 2] = c
    for name, line in waypoints.items():
        c = {'west': (255, 60, 60), 'north': (60, 255, 60), 'south': (60, 160, 255),
             'east': (255, 240, 60)}.get(name, (255, 255, 255))
        for k in range(1, len(line)):
            (x0, y0), (x1, y1) = line[k - 1], line[k]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            for t in range(steps + 1):
                put(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps, c)
    for (x, y) in pads:
        for a in range(0, 360, 3):
            put(x + SPOT_RADIUS * math.cos(math.radians(a)),
                y + SPOT_RADIUS * math.sin(math.radians(a)), (255, 255, 255))
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += buf[y * w * 4:(y + 1) * w * 4]

    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c))
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 6))
        + chunk(b'IEND', b''))


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay')
    ap.add_argument('--out', default='tools/level5_geometry.json')
    ap.add_argument('--pads', type=int, default=14)
    args = ap.parse_args()

    kind = despeckle(classify(PLATE), 90)
    road = largest(kind, ROAD)
    print(f'road pixels {sum(road)}')

    openings = edge_openings(road)
    for name, runs in openings.items():
        print(f'  {name:6s} touches the edge at {runs}')

    rdist = distance_transform(road)
    junction, jr = widest_point(road, rdist)
    print(f'junction at {junction}, half-width {jr:.1f}')

    gates = {}
    for name, runs in openings.items():
        if not runs:
            continue
        run = max(runs, key=lambda r: r[1] - r[0])
        mid = (run[0] + run[1]) // 2
        gates[name] = (0, mid) if name == 'west' else \
                      (CANVAS_W - 1, mid) if name == 'east' else \
                      (mid, 0) if name == 'north' else (mid, CANVAS_H - 1)

    lines, simple = {}, {}
    for name, at in gates.items():
        # East is traced FROM the junction so every lane runs the way an enemy
        # walks it: the three gates run inward and the exit runs outward.
        a, b = (junction, at) if name == 'east' else (at, junction)
        path = geodesic(road, rdist, a, b)
        if path is None:
            print(f'  {name}: NO PATH')
            continue
        lines[name] = path
        simple[name] = simplify(path, 1.2)
        print(f'  {name:6s} {len(path)} px walked, {path_length(path):.1f} long, '
              f'{len(simple[name])} waypoints, '
              f'width {lane_width(road, path, junction, jr * 1.6)}')

    widths = {n: lane_width(road, l, junction, jr * 1.6) for n, l in lines.items()}
    print(f'road width (narrowest lane median): {min(widths.values())}  {widths}')

    clear = distance_transform(bytearray(1 if kind[i] in TURF else 0
                                         for i in range(len(kind))))
    to_lane = dist_to_lines(list(lines.values()))
    pads = pick_pads(kind, clear, to_lane, junction, lines, args.pads)
    print(f'pads placed: {len(pads)} of {args.pads}')
    for i, (x, y) in enumerate(pads):
        near = min(math.hypot(x - px_, y - py_) for _n, l in lines.items() for px_, py_ in l)
        print(f'  pad {i:2d} ({x:4d},{y:4d})  {near:5.1f} from a lane, '
              f'{clear[y * CANVAS_W + x]:5.1f} clear, '
              f'{"day" if kind[y * CANVAS_W + x] == DAY else "night"}')
    if len(pads) > 1:
        closest = min(math.hypot(a[0] - b[0], a[1] - b[1])
                      for i, a in enumerate(pads) for b in pads[i + 1:])
        print(f'closest pair: {closest:.2f} px (needs >= {PAD_SPACING})')
    cov = coverage(pads, lines)
    total = sum(len(l) for l in lines.values())
    hit = sum(cov[n] * len(lines[n]) for n in cov)
    print(f'lane coverage {cov}  whole route {hit / total:.1%}')
    print(f'halves: {sum(1 for x, y in pads if kind[y * CANVAS_W + x] == NIGHT)} night, '
          f'{sum(1 for x, y in pads if kind[y * CANVAS_W + x] == DAY)} day')

    out = {
        'junction': list(junction),
        'roadWidth': min(widths.values()),
        'lanes': {n: [[round(x, 2), round(y, 2)] for x, y in simple[n]] for n in simple},
        'laneLengths': {n: round(path_length(lines[n]), 2) for n in lines},
        # The length of the SIMPLIFIED line, which is what map_level5.json
        # actually carries and therefore what an enemy actually walks. It is
        # shorter than the traced walk by whatever Douglas-Peucker cut off the
        # corners, and the gap is the honest measure of how much the waypoint
        # list costs: at eps 1.2 it is under half a percent on every arm.
        'simpleLengths': {n: round(path_length(simple[n]), 2) for n in simple},
        'buildSpots': [[x, y] for x, y in pads],
        'coverage': coverage(pads, lines),
    }
    json.dump(out, open(os.path.join(ROOT, args.out), 'w'), indent=1)
    print(f'wrote {args.out}')
    if args.overlay:
        write_overlay(os.path.join(ROOT, args.overlay), simple, pads)
        print(f'wrote {args.overlay}')


if __name__ == '__main__':
    main()
