"""Check src/data/map_level2.json against the painted level 2 overlay.

Level 2 arrived differently from level 1. The first plate was traced out of the
painting by `trace_map.py`, which had to decide for itself what was road and
what was grass; this one came with the answers drawn on it. The overlay is the
volcanic plate with the lane's centre stroked in cyan and every candidate tower
pad ringed and numbered in green, so the route and the spots are authored art
rather than a classifier's opinion of it.

That turns the tool round. There is nothing to trace and then trust — there is
a drawing to agree with. So this script re-derives the numbers from the overlay
and compares them to what is in the JSON, and says where the two disagree:

    python3 tools/check_level2.py [--overlay tools/level2_path_overlay.png]
    python3 tools/check_level2.py --emit     # print the JSON block instead

THE OVERLAY IS NOT SHIPPED. It lived in `public/assets/maps/` for exactly as
long as it took to notice that everything under `public/` is deployed whether
or not anything references it — 1.9MB on every phone, for a file only this
script opens. It is under `tools/` with the script that reads it, which is
where the level 1 source PNG would be too if it were not larger still and
therefore left in git history.

Nothing at runtime depends on this. It is the record of where map_level2.json
came from, and how to redo it when the art changes.

ONE RING, ONE PAD. The overlay used to ring seventeen spots for fifteen pads,
and the two leftovers were printed on every run and never failed it, because a
script cannot know whether a spot was dropped on purpose. The re-drawn overlay
rings exactly the fifteen it means, so there is nothing left to excuse: a ring
with no pad is now an ordinary disagreement and fails like the rest.

CHECK THE OVERLAY IS THE RIGHT ONE FIRST. The correct file has 9641 pixels
matching R<60 G>200 B>200. A superseded export went round with its cyan stroke
one pixel thinner (7623), and since the road's half-width is a median of
integer distances sampled along that stroke, it moved roadWidth 65.8 -> 67.6
and the waypoint count 49 -> 47 without the painted route having moved at all.
Nothing in the output flags that; the numbers just come out different.
"""

import argparse
import json
import math
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERLAY = os.path.join(ROOT, 'tools/level2_path_overlay.png')
MAP = os.path.join(ROOT, 'src/data/map_level2.json')

# The plate fills a 1280x720 canvas whatever its own size, so canvas pixels are
# the map's coordinate space. The overlay is 1440x810, which is 1.125x that.
CANVAS_W, CANVAS_H = 1280, 720

# How much the polyline may stray from the painted centreline, in OVERLAY
# pixels, and the epsilon the simplifier is run at to produce it. The lane
# stroke is about four pixels wide, so a waypoint set that tracks it to one
# pixel is inside the paint everywhere. Loosen the epsilon and the route starts
# cutting the corners of the S-bends.
SIMPLIFY_EPS = 1.1
WAYPOINT_TOLERANCE = 1.5

# The hero's stance, in canvas pixels: the box his art covers on the ground,
# and how far he has to be from the lane's edge and from the nearest pad.
HERO_FOOTPRINT_W, HERO_FOOTPRINT_D = 120, 55
HERO_ROAD_CLEARANCE, HERO_PAD_CLEARANCE = 90, 75

# A pad centre may sit this far from the middle of its ring before it stops
# being that ring. The rings are 33 overlay px across and drawn by hand.
PAD_MATCH_PX = 6.0

# Lava blobs smaller than this are painted embers and sparks on rock, not
# molten ground. Without the pass a single 1px ember 31px from the hero's feet
# reads as lava underneath him.
MIN_LAVA_BLOB = 60


# ---------------------------------------------------------------- masks

