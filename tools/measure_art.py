"""Measure the painted art and print the manifest values it implies.

Run from the repository root:

    python3 tools/measure_art.py

Nothing at runtime reads this. It is the record of where the anchor,
displayHeight and shadowWidth numbers in art.json came from, so they can be
re-derived rather than re-guessed when art changes.

One caveat after a re-export. `anchorX`, `contentWidth` and `contentHeight`
are read off the source pixels and must be copied into art.json every time
the art changes size. `displayHeight` and `shadowWidth` are ON-SCREEN figures
and already shipped; recomputing them from a re-exported file reproduces them
only to within that file's own rounding — the gnomes came back 0.4px taller
purely because 300 does not halve twice evenly. Where the difference is under
a percent, keep what is in art.json. It is the size the game was tuned at.
"""

import sys, glob, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png

ALPHA = 16
# All six are drawn at one consistent scale inside a 512-tall frame, so a
# uniform scale preserves their intended sizes relative to each other. The
# scale is set from the *median* stone base rather than the widest, so one
# unusually thin or wide tower cannot drag the whole set.
#
# A tower's stone base is 1.2x the painted road's width. The road measures
# 61px on the 1280px canvas, so that is 73px.
MEDIAN_BASE_ON_SCREEN = 73.0

KEY = {
    # Tier 1 is the Withholding Tower's base sprite; t2 and t3 are measured
    # separately and are not part of the six-tower scale.
    'tower_withholding_t1.png': 'turret-ledger',
    'tower_writeoff.png':    'turret-writeoff',
    'tower_rounding.png':    'turret-rounding',
    'tower_escalation.png':  'turret-escalation',
    'tower_filing.png':      'turret-extension',
    'tower_tax.png':         'turret-shelter',
}

def base_width(path):
    """The stone base: the widest opaque row in the bottom third of the art."""
    w, h, px = png.read(path)
    spans = []
    for y in range(h):
        lo, hi, b = w, -1, y * w * 4
        for x in range(w):
            if px[b + x * 4 + 3] > ALPHA:
                if x < lo: lo = x
                if x > hi: hi = x
        spans.append((lo, hi) if hi >= 0 else None)
    ys = [y for y, sp in enumerate(spans) if sp]
    top, bot = ys[0], ys[-1]
    lo_y = top + int((bot - top + 1) * 0.66)
    row = max(range(lo_y, bot + 1), key=lambda y: (spans[y][1] - spans[y][0]) if spans[y] else -1)
    return spans[row][1] - spans[row][0] + 1


