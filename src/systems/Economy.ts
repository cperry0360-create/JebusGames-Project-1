/**
 * The run's opening purse.
 *
 * The first thing the game says is "tap a build pad to place a tower".
 * Whatever the draft hands the player, that instruction has to be possible —
 * a fixed 100 peanuts against a draw of Write-Off (150) and Escalation (220)
 * made the opening screen a dead end, with the game telling the player to do
 * something it would not let them do.
 *
 * So the purse is a floor, not a constant: whichever is larger, the tuned
 * starting amount or enough to buy the cheapest tower drawn with a margin on
 * top. A cheap draw is unaffected and stays at the tuned number; only a draw
 * that would otherwise strand the player moves it.
 */
export function openingPurse(base: number, margin: number, drawnCosts: number[]): number {
  if (drawnCosts.length === 0) return base
  return Math.max(base, Math.ceil(Math.min(...drawnCosts) * margin))
}

/** Whether anything in the drawn set can be built right now. */
export function canAffordAny(peanuts: number, costs: number[]): boolean {
  return costs.some((c) => c <= peanuts)
}
