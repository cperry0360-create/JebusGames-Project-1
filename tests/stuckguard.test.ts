import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  STUCK_MS, StuckDetector, installStuckGuard, shouldRecover, type StuckSample,
} from '../src/systems/StuckGuard.ts'
import {
  clearGates, enterGate, gateOwned, gateSummary, lastInputAt, leaveGate,
  noteInputAccepted, openGates,
} from '../src/systems/InputGates.ts'

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

/**
 * A run that has stopped and nobody owns.
 *
 * The player's report: soft-locked mid-run on level 1, no tower selection, no
 * ability, no placement, enemies stopped mid-lane with full health bars. The
 * cause was the rotate gate latching a pause on a stale viewport reading. The
 * guard is the net under that whole class of fault.
 */

/** A sample that is fine, so each test can spoil exactly one thing. */
function ok(over: Partial<StuckSample> = {}): StuckSample {
  return {
    now: 100_000,
    runActive: true,
    gate: null,
    owner: null,
    motion: 'w1:2:10,10|20,20',
    lastInputAt: 100_000,
    ...over,
  }
}

/** Holds `s` steady for `ms`, sampling as the guard would. */
function hold(d: StuckDetector, s: StuckSample, ms: number) {
  let last
  for (let t = 0; t <= ms; t += 500) last = d.assess({ ...s, now: s.now + t })
  return last!
}

test('a playable game is never stuck', () => {
  const d = new StuckDetector()
  assert.equal(hold(d, ok(), STUCK_MS * 3).stuck, false)
})

test('a menu is not a stuck run', () => {
  // A still board on the title screen is the correct state.
  const d = new StuckDetector()
  const v = hold(d, ok({ runActive: false, gate: 'paused', lastInputAt: 0 }), STUCK_MS * 3)
  assert.equal(v.stuck, false)
})

test('a paused run that nobody owns is stuck, and is recovered', () => {
  // THE REPORTED BUG. GameScene paused, no gate claiming it, no enemy motion,
  // no input accepted. Exactly what the harness reproduced.
  const d = new StuckDetector()
  const v = hold(d, ok({ gate: 'paused', owner: null, lastInputAt: 0 }), STUCK_MS + 1000)
  assert.equal(v.stuck, true)
  assert.ok(v.stuck && v.heldMs >= STUCK_MS, 'fired before the grace period was up')
  assert.equal(shouldRecover(v), true, 'an unowned lock must be recovered from')
})

test('an armed ability over a stopped board is stuck too', () => {
  // The other half of the brief: targeting entered and never exited. The board
  // is between waves so nothing moves, and no tap is being accepted.
  const d = new StuckDetector()
  const v = hold(d, ok({ gate: 'targeting', owner: null, lastInputAt: 0 }), STUCK_MS + 1000)
  assert.equal(v.stuck, true)
  assert.ok(v.stuck && v.gate === 'targeting')
})

test('a settings panel is reported but never seized', () => {
  // A child who opens settings and puts the phone down has stopped the board
  // legitimately, and the panel has a visible way out. Taking it off them
  // would be a worse bug than the one being guarded against.
  const d = new StuckDetector()
  const v = hold(d, ok({ gate: 'paused', owner: 'settings', lastInputAt: 0 }), STUCK_MS + 1000)
  assert.equal(v.stuck, true, 'it should still reach the log')
  assert.equal(shouldRecover(v), false, 'the guard seized a panel the player owns')
})

test('a modal over a LIVE board never fires', () => {
  // Enemies still walking means the simulation is fine and the player is
  // simply reading something.
  const d = new StuckDetector()
  let v
  for (let i = 0; i < 40; i++) {
    v = d.assess(ok({
      now: 100_000 + i * 500, gate: 'paused', owner: null,
      motion: `w1:2:${10 + i},10`, lastInputAt: 0,
    }))
  }
  assert.equal(v!.stuck, false, 'fired while the world was still moving')
})

test('input still being accepted clears the suspicion', () => {
  const d = new StuckDetector()
  // Frozen board, but taps are landing: something is listening.
  let v
  for (let i = 0; i < 40; i++) {
    const now = 100_000 + i * 500
    v = d.assess(ok({ now, gate: 'targeting', owner: null, lastInputAt: now - 100 }))
  }
  assert.equal(v!.stuck, false, 'fired while input was still being accepted')
})

test('the stopwatch restarts the moment the game moves again', () => {
  const d = new StuckDetector()
  hold(d, ok({ gate: 'paused', owner: null, lastInputAt: 0 }), STUCK_MS - 1500)
  // One frame of motion.
  d.assess(ok({ now: 106_000, gate: 'paused', owner: null, motion: 'moved', lastInputAt: 0 }))
  const v = d.assess(ok({ now: 106_500, gate: 'paused', owner: null, motion: 'moved', lastInputAt: 0 }))
  assert.equal(v.stuck, false, 'the stretch was not restarted by motion')
})

