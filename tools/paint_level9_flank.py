"""Paint the flank corridor into level 9's plate, so the road the lane walks exists.

    python3 tools/paint_level9_flank.py            # measure and report, write nothing
    python3 tools/paint_level9_flank.py --write    # rewrite art-source/level9/map_level9.png

WHY THIS EXISTS. The plate paints a trace round the bottom right of level 9 whose
south end is a rounded CAP ON OPEN SUBSTRATE, 112 px from the trunk with 63 px of
bare board between the two kerbs. `map_level9.json` bridged that with an AUTHORED
JOIN -- one straight segment, which is what `map_level6.json` does over 82 px --
and the result was a walker crossing bare board beside a capacitor for a quarter
of a second. 15.2% of the flank lane was off-paint. This paints the corridor
instead, so the lane can be DERIVED from the paint like every other metre of
level 9.

NOTHING HERE IS DRAWN BY HAND EITHER. The corridor's colour comes from the
plate's own road: a cross-section is measured at two places where the spur runs
straight and clean (plate x 2900 and 2950, lit half-width 68.5 px, bright edge
streaks at +/-54 and +/-56, no centre line), averaged, mirrored, and used as a
lookup from distance-to-the-road's-edge. So the new trace has the same width,
the same kerb, the same edge glow and the same inner streaks as the old, because
it IS the old one's profile.

THE KERB IS TAKEN FROM THE UNION, NOT FROM THE CORRIDOR. A capsule stamped with
its own kerb would draw a dark outline straight across the two roads it joins --
a T-junction with a wall in it. The distance transform runs on the UNION of the
existing lit trace and the new capsule, so a kerb is drawn only where the joined
shape actually has an edge, and the three roads merge the way the painted ones do.

WHERE THE CORRIDOR RUNS, and why it is the straight one. The channel between
chip 13's right edge and the capacitor is the only way through: the capacitor
occupies x 899-926 for y 478-536 and chip 13's ink ends at x 852-855 below
y 521, so anything that goes vertically through that window needs a centre
between x 875.3 and 876.7 and then cannot reach the cap without crossing the
SMD pad column at x 876-886. The straight run from the trunk to the cap misses
the capacitor entirely, clears chip 13, and crosses ONE small surface-mount
component, which the trace is painted over. Three candidate routes were rendered
over the plate and compared before this one was taken.
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png                                                          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'art-source/level9/map_level9.png')
SCALE = 3.0                       # plate px per world px, asserted below

# THE CORRIDOR, in WORLD coordinates: the trunk's nearest point to the cap, and
# the cap itself. Both are traced numbers, not chosen ones -- they are
# `nodes.flankJoin` and `deadEnd.terminal` in tools/level9_geometry.json, which
# tools/trace_level9.py derived from this same plate. The paint follows the
# geometry here, and then the geometry is re-derived FROM the paint.
CORRIDOR = [(858.0, 468.7), (914.5, 568.0)]

# Where the clean cross-sections were measured. See the module docstring.
PROFILE_COLUMNS = (2900, 2950)
PROFILE_Y = (1600, 1800)

# How far from the corridor's centreline this is allowed to write at all, in
# plate px. The lit road is 68.5, the kerb ends at about 75 and the outer glow
# at about 84; past that the plate is left alone, and the last few px are
# blended so there is no seam.
WRITE_FULL = 78.0
WRITE_FADE = 92.0


def lit(r, g, b):
    """tools/trace_level9.py's own test for the cyan trace."""
    return g >= 150 and b >= 170 and r < g - 60


def measure_profile(w, h, px):
    """The road's colour as a function of distance from its lit edge.

    Returned as a list indexed by `r` in plate px from the road's CENTRE, so
    `prof[0]` is the middle of the road and `prof[68]` is its lit edge. Both
    sides of both columns are averaged.
    """
    acc, cnt = {}, {}
    half = []
    for X in PROFILE_COLUMNS:
        ys = [y for y in range(*PROFILE_Y)
              if lit(px[(y * w + X) * 4], px[(y * w + X) * 4 + 1], px[(y * w + X) * 4 + 2])]
        top, bot = ys[0], ys[-1]
        centre = (top + bot) / 2.0
        half.append((bot - top) / 2.0)
        for y in range(top - 24, bot + 25):
            r = int(round(abs(y - centre)))
            i = (y * w + X) * 4
            a = acc.setdefault(r, [0, 0, 0])
            for k in range(3):
                a[k] += px[i + k]
            cnt[r] = cnt.get(r, 0) + 1
    lit_half = sum(half) / len(half)
    top = max(acc)
    prof = []
    for r in range(top + 1):
        if r in acc:
            prof.append(tuple(acc[r][k] // cnt[r] for k in range(3)))
        else:
            prof.append(prof[-1])
    return prof, lit_half


def dist_to_polyline(p, poly):
    best = float('inf')
    for i in range(len(poly) - 1):
        (ax, ay), (bx, by) = poly[i], poly[i + 1]
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy
        t = 0.0 if ll == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / ll))
        best = min(best, math.hypot(ax + t * dx - p[0], ay + t * dy - p[1]))
    return best


