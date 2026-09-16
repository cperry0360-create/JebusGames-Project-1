"""Slices every comic strip on the plan and publishes the panels as WebP.

    python3 tools/comics/publish.py [quality]

THE PLAN IS `tools/comics/plan.json`, which pairs a source strip in
art-source/cutscenes/ with the base name its panels take under
public/assets/cutscenes/. Nothing here decides where a panel PLAYS -- that is
src/data/cutscenes.json, and it is the only file that knows.

Two passes, because there is no WebP encoder in this environment. The slices
are written as PNG under tools/comics/tmp/ (gitignored), and Chromium encodes
them the way tools/reencode does. The PNGs are thrown away afterwards: they are
reproducible from the strip and the cut columns, and 36 of them is 100 MB.

Prints the size and the PSNR of every panel, so "no visible loss" is a
measurement.
"""
import http.server, json, os, subprocess, sys, threading, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..'))
import slice as S

TMP = os.path.join(HERE, 'tmp')
DEST = os.path.join(ROOT, 'public', 'assets', 'cutscenes')
PLAN = os.path.join(HERE, 'plan.json')


def build(plan):
    """Cuts every strip and returns the encode jobs, one per panel."""
    jobs = []
    os.makedirs(TMP, exist_ok=True)
    for entry in plan['strips']:
        src = os.path.join(ROOT, entry['source'])
        w, h, gutters, spans = S.cuts(src)
        assert len(spans) == entry['panels'], (
            f"{entry['source']}: measured {len(spans)} panels, plan says {entry['panels']}")
        entry['measured'] = {
            'size': f'{w}x{h}',
            'gutters': [list(g) for g in gutters],
            'panels': [[a, b] for a, b in spans],
        }
        for n, (a, b) in enumerate(spans, 1):
            name = f"{entry['name']}_{n:02d}"
            png_at = os.path.join(TMP, name + '.png')
            if not os.path.exists(png_at):
                S.cut(src, png_at, a, b)
            jobs.append({
                'png': os.path.relpath(png_at, ROOT),
                'webp': f'cutscenes/{name}.webp',
            })
            print(f'  cut {name}  x {a}..{b}  {b - a + 1}x{h}', flush=True)
    return jobs


def encode(jobs, quality):
    """One Chromium launch for the lot."""
    done = threading.Event()
    results = []

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=ROOT, **k)

        def log_message(self, *a):
            pass

        def do_GET(self):
            if self.path == '/jobs':
                body = json.dumps(jobs).encode()
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
                rel = urllib.parse.parse_qs(query)['path'][0]
                at = os.path.join(ROOT, 'public', 'assets', rel)
                os.makedirs(os.path.dirname(at), exist_ok=True)
                open(at, 'wb').write(body)
            elif path == '/log':
                print('  ' + body.decode('utf8', 'replace'), flush=True)
            elif path == '/done':
                results.append(json.loads(body))
                done.set()
            self.send_response(204)
            self.end_headers()

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8903), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    chrome = subprocess.Popen([
        os.environ.get('CHROMIUM', '/opt/pw-browsers/chromium'),
        '--headless=new', '--disable-gpu', '--no-sandbox', '--force-color-profile=srgb',
        '--user-data-dir=' + os.path.join(HERE, 'profile'),
        f'http://127.0.0.1:8903/tools/comics/index.html?q={quality}',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(timeout=1800)
    srv.shutdown()
    chrome.terminate()
    assert ok, 'the encoder never finished'
    return results[0]


if __name__ == '__main__':
    quality = int(sys.argv[1]) if len(sys.argv) > 1 else 90
    plan = json.load(open(PLAN))
    jobs = build(plan)
    print(f'{len(jobs)} panels at q{quality}', flush=True)
    results = encode(jobs, quality)
    total = sum(r['bytes'] for r in results)
    print(f'TOTAL {total / 1e6:.2f} MB across {len(results)} panels', flush=True)
    worst = min(results, key=lambda r: r['psnr'])
    print(f"worst PSNR {worst['psnr']:.1f} dB on {worst['webp']}", flush=True)
    json.dump({'quality': quality, 'panels': results, 'strips': plan['strips']},
              open(os.path.join(HERE, 'last-run.json'), 'w'), indent=1)
