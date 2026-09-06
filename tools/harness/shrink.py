"""Downscales a harness screenshot so it can actually be looked at.

Shots are taken at the device ratio, so a 844x390 viewport at dpr 3 is a
2532x1170 PNG and `realboot` at 1400x900 is 17MB. Those are present but
unopenable, which is its own kind of invisible -- and unopenable screenshots
are why five sessions "verified" rendering fixes against computed layout
values.

    python3 tools/harness/shrink.py shots/screens-5-game-844x390.png 950
    python3 tools/harness/shrink.py shots/... 950 --crop 0,0,460,90

--crop is in CSS pixels -- the coordinates the game and the FP lines in
report.json use -- not the shot's physical pixels, so a HUD rectangle can be
pasted straight in at any device ratio.

WHY THIS IS PYTHON AND NOT `chromium --screenshot`. It was that, and it
produced a fake bug. Chromium fires --screenshot on the load event and paints
a large PNG progressively, so the capture caught the top 80% of the picture
and left the rest black -- which reads exactly like a screen whose bottom
fifth is cut off, and was very nearly reported as one. --virtual-time-budget
does not fix it. So the page awaits `img.decode()`, draws to a canvas, and
POSTs the bytes back: nothing is captured until the decode has finished.

Chromium is the resampler here the same way it is the decoder in tools/img.py
and the encoder in tools/towebp -- there is no PIL, no ImageMagick, and every
package registry answers 403.
"""
import base64, http.server, os, subprocess, sys, tempfile, threading

HERE = os.path.dirname(os.path.abspath(__file__))
CHROMIUM = os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium')

PAGE = r"""<!doctype html><meta charset="utf-8"><title>shrink</title>
<body style="margin:0;background:#111"><script type="module">
const q = new URLSearchParams(location.search)
const W = +q.get('w'), CROP = q.get('crop')
const img = new Image()
img.src = '/in.png'
// THE DECODE IS AWAITED. This is the whole reason the tool works.
await img.decode()
let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
if (CROP) {
  // The crop arrives in CSS pixels and the shot is in physical ones, so it is
  // scaled by the ratio the shot was taken at -- which is recoverable from the
  // shot's own width against the viewport width the caller passes.
  const [cx, cy, cw, ch, dpr] = CROP.split(',').map(Number)
  sx = cx * dpr; sy = cy * dpr; sw = cw * dpr; sh = ch * dpr
}
const c = document.createElement('canvas')
c.width = W
c.height = Math.max(1, Math.round(W * sh / sw))
const g = c.getContext('2d')
g.imageSmoothingEnabled = true
g.imageSmoothingQuality = 'high'
g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
await fetch('/out', { method: 'POST', body: c.toDataURL('image/png') })
document.title = 'done'
</script>
"""


def shrink(src: str, width: int, crop: str | None, dpr: float, out: str) -> None:
    data = open(src, 'rb').read()
    result: list[bytes] = []
    done = threading.Event()

    class H(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def do_GET(self):
            body = data if self.path.startswith('/in.png') else PAGE.encode()
            kind = 'image/png' if self.path.startswith('/in.png') else 'text/html'
            self.send_response(200)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0))
            payload = self.rfile.read(n).decode()
            result.append(base64.b64decode(payload.split(',', 1)[1]))
            self.send_response(200); self.end_headers()
            done.set()

    srv = http.server.HTTPServer(('127.0.0.1', 0), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    qs = f'?w={width}' + (f'&crop={crop},{dpr}' if crop else '')
    profile = tempfile.mkdtemp()
    proc = subprocess.Popen(
        [CHROMIUM, '--headless=new', '--disable-gpu', '--no-sandbox',
         f'--user-data-dir={profile}', f'http://127.0.0.1:{port}/page{qs}'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(120)
    proc.kill()
    srv.shutdown()
    if not ok:
        raise SystemExit('shrink: the browser never posted a picture back')
    open(out, 'wb').write(result[0])


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {a.split('=')[0]: a.split('=', 1)[1] for a in sys.argv[1:]
             if a.startswith('--') and '=' in a}
    if not args:
        raise SystemExit(__doc__)
    src = os.path.abspath(args[0])
    width = int(args[1]) if len(args) > 1 else 900
    crop = flags.get('--crop')
    # The ratio the shot was taken at, which is what turns a CSS-pixel crop
    # into a physical-pixel one. Recovered from the filename's viewport when it
    # carries one, since every screens/realboot shot is named `...-844x390.png`.
    dpr = float(flags.get('--dpr', 0)) or 0
    if not dpr:
        import re
        m = re.search(r'-(\d+)x(\d+)\.png$', src)
        if m:
            sys.path.insert(0, os.path.dirname(HERE))
            import png
            w, _h, _d = png.read(src)
            dpr = w / int(m.group(1))
        else:
            dpr = 1
    out = src[:-4] + '-small.png'
    shrink(src, width, crop, dpr, out)
    sys.path.insert(0, os.path.dirname(HERE))
    import png
    sw, sh, _ = png.read(src)
    ow, oh, _ = png.read(out)
    print(f'{out}  {sw}x{sh}' + (f' crop {crop} @dpr {dpr:g}' if crop else '')
          + f'  -> {ow}x{oh}  {os.path.getsize(out)} bytes')


if __name__ == '__main__':
    main()
