"""Check tools/level7_geometry.json against the painted level 7 plate.

    python3 tools/check_level7.py
    python3 tools/check_level7.py --overlay     # also write the pad overlay PNG

tools/trace_level7.py DERIVED the geometry. This asks, independently, whether
the plate agrees with what it wrote -- the same division of labour levels 3, 4,
6 and 8 use, and the reason both halves exist. So this file does not import the
tracer. It reads the plate again -- the SHIPPED WebP rather than the source PNG,
so a bad re-encode is caught here rather than in the game -- with its own
classifier written to its own thresholds and an AREA-AVERAGED downsample rather
than the tracer's point sample, rebuilds the road mask by a different route,
re-walks the lanes with a different geodesic weighting, and compares.

Level 7 is a desert highway: three dark grey asphalt highways running straight
across the plate over tan and olive scrub, with cacti, rocks, power poles,
cones, guard rails, road signs and one wrecked pickup on the ground between
them.

WHAT THIS CHECKS THAT NOTHING ELSE DOES:

  THAT A HIGHWAY IS ONE LANE AND NOT TWO. The brief warns that a naive colour
  trace splits a highway at its centre dashes or shaves its white kerb lines
  off, and this proves the warning rather than trusting it: a grey-asphalt-only
  mask of this plate is built alongside the real one and its full-width
  components are counted. There have to be MORE of them -- nine against three,
  because every white edge line runs the whole width and cuts its highway into
  three strips lengthwise. If that ever stops being true the inclusion rule
  above it has stopped doing anything, and a test that cannot fail is worth
  less than no test.

  THREE INDEPENDENT LANES, SIX TERMINALS, ALL OF THEM ON A VERTICAL EDGE. One
  west opening and one east opening per highway, nothing on the top or bottom
  frame edge, and no two bands within 100 px of each other. That is the premise
  the level's whole design rests on -- three spawns, three exits, three sets of
  lives -- so it is measured rather than assumed.

  AND THE PADS' STANDOFF, WHICH IS AT THE VERY EDGE OF THE HOUSE BAND. Twenty
  of the twenty-two sit 91 px from one lane centreline and 92-93 from another,
  against a rule that says 90 to 114. One pixel of drift in the road's centre
  would push them out, so the standoff is re-derived here against a
  re-traced centreline and not read out of the file.

Nothing at runtime depends on this. It is the record of where
tools/level7_geometry.json came from and how to redo it when the art changes.
"""

import argparse
import json
import math
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import img                                                          # noqa: E402
import png                                                          # noqa: E402
# THE GEOMETRY HELPERS ARE LEVEL 4'S, deliberately, and check_level6.py takes
# them from the same place for the same reason: the connected component, the
# depth transform, the mid-band geodesic, the width normals and the pad core
# walk are the algorithms this level is being measured BY, and a second copy of
# them here would be a second thing to keep in step. Level 4's geodesic weights
# "the middle" differently from the tracer's -- a cubic penalty on normalised
# depth against the tracer's reciprocal -- so the two really are two walks.
from check_level4 import (component, core_ground, depth, geodesic, median,     # noqa: E402
                          point_to_polyline, polyline_length, widths)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOMETRY = os.path.join(ROOT, 'tools/level7_geometry.json')
PLATE_WEBP = os.path.join(ROOT, 'public/assets/maps/map_level7.webp')
PLATE_SOURCE = os.path.join(ROOT, 'art-source/map_level7.png')
OVERLAY_OUT = os.path.join(ROOT, 'tools/decode/out/level7_pads.png')

CANVAS_W, CANVAS_H = 1280, 720

# THE BRIEF'S 3% GATE, ON BOTH WIDTH AND LENGTH, and here it holds -- which is
# worth saying because check_level6.py had to widen its length gate to 6% and
# check_level8.py to 10%. Those are serpentines, where two geodesics that weight
# "the middle" differently disagree by 5% about how long a road is. These lanes
# are straight, so the two walks have nothing to disagree about and the honest
# gate is the tight one.
TOLERANCE = 0.03
WIDTH_TOLERANCE = 0.03
# The area identity: road pixels / road width against the declared total. It
# touches no geodesic at all, so it does not care which walk drew the line.
AREA_TOLERANCE = 0.03
# How much of the painted road has to lie within one road width of some shipped
# centreline. A lane that skipped a stretch leaves a hole here that no length
# figure has to notice.
COVERAGE_MIN = 0.99
# A shipped vertex has to be at least this much of the road's half-width from
# the paint's edge. On this plate a lane runs down the middle of a straight band
# and should be nowhere near a kerb, so this is loose and still decisive.
VERTEX_MID_BAND = 0.45
# How close to a frame edge a vertex counts as a gate vertex, and so is exempt
# from the mid-band test.
GATE_MARGIN = 4

PAD_CORE_RADIUS = 24
PAD_SPACING = 74
PAD_EDGE_MARGIN = 34
TOWER_RANGE = 112
# LEVELS 2 THROUGH 4'S STANDOFF, centre to lane CENTRELINE. The tracer uses it
# unrelaxed and this re-tests it, because the brief for this level expected it
# to have to be halved and it did not: 55 px of median scrub plus a 35 px
# half-width is a 90 px standoff.
HOUSE_STANDOFF = (90.0, 114.0)
# How far a pad's standoff measured here may sit from the tracer's figure. Two
# readings of the paint put a road's centre within a pixel of each other and
# the distance is measured to that centre, so 2.5 px is far more room than the
# disagreement needs.
STANDOFF_TOLERANCE = 2.5

