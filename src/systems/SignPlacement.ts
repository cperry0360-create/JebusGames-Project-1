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
  /** Centre of the PLAIN WOOD inside the frame rails, as a fraction of plate
   *  width and height. Not the outer board: drawing at 94% of an outer board
   *  puts the words on the rails. */
  centre: number[]
  /** Size of that wood panel, as a fraction of plate width and height. */
  size: number[]
  /** Clockwise-positive, in degrees. Not shared between boards. */
  rotationDeg: number
  /** How far inside the wood the lettering sits. */
  inset: number
  /** The whole painted board, rails included. Nothing draws it; it is what a
   *  check compares the rendered lettering against. */
  outer?: { centre: number[]; size: number[] }
}

/** The painted board itself, for a check that wants to ask how much of it the
 *  lettering covers. Falls back to the wood panel when none is recorded. */
export function boardRect(
  board: SignBoard,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number; width: number; height: number } {
  const o = board.outer
  const c = o?.centre ?? board.centre
  const s = o?.size ?? board.size
  return {
    x: (c[0] ?? 0) * worldWidth,
    y: (c[1] ?? 0) * worldHeight,
    width: (s[0] ?? 0) * worldWidth,
    height: (s[1] ?? 0) * worldHeight,
  }
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

/**
 * Fits a rectangle of a given aspect INSIDE a placement, centred, without
 * distorting it.
 *
 * THE ART IS NOT THE SHAPE OF THE PANEL, and it must not be made to be. The
 * innkeeper's wood panel is 1.23 wide-to-tall and the lettering was authored
 * at 1.40, so stretching the canvas to the panel would squash the words
 * vertically by 14% — and the art is correct, it is only the placement that
 * was wrong. Letterboxing inside the panel keeps the letters the shape they
 * were drawn and simply leaves a little more bare wood above and below.
 */
export function fitAspect(
  placement: SignPlacement,
  aspect: number,
): SignPlacement {
  if (!(aspect > 0)) return placement
  const wide = placement.width / placement.height < aspect
  const width = wide ? placement.width : placement.height * aspect
  const height = wide ? placement.width / aspect : placement.height
  const c = Math.abs(Math.cos(placement.rotationRad))
  const s = Math.abs(Math.sin(placement.rotationRad))
  return {
    ...placement,
    width,
    height,
    footY: placement.y + (width * s + height * c) / 2,
  }
}
