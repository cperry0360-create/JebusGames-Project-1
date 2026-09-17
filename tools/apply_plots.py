#!/usr/bin/env python3
"""Write the hand-authored build plots in tools/plots.json into the files that
own them, and re-derive every number that is a function of where the pads are.

    python3 tools/apply_plots.py            # write
    python3 tools/apply_plots.py --check    # verify the shipped files carry them

THE PLOTS ARE HAND-PLACED AND REPLACE AN ALGORITHMIC SWEEP. Levels 3, 4, 5, 7,
8 and 10 used to take their pads from a scoring pass that put every pad 90-114
px from a lane centreline, at least 74 px apart, best-first by how much
UNCOVERED lane it added. That pass is not run any more and its constants are
not constraints on this set: the hand-placed plots run from 53.6 to 159.1 px
off the centreline, because a person looking at the painting can see that a pad
tucked into a hairpin covers three passes of road and a pad on open plating
covers one. What IS still checked, in tools/check_plots.py and in the level
tests, is the part that is about the player rather than the sweep: no pad
overlaps painted road, no pad is off the plate, no two pads' tap targets
overlap, and every pad has road inside the shortest tower's range.

WHERE EACH LEVEL'S PADS LIVE, and why -- the answer is not the same twice:

  1, 2   src/data/map.json, src/data/map_level2.json. No geometry file exists
         and no builder exists; the map IS the source. Written directly.
  3, 4   tools/level{3,4}_geometry.json AND the map. No builder exists, so the
         map cannot be regenerated -- but tests/level{3,4}.test.ts assert
         `map.buildSpots` deepEqual `geometry.pads`, so the two are one fact
         stored twice and both copies move together.
  5      tools/level5_geometry.json AND src/data/map_level5.json, for the same
         reason minus the test: tools/trace_level5.py wrote both and nothing
         rebuilds the map from the geometry, so leaving the geometry behind
         would leave a second, wrong copy of the board in the repository.
  6      NOT TOUCHED. Level 6 is not in plots.json and keeps its 18 pads.
  7-10   tools/level{7,8,9,10}_geometry.json ONLY. Each has a builder that
         regenerates the map from it, and each builder was confirmed to
         reproduce the shipped map byte-for-byte before anything was written.
         Run the builders after this script; --check runs them itself.

LEVEL 9 IS THE ONE WITH ART ATTACHED TO EACH PAD. Its fifteen plots are the
same fifteen painted chips, moved by at most 6.1 px and REORDERED (plots.json
sorts by x; the trace sorted by chip bounding box, top to bottom). Everything
in the geometry file that is indexed by pad -- `padChips`, the two
`suggestedNode` maps, the standoffs -- is permuted to follow, and the
permutation is checked the only way that cannot be fooled: every new plot must
land inside the bounding box of the chip it is paired with.
"""
import argparse
import json
import math
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLOTS = os.path.join(ROOT, 'tools/plots.json')

MAPS = {1: 'map', 2: 'map_level2', 3: 'map_level3', 4: 'map_level4', 5: 'map_level5',
        6: 'map_level6', 7: 'map_level7', 8: 'map_level8', 9: 'map_level9',
        10: 'map_level10'}
BUILDERS = {7: 'build_level7_map.py', 8: 'build_level8_map.py',
            9: 'build_level9_map.py', 10: 'build_level10_map.py'}


# --------------------------------------------------------------------- io
#
# EVERY FILE HERE IS WRITTEN BY SOMETHING ELSE TOO -- the trace scripts, the
# builders, a hand edit -- so the exact serialisation is recovered from the
# file rather than assumed. A file that will not round-trip is not written at
# all: a reformat of a 500-line map buries the two lines that changed.

def load(path):
    raw = open(path).read()
    doc = json.loads(raw)
    for indent in (1, 2, 4):
        for tail in ('\n', ''):
            if json.dumps(doc, indent=indent, ensure_ascii=False) + tail == raw:
                return doc, (indent, tail)
    raise SystemExit(f'{path} does not round-trip; refusing to rewrite it')


