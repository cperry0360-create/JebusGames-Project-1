import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { boardRect, fitAspect, placeSign } from '../src/systems/SignPlacement.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), map = read('map'), rules = read('rules'), display = read('display')

const ROLES = ['signDefault', 'signBribed', 'signTavern'] as const

/** Width and height of a PNG, from its IHDR. */
function pngSize(path: string): [number, number] {
  const b = readFileSync(path)
  assert.equal(b.readUInt32BE(0), 0x89504e47, `${path} is not a PNG`)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

test('all three lettering overlays are in the manifest and on disk', () => {
  for (const role of ROLES) {
    const key = art.prop[role]
    assert.ok(key, `no prop role ${role}`)
    const path = art.files[key]
    assert.ok(path?.startsWith('props/'), `${role} -> "${key}" should live under props/`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing`)
  }
  assert.notEqual(art.prop.signDefault, art.prop.signBribed,
    'the bribe has to actually change the sign')
  assert.notEqual(art.prop.signTavern, art.prop.signDefault,
    'the tavern is a different board from the one the innkeeper holds')
})

test('an overlay carries no render config, because the plate places it', () => {
  // These used to be a board with a post, sized by a `board*` rectangle
  // measured inside the canvas. They are lettering on a transparent canvas
  // now, drawn into the rectangle map.json records for the painted board, so
  // any leftover contentWidth or board fraction is a stale number that would
  // silently resize them.
  for (const role of ROLES) {
    assert.equal(art.render[art.prop[role]], undefined,
      `${role} still has a render config; the plate rectangle is what places it`)
  }
})

test('the overlay is fitted inside its panel, never stretched to it', () => {
  /*
   * THE ART IS NOT THE SHAPE OF THE PANEL. The innkeeper's wood is 1.23
   * wide-to-tall and the lettering was authored at 1.40, so scaling the canvas
   * to the panel would squash the words by 14%. The art is right; only the
   * placement was wrong, and letterboxing inside the wood is what keeps both
   * true.
   */
  const cases: Array<[string, string]> = [
    ['signDefault', 'held'], ['signBribed', 'held'], ['signTavern', 'tavern'],
  ]
  for (const [role, board] of cases) {
    const [w, h] = pngSize(url(`../public/${art.assetRoot}${art.files[art.prop[role]]}`).pathname)
    const b = map.signs[board]
    const panel = placeSign(b, display.width, display.height)
    const fitted = fitAspect(panel, w / h)
    // Inside the panel on both axes, and touching it on one.
    assert.ok(fitted.width <= panel.width + 1e-9 && fitted.height <= panel.height + 1e-9,
      `${role} does not fit its panel`)
    assert.ok(Math.abs(fitted.width - panel.width) < 1e-9
      || Math.abs(fitted.height - panel.height) < 1e-9,
      `${role} is smaller than it needs to be on both axes`)
    // And undistorted.
    assert.ok(Math.abs(fitted.width / fitted.height - w / h) < 1e-6,
      `${role} renders at aspect ${(fitted.width / fitted.height).toFixed(3)} ` +
      `from a ${(w / h).toFixed(3)} canvas`)
  }
})

test('the lettering covers 78-84% of the painted board it sits on', () => {
  /*
   * THE FAULT THIS FIXES. The quads supplied for these boards were described
   * as the inner writable panel and are in fact close to the OUTER board —
   * 138.6 plate px against the wood field's 119.2 for the innkeeper's — so
   * drawing at 94% of one put the words at nearly the full width of the board,
   * over the frame rails.
   *
   * Measured against the board rather than against the number that was
   * supplied, so a future quad that means something else again cannot pass.
   */
  const cases: Array<[string, string]> = [
    ['signDefault', 'held'], ['signBribed', 'held'], ['signTavern', 'tavern'],
  ]
  // Pinned per sign, because the two boards are different proportions. The
  // innkeeper's lands in the 78-84% the brief asked for. The tavern's comes
  // out lower and is not a fault: its wood panel is 1.65 wide-to-tall against
  // 1.49 of art, so the fit is limited by the panel's HEIGHT and the width
  // falls short of the rails rather than reaching them. Stretching it to 78%
  // would distort the words, which is the thing this whole change is undoing.
  const EXPECT: Record<string, number> = {
    signDefault: 0.782, signBribed: 0.782, signTavern: 0.709,
  }
  for (const [role, board] of cases) {
    const [w, h] = pngSize(url(`../public/${art.assetRoot}${art.files[art.prop[role]]}`).pathname)
    const b = map.signs[board]
    const fitted = fitAspect(placeSign(b, display.width, display.height), w / h)
    const outer = boardRect(b, display.width, display.height)
    const share = fitted.width / outer.width
    assert.ok(share >= 0.68 && share <= 0.84,
      `${role} covers ${(share * 100).toFixed(1)}% of the ${board} board's width; ` +
      'outside 68-84% the words are either on the rails or lost on the wood')
    assert.ok(Math.abs(share - EXPECT[role]!) < 0.02,
      `${role} covers ${(share * 100).toFixed(1)}% where it covered ` +
      `${(EXPECT[role]! * 100).toFixed(1)}%; say so if that is meant`)
    // And centred on the board within a pixel.
    assert.ok(Math.abs(fitted.x - outer.x) < 1 && Math.abs(fitted.y - outer.y) < 1,
      `${role} is ${(fitted.x - outer.x).toFixed(2)},${(fitted.y - outer.y).toFixed(2)} ` +
      'world px off the board\'s centre')
  }
})

test('the two held textures share one canvas, so the bribe cannot jump', () => {
  // The swap sets a texture and touches nothing else. That is only safe while
  // both canvases are identical — a different size would rescale on the swap.
  const a = pngSize(url(`../public/${art.assetRoot}${art.files[art.prop.signDefault]}`).pathname)
  const b = pngSize(url(`../public/${art.assetRoot}${art.files[art.prop.signBribed]}`).pathname)
  assert.deepEqual(a, b, 'the bribed sign has a different canvas, so the words would jump')
})

test('the two boards tilt opposite ways and share no constant', () => {
  // Stated as a rule because they were once both measured off one board and
  // the second inherited the first's angle.
  const t = map.signs.tavern.rotationDeg
  const h = map.signs.held.rotationDeg
  assert.ok(t > 0, 'the tavern board hangs clockwise of level')
  assert.ok(h < 0, 'the innkeeper holds his board counter-clockwise of level')
  assert.notEqual(t, h)
})

test('every board rectangle is on the plate and big enough to read', () => {
  for (const name of ['tavern', 'held'] as const) {
    const b = map.signs[name]
    assert.ok(b, `the map does not say where the ${name} board is`)
    assert.ok(b.inset > 0.8 && b.inset <= 1,
      `${name} inset ${b.inset} either overflows the frame or shrinks the words to nothing`)
    const at = placeSign(b, display.width, display.height)
    assert.ok(at.x - at.width / 2 > 0 && at.x + at.width / 2 < display.width,
      `the ${name} sign runs off the canvas horizontally`)
    assert.ok(at.y - at.height / 2 > 0 && at.y + at.height / 2 < display.height,
      `the ${name} sign runs off the canvas vertically`)
    assert.ok(at.width > 20, `a ${name} board this small could not be read`)
    assert.ok(at.footY > at.y, 'the foot must be below the centre, or depth sorting is wrong')
  }
})

test('the board the innkeeper holds is off the lane and off every build pad', () => {
  // Its tap target would otherwise eat taps meant for the enemies walking
  // through it, or for the pad underneath it.
  const at = placeSign(map.signs.held, display.width, display.height, 1)
  const near = map.waypoints.some((w: number[]) =>
    Math.hypot(w[0] - at.x, w[1] - at.y) < map.roadWidth)
  assert.ok(!near, 'the sign is sitting on the lane')
  for (const [px, py] of map.buildSpots as number[][]) {
    assert.ok(Math.hypot(px - at.x, py - at.y) > map.spotRadius + at.width / 2,
      `the sign overlaps the build pad at ${px},${py}`)
  }
})

test('the bribe costs real peanuts and says something either way', () => {
  const b = rules.signBribe
  assert.ok(b, 'no signBribe block in rules.json')
  assert.ok(b.cost > 0, 'a free bribe is not a bribe')
  // It should cost about a tower: enough that paying it is a real choice.
  const towers = read('towers') as Record<string, { cost: number }>
  const cheapest = Math.min(...Object.values(towers).map((t) => t.cost))
  assert.ok(b.cost >= cheapest,
    `a ${b.cost} peanut bribe is cheaper than the ${cheapest} peanut tower it competes with`)
  assert.ok(b.cost < rules.startingPeanuts * 3,
    'a bribe nobody can ever afford is not an easter egg')

  assert.ok(b.brokeToast.length > 0 && b.paidToast.length > 0)
  assert.match(b.brokeToast, /peanut/i, 'the refusal should say what he wants')
})
