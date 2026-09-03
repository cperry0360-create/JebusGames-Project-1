import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { distanceAtX, emergeState, vanishAlpha } from '../src/systems/Gateway.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const MAP = read('map'), ENEMIES = read('enemies')
const CFG = { fadeMs: MAP.entrance.fadeMs, startScale: MAP.entrance.startScale }

test('an enemy behind the arch is absent, not merely faint', () => {
  // The distinction matters. A small alpha is a ghost standing on the map's
  // edge in front of the stonework, which is the reported bug; zero is not
  // there yet.
  for (const ms of [-1, -50, -400]) {
    assert.equal(emergeState(ms, CFG).alpha, 0, 'something is visible before the arch mouth')
  }
  assert.equal(emergeState(-1, CFG).scale, CFG.startScale, 'it starts at full size')
})

test('it fades and grows together, and finishes at full size', () => {
  const half = emergeState(CFG.fadeMs / 2, CFG)
  assert.ok(half.alpha > 0.4 && half.alpha < 0.6, `half way through it is ${half.alpha}`)
  assert.ok(half.scale > CFG.startScale && half.scale < 1, 'the scale-up does not track the fade')
  const done = emergeState(CFG.fadeMs, CFG)
  assert.equal(done.alpha, 1)
  assert.equal(done.scale, 1, 'it arrives at anything but its real size')
  // And stays there rather than overshooting on a long frame.
  assert.deepEqual(emergeState(CFG.fadeMs * 9, CFG), { alpha: 1, scale: 1 })
})

test('the emergence is around 400ms and starts near 90%', () => {
  assert.ok(CFG.fadeMs >= 300 && CFG.fadeMs <= 500, `the fade is ${CFG.fadeMs}ms`)
  assert.ok(CFG.startScale >= 0.85 && CFG.startScale <= 0.95,
    `it starts at ${CFG.startScale} of full size`)
})

test('every enemy finishes emerging before it clears the arch', () => {
  // The one that actually matters on screen: a fade still running when the
  // stonework stops covering it is a translucent enemy in open grass. The
  // Shredder is the case to watch — it covers four times the ground the
  // Politician does in the same 400ms.
  const mouth = MAP.entrance.emergeFromX
  const clear = MAP.entrance.clearOfArchX
  for (const [id, def] of Object.entries(ENEMIES) as [string, any][]) {
    const travelled = def.speed * (CFG.fadeMs / 1000)
    assert.ok(mouth + travelled < clear,
      `${id} is still fading at x=${(mouth + travelled).toFixed(0)}, past the arch at ${clear}`)
  }
})

test('the gate is where the lane meets the painted gate, not the end of the lane', () => {
  const stop = distanceAtX(MAP.waypoints, MAP.exit.vanishX)
  const total = MAP.waypoints.reduce((acc: number, p: number[], i: number) => (
    i === 0 ? 0 : acc + Math.hypot(p[0] - MAP.waypoints[i - 1][0], p[1] - MAP.waypoints[i - 1][1])
  ), 0)
  assert.ok(stop < total - 60,
    'the stop distance is the end of the lane, so enemies walk off the plate again')
  // And the gate is on the plate, unlike the lane's last waypoint.
  assert.ok(MAP.exit.gateX > 1100 && MAP.exit.gateX < 1280,
    `the gate gap starts at x=${MAP.exit.gateX}, which is not on the map`)
  assert.equal(distanceAtX(MAP.waypoints, MAP.entrance.emergeFromX) > 0, true,
    'the arch mouth is at distance 0, so there is nothing behind the arch to walk out of')
})

