// The two-state hero: base until it is hurt, powered for the rest of that life.
//
// Phaser-free, so when it fires, what it is worth and how long the grace lasts
// are all testable without a scene -- and so the soak can model it, which it
// must, because a 40% damage reduction on the hero moves every win rate the
// game reports.

import rulesData from '../data/rules.json' with { type: 'json' }

const CFG = (rulesData as unknown as {
  heroTransform?: { belowHealth: number; damageTaken: number; invulnerableSeconds: number }
}).heroTransform ?? { belowHealth: 0.5, damageTaken: 0.6, invulnerableSeconds: 1.5 }

/** The share of maximum health at or below which a hero powers up. */
export const TRANSFORM_BELOW = CFG.belowHealth
/** What a powered hero multiplies incoming damage by. 0.6 is 40% off. */
export const POWERED_DAMAGE_TAKEN = CFG.damageTaken
/** Grace at the moment of the swap, so the hero is not deleted mid-change. */
export const TRANSFORM_INVULNERABLE_SECONDS = CFG.invulnerableSeconds

/**
 * Whether this hit should trigger the change.
 *
 * AT OR BELOW half, and only once per life: `already` is the whole of "for the
 * rest of that life", and a hero that has died and come back arrives with it
 * false again. A hero healed back over half stays powered -- the state is
 * entered, not maintained.
 *
 * `health` is what is left AFTER the hit. Asking before it would transform a
 * hero standing at 51% because the incoming blow was going to take it under,
 * which is a different moment from the one the player sees.
 */
export function shouldTransform(health: number, maxHealth: number, already: boolean): boolean {
  if (already || maxHealth <= 0) return false
  if (health <= 0) return false      // dead, not powered
  return health / maxHealth <= TRANSFORM_BELOW
}

/**
 * Damage a hero actually takes.
 *
 * The invulnerability is checked FIRST and is absolute: the 1.5 seconds after
 * a swap exist so a hero cannot be deleted in the middle of it, and a
 * reduction rather than immunity would not do that job against a boss.
 */
export function damageToHero(
  incoming: number, powered: boolean, invulnerableFor: number,
): number {
  if (invulnerableFor > 0) return 0
  return powered ? incoming * POWERED_DAMAGE_TAKEN : incoming
}

/** The state a hero carries between the two forms. */
export interface TransformState {
  powered: boolean
  /** Seconds of grace left from the swap. */
  invulnerableFor: number
}

export const BASE_FORM: TransformState = { powered: false, invulnerableFor: 0 }

/** What a hero looks like the moment it comes back from being down: base form,
 *  no grace, ready to do the whole thing again. */
export function afterRespawn(): TransformState {
  return { ...BASE_FORM }
}

/** The state after a transformation fires. */
export function afterTransform(): TransformState {
  return { powered: true, invulnerableFor: TRANSFORM_INVULNERABLE_SECONDS }
}

/** Runs the grace down. Returns the new state. */
export function tickTransform(state: TransformState, dt: number): TransformState {
  if (state.invulnerableFor <= 0) return state
  return { ...state, invulnerableFor: Math.max(0, state.invulnerableFor - dt) }
}
