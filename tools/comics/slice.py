"""Finds the panel boundaries inside a comic strip, and cuts on them.

EVERY COMIC IN THIS REPOSITORY IS A STRIP. The twelve unwired files measured on
2026-09-16 are all three panels laid out left to right inside one image -- the
two 1672x941 pages, the seven 2172x724 pages and the one 3840x1280 page -- and
so is the shipped `cutscene_L9_01.webp`. A strip shown as one panel puts each
third at about 120 CSS pixels on a phone, which is not readable.

THE CUT LINES ARE MEASURED, NEVER DIVIDED. `comic_eliminated_positions` looks
like three 724-wide squares and is not: its panels are 742, 708 and 699 wide.
Dividing by three would have put a cut 23px inside the first panel's art.

HOW THE MEASUREMENT WORKS. A gutter is the only part of a comic page that is
the same colour all the way down, so each column is scored for VERTICAL
UNIFORMITY (max minus min over sampled rows). Runs of uniform columns separated
by a pixel or two of antialiasing are merged into one block; a block at least
`MIN_GUTTER` wide and not touching either edge is a gutter.

AND THE BLACK BORDER BELONGS TO THE PANEL, not to the gutter. A page here is
drawn `...art | black border | white gap | black border | art...` and all four
of those middle columns are uniform, so the block covers the borders too.
Inside the block, the dark run reachable from the left edge is the left panel's
own frame and the dark run reachable from the right edge is the right panel's;
what is left between them is the gutter proper and is discarded. A block that
is dark all the way across -- some pages have no white gap at all -- is split
down its middle instead, because there is no other information in it.
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import png

# A column counts as uniform if the sampled rows span less than this. Set
# above pure noise and well below any column that has art in it.
UNIFORM = 35
# Two uniform runs this close together are one block; the gap is antialiasing
# between a border and the gap beside it.
BRIDGE = 4
# Narrower than this is a line in the art, not a gutter.
MIN_GUTTER = 8
# A column this dark is border rather than gutter.
DARK = 60
# AND A COLUMN THIS DARK COUNTS AS GUTTER MATERIAL WHATEVER ITS VARIANCE.
# Uniformity alone is not enough: on `comic_l3_unicorn_boss` the black frame
# either side of the gap has art bleeding through a few rows of it, so it
# scores a range of 80 and the block came back seven pixels wide -- under
# MIN_GUTTER -- and the page measured as one panel. A column whose mean is
# this low has no picture in it however those few rows scatter.
INK = 30
# An outer frame is never thicker than this, so a uniform run that starts
# within it is the page's own edge rather than a gutter between panels.
EDGE = 32
# Every Nth row. Sampling is what makes this cheap enough to run on a 3840px
# page; a gutter is uniform at every row, so every third is plenty.
STEP = 3


def columns(path):
    """(width, height, [(mean, range)] per column)."""
    w, h, px = png.read(path)
    out = []
    ys = range(0, h, STEP)
    n = len(ys)
    for x in range(w):
        tot = 0
        lo, hi = 255, 0
        for y in ys:
            i = (y * w + x) * 4
            v = (px[i] + px[i + 1] + px[i + 2]) // 3
            tot += v
            if v < lo: lo = v
            if v > hi: hi = v
        out.append((tot / n, hi - lo))
    return w, h, out


def blocks(w, cols):
    """The uniform blocks, merged across short antialiased gaps."""
    runs = []
    for x, (mean, rng) in enumerate(cols):
        if rng >= UNIFORM and mean >= INK:
            continue
        if runs and x - runs[-1][1] <= BRIDGE + 1:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    return [(a, b) for a, b in runs
            if b - a + 1 >= MIN_GUTTER and a > EDGE and b < w - 1 - EDGE]


def cuts(path):
    """Panel spans as [(x0, x1_inclusive)], measured.

    Also returns the gutter blocks it found, so a caller can print what the
    decision was made on rather than only the decision.
    """
    w, h, cols = columns(path)
    gutters = blocks(w, cols)
    dark = [m < DARK for m, _ in cols]
    spans, start = [], 0
    for b0, b1 in gutters:
        # The left panel's own black frame, walked in from the block's left.
        end = b0 - 1
        while end + 1 <= b1 and dark[end + 1]:
            end += 1
        # And the right panel's, walked in from the block's right.
        nxt = b1 + 1
        while nxt - 1 >= b0 and dark[nxt - 1]:
            nxt -= 1
        if end >= nxt:
            # Dark the whole way across: no gutter to discard, so split it.
            end = (b0 + b1) // 2
            nxt = end + 1
        spans.append((start, end))
        start = nxt
    spans.append((start, w - 1))
    return w, h, gutters, spans


def cut(src, dest, x0, x1):
    """Writes columns x0..x1 inclusive of `src` to `dest` as a PNG."""
    w, h, px = png.read(src)
    cw = x1 - x0 + 1
    out = bytearray(cw * h * 4)
    for y in range(h):
        a = (y * w + x0) * 4
        out[y * cw * 4:(y + 1) * cw * 4] = px[a:a + cw * 4]
    png.write(dest, cw, h, out)


if __name__ == '__main__':
    for p in sys.argv[1:]:
        w, h, gutters, spans = cuts(p)
        print('%-52s %dx%d' % (p, w, h))
        print('   gutters %s' % (gutters,))
        print('   panels  %s' % (
            ['%d..%d (%dx%d)' % (a, b, b - a + 1, h) for a, b in spans],))
