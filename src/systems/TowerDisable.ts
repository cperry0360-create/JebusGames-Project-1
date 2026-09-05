// A boss that switches the board off, one tower at a time.
//
// The Rainbow Reaper does no damage and cannot be blocked. What it does is
// reach out every few seconds and stop the single most expensive thing the
// player has built — which is a different kind of pressure from a big health
// bar, because the answer is spreading the investment rather than concentrating
// it, and the player has to watch the board rather than the boss.
//
// THE WINDUP IS THE WHOLE POINT. A disable that landed the instant it was cast
// would read as the game breaking: a tower would simply stop, with nothing to
// see. So a cast locks its target, telegraphs for a second, and only then
// lands. That second is what makes it a mechanic instead of a malfunction, and
// it is why the target is chosen at the START of the windup and not at the end
// — the player must be able to trust what the telegraph points at.
//
// Phaser-free, like the other systems modules: which tower is picked, when a
// cast is allowed and how long the lights stay off is arithmetic, and the tests
// drive it directly rather than through a scene.

/** The ability block an enemy carries in enemies.json. */
export interface DisableDef {
  /** Seconds between casts, measured from the moment one lands. */
  cooldown: number
  /** Seconds the telegraph runs before the disable lands. */
  windup: number
  /** Seconds the tower stays off. */
  duration: number
  /** How far the caster can reach, in world pixels. */
  range: number
}

/** What the picker needs to know about a tower. */
export interface DisableCandidate {
  x: number
  y: number
  /** Peanuts sunk into it, base cost plus every upgrade and the spec. This is
   *  the value the boss is measuring: the most expensive thing on the board. */
  value: number
  /**
   * How much road is left between this tower's stretch and the exit.
   *
   * Only ever the tie-break, and SMALLER WINS: the tower furthest along the
   * lane is the one nearest the exit, and losing that one hurts most, because
   * whatever walks past it has the least road left to be stopped on.
   *
   * Measured as distance to the exit rather than distance travelled because on
   * a branching map the two branches have their own zero, so "how far it has
   * come" is not comparable across them and "how far is left" is.
   */
  distanceToExit: number
  /** Seconds it is already switched off for. A tower that is already dark is
   *  not worth a second cast. */
  disabledFor: number
}

/**
 * The tower a cast should take: the most valuable one in range, and of equals
 * the one furthest along the lane.
 *
 * Towers already disabled are skipped rather than re-picked. Without that the
 * boss would spend every cast on the same tower and the rest of the board would
 * never be touched — the ability would look like it was firing and doing
 * nothing.
 */
export function pickDisableTarget<T extends DisableCandidate>(
  candidates: readonly T[], x: number, y: number, range: number,
): T | null {
  let best: T | null = null
  for (const c of candidates) {
    if (c.disabledFor > 0) continue
    const dx = c.x - x
    const dy = c.y - y
    if (dx * dx + dy * dy > range * range) continue
    if (best === null
      || c.value > best.value
      || (c.value === best.value && c.distanceToExit < best.distanceToExit)) {
      best = c
    }
  }
  return best
}

/** What a tick of the ability did, if anything. */
export type DisableEvent<T> =
  /** The telegraph starts, pointing at this tower. */
  | { kind: 'windup'; target: T }
  /** The disable lands on the tower the windup pointed at. */
  | { kind: 'land'; target: T }

/**
 * The caster's clock.
 *
 * Held on its own rather than inside Enemy so the rule can be tested without a
 * scene, and so a second boss with the same ability needs no new code.
 */
export class Disabler {
  /** Counts down to the next cast. Starts at a full cooldown so the boss does
   *  not open with one the instant it walks in. */
  private cooldown: number
  /** Seconds left of the telegraph, or 0 when nothing is being cast. */
  private windupLeft = 0
  /** The tower this cast is for, chosen when the windup STARTED. Typed loosely
   *  because the candidate a caller passes carries the caller's own fields --
   *  the scene rides its Tower along on it -- and only `tick` knows that type. */
  private locked: DisableCandidate | null = null

  // Written out rather than declared as a constructor parameter property:
  // node's type-stripping runs the tests and does not support those.
  private readonly def: DisableDef

  constructor(def: DisableDef) {
    this.def = def
    this.cooldown = def.cooldown
  }

  /** True while the telegraph is running. */
  get casting(): boolean {
    return this.windupLeft > 0
  }

  /** The tower the telegraph is pointing at, for whatever draws it. */
  get target(): DisableCandidate | null {
    return this.locked
  }

  /**
   * Advances the clock and reports what happened.
   *
   * `alive` is asked every tick rather than assumed: a dead boss must not cast,
   * and one that dies MID-WINDUP must not land the cast it had started. That is
   * the version a player would call unfair — the boss is gone and a tower goes
   * dark anyway.
   */
  tick<T extends DisableCandidate>(dt: number, alive: boolean, x: number, y: number,
                                   candidates: readonly T[]): DisableEvent<T> | null {
    if (!alive) {
      this.windupLeft = 0
      this.locked = null
      return null
    }

    // Mid-cast: run the telegraph down, and start nothing else. A second cast
    // during a windup would mean two telegraphs and one of them lying.
    if (this.windupLeft > 0) {
      this.windupLeft -= dt
      if (this.windupLeft > 0) return null
      const target = this.locked as T | null
      this.locked = null
      this.windupLeft = 0
      // The cooldown runs from the moment the disable LANDS, so the windup is
      // part of the cast rather than free time in front of it.
      this.cooldown = this.def.cooldown
      return target ? { kind: 'land', target } : null
    }

    this.cooldown -= dt
    if (this.cooldown > 0) return null

    const target = pickDisableTarget(candidates, x, y, this.def.range)
    // Nothing in reach: try again next tick rather than burning the cooldown,
    // the same rule a tower with no target follows.
    if (!target) return null

    this.locked = target
    this.windupLeft = this.def.windup
    return { kind: 'windup', target }
  }
}
