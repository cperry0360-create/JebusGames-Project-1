"""Static files, plus POST endpoints so the page can save its own screenshots.

Running the game in real time and letting it upload frames avoids headless
Chromium's virtual clock entirely, which never advanced Phaser's TimeStep.
"""
import base64, http.server, json, os, sys, threading

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'stage')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots')
os.makedirs(OUT, exist_ok=True)
DONE = threading.Event()


class _Slice:
    """Just enough file to hand copyfile the requested bytes and no more."""

    def __init__(self, f, n):
        self.f, self.n = f, n

    def read(self, size=-1):
        if self.n <= 0:
            return b''
        want = self.n if size is None or size < 0 else min(size, self.n)
        data = self.f.read(want)
        self.n -= len(data)
        return data

    def close(self):
        self.f.close()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def send_head(self):
        """Serve byte ranges, because the real host does.

        SimpleHTTPRequestHandler answers every GET with 200 and the whole file.
        A browser asked to SEEK inside a media element issues a range request
        for the new position, and a server that replies 200 to it leaves the
        element unable to move — which looked exactly like the loop seam never
        arriving, when in fact the track had never been seeked at all.

        GitHub Pages serves ranges. This makes the harness serve them too.
        """
        rng = self.headers.get('Range')
        if not rng or not rng.startswith('bytes='):
            return super().send_head()
        path = self.translate_path(self.path)
        if os.path.isdir(path) or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        first, _, last = rng[len('bytes='):].partition('-')
        try:
            start = int(first) if first else max(0, size - int(last))
            end = int(last) if (last and first) else size - 1
        except ValueError:
            return super().send_head()
        end = min(end, size - 1)
        if start > end:
            self.send_response(416)
            self.send_header('Content-Range', 'bytes */%d' % size)
            self.end_headers()
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        return _Slice(f, end - start + 1)


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
    srv.shutdown()
    # THE OTHER HALF OF THE GUARD -- see the note on `directorError` in
    # index.html. A scenario that threw, or one that never finished at all,
    # has to come back as a non-zero exit or `run.sh` reports success for a
    # run that asserted nothing. This is what stops that class recurring.
    if not ok:
        print('TIMEOUT: page never posted /done', flush=True)
        sys.exit(2)
    try:
        rep = json.load(open(os.path.join(OUT, 'report.json')))
    except Exception as e:                                  # noqa: BLE001
        print('UNREADABLE REPORT: %s' % e, flush=True)
        sys.exit(3)
    err = rep.get('directorError')
    if err:
        print('SCENARIO THREW: %s' % err.get('message'), flush=True)
        print(err.get('stack', ''), flush=True)
        sys.exit(1)
    if rep.get('bootFailed'):
        print('BOOT FAILED: everything in this run was forced by hand', flush=True)
        sys.exit(4)
    # A SCENARIO THAT FOUND SOMETHING MUST SAY SO IN ITS EXIT CODE.
    #
    # The throw guard above stops a scenario passing when it never ran. This
    # stops one passing when it DID run and did not like what it saw. The
    # convention across the harness is already there and was only ever printed:
    # a fault is a line starting '   *** ' and a scenario that counted any ends
    # on 'RESULT *** n faults ***'. Reading it here is what turns that
    # convention into something CI could gate on.
    #
    # A DISTINCT CODE from a throw, because they mean different things: 1 is
    # "this check is broken", 5 is "this check works and the product failed it".
    faults = [ln for ln in rep.get('log', [])
              if ln.lstrip().startswith('*** ') or ln.startswith('RESULT ***')]
    if faults:
        print('SCENARIO REPORTED FAULTS:', flush=True)
        for ln in faults[:20]:
            print('  ' + ln.strip(), flush=True)
        sys.exit(5)
else:
    threading.Event().wait()
