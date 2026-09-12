"""Derive level 7's three lanes, road widths and build pads from the painted plate.

    python3 tools/trace_level7.py --overlay tools/L7_pads_overlay.png

Level 7 is a desert highway: three dark grey asphalt highways running straight
across the plate, left to right, over tan and olive scrub, with cacti, rocks,
power poles, cones, guard rails and road signs on the ground between them.

This is tools/trace_level8.py's method, which is tools/trace_level5.py's, which
is tools/trace_map.py's: classify every pixel, take the connected runs of road,
walk a geodesic down the MIDDLE of the painted band rather than the shortest
chord, and put the pads on ground that will take one. Nothing here is traced or
typed by hand.

FOUR THINGS ABOUT THIS PLATE, three from the brief and one the brief did not
know:

  THE WHITE EDGE LINES AND THE YELLOW CENTRE DASHES ARE PART OF THE ROAD. A
  colour classifier does not think so: the asphalt is a desaturated dark grey
  (about RGB 63,62,73, saturation 10, luminance 66), an edge line is white
  (241,244,246) and a centre dash is saturated yellow (255,224,4), so a plain
  grey test hands back a highway with a yellow slot cut down the middle of it
  and its white kerbs shaved off. Cut at the centre dash, ONE highway becomes
  two lanes and every width figure is halved.

  So the road mask is a MORPHOLOGICAL RECONSTRUCTION rather than a colour test:
  grey asphalt seeds it and it grows into white and yellow paint that the
  asphalt touches. Scrub is warm (r > g > b with r-b around 140) and can never
  join, and a white sign face or a white-painted post out on the scrub is not
  adjacent to any asphalt, so it cannot either.

  HOW THAT WAS CONFIRMED, rather than assumed: `--audit` masks the same plate a
  second way, grey asphalt alone, and counts the components. It finds NINE
  full-width bands instead of three. Each white edge line runs the entire width
  of the plate, so it cuts its highway lengthwise into the kerb outline above
  it, the carriageway, and the outline below -- 4 + 56 + 3 px where this trace
  reads one 67 px lane. Taken at face value that is six lanes of half the width
  plus six slivers, and every road width on the level is 16% light.

  The centre dashes do their damage differently, and it took three findings to
  see it. A dash is outlined, the outline reads as neither asphalt nor paint,
  and the resulting 1-4 px slit runs along the middle of the highway wherever
  there is a dash. It does not sever the band -- the gaps between dashes
  reconnect it -- so a component count cannot see it, and it still wrecks the
  trace: the depth transform's deepest point moves off the road's centre and
  into the middle of one carriageway, and the geodesic follows. The north lane
  came out at y=133 against the band's own centre of 151, and the south lane
  entered in one carriageway (y=499) and left in the other (y=536). `closing`
  is what fixes it and says so.

  THREE SEPARATE HIGHWAYS THAT NEVER MEET. Each is its own connected component,
  each spans the full width, each has one opening on the west edge and one on
  the east, and the nearest approach between any two of them is a whole scrub
  median. All of that is measured here and re-measured by check_level7.py --
  the count, the openings and the separation -- because "three independent
  lanes" is the premise the level's whole design rests on.

  ONE PROP IS ASPHALT-COLOURED AND TOUCHES THE ROAD. A post at x about 1220
  hangs off the bottom highway's lower kerb and runs 100 px down into the scrub
  in a band 5 px wide, which made that component 171 px tall against its
  siblings' 69 and 76. It is removed by an OPENING -- erode by 4, keep what
  survives, dilate back and intersect with the original paint -- which cannot
  touch a 70 px highway and cannot leave a 5 px tendril. `--audit` prints what
  the opening removed.

Nothing at runtime depends on this. It is the record of where
tools/level7_geometry.json came from and how to redo it when the art changes.
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
PLATE = os.path.join(ROOT, 'art-source/map_level7.png')

# The plate fills a 1280x720 canvas whatever its own size, so canvas pixels are
# the map's coordinate space and the mask is built directly in them.
CANVAS_W, CANVAS_H = 1280, 720

ASPHALT, PAINT, SCRUB, BLOCK = 1, 2, 3, 0

# What a pad needs, all in canvas pixels, and all LEVELS 3, 4 AND 8's rather
# than level 5's. The brief for this level expected the standoff band to have to
# be relaxed the way level 5's was -- the medians are only about 110 px tall, so
# a pad in one stands about 55 px off the asphalt, half of what levels 2 to 4
# hold. Measured the way those levels measure it, which is centre to lane
# CENTRELINE and not to the kerb, it does not need relaxing: 55 px of scrub plus
# a 35 px half-width is a 90 px standoff, which is the band's own near edge. It
# is left where the other levels put it and what falls out is reported.
PAD_CORE_RADIUS = 24
TOWER_RANGE = 112       # the shortest range in the tower pool
PAD_MIN_FROM_LANE = 90
PAD_MAX_FROM_LANE = 114
PAD_SPACING = 74        # level 4's separation, and the tightest pair it allows
SPOT_RADIUS = 34
# A pad's TAP TARGET has to be fully on the board, so a pad may not sit closer
# than its own footprint to a frame edge. Level 8's rule, and it bites here for
# the same reason it bit there: these roads run out to both vertical edges, so
# the pads beside them run out to the corners too.
PAD_EDGE_MARGIN = SPOT_RADIUS
# The opening that removes the asphalt-coloured post -- see the module header.
# 4 removes anything under 8 px across and cannot dent a 69 px highway.
OPEN_RADIUS = 4
# The closing that bridges the outline either side of a centre dash. 3 bridges a
# slit up to 6 px wide and cannot reach across the 111 px median between two
# highways. See `closing`.
CLOSE_RADIUS = 3

# Candidate pads are considered on a grid and lane coverage is measured on every
# Nth traced point, which is trace_level8.py's compromise and for its reasons:
# pads sit 74 px apart so a 4 px grid cannot miss a placement, and a 4 px error
# on a 112 px range is not a real error.
PAD_GRID = 4
LANE_STRIDE = 4


# --------------------------------------------------------------- classify

def classify(path):
    """Asphalt, road paint, scrub or blocked, at canvas resolution.

    Four bands, all measured off this plate rather than carried over:

      ASPHALT  desaturated and dark. The road reads (63,62,73) mid-lane, with a
               near-black outline along each kerb; saturation never passes 40
               and luminance never reaches 130.
      PAINT    the white edge lines (241,244,246) and the yellow centre dashes
               (255,224,4). Both are ROAD -- see the module header -- but they
               are classified apart so the reconstruction can require them to
               be touching asphalt before they count.
      SCRUB    the tan and olive ground, warm, with red over green over blue.
               r-b >= 70 separates it from everything grey; the ceiling on
               luminance keeps the white lines out of it.
      BLOCKED  the cacti, rocks, poles, cones, guard rails and signs.
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
            sat = max(r, g, b) - min(r, g, b)
            lum = (r + g + b) // 3
            if sat <= 40 and lum < 130:
                k = ASPHALT
            elif sat <= 44 and lum >= 165:
                k = PAINT                       # a white edge line
            elif g - b >= 150 and r - g >= 20:
                k = PAINT                       # a yellow centre dash
            elif r > g > b and r - b >= 70 and 60 <= lum < 210:
                k = SCRUB
            else:
                k = BLOCK
            kind[y * CANVAS_W + x] = k
    return w, h, px, kind


