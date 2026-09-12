"""Derive level 6's lanes, road width and build pads from the painted plate.

    python3 tools/trace_level6.py --overlay tools/L6_pads_overlay.png

Level 6 is an unfinished construction site: warm tan dirt roads over a flat
blue-grey blockout floor, with white untextured primitives, scaffolding, cones,
pipes and one finished pond on it.

This is tools/trace_level8.py's method, which is tools/trace_level5.py's, which
is tools/trace_map.py's: classify every pixel, take the connected runs of road,
walk a geodesic down the MIDDLE of the painted band rather than the shortest
chord, and measure the pads. Nothing here is traced or typed by hand.

FOUR THINGS ABOUT THIS PLATE, three of them from the brief and one the brief
did not know:

  THE PADS ARE PAINTED ON. Eighteen darker grey ellipses are drawn on the
  floor and those are the pads -- they are not derived from clear floor the way
  levels 3, 4, 5 and 8 derive theirs. Floor is about RGB(104,120,136) and a pad
  about RGB(80,96,112); the two separate cleanly on luminance alone, at 106.
  Every one of the eighteen comes out with an ellipse fill of 0.99-1.01, which
  is what a painted ellipse looks like and what a shadow or a smudge does not.

  THE FRAME IS TOUCHED SIX TIMES AND ONLY FOUR OF THEM ARE OPENINGS. West at
  11.8% and 20.8% of the height, east at 73.1% and 82.8%: those are the
  terminals. The road also reaches the top edge at 63.1% of the width and the
  bottom edge across 59.2-73.4% in a 183 canvas px (239 plate px) mouth, and
  neither is a terminal -- the top one is the scaffold's planking, which is
  road-coloured and is not even connected to a road, and the bottom one is a
  band running off the frame at a shallow angle. TERMINALS ARE ON THE VERTICAL
  EDGES ONLY, which is the rule this file applies and check_level6.py re-tests.

  THE ROAD IS NARROW. 40 canvas px of tan, 47-48 including the black kerb the
  art draws around it, against a house standard of 50 and against the brief's
  own reference of 43. See the report; it is measured, not adjusted.

  AND THE TWO LANES MERGE, which the brief says they do not. The west 11.8%
  band and the west 20.8% band join at a three-armed junction near (1055,440)
  and share the last stretch out to the east 73.1% exit; the east 82.8% exit is
  fed by a third band that enters the frame at the BOTTOM edge and is reachable
  from no entrance at all. That is not a classifier artifact and it is not a
  hairline bridge: cutting a 46 px disc out of the junction splits the
  component into three arms of 53389, 45962 and 8152 px, and the component has
  Euler number 1, so it is a tree with one Y in it and no loop. The tracer
  records what is painted and names the conflict; it does not invent the lane
  the brief describes. See reports/2026-09-10-level-6-geometry.md.

Nothing at runtime depends on this. It is the record of where
tools/level6_geometry.json came from and how to redo it when the art changes.
"""

import argparse
import heapq
import json
import math
import os
import statistics
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import img                                                          # noqa: E402
import png                                                          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'art-source/map_level6.png')

# The plate fills a 1280x720 canvas whatever its own size, so canvas pixels are
# the map's coordinate space and the mask is built directly in them.
CANVAS_W, CANVAS_H = 1280, 720

ROAD, FLOOR, PAD, BLOCK = 1, 2, 3, 0

# Texture, not scenery. The road is scattered with painted pebbles and the
# floor with grit, both dark enough to fall outside every band, and a mask full
# of holes makes the road measure half its width -- see despeckle. 90 canvas px
# of area is a fifth of the smallest cone and larger than any speck on the
# plate.
SPECKLE = 90
# A painted pad ellipse is about 116x87 = 7900 px. Nothing else that classifies
# as pad-grey comes within a factor of four of this, so the cut is generous.
MIN_PAD_AREA = 1500
# The junction, kept out of the width median: three roads meeting is 100+ px of
# paint across and a handful of those samples drags the median up.
JUNCTION_SKIP = 60
# Two geodesics that have merged do not walk the same pixels -- they wobble a
# pixel either side of the ridge -- so an exact-identity fork test (which is
# what tools/trace_level8.py uses, and which works there) reports the merge at
# the exit itself. Walking back from the exit while the two stay within this
# many pixels of each other finds it where it actually is.
MERGE_TOL = 6.0
# Levels 3 and 4's, for the pad standoff comparison only. Nothing here places a
# pad: the plate does that.
HOUSE_STANDOFF = (90, 114)
TOWER_RANGE = 112
PAD_CORE_RADIUS = 24
SPOT_RADIUS = 34


