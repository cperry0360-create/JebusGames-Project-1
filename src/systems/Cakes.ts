// What a level pays out, and how many of them a save remembers.
//
// Phaser-free like the other systems modules: "did that run earn three cakes"
// is arithmetic, and arithmetic the tests should be able to drive without a
// renderer.
//
// CAKES REPLACE BANNER POINTS IN STORY MODE. Points grade a run and accrue
// across a campaign, which is the shape run mode's skill tree wants and the
// wrong shape for a level a player means to go back and do properly. A cake
// count is a statement about ONE LEVEL, it sits on that level's node forever,
// and it is the reason to replay something already beaten. `Banner.ts` and
// `rules.banner` are untouched and still tested — run mode will want them.

import data from '../data/cakes.json' with { type: 'json' }

export interface CakeTier {
  cakes: number
  /** The share of the run's OWN starting lives this tier asks for. */
  livesFraction: number
  why: string
}

const DATA = data as unknown as { max: number; tiers: CakeTier[] }

/** Every tier, easiest first — the order they are read in. */
export const CAKE_TIERS: CakeTier[] = DATA.tiers

/** The most a level can pay. What the victory screen and each map node draw. */
export const MAX_CAKES: number = DATA.max

/**
 * How many cakes a finished run earned.
 *
 * A FRACTION OF THE RUN'S OWN STARTING LIVES, never an absolute count.
 * Difficulty scales starting lives — 40 on Lazy Dad Mode against 10 on Try
 * Hard — so a threshold of "10 lives left" would pay three cakes for an
 * untouched Try Hard run and two for exactly the same performance on normal.
 *
 * A loss pays nothing: the first tier is "cleared the level at all", so there
 * is no tier a defeat can reach.
 */
export function cakesFor(won: boolean, livesRemaining: number, startingLives: number): number {
  if (!won) return 0
  // A run that started with no lives at all cannot have a meaningful fraction,
  // and dividing by it would make every tier pass on an Infinity. Difficulty
  // floors starting lives at 1 so this is unreachable through the game; it is
  // here because `cakesFor` is also called with numbers off a save.
  const share = startingLives > 0 ? Math.max(0, livesRemaining) / startingLives : 0
  let earned = 0
  // Top down, last tier met wins. The tiers are ordered easiest first and
  // tests/cakes.test.ts fails if that stops being true.
  for (const t of CAKE_TIERS) if (share >= t.livesFraction) earned = t.cakes
  return Math.min(MAX_CAKES, earned)
}

/** What a run has to have left to reach the next tier up, or null at the top.
 *  The victory screen says it, so "two cakes" is a thing with a next step. */
export function nextTier(earned: number): CakeTier | null {
  return CAKE_TIERS.find((t) => t.cakes > earned) ?? null
}
