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
  /**
   * How many *drawn* tower types the build menu ever offers. Not a limit on
   * how many towers may stand on the map — that is the number of build pads —
   * and NOT a total: `guaranteedTowers` sit in slots of their own on top of
   * this, both at the opening and at the cap. See `unlockedTowerCount`.
   */
  unlockedTypeCap: number
  unlockAfterWave: number[]
  abilitiesDrawn: number
  damageArchetypes: string[]
  answerArchetypes: string[]
  /**
   * Towers every run opens with, whatever the draw says — a slot of their own
   * on top of `towersAtStart` rather than one of it.
   *
   * WHY A LIST IN DATA AND NOT AN ID IN THIS FILE. The Ima Dummy Tower is the
   * only tower that does something other than shoot, and it was reachable on
   * level 1 alone: it had no entry in the shared pool and lived in level 1's
   * `extraTowerWeights`, so on nine levels of ten no number of rerolls could
   * produce it. A second guaranteed tower should be one line in draft.json,
   * so no system module names an id.
   *
   * Absent or empty is the ordinary case and means "nothing is guaranteed",
   * which is what every level played before this existed.
   */
  guaranteedTowers?: string[]
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
 * The guaranteed openers this pool can actually supply, in the order the data
 * names them.
 *
 * A guaranteed id the pool does not hold is skipped rather than invented: the
 * pool is the level's, and a tower no level offers is not something the draft
 * can hand out. A test holds that every id here is in the shared pool, so the
 * skip is a safety net rather than the normal path.
 */
export function guaranteedOpeners(pool: Weighted[], rules: DraftRules): Weighted[] {
  const out: Weighted[] = []
  for (const id of rules.guaranteedTowers ?? []) {
    const found = pool.find((w) => w.id === id)
    if (found && !out.includes(found)) out.push(found)
  }
  return out
}

/** How many towers a run on this pool opens with: the drawn hand plus the
 *  guaranteed slots. */
export function openingTowerCount(pool: Weighted[], rules: DraftRules): number {
  const guaranteed = guaranteedOpeners(pool, rules)
  return Math.min(rules.towersAtStart, pool.length - guaranteed.length) + guaranteed.length
}

/**
 * Draws the opening tower hand, then repairs it if it does not cover both a
 * damage option and an AOE-or-control answer. Repairing rather than rerolling
 * keeps the weights meaningful and always terminates.
 *
 * THE GUARANTEED TOWERS ARE EXTRA SLOTS AND THEY ARE DEALT LAST. They are cut
 * out of the pool before the draw, so the hand the player is DEALT is still
 * `towersAtStart` cards off the weighted deck — raising `towersAtStart` to 3
 * instead would mean every run opens with the dummy plus exactly one other
 * tower of six, and a two-card draft with one card in it is not a draft.
 *
 * AND THE COVERAGE RULE IS JUDGED ON THE DRAWN HAND ALONE, deliberately. The
 * Ima Dummy Tower's archetype is `control`, which is an answer archetype, so
 * counting it would satisfy the answer guarantee on every hand ever dealt and
 * the repair would never fire again. Measured over 3000 seeds: judged on the
 * whole hand, 1127 of them draw a pair with neither AOE nor control and keep
 * it, and hands with no AOE at all go from 1197 to 1872. Judged on the drawn
 * pair, the pair is IDENTICAL to what the old six-tower draft dealt on the
 * same seed -- the guarantee adds a tower and changes nothing about the draw.
 * The coverage rule is about what the DRAW owes the player, and a free slot
 * does not pay it.
 */
export function draftOpeningTowers(pool: Weighted[], rules: DraftRules, rng: Rng): string[] {
  const guaranteed = guaranteedOpeners(pool, rules)
  const drawable = pool.filter((w) => !guaranteed.includes(w))
  const tail = guaranteed.map((w) => w.id)

  const count = Math.min(rules.towersAtStart, drawable.length)
  const isDamage = (w: Weighted): boolean => rules.damageArchetypes.includes(w.archetype)
  const isAnswer = (w: Weighted): boolean => rules.answerArchetypes.includes(w.archetype)

  const hand = drawWeighted(drawable, count, rng)
  if (count < 2) return [...hand.map((w) => w.id), ...tail]

  const swapIn = (need: (w: Weighted) => boolean, drop: (w: Weighted) => boolean): boolean => {
    const candidates = drawable.filter((w) => need(w) && !hand.includes(w))
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

  return [...hand.map((w) => w.id), ...tail]
}

/** Towers still in the pool, in the order they unlock as the run goes on. */
export function reserveTowers(pool: Weighted[], opening: string[], rng: Rng): string[] {
  const rest = pool.filter((w) => !opening.includes(w.id))
  return drawWeighted(rest, rest.length, rng).map((w) => w.id)
}

/**
 * How many towers the player should have unlocked after clearing `wavesCleared`.
 *
 * THE CAP APPLIES TO THE DRAWN TYPES AND THE GUARANTEED SLOTS SIT OUTSIDE IT.
 * Counting the guaranteed tower against `unlockedTypeCap` would have made the
 * wave-8 unlock unreachable — 3 openers plus 2 earned is 5, clamped straight
 * back to 4 — so a guarantee meant to hand the player a tower would have taken
 * one away eight waves later. A guaranteed tower is an extra slot at the
 * opening; it is an extra slot at the ceiling too, and it is the same
 * arithmetic in both places.
 */
export function unlockedTowerCount(rules: DraftRules, wavesCleared: number): number {
  const earned = rules.unlockAfterWave.filter((w) => wavesCleared >= w).length
  const guaranteed = (rules.guaranteedTowers ?? []).length
  return Math.min(rules.towersAtStart + earned, rules.unlockedTypeCap) + guaranteed
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
