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
import img

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
    'tower_withholding_t1.webp': 'turret-ledger',
    'tower_writeoff.webp':    'turret-writeoff',
    'tower_rounding.webp':    'turret-rounding',
    'tower_escalation.webp':  'turret-escalation',
    'tower_filing.webp':      'turret-extension',
    'tower_tax.webp':         'turret-shelter',
}

def base_width(path):
    """The stone base: the widest opaque row in the bottom third of the art."""
    w, h, px = img.read(path)
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
    w, h, px = img.read(f)
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
BRUTE_SOURCE = 'public/assets/enemies/enemy_brute.webp'

ENEMY_KEY = {
    'enemy_brute.webp':           ('enemy-notice',   0.90, None),
    'enemy_soldier.webp':         ('enemy-filer',    0.87, None),
    'enemy_scout.webp':           ('enemy-shredder', 0.84, None),
    'enemy_boss_politician.webp': ('enemy-politician', 0.80, None),
    # The level 3 cast. THE THIRD VALUE IS AN EXPLICIT ON-SCREEN HEIGHT, and
    # these four and the boss need one: the uniform brute scale below exists to
    # hold the Kenney-derived cast at one consistent size relative to each
    # other, and it is derived from a 226px source. This art is drawn at
    # 880-1240px, so the same scale would put Pom-Pom on screen at 257px --
    # four times the size of the Bruiser she runs beside. They are sized
    # against the render instead, and the sizes are the brief's: the four
    # mascots inside 60-85 so they read as a set, the boss at 140 so he towers
    # over them, and neither the catcher nor the zamboni under 85, because
    # below that the two silhouettes stop being tellable apart.
    'enemy_pompom.webp':          ('enemy-pompom',   0.90,  66.0),
    'enemy_longsnap.webp':        ('enemy-longsnap', 0.90,  74.0),
    'enemy_catcher.webp':         ('enemy-catcher',  0.90,  85.0),
    # A vehicle shadows under its whole body rather than its wheels, the same
    # rule the tower section applies -- so the zamboni's foot band is only used
    # for the anchor, and its shadow spans the art.
    'enemy_zamboni.webp':         ('enemy-zamboni',  0.94,  85.0),
    'boss_unicorn.webp':          ('enemy-unicorn',  0.90, 140.0),
    # The level 4 cast, sized the same way for the same reason: this art is
    # drawn at 420-800px, so the uniform brute scale would put the smallest
    # tourist on screen at 175px. The brief's sizes are used directly -- the
    # three tourists at 66/78/90 so the tier reads as one family growing, the
    # tiny glitch at 52 because it is meant to look like a rounding error, the
    # glitch bug at 80, and the Lich King at 140 to stand with the Reaper.
    'enemy_tourist_small.webp':   ('enemy-tourist-small', 0.90,  66.0),
    'enemy_tourist_mid.webp':     ('enemy-tourist-mid',   0.90,  78.0),
    # 85 AND NOT THE 90 THE BRIEF ASKED FOR. Every tower in the game is 87.1
    # px tall -- they share one scale -- and content.test.ts holds the rank and
    # file under that, so a 90 px elite would be the only unit on the board
    # taller than every building on it. 85 is what level 3's two heaviest
    # elites already are, so the Overpacker reads as the same size class they
    # do, and the tourist tier still grows 66 -> 78 -> 85.
    'enemy_tourist_big.webp':     ('enemy-tourist-big',   0.90,  85.0),
    'enemy_tiny_glitch.webp':     ('enemy-tiny-glitch',   0.90,  52.0),
    # A flyer has no feet on the ground, so its foot band catches the lowest
    # of whatever it trails rather than a stance. The shadow is the body's,
    # the same rule the Zamboni gets, because there is nothing else to cast it.
    'enemy_glitch_bug.webp':      ('enemy-glitch-bug',    0.90,  80.0),
    'boss_glitch_lich.webp':      ('enemy-glitch-lich',   0.90, 140.0),
}
# Enemies whose shadow is cast by the whole body, not by the feet.
ENEMY_BODY_SHADOW = {'enemy-zamboni', 'enemy-glitch-bug'}
# Where to LOOK for feet, as fractions of the source width, for art whose
# ground silhouette catches something that is not one.
#
# Only the Lich King needs it. His glitched sword runs down and out to the
# right and its tip touches the ground line, so the foot band reads it as a
# third foot and drags the anchor 0.106 to the right -- 16 px on screen at his
# 140 px height, which would walk him with the lane under his shoulder rather
# than under his hooves. The window stops at 0.80, past both hooves and short
# of the blade. It is a measuring correction, not a size or position choice.
ENEMY_FOOT_WINDOW = {'enemy-glitch-lich': (0.0, 0.80)}
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
brute_source_h = img.read(BRUTE_SOURCE)[1]
escale = BRUTE_ON_SCREEN / brute_source_h
print(f'uniform scale {escale:.4f} (brute {brute_source_h}px -> {BRUTE_ON_SCREEN}px on screen)\n')
for f in sorted(glob.glob('public/assets/enemies/enemy_*.webp')
                + glob.glob('public/assets/enemies/boss_*.webp')):
    name = os.path.basename(f)
    if name not in ENEMY_KEY:
        # Art that is in the folder but not in the manifest — the beetle was
        # uploaded and never registered. Skipping beats a KeyError that stops
        # the whole script before the hero and HUD sections run.
        print(f'{name:20s} not in ENEMY_KEY; skipped')
        continue
    key, band, fixed_h = ENEMY_KEY[name]
    w, h, px = img.read(f)
    low = ground_silhouette(w, h, px)
    bot = max(low)
    groups = foot_groups(low, int(h * band))
    win = ENEMY_FOOT_WINDOW.get(key)
    if win:
        x0, x1 = int(w * win[0]), int(w * win[1])
        groups = [g for g in groups if g[0] >= x0 and g[1] <= x1]
    lo = min(g[0] for g in groups)
    hi = max(g[1] for g in groups)
    footW = w if key in ENEMY_BODY_SHADOW else hi - lo + 1
    footCx = (lo + hi) / 2.0
    # An explicit height overrides the uniform scale, and the shadow follows it
    # so the two stay in proportion however the sprite is sized.
    scale = (fixed_h / h) if fixed_h else escale

    efiles[key] = f'enemies/{name}'
    erender[key] = {
        'anchorX': round(footCx / w, 4),
        'anchorY': round((bot + 1) / h, 4),
        'displayHeight': round(h * scale, 1),
        'shadowWidth': round(footW * scale, 1),
        # All three are trimmed, so content is the canvas. Recording it anyway
        # lets anything that needs the on-screen width work it out from the
        # manifest instead of loading the image.
        'contentWidth': w,
        'contentHeight': h,
    }
    print(f'{name:20s} {w}x{h}  cut y{int(h*band):4d}  feet {groups}')
    print(f'{"":20s} -> {key}: footprint x{lo}-{hi} ({footW}px), '
          f'on screen {round(w*scale,1)}x{round(h*scale,1)}, '
          f'anchorX {erender[key]["anchorX"]}, shadowWidth {erender[key]["shadowWidth"]}')
