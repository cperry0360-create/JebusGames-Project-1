// Damage arithmetic, kept free of Phaser so the rules can be tested directly.

/** Armour is flat reduction, with a floor so nothing is ever fully immune. */
export function damageAfterArmor(damage: number, armor: number, ignoresArmor: boolean): number {
  if (ignoresArmor) return damage
  return Math.max(1, damage - armor)
}

/** Support towers add a fraction of a tower's base damage. Bonuses stack. */
export function boostedDamage(base: number, totalSupportBonus: number): number {
  return base * (1 + totalSupportBonus)
}

/** Slowed movement speed. factor 0.45 means the target moves at 45% speed. */
export function slowedSpeed(speed: number, factor: number, slowed: boolean): number {
  return slowed && factor > 0 ? speed * factor : speed
}
