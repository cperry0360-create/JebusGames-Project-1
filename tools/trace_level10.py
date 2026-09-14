"""Derive level 10's lane, lane width, build pads and Vlaude's berth from the plate.

    python3 tools/trace_level10.py --overlay tools/L10_pads_overlay.png

Level 10 is the machine's core chamber: a glowing CYAN LANE over a field of
dark blue-grey HEX FLOOR PLATING, ringed by purple machinery, with a cracked
purple CRYSTAL CORE in the upper right that Vlaude is parked at for the first
two phases.

The method is tools/trace_level9.py's, which is tools/trace_map.py's -- classify
every pixel, take the largest connected run of the lane colour, walk a geodesic
down the MIDDLE of the painted band rather than the shortest chord -- and the
helpers are imported from trace_level9 rather than copied.

THREE THINGS THAT DIFFER FROM LEVEL 9, and the third is the one that matters:

  ONE LANE, NO FORKS, AND THIS IS CONFIRMED. The band encloses no region at all
  -- `holes()` finds nothing above the pinhole cap -- so there is no cycle and
  no fork. Level 9's whole finding was that its brief was wrong about this;
  level 10's brief is right.

  THE FLOOR IS NOT NEUTRAL GREY. Level 9's chips were the one untinted thing on
  a tinted board, so a channel-spread test found them. Every surface here is
  blue: the plating is (60,84,108) and (48,72,96), the machinery around it is
  (12,24,60) and (24,36,84). What separates them is that the plating is
  GREEN-SHIFTED -- g-r of 24 against the machinery's 12 -- at a luminance the
  machinery never reaches. Both numbers are read off the plate's own colour
  histogram, not guessed.

  THE PADS ARE SCORED, NOT PAINTED. This is the real difference from level 9
  and it is a difference in the ART, not in taste. Level 9 painted fifteen
  small chips -- 81x75 median -- so its buildable ground WAS those chips and
  one pad each was the only honest reading. Level 10 paints eleven large open
  panels, the biggest 223x150 and deep enough to hold a 57 px disc; a single
  pad on one of those wastes two thirds of it. So the pads are placed by the
  scoring pass levels 3, 4 and 8 use on open ground, with THEIR constants
  unchanged, and the count is whatever falls out. A forced count would be a lie
  told to the soak, which is tools/trace_level8.py's phrase and its reasoning.

Nothing at runtime depends on this. It is the record of where
tools/level10_geometry.json came from and how to redo it when the art changes.
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
from trace_level9 import (                                          # noqa: E402
    components, bbox, holes, fill_speckle, depth, geodesic_field, geodesic,
    simplify, polyline_length, widths, median, point_to_polyline, edge_runs,
    shortest_tower_range,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'art-source/level10/map_level10.png')
CANVAS_W, CANVAS_H = 1280, 720

# LEVELS 3, 4 AND 8's PAD CONSTANTS, UNCHANGED. Copied deliberately rather than
# retuned: level 8's note says a board's pad count is a real design constraint
# on its boss, because boss health only means anything against the DPS a board
# can bring, so a count arrived at by relaxing a constant is a number the soak
# cannot use.
PAD_CORE_RADIUS = 24
PAD_MIN_FROM_LANE = 90
PAD_MAX_FROM_LANE = 114
PAD_SPACING = 74
SPOT_RADIUS = 34
PAD_EDGE_MARGIN = SPOT_RADIUS
PAD_GRID = 4
LANE_STRIDE = 3
LEGACY_TOWER_RANGE = 112

# Two stretches of lane count as separate passes only if this much lane
# separates them -- trace_level9.py's PASS_GAP, and its reasoning: the apex of a
# hairpin, where the road curls continuously round a pad, is one pass.
PASS_GAP = LEGACY_TOWER_RANGE

# A pinhole inside the painted band. THE CAP MATTERS HERE FOR THE OPPOSITE
# REASON IT DID ON LEVEL 9: there, a plain hole fill would have swallowed the
# 140,948 px cycle that was the whole finding. Here there is no cycle to
# protect, and the cap is kept low anyway so that "no holes above the cap" is
# evidence about the topology rather than a consequence of the fill.
PINHOLE = 400


def plate():
    """The plate POINT-SAMPLED to canvas resolution, as trace_level9 does."""
    w, h, px = img.read(PLATE)
    print(f'plate {os.path.relpath(PLATE, ROOT)}  {w}x{h} -> '
          f'{CANVAS_W}x{CANVAS_H} point-sampled')
    out = bytearray(CANVAS_W * CANVAS_H * 4)
    for y in range(CANVAS_H):
        sy = (y * h) // CANVAS_H
        for x in range(CANVAS_W):
            i = (sy * w + (x * w) // CANVAS_W) * 4
            o = (y * CANVAS_W + x) * 4
            out[o:o + 4] = px[i:i + 4]
    return CANVAS_W, CANVAS_H, out


def classify(w, h, px):
    """The cyan lane mask, the hex-plating mask and the crystal-core mask.

      lane    trace_level9's test unchanged: green and blue both high with red
              far below them. The two levels paint the same cyan.

      floor   BLUE-GREY PLATING, which the machinery around it is not. Read off
              the plate's own histogram: the plating is (60,84,108) at 167k px
              and (48,72,96) at 100k, both g-r 24 and b-r 48 at luminance
              72-84; the machinery is (12,24,60) and (24,36,84), g-r 12 at
              luminance 32-48. So luminance 58-108 AND g-r >= 18 takes the
              plating and leaves the machinery, and the b-r window keeps the
              purple out from the other side.

      core    THE CRYSTAL, which is the one strongly PURPLE thing above the
              machinery's luminance: red above green, blue far above both.
              Vlaude is parked at its centre for phases 1 and 2 and this is
              where that position comes from.
    """
    lane = bytearray(w * h)
    floor = bytearray(w * h)
    core = bytearray(w * h)
    for i in range(w * h):
        r, g, b = px[i * 4], px[i * 4 + 1], px[i * 4 + 2]
        if g >= 150 and b >= 170 and r < g - 60:
            lane[i] = 1
            continue
        lum = (r + g + b) // 3
        if 58 <= lum <= 108 and (g - r) >= 18 and 30 <= (b - r) <= 64:
            floor[i] = 1
        elif r > g + 20 and b > r + 30 and lum >= 55:
            core[i] = 1
    return lane, floor, core


def dilate(w, h, mask, r):
    """Grows `mask` by r, four-connected. Merges a cracked crystal's facets."""
    out = bytearray(mask)
    for _ in range(r):
        nxt = bytearray(out)
        for y in range(1, h - 1):
            base = y * w
            for x in range(1, w - 1):
                if out[base + x]:
                    nxt[base + x - 1] = nxt[base + x + 1] = 1
                    nxt[base + x - w] = nxt[base + x + w] = 1
        out = nxt
    return out