json.dump({'files': efiles, 'render': erender}, open('/tmp/enemypatch.json', 'w'), indent=2)


# ------------------------------------------------------------------- hero
#
# CORY'S OWN SECTION IS GONE, and so are the files it measured.
#
# It read `hero/hero_cory.webp` and `hero/hero_cory_ultimate.webp` and gave
# them a scale of their own -- the man at the enemies' factor, the SUV sized to
# 2.2x his width. Both files were deleted when his new art landed: he is a
# single picture in `heroes/` now, like the other four, and the walk and attack
# sheets went with them. A section that reads deleted files does not fail
# quietly, it raises and takes every section below it down with it, which is
# why this is a deletion rather than a skip.
#
# The whole roster is measured together in the "hero roster" section at the
# bottom of this file. `escale` is still computed above and is still used by
# the gnomes, so nothing else moved.

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
    path = f'public/assets/ui/hud_{name}.webp'
    w, h, px = img.read(path)
    left, right, top, bot = dark_field(w, h, px)
    key = f'hud-{name}'
    pfiles[key] = f'ui/hud_{name}.webp'
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

# THE PEANUTS PLATE'S fieldLeft IS AUTHORED NOW; DO NOT COPY THE ONE ABOVE.
#
# dark_field finds the field as the plate's longest run of dark COLUMNS, so on
# a plate with an icon painted into it the run starts just past that icon --
# which is what made 0.2845 the right answer while a placeholder peanut was
# still in the picture. It is not any more (tools/clear_peanut_plate.py), so
# the run now starts at the field's own left edge and this prints 0.0647: the
# number would be drawn over the icon. art.json carries the wave plate's
# 0.319, measured on the identical 232x96 frame. See its `_field` note.
if abs(prender['hud-peanuts']['fieldLeft'] - prender['hud-wave']['fieldLeft']) > 0.01:
    print('  NOTE: hud-peanuts fieldLeft above is the empty field\'s own edge, not where')
    print('        the number goes. art.json authors it as the wave plate\'s. Do not copy.')


