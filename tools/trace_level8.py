"""Derive level 8's lane, road width and build pads from the painted plate.

    python3 tools/trace_level8.py --overlay tools/L8_pads_overlay.png

Level 8 is an abandoned corporate office floor: a warm tan dirt path over flat
muted blue-grey office carpet, with office furniture, cables, server racks,
conveyor machinery and signage on it. ONE ENTRANCE AND TWO EXITS, which makes it
the first map to use the split `mainMerge` support written for level 5.

This is tools/trace_level5.py's method, which is tools/trace_map.py's: classify
every pixel, take the largest connected run of road, walk a geodesic down the
MIDDLE of the painted band rather than the shortest chord, and put the pads on
ground that will take one. Nothing here is traced or typed by hand.

THREE THINGS ABOUT THIS PLATE A NAIVE TRACE GETS WRONG, all three checked
rather than assumed:

  THE HAZARD STRIPING IS NOT ROAD. The conveyors in the top-right and
  bottom-right corners are painted in yellow and orange hazard stripes, and a
  plain warm-colour test calls them road. What separates them is BLUE: the road
  is a tan with real blue in it (b 48-96, so g-b is 72-96), and the stripes are
  saturated yellow with b at 0 (g-b 120-168). `b >= 40` drops them, and the
  largest-connected-component pass drops whatever survives, since none of it
  touches the road. `--audit` prints the warm pixels that were rejected so the
  exclusion can be seen rather than trusted.

  THERE ARE EXACTLY THREE OPENINGS. Left edge, right edge, bottom edge. The
  tracer reports every run of road on every edge and `check_level8.py` fails on
  a fourth, because an opening that is really a prop touching the frame would
  otherwise become a lane nothing walks.

  THE BOTTOM EXIT IS WIDE, about 2.8 road widths where it meets the frame,
  because the art spreads there. Its CENTRE is the terminal and its width is not
  meaningful -- so it is excluded from the road-width median, which is taken on
  the shared spine only. Left in, it drags the median up by a third.

Nothing at runtime depends on this. It is the record of where
tools/level8_geometry.json came from and how to redo it when the art changes.
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
PLATE = os.path.join(ROOT, 'art-source/Courjahan_Defense_Level8_4K.png')

# The plate fills a 1280x720 canvas whatever its own size, so canvas pixels are
# the map's coordinate space and the mask is built directly in them.
CANVAS_W, CANVAS_H = 1280, 720

ROAD, CARPET, BLOCK = 1, 2, 0
TURF = (CARPET,)

# What a pad needs, all in canvas pixels and all taken from level 4, which is
# the level this one is meant to be difficulty-comparable to.
# LEVELS 3 AND 4 SPELL "24 px core" AS A DISC OF RADIUS 24 -- check_level3.py
# and check_level4.py both walk `dx*dx + dy*dy <= 24*24` -- so a pad's cleared
# footprint is 48 px across, not 24. tools/trace_level5.py read the same phrase
# as a 24 px box and tested a 12 px radius, which is a quarter of the area. The
# brief for this level says to mirror levels 3 and 4 exactly, so this is theirs.
PAD_CORE_RADIUS = 24
TOWER_RANGE = 112       # the shortest range in the tower pool
# LEVELS 3 AND 4's STANDOFF, not level 5's. The brief asks for this level to be
# derived by the same rules those two were, and theirs is a 90-114 band rather
# than level 5's 46-110 -- a wider standoff, which puts a tower far enough back
# that its own base is clear of the paint and near enough that its shortest
# range still reaches. Level 5 relaxed the near edge to fit fourteen pads
# around one junction; there is no reason to relax it here.
PAD_MIN_FROM_LANE = 90
PAD_MAX_FROM_LANE = 114
PAD_SPACING = 74        # level 4's separation, and the tightest pair it allows
SPOT_RADIUS = 34
# How wide a line drawn across the road may be before it counts as a wall.
# 3 bridges up to 6 canvas px, which covers the scanning line and the cables and
# is well under the road's own ~50 px width, so it cannot join two roads.
CLOSE_RADIUS = 3
# A pad's TAP TARGET has to be fully on the board. `spotRadius` is 34 and the
# board is 1280x720, so a pad closer than 34 px to a frame edge has half its
# hit box off screen. No previous level comes near it -- level 4's pads live in
# x 232-940, y 92-542 and level 5's in x 184-1026, y 95-647 -- because their
# terrain kept them inland. Level 8's road runs along all four edges, so on this
# plate the rule has to be stated rather than inherited.
PAD_EDGE_MARGIN = SPOT_RADIUS


# --------------------------------------------------------------- classify

def classify(path):
    """Road, carpet or blocked, at canvas resolution."""
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
            # ROAD: warm tan with REAL BLUE IN IT. The `b >= 40` is what keeps
            # the conveyors' hazard striping out -- see the module header.
            if r > g > b and r - g >= 40 and b >= 40 and lum > 90:
                k = ROAD
            # CARPET: the flat muted blue-grey floor, and the only buildable
            # ground on the level. Blue is the top channel and red the bottom.
            elif b > g >= r and b - r >= 30 and 40 < lum < 130:
                k = CARPET
            else:
                k = BLOCK
            kind[y * CANVAS_W + x] = k
    return kind


def rejected_warm(path):
    """Warm pixels the road test refused, as a count and a sample.

    THE CONVEYOR EXCLUSION, MADE VISIBLE. It is the one classification decision
    on this plate that a reader would otherwise have to take on trust, and it is
    the one the brief warns about, so `--audit` prints it.
    """
    w, h, px = img.read(path)
    kept = 0
    dropped = {}
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            i = (y * w + x) * 4
            r, g, b = px[i], px[i + 1], px[i + 2]
            if not (r > g and r - g >= 40 and (r + g + b) // 3 > 90):
                continue
            if b >= 40:
                kept += 1
            else:
                key = (r // 24 * 24, g // 24 * 24, b // 24 * 24)
                dropped[key] = dropped.get(key, 0) + 1
    return kept, sorted(dropped.items(), key=lambda kv: -kv[1])[:6]


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
        # EVERY component is walked to its end, however big. Stopping the walk
        # once a blob passes max_area looks like a free optimisation and is not:
        # the pixels already queued stay marked `seen`, so the rest of that same
        # component starts its own walks, hemmed in by that stale frontier, and
        # comes out as a handful of tiny blobs that then get swallowed. On this
        # plate it ate two bites out of the bottom mouth and split one opening
        # into two. The walk is O(n) either way -- each pixel is visited once.
        if len(blob) <= max_area and edge:
            into = max(edge, key=lambda t: edge[t])
            for i in blob:
                kind[i] = into
    return kind


def close_gaps(mask, r):
    """Dilate then erode, so a thin line drawn ACROSS the road does not cut it.

    THE PLATE HAS THINGS DRAWN OVER THE ROAD and two of them sever it: the
    Performance Review's red scanning line, which crosses the track by design,
    and the routed cables. Neither is tan, so a colour classifier reads them as
    a wall, and the road came out as TWO components of 112,080 and 87,559 px --
    the half with the entrance and the right exit, and the half with the bottom
    exit. Taking the largest of those threw the entrance away.

    A close bridges a gap up to 2r wide and leaves the road's own edges where
    they were, which is what makes it safe to measure width off afterwards: the
    dilate rounds the outline out by r and the erode brings it back by r. It
    cannot join two roads that were never within 2r of each other.
    """
    W, H = CANVAS_W, CANVAS_H

    def pass_(src, grow):
        out = bytearray(W * H)
        for y in range(H):
            for x in range(W):
                hit = False
                for dy in range(-r, r + 1):
                    yy = y + dy
                    if not (0 <= yy < H):
                        continue
                    for dx in range(-r, r + 1):
                        xx = x + dx
                        if 0 <= xx < W and (src[yy * W + xx] != 0) == grow:
                            hit = True
                            break
                    if hit:
                        break
                out[y * W + x] = (1 if hit else 0) if grow else (0 if hit else 1)
        return out

    return pass_(pass_(mask, True), False)


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


def densify(pts, step=1.0):
    """A polyline resampled to one point per pixel of its own length.

    THE PADS ARE MEASURED AGAINST THE LINE THE GEOMETRY FILE SHIPS, which is
    the SIMPLIFIED polyline -- that is what becomes the map's waypoints and
    what tools/check_level8.py measures against. Placing them against the raw
    geodesic instead put eleven of twenty pads 83 to 90 px from the shipped
    line when the rule says 90 to 114: simplification moves the line by up to a
    pixel or two and a corner cut moves it further, always inward, always in
    the direction that breaks the near edge of the band. So the raw geodesic
    decides where the road IS and this decides what the pads are measured to.
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