def masks(w, h, px):
    """Lane stroke, pad rings, road surface and lava, from the overlay's colours.

    The two annotation colours are drawn ON TOP of the plate, so they are read
    first and the pixels they cover are excluded from the art masks — the cyan
    stroke counts as road, because it is painted down the middle of one, and
    the green rings count as nothing at all.
    """
    lane, road, lava = bytearray(w * h), bytearray(w * h), bytearray(w * h)
    ring = []
    for y in range(h):
        row = y * w
        for x in range(w):
            i = (row + x) * 4
            r, g, b = px[i], px[i + 1], px[i + 2]
            if r < 110 and g > 170 and b > 170:
                lane[row + x] = road[row + x] = 1
                continue
            if g > 170 and r < 130 and b < 150:
                ring.append((x, y))
                continue
            # Molten rock: strongly red against its own blue, and either bright
            # red or an orange bright enough to be flowing rather than glowing.
            if (r >= 150 and r - b >= 80 and r - g >= 35) or (r >= 200 and g >= 120 and b < 110):
                lava[row + x] = 1
                continue
            # The road is a pale warm grey. The plate's rock is the same hue
            # and much darker, which is the whole separation.
            if (r + g + b) // 3 > 92 and 8 <= r - g <= 48 and b >= 62:
                road[row + x] = 1
    return lane, road, lava, ring


def blobs(w, h, mask):
    """Every 4-connected run of set pixels, largest first."""
    seen = bytearray(w * h)
    out = []
    for start in range(w * h):
        if not mask[start] or seen[start]:
            continue
        q, comp = deque([start]), []
        seen[start] = 1
        while q:
            p = q.popleft()
            comp.append(p)
            y, x = divmod(p, w)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w:
                    n = ny * w + nx
                    if mask[n] and not seen[n]:
                        seen[n] = 1
                        q.append(n)
        out.append(comp)
    out.sort(key=len, reverse=True)
    return out


