/**
 * Wrapping what the page SCHEDULES, not what it handles.
 *
 * THE LEAD THIS EXISTS FOR, and it is the sharpest one in seven reports. The
 * latest says:
 *
 *     lastEvent    = resize on VisualViewport (finished, 1754ms ago)
 *     cause        = uncaught exception   -- NOT "caught inside ..."
 *     scenesRunning = Splash
 *
 * A listener ran to completion and something threw **1.7 seconds later**. Every
 * listener in the page is wrapped — 41 of them, Phaser's included — and not one
 * caught it. So the throw is not in a listener at all. It is in something the
 * viewport change SCHEDULED, running on a callback path `addEventListener`
 * wrapping cannot reach.
 *
 * `setTimeout` is the obvious such path, and `Orientation.settle` uses it
 * directly: after a resize it re-measures at 60ms, 180ms and 400ms. Those
 * callbacks are `guarded`, but anything else scheduled from inside a viewport
 * event is not.
 *
 * WHAT IS ALREADY COVERED, so this does not duplicate it:
 *   - `requestAnimationFrame` — wrapped in ListenerGuard.
 *   - Phaser tween `onComplete`/`onUpdate`/`onYoyo`, and Scene `time` events
 *     (`delayedCall`, `addEvent`) — these are stepped by Phaser from inside
 *     `Game.step`, which is `loop.callback`, which `Guard.guardGameLoop`
 *     wraps. A throw in any of them is already caught and labelled `the game
 *     loop`. The report says the loop guard did not fire, so they are ruled
 *     out rather than unexamined.
 *
 * THE SECOND HALF IS WHERE IT WAS SCHEDULED FROM. Catching the throw names the
 * callback; it does not name who armed it, and an anonymous `setTimeout` in a
 * minified bundle is not an answer. So a stack is captured AT SCHEDULING TIME
 * for anything armed while a DOM event is in flight — which is exactly the
 * shape of this lead — and carried through to the report.
 *
 * NOTHING IS SWALLOWED. Every wrapper rethrows.
 */

import { logEvent, provideContext, safeString } from './Diagnostics.ts'
import { noteCaught } from './Guard.ts'
import { eventInFlight } from './ListenerGuard.ts'

/** One armed callback that has not run yet. */
interface Pending {
  kind: 'timeout' | 'interval'
  /** Milliseconds asked for. */
  delay: number
  /** When it was armed, as ms since this module loaded. */
  at: number
  /** The DOM event in flight when it was armed, or '' for none. */
  during: string
  /** Where it was armed from. Only captured when it is worth the cost. */
  from: string
}

const pending = new Map<number, Pending>()
/** A hard cap. A page that arms timers faster than they fire must not turn
 *  this diagnostic into the leak. */
const MAX_PENDING = 400
let installed = false
let armed = 0
let fired = 0
const started = Date.now()

/** Milliseconds since this module loaded, which is close enough to page load
 *  to line up with the event log's own clock. */
function now(): number {
  return Date.now() - started
}

/**
 * Where a callback was armed from.
 *
 * NOT CAPTURED FOR EVERY TIMER. `new Error()` costs a stack walk, and a game
 * loop arms timers constantly; doing it unconditionally would be a measurable
 * tax for a diagnostic that only matters in one situation. It is captured when
 * a DOM event is in flight — which is precisely the case this file exists for,
 * a callback armed by the viewport change and running later — and for long
 * delays, where the gap between arming and firing is what makes the origin
 * hard to guess.
 */
function originOf(delay: number, during: string): string {
  if (!during && delay < 500) return ''
  try {
    const stack = new Error('scheduled here').stack ?? ''
    // FILTERED, NOT SLICED BY INDEX. V8 puts an `Error: message` header line
    // first and JavaScriptCore does not, so a fixed `slice(2)` keeps a frame of
    // this file on Chrome and drops a real caller's frame on Safari — and
    // Safari is the only browser this crash happens in. Dropping this module's
    // own frames by name is true on both.
    return stack
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '' && !/^Error\b/.test(l) && !/ScheduleGuard/.test(l))
      .slice(0, 4)
      .join(' <- ')
  } catch {
    return 'unreadable'
  }
}

function describe(p: Pending): string {
  return `${p.kind}(${p.delay}ms) armed ${now() - p.at}ms ago`
    + (p.during ? ` during "${p.during}"` : '')
    + (p.from ? ` from ${p.from}` : '')
}

/**
 * Patches `setTimeout`, `setInterval` and `queueMicrotask`.
 *
 * Call BEFORE the game is constructed, for the same reason the listener patch
 * does: only callbacks armed after it are wrapped.
 */
