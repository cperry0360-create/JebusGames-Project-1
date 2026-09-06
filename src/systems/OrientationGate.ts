/**
 * The decision behind the rotate gate: which scenes are paused, and when.
 *
 * WHY THIS IS ITS OWN FILE. The gate used to make this decision inline, and it
 * made it ASYMMETRICALLY: it paused from a per-frame hook and resumed only
 * from a resize listener. A viewport that read portrait on a single frame —
 * which is exactly what iOS does either side of a rotation, as the gate's own
 * comments say — therefore latched a pause that no event would ever undo. The
 * run froze mid-wave behind a hidden overlay with no error, no report and no
 * way back. That is the soft lock a player hit on level 1.
 *
 * The shape of the old design is the bug: a state with a per-frame way IN and
 * an event-driven way OUT can only ever fail closed. So the decision is one
 * function that is handed the current reading and returns the whole answer,
 * and the caller runs it on the same clock every time. Whatever puts the gate
 * up takes it down again.
 *
 * Phaser-free on purpose. The gate's tests were all regular expressions over
 * the source — they asserted that the words `game.scene.resume(key)` appeared
 * somewhere in the file, which they did, in a branch that could not be
 * reached. A test that can run the state machine is the only kind that would
 * have caught this.
 */

import { logEvent } from './Diagnostics.ts'
import { enterGate, leaveGate } from './InputGates.ts'

/** The scene manager, reduced to the four things the gate needs from it. */
export interface GateHost {
  /** Keys of the scenes currently RUNNING. A scene the game paused for its own
   *  reasons must not appear here, or the gate resumes a run the player
   *  deliberately stopped. */
  running(): string[]
  isPaused(key: string): boolean
  pause(key: string): void
  resume(key: string): void
}

/** The loader. Pausing a scene mid-preload stalls the download. */
export const NEVER_PAUSE = 'Boot'

/**
 * How many consecutive portrait readings it takes to put the gate up.
 *
 * Leaving portrait is immediate; entering it is not. iOS reports the old
 * viewport for a frame or two around a rotation, and the cost of believing one
 * of those frames used to be a permanently frozen run. Three frames is under
 * 50ms at 60fps — invisible to a player turning a phone, and longer than any
 * transient measured.
 *
 * The asymmetry is deliberate and it points the safe way: the gate is slow to
 * take control and instant to give it back.
 */
export const ENTER_FRAMES = 3

export type GateChange = 'raised' | 'lowered' | null

export class OrientationGate {
  /** Which scenes THIS paused, so it resumes those and only those. */
  private held = new Set<string>()
  /** Consecutive portrait readings seen so far. */
  private streak = 0
  /** Whether the gate is currently up. */
  private up = false

  /** True while the gate is holding the game. */
  get raised(): boolean {
    return this.up
  }

  /** For tests and diagnostics: the scenes the gate is holding. */
  get holding(): string[] {
    return [...this.held]
  }

  /**
   * One reading, one answer.
   *
   * Call this on every frame with the same predicate the OVERLAY uses. The
   * return value is the transition, or null when nothing changed, so a caller
   * can hang sound and logging off the edges rather than off every frame.
   */
  sync(portrait: boolean, host: GateHost): GateChange {
    if (portrait) {
      this.streak++
      // Not yet convinced. A frame or two of portrait around a rotation is the
      // device mis-reporting, not the player turning the phone.
      if (this.streak < ENTER_FRAMES) return null
      const before = this.up
      this.hold(host)
      if (before) return null
      this.up = true
      logEvent('orientation', `gate raised; holding ${this.holding.join(',') || 'nothing'}`)
      // Claimed, so the stuck guard can tell a rotate overlay the player can
      // see from a pause nothing owns.
      enterGate('portrait', { holding: this.holding.join(',') || 'nothing' })
      return 'raised'
    }

    this.streak = 0
    if (!this.up && this.held.size === 0) return null
    // IMMEDIATE, and it releases even if the gate never formally went up —
    // a pause taken on the way to ENTER_FRAMES still has to come back off.
    const released = this.release(host)
    if (!this.up) return null
    this.up = false
    logEvent('orientation', `gate lowered; resumed ${released.join(',') || 'nothing'}`)
    return 'lowered'
  }

  /**
   * Pauses whatever is running now and remembers it.
   *
   * Re-run on every portrait frame rather than once on the way in, because
   * scenes start while the overlay is up: the boot chain runs Boot -> Splash
   * -> Title behind it and each one arrives running. Once they are all paused
   * `running()` returns nothing and this costs a call.
   */
  private hold(host: GateHost): void {
    for (const key of host.running()) {
      if (key === NEVER_PAUSE) continue
      this.held.add(key)
      try {
        host.pause(key)
      } catch {
        // The scene shut down as we reached for it; it is not ours to resume.
        this.held.delete(key)
      }
    }
  }

  /** Resumes what this paused, and forgets it. Returns what it resumed. */
  private release(host: GateHost): string[] {
    const woken: string[] = []
    for (const key of this.held) {
      try {
        if (host.isPaused(key)) {
          host.resume(key)
          woken.push(key)
        }
      } catch {
        // The scene shut down while the phone was on its side.
      }
    }
    this.held.clear()
    return woken
  }

  /**
   * Hands everything back unconditionally.
   *
   * The recovery path: something outside has decided the game is stuck and the
   * gate is a suspect. Cheap, and safe to call when the gate holds nothing.
   */
  forceRelease(host: GateHost): string[] {
    const was = this.up
    this.streak = 0
    this.up = false
    if (was) leaveGate('portrait', { forced: true })
    return this.release(host)
  }
}
