import type { TowerDef, TowerSpec, TowerTier } from '../types.ts'

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

/** Tier 3 is a specialization, so the top tier is one above the linear steps. */
export function maxTier(def: TowerDef): number {
  return BASE_TIER + def.tiers.length + (def.specializations.length > 0 ? 1 : 0)
}

/** True when the next step up is the mutually exclusive tier-3 choice. */
export function atSpecChoice(def: TowerDef, tier: number): boolean {
  return def.specializations.length > 0 && tier === BASE_TIER + def.tiers.length
}

export function specById(def: TowerDef, id: string | null): TowerSpec | null {
  if (!id) return null
  return def.specializations.find((s) => s.id === id) ?? null
}

export function isMaxed(def: TowerDef, tier: number): boolean {
  return tier >= maxTier(def)
}

/**
 * The step that takes a tower from `tier` to `tier + 1`, or null at the top.
 *
 * At the specialization choice there is no single next step — there are two —
 * so this returns null and callers ask `atSpecChoice` instead.
 */
export function nextStep(def: TowerDef, tier: number): TowerTier | null {
  return def.tiers[tier - BASE_TIER] ?? null
}

/**
 * A stat at a given tier: the base value times every multiplier up to and
 * including that tier. A step that does not mention a stat leaves it alone.
 */
export function statAt(
  def: TowerDef,
  tier: number,
  key: keyof TowerTier,
  specId: string | null = null,
): number {
  let value = (def as unknown as Record<string, number>)[key] ?? 0
  for (let t = BASE_TIER; t < tier; t++) {
    const step = def.tiers[t - BASE_TIER]
    if (!step) break
    const mult = step[key]
    if (typeof mult === 'number') value *= mult
  }
  // The specialization is the last multiplier, applied on top of tier 2.
  const spec = specById(def, specId)
  if (spec) {
    const mult = (spec as unknown as Record<string, unknown>)[key]
    if (typeof mult === 'number') value *= mult
  }
  return value
}

/** Everything sunk into this tower so far, including the build. */
export function investedIn(def: TowerDef, tier: number, specId: string | null = null): number {
  let total = def.cost
  for (let t = BASE_TIER; t < tier; t++) total += def.tiers[t - BASE_TIER]?.cost ?? 0
  total += specById(def, specId)?.cost ?? 0
  return total
}

/** What selling returns. Always less than was paid, or selling is free money. */
export function sellValue(
  def: TowerDef,
  tier: number,
  refund: number,
  specId: string | null = null,
): number {
  return Math.floor(investedIn(def, tier, specId) * refund)
}