def band_rows(w, h, mask, x):
    ys = [y for y in range(h) if mask[y * w + x]]
    return (ys[0], ys[-1]) if ys else None


def bridge_housing(w, h, band, stubs):
    """Joins each frame-edge stub to the main band across the machine housing.

    A trapezoid between the two MEASURED y-ranges -- the stub's at its inner
    end and the band's at its nearest terminal -- so the bridge is the lane's
    own width at both ends and nothing is typed in. Returns the new band and
    how many pixels it added.
    """
    out = bytearray(band)
    added = 0
    xs = [i % w for i in range(w * h) if band[i]]
    bx0, bx1 = min(xs), max(xs)
    for pts in stubs:
        sx0, sy0, sx1, sy1 = bbox(w, pts)
        for i in pts:
            if not out[i]:
                out[i] = 1
                added += 1
        if sx0 <= 3:                       # a west stub: bridge sx1 -> bx0
            a, b = sx1, bx0
            ra = band_rows(w, h, as_stub_mask(w, h, pts), sx1)
            rb = band_rows(w, h, band, bx0)
        else:                              # an east stub: bridge bx1 -> sx0
            a, b = bx1, sx0
            ra = band_rows(w, h, band, bx1)
            rb = band_rows(w, h, as_stub_mask(w, h, pts), sx0)
        if ra is None or rb is None or b <= a:
            continue
        for x in range(a, b + 1):
            t = (x - a) / (b - a)
            y0 = ra[0] + (rb[0] - ra[0]) * t
            y1 = ra[1] + (rb[1] - ra[1]) * t
            for y in range(int(round(y0)), int(round(y1)) + 1):
                i = y * w + x
                if 0 <= y < h and not out[i]:
                    out[i] = 1
                    added += 1
    return out, added


def as_stub_mask(w, h, pts):
    m = bytearray(w * h)
    for i in pts:
        m[i] = 1
    return m


