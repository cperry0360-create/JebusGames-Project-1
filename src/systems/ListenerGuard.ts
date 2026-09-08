/**
 * Wrapping every event listener in the page, including the ones Phaser
 * registers for itself.
 *
 * WHY THIS IS SO COARSE. Five diagnoses have failed. The last pass wrapped nine
 * sites by hand — the game loop, six scene resize handlers, the orientation
 * sync, the viewport settle, four DOM listeners, `safeAreaInsets` — and the
 * next crash report confirmed all nine were installed (`the game loop is
 * wrapped` is in its event log at 42ms) and that **not one of them fired**. The
 * cause was still `uncaught exception` and the error was still `Script error.`
 *
 * So the throw is somewhere nothing hand-wrapped reaches, and the remaining
 * candidates were Phaser's own DOM listeners and its input plugin. Rather than
 * chase those one at a time through a minified bundle — and get it wrong again,
 * the way `game.step` was wrapped last pass and turned out to be a method
 * nothing read — this patches `addEventListener` itself, before Phaser
 * initialises. Every listener anyone registers from then on is wrapped by
 * construction: Phaser's, ours, the browser's shims, anything.
 *
 * It cannot be routed around, and it would have caught this already.
 *
 * NOTHING IS SWALLOWED. Every wrapper rethrows, exactly as `Guard.ts` does.
 *
 * THE BEACON IS THE OTHER HALF, and may matter more than the wrapping. Even if
 * the throw turns out not to be inside any listener at all, this records WHICH
 * EVENT WAS BEING DISPATCHED when the page died — type, target and how long ago
 * — and puts it in the crash report. A report that says the last thing in
 * flight was a `resize` on `visualViewport` names the trigger even with no
 * stack whatsoever, which is the situation five reports have now been in.
 */

import { logEvent, provideContext } from './Diagnostics.ts'
import { noteCaught } from './Guard.ts'

type Listener = EventListenerOrEventListenerObject | null | undefined
type Options = boolean | AddEventListenerOptions | undefined

/** Set while a listener is running, so a nested failure cannot recurse through
 *  the reporter and bury the first fault under its own. */
let reporting = false

let installed = false
let wrappedCount = 0

/** The event being dispatched right now, or the last one that finished. */
interface InFlight {
  type: string
  target: string
  at: number
  /** True while the listener is still on the stack. A crash report written
   *  with this true is a crash DURING that event. */
  running: boolean
}

let current: InFlight | null = null
/** A short tail of recent event types, so the report shows the sequence rather
 *  than only the last one. Deliberately tiny: this is a breadcrumb, not a log,
 *  and the real event log is next to it in the same report. */
const recent: string[] = []
const RECENT_MAX = 12

/** Names a target well enough to act on, without assuming it is an Element. */
function describeTarget(t: unknown): string {
  try {
    if (t === globalThis) return 'window'
    const o = t as { nodeName?: unknown; id?: unknown; constructor?: { name?: string } }
    if (typeof o?.nodeName === 'string') {
      return o.id ? `${o.nodeName.toLowerCase()}#${String(o.id)}` : o.nodeName.toLowerCase()
    }
    return o?.constructor?.name ?? typeof t
  } catch {
    return 'unreadable target'
  }
}

/**
 * Every wrapper this has made, so `removeEventListener` can find the wrapper
 * that was actually registered.
 *
 * THIS IS THE PART THAT BREAKS THINGS IF IT IS WRONG. Removal matches on
 * identity: register a wrapper and then remove the raw listener and the
 * wrapper stays, which would leak every listener in the game and defeat
 * `SceneEvents`, whose entire reason for existing is a leaked resize handler.
 * Keyed by type AND capture flag, because the same function may legitimately
 * be registered for several events and for both phases.
 */
const wrappers = new WeakMap<object, Map<string, EventListener>>()

function keyFor(type: string, options: Options): string {
  const capture = typeof options === 'boolean' ? options : !!options?.capture
  return `${type}|${capture ? 'capture' : 'bubble'}`
}

function callListener(listener: EventListenerOrEventListenerObject, thisArg: unknown, ev: Event): void {
  if (typeof listener === 'function') listener.call(thisArg, ev)
  else listener.handleEvent(ev)
}