# ------------------------------------------------------------------ UI icons

# Icons drawn OVER something else -- a plate, a button, a counter -- rather
# than into it. contentWidth/contentHeight are what fitInBox and fitInRect
# DIVIDE by, so an icon whose entry carries its canvas size instead of its ink
# is silently drawn small, and a non-square one is silently fitted as a square.
# hud-peanut carried 512x512, which is the canvas: the ink is 498x400.
print('\n\nUI icons')
for key, path in (
    ('hud-peanut', 'public/assets/ui_icons/hud_peanut_icon.webp'),
):
    w, h, px = img.read(path)
    xs = [x for x in range(w) if any(px[(y * w + x) * 4 + 3] > ALPHA for y in range(h))]
    ys = [y for y in range(h) if any(px[(y * w + x) * 4 + 3] > ALPHA for x in range(w))]
    iw, ih = xs[-1] - xs[0] + 1, ys[-1] - ys[0] + 1
    print(f'  {key}: canvas {w}x{h}, ink x{xs[0]}-{xs[-1]} y{ys[0]}-{ys[-1]}'
          f" -> {{'contentWidth': {iw}, 'contentHeight': {ih}}}  ({iw / ih:.3f}:1)")


# ------------------------------------------- where a drawn icon goes on a plate

# art.json's ui.counterIcon. The peanut is the one counter icon that is DRAWN
# rather than painted into its plate, and "put it in the middle of the plate's
# end" is not the same box the painted ones occupy -- it is further left and
# smaller. So the box is taken off the heart painted into the lives plate and
# every drawn counter icon uses it, which is what makes two chips side by side
# read as a set.
w, h, px = img.read('public/assets/ui/hud_lives.webp')
FIELD = (17, 19, 21)


def _is_field(i):
    return (abs(px[i] - FIELD[0]) < 10 and abs(px[i + 1] - FIELD[1]) < 10
            and abs(px[i + 2] - FIELD[2]) < 10 and px[i + 3] > 200)


ink = []
for y in range(h):
    run = None
    for x in range(12, 96):
        if all(_is_field(((y * w + x + k) * 4)) for k in range(6)):
            run = x
            break
    if run is None:
        continue
    for x in range(run, 96):
        if not _is_field((y * w + x) * 4):
            ink.append((x, y))
if ink:
    x0 = min(p[0] for p in ink); x1 = max(p[0] for p in ink)
    y0 = min(p[1] for p in ink); y1 = max(p[1] for p in ink)
    print('\n\nCounter icon box (from the heart painted into the lives plate)')
    print(f'  ink x{x0}-{x1} y{y0}-{y1} on a {w}x{h} plate')
    print('  -> ui.counterIcon (fractions of plate HEIGHT, the one dimension'
          ' all three plates share):')
    print(f"     {{'left': {x0 / h:.4f}, 'top': {y0 / h:.4f},"
          f" 'width': {(x1 - x0 + 1) / h:.4f}, 'height': {(y1 - y0 + 1) / h:.4f}}}")


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
    path = f'public/assets/ui/{name}.webp'
    w, h, px = img.read(path)
    left, right, top, bot = slice_insets(w, h, px)
    key = 'ui-' + name.replace('_', '-')
    bfiles[key] = f'ui/{name}.webp'
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
    path = f'public/assets/props/{name}.webp'
    w, h, _ = img.read(path)
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
    'gnome_trowel.webp': ('unit-gnome-trowel', 0.90),
    'gnome_rake.webp':   ('unit-gnome-rake', 0.90),
}

