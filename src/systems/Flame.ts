// The Rooster's flame: a line of fire ahead of it, down its own lane.
//
// THE TELEGRAPH IS THE WHOLE POINT, and it is the Glitch Bug's rule applied to
// a corridor instead of to a locked tower. An unavoidable hit that suppresses a
// row of towers with no warning reads as the game cheating; the same effect
// with a windup in front of it is a mechanic the player can play around. So the
// cadence here is `TowerDisable`'s, field for field -- a cooldown, a telegraph
// that is visible before anything lands, and the rule that a caster killed
// MID-WINDUP lands nothing -- and what differs is only what the cast is aimed
// at. The Disabler picks the most expensive tower in a radius and locks it;
// there is nothing to lock here, because the flame goes wherever the boss is
// already facing and hits everything in the corridor.
//
// It is a separate module rather than a branch inside `Disabler` because the
// two answer different questions: `pickDisableTarget` is "which ONE", and this
// is "everything along a line". Folding them together would mean a `Disabler`
// whose `target` is sometimes a tower and sometimes a direction, which is two
// mechanics wearing one name.
//
// WHAT IT DOES NOT DO. It does not harm other enemies, and it cannot leave its
// own lane -- the corridor starts at the boss and runs along the heading it is
// walking, and level 6's two lanes are parallel and never touch, so a flame on
// one is geometrically incapable of reaching the other. That is a property of
// the map rather than a check in code, and it is why the map matters.
//
// Phaser-free, like the other rule modules: where the corridor is, who is
// standing in it and how long a scorch lasts is arithmetic.

import { distanceToSegment, type Point } from './HeroPowers.ts'

export interface FlameRules {
  /** The strip's art, as an art.json key. Named in the level's data rather
   *  than in code. */
  fx: string
  /** Seconds between breaths, measured from the moment one ENDS. */
  intervalSeconds: number
  /** Seconds the boss stands still for the whole performance. */
  stopSeconds: number
  /**
   * Seconds of that stop spent telegraphing before any damage happens.
   *
   * 0.8 of the 1.0 second stop. What is left of the stop is the breath's
   * opening, and `flameSeconds` is how long the fire itself lasts -- the two
   * are separate numbers because the brief's arithmetic (a 1.0s stop with a
   * 0.8s telegraph in it) leaves 0.2s of fire, which is a burst rather than
   * the damage-over-time it is described as. Splitting them lets the fire
   * outlast the stop without shortening the warning, and lets both be retuned
   * from JSON when the level can finally be played.
   */
  telegraphSeconds: number
  /** Seconds the fire is live once the telegraph finishes. */
  flameSeconds: number
  /** How far the corridor reaches ahead of the boss, in world pixels. */
  reach: number
  /** The corridor's full width. A unit within half of this of the centre line
   *  is in the fire. */
  width: number
  damagePerSecond: number
  tickSeconds: number
  /** Seconds a tower keeps firing at the reduced rate after the fire stops. */
  scorchSeconds: number
  /** What a scorched tower's fire RATE is multiplied by. The interval is
   *  multiplied by the reciprocal; see AcidPuddle for the same trap. */
  towerFireRateMultiplier: number
  /** The marker drawn on a scorched tower, as an art.json key. */
  scorchFx: string
  /** False, and it stays false. See the file header. */
  harmsEnemies: boolean
}

/** Where the boss is in its own cycle. */
export interface FlameState {
  /** Counts down to the next breath. */
  cooldown: number
  /** Seconds left of the telegraph, or 0. */
  telegraphLeft: number
  /** Seconds left of the fire, or 0. */
  flameLeft: number
  /** Seconds left of the stop, or 0. The stop and the fire are separate
   *  clocks: the fire may outlast the stop. */
  stopLeft: number
  /** Counts down to the next damage tick while the fire is live. */
  until: number
}

export function newFlameState(rules: FlameRules): FlameState {
  // A FULL COOLDOWN TO START, so a boss does not open with a breath the frame
  // it walks on. The same reasoning `Disabler` uses for its own first cast.
  return {
    cooldown: rules.intervalSeconds,
    telegraphLeft: 0,
    flameLeft: 0,
    stopLeft: 0,
    until: 0,
  }
}

