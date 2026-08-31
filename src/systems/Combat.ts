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
