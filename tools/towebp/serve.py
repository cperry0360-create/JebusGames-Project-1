"""Serves the repository and takes back what the page encodes.

Run via run.sh. The page does the encoding -- Chromium's libwebp is the only
WebP encoder in this environment, the same library cwebp would call -- and this
only holds the files still, writes the results down, and keeps the tally.
"""
import http.server, json, os, sys, threading, urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
DONE = threading.Event()
TARGETS = sys.argv[2:] if len(sys.argv) > 2 else []


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == '/list':
            body = json.dumps(TARGETS).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        path, _, query = self.path.partition('?')
        if path == '/save':
            rel = urllib.parse.parse_qs(query)['path'][0]
            # Never let the page write outside the repository.
            dest = os.path.abspath(os.path.join(ROOT, rel))
            assert dest.startswith(ROOT + os.sep), dest
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, 'wb').write(body)
        elif path == '/log':
            print('  ' + body.decode('utf8', 'replace'), flush=True)
        elif path == '/done':
            open(os.path.join(HERE, 'report.json'), 'wb').write(body)
            DONE.set()
        self.send_response(204)
        self.end_headers()


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8902), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
if not DONE.wait(timeout=float(sys.argv[1]) if len(sys.argv) > 1 else 900):
    print('TIMEOUT: the page never finished', flush=True)
    srv.shutdown()
    sys.exit(1)
srv.shutdown()
