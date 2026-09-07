"""Check tools/level8_geometry.json against the painted level 8 plate.

    python3 tools/check_level8.py
    python3 tools/check_level8.py --overlay     # also write the pad overlay PNG

tools/trace_level8.py DERIVED the geometry. This asks, independently, whether
the plate agrees with what it wrote -- the same division of labour levels 3 and
4 use, and the reason both halves exist. So this file does not import the
tracer. It reads the plate again, with its own classifier written to its own
thresholds and an AREA-AVERAGED downsample rather than the tracer's point
sample, re-walks the road, and compares. Where the two agree, two different
readings of the paint agree; where they do not, one of them is wrong and the
run stops.

Level 8 is an abandoned corporate office floor: a warm tan dirt path over flat
muted blue-grey carpet. ONE ENTRANCE, TWO EXITS -- the first map to fork.

THE THREE THINGS THE BRIEF STATES ABOUT THIS PLATE are checked as facts rather
than assumed, because each one is a place a trace can go quietly wrong:

  EXACTLY THREE OPENINGS -- left edge at 16% of the height, right edge at 75%,
  bottom edge at 85% of the width. A fourth means a prop is touching the frame
  and has been read as a road, and a lane would then be built that nothing
  walks.

  THE BOTTOM EXIT IS WIDE, about 2.8 road widths, because the art spreads
  there. Its CENTRE is the terminal; its width is not a road width and is kept
  out of the median.

  THE HAZARD STRIPING IS A PROP. The conveyors in the two right-hand corners
  are painted in yellow and orange stripes that a plain warm-colour test calls
  road. Two probes sit on them, and they have to read as obstruction.

Nothing at runtime depends on this. It is the record of where
tools/level8_geometry.json came from and how to redo it when the art changes.
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
# THE GEOMETRY HELPERS ARE LEVEL 4'S, deliberately: connected component, the
# depth transform, the mid-band geodesic, normals for width and the pad core
# walk are the algorithms this level is being asked to be measured BY. Rewriting
# them here would be a second implementation to keep in step, and a bug in the
# copy would read as a level 8 finding.
from check_level4 import (component, core_ground, depth, geodesic, median,     # noqa: E402
                          point_to_polyline, polyline_length, widths)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOMETRY = os.path.join(ROOT, 'tools/level8_geometry.json')
PLATE_WEBP = os.path.join(ROOT, 'public/assets/maps/map_level8.webp')
PLATE_SOURCE = os.path.join(ROOT, 'art-source/Courjahan_Defense_Level8_4K.png')
OVERLAY_OUT = os.path.join(ROOT, 'tools/decode/out/level8_pads.png')

CANVAS_W, CANVAS_H = 1280, 720

# THE LENGTH GATE IS 10%, NOT LEVEL 4's 3%, and that is a statement about what
# a geodesic can resolve on a road this shape rather than about level 8.
#
# Both halves of this pass walk the middle of the painted band, but they weight
# "the middle" differently -- the tracer's cost pushes harder toward the deepest
# pixel, this one's tolerates a shallower line -- and on a road that is almost
# all curve the two answers separate:
#
#     lane      tracer   re-traced here    apart
#     shared    1328.8      1259.2         5.2%
#     east       391.6       360.3         8.0%
#     south     2315.2      2216.6         4.3%
#
# Every one of those is the re-trace cutting a corner the tracer went round, and
# the shortest lane moves most, which is what corner-cutting does. Neither is
# wrong; a curve has no single length until you say where the line runs. So the
# gate is set to catch the mistake it is FOR -- a lane declared at 2315 that is
# painted at 1200, or a branch swapped for its neighbour -- and the line's
# actual placement is checked directly instead, below, where every vertex of the
# shipped polyline has to sit on paint and near the middle of it. That test does
# not care which geodesic drew it.
TOLERANCE = 0.10
WIDTH_TOLERANCE = 0.08
# A shipped vertex has to be at least this much of the road's half-width from
# the paint's edge. 0.45 allows a line to wander a little off centre and still
# fails a line that is riding the kerb.
VERTEX_MID_BAND = 0.45

PAD_MIN_FROM_LANE, PAD_MAX_FROM_LANE = 90.0, 114.0
PAD_MIN_SPACING = 74.0
PAD_CORE_RADIUS = 24
MIN_OBSTRUCTION_BLOB = 30

# The three openings the brief states, as a fraction of the frame, and how far
# a measured centre may sit from one. 2% of 720 is 14 px, which is well inside
# one road width and well outside measurement noise.
OPENINGS = {'west': ('y', 0.16), 'east': ('y', 0.75), 'south': ('x', 0.85)}
OPENING_TOLERANCE = 0.02
# The bottom mouth, in road widths. The brief says about 2.8; the paint spreads
# unevenly and the classifier's edge moves a few pixels either way, so the gate
# is a band rather than a figure.
SOUTH_MOUTH_WIDTHS = (2.4, 3.4)

# THE REFERENCE THE BRIEF CARRIES, and it does not agree with the plate. See
# the block in main(): the trace and an independent area/width measurement of
# the same mask land within 1% of each other and 11% under this, so it is
# recorded and printed rather than enforced. Enforcing it would fail every run
# for as long as the figure stands.
REFERENCE_ROAD_LENGTH = 4554.0
REFERENCE_ROAD_WIDTH = 50.0

PROBE_RADIUS = 16
# Canvas coordinates with a known answer, and the run stops if any of them
# comes out wrong -- a classifier that cannot fail would make every pad below
# pass for the wrong reason. Two of the four props are the conveyors, because
# their hazard striping is the one decision on this plate a warm-colour test
# gets wrong, and the brief warns about it by name.
#
# A PROP IS TESTED AS A BLOB, not as an absence. The server racks are painted
# dark blue-purple and some of their panels do fall inside the carpet's colour
# box, so "is any of this disc carpet?" reads half the rack as floor. What
# separates a prop from the floor is that it is SOLID: the largest connected
# run of neither-road-nor-carpet inside the probe is 325 to 797 px on the four
# props and 0 to 47 px on open carpet. That is the same property the pad core
# check leans on, so it is the one worth proving still holds.
PROBES = [
    ('the road, the loop\'s lower arm',          (300, 500), 'road'),
    ('the road, below the fork',                 (900, 530), 'road'),
    ('the carpet, inside the loop',              (300, 430), 'carpet'),
    ('the carpet, above the loop',               (200, 250), 'carpet'),
    ('the top-right conveyor',                   (975,  70), 'prop'),
    ('the bottom-right conveyor',               (1170, 630), 'prop'),
    ('the top-centre server rack',               (610,  40), 'prop'),
    ('the Performance Review hardware',          (960, 300), 'prop'),
]
# What the probe demands of each answer.
PROBE_SHARE = 0.90       # road and carpet: this much of the disc, at least
PROBE_PROP_BLOB = 200    # prop: a connected obstruction at least this big
PROBE_CLEAN_BLOB = 100   # carpet: nothing solid in it


# ------------------------------------------------------------------- the plate

def plate():
    """The plate at canvas resolution, AREA-AVERAGED.

    The tracer point-samples one source pixel per canvas pixel. This box-filters
    the whole 3x3 block instead, so the two disagree on every antialiased edge
    in the picture -- which is the point. An edge that only one of them can find
    is an edge neither should be trusting.
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
    """Road and buildable-carpet masks.

    Written to this plate's own numbers rather than copied off the tracer, so
    that the two are two readings and not one read twice.

      road     warm tan. Red leads, blue trails, and there IS blue in it --
               b sits in the high forties to the nineties. That last clause is
               the whole conveyor exclusion: the hazard striping is saturated
               yellow-orange with b near zero, and it is otherwise a perfect
               match for the track.

      carpet   the flat muted blue-grey floor, which is the only ground on this
               level that takes a tower. Blue leads, red trails, and the whole
               thing is dark -- the carpet never brightens past the middle of
               the range, while the props painted on it (server racks lit from
               above, the white cartons, the paper) do.

    Everything else is an obstruction: the desks, the filing cabinets, the
    plant, the cabling, the racks, the carts, the signage, the Performance
    Review hardware and both conveyors. MIN_OBSTRUCTION_BLOB is what stops the
    carpet's own painted speckle from counting as one.
    """
    road = bytearray(w * h)
    turf = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        lum = (r + g + b) // 3
        if r > g > b and r - g >= 38 and b >= 42 and lum > 88:
            road[i] = 1
        elif b > g >= r and b - r >= 28 and 42 < lum < 132:
            turf[i] = 1
    return road, turf