/** What a tick of the cycle did, if anything. */
export type FlameEvent =
  /** The telegraph starts. Nothing is damaged yet; this is the warning. */
  | { kind: 'telegraph' }
  /** The fire starts. */
  | { kind: 'breathe' }
  /** The fire stops. */
  | { kind: 'out' }

/**
 * One frame of the cycle.
 *
 * `alive` is asked every tick rather than assumed, for the reason `Disabler`
 * gives: a boss that dies mid-telegraph must not breathe. That is the version
 * a player would call unfair -- the thing is dead and a row of towers is
 * scorched anyway.
 *
 * Returns whether the boss is HELD this frame, whether the fire is live, and
 * how many damage ticks it owes. Ticks are a COUNT so a long frame cannot drop
 * one and make the damage a function of the frame rate.
 */
export function tickFlame(
  at: FlameState, dt: number, alive: boolean, rules: FlameRules,
): { state: FlameState; held: boolean; burning: boolean; ticks: number; event: FlameEvent | null } {
  const s = { ...at }
  if (!alive) {
    return {
      state: { ...s, telegraphLeft: 0, flameLeft: 0, stopLeft: 0 },
      held: false, burning: false, ticks: 0, event: null,
    }
  }

  let event: FlameEvent | null = null
  if (s.stopLeft > 0) s.stopLeft = Math.max(0, s.stopLeft - dt)

  if (s.telegraphLeft > 0) {
    s.telegraphLeft -= dt
    if (s.telegraphLeft <= 0) {
      s.telegraphLeft = 0
      s.flameLeft = rules.flameSeconds
      // Charges immediately, so something already standing in the corridor
      // does not get a free tick before it notices.
      s.until = 0
      event = { kind: 'breathe' }
    }
    return { state: s, held: true, burning: false, ticks: 0, event }
  }

  if (s.flameLeft > 0) {
    s.flameLeft -= dt
    let ticks = 0
    if (rules.tickSeconds > 0) {
      s.until -= dt
      while (s.until <= 0 && ticks < 32) {
        ticks++
        s.until += rules.tickSeconds
      }
    }
    if (s.flameLeft <= 0) {
      s.flameLeft = 0
      // The cooldown runs from the moment the fire goes OUT, so the whole
      // performance is part of the cast rather than free time in front of it.
      s.cooldown = rules.intervalSeconds
      event = { kind: 'out' }
    }
    return { state: s, held: s.stopLeft > 0, burning: true, ticks, event }
  }

  s.cooldown -= dt
  if (s.cooldown > 0) return { state: s, held: false, burning: false, ticks: 0, event: null }
  s.telegraphLeft = rules.telegraphSeconds
  s.stopLeft = rules.stopSeconds
  return { state: s, held: true, burning: false, ticks: 0, event: { kind: 'telegraph' } }
}

/** The far end of the corridor, given where the boss is and which way it faces. */
export function flameEnd(x: number, y: number, heading: number, rules: FlameRules): Point {
  return { x: x + Math.cos(heading) * rules.reach, y: y + Math.sin(heading) * rules.reach }
}

/**
 * True if (px, py) is in the fire.
 *
 * HALF THE WIDTH, because `width` is the corridor's full thickness and this is
 * a distance from its centre line. Reading it as a radius would double the
 * corridor and quietly catch the next lane over on a map whose lanes are close
 * together -- which level 6's are not, but the next one might be.
 *
 * THE CORRIDOR IS A CAPSULE, not a rectangle: `distanceToSegment` clamps to
 * the segment, so the ends are ROUND and the fire actually reaches
 * `reach + width / 2` at its tip -- 332 px rather than 300. That is the same
 * shape every other area check in this codebase makes, it is what a plume
 * looks like, and it is written down because the alternative is somebody
 * measuring 332 in a soak and reporting the reach as wrong.
 */
export function inFlame(
  p: Point, from: Point, to: Point, rules: FlameRules,
): boolean {
  return distanceToSegment(p, from, to) <= rules.width / 2
}

/** Damage owed for one tick to something standing in the fire. */
export function flameTickDamage(rules: FlameRules): number {
  return rules.damagePerSecond * rules.tickSeconds
}

/** What a scorched tower's fire INTERVAL is multiplied by. The rate is halved,
 *  so the interval doubles; getting it the wrong way round is a buff. */
export function scorchIntervalMultiplier(rules: FlameRules): number {
  return 1 / Math.max(0.0001, rules.towerFireRateMultiplier)
}