# --------------------------------------------------------------------- pads

def dist_to_lines(lines):
    """EXACT distance from every canvas pixel to the nearest lane centreline.

    A chamfer will not do here, and that is not a nicety. The 3x3 chamfer used
    for the ground clearances overestimates a true Euclidean distance by up to
    5.6% at around 22 degrees off an axis, so a pad passing a `>= 90` chamfer
    test can sit 85 px from the road -- and eleven of the first twenty did,
    which tools/check_level8.py caught by measuring the same pads the honest
    way. The standoff band is the rule this level's pads are judged against, so
    it is measured rather than approximated.

    This is Danielsson's transform: each pixel carries the OFFSET to its
    nearest source instead of a distance, and the two sweeps propagate offsets.
    Error is bounded well under a tenth of a pixel and it stays O(n).
    """
    FAR = 10 ** 4
    vx = [FAR] * (CANVAS_W * CANVAS_H)
    vy = [FAR] * (CANVAS_W * CANVAS_H)
    for line in lines:
        for (x, y) in line:
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
    return [math.hypot(vx[i], vy[i]) for i in range(CANVAS_W * CANVAS_H)]


# Candidate pads are considered on a grid rather than per pixel, and lane
# coverage is measured on every Nth traced point. Neither loses anything real:
# pads sit 74 px apart, so a 4 px grid cannot miss a placement, and the lane is
# traced a pixel at a time, so sampling it every 4 px is a 4 px error on a 112
# px range. It is the difference between a script that finishes and one that
# does not -- the exhaustive version is candidates x x lane points x pads, which on
# this plate is about 10^10.
PAD_GRID = 4
LANE_STRIDE = 4


