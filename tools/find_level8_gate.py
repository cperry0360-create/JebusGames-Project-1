#!/usr/bin/env python3
"""Find the Performance Review's scan line on the level 8 plate, and where the
shipped lanes cross it.

    python3 tools/find_level8_gate.py [--overlay tools/decode/out/level8_gate.png]

WHY THIS EXISTS. The gate is painted into the map -- a roadside machine, a sign
reading PERFORMANCE REVIEW, and a red line drawn across the road -- and the
mechanic has to fire exactly where the art says it does. tools/level8_geometry
.json does not record the line: tools/trace_level8.py knew about it only as
something that SEVERED the road (its `close_gaps` pass exists to bridge it) and
never wrote down where it was. So this measures it, the same way everything else
about this map was measured, rather than reading a coordinate off a screenshot.

WHAT IT PRODUCES is the `performanceReview.crossings` block in
src/data/level8.json: one entry per place a shipped lane centreline crosses the
painted line, with the lane id, the distance along that lane, and the world
point. The engine's gate is a distance test -- see systems/PerformanceGate.ts --
because a distance is what an enemy already carries and a point test can be
stepped over by a fast enemy on a slow frame.

MEASURED AGAINST THE SHIPPED MAP, not against the geometry file. The waypoints
in src/data/map_level8.json are the simplified polyline plus three computed
gateway points, and they are what the enemies actually walk; level 8's own pad
placement learned this lesson the expensive way (see `densify` in
tools/trace_level8.py).

THE ROAD MAY CROSS THE LINE MORE THAN ONCE. It does not on this plate -- the
answer comes out as one crossing on one lane -- and the tool still reports every
crossing it finds, because "the road doubles back and an enemy can cross twice"
is the thing the buff's non-stacking rule exists for, and a tool that could only
find one crossing would be assuming the answer.
"""
import argparse
import json
import math
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import img  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'public/assets/maps/map_level8.webp')
MAP = os.path.join(ROOT, 'src/data/map_level8.json')
CANVAS_W, CANVAS_H = 1280, 720

# THE SCAN LINE IS THE ONLY SATURATED RED ON THE PLATE, and that is the property
# this leans on. Measured off the art: the line's core runs about (237,28,36) --
# red far above both other channels and a blue that stays low. The beacon lamp on
# top of the machine is the same red and is a separate blob, which the
# largest-component pass below drops; the cable runs are purple (blue as high as
# red) and never enter the band.
def is_red(r, g, b):
    return r >= 150 and r - g >= 90 and r - b >= 80


def components(mask, w, h):
    """Connected runs of a mask, largest first."""
    from collections import deque
    seen = bytearray(w * h)
    out = []
    for start in range(w * h):
        if not mask[start] or seen[start]:
            continue
        q = deque([start])
        seen[start] = 1
        comp = []
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % w, i // w
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if mask[j] and not seen[j]:
                            seen[j] = 1
                            q.append(j)
        out.append(comp)
    out.sort(key=len, reverse=True)
    return out


def fit_segment(pts):
    """The blob's principal axis, as the two extreme points along it.

    A least-squares line rather than the bounding box's diagonal: the line is
    drawn with a soft end and a slight tilt, and a diagonal would tilt with the
    blob's width as well as its length.
    """
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    # The principal eigenvector of the 2x2 covariance.
    theta = 0.5 * math.atan2(2 * sxy, sxx - syy)
    ux, uy = math.cos(theta), math.sin(theta)
    ts = [(p[0] - mx) * ux + (p[1] - my) * uy for p in pts]
    t0, t1 = min(ts), max(ts)
    return ((mx + ux * t0, my + uy * t0), (mx + ux * t1, my + uy * t1))


def seg_cross(a, b, c, d):
    """Where segments ab and cd cross, as the fraction along ab, or None."""
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-12:
        return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
    u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
    if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
        return t
    return None


