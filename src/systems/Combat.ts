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
