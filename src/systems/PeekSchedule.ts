/**
 * When Bailey appears, where, and how far up she is.
 *
 * Split out from the sprite so the rules can be proved rather than watched
 * for: an easter egg that shows up twice in a minute, or twice in the same
 * gap between two trees, is not an easter egg any more, and a bug you have to
 * sit through two minutes of build phase to see is a bug nobody finds.
 *
 * Everything here is restraint. She does nothing, rewards nothing, and the
 * only way she can be wrong is by being predictable.
 */

export interface PeekConfig {
  /** The gap between appearances is re-rolled inside this band every time, so
   *  she is never on a schedule anyone can learn. */
  minGapMs: number
  maxGapMs: number
  riseMs: number
  holdMs: number
  dropMs: number
  /** How much of her clears the canopy at the top of the rise. */
  peakVisible: number
}

/** A gap in the tree line she can come up through. */
export interface PeekSpot {
  x: number
  /** World y of the canopy she peeks over. Nothing of her draws below it. */
  canopyY: number
}

/** A fresh interval, inside the band. `rand` returns [0, 1). */
export function rollGap(cfg: PeekConfig, rand: () => number): number {
  const lo = Math.min(cfg.minGapMs, cfg.maxGapMs)
  const hi = Math.max(cfg.minGapMs, cfg.maxGapMs)
  return lo + rand() * (hi - lo)
}

/**
 * The next spot, which is never the one she just used.
 *
 * Rejection sampling would loop on a one-spot list and be biased on a short
 * one, so this picks from the others directly: an index in [0, n-1) shifted
 * past the previous one.
 */
export function pickSpot(count: number, previous: number, rand: () => number): number {
  if (count <= 0) return -1
  if (count === 1) return 0
  if (previous < 0 || previous >= count) return Math.min(count - 1, Math.floor(rand() * count))
  const i = Math.min(count - 2, Math.floor(rand() * (count - 1)))
  return i >= previous ? i + 1 : i
}

export function appearanceMs(cfg: PeekConfig): number {
  return cfg.riseMs + cfg.holdMs + cfg.dropMs
}

/**
 * How far up she is, 0 at the canopy line and 1 at the top of the rise.
 * `null` once the appearance is over.
 *
 * Eased at both ends: a dog putting her head up is not a linear ramp, and the
 * ease is what stops the hold reading as a jump.
 */
export function peekRise(elapsedMs: number, cfg: PeekConfig): number | null {
  if (elapsedMs < 0) return null
  const ease = (t: number) => t * t * (3 - 2 * t)
  if (elapsedMs < cfg.riseMs) return ease(elapsedMs / cfg.riseMs)
  const held = elapsedMs - cfg.riseMs
  if (held < cfg.holdMs) return 1
  const dropped = held - cfg.holdMs
  if (dropped < cfg.dropMs) return ease(1 - dropped / cfg.dropMs)
  return null
}