# THE BRIEF'S REFERENCE FIGURES. Measured externally on the source plate, as
# fractions of the image height, and all six land -- which has not been true of
# every level's brief, so they are checked rather than quoted.
BRIEF_BANDS = {'north': (0.16, 0.26), 'middle': (0.41, 0.52), 'south': (0.67, 0.77)}
BRIEF_BAND_TOLERANCE = 0.015
BRIEF_ROAD_HEIGHT = {'north': 67.0, 'middle': 75.0, 'south': 70.0}
BRIEF_STRIP_HEIGHT = [118.0, 113.0, 110.0, 167.0]
# And the three the brief gives as shares of the plate. The road figure does not
# land and cannot: see the block in main().
BRIEF_AREA = {'road': 0.37, 'ground': 0.59, 'props': 0.04}
# Two bands may never come this close. The medians are 110-113 px tall, so a
# hundred is a gate that a real merge would trip and that measurement noise
# cannot.
MIN_BAND_GAP = 100.0

PROBE_RADIUS = 14
# Canvas coordinates with a known answer, and the run stops if any of them comes
# out wrong -- a classifier that cannot fail would make every result below pass
# for the wrong reason.
#
# THE PAINT IS NOT PROBED WITH A DISC and it was, first time round: a white edge
# line is two canvas rows thick, so the most of a 28 px disc it can ever fill is
# 9%, and a threshold that passes 9% passes a disc of scrub with one white
# pebble in it. The paint gets its own section in main() instead, which measures
# the edge-line and centre-dash rows ACROSS THE WHOLE WIDTH and then asks
# whether they ended up inside the road mask. That is the brief's third warning,
# tested where it can actually fail.
#
# A PROP IS TESTED AS A BLOB, not as an absence. A cactus and a power pole are
# dark enough in places to read as asphalt rather than as nothing, and "is any
# of this disc scrub?" reads part of each as ground. What separates a prop from
# the scrub is that it is SOLID.
#
# AND THE WRECK IS TESTED AS `unbuildable`, WHICH IS THE INTERESTING ONE. Its
# bodywork is dark rust and grey and reads as ASPHALT, not as a solid
# obstruction -- the largest non-classified blob inside it is 10 px. So it never
# looks like a prop to this classifier, and it still keeps towers off the right
# end of the lower median, because a pad core has to be entirely scrub and a
# third of that disc is not. The property that matters for a pad is the one
# asserted.
PROBES = [
    ('the north highway, mid-asphalt',    (300, 140), 'road'),
    ('the middle highway, mid-asphalt',   (300, 325), 'road'),
    ('the south highway, mid-asphalt',    (300, 505), 'road'),
    ('the scrub above the north highway', (600,  60), 'scrub'),
    ('the scrub in the upper median',     (300, 250), 'scrub'),
    ('the scrub in the lower median',     (300, 430), 'scrub'),
    ('the scrub below the south highway', (520, 640), 'scrub'),
    ('the GOOD THINGS AHEAD sign',       (1025,  41), 'prop'),
    ('the NEXT EXIT sign',                (117,  37), 'prop'),
    ('a power pole, bottom left',         (120, 631), 'prop'),
    ('a cactus, below the south highway', (296, 665), 'prop'),
    ('a cactus, above the north highway', (295,  35), 'prop'),
    ('the wrecked pickup, lower median', (1148, 410), 'unbuildable'),
]
PROBE_SHARE = 0.88       # road and scrub: this much of the disc, at least
PROBE_PROP_BLOB = 150    # prop: a connected obstruction at least this big
# The rows an edge line and a centre dash occupy have to be paint across this
# much of the width. The edge lines are solid and run the whole way; the dashes
# are dashed, so about a fifth of the width is what a dashed line looks like.
EDGE_LINE_SHARE = 0.90
DASH_SHARE = 0.15


# ------------------------------------------------------------------- the plate

def plate():
    """The plate at canvas resolution, AREA-AVERAGED.

    The tracer point-samples one source pixel per canvas pixel. This box-filters
    the whole source block instead, so the two disagree on every antialiased
    edge in the picture -- which is the point. An edge that only one of them can
    find is an edge neither should be trusting. It reads the shipped WebP where
    it exists, so a bad re-encode is caught here rather than in the game.
    """
    src = PLATE_WEBP if os.path.exists(PLATE_WEBP) else PLATE_SOURCE
    w, h, px = img.read(src)
    print(f'plate {os.path.relpath(src, ROOT)}  {w}x{h} -> {CANVAS_W}x{CANVAS_H} area-averaged')
    out = bytearray(CANVAS_W * CANVAS_H * 4)
    for y in range(CANVAS_H):
        y0, y1 = y * h // CANVAS_H, max(y * h // CANVAS_H + 1, (y + 1) * h // CANVAS_H)
        for x in range(CANVAS_W):
            x0, x1 = x * w // CANVAS_W, max(x * w // CANVAS_W + 1, (x + 1) * w // CANVAS_W)
            r = g = b = n = 0
            for sy in range(y0, y1):
                row = sy * w
                for sx in range(x0, x1):
                    i = (row + sx) * 4
                    r += px[i]
                    g += px[i + 1]
                    b += px[i + 2]
                    n += 1
            o = (y * CANVAS_W + x) * 4
            out[o], out[o + 1], out[o + 2], out[o + 3] = r // n, g // n, b // n, 255
    return CANVAS_W, CANVAS_H, out


def classify(w, h, px):
    """Asphalt, road paint and scrub masks.

    Written to this plate's own numbers rather than copied off the tracer, so
    that the two are two readings and not one read twice. The tracer asks for
    saturation <= 40 and luminance < 130 for asphalt, <= 44 and >= 165 for a
    white line, g-b >= 150 for a yellow dash and r-b >= 70 for scrub. This asks
    for a slightly looser asphalt and a slightly tighter everything else, and it
    is the AREA-AVERAGED pixels being asked, which is the half of the difference
    that matters on a kerb.

    MEASURED, not picked. Mid-asphalt reads (63,62,73): saturation 10, luminance
    66. An edge line is (241,244,246) and a dash core (255,224,4), so neither is
    within reach of the scrub, which runs (218,154,78) in the sun and (144,120,
    24) in the olive patches -- r-b of 140 and 120 against a dash's 251.
    """
    asphalt = bytearray(w * h)
    paint = bytearray(w * h)
    scrub = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        sat = max(r, g, b) - min(r, g, b)
        lum = (r + g + b) // 3
        if sat <= 46 and lum < 136:
            asphalt[i] = 1
        elif sat <= 40 and lum >= 170:
            paint[i] = 1
        elif g - b >= 160 and r - g >= 24:
            paint[i] = 1
        elif r > g > b and r - b >= 64 and 58 <= lum < 212:
            scrub[i] = 1
    return asphalt, paint, scrub