def save(path, doc, fmt):
    indent, tail = fmt
    open(path, 'w').write(json.dumps(doc, indent=indent, ensure_ascii=False) + tail)


# ------------------------------------------------------------- measurement

def seg_dist(px, py, a, b):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    return math.hypot(px - (ax + dx * t), py - (ay + dy * t))


def poly_dist(px, py, pts):
    return min(seg_dist(px, py, pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def lines_dist(px, py, lines):
    return min(poly_dist(px, py, l) for l in lines)


def coverage(pts, pads, reach, step=1.0):
    """The fraction of a polyline within `reach` of any pad.

    Sampled at 1 px rather than solved. The stored figures were produced by
    tools/trace_level*.py off the full-resolution geodesic and this reads the
    SIMPLIFIED line the geometry file ships, so the two agree to about 0.005 --
    checked against every stored value before this script was used.
    """
    total = covered = 0.0
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        d = math.hypot(bx - ax, by - ay)
        if d == 0:
            continue
        n = max(1, int(math.ceil(d / step)))
        for k in range(n):
            t = (k + 0.5) / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            total += d / n
            if any(math.hypot(x - px, y - py) <= reach for px, py in pads):
                covered += d / n
    return covered / total if total else 0.0


def closest_pair(pads):
    return min(math.dist(pads[i], pads[j])
               for i in range(len(pads)) for j in range(i + 1, len(pads)))


def tup(pairs):
    return [(float(a), float(b)) for a, b in pairs]


# ------------------------------------------------------------- the levels

def note(n, extra=''):
    return (f'{n} HAND-PLACED PLOTS, from tools/plots.json, written here by '
            f'tools/apply_plots.py. THEY ARE NOT THE SCORING PASS\'s ANY MORE: the '
            f'sweep\'s 90-114 px standoff band and its best-first ordering produced the '
            f'set this replaced, and a person placed these against the painting instead. '
            f'Every figure below that is a function of the pads was re-derived from THIS '
            f'set off the centrelines this file ships; the sweep\'s own parameters '
            f'(`padRules`, `padStandoffBand`, `padSpacing`, any `candidatePositions`) are '
            f'left as the record of a pass that no longer chooses anything. '
            f'tools/check_plots.py re-checks the road clearance, the plate edges and the '
            f'tap-target spacing.{extra}')


def apply_map_only(lv, plots, check):
    """Levels 1 and 2: the map file is the whole source."""
    path = os.path.join(ROOT, 'src/data', MAPS[lv] + '.json')
    doc, fmt = load(path)
    if check:
        return tup(doc['buildSpots']) == tup(plots), path
    doc['buildSpots'] = [[float(x), float(y)] for x, y in plots]
    doc['_buildSpots'] = note(len(plots))
    save(path, doc, fmt)
    return True, path


def apply_geometry_and_map(lv, plots, key, check):
    """Levels 3, 4 and 5: two copies of one fact, no builder to regenerate one."""
    gpath = os.path.join(ROOT, f'tools/level{lv}_geometry.json')
    mpath = os.path.join(ROOT, 'src/data', MAPS[lv] + '.json')
    g, gfmt = load(gpath)
    m, mfmt = load(mpath)
    if check:
        ok = tup(g[key]) == tup(plots) and tup(m['buildSpots']) == tup(plots)
        return ok, f'{gpath} + {mpath}'
    g[key] = [[float(x), float(y)] for x, y in plots]
    g['_pads'] = note(len(plots))
    if 'coverage' in g:
        reach = g.get('towerRange', 112)
        g['coverage'] = {k: round(coverage([tuple(p) for p in v], tup(plots), reach), 3)
                         for k, v in g['lanes'].items()}
    save(gpath, g, gfmt)
    m['buildSpots'] = [[float(x), float(y)] for x, y in plots]
    m['_buildSpots'] = note(len(plots), f' The map is written from tools/level{lv}_geometry.json '
                                        f'by hand -- there is no build_level{lv}_map.py -- so the '
                                        f'two copies are kept equal by tools/apply_plots.py and, '
                                        f'on levels 3 and 4, asserted equal by the level test.')
    save(mpath, m, mfmt)
    return True, f'{gpath} + {mpath}'


def apply_level7(plots, check):
    gpath = os.path.join(ROOT, 'tools/level7_geometry.json')
    g, fmt = load(gpath)
    if check:
        return tup(g['pads']) == tup(plots) and tup(g['buildSpots']) == tup(plots), gpath
    pads = tup(plots)
    lanes = {k: [tuple(p) for p in v] for k, v in g['lanes'].items()}
    reach = g['towerRange']
    ints = [[int(x), int(y)] for x, y in pads]
    g['pads'] = ints
    g['buildSpots'] = ints
    g['_pads'] = note(len(pads))
    g['coverage'] = {k: round(coverage(v, pads, reach), 3) for k, v in lanes.items()}
    def strip_of(y):
        for s in g['groundStrips']:
            if s['rows'][0] <= y <= s['rows'][1]:
                return s['where']
        return 'on a highway'

    detail = []
    for cx, cy in pads:
        to = {k: round(poly_dist(cx, cy, v), 1) for k, v in lanes.items()}
        covers = sorted([k for k, d in to.items() if d <= reach], key=list(lanes).index)
        detail.append({'centre': [int(cx), int(cy)], 'toLane': to,
                       'standoff': min(to.values()), 'covers': covers,
                       'strip': strip_of(cy)})
    g['padDetail'] = detail
    g['padsCoveringTwoLanes'] = sum(1 for d in detail if len(d['covers']) >= 2)
    g['padsCoveringNoLane'] = sum(1 for d in detail if not d['covers'])
    g['padsPerStrip'] = {s['where']: sum(1 for d in detail if d['strip'] == s['where'])
                         for s in g['groundStrips']}
    g['uncoveredLaneSpans'] = {k: uncovered(v, pads, reach) for k, v in lanes.items()}
    save(gpath, g, fmt)
    return True, gpath


def uncovered(pts, pads, reach, step=1.0):
    """The stretches of a lane no pad can shoot at, as [from, to] in px along it."""
    spans, run, walked = [], None, 0.0
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        d = math.hypot(bx - ax, by - ay)
        n = max(1, int(math.ceil(d / step)))
        for k in range(n):
            t = (k + 0.5) / n
            x, y = ax + (bx - ax) * t, ay + (by - ay) * t
            near = any(math.hypot(x - px, y - py) <= reach for px, py in pads)
            if not near and run is None:
                run = walked
            elif near and run is not None:
                spans.append([round(run, 1), round(walked, 1)])
                run = None
            walked += d / n
    if run is not None:
        spans.append([round(run, 1), round(walked, 1)])
    return spans


def apply_level8(plots, check):
    gpath = os.path.join(ROOT, 'tools/level8_geometry.json')
    g, fmt = load(gpath)
    if check:
        return tup(g['pads']) == tup(plots) and tup(g['buildSpots']) == tup(plots), gpath
    pads = tup(plots)
    ints = [[int(x), int(y)] for x, y in pads]
    g['pads'] = ints
    g['buildSpots'] = ints
    g['_pads'] = note(len(pads))
    reach = g['towerRange']
    g['coverage'] = {
        'shared': round(coverage([tuple(p) for p in g['shared']], pads, reach), 3),
        'east': round(coverage([tuple(p) for p in g['branches']['east']], pads, reach), 3),
        'south': round(coverage([tuple(p) for p in g['branches']['south']], pads, reach), 3),
    }
    save(gpath, g, fmt)
    return True, gpath


def apply_level9(plots, check):
    gpath = os.path.join(ROOT, 'tools/level9_geometry.json')
    g, fmt = load(gpath)
    if check:
        return tup(g['pads']) == tup(plots), gpath
    pads = tup(plots)
    old = tup(g['pads'])
    chips = g['padChips']

    # THE PERMUTATION, AND THE CHECK THAT IT IS THE RIGHT ONE. Each new plot is
    # paired with the chip whose box contains it. A plot that landed in no box,
    # or two plots in one box, means the plots are not this plate's chips any
    # more and nothing is written.
    order = []
    for x, y in pads:
        inside = [i for i, c in enumerate(chips)
                  if c['box'][0] <= x <= c['box'][2] and c['box'][1] <= y <= c['box'][3]]
        if len(inside) != 1:
            raise SystemExit(f'level 9 plot ({x}, {y}) sits on {len(inside)} painted chips, not 1')
        order.append(inside[0])
    if sorted(order) != list(range(len(chips))):
        raise SystemExit('level 9: the plots do not pair one-to-one with the fifteen chips')
    moved = [(i, round(math.dist(pads[i], old[order[i]]), 2)) for i in range(len(pads))]

    g['pads'] = [[float(x), float(y)] for x, y in pads]
    g['padChips'] = [chips[j] for j in order]
    for key in ('suggestedNodeByAspect', 'suggestedNodeBalanced'):
        src = g[key]
        g[key] = {str(i + 1): src[str(j + 1)] for i, j in enumerate(order)}
    c = g['centreline']
    route = [[tuple(p) for p in c[n]] for n in ('stem', 'north', 'south', 'tail', 'hook', 'door')]
    flank = [tuple(p) for p in c['flank']]
    reach = g['towerRange']
    g['padStandoff'] = [round(lines_dist(x, y, route), 1) for x, y in pads]
    g['padStandoffToFlank'] = [round(poly_dist(x, y, flank), 1) for x, y in pads]
    g['padsCoveringFlank'] = [i + 1 for i, d in enumerate(g['padStandoffToFlank']) if d <= reach]
    g['padsUnreachable'] = [i + 1 for i, d in enumerate(g['padStandoff']) if d > reach]
    g['padsUnreachableEvenWithFlank'] = [
        n for n in g['padsUnreachable'] if g['padStandoffToFlank'][n - 1] > reach]
    g['closestPadPair'] = round(closest_pair(pads), 1)
    # THE TWO ROUTES A WALKER CAN TAKE, which is what `passes` counts against:
    # the arms share the stem and the tail, so a pad beside the fork sees one
    # stretch of road on one route and two on the other.
    north = c['stem'] + c['north'] + c['tail'] + c['hook'] + c['door']
    south = c['stem'] + c['south'] + c['tail'] + c['hook'] + c['door']
    g['padsCoveringTwoPasses'] = passes_count([north, south], pads, reach)
    g['padsCoveringTwoPassesAtLegacyRange'] = passes_count(
        [north, south], pads, g['legacyTowerRange'])
    g['_pads'] = note(len(pads), ' THE ORDER CHANGED: plots.json sorts by x and the trace sorted '
                                 'by chip bounding box, so `padChips` and both `suggestedNode` maps '
                                 'are permuted to follow their own chip. Each pairing is proved by '
                                 'the plot landing inside that chip\'s box. The standoffs are '
                                 're-derived off the SIMPLIFIED centrelines this file ships rather '
                                 'than the full-resolution geodesic the trace used, so they can sit '
                                 'up to 0.7 px from a figure tools/trace_level9.py would print.')
    save(gpath, g, fmt)
    return True, (gpath, moved)


def apply_level10(plots, check):
    gpath = os.path.join(ROOT, 'tools/level10_geometry.json')
    g, fmt = load(gpath)
    if check:
        return tup(g['pads']) == tup(plots), gpath
    pads = tup(plots)
    line = [tuple(p) for p in g['centreline']]
    reach = g['towerRange']
    g['pads'] = [[int(x), int(y)] for x, y in pads]
    g['padStandoff'] = [round(poly_dist(x, y, line), 1) for x, y in pads]
    g['padsUnreachable'] = [i + 1 for i, d in enumerate(g['padStandoff']) if d > reach]
    g['closestPadPair'] = round(closest_pair(pads), 1)
    g['laneCoverage'] = round(coverage(line, pads, reach), 3)
    g['padsCoveringTwoPasses'] = passes_count([line], pads, reach)
    g['padsCoveringTwoPassesAtLegacyRange'] = passes_count([line], pads, g['legacyTowerRange'])
    g['_pads'] = note(len(pads))
    save(gpath, g, fmt)
    return True, gpath


PASS_GAP = 112   # tools/trace_level9.py's, which is LEGACY_TOWER_RANGE


def densify(pts, step=1.0):
    """A polyline as (x, y, length of the step that follows) at about 1 px."""
    out = []
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        d = math.hypot(bx - ax, by - ay)
        n = max(1, int(math.ceil(d / step)))
        for k in range(n):
            t = k / n
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t, d / n))
    out.append((pts[-1][0], pts[-1][1], 0.0))
    return out


