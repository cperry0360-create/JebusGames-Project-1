// Damage arithmetic, kept free of Phaser so the rules can be tested directly.

/** Armour is flat reduction, with a floor so nothing is ever fully immune. */
/**
 * Armour is subtracted flat, which is why it hits fast, weak towers hardest: a
 * 9-damage Rounding Error against 7 armour was landing 2. `pierce` is how much
 * of that armour the attacker gets through, and is what makes single-target
 * towers the answer to an armoured wave rather than a coin flip on the draw.
 * A hit always lands at least 1, so nothing is ever completely immune.
 */
export function damageAfterArmor(
  damage: number,
  armor: number,
  ignoresArmor: boolean,
  pierce = 0,
): number {
  if (ignoresArmor) return damage
  return Math.max(1, damage - Math.max(0, armor - pierce))
}

/** Support towers add a fraction of a tower's base damage. Bonuses stack. */
export function boostedDamage(base: number, totalSupportBonus: number): number {
  return base * (1 + totalSupportBonus)
}

/** Slowed movement speed. factor 0.45 means the target moves at 45% speed. */
export function slowedSpeed(speed: number, factor: number, slowed: boolean): number {
  return slowed && factor > 0 ? speed * factor : speed
}

/**
 * How long a target is immune to being stunned again, counted from the moment
 * the stun lands. Includes the stun itself, so the free window afterwards is
 * `seconds * (multiple - 1)`.
 *
 * A stun with no lockout is not a stun. The Filing Extension's Amendment stops
 * a target for 0.6s and fires every 0.81s, so refreshing on every shot held
 * everything it touched still for the whole wave — the player saw a permanent
 * stop where the panel promised a slow.
 */
export function stunLockoutFor(seconds: number, multiple: number): number {
  return seconds * Math.max(1, multiple)
}

/** True when a fresh stun may land. */
export function canStun(stunRemaining: number, lockoutRemaining: number): boolean {
  return stunRemaining <= 0 && lockoutRemaining <= 0
}

/** Diminishing returns on a repeated crowd-control effect. */
export interface DiminishDef {
  /** How long after a hit the next one still counts as "repeated". */
  windowSeconds: number
  /** Each successive hit inside the window lasts this share of the last. */
  factor: number
  /** Below this it is not worth applying at all. */
  minSeconds: number
}

/**
 * How long the Nth hit of the same effect on the same target should last.
 *
 * The lockout above stops a stun being REFRESHED while it runs. It does not
 * stop the same tower stunning the same enemy again the moment the lockout
 * lapses, forever, which is what "a single tower should never be able to hold
 * a target indefinitely" is really asking about.
 *
 * `stacks` is how many times this effect has already landed inside the window.
 * The first hit is full length; each one after it is shorter. Once the target
 * has been left alone for the window the count resets and it is dangerous
 * again, so the counterplay is to move the pressure around rather than to
 * park one tower on one lane.
 */
export function diminishedSeconds(seconds: number, stacks: number, def: DiminishDef): number {
  if (stacks <= 0) return seconds
  const scaled = seconds * Math.pow(Math.max(0, Math.min(1, def.factor)), stacks)
  return scaled < def.minSeconds ? 0 : scaled
}

/**
 * The slow's version of the same problem, and the one that was actually
 * unbounded.
 *
 * Measured: Deferral applies a 3.84s slow from a tower that fires every
 * 0.81s. A slow is allowed to refresh — a slowed enemy is still walking, so a
 * tower holding one at 45% speed is the tower doing its job — but "allowed to
 * refresh" and "can never lapse" are not the same thing, and there was nothing
 * anywhere that made the second one false.
 */
export function slowStacksAfter(elapsed: number, stacks: number, def: DiminishDef): number {
  return elapsed > def.windowSeconds ? 0 : stacks
}