/** The wrapper actually registered with the browser. */
function makeWrapper(
  listener: EventListenerOrEventListenerObject, type: string,
): EventListener {
  return function wrapped(this: unknown, ev: Event): void {
    const before = current
    current = { type, target: describeTarget(this), at: Date.now(), running: true }
    if (recent.length >= RECENT_MAX) recent.shift()
    recent.push(`${type}@${current.target}`)
    try {
      callListener(listener, this, ev)
    } catch (err) {
      if (!reporting) {
        reporting = true
        try {
          noteCaught(`a "${type}" listener on ${describeTarget(this)}`, err)
        } finally {
          reporting = false
        }
      }
      throw err
    } finally {
      if (current) current.running = false
      // ONLY IF THE OUTER ONE IS STILL ON THE STACK. Restoring `before`
      // unconditionally was wrong and the harness caught it: at the top level
      // `before` is the PREVIOUS, already-finished event, so every dispatch
      // reverted the breadcrumb to the first event of the session and the
      // beacon reported a stale `ping on div` after a real resize. The outer
      // frame is the one still running; anything else is history.
      if (before?.running) current = before
    }
  }
}

/**
 * Patches `EventTarget.prototype`, which is what `window`, `document`, the
 * canvas, `visualViewport` and `screen.orientation` all inherit from. One
 * patch covers every target in the page rather than a list of the ones
 * somebody remembered.
 *
 * Call BEFORE the game is constructed. Listeners registered earlier are not
 * wrapped, which is why this goes first in `main.ts`.
 */
export function installListenerGuard(): void {
  if (installed) return
  const proto = (globalThis as { EventTarget?: { prototype?: EventTarget } }).EventTarget?.prototype
  if (!proto) return
  const target = proto as unknown as {
    addEventListener: (t: string, l: Listener, o?: Options) => void
    removeEventListener: (t: string, l: Listener, o?: Options) => void
  }
  const rawAdd = target.addEventListener
  const rawRemove = target.removeEventListener
  if (typeof rawAdd !== 'function' || typeof rawRemove !== 'function') return
  installed = true

  target.addEventListener = function (this: EventTarget, type, listener, options): void {
    // A patch that can itself throw would break every listener in the page, so
    // anything unexpected falls through to the real implementation unwrapped.
    try {
      if (!listener) return rawAdd.call(this, type, listener, options)
      const key = keyFor(type, options)
      let byKey = wrappers.get(listener as object)
      if (!byKey) {
        byKey = new Map()
        wrappers.set(listener as object, byKey)
      }
      let w = byKey.get(key)
      if (!w) {
        w = makeWrapper(listener, type)
        byKey.set(key, w)
        wrappedCount++
      }
      return rawAdd.call(this, type, w, options)
    } catch {
      return rawAdd.call(this, type, listener, options)
    }
  }

  target.removeEventListener = function (this: EventTarget, type, listener, options): void {
    try {
      if (listener) {
        const w = wrappers.get(listener as object)?.get(keyFor(type, options))
        if (w) return rawRemove.call(this, type, w, options)
      }
    } catch {
      // Fall through and try the raw listener.
    }
    return rawRemove.call(this, type, listener, options)
  }

  guardAnimationFrame()
  provideContext('events', eventContext)
  logEvent('guard', 'every event listener is wrapped from here on')
}

/**
 * The frame callback, which is the one entry point that is not an event.
 *
 * Phaser's `TimeStep` drives itself from `requestAnimationFrame`, and only the
 * inner `loop.callback` was wrapped last pass — anything `TimeStep.step` does
 * around that call is outside it. This closes the gap without needing to know
 * what Phaser's internals look like.
 */
function guardAnimationFrame(): void {
  const g = globalThis as unknown as {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number
  }
  const raw = g.requestAnimationFrame
  if (typeof raw !== 'function') return
  g.requestAnimationFrame = function (cb: FrameRequestCallback): number {
    return raw.call(globalThis, (t: number) => {
      try {
        cb(t)
      } catch (err) {
        if (!reporting) {
          reporting = true
          try {
            noteCaught('a requestAnimationFrame callback', err)
          } finally {
            reporting = false
          }
        }
        throw err
      }
    })
  }
}

/** What the report needs: how much is covered, and what was in flight. */
function eventContext(): Record<string, unknown> {
  return {
    wrappedListeners: wrappedCount,
    // THE LINE THAT NAMES THE TRIGGER EVEN WITH NO STACK. `running` separates
    // "the page died during this event" from "this was merely the last event
    // to finish", and those are very different claims.
    lastEvent: current
      ? `${current.type} on ${current.target} `
        + `(${current.running ? 'STILL RUNNING' : 'finished'}, `
        + `${Date.now() - current.at}ms ago)`
      : 'none dispatched yet',
    recentEvents: recent.join(' ') || 'none',
  }
}

/** For the harness: the same facts, without going through a crash report. */
export function listenerStats(): Record<string, unknown> {
  return { installed, ...eventContext() }
}

/** For tests, which need to drive this more than once. */
export function resetListenerStats(): void {
  wrappedCount = 0
  current = null
  recent.length = 0
}
