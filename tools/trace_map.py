"""Derive the enemy route and the buildable spots from the painted map plate.

The map is one painted image, not a tile grid, so the lane and the tower spots
have to come out of the artwork itself rather than out of a level editor. This
reads public/assets/maps/map_level1.png, classifies every pixel as road, grass
or blocked, traces the road from the arch on the left edge to the gate on the
right, picks open grass beside it for towers, and prints the JSON that goes
into src/data/map.json.

It also writes an overlay PNG of the result drawn over the real plate, because
the only way to be sure a traced route follows the painted road is to look at
it.

    python3 tools/trace_map.py [--overlay /tmp/overlay.png]

Nothing at runtime depends on this script. It is the record of where the
numbers in map.json came from, and how to redo them when the art changes.
"""

import argparse
import heapq
import json
import math
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'public/assets/maps/map_level1.png')

# The plate is 1672x941 and fills a 1280x720 canvas, so canvas pixels are the
# map's coordinate space. Everything below works at quarter resolution for
# speed and scales back up at the end.
CANVAS_W, CANVAS_H = 1280, 720
K = 4

ROAD, GRASS, BLOCK = 1, 2, 0
COLOUR = {ROAD: (230, 190, 90), GRASS: (90, 150, 50), BLOCK: (30, 30, 40)}


# --------------------------------------------------------------- classify

def classify(w, h, px):
    """Road, grass or blocked for every pixel of a quarter-scale copy.

    The blue channel separates the two surfaces cleanly on this plate: the dirt
    road sits at B 50-96 and the grass at B 7-24. Trees, the tavern, the pond
    and the walls all fall outside both bands and count as blocked, which is
    what keeps towers out of them.
    """
    sw, sh = w // K, h // K
    kind = bytearray(sw * sh)
    for y in range(sh):
        sy = y * K
        for x in range(sw):
            i = (sy * w + x * K) * 4
            r, g, b = px[i], px[i + 1], px[i + 2]
            lum = (r + g + b) // 3
            if r - g > 20 and b > 35 and lum > 95:
                kind[y * sw + x] = ROAD
            elif -30 <= r - g <= 15 and b < 35 and lum > 80:
                kind[y * sw + x] = GRASS
            else:
                kind[y * sw + x] = BLOCK
    return sw, sh, kind


def largest_road_component(sw, sh, kind):
    """The main road, without the painted spur to the tavern door.

    The spur touches the road, so it survives this. It gets dropped later by
    the route search, which has no reason to detour into a dead end.
    """
    seen = bytearray(sw * sh)
    best = []
    for start in range(sw * sh):
        if kind[start] != ROAD or seen[start]:
            continue
        comp, q = [], deque([start])
        seen[start] = 1
        while q:
            p = q.popleft()
            comp.append(p)
            x, y = p % sw, p // sw
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < sw and 0 <= ny < sh:
                    n = ny * sw + nx
                    if not seen[n] and kind[n] == ROAD:
                        seen[n] = 1
                        q.append(n)
        if len(comp) > len(best):
            best = comp
    return set(best)


def bfs_from(sw, sh, kind, pred):
    """Distance in mask pixels from every pixel to the nearest one matching pred."""
    d = [10 ** 9] * (sw * sh)
    q = deque()
    for i, v in enumerate(kind):
        if pred(v):
            d[i] = 0
            q.append(i)
    while q:
        p = q.popleft()
        x, y = p % sw, p // sw
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < sw and 0 <= ny < sh:
                n = ny * sw + nx
                if d[n] > d[p] + 1:
                    d[n] = d[p] + 1
                    q.append(n)
    return d


# ------------------------------------------------------------------ trace