print('\n\ngnomes')
gfiles, grender = {}, {}
for name, (key, band) in sorted(GNOME_KEY.items()):
    path = f'public/assets/units/{name}'
    w, h, px = img.read(path)
    low = ground_silhouette(w, h, px)
    bot = max(low)
    groups = foot_groups(low, int(h * band))
    win = ENEMY_FOOT_WINDOW.get(key)
    if win:
        x0, x1 = int(w * win[0]), int(w * win[1])
        groups = [g for g in groups if g[0] >= x0 and g[1] <= x1]
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


# ----------------------------------------------------------------- demons

# The three demons do NOT share the enemy set's scale, and cannot.
#
# The Kenney cast arrived drawn against each other — brute, soldier, scout and
# the Politician all sit at one factor from their own source art, which is why
# `escale` above is a single number. These three were commissioned separately
# and drawn at their own canvas sizes (550, 698 and 697 tall), so a single
# factor would size them by whatever the artist's canvas happened to be. The
# Underling would come out taller than Buckethead on the strength of a bigger
# JPEG.
#
# So each one is placed by the height it should read at ON SCREEN, and its
# scale falls out of that. The heights themselves are a design call, set
# against the enemies already on the board:
#
#   junior  slightly shorter than the Scrapper (35.2)
#   manager Buckethead's height (66.0), and much wider at the same height
#   devil   a little taller than the junior, and much slimmer than the manager
#
# THE DEVIL'S HEIGHT IS THE ONE TO ARGUE WITH. It follows the brief literally
# — "a little taller than the junior" — which leaves a 6200-health boss
# reading smaller than a 185-health elite. If he was meant to stand a little
# taller than the MANAGER instead, change the one number below to 70.0 and
# re-run; nothing else moves.
DEMON_ON_SCREEN = {
    'demon_direct_report.webp': ('enemy-demon-junior',  33.4, 0.90),
    'demon_middle_manager.webp': ('enemy-demon-manager', 66.0, 0.90),
    'demon_the_devil.webp':     ('enemy-devil',         37.0, 0.90),
}
# The third value is the foot band, as for the enemies above. 0.90 is the
# deepest cut that still catches both feet on all three: the Underling stands
# in a wide stride with his back hoof at the left, and the manager's leading
# shoe and trailing hoof are 60px apart vertically.

print('\n\ndemons')
dfiles, drender = {}, {}
for name, (key, on_screen, band) in DEMON_ON_SCREEN.items():
    path = f'public/assets/enemies/{name}'
    w, h, px = img.read(path)
    low = ground_silhouette(w, h, px)
    bot = max(low)
    groups = foot_groups(low, int(h * band))
    win = ENEMY_FOOT_WINDOW.get(key)
    if win:
        x0, x1 = int(w * win[0]), int(w * win[1])
        groups = [g for g in groups if g[0] >= x0 and g[1] <= x1]
    lo = min(g[0] for g in groups)
    hi = max(g[1] for g in groups)
    footW = hi - lo + 1
    scale = on_screen / h

    dfiles[key] = f'enemies/{name}'
    drender[key] = {
        'anchorX': round(((lo + hi) / 2) / w, 4),
        'anchorY': round((bot + 1) / h, 4),
        'displayHeight': round(on_screen, 1),
        'shadowWidth': round(footW * scale, 1),
        'contentWidth': w,
        'contentHeight': h,
    }
    # Rule 7 in CLAUDE.md, checked rather than assumed: source height must
    # cover the on-screen height at full zoom on the densest screen.
    want = on_screen * 2.37 * 3
    print(f'{name:26s} {w}x{h}  cut y{int(h * band):4d}  feet {groups}')
    print(f'{"":26s} -> {key}: scale {scale:.4f}, on screen '
          f'{round(w * scale, 1)}x{round(h * scale, 1)}, {drender[key]}')
    print(f'{"":26s}    rule 7 wants >= {want:.0f}px of source; has {h}px '
          f'({h / want:.1f}x)')
json.dump({'files': dfiles, 'render': drender}, open('/tmp/demonpatch.json', 'w'), indent=2)