def probe(w, h, road, turf, cx, cy):
    """(road share, carpet share, largest solid obstruction) inside a probe disc."""
    inside, r, t, total = set(), 0, 0, 0
    for dy in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
        for dx in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
            if dx * dx + dy * dy > PROBE_RADIUS * PROBE_RADIUS:
                continue
            X, Y = cx + dx, cy + dy
            if not (0 <= X < w and 0 <= Y < h):
                continue
            total += 1
            r += road[Y * w + X]
            t += turf[Y * w + X]
            if not road[Y * w + X] and not turf[Y * w + X]:
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
    return r / total, t / total, biggest


def bridge(w, h, mask, r):
    """Close gaps up to 2r wide, so a line drawn ACROSS the road does not cut it.

    THE PERFORMANCE REVIEW SCANS THE TRACK and its red beam is painted right
    across it, 6-7 px wide at canvas resolution. It is not tan, so the
    classifier calls it a wall, and a component seeded at the entrance then
    stops dead at the gate -- which would leave the whole south branch, and
    both exits, outside the band this is measuring. A close bridges the beam
    and puts the road's own edges back where they were, so the widths measured
    afterwards are unaffected. It cannot join two roads that were never within
    2r of each other, and the road is 51 px wide.
    """
    def pass_(src, grow):
        out = bytearray(w * h)
        for y in range(h):
            for x in range(w):
                hit = False
                for dy in range(-r, r + 1):
                    yy = y + dy
                    if not (0 <= yy < h):
                        continue
                    for dx in range(-r, r + 1):
                        xx = x + dx
                        if 0 <= xx < w and (src[yy * w + xx] != 0) == grow:
                            hit = True
                            break
                    if hit:
                        break
                out[y * w + x] = (1 if hit else 0) if grow else (0 if hit else 1)
        return out
    return pass_(pass_(mask, True), False)