def core_on_floor(floor, w, x, y, r=PAD_CORE_RADIUS):
    """The pad's whole radius-24 disc on painted plating. Levels 3 and 4's."""
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy > r * r:
                continue
            X, Y = x + dx, y + dy
            if not (0 <= X < CANVAS_W and 0 <= Y < CANVAS_H) or not floor[Y * w + X]:
                return False
    return True


def choose_pads(floor, lane_line, reach):
    """Levels 3, 4 and 8's scoring pass, on this board's plating.

    ON FLOOR    the pad's radius-24 core sits entirely on classified plating,
                so it is clear of the lane, the seams and every piece of
                machinery.
    STANDOFF    90 to 114 px from the lane centreline.
    APART       at least 74 px between centres.
    BEST FIRST  ordered by how much UNCOVERED lane the pad would add, and the
                board stops when nothing left adds any -- level 8's rule, which
                is what stops a wide open floor collecting pads that all shoot
                the same stretch of road.
    """
    pts = lane_line[::LANE_STRIDE]
    cand = []
    lo = PAD_EDGE_MARGIN
    for y in range(lo, CANVAS_H - lo, PAD_GRID):
        for x in range(lo, CANVAS_W - lo, PAD_GRID):
            d = point_to_polyline((x, y), lane_line)
            if not (PAD_MIN_FROM_LANE <= d <= PAD_MAX_FROM_LANE):
                continue
            if not core_on_floor(floor, CANVAS_W, x, y):
                continue
            covers = {j for j, (px_, py_) in enumerate(pts)
                      if math.hypot(x - px_, y - py_) <= reach}
            cand.append((x, y, covers))
    print(f'  {len(cand)} candidate positions pass core-on-floor and the standoff band')

    covered, taken, live = set(), [], list(cand)
    while live:
        live = [c for c in live
                if not any(math.hypot(c[0] - tx, c[1] - ty) < PAD_SPACING for tx, ty in taken)]
        if not live:
            break
        best = max(live, key=lambda c: len(c[2] - covered))
        if not len(best[2] - covered):
            print('  stopped: nothing left adds uncovered lane')
            break
        taken.append((best[0], best[1]))
        covered |= best[2]
    return taken, len(covered) / max(1, len(pts))


