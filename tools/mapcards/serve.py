"""Serves the repository and takes back what the page encodes.

Run via reencode.sh. The page does the encoding; this only holds the files
still and writes the results down.
"""
import http.server, os, sys, threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.environ.get("DECODE_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
os.makedirs(OUT, exist_ok=True)
DONE = threading.Event()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if self.path.startswith('/save/'):
            name = os.path.basename(self.path[6:])
            open(os.path.join(OUT, name), 'wb').write(body)
        elif self.path == '/log':
            print('  ' + body.decode('utf8', 'replace'), flush=True)
        elif self.path == '/done':
            open(os.path.join(OUT, 'report.json'), 'wb').write(body)
            DONE.set()
        self.send_response(204)
        self.end_headers()


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8901), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
if not DONE.wait(timeout=float(sys.argv[1]) if len(sys.argv) > 1 else 300):
    print('TIMEOUT: the page never finished', flush=True)
srv.shutdown()
