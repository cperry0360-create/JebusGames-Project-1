import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), map = read('map'), rules = read('rules'), display = read('display')

test('both signboards are in the manifest and on disk', () => {
  for (const role of ['signDefault', 'signBribed'] as const) {
    const key = art.prop[role]
    assert.ok(key, `no prop role ${role}`)
    const path = art.files[key]
    assert.ok(path?.startsWith('props/'), `${role} -> "${key}" should live under props/`)
    assert.ok(existsSync(url(`../public/${art.assetRoot}${path}`)), `${key} -> ${path} is missing`)
  }
  assert.notEqual(art.prop.signDefault, art.prop.signBribed,
    'the bribe has to actually change the sign')
})

test('each signboard carries its measured board rectangle', () => {
  // The sprites are a board with a post below it, and the post is the part the
  // villager's hand covers. Placing by the canvas would hang the board wrong.
  for (const role of ['signDefault', 'signBribed'] as const) {
    const cfg = art.render[art.prop[role]]
    assert.ok(cfg, `no render config for ${role}`)
    for (const f of ['boardLeft', 'boardRight', 'boardTop', 'boardBottom'] as const) {
      assert.equal(typeof cfg[f], 'number', `${role} is missing ${f}`)
    }
    assert.ok(cfg.boardRight > cfg.boardLeft, `${role} has an inside-out board`)
    assert.ok(cfg.boardBottom > cfg.boardTop, `${role} has an inside-out board`)
    // The post hangs below the board, so the board cannot be the whole canvas.
    assert.ok(cfg.boardBottom < 0.95, `${role} leaves no room for its post`)
  }
})

test('the two signs hang the same way, so the swap does not jump', () => {
  const a = art.render[art.prop.signDefault]
  const b = art.render[art.prop.signBribed]
  const centre = (c: typeof a) => [(c.boardLeft + c.boardRight) / 2, (c.boardTop + c.boardBottom) / 2]
  const [ax, ay] = centre(a)
  const [bx, by] = centre(b)
  assert.ok(Math.abs(ax - bx) < 0.03 && Math.abs(ay - by) < 0.03,
    'the boards sit in different places in their canvases, so the sign would jump on swap')
})

test('the sign sits on the map, near the tavern, and off the lane', () => {
  const s = map.sign
  assert.ok(s, 'the map does not say where the villager is')
  assert.ok(s.x > 0 && s.x < display.width, 'the sign is off the canvas horizontally')
  assert.ok(s.y > 0 && s.y < display.height, 'the sign is off the canvas vertically')
  assert.ok(s.boardWidth > 20, 'a board this small could not be read or tapped')

  // It must not sit on the lane, or its tap target would eat clicks meant for
  // the enemies walking through it.
  const near = map.waypoints.some((w: number[]) =>
    Math.hypot(w[0] - s.x, w[1] - s.y) < map.roadWidth)
  assert.ok(!near, 'the sign is sitting on the lane')

  // Nor on a build pad, for the same reason.
  for (const [px, py] of map.buildSpots as number[][]) {
    assert.ok(Math.hypot(px - s.x, py - s.y) > map.spotRadius + s.boardWidth / 2,
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
