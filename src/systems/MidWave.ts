/**
 * The clock rule for a comic that plays between two waves.
 *
 * WHAT ACTUALLY STOPS THE GAME is `GameScene.scene.pause()`: a paused Phaser
 * scene is out of the update list, so its `update` is not called, its `time`
 * events do not fire and its tweens do not step. Nothing in this file is doing
 * that work, and nothing here could -- it is Phaser-free on purpose.
 *
 * SO WHY THIS EXISTS, and it is two reasons rather than one.
 *
 * THE FRAME IN FLIGHT. `scene.pause()` takes effect at the scene manager's
 * next pass. A comic opened from `checkWaveOver`, which runs from inside
 * `update`, therefore has at most one more frame of that same `update` to get
 * through, and the hit pause already proved what a frame of un-gated
 * simulation costs: it is the difference between a held frame and a teleport.
 * `comicOpen` closes it.
 *
 * AND IT IS THE RULE A TEST CAN READ. No test in this repository can see
 * Phaser -- CLAUDE.md's standing fact -- so "the clock stops" cannot be
 * asserted against `scene.pause()` from `tests/`. It can be asserted against
 * this: drive a loop, accumulate what it returns, and read the clock either
 * side of the pause. tests/midwave.test.ts does exactly that.
 *
 * ONE EXPRESSION, NOT THREE. The hit pause, the comic and the speed multiplier
 * all decide the same number, and a second place that scales a delta is a
 * second place for the simulation and the camera to drift apart.
 */

export interface SimClockInput {
  /** The hit pause: the world held still on impact, camera excepted. */
  hitPaused: boolean
  /** A mid-wave comic is on the glass and the run underneath is paused. */
  comicOpen: boolean
  /** `rules.json pacing.gameSpeed`. Passed in rather than imported so the
   *  rule can be driven at any speed by a test. */
  gameSpeed: number
}

/**
 * The delta the SIMULATION advances by, given the real delta this frame.
 *
 * Zero means nothing moves: no enemy step, no tower cooldown, no spawner
 * timer, no ready countdown. The camera and the pulse deliberately do not come
 * through here -- they run on real time, because a shake that stopped on a hit
 * pause would read as a dropped frame rather than as an impact.
 */
export function simDelta(real: number, at: SimClockInput): number {
  if (at.hitPaused || at.comicOpen) return 0
  return real * at.gameSpeed
}

/**
 * Whether the boundary between `wave` and the next one may open a comic.
 *
 * STATED HERE RATHER THAN TRUSTED TO WHERE THE CALL SITS. `checkWaveOver` does
 * satisfy every clause by construction -- it returns early while anything the
 * wave sent is alive, and takes the run-ends branch before reaching the comic
 * -- but "by construction" is a property of one call site and this is the
 * requirement. A second caller would have to pass the same test.
 */
export function midWaveBoundaryOpen(at: {
  /** Anything the wave sent that is still on the board. */
  enemiesAlive: number
  /** The run's phase AFTER the boundary was processed. */
  phase: string
  /** Whether a comic is already up. */
  comicOpen: boolean
}): boolean {
  return at.enemiesAlive === 0 && at.phase === 'ready' && !at.comicOpen
}