def reconstruct(kind):
    """Road: asphalt, plus the paint the asphalt touches.

    A morphological reconstruction, which is the whole answer to the third thing
    the brief warns about. Grey asphalt is the seed and white and yellow paint is
    the mask it may grow into, so an edge line or a centre dash is road because
    it is PART OF a highway and a white sign face out on the scrub is not,
    without either being a special case. Nothing warm can ever be reached, so
    the scrub is safe however yellow a dash is.
    """
    road = bytearray(1 if k == ASPHALT else 0 for k in kind)
    grow = bytearray(1 if k in (ASPHALT, PAINT) else 0 for k in kind)
    q = deque(i for i in range(len(road)) if road[i])
    while q:
        i = q.popleft()
        x, y = i % CANVAS_W, i // CANVAS_W
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < CANVAS_W and 0 <= ny < CANVAS_H:
                j = ny * CANVAS_W + nx
                if grow[j] and not road[j]:
                    road[j] = 1
                    q.append(j)
    return road


def fill_holes(mask, max_area):
    """Fill enclosed holes in a mask smaller than `max_area`.

    The asphalt is painted with grit and the odd patch of dust, and a mask full
    of pinholes stops every normal cast across the road two pixels in and
    derails a geodesic trying to stay in the middle of it. Only enclosed holes
    are filled: anything open to the frame is the ground outside the road.
    """
    hole = bytearray(1 if not mask[i] else 0 for i in range(len(mask)))
    filled = 0
    for comp in components(hole):
        if len(comp) > max_area:
            continue
        if any(i % CANVAS_W in (0, CANVAS_W - 1) or i // CANVAS_W in (0, CANVAS_H - 1)
               for i in comp):
            continue
        for i in comp:
            mask[i] = 1
        filled += len(comp)
    return filled


def components(mask):
    """Every connected run of a mask, as lists of pixel indices, largest first."""
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


def sweep(src, r, keep_if_all):
    """One morphological pass with a radius-r disc: erode (all) or dilate (any).

    OFF-FRAME LEFT AND RIGHT COUNTS AS INSIDE THE MASK, off-frame top and bottom
    does not. Every highway here runs out through the west and east edges, so an
    erode that treats the frame as a wall eats r px off all six mouths and moves
    every terminal inboard; no road touches the top or bottom edge, so there the
    frame really is the end of the paint.
    """
    W, H = CANVAS_W, CANVAS_H
    box = [(dx, dy) for dy in range(-r, r + 1) for dx in range(-r, r + 1)
           if dx * dx + dy * dy <= r * r]
    out = bytearray(W * H)
    for y in range(H):
        for x in range(W):
            hit = keep_if_all
            for dx, dy in box:
                xx, yy = x + dx, y + dy
                if not (0 <= xx < W):
                    continue                    # off the west/east frame: inside
                v = 0 if not (0 <= yy < H) else src[yy * W + xx]
                if keep_if_all and not v:
                    hit = False
                    break
                if not keep_if_all and v:
                    hit = True
                    break
            out[y * W + x] = 1 if hit else 0
    return out