# First pass: the median base across the set sets the scale for all six.
# Exactly the six towers in KEY, and no more.
#
# The scale is set from the median base across the set, so what is IN the set
# matters. Tier art is three sizes of one tower: letting t2 and t3 in would
# drag the whole board's scale toward whichever tower happened to get tier art
# first, and dropping the tower entirely because its file was renamed would do
# the same in the other direction. Tier 1 stands for its tower.
tower_art = [f'public/assets/towers/{n}' for n in sorted(KEY)]
bases = sorted(base_width(f) for f in tower_art)
median = bases[len(bases) // 2]
SCALE = MEDIAN_BASE_ON_SCREEN / median
print(f'bases at source scale: {bases}')
print(f'median {median}px -> uniform scale {SCALE:.4f} '
      f'(on-screen bases {[round(b * SCALE, 1) for b in bases]})\n')

rows_out, files, render = [], {}, {}
for f in tower_art:
    name = os.path.basename(f)
    w, h, px = png.read(f)
    spans = []
    for y in range(h):
        lo, hi, b = w, -1, y * w * 4
        for x in range(w):
            if px[b + x * 4 + 3] > ALPHA:
                if x < lo: lo = x
                if x > hi: hi = x
        spans.append((lo, hi) if hi >= 0 else None)

    ys = [y for y, s in enumerate(spans) if s]
    top, bot = ys[0], ys[-1]
    contentH = bot - top + 1
    # The artwork's own bounds, which is not the base row: half these canvases
    # carry transparent padding, and two are widest well above the base.
    contentL = min(s[0] for s in spans if s)
    contentR = max(s[1] for s in spans if s)
    contentW = contentR - contentL + 1

    # The base ellipse: widest opaque row in the bottom third of the artwork.
    lo_y = top + int(contentH * 0.66)
    baseRow = max(range(lo_y, bot + 1), key=lambda y: (spans[y][1] - spans[y][0]) if spans[y] else -1)
    bl, bh = spans[baseRow]
    baseW = bh - bl + 1
    baseCx = (bl + bh) / 2.0

    scale = SCALE
    # Phaser sizes the whole texture, padding included.
    displayHeight = round(h * scale, 1)
    shadowWidth = round(baseW * scale, 1)
    # Anchor on the base's centre and the artwork's bottom, not the canvas.
    anchorX = round(baseCx / w, 4)
    anchorY = round((bot + 1) / h, 4)

    key = KEY[name]
    files[key] = f'towers/{name}'
    render[key] = {'anchorX': anchorX, 'anchorY': anchorY,
                   'displayHeight': displayHeight, 'shadowWidth': shadowWidth,
                   # Recorded so an icon can be fitted to a box from the
                   # manifest alone, without loading the image to measure it.
                   'contentWidth': contentW, 'contentHeight': contentH}
    rows_out.append((name, key, f'{w}x{h}', f'{contentW}x{contentH}', baseRow,
                     baseW, round(scale, 4), displayHeight,
                     round(contentH * scale, 1), shadowWidth, anchorX, anchorY))

print(f"{'file':22s} {'canvas':9s} {'content':9s} {'baseRow':>7s} {'baseW':>6s} "
      f"{'scale':>7s} {'dispH':>7s} {'onscrH':>7s} {'shadW':>6s} {'aX':>6s} {'aY':>6s}")
for r in rows_out:
    print(f"{r[0]:22s} {r[2]:9s} {r[3]:9s} {r[4]:7d} {r[5]:6d} {r[6]:7.4f} "
          f"{r[7]:7.1f} {r[8]:7.1f} {r[9]:6.1f} {r[10]:6.4f} {r[11]:6.4f}")
json.dump({'files': files, 'render': render}, open('/tmp/towerpatch.json', 'w'), indent=2)


# ---------------------------------------------------------------- enemies

# The three enemies are 3/4 characters, already drawn to one scale relative to
# each other with the brute the tallest, so one uniform scale preserves the
# artist's proportions. It is set so the brute stands a little shorter than a
# tower (72.8px), which is what a big enemy beside a building should do.
#
# The scale divisor is READ FROM THE ART, not written down here. The character
# set has been re-exported once already, from roughly 5x its render size down
# to 2x, and a hardcoded source height silently rescales the whole cast the
# next time that happens.
BRUTE_ON_SCREEN = 66.0
BRUTE_SOURCE = 'public/assets/enemies/enemy_brute.png'

ENEMY_KEY = {
    'enemy_brute.png':           ('enemy-notice',   0.90),
    'enemy_soldier.png':         ('enemy-filer',    0.87),
    'enemy_scout.png':           ('enemy-shredder', 0.84),
    'enemy_boss_politician.png': ('enemy-politician', 0.80),
}
# The second value is where the foot band starts, as a fraction of the sprite's
# height. It cannot be one number for all three: the brute's leaf blower hangs
# to within 10% of his ground line while the scout's trailing skate is 13%
# above hers, so any single depth cut either swallows the blower or loses a
# foot. Each value is the deepest cut that still catches both feet, read off
# the ground silhouette this script prints below.


def ground_silhouette(w, h, px):
    """Lowest opaque pixel in each column — where the art meets the ground."""
    low = [-1] * w
    for x in range(w):
        for y in range(h - 1, -1, -1):
            if px[(y * w + x) * 4 + 3] > ALPHA:
                low[x] = y
                break
    return low


def foot_groups(low, cut):
    """Runs of columns that touch the ground below `cut`. Feet, and only feet,
    once the cut is below whatever the character is carrying."""
    groups, start = [], None
    for x, y in enumerate(low + [-1]):
        deep = y >= cut
        if deep and start is None:
            start = x
        elif not deep and start is not None:
            groups.append((start, x - 1))
            start = None
    return groups


print('\n\nenemies')
efiles, erender = {}, {}
brute_source_h = png.read(BRUTE_SOURCE)[1]
escale = BRUTE_ON_SCREEN / brute_source_h
print(f'uniform scale {escale:.4f} (brute {brute_source_h}px -> {BRUTE_ON_SCREEN}px on screen)\n')
for f in sorted(glob.glob('public/assets/enemies/enemy_*.png')):
    name = os.path.basename(f)
    key, band = ENEMY_KEY[name]
    w, h, px = png.read(f)
    low = ground_silhouette(w, h, px)
    bot = max(low)
    groups = foot_groups(low, int(h * band))
    lo = min(g[0] for g in groups)
    hi = max(g[1] for g in groups)
    footW = hi - lo + 1
    footCx = (lo + hi) / 2.0

    efiles[key] = f'enemies/{name}'
    erender[key] = {
        'anchorX': round(footCx / w, 4),
        'anchorY': round((bot + 1) / h, 4),
        'displayHeight': round(h * escale, 1),
        'shadowWidth': round(footW * escale, 1),
        # All three are trimmed, so content is the canvas. Recording it anyway
        # lets anything that needs the on-screen width work it out from the
        # manifest instead of loading the image.
        'contentWidth': w,
        'contentHeight': h,
    }
    print(f'{name:20s} {w}x{h}  cut y{int(h*band):4d}  feet {groups}')
    print(f'{"":20s} -> {key}: footprint x{lo}-{hi} ({footW}px), '
          f'on screen {round(w*escale,1)}x{round(h*escale,1)}, '
          f'anchorX {erender[key]["anchorX"]}, shadowWidth {erender[key]["shadowWidth"]}')
json.dump({'files': efiles, 'render': erender}, open('/tmp/enemypatch.json', 'w'), indent=2)


# ------------------------------------------------------------------- hero

# Cory is drawn at the same scale as the enemies, so he reuses their factor
# rather than getting one of his own. His Last Stand form is a vehicle and is
# sized by WIDTH instead: it is meant to be wider than the road it drives over,
# and matching its height to his would make it a toy.
ULTIMATE_WIDTH_MULTIPLE = 2.2

HERO_KEY = {
    'hero_cory.png':          ('hero-cory', 0.80, None),
    'hero_cory_ultimate.png': ('hero-cory-ultimate', 0.82, 'body'),
}
# The Politician is an entourage, not a figure: two aides trail him carrying
# the briefcase. His band reaches high enough to catch their feet too, so the
# group is anchored and shadowed as one unit and walks the lane together.
#
# As with the enemies, the second value is where the foot band starts. Cory
# stands in a wide lunge, so the cut has to reach up past his trailing shoe.
#
# The third is a footprint rule. The vehicle needs one, and not the one you
# would guess: sized to its wheelbase the shadow is invisible, because unlike
# a pair of legs the body overhangs the contact patches and covers it whole.
# A vehicle's shadow is cast by its body anyway, so 'body' spans the full
# artwork and the shadow reads at the front and rear where it should.


def footprint(w, h, px, band, rule):
    """Where the art stands, and how wide a shadow it casts.

    They are the same span for a person and different for a vehicle: it stands
    on its wheels but shadows under its whole body.
    """
    low = ground_silhouette(w, h, px)
    deepest = foot_groups(low, int(h * 0.94))
    groups = foot_groups(low, int(h * band))
    lo = min(g[0] for g in groups)
    hi = max(g[1] for g in groups)
    if rule == 'body':
        # The ram hangs below the axle line ahead of the front wheel, so the
        # stance runs from the front wheel to the rear one.
        lo = min(g[0] for g in deepest)
    stand = (lo, hi)
    shadow = (0, w - 1) if rule == 'body' else stand
    return stand, shadow, groups


print('\n\nhero')
hfiles, hrender = {}, {}
bw, bh, bpx = png.read('public/assets/hero/hero_cory.png')
base_on_screen_w = bw * escale
print(f'base hero: {bw}x{bh} -> {round(bw * escale, 1)}x{round(bh * escale, 1)} at the enemy scale {escale:.4f}')

for name in ('hero_cory.png', 'hero_cory_ultimate.png'):
    key, band, rule = HERO_KEY[name]
    path = f'public/assets/hero/{name}'
    w, h, px = png.read(path)
    (lo, hi), (slo, shi), groups = footprint(w, h, px, band, rule)
    scale = escale if name == 'hero_cory.png' else (base_on_screen_w * ULTIMATE_WIDTH_MULTIPLE) / w
    bot = max(ground_silhouette(w, h, px))

    hfiles[key] = f'hero/{name}'
    hrender[key] = {
        'anchorX': round(((lo + hi) / 2) / w, 4),
        'anchorY': round((bot + 1) / h, 4),
        'displayHeight': round(h * scale, 1),
        'shadowWidth': round((shi - slo + 1) * scale, 1),
        'contentWidth': w,
        'contentHeight': h,
    }
    print(f'{name:24s} {w}x{h} cut y{int(h * band)} groups {groups}')
    print(f'{"":24s} -> {key}: stands x{lo}-{hi}, shadow x{slo}-{shi}, scale {scale:.4f}, '
          f'on screen {round(w * scale, 1)}x{round(h * scale, 1)}, {hrender[key]}')
json.dump({'files': hfiles, 'render': hrender}, open('/tmp/heropatch.json', 'w'), indent=2)


# -------------------------------------------------------------- HUD plates

# Each counter plate carries its own icon on the left and an empty dark field
# on the right for the number. Where that field starts differs per plate, so it
# is measured rather than guessed, and recorded as a fraction of the plate so
# the HUD can place its text at any size.

def dark_field(w, h, px):
    """The empty area to the right of the plate's icon."""
    y0, y1 = int(h * 0.28), int(h * 0.72)

    def is_dark(x):
        for y in range(y0, y1):
            i = (y * w + x) * 4
            if px[i + 3] > ALPHA and (px[i] > 60 or px[i + 1] > 60 or px[i + 2] > 60):
                return False
        return True

    best, run = (0, 0), None
    for x in range(w + 1):
        d = x < w and is_dark(x)
        if d and run is None:
            run = x
        elif not d and run is not None:
            if x - run > best[1] - best[0]:
                best = (run, x)
            run = None
    left, right = best
    mid = (left + right) // 2
    ys = [y for y in range(h)
          if px[(y * w + mid) * 4 + 3] > ALPHA and max(px[(y * w + mid) * 4:(y * w + mid) * 4 + 3]) < 60]
    return left, right, ys[0], ys[-1]


print('\n\nHUD plates')
pfiles, prender = {}, {}
for name in ('peanuts', 'lives', 'wave'):
    path = f'public/assets/ui/hud_{name}.png'
    w, h, px = png.read(path)
    left, right, top, bot = dark_field(w, h, px)
    key = f'hud-{name}'
    pfiles[key] = f'ui/hud_{name}.png'
    prender[key] = {
        'contentWidth': w,
        'contentHeight': h,
        # Fractions of the plate, so the HUD places its number at any size.
        'fieldLeft': round(left / w, 4),
        'fieldRight': round(right / w, 4),
        'fieldCentreY': round(((top + bot) / 2) / h, 4),
    }
    print(f'  {key}: {w}x{h}, field x{left}-{right - 1} y{top}-{bot} -> {prender[key]}')
json.dump({'files': pfiles, 'render': prender}, open('/tmp/hudpatch.json', 'w'), indent=2)


# ------------------------------------------------------------ button plates

# The arcade plates are metal frames with detailed end caps and a plain
# stretchable middle. Drawing one at an arbitrary size means slicing it, so the
# caps keep their proportions and only the middle grows. Where the caps end is
# measured by walking out from the centre column (or row) until the pixels stop
# matching it — the plain middle is uniform by construction, so the first
# column that differs is where the cap detail begins.

SLICE_TOL = 6.0


def _col(w, px, x, y0, y1):
    return [px[(y * w + x) * 4 + c] for y in range(y0, y1 + 1) for c in range(4)]


def _row(w, px, y, x0, x1):
    return list(px[(y * w + x0) * 4:(y * w + x1 + 1) * 4])


def _differs(a, b):
    return sum(abs(p - q) for p, q in zip(a, b)) / len(a) >= SLICE_TOL


def slice_insets(w, h, px):
    """(left, right, top, bottom) cap sizes in source pixels."""
    xc, yc = w // 2, h // 2
    cref = _col(w, px, xc, 0, h - 1)
    left = xc
    while left > 0 and not _differs(_col(w, px, left - 1, 0, h - 1), cref):
        left -= 1
    right = xc
    while right < w - 1 and not _differs(_col(w, px, right + 1, 0, h - 1), cref):
        right += 1
    rref = _row(w, px, yc, 0, w - 1)
    top = yc
    while top > 0 and not _differs(_row(w, px, top - 1, 0, w - 1), rref):
        top -= 1
    bot = yc
    while bot < h - 1 and not _differs(_row(w, px, bot + 1, 0, w - 1), rref):
        bot += 1
    return left, (w - 1) - right, top, (h - 1) - bot


print('\n\nButton plates')
bfiles, brender = {}, {}
for name in ('btn_primary', 'btn_secondary', 'btn_disabled', 'btn_icon',
             'btn_icon_active', 'panel_dialog'):
    path = f'public/assets/ui/{name}.png'
    w, h, px = png.read(path)
    left, right, top, bot = slice_insets(w, h, px)
    key = 'ui-' + name.replace('_', '-')
    bfiles[key] = f'ui/{name}.png'
    brender[key] = {
        'contentWidth': w,
        'contentHeight': h,
        'slice': {'left': left, 'right': right, 'top': top, 'bottom': bot},
    }
    print(f'  {key}: {w}x{h}, caps L{left} R{right} T{top} B{bot}')
json.dump({'files': bfiles, 'render': brender}, open('/tmp/buttonpatch.json', 'w'), indent=2)


# ------------------------------------------------------------- signboards

# The two bribe signs are whole boards on a post, drawn to sit over the blank
# board the painted villager is already holding. What matters is the board
# itself, not the canvas: the post below it is what the villager's hand covers,
# so the sign is placed and sized by its board.

def board_band(w, h, px):
    """(x0, x1, y0, y1) of the widest opaque band — the board above the post."""
    widths = []
    for y in range(h):
        xs = [x for x in range(w) if px[(y * w + x) * 4 + 3] > ALPHA]
        widths.append((xs[0], xs[-1]) if xs else None)
    span = [(r[1] - r[0]) if r else 0 for r in widths]
    broad = max(span) * 0.75
    rows = [y for y, s in enumerate(span) if s >= broad]
    y0, y1 = rows[0], rows[-1]
    x0 = min(widths[y][0] for y in rows)
    x1 = max(widths[y][1] for y in rows)
    return x0, x1, y0, y1


print('\n\nSignboards')
# NOTHING TO MEASURE ANY MORE, and that is the point of printing it.
#
# These used to be a board with a post hanging below it, so the canvas had to
# be searched for where the board sat inside it and the game placed the sprite
# by that. The overlays that replaced them are LETTERING ONLY: they are drawn
# on top of a board painted into the map plate, in a rectangle map.json records
# as fractions of the plate, and the canvas is authored to that rectangle's
# aspect. There is no board in the canvas to find.
#
# What DOES need checking after a re-export is the aspect: the canvas has to
# match the board's rectangle, or the words stretch. That is asserted in
# tests/sign.test.ts against map.json, which is where the rectangle lives.
for name in ('sign_moes', 'sign_courjahan', 'sign_tavern'):
    path = f'public/assets/props/{name}.png'
    w, h, _ = png.read(path)
    print(f'  prop-{name.replace("_", "-")}: {w}x{h}, aspect {w / h:.4f} '
          f'(no render config: the plate rectangle places it)')


# ----------------------------------------------------------------- gnomes

# The two summoned gnomes. They are drawn at the same scale as the enemies and
# the hero — 300px tall against Cory's 470 — so they reuse the enemy factor
# rather than getting one of their own, and the two-thirds-of-Cory relationship
# the artist drew survives into the game.
#
# The foot band has to reach past the rake: its pole rests on the ground
# between the gnome's boots, and a shallower cut reads it as a third foot and
# drags the anchor sideways.
GNOME_KEY = {
    'gnome_trowel.png': ('unit-gnome-trowel', 0.90),
    'gnome_rake.png':   ('unit-gnome-rake', 0.90),
}

print('\n\ngnomes')
gfiles, grender = {}, {}
for name, (key, band) in sorted(GNOME_KEY.items()):
    path = f'public/assets/units/{name}'
    w, h, px = png.read(path)
    low = ground_silhouette(w, h, px)
    bot = max(low)
    groups = foot_groups(low, int(h * band))
    lo = min(g[0] for g in groups)
    hi = max(g[1] for g in groups)
    footW = hi - lo + 1
    gfiles[key] = f'units/{name}'
    grender[key] = {
        'anchorX': round(((lo + hi) / 2) / w, 4),
        'anchorY': round((bot + 1) / h, 4),
        'displayHeight': round(h * escale, 1),
        'shadowWidth': round(footW * escale, 1),
        'contentWidth': w,
        'contentHeight': h,
    }
    print(f'{name:20s} {w}x{h}  cut y{int(h * band):4d}  feet {groups}')
    print(f'{"":20s} -> {key}: footprint x{lo}-{hi} ({footW}px), '
          f'on screen {round(w * escale, 1)}x{round(h * escale, 1)}, {grender[key]}')
json.dump({'files': gfiles, 'render': grender}, open('/tmp/gnomepatch.json', 'w'), indent=2)