def fill_holes(w, h, mask, max_area):
    """Swallow small gaps in a mask into the mask.

    The painted road is scattered with pebbles and cracks dark enough to fall
    outside the road band, and the road's width is measured as a distance to
    the nearest non-road pixel — so a pebble in the middle of it makes the lane
    measure half as wide as it is.
    """
    filled = 0
    for comp in blobs(w, h, bytearray(0 if v else 1 for v in mask)):
        if len(comp) > max_area:
            continue
        if any(p % w in (0, w - 1) or p // w in (0, h - 1) for p in comp):
            continue
        for p in comp:
            mask[p] = 1
        filled += len(comp)
    return filled


def despeckle(w, h, mask, min_area):
    """Drop blobs too small to be scenery. Returns how many pixels went."""
    dropped = 0
    for comp in blobs(w, h, mask):
        if len(comp) >= min_area:
            continue
        for p in comp:
            mask[p] = 0
        dropped += len(comp)
    return dropped


def keep_component(w, h, mask, seed):
    """The one blob of `mask` reaching `seed`, everything else discarded.

    The road band also matches pale boulders all over the plate. The lane is
    the piece of it the cyan stroke runs down, and the rest is rock.
    """
    out = bytearray(w * h)
    s = seed[1] * w + seed[0]
    out[s] = 1
    q = deque([s])
    while q:
        p = q.popleft()
        y, x = divmod(p, w)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                n = ny * w + nx
                if mask[n] and not out[n]:
                    out[n] = 1
                    q.append(n)
    return out


def distance_to(w, h, mask, inside=False):
    """Distance in overlay pixels from every pixel to the nearest set one.

    Four-neighbour, the same metric trace_map.py measures level 1 with, so the
    two plates' road widths are comparable numbers. `inside` inverts it: the
    distance from every set pixel to the nearest one that is not.
    """
    d = [10 ** 9] * (w * h)
    q = deque()
    for s in range(w * h):
        if bool(mask[s]) != inside:
            d[s] = 0
            q.append(s)
    while q:
        p = q.popleft()
        y, x = divmod(p, w)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w:
                n = ny * w + nx
                if d[n] > d[p] + 1:
                    d[n] = d[p] + 1
                    q.append(n)
    return d


# ------------------------------------------------------------- the lane

def centreline(w, h, lane):
    """The cyan stroke as an ordered run of subpixel points, left edge to right.

    Walked as a geodesic through the stroke rather than sampled per column: the
    lane doubles back through four S-bends and has stretches steep enough that
    a column crosses it twice.
    """
    pts = [(p % w, p // w) for p in range(w * h) if lane[p]]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    start = min((p for p in pts if p[0] == x0), key=lambda p: p[1])
    end = max((p for p in pts if p[0] == x1), key=lambda p: p[1])

    step = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
    d = [10 ** 9] * (w * h)
    s = start[1] * w + start[0]
    d[s] = 0
    q = deque([s])
    while q:
        p = q.popleft()
        y, x = divmod(p, w)
        for dx, dy in step:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                n = ny * w + nx
                if lane[n] and d[n] > d[p] + 1:
                    d[n] = d[p] + 1
                    q.append(n)

    p = end[1] * w + end[0]
    if d[p] >= 10 ** 9:
        raise SystemExit('the cyan stroke does not reach from one edge to the other')
    walk = []
    while p != s:
        y, x = divmod(p, w)
        walk.append((x, y))
        for dx, dy in step:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and lane[ny * w + nx] and d[ny * w + nx] == d[p] - 1:
                p = ny * w + nx
                break
    walk.append(start)
    walk.reverse()

    # The walk hugs one side of a four-pixel stroke. Averaging the stroke
    # around each step puts it back in the middle, and a short box filter takes
    # out the stair-stepping that is left.
    mid = []
    for x, y in walk:
        sx = sy = n = 0
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and lane[ny * w + nx]:
                    sx += nx
                    sy += ny
                    n += 1
        mid.append((sx / n, sy / n))
    return [(sum(p[0] for p in mid[max(0, i - 4):i + 5]) / len(mid[max(0, i - 4):i + 5]),
             sum(p[1] for p in mid[max(0, i - 4):i + 5]) / len(mid[max(0, i - 4):i + 5]))
            for i in range(len(mid))]


def simplify(pts, eps):
    """Douglas-Peucker, as trace_map.py does it, so both plates read the same."""
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]
    bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy) or 1
    worst, wi = -1.0, 0
    for i in range(1, len(pts) - 1):
        x, y = pts[i]
        d = abs(dy * x - dx * y + bx * ay - by * ax) / n
        if d > worst:
            worst, wi = d, i
    if worst <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[:wi + 1], eps)[:-1] + simplify(pts[wi:], eps)


def run_off(inner, edge, x):
    """Where the lane would be at `x` if it kept going off the plate."""
    dx = edge[0] - inner[0]
    if dx == 0:
        return edge[1]
    return round(edge[1] + (x - edge[0]) * (edge[1] - inner[1]) / dx, 1)


def point_to_segment(p, a, b):
    (px_, py_), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    span = dx * dx + dy * dy
    t = 0.0 if span == 0 else max(0.0, min(1.0, ((px_ - ax) * dx + (py_ - ay) * dy) / span))
    return math.hypot(px_ - (ax + dx * t), py_ - (ay + dy * t))


def worst_deviation(line, way):
    """How far the painted centreline ever gets from the stored polyline."""
    return max(min(point_to_segment(p, way[i], way[i + 1]) for i in range(len(way) - 1))
               for p in line)


