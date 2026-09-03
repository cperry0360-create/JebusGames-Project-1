// Chrome that is attached to a screen edge, drawn as attached.
//
// THE RULE: nothing anchored to a screen edge carries a gap or a rounded
// corner on that edge, and nothing draws an outline along it either. An edge
// of the display is not a boundary between two things — there is nothing
// behind it — so a rounded corner and a stroke there both describe a shape
// floating in front of something, which is exactly what a docked control is
// not.
//
// The drawer's handle was the case that produced this: an orange rounded
// rectangle with a black chevron, six pixels short of the right edge, with no
// relationship to the panel it opens. Six pixels is not a rounding error —
// measured identical at devicePixelRatio 1 and 3, which rules out the
// canvas-versus-CSS confusion that has caused six bugs here — it is
// `panelArea`'s cosmetic inset, and a docked control has no business inside it.

// TYPE-ONLY. Phaser appears here only as the type of the Graphics object
// being drawn into, so importing it as a value would give this module a
// runtime dependency on the engine and put `cornerRadii` — which is pure
// arithmetic and the part worth testing — out of reach of the unit tests.
import type Phaser from 'phaser'
import type { Rect } from '../systems/HudLayout.ts'

export type DockEdge = 'left' | 'right'

export interface SlabStyle {
  fill: number
  outline: number
  outlineWidth: number
  /** Applied to the two corners AWAY from the docked edge. The docked pair are
   *  square, always. */
  radius: number
}

/** The four corner radii for a slab docked to `edge`. */
export function cornerRadii(edge: DockEdge, radius: number): {
  tl: number; tr: number; bl: number; br: number
} {
  return edge === 'right'
    ? { tl: radius, tr: 0, bl: radius, br: 0 }
    : { tl: 0, tr: radius, bl: 0, br: radius }
}

/**
 * Fills and outlines a rectangle docked to one edge.
 *
 * The outline is drawn as an open path along the three free sides rather than
 * as a stroked rectangle, so there is no line down the docked edge. A stroke
 * there would sit half on and half off the display and read as a seam.
 */
export function dockedSlab(
  g: Phaser.GameObjects.Graphics, r: Rect, edge: DockEdge, style: SlabStyle,
): void {
  const rad = cornerRadii(edge, style.radius)
  g.fillStyle(style.fill, 1)
  g.fillRoundedRect(r.x, r.y, r.width, r.height, rad)
  if (style.outlineWidth <= 0) return
  const x0 = r.x
  const x1 = r.x + r.width
  const y0 = r.y
  const y1 = r.y + r.height
  const k = style.radius
  g.lineStyle(style.outlineWidth, style.outline, 1)
  g.beginPath()
  if (edge === 'right') {
    // Up the free (left) side, round its two corners, out to the screen edge.
    g.moveTo(x1, y0)
    g.lineTo(x0 + k, y0)
    g.arc(x0 + k, y0 + k, k, -Math.PI / 2, Math.PI, true)
    g.lineTo(x0, y1 - k)
    g.arc(x0 + k, y1 - k, k, Math.PI, Math.PI / 2, true)
    g.lineTo(x1, y1)
  } else {
    g.moveTo(x0, y0)
    g.lineTo(x1 - k, y0)
    g.arc(x1 - k, y0 + k, k, -Math.PI / 2, 0, false)
    g.lineTo(x1, y1 - k)
    g.arc(x1 - k, y1 - k, k, 0, Math.PI / 2, false)
    g.lineTo(x0, y1)
  }
  g.strokePath()
}