test('an enemy fades out inside the gate gap, and nowhere else', () => {
  // The gate is OPEN in this plate: two leaves standing apart with a dark gap
  // between them at world x 1235-1248. There is nothing to walk into, so the
  // enemy is swallowed by the gap rather than stopped by a face.
  const from = distanceAtX(MAP.waypoints, MAP.exit.gateX)
  const to = distanceAtX(MAP.waypoints, MAP.exit.vanishX)
  assert.ok(to > from, 'the gap has no width, so the fade has nowhere to happen')

  // Full opacity right up to the near edge. A fade that starts early is an
  // enemy going translucent in open road, which is the thing the entrance
  // fade exists to avoid at the other end.
  assert.equal(vanishAlpha(from - 200, from, to), 1)
  assert.equal(vanishAlpha(from, from, to), 1)
  const half = vanishAlpha((from + to) / 2, from, to)
  assert.ok(half > 0.45 && half < 0.55, `half way through the gap it is ${half}`)
  assert.equal(vanishAlpha(to, from, to), 0, 'something is left at the far leaf')
  assert.equal(vanishAlpha(to + 500, from, to), 0, 'the alpha goes negative past the gap')
})

test('the fade fits inside the gap for every enemy, whatever its speed', () => {
  // Measured in DISTANCE, not time, and this is why. The gap is about fifteen
  // world pixels; the roster spans a wide speed range. A timed fade would let
  // the fastest walk out the far side still visible while the slowest
  // dissolved before reaching the gap at all.
  const from = distanceAtX(MAP.waypoints, MAP.exit.gateX)
  const to = distanceAtX(MAP.waypoints, MAP.exit.vanishX)
  const gap = to - from
  assert.ok(gap >= 8 && gap <= 40, `a ${gap.toFixed(1)}px fade is not the painted gap`)
  for (const [id, def] of Object.entries(ENEMIES) as [string, any][]) {
    // One frame at 30fps, the worst case a slow device gives. Any faster than
    // this and the enemy skips the whole fade in a single step.
    const perFrame = def.speed / 30
    assert.ok(perFrame < gap,
      `${id} crosses the whole gap in one frame (${perFrame.toFixed(1)}px of ${gap.toFixed(1)})`)
  }
})

