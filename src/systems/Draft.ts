// Run-start draws. Kept free of Phaser so the weighting and the coverage
// guarantee can be tested directly.
//
// DESIGN.md: "The draw is weighted, not purely random. Your opening two must
// cover at least one damage option and one control or AOE option, so no run
// opens unwinnable."

export interface Weighted {
  id: string
  weight: number
  archetype: string
}

export interface DraftRules {
  towersAtStart: number
  towerCap: number
  unlockAfterWave: number[]
  abilitiesDrawn: number
  damageArchetypes: string[]
  answerArchetypes: string[]
}

/** Deterministic when handed a seeded rng, which is what the tests rely on. */
export type Rng = () => number

function weightedPick(pool: Weighted[], rng: Rng): Weighted {
  const total = pool.reduce((a, w) => a + w.weight, 0)
  let roll = rng() * total
  for (const w of pool) {
    roll -= w.weight
    if (roll <= 0) return w
  }
  return pool[pool.length - 1]
}

function drawWeighted(pool: Weighted[], count: number, rng: Rng): Weighted[] {
  const remaining = [...pool]
  const out: Weighted[] = []
  while (out.length < count && remaining.length > 0) {
    const picked = weightedPick(remaining, rng)
    out.push(picked)
    remaining.splice(remaining.indexOf(picked), 1)
  }
  return out
}

/**
 * Draws the opening tower hand, then repairs it if it does not cover both a
 * damage option and an AOE-or-control answer. Repairing rather than rerolling
 * keeps the weights meaningful and always terminates.
 */
export function draftOpeningTowers(pool: Weighted[], rules: DraftRules, rng: Rng): string[] {
  const count = Math.min(rules.towersAtStart, pool.length)
  const isDamage = (w: Weighted): boolean => rules.damageArchetypes.includes(w.archetype)
  const isAnswer = (w: Weighted): boolean => rules.answerArchetypes.includes(w.archetype)

  const hand = drawWeighted(pool, count, rng)
  if (count < 2) return hand.map((w) => w.id)

  const swapIn = (need: (w: Weighted) => boolean, drop: (w: Weighted) => boolean): boolean => {
    const candidates = pool.filter((w) => need(w) && !hand.includes(w))
    if (candidates.length === 0) return false
    const replacement = weightedPick(candidates, rng)
    // Drop something the hand can spare, never the card covering the other role.
    const index = hand.findIndex(drop)
    if (index < 0) return false
    hand[index] = replacement
    return true
  }

  if (!hand.some(isDamage)) swapIn(isDamage, (w) => !isAnswer(w) || hand.filter(isAnswer).length > 1)
  if (!hand.some(isAnswer)) swapIn(isAnswer, (w) => !isDamage(w) || hand.filter(isDamage).length > 1)

  return hand.map((w) => w.id)
}

/** Towers still in the pool, in the order they unlock as the run goes on. */
export function reserveTowers(pool: Weighted[], opening: string[], rng: Rng): string[] {
  const rest = pool.filter((w) => !opening.includes(w.id))
  return drawWeighted(rest, rest.length, rng).map((w) => w.id)
}

/** How many towers the player should have unlocked after clearing `wavesCleared`. */
export function unlockedTowerCount(rules: DraftRules, wavesCleared: number): number {
  const earned = rules.unlockAfterWave.filter((w) => wavesCleared >= w).length
  return Math.min(rules.towersAtStart + earned, rules.towerCap)
}

export function draftAbilities(ids: string[], count: number, rng: Rng): string[] {
  const pool = ids.map((id) => ({ id, weight: 1, archetype: 'ability' }))
  return drawWeighted(pool, Math.min(count, pool.length), rng).map((w) => w.id)
}

/** Small seeded generator so a run can be reproduced from its seed. */
export function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
