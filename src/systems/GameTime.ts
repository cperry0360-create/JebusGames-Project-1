import rulesData from '../data/rules.json'

/**
 * Game seconds against real seconds.
 *
 * `rules.json pacing.gameSpeed` is 1.4, and every duration in the data —
 * cooldowns, revive timers, wave intervals, build times — is in GAME seconds,
 * because that is the unit the simulation advances in. The player's watch is
 * not. A 25-second revive is 17.9 seconds of their life, a 12-second Haymaker
 * cooldown is 8.6, and a wave whose data says 43 seconds takes 31.
 *
 * Nothing said so. Two separate findings in one report came down to comparing
 * a number from the data against a stopwatch and getting a different answer:
 * "the hero lockout is 25s against 13s waves" (it is 17.9s against 31s) and
 * "Haymaker was recharging during the boss fight" (12s of a 77-second fight).
 * Both readings were reasonable, and both were about the missing unit.
 *
 * So: anything the PLAYER is shown is converted here first, and anything a
 * REPORT prints carries the unit. The rule is that a bare number in a sentence
 * is a real second, because that is the one the reader can check.
 *
 * Phaser-free, and the conversion is one multiply — it lives in its own file
 * so there is one place to look for the answer to "which second is this?".
 */

/** How much faster the simulation runs than the wall clock. */
export const GAME_SPEED = rulesData.pacing.gameSpeed

/** Game seconds to the seconds a player would count, rounded for display. */
export function realSeconds(gameSeconds: number, decimals = 0): number {
  const real = gameSeconds / GAME_SPEED
  const f = 10 ** decimals
  return Math.round(real * f) / f
}

/** Real seconds to game seconds, for a duration measured off a stopwatch. */
export function gameSeconds(realSecs: number, decimals = 0): number {
  const g = realSecs * GAME_SPEED
  const f = 10 ** decimals
  return Math.round(g * f) / f
}

/**
 * A duration for a REPORT, carrying both units.
 *
 * e.g. `25g (17.9s real)`. Diagnostics and harness output use this rather than
 * `realSeconds`, because a report is read next to the JSON it came from and
 * dropping the game-seconds figure makes the two impossible to reconcile.
 */
export function bothUnits(gameSecs: number): string {
  return `${gameSecs}g (${realSeconds(gameSecs, 1)}s real)`
}