def lanes_of(m):
    """Every lane the shipped map declares, as (id, waypoints)."""
    out = [(m.get('mainId', 'main'), [list(p) for p in m['waypoints']])]
    for l in m.get('lanes', []):
        out.append((l['id'], [list(p) for p in l['waypoints']]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay')
    ap.add_argument('--extend', type=float, default=1.25,
                    help='how far past its painted ends to project the line, in multiples '
                         'of its own length')
    args = ap.parse_args()

    w, h, px = img.read(PLATE)
    print(f'plate {os.path.relpath(PLATE, ROOT)}  {w}x{h} -> {CANVAS_W}x{CANVAS_H}')
    mask = bytearray(CANVAS_W * CANVAS_H)
    for y in range(CANVAS_H):
        sy = min(h - 1, int(y * h / CANVAS_H))
        row = sy * w
        for x in range(CANVAS_W):
            sx = min(w - 1, int(x * w / CANVAS_W))
            i = (row + sx) * 4
            if is_red(px[i], px[i + 1], px[i + 2]):
                mask[y * CANVAS_W + x] = 1
    total = sum(mask)
    comps = components(mask, CANVAS_W, CANVAS_H)
    print(f'{total} red canvas px in {len(comps)} blob(s); the five largest:')
    for c in comps[:5]:
        xs = [i % CANVAS_W for i in c]
        ys = [i // CANVAS_W for i in c]
        print(f'  {len(c):5d} px  x {min(xs)}-{max(xs)}  y {min(ys)}-{max(ys)}')
    if not comps:
        raise SystemExit('no red on the plate; the scan line is not where this expects it')

    # THE LINE IS THE LONGEST BLOB, not the biggest, and on this plate they are
    # the same one. The beacon lamp on the machine is red too and is rounder; the
    # line is long and thin, so the two are told apart by their aspect rather
    # than by their size, which is the property that will still be true if the
    # lamp is ever drawn bigger.
    def extent(c):
        xs = [i % CANVAS_W for i in c]
        ys = [i // CANVAS_W for i in c]
        return math.hypot(max(xs) - min(xs), max(ys) - min(ys))
    line = max(comps, key=extent)
    pts = [(i % CANVAS_W, i // CANVAS_W) for i in line]
    a, b = fit_segment(pts)
    length = math.dist(a, b)
    print(f'the scan line: {len(line)} px, from ({a[0]:.1f},{a[1]:.1f}) to '
          f'({b[0]:.1f},{b[1]:.1f}), {length:.1f} px long, '
          f'{math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])):.1f} degrees')

    # PROJECTED PAST ITS PAINTED ENDS. The painted line stops at the edges of
    # the road it is drawn on, and an enemy walks down the MIDDLE of that road --
    # so a crossing test against the paint alone would depend on the artist
    # having drawn the line right across the band. Extending it by a quarter of
    # its own length each way costs nothing here (the road is 51 px wide and the
    # line is longer than that) and makes the test about where the line IS
    # rather than about how far it was drawn.
    k = args.extend
    ux, uy = (b[0] - a[0]) / length, (b[1] - a[1]) / length
    ea = (a[0] - ux * length * (k - 1) / 2, a[1] - uy * length * (k - 1) / 2)
    eb = (b[0] + ux * length * (k - 1) / 2, b[1] + uy * length * (k - 1) / 2)

    m = json.load(open(MAP))
    crossings = []
    for lane_id, way in lanes_of(m):
        run = 0.0
        for i in range(1, len(way)):
            p, q = way[i - 1], way[i]
            seg = math.dist(p, q)
            t = seg_cross(p, q, ea, eb)
            if t is not None:
                at = (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
                crossings.append({'lane': lane_id, 'distance': round(run + seg * t, 2),
                                  'at': [round(at[0], 2), round(at[1], 2)]})
            run += seg
        print(f'  lane {lane_id:7s} {len(way):3d} waypoints, {run:8.2f} px long')
    print(f'\nCROSSINGS FOUND: {len(crossings)}')
    for c in crossings:
        print(f'  {c["lane"]} at {c["distance"]:.2f} px, world ({c["at"][0]}, {c["at"][1]})')
    if not crossings:
        raise SystemExit('the painted line crosses no shipped lane; something is wrong with '
                         'one of the two')

    print('\nthe block for src/data/level8.json:')
    print(json.dumps({'line': [[round(v, 2) for v in a], [round(v, 2) for v in b]],
                      'crossings': crossings}, indent=2))

    if args.overlay:
        out = bytearray(CANVAS_W * CANVAS_H * 4)
        for y in range(CANVAS_H):
            sy = min(h - 1, int(y * h / CANVAS_H))
            for x in range(CANVAS_W):
                sx = min(w - 1, int(x * w / CANVAS_W))
                i, o = (sy * w + sx) * 4, (y * CANVAS_W + x) * 4
                out[o:o + 4] = bytes(px[i:i + 3]) + b'\xff'

        def put(x, y, c):
            for dy in (0, 1):
                for dx in (0, 1):
                    X, Y = int(x) + dx, int(y) + dy
                    if 0 <= X < CANVAS_W and 0 <= Y < CANVAS_H:
                        o = (Y * CANVAS_W + X) * 4
                        out[o], out[o + 1], out[o + 2] = c
        for lane_id, way in lanes_of(m):
            col = {'shared': (255, 255, 255), 'east': (255, 240, 60)}.get(lane_id, (255, 60, 255))
            for i in range(1, len(way)):
                p, q = way[i - 1], way[i]
                n = int(max(abs(q[0] - p[0]), abs(q[1] - p[1]))) + 1
                for t in range(n + 1):
                    put(p[0] + (q[0] - p[0]) * t / n, p[1] + (q[1] - p[1]) * t / n, col)
        n = int(math.dist(ea, eb)) + 1
        for t in range(n + 1):
            put(ea[0] + (eb[0] - ea[0]) * t / n, ea[1] + (eb[1] - ea[1]) * t / n, (60, 255, 60))
        for c in crossings:
            for r in (6, 10, 14):
                for d in range(0, 360, 3):
                    put(c['at'][0] + r * math.cos(math.radians(d)),
                        c['at'][1] + r * math.sin(math.radians(d)), (60, 160, 255))
        raw = bytearray()
        for y in range(CANVAS_H):
            raw.append(0)
            raw += out[y * CANVAS_W * 4:(y + 1) * CANVAS_W * 4]

        def chunk(t, d):
            c = t + d
            return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c))
        path = os.path.join(ROOT, args.overlay)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(
            b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', CANVAS_W, CANVAS_H, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))
        print(f'\noverlay written to {args.overlay}')


if __name__ == '__main__':
    main()