# ============================================================= the hero update
#
# Everything below measures art that arrived as one batch: Cory's two new
# pictures, the ten ability icons and the ten power effects. It is written as
# one generic pass rather than as three more hand-tuned tables, because the
# thing that goes wrong at this scale is not a subtle anchor -- it is somebody
# copying a canvas size into a field that wants an ink size, twenty-two times.

def ink_box(w, h, px):
    """The artwork's own bounds inside its canvas: (x0, y0, x1, y1), or None.

    THIS IS WHAT contentWidth/contentHeight MEAN, and the distinction is the
    whole reason this helper exists. `fitInBox` and `fitInRect` DIVIDE by those
    two numbers, so an entry carrying the canvas instead of the ink draws its
    art small by exactly the ratio of the transparent margin -- silently, at
    every size, forever. hud-peanut shipped with 512x512 against a 498x400
    painting and rendered 3% small with a 1.25:1 shape fitted as a square.
    """
    xs = [x for x in range(w) if any(px[(y * w + x) * 4 + 3] > ALPHA for y in range(h))]
    if not xs:
        return None
    ys = [y for y in range(h) if any(px[(y * w + x) * 4 + 3] > ALPHA for x in range(w))]
    return xs[0], ys[0], xs[-1], ys[-1]


def measured(path, band=0.90, feet=False):
    """Everything art.json can be told about one file, from its pixels."""
    w, h, px = img.read(path)
    box = ink_box(w, h, px)
    x0, y0, x1, y1 = box
    out = {
        'canvas': (w, h),
        'ink': (x0, y0, x1, y1),
        'contentWidth': x1 - x0 + 1,
        'contentHeight': y1 - y0 + 1,
    }
    if feet:
        low = ground_silhouette(w, h, px)
        groups = foot_groups(low, int(h * band))
        lo = min(g[0] for g in groups)
        hi = max(g[1] for g in groups)
        out['anchorX'] = round(((lo + hi) / 2) / w, 4)
        out['anchorY'] = round((max(low) + 1) / h, 4)
        out['stance'] = (lo, hi)
        out['footWidth'] = hi - lo + 1
    return out


# ------------------------------------------------------------ the five heroes

# THE WHOLE ROSTER, in one table, because Cory has stopped being the exception.
#
# He arrived with a walk sheet and an attack sheet and a hand-tuned section of
# his own above; the other four were single pictures. He is a single picture
# now too, so all five are measured the same way and the roster is a list
# rather than a special case plus a loop.
#
# `displayHeight` is the size the game draws them at and is a DESIGN number,
# not a measurement -- it is in art.json already and survives a re-export
# untouched (CLAUDE.md rule 7). It is repeated here only so the rule-7 check
# below has something to check against.
HERO_ART = {
    # key: (path, on-screen height, foot band, footprint rule)
    'hero-cory':            ('heroes/hero_cory_base.webp',       78.0, 0.85, 'feet'),
    'hero-cory-power':      ('heroes/hero_cory_power.webp',      95.0, 0.94, 'body'),
    'hero-courtland':       ('heroes/hero_courtland_base.webp',  78.0, 0.85, 'feet'),
    'hero-courtland-power': ('heroes/hero_courtland_power.webp', 78.0, 0.85, 'feet'),
    'hero-han':             ('heroes/hero_han_base.webp',        78.0, 0.85, 'feet'),
    'hero-han-power':       ('heroes/hero_han_power.webp',       78.0, 0.85, 'feet'),
    'hero-eli':             ('heroes/hero_eli_base.webp',        78.0, 0.85, 'feet'),
    'hero-eli-power':       ('heroes/hero_eli_power.webp',       78.0, 0.85, 'feet'),
    'hero-bailey':          ('heroes/hero_bailey_base.webp',     78.0, 0.85, 'feet'),
    'hero-bailey-power':    ('heroes/hero_bailey_power.webp',    78.0, 0.85, 'feet'),
}
# CORY'S BAND IS 0.85 AND THAT IS NOT A ROUNDING CHOICE. He stands in a wide
# lunge with his trailing shoe raised: at 0.90 the cut is below that shoe
# entirely, only the leading one is found, and the anchor lands at 0.848 -- 35%
# of his width off centre, which would walk him with the lane under his elbow.
# At 0.85 both shoes are found (x69-170 and x361-489) and the anchor is 0.557.
# The lesson is the one the enemy table already carries: the band is the
# deepest cut that still catches BOTH feet, and it is read off the silhouette
# rather than guessed.
#
# THE RIVIAN IS 'body', the same rule DAD MODE's SUV uses and for the same
# reason. It is drawn in 3/4 receding, so only the near front wheel reaches the
# ground line at all -- the rear wheel bottoms 100px higher up the canvas -- and
# anchoring on the contact patch would hang the whole vehicle off its front
# axle. A vehicle's shadow is cast by its body, so the body is what it is
# anchored and shadowed by: anchorX 0.5, shadow the full width. The retired
# hero-cory-ultimate entry used 0.5384 and a full-width shadow, which is the
# same answer arrived at the same way.

