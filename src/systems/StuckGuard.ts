/**
 * The last line of defence: a run that has stopped and nobody owns.
 *
 * THE FAILURE THIS IS FOR. A player froze mid-run on level 1 — no tower
 * selection, no ability, no placement, enemies stopped mid-lane with full
 * health. The root cause was the rotate gate latching a pause on a stale
 * viewport reading, and that is fixed in OrientationGate. This is the net
 * under it, because the class of fault is not one bug: any state that stops
 * the board and forgets to hand it back looks exactly the same to a child
 * holding a phone, and the only recovery they have is to force-quit.
 *
 * WHAT IT WILL NOT DO. It will not fire on a settings panel, a rotate overlay,
 * a backgrounded tab, a pause dialog, or an armed ability the player is
 * thinking about — every one of those is a gate that ANNOUNCED itself through
 * InputGates, and a gate with an owner is the player's to close. It fires only
 * when input is held by nothing at all, or held by a gate while the world has
 * also stopped moving and no input has been accepted for several seconds.
 *
 * The decision is pure and the sampling is separate, so the rules can be
 * tested without a canvas, a clock or a phone. The installer runs on
 * `setInterval` rather than in the game loop for the same reason the watchdog
 * does: a loop that has stopped cannot notice that it has stopped.
 */

import { logEvent } from './Diagnostics.ts'

/**
 * How long a run may be held by nothing before it counts as stuck.
 *
 * Long enough that a slow frame, a scene transition or a rotation settling
 * cannot trip it; short enough that a child does not give up first. Six
 * seconds is about two of Cory's swings.
 */
export const STUCK_MS = 6000

/** How often the guard looks. */
export const SAMPLE_MS = 500

export interface StuckSample {
  now: number
  /** A run is on screen and ought to be moving. False on menus, where a still
   *  board is the correct state and nothing here applies. */
  runActive: boolean
  /**
   * Which input-gating state is held, or null when the player can act.
   * e.g. `paused`, `targeting`, `modal`.
   */
  gate: string | null
  /** A gate that announced itself and that the player can see and dismiss, or
   *  null when nothing claims the state. */
  owner: string | null
  /** A cheap fingerprint of everything that should be moving. Unchanged
   *  between samples means the simulation is not advancing. */
  motion: string
  /** When an input was last ACCEPTED. Not when one was last received: a tap
   *  that is swallowed is exactly the symptom. */
  lastInputAt: number
}

export type StuckVerdict =
  | { stuck: false }
  | { stuck: true; gate: string; owner: string | null; heldMs: number; motion: string }

/**
 * Watches samples and says when the game has stopped being playable.
 *
 * Stateful only in the way a stopwatch is: it remembers when the current
 * suspicious stretch started, and forgets the moment anything moves.
 */
export class StuckDetector {
  private since: number | null = null
  private lastMotion = ''

  /** For tests and the report: how long the current suspicious stretch is. */
  heldMs(now: number): number {
    return this.since === null ? 0 : now - this.since
  }

  reset(): void {
    this.since = null
  }

  assess(s: StuckSample): StuckVerdict {
    const moved = s.motion !== this.lastMotion
    this.lastMotion = s.motion

    // A menu, a cutscene, a finished run: a still board is correct.
    if (!s.runActive) return this.clear()
    // The player can act. Whatever else is true, this is not a lock.
    if (s.gate === null) return this.clear()
    // THE WORLD IS STILL MOVING. A modal over a live board is a normal thing
    // to leave open, and a player deciding where to throw a molotov is not
    // stuck. Only a stopped world counts.
    if (moved) return this.clear()
    // Input is still landing, so something is listening.
    if (s.now - s.lastInputAt < STUCK_MS) return this.clear()

    // An owned gate over a stopped world is still suspicious — that is a
    // settings panel the player has walked away from — but it is THEIRS to
    // close and it has a visible way out. Only report it; do not seize it.
    if (this.since === null) this.since = s.now
    const heldMs = s.now - this.since
    if (heldMs < STUCK_MS) return { stuck: false }
    return { stuck: true, gate: s.gate, owner: s.owner, heldMs, motion: s.motion }
  }

  private clear(): StuckVerdict {
    this.since = null
    return { stuck: false }
  }
}

/**
 * Whether a verdict is the game's fault or the player's business.
 *
 * An UNOWNED gate is always a bug and is always recovered from. An owned one
 * that has gone quiet is reported so it shows up in the log, but it is left
 * alone: seizing a settings panel out from under someone reading it would be a
 * worse bug than the one being guarded against.
 */
export function shouldRecover(v: StuckVerdict): boolean {
  return v.stuck && v.owner === null
}

export interface StuckHost {
  sample: () => StuckSample
  /** Put the game back into a state the player can act in. */
  recover: (v: StuckVerdict & { stuck: true }) => void
  /** Write a crash report without putting a wall of red text over the game. */
  report: (cause: string, message: string) => void
}

/** Runs the guard. Returns a function that stops it. */
export function installStuckGuard(host: StuckHost, sampleMs = SAMPLE_MS): () => void {
  const detector = new StuckDetector()
  let reported = false

  const timer = setInterval(() => {
    let v: StuckVerdict
    try {
      v = detector.assess(host.sample())
    } catch (err) {
      // A sampler that throws while the game is broken would hide the very
      // thing it is here to catch.
      logEvent('stuck', `sampler failed: ${String(err)}`)
      return
    }
    if (!v.stuck) {
      reported = false
      return
    }
    // One report per stretch. A guard that fires every 500ms would push the
    // events that led up to the lock straight out of the ring buffer.
    if (reported) return
    reported = true

    const line = `held by ${v.owner ?? 'NOTHING'} in ${v.gate} for ${(v.heldMs / 1000).toFixed(1)}s `
      + `with no motion and no accepted input`
    logEvent('stuck', line)
    host.report('soft lock', line)

    if (shouldRecover(v)) host.recover(v)
    else logEvent('stuck', `left alone: ${v.owner} owns it and the player can close it`)
  }, sampleMs)

  return () => clearInterval(timer)
}