# --------------------------------------------------------------- classify

def classify(path):
    """Road, floor, painted pad or blocked, at canvas resolution.

    ROAD    warm tan with real blue in it. Red leads and blue trails by 40+,
            and b is never below 40 -- the wooden scaffolding, which is the
            other warm thing on the plate, is a much darker brown.
    FLOOR   the flat blue-grey blockout, blue leading and red trailing.
    PAD     the same hue, DARKER. This is the whole painted-pad detection and
            it is one threshold: floor sits at luminance 117-128 and a pad at
            93-101, so 106 splits them with 5 units of clearance on the pad
            side and 11 on the floor side. Nothing on this plate lands between.
    BLOCK   everything else: the white primitives, the cones, the pipes, the
            rocks, the pond, the scaffolding, the sign, the worker, the
            unicorn, and the black kerb the art draws around every road.
    """
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
            if r > g > b and r - g >= 40 and b >= 40 and lum > 110:
                k = ROAD
            elif b > g > r and b - r >= 20 and 106 <= lum < 150:
                k = FLOOR
            elif b > g > r and b - r >= 20 and 78 <= lum < 106:
                k = PAD
            else:
                k = BLOCK
            kind[y * CANVAS_W + x] = k
    return kind, w, h, px


def despeckle(kind, max_area):
    """Swallow small blobs into whatever surrounds them.

    The painting has texture and the classifier sees it. Two of the
    measurements below are distances to the nearest pixel of another kind, and
    a pebble in the middle of the road makes the road measure 3 px wide there
    -- which then derails a geodesic that is trying to stay in its middle.

    EVERY component is walked to its end, however big. Stopping the walk once a
    blob passes max_area looks free and is not: the pixels already queued stay
    marked seen, so the rest of that component starts its own walks hemmed in
    by a stale frontier and comes out as a handful of tiny blobs that then get
    swallowed. tools/trace_level8.py learned this by having it eat two bites
    out of an opening; the walk is O(n) either way.
    """
    seen = bytearray(len(kind))
    for start in range(len(kind)):
        if seen[start]:
            continue
        k = kind[start]
        q = deque([start])
        seen[start] = 1
        blob, edge = [], {}
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
        if len(blob) <= max_area and edge:
            into = max(edge, key=lambda t: edge[t])
            for i in blob:
                kind[i] = into
    return kind


def components(mask):
    """Every connected run of a 0/1 mask, largest first, as pixel-index lists."""
    seen = bytearray(len(mask))
    out = []
    for start in range(len(mask)):
        if not mask[start] or seen[start]:
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
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        out.append(comp)
    out.sort(key=len, reverse=True)
    return out


# ---------------------------------------------------------------- distances

def depth(mask):
    """Chamfer distance from every mask pixel to the nearest that is not.

    Two passes rather than an exact transform: this is used to keep a path in
    the middle of the road, and a few percent of error in that is not visible
    on a 40 px road. The pad standoffs, which ARE a rule, use the exact
    transform below instead.
    """
    INF = 1 << 20
    d = [0 if not mask[i] else INF for i in range(len(mask))]
    for y in range(CANVAS_H):
        for x in range(CANVAS_W):
            i = y * CANVAS_W + x
            if d[i] == 0:
                continue
            b = d[i]
            if x: b = min(b, d[i - 1] + 5)
            if y: b = min(b, d[i - CANVAS_W] + 5)
            if x and y: b = min(b, d[i - CANVAS_W - 1] + 7)
            if x + 1 < CANVAS_W and y: b = min(b, d[i - CANVAS_W + 1] + 7)
            d[i] = b
    for y in range(CANVAS_H - 1, -1, -1):
        for x in range(CANVAS_W - 1, -1, -1):
            i = y * CANVAS_W + x
            if d[i] == 0:
                continue
            b = d[i]
            if x + 1 < CANVAS_W: b = min(b, d[i + 1] + 5)
            if y + 1 < CANVAS_H: b = min(b, d[i + CANVAS_W] + 5)
            if x + 1 < CANVAS_W and y + 1 < CANVAS_H: b = min(b, d[i + CANVAS_W + 1] + 7)
            if x and y + 1 < CANVAS_H: b = min(b, d[i + CANVAS_W - 1] + 7)
            d[i] = b
    return [v / 5.0 for v in d]


