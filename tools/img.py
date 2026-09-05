"""Reads an image for the measuring tools, whatever container it ships in.

`tools/png.py` reads PNG and only PNG. Every sprite ships as WebP now, so
`measure_art.py` would have gone blind the moment the art was re-encoded --
and rule 7 in CLAUDE.md says to run it after every re-export, so a blind
measuring tool is a rule nobody can follow.

There is no WebP decoder in this environment: no PIL, no ImageMagick, no
cwebp, and every package registry answers 403. Chromium is the decoder, the
same way tools/reencode and tools/decode already use it as a codec. It decodes
through WebCodecs' ImageDecoder rather than through a canvas, because a canvas
stores premultiplied alpha and un-premultiplying on the way out moves the
colour of every semi-transparent pixel. These numbers are measured off those
pixels, so the decode has to be exact.

Decodes are cached under tools/.imgcache/ (gitignored). The first miss decodes
EVERY WebP in the tree in one browser launch: starting Chromium once per file
would take minutes, and the callers here read most of the art anyway.
"""
import http.server, os, subprocess, sys, threading, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(HERE, '.imgcache')
sys.path.insert(0, HERE)
import png

PAGE = r"""<!doctype html><meta charset="utf-8"><title>decode</title><body><script type="module">
const list = await (await fetch('/list')).json()
for (const src of list) {
  const data = await (await fetch('/' + src)).arrayBuffer()
  const dec = new ImageDecoder({ data, type: 'image/webp' })
  const { image } = await dec.decode()
  // RGBA, unpremultiplied, straight out of libwebp. No canvas in the path.
  const buf = new Uint8Array(image.allocationSize({ format: 'RGBA' }))
  await image.copyTo(buf, { format: 'RGBA' })
  await fetch('/save?path=' + encodeURIComponent(src)
    + '&w=' + image.displayWidth + '&h=' + image.displayHeight,
    { method: 'POST', body: buf })
  image.close()
}
await fetch('/done', { method: 'POST', body: 'ok' })
</script></body>
"""


def cache_path(path):
    rel = os.path.relpath(os.path.abspath(path), ROOT)
    return os.path.join(CACHE, rel.replace(os.sep, '__') + '.png')


def read(path):
    """Returns (w, h, bytearray RGBA) for a PNG or a WebP."""
    if path.lower().endswith('.png'):
        return png.read(path)
    dest = cache_path(path)
    if not os.path.exists(dest):
        decode_all()
    assert os.path.exists(dest), f'{path} was not decoded; see tools/img.py'
    return png.read(dest)


def every_webp():
    out = []
    for base in ('public/assets', 'art-source'):
        for r, _, files in os.walk(os.path.join(ROOT, base)):
            for n in files:
                if n.lower().endswith('.webp'):
                    out.append(os.path.relpath(os.path.join(r, n), ROOT))
    return sorted(out)


def decode_all(paths=None):
    """Decodes every WebP that is not already cached, in one browser launch."""
    todo = [p for p in (paths or every_webp()) if not os.path.exists(cache_path(p))]
    if not todo:
        return
    os.makedirs(CACHE, exist_ok=True)
    done = threading.Event()

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ROOT, **k)

        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path == '/page':
                body = PAGE.encode()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == '/list':
                import json
                body = json.dumps(todo).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                super().do_GET()

        def do_POST(self):
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            path, _, query = self.path.partition('?')
            if path == '/save':
                q = urllib.parse.parse_qs(query)
                src = q['path'][0]
                w, h = int(q['w'][0]), int(q['h'][0])
                assert len(body) == w * h * 4, f'{src}: {len(body)} bytes for {w}x{h}'
                png.write(cache_path(src), w, h, bytearray(body))
            elif path == '/done':
                done.set()
            self.send_response(204)
            self.end_headers()

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8903), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    chrome = subprocess.Popen(
        [os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium'), '--headless=new',
         '--disable-gpu', '--no-sandbox', '--force-color-profile=srgb',
         '--user-data-dir=' + os.path.join(CACHE, 'profile'),
         'http://127.0.0.1:8903/page'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(timeout=900)
    chrome.terminate()
    srv.shutdown()
    assert ok, 'the decoder page never finished'


if __name__ == '__main__':
    decode_all(sys.argv[1:] or None)
    print(f'decoded into {CACHE}')