def trace(sw, sh, comp):
    """Walk the road from its leftmost pixel to its rightmost, down the middle.

    Dijkstra with a penalty for hugging the road edge. Running down the centre
    is what keeps enemies out of the painted verges, and it is also what makes
    the search ignore the tavern spur: a detour costs distance and buys nothing.
    """
    # Clearance: how far each road pixel is from the nearest non-road pixel.
    clear = [0] * (sw * sh)
    q = deque()
    for p in comp:
        x, y = p % sw, p // sw
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < sw and 0 <= ny < sh) or (ny * sw + nx) not in comp:
                q.append(p)
                break
    seen = set(q)
    while q:
        p = q.popleft()
        x, y = p % sw, p // sw
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            n = ny * sw + nx
            if 0 <= nx < sw and 0 <= ny < sh and n in comp and n not in seen:
                seen.add(n)
                clear[n] = clear[p] + 1
                q.append(n)
    widest = max(clear[p] for p in comp)

    def edge_pixel(pick):
        col = pick(p % sw for p in comp)
        ys = sorted(p // sw for p in comp if p % sw == col)
        return ys[len(ys) // 2] * sw + col

    entry, exit_ = edge_pixel(min), edge_pixel(max)

    cost = {p: float('inf') for p in comp}
    prev = {}
    cost[entry] = 0.0
    pq = [(0.0, entry)]
    while pq:
        c, p = heapq.heappop(pq)
        if c > cost[p]:
            continue
        if p == exit_:
            break
        x, y = p % sw, p // sw
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < sw and 0 <= ny < sh):
                continue
            n = ny * sw + nx
            if n not in comp:
                continue
            penalty = (widest - clear[n]) / widest
            nc = c + math.hypot(dx, dy) * (1 + 6 * penalty * penalty)
            if nc < cost[n]:
                cost[n] = nc
                prev[n] = p
                heapq.heappush(pq, (nc, n))

    line, p = [], exit_
    while p != entry:
        line.append(p)
        p = prev[p]
    line.append(entry)
    line.reverse()
    return [(p % sw, p // sw) for p in line], widest


def simplify(pts, eps):
    """Douglas-Peucker: a traced pixel run turned into a handful of waypoints."""
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


# ------------------------------------------------------------------ spots

# Mask-pixel distances. One mask pixel is about 3.06 canvas pixels.
NEAR, FAR, CLEAR_OF_SCENERY = 15, 33, 13
TARGET_SPOTS, MIN_SEPARATION = 13, 25


def pick_spots(sw, sh, kind, line, dist_road, dist_block):
    """Open grass beside the road, spread along the whole walk.

    A spot has to be close enough to cover the lane, far enough off it that a
    tower is not standing in the road, and clear of the trees, tavern and pond.
    Sampling one position per wanted spot, evenly along the route, is what
    stops them bunching near the arch; alternating the preferred side keeps
    both verges in play.
    """
    cand = [i for i, v in enumerate(kind)
            if v == GRASS and NEAR <= dist_road[i] <= FAR and dist_block[i] >= CLEAR_OF_SCENERY]

    chosen = []

    def far_enough(x, y):
        return all((x - cx) ** 2 + (y - cy) ** 2 >= MIN_SEPARATION ** 2 for cx, cy in chosen)

    def at(t):
        return line[min(len(line) - 1, int(t * (len(line) - 1)))]

    for si in range(TARGET_SPOTS):
        t = (si + 0.5) / TARGET_SPOTS
        px_, py_ = at(t)
        ax, ay = at(max(0.0, t - 0.02))
        bx, by = at(min(1.0, t + 0.02))
        tx, ty = bx - ax, by - ay
        want = 1 if si % 2 == 0 else -1

        best, best_score = None, None
        for radius in (40, 55, 70):
            for i in cand:
                x, y = i % sw, i // sw
                d2 = (x - px_) ** 2 + (y - py_) ** 2
                if d2 > radius * radius or not far_enough(x, y):
                    continue
                side = 1 if (tx * (y - py_) - ty * (x - px_)) > 0 else -1
                score = (dist_block[i] * 2 + min(dist_road[i], 26)
                         - math.sqrt(d2) * 0.5 + (14 if side == want else 0))
                if best_score is None or score > best_score:
                    best, best_score = (x, y), score
            if best:
                break
        if best:
            chosen.append(best)
    return chosen, len(cand)


# ---------------------------------------------------------------- overlay

def write_overlay(path, w, h, src, waypoints, spots, spot_radius):
    """The route and spots drawn over the real plate, scaled as the game shows it."""
    out = bytearray(CANVAS_W * CANVAS_H * 4)
    for y in range(CANVAS_H):
        sy = min(h - 1, y * h // CANVAS_H)
        for x in range(CANVAS_W):
            si = (sy * w + min(w - 1, x * w // CANVAS_W)) * 4
            di = (y * CANVAS_W + x) * 4
            out[di:di + 4] = bytes(src[si:si + 3]) + b'\xff'

    def disc(cx, cy, rad, col):
        for dy in range(-rad, rad + 1):
            for dx in range(-rad, rad + 1):
                if dx * dx + dy * dy > rad * rad:
                    continue
                x, y = int(cx + dx), int(cy + dy)
                if not (0 <= x < CANVAS_W and 0 <= y < CANVAS_H):
                    continue
                di = (y * CANVAS_W + x) * 4
                a = col[3] / 255
                for c in range(3):
                    out[di + c] = int(col[c] * a + out[di + c] * (1 - a))

    for i in range(1, len(waypoints)):
        ax, ay = waypoints[i - 1]
        bx, by = waypoints[i]
        steps = max(1, int(math.hypot(bx - ax, by - ay)))
        for t in range(steps + 1):
            disc(ax + (bx - ax) * t / steps, ay + (by - ay) * t / steps, 2, (255, 60, 60, 255))
    for x, y in waypoints:
        disc(x, y, 5, (255, 255, 255, 255))
    for x, y in spots:
        disc(x, y, spot_radius, (80, 180, 255, 90))
        disc(x, y, 5, (255, 255, 255, 255))
    png.write(path, CANVAS_W, CANVAS_H, out)


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--plate', default=PLATE)
    ap.add_argument('--overlay', default=None, help='write a verification PNG here')
    ap.add_argument('--spot-radius', type=int, default=34)
    args = ap.parse_args()

    w, h, px = png.read(args.plate)
    print(f'plate {w}x{h}')

    sw, sh, kind = classify(w, h, px)
    total = sw * sh
    for name, v in (('road', ROAD), ('grass', GRASS), ('blocked', BLOCK)):
        c = kind.count(v)
        print(f'  {name:8s} {c:7d}  {c * 100 / total:5.1f}%')

    comp = largest_road_component(sw, sh, kind)
    print(f'  main road component: {len(comp)} of {kind.count(ROAD)} road pixels')

    line, widest = trace(sw, sh, comp)
    print(f'  traced {len(line)} steps; road is about {widest * 2 * K} plate px wide')

    dist_road = bfs_from(sw, sh, kind, lambda v: v == ROAD)
    dist_block = bfs_from(sw, sh, kind, lambda v: v == BLOCK)
    spots, cand = pick_spots(sw, sh, kind, line, dist_road, dist_block)
    print(f'  {cand} candidate grass pixels -> {len(spots)} spots')

    way = simplify(line, 1.6)
    scale = CANVAS_W / (sw * K)
    to_canvas = lambda p: [round(p[0] * K * scale, 1), round(p[1] * K * scale, 1)]

    waypoints = [to_canvas(p) for p in way]
    # Enemies walk on through the arch and off through the gate.
    waypoints[0][0] = -60.0
    waypoints[-1][0] = CANVAS_W + 60.0
    build_spots = [to_canvas(p) for p in spots]
    print(f'  {len(waypoints)} waypoints after simplify')

    print(json.dumps({'waypoints': waypoints, 'buildSpots': build_spots}, indent=1))

    if args.overlay:
        write_overlay(args.overlay, w, h, px, waypoints, build_spots, args.spot_radius)
        print(f'overlay written to {args.overlay}')


if __name__ == '__main__':
    main()
