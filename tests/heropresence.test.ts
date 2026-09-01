import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HeroMotion, REST, type MotionDef } from '../src/systems/HeroMotion.ts'
import { HeroMarkers, dashArcs, type MarkersDef } from '../src/systems/HeroMarkers.ts'

const url = (p: string) => new URL(p, import.meta.url)
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))

const P = read('presentation')
const motionDef = P.heroMotion as MotionDef
const markerDef = P.heroMarkers as MarkersDef

/* ------------------------------------------------------------------ motion */

test('the hero is never perfectly still', () => {
  // The whole point: a character who holds one pose between orders reads as a
  // placed object. Sampled across a full cycle, something must move.
  const m = new HeroMotion(motionDef)
  const ys = new Set<string>()
  for (let i = 0; i < 30; i++) ys.add(m.advance(motionDef.idle.periodMs / 1000 / 30, false).offsetY.toFixed(3))
  assert.ok(ys.size > 10, `the idle bob only reaches ${ys.size} positions in a cycle`)
})

test('the idle bob is a full cycle in about the time asked for', () => {
  const m = new HeroMotion(motionDef)
  const step = 0.01
  // One period should bring him back to where he started.
  const first = m.advance(step, false).offsetY
  let elapsed = step
  while (elapsed < motionDef.idle.periodMs / 1000 - step) { m.advance(step, false); elapsed += step }
  const back = m.advance(step, false).offsetY
  assert.ok(Math.abs(back - first) < 0.2, `after one period he is at ${back}, not ${first}`)
})

test('he squashes at the bottom of the bob and lifts at the top', () => {
  // The two are the same motion: he compresses as he lands, lifts as he
  // pushes off. If they ran independently he would look like a bouncing ball.
  const m = new HeroMotion(motionDef)
  const step = motionDef.idle.periodMs / 1000 / 200
  // Seeded from a real sample: offsetY is never positive, so a zero sentinel
  // is never beaten and the whole sweep reads as "nothing moved".
  let lowest = m.advance(step, false)
  let highest = lowest
  for (let i = 0; i < 200; i++) {
    const p = m.advance(step, false)
    if (p.offsetY > lowest.offsetY) lowest = p
    if (p.offsetY < highest.offsetY) highest = p
  }
  assert.ok(highest.offsetY < 0, 'he never leaves the ground')
  assert.ok(lowest.scaleY < highest.scaleY,
    `he is not squashed at the bottom: ${lowest.scaleY} vs ${highest.scaleY} at the top`)
  // And the shadow does the opposite of the lift.
  assert.ok(highest.shadowScale < 1, 'the shadow does not shrink as he rises')
})

test('walking bounces faster and leans into the travel', () => {
  const idle = new HeroMotion(motionDef)
  const walk = new HeroMotion(motionDef)
  assert.ok(motionDef.walk.periodMs < motionDef.idle.periodMs, 'the walk is not faster than the idle')

  // Lean follows the direction of travel, and only while walking.
  assert.equal(idle.advance(0.016, false, -1).rotation, 0, 'he leans while standing still')
  const right = walk.advance(0.016, true, +1).rotation
  const left = walk.advance(0.016, true, -1).rotation
  assert.ok(right > 0 && left < 0, `the lean does not follow the travel: ${right} / ${left}`)
  assert.ok(Math.abs(right * 180 / Math.PI - (motionDef.walk.leanDegrees ?? 0)) < 0.01,
    'the lean is not the angle the data asks for')
})

test('the attack lunges at the target and snaps back to rest', () => {
  const m = new HeroMotion(motionDef)
  m.swingAt(1, 0)
  assert.ok(m.swinging, 'the swing did not start')
  let peak = 0
  const step = motionDef.attack.lungeMs / 1000 / 40
  for (let i = 0; i < 40; i++) peak = Math.max(peak, m.advance(step, false).offsetX)
  assert.ok(peak > motionDef.attack.reachPx * 0.8,
    `he only reached ${peak.toFixed(1)}px of a ${motionDef.attack.reachPx}px lunge`)
  // Over by the end, and back where he started.
  m.advance(0.05, false)
  assert.ok(!m.swinging, 'the swing never finishes')
  assert.equal(m.advance(0.001, false).offsetX, REST.offsetX, 'he does not return to rest')
})

