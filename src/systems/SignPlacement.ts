/**
 * Where a lettering overlay goes on a blank painted board.
 *
 * Every signboard on the map plate is painted blank. The words are separate
 * textures drawn on top, and the plate records, per board, the rectangle they
 * go in — as fractions of the plate, so a re-export at another resolution
 * moves nothing.
 *
 * Three things this deliberately does NOT do:
 *
 * - It does not fit the overlay to its own artwork. The canvases are authored
 *   to the board's aspect, so the canvas IS the rectangle; measuring the ink
 *   instead would make the two held-sign textures land at two different sizes
 *   and the bribe would jump.
 * - It does not bake the rotation into a texture. A pre-rotated texture is
 *   resampled twice and the second pass is the one the player sees.
 * - It does not share a constant between boards. The tavern's board tilts one
 *   way and the innkeeper's the other, and a shared angle would silently put
 *   one of them upside down of true.
 */

/** One board's rectangle, in fractions of the plate. */
export interface SignBoard {
  /** Rectangle centre, as a fraction of plate width and height. */
  centre: number[]
  /** Rectangle size, as a fraction of plate width and height. */
  size: number[]
  /** Clockwise-positive, in degrees. Not shared between boards. */
  rotationDeg: number
  /** How far inside the painted frame the lettering sits. */
  inset: number
}

export interface SignPlacement {
  x: number
  y: number
  width: number
  height: number
  rotationRad: number
  /** The lowest point the rotated rectangle reaches, for depth sorting. A
   *  rotated board hangs lower than its own height suggests. */
  footY: number
}

/**
 * Converts a board's fractions into world units.
 *
 * `inset` defaults to the board's own, which is what the lettering wants. Pass
 * 1 for the board itself — a tap target belongs on the painted board, not on
 * the slightly smaller rectangle the words were shrunk into.
 */
export function placeSign(
  board: SignBoard,
  worldWidth: number,
  worldHeight: number,
  inset = board.inset,
): SignPlacement {
  const x = (board.centre[0] ?? 0) * worldWidth
  const y = (board.centre[1] ?? 0) * worldHeight
  const width = (board.size[0] ?? 0) * worldWidth * inset
  const height = (board.size[1] ?? 0) * worldHeight * inset
  const rotationRad = (board.rotationDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(rotationRad))
  const s = Math.abs(Math.sin(rotationRad))
  return { x, y, width, height, rotationRad, footY: y + (width * s + height * c) / 2 }
}