def passes_count(routes, pads, reach, gap=PASS_GAP):
    """How many pads can shoot at two SEPARATE stretches of route.

    tools/trace_level9.py counts index gaps in a full-resolution geodesic,
    where one index is about one pixel. The geometry files ship the SIMPLIFIED
    line, so this walks arc length instead and compares that against the same
    112 px. Checked against level 10's stored 5-at-132 and 7-at-112 on the pads
    that produced them, and it reproduces both.
    """
    walks = []
    for line in routes:
        dens = densify([tuple(p) for p in line])
        marks, walked = [], 0.0
        for x, y, seg in dens:
            marks.append((walked, x, y))
            walked += seg
        walks.append(marks)
    n = 0
    for p in pads:
        best = 0
        for marks in walks:
            runs, last = [], None
            for w, x, y in marks:
                near = math.hypot(x - p[0], y - p[1]) <= reach
                if near and last is None:
                    last = w
                elif not near and last is not None:
                    runs.append((last, w)); last = None
            if last is not None:
                runs.append((last, marks[-1][0]))
            merged = []
            for a, b in runs:
                if merged and a - merged[-1][1] <= gap:
                    merged[-1] = (merged[-1][0], b)
                else:
                    merged.append((a, b))
            best = max(best, len(merged))
        if best >= 2:
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='verify the shipped files already carry plots.json')
    args = ap.parse_args()

    P = json.load(open(PLOTS))['plots']
    assert '6' not in P, 'level 6 is in plots.json; it is meant to keep its own eighteen pads'
    ok = True
    for lv in sorted((int(k) for k in P), key=int):
        plots = P[str(lv)]
        if lv in (1, 2):
            good, where = apply_map_only(lv, plots, args.check)
        elif lv in (3, 4):
            good, where = apply_geometry_and_map(lv, plots, 'pads', args.check)
        elif lv == 5:
            good, where = apply_geometry_and_map(lv, plots, 'buildSpots', args.check)
        elif lv == 7:
            good, where = apply_level7(plots, args.check)
        elif lv == 8:
            good, where = apply_level8(plots, args.check)
        elif lv == 9:
            good, where = apply_level9(plots, args.check)
        elif lv == 10:
            good, where = apply_level10(plots, args.check)
        else:
            raise SystemExit(f'level {lv} has no home in this script')
        if lv == 9 and not args.check:
            where, moved = where
            far = max(d for _, d in moved)
            print(f'  level 9: fifteen chips, reordered, moved {far:.2f} px at most')
        ok = ok and good
        print(f'level {lv:>2}: {len(plots):>2} plots -> '
              f'{where if isinstance(where, str) else where}  '
              f'{"ok" if good else "MISMATCH"}')

    if not args.check:
        for lv, script in BUILDERS.items():
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', script)],
                           check=True, stdout=subprocess.DEVNULL)
            print(f'rebuilt src/data/{MAPS[lv]}.json')
    else:
        # The map a builder would write RIGHT NOW, against the map in the tree.
        for lv, script in BUILDERS.items():
            path = os.path.join(ROOT, 'src/data', MAPS[lv] + '.json')
            before = open(path).read()
            subprocess.run([sys.executable, os.path.join(ROOT, 'tools', script)],
                           check=True, stdout=subprocess.DEVNULL)
            after = open(path).read()
            if before != after:
                open(path, 'w').write(before)
                print(f'level {lv:>2}: MAP IS NOT WHAT ITS BUILDER WRITES')
                ok = False
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
