"""Derive level 9's trace, trace width and build pads from the painted plate.

    python3 tools/trace_level9.py --overlay tools/L9_pads_overlay.png

Level 9 is the inside of a computer: a circuit board seen from directly above.
The enemy path is a glowing CYAN CIRCUIT TRACE over a dark blue substrate, and
the buildable positions are the FLAT GREY CHIPS scattered across the board.
Everything else -- capacitors, small black ICs, the RAM stick, the fan, the
cooling tower and the purple data bloom at the edges -- is scenery.

This is tools/trace_level8.py's method, which is tools/trace_map.py's: classify
every pixel, take the largest connected run of the path colour, walk a geodesic
down the MIDDLE of the painted band rather than the shortest chord, and put the
pads on ground that will take one. Nothing here is traced or typed by hand --
including the junctions, which earlier levels declared as literals and this one
derives (see `nodes`).

FOUR THINGS ABOUT THIS PLATE THAT ARE NOT WHAT THE BRIEF SAYS, all four checked
rather than assumed, and all four printed by this script:

  THE BOARD HAS ONE FRAME OPENING, NOT TWO. The brief asks for two entrances on
  the west edge, at 41-49% and 81-84% of the height. There IS cyan on the west
  edge in both bands, which is why an external measurement found two. Only the
  first belongs to the trace: at plate resolution the second is a 165-pixel
  sliver two columns wide, the leftmost vent slot of the COOLING TOWER clipped
  by the frame, and it is not connected to the trace at either resolution.

  THE TRACE FORKS AND REJOINS. The brief says one path, no forks, no branches.
  The painted band encloses one region of 140,948 canvas px, which is a cycle:
  it splits just inside the west opening and the two arms meet again at the
  bottom of the board. `--audit` prints the enclosed regions it found.

  THERE IS A DEAD-END SPUR. A fifth terminal, an interior one, where a rounded
  cap of trace ends on open substrate near (897, 566). Nothing would ever walk
  it as the board stands. It is reported, not removed.

  THE EXIT IS NOT ON A FRAME EDGE, which the brief does say and which is the
  one place this agrees with it: the trace ends at a door in the machine
  housing on the right, about 100 px short of the frame.

Nothing at runtime depends on this. It is the record of where
tools/level9_geometry.json came from and how to redo it when the art changes.
"""

import argparse
import heapq
import json
import math
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import img                                                          # noqa: E402
import png                                                          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'art-source/level9/map_level9.png')
CANVAS_W, CANVAS_H = 1280, 720

# THE SHORTEST RANGE IN THE TOWER POOL, READ OUT OF THE POOL.
#
# tools/trace_level6.py through _level8.py each carry `TOWER_RANGE = 112` with
# the comment "the shortest range in the tower pool", and src/data/towers.json
# today says the shortest attacking range is the Rounding Error's 132 -- the
# Shelter is 0 because it is an aura and shoots nothing. 112 is a figure that
# went stale without anybody noticing, which is exactly what CLAUDE.md's first
# hard rule exists to stop, so this reads the file. The old number is kept
# beside it and both are reported: every coverage figure for levels 6, 7 and 8
# was measured at 112 and comparing across levels needs the same ruler.
def shortest_tower_range():
    towers = json.load(open(os.path.join(ROOT, 'src/data/towers.json')))
    return min(v['range'] for k, v in towers.items()
               if not k.startswith('_') and isinstance(v, dict)
               and isinstance(v.get('range'), (int, float)) and v['range'] > 0)


LEGACY_TOWER_RANGE = 112
SPOT_RADIUS = 34        # every other level's; 44.8 CSS px of tap target at 1280->844
PAD_CORE_RADIUS = 24

# A grey chip has to be at least this big to be one. The gap in the measured
# distribution is enormous -- the fifteenth chip is 3,675 px and the next
# largest neutral-grey blob on the whole board is 280 -- so this is a threshold
# with a factor of thirteen of daylight either side of it, not a tuned number.
MIN_CHIP_AREA = 2000

# THE FOUR BUILD-NODE VARIANTS, which no other level has. Not wired up by this
# pass and not sized here: the ink extents are read off the files so that the
# suggestion below is a measurement rather than a look, and the sizing rule is
# stated in the report -- a node is fitted to the CHIP it sits on, not drawn at
# its own size, because these are about 300 world px at plate scale and the
# painted chips average 81 x 75.
NODE_ART = ('node_chip_square', 'node_chip_ram', 'node_chip_fan', 'node_chip_cabled')

# Two stretches of route count as separate passes only if this much route
# distance separates them. Without it the apex of a hairpin, where the road
# curls continuously round a pad, would score as two.
PASS_GAP = LEGACY_TOWER_RANGE


# ----------------------------------------------------------------- the plate

