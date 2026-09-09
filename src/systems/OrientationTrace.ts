/**
 * What the orientation gate's streak counter is actually counting.
 *
 * `ENTER_FRAMES` is 3 and its comment says "three frames is under 50ms at
 * 60fps". Driving `OrientationGate` frame by frame confirms it behaves that
 * way. But the streak increments once per `sync()` CALL, and `sync()` runs
 * from two clocks:
 *
 *   - `POST_STEP`, once per rendered frame;
 *   - `settle()`, FIVE times per event -- immediately, on the next rAF, and at
 *     60ms, 180ms and 400ms.
 *
 * A rotation fires `resize`, `orientationchange` and a `visualViewport resize`,
 * so up to fifteen extra calls land inside a few milliseconds. Three of them
 * reading the same stale value raise the gate in far less time than
 * `ENTER_FRAMES` claims to allow -- which is why `CrashContext` has a "gate
 * raised" and a "gate lowered" 21ms apart, a gap that is impossible if the
 * counter were counting frames.
 *
 * THIS MODULE ONLY WATCHES. It records what each call saw and returns; it
 * changes no decision, swallows nothing, and adds no hysteresis. The question
 * is what the counter counts, not how to make it count differently.
 *
 * NO PHASER, deliberately: `npm install` answers 403 in the agent environment,
 * so anything reaching the engine cannot be executed by a test at all. See
 * CLAUDE.md's standing facts.
 */

/** One `sync()` call, as it happened. */
export interface SyncRecord {
  /** `performance.now()` at the call, in ms. */
  at: number
  /** Which clock called it: `post-step`, or `<event>:<leg>` from a settle. */
  source: string
  /** What `isPortrait()` returned -- the media query, or the fallback. */
  portrait: boolean
  /** The streak AFTER this call. */
  streak: number
  /** Whether the gate was up after this call. */
  up: boolean
  /** The transition this call caused, if any. */
  change: 'raised' | 'lowered' | null
  /** The viewport as the DOM reported it at this instant, CSS pixels. */
  vw: number
  vh: number
}

/**
 * A ring, because a rotation can produce twenty calls and a session produces
 * thousands. Big enough to hold several whole rotations, small enough to ride
 * along in a crash report.
 */
const CAP = 120
const ring: SyncRecord[] = []

/** Records one call. Called from the sync wrapper and from nowhere else. */
export function traceSync(r: SyncRecord): void {
  ring.push(r)
  if (ring.length > CAP) ring.shift()
}

/** Everything still in the ring, oldest first. */
export function syncTrace(): SyncRecord[] {
  return [...ring]
}

/** Drops the ring. For tests and for a harness scenario that wants a clean run. */
export function clearSyncTrace(): void {
  ring.length = 0
}

/**
 * The calls that arrived in bursts, which is the whole point of the trace.
 *
 * A "burst" is two or more calls inside `windowMs`. Under the design's own
 * assumption -- one call per rendered frame -- there should be none at 8ms,
 * because two frames cannot land inside 8ms at 60fps. Every burst is a group
 * of calls the streak counted as if they were separate frames.
 */
export function syncBursts(windowMs = 8): { from: number; calls: SyncRecord[] }[] {
  const out: { from: number; calls: SyncRecord[] }[] = []
  let run: SyncRecord[] = []
  for (const r of ring) {
    if (run.length === 0 || r.at - run[run.length - 1]!.at <= windowMs) {
      run.push(r)
    } else {
      if (run.length > 1) out.push({ from: run[0]!.at, calls: run })
      run = [r]
    }
  }
  if (run.length > 1) out.push({ from: run[0]!.at, calls: run })
  return out
}

/**
 * The shortest time in which the gate went from streak 0 to raised.
 *
 * `null` when the gate never raised in what the ring still holds. This is the
 * number `ENTER_FRAMES`'s comment makes a claim about: it should be at least
 * two frame intervals, about 33ms at 60fps, and the crash report has 21ms
 * between a raise and a lower.
 */
export function fastestRaiseMs(): number | null {
  let streakStartedAt: number | null = null
  let best: number | null = null
  for (const r of ring) {
    if (r.streak === 1) streakStartedAt = r.at
    if (r.change === 'raised' && streakStartedAt !== null) {
      const took = r.at - streakStartedAt
      if (best === null || took < best) best = took
      streakStartedAt = null
    }
    if (r.streak === 0) streakStartedAt = null
  }
  return best
}

/** A compact line per call, for a log or a crash report. */
export function formatSyncTrace(limit = 40): string[] {
  const rs = ring.slice(-limit)
  const t0 = rs.length ? rs[0]!.at : 0
  return rs.map((r) => `+${(r.at - t0).toFixed(1)}ms ${r.source}`
    + ` portrait=${r.portrait} streak=${r.streak} up=${r.up}`
    + `${r.change ? ' ' + r.change.toUpperCase() : ''} ${r.vw}x${r.vh}`)
}
