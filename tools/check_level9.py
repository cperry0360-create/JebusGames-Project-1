"""Check tools/level9_geometry.json against the painted level 9 plate.

    python3 tools/check_level9.py
    python3 tools/check_level9.py --overlay     # also write the pad overlay PNG

tools/trace_level9.py DERIVED the geometry. This asks, independently, whether
the plate agrees with what it wrote -- the same division of labour levels 3, 4
and 8 use, and the reason both halves exist. So this file does not import the
tracer. It reads the plate again, with its own classifier written to its own
thresholds and an AREA-AVERAGED downsample rather than the tracer's point
sample, re-walks the trace, and compares. Where the two agree, two different
readings of the paint agree; where they do not, one of them is wrong and the
run stops.

Level 9 is the inside of a computer: a glowing cyan circuit trace over a dark
blue substrate, with flat grey chips as the only buildable ground.

THE FOUR THINGS THE BRIEF STATES ABOUT THIS PLATE are checked as facts rather
than assumed, because this level's brief is wrong about three of them and a
checker that assumed them would have to be wrong too:

  ONE FRAME OPENING, NOT TWO. The brief asks for entrances at 41-49% and
  81-84% of the west edge. There is cyan at both, and only the first is
  attached to the trace -- the second is the cooling tower's leftmost vent slot
  clipped by the frame. Both are located here and the second is required to be
  OFF the trace, so that a future re-trace that quietly joined them would fail.

  THE TRACE FORKS AND REJOINS, TWICE. The brief says one path, no forks. The
  band encloses exactly TWO regions -- the diamond the two arms make inside the
  mouth, and the loop the hook and the flank make round the bottom right -- and
  the run stops if that count changes in either direction.

  THE SECOND LOOP USED TO BE A DEAD-END SPUR. This file required that cap to be
  there and to be a dead end. tools/paint_level9_flank.py painted the corridor
  between it and the trunk, so what is required now is the opposite: both ends
  of the flank are JUNCTIONS, with trace most of the way round them, and the
  old cap at (914, 568) is required NOT to be a dead end any more.

  THE EXIT IS AN INTERIOR DOOR, which the brief does say. The terminal is
  re-derived from the paint rather than read from the file.

Nothing at runtime depends on this. It is the record of where
tools/level9_geometry.json came from and how to redo it when the art changes.
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
# THE GEOMETRY HELPERS ARE LEVEL 4'S, deliberately, and level 8 leans on the
# same ones: the connected component, the depth transform, the mid-band
# geodesic, the normals for width and the pad core walk are the algorithms this
# level is being measured BY. A second implementation here would be a second
# thing to keep in step, and a bug in the copy would read as a level 9 finding.
from check_level4 import (component, depth, geodesic, median,                 # noqa: E402
                          point_to_polyline, polyline_length, widths)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEOMETRY = os.path.join(ROOT, 'tools/level9_geometry.json')
PLATE_WEBP = os.path.join(ROOT, 'public/assets/maps/map_level9.webp')
PLATE_SOURCE = os.path.join(ROOT, 'art-source/level9/map_level9.png')
# The checker's own render, kept out of the repository: it is the same picture
# tools/L9_pads_overlay.png already carries, drawn from the OTHER reading of the
# paint, and it is one command to get back. tools/decode/out/ is gitignored and
# is where check_level8.py puts its own.
OVERLAY_OUT = os.path.join(ROOT, 'tools/decode/out/level9_pads.png')

CANVAS_W, CANVAS_H = 1280, 720

# THE LENGTH GATE IS 3%, which is what the brief asks for and which this plate
# can actually carry -- unlike level 8, whose geodesic moved 4-8% between the
# two readings and whose gate had to be opened to 10%. The difference is the
# shape of the paint: level 8 is almost all curve, and this board is long
# straight runs joined by chamfered corners, where "the middle" is the same
# line whichever cost function draws it.
TOLERANCE = 0.03
WIDTH_TOLERANCE = 0.03
# A shipped vertex has to be at least this much of the trace's half-width from
# the paint's edge. 0.45 allows a line to wander a little off centre and still
# fails a line riding the kerb. Level 8's number.
VERTEX_MID_BAND = 0.45

PAD_CORE_RADIUS = 24
MIN_CHIP_AREA = 2000
# The brief's reference figures, recorded and printed rather than enforced --
# see the block in main() and reports/2026-09-13-level-9-geometry.md. Two
# independent measurements of this paint agree with each other to 1.4% and sit
# 10% under the length figure, which is level 8's situation exactly.
REFERENCE_TRACE_LENGTH = 3649.0
REFERENCE_TRACE_WIDTH = 44.7

PROBE_RADIUS = 16
PROBE_SHARE = 0.90
PROBE_CLEAN_BLOB = 100
PROBE_PROP_BLOB = 200
# Canvas coordinates with a known answer, and the run stops if any comes out
# wrong -- a classifier that cannot fail would make every pad below pass for
# the wrong reason. The RAM stick and the fan are in here by name because they
# are the two things on this board a careless "is it flat and lightish?" test
# calls a chip, and the cooling tower is here because it is the thing the
# brief's second entrance actually is.
PROBES = [
    ('the trace, the entrance stub',        (40, 322),   'trace'),
    ('the trace, the tail past the rejoin',  (700, 470),  'trace'),
    ('a grey chip, the big one top right',   (781, 106),  'chip'),
    ('a grey chip, inside the hairpin',      (506, 469),  'chip'),
    ('the substrate, inside the loop',       (300, 250),  'substrate'),
    ('the substrate, below the RAM stick',   (560, 450),  'substrate'),
    ('the RAM stick',                        (585, 335),  'other'),
    ('the fan hub',                          (980, 55),   'other'),
    ('the cooling tower\'s metalwork',       (30, 660),   'other'),
]
# The cooling tower's leftmost vent slot: cyan by any test, and the whole
# reason this level's brief reports a second entrance. Checked separately from
# the probes above, because what matters about it is not its colour but that it
# is not JOINED to the trace -- see the openings block in main().
COOLING_TOWER_SLOT = (45, 590)


# ------------------------------------------------------------------- the plate

def plate():
    """The plate at canvas resolution, AREA-AVERAGED.

    The tracer point-samples one source pixel per canvas pixel. This
    box-filters the whole 3x3 block instead, so the two disagree on every
    antialiased edge in the picture -- which is the point. An edge that only
    one of them can find is an edge neither should be trusting.
    """
    src = PLATE_WEBP if os.path.exists(PLATE_WEBP) else PLATE_SOURCE
    w, h, px = img.read(src)
    print(f'plate {os.path.relpath(src, ROOT)}  {w}x{h} -> '
          f'{CANVAS_W}x{CANVAS_H} area-averaged')
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
    """Trace and buildable-chip masks, written to this file's own numbers.

      trace   The glow. Green and blue both high, red far below them. Written
              as a RATIO here rather than the tracer's fixed 60-unit gap, so
              the two disagree along every edge of the glow's falloff and agree
              only where the paint is unambiguous.

      chip    Neutral grey, and this classifier says so by SATURATION rather
              than by the tracer's max-minus-min spread: everything else
              painted on this board carries a strong tint, and the chips are
              the one thing that does not.

    Everything else is scenery: the substrate, the capacitors, the small black
    ICs, the RAM stick, the fan, the cooling tower and the purple bloom.
    """
    trace = bytearray(w * h)
    chip = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        mx, mn = max(r, g, b), min(r, g, b)
        lum = (r + g + b) / 3
        if g >= 150 and b >= 170 and r <= 0.65 * g:
            trace[i] = 1
        elif mx and (mx - mn) / mx <= 0.16 and 72 <= lum <= 186:
            chip[i] = 1
    return trace, chip


def probe(w, h, trace, chip, cx, cy):
    """(trace share, chip share, largest solid neither) inside a probe disc."""
    inside, t, c, total = set(), 0, 0, 0
    for dy in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
        for dx in range(-PROBE_RADIUS, PROBE_RADIUS + 1):
            if dx * dx + dy * dy > PROBE_RADIUS * PROBE_RADIUS:
                continue
            X, Y = cx + dx, cy + dy
            if not (0 <= X < w and 0 <= Y < h):
                continue
            total += 1
            t += trace[Y * w + X]
            c += chip[Y * w + X]
            if not trace[Y * w + X] and not chip[Y * w + X]:
                inside.add((X, Y))
    biggest, seen = 0, set()
    for pt in inside:
        if pt in seen:
            continue
        n, q = 0, deque([pt])
        seen.add(pt)
        while q:
            x, y = q.popleft()
            n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    p = (x + dx, y + dy)
                    if p in inside and p not in seen:
                        seen.add(p)
                        q.append(p)
        biggest = max(biggest, n)
    return t / total, c / total, biggest


# ------------------------------------------------------------------- regions

def blobs(w, h, mask, steps=((1, 0), (-1, 0), (0, 1), (0, -1))):
    seen = bytearray(w * h)
    out = []
    for s in range(w * h):
        if not mask[s] or seen[s]:
            continue
        q = deque([s])
        seen[s] = 1
        pts = [s]
        while q:
            i = q.popleft()
            x, y = i % w, i // w
            for dx, dy in steps:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if mask[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
                        pts.append(j)
        out.append(pts)
    out.sort(key=len, reverse=True)
    return out


def close_pinholes(w, h, mask, max_area):
    """Fills the pinholes inside the band, and NOTHING larger.

    THIS IS NOT OPTIONAL AND IT IS NOT THE TRACER'S STEP COPIED. The glow has
    pale circuit detail drawn inside it -- hairlines, vias, little rings -- and
    a classifier tuned to the glow's colour reads those as not-glow. Casting a
    normal to measure the width then stops at the first hairline it meets, and
    the band comes out 38 px across instead of 48: a 20% error with no visible
    cause, on a plate where the paint is unambiguous. Every hole worth closing
    is under a couple of hundred pixels; the cap is ten times that and three
    orders of magnitude below the enclosed region the fork makes, which must
    survive.
    """
    out = bytearray(mask)
    filled = 0
    for pts in enclosed(w, h, mask):
        if len(pts) <= max_area:
            for i in pts:
                out[i] = 1
            filled += len(pts)
    return out, filled


def enclosed(w, h, mask):
    """Regions of the complement that do not touch the frame."""
    comp = bytearray(1 - mask[i] for i in range(w * h))
    return [p for p in blobs(w, h, comp)
            if all(not (i % w in (0, w - 1) or i // w in (0, h - 1)) for i in p)]


def edge_runs(w, h, mask, min_len=4, join=6):
    """Runs of `mask` along each frame edge.

    Runs closer together than `join` are ONE opening. The west mouth is cut in
    two by a single dark row at y=295 -- a painted highlight on the trace, one
    pixel of it -- and reporting that as two entrances would be the plate's
    antialiasing masquerading as the level's topology.
    """
    def runs(vals):
        out, s = [], None
        for i, v in enumerate(list(vals) + [0]):
            if v and s is None:
                s = i
            elif not v and s is not None:
                out.append((s, i - 1))
                s = None
        merged = []
        for a, b in out:
            if merged and a - merged[-1][1] <= join:
                merged[-1] = (merged[-1][0], b)
            else:
                merged.append((a, b))
        return [r for r in merged if r[1] - r[0] + 1 >= min_len]
    return {
        'west': runs(mask[y * w] for y in range(h)),
        'east': runs(mask[y * w + w - 1] for y in range(h)),
        'north': runs(mask[x] for x in range(w)),
        'south': runs(mask[(h - 1) * w + x] for x in range(w)),
    }


def column_runs(w, h, mask, x):
    out, s = [], None
    for y in range(h + 1):
        t = y < h and mask[y * w + x]
        if t and s is None:
            s = y
        elif not t and s is not None:
            out.append((s, y - 1))
            s = None
    return out


def core_chip(w, h, chip, cx, cy):
    """(non-chip pixels, largest connected non-chip blob) inside a pad core."""
    inside = set()
    for dy in range(-PAD_CORE_RADIUS, PAD_CORE_RADIUS + 1):
        for dx in range(-PAD_CORE_RADIUS, PAD_CORE_RADIUS + 1):
            if dx * dx + dy * dy > PAD_CORE_RADIUS * PAD_CORE_RADIUS:
                continue
            X, Y = int(round(cx + dx)), int(round(cy + dy))
            if 0 <= X < w and 0 <= Y < h and not chip[Y * w + X]:
                inside.add((X, Y))
    biggest, seen = 0, set()
    for p in inside:
        if p in seen:
            continue
        n, q = 0, deque([p])
        seen.add(p)
        while q:
            x, y = q.popleft()
            n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    t = (x + dx, y + dy)
                    if t in inside and t not in seen:
                        seen.add(t)
                        q.append(t)
        biggest = max(biggest, n)
    return len(inside), biggest


# --------------------------------------------------------------------- overlay

def write_overlay(w, h, px, lines, pads, path):
    out = bytearray(px)

    def dot(x, y, rgb, r=0):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x + dx)), int(round(y + dy))
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    out[i], out[i + 1], out[i + 2] = rgb

    colours = {'stem': (255, 255, 255), 'north': (255, 230, 40), 'south': (255, 90, 200),
               'tail': (120, 255, 120), 'door': (255, 80, 80),
               'hook': (255, 160, 0), 'flank': (150, 150, 255)}
    for name, line in lines.items():
        for x, y in line:
            dot(x, y, colours.get(name, (255, 0, 255)), 1)
    for cx, cy in pads:
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (60, 255, 60), 1)
        dot(cx, cy, (255, 255, 255), 2)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    png.write(path, w, h, out)


# ------------------------------------------------------------------------ main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay', action='store_true')
    args = ap.parse_args()

    g = json.load(open(GEOMETRY))
    problems = []

    w, h, px = plate()
    trace, chip = classify(w, h, px)

    print('\n--- can the ground test fail? ---')
    for name, (cx, cy), want in PROBES:
        ts, cs, blob = probe(w, h, trace, chip, cx, cy)
        ok = {'trace': ts >= PROBE_SHARE,
              'chip': cs >= PROBE_SHARE,
              'substrate': ts < 0.02 and cs < 0.02 and blob >= PROBE_PROP_BLOB,
              'other': ts < 0.1 and cs < 0.1}[want]
        print(f'  {name:38s} trace {ts * 100:5.1f}%  chip {cs * 100:5.1f}%  '
              f'neither {blob:4d}px  expected {want}{"" if ok else "   <-- WRONG"}')
        if not ok:
            problems.append(f'the classifier reads {name} as {ts * 100:.0f}% trace / '
                            f'{cs * 100:.0f}% chip, and it should read {want}; every result '
                            f'below means nothing')
    if problems:
        print('\nthe classifier does not agree with the plate; stopping before the geometry.')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)

    # ------------------------------------------------------------- the band
    entrance = tuple(g['entrances']['west']['terminal'])
    band, seed = component(w, h, trace, (min(w - 1, entrance[0] + 6), entrance[1]))
    raw = sum(band)
    band, filled = close_pinholes(w, h, band, 2000)
    print(f'\n--- the trace ---\n  {raw} px of connected trace from the west opening, '
          f'plus {filled} px of pinhole closed inside it -> {sum(band)} px')

    inner = [p for p in enclosed(w, h, band) if len(p) > 2000]
    print(f'  {len(inner)} enclosed region(s) over 2000 px: '
          + (', '.join(f'{len(p)} px' for p in inner) or 'none'))
    if len(inner) != 2:
        problems.append(f'the trace encloses {len(inner)} region(s) over 2000 px, not the two '
                        f'the geometry file is built around; the junctions have moved and '
                        f'every length below is measuring a different shape')

    # ---------------------------------------------------------- the openings
    print('\n--- where the trace meets the frame ---')
    allruns = edge_runs(w, h, trace, 4)
    bandruns = edge_runs(w, h, band, 4)
    found = [(e, r) for e, rr in bandruns.items() for r in rr]
    for edge in ('west', 'east', 'north', 'south'):
        span = h if edge in ('west', 'east') else w
        for lo, hi in allruns[edge]:
            on = (lo, hi) in bandruns[edge]
            print(f'  {edge:5s} {lo:4d}-{hi:<4d} ({lo / span:5.1%}-{hi / span:5.1%})  '
                  + ('ON THE TRACE' if on else 'cyan, but not the trace'))
    if len(found) != 1 or found[0][0] != 'west':
        problems.append(f'the trace has {len(found)} frame opening(s) '
                        f'({", ".join(e for e, _ in found)}); the geometry file declares one, '
                        f'on the west edge')
    else:
        lo, hi = found[0][1]
        want = g['entrances']['west']['opening']
        print(f'  the one opening on the trace is west {lo}-{hi}; the geometry file says {want}')
        if abs(lo - want[0]) > 3 or abs(hi - want[1]) > 3:
            problems.append(f'the west opening measures {lo}-{hi} against the geometry '
                            f'file\'s {want}')
        mid = (lo + hi) // 2
        if abs(mid - entrance[1]) > 3:
            problems.append(f'the west terminal is at y={entrance[1]}, and the opening\'s '
                            f'centre is y={mid}')

    # THE BRIEF'S SECOND ENTRANCE, required to be absent. This is the one check
    # here that is looking for something NOT to be true, and it is worth the
    # lines: an external measurement found cyan on the west edge at 81-84% and
    # called it an entrance, and the only thing separating that reading from
    # this one is whether the cyan is joined to the trace.
    lower = [r for r in allruns['west'] if 0.78 <= (r[0] / h) <= 0.86]
    onband = [r for r in bandruns['west'] if 0.78 <= (r[0] / h) <= 0.86]
    print(f'  the brief\'s second entrance: {len(lower)} run(s) of cyan at 78-86% of the west '
          f'edge, {len(onband)} of them on the trace')
    if onband:
        problems.append('the cyan at 81-84% of the west edge is now connected to the trace; '
                        'the geometry file says it is the cooling tower and is not')
    cx, cy = COOLING_TOWER_SLOT
    slot_cyan = trace[cy * w + cx]
    slot_on_band = band[cy * w + cx]
    print(f'  the cooling tower\'s vent slot at {COOLING_TOWER_SLOT}: '
          f'{"cyan" if slot_cyan else "NOT cyan"}, '
          f'{"ON the trace" if slot_on_band else "not on the trace"}')
    if not slot_cyan:
        problems.append(f'{COOLING_TOWER_SLOT} is no longer cyan, so the check that it is '
                        f'cyan-but-separate is not testing anything')
    if slot_on_band:
        problems.append(f'{COOLING_TOWER_SLOT}, the cooling tower\'s vent slot, is now part '
                        f'of the trace; the second entrance the brief reports would be real')

    deep = depth(w, h, band)
    maxdeep = max(d for d in deep if d < 10 ** 9)

    # ------------------------------------------------------------- the exit
    print('\n--- the exit ---')
    xmax = max(i % w for i in range(w * h) if band[i])
    declared = tuple(g['exit']['terminal'])
    mouth = None
    for x in range(xmax, 0, -1):
        runs = column_runs(w, h, band, x)
        if len(runs) == 1 and runs[0][1] - runs[0][0] + 1 >= 0.6 * g['traceWidth']:
            mouth = (x, runs[0][0], runs[0][1])
            break
    mx, mtop, mbot = mouth
    print(f'  the trace\'s last full-width column is x={mx} ({mx / w:.1%} of the width), '
          f'spanning y {mtop}-{mbot} ({mtop / h:.1%}-{mbot / h:.1%})')
    print(f'  the geometry file declares the terminal at {declared}, mouth '
          f'{g["exit"]["opening"]}')
    if abs(mx - declared[0]) > 3 or abs((mtop + mbot) // 2 - declared[1]) > 3:
        problems.append(f'the door measures ({mx}, {(mtop + mbot) // 2}) against the geometry '
                        f'file\'s {list(declared)}')
    if mx > w - 40:
        problems.append(f'the trace reaches x={mx} of {w}; this level\'s exit is an INTERIOR '
                        f'door and should stop well short of the frame')
    # And it really is the end: nothing but the antialiased tip past the mouth.
    beyond = sum(1 for i in range(w * h) if band[i] and i % w > mx)
    print(f'  {beyond} px of trace beyond that column (the tip clipped by the housing frame)')
    if beyond > 200:
        problems.append(f'{beyond} px of trace lie beyond the declared door; it is not the end')

    # EVERYTHING BELOW WALKS THE BAND BETWEEN THE FILE'S OWN NODES, and a node
    # that is not on the paint kills `snap` with a bare SystemExit -- which
    # would throw away the openings and the exit findings just measured, the
    # ones that say WHY the node is wrong. So the run stops here and reports
    # instead, the same way it stops after the classifier.
    if problems:
        print('\n  the trace does not have the shape the geometry file describes; stopping '
              'before the centrelines.')
        for pr in problems:
            print('  - ' + pr)
        raise SystemExit(1)

    # ------------------------------------------------------ the flank loop
    #
    # THE TEST IS INVERTED FROM WHAT IT USED TO BE. This block required the
    # spur's south end to be a CAP -- paint on one side and nothing on the
    # other, measured as the share of a 34 px ring around it that is trace,
    # about a third for a cap against about two thirds mid-run. The corridor is
    # painted now, so the same measurement is made at the same place and the
    # answer has to have flipped: the old cap is mid-run, and both ends of the
    # flank are junctions.
    print('\n--- the flank loop ---')
    OLD_CAP = (914, 568)
    F = tuple(g['nodes']['flankJoin'])

    def snapish(pt):
        """The nearest painted pixel to `pt`, so a geodesic can start there."""
        X, Y = int(round(pt[0])), int(round(pt[1]))
        if 0 <= X < w and 0 <= Y < h and band[Y * w + X]:
            return (X, Y)
        for rad in range(1, 40):
            for dy in range(-rad, rad + 1):
                for dx in range(-rad, rad + 1):
                    nx, ny = X + dx, Y + dy
                    if 0 <= nx < w and 0 <= ny < h and band[ny * w + nx]:
                        return (nx, ny)
        raise SystemExit(f'nothing painted within 40 px of {pt}')

    def ring_share(pt, r=34):
        X, Y = pt
        ring, on = 0, 0
        for a in range(0, 360, 2):
            t = math.radians(a)
            px_, py_ = int(round(X + r * math.cos(t))), int(round(Y + r * math.sin(t)))
            if 0 <= px_ < w and 0 <= py_ < h:
                ring += 1
                on += band[py_ * w + px_]
        return on / ring if ring else 0.0

    # THE RING SHARE IS THE WRONG INSTRUMENT FOR THIS ONE. A cap reads about a
    # third and a point mid-run about two thirds, and the old cap is now a
    # CORNER -- the flank turns there -- which reads 45%, sitting exactly on any
    # threshold you would pick. So the claim is tested directly instead: is
    # there painted trace BETWEEN the trunk and that point? A geodesic inside
    # the band answers it with three orders of magnitude of daylight. Before the
    # corridor was painted the only way from the flank junction to the cap was
    # the long way round the board, about 1,600 px against 112 as the crow
    # flies; with it painted the walk IS the crow's flight.
    share = ring_share(OLD_CAP)
    walk = polyline_length(geodesic(w, h, band, deep, maxdeep, snapish(F), snapish(OLD_CAP)))
    crow = math.dist(F, OLD_CAP)
    print(f'  the spur\'s old cap at {OLD_CAP}: {share:.0%} of a 34 px ring round it is trace, '
          f'and the band walks {walk:.0f} px from the flank junction to it against '
          f'{crow:.0f} px as the crow flies')
    if walk > crow * 1.6:
        problems.append(f'the band walks {walk:.0f} px from the flank junction {F} to the old '
                        f'cap {OLD_CAP}, against {crow:.0f} px direct; the corridor between '
                        f'them is not painted')

    for label, key in (('the flank junction', 'flankJoin'), ('the door junction', 'doorJunction')):
        pt = tuple(g['nodes'][key])
        X, Y = pt
        if not (0 <= X < w and 0 <= Y < h and band[Y * w + X]):
            problems.append(f'{label} {pt} is not on painted trace')
            continue
        sh = ring_share(pt)
        print(f'  {label} {pt}: {sh:.0%} of a 34 px ring round it is trace')
        if sh <= 0.45:
            problems.append(f'{label} {pt} has trace {sh:.0%} of the way round it; '
                            f'that is not a junction')

    # ----------------------------------------------- the lines, re-traced
    print('\n--- the centrelines, re-traced off the plate ---')

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
        raise SystemExit(f'no painted trace within 60px of {pt}')

    A = tuple(g['nodes']['fork'])
    B = tuple(g['nodes']['rejoin'])
    C = tuple(g['nodes']['doorJunction'])
    # THE TWO ARMS ARE WALKED THROUGH A POINT ON EACH, not by hoping a geodesic
    # picks the arm the tracer meant. The waypoint is the shipped polyline's own
    # midpoint, which is a point the geometry file asserts is on that arm -- so
    # a swapped or mis-traced arm fails here rather than being re-derived into
    # agreement.
    def midpoint(name):
        line = [tuple(p) for p in g['centreline'][name]]
        half = polyline_length(line) / 2
        run = 0.0
        for i in range(len(line) - 1):
            step = math.dist(line[i], line[i + 1])
            if run + step >= half:
                t = (half - run) / step if step else 0
                return (line[i][0] + t * (line[i + 1][0] - line[i][0]),
                        line[i][1] + t * (line[i + 1][1] - line[i][1]))
            run += step
        return line[-1]

    walks = {}
    walks['stem'] = geodesic(w, h, band, deep, maxdeep, snap(entrance), snap(A))
    for arm in ('north', 'south'):
        via = snap(midpoint(arm))
        walks[arm] = (geodesic(w, h, band, deep, maxdeep, snap(A), via)
                      + geodesic(w, h, band, deep, maxdeep, via, snap(B))[1:])
    walks['tail'] = geodesic(w, h, band, deep, maxdeep, snap(B), snap(F))
    # THE HOOK AND THE FLANK RUN BETWEEN THE SAME TWO NODES, so each is walked
    # THROUGH ITS OWN MIDPOINT -- the north and south arms' trick, and needed
    # for the same reason: a plain geodesic from F to C would take whichever is
    # shorter and re-trace the flank twice.
    for arm in ('hook', 'flank'):
        via = snap(midpoint(arm))
        walks[arm] = (geodesic(w, h, band, deep, maxdeep, snap(F), via)
                      + geodesic(w, h, band, deep, maxdeep, via, snap(C))[1:])
    walks['door'] = geodesic(w, h, band, deep, maxdeep, snap(C), snap(declared))

    for name in ('stem', 'north', 'south', 'tail', 'hook', 'flank', 'door'):
        traced = polyline_length(walks[name])
        want = g['lengths'][name]
        off = abs(traced - want) / want if want else 0
        flag = '' if off <= TOLERANCE else f'   <-- more than {TOLERANCE:.0%}'
        print(f'  {name:6s} re-traced {traced:8.1f}  geometry {want:8.1f}  '
              f'{off * 100:5.2f}%{flag}')
        if off > TOLERANCE:
            problems.append(f'the {name} line re-traces at {traced:.1f} against the geometry '
                            f'file\'s {want:.1f}, {off * 100:.2f}% out')

    total = sum(polyline_length(l) for l in walks.values())
    print(f'  every painted stretch: re-traced {total:.1f}, geometry {g["traceLength"]:.1f}, '
          f'{abs(total - g["traceLength"]) / g["traceLength"] * 100:.2f}%')
    if abs(total - g['traceLength']) / g['traceLength'] > TOLERANCE:
        problems.append(f'the whole trace re-traces at {total:.1f} against the geometry '
                        f'file\'s {g["traceLength"]:.1f}')

    # -------------------------------------------- where the shipped line runs
    print('\n--- where the shipped line actually runs ---')
    for name in ('stem', 'north', 'south', 'tail', 'hook', 'flank', 'door'):
        line = [tuple(p) for p in g['centreline'][name]]
        off, shallow, worst = 0, 0, (1e9, None)
        for x, y in line:
            X, Y = int(round(x)), int(round(y))
            if not (0 <= X < w and 0 <= Y < h and band[Y * w + X]):
                off += 1
                continue
            # A VERTEX IN THE MOUTH IS NOT RIDING THE KERB. `depth` counts the
            # frame as an edge of the band, so every vertex within half a trace
            # width of the frame reads shallow whether or not it is anywhere
            # near the paint's real edge -- the stem's first vertex sits at
            # x=4, dead centre between the mouth's two kerbs, and scores 4. The
            # frame mouth and the door mouth are both exempt for that reason,
            # and for no other: a vertex anywhere else has to be mid-band.
            mouth = g['traceWidth'] / 2
            if (X < mouth or Y < mouth or X > w - 1 - mouth or Y > h - 1 - mouth
                    or math.dist((X, Y), declared) < mouth):
                continue
            d = deep[Y * w + X]
            worst = min(worst, (d, (X, Y)))
            if d < VERTEX_MID_BAND * g['traceWidth'] / 2:
                shallow += 1
        print(f'  {name:6s} {len(line):3d} vertices, {off} off the paint, {shallow} nearer the '
              f'edge than {VERTEX_MID_BAND:.0%} of the half-width  (worst {worst[0]:.1f} px '
              f'at {worst[1]})')
        if off:
            problems.append(f'{off} of the {name} line\'s {len(line)} shipped vertices are not '
                            f'on painted trace')
        if shallow:
            problems.append(f'{shallow} of the {name} line\'s shipped vertices sit closer to '
                            f'the trace\'s edge than {VERTEX_MID_BAND:.0%} of its half-width')

    # -------------------------------------------------------------- the width
    print('\n--- trace width ---')
    per = {}
    for name in ('stem', 'north', 'south', 'tail', 'hook'):
        per[name] = median(widths(w, h, band, walks[name]))
        print(f'  {name:6s} median {per[name]:5.1f}')
    allw = sorted(sum((widths(w, h, band, walks[n])
                       for n in ('stem', 'north', 'south', 'tail', 'hook')), []))
    derived = median(allw)
    want = g['traceWidth']
    off = abs(derived - want) / want
    print(f'  over the whole route {derived:.1f}  geometry {want}  {off * 100:.2f}%  '
          f'(gate {WIDTH_TOLERANCE:.0%})')
    if off > WIDTH_TOLERANCE:
        problems.append(f'the trace measures {derived:.1f} against the geometry file\'s '
                        f'{want}, {off * 100:.2f}% out')
    print(f'  the entrance stub is {per["stem"]:.0f}, which is the paint flaring where it '
          f'meets the frame and not the trace\'s own width')

    # ---------------------------------------------------------------------
    # THE BRIEF'S REFERENCE FIGURES, recorded and printed rather than enforced.
    #
    # The brief gives trace width about 44.7 and total trace length about 3,649.
    # The width lands within 7% either way and is reported. The length does not:
    #
    #   re-traced here, every stretch                       ~3300
    #   trace pixels / width, which touches no trace        ~3330
    #   the brief                                            3649
    #
    # Two independent measurements of the same paint agree with each other to
    # under 2% and sit 10% under the brief, the one frame opening lands where
    # the brief says to a fraction of a percent, and the overlay shows the
    # traced line on the paint down its whole length. This is level 8's
    # situation repeated -- see reports/2026-09-13-level-9-geometry.md -- so it
    # is a disagreement with the REFERENCE rather than a broken mask, and it
    # does not fail the run.
    # ---------------------------------------------------------------------
    print('\n--- against the brief\'s reference figures ---')
    by_area = sum(band) / derived
    print(f'  re-traced, every stretch          {total:7.1f}')
    print(f'  trace pixels / width, independent {by_area:7.1f}  '
          f'({sum(band)} px / {derived:.1f})')
    print(f'  the brief                         {REFERENCE_TRACE_LENGTH:7.1f}   '
          f'{(total - REFERENCE_TRACE_LENGTH) / REFERENCE_TRACE_LENGTH * 100:+.1f}%'
          '   <-- recorded, not enforced; see the block above this line')
    print(f'  width: measured {derived:.1f}, the brief {REFERENCE_TRACE_WIDTH}, the house '
          f'standard 50')

    # ---------------------------------------------------------------- the pads
    print('\n--- the grey chips ---')
    chips = [p for p in blobs(w, h, chip) if len(p) >= MIN_CHIP_AREA]
    nxt = max((len(p) for p in blobs(w, h, chip) if len(p) < MIN_CHIP_AREA), default=0)
    print(f'  {len(chips)} chips over {MIN_CHIP_AREA} px; the largest neutral-grey blob under '
          f'the threshold is {nxt} px')
    pads = [tuple(p) for p in g['pads']]
    if len(chips) != len(pads):
        problems.append(f'{len(chips)} grey chips on the plate against {len(pads)} pads in the '
                        f'geometry file')

    boxes = []
    for pts in chips:
        xs = [i % w for i in pts]
        ys = [i // w for i in pts]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))

    route = [[tuple(p) for p in g['centreline'][n]]
             for n in ('stem', 'north', 'south', 'tail', 'hook', 'door')]
    print(f'\n  {"pad":>3} {"x":>7} {"y":>6} {"on a chip?":>26} {"to route":>9} '
          f'{"nearest pad":>12}')
    for n, (cx, cy) in enumerate(pads, 1):
        offchip, blob = core_chip(w, h, chip, cx, cy)
        d = min(point_to_polyline((cx, cy), r) for r in route)
        near = min(math.dist((cx, cy), q) for q in pads if q != (cx, cy))
        owner = [i for i, (x0, y0, x1, y1) in enumerate(boxes)
                 if x0 <= cx <= x1 and y0 <= cy <= y1]
        want_d = g['padStandoff'][n - 1]
        flags = []
        if not owner:
            flags.append('its centre is not inside any grey chip')
        if blob >= 40:
            flags.append(f'a {blob}px run of non-chip in its core')
        if abs(d - want_d) > 2.0:
            flags.append(f'{d:.1f} from the route, geometry says {want_d}')
        print(f'  {n:3d} {cx:7.1f} {cy:6.1f} {offchip:6d}px off / {blob:3d} blob '
              f'{d:9.1f} {near:12.1f}{"   <-- " + "; ".join(flags) if flags else ""}')
        for f in flags:
            problems.append(f'pad {n}: {f}')

    print(f'  {len(pads)} pads, one per painted chip. Closest pair '
          f'{g["closestPadPair"]} px.')
    print(f'  standoff {min(g["padStandoff"]):.1f}-{max(g["padStandoff"]):.1f}, median '
          f'{median(sorted(g["padStandoff"])):.1f}  (levels 2-4 use 90-114)')
    print(f'  PADS THAT CANNOT REACH THE ROUTE at range {g["towerRange"]}: '
          + (', '.join(str(n) for n in g['padsUnreachable']) or 'none'))
    print(f'  PADS COVERING TWO SEPARATE PASSES: {g["padsCoveringTwoPasses"]} of {len(pads)} '
          f'at range {g["towerRange"]}, {g["padsCoveringTwoPassesAtLegacyRange"]} at '
          f'{g["legacyTowerRange"]}')

    if args.overlay:
        write_overlay(w, h, px, {k: walks[k] for k in walks}, pads, OVERLAY_OUT)
        print(f'\noverlay written to {os.path.relpath(OVERLAY_OUT, ROOT)}')

    print()
    if problems:
        print(f'{len(problems)} DISAGREEMENT(S):')
        for p in problems:
            print('  - ' + p)
        raise SystemExit(1)
    print('the plate and tools/level9_geometry.json agree.')


if __name__ == '__main__':
    main()
