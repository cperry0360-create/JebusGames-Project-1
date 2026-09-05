/**
 * Width and height of an image file, PNG or WebP.
 *
 * This began as a PNG-only reader inside manifest.test.ts: it read the IHDR
 * and asserted the signature, which is exactly right until an asset changes
 * format. The map plate and both full-screen backdrops went to WebP and the
 * assertion fired on a file that was perfectly valid, so it learned both
 * containers. Then sign.test.ts turned out to have a second, still PNG-only
 * copy, which failed the same way the day the whole deploy became WebP.
 *
 * Hence one reader, in one place, imported by both. It is not a `.test.ts`
 * file, so `node --test 'tests/*.test.ts'` does not try to run it.
 */
export function imageSize(buf: Buffer, path: string): [number, number] {
  if (buf.readUInt32BE(0) === 0x89504e47) {
    // PNG: IHDR is always the first chunk, width and height at 16 and 20.
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  }
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${path} is neither PNG nor WebP`)
  if (buf.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${path} is a RIFF but not a WebP`)
  // Walk the chunks rather than assuming the first one carries the size: an
  // encoder is free to put ICC or EXIF ahead of the image data.
  let at = 12
  while (at + 8 <= buf.length) {
    const tag = buf.toString('ascii', at, at + 4)
    const size = buf.readUInt32LE(at + 4)
    const body = at + 8
    if (tag === 'VP8X') {
      // Extended: canvas size as two 24-bit little-endian values, minus one.
      return [buf.readUIntLE(body + 4, 3) + 1, buf.readUIntLE(body + 7, 3) + 1]
    }
    if (tag === 'VP8 ') {
      // Lossy: a 3-byte frame tag, a 3-byte start code, then 14-bit w and h.
      return [buf.readUInt16LE(body + 6) & 0x3fff, buf.readUInt16LE(body + 8) & 0x3fff]
    }
    if (tag === 'VP8L') {
      // Lossless: 1-byte signature, then 14 bits of w-1 and 14 bits of h-1.
      const bits = buf.readUInt32LE(body + 1)
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
    }
    at = body + size + (size % 2)
  }
  throw new Error(`${path} is a WebP with no image chunk`)
}