def core_on_carpet(kind, cx, cy):
    """Is every pixel of the pad's radius-24 core classified carpet?"""
    R = PAD_CORE_RADIUS
    for dy in range(-R, R + 1):
        y = cy + dy
        if not (0 <= y < CANVAS_H):
            return False
        row = y * CANVAS_W
        for dx in range(-R, R + 1):
            if dx * dx + dy * dy > R * R:
                continue
            x = cx + dx
            if not (0 <= x < CANVAS_W) or kind[row + x] != CARPET:
                return False
    return True


def pick_pads(kind, clear, to_lane, fork, lines, want):
    """As many pads as the rules allow, best first. THE NUMBER IS NOT A TARGET.

    Levels 2, 3 and 4 carry 15, 15 and 14, and it would be easy to relax a rule
    until this plate produced fourteen too. It is not done: the four properties
    below are levels 3 and 4's own, unchanged, and whatever falls out of them is
    the number this board actually holds. A board's pad count is a real design
    constraint on its boss -- boss health only means anything against the DPS a
    board can bring -- so a forced count would be a lie told to the soak.

    The four, all in canvas pixels:
      ON CARPET   the pad's radius-24 core sits entirely on classified carpet, so
                  it is clear of the road, every prop, every painted marking,
                  the Performance Review hardware and the signs.
      STANDOFF    90 to 114 px from the nearest lane centreline.
      APART       at least 74 px between centres, which is level 4's figure.
      BEST FIRST  ordered by how much UNCOVERED lane the pad would add, so a
                  long serpentine road gets its guns spread along it rather
                  than stacked on whichever stretch happens to have the most
                  open carpet beside it.
    """
    half = PAD_CORE_RADIUS
    pts = [p for line in lines.values() for p in line[::LANE_STRIDE]]
    cand = []
    lo, hi_x, hi_y = PAD_EDGE_MARGIN, CANVAS_W - PAD_EDGE_MARGIN, CANVAS_H - PAD_EDGE_MARGIN
    for y in range(lo, hi_y, PAD_GRID):
        for x in range(lo, hi_x, PAD_GRID):
            i = y * CANVAS_W + x
            if kind[i] != CARPET or clear[i] < half:
                continue
            if not (PAD_MIN_FROM_LANE <= to_lane[i] <= PAD_MAX_FROM_LANE):
                continue
            # The chamfer above is a lower bound and the classifier's own
            # despeckling means it can round a hairline prop away, so the core
            # is then walked pixel by pixel -- which is what levels 3 and 4 do.
            if not core_on_carpet(kind, x, y):
                continue
            reach = {j for j, (px_, py_) in enumerate(pts)
                     if math.hypot(x - px_, y - py_) <= TOWER_RANGE}
            cand.append((x, y, reach))

    covered = set()
    taken = []
    live = list(cand)
    while len(taken) < want and live:
        live = [c for c in live
                if not any(math.hypot(c[0] - px_, c[1] - py_) < PAD_SPACING for px_, py_ in taken)]
        if not live:
            break
        best = max(live, key=lambda c: len(c[2] - covered))
        if not len(best[2] - covered):
            # NOTHING LEFT ADDS REACH, and that is where the board stops.
            #
            # The alternative -- keep placing while anything still fits -- gave
            # 34 pads on this plate, of which the last two dozen covered road
            # that was already covered. That is not "how big the board is", it
            # is "how much carpet is inside the standoff band", and on a
            # serpentine road running the length of the plate those are very
            # different numbers. Stopping at zero marginal coverage is the same
            # question levels 3 and 4 were answering by hand.
            break
        taken.append((best[0], best[1]))
        covered |= best[2]
    return taken


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
    """The plate at CANVAS resolution with the lanes and pad spots drawn on it.

    1280x720 rather than the plate's 3840x2160, which is levels 3 and 4's
    overlay size and not an accident: canvas pixels are the map's coordinate
    space, so a full-resolution overlay is three times the picture for none of
    the information and lands a 15 MB PNG in the repository.
    """
    w, h, px = img.read(PLATE)
    buf = bytearray(CANVAS_W * CANVAS_H * 3)
    for y in range(CANVAS_H):
        sy = min(h - 1, int(y * h / CANVAS_H))
        for x in range(CANVAS_W):
            sx = min(w - 1, int(x * w / CANVAS_W))
            i, o = (sy * w + sx) * 4, (y * CANVAS_W + x) * 3
            buf[o], buf[o + 1], buf[o + 2] = px[i], px[i + 1], px[i + 2]

    def put(x, y, c):
        for dy in (0, 1):
            for dx in (0, 1):
                X, Y = int(x) + dx, int(y) + dy
                if 0 <= X < CANVAS_W and 0 <= Y < CANVAS_H:
                    o = (Y * CANVAS_W + X) * 3
                    buf[o], buf[o + 1], buf[o + 2] = c
    for name, line in waypoints.items():
        c = {'shared': (255, 255, 255), 'south': (60, 160, 255),
             'east': (255, 240, 60)}.get(name, (255, 60, 60))
        for k in range(1, len(line)):
            (x0, y0), (x1, y1) = line[k - 1], line[k]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            for t in range(steps + 1):
                put(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps, c)
    for (x, y) in pads:
        for a in range(0, 360, 2):
            put(x + SPOT_RADIUS * math.cos(math.radians(a)),
                y + SPOT_RADIUS * math.sin(math.radians(a)), (255, 255, 255))
        # The CORE is the rule; the ring above is only the tap target.
        for a in range(0, 360, 2):
            put(x + PAD_CORE_RADIUS * math.cos(math.radians(a)),
                y + PAD_CORE_RADIUS * math.sin(math.radians(a)), (255, 40, 40))
    raw = bytearray()
    for y in range(CANVAS_H):
        raw.append(0)
        raw += buf[y * CANVAS_W * 3:(y + 1) * CANVAS_W * 3]

    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c))
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', CANVAS_W, CANVAS_H, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b''))


