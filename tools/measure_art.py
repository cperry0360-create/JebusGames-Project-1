"""Measure the painted art and print the manifest values it implies.

Run from the repository root:

    python3 tools/measure_art.py

Nothing at runtime reads this. It is the record of where the anchor,
displayHeight and shadowWidth numbers in art.json came from, so they can be
re-derived rather than re-guessed when art changes.
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
    'tower_withholding.png': 'turret-ledger',
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
bases = sorted(base_width(f) for f in glob.glob('public/assets/towers/tower_*.png'))
median = bases[len(bases) // 2]
SCALE = MEDIAN_BASE_ON_SCREEN / median
print(f'bases at source scale: {bases}')
print(f'median {median}px -> uniform scale {SCALE:.4f} '
      f'(on-screen bases {[round(b * SCALE, 1) for b in bases]})\n')

rows_out, files, render = [], {}, {}
for f in sorted(glob.glob('public/assets/towers/tower_*.png')):
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
# each other with the brute tallest at 512px, so one uniform scale preserves
# the artist's proportions. It is set so the brute stands a little shorter
# than a tower (72.8px), which is what a big enemy beside a building should do.
BRUTE_ON_SCREEN = 66.0

ENEMY_KEY = {
    'enemy_brute.png':   ('enemy-notice',   0.90),
    'enemy_soldier.png': ('enemy-filer',    0.87),
    'enemy_scout.png':   ('enemy-shredder', 0.84),
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
escale = BRUTE_ON_SCREEN / 512.0
print(f'uniform scale {escale:.4f} (brute 512px -> {BRUTE_ON_SCREEN}px on screen)\n')
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
