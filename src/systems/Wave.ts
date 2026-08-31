// When a wave is over, and whether it was actually cleared.
//
// Kept free of Phaser because the distinction is a rule, not a rendering
// detail, and it is a rule the game got wrong: the field emptying was treated
// as the wave being cleared, so an enemy that *escaped* counted exactly like
// one that died. Walking the boss off the end finished the run as a win.

export type RunEnd = 'won' | 'lost' | null

export interface WaveOutcome {
  /** True only if every enemy in the wave died. Escapes are not clears. */
  cleared: boolean
  /** Whether this outcome also ends the run, and how. */
  runEnds: RunEnd
}

/**
 * A wave always *ends* once the field is empty and there is nothing left to
 * spawn — anything else hangs the game on a board with nothing on it. What
 * escapes change is whether it counts as a clear, and whether the last wave
 * can win the run.
 */
export function waveOutcome(escaped: number, isLastWave: boolean): WaveOutcome {
  const cleared = escaped <= 0
  if (!isLastWave) return { cleared, runEnds: null }
  // The last wave decides the run, and a wave with escapes is not a clear, so
  // it cannot be a win. The boss reaching the exit ends the run as a defeat
  // even when the keep survives the ten lives he takes with him.
  return { cleared, runEnds: cleared ? 'won' : 'lost' }
}