test('the lunge goes toward the target, whichever way that is', () => {
  // A scaleX pulse is the same in both directions and read as a flinch.
  const m = new HeroMotion(motionDef)
  m.swingAt(-1, 0)
  let leftmost = 0
  for (let i = 0; i < 20; i++) leftmost = Math.min(leftmost, m.advance(0.004, false).offsetX)
  assert.ok(leftmost < -1, `swinging left moved him ${leftmost.toFixed(2)}px`)
})

test('a new swing restarts rather than stacking', () => {
  const m = new HeroMotion(motionDef)
  m.swingAt(1, 0)
  for (let i = 0; i < 10; i++) m.advance(0.01, false)
  m.swingAt(1, 0)
  // Restarted: the very next frame is near the beginning of the curve again.
  const p = m.advance(0.001, false)
  assert.ok(p.offsetX < motionDef.attack.reachPx * 0.2,
    `a re-swing carried on from ${p.offsetX.toFixed(2)}px instead of restarting`)
})

/* ----------------------------------------------------------------- markers */

test('idle and unselected draws nothing at all', () => {
  const m = new HeroMarkers(markerDef)
  m.advance(0.5)
  assert.equal(m.footRing(), null, 'something is drawn at his feet when nothing was asked for')
  assert.equal(m.moveRing(), null, 'a move marker exists with no order given')
})

test('selecting shows a foot ring and nothing else', () => {
  const m = new HeroMarkers(markerDef)
  m.select()
  assert.equal(m.footRing()?.alpha, markerDef.footRing.alpha)
  assert.equal(m.moveRing(), null, 'selecting also drew a move marker')
})

test('the move marker scales and fades in over the time asked for', () => {
  const m = new HeroMarkers(markerDef)
  m.orderTo(100, 200)
  const first = m.moveRing()!
  assert.equal(first.scale, markerDef.moveRing.appearFromScale, 'it does not start small')
  assert.equal(first.alpha, 0, 'it does not fade in')
  m.advance(markerDef.moveRing.appearMs / 1000)
  const done = m.moveRing()!
  assert.equal(done.scale, 1, 'it never reaches full size')
  assert.equal(done.alpha, markerDef.moveRing.alpha, 'it never reaches full opacity')
})

test('the dashes rotate once in the period asked for, and only that', () => {
  const m = new HeroMarkers(markerDef)
  m.orderTo(0, 0)
  const a = m.moveRing()!.phase
  m.advance(markerDef.moveRing.rotationMs / 1000)
  const b = m.moveRing()!.phase
  assert.ok(Math.abs((b - a) - Math.PI * 2) < 1e-6,
    `a full period turned the dashes ${(b - a).toFixed(3)} rad, not 2π`)
  // Nothing else moves: same position, same size, same alpha.
  const now = m.moveRing()!
  assert.equal(now.scale, 1)
  assert.equal(now.alpha, markerDef.moveRing.alpha)
})

test('the dashes are even, never overlap, and cover the ring', () => {
  const arcs = dashArcs(markerDef.moveRing.dashes, markerDef.moveRing.dashFraction, 0)
  assert.equal(arcs.length, markerDef.moveRing.dashes)
  for (let i = 1; i < arcs.length; i++) {
    assert.ok(arcs[i]![0] >= arcs[i - 1]![1], `dash ${i} starts before dash ${i - 1} ends`)
    const gapA = arcs[i]![0] - arcs[i - 1]![0]
    const gapB = arcs[1]![0] - arcs[0]![0]
    assert.ok(Math.abs(gapA - gapB) < 1e-9, 'the dashes are not evenly spaced')
  }
})

