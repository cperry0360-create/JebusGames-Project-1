"""Minimal PNG read/write on stdlib zlib. Enough for Kenney's sprite PNGs."""
import zlib, struct

def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc: return a
    if pb <= pc: return b
    return c

def read(path):
    """Returns (w, h, bytearray RGBA)."""
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path
    pos, idat, plte, trns = 8, b'', None, None
    w = h = depth = ctype = None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos+4])[0]
        typ = d[pos+4:pos+8]
        body = d[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8, f'bit depth {depth} unsupported'
        elif typ == b'PLTE': plte = body
        elif typ == b'tRNS': trns = body
        elif typ == b'IDAT': idat += body
        elif typ == b'IEND': break
        pos += 12 + ln
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)

    def unfilter(data, off, pw, ph):
        """Decodes one non-interlaced image (or one Adam7 pass)."""
        stride = pw * ch
        out = bytearray(stride * ph)
        prev = bytearray(stride)
        p = off
        for y in range(ph):
            f = data[p]; p += 1
            line = bytearray(data[p:p+stride]); p += stride
            if f == 1:
                for i in range(ch, stride): line[i] = (line[i] + line[i-ch]) & 255
            elif f == 2:
                for i in range(stride): line[i] = (line[i] + prev[i]) & 255
            elif f == 3:
                for i in range(stride):
                    a = line[i-ch] if i >= ch else 0
                    line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
            elif f == 4:
                for i in range(stride):
                    a = line[i-ch] if i >= ch else 0
                    c = prev[i-ch] if i >= ch else 0
                    line[i] = (line[i] + _paeth(a, prev[i], c)) & 255
            out[y*stride:(y+1)*stride] = line
            prev = line
        return out, p

    pixels = bytearray(w * h * ch)
    if interlace == 0:
        pixels, _ = unfilter(raw, 0, w, h)
    else:
        # Adam7: seven passes, each filtered independently.
        XS = (0, 4, 0, 2, 0, 1, 0)
        YS = (0, 0, 4, 0, 2, 0, 1)
        XI = (8, 8, 4, 4, 2, 2, 1)
        YI = (8, 8, 8, 4, 4, 2, 2)
        off = 0
        for pas in range(7):
            pw = (w - XS[pas] + XI[pas] - 1) // XI[pas]
            ph = (h - YS[pas] + YI[pas] - 1) // YI[pas]
            if pw <= 0 or ph <= 0:
                continue
            sub, off = unfilter(raw, off, pw, ph)
            for y in range(ph):
                iy = YS[pas] + y * YI[pas]
                for x in range(pw):
                    ix = XS[pas] + x * XI[pas]
                    si = (y * pw + x) * ch
                    di = (iy * w + ix) * ch
                    pixels[di:di+ch] = sub[si:si+ch]

    # normalise to RGBA
    rgba = bytearray(w * h * 4)
    for i in range(w * h):
        if ctype == 6:
            rgba[i*4:i*4+4] = pixels[i*4:i*4+4]
        elif ctype == 2:
            rgba[i*4:i*4+3] = pixels[i*3:i*3+3]; rgba[i*4+3] = 255
        elif ctype == 0:
            v = pixels[i]; rgba[i*4:i*4+3] = bytes([v,v,v]); rgba[i*4+3] = 255
        elif ctype == 4:
            v = pixels[i*2]; rgba[i*4:i*4+3] = bytes([v,v,v]); rgba[i*4+3] = pixels[i*2+1]
        elif ctype == 3:
            idx = pixels[i]
            rgba[i*4:i*4+3] = plte[idx*3:idx*3+3]
            rgba[i*4+3] = trns[idx] if trns and idx < len(trns) else 255
    return w, h, rgba

# Above this many pixels, `write` PAETH-FILTERS the rows and compresses hard.
#
# WHY IT IS A THRESHOLD AND NOT ALWAYS ON. This writer emitted filter type 0 --
# no filtering at all -- on every row, which is fine for the debug overlays it
# was written for and catastrophic for a 3840x2160 painted plate: re-encoding
# level 9's map came out at 14.9 MB against the 7.7 MB the art tool had
# produced, because unfiltered PNG cannot exploit the vertical coherence in a
# painting. Measured on that plate: filter 0 at level 9 is 14.9 MB, Sub 11.2,
# Up 9.8 and PAETH 9.0. Paeth costs 36 seconds of pure Python, which is nothing
# once per re-paint and a great deal on the hundred small overlays the measuring
# tools write, so it is spent only where it pays.
BIG = 4_000_000


def write(path, w, h, rgba):
    stride = w * 4
    raw = bytearray()
    if w * h >= BIG:
        prev = bytes(stride)
        for y in range(h):
            row = bytes(rgba[y*stride:(y+1)*stride])
            out = bytearray(stride)
            for i in range(stride):
                a = row[i-4] if i >= 4 else 0
                b = prev[i]
                c = prev[i-4] if i >= 4 else 0
                pp = a + b - c
                pa, pb, pc = abs(pp-a), abs(pp-b), abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                out[i] = (row[i] - pr) & 255
            raw.append(4)
            raw += out
            prev = row
        level = 9
    else:
        for y in range(h):
            raw.append(0)
            raw += rgba[y*stride:(y+1)*stride]
        level = 6
    def chunk(t, b):
        return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), level))
    png += chunk(b'IEND', b'')
    open(path, 'wb').write(png)

def size(path):
    d = open(path, 'rb').read(33)
    return struct.unpack('>II', d[16:24])
