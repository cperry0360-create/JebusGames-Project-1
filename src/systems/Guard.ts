/**
 * Catching the exception where it is thrown, because the browser will not
 * describe it.
 *
 * THE PROBLEM, AND WHY THE OBVIOUS FIX FAILED. Four crash reports from an
 * iPhone all read:
 *
 *     error  Script error.
 *     STACK  (none)
 *
 * "Script error." with no message, file, line or stack is what a browser hands
 * `window.onerror` for a script it treats as cross-origin. So the module script
 * was given `crossorigin="anonymous"`, and a build check was added to prove the
 * attribute survives Vite. Both worked. The report now says:
 *
 *     bundleSameOrigin  = true
 *     scriptCrossOrigin = anonymous
 *     error             = Script error.     <- STILL muted
 *
 * A same-origin bundle, correctly annotated, whose errors are still muted means
 * `window.onerror` is not seeing this from the bundle at all, and no amount of
 * further CORS work will change that. That line of enquiry is closed.
 *
 * THE WAY ROUND IT. An exception caught by our own `try`/`catch` carries its
 * real message and its real stack, because the muting rules apply to what the
 * browser REPORTS to a global handler, not to the Error object itself. So the
 * places this can plausibly throw are wrapped, and the caught error is written
 * straight into the crash report before it is let go.
 *
 * NOTHING IS SWALLOWED. Every wrapper rethrows. The aim is to SEE the error,
 * not to survive it — a game that limps on past a fault it will not describe is
 * how this bug survived four diagnoses. If the rethrow kills the frame, that is
 * the same thing that was already happening, only now with a message attached.
 */

import type Phaser from 'phaser'
import { logEvent, safeString } from './Diagnostics.ts'
import { reportQuietly } from './ErrorPanel.ts'

/**
 * How many times one label may fill in a full report before it goes quiet.
 *
 * A throw inside the game loop repeats every frame. The first few are the
 * evidence; the next six hundred would push the event ring — which is the
 * other half of the report — out of the buffer, and evict the very context
 * that says what the game was doing when it started. So a label reports in
 * full a few times and is counted after that.
 */
const MAX_REPORTS_PER_LABEL = 3

const seen = new Map<string, number>()

/** For tests, and for a rebuilt game that should start counting again. */
export function resetGuards(): void {
  seen.clear()
}

/** How many times each guarded site has thrown. Empty on a healthy session. */
export function guardCounts(): Record<string, number> {
  return Object.fromEntries(seen)
}

/**
 * Writes a caught error into the crash report, with everything the browser
 * would have withheld.
 *
 * `reportQuietly` rather than `report`: the panel is drawn by the global
 * handler when the rethrow reaches it, and drawing it twice for one fault
 * would cover the screen with the same text. This is the record; the rethrow
 * is what makes it visible.
 */
export function noteCaught(label: string, err: unknown): void {
  const n = (seen.get(label) ?? 0) + 1
  seen.set(label, n)

  if (n > MAX_REPORTS_PER_LABEL) {
    // Still counted, still visible in `guardCounts`, but no longer competing
    // with the event log for room.
    if (n === MAX_REPORTS_PER_LABEL + 1) {
      logEvent('guard', `${label} is throwing repeatedly; further reports suppressed`)
    }
    return
  }

  const e = err as { name?: unknown; message?: unknown; stack?: unknown } | null | undefined
  const name = e && typeof e.name === 'string' ? e.name : ''
  const message = e && typeof e.message === 'string' ? e.message : safeString(err)
  const stack = e && typeof e.stack === 'string' ? e.stack : ''

  logEvent('guard', `caught in ${label}: ${name ? `${name}: ` : ''}${message}`)
  reportQuietly(
    `caught inside ${label}`,
    // THE WHOLE POINT OF THIS FILE, in one string: a real name and a real
    // message, from an Error object we are holding rather than from an event
    // the browser sanitised.
    `${name ? `${name}: ` : ''}${message}`,
    stack,
  )
}

/**
 * Runs `fn`, records anything it throws, and rethrows it.
 *
 * The return value is passed through, so a guarded function can be used
 * wherever the unguarded one was.
 */
export function guarded<T>(label: string, fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    noteCaught(label, err)
    throw err
  }
}

/**
 * Wraps a callback so every call is guarded. For handlers that are registered
 * once and called by something else — a DOM listener, a Phaser emitter.
 *
 * The wrapper keeps the argument list, so it can be dropped in place of the
 * original at the registration site.
 */
export function guard<A extends unknown[], R>(
  label: string,
  fn: (...args: A) => R,
): (...args: A) => R {
  return (...args: A): R => {
    try {
      return fn(...args)
    } catch (err) {
      noteCaught(label, err)
      throw err
    }
  }
}

/**
 * Wraps the whole Phaser step: every scene's `update`, and the render pass.
 *
 * WRAPPING `Game.step` DOES NOT WORK, and the harness proved it. `TimeStep`
 * captures `game.step.bind(game)` once, when the game starts, and calls that
 * bound reference every frame — so assigning to `game.step` afterwards shadows
 * a method nothing reads. The first version of this did exactly that, reported
 * `__loopGuarded = true`, and caught nothing: a deliberate throw from inside a
 * scene's update walked straight past it to `window.onerror`, with the ORIGINAL
 * `Game.step` visible in the stack.
 *
 * So the thing to wrap is `loop.callback`, which is that captured reference.
 * Everything the engine does per frame is inside it — scene updates, the
 * display list, the renderer.
 *
 * The callback does not exist until `Game.start()` has run, and the game boots
 * asynchronously, so this wraps now if it can and on READY otherwise.
 * Idempotent, so a rebuilt game after a context loss cannot double-wrap.
 */
export function guardGameLoop(game: Phaser.Game): void {
  const g = game as unknown as {
    loop?: { callback?: (time: number, delta: number) => void; __guarded?: boolean }
    events?: { once?: (event: string, fn: () => void) => void }
  }

  const wrap = (): boolean => {
    const loop = g.loop
    if (!loop || typeof loop.callback !== 'function' || loop.__guarded) return false
    const original = loop.callback
    loop.callback = (time: number, delta: number): void => {
      try {
        original(time, delta)
      } catch (err) {
        noteCaught(LOOP_LABEL, err)
        throw err
      }
    }
    loop.__guarded = true
    logEvent('guard', 'the game loop is wrapped; a throw inside it will be described')
    return true
  }

  if (wrap()) return
  // Phaser.Core.Events.READY, as a literal so this module keeps its type-only
  // Phaser import. `Game.start` sets the loop callback and then emits it.
  g.events?.once?.('ready', () => { wrap() })
}

/** The label the loop guard reports under. Exported so a test can assert on
 *  the thing itself rather than on a copy of the string. */
export const LOOP_LABEL = 'the game loop'