def plate():
    """The plate POINT-SAMPLED to canvas resolution.

    One source pixel per canvas pixel, deliberately: tools/check_level9.py
    box-filters the same plate instead, so the two disagree on every
    antialiased edge in the picture and an edge only one of them can find is
    an edge neither should be trusting.
    """
    w, h, px = img.read(PLATE)
    print(f'plate {os.path.relpath(PLATE, ROOT)}  {w}x{h} -> '
          f'{CANVAS_W}x{CANVAS_H} point-sampled')
    out = bytearray(CANVAS_W * CANVAS_H * 4)
    for y in range(CANVAS_H):
        sy = (y * h) // CANVAS_H
        for x in range(CANVAS_W):
            i = (sy * w + (x * w) // CANVAS_W) * 4
            o = (y * CANVAS_W + x) * 4
            out[o:o + 4] = px[i:i + 4]
    return CANVAS_W, CANVAS_H, out


def classify(w, h, px):
    """The cyan trace mask and the flat-grey chip mask.

      trace   The glow is a saturated cyan: green and blue both high, red far
              below them. `r < g - 60` is what keeps the pale grey chip faces
              out, and `b >= 170` keeps out the mid-blue substrate, which is
              green-poor rather than red-poor.

      chip    NEUTRAL GREY, which is the one thing on this board that nothing
              else is. Everything painted on the substrate is strongly tinted
              -- the board blue, the trace cyan, the RAM green, the bloom
              purple, the capacitor tops blue-black -- so a channel spread of
              28 or less at mid luminance picks the chip faces and their
              bevels out and leaves the rest behind. The lightest thing it
              could confuse a chip with is the fan hub and the cooling tower's
              metalwork; both are outside the frame the pads are chosen from
              and both are far under MIN_CHIP_AREA anyway.
    """
    trace = bytearray(w * h)
    chip = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        if g >= 150 and b >= 170 and r < g - 60:
            trace[i] = 1
        elif max(r, g, b) - min(r, g, b) <= 28 and 70 <= (r + g + b) // 3 <= 190:
            chip[i] = 1
    return trace, chip


# ------------------------------------------------------------------- regions

def components(w, h, mask, connectivity=4):
    """Every connected run of `mask`, as lists of pixel indices, largest first."""
    steps = ((1, 0), (-1, 0), (0, 1), (0, -1)) if connectivity == 4 else (
        (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))
    seen = bytearray(w * h)
    out = []
    for s in range(w * h):
        if not mask[s] or seen[s]:
            continue
        q = deque([s])
        seen[s] = 1
        pts = [s]
        while q:
            i = q.popleft()
            x, y = i % w, i // w
            for dx, dy in steps:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
                        pts.append(j)
        out.append(pts)
    out.sort(key=len, reverse=True)
    return out


def as_mask(w, h, pts):
    m = bytearray(w * h)
    for i in pts:
        m[i] = 1
    return m


def bbox(w, pts):
    xs = [i % w for i in pts]
    ys = [i // w for i in pts]
    return min(xs), min(ys), max(xs), max(ys)


def holes(w, h, mask):
    """Every region of the complement that does not touch the frame."""
    comp = bytearray(1 - mask[i] for i in range(w * h))
    out = []
    for pts in components(w, h, comp):
        if all(not (i % w in (0, w - 1) or i // w in (0, h - 1)) for i in pts):
            out.append(pts)
    return out


def fill_speckle(w, h, mask, max_area):
    """Closes pinholes inside the band, and NOTHING larger.

    The band encloses a region of 140,948 px -- that is the cycle, the whole
    finding this level turns on -- so a plain hole fill would swallow it and
    leave a solid blob with no topology at all. The cap is three orders of
    magnitude below it and one above the largest pinhole.
    """
    out = bytearray(mask)
    filled = 0
    for pts in holes(w, h, mask):
        if len(pts) <= max_area:
            for i in pts:
                out[i] = 1
            filled += len(pts)
    return out, filled


# ----------------------------------------------------------------- distances

def depth(w, h, band):
    """Distance from the band's edge, for every pixel in it. Level 4's."""
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


def geodesic_field(w, h, band, seeds):
    """Shortest walking distance inside the band from any of `seeds`, in px.

    Integer 5/7 chamfer weights on an 8-neighbourhood, divided out at the end:
    exact Euclidean is not needed for "which end of the board is this" and the
    chamfer is a tenth of the cost.
    """
    INF = 10 ** 9
    D = [INF] * (w * h)
    pq = []
    for i in seeds:
        if band[i]:
            D[i] = 0
            pq.append((0, i))
    heapq.heapify(pq)
    while pq:
        d, i = heapq.heappop(pq)
        if d > D[i]:
            continue
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                       (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            j = ny * w + nx
            if not band[j]:
                continue
            nd = d + (7 if dx and dy else 5)
            if nd < D[j]:
                D[j] = nd
                heapq.heappush(pq, (nd, j))
    return [(v / 5.0 if v < INF else float('inf')) for v in D]


def geodesic(w, h, band, deep, maxdeep, a, b):
    """The path down the MIDDLE of the band from `a` to `b`. Level 4's."""
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
        raise SystemExit(f'the painted trace does not connect {a} to {b}')
    walk = []
    p = dst
    while p != src:
        walk.append((p % w, p // w))
        p = prev[p]
    walk.append(a)
    walk.reverse()
    k = 9
    return [(sum(q[0] for q in walk[max(0, i - k):i + k + 1]) / len(walk[max(0, i - k):i + k + 1]),
             sum(q[1] for q in walk[max(0, i - k):i + k + 1]) / len(walk[max(0, i - k):i + k + 1]))
            for i in range(len(walk))]


def simplify(pts, eps):
    """Ramer-Douglas-Peucker, so the shipped polyline is readable."""
    if len(pts) < 3:
        return list(pts)
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    worst, at = -1.0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = (abs(dy * x - dx * y + bx * ay - by * ax) / L) if L else math.dist(pts[i], pts[0])
        if d > worst:
            worst, at = d, i
    if worst <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[:at + 1], eps)[:-1] + simplify(pts[at:], eps)


def polyline_length(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def widths(w, h, band, line):
    """Trace width sampled along a centreline, by casting normals both ways."""
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
            while d < 90:
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


def closest_on_polyline(p, poly):
    """The nearest point ON `poly` to `p`, and how far away it is.

    `point_to_polyline` above answers only the distance. The flank join needs
    the POINT as well, and deriving it here rather than picking the nearest
    vertex by eye is the difference between a traced coordinate and a typed
    one: the join may fall part way along a segment, and on this trace it very
    nearly does.
    """
    best, at = float('inf'), None
    for i in range(len(poly) - 1):
        ax, ay = poly[i]
        bx, by = poly[i + 1]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L))
        q = (ax + t * dx, ay + t * dy)
        d = math.hypot(p[0] - q[0], p[1] - q[1])
        if d < best:
            best, at = d, q
    return at, best


def unpainted_run(w, h, band, a, b):
    """How much of the straight line a->b crosses substrate rather than trace.

    Sampled at one pixel: the count of samples outside the painted band, times
    the sample spacing. This is the number the join has to be honest about --
    the centreline gap counts both roads' half-widths, and what a player sees
    is only the part with no paint under it.
    """
    n = max(1, int(math.dist(a, b)))
    off = 0
    for k in range(n + 1):
        t = k / n
        x = int(round(a[0] + (b[0] - a[0]) * t))
        y = int(round(a[1] + (b[1] - a[1]) * t))
        if not (0 <= x < w and 0 <= y < h and band[y * w + x]):
            off += 1
    return off * math.dist(a, b) / n


# ------------------------------------------------------------------ openings

def edge_runs(w, h, mask, min_len=4):
    """Runs of `mask` along each frame edge."""
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                out.append((s, i - 1))
                s = None
        return [r for r in out if r[1] - r[0] + 1 >= min_len]
    return {
        'west': runs(mask[y * w] for y in range(h)),
        'east': runs(mask[y * w + w - 1] for y in range(h)),
        'north': runs(mask[x] for x in range(w)),
        'south': runs(mask[(h - 1) * w + x] for x in range(w)),
    }


# --------------------------------------------------------------------- nodes

def ring_of(w, h, band, face, reach):
    """The band pixels that run round the enclosed face: the CYCLE.

    `reach` is one trace width, so this takes the ring of paint that bounds the
    hole and stops at the first junction where something leaves it.
    """
    INF = 10 ** 9
    d = [INF] * (w * h)
    q = deque()
    for i in face:
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if band[j] and d[j] == INF:
                    d[j] = 1
                    q.append(j)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if band[j] and d[j] == INF:
                    d[j] = d[i] + 1
                    q.append(j)
    return bytearray(1 if band[i] and d[i] <= reach else 0 for i in range(w * h))


def nearest(w, h, pts, to):
    """The member of `pts` closest to any member of `to`.

    A multi-source wavefront out of `to` rather than the obvious double loop:
    the ring is 84,000 px and the tail 70,000, and comparing every pair is 5.8
    billion distances for an answer a flood reaches in one pass.
    """
    want = set(pts)
    seen = bytearray(w * h)
    q = deque()
    for i in to:
        seen[i] = 1
        q.append(i)
    while q:
        i = q.popleft()
        if i in want:
            return i
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not seen[j]:
                    seen[j] = 1
                    q.append(j)
    raise SystemExit('nothing in the first set is reachable from the second')


def to_middle(w, h, band, deep, at, r=30):
    """The deepest pixel within `r` of `at`: the middle of the band there.

    Every node below is found as the pixel of one region nearest another, and
    that is by construction a pixel on the REGION'S EDGE -- a junction reported
    at the kerb rather than in the road. Cutting a disc there does not sever
    the band, and a polyline starting there fails the mid-band check the
    checker makes of every shipped vertex. One short climb up the depth
    transform puts it where a walker would be.
    """
    best, at_best = -1, at
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            x, y = at[0] + dx, at[1] + dy
            if not (0 <= x < w and 0 <= y < h) or not band[y * w + x]:
                continue
            d = deep[y * w + x]
            if d > best:
                best, at_best = d, (x, y)
    return at_best


def column_runs(w, h, band, x):
    out, s = [], None
    for y in range(h + 1):
        t = y < h and band[y * w + x]
        if t and s is None:
            s = y
        elif not t and s is not None:
            out.append((s, y - 1))
            s = None
    return out


def door_mouth(w, h, band, xmax, width):
    """The last column of the trace that is still a whole trace wide.

    NOT the band's rightmost pixel. The trace runs into the housing and the
    housing's own dark frame line cuts across the last two columns, so the
    farthest pixel is a two-pixel remnant 30 px off the centreline. The mouth
    is the last column that is ONE run and at least most of a trace tall, and
    the terminal is its middle.
    """
    for x in range(xmax, 0, -1):
        runs = column_runs(w, h, band, x)
        if len(runs) == 1 and runs[0][1] - runs[0][0] + 1 >= 0.6 * width:
            return x, runs[0][0], runs[0][1]
    raise SystemExit('no door mouth found')


# -------------------------------------------------------------------- overlay

def write_overlay(w, h, px, lines, pads, nodes, path):
    out = bytearray(px)

    def dot(x, y, rgb, r=0):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x + dx)), int(round(y + dy))
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    out[i], out[i + 1], out[i + 2] = rgb

    colours = {
        'stem': (255, 255, 255), 'north': (255, 230, 40), 'south': (255, 90, 200),
        'tail': (120, 255, 120), 'door': (255, 80, 80), 'spur': (150, 150, 150),
    }
    for name, line in lines.items():
        for x, y in line:
            dot(x, y, colours.get(name, (255, 0, 255)), 1)
    for cx, cy in pads:
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (60, 255, 60), 1)
        dot(cx, cy, (255, 255, 255), 2)
    for name, (x, y) in nodes.items():
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(x + 13 * math.cos(t), y + 13 * math.sin(t), (255, 255, 255), 1)
        dot(x, y, (0, 0, 0), 3)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    png.write(path, w, h, out)


# ----------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay', default=None)
    ap.add_argument('--out', default='tools/level9_geometry.json')
    ap.add_argument('--audit', action='store_true')
    args = ap.parse_args()

    w, h, px = plate()
    trace, chip = classify(w, h, px)
    print(f'cyan {sum(trace)} px = {100 * sum(trace) / (w * h):.1f}% of the plate   '
          f'neutral grey {sum(chip)} px = {100 * sum(chip) / (w * h):.1f}%')

    # ---------------------------------------------------------------- the band
    runs = components(w, h, trace)
    band_pts = runs[0]
    print(f'\n--- the trace ---\n  {len(runs)} cyan blobs; the largest is '
          f'{len(band_pts)} px, the next {len(runs[1])} px')
    band = as_mask(w, h, band_pts)
    band, filled = fill_speckle(w, h, band, 2000)
    print(f'  {filled} px of pinhole closed inside it -> {sum(band)} px of band')

    enclosed = holes(w, h, band)
    big = [p for p in enclosed if len(p) > 2000]
    print(f'  {len(enclosed)} enclosed region(s), {len(big)} of them over 2000 px: '
          + ', '.join(f'{len(p)} px' for p in big))
    if args.audit:
        for p in sorted(enclosed, key=len, reverse=True)[:8]:
            print(f'      {len(p):7d} px  bbox {bbox(w, p)}')
    if len(big) != 1:
        raise SystemExit(f'expected one enclosed region (the cycle); found {len(big)}')
    face = big[0]

    # ------------------------------------------------------------- the openings
    print('\n--- where the trace meets the frame ---')
    allruns = edge_runs(w, h, trace, 1)
    bandruns = edge_runs(w, h, band, 1)
    for edge in ('west', 'east', 'north', 'south'):
        for lo, hi in allruns[edge]:
            onband = (lo, hi) in bandruns[edge]
            span = h if edge in ('west', 'east') else w
            print(f'  {edge:5s} {lo:4d}-{hi:<4d} ({lo / span:5.1%}-{hi / span:5.1%})  '
                  f'{hi - lo + 1:3d} px  '
                  + ('ON THE TRACE' if onband else 'cyan, but NOT the trace -- scenery'))
    west = bandruns['west']
    if len(west) != 1 or bandruns['east'] or bandruns['north'] or bandruns['south']:
        raise SystemExit('the trace does not have exactly one frame opening')
    lo, hi = west[0]
    entrance = (0, (lo + hi) // 2)
    print(f'  => ONE opening on the trace: west {lo}-{hi}, terminal {entrance}')

    deep = depth(w, h, band)
    maxdeep = max(d for d in deep if d < 10 ** 9)

    # ------------------------------------------------------------------ nodes
    #
    # DERIVED, not declared. Level 8 wrote its fork into the geometry file as a
    # literal; there are four junctions here and typing four pairs of numbers
    # taken off a screenshot is four chances to be 20 px out, so each one is
    # defined by a property of the paint:
    #
    #   ring    the band within one trace width of the enclosed face -- the
    #           cycle, and nothing else.
    #   A       the ring pixel nearest the entrance stub: where the trace forks.
    #   B       the ring pixel nearest the rest of the board: where it rejoins.
    #   X       the middle of the last full-width column: the door mouth.
    #   S       the band pixel geodesically farthest from the entrance: the cap
    #           of the dead-end spur.
    #   C       the last pixel the walks B->X and B->S have in common.
    #
    # THE WIDTH IS MEASURED BEFORE ANYTHING ELSE, because the ring below is
    # defined in trace widths and the obvious place to measure one -- the
    # entrance stub -- is the single worst: the paint flares to 65 px where it
    # meets the frame, half again the trace's own 48, and a ring built to that
    # swallows the outer corner of the loop. A geodesic clean across the board
    # is measured instead.
    xmax = max(i % w for i in band_pts)
    rough = geodesic(w, h, band, deep, maxdeep, entrance,
                     (xmax - 4, (column_runs(w, h, band, xmax - 4)[0][0]
                                 + column_runs(w, h, band, xmax - 4)[0][1]) // 2))
    width_guess = median(widths(w, h, band, rough))
    ring = ring_of(w, h, band, face, int(round(width_guess * 1.7)))
    rest = [p for p in components(w, h, bytearray(
        1 if band[i] and not ring[i] else 0 for i in range(w * h))) if len(p) > 400]
    print(f'\n--- the cycle ---\n  the ring round the enclosed region is {sum(ring)} px; '
          f'{len(rest)} run(s) of band hang off it')
    stub = next(p for p in rest if any(i % w == 0 for i in p))
    others = [p for p in rest if p is not stub]
    if len(others) != 1:
        raise SystemExit(f'expected the stub and one tail off the cycle; found {len(rest)}')
    tail_side = others[0]

    ringpts = [i for i in range(w * h) if ring[i]]
    A = nearest(w, h, ringpts, stub)
    B = nearest(w, h, ringpts, tail_side)
    A = to_middle(w, h, band, deep, (A % w, A // w))
    B = to_middle(w, h, band, deep, (B % w, B // w))

    xdoor, ytop, ybot = door_mouth(w, h, band, xmax, width_guess)
    X = (xdoor, (ytop + ybot) // 2)

    Dent = geodesic_field(w, h, band, [entrance[1] * w + entrance[0]])
    S = max(range(w * h), key=lambda i: Dent[i] if band[i] and Dent[i] != float('inf') else -1)
    S = to_middle(w, h, band, deep, (S % w, S // w), 20)

    to_door = geodesic(w, h, band, deep, maxdeep, B, X)
    to_spur = geodesic(w, h, band, deep, maxdeep, B, S)
    shared = 0
    while (shared < min(len(to_door), len(to_spur))
           and math.dist(to_door[shared], to_spur[shared]) < 3):
        shared += 1
    C = to_middle(w, h, band, deep,
                  tuple(int(round(v)) for v in to_door[shared - 1]), 20)
    print(f'  A fork      {A}\n  B rejoin    {B}\n  C door junction {C}\n'
          f'  X door      {X}   (mouth x={xdoor} = {xdoor / w:.1%}, y {ytop}-{ybot} = '
          f'{ytop / h:.1%}-{ybot / h:.1%}; the last stray pixel is at x={xmax})\n'
          f'  S spur cap  {S}   ({Dent[S[1] * w + S[0]]:.0f} px of trace from the entrance)')

    # ------------------------------------------------------------- the lines
    #
    # The two arms are picked out by cutting A and B out of the ring: what is
    # left is exactly two runs, which ARE the arms, and each geodesic is then
    # walked inside its own arm so neither can take the other's route.
    def disc(cx, cy, r):
        return {(cy + dy) * w + cx + dx
                for dy in range(-r, r + 1) for dx in range(-r, r + 1)
                if dx * dx + dy * dy <= r * r
                and 0 <= cx + dx < w and 0 <= cy + dy < h}

    # THE DISC GROWS UNTIL IT SEVERS, rather than being given a size. Both
    # nodes are Y junctions, where three arms' worth of paint meet and the
    # band is half again its own width across; a disc scaled to the width
    # leaves a bridge round the outside of the bend and the ring comes back as
    # one piece. Growing it and stopping at the first radius that gives two is
    # the same answer with the number derived instead of guessed, and the
    # radius it lands on is printed so a later reader can see how far it had
    # to go.
    arms, rcut = [], None
    for r in range(int(width_guess * 0.7), int(width_guess * 3)):
        cut = disc(*A, r) | disc(*B, r)
        found = [p for p in components(w, h, bytearray(
            1 if ring[i] and i not in cut else 0 for i in range(w * h))) if len(p) > 2000]
        if len(found) == 2:
            arms, rcut, cut_at = found, r, cut
            break
    if len(arms) != 2:
        raise SystemExit('no cut radius separates the cycle into two arms')
    print(f'  the cycle parts into two arms once the cut discs reach r={rcut}')
    cut = cut_at
    arms.sort(key=lambda p: sum(i // w for i in p) / len(p))
    names = ('north', 'south')
    lines = {}
    for name, pts in zip(names, arms):
        m = as_mask(w, h, pts)
        for i in cut:
            if band[i]:
                m[i] = 1
        lines[name] = geodesic(w, h, m, deep, maxdeep, A, B)
    lines['stem'] = geodesic(w, h, band, deep, maxdeep, entrance, A)
    lines['tail'] = geodesic(w, h, band, deep, maxdeep, B, C)
    lines['door'] = geodesic(w, h, band, deep, maxdeep, C, X)
    lines['spur'] = geodesic(w, h, band, deep, maxdeep, C, S)

    print('\n--- the centrelines ---')
    for name in ('stem', 'north', 'south', 'tail', 'door', 'spur'):
        print(f'  {name:6s} {polyline_length(lines[name]):8.1f} px')
    routes = {
        'north': polyline_length(lines['stem']) + polyline_length(lines['north'])
        + polyline_length(lines['tail']) + polyline_length(lines['door']),
        'south': polyline_length(lines['stem']) + polyline_length(lines['south'])
        + polyline_length(lines['tail']) + polyline_length(lines['door']),
    }
    total = sum(polyline_length(l) for l in lines.values())
    print(f'  route via the north arm {routes["north"]:.1f}, via the south arm '
          f'{routes["south"]:.1f}')
    print(f'  every painted stretch added up: {total:.1f}')

    # ---------------------------------------------------------------- the flank
    #
    # THE SPUR IS A STUB, NOT A LOOP, and this is where that is measured rather
    # than assumed. Its north end IS the door junction C; its south end is the
    # cap S, and the paint stops there. So the only way anything walks it is a
    # JOIN from the tail across bare substrate -- level 6's shape exactly, where
    # `map_level6.json` authors an 82 px segment to reach a band the plate
    # leaves separate and says so in its `_fabricated` note.
    #
    # The join is DERIVED: the nearest point on the traced tail to the traced
    # cap. Nothing about it is chosen, and both numbers below are reported so a
    # build session can see the cost before it takes it -- `joinGap` is
    # centreline to centreline and counts both roads' half-widths, `joinBare` is
    # the part of that line with no paint under it, which is what a player sees.
    #
    # MEASURED ON THE SIMPLIFIED LINES, which are the ones this file writes and
    # the ones tools/build_level9_map.py turns into lanes. The raw geodesic is
    # 5% longer on a curve than the polyline drawn through it, and the spur is
    # nearly all curve -- measuring the flank raw and the tail raw still says
    # SHORTCUT but puts the saving at 7% where the shipped lanes read 12%. Two
    # numbers for one road is how a report ends up arguing with the game.
    simp_tail = [tuple(p) for p in simplify(lines['tail'], 1.2)]
    simp_spur = [tuple(p) for p in simplify(lines['spur'], 1.2)]
    join, join_gap = closest_on_polyline(S, simp_tail)
    join = (round(join[0], 1), round(join[1], 1))
    bare = unpainted_run(w, h, band, join, S)
    flank_line = [join] + list(reversed(simp_spur))
    flank_len = polyline_length(flank_line)
    # The stretch of tail the flank stands in for: join to the door junction.
    at_join = min(range(len(simp_tail)), key=lambda i: math.dist(simp_tail[i], join))
    replaced = polyline_length([join] + simp_tail[at_join + 1:])
    print(f'\n--- the flank ---\n  join {join} on the tail, {join_gap:.1f} px from the '
          f'cap centreline to centreline and {bare:.1f} px of it over bare substrate\n'
          f'  flank {flank_len:.1f} px against the {replaced:.1f} px of tail it replaces: '
          f'{"a SHORTCUT" if flank_len < replaced else "a DETOUR"} by '
          f'{abs(flank_len - replaced):.1f} px ({abs(flank_len - replaced) / replaced:.1%})')

    # --------------------------------------------------------------- the width
    print('\n--- trace width ---')
    per = {}
    for name in ('stem', 'north', 'south', 'tail'):
        per[name] = median(widths(w, h, band, lines[name]))
        print(f'  {name:6s} median {per[name]:5.1f}')
    allw = sorted(sum((widths(w, h, band, lines[n]) for n in
                       ('stem', 'north', 'south', 'tail')), []))
    trace_width = round(median(allw), 1)
    by_area = sum(band) / trace_width
    print(f'  over the whole route: {trace_width}')
    print(f'  trace px / width, which touches no trace: {by_area:.1f} against '
          f'{total:.1f} walked')

    # ---------------------------------------------------------------- the pads
    print('\n--- the grey chips ---')
    chips = [p for p in components(w, h, chip) if len(p) >= MIN_CHIP_AREA]
    nxt = max((len(p) for p in components(w, h, chip) if len(p) < MIN_CHIP_AREA), default=0)
    print(f'  {len(chips)} chips over {MIN_CHIP_AREA} px; the largest thing under the '
          f'threshold is {nxt} px')
    pads, chipinfo = [], []
    for pts in sorted(chips, key=lambda p: (bbox(w, p)[1], bbox(w, p)[0])):
        x0, y0, x1, y1 = bbox(w, pts)
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        pads.append((round(cx, 1), round(cy, 1)))
        chipinfo.append({'box': [x0, y0, x1, y1], 'w': x1 - x0 + 1, 'h': y1 - y0 + 1,
                         'area': len(pts)})

    # THE ROUTE IS WHAT A TOWER SHOOTS AT, and the spur is not on it. Every
    # standoff and every coverage figure below is measured against the walked
    # route only; the distance to the dead-end spur is carried separately so
    # that a build session which decides to spawn on it can see what changes.
    route_lines = [lines[n] for n in ('stem', 'north', 'south', 'tail', 'door')]
    route_pts = (lines['stem'] + lines['north'] + lines['tail'] + lines['door'])
    south_pts = (lines['stem'] + lines['south'] + lines['tail'] + lines['door'])

    def passes(p, reach):
        """How many separate stretches of the route this pad can shoot at.

        Stretches nearer than PASS_GAP of route to each other are one: the apex
        of a hairpin, where the trace curls continuously round a pad, is one
        pass and not two however wide the turn.
        """
        best = 0
        for pts in (route_pts, south_pts):
            run, last = [], None
            for k, q in enumerate(pts):
                near = math.dist(p, q) <= reach
                if near and last is None:
                    last = k
                elif not near and last is not None:
                    run.append((last, k - 1))
                    last = None
            if last is not None:
                run.append((last, len(pts) - 1))
            merged = []
            for a, b in run:
                if merged and a - merged[-1][1] <= PASS_GAP:
                    merged[-1] = (merged[-1][0], b)
                else:
                    merged.append((a, b))
            best = max(best, len(merged))
        return best

    reach = shortest_tower_range()
    print(f'\n  the shortest attacking range in src/data/towers.json is {reach}; '
          f'levels 6-8 were measured at {LEGACY_TOWER_RANGE}')
    print(f'\n  {"pad":>3} {"x":>7} {"y":>6} {"chip":>9} {"to route":>9} {"to spur":>8} '
          f'{f"passes@{reach}":>10} {f"passes@{LEGACY_TOWER_RANGE}":>11}')
    stand, spurd, twopass, legacy_twopass, unreachable = [], [], 0, 0, []
    flankd, covers_flank = [], []
    for n, (cx, cy) in enumerate(pads, 1):
        d = min(point_to_polyline((cx, cy), l) for l in route_lines)
        sp = point_to_polyline((cx, cy), lines['spur'])
        fl = point_to_polyline((cx, cy), flank_line)
        k = passes((cx, cy), reach)
        kl = passes((cx, cy), LEGACY_TOWER_RANGE)
        twopass += 1 if k >= 2 else 0
        legacy_twopass += 1 if kl >= 2 else 0
        if k == 0:
            unreachable.append(n)
        stand.append(round(d, 1))
        spurd.append(round(sp, 1))
        flankd.append(round(fl, 1))
        if fl <= reach:
            covers_flank.append(n)
        ci = chipinfo[n - 1]
        print(f'  {n:3d} {cx:7.1f} {cy:6.1f} {ci["w"]:4d}x{ci["h"]:<4d} {d:9.1f} '
              f'{sp:8.1f} {k:10d} {kl:11d}')
    ws = sorted(c['w'] for c in chipinfo)
    hs = sorted(c['h'] for c in chipinfo)
    closest = min(math.dist(pads[i], pads[j])
                  for i in range(len(pads)) for j in range(i + 1, len(pads)))
    print(f'  chip sizes: median {median(ws)}x{median(hs)}, smallest {ws[0]}x{hs[0]}, '
          f'largest {ws[-1]}x{hs[-1]}')
    print(f'  closest pair of pads {closest:.1f} px apart')
    print(f'  STANDOFF, pad centre to route centreline: {min(stand):.1f}-{max(stand):.1f}, '
          f'median {median(sorted(stand)):.1f}   (levels 2-4 use 90-114)')
    print(f'  PADS THAT CANNOT REACH THE ROUTE AT ALL at range {reach}: '
          + (', '.join(str(n) for n in unreachable) if unreachable else 'none'))
    print(f'  PADS THAT COVER TWO SEPARATE PASSES OF THE ROUTE: {twopass} of {len(pads)} '
          f'at range {reach}, {legacy_twopass} of {len(pads)} at {LEGACY_TOWER_RANGE}')
    still_out = [n for n in unreachable if flankd[n - 1] > reach]
    print(f'  PADS THAT CAN COVER THE FLANK at range {reach}: '
          + (', '.join(f'{n} ({flankd[n - 1]:.0f} px)' for n in covers_flank)
             if covers_flank else 'NONE -- a route no tower can reach')
          + f'\n  of the {len(unreachable)} that cannot reach the trunk, '
          + (', '.join(str(n) for n in sorted(set(unreachable) & set(covers_flank)))
             or 'none') + ' can reach the flank; '
          + (', '.join(str(n) for n in still_out) or 'none') + ' still reach nothing')

    # --------------------------------------------------------- the node art
    #
    # WHICH PAINTED CHIP EACH VARIANT SUITS, BY SHAPE. A node drawn at 1.36:1
    # stretched onto a 1.00:1 chip is a visibly squashed picture, and the four
    # variants do not cover the same range of shapes -- the fan is nearly
    # square and the cabled one is distinctly landscape. Matched on aspect
    # alone: the pads are already fixed by the paint, so this decides which
    # picture goes on which and nothing else.
    print('\n--- the four build-node variants ---')
    nodes_art = {}
    for name in NODE_ART:
        nw, nh, npx = img.read(os.path.join(ROOT, f'art-source/level9/{name}.png'))
        x0 = y0 = 10 ** 9
        x1 = y1 = -1
        for y in range(nh):
            row = y * nw
            for x in range(nw):
                if npx[(row + x) * 4 + 3] > 16:
                    x0, x1 = min(x0, x), max(x1, x)
                    y0, y1 = min(y0, y), max(y1, y)
        iw, ih = x1 - x0 + 1, y1 - y0 + 1
        nodes_art[name] = {'file': [nw, nh], 'ink': [iw, ih], 'aspect': round(iw / ih, 3)}
        print(f'  {name:18s} file {nw:4d}x{nh:<4d} ink {iw:4d}x{ih:<4d} aspect {iw / ih:.3f}')
    suggestion = {}
    for n, ci in enumerate(chipinfo, 1):
        a = ci['w'] / ci['h']
        best = min(NODE_ART, key=lambda k: abs(nodes_art[k]['aspect'] - a))
        suggestion[str(n)] = best
        ci['aspect'] = round(a, 3)
        ci['suggestedNode'] = best
    print(f'\n  {"pad":>3} {"chip":>9} {"aspect":>7}  suggested node')
    for n, ci in enumerate(chipinfo, 1):
        print(f'  {n:3d} {ci["w"]:4d}x{ci["h"]:<4d} {ci["aspect"]:7.3f}  {ci["suggestedNode"]}')
    for name in NODE_ART:
        got = [n for n, v in suggestion.items() if v == name]
        print(f'  {name:18s} -> {len(got)} chip(s): {", ".join(got) or "none"}')

    # NEAREST-ASPECT ALONE IS A DEGENERATE ANSWER AND IT IS PRINTED ANYWAY,
    # because it is the measurement and the balanced mapping below is a
    # judgement built on top of it. Three of the four variants are within 0.1
    # of square and so is most of the board, so the nearest match hands ten
    # chips to the fan and none at all to the RAM -- which would put one look
    # on two thirds of the pads on the only level in the game that has four.
    #
    # The balanced mapping ranks the chips by aspect, most landscape first,
    # and deals them into four runs in the variants' own aspect order. Every
    # variant gets used, the most landscape chips still get the most landscape
    # node, and the worst aspect error it can produce is printed beside it so
    # a build session can see what it is accepting.
    order = sorted(range(len(chipinfo)), key=lambda i: -chipinfo[i]['aspect'])
    by_aspect = sorted(NODE_ART, key=lambda k: -nodes_art[k]['aspect'])
    sizes = [len(order) // len(NODE_ART)] * len(NODE_ART)
    for i in range(len(order) % len(NODE_ART)):
        sizes[i] += 1
    balanced, at = {}, 0
    for name, size in zip(by_aspect, sizes):
        for i in order[at:at + size]:
            balanced[str(i + 1)] = name
            chipinfo[i]['balancedNode'] = name
        at += size
    print('\n  balanced, so all four variants are used:')
    for name in NODE_ART:
        got = [n for n, v in balanced.items() if v == name]
        worst = max((abs(chipinfo[int(n) - 1]['aspect'] - nodes_art[name]['aspect'])
                     for n in got), default=0.0)
        print(f'  {name:18s} -> {len(got)} chip(s): {", ".join(sorted(got, key=int)) or "none"}'
              f'   worst aspect error {worst:.3f}')

    # ---------------------------------------------------------------- the file
    out = {
        '_note': ('Level 9, the circuit board. Derived by tools/trace_level9.py and '
                  'checked independently by tools/check_level9.py. GEOMETRY ONLY -- no '
                  'level is built from this yet.'),
        'world': [CANVAS_W, CANVAS_H],
        'plate': [3840, 2160],
        'entrances': {
            'west': {'terminal': list(entrance), 'opening': [lo, hi],
                     '_note': f'the one frame opening on the trace, {lo}-{hi} = '
                              f'{lo / h:.1%}-{hi / h:.1%} of the height'},
        },
        '_entrances': ('ONE, not the two the brief states. There is cyan on the west edge '
                       'in the briefed 81-84% band as well, and it is the cooling tower\'s '
                       'leftmost vent slot clipped by the frame -- 165 px, two columns wide '
                       'at plate resolution, connected to nothing.'),
        'exit': {
            'terminal': list(X), 'opening': [ytop, ybot],
            '_note': ('AN INTERIOR EXIT: a door in the machine housing, not a frame edge. '
                      f'x={X[0]} is {X[0] / CANVAS_W:.1%} of the width and the mouth spans '
                      f'y {ytop}-{ybot} = {ytop / h:.1%}-{ybot / h:.1%} of the height.'),
        },
        'deadEnd': {
            'terminal': list(S),
            '_note': ('A FIFTH TERMINAL, interior, where the trace stops on open substrate. '
                      'Nothing walks it as the board stands. If level 9 wants a second '
                      'entrance this is the only place the paint offers one.'),
        },
        'nodes': {'fork': list(A), 'rejoin': list(B), 'doorJunction': list(C),
                  'flankJoin': list(join)},
        'flank': {
            'join': list(join),
            'joinGap': round(join_gap, 1),
            'joinBare': round(bare, 1),
            'length': round(flank_len, 2),
            'replaces': round(replaced, 2),
            '_note': ('THE SPUR AS A WALKED BRANCH. The spur is a stub: its north end is '
                      'the door junction and its south end is a cap on open substrate, so '
                      'the two ends are NOT both on the route and the flank cannot be all '
                      'paint. `join` is the nearest point on the traced tail to the traced '
                      'cap -- derived, not chosen -- and `joinBare` is how much of that '
                      'straight line has no trace under it. Level 6 authors an 82.0 px join '
                      'for the same reason; see tests/level6map.test.ts. `length` runs join '
                      '-> cap -> door junction and `replaces` is the tail from the join to '
                      'the same junction.'),
        },
        'centreline': {n: [[round(x, 1), round(y, 1)] for x, y in simplify(lines[n], 1.2)]
                       for n in ('stem', 'north', 'south', 'tail', 'door', 'spur')},
        'lengths': {n: round(polyline_length(lines[n]), 2) for n in lines},
        'routes': {k: round(v, 2) for k, v in routes.items()},
        'traceLength': round(total, 2),
        'traceWidth': trace_width,
        'towerRange': reach,
        '_towerRange': (f'the shortest attacking range in src/data/towers.json. Levels 6 to 8 '
                        f'were measured at {LEGACY_TOWER_RANGE}, which is no longer any '
                        f'tower\'s range; the coverage counts below are given at both.'),
        'legacyTowerRange': LEGACY_TOWER_RANGE,
        'padCoreRadius': PAD_CORE_RADIUS,
        'spotRadius': SPOT_RADIUS,
        'pads': [list(p) for p in pads],
        'padChips': chipinfo,
        'nodeArt': nodes_art,
        'suggestedNodeByAspect': suggestion,
        'suggestedNodeBalanced': balanced,
        '_nodeArt': ('THE FOUR VARIANTS ARE NOT WIRED UP. Measured and matched to chips by '
                     'aspect ratio only, as a starting point for the build session. They are '
                     'about 300 world px at plate scale against chips averaging 81x75, so '
                     'each one must be fitted to the chip it sits on rather than drawn at its '
                     'own size.'),
        'padStandoff': stand,
        'padStandoffToSpur': spurd,
        'padStandoffToFlank': flankd,
        'padsCoveringFlank': covers_flank,
        'padsUnreachableEvenWithFlank': still_out,
        '_padsCoveringFlank': ('WHICH CHIPS CAN SHOOT AT THE FLANK, at the shortest attacking '
                               f'range in towers.json ({reach}). `padStandoff` and '
                               '`padsUnreachable` are measured against the TRUNK only and are '
                               'deliberately left that way, so every earlier figure quoted off '
                               'this file still means what it meant; these three are the flank '
                               'read on its own.'),
        'padsUnreachable': unreachable,
        'padsCoveringTwoPasses': twopass,
        'padsCoveringTwoPassesAtLegacyRange': legacy_twopass,
        'closestPadPair': round(closest, 1),
    }
    json.dump(out, open(os.path.join(ROOT, args.out), 'w'), indent=1)
    print(f'\nwrote {args.out}')

    if args.overlay:
        write_overlay(w, h, px, lines, pads,
                      {'A': A, 'B': B, 'C': C, 'X': X, 'S': S},
                      os.path.join(ROOT, args.overlay))
        print(f'overlay written to {args.overlay}')


if __name__ == '__main__':
    main()
