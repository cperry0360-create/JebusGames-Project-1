// The two strips of screen the HUD owns, and the board that is left over.
//
// On a desktop the HUD floats over a big map and nothing collides. On a phone
// in landscape there are about 390 vertical pixels, and a floating HUD means
// tower sprites behind the counters, the wave message written across a turret,
// the boss bar through the start button, and build pads underneath the ability
// icons. Every one of those was on screen at once.
//
// So the bands are reserved rather than negotiated: the world camera's
// viewport is the strip between them, which means a game object *cannot* be
// drawn into either one. Phaser clips to the camera viewport; there is no
// depth value that escapes it and no sprite tall enough to reach.
//
// Phaser-free so the arithmetic can be tested at viewport sizes no desktop
// browser will ever hand us.

export interface BandConfig {
  /** Space above the first row of HUD plates and below the last. */
  marginY: number
  /** The counter plates and the start-wave button. */
  plateHeight: number
  /** Gap between the plate row and the row under it. */
  rowGap: number
  /** The second row: the boss bar, the wave message, the hero's health. */
  rowHeight: number
  /** The ability icons along the bottom. */
  iconHeight: number
  /** The board must never be squeezed below this, whatever the viewport. */
  minWorldHeight: number
}

export interface Bands {
  /** Height of the reserved strip at the top of the screen. */
  top: number
  /** Height of the reserved strip at the bottom. */
  bottom: number
  /** Where the world viewport starts, which is the same as `top`. */
  worldTop: number
  /** How tall the world viewport is. */
  worldHeight: number
}

/**
 * Band heights for a viewport.
 *
 * The bands are sized by what they must hold. If that leaves the board too
 * short — a 320px phone, a browser with a fat toolbar — both bands give up the
 * same fraction rather than one of them eating the whole shortfall, because a
 * HUD with its bottom row cut off is worse than a slightly cramped one.
 */
export function bandsFor(viewHeight: number, cfg: BandConfig): Bands {
  const wantTop = cfg.marginY + cfg.plateHeight + cfg.rowGap + cfg.rowHeight + cfg.marginY
  const wantBottom = cfg.marginY + cfg.iconHeight + cfg.marginY

  let top = wantTop
  let bottom = wantBottom
  const spare = viewHeight - wantTop - wantBottom
  if (spare < cfg.minWorldHeight) {
    const available = Math.max(0, viewHeight - cfg.minWorldHeight)
    const shrink = available / (wantTop + wantBottom)
    top = Math.floor(wantTop * shrink)
    bottom = Math.floor(wantBottom * shrink)
  }
  return {
    top,
    bottom,
    worldTop: top,
    worldHeight: Math.max(1, viewHeight - top - bottom),
  }
}

/**
 * The second row of the top band, split into two regions that cannot overlap.
 *
 * Three things want that row: the wave message, the boss bar, and the hero's
 * health. The first two are mutually exclusive — while a boss is on the field
 * the bar is the message — so they share the left region, and the hero keeps
 * the right. Splitting by x rather than by priority is what makes "no overlap"
 * a property of the layout instead of a thing to remember.
 */
export function rowRegions(
  viewWidth: number, marginX: number,
): { left: { x: number; width: number }; right: { x: number; width: number } } {
  const usable = viewWidth - marginX * 2
  // The hero's readout is a name and a short bar; the left region carries a
  // sentence, so it gets the larger share.
  const rightW = Math.max(96, Math.round(usable * 0.30))
  const gap = 14
  return {
    left: { x: marginX, width: Math.max(60, usable - rightW - gap) },
    right: { x: marginX + usable - rightW, width: rightW },
  }
}