test('a new order replaces the old one; there are never two', () => {
  const m = new HeroMarkers(markerDef)
  m.orderTo(10, 10)
  m.advance(0.5)
  m.orderTo(90, 90)
  const r = m.moveRing()!
  assert.equal(r.x, 90)
  assert.equal(r.y, 90)
  // And it plays its arrival animation again rather than inheriting the old
  // marker's full size, or the second tap would give no feedback.
  assert.equal(r.scale, markerDef.moveRing.appearFromScale)
})

test('arriving takes both markers away together', () => {
  const m = new HeroMarkers(markerDef)
  m.select()
  m.orderTo(50, 50)
  m.advance(0.3)
  assert.ok(m.hasOrder, 'the order is not live while he walks')
  // Arrival.
  m.endOrder()
  m.deselect()
  assert.ok(!m.hasOrder, 'the order is still live after he arrived')
  const half = Math.min(markerDef.footRing.fadeOutMs, markerDef.moveRing.fadeOutMs) / 2000
  m.advance(half)
  assert.ok((m.footRing()?.alpha ?? 0) > 0, 'the foot ring was cut rather than faded')
  assert.ok((m.moveRing()?.alpha ?? 0) > 0, 'the move ring was cut rather than faded')
  m.advance(Math.max(markerDef.footRing.fadeOutMs, markerDef.moveRing.fadeOutMs) / 1000)
  assert.equal(m.footRing(), null, 'the foot ring never goes')
  assert.equal(m.moveRing(), null, 'the move ring never goes')
})

test('cancelling fades both, the same way arriving does', () => {
  const m = new HeroMarkers(markerDef)
  m.select()
  m.orderTo(5, 5)
  m.advance(0.3)
  m.cancel()
  m.advance(0.05)
  assert.ok((m.footRing()?.alpha ?? 0) > 0 && (m.moveRing()?.alpha ?? 0) > 0, 'cancel cut them')
  m.advance(1)
  assert.equal(m.footRing(), null)
  assert.equal(m.moveRing(), null)
})

/* ------------------------------------------------- what the scene must not do */

test('the rally flag and both hero radius rings are gone', () => {
  const g = src('scenes/GameScene.ts')
  const fn = g.slice(g.indexOf('private drawHeroMarkers()'))
  const body = fn.slice(0, fn.indexOf('\n  /** The tower table'))
  assert.ok(!/fillTriangle/.test(body), 'the rally flag is still drawn')
  assert.ok(!/armorShredRadius/.test(body), 'the Depreciation ring is still drawn')
  assert.ok(!/blockRange/.test(body), 'the block-range ring is still drawn')
  assert.ok(!/8fd07a/.test(body), 'the green selection bracket is still drawn')
  // And selecting him no longer throws up his attack range.
  const sel = g.slice(g.indexOf('private selectHero()'), g.indexOf('private orderHero('))
  assert.ok(!/showRange\(/.test(sel), 'selecting the hero still draws his attack range')
})

test('the marker animations run on real time, not on the game clock', () => {
  // The game runs at gameSpeed, so "one turn every three seconds" came out at
  // 2.1s when this was advanced with the simulation delta.
  const g = src('scenes/GameScene.ts')
  assert.match(g, /this\.markers\.advance\(real\)/,
    'the markers advance on scaled game time, so their timings are not what the data says')
})

test('he stays selected while he walks, and is deselected on arrival', () => {
  const g = src('scenes/GameScene.ts')
  const order = g.slice(g.indexOf('private orderHero('), g.indexOf('private orderHero(') + 1200)
  assert.ok(!/this\.heroSelected = false/.test(order),
    'giving an order deselects him, so his foot ring goes before he sets off')
  assert.match(g, /if \(this\.markers\.hasOrder && this\.hero\.atRally\) \{[\s\S]{0,220}deselect\(\)/,
    'arriving does not end the order and the selection together')
})
