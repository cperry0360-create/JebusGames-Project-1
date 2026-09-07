#!/usr/bin/env python3
"""
stitch_lanes.py - build a long tower-defense level plate from rendered road
segments, for levels with ONE or TWO parallel lanes, and export each lane as
normalized enemy waypoints.

Written for Courjahan Defense (JebusGames). Supersedes stitch_level.py, which
only handled a single lane.

WHAT IT DOES
------------
1. Traces every lane in every segment. Two-lane tracing is a joint dynamic
   program over (upper, lower) candidate pairs with a minimum-separation
   constraint, so the tracer cannot hop between lanes or collapse them
   together. Bands whose thickness is not road-like are ignored, which keeps
   white blocks, paved plazas and billboards out of the path.
2. Spike removal: anything more than ~9px off a heavily smoothed baseline is
   dropped and interpolated, which cleans up the places where a prop sits on
   the road and merges with it.
3. Chains segments by MATCHING LANE CROSS-SECTIONS rather than by butting
   panel edges together. For each candidate next segment it scans every
   column for the one whose lane positions, spacing and slopes best match the
   current segment's exit, then starts that segment there. A uniform vertical
   shift absorbs the rest. The residual it cannot absorb is reported per join.
4. Grows the canvas instead of cropping, and fills the exposed strips with a
   cleaned sky / sand row rather than smearing whatever prop happened to sit
   on the edge row.

USAGE
-----
    python3 stitch_lanes.py --dir segments/ --lanes 2 --target 3300
    python3 stitch_lanes.py --dir segments/ --lanes 1 --target 2500 --scale 3
    python3 stitch_lanes.py --sheet sheet.png --grid 3x2 --lanes 2

Outputs <out>.png, <out>_path.json and <out>_paths_preview.png.

RENDER RULES for new segments - all three matter:

  "The dirt road enters the LEFT edge at exactly 32% of the image height and
   exits the RIGHT edge at exactly 32%, both running horizontally. A second
   dirt road enters the LEFT edge at exactly 72% and exits the RIGHT edge at
   exactly 72%, also horizontal. Both roads keep the same width at both
   edges and never touch each other. Leave at least 12% of the image height
   as open ground below the lower road. Between the edges both roads may
   curve freely. Do not draw any panel labels, borders, captions or text."

  - Pinning BOTH edges is what makes segments chain in any order.
  - Pinning both lanes is what stops them converging across the segment.
  - The ground margin below the lower road is what gives you buildable tower
    ground and stops the road running off the frame.
  - One segment per render. A six-panel contact sheet spends a sixth of the
    pixels on each panel.
"""

import argparse, json, os, sys
import numpy as np
from PIL import Image

TH_MIN, TH_MAX = 22, 62      # plausible road band thickness, in px, at ~312px tall
MIN_GAP = 70                 # minimum separation between two lanes, px


# ------------------------------------------------------------------ tracing

def road_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    rb = r - b
    stone = (rb < 25) & (np.abs(r - g) < 25) & (r > 150) & (r < 235)
    dirt = (rb > 62) & (r > 130)
    return stone | dirt


def bands(m, x, th):
    idx = np.flatnonzero(m[:, x])
    if idx.size == 0:
        return []
    runs, cur = [], [idx[0]]
    for v in idx[1:]:
        if v - cur[-1] <= 3:
            cur.append(v)
        else:
            runs.append(cur)
            cur = [v]
    runs.append(cur)
    return [float(np.mean(r)) for r in runs if th[0] <= len(r) <= th[1]]


def _dp(live, W, keyfn, costfn):
    tables, prev = [], None
    for x, cs in live:
        if prev is None:
            cur = {c: (0.0, None) for c in cs}
        else:
            cur = {c: min((prev[p][0] + costfn(c, p), p) for p in prev) for c in cs}
        tables.append(cur)
        prev = cur
    picks = np.full((W, keyfn), np.nan)
    best = min(tables[-1], key=lambda k: tables[-1][k][0])
    picks[live[-1][0]] = best
    for j in range(len(live) - 1, 0, -1):
        best = tables[j][best][1]
        picks[live[j - 1][0]] = best
    return picks