test('the enemy fades out through the gate, and nothing slams', () => {
  const enemy = src('entities/Enemy.ts')
  const game = src('scenes/GameScene.ts')
  // The walk ends at the far edge of the gap, not at the lane's end.
  assert.match(enemy, /if \(this\.distance >= this\.stopDistance\) return true/,
    'the enemy still walks to the end of the lane and off the plate')
  assert.doesNotMatch(enemy, /this\.distance >= this\.lane\.totalLength/,
    'the old walk-off-the-end condition is back')
  // Two fades now, one at each end, and they must not overlap: the exit fade
  // is gated on being past the gap's near edge.
  assert.equal((enemy.match(/emergeState\(/g) ?? []).length, 1,
    'the entrance emergence is applied in more than one place')
  assert.match(enemy, /if \(this\.distance <= this\.gateDistance\) return/,
    'the exit fade is not gated on reaching the gate, so it runs over the whole lane')

  const leak = /private leak\(enemy: Enemy\)[\s\S]*?\n  \}/.exec(game)
  assert.ok(leak, 'the leak handler is gone')
  // THE SLAM IS GONE. All three parts of it described a collision with a gate
  // that is painted shut, and this plate's gate stands open.
  assert.doesNotMatch(leak[0], /deathPuff\(/, 'dust is thrown up at an open gate')
  assert.doesNotMatch(leak[0], /play\(this, 'hit-c'/, 'the impact sound is back')
  assert.doesNotMatch(game, /gateShake/, 'the gate shake is back')
  assert.doesNotMatch(game, /gateImpact/, 'the gate impact config is back')
  // The counter still moves, and still sounds different on the last life.
  assert.match(leak[0], /this\.status\.lives -= enemy\.def\.livesCost/,
    'the life is not lost when the enemy gets out')
  assert.match(leak[0], /'last-life' : 'life-lost'/, 'the life-lost sting went with the slam')
  assert.match(leak[0], /enemy\.destroy\(\)/, 'the enemy is not removed once it is through')
})

test('the archway is put back in front, from the plate itself', () => {
  const game = src('scenes/GameScene.ts')
  const fn = /private createArchOccluders\(\)[\s\S]*?\n  \}/.exec(game)
  assert.ok(fn, 'nothing draws the arch over the enemies under it')
  // No new art: the pier is cropped out of the map plate.
  assert.match(fn[0], /getSourceImage\(\)/, 'the piece is not taken from the plate')
  assert.match(fn[0], /drawImage\(/, 'nothing is cropped')
  // AND CLIPPED TO THE PAINTED OUTLINE. This piece is drawn in FRONT of
  // units, so every pixel of it that is not stone is a pixel of road or grass
  // painted over somebody standing there.
  assert.match(fn[0], /ctx\.clip\(\)/, 'the crop is a rectangle again')
  assert.match(fn[0], /setDepth\(near\.depth\)/, 'the pier does not take its depth from the data')
})

test('only the near pier is lifted, and it is a traced outline not a box', () => {
  /*
   * THE FAR PIER USED TO BE LIFTED TOO, INTO A RECTANGLE, AND THAT WAS THE BUG.
   *
   * The road runs left to right and descends, so the gateway's piers are not
   * side by side across it: the near pier is planted below the road's near
   * edge and the far pier stands above its far edge. The far pier is therefore
   * behind everything on the road and the plate already draws it there.
   *
   * It was lifted into a 20x112 box at x 98-118 while the painted column is
   * x 88-118 — so the box cut the column in half down its length, and an enemy
   * walking out drew over the half still at plate depth and under the half at
   * 398. Measured: 25% of that pier's pixels changed colour as an enemy passed.
   */
  const arch = (MAP.entrance as Record<string, unknown>).arch as {
    near: { outline: number[][]; depth: number }
  }
  assert.equal((MAP.entrance as Record<string, unknown>).occluders, undefined,
    'the rectangular occluders are back')
  assert.ok(Array.isArray(arch.near.outline), 'the near pier has no outline')
  assert.ok(arch.near.outline.length >= 6,
    `an outline of ${arch.near.outline.length} points is a box with extra steps`)
  for (const p of arch.near.outline) {
    assert.equal(p.length, 2, 'an outline point is not an [x, y] pair')
    assert.ok(Number.isFinite(p[0]!) && Number.isFinite(p[1]!), 'a point is not a number')
  }
})

test('the near pier is in front of every enemy that can stand at the arch', () => {
  /*
   * The depth is the pier's painted base, and the claim it makes is that no
   * enemy on this stretch of road is ever lower on the screen than it. Enemies
   * walk the lane centre with a lateral offset of up to half the road's width,
   * so the deepest one is the road centre plus that. Checked here rather than
   * asserted, because the lane and the road width are both tunable.
   */
  const arch = (MAP.entrance as Record<string, unknown>).arch as {
    near: { outline: number[][]; depth: number }
  }
  const xs = arch.near.outline.map((p) => p[0]!)
  const lo = Math.min(...xs)
  const hi = Math.max(...xs)
  const half = MAP.roadWidth / 2
  let deepest = -Infinity
  const w = MAP.waypoints
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1]!
    const b = w[i]!
    for (let t = 0; t <= 1; t += 0.02) {
      const x = a[0]! + (b[0]! - a[0]!) * t
      if (x < lo - 20 || x > hi + 20) continue
      deepest = Math.max(deepest, a[1]! + (b[1]! - a[1]!) * t + half)
    }
  }
  assert.ok(Number.isFinite(deepest), 'the lane never passes the near pier')
  assert.ok(arch.near.depth > deepest,
    `the pier's depth is ${arch.near.depth} and an enemy can reach ${deepest.toFixed(1)}`)
})

test('the passage is not covered by the piece drawn in front', () => {
  // An enemy standing in the opening must not be hidden behind a picture of
  // the road it is standing on. The outline stops at the mouth.
  const arch = (MAP.entrance as Record<string, unknown>).arch as {
    near: { outline: number[][] }
  }
  const right = Math.max(...arch.near.outline.map((p) => p[0]!))
  assert.ok(right <= MAP.entrance.emergeFromX + 2,
    `the outline reaches x=${right}, past the arch mouth at ${MAP.entrance.emergeFromX}`)
})
