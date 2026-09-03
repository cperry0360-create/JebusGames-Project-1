import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { placeSign, type SignBoard } from '../src/systems/SignPlacement.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const map = read('map'), display = read('display')

const board = (over: Partial<SignBoard> = {}): SignBoard => ({
  centre: [0.5, 0.5], size: [0.1, 0.05], rotationDeg: 0, inset: 1, ...over,
})

test('fractions become world units against the plate, whatever its resolution', () => {
  // The whole reason the plate records fractions: the art has already been
  // re-exported twice, from 1672x941 to 3840x2160, and a sign measured in
  // source pixels would have moved both times.
  const b = board({ centre: [0.25, 0.75], size: [0.2, 0.1] })
  const a = placeSign(b, 1280, 720)
  assert.equal(a.x, 320)
  assert.equal(a.y, 540)
  assert.equal(a.width, 256)
  assert.equal(a.height, 72)
})

test('inset shrinks about the centre, so the words stay on the board', () => {
  const b = board({ inset: 0.94 })
  const full = placeSign(b, 1000, 1000, 1)
  const inset = placeSign(b, 1000, 1000)
  assert.equal(inset.x, full.x)
  assert.equal(inset.y, full.y)
  assert.ok(Math.abs(inset.width - full.width * 0.94) < 1e-9)
  assert.ok(Math.abs(inset.height - full.height * 0.94) < 1e-9)
})

test('rotation is handed over in radians and keeps its sign', () => {
  // The two boards tilt opposite ways. A helper that took an absolute angle,
  // or normalised into [0, 2pi), would put one of them upside down of true.
  assert.ok(placeSign(board({ rotationDeg: 10.3 }), 100, 100).rotationRad > 0)
  assert.ok(placeSign(board({ rotationDeg: -6.65 }), 100, 100).rotationRad < 0)
  assert.ok(Math.abs(placeSign(board({ rotationDeg: 180 }), 100, 100).rotationRad - Math.PI) < 1e-9)
})

test('the foot is the lowest point of the ROTATED rectangle, not the upright one', () => {
  // Depth sorting reads this. A tilted board hangs lower than its own height,
  // and using the upright half-height would sort it in front of something it
  // is actually behind.
  const flat = placeSign(board({ rotationDeg: 0, size: [0.4, 0.1] }), 100, 100)
  const tilted = placeSign(board({ rotationDeg: 30, size: [0.4, 0.1] }), 100, 100)
  assert.equal(flat.footY, flat.y + flat.height / 2)
  assert.ok(tilted.footY > flat.footY,
    'a tilted board reaches lower than a level one of the same size')
  // A quarter turn swaps the two extents outright.
  const turned = placeSign(board({ rotationDeg: 90, size: [0.4, 0.1] }), 100, 100)
  assert.ok(Math.abs((turned.footY - turned.y) - turned.width / 2) < 1e-9)
})

test('both boards on the real map land where the plate says', () => {
  // The numbers the art was measured against, pinned so a re-trace that moves
  // a sign has to say so out loud.
  // Moved when the rectangles were re-measured off the plate: the quads that
  // were supplied describe the outer board rather than the wood inside it.
  const held = placeSign(map.signs.held, display.width, display.height)
  assert.ok(Math.abs(held.x - 893.6) < 0.5, `held centre x is ${held.x.toFixed(1)}`)
  assert.ok(Math.abs(held.y - 202.4) < 0.5, `held centre y is ${held.y.toFixed(1)}`)

  const tavern = placeSign(map.signs.tavern, display.width, display.height)
  assert.ok(Math.abs(tavern.x - 953.3) < 0.5, `tavern centre x is ${tavern.x.toFixed(1)}`)
  assert.ok(Math.abs(tavern.y - 138.9) < 0.5, `tavern centre y is ${tavern.y.toFixed(1)}`)

  // The tavern's board hangs from a beam well above the innkeeper, so it must
  // sort behind him rather than in front.
  assert.ok(tavern.footY < held.footY, 'the tavern board should sort behind the held one')
})

test('the recorded quad is kept as the reading it came from, not as the rect', () => {
  /*
   * THESE NO LONGER MATCH, DELIBERATELY.
   *
   * `quad` is the corner reading that was supplied for each board, described
   * as the inner writable panel. Measured off the plate it is close to the
   * OUTER board instead — 138.6 plate px against the wood field's 119.2 for
   * the innkeeper's — which is why drawing at 94% of it put the lettering at
   * nearly the full width of the board and over the rails.
   *
   * It is kept because it is the record of where the numbers came from. What
   * still has to agree is the ANGLE: the quad's top edge and the rotation the
   * engine applies are the same measurement, and if those ever part company
   * one of them was re-read and the other was not.
   */
  const W = display.width, H = display.height
  for (const name of ['tavern', 'held'] as const) {
    const b = map.signs[name]
    const q = b.quad as number[][]
    const dx = (q[1]![0]! - q[0]![0]!) * W
    const dy = (q[1]![1]! - q[0]![1]!) * H
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI
    assert.ok(Math.abs(deg - b.rotationDeg) < 0.5,
      `${name} records ${b.rotationDeg} degrees but its quad's top edge is ${deg.toFixed(2)}`)
    // And the quad really is the bigger rectangle, which is the finding.
    const qw = Math.hypot(dx, dy)
    assert.ok(qw > b.size[0] * W,
      `${name}'s quad is no wider than its wood panel; re-check which is which`)
  }
})
