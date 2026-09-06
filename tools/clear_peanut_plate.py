"""Erase the placeholder peanut painted into the peanuts counter plate.

    python3 tools/clear_peanut_plate.py            # writes the PNG, prints a map
    python3 tools/clear_peanut_plate.py --check    # map only, writes nothing

`public/assets/ui/hud_peanuts.webp` is a 232x96 pill with a plain white
OUTLINE peanut painted into its left end. That outline is a placeholder from
before the game had peanut art, and the HUD has been drawing the real painted
peanut ON TOP of it -- so the chip showed two peanuts, the white one poking
out from behind the brown one. Nothing in code drew the white one, which is
why deleting a draw call could not fix it: it is in the picture.

This flattens that end back to the plate's own field colour, so the plate is
a frame and an empty dark field and the ONLY peanut on the chip is the one
HudScene draws.

HOW THE FIELD IS FOUND, rather than typed in. The dark field is a single
uniform colour (17,19,21) and the plate's field is symmetric about its centre
column, so the field's left edge on a row is the mirror of its right edge --
and the right edge is clean, because the placeholder is only at the left. The
frame, its bevel and both chamfered corners are never written to.

The output is a PNG under tools/mapcards/out/. Converting it to the shipped
WebP is a separate, deliberate step:

    sh tools/towebp/run.sh 300 tools/mapcards/out/hud_peanuts_clean.png
    cp tools/mapcards/out/hud_peanuts_clean.webp public/assets/ui/hud_peanuts.webp

There is no PNG source for this plate in the repository -- art-source/ holds
only the enemies, nodes and props -- so the input is a decode of the shipped
WebP. tools/decode makes that:

    sh tools/decode/run.sh public/assets/ui/hud_peanuts.webp plate_peanuts.png
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import png

SRC = os.path.join(HERE, 'mapcards', 'out', 'plate_peanuts.png')
OUT = os.path.join(HERE, 'mapcards', 'out', 'hud_peanuts_clean.png')

# The field's own colour, read off a column the placeholder never touched.
FIELD = (17, 19, 21, 254)
# How far right the placeholder reaches, plus room. The number field starts at
# x=74, so nothing readable lives left of this.
ERASE_TO = 82


def main() -> None:
    w, h, d = png.read(SRC)

    def at(x, y):
        i = (y * w + x) * 4
        return tuple(d[i:i + 4])

    def put(x, y, rgba):
        i = (y * w + x) * 4
        d[i:i + 4] = bytes(rgba)

    def is_field(p):
        return (abs(p[0] - FIELD[0]) < 7 and abs(p[1] - FIELD[1]) < 7
                and abs(p[2] - FIELD[2]) < 7 and p[3] > 200)

    # The field's right edge per row: the last column of a six-long run of
    # field colour, scanned inward from the plate's right edge. Six rather
    # than one so a stray pixel in the frame's shading cannot be mistaken for
    # the field.
    rows = 0
    for y in range(h):
        right = None
        for x in range(w - 1, 5, -1):
            if all(is_field(at(x - k, y)) for k in range(6)):
                right = x
                break
        if right is None:
            continue
        # Mirror. The run-of-six lands a pixel short on the straight section,
        # where the true edge is one further out; on the chamfered corners it
        # lands a pixel long. Clamping at the straight edge takes both: the
        # corners keep their own value and the straight rows get the extra
        # column, which is the one the placeholder's shadow sits in.
        left = 231 - right
        if left <= 16:
            left = 15
        for x in range(left, ERASE_TO + 1):
            put(x, y, FIELD)
        rows += 1

    # WHAT IS LEFT. A pixel beside the field's edge that is neither the field
    # nor the frame's near-black inner border is placeholder that the mirror
    # was a pixel shy of. It is only ever the boundary column, and only where
    # the peanut ran into the frame.
    strays = 0
    for y in range(h):
        for x in range(12, 22):
            p = at(x, y)
            if is_field(p) or p[3] < 200:
                continue
            # Dark border, bevel grey: both are the frame and both stay.
            if max(p[0], p[1], p[2]) < 14 or min(p[0], p[1], p[2]) > 40:
                continue
            # Only if the field starts immediately to its right, which is what
            # says this pixel is inside the field rather than part of the edge.
            if is_field(at(x + 1, y)):
                put(x, y, FIELD)
                strays += 1

    print(f'cleared the field on {rows} rows, {strays} stray pixel(s) beside the edge')
    print(picture(w, h, d))
    if '--check' not in sys.argv:
        png.write(OUT, w, h, d)
        print(f'wrote {OUT}')


def picture(w, h, d) -> str:
    """The left end as text, so the result can be read without a browser."""
    out = []
    for y in range(0, h, 2):
        row = ''
        for x in range(0, 90):
            r, g, b, a = d[(y * w + x) * 4:(y * w + x) * 4 + 4]
            if a < 40:
                row += ' '
            elif abs(r - FIELD[0]) < 7 and abs(g - FIELD[1]) < 7 and abs(b - FIELD[2]) < 7:
                row += '.'
            elif r < 12 and g < 12 and b < 12:
                row += '0'
            elif r > 140:
                row += '#'
            else:
                row += 'o'
        out.append('%3d %s' % (y, row))
    return '\n'.join(out)


if __name__ == '__main__':
    main()