# ------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--overlay', default=OVERLAY,
                    help='the annotated plate (default: %(default)s)')
    ap.add_argument('--map', default=MAP, help='the JSON to check (default: %(default)s)')
    ap.add_argument('--emit', action='store_true',
                    help='print the derived JSON instead of checking the stored one')
    args = ap.parse_args()

    w, h, px = png.read(args.overlay)
    scale = CANVAS_W / w
    if abs(h * scale - CANVAS_H) > 1:
        raise SystemExit(f'overlay is {w}x{h}, which is not the shape of a {CANVAS_W}x{CANVAS_H} board')
    print(f'overlay {w}x{h}  ({scale:.4f} canvas px per overlay px)')

    lane_stroke, road, lava, ring = masks(w, h, px)
    print(f'  lane stroke {sum(lane_stroke)} px, pad rings {len(ring)} px')
    filled = fill_holes(w, h, road, 600)
    lane = keep_component(w, h, road, (lane_stroke.index(1) % w, lane_stroke.index(1) // w))
    print(f'  road band {sum(road)} px, {filled} filled, lane component {sum(lane)} px')
    sparks = despeckle(w, h, lava, MIN_LAVA_BLOB)
    print(f'  lava {sum(lava)} px, {sparks} px of embers and sparks dropped')

    # Road width, measured the way level 1's is: the median clearance from the
    # lane's centre to the nearest non-road pixel, doubled. The median and not
    # the widest, because the lane has to fit the narrowest stretch.
    inner = distance_to(w, h, lane, inside=True)
    line = centreline(w, h, lane_stroke)
    along = sorted(inner[int(round(y)) * w + int(round(x))] for x, y in line
                   if 4 < x < w - 5)
    half = along[len(along) // 2]
    road_width = round(half * 2 * scale, 1)
    print(f'  road half-width along the lane: narrowest {along[0] * scale:.1f}, '
          f'median {half * scale:.1f}, widest {along[-1] * scale:.1f} canvas px')

    # The pad rings, by their centres.
    rings = bytearray(w * h)
    for x, y in ring:
        rings[y * w + x] = 1
    markers = []
    for comp in blobs(w, h, rings):
        xs = [p % w for p in comp]
        ys = [p // w for p in comp]
        markers.append((sum(xs) / len(xs), sum(ys) / len(ys)))
    markers.sort(key=lambda m: (m[1], m[0]))
    print(f'  {len(markers)} pad rings')

    way = simplify(line, SIMPLIFY_EPS)
    to_canvas = lambda p: [round(p[0] * scale, 1), round(p[1] * scale, 1)]
    waypoints = [to_canvas(p) for p in way]
    # Enemies walk in from off the plate and out the far side, as on level 1 —
    # but EXTENDED rather than dragged. Level 1 moves its end waypoints out to
    # x=-60 and x=1340 in place, which is free there because that lane meets
    # both edges flat. This one arrives on a slope, and dragging the first
    # point 62 px left while holding its y swung the opening segment 13 px off
    # the paint. The run-off is a new point on the line the lane is already
    # travelling, so the traced ones all survive.
    waypoints.insert(0, [-60.0, run_off(waypoints[1], waypoints[0], -60.0)])
    waypoints.append([float(CANVAS_W + 60),
                      run_off(waypoints[-2], waypoints[-1], float(CANVAS_W + 60))])
    spots = [to_canvas(m) for m in markers]

    if args.emit:
        print(json.dumps({'roadWidth': road_width, 'waypoints': waypoints,
                          'buildSpots': spots}, indent=2))
        return 0

    data = json.load(open(args.map))
    bad = []

    # 1. The route follows the painted lane.
    stored = [(x / scale, y / scale) for x, y in data['waypoints']]
    dev = worst_deviation(line, stored)
    print(f'\nwaypoints: {len(data["waypoints"])} stored, '
          f'worst deviation from the painted centre {dev:.1f} overlay px')
    if dev > WAYPOINT_TOLERANCE:
        bad.append(f'the route strays {dev:.1f} overlay px from the painted lane')
    for end, x in (('first', data['waypoints'][0][0]), ('last', data['waypoints'][-1][0])):
        if 0 <= x <= CANVAS_W:
            bad.append(f'the {end} waypoint stops on the plate at x={x}; enemies walk in from off it')

    # 2. The road width.
    print(f'roadWidth: {data["roadWidth"]} stored, {road_width} measured')
    if abs(data['roadWidth'] - road_width) > 0.05:
        bad.append(f'roadWidth is {data["roadWidth"]}, measured {road_width}')

    # 3. Every pad sits in a ring — and every ring is accounted for.
    left = list(markers)
    for i, (x, y) in enumerate(data['buildSpots']):
        near = min(left, key=lambda m: math.hypot(m[0] - x / scale, m[1] - y / scale), default=None)
        off = math.hypot(near[0] - x / scale, near[1] - y / scale) if near else 1e9
        if off > PAD_MATCH_PX:
            bad.append(f'buildSpots[{i}] at ({x}, {y}) is {off:.1f} overlay px from any unclaimed ring')
        else:
            left.remove(near)
    tight = sorted((math.hypot(a[0] - b[0], a[1] - b[1]), i, j)
                   for i, a in enumerate(data['buildSpots'])
                   for j, b in enumerate(data['buildSpots']) if j > i)
    print(f'buildSpots: {len(data["buildSpots"])} stored against {len(markers)} rings; '
          f'closest pair {tight[0][1]}-{tight[0][2]} at {tight[0][0]:.1f} canvas px')
    # PRINTED TOO. The painter spaced the rings by the 15px circle drawn in the
    # overlay, not by the 34px tap radius the game gives a node, so several
    # pairs are closer than two rings wide. Moving one is an art change, and
    # this script does not get to fail a level for a decision it cannot make.
    for d, i, j in tight:
        if d > 2 * data['spotRadius']:
            break
        print(f'  pads {i} and {j} are {d:.1f} px apart; their {data["spotRadius"]}px '
              f'tap rings overlap')
    # FAILED, NOT PRINTED. Every ring the painter drew is a pad; see the note at
    # the top of this file for why this stopped being a judgement call.
    for x, y in sorted(left):
        bad.append(f'the ring at canvas ({x * scale:.1f}, {y * scale:.1f}) carries no pad')

    # 4. The hero stands somewhere he can actually stand.
    hx, hy = data['heroStart']
    burnt = 0
    clear = 10 ** 9
    to_lava = distance_to(w, h, lava)
    for dx in range(-HERO_FOOTPRINT_W // 2, HERO_FOOTPRINT_W // 2 + 1):
        for dy in range(-HERO_FOOTPRINT_D, 1):
            x, y = int(round((hx + dx) / scale)), int(round((hy + dy) / scale))
            if 0 <= x < w and 0 <= y < h:
                burnt += lava[y * w + x]
                clear = min(clear, to_lava[y * w + x])
    at = (int(round(hy / scale)) * w + int(round(hx / scale)))
    road_clear = distance_to(w, h, lane)[at] * scale
    pad_clear = min(math.hypot(hx - x, hy - y) for x, y in data['buildSpots'])
    print(f'heroStart ({hx}, {hy}): {HERO_FOOTPRINT_W}x{HERO_FOOTPRINT_D} footprint has '
          f'{burnt} lava px in it and clears lava by {clear * scale:.1f}; '
          f'road edge {road_clear:.1f}, nearest pad {pad_clear:.1f} canvas px')
    if burnt:
        bad.append(f'the hero is standing in lava ({burnt} px of his footprint)')
    if road_clear < HERO_ROAD_CLEARANCE:
        bad.append(f'the hero is {road_clear:.1f} px off the road, wanted {HERO_ROAD_CLEARANCE}')
    if pad_clear < HERO_PAD_CLEARANCE:
        bad.append(f'the hero is {pad_clear:.1f} px from a pad, wanted {HERO_PAD_CLEARANCE}')
    if hy < min(y for _, y in data['waypoints']):
        bad.append(f'the hero starts at y={hy}, above the lane\'s own highest point')

    print()
    for line_ in bad:
        print(f'FAIL {line_}')
    print('map_level2.json agrees with the overlay' if not bad else f'{len(bad)} disagreement(s)')
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())
