"""Can a HUD element be put where the painted map never reaches it?

THE QUESTION. The new plate paints COURJAHAN'S TAVERN and its signboard into
the map's top-right corner, and the hero's health bar sat on it. Moving the bar
is the only lever — the sign is baked into the art — so: where does it go, and
is anywhere actually safe?

THE ANSWER IS NO, and this is what establishes that rather than assuming it.
The map is full-bleed and the camera is free, so at maximum zoom it can put any
painted feature under any pixel. Measured: 0 of 82,290 screen cells at 844x390
are unreachable by painted content at some camera position.

So the useful question becomes which position is reached LEAST, and by what —
and the answer to that is that the top-left is within noise of the best
available, and the rest is a job for the bar's own plate rather than for its
coordinates.

    python3 tools/hud_exposure.py           # after refreshing the plate PNG

THE PLATE PNG. map_level1 is a WebP and nothing here can decode one, so the
harness hands it back as a 1280x720 PNG — the map's own coordinate space:

    sh tools/harness/build.sh
    DPR=1 sh tools/harness/run.sh plate 70 844x390
    # writes tools/harness/shots/plate1280.png

Nothing at runtime depends on this script. It is the record of where the
numbers in the hero-bar tests came from.
"""

import colorsys
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import png  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'tools/harness/shots/plate1280.png')
W, H = 1280, 720
CELL = 8
# The painted signboard, the one piece of map art with WORDS on it and so the
# worst thing for a HUD element to cover. Measured off the plate.
SIGN = {'x': 920, 'y': 96, 'w': 96, 'h': 56}


def is_ground(r, g, b):
    """Grass or dirt road. Everything else is something somebody painted."""
    hue, sat, val = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    deg = hue * 360
    if 60 <= deg <= 150 and sat >= 0.25 and 0.15 <= val <= 0.85:
        return True
    if 20 <= deg <= 60 and 0.15 <= sat <= 0.75 and 0.30 <= val <= 0.95:
        return True
    return False