def probe(w, h, asphalt, paint, scrub, cx, cy):
    """(asphalt, paint, scrub shares, largest solid obstruction) in a probe disc."""
    inside, a, p, s, total = set(), 0, 0, 0, 0
    for dy in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
        for dx in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
            if dx * dx + dy * dy > PROBE_RADIUS * PROBE_RADIUS:
                continue
            X, Y = cx + dx, cy + dy
            if not (0 <= X < w and 0 <= Y < h):
                continue
            total += 1
            i = Y * w + X
            a += asphalt[i]
            p += paint[i]
            s += scrub[i]
            if not (asphalt[i] or paint[i] or scrub[i]):
                inside.add((X, Y))
    biggest, seen = 0, set()
    for pt in inside:
        if pt in seen:
            continue
        comp, q = 0, deque([pt])
        seen.add(pt)
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
    return a / total, p / total, s / total, biggest


def blobs(w, h, mask, min_area):
    """Connected runs of a mask at least `min_area` px, as pixel-index lists."""
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
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        if len(comp) >= min_area:
            out.append(comp)
    return out


def close_slits(w, h, mask, r):
    """Dilate then erode, so the outline of a centre dash does not cut the road.

    THE TRACER REACHES THE SAME PLACE BY A DIFFERENT ROUTE, which is what makes
    this a check. It seeds a reconstruction on grey asphalt and grows it into the
    paint the asphalt touches; this takes asphalt and paint together, closes the
    hairline slits along the dash outlines, and throws away whatever does not
    span the full width. A white sign face out on the scrub survives the close
    here and is dropped by the full-width test instead of never being reached.

    Off-frame left and right counts as inside for the erode: every highway runs
    out through the west and east edges, and an erode that treats the frame as a
    wall moves all six terminals inboard.
    """
    def sweep(src, keep_if_all):
        box = [(dx, dy) for dy in range(-r, r + 1) for dx in range(-r, r + 1)
               if dx * dx + dy * dy <= r * r]
        out = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                hit = keep_if_all
                for dx, dy in box:
                    xx, yy = x + dx, y + dy
                    if not (0 <= xx < w):
                        continue
                    v = 0 if not (0 <= yy < h) else src[yy * w + xx]
                    if keep_if_all and not v:
                        hit = False
                        break
                    if not keep_if_all and v:
                        hit = True
                        break
                out[y * w + x] = 1 if hit else 0
        return out
    return sweep(sweep(mask, False), True)


def spread(w, h, mask):
    """Distance in pixels from every pixel to the nearest pixel of `mask`.

    NOT level 4's `depth`, and the difference is the whole finding. `depth`
    measures how deep a pixel sits INSIDE a band and seeds the frame edge at
    zero, which is right for keeping a geodesic in the middle of a road and
    wrong for measuring the gap between two roads: every highway here touches
    both vertical frame edges, so a depth map of one band's complement reads 0
    on every pixel of another band, and the first version of this file reported
    all three pairs of highways as touching. They are 111, 112 and 298 px apart.

    A plain BFS from the mask, with the frame seeded nowhere.
    """
    INF = 10 ** 9
    d = [INF] * (w * h)
    q = deque()
    for i in range(w * h):
        if mask[i]:
            d[i] = 0
            q.append(i)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if d[j] > d[i] + 1:
                    d[j] = d[i] + 1
                    q.append(j)
    return d


def open_thin(w, h, mask, r):
    """Erode then dilate: anything narrower than 2r across is gone.

    THE SAME PASS THE TRACER NEEDS, FOR ITS OWN INSTANCE OF THE SAME PROBLEM,
    and that is worth spelling out because it is the one place this file adopts
    a decision the tracer made. Props on this plate are drawn in dark grey --
    sign posts, power poles, guard rails, the wreck's bodywork -- so a colour
    classifier calls them asphalt, and the ones that touch a highway join its
    component. The tracer found the post at x about 1220, which hangs off the
    bottom highway and made that band measure 171 px tall. This mask, built by a
    different route, joined a DIFFERENT prop: the signpost at the east frame
    edge around y=65, which put a second east opening on the north highway and
    left 4.6% of the "road" with no lane down it.

    Both are the same fault and both go the same way. Nothing here is 8 px wide
    that should survive: the narrowest real thing on the plate is a 67 px
    highway.
    """
    box = [(dx, dy) for dy in range(-r, r + 1) for dx in range(-r, r + 1)
           if dx * dx + dy * dy <= r * r]

    def sweep(src, keep_if_all):
        out = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                hit = keep_if_all
                for dx, dy in box:
                    xx, yy = x + dx, y + dy
                    if not (0 <= xx < w):
                        continue                # off the west/east frame: inside
                    v = 0 if not (0 <= yy < h) else src[yy * w + xx]
                    if keep_if_all and not v:
                        hit = False
                        break
                    if not keep_if_all and v:
                        hit = True
                        break
                out[y * w + x] = 1 if hit else 0
        return out
    grown = sweep(sweep(mask, True), False)
    return bytearray(1 if (mask[i] and grown[i]) else 0 for i in range(w * h))


