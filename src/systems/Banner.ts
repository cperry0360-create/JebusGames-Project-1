// What a run was worth, kept free of Phaser so the arithmetic can be tested.
//
// Banner Points replace the three-star rating a level-based tower defense
// would use. DESIGN.md is explicit about why: stars grade a level, and this
// game has runs rather than levels. Points are awarded on **depth reached**,
// so a run that ends at wave nine still pays — the meta layer is the reason to
// start another one, and a defeat that pays nothing is a defeat that ends the
// session.
//
// The tree itself is Phase 2. The points are banked now so that the number is
// already meaningful the day it arrives.

import type { BannerDef } from '../types.ts'

export interface RunOutcome {
  /** Waves fully cleared. On a defeat this is the wave the player reached
   *  minus the one they were standing in when it ended. */
  wavesCleared: number
  /** True only if the last wave was cleared. */
  cleared: boolean
  livesRemaining: number
  maxLives: number
}

/**
 * Depth first, then the finish, then what was left of the keep.
 *
 * Lives need no special case for a defeat: a run is lost at zero lives, so
 * that term is already zero on every loss.
 */
export function bannerPointsFor(o: RunOutcome, cfg: BannerDef): number {
  const depth = Math.max(0, Math.floor(o.wavesCleared)) * cfg.perWaveCleared
  const finish = o.cleared ? cfg.clearBonus : 0
  const held = Math.max(0, Math.floor(o.livesRemaining)) * cfg.perLifeRemaining
  return depth + finish + held
}

/** The one line under the headline. Flavour belongs here: the run is over and
 *  the player is not deciding anything. */
export function verdictFor(o: RunOutcome, cfg: BannerDef): string {
  if (!o.cleared) return cfg.verdicts.lost
  if (o.livesRemaining >= o.maxLives) return cfg.verdicts.flawless
  if (o.livesRemaining > o.maxLives * cfg.cleanLivesFraction) return cfg.verdicts.clean
  return cfg.verdicts.narrow
}
