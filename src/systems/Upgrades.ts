import type { TowerDef, TowerTier } from '../types.ts'

/**
 * Tower tiers.
 *
 * A tier is a set of *multipliers* on the tower's base stats plus what it costs
 * and how long it takes to raise. Multipliers rather than absolute stat blocks
 * so that retuning a tower's base numbers carries through its whole upgrade
 * path instead of silently diverging from it at tier 2.
 *
 * Tier 1 is what you get when you build, and it is instant. Tiers 2 and 3 cost
 * peanuts and take time, during which the tower fires at a reduced rate — that
 * is the decision DESIGN.md asks for: upgrade now and go soft for a few
 * seconds, or hold and upgrade in the gap between waves.
 *
 * All of it is pure, so the numbers can be checked without a scene.
 */

/** Tiers are 1-based. Tier 1 is the tower as built. */
export const BASE_TIER = 1

export function maxTier(def: TowerDef): number {
  return BASE_TIER + def.tiers.length
}

export function isMaxed(def: TowerDef, tier: number): boolean {
  return tier >= maxTier(def)
}

/** The step that takes a tower from `tier` to `tier + 1`, or null at the top. */
export function nextStep(def: TowerDef, tier: number): TowerTier | null {
  return def.tiers[tier - BASE_TIER] ?? null
}

/**
 * A stat at a given tier: the base value times every multiplier up to and
 * including that tier. A step that does not mention a stat leaves it alone.
 */
export function statAt(def: TowerDef, tier: number, key: keyof TowerTier): number {
  const base = (def as unknown as Record<string, number>)[key] ?? 0
  let value = base
  for (let t = BASE_TIER; t < tier; t++) {
    const step = def.tiers[t - BASE_TIER]
    if (!step) break
    const mult = step[key]
    if (typeof mult === 'number') value *= mult
  }
  return value
}

/** Everything sunk into this tower so far, including the build. */
export function investedIn(def: TowerDef, tier: number): number {
  let total = def.cost
  for (let t = BASE_TIER; t < tier; t++) total += def.tiers[t - BASE_TIER]?.cost ?? 0
  return total
}

/** What selling returns. Always less than was paid, or selling is free money. */
export function sellValue(def: TowerDef, tier: number, refund: number): number {
  return Math.floor(investedIn(def, tier) * refund)
}
