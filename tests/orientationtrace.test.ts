/**
 * What the orientation gate's streak counter counts.
 *
 * The gate is supposed to require three consecutive portrait readings before
 * it raises, and `ENTER_FRAMES`'s own comment reasons in frames: "three frames
 * is under 50ms at 60fps". Driven frame by frame it behaves exactly that way.
 *
 * It counts CALLS. `sync()` runs from `POST_STEP` once a frame AND from
 * `settle()` five times per event, and a rotation fires three events. Measured
 * in the harness (`run.sh rotationburst`): three `sync()` calls landed 0.0ms,
 * 0.5ms and 1.0ms apart and the gate raised on the third -- 1.0ms, not 33.3ms.
 *
 * These tests pin that as a property of the counter rather than as a story
 * about one run, so the day someone makes the streak count frames, the tests
 * that describe the old behaviour fail and say why.
 *
 * NO PHASER: both modules are deliberately engine-free so this can execute
 * them. See CLAUDE.md's standing facts on what the suite cannot see.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ENTER_FRAMES, OrientationGate } from '../src/systems/OrientationGate.ts'
import {
  clearSyncTrace, fastestRaiseMs, syncBursts, syncTrace, traceSync,
} from '../src/systems/OrientationTrace.ts'

/** A scene manager reduced to what the gate touches. */
function host() {
  const paused = new Set<string>()
  return {
    paused,
    running: () => ['Game', 'Hud'],
    isPaused: (k: string) => paused.has(k),
    pause: (k: string) => { paused.add(k) },
    resume: (k: string) => { paused.delete(k) },
  }
}

test('the gate needs three readings, however fast they arrive', () => {
  const g = new OrientationGate()
  const h = host()
  assert.equal(ENTER_FRAMES, 3)
  assert.equal(g.sync(true, h), null, 'raised on the first reading')
  assert.equal(g.portraitStreak, 1)
  assert.equal(g.sync(true, h), null, 'raised on the second reading')
  assert.equal(g.portraitStreak, 2)
  assert.equal(g.sync(true, h), 'raised', 'did not raise on the third')
  assert.equal(g.raised, true)
})

test('THE FINDING: the streak counts calls, so time is not part of the guard', () => {
  // The counter has no clock. Three calls in the same millisecond satisfy it
  // exactly as three calls a frame apart do -- which is why a settle burst
  // raises the gate in about a millisecond, and why CrashContext can carry a
  // raise and a lower 21ms apart.
  const g = new OrientationGate()
  const h = host()
  for (let i = 0; i < ENTER_FRAMES - 1; i++) assert.equal(g.sync(true, h), null)
  assert.equal(g.sync(true, h), 'raised',
    'three calls raised the gate with no time having passed at all')
})

test('a single landscape reading lowers it, however long it was up', () => {
  const g = new OrientationGate()
  const h = host()
  for (let i = 0; i < 10; i++) g.sync(true, h)
  assert.equal(g.raised, true)
  assert.equal(g.sync(false, h), 'lowered')
  assert.equal(g.portraitStreak, 0)
  assert.equal(h.paused.size, 0, 'a lowered gate is still holding scenes')
})

test('the trace groups calls that arrive closer together than a frame', () => {
  clearSyncTrace()
  const at = (ms: number, source: string) => traceSync({
    at: ms, source, portrait: true, streak: 0, up: false, change: null, vw: 390, vh: 844,
  })
  // One settle burst: three events firing their `:now` leg in the same tick.
  at(0.0, 'resize:now')
  at(0.5, 'orientationchange:now')
  at(1.0, 'visualViewport:now')
  // Then an ordinary frame, 16.7ms later, which is NOT part of the burst.
  at(17.7, 'post-step')
  const bursts = syncBursts(8)
  assert.equal(bursts.length, 1, 'the three same-tick calls are one burst')
  assert.equal(bursts[0]!.calls.length, 3)
  assert.equal(syncTrace().length, 4)
})

test('fastestRaiseMs measures streak-start to raise, in wall time', () => {
  clearSyncTrace()
  const at = (ms: number, streak: number, change: 'raised' | null) => traceSync({
    at: ms, source: 's', portrait: true, streak, up: change === 'raised', change, vw: 1, vh: 1,
  })
  at(100.0, 1, null)
  at(100.5, 2, null)
  at(101.0, 3, 'raised')
  const ms = fastestRaiseMs()
  assert.ok(ms !== null)
  assert.ok(Math.abs(ms - 1.0) < 1e-9, `expected 1.0ms, got ${ms}`)
  // 33.3ms is two frame intervals at 60fps: the floor if it counted frames.
  assert.ok(ms < 33.3,
    'a burst raise is faster than three rendered frames -- that is the finding')
})

test('the ring holds a bounded number of calls', () => {
  clearSyncTrace()
  for (let i = 0; i < 400; i++) {
    traceSync({ at: i, source: 'post-step', portrait: false, streak: 0,
      up: false, change: null, vw: 1, vh: 1 })
  }
  const t = syncTrace()
  assert.ok(t.length <= 120, `ring grew to ${t.length}`)
  assert.equal(t[t.length - 1]!.at, 399, 'the ring dropped the newest instead of the oldest')
})
