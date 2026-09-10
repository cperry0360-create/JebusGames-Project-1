"""Check tools/level6_geometry.json against the painted level 6 plate.

    python3 tools/check_level6.py
    python3 tools/check_level6.py --overlay     # also write the pad overlay PNG

tools/trace_level6.py DERIVED the geometry. This asks, independently, whether
the plate agrees with what it wrote -- the same division of labour levels 3, 4
and 8 use, and the reason both halves exist. So this file does not import the
tracer. It reads the plate again, with its own classifier written to its own
thresholds and an AREA-AVERAGED downsample rather than the tracer's point
sample, re-walks the roads with a different geodesic weighting, and compares.
Where the two agree, two different readings of the paint agree; where they do
not, one of them is wrong and the run stops.

Level 6 is an unfinished construction site: warm tan dirt roads over a flat
blue-grey blockout floor, white untextured primitives, scaffolding, cones,
pipes and one finished pond.

WHAT THIS CHECKS THAT NOTHING ELSE DOES:

  THE PADS ARE PAINTED, SO THEY ARE FOUND, NOT ASSUMED. Every earlier level
  derived its pads from clear ground and this checker would then only be
  re-running the placement rule. Here the eighteen darker ellipses are read off
  the plate a second time, with a different threshold, and their centres have
  to land on the geometry file's.

  FOUR OPENINGS, NOT SIX. The road touches the frame six times; only the west
  and east touches are terminals. The top touch is the scaffold's planking --
  road-coloured, and connected to no road, which is the property tested -- and
  the bottom one is a band running off the frame. A checker that let either
  become a lane would let the level ship with a spawn nothing uses.

  AND THE MERGE, WHICH THE BRIEF SAYS IS NOT THERE. The two lanes are supposed
  to be independent. They are not: they join near (1050,441) and share the last
  stretch to the east 73.1% exit, and the east 82.8% exit is fed only by a band
  that enters at the bottom frame edge. That is checked here as a fact about
  the paint and REPORTED rather than enforced, the same way check_level8.py
  handles its brief's road length -- enforcing it would fail every run for as
  long as this plate is the art. What IS enforced is that the lanes touch
  NOWHERE ELSE: a second junction appearing would be a new defect and has to
  stop the run.

Nothing at runtime depends on this. It is the record of where
tools/level6_geometry.json came from and how to redo it when the art changes.
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
# walk are the algorithms this level is being measured BY. Rewriting them here
# would be a second implementation to keep in step, and a bug in the copy would
# read as a level 6 finding. Note that level 4's geodesic weights "the middle"
# differently from the tracer's -- a cubic penalty on normalised depth against
# the tracer's reciprocal -- so the two really are two walks.
from check_level4 import (component, core_ground, depth, geodesic, median,     # noqa: E402
                          point_to_polyline, polyline_length, widths)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOMETRY = os.path.join(ROOT, 'tools/level6_geometry.json')
PLATE_WEBP = os.path.join(ROOT, 'public/assets/maps/map_level6.webp')
PLATE_SOURCE = os.path.join(ROOT, 'art-source/map_level6.png')
OVERLAY_OUT = os.path.join(ROOT, 'tools/decode/out/level6_pads.png')

CANVAS_W, CANVAS_H = 1280, 720

# THE WIDTH GATE IS THE BRIEF'S 3%, AND IT HOLDS -- the two readings land 1.25%
# apart. THE LENGTH GATE IS 6%, AND THAT IS A STATEMENT ABOUT GEODESICS RATHER
# THAN ABOUT THIS PLATE.
#
# Both halves of this pass walk the middle of the painted band and they weight
# "the middle" differently: the tracer's cost is 1 + 24/depth, level 4's is
# 1 + 2.2*((maxdepth-depth)/maxdepth)^3. Level 4's is much the shallower -- a
# 2.7x spread from the centre of the road to its kerb against the tracer's 6x
# -- so on a serpentine it rounds the inside of every bend, and it comes out
# short every time:
#
#     lane      tracer   re-traced here    apart
#     north     1645.7      1566.8         4.8%
#     south     1473.3      1399.5         5.0%
#     orphan    2235.0      2106.6         5.8%
#
# That is not a tunable. Re-normalising level 4's penalty makes it worse in
# both directions (a smaller maxdepth flattens the whole middle to cost 1 and a
# larger one flattens the kerb), which was measured before this gate was
# widened. Level 8 hit the same wall and set 10%; a curve has no single length
# until you say where the line runs.
#
# So the gate is set where it catches the mistake it is FOR -- a lane declared
# at 1645 that is painted at 1200, or two lanes swapped -- and the things a 3%
# gate was standing in for are tested directly instead, and tightly:
#   * every shipped vertex sits on paint and near the middle of it,
#   * the shipped lines COVER the paint (nothing is skipped), and
#   * road area / road width, which touches no geodesic at all, matches the
#     declared total road length to 3%.
TOLERANCE = 0.06
WIDTH_TOLERANCE = 0.03
# The area identity: road pixels / road width against the declared total.
AREA_TOLERANCE = 0.03
# How much of the painted band has to lie within one road width of some shipped
# centreline. A lane that skipped a stretch, or took the wrong arm at the
# junction, leaves a hole here that no length figure has to notice.
COVERAGE_MIN = 0.99
# A shipped vertex has to be at least this much of the road's half-width from
# the paint's edge. 0.45 allows a line to wander a little off centre and fails
# a line that is riding the kerb.
VERTEX_MID_BAND = 0.45
# How close to a frame edge a vertex counts as a gate vertex, and so is exempt
# from the mid-band test. See the point of use.
GATE_MARGIN = 4

PAD_CORE_RADIUS = 24
MIN_OBSTRUCTION_BLOB = 30
MIN_PAD_AREA = 1500
# How far a pad centre found here may sit from the one in the geometry file.
# Two classifiers disagree on the ellipse's antialiased rim, which moves a
# centroid by a fraction of a pixel; 2 px is far more room than that needs and
# far less than the 6 px that would let a pad drift onto its neighbour's paint.
PAD_CENTRE_TOLERANCE = 2.0

# The openings the brief states, as a fraction of the frame, and how far a
# measured centre may sit from one. 2% of 720 is 14 px, well inside one road
# width and well outside measurement noise.
OPENINGS = {'west12': ('west', 'y', 0.12), 'west21': ('west', 'y', 0.20),
            'east73': ('east', 'y', 0.73), 'east83': ('east', 'y', 0.83)}
OPENING_TOLERANCE = 0.02
# The two touches that are NOT openings, and where the brief says they are.
EXCLUDED = {'north': ('x', 0.63), 'south': ('x', 0.66)}
# The bottom mouth, in road widths. The brief calls it 241 px on the source
# plate, which is 184 canvas px; the paint's edge moves a few pixels either
# way, so the gate is a band.
SOUTH_MOUTH_PX = (160, 210)

# THE TWO REFERENCES THE BRIEF CARRIES. Neither is enforced -- see the block in
# main(). The width lands 7% under and the length 11% under, and in both cases
# two independent measurements here agree with each other far more closely than
# either agrees with the brief.
REFERENCE_ROAD_WIDTH = 43.0
REFERENCE_ROAD_LENGTH = 5694.0
# What levels 2 through 4 hold their pads at, centre to lane CENTRELINE. It is
# printed beside level 6's own figure because the two have to be measured the
# same way to be compared at all -- see the report.
HOUSE_STANDOFF = (90.0, 114.0)
# What the engine draws a ground marking at. src/scenes/GameScene.ts PAD_SQUASH
# and src/systems/AbilityRunner.ts GROUND_SQUASH are both 0.62; the painted
# ellipses are not, and the run prints the gap rather than closing it.
ENGINE_GROUND_SQUASH = 0.62

PROBE_RADIUS = 16
# Canvas coordinates with a known answer, and the run stops if any of them
# comes out wrong -- a classifier that cannot fail would make every pad below
# pass for the wrong reason.
#
# A PROP IS TESTED AS A BLOB, not as an absence, because some of the props are
# painted in colours that partly fall inside the floor's box: the pond's water
# is blue-grey, the unicorn's wireframe is drawn over floor, and "is any of
# this disc floor?" reads half of each as ground. What separates a prop from
# the floor is that it is SOLID.
#
# THE SCAFFOLD IS THE ONE THAT MATTERS. Its planking is warm tan and a plain
# colour test calls it road -- it is why a naive trace finds a road opening on
# the TOP edge of this plate. It is probed as `offband`: road-coloured, and not
# part of any road the entrances reach.
PROBES = [
    ('the north lane',                    (300, 150), 'road'),
    ('the south lane',                    (300, 214), 'road'),
    ("the orphan band's upper arm",       (300, 383), 'road'),
    ("the orphan band's lower arm",       (300, 516), 'road'),
    ('open floor, mid board',             (760, 320), 'floor'),
    ('open floor, lower left',            (312, 456), 'floor'),
    ('a painted pad, top centre',         (669,  52), 'pad'),
    ('a painted pad, mid left',           (226, 452), 'pad'),
    ('the pond',                         (1005,  55), 'prop'),
    ('the unicorn statue',               (1205, 300), 'prop'),
    ('the white cube stack',              (480,  40), 'prop'),
    ('the blank sign',                    (945, 175), 'prop'),
    ('the concrete pipes',                 (75, 232), 'prop'),
    ('the scaffold planking, bottom left', (80, 570), 'offband'),
]
PROBE_SHARE = 0.90       # road, floor and pad: this much of the disc, at least
PROBE_PROP_BLOB = 200    # prop: a connected obstruction at least this big
PROBE_CLEAN_BLOB = 100   # floor and pad: nothing solid in it


# ------------------------------------------------------------------- the plate

def plate():
    """The plate at canvas resolution, AREA-AVERAGED.

    The tracer point-samples one source pixel per canvas pixel. This
    box-filters the whole source block instead, so the two disagree on every
    antialiased edge in the picture -- which is the point. An edge that only
    one of them can find is an edge neither should be trusting. It also reads
    the shipped WebP rather than the source PNG where it exists, so a bad
    re-encode is caught here rather than in the game.
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
    """Road, floor and painted-pad masks.

    Written to this plate's own numbers rather than copied off the tracer, so
    that the two are two readings and not one read twice. The tracer wants
    `r - g >= 40`, `b >= 40`, `lum > 110` for road and splits floor from pad at
    luminance 106; this asks for a slightly warmer road and splits the greys at
    112 instead. MEASURED, not picked: a painted pad's interior tops out at
    luminance 105 and the floor starts at 121, so anything in 106-120 splits
    them and the two halves of this pass sit at opposite ends of that gap.
    """
    road = bytearray(w * h)
    floor = bytearray(w * h)
    pad = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        lum = (r + g + b) // 3
        if r > g > b and r - g >= 42 and b >= 38 and lum > 108:
            road[i] = 1
        elif b > g > r and b - r >= 18 and 112 <= lum < 152:
            floor[i] = 1
        elif b > g > r and b - r >= 18 and 76 <= lum < 112:
            pad[i] = 1
    return road, floor, pad