def fill_holes(w, h, mask, max_area):
    """Fill enclosed holes in a mask smaller than `max_area`.

    The asphalt is painted with grit and the scrub with stones, and a mask full
    of pinholes stops every normal cast across the road two pixels in. The
    tracer swallows them the same way; this is the one place the two agree by
    construction, and a hole left in a road is not a difference of opinion.
    """
    hole = bytearray(1 if not mask[i] else 0 for i in range(w * h))
    for comp in blobs(w, h, hole, 1):
        if len(comp) > max_area:
            continue
        if any(i % w in (0, w - 1) or i // w in (0, h - 1) for i in comp):
            continue        # open to the frame: not a hole
        for i in comp:
            mask[i] = 1
    return mask


def full_width_bands(w, h, mask, min_area=2000):
    """Components of a mask that touch both the west and the east frame edge."""
    out = []
    for comp in blobs(w, h, mask, min_area):
        xs = [i % w for i in comp]
        if min(xs) == 0 and max(xs) == w - 1:
            out.append(comp)
    return sorted(out, key=lambda c: band_extent(w, c)[0])


def band_extent(w, comp):
    """A band's vertical extent, as the MEDIAN top and bottom row per column.

    Not the minimum and maximum over the whole blob: those are one shaded corner
    or one lump of kerb. What a road height means is what the band measures
    where it is just a road.
    """
    top, bot = {}, {}
    for i in comp:
        x, y = i % w, i // w
        top[x] = min(top.get(x, 10 ** 9), y)
        bot[x] = max(bot.get(x, -1), y)
    tops = sorted(top.values())
    bots = sorted(bot.values())
    return tops[len(tops) // 2], bots[len(bots) // 2]


# ----------------------------------------------------------------- the openings

def edge_runs(w, h, mask, min_len=5):
    """Runs of a mask along each frame edge, keyed by edge."""
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                if i - s >= min_len:
                    out.append((s, i - 1))
                s = None
        return out
    return {
        'west': runs(mask[y * w] for y in range(h)),
        'east': runs(mask[y * w + w - 1] for y in range(h)),
        'north': runs(mask[x] for x in range(w)),
        'south': runs(mask[(h - 1) * w + x] for x in range(w)),
    }


# --------------------------------------------------------------------- overlay

def write_overlay(w, h, px, lanes, pads, path):
    """The re-traced lanes and the geometry file's pads over the real plate."""
    out = bytearray(w * h * 4)
    for i in range(w * h):
        out[i * 4:i * 4 + 4] = bytes(px[i * 4:i * 4 + 3]) + b'\xff'

    def put(x, y, c):
        for dy in (0, 1):
            for dx in (0, 1):
                X, Y = int(x) + dx, int(y) + dy
                if 0 <= X < w and 0 <= Y < h:
                    o = (Y * w + X) * 4
                    out[o], out[o + 1], out[o + 2] = c
    colour = {'north': (255, 60, 60), 'middle': (60, 200, 255), 'south': (255, 60, 255)}
    for name, line in lanes.items():
        for k in range(1, len(line)):
            (x0, y0), (x1, y1) = line[k - 1], line[k]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            for t in range(steps + 1):
                put(x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps,
                    colour.get(name, (255, 255, 255)))
    for (cx, cy) in pads:
        for a in range(0, 360, 2):
            t = math.radians(a)
            put(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (255, 40, 40))
            put(cx + 34 * math.cos(t), cy + 34 * math.sin(t), (255, 255, 255))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    png.write(path, w, h, out)


# ------------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay', action='store_true')
    args = ap.parse_args()

    g = json.load(open(GEOMETRY))
    names = g['lanesAre']
    problems = []

    w, h, px = plate()
    asphalt, paint, scrub = classify(w, h, px)
    total = w * h

    print('\n--- can the ground test fail? ---')
    for label, (cx, cy), want in PROBES:
        a, p, s, blob = probe(w, h, asphalt, paint, scrub, cx, cy)
        ok = {'road': a >= PROBE_SHARE,
              'scrub': s >= PROBE_SHARE and blob < PROBE_PROP_BLOB,
              'prop': blob >= PROBE_PROP_BLOB,
              'unbuildable': s < PROBE_SHARE}[want]
        print(f'  {label:36s} asphalt {a * 100:5.1f}%  paint {p * 100:5.1f}%  '
              f'scrub {s * 100:5.1f}%  solid {blob:3d}px  expected {want}'
              f'{"" if ok else "   <-- WRONG"}')
        if not ok:
            problems.append(f'the classifier reads {label} as {a * 100:.0f}% asphalt / '
                            f'{p * 100:.0f}% paint / {s * 100:.0f}% scrub with a {blob}px solid '
                            f'in it, and it should read {want}; every result below means nothing')
    if problems:
        print('\nthe classifier does not agree with the plate; stopping before the geometry.')
        for pr in problems:
            print('  - ' + pr)
        raise SystemExit(1)

    print('\n--- the shares of the plate ---')
    shares = {'road': (asphalt.count(1) + paint.count(1)) / total,
              'ground': scrub.count(1) / total,
              'props': 1 - (asphalt.count(1) + paint.count(1) + scrub.count(1)) / total}
    for k, v in shares.items():
        print(f'  {k:7s} {v:6.1%}   brief {BRIEF_AREA[k]:.0%}   '
              f'{(v - BRIEF_AREA[k]) * 100:+.1f} points')

    print('\n--- is a highway one lane or two? ---')
    # THE BRIEF'S THIRD WARNING, PROVED RATHER THAN TRUSTED. See this file's
    # header: a grey-only mask has to come out with MORE full-width bands than
    # the real one, or the paint is not doing anything and the inclusion rule
    # above is decoration.
    # TWO GREY-ONLY MASKS, because the paint does two different kinds of damage
    # and only one of them survives a thin-prop pass.
    #
    # RAW: every white edge line runs the entire width of the plate, so grey
    # asphalt alone comes apart into nine full-width strips -- kerb outline,
    # carriageway, kerb outline, three times over. That is the split the brief
    # warns about, and it is what a trace without this rule would hand the
    # level: six lanes and six slivers.
    #
    # OPENED: give the grey mask the same thin-prop pass the real one gets and
    # the 3-4 px slivers vanish, so the count comes back to three and only the
    # WIDTH is left to tell the story. It is decisive on its own -- the
    # carriageways measure 55, 63 and 60 px against the real 67, 75 and 71, so
    # every road on the level would be 12-18% narrow.
    grey_raw = fill_holes(w, h, bytearray(asphalt), 120)
    grey_raw_bands = full_width_bands(w, h, grey_raw)
    grey = open_thin(w, h, bytearray(grey_raw), 4)
    grey_bands = full_width_bands(w, h, grey)
    print(f'  grey asphalt alone, raw: {len(grey_raw_bands)} full-width band(s) '
          + ', '.join(f'{band_extent(w, c)[1] - band_extent(w, c)[0] + 1} px'
                      for c in grey_raw_bands))
    print(f'  grey asphalt alone, thin props removed: {len(grey_bands)} full-width band(s)')
    road = bytearray(1 if asphalt[i] or paint[i] else 0 for i in range(total))
    road = close_slits(w, h, road, 3)
    road = fill_holes(w, h, road, 120)
    road = open_thin(w, h, road, 4)
    bands = full_width_bands(w, h, road)
    print(f'  asphalt + paint, slits closed, thin props removed: {len(bands)} full-width band(s)')
    if len(bands) != 3:
        problems.append(f'{len(bands)} full-width road bands on the plate, not 3')
    if len(grey_raw_bands) <= 3:
        problems.append(f'a raw grey-asphalt-only mask gives {len(grey_raw_bands)} full-width '
                        f'bands, not more than three; the white edge lines have stopped '
                        f'cutting the highways lengthwise, so the rule that includes them is '
                        f'not being tested by anything')
    if len(grey_bands) == len(bands):
        # Same count, so the WIDTH has to carry it. Each grey band against the
        # real band it sits inside.
        for gc in grey_bands:
            gt, gb = band_extent(w, gc)
            host = min(bands, key=lambda c: abs(band_extent(w, c)[0] - gt))
            ht, hb = band_extent(w, host)
            lost = 1 - (gb - gt + 1) / (hb - ht + 1)
            print(f'    grey {gt}-{gb} ({gb - gt + 1} px) inside real {ht}-{hb} '
                  f'({hb - ht + 1} px): a grey-only trace loses {lost:.0%} of the width')
            if lost < 0.08:
                problems.append(f'dropping the white lines and yellow dashes costs the '
                                f'{ht}-{hb} highway only {lost:.1%} of its width; the rule '
                                f'that includes them is not changing anything measurable')
    if len(bands) != 3:
        print('\nthe plate does not carry three highways; stopping before the geometry.')
        for pr in problems:
            print('  - ' + pr)
        raise SystemExit(1)

    print('\n--- the white lines and the yellow dashes are inside the road ---')
    # THE BRIEF'S THIRD WARNING, TESTED WHERE IT CAN FAIL. Every row that is
    # mostly paint has to be a row of the road mask, or the lane it belongs to
    # has been shaved or split. Measured across the WHOLE WIDTH, which is what a
    # 2 px line needs and what a 28 px probe disc cannot give.
    # PAINT LINES, NOT PAINT ROWS. Counting rows was this file's second bug of
    # its own: an edge line is one or two rows deep once the plate is
    # area-averaged, so the six edge lines came out as ten rows, and the north
    # highway's lower line -- 1279 px in one row and 893 in the next -- had its
    # second row counted as a dashed line 30 px off the centre of the band.
    # Consecutive rows are one line, and a line is an edge line or a dash line
    # by the MOST paint any of its rows carries.
    per_row = [sum(paint[y * w + x] for x in range(w)) for y in range(h)]
    lines_of_paint, run = [], []
    for y in range(h):
        if per_row[y] >= DASH_SHARE * w:
            run.append(y)
        elif run:
            lines_of_paint.append(run)
            run = []
    if run:
        lines_of_paint.append(run)
    edge_lines = [r for r in lines_of_paint if max(per_row[y] for y in r) >= EDGE_LINE_SHARE * w]
    dash_lines = [r for r in lines_of_paint if r not in edge_lines]
    print(f'  {len(edge_lines)} solid full-width paint lines (the edge lines): '
          + ', '.join(f'rows {r[0]}-{r[-1]}' for r in edge_lines))
    print(f'  {len(dash_lines)} dashed paint lines (the centre dashes): '
          + ', '.join(f'rows {r[0]}-{r[-1]} at {max(per_row[y] for y in r) / w:.0%} of the width'
                      for r in dash_lines))
    if len(edge_lines) != 6:
        problems.append(f'{len(edge_lines)} full-width paint lines on the plate, not 6; three '
                        f'highways have two edge lines each')
    if len(dash_lines) != 3:
        problems.append(f'{len(dash_lines)} dashed paint lines on the plate, not 3; each '
                        f'highway carries one line of centre dashes')
    paint_rows = [y for r in edge_lines for y in r]
    dash_rows = [y for r in dash_lines for y in r]
    stray = 0
    for y in paint_rows + dash_rows:
        for x in range(w):
            if paint[y * w + x] and not road[y * w + x]:
                stray += 1
    print(f'  {stray} px of edge line and centre dash are NOT inside the road mask')
    if stray:
        problems.append(f'{stray} px of white edge line or yellow centre dash is outside the '
                        f'road mask; the brief says both are part of the road, and a mask that '
                        f'leaves them out shrinks the lane or splits it in two')
    # AND EVERY DASH ROW HAS TO BE MID-BAND. A dash line sitting at the top of a
    # band would mean the band is two carriageways read as one lane the wrong
    # way round, and it is what the lane centreline is expected to land on.
    for r in dash_lines:
        y = (r[0] + r[-1]) // 2
        owner = [c for c in bands if any(i // w == y for i in c)]
        if len(owner) != 1:
            problems.append(f'the dashed row y={y} belongs to {len(owner)} road bands, not one')
            continue
        t, b = band_extent(w, owner[0])
        middle = (t + b) / 2
        print(f'  dashes at y={y} sit {abs(y - middle):.1f} px off the centre of the '
              f'{t}-{b} band')
        if abs(y - middle) > 4:
            problems.append(f'the centre dashes at y={y} are {abs(y - middle):.1f} px off the '
                            f'centre of their own band ({t}-{b}); they are not a centre line')

    print('\n--- the bands, and the brief\'s percentages ---')
    masks, extents = {}, {}
    for name, comp in zip(names, bands):
        m = bytearray(total)
        for i in comp:
            m[i] = 1
        masks[name] = m
        extents[name] = band_extent(w, comp)
        t, b = extents[name]
        lo, hi = t / h, (b + 1) / h
        want_lo, want_hi = BRIEF_BANDS[name]
        off = max(abs(lo - want_lo), abs(hi - want_hi))
        print(f'  {name:7s} rows {t:3d}-{b:3d} = {b - t + 1:3d} px  '
              f'{lo:5.1%}-{hi:5.1%} of the height  (brief {want_lo:.0%}-{want_hi:.0%})'
              f'{"" if off <= BRIEF_BAND_TOLERANCE else "   <-- out"}')
        if off > BRIEF_BAND_TOLERANCE:
            problems.append(f'the {name} highway sits at {lo:.1%}-{hi:.1%} of the height, not '
                            f'the briefed {want_lo:.0%}-{want_hi:.0%}')
        declared = g['bandExtent'][name]
        if [t, b] != declared:  # noqa: E501 - see the clip below
            problems.append(f'the {name} band spans rows {t}-{b} here and {declared} in the '
                            f'geometry file')
        hoff = abs((b - t + 1) - BRIEF_ROAD_HEIGHT[name]) / BRIEF_ROAD_HEIGHT[name]
        if hoff > TOLERANCE:
            problems.append(f'the {name} highway is {b - t + 1} px tall against the briefed '
                            f'{BRIEF_ROAD_HEIGHT[name]:.0f}, {hoff * 100:.1f}% out')

    print('\n--- six terminals, all on a vertical edge ---')
    for name in names:
        runs = edge_runs(w, h, masks[name])
        print(f'  {name:7s} west {runs["west"]}  east {runs["east"]}  '
              f'north {runs["north"]}  south {runs["south"]}')
        if len(runs['west']) != 1 or len(runs['east']) != 1:
            problems.append(f'the {name} highway has {len(runs["west"])} west and '
                            f'{len(runs["east"])} east openings, not one of each')
            continue
        if runs['north'] or runs['south']:
            problems.append(f'the {name} highway touches the top or bottom frame edge; all '
                            f'six terminals on this level are on a vertical edge')
        for edge in ('west', 'east'):
            lo, hi = runs[edge][0]
            declared = g['openings'][name][edge]
            if abs((lo + hi) / 2 - sum(declared) / 2) > 3:
                problems.append(f'the {name} {edge} opening spans {lo}-{hi} here and '
                                f'{declared} in the geometry file')
            at = g['entrances'][name] if edge == 'west' else g['exits'][name]
            if not (lo <= at[1] <= hi):
                problems.append(f'the {name} {edge} terminal {at} is not inside the '
                                f'{lo}-{hi} opening measured here')

    print('\n--- the four scrub strips ---')
    edges = [extents[n] for n in names]
    strips = [(0, edges[0][0] - 1), (edges[0][1] + 1, edges[1][0] - 1),
              (edges[1][1] + 1, edges[2][0] - 1), (edges[2][1] + 1, h - 1)]
    for i, ((a, b), want) in enumerate(zip(strips, BRIEF_STRIP_HEIGHT)):
        got = b - a + 1
        off = abs(got - want) / want
        declared = g['groundStrips'][i]
        print(f'  strip {i}  rows {a:3d}-{b:3d} = {got:3d} px  (brief {want:.0f}, geometry '
              f'{declared["height"]}){"" if off <= TOLERANCE else "   <-- out"}')
        if off > TOLERANCE:
            problems.append(f'scrub strip {i} is {got} px tall against the briefed '
                            f'{want:.0f}, {off * 100:.1f}% out')
        if declared['height'] != got or declared['rows'] != [a, b]:
            problems.append(f'scrub strip {i} is rows {a}-{b} here and '
                            f'{declared["rows"]} in the geometry file')

    print('\n--- do the three lanes ever touch? ---')
    # THE PREMISE OF THE WHOLE LEVEL. Nearest approach between two painted
    # bands, measured with a depth transform seeded on one and read on the
    # other, and then between two shipped centrelines.
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            da = spread(w, h, masks[a])
            gap = min(da[j] for j in range(total) if masks[b][j]) - 1
            centre = min(point_to_polyline(p, g['lanes'][b]) for p in g['lanes'][a])
            print(f'  {a:7s} to {b:7s}: {gap:5.1f} px between the paint, {centre:5.1f} px '
                  f'between shipped centrelines')
            if gap < MIN_BAND_GAP:
                problems.append(f'the {a} and {b} highways come within {gap:.1f} px of each '
                                f'other; three independent lanes is the premise of the level')
            declared = g['gaps'].get(f'{a}-{b}', {})
            if declared and abs(declared['paintToPaint'] - gap) > 3:
                problems.append(f'the {a}-{b} gap is {gap:.1f} px here and '
                                f'{declared["paintToPaint"]} in the geometry file')

    print('\n--- the lanes, re-traced off the plate ---')
    lanes = {}
    for name in names:
        band = masks[name]
        deep = depth(w, h, band)
        maxdeep = max(d for d in deep if d < 10 ** 9)
        seed, _ = component(w, h, band, (1, int(round(g['entrances'][name][1]))))
        a = (0, int(round(g['entrances'][name][1])))
        b = (w - 1, int(round(g['exits'][name][1])))
        if not (band[a[1] * w + a[0]] and band[b[1] * w + b[0]]):
            problems.append(f'the {name} lane\'s declared terminals are not both on its paint')
            continue
        if not seed[b[1] * w + b[0]]:
            problems.append(f'the {name} lane\'s entrance and exit are not on the same band')
        lanes[name] = geodesic(w, h, band, deep, maxdeep, a, b)
        traced = polyline_length(lanes[name])
        declared = g['lengths'][name]
        off = abs(traced - declared) / declared
        print(f'  {name:7s} traced {traced:7.1f}  geometry {declared:7.1f}  '
              f'{off * 100:5.2f}%{"" if off <= TOLERANCE else f"   <-- over {TOLERANCE:.0%}"}')
        if off > TOLERANCE:
            problems.append(f"the {name} lane traces {traced:.1f} against the geometry file's "
                            f'{declared:.1f}, {off * 100:.2f}% out')

    print('\n--- road width per lane ---')
    for name in names:
        if name not in lanes:
            continue
        derived = median(widths(w, h, masks[name], lanes[name]))
        declared = g['roadWidthPerLane'][name]
        off = abs(derived - declared) / declared
        print(f'  {name:7s} re-derived {derived:5.1f}  geometry {declared:3d}  '
              f'{off * 100:5.2f}%  (gate {WIDTH_TOLERANCE:.0%})'
              f'{"" if off <= WIDTH_TOLERANCE else "   <-- out"}')
        if off > WIDTH_TOLERANCE:
            problems.append(f'the {name} highway measures {derived:.1f} px wide here against '
                            f'the geometry file\'s {declared}, {off * 100:.2f}% out')
        # AND THE BRIEF SAYS NOT TO NARROW THEM. These are two-lane highways
        # drawn deliberately wider than the 50 px house standard, so a width
        # that has drifted back towards 50 is a regression rather than a
        # measurement.
        if derived < 60:
            problems.append(f'the {name} highway measures {derived:.1f} px, under the 60 px '
                            f'floor; the brief says these are two-lane highways and must not '
                            f'be narrowed towards the 50 px house standard')

    print('\n--- where the shipped lines actually run ---')
    for name in names:
        line = g['lanes'][name]
        band = masks[name]
        deep = depth(w, h, band)
        off, shallow, worst = 0, 0, (1e9, None)
        for x, y in line:
            X, Y = int(round(x)), int(round(y))
            if not (0 <= X < w and 0 <= Y < h and band[Y * w + X]):
                off += 1
                continue
            if min(X, Y, w - 1 - X, h - 1 - Y) <= GATE_MARGIN:
                continue
            d = deep[Y * w + X]
            worst = min(worst, (d, (X, Y)))
            if d < VERTEX_MID_BAND * g['roadWidthPerLane'][name] / 2:
                shallow += 1
        note = f'(worst {worst[0]:.1f} px at {worst[1]})' if worst[1] else '(all at a gate)'
        print(f'  {name:7s} {len(line):3d} vertices, {off} off the paint, {shallow} nearer the '
              f'kerb than {VERTEX_MID_BAND:.0%} of the half-width  {note}')
        if off:
            problems.append(f"{off} of the {name} lane's {len(line)} shipped vertices are not "
                            f'on its painted band')
        if shallow:
            problems.append(f"{shallow} of the {name} lane's shipped vertices sit closer to a "
                            f"kerb than {VERTEX_MID_BAND:.0%} of the road's half-width")

    print('\n--- do the shipped lines cover the paint? ---')
    near_line = bytearray(total)
    for name in names:
        reach_px = int(math.ceil(g['roadWidthPerLane'][name]))
        line = g['lanes'][name]
        for k in range(1, len(line)):
            (x0, y0), (x1, y1) = line[k - 1], line[k]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            for t in range(steps + 1):
                cx, cy = x0 + (x1 - x0) * t / steps, y0 + (y1 - y0) * t / steps
                for dy in range(-reach_px, reach_px + 1):
                    Y = int(round(cy)) + dy
                    if not (0 <= Y < h):
                        continue
                    span = int(math.sqrt(max(0, reach_px * reach_px - dy * dy)))
                    row = Y * w
                    for X in range(max(0, int(round(cx)) - span),
                                   min(w, int(round(cx)) + span + 1)):
                        near_line[row + X] = 1
    # MEASURED ON THE CARRIAGEWAY, and what is left out is printed rather than
    # dropped quietly. Two of the big road signs are dark-panelled, read as
    # asphalt, and are attached to the north highway through a post thick enough
    # to survive the thin-prop pass -- so the north band component carries about
    # 3,400 px of signage in the top-right corner that is 90 px above the road.
    # No centreline runs down a sign and none should, so the coverage question
    # is asked of each band's own rows; the share outside them is asserted to be
    # small, because a genuinely bent road would show up here as well.
    in_band = bytearray(total)
    for name in names:
        t, b = extents[name]
        outside = 0
        for i in range(total):
            if not masks[name][i]:
                continue
            if t <= i // w <= b:
                in_band[i] = 1
            else:
                outside += 1
        share = outside / sum(masks[name])
        print(f'  {name:7s} {outside} px of its component sit outside its own rows '
              f'{t}-{b} ({share:.1%}): road-coloured signage, not carriageway')
        if share > 0.05:
            problems.append(f'{share:.1%} of the {name} band sits outside its own row extent '
                            f'{t}-{b}; either the highway is not straight or something large '
                            f'and road-coloured is attached to it')
    band_px = sum(in_band)
    covered = sum(1 for i in range(total) if near_line[i] and in_band[i])
    print(f'  {covered} of {band_px} painted road pixels sit within one road width of a '
          f'shipped centreline: {covered / band_px:.2%}  (needs {COVERAGE_MIN:.0%})')
    if covered / band_px < COVERAGE_MIN:
        problems.append(f'only {covered / band_px:.2%} of the painted road is within one road '
                        f'width of a shipped centreline; a stretch of paint has no lane '
                        f'down it')

    # THE AREA IDENTITY. Painted area over painted width is a length, and it
    # touches no geodesic at all, so it does not care which walk drew the line.
    print('\n--- road area over road width, against the declared length ---')
    by_area = sum(sum(1 for i in range(total) if in_band[i] and masks[n][i])
                  / g['roadWidthPerLane'][n] for n in names)
    declared_total = g['roadLength']
    off = abs(by_area - declared_total) / declared_total
    print(f'  {by_area:.1f} against the declared roadLength {declared_total:.1f}  '
          f'{off * 100:.2f}%  (gate {AREA_TOLERANCE:.0%})')
    if off > AREA_TOLERANCE:
        problems.append(f'the painted road is {by_area:.1f} long by area over width against '
                        f'the geometry file\'s {declared_total:.1f}, {off * 100:.2f}% out')

    print('\n--- the pads ---')
    # EVERY CORE ON BUILDABLE SCRUB, and every standoff re-measured against a
    # line this file traced rather than read out of the file.
    pads = [tuple(p) for p in g['pads']]
    ground = bytearray(scrub)
    two_lane = 0
    print(f'  {"#":>3} {"cx":>5} {"cy":>4} ' + ' '.join(f'{n:>7s}' for n in names)
          + f' {"standoff":>8} {"core":>12}  covers')
    for i, (cx, cy) in enumerate(pads):
        d = {n: point_to_polyline((cx, cy), g['lanes'][n]) for n in names}
        reach = sorted(n for n in names if d[n] <= TOWER_RANGE)
        if len(reach) >= 2:
            two_lane += 1
        offg, blob = core_ground(w, h, ground, cx, cy)
        stand = min(d.values())
        flags = []
        if offg:
            flags.append(f'{offg} px of its radius-{PAD_CORE_RADIUS} core is not scrub '
                         f'(largest solid blob {blob} px)')
        if not (HOUSE_STANDOFF[0] - STANDOFF_TOLERANCE <= stand
                <= HOUSE_STANDOFF[1] + STANDOFF_TOLERANCE):
            flags.append(f'stands {stand:.1f} px off the nearest lane, outside '
                         f'{HOUSE_STANDOFF[0]:.0f}-{HOUSE_STANDOFF[1]:.0f}')
        if abs(stand - g['padDetail'][i]['standoff']) > STANDOFF_TOLERANCE:
            flags.append(f'standoff {stand:.1f} here against '
                         f'{g["padDetail"][i]["standoff"]} in the geometry file')
        if reach != g['padDetail'][i]['covers']:
            flags.append(f'covers {reach} here against {g["padDetail"][i]["covers"]} in the '
                         f'geometry file')
        if min(cx, cy, w - cx, h - cy) < PAD_EDGE_MARGIN:
            flags.append(f'its {PAD_EDGE_MARGIN} px tap target runs off the frame')
        print(f'  {i:3d} {cx:5d} {cy:4d} ' + ' '.join(f'{d[n]:7.1f}' for n in names)
              + f' {stand:8.1f} {offg:5d} px off {blob:3d}  {len(reach)}: {",".join(reach)}'
              + (f'\n      <-- ' + '; '.join(flags) if flags else ''))
        for f in flags:
            problems.append(f'pad {i} at ({cx},{cy}): {f}')
    if len(pads) > 1:
        closest = min(math.dist(a, b) for i, a in enumerate(pads) for b in pads[i + 1:])
        print(f'  closest pair {closest:.1f} px (needs >= {PAD_SPACING})')
        if closest < PAD_SPACING:
            problems.append(f'two pads are {closest:.1f} px apart, under the {PAD_SPACING} px '
                            f'separation levels 3, 4 and 8 hold')
    print(f'  PADS THAT REACH TWO HIGHWAYS AT ONCE: {two_lane} of {len(pads)}  '
          f'(geometry file says {g["padsCoveringTwoLanes"]})')
    if two_lane != g['padsCoveringTwoLanes']:
        problems.append(f'{two_lane} pads reach two highways here against the geometry '
                        f'file\'s {g["padsCoveringTwoLanes"]}; that number is what both boss '
                        f'HP values have to be soaked against')

    # ---------------------------------------------------------------------
    # THE BRIEF'S ROAD-AREA FIGURE, WHICH THE PLATE CANNOT SUPPORT, and which is
    # reported rather than enforced because it is the brief that is out and not
    # the mask.
    #
    # The brief gives road 37%, ground 59%, props 4%, and separately gives the
    # three road bands as 16-26%, 41-52% and 67-77% of the height. Those two
    # statements do not agree with each other: bands of 10, 11 and 10 percent of
    # the height, running the full width, are 31% of the plate, not 37. The
    # three heights it gives in world pixels say the same thing -- 67 + 75 + 70
    # is 212 px of 720, which is 29.4%.
    #
    # Measured here: the three highways are 30.0% of the canvas, and asphalt
    # plus paint anywhere on the plate is 34.7% -- the difference being the
    # road-coloured props, the guard rails, the cones, the poles and the wreck.
    # Ground lands at 58.8% against the briefed 59%, which is the figure the
    # brief got right and the one that matters for pads.
    # ---------------------------------------------------------------------
    band_share = band_px / total
    print(f'\n  the three highways alone are {band_share:.1%} of the canvas; asphalt and paint '
          f'anywhere is {shares["road"]:.1%}')
    print(f'  the brief says 37%, and its own band percentages say 31% and its own heights '
          f'29.4%. Recorded, not enforced -- see the block above this line.')

    if args.overlay:
        write_overlay(w, h, px, lanes, pads, OVERLAY_OUT)
        print(f'\noverlay written to {os.path.relpath(OVERLAY_OUT, ROOT)}')

    print()
    if problems:
        print(f'{len(problems)} DISAGREEMENT(S):')
        for pr in problems:
            print('  - ' + pr)
        raise SystemExit(1)
    print('the plate and tools/level7_geometry.json agree.')


if __name__ == '__main__':
    main()
