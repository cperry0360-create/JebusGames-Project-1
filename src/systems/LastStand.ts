// The family fingerprint on the game, and the one hero rule that must not
// drift: every hero transforms at 25% health, once per encounter.
//
// Kept as plain functions with no Phaser in sight so the thresholds and
// multipliers can be checked directly against the JSON.

import type { LastStandDef } from '../types.ts'

/** Has the hero dropped to the transform threshold? */
export function atThreshold(health: number, maxHealth: number, def: LastStandDef): boolean {
  return health > 0 && health <= maxHealth * def.healthThreshold
}

/**
 * Once per encounter. The "used" flag never resets during a fight, which is
 * what stops a hero bobbing in and out of Last Stand around the threshold.
 */
export function shouldTrigger(
  health: number,
  maxHealth: number,
  def: LastStandDef,
  alreadyUsed: boolean,
): boolean {
  return !alreadyUsed && atThreshold(health, maxHealth, def)
}

export function outgoingDamage(base: number, def: LastStandDef, active: boolean): number {
  return active ? base * def.damageMultiplier : base
}

export function attackInterval(base: number, def: LastStandDef, active: boolean): number {
  return active ? base * def.attackIntervalMultiplier : base
}

/** Defence drops in Last Stand: he hits harder and takes more. */
export function incomingDamage(amount: number, def: LastStandDef, active: boolean): number {
  return active ? amount * def.damageTakenMultiplier : amount
}

export interface HitOutcome {
  /** Health after the hit. */
  health: number
  /** This hit is what transforms him. */
  triggers: boolean
  /** He is down. Never true on the same hit that triggers. */
  down: boolean
}

/**
 * What one hit does, including the rule that a hero never skips his transform.
 *
 * The bug this exists to make impossible: the health was reduced, then death
 * was checked, then the threshold. A hit that took him from above 25% to zero
 * or below therefore killed him outright and Last Stand never happened at all
 * — which is exactly the "he goes straight past 25% to zero" the testers
 * described. Measured at wave 8 with no towers, a Final Notice hits for 12 and
 * three of them stack, so crossing the whole 90hp band inside one exchange is
 * routine rather than exotic.
 *
 * So the threshold is now checked against the damage *before* the death check.
 * A hit that would carry him through the band leaves him standing at the
 * threshold instead, and he transforms. It costs the enemy the overkill, which
 * is the price of the rule the design is built on: every hero transforms at
 * 25%, once per encounter.
 *
 * Once Last Stand has been used, the floor is gone and the next hit that takes
 * him to zero kills him normally.
 */
export function applyHit(
  health: number,
  maxHealth: number,
  damage: number,
  def: LastStandDef,
  alreadyUsed: boolean,
): HitOutcome {
  const after = health - damage
  const floor = maxHealth * def.healthThreshold

  if (!alreadyUsed && health > floor && after <= floor) {
    // Through the band, or past it entirely. He stops at it.
    return { health: floor, triggers: true, down: false }
  }
  if (after <= 0) return { health: 0, triggers: false, down: true }
  return {
    health: after,
    triggers: shouldTrigger(after, maxHealth, def, alreadyUsed),
    down: false,
  }
}