def edt(w, h, inside):
    """Exact-enough euclidean distance to the nearest pixel NOT in `inside`.

    Danielsson's four-pass vector propagation: each pixel carries the offset to
    the nearest background pixel found so far, so the answer is a real distance
    rather than a chamfer approximation. The kerb here is three and a half
    pixels wide on a sixty-eight pixel road, and a 4% chamfer error would smear
    it; this is exact except in the rare configurations Danielsson misses by
    less than a pixel.
    """
    INF = 10 ** 6
    dx = [0] * (w * h)
    dy = [0] * (w * h)
    d2 = [0 if not inside[i] else INF for i in range(w * h)]

    def relax(i, j, ox, oy):
        if d2[j] >= INF and d2[i] >= INF:
            return
        nx, ny = dx[j] + ox, dy[j] + oy
        n = nx * nx + ny * ny
        if n < d2[i]:
            d2[i] = n
            dx[i], dy[i] = nx, ny

    for y in range(h):
        base = y * w
        for x in range(w):
            i = base + x
            if d2[i] == 0:
                continue
            if y > 0:
                relax(i, i - w, 0, 1)
                if x > 0:
                    relax(i, i - w - 1, 1, 1)
                if x < w - 1:
                    relax(i, i - w + 1, -1, 1)
            if x > 0:
                relax(i, i - 1, 1, 0)
        for x in range(w - 2, -1, -1):
            i = base + x
            if d2[i]:
                relax(i, i + 1, -1, 0)
    for y in range(h - 1, -1, -1):
        base = y * w
        for x in range(w - 1, -1, -1):
            i = base + x
            if d2[i] == 0:
                continue
            if y < h - 1:
                relax(i, i + w, 0, -1)
                if x < w - 1:
                    relax(i, i + w + 1, -1, -1)
                if x > 0:
                    relax(i, i + w - 1, 1, -1)
            if x < w - 1:
                relax(i, i + 1, -1, 0)
        for x in range(1, w):
            i = base + x
            if d2[i]:
                relax(i, i - 1, 1, 0)
    return [math.sqrt(v) if v < INF else float('inf') for v in d2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--out', default=PLATE)
    args = ap.parse_args()

    w, h, px = png.read(PLATE)
    assert w / 1280.0 == SCALE and h / 720.0 == SCALE, f'plate is {w}x{h}, not 3x the world'
    prof, lit_half = measure_profile(w, h, px)
    print(f'plate {w}x{h}; road profile measured at x={PROFILE_COLUMNS}, '
          f'lit half-width {lit_half:.1f} px')
    print(f'  centre {prof[0]}  streak {prof[54]}  rim {prof[62]}  '
          f'kerb {prof[72]}  glow {prof[78]}  substrate {prof[86]}')

    corridor = [(x * SCALE, y * SCALE) for x, y in CORRIDOR]

    # The window this touches, with room for the glow and for the distance
    # transform to see enough of the old road to measure depth correctly.
    pad = int(WRITE_FADE) + 40
    x0 = int(min(p[0] for p in corridor)) - pad
    x1 = int(max(p[0] for p in corridor)) + pad
    y0 = int(min(p[1] for p in corridor)) - pad
    y1 = int(max(p[1] for p in corridor)) + pad
    rw, rh = x1 - x0, y1 - y0
    print(f'  window plate x {x0}-{x1}, y {y0}-{y1}  ({rw}x{rh})')

    old = bytearray(rw * rh)
    for y in range(rh):
        for x in range(rw):
            i = ((y0 + y) * w + (x0 + x)) * 4
            if lit(px[i], px[i + 1], px[i + 2]):
                old[y * rw + x] = 1

    zone = [0.0] * (rw * rh)
    union = bytearray(old)
    for y in range(rh):
        for x in range(rw):
            d = dist_to_polyline((x0 + x, y0 + y), corridor)
            zone[y * rw + x] = d
            if d <= lit_half:
                union[y * rw + x] = 1

    depth = edt(rw, rh, union)                                  # inside the joined road
    was = edt(rw, rh, old)                                      # inside the OLD road
    outside = bytearray(1 - union[i] for i in range(rw * rh))
    gap = edt(rw, rh, outside)                                  # outside the joined road

    painted = 0
    added = 0
    for y in range(rh):
        for x in range(rw):
            k = y * rw + x
            z = zone[k]
            if z > WRITE_FADE:
                continue
            # DISTANCE FROM THE ROAD'S CENTRE, reconstructed from the union so
            # the kerb follows the joined shape rather than the capsule.
            if union[k]:
                r = lit_half - min(depth[k], lit_half)
            else:
                r = lit_half + gap[k]
            ri = int(round(r))
            if ri >= len(prof):
                continue
            # WHAT THE CORRIDOR CHANGED, AND NOTHING ELSE.
            #
            # Repainting every pixel in the write zone redraws the old road's
            # inner streaks around the UNION's boundary while the artist's own
            # streaks survive just outside the zone, and the two do not line
            # up: the junction fills with stranded arcs and stubs and reads as
            # scribble. Repainting none of them is wrong the other way -- the
            # spur's ROUNDED CAP is lit trace, and left alone it sits in the
            # middle of the merged junction as a pill.
            #
            # The pixels that have to change are the ones the corridor made
            # DEEPER: an old edge decoration that is now well inside the joined
            # road. Everything else -- road the corridor did not widen, and its
            # streaks and vias -- is the artist's and is kept.
            if union[k] and depth[k] <= was[k] + 6.0:
                continue
            alpha = 1.0 if z <= WRITE_FULL else max(0.0, (WRITE_FADE - z) / (WRITE_FADE - WRITE_FULL))
            if alpha <= 0:
                continue
            i = ((y0 + y) * w + (x0 + x)) * 4
            want = prof[ri]
            if union[k]:
                added += 1
            for c in range(3):
                px[i + c] = int(round(px[i + c] * (1 - alpha) + want[c] * alpha))
            painted += 1

    print(f'  {painted} plate px written, {added} of them new lit trace '
          f'({added / SCALE / SCALE:.0f} world px of road added)')

    if args.write:
        png.write(args.out, w, h, px)
        print(f'wrote {os.path.relpath(args.out, ROOT)}')
    else:
        print('  (dry run; pass --write to rewrite the plate)')


if __name__ == '__main__':
    main()
