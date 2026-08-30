import sys, glob, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png

ALPHA = 16
TILE = 64
# All six are drawn at one consistent scale inside a 512-tall frame, so a
# uniform scale preserves their intended sizes relative to each other. It is
# set so the widest base slightly overlaps its tile, which reads as presence.
WIDEST_BASE_ON_TILE = 66.0

KEY = {
    'tower_withholding.png': 'turret-ledger',
    'tower_writeoff.png':    'turret-writeoff',
    'tower_rounding.png':    'turret-rounding',
    'tower_escalation.png':  'turret-escalation',
    'tower_filing.png':      'turret-extension',
    'tower_tax.png':         'turret-shelter',
}

# First pass: find the widest base across the set, which sets the scale.
widest = 0
for f in sorted(glob.glob('public/assets/towers/tower_*.png')):
    w, h, px = png.read(f)
    for y in range(h):
        lo, hi, b = w, -1, y * w * 4
        for x in range(w):
            if px[b + x * 4 + 3] > ALPHA:
                if x < lo: lo = x
                if x > hi: hi = x
        if hi >= 0 and y > h * 0.6:
            widest = max(widest, hi - lo + 1)
SCALE = WIDEST_BASE_ON_TILE / widest
print(f'widest base across the set: {widest}px  ->  uniform scale {SCALE:.4f}\n')

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
                   'displayHeight': displayHeight, 'shadowWidth': shadowWidth}
    rows_out.append((name, key, f'{w}x{h}', f'{bh-bl+1}x{contentH}', baseRow,
                     baseW, round(scale, 4), displayHeight,
                     round(contentH * scale, 1), shadowWidth, anchorX, anchorY))

print(f"{'file':22s} {'canvas':9s} {'content':9s} {'baseRow':>7s} {'baseW':>6s} "
      f"{'scale':>7s} {'dispH':>7s} {'onscrH':>7s} {'shadW':>6s} {'aX':>6s} {'aY':>6s}")
for r in rows_out:
    print(f"{r[0]:22s} {r[2]:9s} {r[3]:9s} {r[4]:7d} {r[5]:6d} {r[6]:7.4f} "
          f"{r[7]:7.1f} {r[8]:7.1f} {r[9]:6.1f} {r[10]:6.4f} {r[11]:6.4f}")
json.dump({'files': files, 'render': render}, open('/tmp/towerpatch.json', 'w'), indent=2)
