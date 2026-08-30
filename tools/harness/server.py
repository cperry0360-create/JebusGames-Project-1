"""Static files, plus POST endpoints so the page can save its own screenshots.

Running the game in real time and letting it upload frames avoids headless
Chromium's virtual clock entirely, which never advanced Phaser's TimeStep.
"""
import base64, http.server, os, sys, threading

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stage')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)
DONE = threading.Event()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n)
        if self.path.startswith('/shot/'):
            name = os.path.basename(self.path[6:])
            data = body.split(b',', 1)[-1]
            open(os.path.join(OUT, name + '.png'), 'wb').write(base64.b64decode(data))
            print('  shot: ' + name + '.png', flush=True)
        elif self.path == '/done':
            open(os.path.join(OUT, 'report.json'), 'wb').write(body)
            print(body.decode('utf8', 'replace'), flush=True)
            DONE.set()
        elif self.path == '/log':
            print('  ' + body.decode('utf8', 'replace'), flush=True)
        self.send_response(204)
        self.end_headers()


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8899), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
if len(sys.argv) > 1 and sys.argv[1] == 'wait':
    ok = DONE.wait(timeout=float(sys.argv[2]) if len(sys.argv) > 2 else 180)
    if not ok:
        print('TIMEOUT: page never posted /done', flush=True)
    srv.shutdown()
else:
    threading.Event().wait()
