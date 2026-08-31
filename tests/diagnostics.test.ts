import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CAPACITY, buildReport, currentState, formatReport, lastReport, logEvent,
  provideState, recentEvents, recordError, resetEvents, safeString, setBuildLabel,
  setLastReport,
} from '../src/systems/Diagnostics.ts'
import {
  FREEZE_MS, check, setBeatForTest, setRunActive, watchdogState,
} from '../src/systems/Watchdog.ts'

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

function fresh(): void {
  resetEvents()
  provideState(null)
  setLastReport(null)
}

test('the log keeps the most recent events and drops the oldest', () => {
  fresh()
  for (let i = 0; i < CAPACITY + 40; i++) logEvent('spawn', `e${i}`)
  const kept = recentEvents()
  assert.equal(kept.length, CAPACITY, 'the ring grew past its capacity')
  // Oldest first, and the oldest survivor is entry 40 — the first 40 rolled off.
  assert.equal(kept[0].detail, 'e40')
  assert.equal(kept[kept.length - 1].detail, `e${CAPACITY + 39}`)
})

test('every event is ordered and timestamped', () => {
  fresh()
  logEvent('wave-start', '1')
  logEvent('enemy-death', 'intern')
  const [a, b] = recentEvents()
  assert.equal(a.kind, 'wave-start')
  assert.equal(b.kind, 'enemy-death')
  assert.ok(b.t >= a.t, 'time ran backwards')
  assert.ok(a.t >= 0)
})

test('a state provider that throws does not take the report down with it', () => {
  // The report is built at the worst moment the game has. If gathering state
  // could throw, the original fault would be replaced by this one.
  fresh()
  provideState(() => { throw new Error('scene is half torn down') })
  const state = currentState()
  assert.match(String(state.stateProviderFailed), /half torn down/)
  const r = buildReport('freeze', 'stalled')
  assert.ok(formatReport(r).includes('half torn down'))
})

test('the state of the run that just ended outlives the run', () => {
  // A player reaches the diagnostics from the title, after the thing went
  // wrong. "(empty)" would be the one screen that answers nothing.
  fresh()
  provideState(() => ({ wave: 11, phase: 'running' }))
  provideState(null)
  const state = currentState()
  assert.equal(state.wave, 11)
  assert.equal(state.live, false, 'a stale snapshot does not say that it is stale')
})

test('the report carries the build, the error and the log as pasteable text', () => {
  fresh()
  setBuildLabel('v1.2.3 (abc1234)')
  provideState(() => ({ wave: 9, phase: 'running' }))
  logEvent('boss-phase', '2')
  const r = recordError('uncaught exception', 'x is not a function', 'at Foo\nat Bar')
  const text = formatReport(r)
  for (const needle of ['v1.2.3 (abc1234)', 'uncaught exception', 'x is not a function',
    'at Foo', 'wave = 9', 'boss-phase']) {
    assert.ok(text.includes(needle), `report is missing ${needle}`)
  }
  assert.equal(lastReport()?.message, 'x is not a function')
  // The error itself is in the log too, so the events end where the crash did.
  assert.ok(recentEvents().some((e) => e.kind === 'error'))
})

test('nothing handed to the report can make it throw', () => {
  const circular: Record<string, unknown> = {}
  circular.self = circular
  assert.equal(safeString(circular), '[unprintable]')
  assert.equal(safeString(undefined), 'undefined')
  assert.equal(safeString(new Error('boom')), 'Error: boom')
  assert.equal(safeString(12), '12')
})

test('the watchdog only fires during a run, and only once per stall', () => {
  const seen: number[] = []
  const now = 1_000_000
  setRunActive(false)
  setBeatForTest(now - FREEZE_MS * 2)
  check(now, false)
  assert.equal(watchdogState().fired, false, 'fired on a menu, where idling is legal')

  setRunActive(true)
  setBeatForTest(now - FREEZE_MS - 1)
  const before = recentEvents().length
  check(now, false)
  assert.equal(watchdogState().fired, true)
  check(now + 500, false)
  assert.equal(recentEvents().length, before + 1, 'reported the same stall twice')
  void seen
  setRunActive(false)
})

test('a backgrounded tab is not a freeze', () => {
  // The browser stops animation frames on purpose there. Reporting it would
  // cry wolf on every phone call.
  setRunActive(true)
  const now = 2_000_000
  setBeatForTest(now - FREEZE_MS * 3)
  check(now, true)
  assert.equal(watchdogState().fired, false)
  // And the beat is caught up, so returning to the tab is not a stall either.
  check(now + 100, false)
  assert.equal(watchdogState().fired, false)
  setRunActive(false)
})

test('the crash reporter cannot depend on Phaser', () => {
  // It has to work when the renderer is the thing that died.
  for (const f of ['systems/Diagnostics.ts', 'systems/Watchdog.ts', 'systems/ErrorPanel.ts']) {
    assert.ok(!/from 'phaser'/.test(src(f)), `${f} imports Phaser`)
  }
})

test('the page catches errors before the game bundle is even parsed', () => {
  // A module that fails to parse never runs its own handler, and that is
  // exactly the failure that leaves a black screen.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  assert.ok(html.includes('__earlyErrors'), 'index.html has no pre-boot error catcher')
  assert.ok(/addEventListener\(\s*'error'/.test(html))
  assert.ok(src('systems/ErrorPanel.ts').includes('__earlyErrors'), 'the early errors are never drained')
})

test('the run arms the watchdog and hands over its state', () => {
  const scene = src('scenes/GameScene.ts')
  assert.ok(scene.includes('heartbeat()'), 'the loop never beats')
  assert.ok(scene.includes('setRunActive(true)'), 'the watchdog is never armed')
  assert.ok(scene.includes('provideState('), 'a crash report would carry no state')
  // The things a freeze report has to answer: which wave, what mode, was an
  // ability mid-cast.
  for (const key of ['wave', 'phase', 'casting', 'mode']) {
    assert.ok(new RegExp(`\\b${key}:`).test(scene), `state omits ${key}`)
  }
})