export function installScheduleGuard(): void {
  if (installed) return
  const g = globalThis as unknown as {
    setTimeout?: (fn: unknown, ms?: number, ...rest: unknown[]) => number
    setInterval?: (fn: unknown, ms?: number, ...rest: unknown[]) => number
    clearTimeout?: (id?: number) => void
    clearInterval?: (id?: number) => void
    queueMicrotask?: (fn: () => void) => void
  }
  const rawTimeout = g.setTimeout
  const rawInterval = g.setInterval
  const rawClearTimeout = g.clearTimeout
  const rawClearInterval = g.clearInterval
  if (typeof rawTimeout !== 'function' || typeof rawInterval !== 'function') return
  installed = true

  const wrap = (
    kind: 'timeout' | 'interval',
    fn: unknown,
    delay: number,
    idBox: { id: number },
  ): (() => void) => {
    // A string first argument is legal and is `eval` in disguise. It is passed
    // straight through unwrapped rather than being made to look covered.
    if (typeof fn !== 'function') return fn as () => void
    const label = `a ${kind} callback (${delay}ms)`
    return function (this: unknown, ...args: unknown[]): void {
      if (kind === 'timeout') pending.delete(idBox.id)
      fired++
      try {
        ;(fn as (...a: unknown[]) => void).apply(this, args)
      } catch (err) {
        const p = pending.get(idBox.id)
        noteCaught(p ? `${label} ${describe(p)}` : label, err)
        throw err
      }
    }
  }

  g.setTimeout = function (fn: unknown, ms?: number, ...rest: unknown[]): number {
    const delay = Number(ms) || 0
    const idBox = { id: -1 }
    const id = rawTimeout.call(globalThis, wrap('timeout', fn, delay, idBox), ms, ...rest)
    idBox.id = id
    armed++
    if (pending.size < MAX_PENDING) {
      const during = eventInFlight()
      pending.set(id, { kind: 'timeout', delay, at: now(), during, from: originOf(delay, during) })
    }
    return id
  } as typeof g.setTimeout

  g.setInterval = function (fn: unknown, ms?: number, ...rest: unknown[]): number {
    const delay = Number(ms) || 0
    const idBox = { id: -1 }
    const id = rawInterval.call(globalThis, wrap('interval', fn, delay, idBox), ms, ...rest)
    idBox.id = id
    armed++
    if (pending.size < MAX_PENDING) {
      const during = eventInFlight()
      pending.set(id, { kind: 'interval', delay, at: now(), during, from: originOf(delay, during) })
    }
    return id
  } as typeof g.setInterval

  if (typeof rawClearTimeout === 'function') {
    g.clearTimeout = function (id?: number): void {
      if (typeof id === 'number') pending.delete(id)
      rawClearTimeout.call(globalThis, id)
    }
  }
  if (typeof rawClearInterval === 'function') {
    g.clearInterval = function (id?: number): void {
      if (typeof id === 'number') pending.delete(id)
      rawClearInterval.call(globalThis, id)
    }
  }

  // A microtask is the other way a continuation runs later without a listener
  // or a timer, and it is how a promise chain resumes.
  const rawMicro = g.queueMicrotask
  if (typeof rawMicro === 'function') {
    g.queueMicrotask = function (fn: () => void): void {
      rawMicro.call(globalThis, () => {
        try {
          fn()
        } catch (err) {
          noteCaught('a queueMicrotask callback', err)
          throw err
        }
      })
    }
  }

  provideContext('schedule', scheduleState)
  logEvent('guard', 'setTimeout, setInterval and queueMicrotask are wrapped')
}

/**
 * What was armed and had not run when the report was written.
 *
 * THE LINE THAT WOULD END THIS. A report naming a pending timer, how long ago
 * it was armed, which DOM event armed it and the frames it was armed from
 * identifies the culprit even with no stack from the throw itself.
 */
export function scheduleState(): Record<string, unknown> {
  const list = [...pending.values()].sort((a, b) => a.at - b.at)
  // The ones armed during a DOM event first: that is the lead, and a report
  // truncated by size should keep those rather than the game's own timers.
  const interesting = list.filter((p) => p.during !== '')
  const show = (interesting.length ? interesting : list).slice(-6)
  return {
    timersArmed: armed,
    timersFired: fired,
    timersPending: pending.size,
    pendingDuringAnEvent: interesting.length,
    pendingDetail: show.length
      ? show.map(describe).join(' | ')
      : 'nothing pending',
  }
}

/** For the harness and the tests. */
export function scheduleStats(): Record<string, unknown> {
  return { installed, ...scheduleState() }
}

export function resetScheduleGuard(): void {
  pending.clear()
  armed = 0
  fired = 0
}

/** Never throws, whatever it is handed. Used by the harness probes. */
export function describePending(): string {
  try {
    return safeString(scheduleState())
  } catch {
    return 'unreadable'
  }
}
