// The Scratch Ticket's payout table.
//
// It was `Between(60, 320)` — a uniform roll with no losing outcome at all,
// mean 190. A wave pays 322 on average and the whole run pays 4190, so at a
// 34-second cooldown the ticket was worth roughly three quarters of the run's
// entire income, for free, with no downside and no decision. It was not a
// gamble; it was a second economy.
//
// A scratch ticket that always wins is not a scratch ticket. The table below
// is a weighted draw with real losers, and it lives in abilities.json so the
// distribution can be tuned without touching code.
//
// Phaser-free so the distribution can be checked directly rather than played.

/** One line on the payout table. */
export interface ScratchOutcome {
  /** Shown on the card. A losing ticket says so, in the game's voice. */
  label: string
  payout: number
  /** Relative likelihood. Weights need not sum to anything in particular. */
  weight: number
}

/** Total weight, so a roll can be taken over the right range. */
export function totalWeight(outcomes: ScratchOutcome[]): number {
  return outcomes.reduce((n, o) => n + Math.max(0, o.weight), 0)
}

/**
 * Draws one outcome.
 *
 * `roll` is a number in [0, 1). Passed in rather than generated here so the
 * same function serves the game, the tests and the harness, and so a
 * distribution can be measured without stubbing a random source.
 */
export function rollOutcome(outcomes: ScratchOutcome[], roll: number): ScratchOutcome {
  const total = totalWeight(outcomes)
  if (total <= 0 || outcomes.length === 0) {
    return { label: 'NOT A WINNER', payout: 0, weight: 1 }
  }
  let n = Math.min(Math.max(roll, 0), 0.999999) * total
  for (const o of outcomes) {
    n -= Math.max(0, o.weight)
    if (n < 0) return o
  }
  return outcomes[outcomes.length - 1]!
}

/** What one scratch is worth on average. The number the tuning turns on. */
export function expectedValue(outcomes: ScratchOutcome[]): number {
  const total = totalWeight(outcomes)
  if (total <= 0) return 0
  return outcomes.reduce((n, o) => n + Math.max(0, o.weight) * o.payout, 0) / total
}

/** The share of tickets that pay nothing. */
export function lossRate(outcomes: ScratchOutcome[]): number {
  const total = totalWeight(outcomes)
  if (total <= 0) return 1
  return outcomes
    .filter((o) => o.payout <= 0)
    .reduce((n, o) => n + Math.max(0, o.weight), 0) / total
}

/** The biggest thing on the table, for checking it against a wave's income. */
export function topPayout(outcomes: ScratchOutcome[]): number {
  return outcomes.reduce((n, o) => Math.max(n, o.payout), 0)
}