def exact_distance(sources):
    """Danielsson: exact-to-a-tenth-of-a-pixel distance to the nearest source.

    A chamfer will not do for the pad standoffs. The 3x3 chamfer overestimates
    a true Euclidean distance by up to 5.6% at about 22 degrees off an axis,
    and the standoff figures are the one number in this file that a balance
    argument gets made from -- tools/trace_level8.py found eleven of twenty
    pads misjudged by exactly that error. Each pixel carries the OFFSET to its
    nearest source rather than a distance, and the two sweeps propagate
    offsets.
    """
    FAR = 10 ** 4
    n = CANVAS_W * CANVAS_H
    vx = [FAR] * n
    vy = [FAR] * n
    for (x, y) in sources:
        X, Y = int(round(x)), int(round(y))
        if 0 <= X < CANVAS_W and 0 <= Y < CANVAS_H:
            vx[Y * CANVAS_W + X] = 0
            vy[Y * CANVAS_W + X] = 0

    def better(i, j, dx, dy):
        ax, ay = vx[j] + dx, vy[j] + dy
        if ax * ax + ay * ay < vx[i] * vx[i] + vy[i] * vy[i]:
            vx[i], vy[i] = ax, ay

    for y in range(CANVAS_H):
        for x in range(CANVAS_W):
            i = y * CANVAS_W + x
            if y:
                better(i, i - CANVAS_W, 0, 1)
                if x:
                    better(i, i - CANVAS_W - 1, 1, 1)
                if x + 1 < CANVAS_W:
                    better(i, i - CANVAS_W + 1, -1, 1)
            if x:
                better(i, i - 1, 1, 0)
        for x in range(CANVAS_W - 2, -1, -1):
            better(y * CANVAS_W + x, y * CANVAS_W + x + 1, -1, 0)
    for y in range(CANVAS_H - 1, -1, -1):
        for x in range(CANVAS_W):
            i = y * CANVAS_W + x
            if y + 1 < CANVAS_H:
                better(i, i + CANVAS_W, 0, 1)
                if x:
                    better(i, i + CANVAS_W - 1, 1, 1)
                if x + 1 < CANVAS_W:
                    better(i, i + CANVAS_W + 1, -1, 1)
            if x:
                better(i, i - 1, 1, 0)
        for x in range(CANVAS_W - 2, -1, -1):
            better(y * CANVAS_W + x, y * CANVAS_W + x + 1, -1, 0)
    return [math.hypot(vx[i], vy[i]) for i in range(n)]


# ------------------------------------------------------------------ tracing

def edge_runs(mask, min_len=5):
    """Runs of mask along each frame edge, keyed by edge."""
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                out.append((s, i - 1))
                s = None
        return [r for r in out if r[1] - r[0] + 1 >= min_len]
    W, H = CANVAS_W, CANVAS_H
    return {
        'west': runs(mask[y * W] for y in range(H)),
        'east': runs(mask[y * W + W - 1] for y in range(H)),
        'north': runs(mask[x] for x in range(W)),
        'south': runs(mask[(H - 1) * W + x] for x in range(W)),
    }


def geodesic(band, deep, start, goal):
    """A path down the MIDDLE of the painted band, start to goal.

    Dijkstra with a cost that rises steeply as a pixel approaches the edge of
    the road, so the cheapest route is the centreline rather than the shortest
    chord. Without it a path round a bend cuts the corner and leaves the paint,
    which is the first thing a player would notice.
    """
    INF = float('inf')
    best = [INF] * len(band)
    prev = [-1] * len(band)
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
            if not band[j]:
                continue
            nc = c + math.hypot(dx, dy) * (1.0 + 24.0 / max(1.0, deep[j]))
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
    """Douglas-Peucker, so a 1500-pixel walk becomes a readable waypoint list."""
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