def closing(mask, r):
    """Dilate then erode, so a hairline slit ACROSS the road does not cut it.

    THE CENTRE DASHES ARE OUTLINED and the outline is the one thing on this
    plate that no colour test can place. A dash's core is saturated yellow and
    unmistakable, but the antialiased rim either side of it runs through mid
    olive -- (150,114,23), with g-b 91 -- and the SCRUB it has to be told apart
    from is olive too, at g-b up to 96. There is no threshold between them.

    So the rim is left misclassified and closed over instead. It cost three
    findings before it was: the slit is 1 to 4 px wide, it splits the depth
    transform, and the geodesic then runs down the middle of the UPPER
    CARRIAGEWAY rather than the middle of the road -- the north lane came out at
    y=133 against the band's own centre of 151, and the south lane started in
    one carriageway at the west mouth (y=499) and finished in the other at the
    east (y=536). At the frame edge the slit is not even an enclosed hole, so
    filling holes cannot reach it, and it split all six mouths in two.

    A close bridges a gap up to 2r wide and leaves the mask's own edges where
    they were. r=3 cannot join two highways 111 px apart.
    """
    return bytearray(1 if v else 0 for v in sweep(sweep(mask, r, False), r, True))


def opening(mask, r):
    """Erode then dilate, intersected back with the original.

    THE POST THAT HANGS OFF THE BOTTOM HIGHWAY. It is asphalt-coloured, it
    touches the kerb, and it runs 100 px down into the scrub in a band 5 px
    wide, so the bottom component measured 171 px tall against the middle one's
    76. A largest-component pass cannot help -- it is the same component -- and
    a width median survives it while the component's own extent does not, which
    is exactly the kind of number a later check would take on trust.

    An erode-then-dilate deletes anything narrower than 2r and leaves everything
    wider roughly where it was. It also shaves the 1 px teeth off an antialiased
    kerb, which is why the band extents come out 1-2 px tighter than the raw
    mask's and closer to the brief's own figures; `--audit` prints both.
    """
    grown = sweep(sweep(mask, r, True), r, False)
    removed = 0
    for i in range(CANVAS_W * CANVAS_H):
        if mask[i] and not grown[i]:
            removed += 1
        mask[i] = 1 if (mask[i] and grown[i]) else 0
    return removed


# ---------------------------------------------------------------- distances

def distance_transform(mask, inside=1):
    """Chamfer distance from every `inside` pixel to the nearest that is not.

    Two sweeps rather than an exact transform: this one keeps a path in the
    middle of the road and holds a pad's core off the props, and a percent of
    error in either is invisible on a 70 px road. The PAD STANDOFF is measured
    exactly instead -- see `dist_to_lines`, and level 8's report on why.

    THE WEST AND EAST FRAME EDGES ARE NOT EDGES OF THE ROAD. Every highway here
    runs off both of them, so counting the frame as a boundary makes the road
    look 35 px narrower at each mouth and drags the geodesic's own idea of the
    middle sideways as it approaches the gate. Off-frame left and right is
    treated as road; off-frame top and bottom is not, because no road touches
    those.
    """
    INF = 1 << 20
    W, H = CANVAS_W, CANVAS_H
    d = [0 if mask[i] != inside else INF for i in range(len(mask))]
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if d[i] == 0:
                continue
            best = d[i]
            if x:
                best = min(best, d[i - 1] + 5)
            if y:
                best = min(best, d[i - W] + 5)
                if x:
                    best = min(best, d[i - W - 1] + 7)
                if x + 1 < W:
                    best = min(best, d[i - W + 1] + 7)
            d[i] = best
    for y in range(H - 1, -1, -1):
        for x in range(W - 1, -1, -1):
            i = y * W + x
            if d[i] == 0:
                continue
            best = d[i]
            if x + 1 < W:
                best = min(best, d[i + 1] + 5)
            if y + 1 < H:
                best = min(best, d[i + W] + 5)
                if x + 1 < W:
                    best = min(best, d[i + W + 1] + 7)
                if x:
                    best = min(best, d[i + W - 1] + 7)
            d[i] = best
    return [v / 5.0 for v in d]


def road_depth(road):
    """Distance from every road pixel to the nearest pixel that is not road,
    with the west and east frame edges treated as road rather than as kerb.

    See `distance_transform`: a highway that runs off the frame is not narrow
    there, and a depth map that says it is bends the geodesic into the middle of
    the mouth instead of straight out through it.
    """
    W, H = CANVAS_W, CANVAS_H
    d = [10 ** 9] * (W * H)
    q = deque()
    for i in range(W * H):
        if not road[i]:
            d[i] = 0
            q.append(i)
    while q:
        i = q.popleft()
        x, y = i % W, i // W
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < H):
                continue
            j = ny * W + nx
            if d[j] > d[i] + 1:
                d[j] = d[i] + 1
                q.append(j)
    return d


# ------------------------------------------------------------------ tracing

def edge_runs(mask):
    """Where a mask meets each edge of the plate, as runs of pixels."""
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                out.append((s, i - 1))
                s = None
        return out
    W, H = CANVAS_W, CANVAS_H
    return {
        'west': runs(mask[y * W] for y in range(H)),
        'east': runs(mask[y * W + W - 1] for y in range(H)),
        'north': runs(mask[x] for x in range(W)),
        'south': runs(mask[(H - 1) * W + x] for x in range(W)),
    }


