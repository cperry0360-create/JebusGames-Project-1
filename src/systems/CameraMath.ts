/**
 * The camera's arithmetic, kept free of Phaser so it can be checked without a
 * browser. `CameraRig` owns the gestures; this owns the limits.
 */

/**
 * Cover zoom: the smallest zoom at which the world still fills the viewport.
 *
 * This is the zoom floor. Below it the player would see dead space past the
 * edge of the map, which is what "no letterboxing, no dead margin" rules out.
 * It depends on the viewport's shape, so it has to be recomputed on a rotate.
 */
export function coverZoom(
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
): number {
  if (worldW <= 0 || worldH <= 0) return 1
  return Math.max(viewW / worldW, viewH / worldH)
}

/** Clamps a requested zoom into the allowed range: never below cover, never
 *  above `maxMultiple` times it. */
export function clampZoom(requested: number, cover: number, maxMultiple: number): number {
  return Math.min(Math.max(requested, cover), cover * maxMultiple)
}

/**
 * Fit scale: the largest scale at which a fixed design box fits *inside* the
 * viewport without cropping. The opposite of cover, and never larger than it.
 *
 * This is what the menus use. They are composed against a 1280x720 box, and
 * the canvas is the device viewport, so without this a hero card at y=282 sits
 * off the bottom of a 393px-tall phone.
 */
export function fitScale(
  viewW: number,
  viewH: number,
  designW: number,
  designH: number,
): number {
  if (designW <= 0 || designH <= 0) return 1
  return Math.min(viewW / designW, viewH / designH)
}

/* ------------------------------------------------------------ smoothing */

/**
 * How far to move toward a target this frame, as a fraction, for an
 * exponential ease that is independent of frame rate.
 *
 * A plain `current += (target - current) * 0.2` per frame is the usual way to
 * write this and it is wrong: at 120Hz it converges twice as fast as at 60Hz,
 * so the camera feels different on different phones. `lambda` is the rate in
 * units of e-folds per second, so 1/lambda is the time constant — at 14 the
 * camera covers about 63% of the remaining distance every 71ms whatever the
 * frame rate.
 */
export function smoothing(lambda: number, dt: number): number {
  if (lambda <= 0) return 1
  return 1 - Math.exp(-lambda * Math.max(dt, 0))
}

/**
 * Damped pinch response: how much to multiply the starting zoom by, given the
 * raw ratio of current finger distance to the distance the pinch began at.
 *
 * Damping is applied in log space rather than as `1 + (r - 1) * d`, so that
 * opening and closing a pinch by the same amount move the zoom by the same
 * amount in opposite directions. Linear damping is lopsided: it makes pinching
 * closed feel heavier than pinching open, because the ratio is bounded below
 * by 0 and unbounded above.
 */
export function pinchScale(ratio: number, damping: number): number {
  if (!(ratio > 0)) return 1
  return Math.pow(ratio, damping)
}

/* --------------------------------------------------------------- bounds */

/**
 * The range the camera's centre may occupy on one axis so the view stays
 * inside the world.
 *
 * Note this is the *centre*, not `scrollX`. Phaser's `scrollX` is the top-left
 * of the unzoomed camera rect, which is not the left edge of what the player
 * sees once the camera is zoomed — clamping it directly is the bug that made
 * the old rig fight Phaser's own bounds and lose.
 *
 * When the view is wider than the world (below cover zoom, which should not
 * happen but is cheap to survive) the range collapses to the world's midpoint.
 */
export function centerRange(
  viewSize: number,
  worldSize: number,
  zoom: number,
): { min: number; max: number } {
  const half = viewSize / (2 * Math.max(zoom, 0.0001))
  if (half * 2 >= worldSize) return { min: worldSize / 2, max: worldSize / 2 }
  return { min: half, max: worldSize - half }
}

/**
 * Rubber band: how far past a limit a value is actually allowed to go.
 *
 * Hard-stopping at the edge of the map makes a drag feel like it hit a wall.
 * This lets the camera past the limit but with resistance that grows the
 * further it goes, approaching `slack` and never reaching it, so the player
 * feels the edge instead of colliding with it. Releasing snaps the target back
 * to the real limit and the frame interpolation springs it home.
 */
export function rubberBand(v: number, min: number, max: number, slack: number): number {
  if (slack <= 0) return Math.min(Math.max(v, min), max)
  if (v < min) return min - resist(min - v, slack)
  if (v > max) return max + resist(v - max, slack)
  return v
}

function resist(over: number, slack: number): number {
  // Asymptotic: at `over == slack` it yields half of slack, and it never
  // reaches slack however hard the player drags.
  return slack * (over / (over + slack))
}

/**
 * Where the camera's centre must be on one axis for the world point
 * `anchorWorld` to sit under the screen coordinate `screenPos`.
 *
 * This is what keeps the map still under a pinch. Solving it rather than
 * measuring before-and-after with `getWorldPoint` matters because the rig
 * works in targets: it needs the centre for a zoom the camera has not reached
 * yet, and `getWorldPoint` can only answer for the zoom it is at.
 */
export function anchorCenter(
  anchorWorld: number,
  screenPos: number,
  viewSize: number,
  zoom: number,
): number {
  return anchorWorld - (screenPos - viewSize / 2) / Math.max(zoom, 0.0001)
}

/** The world point under a screen coordinate, for a camera centred at `center`. */
export function worldAt(
  screenPos: number,
  center: number,
  viewSize: number,
  zoom: number,
): number {
  return (screenPos - viewSize / 2) / Math.max(zoom, 0.0001) + center
}