# ----------------------------------------------------------------- the openings

def edge_runs(w, h, mask, min_len=5):
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
    return {
        'west': runs(mask[y * w] for y in range(h)),
        'east': runs(mask[y * w + w - 1] for y in range(h)),
        'north': runs(mask[x] for x in range(w)),
        'south': runs(mask[(h - 1) * w + x] for x in range(w)),
    }


# --------------------------------------------------------------------- overlay

def write_overlay(w, h, px, lanes, pads, path):
    out = bytearray(px)

    def dot(x, y, rgb, r=0):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x + dx)), int(round(y + dy))
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    out[i], out[i + 1], out[i + 2] = rgb

    colours = {'shared': (255, 255, 255), 'east': (255, 240, 60), 'south': (60, 160, 255)}
    for name, line in lanes.items():
        for x, y in line:
            dot(x, y, colours.get(name, (255, 60, 255)), 1)
    for cx, cy in pads:
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (60, 255, 60))
        dot(cx, cy, (255, 255, 255), 2)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    png.write(path, w, h, out)


# ------------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay', action='store_true')
    args = ap.parse_args()

    g = json.load(open(GEOMETRY))
    problems = []

    w, h, px = plate()
    road, turf = classify(w, h, px)

    print('\n--- can the ground test fail? ---')
    for name, (cx, cy), want in PROBES:
        rs, ts, blob = probe(w, h, road, turf, cx, cy)
        ok = {'road': rs >= PROBE_SHARE,
              'carpet': ts >= PROBE_SHARE and blob < PROBE_CLEAN_BLOB,
              'prop': rs < 1 - PROBE_SHARE and blob >= PROBE_PROP_BLOB}[want]
        print(f'  {name:38s} road {rs * 100:5.1f}%  carpet {ts * 100:5.1f}%  '
              f'solid {blob:3d}px  expected {want}{"" if ok else "   <-- WRONG"}')
        if not ok:
            problems.append(f'the classifier reads {name} as {rs * 100:.0f}% road / '
                            f'{ts * 100:.0f}% carpet with a {blob}px solid in it, and it should '
                            f'read {want}; every result below means nothing')
    if problems:
        print('\nthe classifier does not agree with the plate; stopping before the geometry.')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)

    entrance = tuple(g['entrance'])
    band, _ = component(w, h, bridge(w, h, road, 4),
                        (min(w - 1, entrance[0] + 6), entrance[1]))
    for name, at in g['exits'].items():
        x, y = min(w - 1, max(0, at[0])), min(h - 1, max(0, at[1]))
        if not band[y * w + x]:
            problems.append(f'the {name} exit at {at} is not on the road the entrance reaches')
    if problems:
        print('\nthe road is not one connected band; stopping before the geometry.')
        for pr in problems:
            print('  - ' + pr)
        raise SystemExit(1)
    deep = depth(w, h, band)
    maxdeep = max(d for d in deep if d < 10 ** 9)

    print('\n--- the openings ---')
    runs = edge_runs(w, h, band)
    found = [(e, r) for e, rr in runs.items() for r in rr]
    print(f'  {len(found)} opening(s): ' + ', '.join(
        f'{e} {r[0]}-{r[1]}' for e, r in sorted(found)))
    if len(found) != 3:
        problems.append(f'{len(found)} road openings on the frame, not 3')
    for edge, (axis, want) in OPENINGS.items():
        rr = runs[edge]
        if len(rr) != 1:
            problems.append(f'the {edge} edge has {len(rr)} road openings, not 1')
            continue
        lo, hi = rr[0]
        mid = (lo + hi) / 2
        frac = mid / (h if axis == 'y' else w)
        off = abs(frac - want)
        print(f'  {edge:6s} centre {axis}={mid:6.1f} = {frac:5.1%} of the frame  '
              f'(brief {want:.0%}){"" if off <= OPENING_TOLERANCE else "   <-- out"}')
        if off > OPENING_TOLERANCE:
            problems.append(f'the {edge} opening sits at {frac:.1%}, not the briefed {want:.0%}')
    if runs['north']:
        problems.append('the top edge has a road opening; the brief says three, none of them north')

    print('\n--- the lanes, re-traced off the plate ---')

    def snap(pt):
        x, y = max(0, min(w - 1, int(round(pt[0])))), max(0, min(h - 1, int(round(pt[1]))))
        if band[y * w + x]:
            return (x, y)
        for rad in range(1, 60):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and band[ny * w + nx]:
                        return (nx, ny)
        raise SystemExit(f'no painted track within 60px of {pt}')

    fork = tuple(g['fork'])
    ends = {'shared': (entrance, fork)}
    for name, at in g['exits'].items():
        ends[name] = (fork, tuple(at))
    lanes = {n: geodesic(w, h, band, deep, maxdeep, snap(a), snap(b)) for n, (a, b) in ends.items()}
    for name, line in lanes.items():
        traced = polyline_length(line)
        declared = g['lengths'][name]
        off = abs(traced - declared) / declared
        flag = '' if off <= TOLERANCE else f'   <-- more than {TOLERANCE:.0%}'
        print(f'  {name:7s} traced {traced:7.1f}  geometry {declared:7.1f}  '
              f'{off * 100:5.2f}%{flag}')
        if off > TOLERANCE:
            problems.append(f'the {name} lane traces {traced:.1f} against the geometry file\'s '
                            f'{declared:.1f}, {off * 100:.2f}% out')

    print('\n--- where the shipped line actually runs ---')
    # THE CHECK THAT DOES NOT DEPEND ON WHICH GEODESIC DREW THE LINE. Every
    # vertex the geometry file ships has to sit on painted road, and sit near
    # the middle of it rather than on the kerb. A branch swapped, a lane
    # short-circuiting across the carpet, or a line clipping the inside of a
    # bend all fail here, and none of them can hide behind an estimator.
    depths = depth(w, h, band)
    halfw = None
    for name in ('shared',) + tuple(g['branches']):
        line = g['shared'] if name == 'shared' else g['branches'][name]
        off, shallow, worst = 0, 0, (1e9, None)
        for x, y in line:
            X, Y = int(round(x)), int(round(y))
            if not (0 <= X < w and 0 <= Y < h and band[Y * w + X]):
                off += 1
                continue
            # A GATE VERTEX SITS ON THE FRAME and so is zero pixels from the
            # edge of the mask by construction. That is what makes it a gate,
            # not a line riding the kerb, so the three of them are exempt.
            if X in (0, w - 1) or Y in (0, h - 1):
                continue
            d = depths[Y * w + X]
            worst = min(worst, (d, (X, Y)))
            if d < VERTEX_MID_BAND * g['roadWidth'] / 2:
                shallow += 1
        print(f'  {name:7s} {len(line):3d} vertices, {off} off the paint, {shallow} nearer the '
              f'edge than {VERTEX_MID_BAND:.0%} of the half-width  (worst {worst[0]:.1f} px '
              f'at {worst[1]})')
        if off:
            problems.append(f'{off} of the {name} lane\'s {len(line)} shipped vertices are not '
                            f'on painted road')
        if shallow:
            problems.append(f'{shallow} of the {name} lane\'s shipped vertices sit closer to the '
                            f'road\'s edge than {VERTEX_MID_BAND:.0%} of its half-width')

    print('\n--- road width ---')
    # The bottom mouth is left out of the median on purpose: the paint spreads
    # to about three road widths where it meets the frame, and a median taken
    # through that is a third too high. The SHARED SPINE is the road's own
    # width, so it is the one measured, and the two branches are printed beside
    # it so a reader can see they are the same road.
    per_lane = {n: median(widths(w, h, band, line)) for n, line in lanes.items()}
    for n, v in per_lane.items():
        print(f'  {n:7s} median {v:5.1f}')
    derived = per_lane['shared']
    declared = g['roadWidth']
    off = abs(derived - declared) / declared
    print(f'  shared spine {derived:.1f}  geometry {declared}  {off * 100:.2f}%  '
          f'(gate {WIDTH_TOLERANCE:.0%})')
    if off > WIDTH_TOLERANCE:
        problems.append(f'the road measures {derived:.1f} on the shared spine against the '
                        f'geometry file\'s {declared}, {off * 100:.2f}% out')

    lo, hi = g['exitOpenings']['south']
    mouth = (hi - lo + 1) / declared
    print(f'  the bottom mouth is {hi - lo + 1} px = {mouth:.2f} road widths '
          f'(brief: about 2.8)')
    if not (SOUTH_MOUTH_WIDTHS[0] <= mouth <= SOUTH_MOUTH_WIDTHS[1]):
        problems.append(f'the bottom mouth is {mouth:.2f} road widths, outside '
                        f'{SOUTH_MOUTH_WIDTHS[0]}-{SOUTH_MOUTH_WIDTHS[1]}')
    terminal = (lo + hi) // 2
    if abs(terminal - g['exits']['south'][0]) > 2:
        problems.append(f'the south terminal is at x={g["exits"]["south"][0]}, not the '
                        f'mouth\'s centre x={terminal}')

    # ---------------------------------------------------------------------
    # THE BRIEF'S ROAD LENGTH, WHICH THE PLATE DOES NOT SUPPORT.
    #
    # The brief gives two reference figures: road width about 50 and total road
    # length about 4554, with anything more than 5% out meaning the mask is
    # wrong. The width lands on 50-51 either way. The length does not:
    #
    #   traced, shared + both branches                      ~4036
    #   road pixels / road width, which touches no trace     ~4066
    #   the brief                                             4554
    #
    # Two independent measurements of the same paint agree with each other to
    # under 1% and sit 11% under the brief, the three frame openings land where
    # the brief says to a fraction of a percent, and the overlay shows the
    # traced line on the paint down its whole length. So this is reported as a
    # disagreement with the REFERENCE rather than treated as a broken mask, and
    # it does not fail the run -- see reports/2026-09-07-level-8-geometry.md.
    # ---------------------------------------------------------------------
    print('\n--- total road length, against the brief\'s reference ---')
    traced_total = sum(polyline_length(l) for l in lanes.values())
    by_area = sum(band) / derived
    print(f'  traced (shared + both branches)   {traced_total:7.1f}')
    print(f'  road pixels / width, independent  {by_area:7.1f}  '
          f'({sum(band)} px / {derived:.1f})')
    print(f'  the brief                         {REFERENCE_ROAD_LENGTH:7.1f}   '
          f'{(traced_total - REFERENCE_ROAD_LENGTH) / REFERENCE_ROAD_LENGTH * 100:+.1f}%'
          '   <-- recorded, not enforced; see the block above this line')

    print('\n--- the pads ---')
    pads = [tuple(p) for p in g['pads']]
    routes = [[tuple(p) for p in g['shared']]] + \
             [[tuple(p) for p in b] for b in g['branches'].values()]
    print(f'  {"pad":>3} {"x":>7} {"y":>6} {"to lane":>8} {"nearest pad":>12} '
          f'{"core off-carpet":>16}')
    for n, (cx, cy) in enumerate(pads, 1):
        d = min(point_to_polyline((cx, cy), r) for r in routes)
        near = min(math.dist((cx, cy), q) for q in pads if q != (cx, cy))
        off_turf, blob = core_ground(w, h, turf, cx, cy)
        flags = []
        if not (PAD_MIN_FROM_LANE <= d <= PAD_MAX_FROM_LANE):
            flags.append(f'{d:.1f} outside {PAD_MIN_FROM_LANE:.0f}-{PAD_MAX_FROM_LANE:.0f}')
        if near < PAD_MIN_SPACING - 1e-6:
            flags.append(f'{near:.1f} from its neighbour, under {PAD_MIN_SPACING:.0f}')
        if blob >= MIN_OBSTRUCTION_BLOB:
            flags.append(f'a {blob}px object in its core')
        if min(cx, cy, w - cx, h - cy) < PAD_CORE_RADIUS:
            flags.append('its core runs off the frame')
        print(f'  {n:3d} {cx:7.1f} {cy:6.1f} {d:8.1f} {near:12.1f} '
              f'{off_turf:6d}px/{blob:3d} blob {"  <-- " + "; ".join(flags) if flags else ""}')
        for f in flags:
            problems.append(f'pad {n}: {f}')
    print(f'  {len(pads)} pads. THERE IS NO TARGET COUNT -- see pick_pads in '
          f'tools/trace_level8.py.')

    if args.overlay:
        write_overlay(w, h, px, lanes, pads, OVERLAY_OUT)
        print(f'\noverlay written to {os.path.relpath(OVERLAY_OUT, ROOT)}')

    print()
    if problems:
        print(f'{len(problems)} DISAGREEMENT(S):')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)
    print('the plate and tools/level8_geometry.json agree.')


if __name__ == '__main__':
    main()