# --------------------------------------------------------------------- main

def fork_point(a, b):
    """Where two routes from the same gate stop agreeing.

    The last pixel the entrance-to-exit-one path and the entrance-to-exit-two
    path have in common. That is the fork, and it is FOUND rather than declared:
    a fork read off the picture by eye is the one number in this file nothing
    else could check.
    """
    sa = {p: i for i, p in enumerate(a)}
    best, ia, ib = None, 0, 0
    for j, p in enumerate(b):
        if p in sa and sa[p] >= ia:
            best, ia, ib = p, sa[p], j
    return best, ia, ib


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay')
    ap.add_argument('--out', default='tools/level8_geometry.json')
    ap.add_argument('--pads', type=int, default=0,
                    help='0 = place as many as the rules allow, which is the honest number')
    ap.add_argument('--audit', action='store_true')
    args = ap.parse_args()

    if args.audit:
        kept, dropped = rejected_warm(PLATE)
        print(f'warm pixels kept as road: {kept}')
        print('warm pixels REJECTED for having no blue in them (the hazard striping):')
        for (r, g, b), n in dropped:
            print(f'  rgb~({r},{g},{b})  {n:6d}  r-g {r - g}  g-b {g - b}')
        print()

    kind = despeckle(classify(PLATE), 90)
    raw = bytearray(1 if k == ROAD else 0 for k in kind)
    # See `close_gaps`: the red scanning line and the cables cut the road in two.
    bridged = close_gaps(raw, CLOSE_RADIUS)
    for i in range(len(kind)):
        if bridged[i] and kind[i] != ROAD:
            kind[i] = ROAD
    road = largest(kind, ROAD)
    print(f'road pixels {sum(road)} of {sum(1 for k in kind if k == ROAD)} classified '
          f'({sum(raw)} before the gaps were bridged; the rest is not connected to the road)')
    print(f'carpet pixels {sum(1 for k in kind if k == CARPET)}')

    openings = edge_openings(road)
    runs = []
    for name, rr in openings.items():
        # A run of one or two pixels is a corner touching the frame, not a road.
        big = [r for r in rr if r[1] - r[0] >= 4]
        for r in big:
            runs.append((name, r))
        print(f'  {name:6s} touches the edge at {big}' + (f'  (ignored specks {[r for r in rr if r not in big]})' if len(rr) != len(big) else ''))
    print(f'OPENINGS FOUND: {len(runs)}')
    for name, r in runs:
        mid = (r[0] + r[1]) // 2
        span = r[1] - r[0] + 1
        if name in ('west', 'east'):
            print(f'  {name:6s} centre y {mid} = {mid / CANVAS_H:.1%} of height, {span} px tall')
        else:
            print(f'  {name:6s} centre x {mid} = {mid / CANVAS_W:.1%} of width, {span} px wide')

    dist = distance_transform(road)
    gates, spans = {}, {}
    for name, r in runs:
        mid = (r[0] + r[1]) // 2
        spans[name] = [r[0], r[1]]
        gates[name] = (0, mid) if name == 'west' else \
                      (CANVAS_W - 1, mid) if name == 'east' else \
                      (mid, 0) if name == 'north' else (mid, CANVAS_H - 1)

    entrance = gates['west']
    exits = {n: p for n, p in gates.items() if n != 'west'}
    walks = {}
    for name, at in exits.items():
        path = geodesic(road, dist, entrance, at)
        if path is None:
            print(f'  NO PATH from the entrance to {name}')
            return
        walks[name] = path
        print(f'  entrance -> {name}: {len(path)} px walked, {path_length(path):.1f} long')

    names = sorted(walks)
    fork, ia, ib = fork_point(walks[names[0]], walks[names[1]])
    if fork is None:
        print('  the two routes share no pixel; that is not a fork')
        return
    shared = walks[names[0]][:ia + 1]
    branches = {names[0]: walks[names[0]][ia:], names[1]: walks[names[1]][ib:]}
    print(f'fork at {fork}: shared {path_length(shared):.1f}, '
          + ', '.join(f'{n} {path_length(b):.1f}' for n, b in branches.items()))

    # THE WIDTH IS THE SHARED SPINE'S, and the bottom mouth is left out of it on
    # purpose -- the art spreads to about 2.8 road widths where it meets the
    # frame, and a median taken through that is a third too high.
    width = lane_width(road, shared)
    print(f'road width (shared spine median): {width}')
    for n, b in branches.items():
        print(f'  {n} branch median (not used): {lane_width(road, b)}')

    lines = {'shared': shared, **branches}
    simple = {n: simplify(l, 1.2) for n, l in lines.items()}
    # What the pads are measured to -- see `densify`.
    shipped = {n: densify(l) for n, l in simple.items()}
    total = path_length(shared) + max(path_length(b) for b in branches.values())
    print(f'route length, longest way round: {total:.1f}')

    clear = distance_transform(bytearray(1 if kind[i] == CARPET else 0 for i in range(len(kind))))
    to_lane = dist_to_lines(list(shipped.values()))
    pads = pick_pads(kind, clear, to_lane, fork, shipped, args.pads or 999)
    print(f'\npads placed: {len(pads)}')
    for i, (x, y) in enumerate(pads):
        near = min(math.hypot(x - px_, y - py_) for l in shipped.values() for px_, py_ in l)
        print(f'  pad {i:2d} ({x:4d},{y:4d})  {near:5.1f} from a lane, {clear[y * CANVAS_W + x]:5.1f} clear')
    if len(pads) > 1:
        closest = min(math.hypot(a[0] - b[0], a[1] - b[1])
                      for i, a in enumerate(pads) for b in pads[i + 1:])
        print(f'closest pair: {closest:.2f} px (needs >= {PAD_SPACING})')
    cov = coverage(pads, shipped)
    tot = sum(len(l) for l in shipped.values())
    hit = sum(cov[n] * len(shipped[n]) for n in cov)
    print(f'lane coverage {cov}  whole route {hit / tot:.1%}')

    # level4_geometry.json's shape, with the two things level 8 has that level 4
    # does not: one entrance instead of two, and a FORK instead of a merge.
    out = {
        'world': [CANVAS_W, CANVAS_H],
        'plate': [3840, 2160],
        'entrance': list(entrance),
        'fork': [round(fork[0], 2), round(fork[1], 2)],
        'exits': {n: list(p) for n, p in exits.items()},
        'shared': [[round(x, 2), round(y, 2)] for x, y in simple['shared']],
        'branches': {n: [[round(x, 2), round(y, 2)] for x, y in simple[n]] for n in branches},
        'lengths': {n: round(path_length(l), 2) for n, l in lines.items()},
        'routes': {n: round(path_length(shared) + path_length(b), 2) for n, b in branches.items()},
        'roadLength': round(sum(path_length(l) for l in lines.values()), 2),
        'routeLength': round(total, 2),
        'roadWidth': width,
        'spawnOpening': list(spans['west']),
        'exitOpenings': {n: list(spans[n]) for n in exits},
        'towerRange': TOWER_RANGE,
        'padCoreRadius': PAD_CORE_RADIUS,
        'padFootprintRadius': SPOT_RADIUS,
        'pads': [[x, y] for x, y in pads],
        'buildSpots': [[x, y] for x, y in pads],
        'coverage': cov,
    }
    json.dump(out, open(os.path.join(ROOT, args.out), 'w'), indent=1)
    print(f'wrote {args.out}')
    if args.overlay:
        write_overlay(os.path.join(ROOT, args.overlay), simple, pads)
        print(f'wrote {args.overlay}')


if __name__ == '__main__':
    main()
