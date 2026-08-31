// Notices when the game stops moving.
//
// The reported failure was a freeze during a boss fight: the board stopped and
// there was nothing to report afterwards. A freeze has no error attached to
// it, so nothing else in the diagnostics would fire.
//
// The heartbeat is written by the game loop and read by a `setInterval` that
// does not belong to Phaser. That split matters: if the renderer throws every
// frame, or `requestAnimationFrame` stops being served, the interval still
// runs and can say so.
//
// It cannot catch a main thread wedged in an infinite loop — nothing running
// on that thread can — and it deliberately says nothing while the tab is in
// the background, where the browser stops animation frames on purpose.

import { logEvent } from './Diagnostics.ts'

/** How long the loop may go without a beat before it counts as a freeze. */
export const FREEZE_MS = 3000

let beat = 0
let active = false
let timer: ReturnType<typeof setInterval> | null = null
let fired = false
let onFreeze: ((stalledMs: number) => void) | null = null

/** Called from the game loop every frame. */
export function heartbeat(): void {
  beat = Date.now()
  // A loop that recovers may report again if it stalls a second time.
  fired = false
}

/** A run is in progress: a stalled loop now matters. Between runs the loop
 *  legitimately idles on menus that do not animate. */
export function setRunActive(v: boolean): void {
  active = v
  beat = Date.now()
  fired = false
  logEvent('watchdog', v ? 'armed' : 'disarmed')
}

export function installWatchdog(handler: (stalledMs: number) => void): void {
  onFreeze = handler
  if (timer !== null) return
  beat = Date.now()
  timer = setInterval(check, 500)
}

export function stopWatchdog(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
}

/** Exposed so a test can drive it without waiting three seconds. */
export function check(now = Date.now(), hidden = isHidden()): void {
  if (!active || fired) return
  // A backgrounded tab is throttled or stopped by the browser. Reporting that
  // as a freeze would cry wolf on every phone call.
  if (hidden) {
    beat = now
    return
  }
  const stalled = now - beat
  if (stalled < FREEZE_MS) return
  fired = true
  logEvent('watchdog', `loop stalled ${stalled}ms`)
  onFreeze?.(stalled)
}

/** For tests: the internals, without exporting the mutable state itself. */
export function watchdogState(): { beat: number; active: boolean; fired: boolean } {
  return { beat, active, fired }
}

export function setBeatForTest(v: number): void {
  beat = v
}

function isHidden(): boolean {
  try {
    return globalThis.document?.visibilityState === 'hidden'
  } catch {
    return false
  }
}
