"""A contact sheet of every panel a strip cuts into, for reading with an eye.

The cut columns are measured by `slice.py` and the numbers say where the
gutters are; they cannot say whether the picture on either side of one is a
whole panel. This draws the answer.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
import img, png, slice as S


def box(src, x0, x1, tw):
    """Columns x0..x1 of `src`, box-filtered down to `tw` wide."""
    w, h, px = img.read(src)
    cw = x1 - x0 + 1
    th = max(1, round(h * tw / cw))
    out = bytearray(tw * th * 4)
    for ty in range(th):
        sy0, sy1 = ty * h // th, max(ty * h // th + 1, (ty + 1) * h // th)
        for tx in range(tw):
            sx0 = x0 + tx * cw // tw
            sx1 = max(sx0 + 1, x0 + (tx + 1) * cw // tw)
            r = g = b = n = 0
            for sy in range(sy0, sy1):
                base = sy * w * 4
                for sx in range(sx0, sx1):
                    i = base + sx * 4
                    r += px[i]; g += px[i + 1]; b += px[i + 2]; n += 1
            o = (ty * tw + tx) * 4
            out[o] = r // n; out[o + 1] = g // n; out[o + 2] = b // n; out[o + 3] = 255
    return tw, th, out


def sheet(dest, tiles, cols, cell, pad=6):
    """Tiles laid out on a magenta ground, so a cut that took a sliver of the
    neighbouring panel shows up as a shape that does not reach its own edge."""
    rows = (len(tiles) + cols - 1) // cols
    ch = max(t[1] for t in tiles)
    W = cols * (cell + pad) + pad
    H = rows * (ch + pad) + pad
    out = bytearray(W * H * 4)
    for i in range(0, len(out), 4):
        out[i] = 255; out[i + 1] = 0; out[i + 2] = 255; out[i + 3] = 255
    for n, (tw, th, px) in enumerate(tiles):
        ox = pad + (n % cols) * (cell + pad)
        oy = pad + (n // cols) * (ch + pad)
        for y in range(th):
            a = (y * tw) * 4
            b = ((oy + y) * W + ox) * 4
            out[b:b + tw * 4] = px[a:a + tw * 4]
    png.write(dest, W, H, out)


if __name__ == '__main__':
    dest, cell = sys.argv[1], int(sys.argv[2])
    tiles = []
    for p in sys.argv[3:]:
        _, _, _, spans = S.cuts(p)
        for a, b in spans:
            tiles.append(box(p, a, b, cell))
        print('%-52s %d panels' % (p, len(spans)), flush=True)
    sheet(dest, tiles, 3, cell)
    print('wrote', dest)