# Rule 7, in one place: source height must cover the on-screen height at full
# zoom on the densest screen the game supports.
MAX_ZOOM, MAX_DPR = 2.37, 3

print('\n\nhero roster')
_shipped = json.load(open('src/data/art.json'))['render']
rfiles, rrender = {}, {}
for key, (rel, on_screen, band, rule) in HERO_ART.items():
    path = f'public/assets/{rel}'
    if not os.path.exists(path):
        print(f'  {key:22s} {rel} is not on disk; skipped')
        continue
    w, h, px = img.read(path)
    m = measured(path, band=band, feet=True)
    scale = on_screen / h
    if rule == 'body':
        anchor_x = round(((m['ink'][0] + m['ink'][2]) / 2) / w, 4)
        shadow_px = m['ink'][2] - m['ink'][0] + 1
    else:
        anchor_x = m['anchorX']
        shadow_px = m['footWidth']
    rfiles[key] = rel
    rrender[key] = {
        'anchorX': anchor_x,
        'anchorY': m['anchorY'],
        'displayHeight': on_screen,
        'shadowWidth': round(shadow_px * scale, 1),
        'contentWidth': m['contentWidth'],
        'contentHeight': m['contentHeight'],
    }
    want = on_screen * MAX_ZOOM * MAX_DPR
    x0, y0, x1, y1 = m['ink']
    print(f'  {key:22s} canvas {w}x{h}  ink x{x0}-{x1} y{y0}-{y1}'
          f'  {rule} x{m["stance"][0]}-{m["stance"][1]}')
    print(f'  {"":22s} -> on screen {round(w * scale, 1)}x{on_screen}, {rrender[key]}')
    print(f'  {"":22s}    rule 7 wants >= {want:.0f}px of source; has {h}px ({h / want:.1f}x)')
    # WHAT SHIPPED, BESIDE WHAT THE PIXELS SAY -- reported, never applied.
    #
    # `displayHeight` and `shadowWidth` are on-screen figures that were tuned
    # by looking at the game, and CLAUDE.md rule 7 says to keep them; only the
    # content box is re-derived from a re-export. `anchorX` is measured here
    # and the four heroes added before this batch disagree with their own
    # silhouettes by a lot, which is worth knowing and is NOT worth changing on
    # the strength of a script in a batch about somebody else's art.
    old = _shipped.get(key)
    if old:
        diffs = [f'{f}: {old.get(f)} -> {rrender[key][f]}'
                 for f in ('anchorX', 'contentWidth', 'contentHeight')
                 if old.get(f) is not None and old.get(f) != rrender[key][f]]
        if diffs:
            print(f'  {"":22s}    art.json currently says  ' + ';  '.join(diffs))


# ------------------------------------------------- ability icons and effects
#
# Both families are drawn CENTRED at a point rather than standing on the
# ground, so neither gets a foot band: the anchor is 0.5, 0.5 and the only
# numbers that matter are the ink extents `fitInBox` divides by.
#
# The effects additionally need their ASPECT, because two of them -- the ice
# beam and the dash trail -- are drawn stretched along a line whose length the
# power decides, and the code that stretches them has to know how long the
# picture is against how tall.