def densify(pts, step=1.0):
    """A polyline resampled to one point per pixel of its own length.

    THE PADS ARE MEASURED AGAINST THE LINE THE GEOMETRY FILE SHIPS, which is
    the simplified polyline. Measuring them against the raw geodesic instead
    puts them a few pixels out, always inward, because simplification cuts
    corners -- tools/trace_level8.py had eleven of twenty pads fail their own
    rule that way.
    """
    out = [pts[0]]
    for k in range(1, len(pts)):
        (x0, y0), (x1, y1) = pts[k - 1], pts[k]
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
        for t in range(1, n + 1):
            out.append((x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n))
    return out


def path_length(pts):
    return sum(math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
               for i in range(1, len(pts)))


def merge_point(a, b, tol=MERGE_TOL):
    """Where two routes to the same exit stop agreeing, walking back from it.

    NOT an exact-pixel test. Two geodesics down the same painted band do not
    walk the same pixels -- the ridge is a couple of pixels wide and each path
    wobbles across it -- so the last identical pixel is the exit itself and the
    shared tail measures zero. Stepping back in parallel while the two stay
    within `tol` finds the junction where it is.

    Returns (point, index into a, index into b) or (None, ...) if the two never
    come together, which is what an honestly independent pair of lanes gives.
    """
    ia, ib = len(a) - 1, len(b) - 1
    if math.dist(a[ia], b[ib]) > tol:
        return None, ia, ib
    while ia > 0 and ib > 0:
        # Take whichever step keeps the two closest; the arms are not sampled
        # at the same rate, so advancing both in lockstep drifts them apart.
        opts = [(math.dist(a[ia - 1], b[ib - 1]), ia - 1, ib - 1),
                (math.dist(a[ia - 1], b[ib]), ia - 1, ib),
                (math.dist(a[ia], b[ib - 1]), ia, ib - 1)]
        d, na, nb = min(opts)
        if d > tol:
            break
        ia, ib = na, nb
    return a[ia], ia, ib


