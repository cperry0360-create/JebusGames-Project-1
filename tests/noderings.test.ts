import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const art = read('art'), presentation = read('presentation'), map = read('map')
const D = presentation.drawer

test('a ground plate anchors on its own painted dirt', () => {
  // THE ONE MISCENTRED NODE. The DO NOT BUILD HERE pad is a dirt oval with a
  // sign planted in it, and it was anchored at 1.0 like a standing prop — so
  // its dirt drew entirely ABOVE the spot and the highlight ring, which is at
  // the spot, circled the grass underneath. Every other pad is a flat slab
  // anchored on its middle, which is why exactly one node looked wrong.
  //
  // `groundY` is the measured centre of each plate's painted ground band, and
  // the anchor has to equal it or the art and the spot part company again.
  for (const role of ['buildPad', 'buildPadQuiet'] as const) {
    const key = art.prop[role]
    assert.ok(key, `no prop role ${role}`)
    const cfg = art.render[key]
    assert.ok(cfg, `${role} has no render config`)
    assert.equal(typeof cfg.groundY, 'number', `${role} does not record its ground band`)
    assert.equal(cfg.anchorY, cfg.groundY,
      `${role} anchors at ${cfg.anchorY} but its painted ground is at ${cfg.groundY}`)
  }
})

test('the two plates anchor differently, because they are different shapes', () => {
  // A guard against someone "tidying" them to one number. The sign pad carries
  // a tall sign above its dirt and the flagstone is dirt all the way up, so
  // their ground bands are nowhere near each other.
  const a = art.render[art.prop.buildPad].groundY
  const b = art.render[art.prop.buildPadQuiet].groundY
  assert.ok(Math.abs(a - b) > 0.1,
    `both plates claim a ground band at ${a} and ${b}; one of them was copied`)
})

test('the highlight ring is a two-pass stroke, dark under bright', () => {
  // One bright stroke was legible on grass and vanished on light dirt and
  // where the ring crosses the road.
  for (const k of ['nodeRingUnder', 'nodeRingEdge', 'nodeRingFill'] as const) {
    assert.equal(typeof D[k], 'number', `${k} is missing`)
  }
  const lum = (c: number) => 0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)
  assert.ok(lum(D.nodeRingUnder) < lum(D.nodeRingEdge) - 60,
    'the under-stroke is not darker than the stroke it sits under')
})

test('every ring value pulses, so the animation is not nothing into nothing', () => {
  // The complaint was that the pulse was "a change of almost nothing into
  // almost nothing". Alphas AND both widths beat with the radius now, and a
  // range collapsed to a single value would put it back.
  const ranges = [
    'nodeRingFillAlpha', 'nodeRingEdgeAlpha', 'nodeRingEdgeWidth',
    'nodeRingUnderAlpha', 'nodeRingUnderWidth',
  ] as const
  for (const k of ranges) {
    const v = D[k]
    assert.ok(Array.isArray(v) && v.length === 2, `${k} is not a [low, high] range`)
    assert.ok(v[1] > v[0], `${k} does not move: ${JSON.stringify(v)}`)
    assert.ok(v[1] / v[0] >= 1.15,
      `${k} moves by ${((v[1] / v[0] - 1) * 100).toFixed(0)}%, which is not a pulse`)
  }
  assert.ok(D.nodePulseScale >= 0.15, 'the radius barely moves')
})

test('the ring is far stronger than the version that was invisible', () => {
  // Measured on a capture, the old settings lifted the channels 8-12 levels
  // above the grass. These are the numbers that produced 37-50 in the same
  // measurement; they are pinned as floors so a later tidy cannot walk them
  // back to the faint version without this failing.
  assert.ok(D.nodeRingEdgeAlpha[1] >= 0.6, 'the bright stroke peaks too low')
  assert.ok(D.nodeRingUnderAlpha[1] >= 0.3, 'the dark stroke peaks too low')
  assert.ok(D.nodeRingEdgeWidth[1] >= 4, 'the bright stroke never gets thick enough')
  assert.ok(D.nodeRingUnderWidth[0] > D.nodeRingEdgeWidth[1],
    'the under-stroke must be wider than the stroke on top of it, or it never shows')
})

test('the joke node is a real build pad, so it is right that it lights up', () => {
  // DO NOT BUILD HERE is a joke printed on an ordinary pad. Nothing excludes
  // it from building, so nothing should exclude it from the highlight either
  // — the ring says "this will take the tower you picked", and it will.
  assert.ok(map.buildSpots.length >= 2, 'there is only one spot to check')
  const game = readFileSync(url('../src/scenes/GameScene.ts'), 'utf8')
  const fn = game.slice(game.indexOf('private nodeTakesPick'))
    .slice(0, 400)
  assert.doesNotMatch(fn, /signSpotIndex/,
    'eligibility now special-cases the sign spot; if that pad is genuinely ' +
    'unbuildable the joke has become a rule and the pad art should say so')
})