def landmarks(min_cells=40):
    """The painted content, as rectangles, found by classifying the plate."""
    w, h, rgba = png.read(PLATE)
    assert (w, h) == (W, H), f'{PLATE} is {w}x{h}, expected {W}x{H}'
    cw, ch = W // CELL, H // CELL
    grid = [[0] * cw for _ in range(ch)]
    for cy in range(ch):
        for cx in range(cw):
            ground = total = 0
            for dy in range(0, CELL, 2):
                for dx in range(0, CELL, 2):
                    i = ((cy * CELL + dy) * W + cx * CELL + dx) * 4
                    total += 1
                    if is_ground(rgba[i], rgba[i + 1], rgba[i + 2]):
                        ground += 1
            grid[cy][cx] = 0 if ground / total >= 0.6 else 1

    seen = [[False] * cw for _ in range(ch)]
    out = []
    for sy in range(ch):
        for sx in range(cw):
            if not grid[sy][sx] or seen[sy][sx]:
                continue
            stack, cells = [(sx, sy)], []
            seen[sy][sx] = True
            while stack:
                x, y = stack.pop()
                cells.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < cw and 0 <= ny < ch and not seen[ny][nx] and grid[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(cells) < min_cells:
                continue
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            out.append({
                'x': min(xs) * CELL, 'y': min(ys) * CELL,
                'w': (max(xs) - min(xs) + 1) * CELL,
                'h': (max(ys) - min(ys) + 1) * CELL,
                'px': len(cells) * CELL * CELL,
            })
    return sorted(out, key=lambda b: -b['px'])


def hud_rects(vw, vh):
    """The real layout, so this cannot drift from what the game draws."""
    script = f'''
import {{ hudLayout }} from "{ROOT}/src/systems/HudLayout.ts"
import {{ readFileSync }} from "node:fs"
const P = JSON.parse(readFileSync("{ROOT}/src/data/presentation.json", "utf8"))
console.log(JSON.stringify(hudLayout({{
  width: {vw}, height: {vh}, insets: {{ top: 0, right: 0, bottom: 0, left: 0 }},
  countersWidth: 350, abilitiesWidth: 370,
}}, P.hud.layout)))
'''
    raw = subprocess.run(['node', '--experimental-strip-types', '-e', script],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(raw)


def cameras(vw, vh, n=16):
    cam = json.load(open(os.path.join(ROOT, 'src/data/display.json')))['camera']
    out = []
    for z in (cam['minZoom'], cam['defaultZoom'], cam['maxZoom']):
        halfw, halfh = vw / (2 * z), vh / (2 * z)
        xs = [W / 2] if halfw * 2 >= W else [
            halfw + i * (W - 2 * halfw) / (n - 1) for i in range(n)]
        ys = [H / 2] if halfh * 2 >= H else [
            halfh + i * (H - 2 * halfh) / (n - 1) for i in range(n)]
        for cx in xs:
            for cy in ys:
                out.append((z, cx - halfw, cy - halfh))
    return out


def hits(rect, box):
    return (rect['x'] < box['x'] + box['w'] and box['x'] < rect['x'] + rect['w']
            and rect['y'] < box['y'] + box['h'] and box['y'] < rect['y'] + rect['h'])


def main():
    marks = landmarks()
    print(f'{len(marks)} painted landmarks, largest first:')
    for b in marks[:8]:
        print(f"  {b['x']:5} {b['y']:5} {b['w']:5} {b['h']:5}   {b['px']:7} px")

    for vw, vh, bw in ((844, 390, 247), (568, 320, 164)):
        cams = cameras(vw, vh)
        bh = 22
        print(f'\n== {vw}x{vh}, bar {bw}x{bh}, {len(cams)} camera positions ==')

        # 1. Is ANY screen cell never reached?
        step = 4
        gw, gh = vw // step, vh // step
        seen = [[False] * gw for _ in range(gh)]
        for z, ox, oy in cams:
            for b in marks:
                x0, y0 = (b['x'] - ox) * z, (b['y'] - oy) * z
                x1, y1 = x0 + b['w'] * z, y0 + b['h'] * z
                for gy in range(max(0, int(y0) // step), min(gh, int(y1) // step + 1)):
                    for gx in range(max(0, int(x0) // step), min(gw, int(x1) // step + 1)):
                        seen[gy][gx] = True
        free = sum(1 for row in seen for c in row if not c)
        print(f'  {free} of {gw * gh} screen cells are never reached by painted art')

        # 2. Exposure of every candidate position clear of the rest of the HUD.
        hud = hud_rects(vw, vh)
        others = [{'x': hud[k]['x'], 'y': hud[k]['y'], 'w': hud[k]['width'], 'h': hud[k]['height']}
                  for k in ('counters', 'startButton', 'messageRow', 'abilities', 'mute', 'pause')]
        scored = []
        for py in range(4, vh - bh, 6):
            for px in range(4, vw - bw, 12):
                bar = {'x': px, 'y': py, 'w': bw, 'h': bh}
                if any(hits(bar, o) for o in others):
                    continue
                sign = art = 0
                for z, ox, oy in cams:
                    proj = lambda b: {'x': (b['x'] - ox) * z, 'y': (b['y'] - oy) * z,
                                      'w': b['w'] * z, 'h': b['h'] * z}
                    if hits(bar, proj(SIGN)):
                        sign += 1
                    if any(hits(bar, proj(b)) for b in marks):
                        art += 1
                scored.append((sign, art, px, py))
        scored.sort()
        print(f'  {len(scored)} positions clear of the rest of the HUD; best three:')
        for sign, art, px, py in scored[:3]:
            print(f'    {px:4},{py:4}   signboard {sign:4}/{len(cams)}   any art {art:4}/{len(cams)}')
        for name, px, py in (('now, top-left', 10, 60), ('was, top-right', vw - 10 - bw, 60)):
            bar = {'x': px, 'y': py, 'w': bw, 'h': bh}
            sign = art = 0
            for z, ox, oy in cams:
                proj = lambda b: {'x': (b['x'] - ox) * z, 'y': (b['y'] - oy) * z,
                                  'w': b['w'] * z, 'h': b['h'] * z}
                if hits(bar, proj(SIGN)):
                    sign += 1
                if any(hits(bar, proj(b)) for b in marks):
                    art += 1
            print(f'  {name:16} {px:4},{py:4}   signboard {sign:4}/{len(cams)}'
                  f'   any art {art:4}/{len(cams)}')


if __name__ == '__main__':
    main()
