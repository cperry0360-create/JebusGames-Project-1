/**
 * Every mode that can stop the player acting, and who is holding it.
 *
 * WHY THIS EXISTS. A player froze mid-run on level 1: no tower selection, no
 * ability, no placement, enemies stopped mid-lane. The cause was a scene
 * paused by the rotate gate on a stale viewport reading, behind an overlay the
 * CSS had already hidden. Nothing in the game could tell that state from a
 * legitimate pause, because a legitimate pause looks identical from the
 * outside: a stopped scene and a quiet board.
 *
 * The difference is not what the state IS, it is whether anything CLAIMS it. A
 * settings panel, a rotate overlay, a backgrounded tab and a pause dialog all
 * have an owner the player can see and dismiss. A stray pause has none.
 *
 * So every gate announces itself on the way in and on the way out. That gives
 * two things at once: an event log that says which gates were open when a run
 * stopped, and a live answer to "is anybody holding this?" that the stuck
 * guard can act on. An unowned gate is a bug, every time.
 */

import { logEvent } from './Diagnostics.ts'

/** One gate that is currently holding input. */
interface OpenGate {
  /** When it opened, so the log can say how long it was held. */
  at: number
  /** The state that was true on the way in, for the report. */
  detail: string
}

const open = new Map<string, OpenGate>()

function describe(detail: Record<string, unknown>): string {
  return Object.entries(detail).map(([k, v]) => `${k}=${String(v)}`).join(' ')
}

/**
 * A gate is now holding input.
 *
 * `detail` is whatever a reader would need to reconstruct the moment: which
 * ability was armed, which wave it was, what the mode had been. It is logged
 * rather than merely counted, because the whole reason this exists is that the
 * last soft lock left nothing behind to read.
 *
 * Re-entering an already-open gate is not an error — a scene restart or a
 * second pause of an already-paused scene both do it — but it is logged, since
 * a gate that opens twice without closing is worth seeing in a report.
 */
export function enterGate(name: string, detail: Record<string, unknown> = {}): void {
  const already = open.get(name)
  open.set(name, { at: Date.now(), detail: describe(detail) })
  logEvent('gate', `+${name}${already ? ' (re-entered)' : ''} ${describe(detail)}`.trimEnd())
}

/**
 * A gate has let go.
 *
 * Leaving a gate that was never entered is logged rather than ignored: it
 * means some path out is not paired with a path in, which is the shape of the
 * bug that caused this whole file.
 */
export function leaveGate(name: string, detail: Record<string, unknown> = {}): void {
  const had = open.get(name)
  open.delete(name)
  const held = had ? ` held=${Date.now() - had.at}ms` : ' (was never entered)'
  logEvent('gate', `-${name}${held} ${describe(detail)}`.trimEnd())
}

/** The gates holding input right now, oldest first. */
export function openGates(): string[] {
  return [...open.entries()].sort((a, b) => a[1].at - b[1].at).map(([name]) => name)
}

/** True when at least one gate claims to be holding input. */
export function gateOwned(): boolean {
  return open.size > 0
}

/** Everything the report needs about the gates, in one line. */
export function gateSummary(): string {
  if (open.size === 0) return 'none'
  const now = Date.now()
  return [...open.entries()]
    .map(([name, g]) => `${name}(${now - g.at}ms${g.detail ? ' ' + g.detail : ''})`)
    .join(', ')
}

/** Forgets every gate. The recovery path, and test setup. */
export function clearGates(): void {
  if (open.size > 0) logEvent('gate', `cleared ${[...open.keys()].join(',')}`)
  open.clear()
}

/**
 * When input was last ACCEPTED — not when a tap was last made.
 *
 * The distinction is the whole diagnosis. A soft-locked game still receives
 * taps; the browser is fine and the canvas is fine. What stops is the scene
 * DISPATCHING them, because a paused scene runs no input step at all. So this
 * is bumped from inside the scenes' own handlers: if it goes stale while the
 * player is plainly still tapping, the scene is not listening.
 *
 * Not logged. A per-tap event would push three or four waves of context out of
 * the ring buffer, and the ring buffer is what makes a report worth reading.
 */
let acceptedAt = Date.now()

export function noteInputAccepted(): void {
  acceptedAt = Date.now()
}

export function lastInputAt(): number {
  return acceptedAt
}
