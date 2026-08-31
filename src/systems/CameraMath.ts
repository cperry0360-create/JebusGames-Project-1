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