def geodesic(road, depth, start, goal):
    """A path down the MIDDLE of the painted band, start to goal.

    Dijkstra with a cost that rises as a pixel approaches the kerb, so the
    cheapest route is the centreline rather than the shortest chord. On a
    straight highway the two are nearly the same line, which is a reason to
    keep the weighting and not a reason to drop it: it is what puts the walk
    down the middle of a lane the art has crowned or shaded unevenly, and it
    is the same walk levels 5, 6 and 8 are traced with.
    """
    W = CANVAS_W
    INF = float('inf')
    best = [INF] * len(road)
    prev = [-1] * len(road)
    s = start[1] * W + start[0]
    g = goal[1] * W + goal[0]
    best[s] = 0.0
    q = [(0.0, s)]
    while q:
        c, i = heapq.heappop(q)
        if c > best[i]:
            continue
        if i == g:
            break
        x, y = i % W, i // W
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < CANVAS_H):
                continue
            j = ny * W + nx
            if not road[j]:
                continue
            hug = 1.0 + 24.0 / max(1.0, depth[j])
            nc = c + math.hypot(dx, dy) * hug
            if nc < best[j]:
                best[j] = nc
                prev[j] = i
                heapq.heappush(q, (nc, j))
    if best[g] == INF:
        return None
    out, i = [], g
    while i != -1:
        out.append((i % W, i // W))
        i = prev[i]
    return out[::-1]


def simplify(pts, eps):
    """Douglas-Peucker, so a 1,280-pixel walk becomes a readable waypoint list."""
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


def lane_width(road, line, margin=40):
    """The painted road's width along a centreline: the median of its normals.

    THE MOUTHS ARE LEFT OUT. Where a highway runs off the frame the cast can
    only measure the paint that is on the canvas, and near the corner of a mask
    the normal clips the frame rather than the kerb. `margin` drops the samples
    within that distance of either vertical edge; on a straight lane it changes
    nothing, and it is the difference between a width and a width plus an
    artefact on any lane whose mouth is drawn wider.
    """
    widths = []
    for k in range(1, len(line) - 1):
        cx, cy = line[k]
        if cx < margin or cx > CANVAS_W - 1 - margin:
            continue
        (x0, y0), (x1, y1) = line[k - 1], line[k + 1]
        L = math.hypot(x1 - x0, y1 - y0)
        if L == 0:
            continue
        nx, ny = -(y1 - y0) / L, (x1 - x0) / L
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

    THE PADS ARE MEASURED AGAINST THE LINE THE GEOMETRY FILE SHIPS, which is the
    SIMPLIFIED polyline -- that is what becomes the map's waypoints and what
    check_level7.py measures against. Level 8 measured against the raw geodesic
    instead and eleven of its twenty pads then sat outside the band the file
    said they were in.
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

def dist_to_line(line):
    """EXACT distance from every canvas pixel to one lane centreline.

    Danielsson's transform: every pixel carries the OFFSET to its nearest source
    rather than a distance, and two sweeps propagate offsets. A chamfer will not
    do -- it overestimates by up to 5.6% at about 22 degrees off an axis, which
    is enough to pass a pad at 85 px through a `>= 90` test, and level 8 shipped
    eleven of those before its checker measured them the honest way.

    ONE LANE AT A TIME, because on this plate the per-lane distances are the
    answer rather than an intermediate: a pad that is within tower range of TWO
    lane centrelines covers two highways at once, and that is the defining
    tactical fact about the board.
    """
    FAR = 10 ** 4
    W, H = CANVAS_W, CANVAS_H
    vx = [FAR] * (W * H)
    vy = [FAR] * (W * H)
    for (x, y) in line:
        X, Y = int(round(x)), int(round(y))
        if 0 <= X < W and 0 <= Y < H:
            vx[Y * W + X] = 0
            vy[Y * W + X] = 0

    def better(i, j, dx, dy):
        ax, ay = vx[j] + dx, vy[j] + dy
        if ax * ax + ay * ay < vx[i] * vx[i] + vy[i] * vy[i]:
            vx[i], vy[i] = ax, ay

    for y in range(H):
        for x in range(W):
            i = y * W + x
            if y:
                better(i, i - W, 0, 1)
                if x:
                    better(i, i - W - 1, 1, 1)
                if x + 1 < W:
                    better(i, i - W + 1, -1, 1)
            if x:
                better(i, i - 1, 1, 0)
        for x in range(W - 2, -1, -1):
            better(y * W + x, y * W + x + 1, -1, 0)
    for y in range(H - 1, -1, -1):
        for x in range(W):
            i = y * W + x
            if y + 1 < H:
                better(i, i + W, 0, 1)
                if x:
                    better(i, i + W - 1, 1, 1)
                if x + 1 < W:
                    better(i, i + W + 1, -1, 1)
            if x:
                better(i, i - 1, 1, 0)
        for x in range(W - 2, -1, -1):
            better(y * W + x, y * W + x + 1, -1, 0)
    return [math.hypot(vx[i], vy[i]) for i in range(W * H)]


def core_on_scrub(kind, cx, cy):
    """Is every pixel of the pad's radius-24 core classified scrub?

    LEVELS 3 AND 4 SPELL "24 px core" AS A DISC OF RADIUS 24 -- both their
    checkers walk `dx*dx + dy*dy <= 24*24` -- so a pad's cleared footprint is 48
    px across. This is theirs, walked pixel by pixel rather than taken off a
    chamfer, because the classifier can round a hairline prop away and a cactus
    is exactly that shape.
    """
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
            if not (0 <= x < CANVAS_W) or kind[row + x] != SCRUB:
                return False
    return True


def pick_pads(kind, clear, per_lane, shipped, want):
    """As many pads as the rules allow, best first. THE NUMBER IS NOT A TARGET.

    The four properties are levels 3, 4 and 8's own, unchanged:
      ON SCRUB    the pad's radius-24 core sits entirely on classified scrub, so
                  it is clear of the asphalt, the edge lines, the dashes and
                  every cactus, rock, pole, cone, rail and sign.
      STANDOFF    90 to 114 px from the NEAREST lane centreline.
      APART       at least 74 px between centres, level 4's figure.
      BEST FIRST  ordered by how much UNCOVERED lane the pad would add, and
                  stopped when the best pad left adds none.

    ON THIS BOARD "BEST FIRST" IS THE WHOLE STORY, and it is worth saying why
    before anyone reads the count. A pad in one of the two medians is inside
    tower range of the highway on each side of it, so it adds up to twice the
    lane a pad in the top or bottom strip can, and the greedy therefore fills
    the medians before it touches the outer strips. That is not a thumb on the
    scale -- it is the same rule levels 3, 4 and 8 use, meeting a board where
    two of the four buildable strips are worth double.
    """
    half = PAD_CORE_RADIUS
    pts = [(n, k, p) for n, line in shipped.items()
           for k, p in enumerate(line[::LANE_STRIDE])]
    to_lane = [min(per_lane[n][i] for n in per_lane) for i in range(CANVAS_W * CANVAS_H)]
    cand = []
    lo = PAD_EDGE_MARGIN
    for y in range(lo, CANVAS_H - lo, PAD_GRID):
        for x in range(lo, CANVAS_W - lo, PAD_GRID):
            i = y * CANVAS_W + x
            if kind[i] != SCRUB or clear[i] < half:
                continue
            if not (PAD_MIN_FROM_LANE <= to_lane[i] <= PAD_MAX_FROM_LANE):
                continue
            if not core_on_scrub(kind, x, y):
                continue
            reach = {(n, k) for n, k, p in pts
                     if math.hypot(x - p[0], y - p[1]) <= TOWER_RANGE}
            cand.append((x, y, reach))

    covered = set()
    taken = []
    live = list(cand)
    while len(taken) < want and live:
        live = [c for c in live
                if not any(math.hypot(c[0] - px_, c[1] - py_) < PAD_SPACING
                           for px_, py_ in taken)]
        if not live:
            break
        best = max(live, key=lambda c: (len(c[2] - covered), -c[1], c[0]))
        if not len(best[2] - covered):
            # NOTHING LEFT ADDS REACH, and that is where the board stops. Level
            # 8's stop condition, for level 8's reason: "keep placing while
            # anything still fits" measures how much scrub is inside the
            # standoff band, which on a board of long straight strips is a much
            # bigger number than how many guns the board can usefully hold.
            break
        taken.append((best[0], best[1]))
        covered |= best[2]
    return taken, cand


def coverage(pads, shipped):
    """How much of each lane is inside some pad's tower range, as a fraction."""
    out = {}
    for name, line in shipped.items():
        n = sum(1 for (px_, py_) in line
                if any(math.hypot(x - px_, y - py_) <= TOWER_RANGE for x, y in pads))
        out[name] = round(n / max(1, len(line)), 3)
    return out


def uncovered_spans(pads, shipped, min_run=12):
    """The stretches of each lane no pad can reach, as x ranges.

    A COVERAGE FRACTION DOES NOT SAY WHERE THE HOLE IS, and on this board that
    is the only part of it a wave designer can use: 10% of a lane spread evenly
    is a board with thin spots, and 10% at the mouth is a free run every enemy
    gets on the way in. Runs under `min_run` px are the arithmetic of a 4 px
    candidate grid rather than a gap in the guns.
    """
    out = {}
    for name, line in shipped.items():
        runs, start = [], None
        for i, (px_, py_) in enumerate(line):
            hit = any(math.hypot(x - px_, y - py_) <= TOWER_RANGE for x, y in pads)
            if not hit and start is None:
                start = i
            elif hit and start is not None:
                if i - start >= min_run:
                    runs.append([round(line[start][0], 1), round(line[i - 1][0], 1)])
                start = None
        if start is not None and len(line) - start >= min_run:
            runs.append([round(line[start][0], 1), round(line[-1][0], 1)])
        out[name] = runs
    return out


# ------------------------------------------------------------------ overlay

def write_overlay(path, w, h, px, shipped, pads):
    """The plate at CANVAS resolution with the lanes and the pads drawn on it.

    THE ONLY HONEST WAY TO CHECK THAT A TRACED ROUTE FOLLOWS A PAINTED ROAD, and
    on this plate it is also the only way to see that a lane is not sitting on a
    centre dash or a kerb. 1280x720 rather than the plate's 1672x941, which is
    every other level's overlay size: canvas pixels are the map's coordinate
    space, so a full-resolution overlay is a bigger file for no more
    information.
    """
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
    # NOT YELLOW FOR THE SOUTH LANE. The road's own centre dashes are yellow,
    # and an overlay whose line is the same colour as the paint it is meant to
    # be checked against proves nothing.
    colour = {'north': (255, 60, 60), 'middle': (60, 200, 255), 'south': (255, 60, 255)}
    for name, line in shipped.items():
        c = colour.get(name, (255, 255, 255))
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

def band_extent(comp):
    """A road component's vertical extent, as the median top and bottom row.

    THE MEDIAN PER COLUMN, not the minimum and maximum over the whole blob. The
    extremes are one shaded corner or one lump of kerb; what a road height means
    is what the band measures where it is just a road.
    """
    top, bot = {}, {}
    for i in comp:
        x, y = i % CANVAS_W, i // CANVAS_W
        top[x] = min(top.get(x, 10 ** 9), y)
        bot[x] = max(bot.get(x, -1), y)
    tops = sorted(top.values())
    bots = sorted(bot.values())
    return tops[len(tops) // 2], bots[len(bots) // 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay')
    ap.add_argument('--out', default='tools/level7_geometry.json')
    ap.add_argument('--pads', type=int, default=0,
                    help='0 = place as many as the rules allow, which is the honest number')
    ap.add_argument('--audit', action='store_true')
    args = ap.parse_args()

    w, h, px, kind = classify(PLATE)
    total = CANVAS_W * CANVAS_H
    print(f'plate {os.path.relpath(PLATE, ROOT)}  {w}x{h} -> {CANVAS_W}x{CANVAS_H}')
    for name, v in (('asphalt', ASPHALT), ('paint', PAINT), ('scrub', SCRUB),
                    ('blocked', BLOCK)):
        c = kind.count(v)
        print(f'  {name:8s} {c:7d}  {c * 100 / total:5.1f}%')

    grey_only = bytearray(1 if k == ASPHALT else 0 for k in kind)
    road = reconstruct(kind)
    print(f'  road, asphalt + the paint it touches: {sum(road)} px '
          f'({sum(road) * 100 / total:.1f}%), {sum(road) - sum(grey_only)} px of it paint')
    road = closing(road, CLOSE_RADIUS)
    print(f'  closing at r={CLOSE_RADIUS} bridged the dash outlines: {sum(road)} px')
    filled = fill_holes(road, 120)
    print(f'  {filled} px of enclosed pinholes filled')
    raw_extents = {}
    for c in components(road):
        xs = [i % CANVAS_W for i in c]
        if len(c) > 2000 and min(xs) == 0 and max(xs) == CANVAS_W - 1:
            raw_extents[band_extent(c)[0]] = band_extent(c)
    removed = opening(road, OPEN_RADIUS)
    print(f'  opening at r={OPEN_RADIUS} removed {removed} px of asphalt-coloured prop '
          f'and kerb teeth')

    comps = [c for c in components(road) if len(c) > 2000]
    full = []
    for c in comps:
        xs = [i % CANVAS_W for i in c]
        if min(xs) == 0 and max(xs) == CANVAS_W - 1:
            full.append(c)
    print(f'\n{len(comps)} road components over 2000 px; {len(full)} of them span the '
          f'full width')
    if len(full) != 3:
        print('  THAT IS NOT THREE HIGHWAYS. Stopping rather than writing geometry.')
        return
    full.sort(key=lambda c: band_extent(c)[0])
    names = ['north', 'middle', 'south']

    if args.audit:
        # HOW THE PAINT WAS CONFIRMED TO BE PART OF THE ROAD, which the brief
        # asks for explicitly. The same plate is masked a second way -- grey
        # asphalt only, no reconstruction and no closing -- and the components
        # are counted. If the white lines and yellow dashes were separate
        # features, dropping them would leave the same three bands a little
        # thinner. They are not: it leaves SIX, because each highway is cut
        # lengthwise at its centre dash, and a naive trace would hand the level
        # six lanes of half the width.
        print('\n--- is a highway one lane or two? the grey-only mask, for comparison ---')
        grey = bytearray(grey_only)
        fill_holes(grey, 120)
        gfull = [c for c in components(grey)
                 if len(c) > 2000 and min(i % CANVAS_W for i in c) == 0
                 and max(i % CANVAS_W for i in c) == CANVAS_W - 1]
        print(f'  grey asphalt alone: {len(gfull)} full-width components against this '
              f'trace\'s {len(full)}')
        for c in sorted(gfull, key=lambda c: band_extent(c)[0]):
            t, b = band_extent(c)
            print(f'    rows {t:3d}-{b:3d} = {b - t + 1:3d} px tall '
                  f'({t / CANVAS_H:5.1%}-{(b + 1) / CANVAS_H:5.1%} of the height)')
        print('\n--- the raw mask against the opened one ---')
        for name, c in zip(names, full):
            t, b = band_extent(c)
            key = min(raw_extents, key=lambda k: abs(k - t))
            rt, rb = raw_extents[key]
            print(f'  {name:7s} opened rows {t}-{b} = {b - t + 1} px, '
                  f'raw rows {rt}-{rb} = {rb - rt + 1} px')

    print('\n--- the three highways ---')
    masks, extents = {}, {}
    for name, c in zip(names, full):
        m = bytearray(CANVAS_W * CANVAS_H)
        for i in c:
            m[i] = 1
        masks[name] = m
        extents[name] = band_extent(c)
        t, b = extents[name]
        runs = edge_runs(m)
        print(f'  {name:7s} {len(c):6d} px, rows {t}-{b} = {b - t + 1} px tall '
              f'({t / CANVAS_H:.1%}-{(b + 1) / CANVAS_H:.1%} of the height)')
        for edge in ('west', 'east', 'north', 'south'):
            big = [r for r in runs[edge] if r[1] - r[0] >= 4]
            if big:
                print(f'          {edge:5s} opening(s) {big}')
            if edge in ('north', 'south') and big:
                print(f'          <-- a highway touching the {edge} frame edge; the brief says '
                      f'all six terminals are on the vertical edges')

    print('\n--- the scrub strips between them ---')
    edges = [extents[n] for n in names]
    strips = [('above the north highway', 0, edges[0][0] - 1),
              ('between north and middle', edges[0][1] + 1, edges[1][0] - 1),
              ('between middle and south', edges[1][1] + 1, edges[2][0] - 1),
              ('below the south highway', edges[2][1] + 1, CANVAS_H - 1)]
    for label, a, b in strips:
        print(f'  {label:26s} rows {a:3d}-{b:3d} = {b - a + 1:3d} px tall')

    print('\n--- the lanes ---')
    lanes, shipped, simple = {}, {}, {}
    gates = {}
    for name in names:
        m = masks[name]
        runs = edge_runs(m)
        west = max(runs['west'], key=lambda r: r[1] - r[0])
        east = max(runs['east'], key=lambda r: r[1] - r[0])
        a = (0, (west[0] + west[1]) // 2)
        b = (CANVAS_W - 1, (east[0] + east[1]) // 2)
        gates[name] = {'entrance': a, 'exit': b,
                       'westSpan': [west[0], west[1]], 'eastSpan': [east[0], east[1]]}
        depth = road_depth(m)
        line = geodesic(m, depth, a, b)
        if line is None:
            print(f'  {name}: NO PATH from its west mouth to its east mouth')
            return
        lanes[name] = line
        simple[name] = simplify(line, 1.2)
        shipped[name] = densify(simple[name])
        print(f'  {name:7s} {a} -> {b}: {len(line)} px walked, {path_length(line):7.1f} long, '
              f'{len(simple[name])} vertices after simplify')

    print('\n--- road width per lane ---')
    widths = {}
    for name in names:
        widths[name] = lane_width(masks[name], lanes[name])
        t, b = extents[name]
        print(f'  {name:7s} median normal {widths[name]:3d} px   band extent '
              f'{b - t + 1:3d} px')

    print('\n--- do the three lanes ever touch? ---')
    # THE PREMISE OF THE WHOLE LEVEL, measured rather than assumed. Nearest
    # approach between two PAINTED bands, and between two shipped centrelines.
    gaps = {}
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            da = distance_transform(masks[a], inside=0)
            near = min(da[j] for j in range(total) if masks[b][j])
            centre = min(math.hypot(p[0] - q[0], p[1] - q[1])
                         for p in shipped[a][::8] for q in shipped[b][::8])
            gaps[f'{a}-{b}'] = (round(near, 1), round(centre, 1))
            print(f'  {a:7s} to {b:7s}: {near:5.1f} px of bare scrub between the paint, '
                  f'{centre:5.1f} px between centrelines')

    print('\n--- pads ---')
    scrub_clear = distance_transform(
        bytearray(1 if kind[i] == SCRUB else 0 for i in range(total)))
    per_lane = {n: dist_to_line(shipped[n]) for n in names}
    pads, cand = pick_pads(kind, scrub_clear, per_lane, shipped, args.pads or 999)
    print(f'{len(cand)} candidate positions on the grid -> {len(pads)} pads')
    # HOW MANY POSITIONS COULD COVER TWO HIGHWAYS, before the greedy chooses
    # any. The pad count below is what the placement rule allows; this is what
    # the BOARD allows, and the two-lane property has to be a fact about the
    # second or it is an artefact of the first.
    cand_two = sum(1 for x, y, _ in cand
                   if sum(1 for n in names if per_lane[n][y * CANVAS_W + x] <= TOWER_RANGE) >= 2)
    cand_strip = {}
    for x, y, _ in cand:
        label = next(la for la, a, b in strips if a <= y <= b)
        cand_strip[label] = cand_strip.get(label, 0) + 1
    print(f'  of those, {cand_two} ({cand_two * 100 / max(1, len(cand)):.0f}%) are inside tower '
          f'range of two lane centrelines at once')
    for label, a, b in strips:
        print(f'  {label:26s} {cand_strip.get(label, 0):4d} candidate position(s)')
    detail = []
    two_plus = 0
    for i, (x, y) in enumerate(pads):
        j = y * CANVAS_W + x
        d = {n: per_lane[n][j] for n in names}
        reach = sorted(n for n in names if d[n] <= TOWER_RANGE)
        if len(reach) >= 2:
            two_plus += 1
        strip = next(label for label, a, b in strips if a <= y <= b)
        detail.append({'centre': [x, y],
                       'toLane': {n: round(d[n], 1) for n in names},
                       'standoff': round(min(d.values()), 1),
                       'covers': reach, 'strip': strip})
        print(f'  pad {i:2d} ({x:4d},{y:3d})  north {d["north"]:6.1f}  middle {d["middle"]:6.1f}  '
              f'south {d["south"]:6.1f}   standoff {min(d.values()):5.1f}  '
              f'covers {len(reach)}: {",".join(reach)}')
    standoffs = sorted(p['standoff'] for p in detail)
    if standoffs:
        print(f'standoff to the nearest lane centreline: {standoffs[0]:.1f} - '
              f'{standoffs[-1]:.1f}, median {standoffs[len(standoffs) // 2]:.1f}  '
              f'(levels 2-4 hold theirs at {PAD_MIN_FROM_LANE}-{PAD_MAX_FROM_LANE}, '
              f'measured the same way)')
    if len(pads) > 1:
        closest = min(math.hypot(a[0] - b[0], a[1] - b[1])
                      for i, a in enumerate(pads) for b in pads[i + 1:])
        print(f'closest pair: {closest:.2f} px (needs >= {PAD_SPACING})')
    print(f'PADS THAT REACH TWO HIGHWAYS AT ONCE: {two_plus} of {len(pads)}')
    per_strip = {}
    for p in detail:
        per_strip[p['strip']] = per_strip.get(p['strip'], 0) + 1
    for label, a, b in strips:
        print(f'  {label:26s} {per_strip.get(label, 0):2d} pad(s)')
    cov = coverage(pads, shipped)
    gaps_in_cover = uncovered_spans(pads, shipped)
    print(f'lane coverage {cov}')
    for name in names:
        runs = gaps_in_cover[name]
        print(f'  {name:7s} unreachable stretches: '
              + (', '.join(f'x {a:.0f}-{b:.0f}' for a, b in runs) if runs else 'none'))

    out = {
        '_note': 'DERIVED by tools/trace_level7.py from art-source/map_level7.png. '
                 'Checked independently by tools/check_level7.py. Geometry only: the '
                 'roster, the waves and the boss mechanics are a separate pass.',
        '_lanes': 'THREE INDEPENDENT PARALLEL HIGHWAYS. Each has its own west entrance '
                  'and its own east exit, they never touch, and all three cost lives '
                  'when leaked. The nearest approach between any two painted bands is '
                  'recorded in `gaps` and re-measured by the checker.',
        '_paint': 'THE WHITE EDGE LINES AND THE YELLOW CENTRE DASHES ARE ROAD, and each '
                  'highway is therefore ONE lane. The mask is a morphological '
                  'reconstruction -- grey asphalt grown into the paint it touches -- '
                  'then closed, to bridge the outline either side of a dash. MEASURED, '
                  'both ways: a grey-asphalt-only mask of this plate comes apart into '
                  'NINE full-width bands rather than three, because every white edge '
                  'line runs the whole width and cuts its highway into kerb, '
                  'carriageway and kerb; and those carriageways measure 55, 63 and 60 '
                  'px against the 67, 75 and 71 here, so a grey-only trace would have '
                  'every road on the level 15-18% narrow. The dash outlines do not '
                  'sever a band -- the gaps between dashes reconnect it -- and they '
                  'still moved two of the three lanes off the road\'s centre before '
                  'the closing was added. See tools/check_level7.py, which re-tests '
                  'both.',
        '_standoff': 'THE HOUSE STANDOFF, NOT A RELAXED ONE. The medians are about 110 px '
                     'tall, so a pad in one stands about 55 px off the asphalt -- half '
                     'what levels 2 to 4 hold. Measured the way those levels measure it, '
                     'centre to lane CENTRELINE rather than to the kerb, 55 px of scrub '
                     'plus a 35 px half-width is 90 px, which is the band\'s own near '
                     'edge. Nothing was relaxed and nothing was forced.',
        'world': [CANVAS_W, CANVAS_H],
        'plate': [w, h],
        'lanesAre': names,
        'entrances': {n: list(gates[n]['entrance']) for n in names},
        'exits': {n: list(gates[n]['exit']) for n in names},
        'openings': {n: {'west': gates[n]['westSpan'], 'east': gates[n]['eastSpan'],
                         'westFraction': round((sum(gates[n]['westSpan']) / 2) / CANVAS_H, 4),
                         'eastFraction': round((sum(gates[n]['eastSpan']) / 2) / CANVAS_H, 4)}
                     for n in names},
        'lanes': {n: [[round(x, 2), round(y, 2)] for x, y in simple[n]] for n in names},
        'lengths': {n: round(path_length(lanes[n]), 2) for n in names},
        'roadLength': round(sum(path_length(lanes[n]) for n in names), 2),
        'roadWidth': sorted(widths.values())[1],
        'roadWidthPerLane': widths,
        'bandExtent': {n: [extents[n][0], extents[n][1]] for n in names},
        'bandHeight': {n: extents[n][1] - extents[n][0] + 1 for n in names},
        'groundStrips': [{'where': label, 'rows': [a, b], 'height': b - a + 1}
                         for label, a, b in strips],
        'gaps': {k: {'paintToPaint': v[0], 'centrelineToCentreline': v[1]}
                 for k, v in gaps.items()},
        'towerRange': TOWER_RANGE,
        'padCoreRadius': PAD_CORE_RADIUS,
        'padFootprintRadius': SPOT_RADIUS,
        'padStandoffBand': [PAD_MIN_FROM_LANE, PAD_MAX_FROM_LANE],
        'padSpacing': PAD_SPACING,
        'padsCoveringTwoLanes': two_plus,
        'candidatePositions': len(cand),
        'candidatePositionsCoveringTwoLanes': cand_two,
        'candidatePositionsPerStrip': cand_strip,
        'padsPerStrip': per_strip,
        'uncoveredLaneSpans': gaps_in_cover,
        'pads': [[x, y] for x, y in pads],
        'padDetail': detail,
        'buildSpots': [[x, y] for x, y in pads],
        'coverage': cov,
    }
    json.dump(out, open(os.path.join(ROOT, args.out), 'w'), indent=1)
    print(f'\nwrote {args.out}')
    if args.overlay:
        write_overlay(os.path.join(ROOT, args.overlay), w, h, px, simple, pads)
        print(f'wrote {args.overlay}')


if __name__ == '__main__':
    main()