print('\n\nability icons')
afiles, arender = {}, {}
for rel in sorted(os.path.basename(p) for p in glob.glob('public/assets/abilities/ability_*.webp')):
    hero_slot = rel[len('ability_'):-len('.webp')]
    if '_' not in hero_slot:
        continue                     # ability_molotov and friends: not hero icons
    key = 'ability-' + hero_slot.replace('_', '-')
    m = measured(f'public/assets/abilities/{rel}')
    w, h = m['canvas']
    x0, y0, x1, y1 = m['ink']
    afiles[key] = f'abilities/{rel}'
    arender[key] = {
        'anchorX': 0.5, 'anchorY': 0.5,
        'contentWidth': m['contentWidth'], 'contentHeight': m['contentHeight'],
    }
    print(f'  {key:22s} canvas {w}x{h}  ink x{x0}-{x1} y{y0}-{y1}'
          f' -> {m["contentWidth"]}x{m["contentHeight"]}'
          f'  ({m["contentWidth"] / m["contentHeight"]:.3f}:1)')
json.dump({'files': afiles, 'render': arender}, open('/tmp/abilitypatch.json', 'w'), indent=2)

print('\n\npower effects')
xfiles, xrender = {}, {}
for rel in sorted(os.path.basename(p) for p in glob.glob('public/assets/effects/fx_*.webp')):
    key = 'fx-' + rel[len('fx_'):-len('.webp')].replace('_', '-')
    m = measured(f'public/assets/effects/{rel}')
    w, h = m['canvas']
    x0, y0, x1, y1 = m['ink']
    xfiles[key] = f'effects/{rel}'
    xrender[key] = {
        'anchorX': 0.5, 'anchorY': 0.5,
        'contentWidth': m['contentWidth'], 'contentHeight': m['contentHeight'],
    }
    print(f'  {key:22s} canvas {w}x{h}  ink x{x0}-{x1} y{y0}-{y1}'
          f' -> {m["contentWidth"]}x{m["contentHeight"]}'
          f'  ({m["contentWidth"] / m["contentHeight"]:.3f}:1)')
json.dump({'files': xfiles, 'render': xrender}, open('/tmp/effectpatch.json', 'w'), indent=2)


# ------------------------------------------------- the canvas-vs-ink audit
#
# EVERY entry in art.json that records a content box, checked against the
# pixels of the file it describes.
#
# This is the generalisation of the hud-peanut bug. That entry carried its
# 512x512 canvas where its 498x400 ink belonged, and the only reason anybody
# found out is that somebody looked at the peanut and thought it small. There
# was no way to ask the question of the other hundred entries at once. Now
# there is, and it runs every time this script does.
#
# A SHEET IS EXEMPT. `render.sheet` entries are strips of frames: their content
# box describes one frame's grid cell, not the ink inside it, and measuring the
# ink of a six-frame strip would report the union of all six.
print('\n\ncontent box audit (recorded vs measured ink)')
manifest = json.load(open('src/data/art.json'))
bad, checked, absent = [], 0, []
for key, cfg in sorted(manifest['render'].items()):
    if 'contentWidth' not in cfg and 'contentHeight' not in cfg:
        continue
    if 'sheet' in cfg:
        continue
    rel = manifest['files'].get(key)
    path = f'public/{manifest["assetRoot"]}{rel}' if rel else None
    if not path or not os.path.exists(path):
        absent.append(key)
        continue
    w, h, px = img.read(path)
    box = ink_box(w, h, px)
    if box is None:
        continue
    checked += 1
    iw, ih = box[2] - box[0] + 1, box[3] - box[1] + 1
    rw, rh = cfg.get('contentWidth', w), cfg.get('contentHeight', h)
    # A pixel or two either way is the alpha threshold, not an error.
    if abs(rw - iw) <= 2 and abs(rh - ih) <= 2:
        continue
    note = ''
    if (rw, rh) == (w, h):
        note = '  <-- THE CANVAS, not the ink'
    bad.append((key, rw, rh, iw, ih, w, h, note))
for key, rw, rh, iw, ih, w, h, note in bad:
    print(f'  {key:26s} says {rw}x{rh}, ink is {iw}x{ih} on a {w}x{h} canvas'
          f'  ({100 * (1 - min(iw / rw, ih / rh)):.1f}% small){note}')
print(f'  {checked} entries checked, {len(bad)} disagree with their own pixels'
      + (f', {len(absent)} have no file' if absent else ''))
if absent:
    print('  no file: ' + ', '.join(absent))