test('the guard reports once per stretch, not once per sample', async () => {
  // A guard that reported every 500ms would push the events that led up to the
  // lock straight out of the 500-entry ring buffer -- destroying the report it
  // was writing.
  const reports: string[] = []
  let recovered = 0
  let now = 0
  const stop = installStuckGuard({
    sample: () => ({
      now: (now += 5000), runActive: true, gate: 'paused', owner: null,
      motion: 'still', lastInputAt: 0,
    }),
    report: (cause) => { reports.push(cause) },
    recover: () => { recovered++ },
  }, 1)
  await new Promise((r) => setTimeout(r, 60))
  stop()
  assert.equal(reports.length, 1, `reported ${reports.length} times`)
  assert.equal(recovered, 1)
  assert.equal(reports[0], 'soft lock')
})

test('a sampler that throws cannot take the guard down with it', async () => {
  // The guard runs when the game is broken. That is when a sampler is most
  // likely to reach through a null.
  let calls = 0
  const stop = installStuckGuard({
    sample: () => { calls++; throw new Error('scene is gone') },
    report: () => assert.fail('reported off a failed sample'),
    recover: () => assert.fail('recovered off a failed sample'),
  }, 1)
  await new Promise((r) => setTimeout(r, 40))
  stop()
  assert.ok(calls > 1, 'the guard stopped after the first throw')
})

test('the guard runs off its own clock, not the game loop', () => {
  // A loop that has stopped cannot notice that it has stopped. Same reason the
  // freeze watchdog uses setInterval.
  const body = src('systems/StuckGuard.ts')
  assert.match(body, /setInterval/, 'the guard is driven by something that can stall with the game')
  assert.doesNotMatch(body, /requestAnimationFrame/, 'animation frames stop when the loop does')
})

/* ------------------------------------------------------------- the gates */

test('a gate that opens and closes is owned in between', () => {
  clearGates()
  assert.equal(gateOwned(), false)
  enterGate('settings', { wave: 3 })
  assert.deepEqual(openGates(), ['settings'])
  assert.match(gateSummary(), /settings\(\d+ms wave=3\)/)
  leaveGate('settings')
  assert.equal(gateOwned(), false)
  assert.equal(gateSummary(), 'none')
})

test('gates stack and report oldest first', () => {
  clearGates()
  enterGate('portrait')
  enterGate('dialog', { title: 'QUIT TO TITLE?' })
  assert.deepEqual(openGates(), ['portrait', 'dialog'])
  clearGates()
  assert.deepEqual(openGates(), [])
})

test('accepted input is timestamped but not logged', () => {
  // Logging every tap would push three or four waves of context out of the
  // ring buffer, and that context is what makes a report worth reading.
  const before = lastInputAt()
  noteInputAccepted()
  assert.ok(lastInputAt() >= before)
  assert.doesNotMatch(src('systems/InputGates.ts').slice(
    src('systems/InputGates.ts').indexOf('export function noteInputAccepted')),
  /logEvent/, 'noteInputAccepted writes to the event log')
})

test('every input-gating mode announces itself', () => {
  // The point of the registry: a pause with no owner is a bug, every time. If
  // a mode can hold input without claiming it, the guard cannot tell it from
  // the soft lock.
  for (const [file, gate] of [
    ['scenes/HudScene.ts', 'settings'],
    ['scenes/HudScene.ts', 'dialog'],
    ['scenes/GameScene.ts', 'targeting'],
    ['systems/OrientationGate.ts', 'portrait'],
    ['systems/Lifecycle.ts', 'background'],
  ] as const) {
    const body = src(file)
    assert.match(body, new RegExp(`enterGate\\('${gate}'`), `${file} never opens the ${gate} gate`)
    assert.match(body, new RegExp(`leaveGate\\('${gate}'`), `${file} never closes the ${gate} gate`)
  }
})

test('a soft lock reaches the crash reporter', () => {
  // It produced no report at all before: a stopped board carries no exception,
  // so nothing else in the diagnostics fired.
  assert.match(src('systems/ErrorPanel.ts'), /export function reportQuietly/,
    'no way to record a fault without covering the game in red text')
  assert.match(src('main.ts'), /installGameStuckGuard\(game\)/, 'the guard is never installed')
  assert.match(src('systems/StuckWatch.ts'), /reportQuietly\(/,
    'a soft lock still produces no report')
  // The harness stands the game up itself. A guard only on main.ts's boot path
  // is a guard no scenario can drop anything on.
  const harness = readFileSync(new URL('../tools/harness/index.html', import.meta.url), 'utf8')
  assert.match(harness, /installGameStuckGuard\(game\)/,
    'the harness runs a game with no stuck guard, so the net is never tested')
})
