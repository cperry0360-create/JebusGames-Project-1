/**
 * Whether the GPU took the drawing surface away, and when.
 *
 * THE CANDIDATE THIS EXISTS TO CONFIRM OR KILL. Six crash reports say
 * `Script error.` with no stack, from a same-origin bundle carrying
 * `crossorigin="anonymous"`, which is not supposed to happen. A WebGL context
 * loss fits every fact none of the other five candidates did:
 *
 *   - it produces a failure that looks like nothing in the JavaScript
 *   - it dies on any scene — Splash in one report, Title in another
 *   - it is Safari-specific, because WebKit drops contexts far more readily
 *     than Chrome does, which is why Chrome on the same phone is fine
 *   - it fires when another surface composites over the page, which is exactly
 *     what tapping Share does
 *   - the drawing buffer is 2868x915 at devicePixelRatio 3, which is a large
 *     allocation to ask a phone to keep hold of
 *
 * A HANDLER ALREADY EXISTED. `Lifecycle.installContextLossGuard` has listened
 * for `webglcontextlost` since before any of this, calls `preventDefault()` so
 * the loss is recoverable, and logs `webgl context lost`. **No report has ever
 * carried that line.** That is worth knowing but is not proof of absence: a
 * context that dies with the page may never dispatch the event at all, and the
 * event log is a ring buffer.
 *
 * So this asks the context ITSELF, at the moment the report is written, rather
 * than relying on an event having been seen. `gl.isContextLost()` is a live
 * question with a straight answer, and it is the one thing that has never been
 * in a report.
 *
 * A RECORDER, NOT A FIX. Nothing here recovers anything or swallows anything.
 * If the next report says `webglContextLost = true`, that is the diagnosis.
 */

import { logEvent } from './Diagnostics.ts'

/** Set when `Lifecycle` actually managed to attach its canvas listeners. */
let guardAttached: boolean | null = null
let lostCount = 0
let restoredCount = 0
let lastLostAt = 0
let lastRestoredAt = 0
/** The rendering context, handed over once so this can be asked later. */
let canvas: HTMLCanvasElement | null = null

/**
 * Records whether the context-loss listeners went on.
 *
 * `installContextLossGuard` returns early and silently when there is no canvas
 * to attach to. A silent gap in exactly the diagnostic being relied on is the
 * shape of mistake this investigation has already made twice — a guard that
 * reports itself installed and is not — so the answer is recorded either way
 * and shows up in the crash report.
 */
export function noteContextGuard(attached: boolean, c?: HTMLCanvasElement | null): void {
  guardAttached = attached
  canvas = c ?? null
  logEvent('graphics', attached
    ? 'context-loss listeners attached to the canvas'
    : 'NO CANVAS to attach context-loss listeners to')
}

export function noteContextLost(): void {
  lostCount++
  lastLostAt = Date.now()
}

export function noteContextRestored(): void {
  restoredCount++
  lastRestoredAt = Date.now()
}

/**
 * Asks the live context whether it is gone.
 *
 * Deliberately does NOT create a context if one does not exist:
 * `getContext('webgl')` on a canvas Phaser is running in Canvas2D mode would
 * fail, and on a WebGL canvas it returns the existing context rather than a new
 * one, so this is a read either way.
 */
function contextLostNow(): string {
  if (!canvas) return 'no canvas'
  try {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      { isContextLost?: () => boolean; drawingBufferWidth?: number; drawingBufferHeight?: number }
      | null
    if (!gl) return 'not a webgl canvas (canvas2d renderer)'
    return typeof gl.isContextLost === 'function' ? String(gl.isContextLost()) : 'unknown'
  } catch (err) {
    // A dead context can throw on the way in, which is itself the answer.
    return `unreadable (${(err as Error)?.message ?? 'no message'})`
  }
}

/** The drawing buffer, which is the allocation a phone may refuse to keep. */
function bufferSize(): string {
  if (!canvas) return 'no canvas'
  try {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      { drawingBufferWidth?: number; drawingBufferHeight?: number } | null
    if (!gl) return `${canvas.width}x${canvas.height} (canvas2d)`
    return `${gl.drawingBufferWidth ?? '?'}x${gl.drawingBufferHeight ?? '?'}`
  } catch {
    return 'unreadable'
  }
}

/** Everything the crash report needs about the drawing surface. */
export function graphicsState(): Record<string, unknown> {
  const now = Date.now()
  return {
    // THE LINE THAT WOULD END THIS. A live question to the context, not an
    // inference from an event that may never have been dispatched.
    webglContextLost: contextLostNow(),
    drawingBuffer: bufferSize(),
    contextLostEvents: lostCount,
    contextRestoredEvents: restoredCount,
    lastContextLost: lastLostAt ? `${now - lastLostAt}ms ago` : 'never',
    lastContextRestored: lastRestoredAt ? `${now - lastRestoredAt}ms ago` : 'never',
    contextLossGuard: guardAttached === null
      ? 'never ran'
      : guardAttached ? 'attached' : 'NOT ATTACHED (no canvas)',
  }
}

/** For tests, which drive this more than once. */
export function resetGraphicsWatch(): void {
  guardAttached = null
  lostCount = 0
  restoredCount = 0
  lastLostAt = 0
  lastRestoredAt = 0
  canvas = null
}