def smooth(a, k):
    k |= 1
    return np.convolve(np.pad(a, (k // 2, k // 2), mode="edge"), np.ones(k) / k, mode="valid")


def despike(a, tol=9.0, rounds=3):
    a = a.copy()
    for _ in range(rounds):
        base = smooth(a, 81)
        bad = np.abs(a - base) > tol
        if not bad.any():
            break
        good = ~bad
        if good.sum() < 20:
            break
        a = np.interp(np.arange(len(a)), np.flatnonzero(good), a[good])
    return smooth(a, 21)


def trace(rgb, lanes):
    """Return a list of `lanes` centreline arrays, top-most first."""
    m = road_mask(rgb)
    H, W = m.shape
    th = (int(TH_MIN * H / 312), int(TH_MAX * H / 312))
    gap = MIN_GAP * H / 312

    if lanes == 1:
        live = [(x, bands(m, x, th)) for x in range(W)]
        live = [(x, c) for x, c in live if c]
        picks = _dp(live, W, 1, lambda c, p: abs(c - p))
        arr = picks[:, 0]
    else:
        live = []
        for x in range(W):
            c = bands(m, x, th)
            pairs = [(u, l) for i, u in enumerate(c) for l in c[i + 1:] if l - u >= gap]
            if pairs:
                live.append((x, pairs))
        if not live:
            raise RuntimeError("could not find two separated lanes in this segment")
        picks = _dp(live, W, 2, lambda c, p: abs(c[0] - p[0]) + abs(c[1] - p[1]))
        arr = picks

    out = []
    cols = [arr] if lanes == 1 else [arr[:, 0], arr[:, 1]]
    for a in cols:
        g = ~np.isnan(a)
        a = np.interp(np.arange(W), np.flatnonzero(g), a[g])
        out.append(despike(a))
    return out


# ------------------------------------------------------------------ chaining

def slope(a, x, h=6):
    return (a[min(x + h, len(a) - 1)] - a[max(x - h, 0)]) / (2 * h)


def busyness(rgb, x, half=190):
    w = rgb[:, max(0, x - half): x + half].mean(axis=2)
    return float(np.abs(np.diff(w, axis=1)).mean() + np.abs(np.diff(w, axis=0)).mean())


def chain(imgs, lns, target, minseg, allow_mirror=True, step=3,
          max_resid=5.0, max_slope=0.30):
    """Greedy-over-permutations: use each segment once, best order and offsets."""
    import itertools
    n = len(imgs)
    W0 = imgs[0].shape[1]

    def view(i, mir):
        if not mir:
            return imgs[i], lns[i]
        return imgs[i][:, ::-1, :], [a[::-1] for a in lns[i]]

    best = None
    mirror_opts = list(itertools.product([False, True], repeat=n)) if allow_mirror else [(False,) * n]
    for order in itertools.permutations(range(n)):
        for mirs in mirror_opts:
            segs = [(order[0], 0, W0, mirs[0])]
            _, cl = view(order[0], mirs[0])
            cur = ([a[-4] for a in cl], [slope(a, W0 - 4) for a in cl])
            shifts, total, resids, ok = [0], W0, [], True
            for k in range(1, n):
                i, mir = order[k], mirs[k]
                _, c2 = view(i, mir)
                pick = None
                for xs in range(0, W0 - minseg, step):
                    d = [cur[0][j] - c2[j][xs] for j in range(len(c2))]
                    resid = (max(d) - min(d)) / 2
                    if resid > max_resid:
                        continue
                    sm = sum(abs(cur[1][j] - slope(c2[j], xs)) for j in range(len(c2)))
                    if sm > max_slope:
                        continue
                    sc = resid + 16 * sm + 0.05 * busyness(imgs[i], xs)
                    if pick is None or sc < pick[0]:
                        pick = (sc, xs, resid, sm)
                if pick is None:
                    ok = False
                    break
                _, xs, resid, sm = pick
                d = [cur[0][j] - c2[j][xs] for j in range(len(c2))]
                shifts.append(shifts[-1] + int(round(sum(d) / len(d))))
                segs.append((i, xs, W0, mir))
                resids.append((resid, sm))
                cur = ([a[-4] for a in c2], [slope(a, W0 - 4) for a in c2])
                total += W0 - xs
            if not ok:
                continue
            drift = max(shifts) - min(shifts)
            score = drift + abs(total - target) * 0.01 + 2 * sum(r for r, _ in resids)
            if best is None or score < best[0]:
                best = (score, segs, shifts, total, drift, resids)
    if best is None:
        raise RuntimeError("no chain found; loosen --max-resid or check the traces")
    return best[1:]


# ------------------------------------------------------------------ render

def clean_edge(row, kind):
    r, b = row[:, 0], row[:, 2]
    ok = (b > r + 25) & (b > 150) if kind == "sky" else (r > 170) & (r - b > 18) & (r - b < 80)
    if ok.sum() < 20:
        return np.tile(np.median(row, axis=0), (len(row), 1))
    idx = np.flatnonzero(ok)
    bad = np.flatnonzero(~ok)
    out = row.copy()
    if bad.size:
        out[bad] = row[idx[np.abs(idx[None, :] - bad[:, None]).argmin(axis=1)]]
    return out


def render(imgs, lns, segs, shifts, feather=32):
    H0, W0 = imgs[0].shape[:2]
    def view(i, mir):
        if not mir:
            return imgs[i], lns[i]
        return imgs[i][:, ::-1, :], [a[::-1] for a in lns[i]]
    lo = min(shifts)
    H = H0 + max(shifts) - lo
    Wt = sum(x1 - x0 for _, x0, x1, _ in segs)
    out = np.zeros((H, Wt, 3), np.float32)
    paths = [np.zeros(Wt) for _ in lns[0]]
    x, seams = 0, []
    for (i, x0, x1, mir), sh in zip(segs, shifts):
        img, cl = view(i, mir)
        q = img[:, x0:x1]
        w = q.shape[1]
        y = sh - lo
        col = np.zeros((H, w, 3), np.float32)
        col[y:y + H0] = q
        if y > 0:
            col[:y] = clean_edge(q[0], "sky")
        if y + H0 < H:
            col[y + H0:] = clean_edge(q[-1], "sand")
        if x > 0:
            g = np.linspace(0, 1, feather).reshape(1, feather, 1)
            out[:, x - feather:x] = out[:, x - feather:x] * (1 - g) + col[:, :feather] * g
            seams.append(x)
        out[:, x:x + w] = col
        for j, a in enumerate(cl):
            paths[j][x:x + w] = a[x0:x1] + y
        x += w
    return np.clip(out, 0, 255).astype(np.uint8), paths, seams


# ------------------------------------------------------------------ io

def load_dir(path):
    files = sorted(f for f in os.listdir(path)
                   if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
    if not files:
        raise SystemExit(f"no images in {path}")
    ims = [np.asarray(Image.open(os.path.join(path, f)).convert("RGB")).astype(np.float32)
           for f in files]
    H = min(i.shape[0] for i in ims)
    W = max(i.shape[1] for i in ims)
    ims = [np.asarray(Image.fromarray(i.astype(np.uint8)).resize((W, H), Image.LANCZOS)).astype(np.float32)
           for i in ims]
    return ims, files


def load_sheet(path, grid):
    cols, rows = (int(v) for v in grid.lower().split("x"))
    a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    H, W = a.shape[:2]
    ch, cw = H // rows, W // cols
    return [a[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw].copy()
            for r in range(rows) for c in range(cols)], \
           [f"cell_r{r+1}c{c+1}" for r in range(rows) for c in range(cols)]


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--dir")
    src.add_argument("--sheet")
    ap.add_argument("--grid", default="2x3", help="COLSxROWS when using --sheet")
    ap.add_argument("--lanes", type=int, default=2, choices=(1, 2))
    ap.add_argument("--target", type=int, default=3300, help="desired plate width in px")
    ap.add_argument("--minseg", type=int, default=460)
    ap.add_argument("--no-mirror", action="store_true")
    ap.add_argument("--max-resid", type=float, default=5.0)
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--out", default="level")
    a = ap.parse_args()

    imgs, names = (load_dir(a.dir) if a.dir else load_sheet(a.sheet, a.grid))
    print(f"{len(imgs)} segments: {', '.join(names)}")

    lns = []
    for im, nm in zip(imgs, names):
        cl = trace(im, a.lanes)
        lns.append(cl)
        if a.lanes == 2:
            u, l = cl
            print(f"  {nm}: gap {int((l-u).min())}-{int((l-u).max())}px, "
                  f"in ({u[3]:.0f},{l[3]:.0f}) out ({u[-4]:.0f},{l[-4]:.0f})")
        else:
            print(f"  {nm}: in {cl[0][3]:.0f} out {cl[0][-4]:.0f}")

    segs, shifts, total, drift, resids = chain(
        imgs, lns, a.target, a.minseg, allow_mirror=not a.no_mirror, max_resid=a.max_resid)
    print(f"chain: {total}px wide, vertical excursion {drift}px")
    for k, ((i, x0, x1, mir), sh) in enumerate(zip(segs, shifts)):
        extra = "" if k == 0 else "  residual %.1fpx slope %.3f" % resids[k - 1]
        print(f"  {names[i]}{' mirrored' if mir else ''} x{x0}-{x1} "
              f"(w={x1-x0}) offset {sh:+d}px{extra}")

    plate, paths, seams = render(imgs, lns, segs, shifts)
    H, W = plate.shape[:2]
    im = Image.fromarray(plate)
    if a.scale != 1.0:
        im = im.resize((int(W * a.scale), int(H * a.scale)), Image.LANCZOS)
    im.save(f"{a.out}.png")

    step = max(1, W // 240)
    mk = lambda arr: [[round(x / W, 5), round(float(arr[x]) / H, 5)] for x in range(0, W, step)] \
                     + [[1.0, round(float(arr[-1]) / H, 5)]]
    doc = {"plate_px": {"w": im.width, "h": im.height}, "lanes": a.lanes,
           "segments": [f"{names[i]}{' mirrored' if m else ''} x{x0}-{x1}" for i, x0, x1, m in segs],
           "seams_px": seams,
           "note": "waypoints normalized 0-1 of plate size"}
    if a.lanes == 2:
        doc["lane_upper"], doc["lane_lower"] = mk(paths[0]), mk(paths[1])
        doc["lane_gap_px"] = [int((paths[1] - paths[0]).min()), int((paths[1] - paths[0]).max())]
        doc["clearance_below_lower_lane_px"] = int(H - 1 - paths[1].max())
    else:
        doc["lane"] = mk(paths[0])
    json.dump(doc, open(f"{a.out}_path.json", "w"), indent=1)

    ov = plate.astype(float).copy()
    for arr, c in zip(paths, [(255, 60, 60), (60, 120, 255)]):
        for x in range(W):
            y = int(round(arr[x]))
            ov[max(0, y - 1):y + 2, x] = c
    Image.fromarray(np.clip(ov, 0, 255).astype(np.uint8)).save(f"{a.out}_paths_preview.png")
    print(f"wrote {a.out}.png ({im.width}x{im.height}), {a.out}_path.json, "
          f"{a.out}_paths_preview.png")


if __name__ == "__main__":
    sys.exit(main())
