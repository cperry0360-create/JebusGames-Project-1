// THE TRANSFORMATION. One event, at half health, once per life, for all five
// heroes: when it fires, what it changes about how the hero fights, and what
// it changes about what the hero takes.
//
// THIS FILE USED TO BE HALF OF IT. There were two systems and the player saw
// both. `Transform.ts` powered a hero up at half health -- 40% off incoming
// damage, a second and a half of grace, and the powered sprite -- and
// `LastStand.ts` fired a SECOND transformation at a quarter, with its own
// shake, its own flash, its own half-second pause, its own sprite swap, its
// own name printed across the board and Cory's own voice line played for
// whoever was standing there. Last Stand predates the roster: it was the one
// hero's once-per-encounter beat, and when four more heroes arrived it was
// given to all of them along with the label, the SUV's ramming and a
// once-per-ENCOUNTER rule that would not re-arm after a revive.
//
// So there is one now, and it is this file. The threshold, the damage
// reduction and the grace are `rules.json heroTransform`; what the powered
// form does to a hero's own numbers is that hero's `powered` block in
// heroes.json. Nothing announces itself in words -- see GameScene.
//
// Phaser-free, so when it fires, what it is worth and how long the grace lasts
// are all testable without a scene -- and so the soak can model it, which it
// must, because a 40% damage reduction on the hero moves every win rate the
// game reports.

import type { PoweredFormDef } from '../types.ts'
import rulesData from '../data/rules.json' with { type: 'json' }

const CFG = (rulesData as unknown as {
  heroTransform?: { belowHealth: number; damageTaken: number; invulnerableSeconds: number }
}).heroTransform ?? { belowHealth: 0.5, damageTaken: 0.6, invulnerableSeconds: 1.5 }

/**
 * The share of maximum health at or below which a hero transforms.
 *
 * ONE NUMBER, AND IT IS THIS ONE. Every hero's block in heroes.json used to
 * carry a `healthThreshold` of its own, and all five said 0.25 while this said
 * 0.5 -- two numbers for one moment, which is how the bar came to be marked at
 * a quarter for a rule that fires at a half.
 */
export const TRANSFORM_BELOW = CFG.belowHealth
/** What a powered hero multiplies incoming damage by. 0.6 is 40% off. */
export const POWERED_DAMAGE_TAKEN = CFG.damageTaken
/** Grace at the moment of the swap, so the hero is not deleted mid-change. */
export const TRANSFORM_INVULNERABLE_SECONDS = CFG.invulnerableSeconds

/** Has the hero reached the threshold? */
export function atThreshold(health: number, maxHealth: number): boolean {
  return maxHealth > 0 && health > 0 && health <= maxHealth * TRANSFORM_BELOW
}

/**
 * Whether this hit should trigger the change.
 *
 * AT OR BELOW half, and only once per life: `already` is the whole of "for the
 * rest of that life", and a hero that has died and come back arrives with it
 * false again. A hero healed back over half stays powered -- the state is
 * entered, not maintained.
 *
 * ONCE PER LIFE, NOT ONCE PER ENCOUNTER. Last Stand's flag was never cleared
 * on a revive, so a hero who went down at wave four played the remaining nine
 * waves with the transformation spent and no way to earn it back. The powered
 * form has always re-armed on respawn and it is the rule that survived.
 *
 * `health` is what is left AFTER the hit. Asking before it would transform a
 * hero standing at 51% because the incoming blow was going to take it under,
 * which is a different moment from the one the player sees.
 */
export function shouldTransform(health: number, maxHealth: number, already: boolean): boolean {
  if (already) return false
  return atThreshold(health, maxHealth)
}

/**
 * Damage a hero actually takes.
 *
 * The invulnerability is checked FIRST and is absolute: the grace after a swap
 * exists so a hero cannot be deleted in the middle of it, and a reduction
 * rather than immunity would not do that job against a boss.
 *
 * ONE MULTIPLIER, NOT TWO. Last Stand multiplied incoming damage by 1.5 --
 * "he hits harder and takes more" -- and the powered form multiplied it by
 * 0.6. Those were two different moments while the thresholds differed; merged
 * onto one they compose to 0.9 and the 40% reduction quietly stops existing.
 * The reduction is the one the design and the soak are built on, so it is the
 * one that is left.
 */
export function damageToHero(
  incoming: number, powered: boolean, invulnerableFor: number,
): number {
  if (invulnerableFor > 0) return 0
  return powered ? incoming * POWERED_DAMAGE_TAKEN : incoming
}

/* ------------------------------- what the powered form changes about a hero */

export function outgoingDamage(base: number, def: PoweredFormDef, powered: boolean): number {
  return powered ? base * def.damageMultiplier : base
}

export function attackInterval(base: number, def: PoweredFormDef, powered: boolean): number {
  return powered ? base * def.attackIntervalMultiplier : base
}

/* ------------------------------------------------------------------ the hit */

export interface HitOutcome {
  /** Health after the hit. */
  health: number
  /** This hit is what transforms the hero. */
  triggers: boolean
  /** The hero is down. Never true on the same hit that triggers. */
  down: boolean
}

/**
 * What one hit does, including the rule that a hero never skips its transform.
 *
 * The bug this exists to make impossible: the health was reduced, then death
 * was checked, then the threshold. A hit that took the hero from above the
 * threshold to zero or below therefore killed outright and the transformation
 * never happened at all. Measured at wave 8 with no towers, a Final Notice
 * hits for 12 and three of them stack, so crossing a whole band inside one
 * exchange is routine rather than exotic.
 *
 * So the threshold is checked against the damage *before* the death check. A
 * hit that would carry the hero through the band leaves them standing at it
 * instead, and they transform. It costs the enemy the overkill, which is the
 * price of the rule the design is built on: every hero transforms at half,
 * once per life.
 *
 * Once the transformation has been used, the floor is gone and the next hit
 * that takes the hero to zero kills normally.
 */
export function applyHit(
  health: number,
  maxHealth: number,
  damage: number,
  alreadyPowered: boolean,
): HitOutcome {
  const after = health - damage
  const floor = maxHealth * TRANSFORM_BELOW

  if (!alreadyPowered && health > floor && after <= floor) {
    // Through the band, or past it entirely. The hero stops at it.
    return { health: floor, triggers: true, down: false }
  }
  if (after <= 0) return { health: 0, triggers: false, down: true }
  return {
    health: after,
    triggers: shouldTransform(after, maxHealth, alreadyPowered),
    down: false,
  }
}

/* ------------------------------------------------- the state a hero carries */

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