def write_overlay(w, h, px, line, pads, marks, path):
    out = bytearray(px)

    def dot(x, y, rgb, r=0):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                X, Y = int(round(x + dx)), int(round(y + dy))
                if 0 <= X < w and 0 <= Y < h:
                    i = (Y * w + X) * 4
                    out[i], out[i + 1], out[i + 2] = rgb

    for x, y in line:
        dot(x, y, (255, 255, 255), 1)
    for cx, cy in pads:
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(cx + PAD_CORE_RADIUS * math.cos(t), cy + PAD_CORE_RADIUS * math.sin(t),
                (60, 255, 60), 1)
        dot(cx, cy, (255, 255, 255), 2)
    for name, (x, y) in marks.items():
        for a in range(0, 360, 2):
            t = math.radians(a)
            dot(x + 15 * math.cos(t), y + 15 * math.sin(t), (255, 120, 0), 1)
        dot(x, y, (0, 0, 0), 3)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    png.write(path, w, h, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--overlay')
    ap.add_argument('--out', default=os.path.join(ROOT, 'tools/level10_geometry.json'))
    args = ap.parse_args()

    w, h, px = plate()
    lane, floor, core = classify(w, h, px)
    print(f'  lane {sum(lane)} px, plating {sum(floor)} px, crystal {sum(core)} px')

    # ------------------------------------------------------------ the lane
    comps = components(w, h, lane)
    band = bytearray(w * h)
    for i in comps[0]:
        band[i] = 1
    print(f'\n--- the lane ---')
    print(f'  {len(comps)} cyan runs; the largest is {len(comps[0])} px and the '
          f'next is {len(comps[1]) if len(comps) > 1 else 0}')

    enclosed = [len(p) for p in holes(w, h, band)]
    big = [a for a in enclosed if a > PINHOLE]
    band, filled = fill_speckle(w, h, band, PINHOLE)
    print(f'  enclosed regions above {PINHOLE} px: {big if big else "none"}  '
          f'-> {"FORKS" if big else "ONE PATH, NO FORKS"}')
    print(f'  {filled} px of pinhole closed')

    # THE LANE DOES NOT REACH EITHER FRAME EDGE, and this is the one thing on
    # this plate the brief does not describe. The painted lane runs x 66-1220;
    # at each end a piece of MACHINE HOUSING is drawn OVER it, and the cyan
    # re-emerges as a short stub at the frame -- x 0-36 on the west, x 1249-1279
    # on the east. Both stubs are the band's own width and both line up with the
    # band's terminal to within 5 px, so the lane is continuous and the housing
    # is on top of it; it is not two lanes and a gap.
    #
    # The housing is therefore bridged before the geodesic is walked, so the
    # centreline runs edge to edge like every other level's and Markers.ts puts
    # the spawn and exit badges where the lane actually starts and ends. The
    # bridge is a trapezoid between the two measured y-ranges, not a guessed
    # rectangle: nothing here is typed by hand.
    stubs = [p for p in comps[1:] if bbox(w, p)[0] <= 3 or bbox(w, p)[2] >= w - 4]
    stubs = [p for p in stubs if len(p) >= 200]
    print(f'  {len(stubs)} cyan stubs at a frame edge, disconnected from the band')
    for p in stubs:
        x0, y0, x1, y1 = bbox(w, p)
        print(f'    stub {len(p):5d} px, box {x0},{y0}-{x1},{y1}, '
              f'centre y {(y0 + y1) / 2:.1f} = {100 * (y0 + y1) / 2 / h:.1f}% of height')
    band, bridged = bridge_housing(w, h, band, stubs)
    print(f'  {bridged} px of machine housing bridged')

    left = edge_runs(w, h, band)['west']
    right = edge_runs(w, h, band)['east']
    print(f'  west openings {left}, east openings {right}')
    if len(left) != 1 or len(right) != 1:
        raise SystemExit('expected exactly one opening on each of the west and east edges')
    ly = sum(left[0]) / 2
    ry = sum(right[0]) / 2
    print(f'  in at (0, {ly:.0f}) = {100 * ly / h:.1f}% of height; '
          f'out at ({w - 1}, {ry:.0f}) = {100 * ry / h:.1f}%')

    d = depth(w, h, band)
    maxd = max(d[i] for i in range(w * h) if band[i])
    raw = geodesic(w, h, band, d, maxd, (0, int(round(ly))), (w - 1, int(round(ry))))
    line = simplify(raw, 1.4)
    total = polyline_length(line)
    allw = widths(w, h, band, raw)
    lane_width = round(median(allw), 1)
    print(f'  centreline {len(raw)} px -> {len(line)} waypoints, walked {total:.1f} px')
    print(f'  lane width: median {lane_width}, {allw[0]:.1f}-{allw[-1]:.1f}')
    print(f'  band px / width = {sum(band) / lane_width:.1f} against {total:.1f} walked')

    # -------------------------------------------------------- the crystal
    #
    # WHERE VLAUDE IS PARKED FOR PHASES 1 AND 2, derived rather than placed.
    #
    # The crystal is CRACKED, so the purple mask breaks into 34 separate masses
    # and the largest single one is a 1622 px shard on the WEST edge -- taking
    # "the biggest purple blob" would have berthed him in the wrong corner. The
    # mask is dilated by 5 first so the ball's facets merge into the thing a
    # player sees, and the berth is then the bounding box of every purple mass
    # in the upper-right quadrant: x at its centre, y at its BOTTOM edge, so
    # Vlaude stands in front of the core rather than inside it.
    print(f'\n--- the crystal core ---')
    dil = dilate(w, h, core, 5)
    masses = [p for p in components(w, h, dil) if len(p) > 2000]
    quad = [p for p in masses
            if bbox(w, p)[0] > w * 0.6 and bbox(w, p)[1] < h * 0.45]
    print(f'  {len(masses)} purple masses over 2000 px after a dilate of 5; '
          f'{len(quad)} in the upper-right quadrant')
    berth = None
    if quad:
        xs0 = min(bbox(w, p)[0] for p in quad)
        ys0 = min(bbox(w, p)[1] for p in quad)
        xs1 = max(bbox(w, p)[2] for p in quad)
        ys1 = max(bbox(w, p)[3] for p in quad)
        berth = (round((xs0 + xs1) / 2, 1), round(float(ys1), 1))
        print(f'  core structure box {xs0},{ys0}-{xs1},{ys1}')
        print(f'  berth {berth}  (centre x, bottom y)')
        print(f'  distance from the lane centreline: '
              f'{point_to_polyline(berth, line):.1f} px')

    # ------------------------------------------------------------- the pads
    reach = shortest_tower_range()
    print(f'\n--- the pads ---')
    print(f'  shortest attacking range in src/data/towers.json: {reach}')
    pads, cover = choose_pads(floor, raw, reach)
    pads = sorted(((round(x, 1), round(y, 1)) for x, y in pads), key=lambda p: (p[1], p[0]))
    print(f'  {len(pads)} pads; they cover {100 * cover:.1f}% of the lane at range {reach}')

    def passes(p, r):
        run, last = [], None
        for k, q in enumerate(raw):
            near = math.dist(p, q) <= r
            if near and last is None:
                last = k
            elif not near and last is not None:
                run.append((last, k - 1))
                last = None
        if last is not None:
            run.append((last, len(raw) - 1))
        merged = []
        for a, b in run:
            if merged and a - merged[-1][1] <= PASS_GAP:
                merged[-1] = (merged[-1][0], b)
            else:
                merged.append((a, b))
        return len(merged)

    print(f'\n  {"pad":>3} {"x":>7} {"y":>6} {"to lane":>8} {f"passes@{reach}":>11} '
          f'{f"passes@{LEGACY_TOWER_RANGE}":>12}')
    stand, twopass, legacy_twopass, unreachable = [], 0, 0, []
    for n, (cx, cy) in enumerate(pads, 1):
        dist = point_to_polyline((cx, cy), line)
        k, kl = passes((cx, cy), reach), passes((cx, cy), LEGACY_TOWER_RANGE)
        twopass += 1 if k >= 2 else 0
        legacy_twopass += 1 if kl >= 2 else 0
        if k == 0:
            unreachable.append(n)
        stand.append(round(dist, 1))
        print(f'  {n:3d} {cx:7.1f} {cy:6.1f} {dist:8.1f} {k:11d} {kl:12d}')
    closest = min(math.dist(pads[i], pads[j])
                  for i in range(len(pads)) for j in range(i + 1, len(pads)))
    print(f'  closest pair {closest:.1f} px apart (the rule allows {PAD_SPACING})')
    print(f'  STANDOFF {min(stand):.1f}-{max(stand):.1f}, median '
          f'{median(sorted(stand)):.1f}   (levels 2-4 use 90-114)')
    print(f'  PADS THAT CANNOT REACH THE LANE at range {reach}: '
          + (', '.join(str(n) for n in unreachable) if unreachable else 'none'))
    print(f'  PADS COVERING TWO SEPARATE PASSES: {twopass} of {len(pads)} at {reach}, '
          f'{legacy_twopass} at {LEGACY_TOWER_RANGE}')
    print(f'\n  levels 1-9 carry 7, 15, 15, 14, 14, 18, 22, 19, 15 pads. '
          f'LEVEL 10 CARRIES {len(pads)}.')

    out = {
        '_note': 'Level 10, the core chamber. Derived by tools/trace_level10.py and '
                 'checked independently by tools/check_level10.py.',
        'world': [CANVAS_W, CANVAS_H],
        'plate': list(img.read(PLATE)[:2]),
        'entrance': {'edge': 'west', 'y': round(ly, 1), 'fraction': round(ly / h, 4)},
        'exit': {'edge': 'east', 'y': round(ry, 1), 'fraction': round(ry / h, 4)},
        'forks': len(big),
        'centreline': [[round(x, 1), round(y, 1)] for x, y in line],
        'laneLength': round(total, 2),
        'laneWidth': lane_width,
        'towerRange': reach,
        'legacyTowerRange': LEGACY_TOWER_RANGE,
        'padCoreRadius': PAD_CORE_RADIUS,
        'spotRadius': SPOT_RADIUS,
        'padRules': {'minFromLane': PAD_MIN_FROM_LANE, 'maxFromLane': PAD_MAX_FROM_LANE,
                     'spacing': PAD_SPACING, 'edgeMargin': PAD_EDGE_MARGIN},
        'pads': [list(p) for p in pads],
        'padStandoff': stand,
        'padsUnreachable': unreachable,
        'padsCoveringTwoPasses': twopass,
        'padsCoveringTwoPassesAtLegacyRange': legacy_twopass,
        'closestPadPair': round(closest, 1),
        'laneCoverage': round(cover, 3),
        'vlaudeBerth': list(berth) if berth else None,
        'vlaudeBerthToLane': round(point_to_polyline(berth, line), 1) if berth else None,
    }
    json.dump(out, open(args.out, 'w'), indent=1)
    print(f'\nwrote {os.path.relpath(args.out, ROOT)}')
    if args.overlay:
        write_overlay(w, h, px, raw, pads, {'berth': berth} if berth else {}, args.overlay)
        print(f'overlay written to {args.overlay}')


if __name__ == '__main__':
    main()