def lane_width(band, line, skip=None, skip_r=0.0):
    """The painted road's width along a centreline: the median of its normals.

    Cast across the band at every sampled point and measure how far the paint
    runs each way. Median rather than mean, so the junction -- three roads
    meeting -- cannot drag a lane's figure up; it is skipped outright as well.
    """
    widths = []
    for k in range(1, len(line) - 1):
        if skip is not None and math.dist(line[k], skip) < skip_r:
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
                if not band[py_ * CANVAS_W + px_]:
                    break
                total += 1
        widths.append(total + 1)
    widths.sort()
    return widths[len(widths) // 2] if widths else 0


# --------------------------------------------------------------------- pads

def painted_pads(kind):
    """The eighteen darker ellipses, as centres, extents and ellipse fills.

    THE PADS ARE NOT DERIVED, THEY ARE READ. Every level before this one picked
    its pads out of whatever ground was clear enough to take one; this plate
    has them drawn on it, so the only honest thing to do is measure where the
    artist put them. `fill` is the blob's area over the area of the bounding
    ellipse -- 1.00 for a painted ellipse, well under for a shadow, a smear or
    two pads that touched and merged -- and it is printed so that "these are
    ellipses" is a measurement rather than a claim.
    """
    mask = bytearray(1 if k == PAD else 0 for k in kind)
    out = []
    for comp in components(mask):
        if len(comp) < MIN_PAD_AREA:
            continue
        xs = [i % CANVAS_W for i in comp]
        ys = [i // CANVAS_W for i in comp]
        bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        out.append({
            'centre': (sum(xs) / len(comp), sum(ys) / len(comp)),
            'width': bw, 'height': bh, 'area': len(comp),
            'fill': len(comp) / (math.pi / 4 * bw * bh),
            'squash': bh / bw,
            'pixels': comp,
        })
    out.sort(key=lambda p: (p['centre'][1], p['centre'][0]))
    return out


def core_on_ground(kind, cx, cy, radius=PAD_CORE_RADIUS):
    """Is every pixel of the pad's core buildable ground?

    Ground is floor OR painted pad: the ellipse is a marking on the floor, not
    an obstruction. Levels 3, 4 and 8 spell "24 px core" as a disc of RADIUS
    24, so a pad's cleared footprint is 48 px across; that is theirs and it is
    kept.
    """
    for dy in range(-radius, radius + 1):
        y = cy + dy
        if not (0 <= y < CANVAS_H):
            return False
        row = y * CANVAS_W
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            x = cx + dx
            if not (0 <= x < CANVAS_W) or kind[row + x] not in (FLOOR, PAD):
                return False
    return True


# ------------------------------------------------------------------ overlay

def write_overlay(path, w, h, px, lanes, orphan, pads):
    """The plate at CANVAS resolution with the lanes and pad rings drawn on it.

    1280x720 rather than the plate's 1672x941, which is what levels 3, 4 and 8
    do and not an accident: canvas pixels are the map's coordinate space, so a
    full-resolution overlay is more picture for none of the information.
    """
    buf = bytearray(CANVAS_W * CANVAS_H * 4)
    for y in range(CANVAS_H):
        sy = min(h - 1, int(y * h / CANVAS_H))
        for x in range(CANVAS_W):
            sx = min(w - 1, int(x * w / CANVAS_W))
            i, o = (sy * w + sx) * 4, (y * CANVAS_W + x) * 4
            buf[o], buf[o + 1], buf[o + 2], buf[o + 3] = px[i], px[i + 1], px[i + 2], 255

    def put(x, y, c, r=1):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x)) + dx, int(round(y)) + dy
                if 0 <= X < CANVAS_W and 0 <= Y < CANVAS_H:
                    o = (Y * CANVAS_W + X) * 4
                    buf[o], buf[o + 1], buf[o + 2] = c

    def line(pts, c):
        for k in range(1, len(pts)):
            (x0, y0), (x1, y1) = pts[k - 1], pts[k]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            for t in range(steps + 1):
                put(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps, c)

    line(lanes['north'], (255, 60, 60))
    line(lanes['south'], (60, 130, 255))
    if orphan:
        line(orphan, (255, 200, 0))
    for p in pads:
        cx, cy = p['centre']
        # The painted ellipse the artist drew...
        for a in range(0, 360, 2):
            t = math.radians(a)
            put(cx + p['width'] / 2 * math.cos(t), cy + p['height'] / 2 * math.sin(t),
                (255, 255, 255))
        # ...and the radius-24 core the pad rule actually tests.
        for a in range(0, 360, 2):
            t = math.radians(a)
            put(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (60, 255, 60))
    png.write(path, CANVAS_W, CANVAS_H, buf)


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay')
    ap.add_argument('--out', default='tools/level6_geometry.json')
    args = ap.parse_args()

    kind, w, h, px = classify(PLATE)
    print(f'plate {os.path.relpath(PLATE, ROOT)}  {w}x{h} -> {CANVAS_W}x{CANVAS_H}')
    kind = despeckle(kind, SPECKLE)
    for name, v in (('road', ROAD), ('floor', FLOOR), ('pad', PAD), ('blocked', BLOCK)):
        c = sum(1 for k in kind if k == v)
        print(f'  {name:8s} {c:7d}  {c * 100 / len(kind):5.1f}%')

    road = bytearray(1 if k == ROAD else 0 for k in kind)
    comps = components(road)
    # Anything under 20000 px is a prop in the road's colour, not a road: the
    # largest such blob on this plate is the scaffold planking at 936 px, which
    # is what puts a road-coloured run on the TOP edge.
    bands = [c for c in comps if len(c) >= 20000]
    print(f'  road components: {[len(c) for c in comps[:6]]} -> {len(bands)} band(s) over 20000 px')
    band = bytearray(CANVAS_W * CANVAS_H)
    for c in bands:
        for i in c:
            band[i] = 1

    print('\n--- the frame, touched six times ---')
    runs = edge_runs(road)
    for edge, rr in runs.items():
        n = CANVAS_H if edge in ('west', 'east') else CANVAS_W
        for lo, hi in rr:
            mid = (lo + hi) / 2
            print(f'  {edge:6s} {lo:4d}-{hi:4d}  centre {mid:6.1f} = {mid / n:5.1%} of the frame,'
                  f' {hi - lo + 1:3d} px')
    # THE BOTTOM TOUCH IS AN ENTRANCE NOW, and it used to be excluded here as
    # "the art running off the frame". It is the mouth of the band that reaches
    # east83, it is 182 canvas px of road, and level 6 spawns a flank out of it.
    # The TOP touch stays excluded and is a different thing entirely: the
    # scaffold's planking, road-coloured and connected to no road at all, which
    # the blob test below proves rather than assumes.
    terminals = {'west': runs['west'], 'east': runs['east'], 'south': runs['south']}
    excluded = {'north': runs['north']}
    n_terminals = sum(len(v) for v in terminals.values())
    print(f'  TERMINALS (two vertical edges and the bottom): {n_terminals}.  '
          f'excluded touches: {sum(len(v) for v in excluded.values())}')
    if n_terminals != 5:
        print('  five expected -- two west, two east, one south; this plate does not agree,'
              ' and nothing below is safe')

    (w1, w2), (e1, e2) = sorted(runs['west']), sorted(runs['east'])
    (s1,) = sorted(runs['south'])
    gates = {
        'west12': (0, (w1[0] + w1[1]) // 2),
        'west21': (0, (w2[0] + w2[1]) // 2),
        'east73': (CANVAS_W - 1, (e1[0] + e1[1]) // 2),
        'east83': (CANVAS_W - 1, (e2[0] + e2[1]) // 2),
        # The bottom mouth. Its span runs along the WIDTH, so the gate's x is
        # the midpoint and its y is the bottom row -- the other four are the
        # other way round and reading this one the same way would put the
        # flank's spawn off the left of the board.
        'south59': ((s1[0] + s1[1]) // 2, CANVAS_H - 1),
    }
    spans = {'west12': list(w1), 'west21': list(w2), 'east73': list(e1), 'east83': list(e2),
             'south59': list(s1)}

    print('\n--- which entrance reaches which exit ---')
    deep = depth(band)
    reach = {}
    for a in ('west12', 'west21'):
        for b in ('east73', 'east83'):
            reach[(a, b)] = geodesic(band, deep, gates[a], gates[b]) is not None
            print(f'  {a} -> {b}: {"reachable" if reach[(a, b)] else "NO PATH IN THE PAINT"}')

    raw = {}
    for a, b in (('west12', 'east73'), ('west21', 'east73'),
                 ('west12', 'east83'), ('west21', 'east83')):
        if reach[(a, b)]:
            raw.setdefault(a, (b, geodesic(band, deep, gates[a], gates[b])))
    if 'west12' not in raw or 'west21' not in raw:
        raise SystemExit('an entrance reaches no exit at all; the mask or the art is broken')

    north_exit, north_raw = raw['west12']
    south_exit, south_raw = raw['west21']
    lanes_raw = {'north': north_raw, 'south': south_raw}

    merge, ia, ib = (None, 0, 0)
    if north_exit == south_exit:
        merge, ia, ib = merge_point(north_raw, south_raw)
    if merge is None:
        print('  the two lanes share no stretch: they are independent, as the brief says')
    else:
        shared = path_length(north_raw[ia:])
        print(f'  THE TWO LANES MERGE at {merge} and share the last {shared:.1f} px '
              f'to {north_exit}')

    # The band no entrance reaches. It is a real painted road with a terminal on
    # an exit, so it is measured and shipped -- named for what it is rather than
    # quietly dropped, because a level built off this file has to know the exit
    # exists and that nothing walks to it.
    orphan_raw = None
    orphan_exit = next((e for e in ('east73', 'east83')
                        if not reach[('west12', e)] and not reach[('west21', e)]), None)
    if orphan_exit:
        lo, hi = runs['south'][0]
        start = ((lo + hi) // 2, CANVAS_H - 1)
        orphan_raw = geodesic(band, deep, start, gates[orphan_exit])
        print(f'  {orphan_exit} is reached by NO entrance; the band that feeds it enters at the '
              f'BOTTOM edge, x {lo}-{hi}')

    lanes = {n: simplify(l, 1.2) for n, l in lanes_raw.items()}
    orphan = simplify(orphan_raw, 1.2) if orphan_raw else None
    shipped = {n: densify(l) for n, l in lanes.items()}
    if orphan:
        shipped['orphan'] = densify(orphan)

    print('\n--- road width, measured across the paint ---')
    per = {}
    for n, l in list(lanes_raw.items()) + ([('orphan', orphan_raw)] if orphan_raw else []):
        per[n] = lane_width(band, l, merge, JUNCTION_SKIP)
        print(f'  {n:7s} median {per[n]:5.1f} over {len(l)} sampled points')
    width = statistics.median(per.values())
    print(f'  roadWidth = {width} canvas px  (the brief\'s reference is 43; house standard 50)')

    print('\n--- lengths ---')
    lengths = {n: path_length(l) for n, l in lanes_raw.items()}
    if orphan_raw:
        lengths['orphan'] = path_length(orphan_raw)
    for n, v in lengths.items():
        print(f'  {n:7s} {v:8.1f}')
    shared_len = path_length(north_raw[ia:]) if merge else 0.0
    total = sum(lengths.values()) - shared_len
    by_area = sum(band) / width
    print(f'  total painted road (shared tail counted once) {total:8.1f}')
    print(f'  road pixels / width, an independent estimate  {by_area:8.1f}  '
          f'({sum(band)} px / {width})')
    print(f'  the brief\'s reference                          5694.0   '
          f'{(total - 5694.0) / 5694.0 * 100:+.1f}%')

    print('\n--- the eighteen painted pads ---')
    pads = painted_pads(kind)
    to_lane = exact_distance([p for l in shipped.values() for p in l])
    to_paint = exact_distance([(i % CANVAS_W, i // CANVAS_W)
                               for i in range(len(band)) if band[i]])
    print(f'  {"#":>3} {"cx":>7} {"cy":>7} {"w":>4} {"h":>4} {"fill":>5} {"squash":>7} '
          f'{"->lane":>7} {"->paint":>8}  core')
    rows = []
    for n, p in enumerate(pads, 1):
        cx, cy = p['centre']
        i = int(round(cy)) * CANVAS_W + int(round(cx))
        ok = core_on_ground(kind, int(round(cx)), int(round(cy)))
        rows.append({'centre': [round(cx, 1), round(cy, 1)],
                     'width': p['width'], 'height': p['height'], 'area': p['area'],
                     'fill': round(p['fill'], 3), 'squash': round(p['squash'], 3),
                     'toLane': round(to_lane[i], 1), 'toPaint': round(to_paint[i], 1),
                     'coreOnGround': ok})
        print(f'  {n:3d} {cx:7.1f} {cy:7.1f} {p["width"]:4d} {p["height"]:4d} '
              f'{p["fill"]:5.2f} {p["squash"]:7.3f} {to_lane[i]:7.1f} {to_paint[i]:8.1f}  '
              f'{"ok" if ok else "OFF GROUND"}')
    print(f'  {len(pads)} pads.  median painted ellipse '
          f'{statistics.median(p["width"] for p in pads):.0f} x '
          f'{statistics.median(p["height"] for p in pads):.0f}, '
          f'median squash {statistics.median(p["squash"] for p in pads):.3f} '
          f'(the engine draws ground markings at 0.62)')
    dl = sorted(r['toLane'] for r in rows)
    dp = sorted(r['toPaint'] for r in rows)
    print(f'  standoff to the lane CENTRELINE  {dl[0]:.1f} - {dl[-1]:.1f}, '
          f'median {statistics.median(dl):.1f}   (levels 3/4 sit at '
          f'{HOUSE_STANDOFF[0]}-{HOUSE_STANDOFF[1]})')
    print(f'  standoff to the painted EDGE     {dp[0]:.1f} - {dp[-1]:.1f}, '
          f'median {statistics.median(dp):.1f}')

    out = {
        '_note': 'DERIVED by tools/trace_level6.py from art-source/map_level6.png. '
                 'Checked independently by tools/check_level6.py. This file replaces the '
                 'one written for the abandoned stitched two-lane plate, which described '
                 'different art and was wrong in every number.',
        '_conflict': 'THE PLATE MERGES THE TWO LANES. west12 and west21 join at the '
                     f'junction below and share the last stretch to {north_exit}. The '
                     'brief for this level says the lanes are independent and that each '
                     'exit has its own entrance. They are not. Nothing here was adjusted '
                     'to fit the brief; src/data/map_level6.json authors ONE 82 px '
                     'segment to pull them apart and says so in its `_fabricated` note. '
                     'See reports/2026-09-10-level-6-geometry.md.',
        '_thirdEntrance': 'THE BAND THAT REACHES '
                          f'{orphan_exit} HAS A MOUTH, and this file used to call it an '
                          'excluded touch -- "a band running off the frame at a shallow '
                          'angle, not a terminal". It is 182 canvas px of road on the '
                          'BOTTOM edge, 59-74% across, and it is the only thing feeding '
                          f'{orphan_exit}. It is `south59` in `openings` and `flank` in '
                          '`entrances` now, and level 6 spawns a small Sprinter flank out '
                          'of it. What is still excluded is the TOP touch, which is the '
                          "scaffold's planking and is connected to no road at all -- the "
                          'blob test above proves that rather than assuming it. See '
                          'reports/2026-09-12-level-6-fixes.md.',
        'world': [CANVAS_W, CANVAS_H],
        'plate': [w, h],
        'entrances': {'north': list(gates['west12']), 'south': list(gates['west21']),
                      'flank': list(gates['south59'])},
        'exits': {'north': list(gates[north_exit]), 'south': list(gates[south_exit])},
        # `fraction` is the opening's position along the edge it sits on, so the
        # four on the vertical edges divide by the HEIGHT and the bottom one by
        # the WIDTH. Dividing them all by the height put south59 at 130% of a
        # frame it is not on.
        'openings': {k: {'span': spans[k], 'at': list(gates[k]),
                         'fraction': round(sum(spans[k]) / 2
                                           / (CANVAS_W if k == 'south59' else CANVAS_H), 4)}
                     for k in ('west12', 'west21', 'east73', 'east83', 'south59')},
        'excludedTouches': {
            'north': {'span': list(runs['north'][0]),
                      'fraction': round(sum(runs['north'][0]) / 2 / CANVAS_W, 4),
                      'why': 'the scaffold planking, road-coloured and connected to no road'},
        },
        'lanes': {n: [[round(x, 2), round(y, 2)] for x, y in l] for n, l in lanes.items()},
        'lengths': {n: round(v, 2) for n, v in lengths.items()},
        # The junction, and how far along each lane it sits. ARC LENGTH, not an
        # index: the shipped lanes are the SIMPLIFIED polylines and the indices
        # the merge was found at are into the raw pixel walks, so an index here
        # would point at the wrong vertex of the wrong list. A distance means
        # the same thing in both.
        'merge': (None if merge is None else
                  {'at': [round(merge[0], 2), round(merge[1], 2)],
                   'sharedLength': round(shared_len, 2),
                   'startsAt': {'north': round(path_length(north_raw[:ia + 1]), 2),
                                'south': round(path_length(south_raw[:ib + 1]), 2)}}),
        'orphanBand': (None if orphan is None else
                       {'to': orphan_exit,
                        'entersAt': ['south frame edge', list(runs['south'][0])],
                        'centreline': [[round(x, 2), round(y, 2)] for x, y in orphan],
                        'length': round(lengths['orphan'], 2),
                        'why': 'no entrance reaches it; nothing walks this band'}),
        'roadLength': round(total, 2),
        'roadWidth': width,
        'roadWidthPerBand': per,
        'towerRange': TOWER_RANGE,
        'padCoreRadius': PAD_CORE_RADIUS,
        'padFootprintRadius': SPOT_RADIUS,
        'padsArePainted': True,
        'padEllipses': rows,
        'pads': [r['centre'] for r in rows],
        'buildSpots': [r['centre'] for r in rows],
    }
    json.dump(out, open(os.path.join(ROOT, args.out), 'w'), indent=1)
    print(f'\nwrote {args.out}')
    if args.overlay:
        write_overlay(os.path.join(ROOT, args.overlay), w, h, px, lanes, orphan, pads)
        print(f'wrote {args.overlay}')


if __name__ == '__main__':
    main()
