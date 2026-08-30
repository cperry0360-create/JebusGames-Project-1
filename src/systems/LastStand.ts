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