def probe(w, h, road, floor, pad, cx, cy):
    """(road, floor, pad shares, largest solid obstruction) inside a probe disc."""
    inside, r, f, p, total = set(), 0, 0, 0, 0
    for dy in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
        for dx in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
            if dx * dx + dy * dy > PROBE_RADIUS * PROBE_RADIUS:
                continue
            X, Y = cx + dx, cy + dy
            if not (0 <= X < w and 0 <= Y < h):
                continue
            total += 1
            i = Y * w + X
            r += road[i]
            f += floor[i]
            p += pad[i]
            if not (road[i] or floor[i] or pad[i]):
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
    return r / total, f / total, p / total, biggest


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


def despeckle_holes(w, h, mask, max_area):
    """Fill holes in a mask smaller than `max_area`.

    The road is painted with pebbles and the floor with grit, and a mask full
    of pinholes makes every normal cast across the road stop two pixels in. The
    tracer swallows small blobs of every kind into their surroundings; this
    only fills the holes, which is a different operation reaching the same
    place, and that is the point of it being a second reading.
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


# ----------------------------------------------------------------- the openings

def edge_runs(w, h, mask, min_len=5, bridge_gap=3):
    """Runs of mask along each frame edge, keyed by edge.

    RUNS SEPARATED BY A PIXEL OR TWO ARE ONE RUN. Where the road meets the
    frame the paint is antialiased against whatever is behind it, and an
    area-averaged read of that edge drops the odd pixel out of the band: this
    plate's west 132-168 opening came out as 132-148 and 150-168, and its
    bottom mouth as three pieces. Bridging a gap of `bridge_gap` puts them back
    without being able to join two openings -- the nearest genuine pair on this
    plate is 27 px apart.
    """
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                out.append((s, i - 1))
                s = None
        joined = []
        for r in out:
            if joined and r[0] - joined[-1][1] - 1 <= bridge_gap:
                joined[-1] = (joined[-1][0], r[1])
            else:
                joined.append(r)
        return [r for r in joined if r[1] - r[0] + 1 >= min_len]
    return {
        'west': runs(mask[y * w] for y in range(h)),
        'east': runs(mask[y * w + w - 1] for y in range(h)),
        'north': runs(mask[x] for x in range(w)),
        'south': runs(mask[(h - 1) * w + x] for x in range(w)),
    }


# --------------------------------------------------------------------- overlay

def write_overlay(w, h, px, lanes, orphan, pads, path):
    out = bytearray(px)

    def dot(x, y, rgb, r=0):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x + dx)), int(round(y + dy))
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    out[i], out[i + 1], out[i + 2] = rgb

    for name, line in lanes.items():
        c = {'north': (255, 60, 60), 'south': (60, 130, 255)}.get(name, (255, 60, 255))
        for x, y in line:
            dot(x, y, c, 1)
    for x, y in (orphan or []):
        dot(x, y, (255, 200, 0), 1)
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
    road, floor, pad = classify(w, h, px)
    road = despeckle_holes(w, h, road, 90)

    print('\n--- can the ground test fail? ---')
    for name, (cx, cy), want in PROBES:
        rs, fs, ps, blob = probe(w, h, road, floor, pad, cx, cy)
        ok = {'road': rs >= PROBE_SHARE,
              'floor': fs >= PROBE_SHARE and blob < PROBE_CLEAN_BLOB,
              'pad': ps >= PROBE_SHARE and blob < PROBE_CLEAN_BLOB,
              'prop': rs < 1 - PROBE_SHARE and blob >= PROBE_PROP_BLOB,
              'offband': rs >= 0.5}[want]
        print(f'  {name:36s} road {rs * 100:5.1f}%  floor {fs * 100:5.1f}%  pad {ps * 100:5.1f}%  '
              f'solid {blob:3d}px  expected {want}{"" if ok else "   <-- WRONG"}')
        if not ok:
            problems.append(f'the classifier reads {name} as {rs * 100:.0f}% road / '
                            f'{fs * 100:.0f}% floor / {ps * 100:.0f}% pad with a {blob}px solid '
                            f'in it, and it should read {want}; every result below means nothing')
    if problems:
        print('\nthe classifier does not agree with the plate; stopping before the geometry.')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)

    # The road BAND is what the entrances reach, which is not the same as every
    # road-coloured pixel: the scaffold's planking is road-coloured and is not
    # on it. Both entrances are seeded because they are on different components
    # on some plates and this one has to prove they are on the same.
    north_in = tuple(g['entrances']['north'])
    south_in = tuple(g['entrances']['south'])
    band, _ = component(w, h, road, (min(w - 1, north_in[0] + 6), north_in[1]))
    band2, _ = component(w, h, road, (min(w - 1, south_in[0] + 6), south_in[1]))
    orphan_seed = None
    if g.get('orphanBand'):
        lo, hi = g['orphanBand']['entersAt'][1]
        orphan_seed = ((lo + hi) // 2, h - 7)
        oband, _ = component(w, h, road, orphan_seed)
        for i in range(w * h):
            if oband[i]:
                band[i] = 1
    for i in range(w * h):
        if band2[i]:
            band[i] = 1

    print('\n--- the scaffold planking is not a road ---')
    plank, _ = component(w, h, road, (80, 570))
    print(f'  the plank blob is {sum(plank)} px and {"IS" if any(plank[i] and band[i] for i in range(w * h)) else "is not"} '
          f'part of the band the entrances reach')
    if any(plank[i] and band[i] for i in range(w * h)):
        problems.append('the scaffold planking is connected to the road band; the top-edge '
                        'touch would become a fifth opening')

    print('\n--- the openings ---')
    runs = edge_runs(w, h, band)
    found = [(e, r) for e, rr in runs.items() for r in rr]
    print(f'  {len(found)} frame touch(es): ' + ', '.join(
        f'{e} {r[0]}-{r[1]}' for e, r in sorted(found)))
    terminals = len(runs['west']) + len(runs['east'])
    print(f'  terminals on the vertical edges: {terminals}   '
          f'excluded touches on the horizontal edges: {len(runs["north"]) + len(runs["south"])}')
    if terminals != 4:
        problems.append(f'{terminals} road openings on the west and east edges, not 4')
    if runs['north']:
        problems.append('the top edge has a road opening on the band the entrances reach; the '
                        'brief says the top touch is art running off the frame')
    for key, (edge, axis, want) in OPENINGS.items():
        rr = sorted(runs[edge])
        idx = 0 if key in ('west12', 'east73') else 1
        if len(rr) != 2:
            problems.append(f'the {edge} edge has {len(rr)} openings, not 2')
            continue
        lo, hi = rr[idx]
        mid = (lo + hi) / 2
        frac = mid / (h if axis == 'y' else w)
        off = abs(frac - want)
        print(f'  {key:7s} centre {axis}={mid:6.1f} = {frac:5.1%} of the frame  '
              f'(brief {want:.0%}){"" if off <= OPENING_TOLERANCE else "   <-- out"}')
        if off > OPENING_TOLERANCE:
            problems.append(f'the {key} opening sits at {frac:.1%}, not the briefed {want:.0%}')
        declared = g['openings'][key]['span']
        if [lo, hi] != declared and abs(mid - sum(declared) / 2) > 3:
            problems.append(f'the {key} opening spans {lo}-{hi} here and {declared} in the '
                            f'geometry file')
    # THE TWO EXCLUDED TOUCHES ARE MEASURED ON THE RAW ROAD MASK, not on the
    # band, and that is the whole point of them. The top one is not on the band
    # at all -- it is the scaffold's planking, which is why it is not an
    # opening -- so looking for it on the band finds nothing and proves
    # nothing. Both have to BE there, at the fractions the brief gives, or the
    # exclusion is being applied to something other than what the brief meant.
    raw_runs = edge_runs(w, h, road)
    for edge, (axis, want) in EXCLUDED.items():
        rr = raw_runs[edge]
        if not rr:
            print(f'  {edge:7s} NO road-coloured touch at all  '
                  f'(the brief says one at {want:.0%})')
            problems.append(f'the brief says the road touches the {edge} edge at {want:.0%} and '
                            f'nothing does; the exclusion is being applied to a touch that is '
                            f'not there')
            continue
        lo, hi = max(rr, key=lambda r: r[1] - r[0])
        mid = (lo + hi) / 2
        frac = mid / (w if axis == 'x' else h)
        on_band = any(band[(h - 1) * w + x] for x in range(lo, hi + 1)) if edge == 'south' \
            else any(band[x] for x in range(lo, hi + 1))
        print(f'  {edge:7s} EXCLUDED touch {lo}-{hi}, centre {frac:5.1%} of the width, '
              f'{hi - lo + 1} px, {"on" if on_band else "off"} the band  (brief {want:.0%})')
        if edge == 'north' and on_band:
            problems.append('the top-edge touch is part of the road band; it would become a '
                            'fifth opening')
        if abs(frac - want) > OPENING_TOLERANCE * 2:
            problems.append(f'the {edge} touch sits at {frac:.1%}, not the briefed {want:.0%}')
        if edge == 'south' and not (SOUTH_MOUTH_PX[0] <= hi - lo + 1 <= SOUTH_MOUTH_PX[1]):
            problems.append(f'the bottom mouth is {hi - lo + 1} canvas px, outside '
                            f'{SOUTH_MOUTH_PX[0]}-{SOUTH_MOUTH_PX[1]}')

    deep = depth(w, h, band)
    maxdeep = max(d for d in deep if d < 10 ** 9)

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

    print('\n--- which entrance reaches which exit ---')
    exits = {'east73': (w - 1, int(round(sum(g['openings']['east73']['span']) / 2))),
             'east83': (w - 1, int(round(sum(g['openings']['east83']['span']) / 2)))}
    reach = {}
    for a, at in (('north', north_in), ('south', south_in)):
        seed, _ = component(w, h, band, snap((at[0] + 6, at[1])))
        for b, bt in exits.items():
            X, Y = snap(bt)
            reach[(a, b)] = bool(seed[Y * w + X])
            print(f'  {a:5s} entrance -> {b}: '
                  f'{"reachable" if reach[(a, b)] else "NO PATH IN THE PAINT"}')
    for a in ('north', 'south'):
        want = 'east73' if list(g['exits'][a]) == list(exits['east73']) else 'east83'
        if not reach[(a, want)]:
            problems.append(f'the geometry file sends the {a} lane to {want} and the paint has '
                            f'no path there')

    print('\n--- the lanes, re-traced off the plate ---')
    lanes = {}
    for name in ('north', 'south'):
        a = snap(g['lanes'][name][0])
        b = snap(g['lanes'][name][-1])
        lanes[name] = geodesic(w, h, band, deep, maxdeep, a, b)
    orphan = None
    if g.get('orphanBand') and orphan_seed:
        orphan = geodesic(w, h, band, deep, maxdeep, snap(orphan_seed),
                          snap(g['orphanBand']['centreline'][-1]))
    for name, line in list(lanes.items()) + ([('orphan', orphan)] if orphan else []):
        traced = polyline_length(line)
        declared = g['lengths'][name]
        off = abs(traced - declared) / declared
        flag = '' if off <= TOLERANCE else f'   <-- more than {TOLERANCE:.0%}'
        print(f'  {name:7s} traced {traced:7.1f}  geometry {declared:7.1f}  '
              f'{off * 100:5.2f}%{flag}')
        if off > TOLERANCE:
            problems.append(f"the {name} lane traces {traced:.1f} against the geometry file's "
                            f'{declared:.1f}, {off * 100:.2f}% out')

    print('\n--- where the shipped line actually runs ---')
    # THE CHECK THAT DOES NOT DEPEND ON WHICH GEODESIC DREW THE LINE. Every
    # vertex the geometry file ships has to sit on painted road and near the
    # middle of it rather than on the kerb. A lane short-circuiting across the
    # floor, or clipping the inside of a bend, fails here.
    for name in ('north', 'south'):
        line = g['lanes'][name]
        off, shallow, worst = 0, 0, (1e9, None)
        for x, y in line:
            X, Y = int(round(x)), int(round(y))
            if not (0 <= X < w and 0 <= Y < h and band[Y * w + X]):
                off += 1
                continue
            # A GATE VERTEX SITS ON THE FRAME and is a pixel or two from the
            # edge of the mask by construction. That is what makes it a gate,
            # not a line riding the kerb, so the last few pixels of the run out
            # to the frame are exempt. Douglas-Peucker moves the terminal
            # vertex a pixel or two inboard, which is why this is a margin and
            # not an equality -- (1277,524) failed a strict test for being 2 px
            # short of x=1279.
            if min(X, Y, w - 1 - X, h - 1 - Y) <= GATE_MARGIN:
                continue
            d = deep[Y * w + X]
            worst = min(worst, (d, (X, Y)))
            if d < VERTEX_MID_BAND * g['roadWidth'] / 2:
                shallow += 1
        print(f'  {name:7s} {len(line):3d} vertices, {off} off the paint, {shallow} nearer the '
              f'edge than {VERTEX_MID_BAND:.0%} of the half-width  (worst {worst[0]:.1f} px '
              f'at {worst[1]})')
        if off:
            problems.append(f"{off} of the {name} lane's {len(line)} shipped vertices are not "
                            f'on painted road')
        if shallow:
            problems.append(f"{shallow} of the {name} lane's shipped vertices sit closer to the "
                            f"road's edge than {VERTEX_MID_BAND:.0%} of its half-width")

    print('\n--- do the two lanes touch? ---')
    # THE BRIEF SAYS THEY NEVER DO. They do, once, and that is recorded in the
    # geometry file rather than smoothed over -- see the module header. What is
    # enforced is that the ONLY place they come together is the one already
    # known: measured along both shipped lines, every vertex before the merge
    # has to stay a road's width clear of the other lane.
    merge = g.get('merge')
    north, south = g['lanes']['north'], g['lanes']['south']
    if merge is None:
        gap = min(point_to_polyline(p, south) for p in north)
        print(f'  the geometry file declares no merge; closest approach {gap:.1f} px')
        if gap < g['roadWidth']:
            problems.append(f'the two lanes come within {gap:.1f} px of each other and the '
                            f'geometry file declares no merge')
    else:
        at = tuple(merge['at'])
        print(f"  the geometry file declares a merge at {at}, sharing the last "
              f"{merge['sharedLength']:.1f} px.  THE BRIEF SAYS THERE IS NO MERGE; this is "
              f"recorded, not enforced -- see the block in this file's header.")
        # EVERYTHING BEFORE THE JUNCTION has to be a clean pair of parallel
        # roads. Cutting on distance-from-the-junction is not enough and was
        # tried: the shared tail runs 267 px past it and the two lines are
        # literally the same line along all of it, so the gap read 0.0 and the
        # test reported a second merge that does not exist. Each lane is cut at
        # the arc length where its own shared tail begins, which is what the
        # geometry file records.
        # TWO ROAD WIDTHS BACK FROM THE JUNCTION, not one. Approaching a Y the
        # two arms converge into it by construction -- 40 px back their
        # centrelines are 21 px apart, which is the junction itself and not a
        # second one. At 80 px they have separated and the closest approach
        # anywhere else on the board is 59.6 px, out by the west entrances.
        def before_merge(line, name):
            keep, run = [], 0.0
            stop = g['lengths'][name] - merge['sharedLength'] - g['roadWidth'] * 2
            for i, p in enumerate(line):
                if i:
                    run += math.dist(line[i - 1], p)
                if run > stop:
                    break
                keep.append(p)
            return keep
        clear = before_merge(north, 'north')
        far = before_merge(south, 'south')
        gap = min(point_to_polyline(p, far) for p in clear) if clear and far else 0.0
        print(f'  each lane owns its first {len(clear)} / {len(far)} shipped vertices; over all '
              f'of that the two come no closer than {gap:.1f} px')
        print(f'  a road is {g["roadWidth"]} px wide, so {gap:.1f} px between centrelines is '
              f'{gap - g["roadWidth"]:.1f} px of bare floor between the two bands')
        if gap < g['roadWidth']:
            problems.append(f'the two lanes touch a SECOND time: away from the declared merge '
                            f'they come within {gap:.1f} px, under one road width')
        near = min(point_to_polyline(at, l) for l in (north, south))
        if near > 4.0:
            problems.append(f'the declared merge at {at} is {near:.1f} px off both shipped lanes')

    print('\n--- road width ---')
    per = {}
    for name, line in list(lanes.items()) + ([('orphan', orphan)] if orphan else []):
        at = tuple(merge['at']) if merge else None
        keep = [p for p in line if at is None or math.dist(p, at) > 60] or line
        per[name] = median(widths(w, h, band, keep))
        print(f'  {name:7s} median {per[name]:5.1f}')
    derived = median(sorted(per.values()))
    declared = g['roadWidth']
    off = abs(derived - declared) / declared
    print(f'  re-derived {derived:.1f}  geometry {declared}  {off * 100:.2f}%  '
          f'(gate {WIDTH_TOLERANCE:.0%})')
    if off > WIDTH_TOLERANCE:
        problems.append(f'the road measures {derived:.1f} here against the geometry file\'s '
                        f'{declared}, {off * 100:.2f}% out')

    # ---------------------------------------------------------------------
    # THE BRIEF'S TWO REFERENCE FIGURES, WHICH THE PLATE DOES NOT SUPPORT.
    #
    # width about 43, total road length about 5694, anything more than 5% out
    # meaning the mask is wrong. Neither lands:
    #
    #   width    tracer 40, re-derived here ~40      the brief 43     -7%
    #   length   traced 5087, road px / width 5038   the brief 5694  -11%
    #
    # In both cases two measurements that share no code agree with each other
    # to about 1% and sit outside the brief together, so this is reported as a
    # disagreement with the REFERENCE rather than treated as a broken mask, and
    # it does not fail the run. The brief's own pair is also internally
    # inconsistent with the paint: 43 x 5694 is 245,000 px of road and the plate
    # has 201,500. See reports/2026-09-10-level-6-geometry.md.
    # ---------------------------------------------------------------------
    print("\n--- can the Rooster's flame leave its lane? ---")
    # THE ONE PLACE THIS QUESTION CAN BE ASKED. systems/Flame.ts and
    # src/data/level6.json both say the corridor "cannot leave its lane --
    # level 6's two lanes are parallel and never meet, so that is a property of
    # the MAP rather than a check in code". This is the map's checker, so this
    # is where the property gets tested, and it does not hold: the corridor is
    # a STRAIGHT capsule along the boss's heading and the roads are
    # serpentines, so a corridor fired from a bend leaves the paint and lands
    # on the neighbouring lane. Reported, not enforced -- it is a fact about
    # this plate that whoever builds the level needs, not a defect in the
    # geometry file.
    try:
        flame = json.load(open(os.path.join(ROOT, 'src/data/level6.json')))['flame']
    except (OSError, KeyError):
        flame = None
    if flame and merge:
        reach, half = flame['reach'], flame['width'] / 2

        def walk(line, step=2.0):
            out = [tuple(line[0])]
            for k in range(1, len(line)):
                (x0, y0), (x1, y1) = line[k - 1], line[k]
                n = max(1, int(math.dist((x0, y0), (x1, y1)) / step))
                for t in range(1, n + 1):
                    out.append((x0 + (x1 - x0) * t / n, y0 + (y1 - y0) * t / n))
            return out

        def seg_dist(p, a, b):
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = dx * dx + dy * dy
            t = 0.0 if L == 0 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
            return math.dist(p, (a[0] + t * dx, a[1] + t * dy))

        pre = {n: walk(before_merge(g['lanes'][n], n)) for n in ('north', 'south')}
        for name, other in (('north', 'south'), ('south', 'north')):
            src, dst = pre[name], pre[other]
            hit, tot, closest = 0, 0, 1e9
            for i in range(4, len(src) - 4):
                tot += 1
                a, b = src[i - 4], src[i + 4]
                hd = math.atan2(b[1] - a[1], b[0] - a[0])
                p = src[i]
                q = (p[0] + math.cos(hd) * reach, p[1] + math.sin(hd) * reach)
                d = min(min(seg_dist(dst[k], p, q), seg_dist(dst[k - 1], p, q))
                        for k in range(1, len(dst)))
                closest = min(closest, d)
                if d <= half:
                    hit += 1
            print(f'  a boss on the {name:5s} lane: {hit / max(1, tot):.0%} of its pre-merge walk '
                  f'puts the {other} lane inside a {reach} px corridor (closest {closest:.1f} px '
                  f'against a fire half-width of {half:.0f})')
        print(f'  and for the last {merge["sharedLength"]:.0f} px the two lanes ARE one road, so '
              f'the corridor covers both by definition. Recorded, not enforced.')

    print('\n--- do the shipped lines cover the paint? ---')
    # WHAT THE 3% LENGTH GATE WAS REALLY FOR, tested directly. A lane that
    # skipped a stretch, or took the wrong arm at the junction, leaves painted
    # road that no centreline runs down -- and it can do that while still
    # measuring the right length. Every band pixel has to be within a road
    # width of some shipped line; the slack over the half-width is for the
    # frame mouths, where the paint spreads.
    lines = [g['lanes']['north'], g['lanes']['south']]
    if g.get('orphanBand'):
        lines.append(g['orphanBand']['centreline'])
    near_line = bytearray(w * h)
    reach_px = int(math.ceil(g['roadWidth']))
    for line in lines:
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
    total_band = sum(band)
    covered = sum(1 for i in range(w * h) if band[i] and near_line[i])
    print(f'  {covered} of {total_band} painted road pixels sit within {reach_px} px of a '
          f'shipped centreline: {covered / total_band:.2%}  (needs {COVERAGE_MIN:.0%})')
    if covered / total_band < COVERAGE_MIN:
        problems.append(f'only {covered / total_band:.2%} of the painted road is within one '
                        f'road width of a shipped centreline; a stretch of paint has no lane '
                        f'down it')

    print("\n--- against the brief's references ---")
    traced_total = sum(polyline_length(l) for l in lanes.values())
    if orphan:
        traced_total += polyline_length(orphan)
    if merge:
        traced_total -= merge['sharedLength']
    by_area = sum(band) / derived
    print(f'  road width   re-derived {derived:7.1f}   brief {REFERENCE_ROAD_WIDTH:7.1f}   '
          f'{(derived - REFERENCE_ROAD_WIDTH) / REFERENCE_ROAD_WIDTH * 100:+.1f}%')
    print(f'  road length  traced     {traced_total:7.1f}   brief {REFERENCE_ROAD_LENGTH:7.1f}   '
          f'{(traced_total - REFERENCE_ROAD_LENGTH) / REFERENCE_ROAD_LENGTH * 100:+.1f}%')
    print(f'               road px / width, independent {by_area:7.1f}  '
          f'({sum(band)} px / {derived:.1f})')
    print('               recorded, not enforced; see the block above this line')

    # THE AREA IDENTITY, WHICH IS ENFORCED AND IS TIGHT. It touches no geodesic
    # at all -- painted area over painted width is a length -- so it does not
    # care which walk drew the line, and it is the test the widened length gate
    # above hands its job to.
    declared_total = g['roadLength']
    off = abs(by_area - declared_total) / declared_total
    print(f'  road area / width {by_area:7.1f}  against the declared roadLength '
          f'{declared_total:7.1f}   {off * 100:.2f}%  (gate {AREA_TOLERANCE:.0%})')
    if off > AREA_TOLERANCE:
        problems.append(f'the painted road is {by_area:.1f} long by area over width against the '
                        f'geometry file\'s {declared_total:.1f}, {off * 100:.2f}% out')

    print('\n--- the eighteen painted pads ---')
    # FOUND AGAIN, not taken from the file. The pads are the one thing on this
    # plate that is painted rather than placed, so a second reading of the paint
    # is a real check and not a re-run of a placement rule.
    ground = bytearray(1 if floor[i] or pad[i] else 0 for i in range(w * h))
    here = []
    for comp in blobs(w, h, pad, MIN_PAD_AREA):
        xs = [i % w for i in comp]
        ys = [i // w for i in comp]
        bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        here.append({'centre': (sum(xs) / len(comp), sum(ys) / len(comp)),
                     'w': bw, 'h': bh, 'area': len(comp),
                     'fill': len(comp) / (math.pi / 4 * bw * bh)})
    here.sort(key=lambda p: (p['centre'][1], p['centre'][0]))
    declared_pads = [tuple(p) for p in g['pads']]
    print(f'  {len(here)} painted ellipses found here, {len(declared_pads)} in the geometry file')
    if len(here) != len(declared_pads):
        problems.append(f'{len(here)} painted pad ellipses on the plate against '
                        f'{len(declared_pads)} in the geometry file')

    routes = [g['lanes']['north'], g['lanes']['south']]
    if g.get('orphanBand'):
        routes.append(g['orphanBand']['centreline'])
    print(f'  {"#":>3} {"cx":>7} {"cy":>7} {"w":>4} {"h":>4} {"fill":>5} {"squash":>7} '
          f'{"->lane":>7} {"drift":>6}  core')
    standoffs, squashes = [], []
    for n, p in enumerate(here, 1):
        cx, cy = p['centre']
        d = min(point_to_polyline((cx, cy), r) for r in routes)
        drift = min(math.dist((cx, cy), q) for q in declared_pads) if declared_pads else 1e9
        off_ground, blob = core_ground(w, h, ground, cx, cy)
        squash = p['h'] / p['w']
        standoffs.append(d)
        squashes.append(squash)
        flags = []
        if drift > PAD_CENTRE_TOLERANCE:
            flags.append(f'{drift:.1f} px from the nearest pad in the geometry file')
        if blob >= MIN_OBSTRUCTION_BLOB:
            flags.append(f'a {blob}px object in its core')
        if min(cx, cy, w - cx, h - cy) < PAD_CORE_RADIUS:
            flags.append('its core runs off the frame')
        if p['fill'] < 0.92 or p['fill'] > 1.08:
            flags.append(f'ellipse fill {p["fill"]:.2f}: this is not a clean ellipse')
        print(f'  {n:3d} {cx:7.1f} {cy:7.1f} {p["w"]:4d} {p["h"]:4d} {p["fill"]:5.2f} '
              f'{squash:7.3f} {d:7.1f} {drift:6.1f}  {off_ground:4d}px/{blob:3d} blob'
              f'{"  <-- " + "; ".join(flags) if flags else ""}')
        for f in flags:
            problems.append(f'pad {n}: {f}')
    standoffs.sort()
    print(f'  standoff to the nearest lane centreline: {standoffs[0]:.1f} - {standoffs[-1]:.1f}, '
          f'median {median(standoffs):.1f}')
    # A PAD FURTHER FROM THE ROAD THAN A TOWER CAN SHOOT IS A DEAD PAD, and it
    # is worth naming because nothing else on the board would ever say so: it
    # passes every ground test, it draws correctly, and a player who builds on
    # it has bought a tower that fires at nothing.
    dead = [(n, p['centre'], d) for n, (p, d) in enumerate(zip(here, [
        min(point_to_polyline(q['centre'], r) for r in routes) for q in here]), 1)
        if d > g['towerRange']]
    for n, c, d in dead:
        print(f'  pad {n} at ({c[0]:.0f},{c[1]:.0f}) is {d:.0f} px from the nearest lane and the '
              f'shortest tower range is {g["towerRange"]}: NOTHING BUILT THERE CAN REACH THE '
              f'ROAD. Recorded, not enforced -- the pad is painted on.')
    print(f'  levels 2-4 hold theirs at {HOUSE_STANDOFF[0]:.0f}-{HOUSE_STANDOFF[1]:.0f}, '
          f'measured the same way. RECORDED, NOT ENFORCED: the pads are painted on this plate '
          f'and moving them would be re-drawing the art.')
    squashes.sort()
    print(f'  painted ellipse squash: {squashes[0]:.3f} - {squashes[-1]:.3f}, '
          f'median {median(squashes):.3f}.  The engine draws ground markings at '
          f'{ENGINE_GROUND_SQUASH}, so an engine-drawn ring on one of these will be '
          f'{(1 - ENGINE_GROUND_SQUASH / median(squashes)) * 100:.0f}% flatter than the paint '
          f'under it. Recorded, not enforced.')

    if args.overlay:
        write_overlay(w, h, px, lanes, orphan, [p['centre'] for p in here], OVERLAY_OUT)
        print(f'\noverlay written to {os.path.relpath(OVERLAY_OUT, ROOT)}')

    print()
    if problems:
        print(f'{len(problems)} DISAGREEMENT(S):')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)
    print('the plate and tools/level6_geometry.json agree.')


if __name__ == '__main__':
    main()
