import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { placeSign } from '../src/systems/SignPlacement.ts'

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

test('each canvas is authored to the aspect of its board, so words do not stretch', () => {
  // The reason this is worth asserting: the placement stretches the texture to
  // the rectangle unconditionally. A canvas at the wrong aspect is not caught
  // by anything else — it just draws squashed, and looks like a bad font.
  const cases: Array<[string, string]> = [
    ['signDefault', 'held'], ['signBribed', 'held'], ['signTavern', 'tavern'],
  ]
  for (const [role, board] of cases) {
    const [w, h] = pngSize(url(`../public/${art.assetRoot}${art.files[art.prop[role]]}`).pathname)
    const b = map.signs[board]
    const want = (b.size[0] * display.width) / (b.size[1] * display.height)
    const got = w / h
    assert.ok(Math.abs(got - want) / want < 0.02,
      `${role} is ${w}x${h} (aspect ${got.toFixed(3)}) but the ${board} board is ` +
      `${want.toFixed(3)}; the lettering would draw stretched`)
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
