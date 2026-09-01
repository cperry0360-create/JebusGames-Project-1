import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { distanceAtX, emergeState, gateShake } from '../src/systems/Gateway.ts'

const url = (p: string) => new URL(p, import.meta.url)
const read = (n: string) => JSON.parse(readFileSync(url(`../src/data/${n}.json`), 'utf8'))
const src = (p: string) => readFileSync(url(`../src/${p}`), 'utf8')
const MAP = read('map'), ENEMIES = read('enemies'), P = read('presentation')
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
  const stop = distanceAtX(MAP.waypoints, MAP.exit.gateX)
  const total = MAP.waypoints.reduce((acc: number, p: number[], i: number) => (
    i === 0 ? 0 : acc + Math.hypot(p[0] - MAP.waypoints[i - 1][0], p[1] - MAP.waypoints[i - 1][1])
  ), 0)
  assert.ok(stop < total - 60,
    'the stop distance is the end of the lane, so enemies walk off the plate again')
  // And the gate is on the plate, unlike the lane's last waypoint.
  assert.ok(MAP.exit.gateX > 1100 && MAP.exit.gateX < 1280,
    `the gate face is at x=${MAP.exit.gateX}, which is not on the map`)
  assert.equal(distanceAtX(MAP.waypoints, MAP.entrance.emergeFromX) > 0, true,
    'the arch mouth is at distance 0, so there is nothing behind the arch to walk out of')
})

test('a crowd arriving together neither rumbles nor doubles up', () => {
  const g = P.gateImpact
  // Inside the gap, nothing fires however many land.
  assert.equal(gateShake(1000, 900, 1, g).play, false, 'a second impact shakes immediately')
  assert.equal(gateShake(1000, 900, 8, g).play, false, 'a crowd overrides the gap')
  // Past it, one does.
  const one = gateShake(2000, 1000, 1, g)
  assert.equal(one.play, true)
  assert.equal(one.intensity, g.baseIntensity)
  // A group hits harder, but only up to the cap.
  assert.ok(gateShake(2000, 1000, 3, g).intensity > one.intensity, 'a group is no heavier than one')
  for (const burst of [4, 13, 200]) {
    assert.ok(gateShake(2000, 1000, burst, g).intensity <= g.maxIntensity,
      `${burst} at once exceeds the cap`)
  }
  assert.ok(g.maxIntensity <= 0.03, `a ${g.maxIntensity} shake is more than the screen can take`)
})

test('nothing fades at the exit, and the impact is not a disappearance', () => {
  const enemy = src('entities/Enemy.ts')
  const game = src('scenes/GameScene.ts')
  // The walk ends at the gate, not at the lane's end.
  assert.match(enemy, /if \(this\.distance >= this\.stopDistance\) return true/,
    'the enemy still walks to the end of the lane and off the plate')
  assert.doesNotMatch(enemy, /this\.distance >= this\.lane\.totalLength/,
    'the old walk-off-the-end condition is back')
  // The emergence only ever runs at the entrance: there is no matching
  // fade-out, because the gate is solid.
  assert.equal((enemy.match(/emergeState\(/g) ?? []).length, 1,
    'the emergence is applied in more than one place; the exit must not fade')

  const leak = /private leak\(enemy: Enemy\)[\s\S]*?\n  \}/.exec(game)
  assert.ok(leak, 'the gate impact handler is gone')
  assert.match(leak[0], /deathPuff\(this/, 'no dust at the gate, so the enemy visibly dissolves')
  assert.match(leak[0], /play\(this, 'hit-c'/, 'no impact sound')
  assert.match(leak[0], /this\.status\.lives -= enemy\.def\.livesCost/,
    'the life is not lost on the impact frame')
  assert.match(leak[0], /gateShake\(/, 'the shake is unstaggered and uncapped again')
  // Destroyed in the same handler as the puff, so there is no frame of a
  // half-there enemy standing at a solid gate.
  assert.match(leak[0], /enemy\.destroy\(\)/, 'the enemy is not removed on impact')
})

test('the archway is put back in front, from the plate itself', () => {
  const game = src('scenes/GameScene.ts')
  const fn = /private createArchOccluders\(\)[\s\S]*?\n  \}/.exec(game)
  assert.ok(fn, 'nothing draws the arch over the enemies under it')
  // No new art: the piers are cropped out of the map plate.
  assert.match(fn[0], /getSourceImage\(\)/, 'the occluders are not taken from the plate')
  assert.match(fn[0], /drawImage\(/, 'nothing is cropped')
  // Sorted by its base like every other piece of scenery, not pinned above.
  assert.match(fn[0], /setDepth\(r\.y \+ r\.h\)/,
    'the arch uses a fixed depth instead of the one Y-sort rule')

  // The passage between the piers must NOT be covered, or an enemy in the
  // opening is hidden behind a picture of the road it is standing on.
  const occ = MAP.entrance.occluders as Array<{ x: number; w: number }>
  assert.equal(occ.length, 2, 'the arch should be two piers with a gap between them')
  const gap = occ[1].x - (occ[0].x + occ[0].w)
  assert.ok(gap > 30, `only ${gap}px between the piers; the passage is being covered`)
  assert.ok(occ[1].x + occ[1].w <= MAP.entrance.clearOfArchX + 4,
    'an occluder reaches past the point where the arch is meant to be behind you')
})
